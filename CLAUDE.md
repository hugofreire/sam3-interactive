# CLAUDE.md - SAM3 Interactive Segmentation Project

> **Purpose**: Quick developer guide for working on the SAM3 interactive segmentation web app.

## ⚠️ Platform Check (Read First!)

**At the start of each coding session, check if running on Raspberry Pi:**

```bash
uname -m  # "aarch64" = Raspberry Pi, "x86_64" = standard PC
```

**If on Raspberry Pi (`aarch64`):**
- 📖 **Read [`docs/RASPBERRY_PI.md`](docs/RASPBERRY_PI.md)** for Pi-specific setup, workarounds, and common issues
- SAM3 runs remotely via `SAM3_REMOTE_URL=http://10.9.0.14:8000`
- Chrome DevTools MCP requires symlink: `/opt/google/chrome/chrome` → `/usr/bin/chromium`
- May need to create `frontend/src/lib/utils.ts` if missing

---

## Overview

Full-stack app for interactive image segmentation using Meta SAM3. Users upload images and segment by clicking; supports YOLO dataset export and training.

**Tech stack:**
- Backend: Express.js (Node) + Python SAM3 service
- Frontend: React 18 + TypeScript + Vite
- Model: SAM3 (848M params, GPU)
- IPC: REST (Express <-> React) + JSON stdin/stdout (Express <-> Python) or HTTP (Express <-> SAM3 HTTP Service)

**Current features:**
- Click-to-segment with multimask + confidence
- Iterative refinement (multi-point)
- Real-time overlay rendering
- YOLO export (YOLO11 detection format)
- YOLO11 training + inference
- Kiosk mode (touch UI for Raspberry Pi)
- Remote SAM3 inference (decoupled HTTP service)
- Text-based segmentation (backend stub exists)

---

## Service Architecture

### Option A: Local Mode (Single Machine)
```
┌─────────────────────────────────────────────────────────────┐
│                      Single Machine                          │
│                                                              │
│  Browser ──► Express (4010) ──► Python SAM3 ──► GPU         │
│    │              │            (stdin/stdout)                │
│    │              ▼                                          │
│    │          SQLite DB                                      │
│    ▼                                                         │
│  Frontend (5173/5174)                                        │
└─────────────────────────────────────────────────────────────┘
```

### Option B: Remote Mode (Decoupled - for Pi + GPU Server)
```
┌─────────────────────────┐         ┌─────────────────────────┐
│   Raspberry Pi / Client │   HTTP  │   GPU Server (10.9.0.14)│
│                         │         │                         │
│  Browser ──► Express    │────────►│  SAM3 HTTP Service     │
│    │         (4010)     │         │  (FastAPI :8000)        │
│    │           │        │         │         │               │
│    │           ▼        │         │         ▼               │
│    │       SQLite DB    │         │   SAM3 Model (GPU)      │
│    ▼                    │         │                         │
│  Frontend (5173)        │         │                         │
└─────────────────────────┘         └─────────────────────────┘

Env: SAM3_REMOTE_URL=http://10.9.0.14:8000
```

**GPU Server**: `10.9.0.14` (VPN) - dual RTX 3090, SAM3 on GPU 1

### Service Files
| Service | File | Port | Purpose |
|---------|------|------|---------|
| Express Backend | `backend/server.js` | 4010 | REST API, file upload, DB, session mgmt |
| SAM3 Local | `backend/sam3_service.py` | stdin/stdout | Local SAM3 inference (subprocess) |
| SAM3 HTTP | `backend/sam3_http_service.py` | 8000 | Remote SAM3 inference (FastAPI) |
| SAM3 Client | `backend/sam3_client.js` | - | HTTP client for remote SAM3 |
| Frontend | `frontend/` | 5173 | React UI |

---

## Project Map (high signal)

```
backend/
├── server.js              # Express server + SAM3 orchestration (local or remote)
├── sam3_service.py        # SAM3 model wrapper (persistent subprocess)
├── sam3_http_service.py   # SAM3 FastAPI service (standalone for GPU server)
├── sam3_client.js         # HTTP client for remote SAM3 service
├── export.js              # YOLO export
├── training.js            # YOLO11 training job management
├── train_yolo.py          # Python training/inference script
├── database.js            # SQLite data access
├── migrations/            # DB schema (001_initial, 002_yolo_support)
├── routes/                # API route handlers
├── uploads/               # Temp images (cleaned on shutdown)
├── exports/               # YOLO ZIPs (7-day retention)
└── datasets/              # Persistent project data
    ├── projects.db        # Project list
    └── {projectId}/
        ├── metadata.db    # Crops + labels
        ├── images/        # Original images for YOLO export
        └── crops/         # Crop PNGs for UI

frontend/src/
├── App.tsx                # Main UI
├── components/            # Upload + interactive canvas
├── kiosk/                 # Touch UI + wizard flow
│   ├── wizard/            # Step1Labels, Step2Images, Step3Labeling, Step4Training
│   └── components/        # TouchButton, SegmentCanvas
└── api/sam3.ts            # Backend API client

config/
├── .env.example           # All env vars documented
├── .env.pi                # Raspberry Pi config (SAM3_REMOTE_URL)
├── .env.server            # GPU server config
└── .env.gpu-server        # SAM3 HTTP service standalone config

scripts/
├── common/                # Both platforms
│   ├── start-chrome-mcp.sh    # Chrome DevTools MCP
│   └── stop-chrome-mcp.sh     # Stop Chrome + MCP
├── raspberry-pi/          # Pi-specific
│   ├── setup.sh               # Initial Pi setup (pipewire-v4l2, deps)
│   ├── hailo_check.sh         # Check Hailo AI Kit
│   └── rpi5_inference.py      # YOLO inference (NCNN/Hailo)
├── gpu-server/            # GPU server
│   ├── verify_setup.py        # Verify SAM3/PyTorch/CUDA
│   ├── sam3-http.service      # Systemd unit for SAM3 service
│   └── convert_to_hef.sh      # ONNX to Hailo HEF
└── eval/                  # Model evaluation & benchmarks
```

