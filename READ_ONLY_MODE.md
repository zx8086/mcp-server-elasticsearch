# READ_ONLY_MODE Configuration

This Elasticsearch MCP server supports a read-only mode that helps protect against accidental data loss by restricting or warning about destructive operations.

## Environment Variables

### READ_ONLY_MODE
Controls whether read-only mode is enabled.

- `READ_ONLY_MODE=true` or `READ_ONLY_MODE=1` - Enable read-only mode
- `READ_ONLY_MODE=false` or `READ_ONLY_MODE=0` - Disable read-only mode (default)

### READ_ONLY_STRICT_MODE
Controls the behavior when destructive operations are attempted in read-only mode.

- `READ_ONLY_STRICT_MODE=true` or `READ_ONLY_STRICT_MODE=1` - Block destructive operations completely (default)
- `READ_ONLY_STRICT_MODE=false` or `READ_ONLY_STRICT_MODE=0` - Allow operations but show warnings

## Usage Examples

### Production Safety Mode (Recommended for Production)
```bash
export READ_ONLY_MODE=true
export READ_ONLY_STRICT_MODE=true
```
**Result**: All destructive operations are completely blocked with clear error messages.

### Development Warning Mode
```bash
export READ_ONLY_MODE=true
export READ_ONLY_STRICT_MODE=false
```
**Result**: Destructive operations show prominent warnings but still execute.

### Full Access Mode (Default)
```bash
export READ_ONLY_MODE=false
# or simply omit the variable
```
**Result**: All operations available without restrictions.

## Protected Operations

The following operations are protected by read-only mode:

### 🚫 Always Protected (Destructive)
- `delete_document` - Delete specific documents
- `delete_index` - Delete entire indices (⚠️ **CRITICAL**)
- `delete_by_query` - Bulk document deletion
- `delete_alias` - Remove index aliases
- `delete_index_template` - Remove index templates

### ⚠️ Protected (Write/Modify)
- `index_document` - Create/overwrite documents
- `update_document` - Modify existing documents
- `update_by_query` - Bulk document updates
- `bulk_operations` - Bulk create/update/delete
- `create_index` - Create new indices
- `update_index_settings` - Modify index configuration
- `put_mapping` - Update field mappings
- `put_alias` - Create/modify aliases
- `update_aliases` - Bulk alias operations
- `put_index_template` - Create/update templates
- `reindex_documents` - Copy/move data between indices
- `refresh_index` - Force index refresh
- `flush_index` - Force index flush

### ✅ Always Allowed (Read-Only)
- `search` - Query documents
- `get_document` - Retrieve specific documents
- `list_indices` - List available indices
- `get_mappings` - View field mappings
- `get_shards` - View shard information
- `count_documents` - Count matching documents
- `get_cluster_health` - Cluster status
- `get_cluster_stats` - Cluster statistics
- `execute_sql_query` - SQL queries (read-only)
- `multi_get` - Retrieve multiple documents
- `scroll_search` - Large result set queries
- All other read-only operations

## Error Messages

### Strict Mode (Operations Blocked)
```
🚫 READ-ONLY MODE: DESTRUCTIVE DELETE operation 'delete_index' is blocked. 
Set READ_ONLY_MODE=false to enable write operations.
```

### Warning Mode (Operations Allowed with Warnings)
```
⚠️ CAUTION: You are about to perform a DESTRUCTIVE DELETE operation 'delete_index'. 
This may modify or delete data in Elasticsearch. Proceed with caution.
```

## Docker Configuration

### docker-compose.yml
```yaml
version: '3.8'
services:
  elasticsearch-mcp:
    build: .
    environment:
      - ES_URL=https://your-cluster.com:9200
      - ES_API_KEY=your_api_key
      - READ_ONLY_MODE=true
      - READ_ONLY_STRICT_MODE=true
```

### Dockerfile
```dockerfile
ENV READ_ONLY_MODE=true
ENV READ_ONLY_STRICT_MODE=true
```

## Development vs Production

### Production Deployment
```bash
# Recommended for production
READ_ONLY_MODE=true
READ_ONLY_STRICT_MODE=true
```

### Development Environment
```bash
# Allow operations but with warnings
READ_ONLY_MODE=true
READ_ONLY_STRICT_MODE=false
```

### Testing Environment
```bash
# Full access for testing
READ_ONLY_MODE=false
```

## Logging

When read-only mode is active, you'll see log messages like:

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "INFO",
  "context": "elasticsearch-mcp-server",
  "message": "🔒 READ-ONLY MODE ACTIVE",
  "strictMode": true,
  "behavior": "Destructive operations will be BLOCKED"
}
```

When destructive operations are attempted:

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "WARN",
  "context": "elasticsearch-mcp-server",
  "message": "Blocked destructive operation in read-only mode",
  "toolName": "delete_index",
  "operationType": "DESTRUCTIVE DELETE",
  "strictMode": true
}
```

## Best Practices

1. **Always use strict mode in production** to prevent accidental data loss
2. **Use warning mode in development** to maintain awareness of destructive operations
3. **Disable read-only mode only when necessary** for write operations
4. **Monitor logs** for attempted destructive operations to identify potential issues
5. **Document your read-only mode configuration** in deployment scripts
