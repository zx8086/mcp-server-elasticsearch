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
    
    // Verify sendNotification was called
    expect(mockSendNotification).toHaveBeenCalled();
  });

  it("should send info notifications", async () => {
    const manager = new NotificationManager();
    manager.setRequestContext(mockExtra);
    
    await manager.sendInfo("Test message", { key: "value" });
    
    expect(mockSendNotification).toHaveBeenCalledWith({
      method: "notifications/message",
      params: expect.objectContaining({
        level: "info",
        logger: "elasticsearch-mcp-server",
        data: expect.objectContaining({
          message: "Test message",
          type: "info",
          key: "value",
        }),
      }),
    });
  });

  it("should send error notifications", async () => {
    const manager = new NotificationManager();
    manager.setRequestContext(mockExtra);
    
    const error = new Error("Test error");
    await manager.sendError("Operation failed", error, { context: "test" });
    
    expect(mockSendNotification).toHaveBeenCalledWith({
      method: "notifications/message",
      params: expect.objectContaining({
        level: "error",
        logger: "elasticsearch-mcp-server",
        data: expect.objectContaining({
          message: "Operation failed",
          type: "error",
          error: "Test error",
          context: "test",
        }),
      }),
    });
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
    expect(mockSendNotification).toHaveBeenCalledWith({
      method: "notifications/message",
      params: expect.objectContaining({
        level: "error",
        data: expect.objectContaining({
          type: "operation_failed",
          operation_id: operationId,
          message: "Operation failed",
          error: "Test failure",
        }),
      }),
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