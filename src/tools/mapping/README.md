# Mapping Tools

This folder contains specialized tools for field mapping analysis and SQL cursor management. These tools provide detailed field-level information and manage SQL query resources.

## Available Tools

### Field Mapping Analysis
- **`get_field_mapping`** - Get detailed mapping information for specific fields

### SQL Resource Management  
- **`clear_sql_cursor`** - Clear SQL cursors to free server resources

## Read-Only Mode Support

All Mapping tools are read-only operations and are always allowed:

- **Read Operations**: All tools in this folder - Always allowed
- **Write Operations**: None
- **Destructive Operations**: None

## Tool Descriptions

### `get_field_mapping`
Retrieves detailed mapping information for specific fields within an index:
- **Field type**: Data type (text, keyword, date, numeric, etc.)
- **Field properties**: Analyzer settings, format specifications, and options
- **Mapping parameters**: Index-time configuration like `index`, `store`, `doc_values`
- **Sub-field mappings**: Multi-field configurations and their specific settings
- **Field capabilities**: What operations are supported (search, aggregation, sorting)

This tool is more specific than `get_mappings` from core tools, focusing on individual field analysis rather than complete index mapping structure.

### `clear_sql_cursor`
Manages SQL query cursors used for pagination in large SQL result sets:
- **Resource cleanup**: Frees server-side resources allocated for SQL cursors
- **Memory management**: Prevents resource leaks from abandoned SQL queries
- **Session management**: Properly terminates long-running SQL query sessions

## Use Cases

### Field Mapping Analysis
- **Schema validation**: Verify field configurations match requirements
- **Troubleshooting**: Diagnose field-specific search or aggregation issues
- **Migration planning**: Understand current field configurations before changes
- **Performance analysis**: Analyze field settings that impact query performance

### SQL Resource Management
- **Long-running queries**: Clean up resources from paginated SQL queries
- **Resource optimization**: Free memory used by completed or abandoned SQL sessions
- **Connection management**: Properly terminate SQL query contexts
- **Error recovery**: Clean up cursors after SQL query failures

## Field Mapping Information

The tool provides comprehensive field-level details:

```json
{
  "myindex": {
    "mappings": {
      "title": {
        "full_name": "title",
        "mapping": {
          "title": {
            "type": "text",
            "analyzer": "standard",
            "fields": {
              "keyword": {
                "type": "keyword",
                "ignore_above": 256
              }
            }
          }
        }
      }
    }
  }
}
```

## SQL Cursor Management

SQL cursors are created automatically during paginated SQL queries and should be cleaned up when no longer needed:

```json
{
  "cursor": "sDXF1ZXJ5QW5kRmV0Y2gBAAAAAAAAAAEWYUpOYklQdDhTT..."
}
```

## Performance Considerations

### Field Mapping Analysis
- Field mapping retrieval is lightweight and cached
- Specific field queries are faster than full mapping retrieval
- Multiple field analysis in single request reduces overhead

### SQL Cursor Management
- Cursors consume server memory and should be cleaned promptly
- Elasticsearch automatically expires unused cursors after timeout
- Manual cleanup is recommended for resource-conscious applications

## Integration Patterns

### With Core Tools
- Use `get_mappings` for full index structure overview
- Use `get_field_mapping` for detailed field-specific analysis
- Combine both for comprehensive mapping understanding

### With Search Tools
- Clear SQL cursors after completing paginated SQL queries
- Use field mapping analysis to optimize SQL query performance
- Understand field capabilities before writing complex SQL queries

## Important Notes

- **Field mappings** cannot be changed once created (requires reindexing)
- **SQL cursors** automatically expire but manual cleanup is good practice  
- **Field analysis** helps understand why queries behave in specific ways
- **Cursor management** prevents resource leaks in long-running applications

## File Structure

```
src/tools/mapping/
├── get_field_mapping.ts  # Detailed field-level mapping analysis
└── clear_sql_cursor.ts   # SQL cursor resource management
```

Each tool follows the established patterns for error handling, logging, parameter validation, and provides specialized functionality for field analysis and resource management.