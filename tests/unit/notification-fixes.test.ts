#!/usr/bin/env bun

/**
 * Test to verify notification fixes work correctly
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { NotificationManager } from "../../src/utils/notifications.js";
import type { RequestHandlerExtra, ServerRequest, ServerNotification } from "@modelcontextprotocol/sdk/shared/protocol.js";

describe("NotificationManager fixes", () => {
  let mockExtra: RequestHandlerExtra<ServerRequest, ServerNotification>;
  let notificationManager: NotificationManager;
  let sentNotifications: any[] = [];

  beforeEach(() => {
    sentNotifications = [];

    // Create a mock RequestHandlerExtra with sendNotification
    mockExtra = {
      sendNotification: async (notification: any) => {
        sentNotifications.push(notification);
      },
      signal: new AbortController().signal,
      requestId: "test-request"
    } as any;

    notificationManager = new NotificationManager();
    notificationManager.setRequestContext(mockExtra);
  });

  test("should send progress notifications using correct method", async () => {
    await notificationManager.sendProgress({
      progressToken: "test-token",
      progress: 50,
      total: 100,
    });

    expect(sentNotifications).toHaveLength(1);
    expect(sentNotifications[0]).toEqual({
      method: "notifications/progress",
      params: {
        progressToken: "test-token",
        progress: 50,
        total: 100,
      },
    });
  });

  test("should log message notifications locally instead of sending", async () => {
    await notificationManager.sendMessage({
      level: "info",
      data: {
        message: "Test message",
        type: "test",
      },
    });

    // Should NOT send notifications to client (logs locally instead)
    expect(sentNotifications).toHaveLength(0);
    
    // Message should be logged locally to avoid "Server does not support logging" errors
  });

  test("should handle missing context gracefully", async () => {
    const emptyManager = new NotificationManager();

    // Should not throw errors
    await emptyManager.sendProgress({
      progressToken: "test",
      progress: 10,
      total: 100,
    });

    await emptyManager.sendMessage({
      level: "info",
      data: { message: "test" },
    });

    // If we get here without exceptions, the test passes
    expect(true).toBe(true);
  });

  test("should handle context errors gracefully", async () => {
    const failingExtra = {
      sendNotification: async () => {
        throw new Error("Notification failed");
      },
      signal: new AbortController().signal,
      requestId: "test-request"
    } as any;

    const failingManager = new NotificationManager();
    failingManager.setRequestContext(failingExtra);

    // Should not throw errors, just log them
    await failingManager.sendProgress({
      progressToken: "test",
      progress: 10,
      total: 100,
    });

    await failingManager.sendMessage({
      level: "info",
      data: { message: "test" },
    });

    // If we get here without exceptions, the test passes
    expect(true).toBe(true);
  });

  test("should create operation trackers correctly", async () => {
    const operationId = NotificationManager.generateOperationId("test");
    const progressToken = NotificationManager.generateProgressToken(operationId);

    expect(operationId).toMatch(/^test-\d+-[a-z0-9]+$/);
    expect(progressToken).toBe(`progress-${operationId}`);

    await notificationManager.startOperation(
      operationId,
      progressToken,
      100,
      "Test operation"
    );

    // Should have sent only progress notification (1 total, message notifications are logged locally)
    expect(sentNotifications).toHaveLength(1);

    // Should be progress notification only (start message is now logged locally)
    expect(sentNotifications[0]).toEqual({
      method: "notifications/progress",
      params: {
        progressToken,
        progress: 0,
        total: 100,
      },
    });

    expect(notificationManager.getActiveOperationsCount()).toBe(1);
    expect(notificationManager.getActiveOperationIds()).toContain(operationId);
  });
});

console.log("Notification fixes test completed");