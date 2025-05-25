# Configuration Management Guide

This guide explains how to configure the Elasticsearch MCP Server using environment variables and the centralized configuration system.

## Quick Start

1. **Copy the template:**
   ```bash
   cp .env.template .env
   ```

2. **Set your Elasticsearch URL:**
   ```bash
   # Edit .env
   ES_URL=http://localhost:9200
   ```

3. **Add authentication (if needed):**
   ```bash
   # For API key
   ES_API_KEY=your_api_key_here
   
   # OR for username/password
   ES_USERNAME=your_username
   ES_PASSWORD=your_password
   ```

4. **Validate your configuration:**
   ```bash
   bun run validate-config
   ```

5. **Start the server:**
   ```bash
   bun run dev
   ```

## Configuration Overview

The configuration system uses a layered approach:

1. **Default Values** - Built-in sensible defaults
2. **Environment Variables** - Override defaults via environment variables
3. **Validation** - Zod schemas ensure configuration is valid
4. **Type Safety** - Full TypeScript support for configuration

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ES_URL` | Elasticsearch server URL | `http://localhost:9200` |

### Authentication (Choose One)

#### API Key Authentication (Recommended)
```bash
ES_API_KEY=your_api_key_here
```

#### Username/Password Authentication
```bash
ES_USERNAME=your_username
ES_PASSWORD=your_password
```

### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_SERVER_NAME` | `elasticsearch-mcp-server` | Server identification name |
| `MCP_SERVER_VERSION` | `0.1.1` | Server version |
| `READ_ONLY_MODE` | `false` | Enable read-only mode |
| `READ_ONLY_STRICT_MODE` | `true` | Block (true) or warn (false) for destructive operations |
| `MCP_MAX_QUERY_TIMEOUT` | `30000` | Maximum query timeout in ms (1000-300000) |
| `MCP_MAX_RESULTS_PER_QUERY` | `1000` | Maximum results per query (1-10000) |
| `MCP_TRANSPORT` | `stdio` | Transport mode: `stdio` or `sse` |
| `MCP_PORT` | `8080` | Server port (for SSE mode) |

### Elasticsearch Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ES_URL` | `http://localhost:9200` | Elasticsearch server URL |
| `ES_CA_CERT` | - | Path to CA certificate file |
| `ES_MAX_RETRIES` | `3` | Maximum retry attempts (0-10) |
| `ES_REQUEST_TIMEOUT` | `30000` | Request timeout in ms (1000-60000) |
| `ES_COMPRESSION` | `true` | Enable response compression |
| `ES_ENABLE_META_HEADER` | `true` | Enable client meta headers |
| `ES_DISABLE_PROTOTYPE_POISONING_PROTECTION` | `true` | Disable prototype protection (performance) |

### Logging Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `LOG_FORMAT` | `json` | Log format: `json` or `text` |
| `LOG_INCLUDE_METADATA` | `true` | Include metadata in logs |

### Security Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOW_DESTRUCTIVE_OPERATIONS` | `false` | Allow destructive operations |
| `ALLOW_SCHEMA_MODIFICATIONS` | `false` | Allow schema modifications |
| `ALLOW_INDEX_MANAGEMENT` | `false` | Allow index management operations |
| `MAX_BULK_OPERATIONS` | `1000` | Maximum bulk operations count (1-10000) |

## Configuration Examples

### Local Development
```bash
# .env.local
ES_URL=http://localhost:9200
LOG_LEVEL=debug
READ_ONLY_MODE=false
```

### Production with API Key
```bash
# .env.production
ES_URL=https://your-cluster.es.aws.cloud.es.io:443
ES_API_KEY=your_production_api_key
READ_ONLY_MODE=true
READ_ONLY_STRICT_MODE=true
LOG_LEVEL=info
ES_MAX_RETRIES=5
ES_REQUEST_TIMEOUT=60000
```

