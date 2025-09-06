# MCP Development Patterns & Best Practices

This document captures the essential patterns, fixes, and learnings from building a production-ready MCP (Model Context Protocol) server with proper parameter handling, security validation, and LangSmith tracing integration.

## 🎯 **Critical MCP Parameter Handling**

### **The Root Issue: JSON Schema vs Zod Schema**

**Problem**: The MCP SDK requires Zod schema objects in `server.tool()` calls to properly extract tool arguments from MCP protocol requests. Using JSON schemas causes parameters to be lost.

**Symptoms**:
- Tools receive MCP protocol context instead of user arguments
- Parameters like `limit: 50` become `limit: 20` (defaults applied)
- User inputs are completely ignored

**Solution Pattern**:
```typescript
// ❌ BROKEN: JSON Schema (parameters lost)
const schema = {
  type: "object",
  properties: {
    limit: { type: "number", minimum: 1, maximum: 100 },
    summary: { type: "boolean" }
  }
};
server.tool("name", "desc", schema, handler);

// ✅ FIXED: Zod Schema (parameters flow correctly)
server.tool("name", "desc", {
  limit: z.number().min(1).max(100).optional(),
  summary: z.boolean().optional()
}, handler);
```

### **Tool Handler Signature**

**Correct Pattern**:
```typescript
const handler = async (toolArgs: any, extra: any): Promise<SearchResult> => {
  // toolArgs contains user parameters: {limit: 50, summary: true}
  // extra contains MCP context: {sessionId, signal, etc}
};
```

### **Parameter Validation**

**Best Practice**:
```typescript
// Always validate with Zod at handler start
const validator = z.object({
  limit: z.number().min(1).max(100).optional(),
  summary: z.boolean().optional(),
});

const handler = async (args: any): Promise<SearchResult> => {
  const params = validator.parse(args); // Runtime validation
  // Use params.limit, params.summary safely
};
```

## 🔐 **Security Validation Patterns**

### **Elasticsearch-Specific Security Exemptions**

**Problem**: Security validation flags legitimate Elasticsearch patterns as threats.

**Solution**:
```typescript
// Security validation with Elasticsearch exemptions
const validateString = (value: string, field: string): SecurityViolation[] => {
  const isElasticsearchField = field.toLowerCase().includes('index');
  const isIndexPattern = /^[a-zA-Z0-9\-_*,.\s]+$/.test(value) && value.includes('*');
  
  // Skip command injection checks for legitimate index patterns
  if (category === 'command_injection' && isElasticsearchField && isIndexPattern) {
    continue;
  }
};
```

### **Read-Only Tool Exemptions**

**Pattern**:
```typescript
const readOnlyTools = [
  "elasticsearch_search",
  "elasticsearch_list_indices", 
  "elasticsearch_get_mappings",
  "elasticsearch_get_shards",
];
const shouldValidate = !readOnlyTools.includes(toolName);
```

## 📊 **LangSmith Tracing Integration**

### **Proper Input/Output Capture**

**Problem**: LangSmith traces show outputs but not inputs.

**Root Cause**: The `traceable` function needs explicit inputs to capture them.

**Solution Pattern**:
```typescript
export function traceToolExecution(toolName: string, toolArgs: any, extra: any, handler: Function) {
  const toolTracer = traceable(
    async (inputs: any) => { // ✅ Accept inputs parameter
      const result = await handler(toolArgs, extra);
      return result;
    },
    {
      name: toolName,
      run_type: "tool",
      project_name: project,
    },
  );

  // ✅ Pass structured inputs to capture in trace
  return toolTracer({
    tool_name: toolName,
    arguments: toolArgs,     // User parameters
    extra_context: extra,    // MCP context
    timestamp: new Date().toISOString(),
  });
}
```

### **Universal Tool Wrapping**

**Pattern for MCP Servers**:
```typescript
// Override server.tool to add tracing to ALL tools automatically
const originalTool = server.tool.bind(server);
server.tool = (name: string, description: string, inputSchema: any, handler: any) => {
  const enhancedHandler = async (toolArgs: any, extra: any) => {
    return traceToolExecution(name, toolArgs, extra, handler);
  };
  
  return originalTool(name, description, inputSchema, enhancedHandler);
};
```

## 🛠 **Query Handling Patterns**

### **Empty Query Handling**

**Problem**: Empty queries `{}` cause Elasticsearch "empty clause" errors.

**Solution**:
```typescript
// Detect both falsy and empty object queries
const isEmptyQuery = !query || (typeof query === 'object' && Object.keys(query).length === 0);
const finalQuery = isEmptyQuery ? { match_all: {} } : query;
```

### **Flexible Schema Design**

**Pattern for Complex Objects**:
```typescript
// Support multiple input formats
const bodySchema = z.union([
  // Format 1: {policy: {phases: {...}}}
  z.object({
    policy: z.object({
      phases: z.record(z.string(), phaseSchema).optional(),
    }).passthrough(),
  }).passthrough(),
  // Format 2: {phases: {...}}
  z.object({
    phases: z.record(z.string(), phaseSchema).optional(),
  }).passthrough(),
]);
```

### **Multiple Resource Support**

**Pattern for Comma-Separated Values**:
```typescript
// Handle comma-separated resource lists
if (params.policy) {
  const requestedPolicies = params.policy.split(',').map(p => p.trim());
  const foundPolicies = policies.filter(policy => 
    requestedPolicies.includes(policy.name)
  );
  
  // Detailed error reporting for missing resources
  const missingPolicies = requestedPolicies.filter(name => 
    !foundPolicyNames.includes(name)
  );
}
```

