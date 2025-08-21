# n8n Integration (DEPRECATED)

**Note: SSE transport and n8n integration have been deprecated and removed from this project.**

The Server-Sent Events (SSE) transport mode and associated n8n integration scripts have been removed to simplify the project and focus on the standard stdio transport mode used by Claude Desktop and other MCP clients.

## Migration

If you need to integrate with external systems, consider:

1. Using the standard MCP protocol over stdio
2. Building a custom integration using the MCP SDK
3. Creating a wrapper service that translates between protocols

## Previous Documentation

The previous n8n integration guide has been preserved for reference but is no longer functional with the current codebase. The following scripts have been removed:

- `n8n-proxy.js`
- `run-inspector.js`
- `sse-inspector-proxy.js`
- `start-n8n-mode.sh`

The SSE transport mode has also been removed from the server configuration.