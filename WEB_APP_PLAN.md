# SAM3 Web Application - Implementation Plan

## Project: Interactive SAM3 Segmentation Web App
**Stack**: Express + React (Vite) + Python SAM3
**Priority**: Click-to-Segment Mode First, then Text Mode

---

## Phase 1: Backend Foundation (Python SAM3 Service)

### Task 1.1: Create Python SAM3 API Service
**File**: `backend/sam3_service.py`

- [ ] Load SAM3 model with interactive mode enabled (`enable_inst_interactivity=True`)
- [ ] Create JSON-based stdin/stdout communication protocol
- [ ] Implement commands:
  - `load_image`: Process and cache image
  - `predict_point`: Point-based segmentation
  - `predict_text`: Text-based segmentation (Phase 2)
- [ ] Return masks as base64-encoded PNG or numpy arrays
- [ ] Handle multiple points for refinement
- [ ] Proper error handling and logging
- [ ] Use GPU 1 (CUDA_VISIBLE_DEVICES=1)

**Input Format**:
```json
{
  "command": "predict_point",
  "session_id": "uuid",
  "points": [[520, 375], [600, 400]],
  "labels": [1, 1],
  "multimask_output": true
}
```

**Output Format**:
```json
{
  "success": true,
  "masks": ["base64_mask_1", "base64_mask_2", "base64_mask_3"],
  "scores": [0.95, 0.87, 0.76],
  "logits": "base64_logits"
}
```

### Task 1.2: Create Express.js Server
**File**: `backend/server.js`

- [ ] Initialize Express server on port 3001
- [ ] Set up CORS for frontend (port 5173)
- [ ] Configure multer for file uploads
- [ ] Create upload directory with cleanup
- [ ] Session management with UUID
- [ ] Spawn persistent Python SAM3 process
- [ ] Implement process communication (stdin/stdout)
- [ ] Graceful shutdown handling

**Dependencies**:
```json
{
  "express": "^4.18.0",
  "multer": "^1.4.5-lts.1",
  "cors": "^2.8.5",
  "uuid": "^9.0.0"
}
```

### Task 1.3: Implement API Endpoints
**File**: `backend/routes.js`

**Priority Endpoints (Click Mode)**:
- [x] `POST /api/upload` - Upload image, initialize session
  - Accept image file
  - Generate session ID
  - Save to uploads/
  - Send to Python service to load
  - Return session_id and image dimensions

- [x] `POST /api/segment/click` - Point-based segmentation
  - Accept session_id, points array, labels array
  - Send to Python service
  - Return masks, scores, logits

- [x] `POST /api/segment/refine` - Iterative refinement
  - Accept session_id, points, labels, previous_logits
  - Send to Python service
  - Return refined mask

**Future Endpoints (Text Mode)**:
- [ ] `POST /api/segment/text` - Text prompt segmentation
- [ ] `GET /api/session/:id` - Get session state
- [ ] `DELETE /api/session/:id` - Clear session

---

## Phase 2: Frontend Foundation (React + Vite)

### Task 2.1: Initialize Vite React App
**Directory**: `frontend/`

- [ ] Create Vite app with TypeScript: `npm create vite@latest frontend -- --template react-ts`
- [ ] Install dependencies:
  ```bash
  npm install axios
  npm install @types/node
  ```
- [ ] Configure vite.config.ts for proxy to backend
- [ ] Set up project structure:
  ```
  src/
  ├── components/
  ├── api/
  ├── types/
  ├── hooks/
  └── utils/
  ```

### Task 2.2: Define TypeScript Types
**File**: `frontend/src/types/index.ts`

```typescript
export interface Point {
  x: number;
  y: number;
  label: 1 | 0; // 1 = foreground, 0 = background
}

export interface Mask {
  data: string; // base64
  score: number;
  width: number;
  height: number;
}

export interface SegmentationResult {
  masks: Mask[];
  scores: number[];
  logits?: string;
}

export interface Session {
  id: string;
  imageUrl: string;
  width: number;
  height: number;
}
```

### Task 2.3: Create API Client
**File**: `frontend/src/api/sam3.ts`

- [ ] Axios instance with base URL
- [ ] `uploadImage(file: File): Promise<Session>`
- [ ] `segmentByClick(sessionId, points, labels, logits?): Promise<SegmentationResult>`
- [ ] Error handling with retry logic
- [ ] Request/response interceptors for logging

---

## Phase 3: Click-to-Segment UI (PRIORITY)

### Task 3.1: Image Upload Component
**File**: `frontend/src/components/ImageUpload.tsx`

- [x] Drag-and-drop zone with visual feedback
- [x] File input button as fallback
- [x] File validation (JPEG, PNG, WebP, max 10MB)
- [x] Image preview with dimensions
- [x] Loading state during upload
- [x] Error messages
- [x] Clear/reset button

