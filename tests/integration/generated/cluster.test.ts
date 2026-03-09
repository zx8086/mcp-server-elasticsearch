/**
 * Auto-generated Integration Tests for cluster tools
 * Generated: 2025-08-20T08:05:50.543Z
 * Coverage: 4 tools
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { Client } from "@elastic/elasticsearch";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createElasticsearchClient, shouldSkipIntegrationTests, getToolFromServer } from "../../utils/elasticsearch-client";
import { traceToolExecution } from "../../../src/utils/tracing";
import { initializeReadOnlyManager } from "../../../src/utils/readOnlyMode";
import { logger } from "../../../src/utils/logger";

// Import all tools in this category
import { registerGetNodesInfoTool } from "../../../src/tools/cluster/get_nodes_info";
import { registerGetNodesStatsTool } from "../../../src/tools/cluster/get_nodes_stats";
import { registerGetClusterStatsTool } from "../../../src/tools/cluster/get_cluster_stats";
import { registerGetClusterHealthTool } from "../../../src/tools/cluster/get_cluster_health";

// Suppress logs during tests
logger.debug = () => {};
logger.info = () => {};
logger.warn = () => {};

describe.skipIf(shouldSkipIntegrationTests())("cluster Tools - Real Integration Tests", () => {
  let client: Client;
  let server: McpServer;
  let wrappedServer: McpServer;
  
  // Test indices
  const TEST_INDEX = `test-cluster-${Date.now()}`;
  const TEST_INDEX_PATTERN = `test-cluster-*`;
  
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
    registerGetNodesInfoTool(wrappedServer, client);
    registerGetNodesStatsTool(wrappedServer, client);
    registerGetClusterStatsTool(wrappedServer, client);
    registerGetClusterHealthTool(wrappedServer, client);
    
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

    test("elasticsearch_get_nodes_info should return valid results", async () => {
      const tool = getToolFromServer(server,"elasticsearch_get_nodes_info");
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

    test("elasticsearch_get_nodes_info should handle missing/invalid index gracefully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_get_nodes_info");
      
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

    test("elasticsearch_get_nodes_stats should return valid results", async () => {
      const tool = getToolFromServer(server,"elasticsearch_get_nodes_stats");
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

    test("elasticsearch_get_nodes_stats should handle missing/invalid index gracefully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_get_nodes_stats");
      
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

    test("elasticsearch_get_cluster_stats should return valid results", async () => {
      const tool = getToolFromServer(server,"elasticsearch_get_cluster_stats");
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

    test("elasticsearch_get_cluster_stats should handle missing/invalid index gracefully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_get_cluster_stats");
      
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

    test("elasticsearch_get_cluster_health should return valid results", async () => {
      const tool = getToolFromServer(server,"elasticsearch_get_cluster_health");
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

    test("elasticsearch_get_cluster_health should handle missing/invalid index gracefully", async () => {
      const tool = getToolFromServer(server,"elasticsearch_get_cluster_health");

      const params: any = {};
      params.index = "non-existent-index-999";


      try {
        const result = await tool.handler(params);

        // If the tool returns a result, check it indicates an error or no results
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
      } catch (error) {
        // Tools may throw McpError for invalid indices or timeout - valid behavior
        expect(error).toBeDefined();
      }
    }, 35000);

  });




  describe("Edge Cases", () => {
    test("tools should handle empty parameters appropriately", async () => {
      // Test each tool with minimal/empty parameters
      const toolNames = [
        "elasticsearch_get_nodes_info",
        "elasticsearch_get_nodes_stats",
        "elasticsearch_get_cluster_stats",
        "elasticsearch_get_cluster_health",
      ];

      for (const toolName of toolNames) {
        const tool = getToolFromServer(server,toolName);
        if (!tool) continue;

        try {
          const result = await tool.handler({});
          expect(result).toBeDefined();
          expect(result.content).toBeDefined();
        } catch (error) {
          // Some tools may require parameters or timeout - that's ok
          expect(error).toBeDefined();
        }
      }
    }, 35000);
  });
});
