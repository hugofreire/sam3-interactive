#!/bin/bash

# Start Chrome DevTools MCP Server
# This script launches the Chrome DevTools MCP server for AI coding assistance

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$PROJECT_ROOT/scripts/.chrome-mcp.pid"
LOG_FILE="$PROJECT_ROOT/scripts/chrome-mcp.log"

echo "Starting Chrome DevTools MCP Server..."

# Check if already running
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "Chrome DevTools MCP Server is already running (PID: $PID)"
        exit 0
    else
        echo "Removing stale PID file..."
        rm "$PID_FILE"
    fi
fi

# Start the MCP server in background
cd "$PROJECT_ROOT"
nohup npx -y chrome-devtools-mcp@latest --isolated=true > "$LOG_FILE" 2>&1 &
MCP_PID=$!

# Save PID
echo $MCP_PID > "$PID_FILE"

echo "Chrome DevTools MCP Server started successfully!"
echo "PID: $MCP_PID"
echo "Log file: $LOG_FILE"
echo ""
echo "The MCP server is now running and can be used by Claude Code."
echo "To stop the server, run: ./scripts/stop-chrome-mcp.sh"
