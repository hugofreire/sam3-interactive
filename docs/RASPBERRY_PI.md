# Raspberry Pi Development Guide

> **Purpose:** Tips, workarounds, and solutions for running SAM3 Interactive on Raspberry Pi.

## Quick Start on Pi

```bash
# 1. Start backend with remote SAM3
node backend/server.js

# 2. Start frontend
cd frontend && npm run dev -- --host 0.0.0.0

# 3. Start browser with MCP (optional)
./scripts/start-chrome-mcp.sh http://localhost:5173/kiosk
```

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

### 4. SAM3 Service Not Available

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

### 5. Backend Module Not Found

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
./scripts/start-chrome-mcp.sh http://localhost:5173/kiosk

# Stop everything
./scripts/stop-chrome-mcp.sh
```

---

## Troubleshooting Checklist

- [ ] Is `SAM3_REMOTE_URL` set in `.env`?
- [ ] Is the GPU server reachable? (`ping 10.9.0.14`)
- [ ] Is SAM3 HTTP service running? (`curl http://10.9.0.14:8000/health`)
- [ ] Are backend dependencies installed? (`cd backend && npm install`)
- [ ] Are frontend dependencies installed? (`cd frontend && npm install`)
- [ ] Does `/opt/google/chrome/chrome` symlink exist?
- [ ] Is `DISPLAY=:0` set for GUI operations?

---

*Last updated: 2025-12-30*
