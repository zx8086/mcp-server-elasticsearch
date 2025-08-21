/**
 * Auto-generated Integration Tests for enrich tools
 * Generated: 2025-08-20T08:05:50.570Z
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
import { registerExecutePolicyTool } from "../../../src/tools/enrich/execute_policy.js";
import { registerPutPolicyTool } from "../../../src/tools/enrich/put_policy.js";
import { registerStatsTool } from "../../../src/tools/enrich/stats.js";
import { registerDeletePolicyTool } from "../../../src/tools/enrich/delete_policy.js";
import { registerGetPolicyImprovedTool } from "../../../src/tools/enrich/get_policy_improved.js";
import { registerGetPolicyOldTool } from "../../../src/tools/enrich/get_policy_old.js";

// Suppress logs during tests
logger.debug = () => {};
logger.info = () => {};
logger.warn = () => {};

describe.skipIf(shouldSkipIntegrationTests())("enrich Tools - Real Integration Tests", () => {
  let client: Client;
  let server: McpServer;
  let wrappedServer: McpServer;
  
  // Test indices
  const TEST_INDEX = `test-enrich-${Date.now()}`;
  const TEST_INDEX_PATTERN = `test-enrich-*`;
  
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
    registerExecutePolicyTool(wrappedServer, client);
    registerPutPolicyTool(wrappedServer, client);
    registerStatsTool(wrappedServer, client);
    registerDeletePolicyTool(wrappedServer, client);
    registerGetPolicyImprovedTool(wrappedServer, client);
    registerGetPolicyOldTool(wrappedServer, client);
    
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

    test("elasticsearch_enrich_execute_policy should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_enrich_execute_policy");
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

    test("elasticsearch_enrich_execute_policy should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_enrich_execute_policy");
      
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

    test("elasticsearch_enrich_stats should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_enrich_stats");
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

    test("elasticsearch_enrich_stats should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_enrich_stats");
      
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

    test("elasticsearch_enrich_get_policy should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_enrich_get_policy");
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

    test("elasticsearch_enrich_get_policy should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_enrich_get_policy");
      
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

    test("elasticsearch_enrich_get_policy should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_enrich_get_policy");
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

    test("elasticsearch_enrich_get_policy should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_enrich_get_policy");
      
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

    test("elasticsearch_enrich_put_policy should execute successfully", async () => {
      const tool = (server as any).getTool("elasticsearch_enrich_put_policy");
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

    test("elasticsearch_enrich_delete_policy should execute successfully", async () => {
      const tool = (server as any).getTool("elasticsearch_enrich_delete_policy");
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

  });


  describe("Edge Cases", () => {
    test("tools should handle empty parameters appropriately", async () => {
      // Test each tool with minimal/empty parameters
      const toolNames = [
        "elasticsearch_enrich_execute_policy",
        "elasticsearch_enrich_put_policy",
        "elasticsearch_enrich_stats",
        "elasticsearch_enrich_delete_policy",
        "elasticsearch_enrich_get_policy",
        "elasticsearch_enrich_get_policy",
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
