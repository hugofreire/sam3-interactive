#!/bin/bash

# Start Chrome/Chromium with DevTools MCP Server
# This script launches a browser with remote debugging and the MCP server for AI coding assistance

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$PROJECT_ROOT/scripts/.chrome-mcp.pid"
BROWSER_PID_FILE="$PROJECT_ROOT/scripts/.browser.pid"
LOG_FILE="$PROJECT_ROOT/scripts/chrome-mcp.log"
BROWSER_LOG_FILE="$PROJECT_ROOT/scripts/browser.log"

DEBUG_PORT="${CHROME_DEBUG_PORT:-9222}"
START_URL="${1:-about:blank}"
export DISPLAY="${DISPLAY:-:0}"

# Detect available browser
detect_browser() {
    if command -v google-chrome &> /dev/null; then
        echo "google-chrome"
    elif command -v google-chrome-stable &> /dev/null; then
        echo "google-chrome-stable"
    elif command -v chromium &> /dev/null; then
        echo "chromium"
    elif command -v chromium-browser &> /dev/null; then
        echo "chromium-browser"
    elif [ -x "/opt/google/chrome/chrome" ]; then
        echo "/opt/google/chrome/chrome"
    elif [ -x "/usr/bin/chromium" ]; then
        echo "/usr/bin/chromium"
    else
        echo ""
    fi
}

BROWSER=$(detect_browser)

if [ -z "$BROWSER" ]; then
    echo "❌ Error: No Chrome or Chromium browser found!"
    echo "Please install Google Chrome or Chromium."
    exit 1
fi

echo "🌐 Detected browser: $BROWSER"
echo "🔧 Debug port: $DEBUG_PORT"

# Check if browser already running with debug port
if curl -s "http://localhost:$DEBUG_PORT/json/version" > /dev/null 2>&1; then
    echo "✅ Browser already running with debug port $DEBUG_PORT"
else
    echo "🚀 Starting browser with remote debugging..."

    # Kill any existing browser on debug port
    if [ -f "$BROWSER_PID_FILE" ]; then
        OLD_PID=$(cat "$BROWSER_PID_FILE")
        if ps -p "$OLD_PID" > /dev/null 2>&1; then
            echo "   Stopping old browser instance (PID: $OLD_PID)..."
            kill "$OLD_PID" 2>/dev/null || true
            sleep 1
        fi
        rm "$BROWSER_PID_FILE"
    fi

    # Start browser with remote debugging
    nohup "$BROWSER" \
        --remote-debugging-port="$DEBUG_PORT" \
        --no-first-run \
        --no-default-browser-check \
        --disable-background-mode \
        "$START_URL" \
        > "$BROWSER_LOG_FILE" 2>&1 &

    BROWSER_PID=$!
    echo $BROWSER_PID > "$BROWSER_PID_FILE"
    echo "   Browser started (PID: $BROWSER_PID)"

    # Wait for browser to be ready
    echo "   Waiting for browser to be ready..."
    for i in {1..10}; do
        if curl -s "http://localhost:$DEBUG_PORT/json/version" > /dev/null 2>&1; then
            echo "   ✅ Browser ready!"
            break
        fi
        sleep 1
    done
fi

echo ""
echo "Starting Chrome DevTools MCP Server..."

# Check if MCP already running
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "✅ Chrome DevTools MCP Server is already running (PID: $PID)"
        exit 0
    else
        echo "   Removing stale PID file..."
        rm "$PID_FILE"
    fi
fi

# Start the MCP server in background
cd "$PROJECT_ROOT"
nohup npx -y chrome-devtools-mcp@latest --isolated=true > "$LOG_FILE" 2>&1 &
MCP_PID=$!

# Save PID
echo $MCP_PID > "$PID_FILE"

echo ""
echo "✅ Chrome DevTools MCP Server started successfully!"
echo "   MCP PID: $MCP_PID"
echo "   Browser: $BROWSER"
echo "   Debug port: $DEBUG_PORT"
echo "   Log file: $LOG_FILE"
echo ""
echo "The MCP server is now running and can be used by Claude Code."
echo "To stop everything, run: ./scripts/stop-chrome-mcp.sh"
