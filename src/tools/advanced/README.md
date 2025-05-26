# Advanced Tools

This folder contains specialized and advanced Elasticsearch tools for complex operations and SQL integration. These tools provide powerful capabilities for data manipulation and query optimization.

## Available Tools

### Query Operations
- **`delete_by_query`** - Delete documents matching query criteria *(Destructive Operation)*
- **`translate_sql_query`** - Translate SQL queries to Elasticsearch Query DSL

## Read-Only Mode Support

Advanced tools have mixed read-only mode behavior:

- **Read Operations**: `translate_sql_query` - Always allowed
- **Destructive Operations**: `delete_by_query` - Blocked/warned in read-only mode

## Tool Descriptions

### `delete_by_query`
Deletes all documents matching specified query criteria. This is a powerful bulk deletion tool that:
- Supports complex query criteria for targeted deletion
- Processes deletions in batches to maintain cluster stability
- Provides conflict resolution for concurrent modifications
- Supports throttling to control resource usage
- Offers detailed progress reporting and statistics

**Warning**: This operation permanently removes data and cannot be undone. Always test queries thoroughly before execution.

### `translate_sql_query`
Converts SQL queries into equivalent Elasticsearch Query DSL, useful for:
- Understanding how SQL queries are executed internally
- Optimizing SQL queries by examining the generated DSL
- Learning Elasticsearch Query DSL by comparing with familiar SQL syntax
- Debugging performance issues in SQL queries
- Migrating from SQL-based systems to native Elasticsearch queries

## Use Cases

### `delete_by_query`
- Data cleanup and purging based on date ranges or conditions
- Removing test data or corrupted documents
- Implementing data retention policies
- Bulk corrections after data ingestion errors

### `translate_sql_query`
- Query optimization and performance analysis
- Learning and migration assistance
- Debugging complex SQL queries
- Understanding Elasticsearch's SQL implementation

## Performance Considerations

- **`delete_by_query`** can be resource-intensive for large datasets. Consider using scroll and throttling options.
- Monitor cluster health during large deletion operations
- Use `translate_sql_query` to optimize SQL queries before execution

## Important Notes

- **`delete_by_query`** is irreversible. Always verify your query logic with a count operation first.
- SQL translation helps with optimization but native Query DSL often provides better performance and flexibility.
- Both tools support all standard Elasticsearch query features and options.

## File Structure

```
src/tools/advanced/
├── delete_by_query.ts      # Bulk document deletion by query
└── translate_sql_query.ts  # SQL to Query DSL translation
```

Each tool follows the established patterns for error handling, logging, parameter validation, and read-only mode compliance with enhanced safety measures for destructive operations.