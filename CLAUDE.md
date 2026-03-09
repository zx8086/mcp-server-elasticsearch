# Project: MCP Server Elasticsearch

Elasticsearch MCP server enabling AI assistants to interact with Elasticsearch clusters. 96+ tools across 19 categories for comprehensive operations. Built with TypeScript on Bun runtime.

## Commands

```bash
bun run dev                    # Start dev server with hot reload
bun run build                  # Build production bundle
bun run test                   # Run unit + validation tests
bun run test:all               # All tests (comprehensive)
bun run test:watch             # Live testing during development
bun run lint                   # Biome linting
bun run lint:fix               # Fix linting issues
bun run format                 # Format code

bun run validate-config        # Validate .env configuration
bun run validate-config:full   # Validate + test ES connection
bun run test-connection        # Test Elasticsearch connectivity
LOG_LEVEL=debug bun run dev    # Enable debug logging
```

### Tool Validation (Critical)

Always validate changes by starting the server and calling tools directly:
```bash
bun run build && bun run dev
# In another terminal:
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"elasticsearch_list_indices","arguments":{"limit":5}}}' | bun run dist/index.js
```

Do NOT use `bun run inspector` - it requires browser access.

## Architecture

### Configuration System

Single source of truth pattern: `defaultConfig` object holds all defaults, Zod schemas validate without `.default()`, environment overrides merged before validation. Key file: `src/config.ts`.

### Transport Modes

Set via `MCP_TRANSPORT`: `stdio` (default, CLI/desktop) or `sse` (web/n8n integration). Handling in `src/index.ts`.

### Tool Organization (`src/tools/`)

19 categories: core, document, search, index_management, indices, mapping, alias, cluster, bulk, analytics, advanced, diagnostics, ilm, watcher, template, tasks, enrich, autoscaling, notifications.

### Security Model

- Read-only mode (`src/utils/readOnlyMode.ts`): strict or warning mode
- Security validation (`src/utils/securityEnhancer.ts`): SQL injection, XSS, command injection detection with Elasticsearch-specific exemptions (e.g., `logs-*,metrics-*` patterns)
- Read-only tools skip security validation

### Universal Tool Tracing

All tools automatically traced with LangSmith integration:
- Dynamic tool names in traces
- Input/output capture
- Performance tracking
- Graceful degradation without tracing dependencies

### Tool Registration

All tools use `server.registerTool()` with automatic tracing, security validation, and notifications via a wrapped override in `src/tools/index.ts`. The `server.tool()` API was removed due to MCP SDK v1.17.5 signature incompatibility.

## Key Patterns

### Tool Implementation

```typescript
const validator = z.object({ limit: z.number().optional() });
export const registerTool: ToolRegistrationFunction = (server, esClient) => {
  const handler = async (toolArgs, extra) => {
    const params = validator.parse(toolArgs);
    // ... implementation
    return { content: [{ type: "text", text: "result" }] };
  };
  server.registerTool("tool_name", { title: "...", description: "...", inputSchema: validator.shape }, handler);
};
```

### Error Handling

```typescript
try { /* operation */ }
catch (error) {
  if (error instanceof z.ZodError) throw new McpError(ErrorCode.InvalidParams, `...`);
  throw new McpError(ErrorCode.InternalError, error.message);
}
```

## Dependencies

- Zod 4.x for validation (`zodHelpers.ts` provides coercion helpers)
- `@elastic/elasticsearch` client with retry logic, API key and user/pass auth, SSL/TLS
- `@modelcontextprotocol/sdk` for MCP protocol

## Testing

Organized test structure: `tests/unit/`, `tests/integration/`, `tests/validation/`, `tests/infrastructure/`, `tests/dev/`, `tests/regression/`, `tests/docs/`, `tests/utils/`. See `docs/TESTING_STRATEGY_ANALYSIS.md`.

## Documentation

Essential guides in `docs/`: MCP_DEVELOPMENT_PATTERNS, AGENT_DEVELOPMENT_INSTRUCTIONS, PARAMETER_DEBUGGING_GUIDE, LANGSMITH_TRACING_IMPLEMENTATION, PAGINATION_AUDIT_REPORT, DEPLOYMENT, MCP_FILTERING_SYSTEM.

## Guardrails

- Always search for existing implementations before creating new files
- Always create validation tests after making code changes
- Check existing tests with `bun test` to understand current coverage
- Review `docs/` for patterns and solutions before implementing

## Current Focus

Maintenance and stability.
