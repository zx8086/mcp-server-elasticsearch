# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Elasticsearch MCP (Model Context Protocol) Server that enables AI assistants to interact with Elasticsearch clusters. It's built with TypeScript on the Bun runtime and provides 104+ tools for comprehensive Elasticsearch operations.

## Essential Commands

### Development
```bash
bun run dev                    # Start development server with hot reload
bun run build                  # Build production bundle
bun run test                   # Run tests
bun run lint                   # Run ESLint
bun run lint:fix               # Format with Biome
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
LOG_LEVEL=debug bun run dev    # Enable debug logging
```

### Connectivity Testing
```bash
bun run connectivity-test      # Test connectivity
```

### Monitoring System (Optional)
The server includes comprehensive Prometheus metrics collection:
- **Auto-detected**: No environment variables required
- **Graceful degradation**: Works without `prom-client` installed  
- **Default port**: 9090 for metrics endpoint
- **Endpoints**: `/metrics` (Prometheus) and `/health` (health check)
- **Metrics**: 50+ metrics covering performance, errors, and system health

```bash
# Install optional dependency to enable monitoring
bun add prom-client

# Server automatically detects and enables monitoring
# No configuration required - metrics available at:
# http://localhost:9090/metrics (Prometheus scraping)
# http://localhost:9090/health  (Health check)

# Check if monitoring is active
curl http://localhost:9090/health
```

**Note**: Monitoring is completely optional and does not affect core functionality. The system gracefully operates without monitoring dependencies.

## Architecture & Key Patterns

### Configuration System
The project uses a type-safe, layered configuration system with single source of truth for defaults:
- **Primary**: Environment variables (`.env` file)
- **Validation**: Zod schemas in `src/config.ts`
- **Structure**: Defaults → Environment → Validation → Runtime

#### Configuration Architecture Pattern:
```typescript
// ✅ SINGLE SOURCE OF TRUTH: Defaults in defaultConfig object only
const defaultConfig: Config = {
  server: { name: "elasticsearch-mcp-server", version: "0.1.1", /* ... */ },
  elasticsearch: { url: "http://localhost:9200", /* ... */ },
  // ...
};

// ✅ CLEAN SCHEMAS: No .default() calls - pure validation
const ServerConfigSchema = z.object({
  name: z.string().min(1),           // No .default()
  version: z.string().min(1),        // No .default()
  readOnlyMode: z.boolean(),         // No .default()
  // ...
});

// ✅ MERGE PATTERN: Environment overrides defaults
const envConfig = loadConfigFromEnv();
const mergedConfig = {
  server: { ...defaultConfig.server, ...envConfig.server },
  elasticsearch: { ...defaultConfig.elasticsearch, ...envConfig.elasticsearch },
  // ...
};

// ✅ VALIDATION: Schemas validate merged config
config = ConfigSchema.parse(mergedConfig);
```

**Benefits of This Pattern:**
- **Single Source of Truth**: All defaults centralized in `defaultConfig` object
- **No Redundancy**: Eliminates duplicate defaults in Zod schemas and config object
- **Clear Separation**: Schemas handle validation, defaultConfig handles defaults
- **Maintainability**: Changes to defaults only need to be made in one place

Key configuration files:
- `src/config.ts`: Central configuration with Zod schemas and single default source
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
Multi-layered security implementation:

#### Read-Only Mode (`src/utils/readOnlyMode.ts`):
- **Strict mode**: Blocks all write/destructive operations
- **Warning mode**: Allows operations with warnings
- Operations classified as: read, write, or destructive

#### Security Validation (`src/utils/securityEnhancer.ts`):
- **Comprehensive validation**: SQL injection, XSS, command injection detection
- **Elasticsearch exemptions**: Legitimate patterns like `logs-*,metrics-*` are allowed
- **Read-only tool exemptions**: Search and listing tools skip security validation

**Critical Pattern for Elasticsearch:**
```typescript
// Security validation with Elasticsearch-specific exemptions
const isElasticsearchField = field.toLowerCase().includes('index');
const isIndexPattern = /^[a-zA-Z0-9\-_*,.\s]+$/.test(value) && value.includes('*');

// Skip command injection checks for legitimate Elasticsearch index patterns
if (category === 'command_injection' && isElasticsearchField && isIndexPattern) {
  continue; // Allow patterns like "logs-*,metrics-*"
}
```

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

### Universal Tool Tracing
Production-ready tracing system with LangSmith integration:
- **Dynamic Tool Names**: Each tool trace appears with its actual name (e.g., `elasticsearch_search`)
- **Input/Output Capture**: Both tool parameters and results captured in traces
- **Automatic Wrapping**: All tools are traced without conditional checks
- **Performance Tracking**: Execution time and performance metrics captured
- **Graceful Degradation**: Works without tracing dependencies installed
- **Universal Pattern**: Implementation works for any MCP server

