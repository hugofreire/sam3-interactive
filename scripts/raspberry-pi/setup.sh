#!/bin/bash
#
# Raspberry Pi Setup for SAM3 Interactive
#
# This script installs all dependencies needed to run the SAM3 Interactive
# web app on a Raspberry Pi with remote SAM3 inference.
#
# Usage:
#   ./scripts/raspberry-pi/setup.sh
#
# What it does:
#   1. Installs system packages (pipewire-v4l2 for webcam, v4l-utils)
#   2. Creates Chrome symlink for DevTools MCP
#   3. Installs Node.js dependencies
#   4. Creates frontend utility files if missing
#   5. Sets up environment for remote SAM3
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo -e "${BLUE}========================================"
echo "  SAM3 Interactive - Raspberry Pi Setup"
echo -e "========================================${NC}"
echo ""
echo "Project root: $PROJECT_ROOT"
echo ""

# Check if running on Raspberry Pi
ARCH=$(uname -m)
if [ "$ARCH" != "aarch64" ]; then
    echo -e "${YELLOW}Warning: This script is designed for Raspberry Pi (aarch64).${NC}"
    echo "Detected architecture: $ARCH"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 1. System packages
echo -e "${BLUE}[1/6] Installing system packages...${NC}"
echo "      - pipewire-v4l2 (webcam bridge for browsers)"
echo "      - v4l-utils (camera utilities)"
echo ""

sudo apt update
sudo apt install -y pipewire-v4l2 v4l-utils

echo -e "${GREEN}      Done!${NC}"
echo ""

# 2. Chrome symlink for DevTools MCP
echo -e "${BLUE}[2/6] Setting up Chrome DevTools MCP...${NC}"

if [ -L "/opt/google/chrome/chrome" ]; then
    echo -e "${GREEN}      Symlink already exists${NC}"
elif [ -f "/usr/bin/chromium" ]; then
    echo "      Creating symlink: /opt/google/chrome/chrome -> /usr/bin/chromium"
    sudo mkdir -p /opt/google/chrome
    sudo ln -sf /usr/bin/chromium /opt/google/chrome/chrome
    echo -e "${GREEN}      Done!${NC}"
else
    echo -e "${YELLOW}      Warning: Chromium not found at /usr/bin/chromium${NC}"
    echo "      Install with: sudo apt install chromium"
fi
echo ""

# 3. Add user to video group (for camera access)
echo -e "${BLUE}[3/6] Checking video group membership...${NC}"

if groups | grep -q video; then
    echo -e "${GREEN}      User already in video group${NC}"
else
    echo "      Adding user to video group..."
    sudo usermod -aG video $USER
    echo -e "${YELLOW}      NOTE: You may need to logout and login for this to take effect${NC}"
fi
echo ""

# 4. Install Node.js dependencies
echo -e "${BLUE}[4/6] Installing Node.js dependencies...${NC}"

echo "      Installing backend dependencies..."
cd "$PROJECT_ROOT/backend"
npm install

echo "      Installing frontend dependencies..."
cd "$PROJECT_ROOT/frontend"
npm install

echo -e "${GREEN}      Done!${NC}"
echo ""

# 5. Create frontend utils.ts if missing
echo -e "${BLUE}[5/6] Checking frontend utilities...${NC}"

UTILS_FILE="$PROJECT_ROOT/frontend/src/lib/utils.ts"
if [ -f "$UTILS_FILE" ]; then
    echo -e "${GREEN}      utils.ts already exists${NC}"
else
    echo "      Creating frontend/src/lib/utils.ts..."
    mkdir -p "$PROJECT_ROOT/frontend/src/lib"
    cat > "$UTILS_FILE" << 'EOF'
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
EOF
    echo -e "${GREEN}      Done!${NC}"
fi
echo ""

# 6. Setup environment
echo -e "${BLUE}[6/6] Checking environment configuration...${NC}"

ENV_FILE="$PROJECT_ROOT/.env"
if [ -f "$ENV_FILE" ]; then
    if grep -q "SAM3_REMOTE_URL" "$ENV_FILE"; then
        echo -e "${GREEN}      SAM3_REMOTE_URL already configured in .env${NC}"
    else
        echo "      Adding SAM3_REMOTE_URL to .env..."
        echo "" >> "$ENV_FILE"
        echo "# Remote SAM3 service (GPU server)" >> "$ENV_FILE"
        echo "SAM3_REMOTE_URL=http://10.9.0.14:8000" >> "$ENV_FILE"
        echo -e "${GREEN}      Done!${NC}"
    fi
else
    echo "      Creating .env with SAM3_REMOTE_URL..."
    cat > "$ENV_FILE" << 'EOF'
# SAM3 Interactive - Raspberry Pi Configuration

# Remote SAM3 service (GPU server)
SAM3_REMOTE_URL=http://10.9.0.14:8000

# Backend
PORT=3001
HOST=0.0.0.0
EOF
    echo -e "${GREEN}      Done!${NC}"
fi
echo ""

# Summary
echo -e "${GREEN}========================================"
echo "  Setup Complete!"
echo -e "========================================${NC}"
echo ""
echo "Next steps:"
echo ""
echo "  1. Start the backend:"
echo -e "     ${BLUE}SAM3_REMOTE_URL=http://10.9.0.14:8000 node backend/server.js${NC}"
echo ""
echo "  2. Start the frontend:"
echo -e "     ${BLUE}cd frontend && npm run dev${NC}"
echo ""
echo "  3. Open in browser:"
echo -e "     ${BLUE}http://localhost:5173/kiosk${NC}"
echo ""
echo "  4. (Optional) Start Chrome with DevTools MCP:"
echo -e "     ${BLUE}./scripts/common/start-chrome-mcp.sh${NC}"
echo ""

# Verify camera
echo "Checking camera..."
if v4l2-ctl --list-devices 2>/dev/null | grep -q "video"; then
    echo -e "${GREEN}Camera detected!${NC}"
    v4l2-ctl --list-devices 2>/dev/null | head -5
else
    echo -e "${YELLOW}No camera detected. Connect a USB webcam for image capture.${NC}"
fi
echo ""

echo "For troubleshooting, see: docs/RASPBERRY_PI.md"
