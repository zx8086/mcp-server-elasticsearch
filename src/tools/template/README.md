# Template Tools

This folder contains tools for managing Elasticsearch search templates and index templates. These tools provide reusable query patterns and automated index configuration.

## Available Tools

### Search Template Management
- **`search_template`** - Execute stored search templates with parameters
- **`multi_search_template`** - Execute multiple search templates in a single request

### Index Template Management
- **`get_index_template`** - Retrieve index template definitions
- **`put_index_template`** - Create or update index templates *(Write Operation)*
- **`delete_index_template`** - Delete index templates *(Destructive Operation)*

## Read-Only Mode Support

Template tools respect read-only mode configuration:

- **Read Operations**: `search_template`, `multi_search_template`, `get_index_template` - Always allowed
- **Write Operations**: `put_index_template` - Blocked/warned in read-only mode
- **Destructive Operations**: `delete_index_template` - Blocked/warned in read-only mode

## Tool Descriptions

### Search Templates

#### `search_template`
Executes parameterized search templates, enabling:
- Reusable query patterns with variable substitution
- Simplified query execution for complex searches
- Performance optimization through template compilation
- Secure query execution with parameter validation

#### `multi_search_template`
Executes multiple search templates in a single request for improved performance when running multiple templated queries simultaneously.

### Index Templates

#### `get_index_template`
Retrieves index template definitions showing how new indices will be configured automatically based on name patterns.

#### `put_index_template`
Creates or updates index templates that automatically apply settings, mappings, and aliases to new indices matching specified patterns.

#### `delete_index_template`
Removes index template definitions. Note: This does not affect existing indices, only prevents the template from being applied to new indices.

## Use Cases

### Search Templates
- Standardized reporting queries with variable parameters
- User-facing search interfaces with secure parameter substitution
- Complex analytical queries used across multiple applications
- Performance-critical searches requiring template compilation

### Index Templates
- Automated configuration of logging indices with time-based patterns
- Consistent mapping and settings across related indices  
- Default configurations for application-specific index patterns
- Automated alias assignment for new indices

## Template Patterns

### Search Template Example
```json
{
  "script": {
    "source": {
      "query": {
        "bool": {
          "must": [
            {"match": {"status": "{{status}}"}}
          ],
          "filter": [
            {"range": {"timestamp": {"gte": "{{start_date}}"}}}
          ]
        }
      }
    },
    "params": {
      "status": "active",
      "start_date": "2023-01-01"
    }
  }
}
```

### Index Template Example
```json
{
  "index_patterns": ["logs-*"],
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 1
    },
    "mappings": {
      "properties": {
        "timestamp": {"type": "date"},
        "message": {"type": "text"}
      }
    }
  }
}
```

## Important Notes

- **Search templates** improve performance through compilation and caching
- **Index templates** only affect newly created indices, not existing ones
- Template patterns support wildcards and can have priority ordering
- Deleting index templates does not affect existing indices created from those templates

## File Structure

```
src/tools/template/
├── search_template.ts         # Execute parameterized search templates
├── multi_search_template.ts   # Batch search template execution  
├── get_index_template.ts      # Retrieve index template definitions
├── put_index_template.ts      # Create/update index templates
└── delete_index_template.ts   # Remove index templates
```

Each tool follows the established patterns for error handling, logging, parameter validation, and read-only mode compliance.