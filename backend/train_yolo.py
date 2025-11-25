#!/usr/bin/env python3
"""
YOLOv8-Nano Training Script for SAM3 Dataset Labeling Tool

Usage:
    python train_yolo.py --data /path/to/data.yaml --output /path/to/output --epochs 100

This script:
1. Trains YOLOv8-nano on the provided dataset
2. Exports trained model to NCNN and ONNX formats
3. Writes JSON progress updates to stdout for real-time monitoring
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path


def log_json(event_type: str, data: dict):
    """Write JSON log line to stdout for Node.js to parse"""
    log_entry = {
        "type": event_type,
        "timestamp": time.time(),
        **data
    }
    print(json.dumps(log_entry), flush=True)


def log_info(message: str):
    """Log info message"""
    log_json("info", {"message": message})


def log_progress(epoch: int, total_epochs: int, metrics: dict):
    """Log training progress"""
    log_json("progress", {
        "epoch": epoch,
        "total_epochs": total_epochs,
        "progress": round(epoch / total_epochs * 100, 1),
        "metrics": metrics
    })


def log_error(message: str):
    """Log error message"""
    log_json("error", {"message": message})


def log_complete(results: dict):
    """Log training completion"""
    log_json("complete", results)


class TrainingCallback:
    """Callback to capture training progress and send to stdout"""

    def __init__(self, total_epochs: int):
        self.total_epochs = total_epochs
        self.current_epoch = 0

    def on_train_epoch_end(self, trainer):
        """Called at end of each training epoch"""
        self.current_epoch = trainer.epoch + 1

        metrics = {}
        if hasattr(trainer, 'metrics'):
            m = trainer.metrics
            metrics = {
                "box_loss": round(float(m.get("train/box_loss", 0)), 4),
                "cls_loss": round(float(m.get("train/cls_loss", 0)), 4),
                "dfl_loss": round(float(m.get("train/dfl_loss", 0)), 4),
            }

        log_progress(self.current_epoch, self.total_epochs, metrics)

    def on_val_end(self, validator):
        """Called at end of validation"""
        if hasattr(validator, 'metrics'):
            m = validator.metrics
            metrics = {
                "mAP50": round(float(m.box.map50 if hasattr(m, 'box') else 0), 4),
                "mAP50-95": round(float(m.box.map if hasattr(m, 'box') else 0), 4),
            }
            log_json("validation", {"metrics": metrics})


def train(
    data_yaml: str,
    output_dir: str,
    epochs: int = 100,
    batch: int = 8,
    imgsz: int = 640,
    device: int = 0,
    workers: int = 4
) -> dict:
    """
    Train YOLOv8-nano model on custom dataset

    Args:
        data_yaml: Path to data.yaml configuration
        output_dir: Output directory for trained model
        epochs: Number of training epochs
        batch: Batch size
        imgsz: Input image size
        device: GPU device index
        workers: Number of dataloader workers

    Returns:
        dict: Training results including paths to exported models
    """
    try:
        from ultralytics import YOLO
        from ultralytics.utils import callbacks
    except ImportError:
        log_error("ultralytics not installed. Run: pip install ultralytics")
        sys.exit(1)

    log_info(f"Starting YOLOv8-nano training")
    log_info(f"Dataset: {data_yaml}")
    log_info(f"Output: {output_dir}")
    log_info(f"Config: epochs={epochs}, batch={batch}, imgsz={imgsz}, device={device}")

    # Verify data.yaml exists
    if not os.path.exists(data_yaml):
        log_error(f"Dataset config not found: {data_yaml}")
        sys.exit(1)

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    # Load pretrained YOLOv8-nano
    log_info("Loading YOLOv8-nano pretrained model...")
    model = YOLO("yolov8n.pt")

    # Set up custom callback for progress tracking
    callback = TrainingCallback(epochs)
    model.add_callback("on_train_epoch_end", callback.on_train_epoch_end)
    model.add_callback("on_val_end", callback.on_val_end)

    # Train the model
    log_info("Starting training...")
    start_time = time.time()

    results = model.train(
        data=data_yaml,
        epochs=epochs,
        batch=batch,
        imgsz=imgsz,
        device=device,
        workers=workers,
        project=output_dir,
        name="train",
        exist_ok=True,
        verbose=False,  # Reduce console spam
        patience=50,    # Early stopping
    )

    training_time = time.time() - start_time
    log_info(f"Training completed in {training_time:.1f} seconds")

    # Get best model path
    weights_dir = Path(output_dir) / "train" / "weights"
    best_pt = weights_dir / "best.pt"

    if not best_pt.exists():
        log_error("Training failed - no best.pt found")
        sys.exit(1)

    # Load best model for export
    log_info("Loading best model for export...")
    best_model = YOLO(str(best_pt))

    # Export to ONNX
    log_info("Exporting to ONNX format...")
    try:
        onnx_path = best_model.export(format="onnx", imgsz=imgsz)
        log_info(f"ONNX export complete: {onnx_path}")
    except Exception as e:
        log_error(f"ONNX export failed: {e}")
        onnx_path = None

    # Export to NCNN (optimized for Raspberry Pi)
    log_info("Exporting to NCNN format (Raspberry Pi optimized)...")
    try:
        ncnn_path = best_model.export(format="ncnn", imgsz=imgsz)
        log_info(f"NCNN export complete: {ncnn_path}")
    except Exception as e:
        log_error(f"NCNN export failed: {e}")
        ncnn_path = None

    # Gather final results
    final_results = {
        "success": True,
        "training_time_seconds": round(training_time, 1),
        "epochs_completed": epochs,
        "best_model": str(best_pt),
        "onnx_model": str(onnx_path) if onnx_path else None,
        "ncnn_model": str(ncnn_path) if ncnn_path else None,
        "metrics": {}
    }

    # Add final metrics if available
    if hasattr(results, 'results_dict'):
        rd = results.results_dict
        final_results["metrics"] = {
            "mAP50": round(rd.get("metrics/mAP50(B)", 0), 4),
            "mAP50-95": round(rd.get("metrics/mAP50-95(B)", 0), 4),
            "precision": round(rd.get("metrics/precision(B)", 0), 4),
            "recall": round(rd.get("metrics/recall(B)", 0), 4),
        }

    log_complete(final_results)

    return final_results


def run_inference(
    model_path: str,
    image_path: str,
    conf: float = 0.5,
    iou: float = 0.45
) -> dict:
    """
    Run inference on a single image

    Args:
        model_path: Path to trained model (.pt, .onnx, or ncnn folder)
        image_path: Path to input image
        conf: Confidence threshold
        iou: NMS IoU threshold

    Returns:
        dict: Detection results
    """
    try:
        from ultralytics import YOLO
    except ImportError:
        log_error("ultralytics not installed")
        return {"success": False, "error": "ultralytics not installed"}

    if not os.path.exists(model_path):
        return {"success": False, "error": f"Model not found: {model_path}"}

    if not os.path.exists(image_path):
        return {"success": False, "error": f"Image not found: {image_path}"}

    log_info(f"Running inference with {model_path}")

    try:
        model = YOLO(model_path)
        results = model.predict(
            source=image_path,
            conf=conf,
            iou=iou,
            save=False,
            verbose=False
        )

        detections = []
        for result in results:
            boxes = result.boxes
            for i in range(len(boxes)):
                box = boxes.xyxy[i].cpu().numpy().tolist()
                conf_score = float(boxes.conf[i].cpu().numpy())
                cls_id = int(boxes.cls[i].cpu().numpy())
                cls_name = result.names[cls_id]

                detections.append({
                    "bbox": [round(x, 2) for x in box],  # [x1, y1, x2, y2]
                    "confidence": round(conf_score, 4),
                    "class_id": cls_id,
                    "class_name": cls_name
                })

        return {
            "success": True,
            "image": image_path,
            "detections": detections,
            "count": len(detections)
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


def main():
    parser = argparse.ArgumentParser(description="YOLOv8-Nano Training Script")
    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # Train command
    train_parser = subparsers.add_parser("train", help="Train a model")
    train_parser.add_argument("--data", required=True, help="Path to data.yaml")
    train_parser.add_argument("--output", required=True, help="Output directory")
    train_parser.add_argument("--epochs", type=int, default=100, help="Training epochs")
    train_parser.add_argument("--batch", type=int, default=8, help="Batch size")
    train_parser.add_argument("--imgsz", type=int, default=640, help="Image size")
    train_parser.add_argument("--device", type=int, default=0, help="GPU device")
    train_parser.add_argument("--workers", type=int, default=4, help="Dataloader workers")

    # Inference command
    infer_parser = subparsers.add_parser("infer", help="Run inference")
    infer_parser.add_argument("--model", required=True, help="Path to model")
    infer_parser.add_argument("--image", required=True, help="Path to image")
    infer_parser.add_argument("--conf", type=float, default=0.5, help="Confidence threshold")
    infer_parser.add_argument("--iou", type=float, default=0.45, help="NMS IoU threshold")

    args = parser.parse_args()

    if args.command == "train":
        train(
            data_yaml=args.data,
            output_dir=args.output,
            epochs=args.epochs,
            batch=args.batch,
            imgsz=args.imgsz,
            device=args.device,
            workers=args.workers
        )
    elif args.command == "infer":
        result = run_inference(
            model_path=args.model,
            image_path=args.image,
            conf=args.conf,
            iou=args.iou
        )
        print(json.dumps(result))
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
