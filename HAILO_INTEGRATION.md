# Hailo-8L Integration for Coffee Beans Detection

This document describes the process of integrating the Hailo-8L AI accelerator with our YOLO11n coffee beans detection model on Raspberry Pi 5.

## Hardware Setup

| Component | Details |
|-----------|---------|
| Board | Raspberry Pi 5 |
| AI Accelerator | Hailo-8L (13 TOPS) M.2 B+M Key Module |
| Camera | USB Webcam (MJPG 1920x1080) |
| Connection | PCIe via M.2 HAT |

## Hailo SDK Verification

Before running inference, we verified the Hailo setup using `hailo_check.sh`:

```
✓ Kernel: 6.12.47 (>= 6.6.31 required)
✓ PCIe: Hailo-8 AI Processor detected
✓ Driver: v4.20.0 loaded
✓ Firmware: 4.23.0
✓ Device: HAILO-8L AI ACC M.2 B+M KEY MODULE
✓ GStreamer plugin: available
```

## Model Compilation

The YOLO11n model was compiled to HEF format for Hailo-8L:

| Property | Value |
|----------|-------|
| Source | `best.onnx` (11MB) |
| Target | Hailo-8L (4-context) |
| Output | `model.hef` (11.6MB) |
| Input | 640x640x3 RGB uint8 |
| Output | NMS post-processed detections |

## Python API Integration

### Key Imports

```python
from hailo_platform import (
    HEF, VDevice, ConfigureParams, InferVStreams,
    InputVStreamParams, OutputVStreamParams, HailoStreamInterface
)
```

### API Challenges & Solutions

#### 1. ConfigureParams Interface

**Problem:** The API expected `HailoStreamInterface`, not `VDevice`:
```python
# Wrong (older API)
configure_params = ConfigureParams.create_from_hef(hef, interface=target)

# Correct
configure_params = ConfigureParams.create_from_hef(hef, interface=HailoStreamInterface.PCIe)
```

#### 2. Input Shape Format

**Problem:** Shape is `(H, W, C)` not `(batch, H, W, C)`:
```python
# Wrong
input_height, input_width = input_shape[1], input_shape[2]  # Gets 640, 3

# Correct
input_height, input_width = input_shape[0], input_shape[1]  # Gets 640, 640
```

#### 3. Network Group Activation

**Problem:** Network group must be activated inside the InferVStreams context:
```python
# Wrong - network not activated
with InferVStreams(network_group, input_params, output_params) as pipeline:
    output = pipeline.infer(input_dict)  # Error!

# Correct - nested activation
with InferVStreams(network_group, input_params, output_params) as pipeline:
    with network_group.activate():
        output = pipeline.infer(input_dict)  # Works!
```

#### 4. NMS Output Format

**Problem:** Hailo YOLO NMS output has a unique format:
```python
# Output structure:
# output[batch][class_id][detection_idx] = [x1, y1, x2, y2, conf]
# Coordinates are normalized (0-1)

# Parsing:
for class_id, class_dets in enumerate(output[0]):
    arr = np.array(class_dets)
    for det in arr:
        x1 = int(det[0] * orig_width)   # Denormalize
        y1 = int(det[1] * orig_height)
        x2 = int(det[2] * orig_width)
        y2 = int(det[3] * orig_height)
        conf = det[4]
```

## Performance Results

| Metric | Value |
|--------|-------|
| Inference Time | ~17ms |
| Throughput | ~57 FPS |
| Camera Capture | 30 FPS |
| End-to-End | ~30 FPS (camera-limited) |

## Final Code Structure

### Static Image Inference (`scripts/rpi5_inference.py`)

```bash
# Run inference on image
python scripts/rpi5_inference.py --image photo.jpg --backend hailo --json
```

### Live Camera Inference (`scripts/hailo_camera.py`)

```bash
# Run live camera detection
python scripts/hailo_camera.py --conf 0.4
```

**Controls:**
- `q` - Quit
- `+` / `-` - Adjust confidence threshold

## File Changes Summary

| File | Changes |
|------|---------|
| `scripts/rpi5_inference.py` | Fixed Hailo API calls, input shape, NMS parsing |
| `scripts/hailo_camera.py` | New live camera inference app |
| `models/coffee-beans-yolo11n/model.hef` | Compiled HEF model (from previous commit) |

## Inference Pipeline

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Camera    │────▶│  Preprocess  │────▶│   Hailo     │
│ /dev/video0 │     │ Resize 640²  │     │  Inference  │
│  1280x720   │     │  RGB uint8   │     │   ~17ms     │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                │
┌─────────────┐     ┌──────────────┐     ┌──────▼──────┐
│   Display   │◀────│     Draw     │◀────│  NMS Parse  │
│  OpenCV     │     │   BBoxes     │     │ Detections  │
│   ~30 FPS   │     │   Labels     │     │             │
└─────────────┘     └──────────────┘     └─────────────┘
```

## Dependencies

```bash
# Already installed on RPi5
sudo apt install hailo-all
pip install opencv-python numpy
```

## References

- [Hailo Community - Network Group Activation](https://community.hailo.ai/t/whats-the-hailortstatusexception-error-mean/6742)
- [HailoRT GitHub](https://github.com/hailo-ai/hailort)
- Model trained using SAM3-Interactive labeling tool
