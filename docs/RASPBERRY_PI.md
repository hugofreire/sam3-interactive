# Raspberry Pi Development Guide

> **Purpose:** Tips, workarounds, and solutions for running SAM3 Interactive on Raspberry Pi.

## Initial Setup (First Time)

Run the setup script to install all dependencies:

```bash
./scripts/raspberry-pi/setup.sh
```

This installs:
- `pipewire-v4l2` - Webcam bridge for browser access
- Chrome symlink for DevTools MCP
- Node.js dependencies (backend + frontend)
- Frontend utility files
- Environment configuration for remote SAM3

---

## Quick Start on Pi

### Option 1: Manual Start (Recommended for Development)

```bash
# Terminal 1: Start backend with remote SAM3
SAM3_REMOTE_URL=http://10.9.0.14:8000 node backend/server.js

# Terminal 2: Start frontend
cd frontend && npm run dev

# Terminal 3: Start Chrome with DevTools MCP (for Claude Code automation)
DISPLAY=:0 ./scripts/common/start-chrome-mcp.sh
```

Then open in browser: **http://localhost:5173/kiosk**

### Option 2: All-in-One Script

```bash
./scripts/common/start-chrome-mcp.sh http://localhost:5173/kiosk
```

### Verify Services Are Running

```bash
# Backend health (should show sam3Remote: true)
curl -s http://localhost:3001/api/health | python3 -m json.tool

# Frontend (Vite dev server)
curl -s http://localhost:5173 | head -5

# Chrome DevTools MCP
curl -s http://localhost:9222/json/version
```

---

## Kiosk Mode Workflow

The kiosk UI (`/kiosk`) is optimized for touch screens and Raspberry Pi:

1. **Open Project** or **New Project**
2. **Labels** - Define object classes (e.g., "truck", "car")
3. **Images** - Add images via:
   - **Camera** - Capture from USB webcam
   - **Upload** - Select files from disk
4. **Labeling** - Click to segment, assign labels, save crops
5. **Training** - Train YOLO11 model on labeled data
6. **Export** - Export to YOLO/HEF format

---

## Architecture: Pi + Remote GPU

The Pi runs frontend + backend, but SAM3 inference is offloaded to a GPU server:

```
┌─────────────────────────┐         ┌──────────────────────────────┐
│   Raspberry Pi          │  HTTP   │   GPU Server (10.9.0.14)     │
│   ─────────────────     │ ──────► │   ──────────────────────     │
│   Frontend (Vite)       │   API   │   SAM3 HTTP Service (:8000)  │
│   Backend (Express)     │ ◄────── │   RTX 3090 + CUDA            │
│   Browser (Chromium)    │  masks  │                              │
└─────────────────────────┘         └──────────────────────────────┘
```

**Key:** Set `SAM3_REMOTE_URL` in `.env` to use remote GPU for inference.

---

## Common Issues & Solutions

### 1. Chrome DevTools MCP Not Finding Browser

**Problem:**
```
Could not find Google Chrome executable at /opt/google/chrome/chrome
```

