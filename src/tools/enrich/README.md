# Enrich Tools

This folder contains tools for managing Elasticsearch enrich policies and operations. Enrich policies allow you to add data from existing indices to incoming documents during ingestion.

## Available Tools

### Policy Management
- **`enrich_get_policy`** - Get information about enrich policies
- **`enrich_put_policy`** - Create an enrich policy *(Write Operation)*
- **`enrich_delete_policy`** - Delete an enrich policy *(Destructive Operation)*

### Policy Operations
- **`enrich_execute_policy`** - Execute an enrich policy to create the enrich index *(Write Operation)*
- **`enrich_stats`** - Get enrich coordinator statistics and execution information

## Read-Only Mode Support

Enrich tools respect read-only mode configuration:

- **Read Operations**: `enrich_get_policy`, `enrich_stats` - Always allowed
- **Write Operations**: `enrich_put_policy`, `enrich_execute_policy` - Blocked/warned in read-only mode
- **Destructive Operations**: `enrich_delete_policy` - Blocked/warned in read-only mode

## Tool Descriptions

### `enrich_get_policy`
Retrieves information about one or more enrich policies, including:
- Policy configuration and settings
- Source indices and match fields
- Enrich fields to be added to documents
- Policy type (match, geo_match, or range)

### `enrich_put_policy`
Creates a new enrich policy that defines:
- **Source indices**: Which indices contain the enrichment data
- **Match field**: Field used to match incoming documents with enrich data
- **Enrich fields**: Fields from source indices to add to incoming documents
- **Policy type**: How matching is performed (exact match, geo match, or range match)

### `enrich_delete_policy`
Removes an enrich policy and its associated enrich index. The policy must not be in use by any pipelines or processors.

### `enrich_execute_policy`
Executes an enrich policy to create or update the enrich index:
- Reads data from source indices
- Creates optimized enrich index for fast lookups
- Must be run after policy creation and when source data changes
- Can block other enrich policy executions if `wait_for_completion` is true

### `enrich_stats`
Provides statistics about enrich operations including:
- Currently executing policies and their progress
- Enrich coordinator statistics
- Cache performance metrics
- Resource usage information

## Use Cases

### Data Enrichment Scenarios
- **User enrichment**: Add user profile data to events based on user ID
- **Geographic enrichment**: Add location details based on IP addresses or coordinates
- **Product enrichment**: Add product information to transaction records
- **Reference data**: Add lookup data from external systems or reference tables

### Policy Types

#### Match Policy
Exact field matching for enrichment:
```json
{
  "match": {
    "indices": "users",
    "match_field": "user_id", 
    "enrich_fields": ["name", "email", "department"]
  }
}
```

#### Geo Match Policy  
Geographic shape matching:
```json
{
  "geo_match": {
    "indices": "postal_codes",
    "match_field": "location",
    "enrich_fields": ["postal_code", "city", "state"]
  }
}
```

#### Range Policy
Numeric, date, or IP range matching:
```json
{
  "range": {
    "indices": "ip_ranges", 
    "match_field": "ip_range",
    "enrich_fields": ["organization", "country", "isp"]
  }
}
```

## Workflow

1. **Create Policy**: Use `enrich_put_policy` to define enrichment rules
2. **Execute Policy**: Use `enrich_execute_policy` to build the enrich index
3. **Configure Pipeline**: Add enrich processor to ingest pipeline
4. **Monitor**: Use `enrich_stats` to monitor performance and execution
5. **Update**: Re-execute policy when source data changes
6. **Cleanup**: Use `enrich_delete_policy` when no longer needed

## Performance Considerations

- **Execute policy regularly**: When source indices are updated, re-execute policies to refresh enrich data
- **Monitor cache performance**: Use stats to ensure enrich cache is performing well
- **Limit enrich fields**: Only include necessary fields to minimize memory usage
- **Use appropriate policy types**: Choose the most efficient matching strategy for your use case

## Important Notes

- **Policy execution** creates a new enrich index, potentially using significant resources
- **Policies in use** by pipelines cannot be deleted until removed from all pipelines
- **Source indices** must exist and contain data before policy execution
- **Match fields** should be optimized for the queries enrich policies will perform
- **Concurrent execution** can be controlled with `wait_for_completion` parameter

## File Structure

```
src/tools/enrich/
├── README.md              # This documentation
├── get_policy.ts          # Retrieve enrich policy information
├── put_policy.ts          # Create enrich policies
├── delete_policy.ts       # Remove enrich policies
├── execute_policy.ts      # Execute policies to build enrich indices
└── stats.ts               # Get enrich statistics and monitoring info
```

Each tool follows the established patterns for error handling, logging, parameter validation, and read-only mode compliance with enhanced safety measures for policy management operations.