#### Tracing Implementation Pattern:
```typescript
// Universal tool tracing function with proper input capture
export function traceToolExecution(toolName: string, toolArgs: any, extra: any, handler: (toolArgs: any, extra: any) => Promise<any>) {
  const toolTracer = traceable(
    async (inputs: any) => { // ← Accepts inputs for LangSmith capture
      const startTime = Date.now();
      
      try {
        const result = await handler(toolArgs, extra);
        const executionTime = Date.now() - startTime;
        
        return {
          ...result,
          _trace: { runId: currentRun?.id, executionTime, project }
        };
      } catch (error) {
        // Error tracking and re-throw
        throw error;
      }
    },
    {
      name: toolName, // Dynamic tool name for proper identification
      run_type: "tool",
      project_name: project, // Ensure traces go to correct project
    }
  );

  // Pass structured inputs to capture in trace
  return toolTracer({
    tool_name: toolName,
    arguments: toolArgs,     // User parameters
    extra_context: extra,    // MCP context
    timestamp: new Date().toISOString(),
  });
}

// Tool registration with automatic tracing and security validation
server.tool = (name: string, description: string, inputSchema: any, handler: any) => {
  // Enhanced handler with tracing
  let enhancedHandler = async (toolArgs: any, extra: any) => {
    return traceToolExecution(name, toolArgs, extra, handler);
  };
  
  // Add security validation for write operations
  const readOnlyTools = ["elasticsearch_search", "elasticsearch_list_indices", "elasticsearch_get_mappings", "elasticsearch_get_shards"];
  if (!readOnlyTools.includes(name)) {
    enhancedHandler = withSecurityValidation(name, enhancedHandler);
  }
  
  return originalTool(name, description, inputSchema, enhancedHandler);
};
```

This pattern ensures every tool execution is automatically traced with proper input/output capture in LangSmith.

### Production Readiness Features
The server includes enterprise-grade infrastructure components:

- **Circuit Breakers**: Automatic fault tolerance for Elasticsearch operations with configurable thresholds
- **Connection Pooling**: Health monitoring with automatic failover and load balancing strategies  
- **Multi-tier Caching**: Intelligent caching with pattern recognition (query, mapping, settings, cluster caches)
- **Rate Limiting**: Configurable limits for tools and connections with burst handling
- **Health Monitoring**: Comprehensive health checks every 30 seconds with detailed reporting
- **Connection Warming**: Pre-warming and keep-alive mechanisms for optimal performance
- **Optional Monitoring**: Prometheus metrics (50+ metrics, auto-detected, no configuration required)
- **Read-only Mode**: Production safety with strict/warning modes for monitoring scenarios
- **Resource Management**: Memory thresholds, request limits, and automatic resource monitoring
- **Enhanced Error Handling**: Structured MCP-compliant errors with detailed logging and redaction
- **Universal Tool Tracing**: Automatic LangSmith tracing for all tools with dynamic naming and performance tracking

All infrastructure components are automatically initialized and require no manual configuration.

## Development Workflow

