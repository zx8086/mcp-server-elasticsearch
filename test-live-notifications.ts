#!/usr/bin/env bun

/* test-live-notifications.ts - Test notifications with live server */

import { Client } from "@elastic/elasticsearch";
import { createProgressTracker, notificationManager } from "./src/utils/notifications.js";
import { logger } from "./src/utils/logger.js";

console.log("Testing Live Notification System\n");

console.log("Simulating search operation with notifications...");

try {
  // Simulate a request that would have notifications
  const tracker = await createProgressTracker(
    "elasticsearch_search",
    100,
    "Testing search operation notifications"
  );

  await tracker.updateProgress(10, "Parsing search parameters");
  await new Promise(resolve => setTimeout(resolve, 100));

  await tracker.updateProgress(25, "Validating index pattern");
  await new Promise(resolve => setTimeout(resolve, 100));

  await tracker.updateProgress(50, "Executing search query");
  await new Promise(resolve => setTimeout(resolve, 100));

  await tracker.updateProgress(75, "Processing search results");
  await new Promise(resolve => setTimeout(resolve, 100));

  await tracker.complete({
    hits: { total: { value: 42 }, hits: [] },
    took: 15,
  }, "Search operation completed successfully");

  console.log("Search operation simulation completed");

} catch (error) {
  console.log(`Search simulation failed: ${error}`);
}

console.log("\nTesting error notifications...");

try {
  await notificationManager.sendError(
    "Test error notification",
    new Error("Simulated error for testing"),
    { operation: "test" }
  );
  console.log("Error notification handled gracefully");

  await notificationManager.sendWarning(
    "Test warning notification", 
    { severity: "medium" }
  );
  console.log("Warning notification handled gracefully");

  await notificationManager.sendInfo(
    "Test info notification",
    { status: "operational" }
  );
  console.log("Info notification handled gracefully");

} catch (error) {
  console.log(`Notification testing failed: ${error}`);
}

console.log("\n**Expected Behavior:**");
console.log("• All message notifications should be logged locally only");
console.log("• No 'Server does not support logging' errors should appear");
console.log("• Progress notifications would work when request context is available");
console.log("• All operations should complete without throwing errors");
console.log("");
console.log("Live notification test completed!");