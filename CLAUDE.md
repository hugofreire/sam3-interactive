# CLAUDE.md - SAM3 Interactive Segmentation Project

> **Purpose**: This document helps Claude (or any developer) understand the project structure, make changes, debug issues, and continue development efficiently.

---

## 🎯 Project Overview

**What This Is:**
A full-stack web application for interactive image segmentation using Meta's SAM3 (Segment Anything Model 3). Users can upload images and segment objects by clicking on them.

**Tech Stack:**
- **Backend**: Express.js (Node.js) + Python SAM3 service
- **Frontend**: React 18 + TypeScript + Vite
- **AI Model**: SAM3 (848M parameters) running on GPU
- **Communication**: REST API (Express ↔ React) + JSON pipes (Express ↔ Python)

**Current Features:**
- ✅ Interactive click-to-segment
- ✅ Multiple candidate masks with confidence scores
- ✅ Iterative refinement (add more points)
- ✅ Real-time visualization
- ✅ **YOLO export** - YOLO11 detection format with normalized bboxes
- ✅ **YOLO11 Training** - Train detection models from labeled datasets
- ✅ **Model Inference** - Run trained models on new images
- ⏳ Text-based segmentation (planned)

---

## 📁 Project Structure

```
/home/hugo/PycharmProjects/sam3/
│
├── backend/                          # Express.js backend
│   ├── server.js                     # Main Express server (port 3001)
│   ├── sam3_service.py              # Python SAM3 wrapper service
│   ├── export.js                    # YOLO export logic
│   ├── training.js                  # YOLO11 training job management
│   ├── train_yolo.py               # Python YOLO training/inference script
│   ├── database.js                  # SQLite DB manager
│   ├── migrations/                  # DB schema migrations
│   │   ├── 001_initial.sql
│   │   └── 002_yolo_support.sql
│   ├── routes/                      # API route handlers
│   ├── uploads/                     # Temporary image storage (cleaned on shutdown)
│   ├── exports/                     # Generated YOLO ZIPs (7-day retention)
│   └── datasets/                    # Persistent project data
│       ├── projects.db              # Global project list
│       └── {projectId}/
│           ├── metadata.db          # Per-project crops/labels DB
│           ├── crops/               # Crop PNG files (for UI gallery)
│           └── images/              # Original images (for YOLO export)
│
├── frontend/                         # React + Vite frontend
│   ├── src/
│   │   ├── App.tsx                  # Main React component
│   │   ├── components/
│   │   │   ├── ImageUpload.tsx      # Drag-drop upload component
│   │   │   └── InteractiveCanvas.tsx # Click-to-segment canvas
│   │   ├── api/
│   │   │   └── sam3.ts              # Backend API client (axios)
│   │   ├── types/
│   │   │   └── index.ts             # TypeScript type definitions
│   │   └── vite.config.ts           # Vite config (proxy setup)
│   ├── package.json                 # Frontend dependencies
│   └── public/
│
├── sam3/                             # SAM3 source code (from Meta)
│   ├── model_builder.py
│   ├── model/
│   │   ├── sam3_image_processor.py
│   │   ├── sam1_task_predictor.py
│   │   └── ...
│   └── ...
│
├── examples/                         # Official SAM3 examples
│   └── *.ipynb
│
├── scripts/                          # Utility scripts
│
├── basic_example.py                  # CLI segmentation example
├── verify_setup.py                   # Setup verification script
├── test_image.jpg                    # Sample test image
│
├── WEB_APP_PLAN.md                  # Implementation plan
├── WEB_APP_README.md                # Complete user documentation
├── QUICKSTART.md                    # Setup guide
└── CLAUDE.md                        # This file - developer guide
```

---

## 🏗️ Architecture Deep Dive

### Communication Flow

```
┌─────────────────┐
│   User Browser  │
│  (localhost:517X)│
└────────┬────────┘
         │ HTTP REST API
         ▼
┌─────────────────┐
│  Express Server │
│  (port 3001)    │
│  - Routes       │
│  - File upload  │
│  - Session mgmt │
└────────┬────────┘
         │ stdin/stdout JSON
         ▼
┌─────────────────┐
│ Python Service  │
│ sam3_service.py │
│ - SAM3 model    │
│ - Segmentation  │
└────────┬────────┘
         │ CUDA
         ▼
┌─────────────────┐
│   GPU 1 (RTX)   │
│ SAM3 Model      │
│ (848M params)   │
└─────────────────┘
```

### Key Design Decisions

