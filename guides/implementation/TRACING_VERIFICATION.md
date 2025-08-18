# LangSmith Tracing Verification Guide

## Current Status

✅ **Tracing is implemented and configured** in your MCP Elasticsearch server. The implementation includes:

1. **Configuration**: LangSmith settings are properly configured in your Claude Desktop settings
2. **Initialization**: Tracing initializes when the server starts (confirmed by logs)
3. **Tool Wrapping**: The cluster health tool has been converted to use tracing
4. **Environment Variables**: All required variables are set in your Claude Desktop config

## How to Verify Traces are Working

### 1. Check Server Logs

When you use the server through Claude Desktop, look for these log messages:

```
✅ LangSmith tracing initialized
Registering cluster health tool with tracing...
🔍 Executing tool WITH TRACING: elasticsearch_get_cluster_health
```

### 2. View Traces in LangSmith Dashboard

1. Go to: https://smith.langchain.com
2. Sign in with your account
3. Navigate to your project: **elasticsearch-mcp-server**
4. Look for traces with names like:
   - `MCP Connection`
   - `Tool Execution`
   - `ES: cluster.health`

### 3. Trace Structure

When working correctly, you should see this hierarchy:

```
📊 MCP Connection (stdio-xxx)
└── 🔧 Tool: elasticsearch_get_cluster_health
    └── 🔍 ES: cluster.health
```

## Troubleshooting

### If Traces Don't Appear

1. **Check API Key**: Verify your API key is valid
   ```bash
   curl -X GET https://api.smith.langchain.com/info \
     -H "X-API-Key: YOUR_LANGSMITH_API_KEY_HERE"
   ```

2. **Check Project**: Ensure the project exists in LangSmith
   - Go to https://smith.langchain.com
   - Check if "elasticsearch-mcp-server" project exists
   - If not, create it manually

3. **Enable Debug Logging**: Add to your Claude Desktop config:
   ```json
   "LOG_LEVEL": "debug"
   ```

4. **Test Standalone**: Run the test script
   ```bash
   bun run scripts/test-tracing.ts
   ```

### Converting More Tools to Use Tracing

To convert additional tools to use tracing, follow this pattern:

1. Import the tracing wrapper:
```typescript
import { registerTracedTool } from "../../utils/toolWrapper.js";
import { traceElasticsearchCall } from "../../utils/toolWrapper.js";
```

2. Replace `server.tool()` with `registerTracedTool()`:
```typescript
// Before
server.tool("tool_name", description, schema, handler);

// After
registerTracedTool(server, esClient, {
  name: "tool_name",
  description: description,
  inputSchema: schema,
  operationType: "read", // or "write" or "destructive"
  handler: async (esClient, args) => {
    // Your implementation
  }
});
```

3. Wrap Elasticsearch calls:
```typescript
const result = await traceElasticsearchCall(
  "operation_name",
  index,
  async () => esClient.someOperation(params),
  metadata
);
```

## Current Implementation Status

### ✅ Completed
- LangSmith dependencies installed
- Configuration system updated
- Tracing service module created
- Tool wrapper implementation
- Connection-level tracing
- Performance monitoring
- Cluster health tool converted to use tracing

### 🔄 Tools Using Tracing
- `elasticsearch_get_cluster_health` ✅
- `elasticsearch_search` ✅ (example implementation)

### ⏳ Tools to Convert
- All other tools in `/src/tools/` directory need to be converted to use `registerTracedTool()`

## Configuration in Claude Desktop

Your current configuration in Claude Desktop settings:

```json
{
  "elasticsearch-mcp-server": {
    "command": "bun",
    "args": [
      "/Users/SOwusu/WebstormProjects/mcp-server-elasticsearch/dist/index.js"
    ],
    "env": {
      "LANGSMITH_TRACING": "true",
      "LANGSMITH_API_KEY": "YOUR_LANGSMITH_API_KEY_HERE",
      "LANGSMITH_PROJECT": "elasticsearch-mcp-server",
      "LANGSMITH_ENDPOINT": "https://api.smith.langchain.com",
      // ... other env vars
    }
  }
}
```

## Next Steps

1. **Convert More Tools**: Gradually convert all tools to use the tracing wrapper
2. **Monitor Performance**: Check trace latencies in LangSmith dashboard
3. **Add Custom Metadata**: Enhance traces with more contextual information
4. **Set Up Alerts**: Configure alerts in LangSmith for slow operations

## Testing

To test if tracing is working:

1. **Through Claude Desktop**: 
   - Ask Claude to "check elasticsearch cluster health"
   - Watch the logs for tracing messages
   - Check LangSmith dashboard for new traces

2. **Standalone Test**:
   ```bash
   bun run scripts/test-tracing.ts
   ```

3. **MCP Inspector**:
   ```bash
   bun run inspector
   ```
   Then execute tools and check LangSmith dashboard