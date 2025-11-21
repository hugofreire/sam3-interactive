#!/usr/bin/env python3
"""
Basic SAM3 Image Segmentation Example
This script demonstrates how to use SAM3 for text-prompted image segmentation.
"""

import sys
from pathlib import Path
import torch
from PIL import Image
import matplotlib.pyplot as plt
import numpy as np


def main():
    print("=" * 60)
    print("SAM3 Basic Image Segmentation Example")
    print("=" * 60)

    # Check for GPU
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"\nUsing device: {device}")
    if device == "cpu":
        print("⚠️  Warning: Running on CPU. This will be slow.")
        print("   Consider using a CUDA-enabled GPU for better performance.\n")

    # Import SAM3 modules
    try:
        from sam3.model_builder import build_sam3_image_model
        from sam3.model.sam3_image_processor import Sam3Processor
        print("✓ SAM3 modules imported successfully")
    except ImportError as e:
        print(f"✗ Error importing SAM3: {e}")
        print("\nMake sure SAM3 is installed:")
        print("  pip install -e .")
        return 1

    # Check if image path is provided
    if len(sys.argv) < 2:
        print("\nUsage: python basic_example.py <image_path> [text_prompt]")
        print("\nExample:")
        print("  python basic_example.py test_image.jpg 'dog'")
        print("\nDefault image will be used if available.")
        image_path = "test_image.jpg"
    else:
        image_path = sys.argv[1]

    # Check if text prompt is provided
    if len(sys.argv) < 3:
        text_prompt = "person"
        print(f"\nUsing default prompt: '{text_prompt}'")
    else:
        text_prompt = sys.argv[2]

    # Check if image exists
    if not Path(image_path).exists():
        print(f"\n✗ Error: Image not found at {image_path}")
        print("\nPlease provide a valid image path:")
        print("  python basic_example.py <image_path> [text_prompt]")
        return 1

    print(f"\nLoading image: {image_path}")
    print(f"Text prompt: '{text_prompt}'")

    # Load image
    try:
        image = Image.open(image_path)
        print(f"✓ Image loaded: {image.size[0]}x{image.size[1]}")
    except Exception as e:
        print(f"✗ Error loading image: {e}")
        return 1

    # Build SAM3 model
    print("\nBuilding SAM3 model...")
    print("(This will download model checkpoints on first run)")
    try:
        model = build_sam3_image_model()
        processor = Sam3Processor(model)
        print("✓ Model loaded successfully")
    except Exception as e:
        print(f"\n✗ Error loading model: {e}")
        print("\nPossible issues:")
        print("1. Model checkpoints not accessible")
        print("2. Need to request access at: https://huggingface.co/facebook/sam3")
        print("3. Need to authenticate: huggingface-cli login")
        return 1

    # Process image
    print("\nProcessing image...")
    try:
        state = processor.set_image(image)
        print("✓ Image processed")
    except Exception as e:
        print(f"✗ Error processing image: {e}")
        return 1

    # Run segmentation
    print(f"\nRunning segmentation with prompt: '{text_prompt}'...")
    try:
        output = processor.set_text_prompt(state=state, prompt=text_prompt)
        masks = output["masks"]
        boxes = output["boxes"]
        scores = output["scores"]

        print(f"✓ Segmentation complete!")
        print(f"  - Found {len(masks)} masks")
        print(f"  - Scores: {scores.tolist() if len(scores) > 0 else 'None'}")
    except Exception as e:
        print(f"✗ Error during segmentation: {e}")
        return 1

    # Visualize results
    if len(masks) > 0:
        print("\nVisualizing results...")
        try:
            fig, axes = plt.subplots(1, min(3, len(masks) + 1), figsize=(15, 5))
            if len(masks) == 0:
                axes = [axes]
            elif not hasattr(axes, '__iter__'):
                axes = [axes]

            # Show original image
            axes[0].imshow(image)
            axes[0].set_title("Original Image")
            axes[0].axis('off')

            # Show masks
            for idx in range(min(2, len(masks))):
                if idx + 1 < len(axes):
                    mask = masks[idx].cpu().numpy() if torch.is_tensor(masks[idx]) else masks[idx]
                    # Handle different mask shapes (squeeze if needed)
                    if mask.ndim == 3:
                        mask = mask.squeeze()
                    axes[idx + 1].imshow(mask, cmap='gray')
                    score = scores[idx].item() if torch.is_tensor(scores[idx]) else scores[idx]
                    axes[idx + 1].set_title(f"Mask {idx+1} (Score: {score:.3f})")
                    axes[idx + 1].axis('off')

            plt.tight_layout()
            output_path = "segmentation_result.png"
            plt.savefig(output_path, dpi=150, bbox_inches='tight')
            print(f"✓ Results saved to: {output_path}")

            # Try to display (will work in Jupyter or GUI environments)
            try:
                plt.show()
            except:
                print("  (Display not available in this environment)")

        except Exception as e:
            print(f"✗ Error visualizing results: {e}")
    else:
        print("\n⚠️  No objects found matching the prompt.")
        print("   Try a different prompt or image.")

    print("\n" + "=" * 60)
    print("Example completed successfully!")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
