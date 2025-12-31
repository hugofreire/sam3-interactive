#!/usr/bin/env python3
"""
Live Camera Inference with Hailo-8L Accelerator

Captures from webcam and runs real-time object detection
using the Hailo AI accelerator.

Usage:
    python scripts/hailo_camera.py
    python scripts/hailo_camera.py --conf 0.3
    python scripts/hailo_camera.py --camera 1

Controls:
    q - Quit
    + - Increase confidence threshold
    - - Decrease confidence threshold
"""

import argparse
import cv2
import numpy as np
import time
from pathlib import Path

try:
    from hailo_platform import (
        HEF, VDevice, ConfigureParams, InferVStreams,
        InputVStreamParams, OutputVStreamParams, HailoStreamInterface
    )
    HAILO_AVAILABLE = True
except ImportError:
    HAILO_AVAILABLE = False
    print("Warning: hailo_platform not available")

# Default paths
SCRIPT_DIR = Path(__file__).parent
MODEL_PATH = SCRIPT_DIR.parent / "models/coffee-beans-yolo11n/model.hef"

# Detection config
CLASS_NAMES = ["green", "roasted"]
COLORS = [(0, 255, 0), (0, 0, 255)]  # Green, Red (BGR for OpenCV)


def parse_nms_output(output_dict, orig_w, orig_h, conf_threshold):
    """
    Parse Hailo YOLO NMS output format.

    Output format: output[batch][class_id][det_idx] = [x1, y1, x2, y2, conf]
    Coordinates are normalized (0-1).
    """
    detections = []

    for output_data in output_dict.values():
        batch_output = output_data[0]  # Remove batch dimension

        for class_id, class_dets in enumerate(batch_output):
            arr = np.array(class_dets)
            if arr.size == 0:
                continue

            for det in arr:
                conf = det[4]
                if conf >= conf_threshold:
                    # Scale normalized coords to original image size
                    x1 = int(det[0] * orig_w)
                    y1 = int(det[1] * orig_h)
                    x2 = int(det[2] * orig_w)
                    y2 = int(det[3] * orig_h)
                    detections.append((class_id, conf, x1, y1, x2, y2))

    return detections


def draw_detections(frame, detections, class_names, colors):
    """Draw bounding boxes and labels on frame."""
    for class_id, conf, x1, y1, x2, y2 in detections:
        color = colors[class_id % len(colors)]

        # Draw box
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

        # Draw label background
        label = f"{class_names[class_id]}: {conf:.2f}"
        (label_w, label_h), baseline = cv2.getTextSize(
            label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2
        )
        cv2.rectangle(
            frame, (x1, y1 - label_h - 10), (x1 + label_w, y1), color, -1
        )

        # Draw label text
        cv2.putText(
            frame, label, (x1, y1 - 5),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2
        )

    return frame


def draw_stats(frame, inference_ms, fps, conf_threshold, num_detections):
    """Draw performance stats overlay."""
    stats = [
        f"Inference: {inference_ms:.1f}ms",
        f"FPS: {fps:.1f}",
        f"Conf: {conf_threshold:.2f}",
        f"Detections: {num_detections}",
    ]

    y = 30
    for stat in stats:
        cv2.putText(
            frame, stat, (10, y),
            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2
        )
        y += 30

    # Instructions
    cv2.putText(
        frame, "q=quit  +/-=conf", (10, frame.shape[0] - 10),
        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1
    )

    return frame


