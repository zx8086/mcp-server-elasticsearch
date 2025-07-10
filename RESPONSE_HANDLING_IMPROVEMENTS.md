# Response Handling Improvements

This document describes the improvements made to handle large responses in the MCP Elasticsearch server.

## Problem

The original ILM `get_lifecycle` tool had two major issues:

1. **Large Response Size**: Would return very large responses when querying policies with extensive usage information, leading to errors like:
   ```
   Error: MCP tool "elasticsearch_ilm_get_lifecycle" response (34577 tokens) exceeds maximum allowed tokens (25000).
   ```

2. **Policy Filtering Issue**: When requesting a specific policy by name, the tool would still return all policies (paginated to first 10) instead of filtering to the requested policy, making it impossible to retrieve specific policies from large clusters.

## Solution

### 1. Enhanced ILM Tool (`src/tools/ilm/get_lifecycle_improved.ts` → `get_lifecycle.ts`)

**Key Fix**: **Policy Filtering** - Now properly filters results when a specific policy name is requested, instead of returning paginated results of all policies.

**New Parameters:**
- `policy` (optional) - Now properly filters to return only the specified policy
- `limit` (default: 20, max: 100) - Controls number of policies returned
- `summary` (default: true) - Returns compact overview instead of full details
- `includeIndices` (default: false) - Controls whether to include indices/data streams lists
- `sortBy` (default: "name") - Sort policies by name, modified_date, version, or indices_count

**Features:**
- **Proper Policy Filtering**: When policy name is specified, returns only that policy
- **Smart Pagination**: Limits policies returned with clear metadata
- **Summary Mode**: Compact view showing key policy information
- **Response Truncation**: Automatic truncation if response still too large
- **Usage Control**: Optional inclusion of large usage lists
- **Multiple Sort Options**: Sort by various criteria

### 2. Response Handling Utilities (`src/utils/responseHandling.ts`)

**Reusable Functions:**
- `paginateResults()` - Apply pagination to any array
- `truncateResponse()` - Truncate content if it exceeds token limits
- `reduceObjectSize()` - Remove/truncate fields to reduce size
- `createPaginationHeader()` - Generate consistent pagination headers
- `estimateTokenCount()` - Rough token count estimation

**Presets:**
- Predefined limits for different tool types (list, detail, summary)

### 3. Alternative Implementation (`src/tools/ilm/get_lifecycle_improved.ts`)

A more advanced version with additional features:
- Sort by multiple fields (name, date, version, usage count)
- Phase distribution summaries
- Retention day calculations
- Enhanced markdown formatting

## Usage Examples

### Summary Mode (Default)
```bash
# Returns compact overview of first 10 policies
elasticsearch_ilm_get_lifecycle
```

### Detailed Mode with Specific Policy
```bash
# Returns full details for a specific policy
elasticsearch_ilm_get_lifecycle --policy "logs" --summary false
```

### Limited Results with Usage
```bash
# Returns 5 policies with usage information
elasticsearch_ilm_get_lifecycle --limit 5 --includeUsage true
```

## Benefits

1. **Prevents Token Limit Errors**: Smart pagination and truncation
2. **Improved Usability**: Summary mode shows key information quickly
3. **Configurable Detail**: Users can choose detail level based on needs
4. **Reusable Patterns**: Utilities can be applied to other tools
5. **Consistent UX**: Standard pagination headers and formatting

## Response Format Examples

### Summary Mode Output
```markdown
## ILM Policies (3 of 7)
⚠️ Showing first 3 policies. Use 'limit' parameter to see more.

### dev-staging-logs-30d
- **Version**: 11
- **Phases**: hot → warm → cold → delete
- **Retention**: 30 days

### logs
- **Version**: 15
- **Phases**: hot → warm → cold → frozen → delete
- **Retention**: 90 days
```

### Detailed Mode Output
```markdown
## ILM Policies (Detailed) (2 of 7)

```json
[
  {
    "name": "logs",
    "version": 15,
    "policy": {
      "phases": {
        "hot": {...},
        "warm": {...}
      }
    }
  }
]
```

## Future Improvements

1. **Apply to Other Tools**: Use utilities in tools that return large lists
2. **Streaming Responses**: For very large datasets, implement streaming
3. **Caching**: Cache responses for frequently accessed data
4. **Compression**: Implement response compression for large payloads
5. **User Preferences**: Allow users to set default limits and formats

## Migration Guide

The original tool behavior is preserved with these defaults:
- `summary=true` provides overview instead of raw JSON
- `limit=10` prevents overwhelming responses
- `includeUsage=false` excludes large usage lists

To get original behavior:
```bash
elasticsearch_ilm_get_lifecycle --summary false --limit 50 --includeUsage true
```