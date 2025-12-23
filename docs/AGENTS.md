# EdgeLabel – Agent Playbook

> **Last Updated**: 2025-12-23

## Project Overview

EdgeLabel is a complete **Label → Train → Deploy** pipeline for creating custom object detection models:

1. **Label**: Click-to-segment with SAM3 (848M parameters) for instant mask generation
2. **Train**: YOLO11-nano training with real-time metrics and auto-export
3. **Deploy**: Hailo-8L acceleration for 30+ FPS on Raspberry Pi 5

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   LABEL     │ ──▶  │    TRAIN    │ ──▶  │   DEPLOY    │
│ SAM3 click  │      │ YOLO11-nano │      │ Hailo-8L    │
│ segmentation│      │ Real-time   │      │ 30+ FPS     │
└─────────────┘      └─────────────┘      └─────────────┘
```

---

## System Architecture

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

### Component Details

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | React 18 + TypeScript + Vite | Interactive labeling UI |
| Backend | Express.js (Node.js) | REST API, file management |
| Segmentation | SAM3 (Python, 848M params) | Click-to-segment inference |
| Training | YOLO11 (Ultralytics) | Object detection training |
| Database | SQLite | Project and label storage |
| Edge Runtime | Hailo SDK / NCNN | Optimized inference |

---

## How to Run

### Prerequisites
- Python 3.10+ with CUDA 12.1+ (`torch==2.5.1+cu121`)
- Node.js 18+
- GPU with 8GB+ VRAM (for SAM3)

### Start Services

**Terminal 1 - Backend:**
```bash
node backend/server.js
# Server running on http://127.0.0.1:4010
```

**Terminal 2 - Frontend:**
```bash
cd frontend && npm run dev
# Open http://localhost:5173
```

> **Note**: Ports are configurable via `config/.env` (backend) and `frontend/.env` (frontend).

---

## API Routes

### Python SAM3 Service (`backend/sam3_service.py`)

Communicates via stdin/stdout JSON. Commands:

| Command | Description |
|---------|-------------|
| `load_image` | Load image into session, cache inference state |
| `predict_click` | Point-based segmentation (fg/bg points) |
| `predict_text` | Text-prompted segmentation |
| `crop_from_mask` | Extract crop from selected mask |
| `clear_session` | Free session memory |

### Express Routes

**Segmentation** (`backend/server.js`):
- `POST /api/upload` - Upload image, create session
- `POST /api/segment/click` - Click segmentation
- `POST /api/segment/text` - Text segmentation
- `DELETE /api/session/:id` - Clear session

**Projects** (`backend/routes/projects.js`):
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create project
- `GET /api/projects/:id` - Get project details
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project
- `POST /api/projects/:id/export/zip` - Export YOLO dataset ZIP

**Crops** (`backend/routes/crops.js`):
- `POST /api/projects/:projectId/crops` - Save crop with label
- `GET /api/projects/:projectId/crops` - List project crops
- `GET /api/crops/:cropId` - Get crop details
- `PUT /api/crops/:cropId` - Update crop label
- `DELETE /api/crops/:cropId` - Delete crop

**Training** (`backend/routes/training.js`):
- `POST /api/projects/:projectId/training/start` - Start YOLO11 training
- `GET /api/projects/:projectId/training/status` - Get training progress
- `POST /api/projects/:projectId/training/stop` - Stop training
- `GET /api/projects/:projectId/training/logs` - Get training logs
- `GET /api/projects/:projectId/models` - List trained models
- `POST /api/projects/:projectId/inference` - Run inference (upload)
- `POST /api/projects/:projectId/inference/url` - Run inference (path)

**Augmentation** (`backend/routes/augmentation.js`):
- `POST /api/projects/:projectId/augment` - Generate augmented crops
- `GET /api/projects/:projectId/augment/status` - Augmentation status

---

## Data Layout

```
backend/datasets/
├── projects.db                    # Global project registry
└── {projectId}/
    ├── metadata.db                # Per-project crops/labels DB
    ├── crops/                     # Crop PNG files (for UI gallery)
    └── images/                    # Persisted original images (for YOLO export)

backend/uploads/                   # Temporary upload storage (auto-cleaned)
backend/exports/                   # Generated ZIP files (7-day retention)
```

### Database Schema

**Main DB** (`projects.db`):
```sql
projects (id, name, description, created_at, updated_at)
```

**Project DB** (`{projectId}/metadata.db`):
```sql
labels (id, name, color, created_at)
crops (id, label_id, image_path, bbox, source_width, source_height,
       persisted_image_path, mask_area, confidence, background_mode, created_at)
