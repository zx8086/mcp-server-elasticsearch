# Connecting to n8n

This guide provides specific instructions for connecting your Elasticsearch MCP Server to n8n.

## Quick Start

The easiest way to get started is to use the n8n-mode script which starts both the server and an n8n-compatible proxy:

```bash
# Install dependencies
bun install

# Start the server and proxy
bun run n8n-mode
```

This will start:
1. The Elasticsearch MCP Server on port 8081
2. An n8n-compatible proxy on port 8085

## Configuring n8n

In n8n, add the MCP Client node and configure it with:

- Transport Type: SSE
- SSE Endpoint URL: `http://192.168.178.4:8085/sse` 
- Authentication: None
- Include All Tools: Yes (or select specific tools)

The proxy handles all the connection details between n8n and the Elasticsearch MCP Server.

## Manual Setup

If you prefer to run the server and proxy separately:

1. Start the MCP server:
   ```bash
   bun run dev
   ```

2. Start the n8n proxy:
   ```bash
   bun run n8n-proxy
   ```

3. Configure n8n as described above.

## Troubleshooting

If you're having connection issues:

1. Verify the server is running with `curl`:
   ```bash
   curl -N -H "Accept: text/event-stream" http://192.168.178.4:8081/sse
   ```

2. Verify the proxy is running with `curl`:
   ```bash
   curl -N -H "Accept: text/event-stream" http://192.168.178.4:8085/sse
   ```

3. Check the server and proxy logs for any error messages.

4. Try the connectivity test server to verify basic n8n connectivity:
   ```bash
   bun run connectivity-test
   ```
   Then in n8n, try connecting to:
   ```
   http://192.168.178.4:8082/ping
   ```

## Common Issues

- **Docker networking**: If n8n is running in Docker with host networking, it should be able to access the proxy directly.
- **Firewall**: Ensure ports 8081 and 8085 are accessible.
- **SSE compatibility**: The proxy ensures compatibility between n8n's SSE client and the MCP server.

For more detailed troubleshooting steps, see [N8N_TROUBLESHOOTING.md](./N8N_TROUBLESHOOTING.md).