1. **Persistent Python Process**
   - **Why**: Loading SAM3 takes ~10-15 seconds
   - **How**: Spawn once, keep alive, communicate via stdin/stdout
   - **Benefit**: First request slow, subsequent requests fast

2. **Session-Based Architecture**
   - **Why**: Avoid re-processing same image
   - **How**: Generate UUID, cache inference state
   - **Benefit**: Multiple segmentations on same image are instant

3. **Base64 Mask Encoding**
   - **Why**: Simple, works with JSON
   - **Alternative**: Could use file storage
   - **Tradeoff**: Slightly larger payload, but simpler code

4. **GPU Selection**
   - **Why**: GPU 0 occupied by VLLM (23.5GB)
   - **How**: `CUDA_VISIBLE_DEVICES=1`
   - **Location**: Set in `server.js` when spawning Python

5. **Multimask Output**
   - **Why**: SAM3 generates 3 masks for ambiguous clicks
   - **How**: `multimask_output=True` on first click
   - **Benefit**: User can choose best mask

---

## 📦 YOLO Export Feature

**Format**: YOLO11 detection format with normalized bounding boxes

**Key Implementation:**
- **Original images persisted**: Copies from `uploads/` → `datasets/{projectId}/images/` on first crop save
- **Image dimensions tracked**: `source_width`, `source_height` stored in DB (migration 002)
- **Image-level splitting**: All crops from same image stay in same train/val/test split
- **Stable class IDs**: Alphabetically ordered labels (e.g., `car=0, person=1, truck=2`)
- **YOLO format**: `class_id cx cy w h` (normalized 0-1) in `.txt` files + `data.yaml`

**Important Caveats:**
- ⚠️ **Old crops incompatible**: Crops created before migration 002 lack required metadata (dimensions, persisted images)
- ⚠️ **Export fails gracefully**: "No crops with persisted images found" if project has only old crops
- ✅ **New uploads work automatically**: All crops from new uploads (post-migration) include YOLO metadata

**Files Modified:**
- `backend/migrations/002_yolo_support.sql` - Add dimensions & persisted_image_path
- `backend/export.js` - Complete YOLO export rewrite (replaces crop-only export)
- `backend/database.js` - getCropsGroupedByImage(), getProjectImagesDir()
- `backend/server.js` - Track session metadata (uploadPath, width, height)
- `backend/routes/crops.js` - Persist images & store dimensions on crop save
- `backend/routes/projects.js` - Use createYOLOZIP() instead of createDatasetZIP()
- `frontend/src/components/DatasetGallery.tsx` - YOLO format UI text

**Database Schema (002):**
```sql
ALTER TABLE crops ADD COLUMN source_width INTEGER;
ALTER TABLE crops ADD COLUMN source_height INTEGER;
ALTER TABLE crops ADD COLUMN persisted_image_path TEXT;
```

---

## 🤖 YOLO11 Training Feature

**Model**: YOLO11-nano (~2.6M parameters) - optimized for edge deployment

**Training Pipeline:**
1. Exports project dataset to YOLO format (70/30 train/val split)
2. Spawns Python subprocess with `train_yolo.py`
3. Streams JSON progress logs via stdout
4. Exports to PyTorch (.pt), ONNX, and NCNN formats

**Key Files:**
- `backend/training.js` - Job lifecycle management (start/stop/status/logs)
- `backend/train_yolo.py` - Python training script with JSON logging
- `backend/routes/training.js` - REST API endpoints
- `frontend/src/components/TrainingPanel.tsx` - Training UI with model cards

**Training API Endpoints:**
```
POST /api/projects/:projectId/training/start   - Start training
GET  /api/projects/:projectId/training/status  - Get progress
POST /api/projects/:projectId/training/stop    - Stop training
GET  /api/projects/:projectId/training/logs    - Get training logs
GET  /api/projects/:projectId/models           - List trained models
POST /api/projects/:projectId/inference        - Run inference (upload image)
POST /api/projects/:projectId/inference/url    - Run inference (image path)
```

**Training UI Features:**
- Real-time progress bar with epoch/loss metrics
- Model cards with emoji score indicators based on mAP50:
  - 😢 <25% - "Needs more training data"
  - 😐 25-50% - "Getting there"
  - 🙂 50-70% - "Decent model"
  - 😄 >70% - "Great model!"
- Inference testing with confidence threshold slider
- Model download in multiple formats (PT, ONNX, NCNN)

