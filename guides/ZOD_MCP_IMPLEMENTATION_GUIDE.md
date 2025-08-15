# Zod and MCP SDK Implementation Guide

## Overview
This guide ensures proper integration between Zod validation schemas and the MCP SDK to prevent schema serialization issues that can cause tools to be disabled in Claude Desktop.

## The Problem
When Zod schemas are passed directly to the MCP SDK without proper conversion, they get serialized with internal Zod metadata instead of being converted to JSON Schema format. This causes Claude Desktop to fail parsing the schemas and disable the tools.

## Schema Patterns

### ✅ CORRECT Patterns

#### Pattern 1: Plain Object with Zod Validators
**When to use:** Simple tools that don't need tracing
```typescript
// CORRECT: MCP SDK can handle plain objects with Zod validators
server.tool(
  "elasticsearch_search",
  "Tool description",
  {
    index: z.string().min(1).describe("Index name"),
    query: z.object({
      match: z.record(z.any())
    }).describe("Query object")
  },
  handler
);
```

#### Pattern 2: Using registerTracedTool (Automatic Conversion)
**When to use:** Tools that need tracing and monitoring
```typescript
import { registerTracedTool } from "../../utils/toolWrapper.js";

// CORRECT: registerTracedTool handles conversion automatically
const inputSchema = z.object({
  index: z.string().min(1).describe("Index name"),
  query: z.record(z.any()).describe("Query object")
});

registerTracedTool(server, esClient, {
  name: "elasticsearch_search",
  description: "Tool description",
  inputSchema, // Will be converted internally
  operationType: "read",
  handler: async (esClient, args) => {
    // Implementation
  }
});
```

#### Pattern 3: Manual Conversion with zodToJsonSchema
**When to use:** Custom tool registration that needs JSON Schema
```typescript
import { zodToJsonSchema } from "zod-to-json-schema";

// CORRECT: Manually convert Zod schema to JSON Schema
const zodSchema = z.object({
  index: z.string().min(1),
  query: z.record(z.any())
});

const jsonSchema = zodToJsonSchema(zodSchema, {
  $refStrategy: "none",
  target: "jsonSchema7"
});

server.tool("elasticsearch_search", "Description", jsonSchema, handler);
```

### ❌ INCORRECT Patterns

#### Anti-Pattern 1: Direct Zod Object to server.tool()
```typescript
// WRONG: Passing Zod object directly without conversion
const schema = z.object({
  index: z.string(),
  query: z.record(z.any())
});

server.tool("elasticsearch_search", "Description", schema, handler);
// This will serialize Zod internals, breaking Claude Desktop
```

#### Anti-Pattern 2: Mixing Patterns Incorrectly
```typescript
// WRONG: Creating Zod object but treating it like a plain object
const schema = z.object({
  index: z.string(),
  query: z.record(z.any())
});

server.tool("elasticsearch_search", "Description", {
  ...schema // This doesn't work - spreads Zod internals
}, handler);
```

## Implementation Checklist

### For New Tools
1. **Choose the appropriate pattern:**
   - Need tracing? → Use `registerTracedTool`
   - Simple tool? → Use plain object with Zod validators
   - Custom needs? → Use `zodToJsonSchema` for conversion

2. **Always include descriptions:**
   ```typescript
   z.string().describe("Clear description for the parameter")
   ```

3. **Test the schema:**
   ```bash
   bun run scripts/validate-schemas.ts
   ```

### For Existing Tools
1. **Audit current implementation:**
   ```bash
   grep -r "z\.object(" src/tools/ | grep "server.tool"
   ```

2. **Check for broken patterns:**
   - Look for `z.object()` passed directly to `server.tool()`
   - Check for missing `zodToJsonSchema` imports
   - Verify `registerTracedTool` is used correctly

3. **Migrate if needed:**
   - Convert to use `registerTracedTool` for consistency
   - Or add `zodToJsonSchema` conversion

## Validation

### Manual Testing
1. Build the project:
   ```bash
   bun run build
   ```

2. Check schema output:
   ```bash
   bun run dev 2>&1 | grep "inputSchema"
   ```

3. Look for red flags:
   - `"annotations": {"~standard": {"vendor": "zod"}`
   - `"_def": {`
   - Missing `"$schema": "http://json-schema.org/draft-07/schema#"`

### Automated Validation
Run the validation script:
```bash
bun run scripts/validate-schemas.ts
```

This will:
- Scan all tool files
- Detect incorrect patterns
- Provide actionable feedback

## Best Practices

### 1. Consistency
- Use `registerTracedTool` for all tools that need monitoring
- Use the same pattern within a tool category

