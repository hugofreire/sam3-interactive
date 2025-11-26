# YOLO Model Performance Issue Analysis

**Date**: 2025-11-26
**Model**: YOLO11n trained on coffee bean dataset
**Issue**: Poor generalization to new data despite good validation metrics

---

## Problem Summary

### Training Metrics (Validation Set)
- mAP50: 73.58%
- mAP50-95: 40.68%
- Dataset: 36 images, 1,038 bboxes (257 original + 781 synthetic)

### Real-World Performance
- **Expected**: Detect 5 individual coffee beans (3 roasted, 2 green)
- **Actual**: One large bounding box encompassing all beans
- **Confidence**: 53% (low)
- **Classification**: Misclassified as "green"

---

## Root Cause Analysis

### Domain Shift Between Training and Test Data

| Aspect | Training Data | Test Data | Impact |
|--------|---------------|-----------|--------|
| **Background** | Gray neutral | White plate + wood table | High |
| **Bean Spacing** | Well separated | Tightly clustered | **Critical** |
| **Context** | Isolated beans | Beans on dishware | Medium |
| **Lighting** | Studio lighting | Natural/ambient | Medium |
| **Bean Density** | ~30 beans scattered | 5 beans in tight cluster | **Critical** |

### Key Issue: Bean Clustering

The training data shows **individual, well-separated beans** with clear gaps between them. The test image shows **tightly clustered beans** where the model cannot distinguish individual instances.

**Why This Happens:**
1. YOLO learns to detect objects based on spatial separation
2. When objects are too close, it merges them into one detection
3. The model never saw tightly packed beans during training
4. Augmentations (rotate, flip, brightness) don't change spatial relationships

---

## Why Augmentation Didn't Solve This

The data augmentation we implemented includes:
- ✅ Horizontal flip
- ✅ Rotation (±15°, ±30°)
- ✅ Brightness/contrast
- ✅ Hue/saturation
- ✅ Scale (80-120%)
- ✅ Blur

**What's Missing:**
- ❌ Spatial relationship changes (clustering)
- ❌ Background variation (plates, tables, containers)
- ❌ Different bean densities
- ❌ Occlusion/overlapping beans

**The Result:** We multiplied the dataset 4x but **preserved the same spatial patterns**. The model learned to detect well-separated beans very accurately (73.58% mAP50) but fails when beans are clustered.

---

## Solutions

### Short-Term Fixes

#### 1. Collect More Representative Data
Add training images with:
- Beans in tight clusters (like test image)
- Beans on plates/bowls/cups
- Different backgrounds (wood, ceramic, metal)
- Various bean densities (sparse to dense)
- Overlapping beans

**Impact**: High
**Effort**: Medium (requires new labeling)

#### 2. Adjust Detection Threshold
Lower confidence threshold to 25-30% to catch more detections, then use NMS (Non-Maximum Suppression) to filter.

