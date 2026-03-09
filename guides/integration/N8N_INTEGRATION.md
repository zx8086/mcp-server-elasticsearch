# Integrating with n8n

This document provides instructions for integrating the Elasticsearch MCP Server with n8n using the MCP Client node.

## Configuration

The Elasticsearch MCP Server can run in two transport modes:
- **stdio**: Standard input/output (default for CLI usage)
- **sse**: Server-Sent Events (for web integration, like n8n)

For n8n integration, you need to use the SSE transport mode.

## Setting Up the Server

1. Make sure your `.env` file has the following settings:
   ```
   # Transport Mode Configuration
   MCP_TRANSPORT=sse
   
   # Port Configuration (used for SSE transport)
   MCP_PORT=8081
   ```

2. Install the required dependencies:
   ```bash
   bun install
   ```

3. Start the Elasticsearch MCP Server:
   ```bash
   bun run dev
   # or
   bun run build && bun run start
   ```

4. Verify in the logs that the server started successfully with SSE transport:
   ```
    Elasticsearch MCP Server started successfully with SSE on port 8081
   ```

## Configuring n8n

1. In your n8n workflow, add the MCP Client node (`n8n-nodes-langchain.toolmcp`).

2. Configure the node with these settings:
   - **SSE Endpoint**: `http://localhost:8081/sse`
   - **Authentication**: None (or configure as needed)
   - **Tools to Include**: All (or select specific tools)

3. The SSE connection will establish a session and provide an endpoint for sending commands. The session ID is generated automatically and handled by the protocol.

## Testing the Connection

1. Add a simple test workflow in n8n with these nodes:
   - **Start** → **MCP Client** → **Debug**

2. In the MCP Client node, use a simple query like listing Elasticsearch indices:
   ```json
   {
     "tool": "elasticsearch_list_indices",
     "args": {
       "indexPattern": "*"
     }
   }
   ```

3. Run the workflow and check the Debug output to verify that the connection is working.

## Troubleshooting

If you encounter issues with the n8n connection:

1. Check that the Elasticsearch MCP server is running with SSE transport mode
2. Verify the logs for any errors
3. Ensure n8n can connect to the MCP server (network connectivity)
4. Check that your Elasticsearch instance is accessible
5. Verify that the port (8081 by default) is open and accessible
6. Check the browser console for any connection errors

## How It Works

When using SSE transport mode:

1. The n8n MCP Client connects to the `/sse` endpoint to establish a session
2. The server sends an initial message with the session ID
3. The n8n client then sends commands to the `/mcp` endpoint with the session ID
4. The server routes these commands to the right session and processes them
5. Responses are sent back through the SSE connection

## Switching Transport Modes

To switch between transport modes, update the `MCP_TRANSPORT` environment variable:

- For stdio mode: `MCP_TRANSPORT=stdio`
- For SSE mode: `MCP_TRANSPORT=sse`

Then restart the server for the changes to take effect.