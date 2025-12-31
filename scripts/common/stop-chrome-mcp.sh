#!/bin/bash

# Stop Chrome/Chromium and DevTools MCP Server
# This script stops the browser and MCP server started by start-chrome-mcp.sh

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"
PID_FILE="$SCRIPTS_DIR/.chrome-mcp.pid"
BROWSER_PID_FILE="$SCRIPTS_DIR/.browser.pid"
LOG_FILE="$SCRIPTS_DIR/chrome-mcp.log"

STOP_BROWSER="${STOP_BROWSER:-true}"

# Function to stop a process by PID file
stop_process() {
    local pid_file="$1"
    local name="$2"

    if [ ! -f "$pid_file" ]; then
        echo "   $name: no PID file found"
        return 0
    fi

    local pid=$(cat "$pid_file")

    if ! ps -p "$pid" > /dev/null 2>&1; then
        echo "   $name: not running (process $pid not found)"
        rm "$pid_file"
        return 0
    fi

    echo "   $name: stopping (PID: $pid)..."
    kill "$pid" 2>/dev/null || true

    # Wait for process to stop (max 5 seconds)
    local timeout=5
    local counter=0
    while ps -p "$pid" > /dev/null 2>&1 && [ $counter -lt $timeout ]; do
        sleep 1
        counter=$((counter + 1))
    done

    # Force kill if still running
    if ps -p "$pid" > /dev/null 2>&1; then
        echo "   $name: forcing kill..."
        kill -9 "$pid" 2>/dev/null || true
    fi

    rm "$pid_file"
    echo "   $name: ✅ stopped"
}

echo "🛑 Stopping Chrome DevTools MCP..."
echo ""

# Stop MCP server
stop_process "$PID_FILE" "MCP Server"

# Stop browser (unless STOP_BROWSER=false)
if [ "$STOP_BROWSER" = "true" ]; then
    stop_process "$BROWSER_PID_FILE" "Browser"
else
    echo "   Browser: skipped (STOP_BROWSER=false)"
fi

# Clean up any orphaned MCP processes
echo ""
echo "Checking for orphaned processes..."
ORPHANED_PIDS=$(pgrep -f "chrome-devtools-mcp" || true)

if [ -n "$ORPHANED_PIDS" ]; then
    echo "   Found orphaned MCP processes: $ORPHANED_PIDS"
    pkill -f "chrome-devtools-mcp" || true
    echo "   ✅ Orphaned processes terminated"
else
    echo "   No orphaned processes found"
fi

echo ""
echo "✅ Chrome DevTools MCP stopped!"

# Show last few lines of log if exists
if [ -f "$LOG_FILE" ]; then
    echo ""
    echo "Last 5 lines of MCP log:"
    tail -n 5 "$LOG_FILE" 2>/dev/null || true
fi
