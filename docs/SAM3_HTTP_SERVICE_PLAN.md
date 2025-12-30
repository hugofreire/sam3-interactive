# SAM3 HTTP Service - Decoupling Plan

> **Purpose**: Decouple SAM3 from the Express backend so it can run as a standalone HTTP service on a GPU server, allowing lightweight clients (like Raspberry Pi) to use remote SAM3 inference.

## Current Architecture (Tightly Coupled)

```
┌─────────────────────────────────────────────────────┐
│                    Single Machine                    │
│  ┌──────────────┐      spawn()      ┌─────────────┐ │
│  │   Express    │ ──────────────────►│  SAM3 Py   │ │
│  │  server.js   │   stdin/stdout    │  service    │ │
│  │              │◄──────────────────│             │ │
│  └──────────────┘      JSON         └─────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Limitations:**
- SAM3 must run on same machine as backend
- Can't use GPU server from lightweight devices (Pi)
- No horizontal scaling

---

## Target Architecture (Decoupled)

```
┌─────────────────────┐              ┌─────────────────────────────┐
│   Raspberry Pi      │     HTTP     │   GPU Server (10.9.0.14)    │
│  ┌──────────────┐   │              │  ┌───────────────────────┐  │
│  │   Express    │   │   REST API   │  │   SAM3 HTTP Service   │  │
│  │  server.js   │───┼─────────────►│  │   (FastAPI)           │  │
│  │              │   │              │  │   Port 8000           │  │
│  └──────────────┘   │              │  └───────────────────────┘  │
│        │            │              │            │                │
│  ┌─────▼──────┐     │              │     ┌──────▼──────┐         │
│  │  SQLite    │     │              │     │  SAM3 Model │         │
│  │  (local)   │     │              │     │  (GPU)      │         │
│  └────────────┘     │              │     └─────────────┘         │
└─────────────────────┘              └─────────────────────────────┘
```

**Benefits:**
- Pi runs lightweight backend with local database
- Heavy SAM3 inference offloaded to GPU server
- Multiple clients can share single SAM3 service
- Independent scaling

---

## Implementation Plan

### Part 1: SAM3 HTTP Service (GPU Server)

**New file:** `backend/sam3_http_service.py`

#### 1.1 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check, returns SAM3 ready status |
| `POST` | `/sessions` | Create session, upload image (multipart) |
| `GET` | `/sessions/{session_id}` | Get session info (dimensions, status) |
| `DELETE` | `/sessions/{session_id}` | Clear session, free memory |
| `POST` | `/sessions/{session_id}/predict/click` | Click-based segmentation |
| `POST` | `/sessions/{session_id}/predict/text` | Text-based segmentation |

#### 1.2 Request/Response Schemas

**POST /sessions** (Create Session)
```
Request: multipart/form-data
  - image: File (JPEG, PNG, etc.)

Response: 200 OK
{
  "success": true,
  "session_id": "uuid-string",
  "width": 1800,
  "height": 1200
}
```

**POST /sessions/{session_id}/predict/click**
```
Request: application/json
{
  "points": [[x1, y1], [x2, y2]],
  "labels": [1, 0],           // 1=foreground, 0=background
  "multimask_output": true,
  "use_previous_logits": false
}

Response: 200 OK
{
  "success": true,
  "masks": ["base64-png-1", "base64-png-2", "base64-png-3"],
  "scores": [0.95, 0.87, 0.72],
  "bboxes": [[x1,y1,x2,y2], ...]
}
```

**POST /sessions/{session_id}/predict/text**
```
Request: application/json
{
  "prompt": "car"
}

Response: 200 OK
{
  "success": true,
  "masks": ["base64-png-1", ...],
  "scores": [0.92, ...],
  "bboxes": [[x1,y1,x2,y2], ...],
  "num_instances": 3
}
```

**DELETE /sessions/{session_id}**
```
Response: 200 OK
{
  "success": true
}
```

**GET /health**
```
Response: 200 OK
{
  "status": "ok",
  "sam3_ready": true,
  "device": "cuda",
  "gpu_name": "NVIDIA RTX 3090",
  "sessions_active": 5
}
```

#### 1.3 Implementation Code Structure

```python
# backend/sam3_http_service.py

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import uuid
import os