**GPU Configuration:**
- Uses GPU 1 by default (`CUDA_VISIBLE_DEVICES=1`)
- Configurable via training config `device` parameter

---

## 🐛 Known Issues & Fixes

### Radix UI Dialog Scroll Lock
**Issue:** File inputs don't open file picker when dialogs are open
**Cause:** Radix UI sets `pointer-events: none` on `<body>` with `data-scroll-locked` attribute
**Fix:** Added CSS override in `frontend/src/index.css`:
```css
body[data-scroll-locked] {
  pointer-events: auto !important;
}
```

### Multer File Extensions
**Issue:** YOLO inference fails with "No images or videos found"
**Cause:** Multer was saving uploaded files without extensions
**Fix:** Use `diskStorage` with filename preserving extension in `backend/routes/training.js`

---

## 🔑 Key Files Explained

### 1. `backend/sam3_service.py` - Python SAM3 Service

**Purpose**: Wraps SAM3 model, handles segmentation requests

**Key Classes/Functions:**
```python
class SAM3Service:
    def __init__(self):
        # Load model ONCE on startup
        self.model = build_sam3_image_model(
            enable_inst_interactivity=True  # ← Critical for click mode
        )
        self.sessions = {}  # Store inference states

    def load_image(self, image_path, session_id):
        # Process image, cache inference state
        inference_state = self.processor.set_image(image)
        self.sessions[session_id] = {
            'state': inference_state,
            'image': image,
            'logits': None  # For iterative refinement
        }

    def predict_click(self, session_id, points, labels, ...):
        # Point-based segmentation
        masks, scores, logits = self.model.predict_inst(
            inference_state,
            point_coords=points,    # [[x, y], [x, y]]
            point_labels=labels,    # [1, 0, 1] (1=fg, 0=bg)
            multimask_output=True,
            mask_input=previous_logits  # For refinement
        )
        # Return base64-encoded masks
```

**Communication Protocol:**
- **Input**: JSON lines on stdin
- **Output**: JSON lines on stdout
- **Format**:
  ```json
  // Input
  {"command": "predict_click", "session_id": "...", "points": [[x,y]], "labels": [1]}

  // Output
  {"success": true, "masks": ["base64...", ...], "scores": [0.95, ...]}
  ```

**Important Notes:**
- Logs go to stderr (stdout reserved for JSON)
- Model loaded on GPU 1 via environment variable
- Sessions stored in-memory (lost on restart)
- Logits cached for refinement

---

### 2. `backend/server.js` - Express Server

**Purpose**: HTTP server, bridges React frontend and Python service

**Key Components:**

```javascript
// File Upload (multer)
const storage = multer.diskStorage({
    destination: 'backend/uploads/',
    filename: (req, file, cb) => {
        cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
    }
});

// SAM3 Process Management
let sam3Process = spawn('python', ['backend/sam3_service.py'], {
    env: { ...process.env, CUDA_VISIBLE_DEVICES: '1' }  // ← GPU 1
});

// Command Queue
function sendCommand(command) {
    return new Promise((resolve, reject) => {
        commandQueue.push({ command, resolve, reject });
        sam3Process.stdin.write(JSON.stringify(command) + '\n');
    });
}
```

**API Endpoints:**
```javascript
POST /api/upload              // Upload image → sessionId
POST /api/segment/click       // Click segmentation
POST /api/segment/text        // Text segmentation (TODO)
DELETE /api/session/:id       // Clear session
GET /api/health              // Health check
```

**Important Notes:**
- CORS enabled for frontend (port 5173/5174)
- 10MB file size limit
- Automatic session cleanup on shutdown
- Request timeout: 60 seconds

---

### 3. `frontend/src/components/InteractiveCanvas.tsx` - Core UI

**Purpose**: HTML5 Canvas for interactive segmentation

**Key State:**
```typescript
const [points, setPoints] = useState<Point[]>([]);        // User clicks
const [masks, setMasks] = useState<string[]>([]);         // Base64 masks
const [scores, setScores] = useState<number[]>([]);       // Confidence scores
const [selectedMask, setSelectedMask] = useState<number>(0); // Which mask to show
const [maskImages, setMaskImages] = useState<HTMLImageElement[]>([]); // Decoded masks
```

**Click Handler:**
```typescript
const handleCanvasClick = async (e: React.MouseEvent) => {
    const x = (e.clientX - rect.left) / scale;  // Convert to image coords
    const y = (e.clientY - rect.top) / scale;
    const label = e.button === 2 ? 0 : 1;       // Right=bg, Left=fg

    const newPoints = [...points, { x, y, label }];
    await performSegmentation(newPoints);
};
```

