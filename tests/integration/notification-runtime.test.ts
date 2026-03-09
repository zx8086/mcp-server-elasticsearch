/* tests/integration/notification-runtime.test.ts */

/**
 * Integration test to verify notification system works in production runtime
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createElasticsearchMcpServer } from "../../src/server.js";
import { getConfig } from "../../src/config.js";

describe("Notification Runtime Integration", () => {
  let server: McpServer;

  beforeAll(async () => {
    // Create server with test configuration
    const config = getConfig();
    server = await createElasticsearchMcpServer(config);
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  test("should create server without notification API errors", async () => {
    expect(server).toBeDefined();
    expect(server.server).toBeDefined();

    // Verify the server has the notification capability
    expect(server.server.notification).toBeDefined();
    expect(typeof server.server.notification).toBe('function');
  });

  test("should validate notification manager integration", async () => {
    const { notificationManager, withNotificationContext } = await import("../../src/utils/notifications.js");

    const capturedNotifications: any[] = [];
    const mockExtra = {
      sendNotification: async (notification: any) => {
        capturedNotifications.push(notification);
      },
      signal: new AbortController().signal,
      requestId: "direct-test-request"
    };

    // Test wrapper function
    const testHandler = withNotificationContext(async (args: any, _extra: any) => {
      // sendInfo logs locally but doesn't call sendNotification (by design)
      await notificationManager.sendInfo("Test notification from wrapped handler");
      // sendProgress DOES call sendNotification
      await notificationManager.sendProgress({ progressToken: "test-token", progress: 50, total: 100 });
      return { success: true };
    });

    await testHandler({ test: "data" }, mockExtra);

    // Only progress notifications are sent to the client
    const progressNotifications = capturedNotifications.filter(n =>
      n.method === 'notifications/progress'
    );
    expect(progressNotifications.length).toBeGreaterThan(0);
    expect(progressNotifications[0].params.progress).toBe(50);
  });
});
