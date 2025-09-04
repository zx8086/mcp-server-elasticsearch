# Core Tools

This folder contains fundamental Elasticsearch tools that provide basic cluster exploration and search capabilities. These are the most commonly used tools for interacting with Elasticsearch.

## Available Tools

### Index Discovery
- **`list_indices`** - List all available Elasticsearch indices with health and document count information
- **`get_mappings`** - Get field mappings for a specific Elasticsearch index
- **`get_shards`** - Get shard information for all or specific indices

### Search Operations  
- **`search`** - Perform an Elasticsearch search with query DSL and automatic highlighting

## Read-Only Mode Support

All Core tools are read-only operations and are always allowed regardless of read-only mode configuration:

- **Read Operations**: All tools in this folder - Always allowed
- **Write Operations**: None
- **Destructive Operations**: None

## Tool Descriptions

### `list_indices`
Returns a list of indices in the cluster with their health status, state, and document counts. Essential for discovering what data is available.

### `get_mappings`
Retrieves the complete field mapping definition for an index, showing data types and field properties. Critical for understanding data structure.

### `search`
The primary search interface supporting full Elasticsearch Query DSL. Automatically enables highlighting on text fields and provides formatted results.

### `get_shards`
Shows shard allocation and status across cluster nodes. Useful for troubleshooting performance and distribution issues.

## File Structure

```
src/tools/core/
├── list_indices.ts       # Index discovery and listing
├── get_mappings.ts       # Field mapping retrieval
├── search.ts             # Primary search functionality
└── get_shards.ts         # Shard information and status
```

Each tool follows the established patterns for error handling, logging, parameter validation, and provides comprehensive search results with proper formatting.