def main():
    parser = argparse.ArgumentParser(
        description="Live camera inference with Hailo-8L"
    )
    parser.add_argument(
        "--camera", type=int, default=0,
        help="Camera device ID (default: 0)"
    )
    parser.add_argument(
        "--model", type=str, default=str(MODEL_PATH),
        help="Path to HEF model file"
    )
    parser.add_argument(
        "--conf", type=float, default=0.4,
        help="Confidence threshold (default: 0.4)"
    )
    parser.add_argument(
        "--width", type=int, default=1280,
        help="Camera width (default: 1280)"
    )
    parser.add_argument(
        "--height", type=int, default=720,
        help="Camera height (default: 720)"
    )
    args = parser.parse_args()

    if not HAILO_AVAILABLE:
        print("Error: hailo_platform is required")
        print("Install with: sudo apt install hailo-all")
        return 1

    model_path = Path(args.model)
    if not model_path.exists():
        print(f"Error: Model not found: {model_path}")
        return 1

    conf_threshold = args.conf

    # Load HEF model
    print(f"Loading model: {model_path}")
    hef = HEF(str(model_path))
    input_info = hef.get_input_vstream_infos()[0]
    input_h, input_w = input_info.shape[0], input_info.shape[1]
    print(f"Model input size: {input_w}x{input_h}")

    # Open camera
    print(f"Opening camera {args.camera}...")
    cap = cv2.VideoCapture(args.camera)

    # Set MJPG format for better performance
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, args.width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)

    if not cap.isOpened():
        print(f"Error: Cannot open camera {args.camera}")
        return 1

    actual_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    actual_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"Camera resolution: {actual_w}x{actual_h}")

    # FPS tracking
    fps_samples = []
    last_time = time.perf_counter()

    print("Starting inference... Press 'q' to quit")

    # Hailo inference context
    with VDevice() as device:
        configure_params = ConfigureParams.create_from_hef(
            hef, interface=HailoStreamInterface.PCIe
        )
        network_group = device.configure(hef, configure_params)[0]

        input_params = InputVStreamParams.make_from_network_group(network_group)
        output_params = OutputVStreamParams.make_from_network_group(network_group)

        with InferVStreams(network_group, input_params, output_params) as pipeline:
            with network_group.activate():
                print("Hailo activated - running inference loop")

                while True:
                    ret, frame = cap.read()
                    if not ret:
                        print("Failed to read frame")
                        break

                    orig_h, orig_w = frame.shape[:2]

                    # Preprocess: resize to model input size
                    resized = cv2.resize(frame, (input_w, input_h))
                    # Convert BGR to RGB for model
                    rgb_frame = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
                    input_data = np.expand_dims(rgb_frame, axis=0).astype(np.uint8)

                    # Run inference
                    t0 = time.perf_counter()
                    output = pipeline.infer({input_info.name: input_data})
                    inference_ms = (time.perf_counter() - t0) * 1000

                    # Parse detections
                    detections = parse_nms_output(
                        output, orig_w, orig_h, conf_threshold
                    )

                    # Draw on frame
                    frame = draw_detections(frame, detections, CLASS_NAMES, COLORS)

                    # Calculate FPS
                    current_time = time.perf_counter()
                    fps = 1.0 / (current_time - last_time)
                    last_time = current_time
                    fps_samples.append(fps)
                    if len(fps_samples) > 30:
                        fps_samples.pop(0)
                    avg_fps = sum(fps_samples) / len(fps_samples)

                    # Draw stats
                    frame = draw_stats(
                        frame, inference_ms, avg_fps,
                        conf_threshold, len(detections)
                    )

                    # Display
                    cv2.imshow("Hailo Detection", frame)

                    # Handle keyboard input
                    key = cv2.waitKey(1) & 0xFF
                    if key == ord('q'):
                        break
                    elif key == ord('+') or key == ord('='):
                        conf_threshold = min(0.95, conf_threshold + 0.05)
                        print(f"Confidence threshold: {conf_threshold:.2f}")
                    elif key == ord('-') or key == ord('_'):
                        conf_threshold = max(0.05, conf_threshold - 0.05)
                        print(f"Confidence threshold: {conf_threshold:.2f}")

    cap.release()
    cv2.destroyAllWindows()
    print("Done")
    return 0


if __name__ == "__main__":
    exit(main())
