# Coffee Beans Detection Model (YOLO11n)

A YOLO11-nano object detection model trained to identify green and roasted coffee beans.

## Model Details

| Property | Value |
|----------|-------|
| Architecture | YOLO11n (nano) |
| Parameters | ~2.6M |
| Input Size | 640x640 |
| Training Epochs | 100 |
| mAP50 | 86% |
| mAP50-95 | 58% |

## Classes

| ID | Class | Description |
|----|-------|-------------|
| 0 | green | Unroasted green coffee beans |
| 1 | roasted | Roasted coffee beans |

## Available Formats

| Format | File | Size | Use Case |
|--------|------|------|----------|
| PyTorch | `best.pt` | 5.3MB | Training, GPU inference |
| ONNX | `best.onnx` | 11MB | Cross-platform, TensorRT |
| NCNN | `best_ncnn_model/` | 11MB | Raspberry Pi, ARM devices |
| Hailo HEF | `model.hef` | ~5MB | Hailo-8L AI accelerator |

## Quick Start

### CPU Inference (Any Platform)

```python
from ultralytics import YOLO

model = YOLO("models/coffee-beans-yolo11n/best.pt")
results = model.predict("image.jpg", conf=0.5)

for r in results:
    for box in r.boxes:
        print(f"Class: {r.names[int(box.cls)]}, Conf: {box.conf:.2f}")
```

### Raspberry Pi 5 (NCNN - Optimized)

```python
from ultralytics import YOLO

# NCNN is ~4x faster than PyTorch on ARM
model = YOLO("models/coffee-beans-yolo11n/best_ncnn_model")
results = model.predict("image.jpg", conf=0.5, device="cpu")
```

### Raspberry Pi 5 + Hailo AI Kit

```bash
# Using the included inference script
python scripts/rpi5_inference.py --image photo.jpg --backend hailo
```

## Performance Benchmarks

| Platform | Backend | FPS | Latency |
|----------|---------|-----|---------|
| Desktop GPU | PyTorch (CUDA) | 100+ | <10ms |
| Raspberry Pi 5 | PyTorch (CPU) | ~2-3 | ~400ms |
| Raspberry Pi 5 | NCNN (CPU) | ~10 | ~94ms |
| Raspberry Pi 5 | Hailo-8L | 40-80 | ~15-25ms |

## Training Data

- **Project**: Coff2e Beans v2
- **Total crops**: 1028 (344 green, 684 roasted)
- **Augmentation**: Mosaic, mixup, copy-paste
- **Train/Val split**: 70/30 (image-level)

## CLI Inference Script

Use the included `scripts/rpi5_inference.py` for easy deployment:

```bash
# Single image
python scripts/rpi5_inference.py --image photo.jpg

# Directory batch
python scripts/rpi5_inference.py --input-dir ./images --output-dir ./results

# Webcam/camera
python scripts/rpi5_inference.py --source 0

# With Hailo acceleration
python scripts/rpi5_inference.py --image photo.jpg --backend hailo
```

## License

Model weights trained on custom dataset. For research and personal use.