## 🏗 **Tool Architecture Patterns**

### **Universal Tool Registration**

**Complete Pattern**:
```typescript
export function registerAllTools(server: McpServer, esClient: Client): ToolInfo[] {
  const registeredTools: ToolInfo[] = [];
  
  // Override tool registration for universal enhancements
  const originalTool = server.tool.bind(server);
  server.tool = (name: string, description: string, inputSchema: any, handler: any) => {
    registeredTools.push({ name, description, inputSchema });
    
    // Determine if security validation needed
    const readOnlyTools = ["elasticsearch_search", "elasticsearch_list_indices"];
    const shouldValidate = !readOnlyTools.includes(name);
    
    // Enhanced handler with tracing
    let enhancedHandler = async (toolArgs: any, extra: any) => {
      return traceToolExecution(name, toolArgs, extra, handler);
    };
    
    // Add security validation for write operations
    if (shouldValidate) {
      enhancedHandler = withSecurityValidation(name, enhancedHandler);
    }
    
    return originalTool(name, description, inputSchema, enhancedHandler);
  };
  
  // Register all tools - they automatically get enhancements
  registerSearchTool(server, esClient);
  registerListIndicesTool(server, esClient);
  // ... etc
  
  return registeredTools;
}
```

### **Error Handling Pattern**

**MCP-Compliant Errors**:
```typescript
function createMcpError(error: Error | string, context: {
  type: "validation" | "execution" | "not_found" | "permission";
  details?: any;
}): McpError {
  const message = error instanceof Error ? error.message : error;
  
  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    not_found: ErrorCode.InvalidRequest,
    permission: ErrorCode.InvalidRequest,
  };
  
  return new McpError(errorCodeMap[context.type], `[${toolName}] ${message}`, context.details);
}
```

## 🚀 **Development Workflow**

### **Testing Parameter Flow**

**Validation Script Pattern**:
```typescript
// Test MCP parameter extraction
const testRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "elasticsearch_ilm_get_lifecycle",
    arguments: { limit: 3, summary: true }
  }
};
```

### **Schema Conversion Automation**

**Automated Fix Pattern**:
```typescript
// Convert JSON Schema to Zod Schema
const convertToZodSchema = (jsonSchema: any) => {
  const zodFields: any = {};
  
  for (const [key, prop] of Object.entries(jsonSchema.properties)) {
    const field = prop as any;
    
    if (field.type === 'string') {
      zodFields[key] = z.string().optional();
    } else if (field.type === 'number') {
      let schema = z.number();
      if (field.minimum) schema = schema.min(field.minimum);
      if (field.maximum) schema = schema.max(field.maximum);
      zodFields[key] = schema.optional();
    } else if (field.type === 'boolean') {
      zodFields[key] = z.boolean().optional();
    } else if (field.enum) {
      zodFields[key] = z.enum(field.enum).optional();
    }
  }
  
  return zodFields;
};
```

## 🔄 **Migration Checklist**

### **From JSON Schema to Zod Schema**

1. ✅ **Identify tools using JSON schemas**
   ```bash
   rg -l "type:\s*[\"']object[\"']" src/tools/
   ```

2. ✅ **Convert schema definitions**
   - Replace JSON schema objects with Zod schema objects
   - Maintain validation rules (min, max, enum)
   - Make fields optional unless required

3. ✅ **Update tool registrations**
   - Use Zod schema directly in `server.tool()` calls
   - Remove JSON schema constants
   - Update descriptions to mention Zod schema usage

4. ✅ **Test parameter flow**
   - Verify user parameters reach handlers correctly
   - Test pagination, filtering, and complex objects
   - Validate error handling works

5. ✅ **Security validation**
   - Add Elasticsearch-specific exemptions
   - Test with comma-separated index patterns
   - Verify read-only tools are exempt

6. ✅ **Tracing integration**
   - Verify inputs appear in LangSmith traces
   - Test error tracing works
   - Validate performance metrics

## 💡 **Key Insights for Developers**

### **MCP Protocol Understanding**

1. **Parameter Extraction**: MCP SDK extracts tool arguments from `params.arguments` in the JSON-RPC request
2. **Schema Requirement**: Only Zod schemas enable proper parameter extraction
3. **Handler Signature**: Always use `(toolArgs, extra)` signature for compatibility

### **Elasticsearch-Specific Considerations**

1. **Index Patterns**: Comma-separated patterns are legitimate (`logs-*,metrics-*`)
2. **Empty Queries**: Convert `{}` to `{match_all: {}}` automatically
3. **Security Exemptions**: Elasticsearch fields need special security handling

### **Production Readiness**

1. **Universal Wrappers**: Apply tracing and security to ALL tools automatically
2. **Graceful Degradation**: Features work without optional dependencies
3. **Comprehensive Logging**: Debug parameter flow at every step
4. **Error Context**: Provide detailed error information for troubleshooting

## 📚 **Agent Instructions**

When working on MCP servers, agents should:

1. **Always use Zod schemas** in `server.tool()` calls, never JSON schemas
2. **Test parameter flow** explicitly - don't assume parameters work
3. **Add tracing wrappers** using the universal pattern
4. **Handle empty queries** and edge cases gracefully
5. **Validate security exemptions** for domain-specific patterns
6. **Create comprehensive tests** covering parameter edge cases

This documentation ensures consistent, scalable, and production-ready MCP server development.