**Drawing Pipeline:**
```typescript
useEffect(() => {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);           // 1. Original image
    ctx.globalAlpha = 0.5;
    ctx.drawImage(maskImages[selectedMask], ...);        // 2. Mask overlay
    ctx.globalAlpha = 1.0;

    // 3. Point markers
    points.forEach(point => {
        ctx.arc(scaledX, scaledY, 8, 0, 2 * Math.PI);
        ctx.fillStyle = point.label === 1 ? 'green' : 'red';
        ctx.fill();
    });
}, [image, points, maskImages, selectedMask]);
```

**Important Notes:**
- Canvas size auto-scales to fit viewport
- Coordinate conversion: canvas → image coordinates
- Masks decoded from base64 → HTMLImageElement
- Right-click menu disabled (`onContextMenu`)

---

### 4. `frontend/src/api/sam3.ts` - API Client

**Purpose**: Type-safe axios wrapper for backend API

```typescript
// Upload image
export async function uploadImage(file: File): Promise<Session> {
    const formData = new FormData();
    formData.append('image', file);
    const response = await api.post<Session>('/upload', formData);
    return response.data;
}

// Click segmentation
export async function segmentByClick(request: ClickSegmentRequest): Promise<SegmentationResult> {
    const response = await api.post<SegmentationResult>('/segment/click', request);
    return response.data;
}
```

**Axios Configuration:**
```typescript
const api = axios.create({
    baseURL: '/api',              // Proxied by Vite
    timeout: 60000,               // 60 second timeout
});
```

**Important Notes:**
- All API calls logged to console
- Automatic error handling
- Types imported from `types/index.ts`

---

## 🔧 Development Workflows

### Starting the Application

**Terminal 1 - Backend:**
```bash
cd /home/hugo/PycharmProjects/sam3
node backend/server.js

# Expected output:
# [INFO] Initializing SAM3 Service...
# [INFO] Using device: cuda
# [INFO] Loading SAM3 model...
# [INFO] SAM3 model loaded successfully!
# 🚀 SAM3 Backend running on http://localhost:3001
# SAM3 service ready!
```

**Terminal 2 - Frontend:**
```bash
cd /home/hugo/PycharmProjects/sam3/frontend
npm run dev

# Expected output:
# VITE v7.2.4  ready in 367 ms
# ➜  Local:   http://localhost:5173/
```

**Access:**
- Frontend: http://localhost:5173 (or 5174 if port busy)
- Backend: http://localhost:3001

---

### Common Development Tasks

#### 1. Add a New API Endpoint

**Backend (`backend/server.js`):**
```javascript
app.post('/api/segment/box', async (req, res) => {
    const { sessionId, box } = req.body;

    const response = await sendCommand({
        command: 'predict_box',
        session_id: sessionId,
        box: box
    });

    res.json(response);
});
```

**Python Service (`backend/sam3_service.py`):**
```python
def predict_box(self, session_id, box):
    session = self.sessions[session_id]
    masks, scores, _ = self.model.predict_inst(
        session['state'],
        box=np.array(box)  # [x1, y1, x2, y2]
    )
    return self._encode_masks(masks, scores)

# Add to handle_command:
elif command == 'predict_box':
    return self.predict_box(...)
```

**Frontend API (`frontend/src/api/sam3.ts`):**
```typescript
export async function segmentByBox(sessionId: string, box: number[]): Promise<SegmentationResult> {
    const response = await api.post('/segment/box', { sessionId, box });
    return response.data;
}
```

---

#### 2. Add a New React Component

**Create component:**
```typescript
// frontend/src/components/TextPrompt.tsx
import { useState } from 'react';
import { segmentByText } from '../api/sam3';

interface TextPromptProps {
    sessionId: string;
    onSegmented: (masks: string[], scores: number[]) => void;
}

export default function TextPrompt({ sessionId, onSegmented }: TextPromptProps) {
    const [prompt, setPrompt] = useState('');

    const handleSubmit = async () => {
        const result = await segmentByText({ sessionId, prompt });
        if (result.success) {
            onSegmented(result.masks!, result.scores!);
        }
    };

    return (
        <div>
            <input value={prompt} onChange={e => setPrompt(e.target.value)} />
            <button onClick={handleSubmit}>Segment</button>
        </div>
    );
}
```