# Import existing SAM3 service logic
from sam3_service import SAM3Service

app = FastAPI(title="SAM3 HTTP Service")

# CORS for cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_methods=["*"],
    allow_headers=["*"],
)

# Reuse existing SAM3Service class
sam3 = SAM3Service()

# Request models
class ClickPredictRequest(BaseModel):
    points: list[list[float]]
    labels: list[int]
    multimask_output: bool = True
    use_previous_logits: bool = False

class TextPredictRequest(BaseModel):
    prompt: str

# Endpoints implementation...
```

#### 1.4 Running the Service

```bash
# Install dependencies
pip install fastapi uvicorn python-multipart

# Run service
cd /path/to/sam3-interactive/backend
CUDA_VISIBLE_DEVICES=1 python -m uvicorn sam3_http_service:app --host 0.0.0.0 --port 8000

# Or with auto-reload for development
CUDA_VISIBLE_DEVICES=1 python -m uvicorn sam3_http_service:app --host 0.0.0.0 --port 8000 --reload
```

#### 1.5 Systemd Service (Production)

**File:** `/etc/systemd/system/sam3-http.service`

```ini
[Unit]
Description=SAM3 HTTP Service
After=network.target

[Service]
Type=simple
User=hugo
WorkingDirectory=/home/hugo/PycharmProjects/sam3/backend
Environment="CUDA_VISIBLE_DEVICES=1"
ExecStart=/home/hugo/miniconda3/envs/sam3/bin/python -m uvicorn sam3_http_service:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable sam3-http
sudo systemctl start sam3-http
```

---

### Part 2: Backend Changes (Pi/Client Side)

#### 2.1 New Environment Variable

Add to `config/.env.example`:
```env
# SAM3 Remote Service (optional)
# If set, backend uses HTTP client instead of local subprocess
SAM3_REMOTE_URL=http://10.9.0.14:8000
```

#### 2.2 New Module: `backend/sam3_client.js`

HTTP client that mirrors the subprocess interface:

```javascript
// backend/sam3_client.js

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

class SAM3Client {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
        this.client = axios.create({
            baseURL: baseUrl,
            timeout: 120000, // 2 min for large images
        });
    }

    async healthCheck() {
        const response = await this.client.get('/health');
        return response.data;
    }

    async createSession(imagePath) {
        const form = new FormData();
        form.append('image', fs.createReadStream(imagePath));

        const response = await this.client.post('/sessions', form, {
            headers: form.getHeaders(),
        });
        return response.data;
    }

    async predictClick(sessionId, points, labels, options = {}) {
        const response = await this.client.post(
            `/sessions/${sessionId}/predict/click`,
            {
                points,
                labels,
                multimask_output: options.multimaskOutput ?? true,
                use_previous_logits: options.usePreviousLogits ?? false,
            }
        );
        return response.data;
    }

    async predictText(sessionId, prompt) {
        const response = await this.client.post(
            `/sessions/${sessionId}/predict/text`,
            { prompt }
        );
        return response.data;
    }

    async clearSession(sessionId) {
        const response = await this.client.delete(`/sessions/${sessionId}`);
        return response.data;
    }
}

module.exports = SAM3Client;
```

#### 2.3 Modify `backend/server.js`

Add conditional logic to use either local subprocess or remote HTTP:

```javascript
// At top of server.js
const SAM3_REMOTE_URL = process.env.SAM3_REMOTE_URL;

let sam3Client = null;
let sam3Process = null;

if (SAM3_REMOTE_URL) {
    // Use remote HTTP service
    const SAM3Client = require('./sam3_client');
    sam3Client = new SAM3Client(SAM3_REMOTE_URL);
    log(`Using remote SAM3 service at ${SAM3_REMOTE_URL}`);
} else {
    // Use local subprocess (existing code)
    startSAM3Process();
}

