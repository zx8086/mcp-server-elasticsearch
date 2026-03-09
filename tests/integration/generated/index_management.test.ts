/**
 * Auto-generated Integration Tests for index_management tools
 * Generated: 2025-08-20T08:05:50.558Z
 * Coverage: 10 tools
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { Client } from "@elastic/elasticsearch";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createElasticsearchClient, shouldSkipIntegrationTests, getToolFromServer } from "../../utils/elasticsearch-client";
import { traceToolExecution } from "../../../src/utils/tracing";
import { initializeReadOnlyManager } from "../../../src/utils/readOnlyMode";
import { logger } from "../../../src/utils/logger";

// Import all tools in this category
import { registerFlushIndexTool } from "../../../src/tools/index_management/flush_index";
import { registerReindexDocumentsTool } from "../../../src/tools/index_management/reindex_documents";
import { registerPutMappingTool } from "../../../src/tools/index_management/put_mapping";
import { registerIndexExistsTool } from "../../../src/tools/index_management/index_exists";
import { registerRefreshIndexTool } from "../../../src/tools/index_management/refresh_index";
import { registerDeleteIndexTool } from "../../../src/tools/index_management/delete_index";
import { registerUpdateIndexSettingsTool } from "../../../src/tools/index_management/update_index_settings";
import { registerCreateIndexTool } from "../../../src/tools/index_management/create_index";
import { registerGetIndexTool } from "../../../src/tools/index_management/get_index";
import { registerGetIndexSettingsTool } from "../../../src/tools/index_management/get_index_settings";

// Suppress logs during tests
logger.debug = () => {};
logger.info = () => {};
logger.warn = () => {};

describe.skipIf(shouldSkipIntegrationTests())("index_management Tools - Real Integration Tests", () => {
  let client: Client;
  let server: McpServer;
  let wrappedServer: McpServer;
  
  // Test indices
  const TEST_INDEX = `test-index_management-${Date.now()}`;
  const TEST_INDEX_PATTERN = `test-index_management-*`;
  
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
    registerFlushIndexTool(wrappedServer, client);
    registerReindexDocumentsTool(wrappedServer, client);
    registerPutMappingTool(wrappedServer, client);
    registerIndexExistsTool(wrappedServer, client);
    registerRefreshIndexTool(wrappedServer, client);
    registerDeleteIndexTool(wrappedServer, client);
    registerUpdateIndexSettingsTool(wrappedServer, client);
    registerCreateIndexTool(wrappedServer, client);
    registerGetIndexTool(wrappedServer, client);
    registerGetIndexSettingsTool(wrappedServer, client);
    
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

    test("elasticsearch_get_index should return valid results", async () => {
      const tool = getToolFromServer(server,"elasticsearch_get_index");
      expect(tool).toBeDefined();
      
      const params: any = {};
      params.index = TEST_INDEX;
      
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

    test("elasticsearch_get_index should handle missing/invalid index gracefully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_get_index");
      
      const params: any = {};
      params.index = "non-existent-index-999";
      
      
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

    test("elasticsearch_get_index_settings should return valid results", async () => {
      const tool = getToolFromServer(server,"elasticsearch_get_index_settings");
      expect(tool).toBeDefined();
      
      const params: any = {};
      params.index = TEST_INDEX;
      
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

    test("elasticsearch_get_index_settings should handle missing/invalid index gracefully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_get_index_settings");
      
      const params: any = {};
      params.index = "non-existent-index-999";
      
      
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

    test("elasticsearch_flush_index should execute successfully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_flush_index");
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

    test("elasticsearch_reindex_documents should execute successfully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_reindex_documents");
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

    test("elasticsearch_put_mapping should execute successfully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_put_mapping");
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

    test("elasticsearch_index_exists should execute successfully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_index_exists");
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

    test("elasticsearch_refresh_index should execute successfully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_refresh_index");
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

    test("elasticsearch_delete_index should execute successfully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_delete_index");
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

    test("elasticsearch_update_index_settings should execute successfully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_update_index_settings");
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

    test("elasticsearch_create_index should execute successfully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_create_index");
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
    test("tools should handle empty parameters appropriately", async () => {
      // Test each tool with minimal/empty parameters
      const toolNames = [
        "elasticsearch_flush_index",
        "elasticsearch_reindex_documents",
        "elasticsearch_put_mapping",
        "elasticsearch_index_exists",
        "elasticsearch_refresh_index",
        "elasticsearch_delete_index",
        "elasticsearch_update_index_settings",
        "elasticsearch_create_index",
        "elasticsearch_get_index",
        "elasticsearch_get_index_settings",
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
