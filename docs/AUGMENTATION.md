# Data Augmentation Feature

> **Purpose**: Generate synthetic training data to improve YOLO model accuracy by increasing dataset diversity.

---

## Overview

The data augmentation feature allows you to expand your labeled dataset by generating synthetic variations of your source images. This is particularly useful when you have limited training data, as YOLO models benefit significantly from dataset diversity.

### The Problem

With a small dataset (e.g., 4 images, 166 bounding boxes), YOLO models often achieve poor accuracy (23-30%) due to:
- Overfitting to the limited training examples
- Lack of variation in lighting, orientation, and scale
- Model not learning generalizable features

### The Solution

Data augmentation creates synthetic training samples by applying transformations to your original images while automatically adjusting bounding box coordinates. This effectively multiplies your dataset size without requiring additional manual labeling.

---

## Available Augmentations

| Augmentation | Description | Impact on Detection |
|--------------|-------------|---------------------|
| **Horizontal Flip** | Mirror image left-to-right | Helps model recognize objects from different orientations |
| **Rotation (±15°, ±30°)** | Rotate image with bbox transformation | Improves robustness to camera angles |
| **Brightness** | Adjust image brightness (±20%) | Better performance in different lighting conditions |
| **Contrast** | Modify image contrast | Helps with varying image quality |
| **Hue/Saturation** | Shift color values | More robust to color variations |
| **Blur** | Apply Gaussian blur | Handles motion blur and focus issues |
| **Scale** | Resize with zoom (80-120%) | Better multi-scale detection |

### Augmentation Strategy

The system uses a smart selection algorithm:
1. **Always includes** at least one geometric transform (flip/rotate/scale)
2. **Randomly adds** color adjustments (70% probability)
3. **Occasionally adds** blur (30% probability)
4. Each generated image gets a **unique combination** of augmentations

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│  AugmentationPanel.tsx → DatasetGallery.tsx                 │
└─────────────────────┬───────────────────────────────────────┘
                      │ REST API
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                Express.js Backend                            │
│  routes/augmentation.js → database.js                       │
└─────────────────────┬───────────────────────────────────────┘
                      │ spawn()
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   Python (augment.py)                        │
│  albumentations library → bbox-aware transforms             │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

| File | Purpose |
|------|---------|
| `frontend/src/components/AugmentationPanel.tsx` | UI for configuring and triggering augmentation |
| `frontend/src/api/augmentation.ts` | API client for augmentation endpoints |
| `backend/routes/augmentation.js` | REST API endpoints |
| `backend/augment.py` | Python script using albumentations |
| `backend/migrations/004_augmentation.sql` | Database schema for tracking synthetic data |

---

## API Endpoints

### Get Augmentation Stats
```
GET /api/projects/:projectId/augmentation/stats
```
Returns current dataset statistics:
```json
{
  "success": true,
  "stats": {
    "sourceImages": 9,
    "originalBboxes": 257,
    "enhancedImages": 27,
    "syntheticBboxes": 771
  }
}
```

### Get Source Images
```
GET /api/projects/:projectId/augmentation/sources
```
Returns original images available for augmentation.

### Preview Augmentation
```
POST /api/projects/:projectId/augmentation/preview
```
Preview augmentation on a single image before generating.

### Generate Augmentations
```
POST /api/projects/:projectId/augmentation/generate
```
Request body:
```json
{
  "augmentations": ["flip_h", "rotate_15", "brightness", "hue_saturation"],
  "variationsPerImage": 3,
  "intensity": 1.0
}
```

### Clear Synthetic Data
```
DELETE /api/projects/:projectId/augmentation/clear
```
Removes all generated synthetic images and bboxes.

---

## Database Schema

### Enhanced Images Table
```sql
CREATE TABLE enhanced_images (
    id TEXT PRIMARY KEY,
    source_image_path TEXT NOT NULL,
    enhanced_image_path TEXT NOT NULL,
    augmentation_type TEXT NOT NULL,  -- e.g., "rotate_30_flip_h_brightness"
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
```

### Crops Table Extensions
```sql
-- Added to crops table
is_synthetic INTEGER DEFAULT 0,  -- 1 if generated via augmentation
enhanced_image_id TEXT           -- Reference to enhanced_images.id
```

---

## Usage Guide

### Step 1: Open Augmentation Panel
1. Navigate to your project's **View Dataset** section
2. Click the purple **"Enhance Dataset"** button

### Step 2: Configure Augmentations
1. Select desired augmentation types (checkboxes)
2. Set **variations per image** (1x to 5x multiplier)
3. Adjust **intensity** slider (0.5 = subtle, 1.5 = aggressive)

### Step 3: Preview (Optional)
Click "Preview" on any source image to see a sample augmentation before committing.

### Step 4: Generate
Click **"Generate All"** to create synthetic variations for all source images.

### Step 5: Review
- Synthetic crops appear with a purple **"Synthetic"** badge
- Header shows count: "(X original + Y synthetic)"
- Export includes both original and synthetic data

---

## Expected Results

### Dataset Multiplication

| Original Dataset | Variations | Resulting Dataset |
|------------------|------------|-------------------|
| 4 images, 166 bboxes | 3x | ~12 images, ~498 bboxes |
| 9 images, 257 bboxes | 3x | ~27 images, ~771 bboxes |
| 20 images, 500 bboxes | 5x | ~100 images, ~2500 bboxes |

