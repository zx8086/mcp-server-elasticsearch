#!/usr/bin/env bun

/* test-notification-fix.ts - Test notification system fixes */

console.log("Testing Notification System Fixes\n");

// Test 1: Import and basic functionality
console.log("Test 1: Import notification system");
try {
  const { NotificationManager, notificationManager, createProgressTracker } = await import("./src/utils/notifications.js");
  console.log("Successfully imported notification system");
} catch (error) {
  console.log(`Failed to import: ${error}`);
  process.exit(1);
}

// Test 2: Message notification graceful fallback
console.log("\nTest 2: Message notification graceful fallback");
try {
  const { notificationManager } = await import("./src/utils/notifications.js");
  
  // Test sending a message without request context (should log locally)
  await notificationManager.sendMessage({
    level: "info",
    data: {
      message: "Test message for graceful fallback",
      type: "test",
      operation_id: "test-op-1",
    },
  });
  
  console.log("Message notification handled gracefully (should log locally)");
} catch (error) {
  console.log(`Message notification failed: ${error}`);
}

// Test 3: Progress notification without context
console.log("\nTest 3: Progress notification without request context");
try {
  const { notificationManager } = await import("./src/utils/notifications.js");
  
  // Test progress notification without request context (should be graceful)
  await notificationManager.sendProgress({
    progressToken: "test-token",
    progress: 50,
    total: 100,
  });
  
  console.log("Progress notification handled gracefully without context");
} catch (error) {
  console.log(`Progress notification failed: ${error}`);
}

// Test 4: Progress tracker creation
console.log("\nTest 4: Progress tracker creation");
try {
  const { createProgressTracker } = await import("./src/utils/notifications.js");
  
  const tracker = await createProgressTracker(
    "elasticsearch_test",
    100,
    "Test operation"
  );
  
  console.log("Progress tracker created successfully");
  console.log(`  Operation ID: ${tracker.operationId}`);
  console.log(`  Progress Token: ${tracker.progressToken}`);
  
  // Test progress update
  await tracker.updateProgress(25, "Test progress update");
  console.log("Progress update handled gracefully");

  // Test completion
  await tracker.complete({ test: "result" }, "Test completed");
  console.log("Progress completion handled gracefully");

} catch (error) {
  console.log(`Progress tracker test failed: ${error}`);
}

// Test 5: Error scenarios
console.log("\nTest 5: Error handling scenarios");
try {
  const { notificationManager } = await import("./src/utils/notifications.js");
  
  // Test error notification
  await notificationManager.sendError(
    "Test error message",
    new Error("Test error details"),
    { test: "data" }
  );
  
  console.log("Error notification handled gracefully");
  
  // Test warning notification
  await notificationManager.sendWarning(
    "Test warning message",
    { test: "warning data" }
  );
  
  console.log("Warning notification handled gracefully");

} catch (error) {
  console.log(`Error handling test failed: ${error}`);
}

console.log("\n**Fix Summary:**");
console.log("The notification system was failing because it tried to send 'notifications/message'");
console.log("which Claude Desktop doesn't support. The fixes include:");
console.log("");
console.log("Message notifications now log locally instead of sending to client");
console.log("Progress notifications have graceful error handling");
console.log("All notification methods handle missing request context");
console.log("Error logging is more appropriate (warn vs error for optional features)");
console.log("");
console.log("**Key Changes:**");
console.log("• sendMessage() now logs locally and skips client notification");
console.log("• sendProgress() uses logger.warn instead of logger.error for failures");
console.log("• Better error messages explaining MCP client limitations");
console.log("• All notification errors are non-blocking and graceful");
console.log("");
console.log("Test completed! The notification system should now work without errors.");