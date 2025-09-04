# No-Defaults Solution for Response Size Management

## Key Principle
**NO RUNTIME DEFAULTS** - Let LLMs control parameters explicitly through clear guidance in descriptions.

## Why No Defaults?
As you correctly identified:
1. When we add defaults (even runtime ones), LLMs see them as mandatory
2. LLMs will repeatedly use whatever is mentioned as "default" 
3. This defeats the purpose of giving LLMs control over parameters
4. We already removed `.default()` from Zod schemas for this exact reason

## Solution Approach

### 1. Descriptive Guidance Without Defaults
Instead of:
```typescript
// BAD - LLM will always use 100
const limit = params.limit ?? 100; // Runtime default
"Use limit parameter (default: 100)"
```

We do:
```typescript
// GOOD - LLM decides based on need
const { limit } = params; // No default
"Returns ALL shards unless you specify 'limit'. For large clusters (1000+ shards), ALWAYS use limit."
```

### 2. Conditional Logic Based on Data Size
Tools check response size and warn ONLY when needed:
```typescript
// Only warn if response is actually large
if (!limit && totalShards > 1000) {
  metadataText = `⚠️ Response contains ${totalShards} shards. Consider using 'limit' parameter.`;
  metadataText += `\n💡 Example: {limit: 100, sortBy: 'state'}`;
}
```

### 3. Examples Without Defaults
Tool descriptions provide examples without implying defaults:
```typescript
// Instead of: "default: 100"
// We say: "Examples: {limit: 100} for top 100, {limit: 50} for top 50"
```

## Implementation Details

### elasticsearch_get_shards
- **No default limit** - Returns all shards unless LLM specifies
- **Conditional warning** - Only warns if >1000 shards and no limit
- **Example-based guidance** - Shows how to use parameters without defaults

### elasticsearch_get_nodes_info  
- **No default compact mode** - Returns full info unless LLM specifies
- **Explicit opt-in** - `compact: true` must be explicitly set
- **Clear consequences** - Description explains what happens without parameters

### elasticsearch_ilm_explain_lifecycle
- **No default filters** - Returns all indices unless LLM filters
- **Recommendation without default** - "Highly recommended for large clusters"
- **Multiple options** - LLM can choose limit, onlyManaged, or both

## Tool Description Pattern

```
"[What it does]. Returns ALL [items] unless you specify [parameter]. 
For [large scenario], use {[parameter]: [example]} to [benefit].
Examples: {[param1]: [value1]} for [use case 1], {[param2]: [value2]} for [use case 2]."
```

## Response Handler Updates
Truncation messages now provide specific parameter examples:
- ILM tools: `"Add parameters to control response: {limit: 50, onlyManaged: true}"`
- Shard tools: `"Add parameters to control response: {limit: 100, sortBy: 'state'}"`
- Node tools: `"Add parameters to control response: {compact: true}"`

## Benefits
1. **LLM Control** - LLMs decide what parameters to use based on context
2. **No Override Issues** - No defaults means no overriding LLM intentions
3. **Adaptive Behavior** - LLMs can request all data or limited data as needed
4. **Clear Guidance** - Examples show how to use parameters without mandating them
5. **Conditional Warnings** - Only warn about size when actually needed

## Testing
All 201 tests pass with this approach:
- Tools accept undefined parameters gracefully
- No defaults are applied automatically
- LLM-provided values are always respected
- Truncation only happens when necessary

## Key Difference from Previous Approach
**Before**: Added smart defaults thinking they'd help
**Problem**: LLMs treated defaults as mandatory
**Now**: No defaults, just clear guidance and examples
**Result**: LLMs have full control and make informed decisions