# YOLO Export Plan (SAM3 Dataset Labeling)

## Goal
Replace the current crop-only ZIP export with a YOLOv8-friendly export that packages full images with normalized bounding boxes and class IDs.

## Current State
- We store **crops** with label, bbox, mask stats in SQLite and export ZIPs as `train/{label}/crop.png` + `metadata.json`.
- Uploads are temporary (`backend/uploads/`) and cleaned on shutdown; originals are not persisted per project.
- No YOLO label files (`.txt`) or `data.yaml` are produced.

## Gaps to Close
- Originals not persisted: YOLO needs the original image per bounding box (or at least a stable image per set of boxes).
- Missing image dimensions in DB, so bbox normalization isn’t possible today.
- No stable class→ID map and no YOLO `labels/*.txt` generation.
- Splitting should be image-aware (avoid putting different crops from the same image into different splits).

## Plan
1) **Persist Originals Per Project**
   - On upload (or first crop save), copy the original image into `backend/datasets/{projectId}/images/{filename}`.
   - Store the persisted path in crops metadata to survive upload cleanup.

2) **Enrich Crop Metadata**
   - Add `source_width` and `source_height` columns (or store in JSON) so we can normalize boxes.
   - Ensure `bbox` remains `[x, y, w, h]` in original pixel space.

3) **Stable Class Mapping**
   - Use the `labels` table to derive ordered classes.
   - Define class IDs by sorted label list; persist this order into export metadata for reproducibility.

4) **Image-Aware Splitting**
   - Group crops by `source_image` and split at the image level so all boxes for one image stay in the same split.
   - Reuse existing split ratios; fall back to current stratified logic if only crops exist without shared images.

5) **YOLO Export Pipeline (only option)**
   - Directory layout:  
     - `train/images/*.jpg|png`, `train/labels/*.txt`  
     - `val/images`, `val/labels`  
     - `test/images`, `test/labels`
   - For each image in a split:
     - Copy original image.
     - Write one label file with `class_id cx cy w h` per box (normalized 0–1 using `source_width/height`).
   - Emit `data.yaml` with `train`, `val`, `test` paths and `names` array in class-ID order.
   - Optionally keep `metadata.json` for traceability (but primary contract is YOLO format).

6) **API Surface**
   - Simplify `POST /api/projects/:id/export/zip` to produce YOLO exports by default; drop the crop-only format.
   - Response should include format (`yolo`), class mapping, and paths.

7) **Frontend UX**
   - In export UI, present a single “YOLO detection” export (no alternate crop export). Add helper text that this uses full images + boxes.

8) **Testing & Validation**
   - Unit test export: generate small project with two images, multiple labels; assert file layout, label text contents, and `data.yaml` correctness.
   - Manual sanity: run `yolo detect train data=data.yaml` dry-run to confirm parser acceptance (no network).