### Model Accuracy Impact

Based on typical YOLO training scenarios:

| Dataset Size | Expected mAP50 |
|--------------|----------------|
| <200 bboxes | 20-35% |
| 200-500 bboxes | 35-55% |
| 500-1000 bboxes | 55-70% |
| 1000+ bboxes | 70-85%+ |

**Note**: Actual results depend on:
- Image quality and diversity
- Class distribution balance
- Object size consistency
- Training hyperparameters

---

## Best Practices

### Do's
- Start with **geometric augmentations** (flip, rotate) - most impactful
- Use **3x variations** as a good starting point
- **Keep intensity moderate** (0.8-1.2) for realistic images
- **Balance classes** - augment underrepresented classes more

### Don'ts
- Don't over-augment (>5x can lead to overfitting on synthetic patterns)
- Don't use excessive blur (makes objects unrecognizable)
- Don't generate before having at least 3-5 original images per class

---

## Troubleshooting

### "No source images found"
- Ensure you have persisted images (crops with `persisted_image_path`)
- Check that crops were created after migration 002

### "Augmentation failed"
- Verify `albumentations` is installed: `pip install albumentations`
- Check Python path and permissions

### Synthetic crops not appearing
- Refresh the dataset view
- Check browser console for API errors
- Verify `is_synthetic` column exists in database

---

## Actual Test Results (2025-11-25)

### Test Configuration
- **Model**: YOLO11n (nano)
- **Epochs**: 100
- **Image Size**: 640px
- **Batch Size**: 8
- **GPU**: RTX (CUDA device 1)

### Baseline: Original Dataset Only

| Metric | Value |
|--------|-------|
| **Images** | 9 |
| **Bounding Boxes** | 257 |
| **mAP50** | 43.86% |
| **mAP50-95** | 19.49% |

### Enhanced: With 3x Augmentation

| Metric | Value |
|--------|-------|
| **Images** | 36 (9 original + 27 synthetic) |
| **Bounding Boxes** | 1,038 (257 original + 781 synthetic) |
| **mAP50** | **73.58%** |
| **mAP50-95** | **40.68%** |

### Improvement Summary

| Metric | Baseline | Enhanced | Improvement |
|--------|----------|----------|-------------|
| mAP50 | 43.86% | 73.58% | **+67.8%** |
| mAP50-95 | 19.49% | 40.68% | **+108.7%** |
| Dataset Size | 257 bbox | 1,038 bbox | **4x larger** |

### Key Takeaways

1. **Data augmentation dramatically improves model accuracy** - nearly 30 percentage points gain in mAP50
2. **4x dataset expansion** from 3 variations per image
3. **More than 2x improvement in mAP50-95** (stricter metric)
4. **Training time increased proportionally** but results justify the cost
5. **Augmentation types used**: flip_h, rotate_15, rotate_30, brightness, contrast, hue_saturation, scale

### Emoji Rating Change

| Before | After |
|--------|-------|
| 😐 (43.86% - "Getting there") | 😄 (73.58% - "Great model!") |

---

## Implementation Details

### Bounding Box Transformation

**CRITICAL**: All bboxes in the system use **Pascal VOC format**: `[x_min, y_min, x_max, y_max]`

The augmentation uses `albumentations` with Pascal VOC format:

```python
transform = A.Compose([
    A.HorizontalFlip(p=1.0),
    A.Rotate(limit=30, p=1.0),
    # ... other transforms
], bbox_params=A.BboxParams(
    format='pascal_voc',  # IMPORTANT: Must match database format
    label_fields=['labels'],
    min_visibility=0.3  # Keep bbox if >30% visible after transform
))
```

**Format Flow:**
1. Database stores: `[x_min, y_min, x_max, y_max]` (Pascal VOC)
2. `augment.py` receives: `[x_min, y_min, x_max, y_max]`
3. Albumentations transforms: Pascal VOC → Pascal VOC
4. `augment.py` returns: `[x_min, y_min, x_max, y_max]` (unchanged format)
5. Database saves: `[x_min, y_min, x_max, y_max]`

**DO NOT** convert to `[x, y, w, h]` format - this will break YOLO export!

### Example Transformation
```
Original bbox: [670, 205, 829, 291] (image width: 1024)
Width: 829 - 670 = 159px (15.5%)
Height: 291 - 205 = 86px (8.4%)

After horizontal flip: [195, 205, 354, 291]
Width: 354 - 195 = 159px (15.5%) - preserved!
Height: 291 - 205 = 86px (8.4%) - preserved!
# x_new = image_width - x_old
```

---

## Files Modified in Implementation

| File | Changes |
|------|---------|
| `backend/migrations/004_augmentation.sql` | New schema for enhanced_images |
| `backend/database.js` | Added `addColumnIfNotExists` helper |
| `backend/routes/augmentation.js` | Full augmentation API |
| `backend/augment.py` | Python augmentation engine |
| `frontend/src/api/augmentation.ts` | TypeScript API client |
| `frontend/src/components/AugmentationPanel.tsx` | React UI component |
| `frontend/src/components/DatasetGallery.tsx` | Integration + badges |
| `frontend/src/types/index.ts` | Added `is_synthetic`, `enhanced_image_id` |

---

*Last updated: 2025-11-25*
