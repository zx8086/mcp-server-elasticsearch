# Indices Analysis Tools

This folder contains specialized tools for analyzing Elasticsearch indices, including field usage statistics, disk usage analysis, and data lifecycle management.

## Available Tools

### Index Analysis
- **`field_usage_stats`** - Get field usage statistics for index fields
- **`disk_usage`** - Analyze disk usage of index fields and data structures  
- **`get_data_lifecycle_stats`** - Get statistics about data streams managed by data stream lifecycle

### Advanced Index Information
- **`get_index_info`** - Get comprehensive index information with features filtering
- **`get_index_settings_advanced`** - Get advanced index settings with enhanced options

### Index Operations
- **`rollover`** - Roll over to a new index *(Write Operation)*
- **`explain_data_lifecycle`** - Get the status for a data stream lifecycle

### Existence Checks
- **`exists_alias`** - Check if one or more data stream or index aliases exist
- **`exists_index_template`** - Check whether index templates exist
- **`exists_template`** - Check existence of legacy index templates

## Read-Only Mode Support

Most Indices Analysis tools are read-only operations, with a few exceptions:

- **Read Operations**: `field_usage_stats`, `disk_usage`, `get_data_lifecycle_stats`, `get_index_info`, `get_index_settings_advanced`, `explain_data_lifecycle`, `exists_alias`, `exists_index_template`, `exists_template` - Always allowed
- **Write Operations**: `rollover` - Blocked/warned in read-only mode
- **Destructive Operations**: None

## Tool Descriptions

### `field_usage_stats`
Analyzes field usage patterns across index shards, providing insights into:
- **Per-field usage counts**: How often each field is accessed in queries
- **Shard-level statistics**: Usage distribution across cluster shards
- **Data structure utilization**: Which underlying data structures back each field
- **Query optimization**: Identifies frequently vs. rarely used fields

### `disk_usage`
Provides detailed analysis of how index storage is utilized:
- **Per-field disk usage**: Storage consumed by each field
- **Data structure breakdown**: Storage used by different Elasticsearch data structures
- **Compression analysis**: Effectiveness of field-level compression
- **Storage optimization**: Identifies fields consuming excessive storage

### `get_data_lifecycle_stats`
Monitors data stream lifecycle management:
- **Managed data streams**: Statistics for data streams under lifecycle management
- **Lifecycle phases**: Current phase and transition information
- **Resource utilization**: Storage and processing resources used by lifecycle operations
- **Policy effectiveness**: How well lifecycle policies are managing data

### `get_index_info`
Comprehensive index information with feature-based filtering:
- **Selective information**: Filter results to specific index features
- **Metadata details**: Creation dates, versions, and configuration
- **Feature analysis**: Which Elasticsearch features are enabled per index
- **Compatibility checking**: Version and feature compatibility information

### `get_index_settings_advanced`
Enhanced index settings retrieval with advanced options:
- **Complete configuration**: All settings including defaults and computed values
- **Hierarchical view**: Settings organized in logical groups
- **Change tracking**: Compare current vs. default settings
- **Template integration**: How settings are influenced by templates

### `rollover`
Creates a new index for a data stream or index alias based on conditions:
- **Conditional rollover**: Roll over based on age, size, or document count
- **Alias management**: Automatically updates aliases to point to new index
- **Dry run support**: Test rollover conditions without performing the operation
- **Data stream support**: Handles both traditional aliases and data streams

### `explain_data_lifecycle`
Provides detailed information about data stream lifecycle status:
- **Lifecycle phase**: Current phase and next scheduled action
- **Time tracking**: Time since creation, last rollover, and next action
- **Configuration details**: Applied lifecycle policy and settings
- **Error reporting**: Any errors encountered during lifecycle execution

### `exists_alias`
Checks existence of index aliases without retrieving full alias information:
- **Lightweight check**: Fast existence verification
- **Pattern support**: Supports wildcard patterns for alias names
- **Multi-alias check**: Can check multiple aliases in single request
- **Index filtering**: Can limit check to specific indices

### `exists_index_template`
Verifies existence of composable index templates:
- **Template verification**: Check if modern index templates exist
- **Pattern matching**: Supports wildcard patterns in template names
- **Fast operation**: Lightweight existence check without full retrieval
- **Modern templates**: Works with composable templates (7.8+)

### `exists_template`
Checks existence of legacy index templates (deprecated):
- **Legacy support**: Works with legacy template format
- **Deprecation notice**: These templates are deprecated in favor of composable templates
- **Pattern support**: Supports wildcard patterns for template names
- **Migration aid**: Useful for identifying legacy templates for migration

## Use Cases

### Performance Optimization
- Identify unused fields consuming storage and memory
- Analyze query patterns to optimize field configurations
- Monitor storage growth and usage patterns
- Optimize field mappings based on actual usage statistics

### Storage Management
- Track disk usage growth over time
- Identify opportunities for storage optimization
- Plan storage scaling based on usage patterns
- Analyze compression effectiveness across different field types

### Data Lifecycle Management
- Monitor data stream lifecycle policy effectiveness
- Track data aging and tier transitions
- Optimize retention policies based on usage patterns
- Plan infrastructure scaling for data lifecycle operations

### Index Health Monitoring
- Monitor index configuration consistency
- Track feature usage across indices
- Identify configuration drift from templates
- Ensure optimal settings for different workloads

### Index Lifecycle Management
- Implement automated index rollover strategies
- Monitor data stream lifecycle progression
- Track rollover conditions and timing
- Optimize lifecycle policies based on actual usage patterns

### Template and Alias Management
- Verify existence of templates and aliases before operations
- Audit template configurations across environments
- Identify legacy templates requiring migration
- Validate alias configurations for applications

## Important Notes

- **Field usage statistics** are automatically captured during query execution
- **Disk usage analysis** can be resource-intensive for large indices
- **Data lifecycle stats** are only available for managed data streams
- Some operations may require elevated privileges depending on cluster security

## Performance Considerations

- Field usage stats collection has minimal performance impact
- Disk usage analysis should be run during low-traffic periods for large indices
- Use filtering options to limit analysis scope when possible
- Consider running analysis on replica shards to reduce primary shard load

## File Structure

```
src/tools/indices/
├── README.md                    # This documentation
├── field_usage_stats.ts        # Field usage pattern analysis
├── disk_usage.ts               # Storage utilization analysis
├── get_data_lifecycle_stats.ts # Data lifecycle monitoring
├── get_index_info.ts           # Comprehensive index information
├── get_index_settings_advanced.ts # Enhanced settings retrieval
├── rollover.ts                 # Index rollover operations
├── explain_data_lifecycle.ts   # Data lifecycle status explanation
├── exists_alias.ts             # Alias existence verification
├── exists_index_template.ts    # Index template existence checks
└── exists_template.ts          # Legacy template existence checks
```

Each tool follows the established patterns for error handling, logging, parameter validation, and provides detailed analysis capabilities for index optimization and monitoring.
