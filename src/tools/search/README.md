# Search Tools

This folder contains advanced search capabilities and query management tools for Elasticsearch. These tools extend beyond basic search with specialized query types and bulk query operations.

## Available Tools

### Advanced Query Operations
- **`execute_sql_query`** - Execute SQL queries using Elasticsearch SQL API
- **`count_documents`** - Count documents matching query criteria
- **`scroll_search`** - Perform large result set pagination using scroll API
- **`multi_search`** - Execute multiple searches in a single request

### Query Management
- **`update_by_query`** - Update documents matching query criteria *(Write Operation)*
- **`clear_scroll`** - Clear scroll contexts to free resources

## Read-Only Mode Support

Search tools have mixed read-only mode behavior:

- **Read Operations**: `execute_sql_query`, `count_documents`, `scroll_search`, `multi_search`, `clear_scroll` - Always allowed
- **Write Operations**: `update_by_query` - Blocked/warned in read-only mode

## Tool Descriptions

### `execute_sql_query`
Executes SQL queries against Elasticsearch indices using the SQL API. Supports various output formats (JSON, CSV, TSV) and cursor-based pagination for large results.

### `count_documents`
Efficiently counts documents matching query criteria without retrieving document content. Supports all query types and provides fast cardinality estimates.

### `scroll_search`
Handles large result sets using Elasticsearch's scroll API or modern search helpers. Automatically manages memory usage and provides streaming access to large datasets.

### `multi_search`
Executes multiple independent searches in a single request, improving performance for dashboard-style queries or batch search operations.

### `update_by_query`
Updates multiple documents matching query criteria using scripts or partial document updates. Supports conflict resolution and progress monitoring.

### `clear_scroll`
Manually clears scroll contexts to free cluster resources. Important for long-running applications using scroll searches.

## Performance Considerations

- **Scroll searches** automatically manage memory and prevent cluster overload
- **Multi-search** reduces network overhead for multiple concurrent queries
- **Update by query** processes documents in batches to prevent cluster stress
- **SQL queries** are translated to Elasticsearch Query DSL for optimal performance

## Important Notes

- **`update_by_query`** can modify large numbers of documents. Use with caution and test thoroughly before production use.
- Scroll contexts consume cluster resources - always clear them when finished or use reasonable timeouts.
- SQL API provides familiar query syntax but may have limitations compared to native Query DSL.

## File Structure

```
src/tools/search/
├── execute_sql_query.ts  # SQL query execution
├── count_documents.ts    # Document counting
├── scroll_search.ts      # Large result set handling
├── multi_search.ts       # Batch search operations
├── update_by_query.ts    # Bulk document updates
└── clear_scroll.ts       # Resource cleanup
```

Each tool follows the established patterns for error handling, logging, parameter validation, and read-only mode compliance with additional monitoring for resource-intensive operations.