**UI Design**:
```
┌─────────────────────────────────────┐
│  Drag & Drop Image Here             │
│  or Click to Browse                 │
│  ────────────────────────────       │
│  Supports: JPG, PNG, WebP           │
│  Max size: 10MB                     │
└─────────────────────────────────────┘
```

### Task 3.2: Interactive Canvas Component ⭐ CORE FEATURE
**File**: `frontend/src/components/InteractiveCanvas.tsx`

**Features**:
- [x] Display uploaded image on HTML5 canvas
- [x] Track mouse clicks (left = foreground, right = background)
- [x] Visual feedback: green circles for positive points, red for negative
- [x] Draw semi-transparent mask overlays
- [x] Point management (add, remove, clear all)
- [x] Canvas scaling to fit viewport while maintaining aspect ratio
- [x] Crosshair cursor on hover
- [x] Loading spinner during segmentation
- [x] Display confidence scores

**State Management**:
```typescript
const [points, setPoints] = useState<Point[]>([]);
const [masks, setMasks] = useState<Mask[]>([]);
const [selectedMask, setSelectedMask] = useState<number>(0);
const [isSegmenting, setIsSegmenting] = useState(false);
```

**Interaction Flow**:
1. User clicks on image → Add point to array
2. Call API with all points
3. Receive 3 candidate masks
4. Display all 3 masks with scores
5. User selects best mask or adds more points
6. Refinement mode: use previous logits + new points

**Canvas Layers**:
```
Layer 1 (bottom): Original image
Layer 2: Mask overlay (colored, 50% opacity)
Layer 3 (top): Point markers (circles with borders)
```

### Task 3.3: Mask Selection Panel
**File**: `frontend/src/components/MaskSelector.tsx`

- [x] Display 3 candidate masks as thumbnails
- [x] Show confidence score for each
- [x] Highlight selected mask
- [x] Click to switch between masks
- [x] Visual indicator of best mask (highest score)

**UI Layout**:
```
┌────────┐ ┌────────┐ ┌────────┐
│ Mask 1 │ │ Mask 2 │ │ Mask 3 │
│ 95.2%  │ │ 87.3%  │ │ 76.1%  │
│  ✓ BEST│ │        │ │        │
└────────┘ └────────┘ └────────┘
```

### Task 3.4: Control Panel
**File**: `frontend/src/components/ControlPanel.tsx`

- [x] Mode indicator: "Click Mode" badge
- [x] Instructions panel:
  - "Left-click: Add foreground point"
  - "Right-click: Add background point"
  - "Add points to refine mask"
- [x] Point list with delete buttons
- [x] Clear all points button
- [x] Undo last point button
- [x] Mask opacity slider (0-100%)
- [x] Download buttons:
  - Download mask (PNG)
  - Download overlay (image + mask)
  - Download JSON (points + masks data)

### Task 3.5: Main App Component
**File**: `frontend/src/App.tsx`

**Layout**:
```
┌──────────────────────────────────────────────────┐
│  SAM3 Interactive Segmentation                   │
├──────────────────────────────────────────────────┤
│  [Upload Image] [Mode: Click ▼] [Settings ⚙]    │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌────────────────────┐  ┌──────────────────┐  │
│  │                    │  │  Control Panel   │  │
│  │  Interactive       │  │                  │  │
│  │  Canvas            │  │  Instructions    │  │
│  │                    │  │  Points List     │  │
│  │                    │  │  Mask Selector   │  │
│  │                    │  │  Download        │  │
│  └────────────────────┘  └──────────────────┘  │
│                                                  │
└──────────────────────────────────────────────────┘
```

- [x] State management for session, image, points, masks
- [x] Coordinate upload, segmentation, visualization
- [x] Error boundary for error handling
- [x] Loading states
- [x] Responsive layout (flexbox/grid)

---

## Phase 4: Text Prompt Mode (Secondary Priority)

### Task 4.1: Text Prompt Component
**File**: `frontend/src/components/TextPrompt.tsx`

- [ ] Text input field with autocomplete suggestions
- [ ] Submit button with loading state
- [ ] Example prompts: "car", "person", "wheel", "tree"
- [ ] Display all detected instances
- [ ] Color-code each instance differently

### Task 4.2: Multi-Instance Viewer
**File**: `frontend/src/components/InstanceGrid.tsx`

- [ ] Grid layout showing all detected instances
- [ ] Each instance with thumbnail and score
- [ ] Click instance to highlight on main canvas
- [ ] Toggle visibility per instance
- [ ] Download individual instances

### Task 4.3: Backend Text Segmentation
**File**: `backend/sam3_service.py`

- [ ] Add `predict_text` command handler
- [ ] Use `processor.set_text_prompt(state, prompt)`
- [ ] Return all detected instances
- [ ] Include bounding boxes
- [ ] Instance-level confidence scores

