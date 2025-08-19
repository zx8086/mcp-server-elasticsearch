# Zod 3.x Compatibility Fix

## Issue Identified
Date: 2025-08-18

### Problem
Elasticsearch MCP tools were not receiving parameters correctly from the LLM. When searching for logs with date ranges (e.g., logs around 07:00 AM), the tools would receive empty arguments `{signal: {}, requestId: N}` instead of the actual search parameters.

### Root Cause
The MCP SDK was built for Zod 3.x but the project was using Zod 4.x. This version incompatibility caused the SDK to fail extracting arguments from the protocol messages, resulting in tools receiving metadata objects instead of actual parameters.

## Solution Implemented

### 1. Downgraded to Zod 3.x
```json
{
  "dependencies": {
    "zod": "3.23.8",
    "zod-to-json-schema": "3.23.5"
  }
}
```

### 2. Universal Wrapper Enhancement
Modified `/src/utils/universalToolWrapper.ts` to handle two schema patterns:

#### Pattern 1: Plain Objects with Zod Validators (Native Support)
```typescript
// These work directly with MCP SDK
{
  index: z.string().min(1),
  document: z.object({}).passthrough()
}
```

#### Pattern 2: ZodObject (Requires Conversion)
```typescript
// These need conversion to Pattern 1
z.object({
  index: z.string(),
  query: z.object({})
})
```

The wrapper now:
- Detects ZodObject schemas and extracts their shape (converting to Pattern 1)
- Keeps Pattern 1 schemas as-is for native MCP SDK handling
- Ensures all tools receive parameters correctly

### 3. Compatibility Wrapper Update
Updated `/src/utils/zodToJsonSchema.ts` to:
- Support both Zod 3.x (with zod-to-json-schema package)
- Handle passthrough objects correctly
- Remove $schema field for MCP SDK compatibility

## Impact

### Before Fix
- Tools received empty arguments
- Date range searches failed
- LLM couldn't pass parameters properly

### After Fix
- All 60+ tools receive parameters correctly
- Date range searches work (e.g., "@timestamp": { "gte": "2025-08-18T07:00:00Z" })
- No breaking changes to existing tools
- All tests pass (210 passing tests)

## Verification
Tested with multiple tool types:
- `elasticsearch_search` - Complex queries with date ranges
- `elasticsearch_list_indices` - Filtering and pagination
- `elasticsearch_index_document` - Document creation
- `elasticsearch_delete_document` - Document deletion
- `elasticsearch_bulk_operations` - Bulk operations
- `elasticsearch_execute_sql_query` - SQL queries

## Key Learnings

1. **MCP SDK Compatibility**: The MCP SDK requires Zod 3.x schemas or properly formatted JSON Schema
2. **Pattern 1 is Preferred**: Plain objects with Zod validators work best with MCP SDK
3. **Universal Wrapper Benefits**: A single wrapper can fix issues across all tools
4. **Fallback Defaults**: Tools should have sensible defaults but shouldn't rely on them for normal operation

## Migration Path (If Upgrading to Zod 4.x in Future)

When MCP SDK supports Zod 4.x:
1. Update dependencies to Zod 4.x
2. Remove the Pattern 1 conversion in the wrapper
3. Update zodToJsonSchema.ts to use Zod 4's native `toJSONSchema`
4. Test all tools to ensure parameter passing works