**Use in App:**
```typescript
// frontend/src/App.tsx
import TextPrompt from './components/TextPrompt';

// In render:
<TextPrompt
    sessionId={session.sessionId}
    onSegmented={(masks, scores) => { /* ... */ }}
/>
```

---

#### 3. Debug Backend Issues

**Check Backend Logs:**
```bash
# Backend output shows:
# - Express server logs (stdout)
# - SAM3 service logs (stderr prefixed with "SAM3:")

# Example:
# [2025-11-20T19:28:56.482Z] Upload: session=abc123, file=truck.jpg
# SAM3: [INFO] Loading image: backend/uploads/truck.jpg for session: abc123
```

**Test Python Service Directly:**
```bash
python backend/test_service.py

# Tests:
# ✓ Load image
# ✓ Single point segmentation
# ✓ Multi-point refinement
# ✓ Ping/pong
```

**Test Express API:**
```bash
# Health check
curl http://localhost:3001/api/health

# Upload test image
curl -X POST http://localhost:3001/api/upload \
     -F "image=@test_image.jpg"
# Returns: {"success":true,"sessionId":"...","width":1800,"height":1200}

# Segment
curl -X POST http://localhost:3001/api/segment/click \
     -H "Content-Type: application/json" \
     -d '{"sessionId":"...","points":[[900,600]],"labels":[1],"multimaskOutput":true}'
```

---

#### 4. Debug Frontend Issues

**Browser Console:**
```javascript
// Check for errors
// API calls logged automatically:
// [API] POST /api/upload
// [API] Response from /api/upload: 200

// Check state in React DevTools
```

**Common Issues:**

**CORS Error:**
```
Access to XMLHttpRequest at 'http://localhost:3001/api/upload'
from origin 'http://localhost:5173' has been blocked by CORS policy
```
**Fix**: Check backend has `cors()` middleware

**Proxy Not Working:**
```
GET http://localhost:5173/api/health 404 (Not Found)
```
**Fix**: Check `vite.config.ts`:
```typescript
server: {
    proxy: {
        '/api': 'http://localhost:3001'
    }
}
```

**Image Not Loading:**
```
GET http://localhost:3001/uploads/abc123.jpg 404
```
**Fix**: Check backend serves static files:
```javascript
app.use(express.static('uploads'));
```

---

### Testing Strategy

#### Unit Tests (Python)

```python
# backend/test_service.py (already exists)
python backend/test_service.py

# Add more tests:
def test_negative_points():
    # Test background point (label=0)
    response = send_command({
        'command': 'predict_click',
        'session_id': 'test',
        'points': [[900, 600], [500, 300]],
        'labels': [1, 0]  # Second point is background
    })
    assert response['success']
    assert len(response['masks']) > 0
```

#### Integration Tests (API)

```bash
# Create test script: backend/test_api.sh
#!/bin/bash

# Upload
RESPONSE=$(curl -s -X POST http://localhost:3001/api/upload -F "image=@test_image.jpg")
SESSION_ID=$(echo $RESPONSE | jq -r '.sessionId')

# Segment
curl -s -X POST http://localhost:3001/api/segment/click \
     -H "Content-Type: application/json" \
     -d "{\"sessionId\":\"$SESSION_ID\",\"points\":[[900,600]],\"labels\":[1]}" \
     | jq '.scores'

# Expected: [0.949, 0.873, 0.761]
```

#### E2E Tests (Frontend)

```typescript
// frontend/src/__tests__/workflow.test.ts (create with Playwright/Cypress)

test('complete segmentation workflow', async () => {
    // 1. Upload image
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles('test_image.jpg');

    // 2. Wait for canvas
    await page.waitForSelector('canvas');

    // 3. Click on canvas
    const canvas = await page.locator('canvas');
    await canvas.click({ position: { x: 400, y: 300 } });

    // 4. Verify masks appear
    await page.waitForText('Mask 1');
    await page.waitForText('94.9%');
});
```

---

## 🚨 Important Gotchas

### 1. GPU Configuration

**Problem**: Backend crashes with "CUDA out of memory"

**Cause**: GPU 0 occupied by VLLM process (23.5GB used)

**Solution**: Always use GPU 1
```javascript
// backend/server.js
env: { ...process.env, CUDA_VISIBLE_DEVICES: '1' }
```

**Verify**:
```bash
nvidia-smi  # Check GPU 1 has free memory
```

---

### 2. Coordinate Systems

**Problem**: Clicks don't align with objects

**Cause**: Three coordinate systems:
1. Canvas coordinates (scaled for display)
2. Image coordinates (original size)
3. Browser coordinates (click event)

