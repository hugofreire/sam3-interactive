#!/usr/bin/env python3
"""
SAM3 Service - Interactive Segmentation API
Communicates via JSON over stdin/stdout
"""

import sys
import json
import base64
import io
import os
from pathlib import Path
import numpy as np
from PIL import Image
import torch

# Register HEIC/HEIF support
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass  # HEIC support not available

# Add parent directory to path to import sam3
sys.path.insert(0, str(Path(__file__).parent.parent))

from sam3.model_builder import build_sam3_image_model
from sam3.model.sam3_image_processor import Sam3Processor


class SAM3Service:
    """Service for handling SAM3 segmentation requests"""

    def __init__(self):
        self.model = None
        self.processor = None
        self.sessions = {}  # Store inference states per session
        self.device = None
        self.log("Initializing SAM3 Service...")
        self._load_model()

    def log(self, message, level="INFO"):
        """Log to stderr so stdout stays clean for JSON responses"""
        print(f"[{level}] {message}", file=sys.stderr, flush=True)

    def _load_model(self):
        """Load SAM3 model with interactive support"""
        try:
            # Use GPU 1 (GPU 0 is occupied by VLLM)
            os.environ['CUDA_VISIBLE_DEVICES'] = '1'

            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            self.log(f"Using device: {self.device}")

            # Build model with interactive mode enabled
            self.log("Loading SAM3 model...")
            self.model = build_sam3_image_model(
                enable_inst_interactivity=True  # Enable click-based segmentation
            )
            self.processor = Sam3Processor(self.model)

            self.log("SAM3 model loaded successfully!")

        except Exception as e:
            self.log(f"Error loading model: {e}", "ERROR")
            raise

    def load_image(self, image_path, session_id):
        """Load and process an image for segmentation"""
        try:
            self.log(f"Loading image: {image_path} for session: {session_id}")

            # Load image
            image = Image.open(image_path)
            if image.mode != 'RGB':
                image = image.convert('RGB')

            # Store original dimensions
            width, height = image.size

            # Process image with SAM3
            inference_state = self.processor.set_image(image)

            # Store session data
            self.sessions[session_id] = {
                'state': inference_state,
                'image': image,
                'width': width,
                'height': height,
                'image_path': image_path,
                'logits': None  # For iterative refinement
            }

            self.log(f"Image loaded: {width}x{height}")

            return {
                'success': True,
                'width': width,
                'height': height,
                'message': 'Image loaded successfully'
            }

        except Exception as e:
            self.log(f"Error loading image: {e}", "ERROR")
            return {
                'success': False,
                'error': str(e)
            }

    def predict_click(self, session_id, points, labels, multimask_output=True, use_previous_logits=False):
        """
        Perform point-based segmentation

        Args:
            session_id: Session identifier
            points: List of [x, y] coordinates in pixels
            labels: List of labels (1 = foreground, 0 = background)
            multimask_output: Return 3 candidate masks if True
            use_previous_logits: Use previous mask for refinement
        """
        try:
            if session_id not in self.sessions:
                return {
                    'success': False,
                    'error': f'Session {session_id} not found'
                }

            session = self.sessions[session_id]
            inference_state = session['state']

            self.log(f"Predicting with {len(points)} points")
            self.log(f"Points: {points}, Labels: {labels}")

            # Convert to numpy arrays
            point_coords = np.array(points, dtype=np.float32)
            point_labels = np.array(labels, dtype=np.int32)

            # Prepare kwargs
            kwargs = {
                'point_coords': point_coords,
                'point_labels': point_labels,
                'multimask_output': multimask_output
            }

            # Add previous logits for refinement if requested
            if use_previous_logits and session['logits'] is not None:
                self.log("Using previous logits for refinement")
                kwargs['mask_input'] = session['logits']

            # Run prediction
            masks, scores, logits = self.model.predict_inst(
                inference_state,
                **kwargs
            )

            self.log(f"Prediction complete: {len(masks)} masks")
            self.log(f"Scores: {scores.tolist()}")

            # Store logits for future refinement (use best mask's logits)
            if len(logits) > 0:
                best_idx = np.argmax(scores)
                session['logits'] = logits[best_idx:best_idx+1, :, :]

            # Convert masks to base64
            masks_b64 = []
            for i, mask in enumerate(masks):
                mask_np = mask.cpu().numpy() if torch.is_tensor(mask) else mask

                # Ensure 2D
                if mask_np.ndim == 3:
                    mask_np = mask_np.squeeze()

                # Convert to uint8 (0 or 255)
                mask_uint8 = (mask_np * 255).astype(np.uint8)

                # Convert to PNG base64
                img = Image.fromarray(mask_uint8, mode='L')
                buffer = io.BytesIO()
                img.save(buffer, format='PNG')
                mask_b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
                masks_b64.append(mask_b64)

            # Convert scores to list
            scores_list = scores.tolist() if torch.is_tensor(scores) else scores.tolist()

            return {
                'success': True,
                'masks': masks_b64,
                'scores': scores_list,
                'num_masks': len(masks),
                'message': 'Segmentation successful'
            }

        except Exception as e:
            self.log(f"Error in predict_click: {e}", "ERROR")
            import traceback
            self.log(traceback.format_exc(), "ERROR")
            return {
                'success': False,
                'error': str(e)
            }

    def predict_text(self, session_id, prompt):
        """
        Perform text-based segmentation

        Args:
            session_id: Session identifier
            prompt: Text prompt (e.g., "car", "person")
        """
        try:
            if session_id not in self.sessions:
                return {
                    'success': False,
                    'error': f'Session {session_id} not found'
                }

            session = self.sessions[session_id]
            inference_state = session['state']

            self.log(f"Text segmentation with prompt: '{prompt}'")

            # Run text-based segmentation
            output = self.processor.set_text_prompt(
                state=inference_state,
                prompt=prompt
            )

            masks = output['masks']
            scores = output['scores']
            boxes = output.get('boxes', None)

            self.log(f"Found {len(masks)} instances")

            # Convert masks to base64
            masks_b64 = []
            for mask in masks:
                mask_np = mask.cpu().numpy() if torch.is_tensor(mask) else mask
                if mask_np.ndim == 3:
                    mask_np = mask_np.squeeze()
                mask_uint8 = (mask_np * 255).astype(np.uint8)
                img = Image.fromarray(mask_uint8, mode='L')
                buffer = io.BytesIO()
                img.save(buffer, format='PNG')
                mask_b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
                masks_b64.append(mask_b64)

            scores_list = scores.tolist() if torch.is_tensor(scores) else scores.tolist()

            result = {
                'success': True,
                'masks': masks_b64,
                'scores': scores_list,
                'num_instances': len(masks),
                'message': f'Found {len(masks)} instances'
            }

            # Add boxes if available
            if boxes is not None:
                boxes_list = boxes.tolist() if torch.is_tensor(boxes) else boxes.tolist()
                result['boxes'] = boxes_list

            return result

        except Exception as e:
            self.log(f"Error in predict_text: {e}", "ERROR")
            return {
                'success': False,
                'error': str(e)
            }

    def clear_session(self, session_id):
        """Clear a session and free memory"""
        if session_id in self.sessions:
            del self.sessions[session_id]
            self.log(f"Cleared session: {session_id}")
            return {'success': True, 'message': 'Session cleared'}
        return {'success': False, 'error': 'Session not found'}

    def handle_command(self, command_data):
        """Handle a command from stdin"""
        command = command_data.get('command')

        if command == 'load_image':
            return self.load_image(
                command_data['image_path'],
                command_data['session_id']
            )

        elif command == 'predict_click':
            return self.predict_click(
                command_data['session_id'],
                command_data['points'],
                command_data['labels'],
                command_data.get('multimask_output', True),
                command_data.get('use_previous_logits', False)
            )

        elif command == 'predict_text':
            return self.predict_text(
                command_data['session_id'],
                command_data['prompt']
            )

        elif command == 'clear_session':
            return self.clear_session(command_data['session_id'])

        elif command == 'ping':
            return {'success': True, 'message': 'pong'}

        else:
            return {
                'success': False,
                'error': f'Unknown command: {command}'
            }

    def run(self):
        """Main loop - read commands from stdin, write responses to stdout"""
        self.log("SAM3 Service ready. Waiting for commands...")

        # Send ready signal
        print(json.dumps({'status': 'ready'}), flush=True)

        try:
            for line in sys.stdin:
                line = line.strip()
                if not line:
                    continue

                try:
                    command_data = json.loads(line)
                    self.log(f"Received command: {command_data.get('command')}")

                    response = self.handle_command(command_data)

                    # Send response as JSON
                    print(json.dumps(response), flush=True)

                except json.JSONDecodeError as e:
                    self.log(f"Invalid JSON: {e}", "ERROR")
                    error_response = {
                        'success': False,
                        'error': 'Invalid JSON'
                    }
                    print(json.dumps(error_response), flush=True)

                except Exception as e:
                    self.log(f"Error handling command: {e}", "ERROR")
                    error_response = {
                        'success': False,
                        'error': str(e)
                    }
                    print(json.dumps(error_response), flush=True)

        except KeyboardInterrupt:
            self.log("Shutting down...")

        except Exception as e:
            self.log(f"Fatal error: {e}", "ERROR")


if __name__ == '__main__':
    service = SAM3Service()
    service.run()