---

## Phase 5: Advanced Features

### Task 5.1: Iterative Refinement
- [ ] Store previous logits on backend
- [ ] Pass logits to refinement endpoint
- [ ] Visual comparison: before/after refinement
- [ ] Refinement history (undo/redo)

### Task 5.2: Visualization Improvements
- [ ] Color picker for mask overlay
- [ ] Adjustable mask opacity
- [ ] Contour-only mode (outline instead of fill)
- [ ] Side-by-side comparison view
- [ ] Zoom and pan on canvas

### Task 5.3: Export Options
- [ ] Download mask as PNG (black & white)
- [ ] Download overlay (original + mask)
- [ ] Export as GeoJSON (contours)
- [ ] Export as SVG
- [ ] Copy mask to clipboard

### Task 5.4: Performance Optimization
- [ ] Debounce rapid clicks (300ms)
- [ ] Request queuing (prevent multiple simultaneous requests)
- [ ] Canvas offscreen rendering
- [ ] Image compression before upload
- [ ] Progressive mask loading

### Task 5.5: UX Enhancements
- [ ] Keyboard shortcuts (Z for undo, C for clear)
- [ ] Touch support for mobile
- [ ] Dark mode toggle
- [ ] Tutorial/onboarding modal
- [ ] Session persistence (localStorage)

---

## Phase 6: Testing & Deployment

### Task 6.1: Testing
- [ ] Test with various image sizes
- [ ] Test with complex objects
- [ ] Test iterative refinement workflow
- [ ] Test error cases (large files, unsupported formats)
- [ ] Cross-browser testing (Chrome, Firefox, Safari)
- [ ] Mobile responsiveness

### Task 6.2: Documentation
- [ ] README with setup instructions
- [ ] API documentation
- [ ] User guide with screenshots
- [ ] Video demo

### Task 6.3: Deployment
- [ ] Dockerize application
- [ ] Environment configuration
- [ ] Production build optimization
- [ ] Deploy backend (with GPU access)
- [ ] Deploy frontend (CDN or static hosting)

---

## Implementation Order (Step-by-Step)

### STEP 1: Python SAM3 Service
1. Create `backend/sam3_service.py`
2. Test with sample inputs (CLI)

### STEP 2: Express Backend
1. Create `backend/server.js`
2. Implement upload endpoint
3. Implement click segmentation endpoint
4. Test with Postman/curl

### STEP 3: React Frontend - Basic Structure
1. Initialize Vite project
2. Create types
3. Create API client
4. Create ImageUpload component

### STEP 4: Interactive Canvas (CORE)
1. Create InteractiveCanvas component
2. Implement click detection
3. Implement point visualization
4. Connect to backend API
5. Display masks

### STEP 5: Control Panel & Polish
1. Create MaskSelector component
2. Create ControlPanel component
3. Implement download functionality
4. Polish UI/UX

### STEP 6: Text Mode (If Time)
1. Add text prompt component
2. Update backend for text prompts
3. Multi-instance viewer

---

## Success Criteria

✅ **MVP (Minimum Viable Product)**:
- [x] Upload image
- [x] Click on image to segment object
- [x] Display mask overlay
- [x] Download result

✅ **Full Click Mode**:
- [x] Multiple points for refinement
- [x] Positive and negative points
- [x] Multiple candidate masks
- [x] Point management (add/remove/clear)

✅ **Complete App**:
- [ ] Click mode fully functional
- [ ] Text mode functional
- [ ] Professional UI
- [ ] Download options
- [ ] Good performance (<2s per segmentation)

---

## Technical Notes

### GPU Configuration
- Backend uses GPU 1: `CUDA_VISIBLE_DEVICES=1`
- Keep model loaded in memory (don't reload per request)
- Session timeout: 30 minutes

### Image Handling
- Max upload: 10MB
- Accepted formats: JPEG, PNG, WebP
- Resize large images (max 2048px on longest side)
- Store in `backend/uploads/` with cleanup

### Communication Protocol
- Frontend ↔ Backend: REST API (JSON)
- Backend ↔ Python: stdin/stdout (JSON)
- Masks: Base64-encoded PNG or numpy array
- Points: Array of [x, y] in pixel coordinates

### Security
- Input validation on all endpoints
- File type verification (magic bytes)
- Path traversal prevention
- Rate limiting on upload endpoint
- CORS restricted to frontend origin

---

## Estimated Time
- **Phase 1 (Backend)**: 2-3 hours
- **Phase 2 (Frontend Setup)**: 1 hour
- **Phase 3 (Click Mode UI)**: 3-4 hours
- **Phase 4 (Text Mode)**: 2 hours
- **Phase 5 (Polish)**: 2-3 hours
- **Total**: ~12-15 hours for complete app

**MVP (Click mode only)**: 6-8 hours

---

Let's build this! 🚀
