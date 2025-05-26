# Index Management Tools

This folder contains comprehensive index management capabilities for Elasticsearch. These tools handle index lifecycle operations, settings management, and structural modifications.

## Available Tools

### Index Lifecycle
- **`create_index`** - Create an index with mappings, settings, and aliases *(Write Operation)*
- **`delete_index`** - Delete an index and all its data *(Destructive Operation)*
- **`index_exists`** - Check if an index exists
- **`get_index`** - Get complete index information including settings and mappings

### Index Configuration
- **`update_index_settings`** - Update dynamic index settings *(Write Operation)*
- **`get_index_settings`** - Retrieve current index settings
- **`put_mapping`** - Add or update field mappings *(Write Operation)*

### Index Maintenance
- **`refresh_index`** - Force index refresh to make recent changes searchable *(Write Operation)*
- **`flush_index`** - Force index flush to disk *(Write Operation)*
- **`reindex_documents`** - Copy/transform documents between indices *(Write Operation)*

## Read-Only Mode Support

Index management tools respect read-only mode configuration:

- **Read Operations**: `index_exists`, `get_index`, `get_index_settings` - Always allowed
- **Write Operations**: `create_index`, `update_index_settings`, `put_mapping`, `refresh_index`, `flush_index`, `reindex_documents` - Blocked/warned in read-only mode
- **Destructive Operations**: `delete_index` - Blocked/warned in read-only mode

## Tool Descriptions

### Index Lifecycle Tools

#### `create_index`
Creates new indices with full configuration including mappings, settings, and aliases. Supports shard configuration, analysis settings, and initial aliases.

#### `delete_index`
Permanently removes indices and all contained data. Supports wildcard patterns and safety options to prevent accidental deletion.

#### `index_exists` / `get_index`
Check existence and retrieve complete index metadata including all settings, mappings, and aliases.

### Configuration Management

#### `update_index_settings` / `get_index_settings`
Manage dynamic index settings such as refresh intervals, replica counts, and analysis configuration. Only dynamic settings can be updated on open indices.

#### `put_mapping`
Add new fields or update existing field mappings. Note that field types cannot be changed once set - requires reindexing for type changes.

### Maintenance Operations

#### `refresh_index`
Forces index refresh to make recently indexed documents immediately searchable. Normally handled automatically by Elasticsearch.

#### `flush_index`
Forces filesystem sync and clears transaction logs. Useful before maintenance operations or for ensuring data durability.

#### `reindex_documents`
Copies documents between indices with optional transformation via scripts. Essential for index migrations and data restructuring.

## Important Notes

- **`delete_index`** permanently destroys all data in the index. This operation cannot be undone.
- **`reindex_documents`** can be resource-intensive for large indices. Monitor cluster performance during reindexing.
- Mapping changes are generally additive - removing fields requires reindexing.
- Some setting changes require closing the index first.

## File Structure

```
src/tools/index_management/
├── create_index.ts           # Index creation
├── delete_index.ts           # Index deletion  
├── index_exists.ts           # Index existence checking
├── get_index.ts              # Index information retrieval
├── update_index_settings.ts  # Settings management
├── get_index_settings.ts     # Settings retrieval
├── put_mapping.ts            # Mapping updates
├── refresh_index.ts          # Index refresh operations
├── flush_index.ts            # Index flush operations
└── reindex_documents.ts      # Data migration and transformation
```

Each tool follows the established patterns for error handling, logging, parameter validation, and read-only mode compliance with enhanced warnings for destructive operations.