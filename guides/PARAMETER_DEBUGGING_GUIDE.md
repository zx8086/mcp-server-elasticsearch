# MCP Parameter Debugging Guide

## 🔍 **Quick Diagnosis: Parameter Flow Issues**

### **Symptoms Checklist**
- [ ] User sends `{limit: 50}` but tool receives `{limit: 20}` (defaults applied)
- [ ] Tool handler logs show empty or unexpected parameter values
- [ ] Security validation errors for legitimate Elasticsearch patterns
- [ ] LangSmith traces missing input data
- [ ] "Required [parameter]" errors despite parameters being sent

### **Root Cause Identification**

**1. JSON Schema vs Zod Schema Issue (90% of cases)**
```bash
# Check for JSON schema usage (problematic)
rg "type:\s*[\"']object[\"']" src/tools/

# Check for Zod schema usage (correct)  
rg "z\.(string|number|boolean|object)" src/tools/
```

**2. Handler Signature Mismatch**
```typescript
// ❌ Wrong: Single parameter
const handler = async (args: any) => { ... }

// ✅ Correct: Two parameters for tracing compatibility
const handler = async (toolArgs: any, extra: any) => { ... }
```

**3. Security Validation Blocking**
```bash
# Look for security violations in logs
tail -f logs/debug.log | grep "Security violation"
```

## 🛠 **Step-by-Step Debugging Process**

### **Step 1: Verify Tool Registration Schema**

Check your tool registration:
```typescript
// Find this pattern in your tool file
server.tool(
  "tool_name",
  "description", 
  SCHEMA_HERE, // ← This must be Zod schema object
  handler
);
```

**Fix Pattern**:
```typescript
// ❌ BROKEN: JSON Schema
server.tool("name", "desc", {
  type: "object",
  properties: { limit: { type: "number" } }
}, handler);

// ✅ FIXED: Zod Schema  
server.tool("name", "desc", {
  limit: z.number().optional()
}, handler);
```

### **Step 2: Add Parameter Debugging**

Add this to your handler start:
```typescript
const handler = async (toolArgs: any, extra: any): Promise<SearchResult> => {
  // Debug parameter reception
  console.log("🔍 PARAMETER DEBUG:", {
    toolArgsReceived: !!toolArgs,
    toolArgsType: typeof toolArgs,
    toolArgsKeys: toolArgs ? Object.keys(toolArgs) : "NO ARGS",
    limitParam: toolArgs?.limit,
    summaryParam: toolArgs?.summary,
    fullToolArgs: JSON.stringify(toolArgs, null, 2),
    extraReceived: !!extra,
    extraKeys: extra ? Object.keys(extra) : "NO EXTRA"
  });
  
  // Your tool logic...
};
```

### **Step 3: Test with MCP Request**

Create a test script:
```typescript
// test-parameter-flow.ts
const testRequest = {
  jsonrpc: "2.0",
  id: 1, 
  method: "tools/call",
  params: {
    name: "your_tool_name",
    arguments: { limit: 50, summary: true } // ← Your test parameters
  }
};

// Send to running server and check logs
```

### **Step 4: Verify Tracing Capture**

Check if tracing captures inputs:
```typescript
// In tracing.ts, look for this pattern
return toolTracer({
  tool_name: toolName,
  arguments: toolArgs,        // ← Should contain user params
  extra_context: extra,       // ← Should contain MCP context
  timestamp: new Date().toISOString(),
});
```

## 🔧 **Common Fixes**

### **Fix 1: Convert JSON Schema to Zod**

**Before**:
```typescript
const schema = {
  type: "object",
  properties: {
    limit: { type: "number", minimum: 1, maximum: 100 },
    summary: { type: "boolean" },
    sortBy: { type: "string", enum: ["name", "size"] }
  }
};
```

**After**:
```typescript
// Replace the schema parameter in server.tool() with:
{
  limit: z.number().min(1).max(100).optional(),
  summary: z.boolean().optional(),
  sortBy: z.enum(["name", "size"]).optional(),
}
```

### **Fix 2: Security Validation Exemptions**

