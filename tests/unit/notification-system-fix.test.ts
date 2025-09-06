/* tests/unit/notification-system-fix.test.ts */

import { describe, expect, it, beforeEach, jest } from "bun:test";
import { notificationManager, withNotificationContext } from "../../src/utils/notifications.js";
import type { RequestHandlerExtra, ServerRequest, ServerNotification } from "@modelcontextprotocol/sdk/shared/protocol.js";

describe("Notification System Fix", () => {
  let mockSendNotification: jest.MockedFunction<any>;
  let mockExtra: RequestHandlerExtra<ServerRequest, ServerNotification>;

  beforeEach(() => {
    // Create a mock sendNotification function
    mockSendNotification = jest.fn();
    
    // Create a mock RequestHandlerExtra with sendNotification
    mockExtra = {
      sendNotification: mockSendNotification,
      signal: new AbortController().signal,
      requestId: "test-request-123"
    } as any;
    
    // Clear any existing context
    notificationManager.clearRequestContext();
  });

  it("should set and clear request context", () => {
    // Initially no context
    expect(notificationManager['requestContext']).toBeNull();
    
    // Set context
    notificationManager.setRequestContext(mockExtra);
    expect(notificationManager['requestContext']).toBe(mockExtra);
    
    // Clear context
    notificationManager.clearRequestContext();
    expect(notificationManager['requestContext']).toBeNull();
  });

  it("should send progress notifications using sendNotification from context", async () => {
    notificationManager.setRequestContext(mockExtra);
    
    await notificationManager.sendProgress({
      progressToken: "test-token",
      progress: 50,
      total: 100
    });
    
    expect(mockSendNotification).toHaveBeenCalledWith({
      method: "notifications/progress",
      params: {
        progressToken: "test-token",
        progress: 50,
        total: 100
      }
    });
  });

  it("should send message notifications using sendNotification from context", async () => {
    notificationManager.setRequestContext(mockExtra);
    
    await notificationManager.sendMessage({
      level: "info",
      data: {
        message: "Test message",
        type: "info"
      }
    });
    
    expect(mockSendNotification).toHaveBeenCalledWith({
      method: "notifications/message",
      params: {
        level: "info",
        logger: "elasticsearch-mcp-server",
        data: {
          message: "Test message",
          type: "info",
          timestamp: expect.any(String)
        }
      }
    });
  });

  it("should handle missing context gracefully", async () => {
    // No context set
    await notificationManager.sendProgress({
      progressToken: "test-token",
      progress: 50
    });
    
    // Should not throw, but also shouldn't call sendNotification
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("should wrap handlers with notification context", async () => {
    const mockHandler = jest.fn().mockResolvedValue({ success: true });
    const wrappedHandler = withNotificationContext(mockHandler);
    
    const testArgs = { test: "data" };
    
    await wrappedHandler(testArgs, mockExtra);
    
    // Handler should have been called with the same arguments
    expect(mockHandler).toHaveBeenCalledWith(testArgs, mockExtra);
    
    // Context should be cleared after execution
    expect(notificationManager['requestContext']).toBeNull();
  });

  it("should clear context even if handler throws", async () => {
    const mockHandler = jest.fn().mockRejectedValue(new Error("Handler error"));
    const wrappedHandler = withNotificationContext(mockHandler);
    
    const testArgs = { test: "data" };
    
    await expect(wrappedHandler(testArgs, mockExtra)).rejects.toThrow("Handler error");
    
    // Context should still be cleared after error
    expect(notificationManager['requestContext']).toBeNull();
  });

  it("should send info notifications", async () => {
    notificationManager.setRequestContext(mockExtra);
    
    await notificationManager.sendInfo("Test info message", { extra: "data" });
    
    expect(mockSendNotification).toHaveBeenCalledWith({
      method: "notifications/message",
      params: {
        level: "info",
        logger: "elasticsearch-mcp-server",
        data: {
          message: "Test info message",
          type: "info",
          extra: "data",
          timestamp: expect.any(String)
        }
      }
    });
  });

  it("should send error notifications", async () => {
    notificationManager.setRequestContext(mockExtra);
    
    const testError = new Error("Test error");
    await notificationManager.sendError("Operation failed", testError, { operation: "test" });
    
    expect(mockSendNotification).toHaveBeenCalledWith({
      method: "notifications/message",
      params: {
        level: "error",
        logger: "elasticsearch-mcp-server",
        data: {
          message: "Operation failed",
          type: "error",
          error: "Test error",
          operation: "test",
          timestamp: expect.any(String)
        }
      }
    });
  });

  it("should send warning notifications", async () => {
    notificationManager.setRequestContext(mockExtra);
    
    await notificationManager.sendWarning("Test warning", { severity: "medium" });
    
    expect(mockSendNotification).toHaveBeenCalledWith({
      method: "notifications/message",
      params: {
        level: "warning",
        logger: "elasticsearch-mcp-server",
        data: {
          message: "Test warning",
          type: "warning",
          severity: "medium",
          timestamp: expect.any(String)
        }
      }
    });
  });
});