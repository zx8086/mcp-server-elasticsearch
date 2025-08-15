#!/usr/bin/env bash

# This script starts both the MCP server and the n8n proxy
# This allows n8n to connect through the proxy to the MCP server

# Kill any existing processes
pkill -f "bun run src/index.ts" || true
pkill -f "bun run scripts/n8n-proxy.js" || true

# Start the MCP server in the background
echo "Starting Elasticsearch MCP Server..."
bun run dev > server.log 2>&1 &
SERVER_PID=$!

# Wait for the server to start
echo "Waiting for server to start..."
sleep 3

# Check if server started successfully
if ! ps -p $SERVER_PID > /dev/null; then
  echo "Failed to start server. Check server.log for details."
  exit 1
fi

# Start the n8n proxy in the background
echo "Starting n8n proxy..."
bun run n8n-proxy > proxy.log 2>&1 &
PROXY_PID=$!

# Wait for the proxy to start
echo "Waiting for proxy to start..."
sleep 2

# Check if proxy started successfully
if ! ps -p $PROXY_PID > /dev/null; then
  echo "Failed to start proxy. Check proxy.log for details."
  kill $SERVER_PID
  exit 1
fi

echo "
╔══════════════════════════════════════════════════════════════════╗
║           Elasticsearch MCP Server + n8n Proxy                   ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Server running on:                                              ║
║    - http://192.168.178.4:8081/sse (direct SSE endpoint)         ║
║                                                                  ║
║  n8n-compatible proxy running on:                                ║
║    - http://192.168.178.4:8085/sse (n8n endpoint)                ║
║                                                                  ║
║  In n8n, configure the MCP Client with:                          ║
║    - SSE Endpoint URL: http://192.168.178.4:8085/sse             ║
║    - Authentication: None                                        ║
║                                                                  ║
║  Press Ctrl+C to stop both server and proxy                      ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
"

# Function to handle shutdown
function cleanup {
  echo "Shutting down..."
  kill $PROXY_PID
  kill $SERVER_PID
  echo "Shutdown complete."
  exit 0
}

# Register the cleanup function for Ctrl+C
trap cleanup SIGINT SIGTERM

# Show logs in real-time
tail -f server.log proxy.log

# Keep the script running
wait $SERVER_PID $PROXY_PID
