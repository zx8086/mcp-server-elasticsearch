# Alias Tools

This folder contains tools for managing Elasticsearch index aliases. Aliases provide flexible index abstraction, enabling zero-downtime index operations and simplified application integration.

## Available Tools

### Alias Management
- **`get_aliases`** - Get aliases for indices in Elasticsearch
- **`put_alias`** - Add an alias to an index *(Write Operation)*
- **`delete_alias`** - Delete an alias from an index *(Destructive Operation)*
- **`update_aliases`** - Perform atomic alias operations (add/remove multiple aliases) *(Write Operation)*

## Read-Only Mode Support

Alias tools respect read-only mode configuration:

- **Read Operations**: `get_aliases` - Always allowed
- **Write Operations**: `put_alias`, `update_aliases` - Blocked/warned in read-only mode  
- **Destructive Operations**: `delete_alias` - Blocked/warned in read-only mode

## Tool Descriptions

### `get_aliases`
Retrieves alias information showing which aliases point to which indices, including:
- Alias-to-index mappings
- Filter conditions applied to aliases
- Routing configurations
- Write index designations for multi-index aliases

### `put_alias`
Creates a new alias pointing to an index with optional configurations:
- **Filter aliases**: Apply query filters to limit visible documents
- **Routing aliases**: Direct operations to specific shards
- **Write aliases**: Designate which index receives writes in multi-index scenarios

### `delete_alias`
Removes an alias from an index. This operation only removes the alias reference - the underlying index and data remain unchanged.

### `update_aliases`
Performs atomic alias operations, enabling complex alias management:
- Add and remove multiple aliases in a single operation
- Implement zero-downtime index transitions
- Ensure consistency during index migrations
- Coordinate complex alias routing changes

## Use Cases

### Zero-Downtime Operations
```bash
# Atomic index switching
update_aliases:
  actions:
    - remove: { index: "logs_v1", alias: "logs_current" }
    - add: { index: "logs_v2", alias: "logs_current" }
```

### Filtered Views
```bash
# Create filtered alias for specific data
put_alias:
  index: "products"
  alias: "active_products"
  filter: { term: { status: "active" } }
```

### Multi-Index Management
```bash
# Time-based log aggregation
put_alias:
  index: "logs_2023_12"
  alias: "logs_current"
  is_write_index: true
```

## Common Patterns

### Index Versioning
- Use aliases to abstract application code from index names
- Enable seamless index migrations and rollbacks
- Maintain consistent API endpoints during schema changes

### Data Segmentation
- Create filtered aliases for different user groups or data views
- Implement row-level security through alias filters
- Provide specialized views of large datasets

### Write Distribution
- Direct writes to specific indices while maintaining read consistency
- Implement index rotation strategies for time-series data
- Balance write load across multiple indices

## Important Notes

- **Alias operations** are atomic - either all changes succeed or all fail
- **Filtered aliases** apply query filters at the cluster level for security
- **Write index** designation controls where new documents are indexed
- **Routing aliases** can improve performance by limiting shard access
- Aliases do not consume additional storage - they are metadata only

## Best Practices

- Use aliases instead of direct index names in applications
- Plan alias naming conventions for consistency
- Test alias filters thoroughly to ensure correct data visibility
- Use atomic operations (`update_aliases`) for complex changes
- Monitor alias usage for performance optimization

## File Structure

```
src/tools/alias/
├── get_aliases.ts      # Alias information retrieval
├── put_alias.ts        # Single alias creation
├── delete_alias.ts     # Single alias removal
└── update_aliases.ts   # Atomic multi-alias operations
```

Each tool follows the established patterns for error handling, logging, parameter validation, and read-only mode compliance with special attention to maintaining data consistency during alias operations.