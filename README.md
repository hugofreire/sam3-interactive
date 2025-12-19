# EdgeLabel

**Label → Train → Deploy**: AI-powered interactive labeling with one-click edge deployment

---

## What is EdgeLabel?

EdgeLabel is a complete pipeline for creating custom object detection models and deploying them to edge devices. It combines:

- **SAM3** (Segment Anything Model 3) for instant click-to-segment labeling
- **YOLO11** for fast, accurate object detection training
- **Hailo-8L** support for 30+ FPS inference on Raspberry Pi 5

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   LABEL     │ ──▶  │    TRAIN    │ ──▶  │   DEPLOY    │
│             │      │             │      │             │
│ Click to    │      │ YOLO11-nano │      │ Hailo-8L    │
│ segment     │      │ Real-time   │      │ 30+ FPS     │
│ with SAM3   │      │ metrics     │      │ on RPi5     │
└─────────────┘      └─────────────┘      └─────────────┘
```

---

## Features

### Intelligent Labeling
- **Click-to-segment**: One click generates precise masks using SAM3 (848M parameters)
- **Multi-mask selection**: Choose from 3 candidate masks with confidence scores
- **Iterative refinement**: Add foreground/background points to perfect segmentation
- **Batch upload**: Process up to 100 images at once
- **Keyboard shortcuts**: Fast labeling workflow (1-9 for labels, S to save, N for next)

### Integrated Training
- **One-click training**: Start YOLO11-nano training directly from the UI
- **Real-time progress**: Live epoch counter, loss metrics, and mAP scores
- **Auto-export**: Models automatically exported to PT, ONNX, and NCNN formats
- **Smart scoring**: Model quality indicators based on mAP50 performance

### Edge Deployment
- **Hailo-8L optimized**: Convert to HEF for 30+ FPS on Raspberry Pi 5
- **NCNN fallback**: ~10 FPS CPU inference without accelerator
- **Live camera scripts**: Ready-to-use inference for USB webcams
- **Multiple formats**: PT (training), ONNX (universal), NCNN (ARM), HEF (Hailo)

---

## Quick Start

### Prerequisites
- Python 3.10+ with CUDA 12.1+ (tested with `torch==2.5.1+cu121`)
- Node.js 18+
- GPU with 8GB+ VRAM (for SAM3 - 848M parameters)

### Installation

```bash
# Clone repository
git clone https://github.com/your-username/edgelabel.git
cd edgelabel

# Install PyTorch with CUDA 12.1 (adjust for your CUDA version)
pip install torch==2.5.1+cu121 torchvision==0.20.1+cu121 \
    --index-url https://download.pytorch.org/whl/cu121

# Install SAM3 and Python dependencies
pip install -e .

# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### Launch

**Terminal 1 - Backend:**
```bash
node backend/server.js
# Server running on http://localhost:4010 (configurable via config/.env)
```

**Terminal 2 - Frontend:**
```bash
cd frontend && npm run dev
# Open http://localhost:5173
```

> **Note**: Ports are configurable via environment files. See `config/.env.example` and `frontend/.env.example` for options.

---

## Workflow

### 1. Label Your Data

1. Create a new project and define your class labels
2. Upload images (drag-drop or batch upload)
3. Click on objects to segment with SAM3
4. Select the best mask from candidates
5. Choose a label and save (keyboard: number key + S)
6. Repeat for all objects, then press N for next image

### 2. Train Your Model

1. Open the Training panel
2. Configure epochs, batch size, image size
3. Click "Start Training"
4. Monitor real-time metrics:
   - Loss curves (box, class, dfl)
   - Validation mAP50 and mAP50-95
   - Model quality score

### 3. Deploy to Edge

**Option A: Hailo-8L (Recommended for RPi5)**
```bash
# Convert ONNX to HEF (on development machine with Docker)
docker run --rm -v /path/to/model:/workspace hailo_sdk \
    hailomz compile yolov11n --ckpt best.onnx --hw-arch hailo8l

# Copy to RPi5 and run
python scripts/hailo_camera.py --conf 0.5
```