### Elastic Cloud Configuration
```bash
# .env.cloud
ES_URL=https://your-deployment.es.us-central1.gcp.cloud.es.io:443
ES_API_KEY=your_cloud_api_key
ES_CA_CERT=/path/to/ca-cert.pem
LOG_LEVEL=info
READ_ONLY_MODE=false
```

### Self-Hosted with Authentication
```bash
# .env.selfhosted
ES_URL=https://elasticsearch.yourcompany.com:9200
ES_USERNAME=mcp_user
ES_PASSWORD=secure_password
ES_CA_CERT=/etc/ssl/certs/elasticsearch-ca.pem
LOG_LEVEL=warn
READ_ONLY_MODE=true
READ_ONLY_STRICT_MODE=false
```

## Read-Only Mode

The server supports read-only mode for safe operations:

### Strict Mode (Default)
```bash
READ_ONLY_MODE=true
READ_ONLY_STRICT_MODE=true
```
- **Blocks** all destructive operations
- Returns error responses for write/delete operations
- Recommended for production monitoring

### Warning Mode
```bash
READ_ONLY_MODE=true
READ_ONLY_STRICT_MODE=false
```
- **Allows** destructive operations with warnings
- Logs warnings for all potentially destructive operations
- Useful for testing and controlled environments

### Operations Affected by Read-Only Mode

**Destructive Operations (Blocked/Warned):**
- `delete_document`, `delete_index`, `delete_by_query`
- `update_document`, `update_by_query`
- `index_document`, `bulk_operations`
- `create_index`, `put_mapping`, `update_index_settings`
- `reindex_documents`, `delete_alias`, `put_alias`

**Read Operations (Always Allowed):**
- `search`, `get_document`, `list_indices`
- `get_mappings`, `get_cluster_health`
- `execute_sql_query`, `count_documents`

## Validation and Testing

### Validate Configuration
```bash
# Basic validation
bun run validate-config

# Full validation with connection test
bun run validate-config:full

# Show all configuration details
bun run validate-config --show-all

# Test connection only
bun run validate-config --check-connection
```

### Test Connection
```bash
# Test connection using existing test script
bun run test-connection
```

## Configuration Validation

The system validates configuration at startup:

### Automatic Validation
- **URL Format**: Ensures ES_URL is a valid HTTP/HTTPS URL
- **Authentication**: Validates auth method consistency
- **Numeric Ranges**: Enforces min/max values for timeouts, retries, etc.
- **Enum Values**: Validates log levels, transport modes, etc.

### Error Handling
- **Startup Failure**: Invalid configuration causes immediate exit
- **Clear Messages**: Detailed error messages for configuration issues
- **Warnings**: Non-critical issues are logged as warnings

## Troubleshooting

### Common Issues

**Invalid URL Format**
```
Error: ES_URL is not a valid URL format
```
Solution: Ensure URL includes protocol: `http://` or `https://`

**Missing Authentication**
```
Error: Either ES_API_KEY or both ES_USERNAME and ES_PASSWORD must be provided
```
Solution: Provide complete authentication credentials

**Configuration Validation Failed**
```
Error: Configuration validation failed: [details]
```
Solution: Check the specific validation error and fix the configuration

**Connection Issues**
```
Error: Failed to connect to Elasticsearch
```
Solution: Verify URL, credentials, and network connectivity

### Debug Mode
```bash
LOG_LEVEL=debug
```
Enable debug logging to see detailed configuration loading and validation steps.

## Best Practices

1. **Use API Keys**: Prefer API key authentication over username/password
2. **Environment Files**: Use `.env` files for local development
3. **Read-Only Production**: Enable read-only mode for production monitoring
4. **Timeouts**: Adjust timeouts based on your cluster performance
5. **Logging**: Use appropriate log levels for your environment
6. **Validation**: Always validate configuration before deployment
7. **Security**: Keep credentials in environment variables, not in code
