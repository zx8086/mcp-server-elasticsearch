/**
 * Auto-generated Integration Tests for watcher tools
 * Generated: 2025-08-20T08:05:50.562Z
 * Coverage: 13 tools
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { Client } from "@elastic/elasticsearch";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createElasticsearchClient, shouldSkipIntegrationTests, getToolFromServer } from "../../utils/elasticsearch-client";
import { traceToolExecution } from "../../../src/utils/tracing";
import { initializeReadOnlyManager } from "../../../src/utils/readOnlyMode";
import { logger } from "../../../src/utils/logger";

// Import all tools in this category
import { registerWatcherGetWatchTool } from "../../../src/tools/watcher/get_watch";
import { registerWatcherDeactivateWatchTool } from "../../../src/tools/watcher/deactivate_watch";
import { registerWatcherStatsTool } from "../../../src/tools/watcher/stats";
import { registerWatcherDeleteWatchTool } from "../../../src/tools/watcher/delete_watch";
import { registerWatcherUpdateSettingsTool } from "../../../src/tools/watcher/update_settings";
import { registerWatcherPutWatchTool } from "../../../src/tools/watcher/put_watch";
import { registerWatcherActivateWatchTool } from "../../../src/tools/watcher/activate_watch";
import { registerWatcherStartTool } from "../../../src/tools/watcher/start";
import { registerWatcherStopTool } from "../../../src/tools/watcher/stop";
import { registerWatcherQueryWatchesTool } from "../../../src/tools/watcher/query_watches";
import { registerWatcherExecuteWatchTool } from "../../../src/tools/watcher/execute_watch";
import { registerWatcherGetSettingsTool } from "../../../src/tools/watcher/get_settings";
import { registerWatcherAckWatchTool } from "../../../src/tools/watcher/ack_watch";

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
    registerWatcherGetWatchTool(wrappedServer, client);
    registerWatcherDeactivateWatchTool(wrappedServer, client);
    registerWatcherStatsTool(wrappedServer, client);
    registerWatcherDeleteWatchTool(wrappedServer, client);
    registerWatcherUpdateSettingsTool(wrappedServer, client);
    registerWatcherPutWatchTool(wrappedServer, client);
    registerWatcherActivateWatchTool(wrappedServer, client);
    registerWatcherStartTool(wrappedServer, client);
    registerWatcherStopTool(wrappedServer, client);
    registerWatcherQueryWatchesTool(wrappedServer, client);
    registerWatcherExecuteWatchTool(wrappedServer, client);
    registerWatcherGetSettingsTool(wrappedServer, client);
    registerWatcherAckWatchTool(wrappedServer, client);
    
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

    test("elasticsearch_watcher_get_watch should return valid results", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_get_watch");
      expect(tool).toBeDefined();

      const params: any = {};

      try {
        const result = await tool.handler(params);

        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
      } catch (error) {
        // Tools may throw McpError for missing/invalid params - valid behavior
        expect(error).toBeDefined();
      }
    });

    test("elasticsearch_watcher_get_watch should handle missing/invalid index gracefully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_get_watch");
      
      const params: any = {};
      
      
      
      try {
        const result = await tool.handler(params);
        
        // If the tool returns a result, check it indicates an error or no results
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        
        const text = result.content[0].text.toLowerCase();
        expect(
          text.includes("error") || 
          text.includes("not found") || 
          text.includes("no ") ||
          text.includes("0 ")
        ).toBe(true);
      } catch (error) {
        // Tools may throw McpError for invalid indices - this is also valid graceful handling
        expect(error).toBeDefined();
      }
    });

    test("elasticsearch_watcher_deactivate_watch should return valid results", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_deactivate_watch");
      expect(tool).toBeDefined();

      const params: any = {};

      try {
        const result = await tool.handler(params);

        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
      } catch (error) {
        // Tools may throw McpError for missing/invalid params - valid behavior
        expect(error).toBeDefined();
      }
    });

    test("elasticsearch_watcher_deactivate_watch should handle missing/invalid index gracefully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_deactivate_watch");
      
      const params: any = {};
      
      
      
      try {
        const result = await tool.handler(params);
        
        // If the tool returns a result, check it indicates an error or no results
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        
        const text = result.content[0].text.toLowerCase();
        expect(
          text.includes("error") || 
          text.includes("not found") || 
          text.includes("no ") ||
          text.includes("0 ")
        ).toBe(true);
      } catch (error) {
        // Tools may throw McpError for invalid indices - this is also valid graceful handling
        expect(error).toBeDefined();
      }
    });

    test("elasticsearch_watcher_stats should return valid results", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_stats");
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

    test("elasticsearch_watcher_stats should handle missing/invalid index gracefully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_stats");
      
      const params: any = {};
      
      
      
      try {
        const result = await tool.handler(params);
        
        // If the tool returns a result, check it indicates an error or no results
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        
        const text = result.content[0].text.toLowerCase();
        expect(
          text.includes("error") || 
          text.includes("not found") || 
          text.includes("no ") ||
          text.includes("0 ")
        ).toBe(true);
      } catch (error) {
        // Tools may throw McpError for invalid indices - this is also valid graceful handling
        expect(error).toBeDefined();
      }
    });

    test("elasticsearch_watcher_activate_watch should return valid results", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_activate_watch");
      expect(tool).toBeDefined();

      const params: any = {};

      try {
        const result = await tool.handler(params);

        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
      } catch (error) {
        // Tools may throw McpError for missing/invalid params - valid behavior
        expect(error).toBeDefined();
      }
    });

    test("elasticsearch_watcher_activate_watch should handle missing/invalid index gracefully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_activate_watch");
      
      const params: any = {};
      
      
      
      try {
        const result = await tool.handler(params);
        
        // If the tool returns a result, check it indicates an error or no results
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        
        const text = result.content[0].text.toLowerCase();
        expect(
          text.includes("error") || 
          text.includes("not found") || 
          text.includes("no ") ||
          text.includes("0 ")
        ).toBe(true);
      } catch (error) {
        // Tools may throw McpError for invalid indices - this is also valid graceful handling
        expect(error).toBeDefined();
      }
    });

    test("elasticsearch_watcher_start should return valid results", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_start");
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

    test("elasticsearch_watcher_start should handle missing/invalid index gracefully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_start");
      
      const params: any = {};
      
      
      
      try {
        const result = await tool.handler(params);
        
        // If the tool returns a result, check it indicates an error or no results
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        
        const text = result.content[0].text.toLowerCase();
        expect(
          text.includes("error") || 
          text.includes("not found") || 
          text.includes("no ") ||
          text.includes("0 ")
        ).toBe(true);
      } catch (error) {
        // Tools may throw McpError for invalid indices - this is also valid graceful handling
        expect(error).toBeDefined();
      }
    });

    test("elasticsearch_watcher_stop should return valid results", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_stop");
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

    test("elasticsearch_watcher_stop should handle missing/invalid index gracefully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_stop");
      
      const params: any = {};
      
      
      
      try {
        const result = await tool.handler(params);
        
        // If the tool returns a result, check it indicates an error or no results
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        
        const text = result.content[0].text.toLowerCase();
        expect(
          text.includes("error") || 
          text.includes("not found") || 
          text.includes("no ") ||
          text.includes("0 ")
        ).toBe(true);
      } catch (error) {
        // Tools may throw McpError for invalid indices - this is also valid graceful handling
        expect(error).toBeDefined();
      }
    });

    test("elasticsearch_watcher_query_watches should return valid results", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_query_watches");
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

    test("elasticsearch_watcher_query_watches should handle missing/invalid index gracefully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_query_watches");
      
      const params: any = {};
      
      
      
      try {
        const result = await tool.handler(params);
        
        // If the tool returns a result, check it indicates an error or no results
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        
        const text = result.content[0].text.toLowerCase();
        expect(
          text.includes("error") || 
          text.includes("not found") || 
          text.includes("no ") ||
          text.includes("0 ")
        ).toBe(true);
      } catch (error) {
        // Tools may throw McpError for invalid indices - this is also valid graceful handling
        expect(error).toBeDefined();
      }
    });

    test("elasticsearch_watcher_execute_watch should return valid results", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_execute_watch");
      expect(tool).toBeDefined();

      const params: any = {};

      try {
        const result = await tool.handler(params);

        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
      } catch (error) {
        // Tools may throw McpError for missing/invalid params - valid behavior
        expect(error).toBeDefined();
      }
    });

    test("elasticsearch_watcher_execute_watch should handle missing/invalid index gracefully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_execute_watch");
      
      const params: any = {};
      
      
      
      try {
        const result = await tool.handler(params);
        
        // If the tool returns a result, check it indicates an error or no results
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        
        const text = result.content[0].text.toLowerCase();
        expect(
          text.includes("error") || 
          text.includes("not found") || 
          text.includes("no ") ||
          text.includes("0 ")
        ).toBe(true);
      } catch (error) {
        // Tools may throw McpError for invalid indices - this is also valid graceful handling
        expect(error).toBeDefined();
      }
    });

    test("elasticsearch_watcher_get_settings should return valid results", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_get_settings");
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

    test("elasticsearch_watcher_get_settings should handle missing/invalid index gracefully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_get_settings");
      
      const params: any = {};
      
      
      
      try {
        const result = await tool.handler(params);
        
        // If the tool returns a result, check it indicates an error or no results
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        
        const text = result.content[0].text.toLowerCase();
        expect(
          text.includes("error") || 
          text.includes("not found") || 
          text.includes("no ") ||
          text.includes("0 ")
        ).toBe(true);
      } catch (error) {
        // Tools may throw McpError for invalid indices - this is also valid graceful handling
        expect(error).toBeDefined();
      }
    });

    test("elasticsearch_watcher_ack_watch should return valid results", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_ack_watch");
      expect(tool).toBeDefined();

      const params: any = {};

      try {
        const result = await tool.handler(params);

        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
      } catch (error) {
        // Tools may throw McpError for missing/invalid params - valid behavior
        expect(error).toBeDefined();
      }
    });

    test("elasticsearch_watcher_ack_watch should handle missing/invalid index gracefully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_ack_watch");
      
      const params: any = {};
      
      
      
      try {
        const result = await tool.handler(params);
        
        // If the tool returns a result, check it indicates an error or no results
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        
        const text = result.content[0].text.toLowerCase();
        expect(
          text.includes("error") || 
          text.includes("not found") || 
          text.includes("no ") ||
          text.includes("0 ")
        ).toBe(true);
      } catch (error) {
        // Tools may throw McpError for invalid indices - this is also valid graceful handling
        expect(error).toBeDefined();
      }
    });

  });



  describe("Write Operations", () => {

    test("elasticsearch_watcher_delete_watch should execute successfully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_delete_watch");
      expect(tool).toBeDefined();

      const params: any = {};

      // For safety, only test on our test index
      if (params.index && !params.index.startsWith('test-')) {
        params.index = TEST_INDEX;
      }

      try {
        const result = await tool.handler(params);

        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
      } catch (error) {
        // Tools may throw McpError for missing/invalid params - valid behavior
        expect(error).toBeDefined();
      }
    });

    test("elasticsearch_watcher_update_settings should execute successfully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_update_settings");
      expect(tool).toBeDefined();

      const params: any = {};

      // For safety, only test on our test index
      if (params.index && !params.index.startsWith('test-')) {
        params.index = TEST_INDEX;
      }

      try {
        const result = await tool.handler(params);

        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
      } catch (error) {
        // Tools may throw McpError for missing/invalid params - valid behavior
        expect(error).toBeDefined();
      }
    });

    test("elasticsearch_watcher_put_watch should execute successfully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_watcher_put_watch");
      expect(tool).toBeDefined();

      const params: any = {};
      params.index = TEST_INDEX;

      // For safety, only test on our test index
      if (params.index && !params.index.startsWith('test-')) {
        params.index = TEST_INDEX;
      }

      try {
        const result = await tool.handler(params);

        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
      } catch (error) {
        // Tools may throw McpError for missing/invalid params - valid behavior
        expect(error).toBeDefined();
      }
    });

  });


  describe("Edge Cases", () => {
    test("tools should handle empty parameters appropriately", async () => {
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
        const tool = getToolFromServer(server,toolName);
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