**Option B: NCNN (CPU-only)**
```bash
# Already exported during training
python scripts/rpi5_inference.py --image test.jpg --backend ncnn
```

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  React Frontend │ ──▶ │  Express Server │ ──▶ │  Python SAM3    │
│  localhost:5173 │     │  localhost:4010 │     │  GPU Service    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  SQLite DB      │
                        │  Projects/Crops │
                        └─────────────────┘
```

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | React 18 + TypeScript | Interactive labeling UI |
| Backend | Express.js | REST API, file management |
| Segmentation | SAM3 (Python) | Click-to-segment inference |
| Training | YOLO11 (Ultralytics) | Object detection training |
| Database | SQLite | Project and label storage |
| Edge Runtime | Hailo SDK / NCNN | Optimized inference |

---

## Hailo-8L Deployment

### Hardware Requirements

| Component | Requirement |
|-----------|-------------|
| Board | Raspberry Pi 5 (8GB recommended) |
| Accelerator | Hailo-8L AI Kit (M.2 HAT) |
| Camera | USB webcam or Pi Camera |
| Software | HailoRT 4.20+, Raspberry Pi OS |

### Model Conversion

1. Export your trained model (ONNX format auto-generated)
2. Use Hailo Docker SDK to compile:
   ```bash
   hailomz compile yolov11n \
       --ckpt best.onnx \
       --hw-arch hailo8l \
       --calib-path calibration_images/ \
       --classes <num_classes>
   ```
3. Deploy HEF file to Raspberry Pi 5

### Performance

| Backend | FPS | Latency | Hardware |
|---------|-----|---------|----------|
| PyTorch (CPU) | ~2 | 400ms | RPi5 CPU |
| NCNN | ~10 | 94ms | RPi5 CPU |
| **Hailo-8L** | **30+** | **17ms** | RPi5 + Hailo |

See [docs/HAILO_CONVERSION.md](docs/HAILO_CONVERSION.md) for the complete guide.

---

## Model Export Formats

| Format | File | Size | Use Case | Performance |
|--------|------|------|----------|-------------|
| PyTorch | `.pt` | ~5MB | Fine-tuning, development | GPU dependent |
| ONNX | `.onnx` | ~11MB | Universal, conversion base | Framework agnostic |
| NCNN | folder | ~5MB | ARM/CPU deployment | ~10 FPS on RPi5 |
| HEF | `.hef` | ~12MB | Hailo accelerator | **30+ FPS on RPi5** |

---

## Project Structure

```
edgelabel/
├── backend/
│   ├── server.js           # Express server
│   ├── sam3_service.py     # SAM3 Python wrapper
│   ├── training.js         # YOLO training manager
│   ├── train_yolo.py       # Training executor
│   └── datasets/           # Project data storage
├── frontend/
│   └── src/
│       ├── components/     # React UI components
│       └── api/            # Backend API client
├── scripts/
│   ├── hailo_camera.py     # Live Hailo inference
│   └── rpi5_inference.py   # Multi-backend inference
├── models/                 # Pre-trained models
└── docs/                   # Documentation
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [QUICKSTART.md](docs/QUICKSTART.md) | Detailed setup guide |
| [WEB_APP_README.md](docs/WEB_APP_README.md) | Full UI documentation |
| [HAILO_CONVERSION.md](docs/HAILO_CONVERSION.md) | Hailo deployment guide |
| [CLAUDE.md](CLAUDE.md) | Developer/architecture guide |

---

## Tech Stack

- **[SAM3](https://github.com/facebookresearch/sam3)** - Meta's Segment Anything Model 3
- **[YOLO11](https://docs.ultralytics.com/)** - Ultralytics object detection
- **[Hailo SDK](https://hailo.ai/)** - Edge AI acceleration
- **[React](https://react.dev/)** + **[Express](https://expressjs.com/)** - Web framework
- **[SQLite](https://sqlite.org/)** - Embedded database

---

## License

This project uses SAM3 which is licensed under the [SAM License](https://github.com/facebookresearch/sam3/blob/main/LICENSE). YOLO11 is licensed under AGPL-3.0.

---

## Acknowledgements

- Meta AI for SAM3
- Ultralytics for YOLO11
- Hailo for edge AI acceleration SDK
