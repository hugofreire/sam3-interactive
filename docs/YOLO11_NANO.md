# YOLO11-Nano Quick Reference

> Reference documentation for YOLO11-nano training and edge deployment.

---

## Model Overview

| Property | Value |
|----------|-------|
| Model | YOLO11n (nano) |
| Parameters | ~2.6M |
| Size | ~5 MB (FP32) |
| Speed (GPU) | ~1.5ms/image |
| Speed (RPi5 CPU) | ~6 FPS (TFLite INT8) |
| Speed (RPi5 + Hailo) | ~137 FPS |
| mAP50-95 (COCO) | 39.5 |

---

## Installation

```bash
pip install ultralytics
```

---

## Training

### Python API
```python
from ultralytics import YOLO

# Load pretrained model
model = YOLO("yolo11n.pt")

# Train on custom dataset
results = model.train(
    data="data.yaml",      # Dataset config
    epochs=100,            # Training epochs
    batch=8,               # Batch size
    imgsz=640,             # Image size
    device=0,              # GPU device (0, 1, or 'cpu')
    project="runs/detect", # Output directory
    name="train",          # Run name
    exist_ok=True          # Overwrite existing
)
```

### CLI
```bash
yolo detect train data=data.yaml model=yolo11n.pt epochs=100 batch=8 imgsz=640
```

---

## Dataset Format (YOLO)

```
dataset/
├── train/
│   ├── images/
│   │   ├── img001.jpg
│   │   └── img002.jpg
│   └── labels/
│       ├── img001.txt
│       └── img002.txt
├── val/
│   ├── images/
│   └── labels/
├── test/
│   ├── images/
│   └── labels/
└── data.yaml
```

### data.yaml
```yaml
path: ../datasets
train: train/images
val: val/images
test: test/images

nc: 2  # Number of classes
names: ['raw', 'roasted']  # Class names
```

### Label Format (.txt)
```
# class_id center_x center_y width height (normalized 0-1)
0 0.5 0.5 0.2 0.3
1 0.3 0.7 0.15 0.25
```

---

## Export Formats

### ONNX (Universal)
```python
model.export(format="onnx", imgsz=640, half=True)
# Output: best.onnx
```

### NCNN (Raspberry Pi Optimized)
```python
model.export(format="ncnn", imgsz=640, half=True)
# Output: best_ncnn_model/
```

### TFLite (INT8 Quantized)
```python
model.export(format="tflite", imgsz=640, int8=True, data="data.yaml")
# Output: best.tflite (smallest, ~6 FPS on RPi5)
```

---

## Inference

### Python
```python
from ultralytics import YOLO

model = YOLO("best.pt")  # or best.onnx

results = model.predict(
    source="image.jpg",
    conf=0.5,           # Confidence threshold
    iou=0.45,           # NMS IoU threshold
    imgsz=640,
    save=False
)

# Access results
for result in results:
    boxes = result.boxes.xyxy.cpu().numpy()  # [x1, y1, x2, y2]
    scores = result.boxes.conf.cpu().numpy()
    classes = result.boxes.cls.cpu().numpy()
```

### NCNN on Raspberry Pi
```python
from ultralytics import YOLO

model = YOLO("best_ncnn_model")
results = model.predict("image.jpg")
```

---

## Training Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `epochs` | 100 | Number of training epochs |
| `batch` | 16 | Batch size (-1 for auto) |
| `imgsz` | 640 | Input image size |
| `device` | 0 | GPU device (0, 1, 'cpu') |
| `workers` | 8 | Dataloader workers |
| `patience` | 50 | Early stopping patience |
| `lr0` | 0.01 | Initial learning rate |
| `lrf` | 0.01 | Final learning rate factor |
| `momentum` | 0.937 | SGD momentum |
| `weight_decay` | 0.0005 | L2 regularization |

### Small Dataset Recommendations
- `epochs`: 100-200 (more epochs for small datasets)
- `batch`: 8-16 (smaller batches for small datasets)
- `patience`: 30-50 (early stopping)
- `augment`: True (data augmentation helps)

---

## Output Structure

After training:
```
runs/detect/train/
├── weights/
│   ├── best.pt      # Best model weights
│   └── last.pt      # Final epoch weights
├── results.csv      # Training metrics
├── confusion_matrix.png
├── results.png      # Loss/metric curves
└── args.yaml        # Training arguments
```

---

## Raspberry Pi 5 Deployment

### Option 1: NCNN (Recommended)
```bash
# Install on RPi5
pip install ultralytics
pip install ncnn

# Run inference
python -c "from ultralytics import YOLO; YOLO('best_ncnn_model').predict('test.jpg')"
```

### Option 2: TFLite
```bash
pip install tflite-runtime

# Convert and run
python -c "from ultralytics import YOLO; YOLO('best.tflite').predict('test.jpg')"
```

### Option 3: Hailo AI Kit (136+ FPS)
- Requires Hailo-8L AI accelerator
- See: [Seeed Studio Tutorial](https://wiki.seeedstudio.com/tutorial_of_ai_kit_with_raspberrypi5_about_yolov8n_object_detection/)

---

## Resources

- [Ultralytics YOLO Docs](https://docs.ultralytics.com/)
- [Training Guide](https://docs.ultralytics.com/modes/train/)
- [Export Guide](https://docs.ultralytics.com/modes/export/)
- [Raspberry Pi Guide](https://docs.ultralytics.com/guides/raspberry-pi/)
- [GitHub](https://github.com/ultralytics/ultralytics)

---

*Generated for SAM3 Dataset Labeling Tool - YOLO11 Training Feature*
