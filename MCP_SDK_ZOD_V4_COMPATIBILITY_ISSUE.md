# [Bug Report] MCP SDK v1.17.5 Incompatible with Zod v4 - Breaking Changes

## Summary

The MCP SDK v1.17.5 is incompatible with Zod v4.x due to breaking changes in Zod's internal API structure. When attempting to use Zod v4 with the current MCP SDK, tools fail to execute with `w._parse is not a function` errors.

## Environment

- **MCP SDK Version**: v1.17.5
- **Zod Version Attempted**: v4.1.5
- **Node.js/Bun Runtime**: Bun v1.2.21
- **Operating System**: macOS (Darwin 24.6.0)

## Expected Behavior

MCP SDK should work with Zod v4.x as Zod v4 provides significant improvements including native JSON Schema conversion (`z.toJSONSchema()`).

## Actual Behavior

### Error Messages

1. **Tool Execution Error**:
   ```
   {"jsonrpc":"2.0","id":1,"error":{"code":-32603,"message":"w._parse is not a function. (In 'w._parse(new y6(W,F,W.path,U))', 'w._parse' is undefined)"}}
   ```

2. **Tools List Error**:
   ```
   {"jsonrpc":"2.0","id":1,"error":{"code":-32603,"message":"null is not an object (evaluating 'F._def')"}}
   ```

## Root Cause Analysis

### 1. Hard Dependency on Zod v3

MCP SDK v1.17.5 has a hard dependency on Zod v3:

```json
// @modelcontextprotocol/sdk/package.json
{
  "dependencies": {
    "zod": "^3.23.8"
  }
}
```

### 2. Breaking Changes in Zod v4

According to [Zod v4 Library Authors Guide](https://zod.dev/library-authors), Zod v4 introduced breaking changes for library integration:

- Internal API structure changes (`_def`, `_parse` methods)
- Different schema handling requirements
- Need for compatibility patterns with `_zod` property checks
- Required use of top-level parsing functions vs schema methods

### 3. MCP SDK Uses Internal Zod Methods

The minified error `w._parse is not a function` indicates MCP SDK directly calls internal Zod methods that:
- Changed signature/location in Zod v4
- Are no longer available in the same form
- Require library-specific compatibility updates

## Reproduction Steps

1. **Install Zod v4**:
   ```bash
   npm install zod@4.1.5
   # or
   bun add zod@4.1.5
   ```

2. **Create MCP Server with Zod Schema**:
   ```typescript
   import { z } from "zod";
   import { Server } from "@modelcontextprotocol/sdk/server/index.js";

   const server = new Server({
     name: "test-server",
     version: "1.0.0"
   }, {
     capabilities: {}
   });

   server.registerTool(
     "test_tool",
     {
       title: "Test Tool",
       description: "Test tool with Zod schema",
       inputSchema: {
         name: z.string().describe("Test parameter")
       }
     },
     async (args) => ({ content: [{ type: "text", text: "test" }] })
   );
   ```

3. **Test Tool Execution**:
   ```bash
   echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "test_tool", "arguments": {"name": "test"}}}' | node server.js
   ```

4. **Observe Error**: `w._parse is not a function`

## Workaround

Currently, the only workaround is to downgrade to Zod v3:

```bash
npm install zod@3.23.8
# or  
bun add zod@3.23.8
```

## Impact

This compatibility issue prevents MCP developers from:

1. **Using Zod v4 Features**:
   - Native JSON Schema conversion (`z.toJSONSchema()`)
   - Improved TypeScript performance
   - Better error messages
   - Enhanced validation capabilities

2. **Eliminating Dependencies**:
   - Cannot remove `zod-to-json-schema` package
   - Stuck with legacy conversion patterns
   - Missing out on simplified schema handling

3. **Future-Proofing Applications**:
   - Cannot upgrade to latest Zod versions
   - Potential security/maintenance issues with older dependencies

## Suggested Solution

### Option 1: Update MCP SDK Zod Dependency

Update MCP SDK to support Zod v4 by:

1. **Updating package.json**:
   ```json
   {
     "peerDependencies": {
       "zod": "^3.25.0 || ^4.0.0"
     }
   }
   ```

2. **Implementing Zod v4 Compatibility**:
   ```typescript
   // Check Zod version compatibility
   const isZodV4 = '_zod' in schema;
   
   // Use appropriate parsing method
   const parseFunction = isZodV4 
     ? (schema: any, data: any) => z.parse(schema, data)
     : (schema: any, data: any) => schema.parse(data);
   ```

### Option 2: Create Compatibility Layer

Add internal compatibility handling for both Zod v3 and v4:

```typescript
function parseWithZod(schema: any, data: any) {
  // Detect Zod version
  if ('_zod' in schema) {
    // Zod v4 - use top-level parse
    return z.parse(schema, data);
  } else {
    // Zod v3 - use schema.parse
    return schema.parse(data);
  }
}
```

## Additional Context

- This issue affects all MCP servers using modern Zod versions
- The error occurs in minified code, making debugging difficult
- Zod v4 has been stable since release and provides significant benefits
- Other major libraries have already updated for Zod v4 compatibility

## References

- [Zod v4 Library Authors Guide](https://zod.dev/library-authors)
- [Zod v4 JSON Schema Documentation](https://zod.dev/json-schema)
- [MCP SDK Repository](https://github.com/modelcontextprotocol/typescript-sdk)

---

**Expected Timeline**: This is a blocking issue for Zod v4 adoption in MCP servers. A fix would enable the ecosystem to leverage Zod v4's improvements and eliminate legacy dependencies.