# Chrome DevTools MCP Server Setup

This project now includes Chrome DevTools MCP (Model Context Protocol) server integration, which allows Claude Code to control and inspect a live Chrome browser for debugging, testing, and performance analysis.

## What is Chrome DevTools MCP?

Chrome DevTools MCP gives AI coding assistants access to the full power of Chrome DevTools for:
- **Performance Analysis**: Record traces and extract performance insights
- **Advanced Debugging**: Analyze network requests, take screenshots, check console output
- **Reliable Automation**: Automate browser actions using Puppeteer
- **DOM Inspection**: Inspect and manipulate DOM elements in real-time
- **JavaScript Execution**: Execute JavaScript in the page context

## Installation

The MCP server has been installed in this project:

```bash
# Already installed in backend/node_modules
cd backend
npm install --save-dev chrome-devtools-mcp
```

## Configuration

The MCP server is configured in `.claude/mcp.json`:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--isolated=true"
      ]
    }
  }
}
```

**Configuration Options:**
- `--isolated=true`: Uses a temporary Chrome profile that's auto-cleaned after shutdown
- `--headless=true`: Run Chrome without UI (optional)
- `--channel=canary`: Use Chrome Canary instead of stable (optional)
- `--viewport=1280x720`: Set initial window size (optional)

## Usage

### Start the MCP Server

```bash
./scripts/start-chrome-mcp.sh
```

This will:
- Start Chrome DevTools MCP server in the background
- Save the process ID to `.chrome-mcp.pid`
- Log output to `scripts/chrome-mcp.log`

### Stop the MCP Server

```bash
./scripts/stop-chrome-mcp.sh
```

This will:
- Gracefully stop the MCP server
- Clean up PID file
- Kill any orphaned processes
- Show the last 10 lines of the log

### Check Server Status

```bash
# Check if running
ps aux | grep chrome-devtools-mcp

# View logs
tail -f scripts/chrome-mcp.log
```

## Using with Claude Code

Once the MCP server is running, you can use it with Claude Code:

**Example Prompts:**

1. **Performance Testing:**
   ```
   Check the performance of http://localhost:5173
   ```

2. **Debugging:**
   ```
   Open http://localhost:5173, take a screenshot, and check the console for errors
   ```

3. **Network Analysis:**
   ```
   Navigate to http://localhost:3001/api/health and show me the network requests
   ```

4. **DOM Inspection:**
   ```
   Open the app and find all canvas elements on the page
   ```

5. **Automation:**
   ```
   Open http://localhost:5173, upload test_image.jpg, and click on coordinates (500, 500)
   ```

## Integration with SAM3 Web App

The Chrome DevTools MCP server is particularly useful for this project:

### Frontend Testing
```
Open http://localhost:5173, check if the canvas renders properly
```

### Performance Analysis
```
Analyze the performance of the InteractiveCanvas component
```

### API Debugging
```
Monitor network requests to /api/segment/click and show the response times
```

### UI Automation
```
Automate the workflow: upload an image, click on it, and verify masks appear
```

## Troubleshooting

### Server won't start
```bash
# Check if port is already in use
lsof -i | grep chrome

# Kill orphaned processes
./scripts/stop-chrome-mcp.sh

# Try starting again
./scripts/start-chrome-mcp.sh
```

### Chrome not launching
```bash
# Check Chrome is installed
which google-chrome

# Check Node.js version (requires v20.19+)
node --version
```

### Check logs
```bash
cat scripts/chrome-mcp.log
```

## Architecture

```
┌─────────────────┐
│   Claude Code   │
│   (MCP Client)  │
└────────┬────────┘
         │ MCP Protocol
         ▼
┌─────────────────┐
│ Chrome DevTools │
│   MCP Server    │
│  (Node.js)      │
└────────┬────────┘
         │ Chrome DevTools Protocol
         ▼
┌─────────────────┐
│  Chrome Browser │
│  (Isolated)     │
└─────────────────┘
```

## Resources

- **Official GitHub**: https://github.com/ChromeDevTools/chrome-devtools-mcp
- **Blog Post**: https://developer.chrome.com/blog/chrome-devtools-mcp
- **npm Package**: https://www.npmjs.com/package/chrome-devtools-mcp
- **MCP Documentation**: https://docs.claude.com/en/docs/claude-code/mcp

## Requirements

- **Node.js**: v20.19 or newer
- **Chrome**: Current stable release or newer
- **npm**: Standard package manager

## Notes

- The MCP server automatically launches Chrome when needed
- Chrome runs in isolated mode by default (temporary profile)
- The server communicates with Claude Code via the Model Context Protocol
- Process management is handled by the start/stop scripts
- Logs are stored in `scripts/chrome-mcp.log`

---

**Ready to debug and test with AI-powered browser automation!** 🚀

*Last updated: 2025-11-23*