**Impact**: Low (doesn't fix root cause)
**Effort**: Low

#### 3. Use Mosaic Augmentation
YOLO's mosaic augmentation combines 4 images into one, creating new spatial relationships:

```python
# In train_yolo.py, add to training config:
mosaic=1.0,  # Enable mosaic augmentation
mixup=0.1,   # Mix two images together
copy_paste=0.3  # Copy-paste beans between images
```

**Impact**: High
**Effort**: Low (just config change)

---

### Medium-Term Improvements

#### 4. Switch to Instance Segmentation
Use YOLO11-seg (segmentation model) instead of detection:
- Handles overlapping objects better
- Provides pixel-perfect masks
- Better at separating clustered instances

**Impact**: High
**Effort**: Medium (requires mask annotations, not just bboxes)

#### 5. Add Context-Aware Augmentations
Implement custom augmentations that change spatial context:

```python
# backend/augment.py additions:
A.RandomCrop(height=512, width=512, p=0.3),  # Create tighter crops
A.CoarseDropout(max_holes=8, p=0.2),  # Simulate occlusion
# Programmatically cluster beans in augmentation
```

**Impact**: Medium
**Effort**: High (custom code)

#### 6. Multi-Scale Training
Train with varying image sizes to handle different bean densities:

```python
# In training config:
imgsz=(480, 640, 800)  # Train at multiple scales
```

**Impact**: Medium
**Effort**: Low

---

### Long-Term Strategy

#### 7. Two-Stage Detection
1. **Stage 1**: Detect "bean cluster" regions
2. **Stage 2**: Segment individual beans within clusters

This is similar to Mask R-CNN architecture.

**Impact**: Very High
**Effort**: High (architectural change)

---

## Immediate Action Plan

### Step 1: Enable Mosaic Augmentation (5 minutes)

Edit `backend/train_yolo.py`:

```python
# Around line 90, in model.train() call:
results = model.train(
    data=data_yaml,
    epochs=epochs,
    imgsz=imgsz,
    batch=batch,
    device=device,
    workers=workers,
    project=output_dir,
    name=name,
    exist_ok=True,
    mosaic=1.0,        # ADD THIS
    mixup=0.1,         # ADD THIS
    copy_paste=0.3,    # ADD THIS
    plots=True,
    verbose=True
)
```

### Step 2: Retrain with Enhanced Augmentations

```bash
# Clear existing model
curl -X DELETE "http://localhost:3001/api/projects/{projectId}/augmentation/clear"

# Regenerate with same data
curl -X POST "http://localhost:3001/api/projects/{projectId}/augmentation/generate" \
  -H "Content-Type: application/json" \
  -d '{"augmentations": ["flip_h", "rotate_15", "rotate_30", "brightness", "contrast", "scale"], "variationsPerImage": 3}'

# Train with new augmentations
curl -X POST "http://localhost:3001/api/projects/{projectId}/training/start" \
  -H "Content-Type: application/json" \
  -d '{"epochs": 100, "batchSize": 16, "imgSize": 640}'
```

### Step 3: Test on Same Image

Expected improvement: 1-2 individual bean detections instead of one large box.

---

## Step 4: Collect Better Training Data (Recommended)

Take 10-15 new images with:
1. Beans on **white plates** (matches test scenario)
2. Beans in **tight clusters** (2-5 beans touching)
3. Beans on **wooden tables** (background variation)
4. Mix of **roasted and green** in same image
5. Different **lighting conditions** (window light, overhead, shadow)

Label these with SAM3, add to dataset, retrain.

**Expected Result**: mAP50 may drop slightly (60-65%) but **real-world performance will improve dramatically**.

---

## Key Insight

**High validation metrics don't guarantee real-world performance.**

Our model achieved 73.58% mAP50 because:
- Validation set has same distribution as training set
- Both show well-separated beans on gray backgrounds
- Augmentations preserved this pattern

But real-world data has:
- Different backgrounds
- Different spatial arrangements
- Different contexts

**Solution**: Validation set must represent real-world scenarios, not just be a random split of training data.

---

## Recommended Next Steps

1. ✅ **Immediate**: Enable mosaic/mixup/copy-paste augmentations (5 min)
2. ✅ **Short-term**: Retrain with enhanced augmentations (2 hours)
3. ⏳ **Medium-term**: Collect 10-15 images with clustered beans on plates (1 day)
4. ⏳ **Long-term**: Consider YOLO11-seg for instance segmentation

---

## Expected Improvements

| Action | Expected mAP50 | Real-World Performance |
|--------|----------------|------------------------|
| Current | 73.58% | Poor (1 merged detection) |
| + Mosaic/Mixup | 65-70% | Better (2-3 individual beans) |
| + Real clustered data | 55-65% | Good (4-5 individual beans) |
| + Instance segmentation | 70-80% | Excellent (5 beans + masks) |

**Note**: Lower validation metrics with better real-world performance is preferable to high validation metrics with poor generalization.

---

*Analysis by Claude Code*
*Based on YOLO11n training run 2025-11-25*
