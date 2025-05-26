# Autoscaling Tools

This folder contains tools for managing Elasticsearch autoscaling policies and capacity. These tools are designed for indirect use by Elasticsearch Service, Elastic Cloud Enterprise, and Elastic Cloud on Kubernetes. Direct use is not supported by Elasticsearch but may be useful for monitoring and troubleshooting.

## Available Tools

### Policy Management
- **`autoscaling_get_policy`** - Get an autoscaling policy configuration
- **`autoscaling_put_policy`** - Create or update an autoscaling policy *(Write Operation)*
- **`autoscaling_delete_policy`** - Delete an autoscaling policy *(Destructive Operation)*

### Capacity Management
- **`autoscaling_get_capacity`** - Get the current autoscaling capacity based on configured policies

## Read-Only Mode Support

Autoscaling tools respect read-only mode configuration:

- **Read Operations**: `autoscaling_get_policy`, `autoscaling_get_capacity` - Always allowed
- **Write Operations**: `autoscaling_put_policy` - Blocked/warned in read-only mode
- **Destructive Operations**: `autoscaling_delete_policy` - Blocked/warned in read-only mode

## Tool Descriptions

### `autoscaling_get_policy`
Retrieves the configuration of a specific autoscaling policy, including:
- Policy roles and node types
- Decider configurations and thresholds
- Scaling rules and constraints
- Policy metadata and settings

### `autoscaling_put_policy`
Creates or updates an autoscaling policy with specified configuration:
- Define roles and node types to be managed
- Configure deciders (storage, memory, CPU, etc.)
- Set scaling thresholds and constraints
- Specify policy-specific settings

### `autoscaling_delete_policy`
Removes an autoscaling policy from the cluster. This stops automatic scaling for the specified policy but does not affect existing nodes.

### `autoscaling_get_capacity`
Retrieves current autoscaling capacity recommendations including:
- **Required capacity**: Maximum capacity needed based on all enabled deciders
- **Current nodes**: Information about existing cluster nodes
- **Decider details**: Diagnostic information from individual deciders
- **Scaling recommendations**: Suggested actions for optimal cluster sizing

## Use Cases

### Monitoring and Diagnostics
- Monitor autoscaling policy effectiveness
- Diagnose capacity planning issues
- Understand scaling decisions and thresholds
- Troubleshoot autoscaling behavior

### Policy Management
- Create consistent autoscaling policies across environments
- Update scaling thresholds based on workload patterns
- Remove outdated or ineffective policies
- Backup and restore autoscaling configurations

### Capacity Planning
- Understand current and projected resource needs
- Analyze scaling patterns and trends
- Optimize cluster sizing for cost efficiency
- Plan for peak load scenarios

## Important Notes

- **Autoscaling features** are designed for Elasticsearch Service, ECE, and ECK
- **Direct use** is not officially supported but can provide valuable insights
- **Policy changes** may take time to reflect in actual cluster scaling
- **Capacity recommendations** are based on current workload and configuration
- **Delete operations** remove policies but don't immediately affect existing nodes

## Diagnostic Information

The `autoscaling_get_capacity` tool provides detailed diagnostic information:
- Individual decider calculations and reasoning
- Resource utilization metrics and thresholds
- Scaling bottlenecks and constraints
- Recommended capacity adjustments

**Note**: Diagnostic information is provided for analysis only and should not be used to make manual autoscaling decisions.

## File Structure

```
src/tools/autoscaling/
├── README.md                    # This documentation
├── get_policy.ts               # Retrieve autoscaling policy configuration
├── put_policy.ts               # Create/update autoscaling policies
├── delete_policy.ts            # Remove autoscaling policies
└── get_capacity.ts             # Get current autoscaling capacity
```

Each tool follows the established patterns for error handling, logging, parameter validation, and read-only mode compliance with enhanced monitoring for policy management operations.
