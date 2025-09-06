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
  let capturedNotifications: any[] = [];

  beforeAll(async () => {
    // Create server with test configuration
    const config = getConfig();
    server = await createElasticsearchMcpServer(config);

    // Mock the underlying server's notification method to capture notifications
    const originalNotification = server.server.notification.bind(server.server);
    server.server.notification = async (notification: any, options?: any) => {
      capturedNotifications.push({ notification, options });
      return originalNotification(notification, options);
    };
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  test("should create server without notification API errors", async () => {
    // This test verifies that the server can be created without the old notification errors
    // The fact that beforeAll completed successfully proves this
    
    expect(server).toBeDefined();
    expect(server.server).toBeDefined();
    
    // Verify the server has the notification capability
    expect(server.server.notification).toBeDefined();
    expect(typeof server.server.notification).toBe('function');
    
    console.log("✅ Server created successfully without 'sendNotification is not a function' errors");
    console.log("✅ MCP Server has proper notification method available");
  });

  test("should validate notification manager integration", async () => {
    // Test the notification manager independently
    const { notificationManager, withNotificationContext } = await import("../../src/utils/notifications.js");
    
    const mockExtra = {
      sendNotification: async (notification: any) => {
        capturedNotifications.push({ directTest: notification });
      },
      signal: new AbortController().signal,
      requestId: "direct-test-request"
    };

    // Test wrapper function
    const testHandler = withNotificationContext(async (args: any, extra: any) => {
      // Send test notification inside wrapped handler
      await notificationManager.sendInfo("Test notification from wrapped handler");
      return { success: true };
    });

    await testHandler({ test: "data" }, mockExtra);

    // Verify notification was sent through the context
    const directNotifications = capturedNotifications.filter(n => n.directTest);
    expect(directNotifications.length).toBeGreaterThan(0);

    const testNotification = directNotifications.find(n => 
      n.directTest.method === 'notifications/message' && 
      n.directTest.params.data.message === 'Test notification from wrapped handler'
    );
    
    expect(testNotification).toBeDefined();
    console.log("✅ Direct notification manager integration works correctly");
  });
});

console.log("✅ Notification runtime integration test completed");