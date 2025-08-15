# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Elasticsearch MCP (Model Context Protocol) Server that enables AI assistants to interact with Elasticsearch clusters. It's built with TypeScript on the Bun runtime and provides 60+ tools for comprehensive Elasticsearch operations.

## Essential Commands

### Development
```bash
bun run dev                    # Start development server with hot reload
bun run build                  # Build production bundle
bun run test                   # Run tests
bun run lint                   # Run ESLint
bun run format                 # Format with Prettier
```

### Configuration & Validation
```bash
bun run validate-config        # Validate .env configuration
bun run validate-config:full   # Validate config + test ES connection
bun run test-connection        # Test Elasticsearch connectivity
```

### Debugging
```bash
bun run inspector              # MCP protocol inspector (stdio mode)
bun run inspector:sse          # MCP inspector for SSE mode
LOG_LEVEL=debug bun run dev    # Enable debug logging
```

### n8n Integration
```bash
bun run n8n-mode               # Start server + n8n proxy together
bun run connectivity-test      # Test n8n connectivity
```

## Architecture & Key Patterns

### Configuration System
The project uses a type-safe, layered configuration system:
- **Primary**: Environment variables (`.env` file)
- **Validation**: Zod schemas in `src/config.ts`
- **Structure**: Defaults → Environment → Validation → Runtime

Key configuration files:
- `src/config.ts`: Central configuration with Zod schemas
- `src/validation.ts`: Environment and connection validation
- `.env.example`: Configuration template

### Transport Modes
The server supports two transport modes (set via `MCP_TRANSPORT`):
1. **stdio** (default): Standard I/O for CLI/desktop usage
2. **sse**: Server-Sent Events for web integration (n8n)

Transport handling is in `src/index.ts`.

### Tool Organization
Tools are organized by functionality in `src/tools/`:
- `core/`: Essential operations (search, list, mappings)
- `document/`: CRUD operations
- `search/`: Advanced search features
- `index_management/`: Index operations
- `cluster/`: Cluster monitoring
- `bulk/`: Bulk operations
- `analytics/`: Analytics and aggregations
- `ilm/`: Index Lifecycle Management
- `watcher/`: Watcher integration
- `template/`: Template management

Each tool category has an index file that exports all tools.

### Security Model
Read-only mode implementation in `src/utils/readOnlyMode.ts`:
- **Strict mode**: Blocks all write/destructive operations
- **Warning mode**: Allows operations with warnings
- Operations classified as: read, write, or destructive

### Error Handling
Consistent error handling pattern:
```typescript
try {
  // Operation
} catch (error) {
  logger.error('Operation failed', { error });
  throw new McpError(ErrorCode.InternalError, 'User-friendly message');
}
```

### Logging
MCP-compatible logging in `src/utils/logger.ts`:
- Respects `LOG_LEVEL` environment variable
- Structured logging with metadata
- Integration with MCP protocol

## Development Workflow

### Adding New Tools
1. Create tool file in appropriate category under `src/tools/`
2. Implement using existing patterns (see `src/tools/core/search.ts` as reference)
3. Export from category index file
4. Add to main tools array in `src/server.ts`

### Testing Changes
1. Update `.env` with test cluster details
2. Run `bun run validate-config:full` to verify connection
3. Use `bun run inspector` to test tool interactively
4. Run `bun run test` for unit tests

### Building for Production
1. Run `bun run build`
2. Output in `dist/` directory
3. Single bundled file with all dependencies

## Key Implementation Details

### Elasticsearch Client
- Client initialization in `src/server.ts`
- Supports API key and username/password auth
- SSL/TLS configuration with custom CA support
- Connection pooling and retry logic

### MCP Protocol Implementation
- Uses `@modelcontextprotocol/sdk`
- Server creation in `src/server.ts`
- Tool registration with metadata and validation
- Structured error responses

### Type Safety
- TypeScript strict mode enabled
- Zod schemas for runtime validation
- Comprehensive type definitions for all tools
- Input/output validation for each operation

## Critical Dependencies

### ⚠️ Version Compatibility Required
The project requires specific versions of Zod and zod-to-json-schema for compatibility:
- **zod**: 3.23.8 (NOT 4.x)
- **zod-to-json-schema**: 3.23.5

**Important**: Zod 4.x is incompatible with zod-to-json-schema 3.x and will cause tools to fail silently in Claude Desktop.

## Common Patterns

### Tool Implementation Pattern
```typescript
export const toolName = {
  name: 'tool_name',
  description: 'Clear description',
  inputSchema: zodSchema,
  handler: async (client: Client, args: ValidatedArgs, logger: Logger) => {
    // Implementation
  }
};
```

### Configuration Access
```typescript
import { getConfig } from './config';
const config = getConfig();
```

### Validation Pattern
```typescript
const schema = z.object({
  field: z.string().describe('Field description')
});
type Args = z.infer<typeof schema>;
```

## Important Notes

- Always validate environment configuration before making changes
- Use read-only mode for production monitoring scenarios
- Test with MCP inspector when adding new tools
- Follow existing error handling and logging patterns
- Maintain backward compatibility with tool interfaces