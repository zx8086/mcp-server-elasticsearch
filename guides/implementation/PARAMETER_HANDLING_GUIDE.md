# Parameter Handling and LLM Guidance Guide

## Overview
This guide consolidates all parameter handling strategies, LLM guidance solutions, and implementation patterns for the Elasticsearch MCP Server.

## Table of Contents
1. [Core Problem: MCP SDK Limitations](#core-problem-mcp-sdk-limitations)
2. [Solution: Enhanced Tool Descriptions](#solution-enhanced-tool-descriptions)
3. [Parameter Extraction Strategy](#parameter-extraction-strategy)
4. [No-Defaults Philosophy](#no-defaults-philosophy)
5. [Implementation Patterns](#implementation-patterns)
6. [Best Practices](#best-practices)

## Core Problem: MCP SDK Limitations

### The Issues
1. **Schema Corruption**: MCP SDK corrupts all parameter schemas to empty `"properties": {}` 
2. **Parameter Passing Failure**: Tools receive empty parameters `{}` instead of user-provided values
3. **No Documentation**: LLMs cannot see parameter types, defaults, or examples

### Root Cause
Pure MCP SDK testing confirmed that both schema registration and parameter passing are fundamentally broken in the MCP SDK itself, not in our implementation.

## Solution: Enhanced Tool Descriptions

Since the MCP SDK corrupts schemas but preserves tool descriptions, we embed ALL parameter documentation directly in the description strings.

### Enhanced Description Format

```typescript
const description = `
[Primary purpose]. [Benefits].

**Parameters (JSON format):**
- \`param\` (type, required/optional): Description. Default: value. Example: \`"example"\`
- \`param2\` (object, optional): Description. Example: \`{"key": "value"}\`

**Quick Examples:**
✅ Basic: \`{"param1": "value1", "param2": "value2"}\`
✅ Advanced: \`{"param1": "value1", "param2": {"nested": "object"}}\`
✅ Empty for defaults: \`{}\` (uses: param1="default", param2=defaultObj)

**Common Patterns:**
- Pattern 1: [copy-paste example]
- Pattern 2: [copy-paste example]

Use when: [scenarios]. Best for: [use cases].
`;
```

### Real Example: elasticsearch_list_indices

```typescript
const description = `
Lists indices matching the specified pattern with filtering and sorting options.

**Parameters (JSON format):**
- \`indexPattern\` (string, optional): Pattern to match indices. Default: "*". Examples: "logs-*", "*2024*"
- \`limit\` (number, optional): Max indices to return. Default: 50, max: 1000
- \`sortBy\` (string, optional): Sort order - "name", "size", "docs", or "creation". Default: "name"

**Quick Examples:**
✅ All indices: \`{}\`
✅ Service monitoring: \`{"indexPattern": "*service*,*apm*", "limit": 100}\`
✅ Storage analysis: \`{"includeSize": true, "sortBy": "size"}\`
`;
```

## Parameter Extraction Strategy

### The Universal Tool Wrapper
Location: `src/utils/universalToolWrapper.ts`

#### Key Features
1. **Metadata Filtering**: Removes MCP protocol fields (signal, requestId, sessionId, etc.)
2. **Parameter Unwrapping**: Handles parameters in various wrapper fields
3. **Intelligent Detection**: Identifies actual parameters vs protocol overhead

#### Implementation

```typescript
function extractActualParameters(args: any): any {
  // Filter out MCP metadata
  const MCP_METADATA_FIELDS = [
    'signal', 'requestId', 'sessionId', 'clientInfo', 
    'connectionId', '_meta'
  ];
  
  // Check for wrapped parameters
  const WRAPPER_FIELDS = [
    'params', 'parameters', 'arguments', 'args', 'input'
  ];
  
  // Extract and return clean parameters
  // ... implementation details
}
```

## No-Defaults Philosophy

### Why No Defaults?
1. LLMs interpret any mentioned default as mandatory
2. Defaults defeat the purpose of giving LLMs control
3. Runtime defaults cause unexpected behavior

### Implementation Strategy

#### ❌ BAD: Runtime Defaults
```typescript
// LLM will always use 100
const limit = params.limit ?? 100;
description: "Use limit parameter (default: 100)"
```

#### ✅ GOOD: Conditional Guidance
```typescript
// LLM decides based on need
const { limit } = params;
if (!limit && totalShards > 1000) {
  // Warn only when actually needed
  metadataText = `⚠️ Response contains ${totalShards} shards. Consider using 'limit'`;
}
description: "Returns ALL shards unless you specify 'limit'. For large clusters, consider using limit."
```

### Examples Without Defaults
Instead of specifying defaults, provide examples:
```typescript
// Instead of: "default: 100"
// We say: "Examples: {limit: 100} for top 100, {limit: 50} for top 50"
```

## Implementation Patterns

### Pattern 1: Enhanced Tool Registration
```typescript
export const toolDefinition = {
  name: 'tool_name',
  description: enhancedDescription, // Full parameter docs here
  inputSchema: zodSchema, // Even though SDK corrupts this
  handler: wrappedHandler // Uses universal wrapper
};
```

### Pattern 2: Proactive Size Guidance
```typescript
async function handler(client, params, logger) {
  const result = await client.operation(params);
  
  // Check size and provide guidance
  if (result.hits.total.value > 1000 && !params.size) {
    return {
      content: [{
        type: 'text',
        text: formatResponse(result),
        annotations: {
          warning: 'Large result set. Consider using size parameter',
          suggestion: '{size: 100}'
        }
      }]
    };
  }
}
```

### Pattern 3: MCP-Compliant Responses
```typescript
function createMCPResponse(data: any, options?: ResponseOptions) {
  return {
    content: [
      {
        type: 'text',
        text: formatHumanReadable(data),
        annotations: {
          audience: 'human',
          priority: 'primary'
        }
      },
      {
        type: 'text', 
        text: JSON.stringify(data),
        annotations: {
          audience: 'model',
          format: 'json'
        }
      }
    ],
    structuredContent: data, // Machine-readable
    isError: false
  };
}
```

## Best Practices

### 1. Tool Description Guidelines
- **Be explicit**: List every parameter with type and description
- **Provide examples**: Include copy-paste ready JSON examples
- **Explain patterns**: Show common use cases
- **Avoid defaults**: Don't mention defaults that might become mandatory

### 2. Parameter Validation
- **Make fields optional**: Use `.partial()` where appropriate
- **Use Zod effectively**: Even though schemas are corrupted, validation still works
- **Clear error messages**: Help users understand what went wrong

### 3. Response Formatting
- **Dual format**: Human-readable text + structured JSON
- **Size awareness**: Provide guidance for large responses
- **Progressive disclosure**: Summary first, details on request

### 4. Testing Strategy
- **Test parameter extraction**: Verify wrapper detection works
- **Test without schemas**: Ensure tools work even with corrupted schemas
- **Test LLM behavior**: Verify descriptions guide LLMs correctly

## Common Pitfalls to Avoid

1. **Don't rely on JSON Schema**: MCP SDK will corrupt it
2. **Don't use runtime defaults**: LLMs will treat them as required
3. **Don't assume parameter structure**: Always check for wrappers
4. **Don't truncate silently**: Always inform about truncation
5. **Don't forget examples**: LLMs need concrete examples to work from

## Migration Path

When MCP SDK eventually fixes schema support:
1. Keep enhanced descriptions for backward compatibility
2. Gradually reintroduce proper schema validation
3. Maintain dual support during transition
4. Test thoroughly with different LLM clients

## Debugging Tips

### Enable Debug Logging
```bash
LOG_LEVEL=debug bun run dev
```

### Test Parameter Extraction
```typescript
// Add to tool handler
logger.debug('Raw args:', args);
logger.debug('Extracted params:', extractedParams);
```

### Verify Tool Registration
```typescript
// Check what MCP SDK actually registers
console.log('Registered schema:', JSON.stringify(tool.inputSchema));
```

## Conclusion

The parameter handling system works around fundamental MCP SDK limitations through creative use of tool descriptions and intelligent parameter extraction. This approach ensures LLMs can effectively use all tools despite the SDK's schema corruption issues.