For Elasticsearch index patterns:
```typescript
// In securityEnhancer.ts
const isElasticsearchField = field.toLowerCase().includes('index');
const isIndexPattern = /^[a-zA-Z0-9\-_*,.\s]+$/.test(value) && value.includes('*');

if (category === 'command_injection' && isElasticsearchField && isIndexPattern) {
  continue; // Skip validation for legitimate patterns
}
```

### **Fix 3: Empty Query Handling**

```typescript
// Handle empty query objects
const isEmptyQuery = !query || (typeof query === 'object' && Object.keys(query).length === 0);
const finalQuery = isEmptyQuery ? { match_all: {} } : query;
```

### **Fix 4: LangSmith Input Capture**

```typescript
// Ensure tracing function accepts inputs
const toolTracer = traceable(
  async (inputs: any) => { // ← Must accept inputs parameter
    const result = await handler(toolArgs, extra);
    return result;
  },
  { name: toolName, run_type: "tool" }
);

// Call with structured inputs
return toolTracer({
  tool_name: toolName,
  arguments: toolArgs,
  extra_context: extra,
  timestamp: new Date().toISOString(),
});
```

## 🧪 **Testing Patterns**

### **Parameter Flow Test**
```bash
# 1. Start server with debug logging
LOG_LEVEL=debug bun run dev

# 2. Send test request
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"elasticsearch_list_indices","arguments":{"limit":5}}}' | \
  bun run dist/index.js

# 3. Check logs for parameter flow
grep "PARAMETER DEBUG" logs/debug.log
```

### **Schema Validation Test**
```typescript
// Test Zod validation directly
const validator = z.object({
  limit: z.number().min(1).max(100).optional(),
});

const testResult = validator.parse({ limit: 50 });
console.log("Validation passed:", testResult);
```

### **Tracing Verification**
1. Check LangSmith dashboard for trace entries
2. Verify "Input" section contains parameters
3. Confirm "Output" section shows results
4. Look for proper tool naming

## 🚨 **Emergency Fixes**

### **Quick Parameter Fix**
If parameters are completely broken:

1. **Find the tool file**: `rg -l "tool_name" src/tools/`
2. **Update server.tool() call**: Replace 3rd parameter with Zod schema
3. **Rebuild and test**: `bun run build && LOG_LEVEL=debug bun run dev`

### **Quick Security Fix**
If getting security violations:

1. **Add to read-only tools list**:
   ```typescript
   const readOnlyTools = [
     "your_tool_name", // ← Add here temporarily
   ];
   ```

2. **Or add Elasticsearch exemption**:
   ```typescript
   const isElasticsearchField = field.toLowerCase().includes('index');
   ```

### **Quick Tracing Fix**
If inputs missing from traces:

1. **Check toolTracer call**:
   ```typescript
   return toolTracer({ arguments: toolArgs }); // ← Must pass arguments
   ```

## 📊 **Debugging Checklist**

- [ ] Tool uses Zod schema in `server.tool()` call
- [ ] Handler has `(toolArgs, extra)` signature
- [ ] Debug logs show correct parameter values
- [ ] Security validation allows legitimate patterns
- [ ] LangSmith traces show both inputs and outputs
- [ ] Build succeeds without TypeScript errors
- [ ] Test requests return expected results
- [ ] Error handling provides clear messages
- [ ] All TypeErrors eliminated (see TESTING_STRATEGY_ANALYSIS.md)

## 🔍 **Log Analysis Patterns**

**Good Parameter Flow**:
```
🔍 PARAMETER DEBUG: {
  toolArgsReceived: true,
  toolArgsKeys: ["limit", "summary"],
  limitParam: 50,
  summaryParam: true
}
```

**Broken Parameter Flow**:
```
🔍 PARAMETER DEBUG: {
  toolArgsReceived: true,
  toolArgsKeys: ["sessionId", "signal"],  ← Wrong keys (MCP context)
  limitParam: undefined,                   ← Missing user params
  summaryParam: undefined
}
```

Use this guide to quickly identify and fix MCP parameter handling issues.

## 🎯 **Success Reference**

This debugging approach has achieved **100% TypeError elimination** in the Elasticsearch MCP Server. For comprehensive results and validation, see `TESTING_STRATEGY_ANALYSIS.md`.