**Solution**: Always convert
```typescript
// Browser → Canvas → Image
const rect = canvas.getBoundingClientRect();
const canvasX = e.clientX - rect.left;
const canvasY = e.clientY - rect.top;
const imageX = canvasX / scale;  // scale = canvasWidth / imageWidth
const imageY = canvasY / scale;
```

---

### 3. Session Lifecycle

**Problem**: "Session not found" error

**Cause**: Sessions stored in-memory, lost on:
- Backend restart
- Python service crash
- Manual clear

**Solution**: Always handle gracefully
```typescript
try {
    await segmentByClick({ sessionId, ... });
} catch (error) {
    if (error.message.includes('Session')) {
        // Re-upload image
        setSession(null);
    }
}
```

---

### 4. Base64 Encoding

**Problem**: Masks look wrong or don't decode

**Cause**: Base64 encoding issues

**Debug**:
```python
# In sam3_service.py, verify mask shape
mask_np = mask.cpu().numpy()
print(f"Mask shape: {mask_np.shape}")  # Should be (H, W) or (1, H, W)

# Ensure 2D
if mask_np.ndim == 3:
    mask_np = mask_np.squeeze()

# Ensure uint8
mask_uint8 = (mask_np * 255).astype(np.uint8)
```

---

### 5. Canvas Rendering Order

**Problem**: Masks or points not visible

**Cause**: Drawing order matters

**Correct Order**:
```typescript
// 1. Clear
ctx.clearRect(0, 0, width, height);

// 2. Original image (bottom layer)
ctx.drawImage(image, 0, 0, width, height);

// 3. Mask overlay (middle layer)
ctx.globalAlpha = 0.5;
ctx.drawImage(maskImage, 0, 0, width, height);
ctx.globalAlpha = 1.0;

// 4. Points (top layer)
points.forEach(point => { /* draw circle */ });
```

---

## 📝 Code Patterns & Best Practices

### Backend Patterns

**1. Command Pattern (Python Service)**
```python
def handle_command(self, command_data):
    command = command_data.get('command')

    if command == 'load_image':
        return self.load_image(...)
    elif command == 'predict_click':
        return self.predict_click(...)
    else:
        return {'success': False, 'error': 'Unknown command'}
```

**Benefits**: Easy to add new commands, clear separation

---

**2. Promise-Based Queue (Express)**
```javascript
function sendCommand(command) {
    return new Promise((resolve, reject) => {
        commandQueue.push({ command, resolve, reject });
        processQueue();
    });
}
```

**Benefits**: Async/await syntax, automatic queuing

---

### Frontend Patterns

**1. Controlled Components**
```typescript
// State lives in parent, passed down as props
<InteractiveCanvas
    sessionId={session.sessionId}
    imageUrl={session.imageUrl}
    onSegmented={(masks) => { /* handle */ }}
/>
```

---

**2. Custom Hooks (Future)**
```typescript
// frontend/src/hooks/useSegmentation.ts
export function useSegmentation(sessionId: string) {
    const [points, setPoints] = useState<Point[]>([]);
    const [masks, setMasks] = useState<string[]>([]);

    const addPoint = async (x: number, y: number, label: 1 | 0) => {
        const newPoints = [...points, { x, y, label }];
        setPoints(newPoints);

        const result = await segmentByClick({
            sessionId,
            points: newPoints.map(p => [p.x, p.y]),
            labels: newPoints.map(p => p.label)
        });

        if (result.success) {
            setMasks(result.masks!);
        }
    };

    return { points, masks, addPoint };
}

// Usage:
const { points, masks, addPoint } = useSegmentation(sessionId);
```

---

**3. Type-Safe API Calls**
```typescript
// Always define request/response types
export async function segmentByClick(
    request: ClickSegmentRequest
): Promise<SegmentationResult> {
    // TypeScript ensures correct usage
}

// Usage (autocomplete works!):
const result = await segmentByClick({
    sessionId: "...",
    points: [[100, 200]],
    labels: [1],
    multimaskOutput: true  // ← IDE suggests this
});
```

---

## 🔍 Debugging Checklist

### Backend Not Starting

```bash
# 1. Check Python dependencies
python -c "import sam3; print('OK')"

# 2. Check GPU availability
nvidia-smi

# 3. Check Node modules
cd backend && npm install

# 4. Check port availability
lsof -i :3001

# 5. Start with verbose logging
DEBUG=* node backend/server.js
```

---

### Segmentation Not Working

