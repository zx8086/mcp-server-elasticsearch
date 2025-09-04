/**
 * Auto-generated Integration Tests for search tools
 * Generated: 2025-08-20T08:05:50.568Z
 * Coverage: 6 tools
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { Client } from "@elastic/elasticsearch";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createElasticsearchClient, shouldSkipIntegrationTests } from "../../utils/elasticsearch-client.js";
import { wrapServerWithTracing } from "../../../src/utils/universalToolWrapper.js";
import { initializeReadOnlyManager } from "../../../src/utils/readOnlyMode.js";
import { logger } from "../../../src/utils/logger.js";

// Import all tools in this category
import { registerClearScrollTool } from "../../../src/tools/search/clear_scroll.js";
import { registerScrollSearchTool } from "../../../src/tools/search/scroll_search.js";
import { registerExecuteSqlQueryTool } from "../../../src/tools/search/execute_sql_query.js";
import { registerCountDocumentsTool } from "../../../src/tools/search/count_documents.js";
import { registerUpdateByQueryTool } from "../../../src/tools/search/update_by_query.js";
import { registerMultiSearchTool } from "../../../src/tools/search/multi_search.js";

// Suppress logs during tests
logger.debug = () => {};
logger.info = () => {};
logger.warn = () => {};

describe.skipIf(shouldSkipIntegrationTests())("search Tools - Real Integration Tests", () => {
  let client: Client;
  let server: McpServer;
  let wrappedServer: McpServer;
  
  // Test indices
  const TEST_INDEX = `test-search-${Date.now()}`;
  const TEST_INDEX_PATTERN = `test-search-*`;
  
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
    registerClearScrollTool(wrappedServer, client);
    registerScrollSearchTool(wrappedServer, client);
    registerExecuteSqlQueryTool(wrappedServer, client);
    registerCountDocumentsTool(wrappedServer, client);
    registerUpdateByQueryTool(wrappedServer, client);
    registerMultiSearchTool(wrappedServer, client);
    
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

    test("elasticsearch_clear_scroll should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_clear_scroll");
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

    test("elasticsearch_clear_scroll should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_clear_scroll");
      
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

    test("elasticsearch_scroll_search should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_scroll_search");
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

    test("elasticsearch_scroll_search should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_scroll_search");
      
      const params: any = {};
      params.index = "non-existent-index-999";
      
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

    test("elasticsearch_execute_sql_query should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_execute_sql_query");
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

    test("elasticsearch_execute_sql_query should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_execute_sql_query");
      
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

    test("elasticsearch_count_documents should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_count_documents");
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

    test("elasticsearch_count_documents should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_count_documents");
      
      const params: any = {};
      params.index = "non-existent-index-999";
      
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

    test("elasticsearch_multi_search should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_multi_search");
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

    test("elasticsearch_multi_search should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_multi_search");
      
      const params: any = {};
      params.index = "non-existent-index-999";
      
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

    test("elasticsearch_update_by_query should execute successfully", async () => {
      const tool = (server as any).getTool("elasticsearch_update_by_query");
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
        "elasticsearch_clear_scroll",
        "elasticsearch_scroll_search",
        "elasticsearch_execute_sql_query",
        "elasticsearch_count_documents",
        "elasticsearch_update_by_query",
        "elasticsearch_multi_search",
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
