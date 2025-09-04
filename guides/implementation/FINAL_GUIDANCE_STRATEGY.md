# Final Guidance Strategy: Proactive Warnings Without Defaults

## The Problem (from Screenshots)
LLMs are smart but doing expensive trial-and-error:
1. Call with `{}` → "Response too large" ❌
2. Recognize issue → "Let me try a different approach..."
3. Call with `{compact: true}` → Still fails ❌  
4. Call with specific metrics → May work ✓

**Result**: 3+ API calls to get one working response

## The Solution: Proactive Size Warnings

### Core Strategy
Tell LLMs **BEFORE** they call that responses will fail, not after.

### Three Levels of Guidance

#### Level 1: WARNING
```
"WARNING: Full node info often exceeds size limits (>1MB per node)."
```
- Immediate alert that default behavior will fail
- Specific size threshold (>1MB)
- LLM knows not to try empty `{}`

#### Level 2: MUST/ALWAYS
```
"ALWAYS use one of: {compact: true} for essential metrics, {metric: 'os,jvm'} for specific metrics."
```
- Clear directive for required parameters
- Multiple valid options
- No single default to become mandatory

#### Level 3: Failure Prediction
```
"Empty {} will likely fail with 'Response too large' error."
```
- Explicitly states what will happen
- Prevents trial-and-error
- LLM won't waste the first call

## Implementation Pattern

### Tool Description Formula
```
"[Purpose]. WARNING: [Size issue with threshold]. 
[Check instruction if applicable]. 
ALWAYS/MUST use [parameter options]. 
[Common patterns with use cases]. 
Empty {} [failure prediction]."
```

### Real Examples

#### elasticsearch_get_nodes_info
```
"Get node information. WARNING: Full node info often exceeds size limits (>1MB per node). 
ALWAYS use one of: {compact: true} for essential metrics, {metric: 'os,jvm'} for specific metrics. 
Empty {} will likely fail with 'Response too large' error."
```

#### elasticsearch_get_shards  
```
"Get shard information. WARNING: Clusters often have 1000+ shards. 
Check cluster stats first to see shard count. If >500 shards, MUST use 'limit' or will fail. 
Patterns: {limit: 100, sortBy: 'state'} for health check."
```

#### elasticsearch_list_indices
```
"List indices with filtering. TIP: Use this FIRST to check cluster size before other tools. 
Common patterns: {limit: 50, excludeSystemIndices: true} for overview."
```

## Key Principles

### 1. No Runtime Defaults
```typescript
// BAD - Creates mandatory behavior
const limit = params.limit ?? 100;

// GOOD - LLM decides
const { limit } = params;
if (!limit && totalShards > 1000) {
  // Warn in response, don't override
}
```

### 2. Educate, Don't Enforce
- Tell LLMs WHY parameters are needed
- Give thresholds (>500 shards, >1MB)
- Let them decide based on context

### 3. Progressive Discovery
```
1. "Use list_indices FIRST to check cluster size"
2. "If >100 indices, MUST use filters"
3. "Best practice: {onlyManaged: true, limit: 50}"
```

### 4. Pattern-Based Examples
Instead of defaults, provide patterns for common use cases:
- Health check: `{limit: 100, sortBy: 'state'}`
- Storage analysis: `{limit: 50, sortBy: 'size'}`
- System metrics: `{metric: 'os,jvm'}`

## Why This Works

### Before (Trial-and-Error)
```
LLM: {} → Error
LLM: "Let me try compact" → {compact: true} → Error
LLM: "Let me try metrics" → {metric: 'os'} → Success
Cost: 3 API calls
```

### After (Proactive Success)
```
LLM reads: "WARNING... ALWAYS use {compact: true}..."
LLM: {compact: true} → Success
Cost: 1 API call
```

## Validation Approach

The tool descriptions should answer:
1. **Will empty {} work?** → "Empty {} will likely fail"
2. **What should I use?** → "ALWAYS use one of: ..."
3. **When is it needed?** → "If >500 shards", ">1MB per node"
4. **What's the best practice?** → "Common patterns: ..."

## Implementation Checklist

✅ Remove ALL runtime defaults  
✅ Add WARNING for size issues
✅ Specify thresholds (>500, >1000, >1MB)
✅ Provide ALWAYS/MUST directives
✅ Include failure predictions
✅ Give pattern examples
✅ Suggest preliminary checks

## Results

- **No defaults** = No override issues
- **Proactive warnings** = First call succeeds
- **Clear thresholds** = LLM knows when to apply
- **Pattern examples** = LLM picks appropriate option
- **Failure predictions** = No trial-and-error

## The Key Insight

LLMs are intelligent enough to adapt when they see "Response too large." 
We just need to give them that information **before** the call, not after.

This approach respects LLM intelligence while preventing expensive mistakes.