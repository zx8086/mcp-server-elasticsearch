# Summary of Default Values Fix

## Problem
LLMs were unable to control tool parameters because Zod schemas had hardcoded `.default()` values that would override whatever the LLM requested. For example, when an LLM requested 50 or 92 policies, the tool would always return 20 due to `.default(20)`.

## Root Cause
1. **Schema defaults** - `.default(value)` in Zod schemas meant validation would inject the default even when LLM provided a value
2. **Misleading descriptions** - Tool descriptions mentioned "default: 20" which confused LLMs
3. **No string-to-number conversion** - LLMs sometimes pass numbers as strings

## Solution Applied

### 1. Removed ALL `.default()` calls from tool schemas
- Changed `.default(20)` → `.optional()`
- Affected 98 tool files across the codebase
- Tools now accept `undefined` and handle it appropriately

### 2. Added string-to-number conversion for limit parameters
```typescript
limit: z
  .union([z.number(), z.string().regex(/^\d+$/).transform(val => parseInt(val, 10))])
  .pipe(z.number().min(1).max(100))
  .optional()
```

### 3. Fixed tool descriptions
- Removed mentions like "default: 20" 
- Changed to "Range: 1-100" format
- Clear parameter expectations without misleading defaults

### 4. Query wrapper unwrapping
Added logic in `universalToolWrapper.ts` to detect and unwrap parameters incorrectly wrapped in `query` object by LLMs.

## Tools Fixed
- ✅ elasticsearch_ilm_get_lifecycle
- ✅ elasticsearch_ilm_explain_lifecycle  
- ✅ elasticsearch_get_aliases
- ✅ elasticsearch_get_index_template
- ✅ elasticsearch_enrich_get_policy
- ✅ elasticsearch_list_indices
- ✅ elasticsearch_search
- ✅ elasticsearch_get_mappings
- ✅ elasticsearch_execute_sql_query
- ✅ elasticsearch_count_documents
- ✅ elasticsearch_indices_summary
- ✅ elasticsearch_scroll_search
- ✅ elasticsearch_bulk_operations
- ✅ And 85+ more tools

## Testing
- All unit tests pass (201 passing)
- Parameter passing tests confirm LLM values are preserved
- No defaults are injected when parameters are undefined
- String numbers are correctly converted
- Query-wrapped parameters are unwrapped

## Impact
LLMs can now:
- Control limit parameters (e.g., request 50, 75, or 92 items)
- Pass parameters as strings or numbers
- Omit optional parameters without defaults being injected
- Have full control over tool behavior

## Verification
Run these tests to verify the fix:
```bash
bun test                          # All unit tests
bun test-no-defaults.ts          # Verify no defaults remain
bun test-llm-parameters-final.ts # Test LLM parameter passing
```