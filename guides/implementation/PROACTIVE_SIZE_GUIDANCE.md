# Proactive Size Guidance Strategy

## Problem Observed from Screenshots
The LLM is doing trial-and-error when responses are too large:
1. Tries empty `{}` → "Response too large" 
2. Recognizes the issue → "The node stats response is quite large..."
3. Tries `{compact: true}` → Still fails
4. Tries specific metrics → May still fail

The LLM **understands** large responses are a problem but lacks **upfront guidance** to avoid them.

## Solution: Proactive Warnings Without Defaults

### Key Principles
1. **WARNING upfront** - Tell LLMs responses WILL fail before they try
2. **Size thresholds** - Give specific numbers (>500 shards, >100 indices, >1MB)
3. **Check first** - Suggest checking size with lighter tools first
4. **Best practices** - Provide proven parameter combinations
5. **No defaults** - Let LLMs choose based on their specific needs

### Description Pattern

```
"[Tool purpose]. WARNING: [Size issue]. [Check first instruction]. 
[Threshold guidance]. [Best practice patterns]. 
Empty {} only works for [small scenario]."
```

## Implementation Examples

### elasticsearch_get_nodes_info
**Before:** 
```
"Get node information. Returns FULL details unless you specify options."
```

**After:**
```
"Get node information. WARNING: Full node info often exceeds size limits (>1MB per node). 
ALWAYS use one of: {compact: true} for essential metrics, {metric: 'os,jvm'} for specific metrics. 
Empty {} will likely fail with 'Response too large' error."
```

### elasticsearch_get_nodes_stats
**Before:**
```
"Get node statistics from the Elasticsearch cluster."
```

**After:**
```
"Get node statistics. WARNING: Full stats often exceed size limits (>1MB). 
ALWAYS specify 'metric' parameter. Common patterns: {metric: 'os,jvm'} for system metrics. 
Empty {} will likely fail with 'Response too large' error."
```

### elasticsearch_get_shards
**Before:**
```
"Get shard information for indices."
```

**After:**
```
"Get shard information. WARNING: Clusters often have 1000+ shards. 
Check cluster stats first to see shard count. If >500 shards, MUST use 'limit' or will fail. 
Patterns: {limit: 100, sortBy: 'state'} for health check."
```

### elasticsearch_ilm_explain_lifecycle
**Before:**
```
"Explain ILM status for indices."
```

**After:**
```
"Explain ILM status. WARNING: Can return 1000+ indices. 
First check index count with list_indices. If >100 indices, MUST use filters or will truncate. 
Best practice: {onlyManaged: true, limit: 50} for overview."
```

## Why This Works

### 1. Prevents Trial-and-Error
- LLM knows upfront that empty `{}` will fail
- Doesn't waste API calls trying different approaches
- Gets it right the first time

### 2. Provides Decision Framework
- Clear thresholds (>500 shards, >100 indices, >1MB)
- Suggests preliminary checks (cluster stats, index count)
- Gives proven parameter combinations

### 3. No Defaults to Override
- LLM chooses parameters based on actual needs
- No hardcoded values that become mandatory
- Flexibility for different use cases

### 4. Educational
- LLM learns cluster size patterns
- Understands which metrics are heavy
- Can make informed decisions

## Parameter Guidance Patterns

### Pattern 1: Size Check First
```
"Check cluster stats first to see shard count. If >500 shards, MUST use 'limit'"
```

### Pattern 2: Common Use Cases
```
"Common patterns: {metric: 'os,jvm'} for system metrics, {metric: 'fs'} for disk usage"
```

### Pattern 3: Best Practices
```
"Best practice: {onlyManaged: true, limit: 50} for overview"
```

### Pattern 4: Failure Warning
```
"Empty {} will likely fail with 'Response too large' error"
```

## Testing the Approach

When an LLM sees these descriptions, it should:
1. Recognize the size risk immediately
2. Choose appropriate parameters proactively
3. Not need to retry after failures
4. Understand when to check size first

## Benefits Over Previous Approaches

| Approach | Problem | Our Solution |
|----------|---------|--------------|
| Runtime defaults | LLMs treat them as mandatory | No defaults, just warnings |
| Vague suggestions | LLMs don't know when to apply | Specific thresholds |
| Post-failure messages | Requires retry | Proactive guidance |
| Complex logic | Hard to understand | Clear patterns |

## Key Insight
The screenshots show LLMs are smart enough to recognize "response too large" and adapt. 
We just need to give them the information **before** the first call, not after it fails.

## Success Metrics
- Fewer "Response too large" errors
- No trial-and-error patterns
- First call succeeds with appropriate parameters
- LLMs understand when and why to use parameters