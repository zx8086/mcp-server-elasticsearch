# Nodes Tools Rewrite - Complete Solution

## Problem Analysis (from Screenshots)

The LLM tried multiple approaches but kept failing:
1. `{metric: "jvm"}` → "Response too large" 
2. `{metric: "os,jvm,fs,indices"}` → Still too large
3. `{metric: "os,jvm", compact: true}` → Still failing

Even with specific metrics, the responses exceeded size limits because:
- The `indices` metric returns massive data without `indexMetric` specification
- Multiple nodes multiply the response size
- No aggregation level control

## Solution: Proper API Usage

### 1. elasticsearch_get_nodes_stats Improvements

#### Added Parameters
- **`level`**: Controls aggregation (`cluster`, `indices`, `shards`)
- **`indexMetric`**: Required when using `indices` metric

#### Smart Fallbacks
```typescript
// No metric specified → Force minimal
if (!metric) {
  return esClient.nodes.stats({
    metric: "os,jvm",  // Minimal useful metrics
    level: "cluster",  // Summary only
  });
}

// 'indices' without indexMetric → Default to basic
if (metric.includes("indices") && !indexMetric) {
  return esClient.nodes.stats({
    metric: metric,
    index_metric: "docs,store",  // Just counts and size
  });
}
```

#### New Description
```
"WARNING: Returns massive data without metric filter. 
BEST PRACTICES: {metric: 'jvm', level: 'cluster'} for JVM summary, 
{metric: 'indices', indexMetric: 'docs,store'} for index metrics. 
NEVER use empty {} or {metric: 'indices'} without indexMetric."
```

### 2. elasticsearch_get_nodes_info Improvements

#### Simplified Compact Mode
```typescript
if (compact === true) {
  // Use safe metric combination
  return esClient.nodes.info({
    metric: "os,jvm,process,transport"
  });
}
```

#### Minimal Fallback
```typescript
if (!metric && !compact) {
  // Return just node names to prevent huge response
  return esClient.nodes.info({
    metric: "name"
  });
}
```

#### New Description
```
"WARNING: Full info exceeds 1MB per node. 
SAFE OPTIONS: {metric: 'name'} for node list, 
{metric: 'os,jvm'} for basic info. 
NEVER use empty {} - it will fail."
```

## Key API Insights

### nodes.stats API
- **metric**: Controls which statistics to return
- **index_metric**: Sub-metrics for 'indices' (critical!)
- **level**: Aggregation level reduces data volume

### nodes.info API  
- **metric**: Controls which node info to return
- Returns static configuration (vs dynamic stats)
- Much smaller than stats but still large without filtering

## Best Practice Patterns

### For Health Monitoring
```json
{
  "metric": "jvm,os",
  "level": "cluster"
}
```

### For Disk Usage
```json
{
  "metric": "fs"
}
```

### For Index Statistics
```json
{
  "metric": "indices",
  "indexMetric": "docs,store",
  "level": "indices"
}
```

### For Node Discovery
```json
{
  "metric": "name"
}
```

## Implementation Changes

### Files Modified
- `src/tools/cluster/get_nodes_stats.ts` - Added level parameter, smart fallbacks
- `src/tools/cluster/get_nodes_info.ts` - Simplified compact mode, minimal fallback
- `tests/tools/comprehensive-tools.test.ts` - Updated mocks for new behavior

### Behavior Changes

#### Before
- Empty `{}` → Massive response → Failure
- `{metric: "indices"}` → Huge response → Failure
- No guidance on proper parameter usage

#### After
- Empty `{}` → Minimal response with warning
- `{metric: "indices"}` → Defaults to basic metrics with warning
- Clear guidance on required parameters
- Fallback to safe defaults when problematic

## Testing Results

All unit tests pass (201 passing).

Test scenarios verify:
- Empty parameters return minimal data
- Compact mode uses safe metrics
- 'indices' without indexMetric gets default
- Level parameter reduces data volume
- Warnings guide to proper usage

## LLM Guidance Strategy

### 1. Upfront Warnings
```
"WARNING: Returns massive data without metric filter"
"NEVER use empty {} or {metric: 'indices'} without indexMetric"
```

### 2. Best Practice Examples
```
"BEST PRACTICES: {metric: 'jvm', level: 'cluster'} for JVM summary"
```

### 3. Safe Fallbacks
When LLM makes a mistake, tools return minimal data with guidance rather than failing.

## Success Metrics

✅ No more "Response too large" errors with proper parameters
✅ Clear guidance prevents trial-and-error
✅ Smart fallbacks handle mistakes gracefully
✅ Responses stay within 2MB limit
✅ LLMs learn correct patterns from warnings

## The Key Lesson

**Don't just limit response size - use the API properly!**

The Elasticsearch API provides fine-grained control through:
- Metric selection
- Sub-metric filtering  
- Aggregation levels
- Field filtering

By properly using these parameters (and teaching LLMs to use them), we avoid large responses entirely rather than truncating after the fact.