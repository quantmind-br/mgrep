#!/bin/bash

# MCP E2E Test Script
# This script starts the mgrep MCP server and launches MCP Inspector for manual testing
# See docs/MCP_TESTING.md for testing procedures

set -e  # Exit on error

echo "======================================"
echo "  mgrep MCP E2E Testing Script"
echo "======================================"
echo ""

# Check if MCP Inspector is installed
if ! command -v mcp-inspector &> /dev/null; then
  echo "Error: MCP Inspector not found"
  echo "Please install with: npm install -g @modelcontextprotocol/inspector"
  exit 1
fi

# Display instructions
echo "This script will:"
echo "  1. Build mgrep"
echo "  2. Start MCP server in background"
echo "  3. Launch MCP Inspector"
echo "  4. Open MCP_TESTING.md in another terminal"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Build mgrep
echo "Building mgrep..."
npm run build > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "Error: Build failed"
  exit 1
fi

echo "Build complete!"
echo ""

# Start MCP server in background
echo "Starting MCP server..."
NODE_ENV=production node dist/commands/watch_mcp.js > /tmp/mcp-server.log 2>&1 &
MCP_PID=$!
echo "MCP server PID: $MCP_PID"
echo ""

# Wait a moment for server to start
sleep 2

# Launch MCP Inspector
echo "Launching MCP Inspector..."
mcp-inspector node dist/commands/watch_mcp.js
echo ""
echo "======================================"
echo "  MCP Inspector should be running now"
echo "======================================"
echo "The MCP server will continue running in the background."
echo "Test procedures are in docs/MCP_TESTING.md"
echo ""
echo "To stop the server, press Ctrl+C or run:"
echo "  kill $MCP_PID"
echo ""

# Cleanup on exit
trap 'echo ""; echo "Stopping MCP server (PID: $MCP_PID)..."; kill $MCP_PID 2>/dev/null; exit' EXIT SIGINT SIGTERM