### 2. Type Safety
```typescript
// Define the schema once
const inputSchema = z.object({
  index: z.string(),
  query: z.record(z.any())
});

// Derive the type
type ToolInput = z.infer<typeof inputSchema>;

// Use in handler
handler: async (esClient, args: ToolInput) => {
  // Full type safety
}
```

### 3. Documentation
Always add descriptions to help Claude understand the parameters:
```typescript
z.object({
  index: z.string()
    .min(1)
    .describe("The Elasticsearch index to search"),
  
  query: z.record(z.any())
    .describe("Elasticsearch Query DSL object"),
  
  size: z.number()
    .optional()
    .default(10)
    .describe("Number of results to return")
})
```

### 4. Error Messages
Include helpful validation messages:
```typescript
z.string()
  .min(1, "Index name is required")
  .regex(/^[a-z0-9-_]+$/, "Index name must be lowercase alphanumeric")
```

## Troubleshooting

### Issue: Tools show as "Disabled" in Claude Desktop
**Cause:** Schema not properly converted from Zod to JSON Schema
**Fix:** 
1. Check the tool's schema implementation
2. Ensure using one of the correct patterns above
3. Rebuild and restart Claude Desktop

### Issue: Schema validation errors
**Cause:** Invalid JSON Schema format
**Fix:**
1. Run validation script: `bun run scripts/validate-schemas.ts`
2. Check for Zod internal properties in the output
3. Add proper conversion using `zodToJsonSchema`

### Issue: Type errors after conversion
**Cause:** TypeScript can't infer types through conversion
**Fix:**
```typescript
// Keep the Zod schema for type inference
const schema = z.object({ /* ... */ });
type SchemaType = z.infer<typeof schema>;

// Convert for MCP SDK
const jsonSchema = zodToJsonSchema(schema);

// Use the type in handler
handler: async (args: SchemaType) => { /* ... */ }
```

## Migration Path

For existing tools using incorrect patterns:

1. **Identify affected tools:**
   ```bash
   bun run scripts/validate-schemas.ts
   ```

2. **Choose migration strategy:**
   - **Option A:** Convert to `registerTracedTool` (recommended)
   - **Option B:** Add `zodToJsonSchema` conversion
   - **Option C:** Revert to plain object pattern

3. **Update the tool:**
   ```typescript
   // Before (broken)
   server.tool("name", "desc", z.object({...}), handler);
   
   // After (Option A - with tracing)
   registerTracedTool(server, esClient, {
     name: "name",
     description: "desc",
     inputSchema: z.object({...}),
     handler: async (esClient, args) => {...}
   });
   ```

4. **Test the migration:**
   - Build: `bun run build`
   - Validate: `bun run scripts/validate-schemas.ts`
   - Test in Claude Desktop

## Dependencies

### ⚠️ CRITICAL: Version Compatibility

**You MUST use compatible versions of Zod and zod-to-json-schema:**

```json
{
  "dependencies": {
    "zod": "3.23.8",
    "zod-to-json-schema": "3.23.5",
    "@modelcontextprotocol/sdk": "^1.17.3"
  }
}
```

### Version Compatibility Issue
- **Zod 4.x is NOT compatible with zod-to-json-schema 3.x**
- Using incompatible versions causes `zodToJsonSchema` to return incorrect schemas (e.g., `{"type": "string"}` instead of the full object schema)
- This results in tools being registered but unable to execute due to empty parameter schemas

### Symptoms of Version Mismatch
If you see these symptoms, you likely have a version compatibility issue:
1. Tools show as enabled in Claude Desktop (count shows correctly)
2. But when using tools, you get errors or placeholder text
3. Tool schemas show empty properties: `{"type":"object","properties":{}}`
4. `zodToJsonSchema` returns unexpected output

### How to Fix Version Issues
```bash
# Remove existing versions
bun remove zod zod-to-json-schema

# Install compatible versions
bun add zod@3.23.8 zod-to-json-schema@3.23.5

# Rebuild
bun run build

# Restart Claude Desktop
```

## Pre-commit Hook

Add to `.git/hooks/pre-commit`:
```bash
#!/bin/bash
echo "Validating MCP schemas..."
bun run scripts/validate-schemas.ts
if [ $? -ne 0 ]; then
  echo "Schema validation failed. Please fix the issues before committing."
  exit 1
fi
```

## Conclusion

Following this guide ensures:
- ✅ Tools work correctly in Claude Desktop
- ✅ Schemas are properly validated
- ✅ Type safety is maintained
- ✅ Consistent implementation across all tools
- ✅ Easy debugging and maintenance

Remember: **When in doubt, use `registerTracedTool` - it handles conversion automatically!**