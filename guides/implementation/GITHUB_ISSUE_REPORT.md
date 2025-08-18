# GitHub Issue Report: Zod 4.x Incompatibility with zod-to-json-schema Causes MCP Tools to Fail Silently

## Issue Title
`zod-to-json-schema` fails to convert Zod 4.x schemas correctly, causing MCP server tools to be disabled in Claude Desktop

## Issue Summary
When using Zod 4.x with zod-to-json-schema 3.x, the schema conversion fails silently and returns incorrect JSON Schema output, causing MCP (Model Context Protocol) tools to register but fail to execute in Claude Desktop.

## Environment
- **zod**: 4.0.17 (problematic version)
- **zod-to-json-schema**: 3.24.6 
- **@modelcontextprotocol/sdk**: 1.17.3
- **Runtime**: Bun 1.2.20
- **Platform**: macOS Darwin 24.6.0
- **Application**: Claude Desktop (MCP server integration)

## Expected Behavior
`zodToJsonSchema()` should convert a Zod object schema to a valid JSON Schema with all properties intact:

```javascript
const schema = z.object({
  index: z.string().optional().describe("Index name"),
  level: z.enum(["cluster", "indices", "shards"]).optional().describe("Detail level"),
  timeout: z.string().optional().describe("Timeout value"),
});

const jsonSchema = zodToJsonSchema(schema);

// Expected output:
{
  "type": "object",
  "properties": {
    "index": {
      "type": "string",
      "description": "Index name"
    },
    "level": {
      "type": "string",
      "enum": ["cluster", "indices", "shards"],
      "description": "Detail level"
    },
    "timeout": {
      "type": "string",
      "description": "Timeout value"
    }
  },
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

## Actual Behavior
With Zod 4.0.17 and zod-to-json-schema 3.24.6, the conversion returns only:

```javascript
{
  "type": "string",
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

This causes:
1. MCP tools to register successfully (showing correct count)
2. But tools fail to execute due to empty parameter schemas
3. No error messages - silent failure
4. In Claude Desktop, tools appear enabled but return placeholder text when used

## Steps to Reproduce

1. Create a new project with the following dependencies:
```json
{
  "dependencies": {
    "zod": "^4.0.17",
    "zod-to-json-schema": "^3.24.6"
  }
}
```

2. Create a test file `test-conversion.ts`:
```typescript
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const testSchema = z.object({
  index: z.string().optional().describe("Index name"),
  level: z.enum(["cluster", "indices", "shards"]).optional().describe("Detail level"),
  timeout: z.string().optional().describe("Timeout value"),
});

console.log("Zod Schema:", testSchema);
console.log("\nConverted JSON Schema:");
console.log(JSON.stringify(zodToJsonSchema(testSchema, {
  $refStrategy: "none",
  target: "jsonSchema7"
}), null, 2));
```

3. Run the test:
```bash
bun test-conversion.ts
# or
npx tsx test-conversion.ts
```

4. Observe the incorrect output (just `{"type": "string"}` instead of the full schema)

## Root Cause Analysis

The issue appears to be a compatibility problem between:
- Zod 4.x's internal structure/API changes
- zod-to-json-schema 3.x's expectations of Zod's internal structure

When zod-to-json-schema tries to parse a Zod 4.x schema object, it fails to recognize the new internal structure and defaults to returning a simple string type.

## Workaround

Downgrade to compatible versions:
```bash
npm install zod@3.23.8 zod-to-json-schema@3.23.5
# or
bun add zod@3.23.8 zod-to-json-schema@3.23.5
```

With these versions, the conversion works correctly.

## Impact

This issue affects:
1. **MCP (Model Context Protocol) servers** - Tools fail silently in Claude Desktop and other MCP clients
2. **OpenAPI/Swagger generation** - Incorrect schemas in API documentation
3. **JSON Schema validation** - Invalid schemas for validation purposes
4. **Any project migrating from Zod 3.x to 4.x** while still using zod-to-json-schema

## Proposed Solutions

1. **Short-term**: Update zod-to-json-schema to support Zod 4.x internal structure
2. **Long-term**: Consider using Zod's built-in JSON Schema support if/when available
3. **Documentation**: Add clear version compatibility matrix in README

## Additional Context

### MCP Server Log Output (Problematic Version)
```json
{
  "name": "elasticsearch_search",
  "inputSchema": {
    "type": "object",
    "properties": {},
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#"
  }
}
```
Note the empty `properties` object despite the schema having defined fields.

### Version Compatibility Matrix
| zod Version | zod-to-json-schema Version | Status |
|-------------|---------------------------|---------|
| 3.23.x | 3.23.x | ✅ Working |
| 3.23.x | 3.24.x | ✅ Working |
| 4.0.x | 3.23.x | ❌ Broken |
| 4.0.x | 3.24.x | ❌ Broken |

## Reproducible Example Repository

A minimal reproducible example is available at:
```
[To be created - include link to GitHub repo with minimal reproduction]
```

## Related Issues
- This may be related to Zod v4 breaking changes
- Similar issues might exist in other schema conversion libraries

## Suggested Test Cases

```typescript
describe('zod-to-json-schema compatibility', () => {
  it('should convert simple object schema', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number()
    });
    
    const jsonSchema = zodToJsonSchema(schema);
    
    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema.properties).toBeDefined();
    expect(jsonSchema.properties.name).toEqual({ type: 'string' });
    expect(jsonSchema.properties.age).toEqual({ type: 'number' });
  });
  
  it('should preserve descriptions', () => {
    const schema = z.object({
      field: z.string().describe("Test description")
    });
    
    const jsonSchema = zodToJsonSchema(schema);
    
    expect(jsonSchema.properties.field.description).toBe("Test description");
  });
  
  it('should handle optional fields', () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional()
    });
    
    const jsonSchema = zodToJsonSchema(schema);
    
    expect(jsonSchema.required).toContain('required');
    expect(jsonSchema.required).not.toContain('optional');
  });
});
```

## Labels
- bug
- compatibility
- zod
- json-schema
- breaking-change
- high-priority

## Mentions
- @colinhacks (Zod maintainer)
- @StefanTerdell (zod-to-json-schema maintainer)

---

## Note for Repository Maintainers

This is a critical issue for production systems using MCP servers with Claude Desktop. The silent failure makes it particularly dangerous as:
1. No errors are thrown during schema conversion
2. Tools appear to register successfully
3. Failures only occur at runtime when tools are invoked
4. Error messages are generic and don't indicate the schema issue

A fix or clear documentation about version compatibility would be greatly appreciated by the community.