# Bulk Tools

This folder contains tools for efficient batch operations in Elasticsearch. These tools are optimized for handling multiple documents or operations in a single request.

## Available Tools

### Bulk Data Operations
- **`bulk_operations`** - Perform bulk index, update, and delete operations *(Write/Destructive Operation)*
- **`multi_get`** - Get multiple documents from Elasticsearch in a single request

## Read-Only Mode Support

Bulk tools have mixed read-only mode behavior:

- **Read Operations**: `multi_get` - Always allowed
- **Write/Destructive Operations**: `bulk_operations` - Blocked/warned in read-only mode

## Tool Descriptions

### `bulk_operations`
High-performance bulk operations supporting index, update, and delete actions in a single request. Uses Elasticsearch's bulk helpers for optimal memory management and error handling. Supports:
- Automatic batching and concurrency control
- Configurable flush bytes and retry mechanisms  
- Per-document error reporting
- Global index specification or per-document routing

### `multi_get`
Efficiently retrieves multiple documents by their IDs in a single request. Supports:
- Cross-index document retrieval
- Source filtering and field selection
- Routing and preference parameters
- Version control and stored fields

## Performance Considerations

- **`bulk_operations`** is significantly more efficient than individual document operations for large datasets
- Default batch size is optimized for memory usage (5MB flush bytes)
- Concurrency is limited to prevent overwhelming the cluster (5 concurrent operations)
- Failed documents are retried automatically with exponential backoff

## Important Notes

- **`bulk_operations`** can perform destructive operations (deletes) mixed with writes. Use with caution in production.
- Bulk operations provide detailed error reporting per document, allowing partial success scenarios.
- Memory usage scales with batch size - monitor cluster resources during large bulk operations.

## File Structure

```
src/tools/bulk/
├── bulk_operations.ts    # High-performance bulk operations
└── multi_get.ts          # Efficient multi-document retrieval
```

Each tool follows the established patterns for error handling, logging, parameter validation, and read-only mode compliance with enhanced monitoring for large-scale operations.