---

## Critical Conventions (do not break)

**BBox format everywhere**: Pascal VOC `[x_min, y_min, x_max, y_max]`
- Database stores Pascal VOC
- SAM3 returns Pascal VOC
- YOLO export converts to `[cx, cy, w, h]` (normalized)
- DB schema comment is WRONG (says `[x, y, w, h]`)

**Mask encoding**: Binary 0/255 PNG as base64
- Use `np.where(mask > 0.5, np.uint8(255), np.uint8(0))` for thresholding
- Must use `np.ascontiguousarray(mask, dtype=np.float32)` before threshold

**Sessions**: In-memory only; re-upload image on session loss

**Coordinate conversion**: Canvas scale must be applied: `imageX = canvasX / scale`

---

## YOLO Export (essentials)

- Format: `class_id cx cy w h` (normalized 0-1)
- Stable class IDs: alphabetical order
- Image-level train/val split (crops from same image stay together)
- Migration 002 required for `source_width`, `source_height`, `persisted_image_path`
- Old crops (pre-migration) cannot export

---

## YOLO11 Training (essentials)

- Pipeline: export dataset → spawn Python → stream JSON logs → output PT/ONNX/NCNN
- API: `/api/projects/:id/training/*` and `/api/projects/:id/inference*`
- Default GPU via `CUDA_VISIBLE_DEVICES`

---

## Kiosk Mode (essentials)

- Route: `/kiosk`
- Image status flow: `pending → in_progress → completed`
- Step3Labeling is core: multi-mask selection, label assignment, crop save with metadata

---

## Environment Config

**Backend**: `HOST`, `PORT`, `DATA_ROOT`, `UPLOADS_DIR`, `EXPORTS_DIR`, `SAM3_PYTHON`, `SAM3_DEVICE`, `SAM3_CUDA_VISIBLE_DEVICES`, `SAM3_REMOTE_URL`

**SAM3 HTTP Service**: `SAM3_HTTP_HOST`, `SAM3_HTTP_PORT`

**Frontend**: `VITE_PROXY_TARGET`, `VITE_PORT`

---

## Quick Dev Loop

```bash
# Local mode (SAM3 on same machine)
node backend/server.js
cd frontend && npm run dev

# Remote mode (SAM3 on GPU server 10.9.0.14)
# On GPU server (10.9.0.14):
CUDA_VISIBLE_DEVICES=1 python -m uvicorn sam3_http_service:app --host 0.0.0.0 --port 8000

# On Pi/client:
SAM3_REMOTE_URL=http://10.9.0.14:8000 node backend/server.js
cd frontend && npm run dev
```

**Health checks:**
- Express: `GET http://localhost:4010/api/health`
- SAM3 HTTP: `GET http://localhost:8000/health`

---

## Known Issues & Fixes

- **Radix dialog scroll lock** blocks file input: CSS override in `frontend/src/index.css`
- **Multer extensions**: Use `diskStorage` with filename preserving extension
- **Mask grayscale bug**: Fixed by using `np.where()` + `np.ascontiguousarray()` instead of `(mask * 255).astype()`

---

## Debugging Checklist

```bash
# Backend logs
# Express stdout + SAM3 stderr (prefixed "SAM3:")

# Test Python service directly
python backend/test_service.py

# Test SAM3 HTTP service
curl http://localhost:8000/health

# Validate Vite proxy
curl http://localhost:5173/api/health

# GPU status
nvidia-smi
```

---

## API Quick Reference

**Express Backend (port 4010)**
```
POST /api/upload              # Upload image → sessionId
POST /api/segment/click       # Click segmentation
POST /api/segment/text        # Text segmentation
DELETE /api/session/:id       # Clear session
GET /api/health               # Health check (includes sam3Remote flag)
```

**SAM3 HTTP Service (port 8000)**
```
GET  /health                              # Service status
POST /sessions                            # Create session (multipart image)
GET  /sessions/{id}                       # Session info
DELETE /sessions/{id}                     # Clear session
POST /sessions/{id}/predict/click         # Click segmentation
POST /sessions/{id}/predict/text          # Text segmentation
POST /sessions/{id}/crop                  # Extract crop from mask
```

---

## Systemd Deployment (GPU Server)

```bash
# Install SAM3 HTTP service
sudo cp scripts/gpu-server/sam3-http.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable sam3-http
sudo systemctl start sam3-http

# Check status
sudo systemctl status sam3-http
journalctl -u sam3-http -f
```

---

## References

- `docs/RASPBERRY_PI.md` - **Pi-specific setup & troubleshooting**
- `docs/WEB_APP_README.md` - User-facing docs
- `docs/QUICKSTART.md` - Setup guide
- `docs/WEB_APP_PLAN.md` - Original plan
- `docs/SAM3_HTTP_SERVICE_PLAN.md` - Decoupling architecture
- `docs/README_TRAIN.md` - SAM3 training

---

## Recent Verified State

- 2025-12-30: SAM3 HTTP service decoupling complete
- 2025-12-30: Mask grayscale bug fixed (binary 0/255 now correct)
- 2025-12-19: End-to-end flow verified (upload → segment → save crop)
- Torch/CUDA matched to 12.1
- GPU 1 used (GPU 0 occupied by VLLM)
- Backend http://127.0.0.1:4010, Frontend http://localhost:5173

*Last updated: 2025-12-30*
