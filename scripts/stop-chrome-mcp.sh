#!/bin/bash

# Stop Chrome DevTools MCP Server
# This script stops the running Chrome DevTools MCP server

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$PROJECT_ROOT/scripts/.chrome-mcp.pid"
LOG_FILE="$PROJECT_ROOT/scripts/chrome-mcp.log"

echo "Stopping Chrome DevTools MCP Server..."

# Check if PID file exists
if [ ! -f "$PID_FILE" ]; then
    echo "Chrome DevTools MCP Server is not running (no PID file found)"

    # Clean up any orphaned processes
    echo "Checking for orphaned chrome-devtools-mcp processes..."
    ORPHANED_PIDS=$(pgrep -f "chrome-devtools-mcp" || true)

    if [ -n "$ORPHANED_PIDS" ]; then
        echo "Found orphaned processes: $ORPHANED_PIDS"
        echo "Killing orphaned processes..."
        pkill -f "chrome-devtools-mcp" || true
        echo "Orphaned processes terminated"
    else
        echo "No orphaned processes found"
    fi

    exit 0
fi

# Read PID
PID=$(cat "$PID_FILE")

# Check if process is running
if ! ps -p "$PID" > /dev/null 2>&1; then
    echo "Chrome DevTools MCP Server is not running (process $PID not found)"
    rm "$PID_FILE"
    exit 0
fi

# Stop the process
echo "Stopping process $PID..."
kill "$PID" 2>/dev/null || true

# Wait for process to stop (max 10 seconds)
TIMEOUT=10
COUNTER=0
while ps -p "$PID" > /dev/null 2>&1 && [ $COUNTER -lt $TIMEOUT ]; do
    sleep 1
    COUNTER=$((COUNTER + 1))
done

# Force kill if still running
if ps -p "$PID" > /dev/null 2>&1; then
    echo "Process did not stop gracefully, forcing..."
    kill -9 "$PID" 2>/dev/null || true
fi

# Remove PID file
rm "$PID_FILE"

echo "Chrome DevTools MCP Server stopped successfully!"

# Show last few lines of log if exists
if [ -f "$LOG_FILE" ]; then
    echo ""
    echo "Last 10 lines of log:"
    tail -n 10 "$LOG_FILE"
fi
