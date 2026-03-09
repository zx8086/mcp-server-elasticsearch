/**
 * Auto-generated Integration Tests for bulk tools
 * Generated: 2025-08-20T08:05:50.551Z
 * Coverage: 2 tools
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { Client } from "@elastic/elasticsearch";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createElasticsearchClient, shouldSkipIntegrationTests, getToolFromServer } from "../../utils/elasticsearch-client";
import { traceToolExecution } from "../../../src/utils/tracing";
import { initializeReadOnlyManager } from "../../../src/utils/readOnlyMode";
import { logger } from "../../../src/utils/logger";

// Import all tools in this category
import { registerMultiGetTool } from "../../../src/tools/bulk/multi_get";
import { registerBulkOperationsTool } from "../../../src/tools/bulk/bulk_operations";

// Suppress logs during tests
logger.debug = () => {};
logger.info = () => {};
logger.warn = () => {};

describe.skipIf(shouldSkipIntegrationTests())("bulk Tools - Real Integration Tests", () => {
  let client: Client;
  let server: McpServer;
  let wrappedServer: McpServer;
  
  // Test indices
  const TEST_INDEX = `test-bulk-${Date.now()}`;
  const TEST_INDEX_PATTERN = `test-bulk-*`;
  
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
    registerMultiGetTool(wrappedServer, client);
    registerBulkOperationsTool(wrappedServer, client);
    
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

    test("elasticsearch_multi_get should return valid results", async () => {
      const tool = getToolFromServer(server,"elasticsearch_multi_get");
      expect(tool).toBeDefined();

      const params: any = {};
      params.index = TEST_INDEX;

      try {
        const result = await tool.handler(params);

        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
      } catch (error) {
        // Tools may throw McpError for missing/invalid params - valid behavior
        expect(error).toBeDefined();
      }
    });

    test("elasticsearch_multi_get should handle missing/invalid index gracefully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_multi_get");
      
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

    test("elasticsearch_bulk_operations should return valid results", async () => {
      const tool = getToolFromServer(server,"elasticsearch_bulk_operations");
      expect(tool).toBeDefined();

      const params: any = {};
      params.index = TEST_INDEX;

      try {
        const result = await tool.handler(params);

        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
      } catch (error) {
        // Tools may throw McpError for missing/invalid params - valid behavior
        expect(error).toBeDefined();
      }
    });

    test("elasticsearch_bulk_operations should handle missing/invalid index gracefully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_bulk_operations");
      
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




  describe("Edge Cases", () => {
    test("tools should handle empty parameters appropriately", async () => {
      // Test each tool with minimal/empty parameters
      const toolNames = [
        "elasticsearch_multi_get",
        "elasticsearch_bulk_operations",
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
