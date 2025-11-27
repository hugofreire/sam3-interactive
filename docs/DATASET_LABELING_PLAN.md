# SAM3 Dataset Labeling System - Implementation Plan

## 🎯 Project Overview

**Goal**: Transform the SAM3 web app into a complete dataset creation pipeline for training classification models.

**Workflow**:
```
Upload Image → Segment Objects (SAM3) → Crop Objects → Label → Build Dataset → Export to Roboflow → Train Classifier
```

**Key Benefit**: 6x faster dataset creation vs manual labeling (5-10 seconds per sample vs 30-60 seconds)

---

## 📋 Implementation Scope

### Phase 1: Core Features (This Plan)
- ✅ Crop extraction from SAM3 masks
- ✅ Label assignment UI
- ✅ Project management (save/load/switch)
- ✅ Backend storage (filesystem + SQLite)
- ✅ Keyboard shortcuts
- ✅ Basic export (ZIP format)

### Future Phases (Not Included)
- ⏳ Advanced dataset management UI (grid view, statistics)
- ⏳ Roboflow API integration
- ⏳ Dataset validation & quality checks
- ⏳ Text-prompt batch segmentation
- ⏳ Batch operations (multi-select, bulk label)

---

## 🏗️ Architecture Decisions

### 1. Storage Strategy
**Decision**: Backend file system + SQLite metadata

**Structure**:
```
backend/
├── datasets/               # Root datasets directory
│   ├── project_uuid_1/    # Each project has own directory
│   │   ├── crops/         # Cropped images
│   │   │   ├── crop_001.png
│   │   │   ├── crop_002.png
│   │   │   └── ...
│   │   └── metadata.db    # SQLite database
│   └── project_uuid_2/
│       ├── crops/
│       └── metadata.db
└── uploads/               # Temporary image uploads (existing)
```

**Why this approach**:
- ✅ Persistent across sessions
- ✅ No external dependencies (no PostgreSQL, MongoDB)
- ✅ Easy backup (just copy directory)
- ✅ Fast queries with SQLite
- ✅ Isolated projects (one DB per project)

### 2. Background Mode
**Decision**: Configurable (transparent/white/black/original)

**Modes**:
- `transparent`: RGBA PNG with alpha channel from mask (best for visualization)
- `white`: Object on white background (common for ML training)
- `black`: Object on black background
- `original`: Keep original image context (no masking applied)

**Default**: `transparent` (most versatile)

### 3. Export Formats
**Decision**: Support both ZIP download and Roboflow API (Phase 1: ZIP only)

**Phase 1 Export**:
- ZIP file in Roboflow-compatible folder structure
- Metadata JSON with source info
- Train/Val/Test split (configurable ratios)

**Future** (Phase 2):
- Direct Roboflow API upload
- COCO JSON format
- YOLO format (for object detection datasets)

---

## 🗄️ Database Schema

### SQLite Tables

#### Table: `projects`
```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY,                    -- UUID
    name TEXT NOT NULL,                     -- User-defined project name
    description TEXT,                       -- Optional description
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    settings JSON                           -- Project settings (bg_mode, export_format, etc.)
);
```

#### Table: `crops`
```sql
CREATE TABLE crops (
    id TEXT PRIMARY KEY,                    -- UUID
    project_id TEXT NOT NULL,               -- Foreign key to projects
    label TEXT NOT NULL,                    -- Class label (e.g., "car", "person")
    filename TEXT NOT NULL,                 -- crop_001.png
    file_path TEXT NOT NULL,                -- datasets/project_id/crops/crop_001.png

    -- Source information
    source_image TEXT NOT NULL,             -- Original image filename
    source_session_id TEXT,                 -- SAM3 session ID (if available)

    -- Segmentation metadata
    bbox JSON NOT NULL,                     -- [x, y, width, height] in original image
    mask_score REAL,                        -- SAM3 confidence score
    mask_area INTEGER,                      -- Pixel count of mask
    background_mode TEXT DEFAULT 'transparent',  -- transparent|white|black|original

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_crops_project ON crops(project_id);
CREATE INDEX idx_crops_label ON crops(label);
CREATE INDEX idx_crops_created ON crops(created_at);
```

#### Table: `labels`
```sql
-- Tracks all unique labels in a project
CREATE TABLE labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    label TEXT NOT NULL,
    count INTEGER DEFAULT 0,                -- Number of crops with this label
    color TEXT,                             -- Hex color for UI visualization
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(project_id, label),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_labels_project ON labels(project_id);
```

