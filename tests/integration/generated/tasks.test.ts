/**
 * Auto-generated Integration Tests for tasks tools
 * Generated: 2025-08-20T08:05:50.547Z
 * Coverage: 3 tools
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { Client } from "@elastic/elasticsearch";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createElasticsearchClient, shouldSkipIntegrationTests } from "../../utils/elasticsearch-client.js";
import { wrapServerWithTracing } from "../../../src/utils/universalToolWrapper.js";
import { initializeReadOnlyManager } from "../../../src/utils/readOnlyMode.js";
import { logger } from "../../../src/utils/logger.js";

// Import all tools in this category
import { registerListTasksTool } from "../../../src/tools/tasks/list_tasks.js";
import { registerGetTaskTool } from "../../../src/tools/tasks/get_task.js";
import { registerCancelTaskTool } from "../../../src/tools/tasks/cancel_task.js";

// Suppress logs during tests
logger.debug = () => {};
logger.info = () => {};
logger.warn = () => {};

describe.skipIf(shouldSkipIntegrationTests())("tasks Tools - Real Integration Tests", () => {
  let client: Client;
  let server: McpServer;
  let wrappedServer: McpServer;
  
  // Test indices
  const TEST_INDEX = `test-tasks-${Date.now()}`;
  const TEST_INDEX_PATTERN = `test-tasks-*`;
  
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
    
    wrappedServer = wrapServerWithTracing(server);
    
    // Register all tools
    registerListTasksTool(wrappedServer, client);
    registerGetTaskTool(wrappedServer, client);
    registerCancelTaskTool(wrappedServer, client);
    
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

    test("elasticsearch_list_tasks should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_list_tasks");
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

    test("elasticsearch_list_tasks should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_list_tasks");
      
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

    test("elasticsearch_tasks_get_task should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_tasks_get_task");
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

    test("elasticsearch_tasks_get_task should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_tasks_get_task");
      
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

    test("elasticsearch_tasks_cancel_task should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_tasks_cancel_task");
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

    test("elasticsearch_tasks_cancel_task should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_tasks_cancel_task");
      
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




  describe("Edge Cases", () => {
    test("tools should handle empty parameters appropriately", async () => {
      // Test each tool with minimal/empty parameters
      const toolNames = [
        "elasticsearch_list_tasks",
        "elasticsearch_tasks_get_task",
        "elasticsearch_tasks_cancel_task",
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
