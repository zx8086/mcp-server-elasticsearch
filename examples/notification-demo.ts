#!/usr/bin/env bun

/* examples/notification-demo.ts */

/**
 * Notification Demo
 * 
 * This demo shows how the MCP notification system works with:
 * - Progress notifications for long-running operations
 * - Status notifications for general updates
 * - Error handling with notifications
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NotificationManager, createProgressTracker } from "../src/utils/notifications.js";

// Create a mock server that logs notifications instead of sending them
class MockMcpServer {
  async sendNotification(notification: any): Promise<void> {
    console.log("\nNOTIFICATION SENT:");
    console.log(`   Method: ${notification.method}`);
    
    if (notification.method === "notifications/progress") {
      const { progressToken, progress, total } = notification.params;
      const percentage = total ? Math.round((progress / total) * 100) : progress;
      console.log(`   Progress: ${progress}/${total || "∞"} (${percentage}%)`);
      console.log(`   Token: ${progressToken}`);
    } else if (notification.method === "notifications/message") {
      const { level, data } = notification.params;
      console.log(`   Level: ${level.toUpperCase()}`);
      console.log(`   Message: ${data.message}`);
      if (data.type) console.log(`   Type: ${data.type}`);
      if (data.operation_id) console.log(`   Operation: ${data.operation_id}`);
      if (data.error) console.log(`   Error: ${data.error}`);
    }
    
    console.log("");
  }
}

async function demoBasicNotifications() {
  console.log("=".repeat(60));
  console.log("DEMO: Basic Notification Types");
  console.log("=".repeat(60));
  
  const mockServer = new MockMcpServer() as any;
  const manager = new NotificationManager(mockServer);
  
  // Info notification
  console.log("Sending info notification...");
  await manager.sendInfo("System initialization started", {
    component: "elasticsearch-client",
    version: "1.0.0"
  });
  
  // Warning notification
  console.log("Sending warning notification...");
  await manager.sendWarning("High memory usage detected", {
    memory_usage: "85%",
    threshold: "80%"
  });
  
  // Error notification
  console.log("Sending error notification...");
  await manager.sendError(
    "Connection to Elasticsearch failed",
    new Error("ECONNREFUSED: Connection refused"),
    { host: "localhost:9200", retry_count: 3 }
  );
}

async function demoProgressTracking() {
  console.log("\n" + "=".repeat(60));
  console.log("DEMO: Progress Tracking for Long Operations");
  console.log("=".repeat(60));
  
  const mockServer = new MockMcpServer() as any;
  const manager = new NotificationManager(mockServer);
  
  // Simulate bulk indexing operation
  const operationId = "bulk-index-demo";
  const progressToken = "progress-bulk-123";
  const totalDocs = 1000;
  
  console.log(`Starting bulk indexing operation for ${totalDocs} documents...`);
  await manager.startOperation(
    operationId,
    progressToken,
    totalDocs,
    `Bulk indexing ${totalDocs} documents to demo-index`
  );
  
  // Simulate processing in batches
  const batchSize = 100;
  const batches = Math.ceil(totalDocs / batchSize);
  
  for (let batch = 0; batch < batches; batch++) {
    const processed = (batch + 1) * batchSize;
    const actualProcessed = Math.min(processed, totalDocs);
    
    console.log(`Processing batch ${batch + 1}/${batches}...`);
    await manager.updateProgress(
      operationId,
      actualProcessed,
      `Completed batch ${batch + 1}: ${actualProcessed}/${totalDocs} documents`
    );
    
    // Simulate work delay
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Complete the operation
  console.log("Completing bulk indexing operation...");
  await manager.completeOperation(
    operationId,
    { indexed: totalDocs, errors: 0, time: "2.3s" },
    `Successfully indexed ${totalDocs} documents in 2.3 seconds`
  );
}

async function demoProgressTracker() {
  console.log("\n" + "=".repeat(60));
  console.log("DEMO: Progress Tracker Helper");
  console.log("=".repeat(60));
  
  const mockServer = new MockMcpServer() as any;
  const manager = new NotificationManager(mockServer);
  
  // Create progress tracker for reindex operation
  console.log("Creating progress tracker for reindex operation...");
  const tracker = await createProgressTracker(
    "reindex",
    100, // percentage-based
    "Reindexing from source-index to dest-index"
  );
  
  // Simulate reindex phases
  const phases = [
    { progress: 10, message: "Validating source index" },
    { progress: 20, message: "Preparing destination index" },
    { progress: 40, message: "Starting document transfer" },
    { progress: 70, message: "Processing documents batch 1/3" },
    { progress: 85, message: "Processing documents batch 2/3" },
    { progress: 95, message: "Processing documents batch 3/3" },
    { progress: 100, message: "Finalizing reindex operation" },
  ];
  
  for (const phase of phases) {
    console.log(`Phase: ${phase.message}`);
    await tracker.updateProgress(phase.progress, phase.message);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  // Complete with results
  console.log("Completing reindex operation...");
  await tracker.complete(
    {
      source_docs: 5420,
      indexed: 5420,
      updated: 0,
      deleted: 0,
      time: "8.2s"
    },
    "Reindex completed successfully: 5420 documents processed"
  );
}

async function demoErrorHandling() {
  console.log("\n" + "=".repeat(60));
  console.log("DEMO: Error Handling with Notifications");
  console.log("=".repeat(60));
  
  const mockServer = new MockMcpServer() as any;
  const manager = new NotificationManager(mockServer);
  
  // Start an operation that will fail
  const operationId = "failing-operation";
  const progressToken = "progress-fail-456";
  
  console.log("Starting operation that will encounter errors...");
  await manager.startOperation(
    operationId,
    progressToken,
    100,
    "Attempting to process large dataset"
  );
  
  // Simulate partial progress
  await manager.updateProgress(operationId, 25, "Processing first quarter of data");
  await new Promise(resolve => setTimeout(resolve, 200));
  
  await manager.updateProgress(operationId, 45, "Processing second quarter of data");
  await new Promise(resolve => setTimeout(resolve, 200));
  
  // Simulate error
  console.log("Simulating operation failure...");
  await manager.failOperation(
    operationId,
    new Error("Out of memory: Dataset too large for current configuration"),
    "Operation failed due to memory constraints"
  );
  
  // Send recovery suggestion
  await manager.sendInfo(
    "Recovery suggestion: Consider processing in smaller batches or increasing memory allocation",
    {
      type: "recovery_suggestion",
      failed_operation: operationId,
      suggested_batch_size: 1000,
      current_memory: "2GB",
      recommended_memory: "4GB"
    }
  );
}

async function demoNotificationStats() {
  console.log("\n" + "=".repeat(60));
  console.log("DEMO: Operation Statistics");
  console.log("=".repeat(60));
  
  const mockServer = new MockMcpServer() as any;
  const manager = new NotificationManager(mockServer);
  
  console.log("Starting multiple concurrent operations...");
  
  // Start multiple operations
  const ops = [
    { id: "op1", token: "token1", desc: "Processing user data" },
    { id: "op2", token: "token2", desc: "Generating reports" },
    { id: "op3", token: "token3", desc: "Backing up database" },
  ];
  
  for (const op of ops) {
    await manager.startOperation(op.id, op.token, 100, op.desc);
  }
  
  console.log(`Active operations: ${manager.getActiveOperationsCount()}`);
  console.log(`Operation IDs: ${manager.getActiveOperationIds().join(", ")}`);
  
  // Complete them one by one
  for (const op of ops) {
    await manager.updateProgress(op.id, 100, "Operation completed");
    await manager.completeOperation(op.id, "success");
    console.log(`Remaining operations: ${manager.getActiveOperationsCount()}`);
  }
}

async function main() {
  console.log("MCP Elasticsearch Server - Notification System Demo\n");
  
  try {
    await demoBasicNotifications();
    await demoProgressTracking();
    await demoProgressTracker();
    await demoErrorHandling();
    await demoNotificationStats();
    
    console.log("\n" + "=".repeat(60));
    console.log("Demo completed successfully!");
    console.log("=".repeat(60));
    console.log("\nKey Features Demonstrated:");
    console.log("• Progress notifications with percentage tracking");
    console.log("• General status notifications (info, warning, error)");
    console.log("• Operation lifecycle management");
    console.log("• Error handling with contextual information");
    console.log("• Concurrent operation tracking");
    console.log("\nIntegration:");
    console.log("• Tools automatically get notification capabilities");
    console.log("• Progress tokens are handled by MCP protocol");
    console.log("• Client receives real-time updates during operations");
    
  } catch (error) {
    console.error("Demo failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the demo
if (import.meta.main) {
  main();
}