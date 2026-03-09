# MCP Notifications & Progress Reporting

Your Elasticsearch MCP Server now includes comprehensive notification and progress reporting capabilities that provide real-time feedback to users during long-running operations.

## Overview

The notification system supports two main types of notifications:
- **Progress Notifications**: Show percentage completion for long-running operations
- **General Notifications**: Provide status updates (info, warning, error messages)

## Key Features

 **Real-time Progress Tracking**: Users see live progress updates during bulk operations
 **Operation Lifecycle Management**: Start, update, complete, and fail operations with context
 **Multiple Notification Types**: Info, warning, error notifications with structured data
 **Concurrent Operation Support**: Track multiple operations simultaneously
 **Automatic Integration**: All tools automatically get notification capabilities
 **Error Recovery**: Graceful error handling with recovery suggestions

## Implementation Details

### Server Configuration

The MCP server is configured with notification capabilities in `src/server.ts`:

```typescript
const server = new McpServer(
  { name: config.server.name, version: config.server.version },
  { capabilities: { notifications: {} } } // Enable notifications
);
```

### Notification Manager

The `NotificationManager` class (`src/utils/notifications.ts`) provides the core functionality:

```typescript
import { notificationManager, createProgressTracker } from "../utils/notifications.js";

// Send basic notifications
await notificationManager.sendInfo("Operation completed successfully");
await notificationManager.sendWarning("High memory usage detected");
await notificationManager.sendError("Connection failed", error);

// Track long-running operations
const tracker = await createProgressTracker("bulk_index", 1000, "Indexing documents");
await tracker.updateProgress(500, "Halfway complete");
await tracker.complete({ indexed: 1000 }, "All documents indexed");
```

## Example Tools with Notifications

### 1. Bulk Index with Progress (`elasticsearch_bulk_index_with_progress`)

**Features:**
- Real-time progress tracking for document indexing
- Batch processing with progress updates
- Success/error notifications with detailed context
- Configurable batch sizes (1-100 documents per batch)

**Example Usage:**
```json
{
  "index": "my-documents",
  "documents": [{"field": "value"}, ...],
  "batchSize": 50
}
```

**Notifications Sent:**
- Start: "Starting bulk indexing of X documents"
- Progress: "Processing batch N of M (X documents)" 
- Complete: "Bulk indexing completed: X successful, Y errors"

### 2. Reindex with Notifications (`elasticsearch_reindex_with_notifications`)

**Features:**
- Full reindex operation tracking
- Phase-based progress updates (validation, preparation, execution)
- Source index validation with document counting
- Error handling with recovery suggestions

**Example Usage:**
```json
{
  "source": {"index": "source-index"},
  "dest": {"index": "dest-index"},
  "wait_for_completion": true
}
```

**Notifications Sent:**
- Preparation: Index validation and document counting
- Progress: Per-phase completion updates
- Completion: Full operation summary with statistics

## Available Notification Methods

### Progress Notifications

```typescript
// Manual progress control
await notificationManager.sendProgress({
  progressToken: "operation-123",
  progress: 75,
  total: 100
});

// Automatic operation tracking
const operationId = "bulk-operation";
await notificationManager.startOperation(operationId, "progress-token", 1000);
await notificationManager.updateProgress(operationId, 500, "Halfway done");
await notificationManager.completeOperation(operationId, results);
```

### General Notifications

```typescript
// Info notifications
await notificationManager.sendInfo("Process started", {
  operation_type: "bulk_index",
  total_documents: 1000
});

// Warning notifications 
await notificationManager.sendWarning("High memory usage", {
  memory_usage: "85%",
  threshold: "80%"
});

// Error notifications
await notificationManager.sendError("Operation failed", error, {
  operation_id: "bulk-123",
  retry_count: 3
});
```

## Client Experience

When using tools with notifications, users will see:

1. **Initial Status**: "Starting bulk indexing of 1000 documents"
2. **Progress Updates**: Live progress bar showing completion percentage
3. **Step Messages**: "Processing batch 5 of 10 (500 documents)"
4. **Completion**: "Successfully indexed 1000 documents in 2.3 seconds"
5. **Error Handling**: Detailed error messages with recovery suggestions

## Integration with Existing Tools

### Automatic Security & Tracing

All notification-enabled tools automatically receive:
- **Security validation**for write operations
- **Universal tool tracing**with LangSmith integration 
- **Read-only mode**compliance
- **Error handling**with MCP-compliant responses

### Tool Registration

Tools are registered in `src/tools/index.ts`:

```typescript
// Register notification tools
for (const registerTool of notificationTools) {
  registerTool(server, esClient);
}
```

## Development Guide

### Creating Tools with Notifications

1. **Import the notification utilities:**
```typescript
import { createProgressTracker, notificationManager } from "../../utils/notifications.js";
```

2. **Create a progress tracker for long operations:**
```typescript
const tracker = await createProgressTracker("tool_name", totalItems, "Operation description");
```

3. **Update progress during execution:**
```typescript
for (let i = 0; i < batches.length; i++) {
  await tracker.updateProgress(processedItems, `Processing batch ${i + 1}`);
  // ... do work ...
}
```

4. **Complete or fail the operation:**
```typescript
// Success
await tracker.complete(results, "Operation completed successfully");

// Failure 
await tracker.fail(error, "Operation failed due to...");
```

### Best Practices

1. **Progress Granularity**: Update progress every 5-10% for good UX
2. **Meaningful Messages**: Include context like "Processing batch N of M"
3. **Error Recovery**: Provide actionable error messages and suggestions
4. **Resource Cleanup**: Always complete or fail operations to free resources
5. **Batch Operations**: Use reasonable batch sizes (10-100 items) for progress visibility

## Testing

Run the notification system tests:
```bash
bun test tests/notifications.test.ts
```

Run the interactive demo:
```bash
bun examples/notification-demo.ts
```

## MCP Protocol Compliance

The notification system fully complies with the MCP specification:
- Uses standard `notifications/progress` and `notifications/message` methods
- Supports progress tokens for operation tracking
- Provides structured notification data
- Gracefully handles client notification capabilities

## Benefits for Users

1. **Transparency**: Users see exactly what's happening during operations
2. **Confidence**: Progress bars and status messages reduce uncertainty
3. **Debugging**: Detailed error messages help troubleshoot issues
4. **Control**: Users can monitor and understand long-running operations
5. **Professional UX**: Real-time feedback creates a polished experience

---

The notification system transforms your MCP server from a black box into a transparent, user-friendly interface that keeps users informed throughout their Elasticsearch operations.