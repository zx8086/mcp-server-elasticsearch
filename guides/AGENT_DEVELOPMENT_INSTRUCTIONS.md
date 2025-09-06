# Agent Development Instructions for MCP Servers

## 🤖 **For AI Development Agents**

This document provides specific instructions for AI agents working on MCP (Model Context Protocol) server development, based on lessons learned from building a production-ready Elasticsearch MCP server.

## ⚡ **Critical Rules - Follow Always**

### **1. MCP Parameter Handling (CRITICAL)**

**NEVER use JSON schemas in `server.tool()` calls. ALWAYS use Zod schemas.**

```typescript
// ❌ NEVER DO THIS - Parameters will be lost
server.tool("name", "description", {
  type: "object",
  properties: { limit: { type: "number" } }
}, handler);

// ✅ ALWAYS DO THIS - Parameters flow correctly  
server.tool("name", "description", {
  limit: z.number().optional()
}, handler);
```

### **2. Tool Handler Signature (CRITICAL)**

**ALWAYS use this exact signature for tool handlers:**

```typescript
const handler = async (toolArgs: any, extra: any): Promise<SearchResult> => {
  // toolArgs = user parameters: {limit: 50, summary: true}
  // extra = MCP context: {sessionId, signal, etc}
};
```

### **3. Parameter Validation (REQUIRED)**

**ALWAYS validate parameters at handler start:**

```typescript
const validator = z.object({
  limit: z.number().min(1).max(100).optional(),
  summary: z.boolean().optional(),
});

const handler = async (toolArgs: any, extra: any) => {
  const params = validator.parse(toolArgs); // ← REQUIRED
  // Use params.limit, params.summary
};
```

## 🔧 **Development Workflow for Agents**

### **Step 1: Analyze Existing Patterns**

Before creating or modifying tools:

```bash
# 1. Check for existing JSON schemas (need fixing)
rg "type:\s*[\"']object[\"']" src/tools/

# 2. Find Zod schema examples (use as templates)
rg -A 10 "z\.object\(" src/tools/

# 3. Check tool registration patterns
rg -A 5 "server\.tool\(" src/tools/
```

### **Step 2: Create/Fix Tool Schema**

**Use this template for ALL tools:**

```typescript
import { z } from "zod";

// Define validator
const toolValidator = z.object({
  // String parameters
  index: z.string().optional(),
  policy: z.string().min(1).optional(),
  
  // Number parameters with constraints
  limit: z.number().min(1).max(1000).optional(),
  size: z.number().min(0).optional(),
  
  // Boolean parameters
  summary: z.boolean().optional(),
  includeDetails: z.boolean().optional(),
  
  // Enum parameters
  sortBy: z.enum(["name", "size", "date"]).optional(),
  
  // Complex objects (use passthrough for flexibility)
  query: z.object({}).passthrough().optional(),
  body: z.object({}).passthrough().optional(),
  
  // Arrays
  indices: z.array(z.string()).optional(),
});

type ToolParams = z.infer<typeof toolValidator>;
```

### **Step 3: Implement Handler**

**Use this exact pattern:**

```typescript
export const registerToolName: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const handler = async (toolArgs: any, extra: any): Promise<SearchResult> => {
    const perfStart = performance.now();
    
    try {
      // 1. ALWAYS validate parameters
      const params = toolValidator.parse(toolArgs);
      
      // 2. Add debug logging for development
      logger.debug("Tool execution", {
        toolName: "tool_name",
        receivedParams: Object.keys(params),
        paramValues: params,
      });
      
      // 3. Your tool logic here
      const result = await esClient.someOperation({
        // Use params.* here
      });
      
      // 4. Return MCP-compliant response
      return {
        content: [{
          type: "text",
          text: "Your response"
        }],
      };
      
    } catch (error) {
      // 5. Proper error handling
      if (error instanceof z.ZodError) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Validation failed: ${error.errors.map(e => e.message).join(", ")}`,
          { validationErrors: error.errors, providedArgs: toolArgs }
        );
      }
      
      // Handle other errors...
      throw new McpError(ErrorCode.InternalError, error.message);
    }
  };
  
  // 6. Register tool with Zod schema
  server.tool(
    "tool_name",
    "Tool description with examples",
    toolValidator.shape, // ← Use .shape for the schema
    handler
  );
};
```

### **Step 4: Test Parameter Flow**

**ALWAYS test that parameters work:**

```typescript
// Add to handler for testing
console.log("🧪 PARAMETER TEST:", {
  toolArgsType: typeof toolArgs,
  toolArgsKeys: toolArgs ? Object.keys(toolArgs) : "NONE",
  expectedParams: ["limit", "summary"], // Your expected params
  receivedLimit: toolArgs?.limit,
  receivedSummary: toolArgs?.summary,
  fullArgs: JSON.stringify(toolArgs, null, 2),
});
```

## 🛡 **Security Patterns**

### **Elasticsearch-Specific Security**

For Elasticsearch tools, add this pattern:

```typescript
// In securityEnhancer.ts, add exemptions for legitimate patterns
const isElasticsearchField = field.toLowerCase().includes('index') || 
                             field.toLowerCase().includes('pattern');