// Modify sendCommand to route appropriately
async function sendCommand(command) {
    if (sam3Client) {
        return sendRemoteCommand(command);
    } else {
        return sendLocalCommand(command);
    }
}

async function sendRemoteCommand(command) {
    const { command: cmd, ...params } = command;

    switch (cmd) {
        case 'load_image':
            return sam3Client.createSession(params.image_path);

        case 'predict_click':
            return sam3Client.predictClick(
                params.session_id,
                params.points,
                params.labels,
                {
                    multimaskOutput: params.multimask_output,
                    usePreviousLogits: params.use_previous_logits,
                }
            );

        case 'predict_text':
            return sam3Client.predictText(params.session_id, params.prompt);

        case 'clear_session':
            return sam3Client.clearSession(params.session_id);

        default:
            throw new Error(`Unknown command: ${cmd}`);
    }
}
```

---

### Part 3: Configuration

#### 3.1 GPU Server Configuration

**File:** `config/.env.gpu-server`

```env
# GPU Server - runs SAM3 HTTP service
# No Express backend needed, just the SAM3 service

# SAM3 HTTP Service
SAM3_HTTP_PORT=8000
SAM3_HTTP_HOST=0.0.0.0
CUDA_VISIBLE_DEVICES=1
```

#### 3.2 Raspberry Pi Configuration

**File:** `config/.env.pi`

```env
# Raspberry Pi - runs Express backend + Frontend
# SAM3 inference delegated to GPU server

# Backend
PORT=3001
HOST=0.0.0.0

# Point to remote SAM3 service
SAM3_REMOTE_URL=http://10.9.0.14:8000

# Local data storage
DATA_ROOT=./backend/datasets
UPLOADS_DIR=./backend/uploads

# Frontend (copy to frontend/.env.local)
# VITE_API_URL=http://localhost:3001
```

---

### Part 4: Session Management Considerations

#### 4.1 Session ID Consistency

The backend generates session IDs (UUIDs). These must be passed to the remote SAM3 service.

**Option A: Backend generates ID, passes to SAM3**
```
Pi Backend                    GPU SAM3 Service
    │                              │
    │  POST /sessions              │
    │  X-Session-ID: abc123        │
    │  + image file                │
    │ ─────────────────────────────►
    │                              │
    │  { session_id: "abc123" }    │
    │ ◄─────────────────────────────
```

**Option B: SAM3 generates ID, backend stores mapping**
```
Pi Backend                    GPU SAM3 Service
    │                              │
    │  POST /sessions              │
    │  + image file                │
    │ ─────────────────────────────►
    │                              │
    │  { session_id: "xyz789" }    │
    │ ◄─────────────────────────────
    │                              │
    │  Store: local_id -> xyz789   │
```

**Recommendation:** Option A - backend controls session IDs for consistency.

#### 4.2 Image Transfer

Images need to be sent to the remote SAM3 service. Options:

1. **Multipart upload** (recommended)
   - Send image file directly in POST /sessions
   - Simple, works with any image source
   - Slight network overhead

2. **Shared storage (NFS/S3)**
   - Both machines access same filesystem
   - Pass path instead of file
   - Requires infrastructure setup

3. **Base64 in JSON**
   - Encode image as base64 string
   - ~33% larger payload
   - Simpler API but inefficient

**Recommendation:** Multipart upload for simplicity.

---

### Part 5: Testing

#### 5.1 Test SAM3 HTTP Service Directly

```bash
# Health check
curl http://10.9.0.14:8000/health

# Create session with image
curl -X POST http://10.9.0.14:8000/sessions \
  -F "image=@test_image.jpg"

# Returns: {"success": true, "session_id": "abc123", "width": 1800, "height": 1200}

# Click prediction
curl -X POST http://10.9.0.14:8000/sessions/abc123/predict/click \
  -H "Content-Type: application/json" \
  -d '{"points": [[900, 600]], "labels": [1], "multimask_output": true}'

