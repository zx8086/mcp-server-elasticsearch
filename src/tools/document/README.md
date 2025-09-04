# Document Tools

This folder contains tools for individual document operations in Elasticsearch. These tools handle single document CRUD (Create, Read, Update, Delete) operations.

## Available Tools

### Document Retrieval
- **`get_document`** - Get a document from Elasticsearch by index and ID
- **`document_exists`** - Check if a document exists by index and ID

### Document Management
- **`index_document`** - Index a document into Elasticsearch *(Write Operation)*
- **`update_document`** - Update a document in Elasticsearch by index and ID *(Write Operation)*
- **`delete_document`** - Delete a document from Elasticsearch by index and ID *(Destructive Operation)*

## Read-Only Mode Support

Document tools respect the read-only mode configuration:

- **Read Operations**: `get_document`, `document_exists` - Always allowed
- **Write Operations**: `index_document`, `update_document` - Blocked/warned in read-only mode
- **Destructive Operations**: `delete_document` - Blocked/warned in read-only mode

## Tool Descriptions

### `get_document`
Retrieves a complete document by its ID. Supports source filtering, routing, and version control. Returns the full document with metadata.

### `document_exists`
Lightweight check to verify document existence without retrieving content. Useful for conditional operations and validation.

### `index_document`
Creates or replaces a document in an index. Supports automatic ID generation, routing, and ingest pipelines. The primary method for adding data.

### `update_document`
Partial document updates using document patches or scripts. Supports upsert operations and conditional updates based on document version.

### `delete_document`
Removes a document from the index. Supports conditional deletion based on version and sequence numbers for optimistic concurrency control.

## Important Notes

- **`delete_document`** permanently removes data and cannot be undone. Use with caution in production environments.
- All write operations support refresh control to manage when changes become visible to search.
- Version control is available for all operations to handle concurrent modifications safely.

## File Structure

```
src/tools/document/
├── get_document.ts       # Document retrieval
├── document_exists.ts    # Document existence checking
├── index_document.ts     # Document creation/replacement
├── update_document.ts    # Document updates and patches
└── delete_document.ts    # Document deletion
```

Each tool follows the established patterns for error handling, logging, parameter validation, and read-only mode compliance.