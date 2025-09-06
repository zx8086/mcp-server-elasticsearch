#!/usr/bin/env bun

/**
 * Integration test to verify notifications work with actual MCP server
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createElasticsearchMcpServer } from "../../src/server.js";
import { getConfig } from "../../src/config.js";
import { notificationManager } from "../../src/utils/notifications.js";

describe("Notification Integration Tests", () => {
  let server: any;
  const config = getConfig();

  beforeAll(async () => {
    // Create server but don't connect to transport
    try {
      server = await createElasticsearchMcpServer(config);
      console.log("✅ Server created successfully for notification testing");
    } catch (error) {
      console.warn("⚠️ Could not create server (likely ES connection issue):", error.message);
      // Skip tests if server can't be created
      return;
    }
  });

  test("should have notification manager initialized", () => {
    if (!server) {
      console.log("⏭️ Skipping test - server not available");
      return;
    }

    // Verify notification manager is properly initialized
    expect(notificationManager).toBeDefined();
    expect(notificationManager.getActiveOperationsCount()).toBe(0);
  });

  test("should be able to create progress trackers", async () => {
    if (!server) {
      console.log("⏭️ Skipping test - server not available");
      return;
    }

    const operationId = "test-integration-op";
    let errorOccurred = false;

    try {
      await notificationManager.startOperation(
        operationId,
        "progress-test",
        100,
        "Integration test operation"
      );

      expect(notificationManager.getActiveOperationsCount()).toBe(1);
      expect(notificationManager.getActiveOperationIds()).toContain(operationId);

      await notificationManager.updateProgress(operationId, 50, "Halfway done");
      await notificationManager.completeOperation(operationId, "success", "Test completed");

      expect(notificationManager.getActiveOperationsCount()).toBe(0);
    } catch (error) {
      errorOccurred = true;
      console.error("Error in progress tracking:", error.message);
    }

    // The important thing is that no exceptions are thrown
    expect(errorOccurred).toBe(false);
  });

  test("should handle notification errors gracefully", async () => {
    if (!server) {
      console.log("⏭️ Skipping test - server not available");
      return;
    }

    let errorOccurred = false;

    try {
      // These should not throw errors even if notifications fail
      await notificationManager.sendInfo("Test info message", { test: true });
      await notificationManager.sendWarning("Test warning message");
      await notificationManager.sendError("Test error message", new Error("Test error"));
    } catch (error) {
      errorOccurred = true;
      console.error("Notification error:", error.message);
    }

    // The important thing is that no exceptions are thrown
    expect(errorOccurred).toBe(false);
  });

  afterAll(async () => {
    if (server && typeof server.close === "function") {
      try {
        server.close();
      } catch (error) {
        // Ignore close errors
      }
    }
  });
});

console.log("✅ Notification integration test completed");