#### Table: `export_history`
```sql
CREATE TABLE export_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    export_type TEXT NOT NULL,              -- 'zip' | 'roboflow_api' | 'coco_json'
    file_path TEXT,                         -- Path to exported ZIP (if applicable)
    num_samples INTEGER,                    -- Total samples exported
    split JSON,                             -- {"train": 70, "val": 20, "test": 10}
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

---

## 🔌 API Endpoints

### Project Management

#### `POST /api/projects`
Create new project

**Request**:
```json
{
  "name": "Car Parts Dataset",
  "description": "Classification of car components",
  "settings": {
    "background_mode": "transparent",
    "default_labels": ["wheel", "headlight", "mirror", "door"]
  }
}
```

**Response**:
```json
{
  "success": true,
  "project": {
    "id": "proj_abc123",
    "name": "Car Parts Dataset",
    "created_at": "2025-11-21T12:00:00Z"
  }
}
```

#### `GET /api/projects`
List all projects

**Response**:
```json
{
  "success": true,
  "projects": [
    {
      "id": "proj_abc123",
      "name": "Car Parts Dataset",
      "num_crops": 47,
      "num_labels": 4,
      "created_at": "2025-11-21T12:00:00Z",
      "updated_at": "2025-11-21T14:30:00Z"
    }
  ]
}
```

#### `GET /api/projects/:projectId`
Get project details

**Response**:
```json
{
  "success": true,
  "project": {
    "id": "proj_abc123",
    "name": "Car Parts Dataset",
    "description": "...",
    "settings": {...},
    "stats": {
      "total_crops": 47,
      "labels": [
        {"label": "wheel", "count": 15},
        {"label": "headlight", "count": 12},
        {"label": "mirror", "count": 10},
        {"label": "door", "count": 10}
      ]
    }
  }
}
```

#### `PUT /api/projects/:projectId`
Update project

**Request**:
```json
{
  "name": "Updated Name",
  "settings": {...}
}
```

#### `DELETE /api/projects/:projectId`
Delete project (including all crops)

---

### Crop Management

#### `POST /api/projects/:projectId/crops`
Create crop from segmentation mask

**Request**:
```json
{
  "sessionId": "sam3_session_123",
  "maskIndex": 0,
  "label": "car",
  "backgroundMode": "transparent"
}
```

**Response**:
```json
{
  "success": true,
  "crop": {
    "id": "crop_xyz789",
    "filename": "crop_001.png",
    "url": "/api/crops/crop_xyz789",
    "label": "car",
    "bbox": [100, 200, 150, 120],
    "maskScore": 0.95,
    "maskArea": 18000,
    "sourceImage": "uploads/img_123.jpg",
    "createdAt": "2025-11-21T14:35:00Z"
  }
}
```

#### `GET /api/projects/:projectId/crops`
List crops in project

**Query Params**:
- `label`: Filter by label (optional)
- `limit`: Number of results (default: 100)
- `offset`: Pagination offset (default: 0)

**Response**:
```json
{
  "success": true,
  "crops": [...],
  "total": 47,
  "limit": 100,
  "offset": 0
}
```

#### `GET /api/crops/:cropId`
Get crop image (serves PNG file)

#### `PUT /api/crops/:cropId`
Update crop (change label)

**Request**:
```json
{
  "label": "updated_label"
}
```

#### `DELETE /api/crops/:cropId`
Delete crop

---

### Export

#### `POST /api/projects/:projectId/export/zip`
Export project as ZIP

**Request**:
```json
{
  "split": {
    "train": 0.7,
    "val": 0.2,
    "test": 0.1
  },
  "includeMetadata": true
}
```

**Response**:
```json
{
  "success": true,
  "downloadUrl": "/api/downloads/export_proj_abc123_20251121.zip",
  "stats": {
    "total": 47,
    "train": 33,
    "val": 9,
    "test": 5,
    "classes": ["wheel", "headlight", "mirror", "door"]
  }
}
```

**ZIP Structure**:
```
car_parts_dataset.zip
├── train/
│   ├── wheel/
│   │   ├── crop_001.png
│   │   └── crop_002.png
│   ├── headlight/
│   └── ...
├── val/
│   ├── wheel/
│   └── ...
├── test/
│   ├── wheel/
│   └── ...
└── metadata.json
```

**metadata.json**:
```json
{
  "project_name": "Car Parts Dataset",
  "created_at": "2025-11-21T12:00:00Z",
  "exported_at": "2025-11-21T15:00:00Z",
  "total_samples": 47,
  "classes": ["wheel", "headlight", "mirror", "door"],
  "split": {"train": 0.7, "val": 0.2, "test": 0.1},
  "samples": [
    {
      "id": "crop_001",
      "file": "train/wheel/crop_001.png",
      "label": "wheel",
      "source_image": "image_123.jpg",
      "bbox": [100, 200, 150, 120],
      "mask_score": 0.95,
      "split": "train"
    }
  ]
}
```

---

## 🐍 Python Service Additions

### New Command: `crop_from_mask`

**File**: `backend/sam3_service.py`

```python
def crop_from_mask(self, session_id, mask_index, background_mode='transparent'):
    """
    Extract and crop object from image using segmentation mask

    Args:
        session_id: SAM3 session ID
        mask_index: Which mask to use (0, 1, or 2)
        background_mode: 'transparent' | 'white' | 'black' | 'original'

    Returns:
        {
            'image': base64_encoded_png,
            'bbox': [x, y, width, height],
            'area': pixel_count,
            'width': crop_width,
            'height': crop_height
        }
    """
    import numpy as np
    import cv2
    from PIL import Image
    import io
    import base64

    # Get session data
    if session_id not in self.sessions:
        return {'success': False, 'error': 'Session not found'}

    session = self.sessions[session_id]

    # Get mask (stored from last prediction)
    if 'last_masks' not in session or mask_index >= len(session['last_masks']):
        return {'success': False, 'error': 'Mask not found'}

    mask = session['last_masks'][mask_index]  # Shape: (H, W)
    image = session['image']  # Shape: (H, W, 3), RGB

    # Convert mask to numpy if it's a torch tensor
    if hasattr(mask, 'cpu'):
        mask = mask.cpu().numpy()

    # Ensure mask is 2D
    if mask.ndim == 3:
        mask = mask.squeeze()

    # Convert to binary mask (threshold at 0.5)
    binary_mask = (mask > 0.5).astype(np.uint8)

    # Find bounding box
    y_indices, x_indices = np.where(binary_mask > 0)

    if len(y_indices) == 0:
        return {'success': False, 'error': 'Empty mask'}

    x_min, x_max = int(x_indices.min()), int(x_indices.max())
    y_min, y_max = int(y_indices.min()), int(y_indices.max())

    # Add small padding (5 pixels)
    padding = 5
    x_min = max(0, x_min - padding)
    y_min = max(0, y_min - padding)
    x_max = min(image.shape[1] - 1, x_max + padding)
    y_max = min(image.shape[0] - 1, y_max + padding)

    bbox = [x_min, y_min, x_max - x_min, y_max - y_min]
    area = int(binary_mask.sum())

    # Crop image and mask
    cropped_image = image[y_min:y_max+1, x_min:x_max+1]
    cropped_mask = binary_mask[y_min:y_max+1, x_min:x_max+1]

    # Apply background mode
    if background_mode == 'transparent':
        # Create RGBA image
        rgba = np.dstack([
            cropped_image,
            (cropped_mask * 255).astype(np.uint8)
        ])
        pil_image = Image.fromarray(rgba, mode='RGBA')

    elif background_mode == 'white':
        # White background
        white_bg = np.ones_like(cropped_image) * 255
        result = cropped_image * cropped_mask[..., None] + white_bg * (1 - cropped_mask[..., None])
        pil_image = Image.fromarray(result.astype(np.uint8), mode='RGB')

    elif background_mode == 'black':
        # Black background
        result = cropped_image * cropped_mask[..., None]
        pil_image = Image.fromarray(result.astype(np.uint8), mode='RGB')

    else:  # original
        # Keep original image without masking
        pil_image = Image.fromarray(cropped_image, mode='RGB')

    # Encode to base64
    buffer = io.BytesIO()
    pil_image.save(buffer, format='PNG')
    img_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

    return {
        'success': True,
        'image': img_base64,
        'bbox': bbox,
        'area': area,
        'width': cropped_image.shape[1],
        'height': cropped_image.shape[0]
    }
