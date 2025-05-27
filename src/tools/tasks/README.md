# Task Management Tools

This folder contains tools for managing and monitoring Elasticsearch tasks. These tools provide capabilities to view, monitor, and control long-running operations in the cluster.

## Available Tools

### Task Monitoring
- **`tasks_list`** - Get all tasks currently running on cluster nodes
- **`tasks_get`** - Get detailed information about a specific task

### Task Control
- **`tasks_cancel`** - Cancel a running task *(Write Operation)*

## Read-Only Mode Support

Task management tools respect read-only mode configuration:

- **Read Operations**: `tasks_list`, `tasks_get` - Always allowed
- **Write Operations**: `tasks_cancel` - Blocked/warned in read-only mode

## Tool Descriptions

### `tasks_list`
Retrieves information about all tasks currently running on one or more nodes in the cluster. Supports filtering and grouping options to organize results by nodes or parent tasks. Useful for monitoring cluster activity and identifying long-running operations.

### `tasks_get`
Gets detailed information about a specific task using its task ID. Provides comprehensive information about task progress, duration, and current status. Essential for monitoring specific operations and troubleshooting task-related issues.

### `tasks_cancel`
Cancels a running task by task ID or using filter criteria. Note that task cancellation is a request - tasks may continue running briefly while they safely stop their current operations. Use the get task API to monitor cancellation progress.

## Use Cases

### Cluster Monitoring
- Monitor long-running operations and their progress
- Identify resource-intensive tasks affecting cluster performance
- Track bulk operations, reindexing, and search tasks
- Monitor task distribution across cluster nodes

### Performance Troubleshooting
- Identify tasks consuming excessive resources
- Cancel problematic or stuck operations
- Analyze task patterns and duration trends
- Debug slow cluster performance issues

### Operational Management
- Cancel accidentally started large operations
- Monitor bulk data loading operations
- Track search and aggregation performance
- Manage cluster maintenance operations

## Task Information

Tasks provide detailed information including:
- **Task ID**: Unique identifier in format `nodeId:taskNumber`
- **Type**: Task type (transport, direct, etc.)
- **Action**: Specific operation being performed
- **Start time**: When the task began execution
- **Running time**: How long the task has been running
- **Status**: Current task status and progress
- **Cancellable**: Whether the task can be cancelled
- **Parent/Child relationships**: Task hierarchy information

## Important Notes

- **Task cancellation** is a request - tasks may not stop immediately
- Some tasks cannot be cancelled due to their nature or current state
- Use the `X-Opaque-Id` header to track your requests and associate them with tasks
- Tasks are automatically cleaned up after completion
- Long-running tasks may impact cluster performance

## Best Practices

- Use task listing to monitor cluster health and activity
- Cancel only tasks you initiated or have permission to manage
- Monitor task cancellation progress using the get task API
- Use filtering options to focus on specific task types or nodes
- Consider task impact on cluster resources before cancellation

## File Structure

```
src/tools/tasks/
├── README.md          # This documentation
├── list.ts           # List all running tasks
├── get.ts            # Get specific task information
└── cancel.ts         # Cancel running tasks
```

Each tool follows the established patterns for error handling, logging, parameter validation, and read-only mode compliance with enhanced safety measures for task management operations.