# Clear session
curl -X DELETE http://10.9.0.14:8000/sessions/abc123
```

#### 5.2 Test from Pi

```bash
# Set environment
export SAM3_REMOTE_URL=http://10.9.0.14:8000

# Start backend
node backend/server.js

# Test via Express API
curl -X POST http://localhost:3001/api/upload -F "image=@test_image.jpg"
curl -X POST http://localhost:3001/api/segment/click \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "...", "points": [[900, 600]], "labels": [1]}'
```

---

### Part 6: Error Handling

#### 6.1 Network Errors

The SAM3 client should handle:
- Connection refused (service down)
- Timeout (slow inference)
- 5xx errors (service errors)

```javascript
// In sam3_client.js
async createSession(imagePath) {
    try {
        const response = await this.client.post('/sessions', form, ...);
        return response.data;
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            throw new Error('SAM3 service unavailable at ' + this.baseUrl);
        }
        if (error.code === 'ETIMEDOUT') {
            throw new Error('SAM3 service timeout - image may be too large');
        }
        throw error;
    }
}
```

#### 6.2 Health Check Endpoint

Backend should check SAM3 service health:

```javascript
// In server.js /api/health endpoint
app.get('/api/health', async (req, res) => {
    const health = {
        status: 'ok',
        databaseReady: true,
        sam3Ready: false,
        sam3Remote: !!SAM3_REMOTE_URL,
    };

    if (sam3Client) {
        try {
            const sam3Health = await sam3Client.healthCheck();
            health.sam3Ready = sam3Health.sam3_ready;
            health.sam3Device = sam3Health.device;
        } catch (e) {
            health.sam3Error = e.message;
        }
    } else {
        health.sam3Ready = isReady;
    }

    res.json(health);
});
```

---

### Part 7: Migration Steps

#### For GPU Server (Colleague's Tasks)

1. **Create `backend/sam3_http_service.py`**
   - FastAPI wrapper around existing SAM3Service
   - Implement all endpoints from Part 1

2. **Test locally**
   ```bash
   python -m uvicorn sam3_http_service:app --port 8000
   curl http://localhost:8000/health
   ```

3. **Deploy as systemd service**
   - Create service file
   - Enable and start

4. **Open firewall**
   ```bash
   sudo ufw allow 8000/tcp
   ```

#### For Pi (After GPU Service is Running)

1. **Add `backend/sam3_client.js`**

2. **Modify `backend/server.js`**
   - Add SAM3_REMOTE_URL check
   - Route commands appropriately

3. **Create `frontend/.env.local`**
   ```env
   VITE_API_URL=http://localhost:3001
   ```

4. **Create `config/.env` or set environment**
   ```env
   SAM3_REMOTE_URL=http://10.9.0.14:8000
   ```

5. **Test end-to-end**

---

## File Summary

| File | Location | Purpose |
|------|----------|---------|
| `sam3_http_service.py` | GPU Server | FastAPI SAM3 service |
| `sam3_client.js` | Pi Backend | HTTP client for remote SAM3 |
| `server.js` (modified) | Pi Backend | Conditional local/remote routing |
| `.env.gpu-server` | GPU Server | GPU server configuration |
| `.env.pi` | Pi | Pi configuration with remote URL |

---

## Timeline Estimate

| Task | Effort |
|------|--------|
| SAM3 HTTP Service (GPU) | 2-3 hours |
| SAM3 Client (Pi) | 1-2 hours |
| Server.js modifications | 1-2 hours |
| Testing & debugging | 2-3 hours |
| **Total** | **6-10 hours** |

---

## Questions for Implementation

1. **Authentication**: Should SAM3 HTTP service require API key?
2. **Rate limiting**: Limit requests per client?
3. **Session cleanup**: Auto-expire sessions after N minutes?
4. **Logging**: Centralized logging for debugging?

---

*Created: 2025-12-30*
*Author: Claude Code*
*For: SAM3 Interactive Segmentation Project*