const isIndexPattern = /^[a-zA-Z0-9\-_*,.\s]+$/.test(value);

// Skip command injection checks for index patterns
if (category === 'command_injection' && isElasticsearchField && isIndexPattern) {
  continue;
}
```

### **Read-Only Tool Exemptions**

```typescript
// Add safe tools to exemption list
const readOnlyTools = [
  "elasticsearch_search",
  "elasticsearch_list_indices",
  "your_read_only_tool", // ← Add here
];
```

## 📊 **Tracing Integration**

### **Universal Tracing Wrapper**

**DO NOT modify individual tools for tracing. Use the universal wrapper:**

```typescript
// In tools/index.ts - this applies to ALL tools automatically
server.tool = (name: string, description: string, inputSchema: any, handler: any) => {
  const enhancedHandler = async (toolArgs: any, extra: any) => {
    return traceToolExecution(name, toolArgs, extra, handler);
  };
  return originalTool(name, description, inputSchema, enhancedHandler);
};
```

### **Tracing Function Pattern**

```typescript
export function traceToolExecution(toolName: string, toolArgs: any, extra: any, handler: Function) {
  const toolTracer = traceable(
    async (inputs: any) => { // ← Must accept inputs
      const result = await handler(toolArgs, extra);
      return result;
    },
    { name: toolName, run_type: "tool" }
  );
  
  // ✅ Pass structured inputs for LangSmith capture
  return toolTracer({
    tool_name: toolName,
    arguments: toolArgs,     // ← User parameters
    extra_context: extra,    // ← MCP context  
    timestamp: new Date().toISOString(),
  });
}
```

## 🚨 **Common Mistakes to Avoid**

### **❌ Schema Mistakes**
```typescript
// DON'T use JSON schema
const schema = { type: "object", properties: {...} };

// DON'T use .safeParse() without handling errors
const result = schema.safeParse(args); // Errors ignored

// DON'T modify individual tools for tracing
const tracedHandler = traceable(handler); // Wrong approach
```

### **❌ Handler Mistakes**  
```typescript
// DON'T use single parameter
const handler = async (args: any) => {...};

// DON'T skip parameter validation
const { limit, summary } = args; // Unsafe direct access

// DON'T ignore error types
} catch (error) {
  throw error; // Lost context
}
```

### **❌ Registration Mistakes**
```typescript
// DON'T pass JSON schema to server.tool()
server.tool("name", "desc", jsonSchemaObject, handler);

// DON'T forget .shape for Zod schemas
server.tool("name", "desc", validator, handler); // Wrong

// DON'T add manual tracing wrappers
server.tool("name", "desc", schema, traceable(handler)); // Redundant
```

## ✅ **Agent Checklist**

When working on any MCP tool:

- [ ] **Schema**: Uses Zod schema in `server.tool()` call
- [ ] **Handler**: Has `(toolArgs, extra)` signature  
- [ ] **Validation**: Validates parameters with `validator.parse(toolArgs)`
- [ ] **Debug**: Adds parameter debugging during development
- [ ] **Errors**: Handles Zod validation errors specifically
- [ ] **Testing**: Tests parameter flow with real requests
- [ ] **Security**: Considers domain-specific exemptions
- [ ] **Tracing**: Relies on universal wrapper (no manual tracing)

## 🔍 **Debugging Commands**

**Quick diagnosis:**
```bash
# Check for JSON schemas (fix these)
rg "type.*object" src/tools/

# Check parameter flow
LOG_LEVEL=debug bun run dev | grep "PARAMETER"

# Test specific tool
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"tool_name","arguments":{"limit":5}}}' | bun run dist/index.js
```

## 📚 **Reference Examples**

**✅ Good Example** - `src/tools/ilm/get_lifecycle.ts`:
- Uses Zod schema in registration
- Proper parameter validation
- Handles multiple resource patterns
- Complete error handling

**❌ Bad Example** - Any tool using JSON schema:
- Parameters don't flow to handler
- Default values always applied
- User inputs ignored

## 🎯 **Success Metrics**

Your MCP tool is working correctly when:

1. **Parameters flow**: `{limit: 50}` → handler receives `params.limit = 50`
2. **Validation works**: Invalid params throw proper MCP errors
3. **Security passes**: Legitimate patterns don't trigger violations  
4. **Tracing captures**: LangSmith shows both inputs and outputs
5. **Errors are clear**: Users get actionable error messages

Follow these patterns to build robust, scalable MCP servers that handle parameters correctly and provide excellent developer experience.