```

**Update `handle_command`**:
```python
def handle_command(self, command_data):
    command = command_data.get('command')

    # ... existing commands ...

    elif command == 'crop_from_mask':
        return self.crop_from_mask(
            session_id=command_data['session_id'],
            mask_index=command_data['mask_index'],
            background_mode=command_data.get('background_mode', 'transparent')
        )
```

**Update `predict_click` to store masks**:
```python
def predict_click(self, session_id, points, labels, multimask_output=True, mask_input=None):
    # ... existing code ...

    # Store masks in session for cropping
    session['last_masks'] = masks  # Store all 3 masks
    session['last_scores'] = scores

    # ... rest of existing code ...
```

---

## ⚛️ Frontend Components

### 1. Project Manager Component

**File**: `frontend/src/components/ProjectManager.tsx`

```typescript
import { useState, useEffect } from 'react';
import { createProject, getProjects, deleteProject } from '../api/projects';

interface Project {
  id: string;
  name: string;
  num_crops: number;
  num_labels: number;
  created_at: string;
  updated_at: string;
}

interface ProjectManagerProps {
  currentProjectId: string | null;
  onProjectSelect: (projectId: string) => void;
}

export default function ProjectManager({ currentProjectId, onProjectSelect }: ProjectManagerProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const response = await getProjects();
      setProjects(response.projects);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;

    try {
      const response = await createProject({
        name: newProjectName,
        settings: {
          background_mode: 'transparent'
        }
      });

      setProjects([...projects, response.project]);
      setNewProjectName('');
      setShowNewProjectDialog(false);
      onProjectSelect(response.project.id);
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Delete this project? This cannot be undone.')) return;

    try {
      await deleteProject(projectId);
      setProjects(projects.filter(p => p.id !== projectId));
      if (currentProjectId === projectId) {
        onProjectSelect(projects[0]?.id || null);
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  return (
    <div className="project-manager">
      <div className="project-header">
        <h3>Projects</h3>
        <button onClick={() => setShowNewProjectDialog(true)}>
          + New Project
        </button>
      </div>

      {showNewProjectDialog && (
        <div className="new-project-dialog">
          <input
            type="text"
            placeholder="Project name..."
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleCreateProject()}
            autoFocus
          />
          <button onClick={handleCreateProject}>Create</button>
          <button onClick={() => setShowNewProjectDialog(false)}>Cancel</button>
        </div>
      )}

      <div className="project-list">
        {loading ? (
          <div>Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="empty-state">
            No projects yet. Create one to start labeling!
          </div>
        ) : (
          projects.map((project) => (
            <div
              key={project.id}
              className={`project-item ${project.id === currentProjectId ? 'active' : ''}`}
              onClick={() => onProjectSelect(project.id)}
            >
              <div className="project-info">
                <div className="project-name">{project.name}</div>
                <div className="project-stats">
                  {project.num_crops} samples · {project.num_labels} classes
                </div>
              </div>
              <button
                className="delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteProject(project.id);
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

### 2. Crop & Label Component

**File**: `frontend/src/components/CropAndLabel.tsx`

```typescript
import { useState, useEffect, useRef } from 'react';
import { createCrop } from '../api/crops';

interface CropAndLabelProps {
  projectId: string;
  sessionId: string;
  selectedMaskIndex: number;
  onCropSaved: () => void;
}

export default function CropAndLabel({
  projectId,
  sessionId,
  selectedMaskIndex,
  onCropSaved
}: CropAndLabelProps) {
  const [label, setLabel] = useState('');
  const [backgroundMode, setBackgroundMode] = useState<'transparent' | 'white' | 'black' | 'original'>('transparent');
  const [cropPreview, setCropPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [recentLabels, setRecentLabels] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load recent labels from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`recent_labels_${projectId}`);
    if (stored) {
      setRecentLabels(JSON.parse(stored));
    }
  }, [projectId]);

  // Generate crop preview
  useEffect(() => {
    if (sessionId && selectedMaskIndex !== null) {
      generatePreview();
    }
  }, [sessionId, selectedMaskIndex, backgroundMode]);

  const generatePreview = async () => {
    try {
      const response = await fetch('/api/crops/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          maskIndex: selectedMaskIndex,
          backgroundMode
        })
      });

      const data = await response.json();
      if (data.success) {
        setCropPreview(`data:image/png;base64,${data.image}`);
      }
    } catch (error) {
      console.error('Failed to generate preview:', error);
    }
  };

  const handleSave = async () => {
    if (!label.trim()) {
      alert('Please enter a label');
      inputRef.current?.focus();
      return;
    }

    setSaving(true);
    try {
      await createCrop(projectId, {
        sessionId,
        maskIndex: selectedMaskIndex,
        label: label.trim(),
        backgroundMode
      });

      // Update recent labels
      const updated = [label, ...recentLabels.filter(l => l !== label)].slice(0, 10);
      setRecentLabels(updated);
      localStorage.setItem(`recent_labels_${projectId}`, JSON.stringify(updated));

      setLabel('');
      onCropSaved();
    } catch (error) {
      console.error('Failed to save crop:', error);
      alert('Failed to save crop');
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    setLabel('');
    onCropSaved();
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only handle if input is focused or no other input is focused
      const activeElement = document.activeElement;
      const isInputFocused = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA';

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleSkip();
      } else if (e.key >= '1' && e.key <= '9' && !isInputFocused) {
        // Quick select recent label
        const index = parseInt(e.key) - 1;
        if (index < recentLabels.length) {
          setLabel(recentLabels[index]);
          inputRef.current?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [label, recentLabels]);

  return (
    <div className="crop-and-label">
      <h3>Label Segmented Object</h3>

      {/* Crop Preview */}
      {cropPreview && (
        <div className="crop-preview">
          <img src={cropPreview} alt="Cropped object" />
        </div>
      )}

      {/* Background Mode Selector */}
      <div className="background-mode">
        <label>Background:</label>
        <select
          value={backgroundMode}
          onChange={(e) => setBackgroundMode(e.target.value as any)}
        >
          <option value="transparent">Transparent</option>
          <option value="white">White</option>
          <option value="black">Black</option>
          <option value="original">Original</option>
        </select>
      </div>

      {/* Label Input */}
      <div className="label-input">
        <input
          ref={inputRef}
          type="text"
          placeholder="Enter label (e.g., car, person)..."
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          list="recent-labels"
          autoFocus
        />
        <datalist id="recent-labels">
          {recentLabels.map((l, i) => (
            <option key={i} value={l} />
          ))}
        </datalist>
      </div>

      {/* Recent Labels (Quick Select) */}
      {recentLabels.length > 0 && (
        <div className="recent-labels">
          <label>Recent (press 1-9):</label>
          <div className="label-chips">
            {recentLabels.slice(0, 9).map((l, i) => (
              <button
                key={i}
                className="label-chip"
                onClick={() => setLabel(l)}
              >
                {i + 1}. {l}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="actions">
        <button
          className="save-btn"
          onClick={handleSave}
          disabled={saving || !label.trim()}
        >
          {saving ? 'Saving...' : 'Save (Enter)'}
        </button>
        <button className="skip-btn" onClick={handleSkip}>
          Skip (Esc)
        </button>
      </div>

      {/* Keyboard Shortcuts Help */}
      <div className="shortcuts-help">
        <small>
          <kbd>Enter</kbd> Save · <kbd>Esc</kbd> Skip · <kbd>1-9</kbd> Quick label
        </small>
      </div>
    </div>
  );
}
```

### 3. Updated App Component

**File**: `frontend/src/App.tsx`

Add project management and labeling workflow:

```typescript
import { useState } from 'react';
import ImageUpload from './components/ImageUpload';
import InteractiveCanvas from './components/InteractiveCanvas';
import ProjectManager from './components/ProjectManager';
import CropAndLabel from './components/CropAndLabel';

export default function App() {
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [selectedMaskIndex, setSelectedMaskIndex] = useState<number>(0);
  const [showLabelingMode, setShowLabelingMode] = useState(false);

  const handleSegmented = (masks: string[], scores: number[]) => {
    // After segmentation, show labeling UI
    if (currentProjectId) {
      setShowLabelingMode(true);
    }
  };

  const handleCropSaved = () => {
    // Reset for next segmentation
    setShowLabelingMode(false);
    // Could auto-load next image or clear current
  };

  return (
    <div className="app">
      <header>
        <h1>SAM3 Dataset Labeling</h1>
      </header>

      <div className="layout">
        {/* Sidebar: Project Manager */}
        <aside className="sidebar">
          <ProjectManager
            currentProjectId={currentProjectId}
            onProjectSelect={setCurrentProjectId}
          />
        </aside>

        {/* Main Content */}
        <main className="main-content">
          {!currentProjectId ? (
            <div className="empty-state">
              Create or select a project to start labeling
            </div>
          ) : !session ? (
            <ImageUpload onUpload={setSession} />
          ) : !showLabelingMode ? (
            <InteractiveCanvas
              sessionId={session.sessionId}
              imageUrl={session.imageUrl}
              onSegmented={handleSegmented}
              onMaskSelected={setSelectedMaskIndex}
            />
          ) : (
            <CropAndLabel
              projectId={currentProjectId}
              sessionId={session.sessionId}
              selectedMaskIndex={selectedMaskIndex}
              onCropSaved={handleCropSaved}
            />
          )}
        </main>
      </div>
    </div>
  );
}
```

---

## 🎨 User Workflow

### Step-by-Step Experience:

1. **Launch App**
   - User sees project list (or empty state)
   - Click "New Project" → Enter name → Project created

2. **Upload Image**
   - Drag & drop or select image
   - Image loads in canvas

3. **Segment Object**
   - Click on object in image
   - SAM3 generates 3 mask candidates
   - User selects best mask (or adds refinement points)

4. **Label Crop** (NEW)
   - App automatically shows crop preview
   - User types label (autocomplete from recent)
   - Or press 1-9 for quick label selection
   - Press Enter to save, Esc to skip

5. **Repeat**
   - App clears, ready for next object
   - User can segment another object in same image
   - Or upload new image

6. **Export Dataset**
   - Switch to "Dataset" tab (future phase)
   - Review samples and class distribution
   - Click "Export ZIP"
   - Download ready for Roboflow upload

### Keyboard Shortcuts:

| Key | Action |
|-----|--------|
| `Enter` | Save crop with label |
| `Esc` | Skip current crop |
| `1-9` | Quick select recent label (e.g., press `3` to use 3rd recent label) |
| `Ctrl+N` | New project (future) |
| `Ctrl+E` | Export dataset (future) |

---

## 🛠️ Implementation Steps

### Step 1: Database Setup (30 min)
- [ ] Create `backend/database.js` - SQLite connection handler
- [ ] Create `backend/migrations/001_initial.sql` - Schema creation
- [ ] Add initialization in `server.js`
- [ ] Test: Create project, insert crop, query

### Step 2: Backend API - Project Management (1 hour)
- [ ] Implement `POST /api/projects` - Create project
- [ ] Implement `GET /api/projects` - List projects
- [ ] Implement `GET /api/projects/:id` - Get project details
- [ ] Implement `DELETE /api/projects/:id` - Delete project
- [ ] Test: Postman/curl requests

### Step 3: Python Service - Crop Extraction (1 hour)
- [ ] Add `crop_from_mask` function to `sam3_service.py`
- [ ] Update `predict_click` to store masks in session
- [ ] Handle all 4 background modes
- [ ] Add error handling (empty mask, invalid session)
- [ ] Test: `python backend/test_service.py`

### Step 4: Backend API - Crop Management (1 hour)
- [ ] Implement `POST /api/projects/:id/crops` - Create crop
  - Call Python service for crop
  - Save image to filesystem
  - Insert metadata to SQLite
- [ ] Implement `GET /api/crops/:id` - Serve crop image
- [ ] Implement `PUT /api/crops/:id` - Update label
- [ ] Implement `DELETE /api/crops/:id` - Delete crop
- [ ] Test: Upload image, segment, create crop

### Step 5: Frontend - Project Manager (1 hour)
- [ ] Create `ProjectManager.tsx` component
- [ ] Create `api/projects.ts` - API client functions
- [ ] Integrate in `App.tsx`
- [ ] Add basic CSS styling
- [ ] Test: Create/list/delete projects in browser

### Step 6: Frontend - Crop & Label (1.5 hours)
- [ ] Create `CropAndLabel.tsx` component
- [ ] Create `api/crops.ts` - API client functions
- [ ] Implement crop preview generation
- [ ] Add label input with autocomplete
- [ ] Add background mode selector
- [ ] Implement recent labels storage (localStorage)
- [ ] Test: Full workflow (upload → segment → label → save)

### Step 7: Keyboard Shortcuts (30 min)
- [ ] Add global keyboard listener in `CropAndLabel.tsx`
- [ ] Implement Enter (save), Esc (skip), 1-9 (quick label)
- [ ] Add visual indicators (help text, key badges)
- [ ] Test: Keyboard-only workflow

### Step 8: Export - ZIP Generation (1 hour)
- [ ] Create `backend/export.js` - Dataset exporter
- [ ] Implement `POST /api/projects/:id/export/zip`
- [ ] Create folder structure (train/val/test)
- [ ] Split crops by label and ratio
- [ ] Generate metadata.json
- [ ] Create ZIP file with archiver
- [ ] Test: Export, extract ZIP, verify structure

### Step 9: Testing & Polish (1 hour)
- [ ] Test full workflow end-to-end
- [ ] Test error cases (empty label, deleted project, etc.)
- [ ] Add loading states and error messages
- [ ] Improve CSS styling
- [ ] Add keyboard shortcut help tooltip
- [ ] Test keyboard shortcuts thoroughly
- [ ] Update CLAUDE.md with new features

---

## 🧪 Testing Strategy

### Unit Tests

#### Backend Tests
```bash
# Test database operations
npm test backend/database.test.js

# Test crop extraction
python backend/test_crop_extraction.py
```

#### Frontend Tests
```bash
# Component tests (future)
npm test src/components/CropAndLabel.test.tsx
```

### Integration Tests

#### Full Workflow Test
```bash
# Terminal 1: Start backend
node backend/server.js

# Terminal 2: Run workflow test
npm run test:workflow
```

Test script should:
1. Create project via API
2. Upload image
3. Segment object
4. Create crop
5. Verify crop file exists
6. Verify DB entry exists
7. Export ZIP
8. Verify ZIP contents

### Manual Testing Checklist

- [ ] Create new project with name "Test Dataset"
- [ ] Upload test_image.jpg
- [ ] Click on truck to segment
- [ ] Verify crop preview appears
- [ ] Enter label "truck"
- [ ] Press Enter to save
- [ ] Verify crop saved (check DB, filesystem)
- [ ] Test all background modes (transparent, white, black, original)
- [ ] Test keyboard shortcuts (Enter, Esc, 1-9)
- [ ] Create 10+ crops with 3+ different labels
- [ ] Test recent labels persistence (refresh browser)
- [ ] Export project as ZIP
- [ ] Extract and verify folder structure
- [ ] Test project deletion (verify files deleted)
- [ ] Test switching between projects
- [ ] Test edge cases:
  - Empty label
  - Very long label (100+ chars)
  - Special characters in label
  - Delete project while viewing it
  - Network errors (disconnect backend)

---

## 📁 File Structure Changes

```
backend/
├── database.js                  # NEW: SQLite connection & queries
├── migrations/                  # NEW: Database schema
│   └── 001_initial.sql
├── routes/                      # NEW: API routes (organized)
│   ├── projects.js
│   ├── crops.js
│   └── export.js
├── datasets/                    # NEW: Project datasets storage
│   └── .gitkeep
├── export.js                    # NEW: Dataset export logic
├── sam3_service.py             # MODIFIED: Add crop_from_mask
├── server.js                    # MODIFIED: Add new routes
└── package.json                # MODIFIED: Add sqlite3, archiver

frontend/
├── src/
│   ├── components/
│   │   ├── ProjectManager.tsx   # NEW
│   │   ├── CropAndLabel.tsx     # NEW
│   │   └── InteractiveCanvas.tsx  # MODIFIED: Add mask selection
│   ├── api/
│   │   ├── projects.ts          # NEW
│   │   └── crops.ts             # NEW
│   ├── types/
│   │   └── index.ts             # MODIFIED: Add Project, Crop types
│   └── App.tsx                  # MODIFIED: Integrate new components
└── package.json                 # No new dependencies needed

root/
├── DATASET_LABELING_PLAN.md     # THIS FILE
└── CLAUDE.md                    # UPDATED: Add labeling workflow docs
```

---

## 📦 Dependencies

### Backend (New)
```json
{
  "sqlite3": "^5.1.6",           // SQLite database
  "archiver": "^6.0.1"            // ZIP file creation
}
```

Install:
```bash
cd backend
npm install sqlite3 archiver
```

### Frontend
No new dependencies needed! 🎉

---

## 🚀 Future Enhancements (Phase 2+)

### Dataset Management UI
- Grid view of all crops with thumbnails
- Class distribution chart
- Filter by label, date, source image
- Bulk operations (multi-select, bulk delete, bulk relabel)
- Search functionality

### Export Options
- Roboflow API direct upload
- COCO JSON format
- YOLO format
- Custom CSV export
- Multi-project merge export

### Quality & Validation
- Duplicate detection (perceptual hashing)
- Class imbalance warnings
- Minimum samples per class
- Train/val/test split visualization
- Dataset statistics dashboard

### Advanced Features
- Text-prompt batch segmentation (segment all "cars" at once)
- Active learning (re-segment uncertain samples)
- Label hierarchies (e.g., vehicle → car → sedan)
- Multi-user collaboration (shared projects)
- Annotation history & undo
- Cloud storage integration (S3, GCS)

### UX Improvements
- Dark mode
- Tutorial/onboarding
- Keyboard shortcuts customization
- Mobile/tablet support
- Drag-drop label assignment
- Label templates & presets

---

## ⏱️ Estimated Timeline

**Phase 1 Implementation**: ~8-10 hours

| Task | Time |
|------|------|
| Database setup | 30 min |
| Backend API - Projects | 1 hour |
| Python crop extraction | 1 hour |
| Backend API - Crops | 1 hour |
| Frontend - ProjectManager | 1 hour |
| Frontend - CropAndLabel | 1.5 hours |
| Keyboard shortcuts | 30 min |
| Export ZIP | 1 hour |
| Testing & polish | 1 hour |
| Documentation | 30 min |

**Can be split into**:
- Session 1 (4h): Backend foundation (DB + APIs + Python)
- Session 2 (4h): Frontend (components + integration)
- Session 3 (2h): Export + testing + polish

---

## ✅ Success Criteria

### MVP (Minimum Viable Product)
- [x] Create and switch between projects
- [x] Segment object with SAM3
- [x] Crop and label object
- [x] Save to persistent storage
- [x] Basic keyboard shortcuts (Enter, Esc)
- [x] Export as ZIP in Roboflow format

### Full Phase 1
- [x] All MVP features
- [x] Recent labels with quick select (1-9 keys)
- [x] Configurable background modes
- [x] Project management (create/delete/switch)
- [x] Proper error handling
- [x] Clean, intuitive UI

### Production Ready (Future)
- [ ] Dataset management dashboard
- [ ] Roboflow API integration
- [ ] Dataset validation
- [ ] Advanced export formats
- [ ] Multi-user support
- [ ] Cloud storage

---

## 🎓 Usage Example

### Creating a Car Parts Classification Dataset

**Goal**: Train a classifier to identify car parts (wheel, headlight, mirror, door, bumper)

**Steps**:

1. **Setup** (1 min)
   ```
   Create project: "Car Parts Dataset"
   Prepare 20 car images
   ```

2. **Labeling** (~15 min for 100 samples)
   ```
   For each image:
   - Upload image
   - Click on wheel → Label "wheel" → Enter
   - Click on headlight → Label "headlight" → Enter
   - Click on mirror → Label "mirror" → Enter
   - ... repeat for all parts
   - Next image
   ```

3. **Export** (1 min)
   ```
   Export as ZIP
   Split: 70% train, 20% val, 10% test
   Download: car_parts_dataset.zip
   ```

4. **Upload to Roboflow** (2 min)
   ```
   Go to roboflow.com
   Create new project (Classification)
   Upload ZIP
   Train model
   ```

**Total Time**: ~20 minutes for 100 labeled samples
**Traditional Method**: ~60-90 minutes

**6x Faster! 🚀**

---

## 📞 Support & Troubleshooting

### Common Issues

**Issue**: "Session not found" when creating crop
**Solution**: Make sure SAM3 session hasn't expired. Re-segment the object.

**Issue**: Crop preview not showing
**Solution**: Check browser console for errors. Verify backend can access Python service.

**Issue**: SQLite database locked
**Solution**: Close any DB browser tools. Restart backend.

**Issue**: Export ZIP is empty
**Solution**: Verify crops exist in `backend/datasets/project_id/crops/`

### Debug Commands

```bash
# Check database
sqlite3 backend/datasets/PROJECT_ID/metadata.db "SELECT * FROM crops;"

# Check crop files
ls -la backend/datasets/PROJECT_ID/crops/

# Check backend logs
tail -f backend.log

# Test Python service
python backend/test_service.py
```

---

## 🎉 Ready to Build!

This plan provides everything needed to implement Phase 1 of the dataset labeling system. Follow the implementation steps in order, test thoroughly, and you'll have a production-ready tool for creating classification datasets 6x faster than traditional methods!

**Next Steps**:
1. Review this plan
2. Ask any clarifying questions
3. Start with Step 1 (Database Setup)
4. Test each component as you build
5. Celebrate when it works! 🎊

---

**Last Updated**: 2025-11-21
**Version**: 1.0
**Status**: Ready for Implementation
