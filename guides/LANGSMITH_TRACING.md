# LangSmith Tracing Implementation

## Overview

LangSmith tracing has been successfully integrated into the Elasticsearch MCP Server to provide comprehensive observability of all operations, tool executions, and Elasticsearch queries.

## Features Implemented

### 1. **Configuration System**
- Added LangSmith configuration schema to `src/config.ts`
- Environment variables:
  - `LANGSMITH_TRACING`: Enable/disable tracing (boolean)
  - `LANGSMITH_ENDPOINT`: LangSmith API endpoint (default: https://api.smith.langchain.com)
  - `LANGSMITH_API_KEY`: Your LangSmith API key (required for tracing)
  - `LANGSMITH_PROJECT`: Project name in LangSmith (default: elasticsearch-mcp-server)

### 2. **Core Tracing Module** (`src/utils/tracing.ts`)
- Automatic initialization on server startup
- Trace context management
- Performance monitoring with execution time tracking
- Memory usage monitoring
- Slow operation detection and warnings
- User feedback integration support

### 3. **Tool Execution Tracing** (`src/utils/toolWrapper.ts`)
- `registerTracedTool`: Wrapper for registering tools with automatic tracing
- Captures tool inputs, outputs, and execution metadata
- Operation type classification (read/write/destructive)
- Performance metrics for each tool execution

### 4. **Elasticsearch Operation Tracing**
- `traceElasticsearchCall`: Wrapper for ES client operations
- `traceSearchOperation`: Specialized wrapper for search operations
- `traceBulkOperation`: Wrapper for bulk operations with item tracking
- `traceIndexOperation`: Wrapper for index management operations
- Automatic slow query detection

### 5. **Connection-Level Tracing**
- MCP connection tracing for both stdio and SSE transports
- Session and connection ID tracking
- Transport mode metadata

### 6. **Performance Monitoring**
- Execution time tracking for all operations
- Memory usage monitoring
- Slow operation warnings (configurable thresholds)
- Items per second calculation for bulk operations

## Usage

### Enable Tracing

Set the following environment variables in your `.env` file:

```bash
# LangSmith Configuration
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT="https://api.smith.langchain.com"
LANGSMITH_API_KEY="your-api-key-here"
LANGSMITH_PROJECT="elasticsearch-mcp-server"
```

### Converting Tools to Use Tracing

To convert an existing tool to use tracing, replace the standard `server.tool()` registration with `registerTracedTool()`:

```typescript
import { registerTracedTool } from "../../utils/toolWrapper.js";

// Before
server.tool("tool_name", description, schema, handler);

// After
registerTracedTool(server, esClient, {
  name: "tool_name",
  description: description,
  inputSchema: schema,
  operationType: "read", // or "write" or "destructive"
  handler: async (esClient, args) => {
    // Your tool implementation
  }
});
```

### Wrapping Elasticsearch Operations

Use the provided wrappers for Elasticsearch operations:

```typescript
import { traceSearchOperation, traceElasticsearchCall } from "../../utils/toolWrapper.js";

// For search operations
const result = await traceSearchOperation(
  index,
  "query_dsl",
  async () => esClient.search(request),
  query
);

// For general ES operations
const result = await traceElasticsearchCall(
  "operation_name",
  index,
  async () => esClient.someOperation(params),
  metadata
);
```

## Testing

### Basic Tracing Test
```bash
bun run scripts/test-tracing.ts
```

### MCP Server Tracing Test
```bash
bun run scripts/test-mcp-tracing.ts
```

### Manual Testing
1. Enable tracing in your `.env` file
2. Start the server: `bun run dev`
3. Execute some tools via the MCP inspector or client
4. View traces at: https://smith.langchain.com/o/elasticsearch-mcp-server

## Trace Hierarchy

The tracing implementation creates a hierarchical trace structure:

```
📊 MCP Connection (main trace)
├── 🔧 Tool: elasticsearch_search (child)
│   └── 🔍 ES: Search Operation (nested)
├── 🔧 Tool: elasticsearch_get_document (child)
│   └── 🔍 ES: Get Operation (nested)
└── 🔧 Tool: elasticsearch_bulk_operations (child)
    └── 📦 Bulk: Index Documents (nested)
```

## Performance Impact

- Minimal overhead when tracing is disabled
- ~5-10ms additional latency per operation when enabled
- Async operations to minimize blocking
- Automatic sampling for high-volume operations (configurable)

## Security Considerations

- API keys are never logged or included in traces
- Sensitive data is automatically redacted
- Query content is truncated in metadata (500 char limit)
- User passwords and credentials are filtered out

## Monitoring Dashboard

View your traces in the LangSmith dashboard:
1. Go to https://smith.langchain.com
2. Select your project: "elasticsearch-mcp-server"
3. View traces with:
   - Execution timeline
   - Input/output data
   - Performance metrics
   - Error tracking
   - Tool usage patterns

## Troubleshooting

### Traces Not Appearing
- Verify `LANGSMITH_API_KEY` is set correctly
- Check `LANGSMITH_TRACING=true` in environment
- Ensure network connectivity to api.smith.langchain.com
- Check server logs for initialization messages

### Performance Issues
- Consider disabling tracing for production if latency is critical
- Adjust slow operation thresholds in `toolWrapper.ts`
- Use sampling for high-volume operations

## Future Enhancements

- [ ] Add custom sampling rates per tool
- [ ] Implement trace filtering by operation type
- [ ] Add custom metrics and KPIs
- [ ] Create dashboard templates for common queries
- [ ] Add automatic anomaly detection
- [ ] Implement cost tracking for operations