```bash
# 1. Check backend logs
# Look for: "Segmentation successful" or errors

# 2. Test Python service
python backend/test_service.py

# 3. Check session exists
curl http://localhost:3001/api/health

# 4. Verify request format
# Browser DevTools → Network → Payload
```

---

### Frontend Not Loading

```bash
# 1. Check Vite dev server
cd frontend && npm run dev

# 2. Check browser console
# Look for: CORS, 404, syntax errors

# 3. Check proxy
curl http://localhost:5173/api/health
# Should proxy to backend

# 4. Clear cache
# Hard refresh: Ctrl+Shift+R
```

---

## 🚀 Deployment Considerations

### Production Checklist

**Backend:**
- [ ] Environment variables for config
- [ ] Proper error logging (Winston, Bunyan)
- [ ] Rate limiting on upload endpoint
- [ ] File cleanup cron job
- [ ] HTTPS/SSL
- [ ] Process manager (PM2, systemd)

**Frontend:**
```bash
cd frontend
npm run build
# Outputs to frontend/dist/

# Serve with:
# - Nginx
# - Vercel/Netlify
# - Express static
```

**SAM3:**
- [ ] Model checkpoints accessible
- [ ] GPU available (or CPU fallback)
- [ ] Sufficient memory (8GB+ GPU)
- [ ] Hugging Face token configured

---

### Docker Deployment (Future)

```dockerfile
# Dockerfile.backend
FROM python:3.10-cuda12.6
WORKDIR /app
COPY backend/ ./backend/
COPY sam3/ ./sam3/
RUN pip install -e .
RUN cd backend && npm install
CMD ["node", "backend/server.js"]
```

```yaml
# docker-compose.yml
services:
  backend:
    build: .
    ports:
      - "3001:3001"
    environment:
      - CUDA_VISIBLE_DEVICES=0
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

---

## 📚 Additional Resources

### SAM3 Documentation
- **GitHub**: https://github.com/facebookresearch/sam3
- **Paper**: https://ai.meta.com/research/publications/sam-3/
- **Hugging Face**: https://huggingface.co/facebook/sam3

### Related Files in This Project
- `WEB_APP_README.md` - User-facing documentation
- `WEB_APP_PLAN.md` - Original implementation plan
- `QUICKSTART.md` - Setup instructions
- `README_TRAIN.md` - SAM3 training guide

### Useful Commands

```bash
# Find all TODOs
grep -r "TODO" frontend/src/

# Count lines of code
cloc backend/ frontend/src/

# Check TypeScript errors
cd frontend && npx tsc --noEmit

# Format code
cd frontend && npx prettier --write src/

# Check bundle size
cd frontend && npm run build && du -sh dist/
```

---

## 🎯 Next Steps for Development

### Phase 1: Text-Based Segmentation (High Priority)

**Backend:**
```python
# sam3_service.py - already implemented!
def predict_text(self, session_id, prompt):
    output = self.processor.set_text_prompt(
        state=session['state'],
        prompt=prompt
    )
    return self._encode_masks(output['masks'], output['scores'])
```

**Frontend:**
```typescript
// Create: frontend/src/components/TextPrompt.tsx
export default function TextPrompt({ sessionId, onSegmented }) {
    const [prompt, setPrompt] = useState('');
    const [results, setResults] = useState<SegmentationResult | null>(null);

    const handleSubmit = async () => {
        const result = await segmentByText({ sessionId, prompt });
        setResults(result);
        onSegmented(result.masks, result.scores);
    };

    return (
        <div>
            <input
                placeholder="e.g., car, person, tree"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleSubmit()}
            />
            <button onClick={handleSubmit}>Find All</button>
            {results && (
                <div>Found {results.num_instances} instances</div>
            )}
        </div>
    );
}
```

**Integration:**
```typescript
// App.tsx
const [mode, setMode] = useState<'click' | 'text'>('click');

{mode === 'click' ? (
    <InteractiveCanvas {...props} />
) : (
    <TextPrompt sessionId={session.sessionId} onSegmented={...} />
)}
```

---

### Phase 2: Export/Download Features

**Add to InteractiveCanvas:**
```typescript
const downloadMask = () => {
    const canvas = document.createElement('canvas');
    canvas.width = imageWidth;
    canvas.height = imageHeight;
    const ctx = canvas.getContext('2d')!;

    // Draw mask in black & white
    ctx.drawImage(maskImages[selectedMask], 0, 0);

    // Download
    canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob!);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mask.png';
        a.click();
    });
};

