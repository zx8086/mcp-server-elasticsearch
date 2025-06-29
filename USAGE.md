# Using the MCP Inspector with Elasticsearch MCP Server

This document provides instructions for using the MCP Inspector with the Elasticsearch MCP Server.

## Installation

First, install the necessary dependencies:

```bash
bun install
```

## Running with Inspector

There are two ways to use the MCP Inspector with the Elasticsearch MCP Server:

### 1. For STDIO Mode (Default)

```bash
# Build and run inspector
bun run build:inspector
```

This will build the server and run it in stdio mode with the inspector.

### 2. For SSE Mode

For SSE mode, you need to run two separate processes:

1. **First terminal** - Start the server with SSE mode:
   ```bash
   bun run dev
   ```

2. **Second terminal** - Start the proxy for the inspector:
   ```bash
   bun run proxy:sse
   ```

3. **In your browser** - Open the MCP Inspector manually:
   - Go to http://localhost:6274/
   - Set Transport Type to `SSE`
   - Set the MCP URL to `http://localhost:6278/mcp`
   - Set the SSE URL to `http://localhost:6278/sse`
   - Click "Connect"

The proxy will forward requests between the inspector and your server.

## Troubleshooting

If the inspector cannot connect:

1. Make sure your server is running with the correct transport mode
2. Check that ports are not being blocked by a firewall
3. If you're using SSE mode, make sure the proxy is running
4. Look for error messages in both terminal windows
5. Try restarting both the server and inspector
6. Make sure all dependencies are installed with `bun install`

## Using with n8n

For n8n integration, follow the instructions in [N8N_INTEGRATION.md](./N8N_INTEGRATION.md).