**Attempted Solutions (didn't work):**
- ❌ Set `CHROME_PATH=/usr/bin/chromium` env var
- ❌ Set `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` env var
- ❌ Use `--cdpUrl=http://localhost:9222` flag in MCP config

**Final Solution:**
```bash
sudo mkdir -p /opt/google/chrome
sudo ln -sf /usr/bin/chromium /opt/google/chrome/chrome
```

The `chrome-devtools-mcp` package has hardcoded Chrome paths. Creating a symlink is the simplest workaround.

---

### 2. Frontend Build Error: Missing @/lib/utils

**Problem:**
```
Failed to resolve import "@/lib/utils" from "src/kiosk/components/TouchButton.tsx"
```

**Solution:** Create the missing utility file:

```bash
mkdir -p frontend/src/lib
```

**File:** `frontend/src/lib/utils.ts`
```typescript
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

Dependencies should already be installed (`clsx`, `tailwind-merge`). If not:
```bash
cd frontend && npm install clsx tailwind-merge
```

---

### 3. Frontend Port Conflict

**Problem:**
```
Port 5173 is in use, trying another one...
```

**Solution:** Vite auto-switches to next available port (5174, 5175, etc.)

Check which port it's using in the terminal output:
```
VITE v7.2.4  ready in 451 ms
  ➜  Local:   http://localhost:5174/    <-- Note the port
```

To kill processes on a specific port:
```bash
pkill -f "vite"
# or
lsof -ti:5173 | xargs kill -9
```

---

### 4. Webcam Not Working in Browser (Black Screen)

**Problem:** Camera button in kiosk mode shows black video, capture doesn't work.

**Cause:** PipeWire (Raspberry Pi OS's audio/video server) can't access USB V4L2 cameras without a bridge.

**Solution:** Install `pipewire-v4l2`:

```bash
sudo apt update
sudo apt install pipewire-v4l2
```

This package bridges USB V4L2 cameras to PipeWire, allowing browsers (Chromium) to access the camera via WebRTC/getUserMedia.

**Verify camera is detected:**
```bash
# List video devices
v4l2-ctl --list-devices

# Should show your camera, e.g.:
# Global Shutter Camera: Global S (usb-xhci-hcd.1-1):
#     /dev/video1
#     /dev/video2
```

**Test camera in browser:**
1. Open `chrome://settings/content/camera` in Chromium
2. Select your camera from dropdown
3. Allow camera access when prompted in kiosk mode

**Still not working?** Check permissions:
```bash
# Add user to video group
sudo usermod -aG video $USER

# Logout and login, or:
newgrp video
```

---

### 5. SAM3 Service Not Available

**Problem:**
```
{"sam3Ready":false}
```

**Cause:** Pi doesn't have PyTorch/CUDA installed.

**Solution:** Use remote SAM3 service. Set in `.env`:
```env
SAM3_REMOTE_URL=http://10.9.0.14:8000
```

Verify remote service is running:
```bash
curl http://10.9.0.14:8000/health
```

---

### 6. Backend Module Not Found

**Problem:**
```
Cannot find module 'express'
# or
Cannot find module 'axios'
```

**Solution:** Install dependencies:
```bash
cd backend && npm install
```

After `git pull`, always reinstall if `package.json` changed.

---

## Key Configuration Files

| File | Purpose | Pi-Specific |
|------|---------|-------------|
| `.env` | `SAM3_REMOTE_URL=http://10.9.0.14:8000` | Points to GPU server |
| `.mcp.json` | Chrome DevTools MCP config | Uses Chromium |
| `~/.claude/claude_mcp_config.json` | Global Claude MCP config | Chromium path |
| `/opt/google/chrome/chrome` | Symlink → `/usr/bin/chromium` | Required for MCP |
| `frontend/src/lib/utils.ts` | Tailwind utility | May need creation |

---

## Pi-Specific Environment

**`.env` for Raspberry Pi:**
```env
# Remote SAM3 (required - Pi has no GPU)
SAM3_REMOTE_URL=http://10.9.0.14:8000

# Backend
PORT=3001
HOST=0.0.0.0
```

**`.mcp.json` for Raspberry Pi:**
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"],
      "env": {
        "CHROME_PATH": "/usr/bin/chromium",
        "PUPPETEER_EXECUTABLE_PATH": "/usr/bin/chromium",
        "DISPLAY": ":0"
      }
    }
  }
}
```

---

## Useful Commands

```bash
# Check if on Raspberry Pi
uname -m  # Returns "aarch64" for Pi 5

# Check remote SAM3 service
curl -s http://10.9.0.14:8000/health | grep sam3_ready

# Check backend health
curl -s http://localhost:3001/api/health

# Check browser debug port
curl -s http://localhost:9222/json/version

# Start everything
./scripts/common/start-chrome-mcp.sh http://localhost:5173/kiosk

# Stop everything
./scripts/common/stop-chrome-mcp.sh

# Check Hailo AI Kit (if installed)
./scripts/raspberry-pi/hailo_check.sh
```

---

## Troubleshooting Checklist

**Services:**
- [ ] Is `SAM3_REMOTE_URL` set? (`echo $SAM3_REMOTE_URL`)
- [ ] Is the GPU server reachable? (`ping 10.9.0.14`)
- [ ] Is SAM3 HTTP service running? (`curl http://10.9.0.14:8000/health`)
- [ ] Is backend running? (`curl http://localhost:3001/api/health`)
- [ ] Is frontend running? (`curl http://localhost:5173`)

**Dependencies:**
- [ ] Backend deps installed? (`cd backend && npm install`)
- [ ] Frontend deps installed? (`cd frontend && npm install`)

**Chrome DevTools MCP:**
- [ ] Does `/opt/google/chrome/chrome` symlink exist?
- [ ] Is `DISPLAY=:0` set for GUI operations?
- [ ] Is Chrome running with remote debugging? (`curl http://localhost:9222/json/version`)

**Webcam/Camera:**
- [ ] Is `pipewire-v4l2` installed? (`dpkg -l | grep pipewire-v4l2`)
- [ ] Is camera detected? (`v4l2-ctl --list-devices`)
- [ ] Is user in video group? (`groups | grep video`)

---

## Scripts Organization

Scripts are organized by platform:

```
scripts/
├── common/                    # Both platforms
│   ├── start-chrome-mcp.sh    # Start Chrome + DevTools MCP
│   ├── stop-chrome-mcp.sh     # Stop Chrome + MCP
│   └── debug_port_bind.sh     # Debug port binding issues
│
├── raspberry-pi/              # Raspberry Pi only
│   ├── setup.sh               # Initial Pi setup (run first!)
│   ├── hailo_check.sh         # Check Hailo AI Kit status
│   ├── hailo_camera.py        # Live camera inference with Hailo
│   └── rpi5_inference.py      # YOLO inference (NCNN/Hailo)
│
├── gpu-server/                # GPU server only
│   ├── verify_setup.py        # Verify SAM3/PyTorch/CUDA setup
│   ├── sam3-http.service      # Systemd unit for SAM3 service
│   └── convert_to_hef.sh      # Convert ONNX to Hailo HEF
│
└── eval/                      # Model evaluation & benchmarks
    ├── gold/                  # Gold standard evaluation
    ├── silver/                # Silver dataset tools
    └── veval/                 # Video evaluation
```

---

*Last updated: 2025-12-31*
