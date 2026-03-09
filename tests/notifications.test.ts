/* tests/notifications.test.ts */

import { describe, expect, it, mock, beforeEach } from "bun:test";
import { NotificationManager, notificationManager } from "../src/utils/notifications.js";
import type { RequestHandlerExtra, ServerRequest, ServerNotification } from "@modelcontextprotocol/sdk/shared/protocol.js";

describe("Notification System", () => {
  let mockSendNotification: ReturnType<typeof mock>;
  let mockExtra: RequestHandlerExtra<ServerRequest, ServerNotification>;

  beforeEach(() => {
    mockSendNotification = mock(() => Promise.resolve());
    mockExtra = {
      sendNotification: mockSendNotification,
      signal: new AbortController().signal,
      requestId: "test-request"
    } as any;
  });

  it("should create notification manager", () => {
    const manager = new NotificationManager();
    expect(manager).toBeDefined();
    expect(manager.getActiveOperationsCount()).toBe(0);
  });

  it("should track operation IDs", async () => {
    const manager = new NotificationManager();
    manager.setRequestContext(mockExtra);

    const operationId = "test-op-123";
    const progressToken = "progress-123";

    await manager.startOperation(operationId, progressToken, 100, "Test operation");

    expect(manager.getActiveOperationsCount()).toBe(1);
    expect(manager.getActiveOperationIds()).toContain(operationId);

    // Test progress update
    await manager.updateProgress(operationId, 50, "Halfway done");

    // Test completion
    await manager.completeOperation(operationId, "success");

    expect(manager.getActiveOperationsCount()).toBe(0);
    expect(manager.getActiveOperationIds()).not.toContain(operationId);

    // Verify sendNotification was called for progress notifications
    expect(mockSendNotification).toHaveBeenCalled();
  });

  it("should send info notifications (logged locally, not sent to client)", async () => {
    const manager = new NotificationManager();
    manager.setRequestContext(mockExtra);

    await manager.sendInfo("Test message", { key: "value" });

    // sendMessage logs locally but does NOT call sendNotification
    // (most MCP clients don't support notifications/message)
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("should send error notifications (logged locally, not sent to client)", async () => {
    const manager = new NotificationManager();
    manager.setRequestContext(mockExtra);

    const error = new Error("Test error");
    await manager.sendError("Operation failed", error, { context: "test" });

    // sendMessage logs locally but does NOT call sendNotification
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("should generate operation and progress tokens", () => {
    const operationId = NotificationManager.generateOperationId("test");
    expect(operationId).toMatch(/^test-\d+-[a-z0-9]+$/);

    const progressToken = NotificationManager.generateProgressToken(operationId);
    expect(progressToken).toBe(`progress-${operationId}`);
  });

  it("should handle missing context gracefully", async () => {
    const manager = new NotificationManager();

    // No error should be thrown when context is not set
    await expect(manager.sendInfo("Test")).resolves.toBeUndefined();
    await expect(manager.sendProgress({ progressToken: "test", progress: 50 })).resolves.toBeUndefined();
  });

  it("should handle operation failures", async () => {
    const manager = new NotificationManager();
    manager.setRequestContext(mockExtra);

    const operationId = "test-fail-op";
    const progressToken = "progress-fail";

    await manager.startOperation(operationId, progressToken, 100, "Test failing operation");

    expect(manager.getActiveOperationsCount()).toBe(1);

    const error = new Error("Test failure");
    await manager.failOperation(operationId, error, "Operation failed");

    expect(manager.getActiveOperationsCount()).toBe(0);

    // sendNotification is called for progress (startOperation sends initial progress),
    // but NOT for message notifications (failOperation's sendMessage only logs)
    expect(mockSendNotification).toHaveBeenCalledWith({
      method: "notifications/progress",
      params: {
        progressToken: "progress-fail",
        progress: 0,
        total: 100,
      },
    });
  });

  it("should handle progress updates for unknown operations", async () => {
    const manager = new NotificationManager();
    manager.setRequestContext(mockExtra);

    // Should not throw error for unknown operation
    await expect(manager.updateProgress("unknown-op", 50)).resolves.toBeUndefined();

    // sendNotification should not be called for unknown operation
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("should work with global notification manager instance", () => {
    expect(notificationManager).toBeDefined();
    expect(notificationManager).toBeInstanceOf(NotificationManager);
  });
});