undo_history (id, action_type, crop_id, crop_data, created_at)
```

---

## Export Format: YOLO11

The export produces **YOLO11 detection format**, not classification folders.

### ZIP Structure
```
{project}_yolo_{date}_{timestamp}.zip
├── images/
│   ├── train/          # Training images (70%)
│   ├── val/            # Validation images (20%)
│   └── test/           # Test images (10%)
├── labels/
│   ├── train/          # YOLO annotation files
│   ├── val/
│   └── test/
├── data.yaml           # YOLO dataset config
└── metadata.json       # Export statistics
```

### YOLO Annotation Format
Each `.txt` file contains one line per object:
```
class_id center_x center_y width height
```
All values normalized to 0-1. Example:
```
0 0.5234 0.4521 0.1234 0.0891
1 0.7812 0.3245 0.0987 0.1123
```

### data.yaml
```yaml
train: images/train
val: images/val
test: images/test
nc: 2
names: ['class_a', 'class_b']
```

---

## Training Pipeline

### Configuration
Training uses YOLO11-nano by default (~2.6M parameters). Configurable via:
- `TRAIN_DEVICE` - GPU device ID
- `TRAIN_EPOCHS` - Training epochs (default: 100)
- `TRAIN_BATCH` - Batch size (default: 8)
- `TRAIN_IMGSZ` - Image size (default: 640)

### Output Formats
Training automatically exports to multiple formats:
| Format | File | Use Case |
|--------|------|----------|
| PyTorch | `best.pt` | Fine-tuning, development |
| ONNX | `best.onnx` | Universal, conversion base |
| NCNN | `best_ncnn_model/` | ARM/CPU deployment |

### Real-Time Metrics
Training UI shows live:
- Epoch progress
- Loss curves (box, class, dfl)
- Validation mAP50 and mAP50-95
- Model quality score with emoji indicators

---

## Edge Deployment

### Hailo-8L (Recommended)
For Raspberry Pi 5 with Hailo-8L AI accelerator:

1. Export ONNX from training
2. Convert to HEF using Hailo Docker SDK:
   ```bash
   hailomz compile yolov11n --ckpt best.onnx --hw-arch hailo8l
   ```
3. Deploy with `scripts/hailo_camera.py`

**Performance**: 30+ FPS, 17ms latency

### NCNN (CPU Fallback)
For CPU-only deployment:
```bash
python scripts/rpi5_inference.py --backend ncnn
```

**Performance**: ~10 FPS, 94ms latency

See [HAILO_CONVERSION.md](HAILO_CONVERSION.md) for detailed guide.

---

## Labeling Workflow

1. **Create/Select Project** - Define class labels
2. **Upload Image** - `POST /api/upload` creates session
3. **Click Segment** - `POST /api/segment/click` returns 3 candidate masks
4. **Select Best Mask** - Choose by confidence score
5. **Save Crop** - `POST /api/projects/:id/crops` with:
   - `sessionId` - Active session
   - `maskIndex` - Selected mask (0-2)
   - `label` - Class label
   - `backgroundMode` - `transparent|white|black|original`
6. **Export Dataset** - `POST /api/projects/:id/export/zip`
7. **Train Model** - `POST /api/projects/:id/training/start`
8. **Deploy** - Convert to HEF or use NCNN

---

## Environment Configuration

### Backend (`config/.env`)
```bash
PORT=4010
HOST=127.0.0.1
DATA_ROOT=./backend/datasets
UPLOADS_DIR=./backend/uploads
EXPORTS_DIR=./backend/exports
SAM3_PYTHON=python3
SAM3_CUDA_VISIBLE_DEVICES=1
TRAIN_DEVICE=1
TRAIN_EPOCHS=100
TRAIN_BATCH=8
```

### Frontend (`frontend/.env`)
```bash
VITE_PORT=5173
VITE_API_URL=http://localhost:4010
```

---

## Bounding Box Convention

**IMPORTANT**: Throughout the codebase, bboxes are stored in **Pascal VOC format**:
```
[x_min, y_min, x_max, y_max]
```

YOLO export converts to normalized center format:
```javascript
// Pascal VOC → YOLO
const centerX = (x_min + (x_max - x_min) / 2) / imgWidth;
const centerY = (y_min + (y_max - y_min) / 2) / imgHeight;
const normWidth = (x_max - x_min) / imgWidth;
const normHeight = (y_max - y_min) / imgHeight;
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `backend/server.js` | Express server, SAM3 process management |
| `backend/sam3_service.py` | Python SAM3 wrapper, GPU inference |
| `backend/training.js` | YOLO11 training job lifecycle |
| `backend/export.js` | YOLO dataset ZIP generation |
| `backend/database.js` | SQLite connection pooling, migrations |
| `frontend/src/App.tsx` | Main React component, workflow states |
| `frontend/src/components/LabelingWorkspace.tsx` | Batch labeling UI |
| `frontend/src/components/TrainingPanel.tsx` | Training UI with metrics |

---

## Testing

### Quick Sanity Check
```bash
# Health check
curl http://localhost:4010/api/health

# Upload test image
curl -X POST http://localhost:4010/api/upload -F "image=@test_image.jpg"

# Segment (replace SESSION_ID)
curl -X POST http://localhost:4010/api/segment/click \
     -H "Content-Type: application/json" \
     -d '{"sessionId":"SESSION_ID","points":[[900,600]],"labels":[1]}'
```

### Full Pipeline Test
Use Chrome DevTools MCP or manual testing:
1. Upload `test_image.jpg`
2. Click on truck → verify 3 masks returned
3. Save crop with "truck" label
4. Export YOLO ZIP
5. Start training
6. Run inference on new image

---

## Related Documentation

| Document | Description |
|----------|-------------|
| [CLAUDE.md](../CLAUDE.md) | Developer guide, architecture deep dive |
| [QUICKSTART.md](QUICKSTART.md) | Setup and installation |
| [WEB_APP_README.md](WEB_APP_README.md) | Full UI documentation |
| [HAILO_CONVERSION.md](HAILO_CONVERSION.md) | Edge deployment guide |
