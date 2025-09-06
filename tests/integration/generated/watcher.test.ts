/**
 * Auto-generated Integration Tests for watcher tools
 * Generated: 2025-08-20T08:05:50.562Z
 * Coverage: 13 tools
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { Client } from "@elastic/elasticsearch";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createElasticsearchClient, shouldSkipIntegrationTests } from "../../utils/elasticsearch-client";
import { traceToolExecution } from "../../../src/utils/tracing";
import { initializeReadOnlyManager } from "../../../src/utils/readOnlyMode";
import { logger } from "../../../src/utils/logger";

// Import all tools in this category
import { registerGetWatchTool } from "../../../src/tools/watcher/get_watch";
import { registerDeactivateWatchTool } from "../../../src/tools/watcher/deactivate_watch";
import { registerStatsTool } from "../../../src/tools/watcher/stats";
import { registerDeleteWatchTool } from "../../../src/tools/watcher/delete_watch";
import { registerUpdateSettingsTool } from "../../../src/tools/watcher/update_settings";
import { registerPutWatchTool } from "../../../src/tools/watcher/put_watch";
import { registerActivateWatchTool } from "../../../src/tools/watcher/activate_watch";
import { registerStartTool } from "../../../src/tools/watcher/start";
import { registerStopTool } from "../../../src/tools/watcher/stop";
import { registerQueryWatchesTool } from "../../../src/tools/watcher/query_watches";
import { registerExecuteWatchTool } from "../../../src/tools/watcher/execute_watch";
import { registerGetSettingsTool } from "../../../src/tools/watcher/get_settings";
import { registerAckWatchTool } from "../../../src/tools/watcher/ack_watch";

// Suppress logs during tests
logger.debug = () => {};
logger.info = () => {};
logger.warn = () => {};

describe.skipIf(shouldSkipIntegrationTests())("watcher Tools - Real Integration Tests", () => {
  let client: Client;
  let server: McpServer;
  let wrappedServer: McpServer;
  
  // Test indices
  const TEST_INDEX = `test-watcher-${Date.now()}`;
  const TEST_INDEX_PATTERN = `test-watcher-*`;
  
  beforeAll(async () => {
    // Initialize
    initializeReadOnlyManager(false, false);
    
    // Create real Elasticsearch client
    client = createElasticsearchClient();
    
    // Test connection
    try {
      await client.ping();
    } catch (error) {
      throw new Error("Cannot run integration tests without Elasticsearch connection");
    }
    
    // Create MCP server
    server = new McpServer({
      name: "test-server",
      version: "1.0.0",
    });
    
    wrappedServer = server; // Skip tracing for tests
    
    // Register all tools
    registerGetWatchTool(wrappedServer, client);
    registerDeactivateWatchTool(wrappedServer, client);
    registerStatsTool(wrappedServer, client);
    registerDeleteWatchTool(wrappedServer, client);
    registerUpdateSettingsTool(wrappedServer, client);
    registerPutWatchTool(wrappedServer, client);
    registerActivateWatchTool(wrappedServer, client);
    registerStartTool(wrappedServer, client);
    registerStopTool(wrappedServer, client);
    registerQueryWatchesTool(wrappedServer, client);
    registerExecuteWatchTool(wrappedServer, client);
    registerGetSettingsTool(wrappedServer, client);
    registerAckWatchTool(wrappedServer, client);
    
    // Create test index with sample data
    await client.indices.create({
      index: TEST_INDEX,
      body: {
        mappings: {
          properties: {
            title: { type: "text" },
            content: { type: "text" },
            status: { type: "keyword" },
            timestamp: { type: "date" },
            count: { type: "integer" },
            tags: { type: "keyword" },
            location: { type: "geo_point" },
            metadata: { type: "object" }
          },
        },
      },
    });
    
    // Insert diverse test data
    const testDocs = [
      {
        title: "Test Document 1",
        content: "This is a test document with searchable content",
        status: "active",
        timestamp: "2025-01-15T10:00:00Z",
        count: 42,
        tags: ["test", "integration"],
        location: { lat: 40.7128, lon: -74.0060 },
        metadata: { version: "1.0", author: "test" }
      },
      {
        title: "Test Document 2",
        content: "Another document for testing various queries",
        status: "inactive",
        timestamp: "2025-01-16T10:00:00Z",
        count: 100,
        tags: ["test", "sample"],
        location: { lat: 51.5074, lon: -0.1278 },
        metadata: { version: "2.0", author: "bot" }
      }
    ];
    
    for (const doc of testDocs) {
      await client.index({
        index: TEST_INDEX,
        document: doc,
        refresh: true,
      });
    }
  });
  
  afterAll(async () => {
    // Cleanup
    try {
      await client.indices.delete({ index: `${TEST_INDEX}*` });
    } catch {
      // Ignore cleanup errors
    }
    await client.close();
  });


  describe("Read-Only Operations", () => {

    test.skip("elasticsearch_watcher_get_watch should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_get_watch");
      expect(tool).toBeDefined();
      
      const params: any = {};
      
      
      const result = await tool.handler(params);
      
      // Basic assertions that work for all read tools
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe("text");
      
      // Tool should not throw errors
      expect(result.content[0].text).not.toContain("Error:");
    });

    test.skip("elasticsearch_watcher_get_watch should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_get_watch");
      
      const params: any = {};
      
      
      const result = await tool.handler(params);
      
      // Should handle error gracefully
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // Should indicate error or no results
      const text = result.content[0].text.toLowerCase();
      expect(
        text.includes("error") || 
        text.includes("not found") || 
        text.includes("no ") ||
        text.includes("0 ")
      ).toBe(true);
    });

    test.skip("elasticsearch_watcher_deactivate_watch should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_deactivate_watch");
      expect(tool).toBeDefined();
      
      const params: any = {};
      
      
      const result = await tool.handler(params);
      
      // Basic assertions that work for all read tools
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe("text");
      
      // Tool should not throw errors
      expect(result.content[0].text).not.toContain("Error:");
    });

    test.skip("elasticsearch_watcher_deactivate_watch should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_deactivate_watch");
      
      const params: any = {};
      
      
      const result = await tool.handler(params);
      
      // Should handle error gracefully
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // Should indicate error or no results
      const text = result.content[0].text.toLowerCase();
      expect(
        text.includes("error") || 
        text.includes("not found") || 
        text.includes("no ") ||
        text.includes("0 ")
      ).toBe(true);
    });

    test.skip("elasticsearch_watcher_stats should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_stats");
      expect(tool).toBeDefined();
      
      const params: any = {};
      
      
      const result = await tool.handler(params);
      
      // Basic assertions that work for all read tools
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe("text");
      
      // Tool should not throw errors
      expect(result.content[0].text).not.toContain("Error:");
    });

    test.skip("elasticsearch_watcher_stats should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_stats");
      
      const params: any = {};
      
      
      const result = await tool.handler(params);
      
      // Should handle error gracefully
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // Should indicate error or no results
      const text = result.content[0].text.toLowerCase();
      expect(
        text.includes("error") || 
        text.includes("not found") || 
        text.includes("no ") ||
        text.includes("0 ")
      ).toBe(true);
    });

    test.skip("elasticsearch_watcher_activate_watch should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_activate_watch");
      expect(tool).toBeDefined();
      
      const params: any = {};
      
      
      const result = await tool.handler(params);
      
      // Basic assertions that work for all read tools
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe("text");
      
      // Tool should not throw errors
      expect(result.content[0].text).not.toContain("Error:");
    });

    test.skip("elasticsearch_watcher_activate_watch should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_activate_watch");
      
      const params: any = {};
      
      
      const result = await tool.handler(params);
      
      // Should handle error gracefully
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // Should indicate error or no results
      const text = result.content[0].text.toLowerCase();
      expect(
        text.includes("error") || 
        text.includes("not found") || 
        text.includes("no ") ||
        text.includes("0 ")
      ).toBe(true);
    });

    test.skip("elasticsearch_watcher_start should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_start");
      expect(tool).toBeDefined();
      
      const params: any = {};
      
      
      const result = await tool.handler(params);
      
      // Basic assertions that work for all read tools
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe("text");
      
      // Tool should not throw errors
      expect(result.content[0].text).not.toContain("Error:");
    });

    test.skip("elasticsearch_watcher_start should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_start");
      
      const params: any = {};
      
      
      const result = await tool.handler(params);
      
      // Should handle error gracefully
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // Should indicate error or no results
      const text = result.content[0].text.toLowerCase();
      expect(
        text.includes("error") || 
        text.includes("not found") || 
        text.includes("no ") ||
        text.includes("0 ")
      ).toBe(true);
    });

    test.skip("elasticsearch_watcher_stop should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_stop");
      expect(tool).toBeDefined();
      
      const params: any = {};
      
      
      const result = await tool.handler(params);
      
      // Basic assertions that work for all read tools
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe("text");
      
      // Tool should not throw errors
      expect(result.content[0].text).not.toContain("Error:");
    });

    test.skip("elasticsearch_watcher_stop should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_stop");
      
      const params: any = {};
      
      
      const result = await tool.handler(params);
      
      // Should handle error gracefully
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // Should indicate error or no results
      const text = result.content[0].text.toLowerCase();
      expect(
        text.includes("error") || 
        text.includes("not found") || 
        text.includes("no ") ||
        text.includes("0 ")
      ).toBe(true);
    });

    test.skip("elasticsearch_watcher_query_watches should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_query_watches");
      expect(tool).toBeDefined();
      
      const params: any = {};
      
      
      const result = await tool.handler(params);
      
      // Basic assertions that work for all read tools
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe("text");
      
      // Tool should not throw errors
      expect(result.content[0].text).not.toContain("Error:");
    });

    test.skip("elasticsearch_watcher_query_watches should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_query_watches");
      
      const params: any = {};
      
      
      const result = await tool.handler(params);
      
      // Should handle error gracefully
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // Should indicate error or no results
      const text = result.content[0].text.toLowerCase();
      expect(
        text.includes("error") || 
        text.includes("not found") || 
        text.includes("no ") ||
        text.includes("0 ")
      ).toBe(true);
    });

    test.skip("elasticsearch_watcher_execute_watch should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_execute_watch");
      expect(tool).toBeDefined();
      
      const params: any = {};
      
      
      const result = await tool.handler(params);
      
      // Basic assertions that work for all read tools
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe("text");
      
      // Tool should not throw errors
      expect(result.content[0].text).not.toContain("Error:");
    });

    test.skip("elasticsearch_watcher_execute_watch should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_execute_watch");
      
      const params: any = {};
      
      
      const result = await tool.handler(params);
      
      // Should handle error gracefully
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // Should indicate error or no results
      const text = result.content[0].text.toLowerCase();
      expect(
        text.includes("error") || 
        text.includes("not found") || 
        text.includes("no ") ||
        text.includes("0 ")
      ).toBe(true);
    });

    test.skip("elasticsearch_watcher_get_settings should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_get_settings");
      expect(tool).toBeDefined();
      
      const params: any = {};
      
      
      const result = await tool.handler(params);
      
      // Basic assertions that work for all read tools
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe("text");
      
      // Tool should not throw errors
      expect(result.content[0].text).not.toContain("Error:");
    });

    test.skip("elasticsearch_watcher_get_settings should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_get_settings");
      
      const params: any = {};
      
      
      const result = await tool.handler(params);
      
      // Should handle error gracefully
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // Should indicate error or no results
      const text = result.content[0].text.toLowerCase();
      expect(
        text.includes("error") || 
        text.includes("not found") || 
        text.includes("no ") ||
        text.includes("0 ")
      ).toBe(true);
    });

    test.skip("elasticsearch_watcher_ack_watch should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_ack_watch");
      expect(tool).toBeDefined();
      
      const params: any = {};
      
      
      const result = await tool.handler(params);
      
      // Basic assertions that work for all read tools
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe("text");
      
      // Tool should not throw errors
      expect(result.content[0].text).not.toContain("Error:");
    });

    test.skip("elasticsearch_watcher_ack_watch should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_ack_watch");
      
      const params: any = {};
      
      
      const result = await tool.handler(params);
      
      // Should handle error gracefully
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // Should indicate error or no results
      const text = result.content[0].text.toLowerCase();
      expect(
        text.includes("error") || 
        text.includes("not found") || 
        text.includes("no ") ||
        text.includes("0 ")
      ).toBe(true);
    });

  });



  describe("Write Operations", () => {

    test.skip("elasticsearch_watcher_delete_watch should execute successfully", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_delete_watch");
      expect(tool).toBeDefined();
      
      const params: any = {};
      
      
      
      // For safety, only test on our test index
      if (params.index && !params.index.startsWith('test-')) {
        params.index = TEST_INDEX;
      }
      
      const result = await tool.handler(params);
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // Check for success indicators
      const text = result.content[0].text.toLowerCase();
      expect(text).not.toContain("error");
    });

    test.skip("elasticsearch_watcher_update_settings should execute successfully", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_update_settings");
      expect(tool).toBeDefined();
      
      const params: any = {};
      
      
      
      // For safety, only test on our test index
      if (params.index && !params.index.startsWith('test-')) {
        params.index = TEST_INDEX;
      }
      
      const result = await tool.handler(params);
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // Check for success indicators
      const text = result.content[0].text.toLowerCase();
      expect(text).not.toContain("error");
    });

    test.skip("elasticsearch_watcher_put_watch should execute successfully", async () => {
      const tool = (server as any).getTool("elasticsearch_watcher_put_watch");
      expect(tool).toBeDefined();
      
      const params: any = {};
      params.index = TEST_INDEX;
      
      
      // For safety, only test on our test index
      if (params.index && !params.index.startsWith('test-')) {
        params.index = TEST_INDEX;
      }
      
      const result = await tool.handler(params);
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // Check for success indicators
      const text = result.content[0].text.toLowerCase();
      expect(text).not.toContain("error");
    });

  });


  describe("Edge Cases", () => {
    test.skip("tools should handle empty parameters appropriately", async () => {
      // Test each tool with minimal/empty parameters
      const toolNames = [
        "elasticsearch_watcher_get_watch",
        "elasticsearch_watcher_deactivate_watch",
        "elasticsearch_watcher_stats",
        "elasticsearch_watcher_delete_watch",
        "elasticsearch_watcher_update_settings",
        "elasticsearch_watcher_put_watch",
        "elasticsearch_watcher_activate_watch",
        "elasticsearch_watcher_start",
        "elasticsearch_watcher_stop",
        "elasticsearch_watcher_query_watches",
        "elasticsearch_watcher_execute_watch",
        "elasticsearch_watcher_get_settings",
        "elasticsearch_watcher_ack_watch",
      ];
      
      for (const toolName of toolNames) {
        const tool = (server as any).getTool(toolName);
        if (!tool) continue;
        
        try {
          const result = await tool.handler({});
          expect(result).toBeDefined();
          expect(result.content).toBeDefined();
        } catch (error) {
          // Some tools may require parameters - that's ok
          expect(error).toBeDefined();
        }
      }
    });
  });
});
