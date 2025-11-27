# SAM3 Dataset Labeling – Agent Playbook

## Course Correction (Read First)
- Do **not** train or run inference in Roboflow. Our job is to **use SAM3 locally to capture segmentations, classify/label the crops, and export ZIP datasets** for future training elsewhere.
- Keep the pipeline focused on: upload → segment with SAM3 → pick mask → save labeled crop → export ZIP (train/val/test splits + metadata). Anything about Roboflow APIs or training jobs is out of scope for now.

## System Overview
- **Python SAM3 service**: `backend/sam3_service.py` loads the SAM3 image model with interactive mode (`build_sam3_image_model(enable_inst_interactivity=True)`), runs on GPU 1, and exposes JSON commands over stdin/stdout (`load_image`, `predict_click`, `predict_text`, `crop_from_mask`, `clear_session`). Stores session masks for cropping.
- **Express backend**: `backend/server.js` bridges HTTP to the Python service. Routes:
  - Projects: `backend/routes/projects.js` (`POST /api/projects`, `GET/PUT/DELETE /api/projects/:id`, `POST /api/projects/:id/export/zip`).
  - Crops: `backend/routes/crops.js` (`POST /api/projects/:projectId/crops` to persist a crop + PNG via `crop_from_mask`; `GET /api/projects/:projectId/crops`; `GET/PUT/DELETE /api/crops/:cropId`).
  - Segmentation: `/api/upload`, `/api/segment/click`, `/api/segment/text`, `/api/session/:id`.
- **SQLite storage**: `backend/database.js` manages the main projects DB (`backend/datasets/projects.db`) plus per-project DBs (`backend/datasets/{projectId}/metadata.db`) and crop folders (`crops/`). Connection pooling + migrations live here.
- **Exports**: `backend/export.js` builds ZIPs with stratified splits and `metadata.json`; files land in `backend/exports/` and are served via `/api/downloads/{file}`.
- **Frontend**: React/Vite in `frontend/`. `src/App.tsx` wires workflow states (`upload → segment → label → gallery`) with components `ImageUpload`, `InteractiveCanvas`, `CropAndLabel`, `DatasetGallery`, and `ProjectManager`.

## How to Run (local, no Roboflow)
1) Backend: `cd backend && npm start` (uses `sam3_service.py` under the hood; requires SAM3 checkpoints + GPU).  
2) Frontend: `cd frontend && npm run dev` (default Vite port 5174).  
3) Flow to label: create/select project → upload image (`/api/upload`) → click-segment (`/api/segment/click`) → call `/api/projects/:projectId/crops` with `sessionId`, `maskIndex`, `label`, `backgroundMode` to save crop → export ZIP via `/api/projects/:id/export/zip`.

## Data Layout & Export Contract
- Projects live under `backend/datasets/{projectId}/` with `metadata.db` and `crops/` PNGs. Main project registry is `backend/datasets/projects.db`.
- Export ZIP structure: `train/{label}/file.png`, `val/...`, `test/...`, plus `metadata.json` summarizing samples, splits, labels, bbox, mask stats, and source image info.
- Download URL returned as `/api/downloads/<zipname>`; the physical file is in `backend/exports/`.

## Working Notes & Priorities
- Core DB + export plumbing is in place; SAM3 click segmentation and crop generation already work through the Python service.
- Stay focused on labeling UX and reliable crop saving/export—no Roboflow uploads or training triggers.
- When extending, keep background modes (`transparent|white|black|original`) intact, and respect split validation (ratios must sum to ~1.0).
- If you need data for tests, use local sample images (`test_image.jpg`) and avoid any network-bound dependencies unless explicitly cleared.
