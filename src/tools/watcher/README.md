# Watcher Tools

This folder contains tools for managing Elasticsearch Watcher functionality. Watcher allows you to define watches that monitor your data and automatically take actions when certain conditions are met.

## Available Tools

### Watch Management
- **`watcher_get_watch`** - Get a watch configuration
- **`watcher_put_watch`** - Create or update a watch *(Write Operation)*
- **`watcher_delete_watch`** - Delete a watch *(Destructive Operation)*
- **`watcher_query_watches`** - Query and list watches with pagination

### Watch Control
- **`watcher_activate_watch`** - Activate a watch *(Write Operation)*
- **`watcher_deactivate_watch`** - Deactivate a watch *(Write Operation)*
- **`watcher_ack_watch`** - Acknowledge a watch to throttle its actions *(Write Operation)*

### Watch Execution
- **`watcher_execute_watch`** - Execute a watch manually for testing/debugging *(Write Operation)*

### Watcher System Management
- **`watcher_start`** - Start the Watcher service *(Write Operation)*
- **`watcher_stop`** - Stop the Watcher service *(Write Operation)*
- **`watcher_get_settings`** - Get Watcher index settings
- **`watcher_update_settings`** - Update Watcher index settings *(Write Operation)*
- **`watcher_stats`** - Get Watcher statistics and status

## Read-Only Mode Support

Watcher tools respect read-only mode configuration:

- **Read Operations**: `watcher_get_watch`, `watcher_query_watches`, `watcher_get_settings`, `watcher_stats` - Always allowed
- **Write Operations**: `watcher_put_watch`, `watcher_activate_watch`, `watcher_deactivate_watch`, `watcher_ack_watch`, `watcher_execute_watch`, `watcher_start`, `watcher_update_settings` - Blocked/warned in read-only mode
- **Destructive Operations**: `watcher_delete_watch`, `watcher_stop` - Blocked/warned in read-only mode

## Tool Descriptions

### Watch Management

#### `watcher_get_watch`
Retrieves the configuration of a specific watch including its trigger, condition, and actions.

#### `watcher_put_watch`
Creates or updates a watch with specified trigger conditions, input data, conditions to evaluate, and actions to take.

#### `watcher_delete_watch`
Permanently removes a watch. The watch will never run again and its document is removed from the `.watches` index.

#### `watcher_query_watches`
Lists and searches watches with pagination support. Only `_id` and `metadata.*` fields are queryable or sortable.

### Watch Control

#### `watcher_activate_watch`
Activates a previously deactivated watch, allowing it to run according to its trigger schedule.

#### `watcher_deactivate_watch`
Deactivates a watch, preventing it from running while preserving its configuration.

#### `watcher_ack_watch`
Acknowledges watch actions to manually throttle execution. Useful for preventing repeated alerts for known issues.

### Watch Execution

#### `watcher_execute_watch`
Manually executes a watch for testing and debugging purposes. Provides fine-grained control over execution modes.

### System Management

#### `watcher_start` / `watcher_stop`
Controls the Watcher service state. Stopping Watcher prevents all watches from executing.

#### `watcher_get_settings` / `watcher_update_settings`
Manages settings for the Watcher internal index (`.watches`).

#### `watcher_stats`
Provides statistics about Watcher operation including queued, current, and pending watches.

## Use Cases

### Alerting and Monitoring
- Monitor log patterns and send notifications when errors occur
- Track performance metrics and alert when thresholds are exceeded
- Monitor data freshness and alert when updates are missing
- Set up business rule violations alerts

### Automated Actions
- Automatically index computed results based on data changes
- Trigger external systems when specific conditions are met
- Perform data cleanup operations on schedule
- Generate reports automatically

### System Health Monitoring
- Monitor cluster health and resource usage
- Alert on index size growth or storage issues
- Track query performance and slow operations
- Monitor user activity patterns

## Watch Components

### Trigger
Defines when the watch should run:
- **Schedule trigger**: Cron-like scheduling
- **Interval trigger**: Regular intervals
- **Manual trigger**: Only via execute API

### Input
Defines what data to analyze:
- **Search input**: Query Elasticsearch indices
- **HTTP input**: Fetch data from external APIs
- **Simple input**: Static data for testing

### Condition
Determines if actions should be executed:
- **Always/Never condition**: For testing
- **Compare condition**: Numeric comparisons
- **Array compare condition**: Multiple value comparisons
- **Script condition**: Custom logic

### Actions
What to do when conditions are met:
- **Email action**: Send email notifications
- **Webhook action**: HTTP requests to external systems
- **Index action**: Store results in Elasticsearch
- **Logging action**: Write to Elasticsearch logs

## Important Notes

- **Watch deletion** is permanent and cannot be undone
- **Acknowledged actions** remain throttled until conditions are no longer met
- **Security context** applies - watches run with the privileges of the user who created them
- **Manual execution** uses the caller's privileges, not the watch creator's
- **Service management** affects all watches in the cluster

## Best Practices

- Test watches thoroughly using `execute_watch` before deploying
- Use appropriate throttling periods to prevent alert spam
- Monitor watcher statistics to ensure healthy operation
- Use acknowledgments to manage known issues
- Regular cleanup of old watch execution history
- Implement proper error handling in watch conditions

## File Structure

```
src/tools/watcher/
├── README.md                # This documentation
├── index.ts                 # Exports all watcher tools
├── get_watch.ts            # Retrieve watch configuration
├── put_watch.ts            # Create/update watches
├── delete_watch.ts         # Remove watches
├── query_watches.ts        # List and search watches
├── activate_watch.ts       # Activate watches
├── deactivate_watch.ts     # Deactivate watches
├── ack_watch.ts            # Acknowledge watch actions
├── execute_watch.ts        # Manual watch execution
├── start.ts                # Start Watcher service
├── stop.ts                 # Stop Watcher service
├── get_settings.ts         # Get Watcher settings
├── update_settings.ts      # Update Watcher settings
└── stats.ts                # Get Watcher statistics
```

Each tool follows the established patterns for error handling, logging, parameter validation, and read-only mode compliance with enhanced safety measures for watch management operations.