### Documentation Structure
The project uses a comprehensive documentation system:
- **Root**: `README.md` (main project docs) and `CLAUDE.md` (this file)
- **guides/**: Complete development knowledge base with 11+ comprehensive guides
- **dev-testing/**: Development test files and debugging scripts

**Essential Reading for MCP Development:**
- `guides/MCP_DEVELOPMENT_PATTERNS.md` - Complete MCP development patterns
- `guides/AGENT_DEVELOPMENT_INSTRUCTIONS.md` - AI agent specific instructions
- `guides/PARAMETER_DEBUGGING_GUIDE.md` - Quick troubleshooting guide

### Important: Always Check Existing Code First
**Before creating any new files or modifying existing ones:**
1. Search for existing implementations using `Grep` or `Glob`
2. Check if tests already exist in the `tests/` directory
3. Review related files to understand existing patterns
4. Avoid creating duplicate functionality
5. Run existing tests with `bun test` to understand current coverage
6. **Review guides/**: Check comprehensive documentation for patterns and solutions

### Critical: Always Create Validation Tests
**After making any code changes or fixes:**
1. Create specific tests to validate the fix works as expected
2. Test edge cases and error conditions
3. Verify the fix handles real-world data correctly
4. Run the new tests to confirm they pass
5. Include tests that would have caught the original bug

### Adding New Tools
1. Create tool file in appropriate category under `src/tools/`
2. Implement using existing patterns (see `src/tools/core/search.ts` as reference)
3. Export from category index file
4. Add to main tools array in `src/server.ts`

### Testing Strategy

The project uses an organized test structure with different categories for different purposes:

```
tests/
├── unit/                     # Fast, isolated unit tests
│   ├── config/              # Configuration validation
│   ├── tools/               # Individual tool tests
│   ├── utils/               # Utility function tests
│   └── schemas/             # Schema validation
│
├── integration/             # Tests requiring Elasticsearch
│   ├── tools/              # Tool integration tests
│   ├── generated/          # Auto-generated tests
│   └── e2e/                # End-to-end workflows
│
├── validation/              # MCP parameter validation
│   ├── natural-params/     # Natural parameter tests
│   ├── mcp-protocol/       # MCP protocol tests
│   └── search/             # Search validation
│
├── infrastructure/          # System infrastructure tests
│   ├── monitoring/         # Prometheus, Grafana
│   ├── caching/           # Cache system
│   ├── performance/       # Performance benchmarks
│   ├── health/            # Health checks
│   └── security/          # Audit trail, security
│
├── dev/                    # Development & debugging
│   ├── manual/            # Manual test scripts
│   ├── debug/             # Debug utilities
│   └── fixtures/          # Test data
│
└── docs/                   # Test documentation
    ├── coverage/          # Coverage reports
    └── strategies/        # Test strategies
```

### Testing Commands

#### Primary Testing (Recommended for Daily Development)
```bash
bun run test                   # Run unit + validation tests (fast, reliable)
bun run test:all               # Run all tests (comprehensive)
bun run test:watch             # Live testing during development
```

#### Category-Specific Testing
```bash
bun run test:unit              # Unit tests only (fastest)
bun run test:integration       # Integration tests (requires ES)
bun run test:validation        # Parameter validation tests
bun run test:infrastructure    # Infrastructure tests
```

#### Subcategory Testing
```bash
bun run test:config            # Configuration tests
bun run test:tools             # Tool integration tests
bun run test:e2e               # End-to-end workflows
bun run test:monitoring        # Monitoring & metrics tests
bun run test:performance       # Performance benchmarks
bun run test:security          # Security & audit tests
```

#### Special Test Modes
```bash
bun run test:coverage          # Test coverage analysis
bun run test:ci                # CI/CD optimized tests
bun run test:pre-deploy        # Pre-deployment validation
bun run test:working           # Working test suite (legacy)
bun run test:dev               # Development manual tests
```

#### Testing Workflow (Recommended)
```bash
# Regular Development:
bun run test                   # Unit + validation tests (< 30 seconds)
bun run test:config            # After config changes

# Before Commits:
bun run validate-config        # Environment validation
bun run test:ci                # CI optimized tests
bun run test-connection        # Elasticsearch connectivity

# Pre-Deployment:
bun run test:pre-deploy        # Comprehensive pre-deployment suite
bun run test:performance       # Performance validation
bun run test:coverage          # Coverage analysis
```

#### Development Testing
```bash
bun run inspector              # MCP protocol testing
bun run test:dev               # Manual development tests
# Development files available in tests/dev/manual/
```

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

### Critical MCP Parameter Handling
**ESSENTIAL**: The MCP SDK requires Zod schema objects in `server.tool()` calls for proper parameter extraction.

#### The JSON Schema vs Zod Schema Issue:
```typescript
// ❌ BROKEN: JSON Schema (parameters lost)
const schema = {
  type: "object",
  properties: {
    limit: { type: "number", minimum: 1, maximum: 100 }
  }
};
server.tool("name", "description", schema, handler);

// ✅ FIXED: Zod Schema (parameters flow correctly)
server.tool("name", "description", {
  limit: z.number().min(1).max(100).optional()
}, handler);
```

**Symptoms of JSON Schema Issue:**
- User sends `{limit: 50}` but handler receives `{limit: 20}` (defaults applied)
- Parameters are completely lost or incorrect
- Handler receives MCP protocol context instead of user arguments

**Solution**: Always use Zod schema objects directly in tool registration. All 78+ tools have been converted to use this pattern.

## Critical Dependencies

### Zod 3.x Support with Compatibility Wrapper
The project uses Zod 3.x with a custom compatibility wrapper for enhanced JSON Schema conversion:
- **zod**: 3.23.8 (Zod 3 with stable ecosystem support)
- **zod-to-json-schema**: 3.23.5 (Primary conversion library)
- **Compatibility wrapper**: `src/utils/zodToJsonSchema.ts`

The compatibility wrapper enhances zod-to-json-schema with:
- Enhanced transform schema handling (coercion helpers from `zodHelpers.ts`)
- Special cases like `z.record()`, `z.object({}).passthrough()`
- Improved conversion to JSON Schema Draft 7 format
- Better handling of required/optional fields with defaults
- Fallback support for complex schemas that standard conversion can't handle

## Common Patterns

### Tool Implementation Pattern
```typescript
// Define Zod validator
const toolValidator = z.object({
  limit: z.number().min(1).max(100).optional(),
  summary: z.boolean().optional(),
  index: z.string().optional(),
});

type ToolParams = z.infer<typeof toolValidator>;

// Tool registration function
export const registerToolName: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const handler = async (toolArgs: any, extra: any): Promise<SearchResult> => {
    try {
      // ALWAYS validate parameters
      const params = toolValidator.parse(toolArgs);
      
      // Tool implementation
      const result = await esClient.someOperation({
        // Use params.* here
      });
      
      return {
        content: [{
          type: "text",
          text: "Response content"
        }],
      };
    } catch (error) {
      // Proper error handling
      if (error instanceof z.ZodError) {
        throw new McpError(ErrorCode.InvalidParams, `Validation failed: ${error.errors.map(e => e.message).join(", ")}`);
      }
      throw new McpError(ErrorCode.InternalError, error.message);
    }
  };

  // Register with Zod schema (NOT JSON schema)
  server.tool(
    "tool_name",
    "Tool description with examples",
    {
      limit: z.number().min(1).max(100).optional(),
      summary: z.boolean().optional(),
      index: z.string().optional(),
    }, // ← Zod schema object directly
    handler
  );
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

## Multi-Agent Development System

This project leverages a sophisticated multi-agent system for development, analysis, and maintenance tasks. The system includes specialized agents that can be orchestrated for complex workflows.

### Available Specialized Agents

**Core Development Agents:**
- `mcp-developer`: Expert MCP developer for protocol implementation, SDK usage, and JSON-RPC compliance
- `bun-developer`: Bun runtime specialist for performance optimization, native APIs, and ES2023+ features
- `svelte5-developer`: Svelte 5 and SvelteKit expert with live documentation access via MCP server
- `graphql-specialist`: GraphQL Yoga v5.x and Houdini expert for API development and federation
- `config-manager`: Environment variable and configuration management with Zod validation expertise

**Infrastructure & Operations:**
- `k6-performance-specialist`: K6 load testing expert for performance validation and bottleneck analysis
- `couchbase-capella-specialist`: Database optimization and troubleshooting expert for N1QL queries
- `observability-engineer`: OpenTelemetry specialist for logging, tracing, metrics, and APM
- `deployment-bun-svelte-specialist`: CI/CD pipeline optimization expert for GitHub Actions workflows
- `refactoring-specialist`: Code transformation and design pattern expert for safe refactoring

**Orchestration Agents:**
- `meta-orchestrator`: Complex multi-step task coordination with workflow planning
- `agent-organizer`: Multi-agent team assembly and workflow optimization
- `multi-agent-coordinator`: Parallel execution and dependency management
- `context-manager`: Information storage and synchronization across agents

### Agent Orchestration Example

This comprehensive documentation update was performed using coordinated multi-agent analysis:

```bash
# 1. Task Analysis
meta-orchestrator → Analyzed documentation gaps and infrastructure issues

# 2. Specialized Analysis  
mcp-developer → Found monitoring integration missing in server startup
config-manager → Validated environment variable documentation
observability-engineer → Reviewed metrics and monitoring architecture

# 3. Context Synthesis
context-manager → Consolidated findings across all system components
agent-organizer → Assembled documentation update requirements

# 4. Coordinated Implementation
All agents → Contributed specialized knowledge for comprehensive updates
```

### Usage Patterns

**For Complex Analysis:**
```
@meta-orchestrator @context-manager @mcp-developer
"Analyze the complete MCP implementation and identify any gaps"
```

**For Performance Issues:**
```
@k6-performance-specialist @observability-engineer @bun-developer
"Investigate and optimize system performance"
```

**For Configuration Management:**
```
@config-manager @deployment-bun-svelte-specialist
"Review and update environment configuration system"
```

### Agent Communication Patterns

- **Context Sharing**: Agents share findings through context-manager
- **Dependency Resolution**: multi-agent-coordinator manages task dependencies
- **Parallel Execution**: Multiple agents work simultaneously on different aspects
- **Knowledge Synthesis**: Consolidated output from all agent expertise

## Important Notes

- Always validate environment configuration before making changes
- Use read-only mode for production monitoring scenarios
- Test with MCP inspector when adding new tools
- Follow existing error handling and logging patterns
- Maintain backward compatibility with tool interfaces