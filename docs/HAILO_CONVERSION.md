# Hailo HEF Model Conversion Guide

A comprehensive guide to converting YOLO models to Hailo Executable Format (HEF) for deployment on Hailo-8L AI accelerators, including the Raspberry Pi 5 AI Kit.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Understanding the Hailo Ecosystem](#understanding-the-hailo-ecosystem)
4. [Conversion Workflow](#conversion-workflow)
5. [Calibration Images](#calibration-images)
6. [Running the Conversion](#running-the-conversion)
7. [Understanding the Output](#understanding-the-output)
8. [Troubleshooting](#troubleshooting)
9. [Deployment on Raspberry Pi 5](#deployment-on-raspberry-pi-5)
10. [Performance Optimization Tips](#performance-optimization-tips)

---

## Overview

### What is HEF?

HEF (Hailo Executable Format) is the compiled binary format that runs on Hailo AI accelerators. Converting your model to HEF involves:

- **Quantization**: Converting FP32 weights to INT8 for efficient inference
- **Graph optimization**: Restructuring operations for Hailo's dataflow architecture
- **Resource mapping**: Assigning operations to Hailo's compute clusters
- **Kernel compilation**: Generating optimized microcode for the hardware

### Why Convert to HEF?

| Inference Backend | FPS on RPi5 | Latency | Power |
|-------------------|-------------|---------|-------|
| PyTorch (CPU) | ~2-3 | ~400ms | High |
| NCNN (CPU) | ~10 | ~94ms | Medium |
| **Hailo-8L (HEF)** | **40-80** | **~15-25ms** | **Low** |

The Hailo-8L in the RPi5 AI Kit delivers 13 TOPS of INT8 performance, enabling real-time inference that's impossible with CPU alone.

---

## Prerequisites

### Hardware Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| RAM | 16GB | 32GB |
| Disk Space | 60GB free | 100GB free |
| Architecture | x86_64 | x86_64 |
| GPU | Optional | NVIDIA (speeds up compilation 5-10x) |

> **Note**: Compilation is CPU-intensive. Without a GPU, expect 30-60 minutes for YOLO models.

### Software Requirements

1. **Docker** - For running the Hailo AI Software Suite
2. **ONNX model** - Your trained model exported to ONNX format
3. **Calibration images** - Representative images for quantization

### Obtaining the Hailo AI Software Suite

The Hailo AI Software Suite is distributed as a Docker image. You need to:

1. Register at [Hailo Developer Zone](https://hailo.ai/developer-zone/)
2. Download the Docker image (e.g., `hailo8_ai_sw_suite_2025-10_docker.zip`)
3. Load the image:

```bash
# Extract the archive
unzip hailo8_ai_sw_suite_2025-10_docker.zip

# Load Docker image
docker load -i hailo8_ai_sw_suite_2025-10.tar

# Verify
docker images | grep hailo
# Expected: hailo8_ai_sw_suite_2025-10   1   ...   ~25GB
```

---

## Understanding the Hailo Ecosystem

### Hailo Hardware Variants

| Chip | TOPS | Use Case | Flag |
|------|------|----------|------|
| Hailo-8 | 26 | PCIe cards, industrial | `--hw-arch hailo8` |
| **Hailo-8L** | **13** | **RPi5 AI Kit, embedded** | `--hw-arch hailo8l` |

> **Important**: Always use `hailo8l` for Raspberry Pi 5 AI Kit deployments.

### Hailo Model Zoo

The Hailo Model Zoo (`hailomz`) provides:
- Pre-configured compilation recipes for popular architectures
- Automatic detection of model structure (YOLO, ResNet, etc.)
- Post-processing configuration (NMS, anchors, etc.)

Supported YOLO variants:
- YOLOv5, YOLOv6, YOLOv7, YOLOv8
- **YOLO11** (detected as "yolov8 or equivalent architecture")

### Multi-Context Compilation

Hailo chips use a "context" system to handle large models:

| Contexts | Description | Performance Impact |
|----------|-------------|-------------------|
| 1 | Entire model fits in one pass | Optimal latency |
| 2-4 | Model split across passes | Slight overhead |
| 5+ | Heavy splitting | Noticeable overhead |

The compiler automatically determines the optimal number of contexts. Our YOLO11n model compiled to **4 contexts**.

---

## Conversion Workflow

### High-Level Process

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   ONNX      │────>│   HAR       │────>│  Optimized  │────>│    HEF      │
│   Model     │     │  (Archive)  │     │    HAR      │     │  (Binary)   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                          │                    │
                          v                    v
                    Translation          Quantization
                    & Parsing           & Calibration
```

### Detailed Stages

1. **ONNX Translation** (~1 min)
   - Parse ONNX graph
   - Detect model architecture (NMS structure, anchors)
   - Map to Hailo intermediate representation

2. **Model Optimization** (~1-5 min)
   - Calibration using your images
   - INT8 quantization
   - Layer fusion and optimization

3. **Partition Optimization** (~5-15 min per pass)
   - Find optimal split into contexts
   - Multiple iterations to improve performance
   - May run several passes (we observed 4 passes)

4. **Resource Allocation** (~10 min per context on CPU)
   - Map operations to Hailo clusters (8 clusters)
   - Assign to workers (4 workers per cluster)
   - Memory allocation for weights and activations

5. **Kernel Compilation** (~2-5 min)
   - Generate optimized microcode
   - Create final HEF binary

---

## Calibration Images

### Why Calibration Matters

INT8 quantization needs to know the typical range of activations in your model. Calibration images help determine optimal scaling factors.

### Requirements

| Aspect | Recommendation |
|--------|----------------|
| **Quantity** | 1024+ images (minimum: 64) |
| **Content** | Representative of inference data |
| **Format** | JPEG/PNG, same preprocessing as training |
| **Diversity** | Cover all classes and scenarios |

### Impact of Insufficient Calibration

```
[warning] Reducing optimization level to 0 (the accuracy won't be optimized
and compression won't be used) because there's less data than the
recommended amount (1024), and there's no available GPU
```

With fewer images:
- Quantization may be suboptimal
- Model accuracy could degrade
- Advanced optimizations are disabled

### Preparing Calibration Images

```bash
# Create calibration directory
mkdir -p /tmp/hailo_workspace/calib_images

# Copy representative images (from your dataset)
cp /path/to/dataset/train/images/*.jpg /tmp/hailo_workspace/calib_images/

# Or sample randomly
ls /path/to/dataset/train/images/*.jpg | shuf -n 1024 | xargs -I {} cp {} /tmp/hailo_workspace/calib_images/
```

---

## Running the Conversion

### Workspace Setup

```bash
# Create workspace
mkdir -p /tmp/hailo_workspace/calib_images

# Copy your ONNX model
cp models/your-model/best.onnx /tmp/hailo_workspace/

# Copy calibration images
cp -r /path/to/calibration/images/* /tmp/hailo_workspace/calib_images/
```

### Basic Conversion Command

```bash
docker run --rm \
  -v /tmp/hailo_workspace:/workspace \
  -e HOME=/workspace \
  -w /workspace \
  hailo8_ai_sw_suite_2025-10:1 \
  bash -c "hailomz compile yolov11n \
    --ckpt best.onnx \
    --hw-arch hailo8l \
    --calib-path calib_images \
    --classes 2 \
    --performance"
```

### Command Parameters Explained

| Parameter | Description | Example |
|-----------|-------------|---------|
| `yolov11n` | Model architecture name | yolov5s, yolov8n, yolov11n |
| `--ckpt` | Path to ONNX file | best.onnx |
| `--hw-arch` | Target Hailo chip | hailo8l (for RPi5 AI Kit) |
| `--calib-path` | Calibration images folder | calib_images |
| `--classes` | Number of detection classes | 2 (for our coffee beans) |
| `--performance` | Optimize for speed | (flag, no value) |

### Important Docker Flags

```bash
-v /tmp/hailo_workspace:/workspace  # Mount local folder
-e HOME=/workspace                   # CRITICAL: Avoid permission errors
-w /workspace                        # Set working directory
--rm                                 # Clean up container after exit
```

> **Critical**: The `-e HOME=/workspace` flag prevents permission errors when the compiler tries to write temporary files.

### With GPU Acceleration (5-10x faster)

```bash
docker run --rm \
  --gpus all \
  -v /tmp/hailo_workspace:/workspace \
  -e HOME=/workspace \
  -w /workspace \
  hailo8_ai_sw_suite_2025-10:1 \
  bash -c "hailomz compile yolov11n \
    --ckpt best.onnx \
    --hw-arch hailo8l \
    --calib-path calib_images \
    --classes 2 \
    --performance"
```

---

## Understanding the Output

### Compilation Progress

The compiler outputs progress through several stages:

```
[info] Translation started on ONNX model yolov11n
[info] NMS structure of yolov8 (or equivalent architecture) was detected.
[info] Translation completed on ONNX model yolov11n (completion time: 00:00:00.77)
```

```
[info] Starting Model Optimization
[info] Using dataset with 17 entries for calibration
Calibration: 100%|██████████| 17/17 [00:21<00:00]
[info] Model Optimization is done
```

```
[info] Using Multi-context flow
[info] Finding the best partition to contexts...
[info] Iteration #33 - 3 contexts
[info] Found valid partition to 4 contexts, Performance improved by 4.1%
[info] Partitioner finished after 181 iterations, Time it took: 5m 52s
```

```
[info] Running resources allocation (mapping) flow, time per context: 9m 59s
[info] Context:0/3 Iteration 4: Trying parallel mapping...
```

### Output Files

| File | Description |
|------|-------------|
| `yolov11n.har` | Hailo Archive (intermediate) - ~57MB |
| `yolov11n.hef` | Final executable - ~11.6MB |

### Typical Compilation Times (CPU-only)

| Stage | Duration |
|-------|----------|
| Translation | ~1 minute |
| Calibration | ~30 seconds |
| Optimization | ~2 minutes |
| Partitioning | ~15-25 minutes (multiple passes) |
| Resource Mapping | ~10 min × num_contexts |
| Kernel Compilation | ~2 minutes |
| **Total** | **30-60 minutes** |

With GPU: **5-15 minutes total**

---

## Troubleshooting

### Common Issues and Solutions

#### 1. Permission Denied Errors

```
HailoRT warning: Cannot create log file hailort.log!
```

**Solution**: Add `-e HOME=/workspace` to Docker command.

#### 2. Single Context Failure

```
[info] Single context flow failed: Recoverable single context error
[info] Using Multi-context flow
```

**This is normal!** The compiler automatically falls back to multi-context mode for larger models. YOLO11n typically requires 3-4 contexts.

#### 3. Low Calibration Data Warning

```
[warning] Reducing optimization level to 0 because there's less data
than the recommended amount (1024)
```

**Solutions**:
- Add more calibration images (recommended)
- Accept reduced optimization (faster compile, possibly lower accuracy)
- Use GPU to enable advanced optimization with less data

#### 4. Out of Memory

```
std::bad_alloc
```

**Solutions**:
- Increase Docker memory limit: `--memory=16g`
- Close other applications
- Use a machine with 32GB+ RAM

#### 5. Model Architecture Not Recognized

```
[error] Unknown model architecture
```

**Solutions**:
- Use supported architecture names (yolov5n, yolov8n, yolov11n)
- Check ONNX export settings
- Ensure model has standard YOLO structure

### Verifying the HEF File

```bash
# Check file was created
ls -la /tmp/hailo_workspace/*.hef

# Expected output:
# -rw-r--r-- 1 root root 11640415 Nov 27 20:12 yolov11n.hef
```

---

## Deployment on Raspberry Pi 5

### Prerequisites on RPi5

1. **Hailo AI Kit** installed and recognized
2. **HailoRT** runtime installed
3. **Python bindings** for HailoRT

### Verify Hailo Hardware

```bash
# Check Hailo device
hailortcli fw-control identify

# Expected output:
# Executing on device: 0000:01:00.0
# Identifying board
# Control Protocol Version: 2
# Firmware Version: 4.17.0
# Board Name: Hailo-8L
```

### Copy HEF to RPi5

```bash
scp models/coffee-beans-yolo11n/model.hef pi@raspberrypi:/home/pi/models/
```

### Running Inference

Using our included script:

```bash
python scripts/rpi5_inference.py \
  --image photo.jpg \
  --backend hailo \
  --model /home/pi/models/model.hef \
  --conf 0.5
```

Or with Python directly:

```python
from hailo_platform import HEF, VDevice, ConfigureParams

# Load HEF
hef = HEF("model.hef")

# Configure device
params = ConfigureParams.create_from_hef(hef)
with VDevice() as device:
    network_group = device.configure(hef, params)[0]

    # Run inference
    input_data = preprocess(image)
    results = network_group.run([input_data])
    detections = postprocess(results)
```

---

## Performance Optimization Tips

### 1. Use More Calibration Images

More images = better quantization = higher accuracy

```bash
# Aim for 1024+ images covering:
# - All object classes
# - Various lighting conditions
# - Different backgrounds
# - Edge cases
```

### 2. Enable GPU Compilation

5-10x faster and enables advanced optimizations:

```bash
docker run --gpus all ...
```

### 3. Match Input Resolution

Compile with the same resolution you'll use for inference:

```bash
# If you'll run at 640x640 (default YOLO)
--input-resolution 640 640
```

### 4. Profile and Iterate

Use Hailo's profiler to identify bottlenecks:

```bash
hailomz profile yolov11n.hef
```

### 5. Consider Model Size

| Model | Parameters | HEF Size | Expected FPS |
|-------|------------|----------|--------------|
| YOLO11n | 2.6M | ~11MB | 60-80 |
| YOLO11s | 9.4M | ~25MB | 40-60 |
| YOLO11m | 20M | ~50MB | 20-40 |

Smaller models = faster inference on edge devices.

---

## Quick Reference

### Minimum Viable Command

```bash
docker run --rm \
  -v /tmp/hailo_workspace:/workspace \
  -e HOME=/workspace \
  -w /workspace \
  hailo8_ai_sw_suite_2025-10:1 \
  bash -c "hailomz compile yolov11n --ckpt best.onnx --hw-arch hailo8l --calib-path calib_images --classes 2"
```

### Checklist Before Conversion

- [ ] ONNX model exported and tested
- [ ] Docker image loaded (`docker images | grep hailo`)
- [ ] Workspace created with model and calibration images
- [ ] Sufficient disk space (60GB+)
- [ ] Sufficient RAM (16GB+)

### Expected Outputs

- [ ] `yolov11n.har` - Intermediate archive
- [ ] `yolov11n.hef` - Final executable (~10-15MB for YOLO11n)

---

## Resources

- [Hailo Developer Zone](https://hailo.ai/developer-zone/)
- [Hailo Model Zoo GitHub](https://github.com/hailo-ai/hailo_model_zoo)
- [HailoRT Documentation](https://hailo.ai/developer-zone/documentation/)
- [Raspberry Pi AI Kit Guide](https://www.raspberrypi.com/documentation/accessories/ai-kit.html)

---

*Document created: November 2024*
*Based on: Hailo AI Software Suite 2025-10, YOLO11n coffee beans model conversion*
