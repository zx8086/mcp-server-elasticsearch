# Unofficial Elasticsearch MCP Server

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/npm/v/@elastic/mcp-server-elasticsearch)](https://www.npmjs.com/package/@elastic/mcp-server-elasticsearch)
[![Bun](https://img.shields.io/badge/runtime-Bun-black)](https://bun.sh)

A production-ready Model Context Protocol (MCP) server that connects AI assistants like Claude Desktop to Elasticsearch clusters. This server provides comprehensive Elasticsearch operations through natural language interactions, featuring advanced configuration management, security controls, and extensive tooling.

This is a comprehensive enhancement of the Official Elastic MCP Server, expanding from 4 core tools to 170+ specialized operations covering the full Elasticsearch ecosystem.

## Key Features

- **Comprehensive Tooling**: 170+ Elasticsearch operations including search, indexing, cluster management, analytics, and specialized tools
- **Advanced Configuration**: Type-safe configuration system with environment variable validation
- **Security Controls**: Read-only mode with strict/warning options for safe production monitoring
- **Rich Search**: Advanced search with automatic highlighting, aggregations, and SQL support
- **Bulk Operations**: Efficient bulk indexing, updating, and deletion with helper APIs
- **Cluster Monitoring**: Health checks, node statistics, and performance metrics
- **Error Handling**: Robust error handling with detailed logging and troubleshooting guides
- **Auto-Detection Monitoring**: Prometheus metrics with Grafana dashboards (auto-detects and gracefully degrades)
- **Circuit Breakers**: Production-grade resilience with connection pooling and rate limiting
- **Multi-Agent Development**: Sophisticated development coordination with 15+ specialized agents for orchestrated workflows
- **LangSmith Integration**: Advanced tracing and performance monitoring for AI interactions
- **Performance**: Built on Bun runtime for optimal performance and modern JavaScript features

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Available Tools](#available-tools)
- [Usage Examples](#usage-examples)
- [Development](#development)
- [Architecture](#architecture)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Installing Bun

This project uses [Bun](https://bun.sh) as the JavaScript runtime for optimal performance. Install Bun using one of these methods:

**macOS/Linux:**
```bash
curl -fsSL https://bun.sh/install | bash
```

**Windows (PowerShell):**
```powershell
irm bun.sh/install.ps1 | iex
```

**Package Managers:**
```bash
# npm
npm install -g bun

# Homebrew (macOS)
brew install bun

# Scoop (Windows)
scoop install bun
```

Verify installation:
```bash
bun --version
```

### Other Requirements

- **Bun**: Latest version (recommended runtime)
- **Elasticsearch**: Version 7.x or higher (8.x+ recommended)
- **MCP Client**: Claude Desktop, or any MCP-compatible client
- **Node.js**: 18+ (for npm compatibility if needed)

## Installation

### Option 1: Use Published NPM Package (Recommended)

The easiest way to use the Elasticsearch MCP Server:

```bash
npx @elastic/mcp-server-elasticsearch
```

### Option 2: Local Development Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/elastic/mcp-server-elasticsearch.git
   cd mcp-server-elasticsearch
   ```

2. **Install dependencies:**
   ```bash
   bun install
   ```

3. **Build the project:**
   ```bash
   bun run build
   ```

## Quick Start

### 1. Configure Your Environment

Create a `.env` file from the template:

```bash
cp .env.example .env
```

**Minimal Configuration:**
```bash
# Required
ES_URL=http://localhost:9200

# Authentication (choose one)
ES_API_KEY=your_api_key_here
# OR
ES_USERNAME=elastic
ES_PASSWORD=changeme

# Optional: Enable read-only mode for safety
READ_ONLY_MODE=false
LOG_LEVEL=info
```

### 2. Validate Configuration

```bash
# Basic validation
bun run validate-config

# Full validation with connection test
bun run validate-config:full
```

### 3. Configure MCP Client (Claude Desktop)

Add to your MCP client configuration:

**For Published Package:**
```json
{
  "mcpServers": {
    "elasticsearch-mcp-server": {
      "command": "npx",
      "args": ["-y", "@elastic/mcp-server-elasticsearch"],
      "env": {
        "ES_URL": "your-elasticsearch-url",
        "ES_API_KEY": "your-api-key"
      }
    }
  }
}
```

**For Local Development:**
```json
{
  "mcpServers": {
    "elasticsearch-mcp-server-local": {
      "command": "bun",
      "args": ["run", "/path/to/your/project/src/index.ts"],
      "env": {
        "ES_URL": "your-elasticsearch-url",
        "ES_API_KEY": "your-api-key"
      }
    }
  }
}
```

### 4. Start Using

Open your MCP client and start asking questions about your Elasticsearch data:

- "What indices do I have in my cluster?"
- "Show me the field mappings for the products index"
- "Find all orders over $500 from last month"

## Configuration

This server features a comprehensive configuration system with type-safe validation and environment variable support.

### Environment Variables

#### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ES_URL` | Elasticsearch server URL | `http://localhost:9200` |

#### Authentication (Choose One Method)

**API Key Authentication (Recommended):**
```bash
ES_API_KEY=your_api_key_here
```

**Username/Password Authentication:**
```bash
ES_USERNAME=your_username
ES_PASSWORD=your_password
```

#### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_SERVER_NAME` | `elasticsearch-mcp-server` | Server identification |
| `MCP_SERVER_VERSION` | `0.1.1` | Server version |
| `READ_ONLY_MODE` | `false` | Enable read-only mode |
| `READ_ONLY_STRICT_MODE` | `true` | Block vs warn for destructive operations |
| `MCP_MAX_QUERY_TIMEOUT` | `30000` | Maximum query timeout (ms) |
| `MCP_MAX_RESULTS_PER_QUERY` | `1000` | Maximum results per query |
| `MCP_TRANSPORT` | `stdio` | Transport mode (`stdio` or `sse`) |
| `MCP_PORT` | `8080` | Server port (for SSE mode) |

#### Elasticsearch Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ES_CA_CERT` | - | Path to CA certificate file |
| `ES_MAX_RETRIES` | `3` | Maximum retry attempts |
| `ES_REQUEST_TIMEOUT` | `30000` | Request timeout (ms) |
| `ES_COMPRESSION` | `true` | Enable response compression |
| `ES_ENABLE_META_HEADER` | `true` | Enable client meta headers |
| `ES_DISABLE_PROTOTYPE_POISONING_PROTECTION` | `true` | Disable prototype protection |

#### Logging Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Log level (`debug`, `info`, `warn`, `error`) |
| `LOG_FORMAT` | `json` | Log format (`json` or `text`) |
| `LOG_INCLUDE_METADATA` | `true` | Include metadata in logs |

### Configuration Examples

#### Local Development
```bash
ES_URL=http://localhost:9200
LOG_LEVEL=debug
READ_ONLY_MODE=false
```

#### Production with API Key
```bash
ES_URL=https://your-cluster.es.cloud.aws.com:443
ES_API_KEY=your_production_api_key
READ_ONLY_MODE=true
READ_ONLY_STRICT_MODE=true
LOG_LEVEL=info
ES_MAX_RETRIES=5
ES_REQUEST_TIMEOUT=60000
```

#### Elastic Cloud
```bash
ES_URL=https://your-deployment.es.us-central1.gcp.cloud.es.io:443
ES_API_KEY=your_cloud_api_key
READ_ONLY_MODE=true
LOG_LEVEL=info
```

#### Self-Hosted with TLS
```bash
ES_URL=https://elasticsearch.company.com:9200
ES_USERNAME=mcp_user
ES_PASSWORD=secure_password
ES_CA_CERT=/etc/ssl/certs/elasticsearch-ca.pem
READ_ONLY_MODE=true
LOG_LEVEL=warn
```

### Read-Only Mode

The server supports read-only mode for safe operations in production:

#### Strict Mode (Production)
```bash
READ_ONLY_MODE=true
READ_ONLY_STRICT_MODE=true
```
- **Blocks**all destructive operations
- Returns error responses for write/delete operations
- Perfect for monitoring and analytics

#### Warning Mode (Development)
```bash
READ_ONLY_MODE=true
READ_ONLY_STRICT_MODE=false
```
- **Allows**operations with prominent warnings
- Logs warnings for destructive operations
- Great for testing and controlled environments

## Available Tools

### Core Operations
- **`list_indices`** - List all available Elasticsearch indices
- **`get_mappings`** - Get field mappings for indices
- **`search`** - Perform searches with automatic highlighting
- **`get_shards`** - Get shard information and distribution

### Document Operations
- **`get_document`** - Retrieve documents by ID
- **`index_document`** - Create or update documents *(Write Operation)*
- **`update_document`** - Update existing documents *(Write Operation)*
- **`delete_document`** - Delete documents *(Destructive Operation)*
- **`document_exists`** - Check if documents exist

### Bulk Operations
- **`bulk_operations`** - Efficient bulk create/update/delete *(Write/Destructive Operation)*
- **`multi_get`** - Retrieve multiple documents

### Search & Analytics
- **`execute_sql_query`** - Execute SQL queries
- **`count_documents`** - Count matching documents
- **`scroll_search`** - Handle large result sets
- **`multi_search`** - Execute multiple searches
- **`update_by_query`** - Bulk document updates *(Write Operation)*
- **`delete_by_query`** - Bulk document deletion *(Destructive Operation)*
- **`clear_scroll`** - Clear scroll contexts to free resources

### Index Management
- **`create_index`** - Create new indices *(Write Operation)*
- **`delete_index`** - Delete indices *(Destructive Operation)*
- **`index_exists`** - Check index existence
- **`get_index`** - Get index information
- **`get_index_settings`** - Get index settings
- **`update_index_settings`** - Modify index settings *(Write Operation)*
- **`put_mapping`** - Update index mappings *(Write Operation)*
- **`refresh_index`** - Force index refresh *(Write Operation)*
- **`flush_index`** - Force index flush *(Write Operation)*
- **`reindex_documents`** - Copy/move data between indices *(Write Operation)*

### Template Management
- **`search_template`** - Execute stored search templates
- **`multi_search_template`** - Execute multiple search templates
- **`get_index_template`** - Get index template definitions
- **`put_index_template`** - Create or update index templates *(Write Operation)*
- **`delete_index_template`** - Delete index templates *(Destructive Operation)*

### Analytics & Term Analysis
- **`get_term_vectors`** - Get term vectors for documents
- **`get_multi_term_vectors`** - Get term vectors for multiple documents

### Index Aliases
- **`get_aliases`** - Get index aliases
- **`put_alias`** - Create index aliases *(Write Operation)*
- **`delete_alias`** - Delete index aliases *(Destructive Operation)*
- **`update_aliases`** - Update multiple aliases atomically *(Write Operation)*

### Cluster Management
- **`get_cluster_health`** - Cluster health status
- **`get_cluster_stats`** - Cluster statistics
- **`get_nodes_info`** - Node information
- **`get_nodes_stats`** - Node statistics

### Field Mapping & SQL Management
- **`get_field_mapping`** - Get specific field mappings
- **`clear_sql_cursor`** - Clear SQL cursors
- **`translate_sql_query`** - Convert SQL to Elasticsearch DSL

### Index Lifecycle Management (ILM)
- **`ilm_get_lifecycle`** - Get lifecycle policies
- **`ilm_put_lifecycle`** - Create or update lifecycle policies *(Write Operation)*
- **`ilm_delete_lifecycle`** - Delete lifecycle policies *(Destructive Operation)*
- **`ilm_explain_lifecycle`** - Explain lifecycle state of indices
- **`ilm_get_status`** - Get ILM status
- **`ilm_start`** - Start ILM plugin *(Write Operation)*
- **`ilm_stop`** - Stop ILM plugin *(Write Operation)*
- **`ilm_retry`** - Retry failed lifecycle steps *(Write Operation)*
- **`ilm_remove_policy`** - Remove policies from indices *(Write Operation)*
- **`ilm_move_to_step`** - Manually move index to lifecycle step *(Destructive Operation)*
- **`ilm_migrate_to_data_tiers`** - Migrate to data tiers *(Destructive Operation)*

### Enrich Policies
- **`enrich_get_policy`** - Get enrich policy information
- **`enrich_put_policy`** - Create enrich policies *(Write Operation)*
- **`enrich_delete_policy`** - Delete enrich policies *(Destructive Operation)*
- **`enrich_execute_policy`** - Execute enrich policies *(Write Operation)*
- **`enrich_stats`** - Get enrich statistics

### Watcher Operations
- **`watcher_put_watch`** - Create or update watch *(Write Operation)*
- **`watcher_get_watch`** - Get watch definition
- **`watcher_delete_watch`** - Delete watch *(Destructive Operation)*
- **`watcher_execute_watch`** - Execute watch *(Write Operation)*
- **`watcher_ack_watch`** - Acknowledge watch *(Write Operation)*
- **`watcher_activate_watch`** - Activate watch *(Write Operation)*
- **`watcher_deactivate_watch`** - Deactivate watch *(Write Operation)*
- **`watcher_stats`** - Get watcher statistics
- **`watcher_start`** - Start watcher service *(Write Operation)*
- **`watcher_stop`** - Stop watcher service *(Write Operation)*

### Autoscaling
- **`autoscaling_get_policy`** - Get autoscaling policies
- **`autoscaling_put_policy`** - Create autoscaling policies *(Write Operation)*
- **`autoscaling_delete_policy`** - Delete autoscaling policies *(Destructive Operation)*
- **`autoscaling_get_capacity`** - Get autoscaling capacity

### Advanced Operations
- **`reindex_with_notifications`** - Reindex with progress notifications *(Write Operation)*
- **`bulk_index_with_progress`** - Bulk index with progress tracking *(Write Operation)*
- **`elasticsearch_diagnostics`** - Comprehensive cluster diagnostics
- **`analyze_timestamps`** - Analyze timestamp fields for data quality issues

## Usage Examples

### Natural Language Queries

```
"What indices do I have in my cluster?"
"Show me the field mappings for the 'products' index"
"Count how many documents are in the logs index"
"What's the health status of my cluster?"
```

### Complex Search Examples

```
"Search for users with email containing 'gmail' in the users index"
"Find all error logs from the last 24 hours with severity high"
"Show me products with price between 100 and 500 sorted by popularity"
"Get aggregated sales data grouped by region and month"
```

### Administrative Operations

```
"Create a new index called 'user-analytics' with timestamp mapping"
"Show me the cluster health and node information"
"List all indices that haven't been accessed in the last week"
"Update the refresh interval for the logs index to 30 seconds"
```

## Development

### Available Scripts

```bash
# Development
bun run dev # Start in development mode
bun run build # Build for production
bun run start # Start built server

# Configuration Management
bun run validate-config # Validate configuration
bun run validate-config:full # Full validation + connection test
bun run test-connection # Test Elasticsearch connection

# Quality & Testing
bun run test # Run tests
bun run lint # Lint code
bun run format # Format code

# Debugging
bun run inspector # Start MCP inspector for debugging
```

### Development Setup

1. **Clone and setup:**
   ```bash
   git clone <repository>
   cd mcp-server-elasticsearch
   bun install
   ```

2. **Create development environment:**
   ```bash
   cp .env.example .env.dev
   # Edit .env.dev with your local settings
   ```

3. **Start development server:**
   ```bash
   bun run dev
   ```

4. **Debug with MCP Inspector:**
   ```bash
   ES_URL=your-url ES_API_KEY=your-key bun run inspector
   ```
   Open http://localhost:5173 for the inspector interface.

### Testing Configuration

```bash
# Test configuration validity
bun run validate-config

# Test with connection verification
bun run validate-config:full --check-connection

# Show all configuration details
bun run validate-config --show-all
```

## Architecture

### Project Structure

```
src/
 config.ts # Centralized configuration system
 index.ts # Entry point and server startup
 server.ts # MCP server creation and setup
 validation.ts # Environment and connection validation
 tools/ # Tool implementations
    index.ts # Tool registration
    core/ # Core operations (search, list, mappings)
    document/ # Document operations
    search/ # Advanced search operations
    index_management/ # Index management tools
    cluster/ # Cluster monitoring tools
    bulk/ # Bulk operations
    analytics/ # Analytics and term vectors
    alias/ # Index alias management
    template/ # Template management
    advanced/ # Advanced operations
    mapping/ # Field mapping tools
    ilm/ # Index Lifecycle Management
    enrich/ # Enrich policies
 utils/
     logger.ts # MCP-compatible logging system
     readOnlyMode.ts # Read-only mode management
```

### Configuration System

The server uses a sophisticated configuration system:

- **Type Safety**: Full TypeScript support with Zod schemas
- **Environment First**: Configuration via environment variables
- **Validation**: Automatic validation at startup
- **Layered**: Defaults → Environment Variables → Validation
- **Documentation**: Self-documenting with clear examples

### Read-Only Mode Implementation

- **Operation Classification**: Tools categorized by destructive potential
- **Flexible Modes**: Strict blocking vs. warning modes
- **Granular Control**: Per-operation type checking
- **Logging Integration**: Comprehensive audit trails

## Security

### Best Practices

1. **Use API Keys**: Prefer API key authentication over username/password
2. **Principle of Least Privilege**: Create dedicated API keys with minimal permissions
3. **Read-Only Production**: Enable read-only mode for production monitoring
4. **Network Security**: Use TLS/SSL for connections
5. **Credential Management**: Keep credentials in environment variables

### Creating Secure API Keys

```bash
POST /_security/api_key
{
  "name": "es-mcp-server-access",
  "role_descriptors": {
    "mcp_server_role": {
      "cluster": ["monitor"],
      "indices": [
        {
          "names": ["index-1", "index-2", "index-pattern-*"],
          "privileges": ["read", "view_index_metadata"]
        }
      ]
    }
  }
}
```

### Read-Only Mode Operations

**Always Protected (Destructive):**
- `delete_document`, `delete_index`, `delete_by_query`
- `delete_alias`, `delete_index_template`

**Protected (Write/Modify):**
- `index_document`, `update_document`, `bulk_operations`
- `create_index`, `update_index_settings`, `put_mapping`

**Always Allowed (Read-Only):**
- `search`, `get_document`, `list_indices`
- `get_mappings`, `count_documents`, `get_cluster_health`

## Troubleshooting

### Common Issues

#### Configuration Errors

**Invalid URL Format:**
```
Error: ES_URL is not a valid URL format
```
**Solution:**Ensure URL includes protocol: `http://` or `https://`

**Missing Authentication:**
```
Error: Either ES_API_KEY or both ES_USERNAME and ES_PASSWORD must be provided
```
**Solution:**Provide complete authentication credentials

#### Connection Issues

**Connection Refused:**
```
Error: ECONNREFUSED
```
**Solution:**Verify Elasticsearch is running and URL is correct

**SSL/TLS Issues:**
```
Error: certificate verify failed
```
**Solution:**Use `ES_CA_CERT` or verify certificate configuration

**Authentication Failed:**
```
Error: 401 Unauthorized
```
**Solution:**Verify API key or username/password are correct

#### Read-Only Mode

**Operations Blocked:**
```
 READ-ONLY MODE: DESTRUCTIVE DELETE operation blocked
```
**Solution:**Set `READ_ONLY_MODE=false` or use read-only operations only

### Debug Mode

Enable debug logging for detailed troubleshooting:

```bash
LOG_LEVEL=debug bun run dev
```

### Validation Tools

```bash
# Check configuration
bun run validate-config

# Test connection
bun run validate-config:full

# Test specific operations
bun run test-connection
```

### MCP Inspector

For debugging MCP protocol issues:

```bash
bun run inspector
```

Open http://localhost:6274 to inspect MCP communication.

### Development Workflow

1. **Fork and clone**the repository
2. **Create a feature branch**from `main`
3. **Make your changes**with tests
4. **Run quality checks:**
   ```bash
   bun run lint
   bun run format
   bun run test
   bun run validate-config
   ```
5. **Submit a pull request**with clear description

### Code Standards

- **TypeScript**: Strict type checking enabled
- **ESLint**: Code linting with provided configuration
- **Prettier**: Code formatting with provided configuration
- **Zod**: Schema validation for configuration
- **Testing**: Comprehensive test coverage required

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.

## Links

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Elasticsearch Documentation](https://www.elastic.co/guide/)
- [Bun Runtime](https://bun.sh)
- [Claude Desktop](https://claude.ai/download)

## Performance

Built on Bun runtime for optimal performance:
- **Fast Startup**: Rapid server initialization
- **Memory Efficient**: Optimized memory usage
- **Modern JavaScript**: Latest ECMAScript features
- **Native TypeScript**: No compilation overhead in development

---

**Need Help?**Check our [troubleshooting guide](#troubleshooting) for common solutions.
