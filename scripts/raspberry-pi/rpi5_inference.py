#!/usr/bin/env python3
"""
Raspberry Pi 5 YOLO Inference Script

Supports multiple backends:
- CPU (NCNN) - Default, ~10 FPS on RPi5
- Hailo-8L - ~40-80 FPS with AI Kit

Usage:
    python rpi5_inference.py --image photo.jpg
    python rpi5_inference.py --image photo.jpg --backend hailo
    python rpi5_inference.py --input-dir ./images --output-dir ./results
    python rpi5_inference.py --source 0  # webcam
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

# Default model paths (relative to script location)
SCRIPT_DIR = Path(__file__).parent.parent
DEFAULT_NCNN_MODEL = SCRIPT_DIR / "models/coffee-beans-yolo11n/best_ncnn_model"
DEFAULT_PT_MODEL = SCRIPT_DIR / "models/coffee-beans-yolo11n/best.pt"
DEFAULT_HEF_MODEL = SCRIPT_DIR / "models/coffee-beans-yolo11n/model.hef"


def check_hailo_available() -> bool:
    """Check if Hailo runtime is available."""
    try:
        from hailo_platform import HEF, VDevice
        return True
    except ImportError:
        return False


def check_ultralytics_available() -> bool:
    """Check if Ultralytics is available."""
    try:
        from ultralytics import YOLO
        return True
    except ImportError:
        return False


def detect_best_backend() -> str:
    """Auto-detect the best available backend."""
    if check_hailo_available() and DEFAULT_HEF_MODEL.exists():
        return "hailo"
    elif check_ultralytics_available():
        return "ncnn"
    else:
        print("Error: No inference backend available.", file=sys.stderr)
        print("Install ultralytics: pip install ultralytics", file=sys.stderr)
        sys.exit(1)


def run_ncnn_inference(
    model_path: Path,
    source: str,
    conf: float = 0.5,
    iou: float = 0.45,
    save: bool = False,
    output_dir: Optional[Path] = None,
    show: bool = False,
) -> list:
    """Run inference using Ultralytics YOLO with NCNN backend."""
    from ultralytics import YOLO

    # Load model
    model = YOLO(str(model_path))

    # Run inference
    results = model.predict(
        source=source,
        conf=conf,
        iou=iou,
        device="cpu",
        save=save,
        project=str(output_dir) if output_dir else None,
        show=show,
        verbose=False,
    )

    return results


def run_hailo_inference(
    hef_path: Path,
    image_path: str,
    conf: float = 0.5,
) -> dict:
    """Run inference using Hailo-8L accelerator."""
    try:
        from hailo_platform import HEF, VDevice, ConfigureParams, InferVStreams, InputVStreamParams, OutputVStreamParams, HailoStreamInterface
        import numpy as np
        from PIL import Image
    except ImportError as e:
        print(f"Error: Hailo runtime not available: {e}", file=sys.stderr)
        print("Install with: sudo apt install hailo-all", file=sys.stderr)
        sys.exit(1)

    # Load HEF
    hef = HEF(str(hef_path))

    # Get input/output info
    input_vstream_info = hef.get_input_vstream_infos()[0]
    output_vstream_infos = hef.get_output_vstream_infos()

    input_shape = input_vstream_info.shape
    # Shape is (H, W, C) not (batch, H, W, C)
    input_height, input_width = input_shape[0], input_shape[1]

    # Load and preprocess image
    img = Image.open(image_path).convert("RGB")
    original_width, original_height = img.size
    img_resized = img.resize((input_width, input_height))
    input_data = np.array(img_resized, dtype=np.uint8)
    input_data = np.expand_dims(input_data, axis=0)

    # Run inference
    with VDevice() as target:
        configure_params = ConfigureParams.create_from_hef(hef, interface=HailoStreamInterface.PCIe)
        network_group = target.configure(hef, configure_params)[0]

        input_params = InputVStreamParams.make_from_network_group(network_group)
        output_params = OutputVStreamParams.make_from_network_group(network_group)

        with InferVStreams(network_group, input_params, output_params) as infer_pipeline:
            with network_group.activate():
                input_dict = {input_vstream_info.name: input_data}
                start_time = time.perf_counter()
                output_dict = infer_pipeline.infer(input_dict)
                inference_time = (time.perf_counter() - start_time) * 1000

    # Post-process outputs (Hailo YOLO NMS format)
    # Output: output[batch][class_id][det_idx] = [x1, y1, x2, y2, conf] (normalized 0-1)
    detections = []
    class_names = ["green", "roasted"]

    for output_name, output_data in output_dict.items():
        batch_output = output_data[0]  # Remove batch dimension - list of classes

        for class_id, class_detections in enumerate(batch_output):
            class_arr = np.array(class_detections)
            if class_arr.size == 0:
                continue

            # Each detection: [x1, y1, x2, y2, conf] (normalized 0-1)
            for det in class_arr:
                if det[4] >= conf:
                    # Scale bbox from normalized to original image size
                    x1 = int(det[0] * original_width)
                    y1 = int(det[1] * original_height)
                    x2 = int(det[2] * original_width)
                    y2 = int(det[3] * original_height)

                    detections.append({
                        "class_id": class_id,
                        "class": class_names[class_id] if class_id < len(class_names) else f"class_{class_id}",
                        "confidence": round(float(det[4]), 3),
                        "bbox": [x1, y1, x2, y2],
                    })

    return {
        "image": str(image_path),
        "backend": "hailo",
        "inference_time_ms": round(inference_time, 2),
        "detections": detections,
    }


def format_results_json(results, backend: str, image_path: str) -> dict:
    """Format Ultralytics results as JSON."""
    detections = []

    for r in results:
        inference_time = r.speed.get("inference", 0) if hasattr(r, "speed") else 0

        if r.boxes is not None:
            for box in r.boxes:
                bbox = box.xyxy[0].tolist()
                detections.append({
                    "class_id": int(box.cls),
                    "class": r.names[int(box.cls)],
                    "confidence": round(float(box.conf), 3),
                    "bbox": [int(x) for x in bbox],
                })

    return {
        "image": str(image_path),
        "backend": backend,
        "inference_time_ms": round(inference_time, 2),
        "detections": detections,
    }


def main():
    parser = argparse.ArgumentParser(
        description="YOLO inference for Raspberry Pi 5",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --image photo.jpg
  %(prog)s --image photo.jpg --backend hailo
  %(prog)s --input-dir ./images --output-dir ./results
  %(prog)s --source 0  # webcam
        """,
    )

    # Input options
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument("--image", type=str, help="Path to single image")
    input_group.add_argument("--input-dir", type=str, help="Directory of images")
    input_group.add_argument("--source", type=str, help="Video source (0 for webcam, or video file)")

    # Model options
    parser.add_argument(
        "--model", type=str, default=None,
        help="Path to model file (.pt, ncnn_model folder, or .hef)"
    )
    parser.add_argument(
        "--backend", type=str, choices=["auto", "ncnn", "cpu", "hailo"], default="auto",
        help="Inference backend (default: auto)"
    )

    # Inference options
    parser.add_argument("--conf", type=float, default=0.5, help="Confidence threshold (default: 0.5)")
    parser.add_argument("--iou", type=float, default=0.45, help="NMS IoU threshold (default: 0.45)")

    # Output options
    parser.add_argument("--output-dir", type=str, help="Output directory for results")
    parser.add_argument("--save", action="store_true", help="Save annotated images")
    parser.add_argument("--show", action="store_true", help="Display results (requires GUI)")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")

    args = parser.parse_args()

    # Determine backend
    backend = args.backend
    if backend == "auto":
        backend = detect_best_backend()
        print(f"Auto-detected backend: {backend}", file=sys.stderr)
    elif backend == "cpu":
        backend = "ncnn"

    # Determine model path
    if args.model:
        model_path = Path(args.model)
    elif backend == "hailo":
        model_path = DEFAULT_HEF_MODEL
    else:
        # Prefer NCNN for CPU inference
        if DEFAULT_NCNN_MODEL.exists():
            model_path = DEFAULT_NCNN_MODEL
        else:
            model_path = DEFAULT_PT_MODEL

    if not model_path.exists():
        print(f"Error: Model not found: {model_path}", file=sys.stderr)
        sys.exit(1)

    # Create output directory if needed
    output_dir = Path(args.output_dir) if args.output_dir else None
    if output_dir:
        output_dir.mkdir(parents=True, exist_ok=True)

    # Run inference
    all_results = []

    if args.image:
        # Single image
        if backend == "hailo":
            result = run_hailo_inference(model_path, args.image, args.conf)
            all_results.append(result)
        else:
            results = run_ncnn_inference(
                model_path, args.image, args.conf, args.iou,
                args.save, output_dir, args.show
            )
            for r in results:
                all_results.append(format_results_json([r], backend, args.image))

    elif args.input_dir:
        # Directory of images
        input_dir = Path(args.input_dir)
        image_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
        image_files = [f for f in input_dir.iterdir() if f.suffix.lower() in image_extensions]

        print(f"Processing {len(image_files)} images...", file=sys.stderr)

        for img_path in image_files:
            if backend == "hailo":
                result = run_hailo_inference(model_path, str(img_path), args.conf)
                all_results.append(result)
            else:
                results = run_ncnn_inference(
                    model_path, str(img_path), args.conf, args.iou,
                    args.save, output_dir, False
                )
                for r in results:
                    all_results.append(format_results_json([r], backend, str(img_path)))

    elif args.source:
        # Video/webcam source
        if backend == "hailo":
            print("Error: Hailo video inference not yet implemented", file=sys.stderr)
            print("Use --backend ncnn for video/webcam", file=sys.stderr)
            sys.exit(1)

        results = run_ncnn_inference(
            model_path, args.source, args.conf, args.iou,
            args.save, output_dir, args.show
        )
        # For video, just report completion
        print(f"Processed video source: {args.source}", file=sys.stderr)
        return

    # Output results
    if args.json or not args.save:
        print(json.dumps(all_results, indent=2))
    else:
        # Print summary
        total_detections = sum(len(r["detections"]) for r in all_results)
        total_time = sum(r["inference_time_ms"] for r in all_results)
        print(f"\nProcessed {len(all_results)} images", file=sys.stderr)
        print(f"Total detections: {total_detections}", file=sys.stderr)
        print(f"Total inference time: {total_time:.1f}ms", file=sys.stderr)
        if all_results:
            avg_time = total_time / len(all_results)
            print(f"Average per image: {avg_time:.1f}ms ({1000/avg_time:.1f} FPS)", file=sys.stderr)


if __name__ == "__main__":
    main()