const downloadOverlay = () => {
    const canvas = canvasRef.current!;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'segmentation.png';
    a.click();
};
```

---

### Phase 3: Performance Optimizations

**1. Debounce Rapid Clicks:**
```typescript
import { useCallback } from 'react';
import debounce from 'lodash/debounce';

const performSegmentation = useCallback(
    debounce(async (points: Point[]) => {
        // ... segmentation logic
    }, 300),  // Wait 300ms after last click
    [sessionId]
);
```

**2. Request Cancellation:**
```typescript
const controllerRef = useRef<AbortController | null>(null);

const performSegmentation = async (points: Point[]) => {
    // Cancel previous request
    if (controllerRef.current) {
        controllerRef.current.abort();
    }

    // New request
    controllerRef.current = new AbortController();

    try {
        const result = await segmentByClick({
            ...request,
            signal: controllerRef.current.signal
        });
    } catch (error) {
        if (error.name === 'AbortError') {
            return; // Ignore cancelled requests
        }
        throw error;
    }
};
```

**3. Backend Queuing:**
```javascript
// Already implemented in server.js!
// Multiple requests automatically queued
```

---

## 💡 Tips for Future Claude

### When Asked to Fix Bugs

1. **Reproduce First**: Test with `test_image.jpg`
2. **Check Logs**: Backend terminal + browser console
3. **Isolate Layer**: Is it Python, Express, or React?
4. **Test Components**: Use test scripts (`test_service.py`, curl)

### When Asked to Add Features

1. **Follow Patterns**: Look at existing endpoints/components
2. **Update Types**: `frontend/src/types/index.ts`
3. **Test Incrementally**: Backend → API → Frontend
4. **Update Documentation**: This file + WEB_APP_README.md

### When Something Doesn't Make Sense

1. **Check This File**: You might find explanation
2. **Read Original Code**: Comments explain "why"
3. **Check Git History**: `git log` shows reasoning
4. **Test Hypothesis**: Make small change, observe

---

## 🎉 Quick Wins

### Easy Improvements (<30 min each)

1. **Add Keyboard Shortcuts**
   ```typescript
   useEffect(() => {
       const handler = (e: KeyboardEvent) => {
           if (e.key === 'z' && e.ctrlKey) handleUndo();
           if (e.key === 'c' && e.ctrlKey) handleClear();
       };
       window.addEventListener('keydown', handler);
       return () => window.removeEventListener('keydown', handler);
   }, []);
   ```

2. **Add Mask Opacity Slider**
   ```typescript
   const [opacity, setOpacity] = useState(0.5);
   // In drawing code:
   ctx.globalAlpha = opacity;
   ```

3. **Add Loading Progress**
   ```typescript
   const [progress, setProgress] = useState(0);
   // In upload:
   onUploadProgress: (e) => setProgress(e.loaded / e.total)
   ```

4. **Add Error Toast**
   ```typescript
   const [toast, setToast] = useState<string | null>(null);
   {toast && <div className="toast">{toast}</div>}
   ```

---

## 📞 Getting Help

### If Stuck, Check:

1. **This File** - Most common issues documented
2. **WEB_APP_README.md** - User-facing features
3. **WEB_APP_PLAN.md** - Original design decisions
4. **SAM3 Examples** - `examples/sam3_image_interactive.ipynb`
5. **Browser DevTools** - Network, Console, React DevTools
6. **Backend Logs** - Terminal output

### Testing Commands Reference

```bash
# Quick health check
curl http://localhost:3001/api/health

# Test Python service
python backend/test_service.py

# Test full workflow
curl -X POST http://localhost:3001/api/upload -F "image=@test_image.jpg" | jq

# Check processes
ps aux | grep node
ps aux | grep python

# Check ports
lsof -i :3001
lsof -i :5173

# GPU status
nvidia-smi
```

---

## ✅ Final Notes

**This project is production-ready for:**
- Interactive click-based segmentation
- Multiple mask candidates
- Iterative refinement
- Professional UI/UX

**Well-architected:**
- Clear separation of concerns
- Type-safe frontend
- Scalable backend
- Documented code

**Easy to extend:**
- Add new API endpoints: ~30 lines
- Add new UI components: Follow patterns
- Add new SAM3 features: Python service → Express → React

**Performance optimized:**
- GPU acceleration
- Persistent model
- Session caching
- Efficient communication

---

**Ready to continue development! 🚀**

*Last updated: 2025-11-25*
*Session: SAM3 Interactive Segmentation Web App Development*
