# Elasticsearch MCP Tools - Parameter Guide

## Important: Common Parameter Names and Defaults

### elasticsearch_search
**Parameters:**
- `index` (string, default: "*") - Index pattern to search
- `queryBody` (object, default: {query: {match_all: {}}}) - **NOT 'body'**, use 'queryBody'

**Correct Usage:**
```json
{
  "index": "logs-*",
  "queryBody": {
    "query": { "match_all": {} },
    "size": 100
  }
}
```

**Common Mistakes to Avoid:**
- ❌ Using `body` instead of `queryBody`
- ❌ Omitting both parameters (now they have defaults)
- ❌ Using undefined for index

### elasticsearch_list_indices
**Parameters:**
- `indexPattern` (string, default: "*") - Pattern to match indices
- `limit` (number, default: 50) - Max indices to return
- `excludeSystemIndices` (boolean, default: true)

**Correct Usage:**
```json
{
  "indexPattern": "*logs*",
  "limit": 100
}
```

### elasticsearch_get_mappings
**Parameters:**
- `index` (string, default: "*") - Index pattern for mappings

**Correct Usage:**
```json
{
  "index": "logs-*"
}
```

### elasticsearch_execute_sql_query
**Parameters:**
- `query` (string, default: "SELECT * FROM * LIMIT 10") - SQL query string

**Correct Usage:**
```json
{
  "query": "SELECT * FROM logs-* WHERE status = 500 LIMIT 100"
}
```

### elasticsearch_count_documents
**Parameters:**
- `index` (string, default: "*") - Index pattern
- `query` (object, default: {match_all: {}}) - Query DSL

**Correct Usage:**
```json
{
  "index": "logs-*",
  "query": {
    "match": { "status": "error" }
  }
}
```

## Key Points for LLM Agents

1. **All major tools now have sensible defaults** - You can call them with empty `{}` if needed
2. **Use exact parameter names** - `queryBody` not `body`, `indexPattern` not `pattern`
3. **Index patterns support wildcards** - Use `*` for all, `logs-*` for logs, etc.
4. **Query DSL goes in queryBody** - Include size, from, aggs, sort in the queryBody object
5. **SQL queries are strings** - Pass the full SQL query as a string to execute_sql_query

## Example Calls

### Search all indices for errors:
```json
{
  "tool": "elasticsearch_search",
  "parameters": {
    "index": "*",
    "queryBody": {
      "query": {
        "match": { "level": "error" }
      },
      "size": 50
    }
  }
}
```

### List indices matching a pattern:
```json
{
  "tool": "elasticsearch_list_indices", 
  "parameters": {
    "indexPattern": "*2025.08.16*"
  }
}
```

### Get mappings for all logs:
```json
{
  "tool": "elasticsearch_get_mappings",
  "parameters": {
    "index": "logs-*"
  }
}
```

### Count documents with SQL:
```json
{
  "tool": "elasticsearch_execute_sql_query",
  "parameters": {
    "query": "SELECT COUNT(*) FROM logs-* WHERE timestamp > '2025-08-16'"
  }
}
```