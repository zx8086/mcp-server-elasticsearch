# Cluster Tools

This folder contains tools for monitoring and analyzing Elasticsearch cluster health, performance, and configuration. These tools provide essential information for cluster administration and troubleshooting.

## Available Tools

### Cluster Monitoring
- **`get_cluster_health`** - Get the health status of the Elasticsearch cluster
- **`get_cluster_stats`** - Get comprehensive cluster statistics and metrics

### Node Management
- **`get_nodes_info`** - Get detailed information about cluster nodes
- **`get_nodes_stats`** - Get performance statistics for cluster nodes

## Read-Only Mode Support

All Cluster tools are read-only operations and are always allowed:

- **Read Operations**: All tools in this folder - Always allowed
- **Write Operations**: None
- **Destructive Operations**: None

## Tool Descriptions

### `get_cluster_health`
Provides overall cluster health status and diagnostic information:
- **Health status**: Green (healthy), Yellow (warning), Red (critical)
- **Active shards**: Number of active primary and replica shards
- **Node status**: Number of active nodes and their roles
- **Index status**: Number of indices and their health
- **Task information**: Active cluster-level tasks and their progress

Supports waiting for specific health conditions and filtering by index patterns.

### `get_cluster_stats`
Comprehensive cluster-wide statistics including:
- **Index statistics**: Total indices, shards, documents, and storage
- **Node statistics**: Node count, roles, and resource utilization
- **Shard statistics**: Distribution and allocation information
- **Plugin information**: Installed plugins and versions
- **JVM statistics**: Memory usage and garbage collection metrics

### `get_nodes_info`
Detailed configuration and capability information for each node:
- **Node configuration**: Settings, roles, and capabilities
- **Hardware information**: CPU, memory, and disk specifications
- **Network configuration**: IP addresses and ports
- **Plugin information**: Installed plugins per node
- **JVM information**: Java version and configuration

### `get_nodes_stats`
Real-time performance metrics for each node:
- **Resource utilization**: CPU, memory, and disk usage
- **Index performance**: Indexing and search rates
- **Network activity**: HTTP and transport layer statistics
- **JVM metrics**: Heap usage, garbage collection, and thread counts
- **Operating system**: System load and resource availability

## Use Cases

### Health Monitoring
- Monitor cluster health status and identify issues
- Track shard allocation and replica status
- Identify unassigned or relocating shards
- Monitor cluster stability during operations

### Performance Analysis
- Analyze node resource utilization and bottlenecks
- Track indexing and search performance metrics
- Monitor memory usage and garbage collection patterns
- Identify imbalanced load distribution across nodes

### Capacity Planning
- Track storage growth and usage patterns
- Monitor node resource consumption trends
- Plan scaling and hardware requirements
- Analyze query and indexing load patterns

### Troubleshooting
- Diagnose cluster health issues and red status causes
- Identify poorly performing nodes or indices
- Analyze resource constraints and allocation problems
- Monitor recovery operations and cluster state changes

## Health Status Interpretation

### Green Status
- All primary and replica shards are allocated
- Cluster is fully operational
- No data loss risk

### Yellow Status  
- All primary shards allocated, some replicas missing
- Cluster functional but at risk
- Should investigate replica allocation issues

### Red Status
- Some primary shards unallocated
- Data potentially unavailable
- Requires immediate attention

## Monitoring Best Practices

- Regularly check cluster health status
- Monitor node resource utilization trends
- Set up alerting for health status changes
- Track performance metrics over time
- Monitor shard allocation balance
- Watch for unusual pattern changes

## File Structure

```
src/tools/cluster/
├── get_cluster_health.ts  # Overall cluster health and status
├── get_cluster_stats.ts   # Comprehensive cluster statistics
├── get_nodes_info.ts      # Node configuration information
└── get_nodes_stats.ts     # Real-time node performance metrics
```

Each tool follows the established patterns for error handling, logging, parameter validation, and provides comprehensive cluster monitoring capabilities essential for Elasticsearch administration.