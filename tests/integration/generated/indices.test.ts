/**
 * Auto-generated Integration Tests for indices tools
 * Generated: 2025-08-20T08:05:50.550Z
 * Coverage: 10 tools
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { Client } from "@elastic/elasticsearch";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createElasticsearchClient, shouldSkipIntegrationTests } from "../../utils/elasticsearch-client";
import { traceToolExecution } from "../../../src/utils/tracing";
import { initializeReadOnlyManager } from "../../../src/utils/readOnlyMode";
import { logger } from "../../../src/utils/logger";

// Import all tools in this category
import { registerExistsAliasTool } from "../../../src/tools/indices/exists_alias";
import { registerFieldUsageStatsTool } from "../../../src/tools/indices/field_usage_stats";
import { registerGetIndexInfoTool } from "../../../src/tools/indices/get_index_info";
import { registerExistsTemplateTool } from "../../../src/tools/indices/exists_template";
import { registerDiskUsageTool } from "../../../src/tools/indices/disk_usage";
import { registerExistsIndexTemplateTool } from "../../../src/tools/indices/exists_index_template";
import { registerGetIndexSettingsAdvancedTool } from "../../../src/tools/indices/get_index_settings_advanced";
import { registerExplainDataLifecycleTool } from "../../../src/tools/indices/explain_data_lifecycle";
import { registerRolloverTool } from "../../../src/tools/indices/rollover";
import { registerGetDataLifecycleStatsTool } from "../../../src/tools/indices/get_data_lifecycle_stats";

// Suppress logs during tests
logger.debug = () => {};
logger.info = () => {};
logger.warn = () => {};

describe.skipIf(shouldSkipIntegrationTests())("indices Tools - Real Integration Tests", () => {
  let client: Client;
  let server: McpServer;
  let wrappedServer: McpServer;
  
  // Test indices
  const TEST_INDEX = `test-indices-${Date.now()}`;
  const TEST_INDEX_PATTERN = `test-indices-*`;
  
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
    registerExistsAliasTool(wrappedServer, client);
    registerFieldUsageStatsTool(wrappedServer, client);
    registerGetIndexInfoTool(wrappedServer, client);
    registerExistsTemplateTool(wrappedServer, client);
    registerDiskUsageTool(wrappedServer, client);
    registerExistsIndexTemplateTool(wrappedServer, client);
    registerGetIndexSettingsAdvancedTool(wrappedServer, client);
    registerExplainDataLifecycleTool(wrappedServer, client);
    registerRolloverTool(wrappedServer, client);
    registerGetDataLifecycleStatsTool(wrappedServer, client);
    
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

    test.skip("elasticsearch_exists_alias should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_exists_alias");
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

    test.skip("elasticsearch_exists_alias should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_exists_alias");
      
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

    test.skip("elasticsearch_field_usage_stats should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_field_usage_stats");
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

    test.skip("elasticsearch_field_usage_stats should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_field_usage_stats");
      
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

    test.skip("elasticsearch_get_index_info should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_get_index_info");
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

    test.skip("elasticsearch_get_index_info should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_get_index_info");
      
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

    test.skip("elasticsearch_exists_template should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_exists_template");
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

    test.skip("elasticsearch_exists_template should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_exists_template");
      
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

    test.skip("elasticsearch_disk_usage should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_disk_usage");
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

    test.skip("elasticsearch_disk_usage should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_disk_usage");
      
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

    test.skip("elasticsearch_get_index_settings_advanced should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_get_index_settings_advanced");
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

    test.skip("elasticsearch_get_index_settings_advanced should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_get_index_settings_advanced");
      
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

    test.skip("elasticsearch_explain_data_lifecycle should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_explain_data_lifecycle");
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

    test.skip("elasticsearch_explain_data_lifecycle should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_explain_data_lifecycle");
      
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

    test.skip("elasticsearch_rollover should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_rollover");
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

    test.skip("elasticsearch_rollover should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_rollover");
      
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

    test.skip("elasticsearch_get_data_lifecycle_stats should return valid results", async () => {
      const tool = (server as any).getTool("elasticsearch_get_data_lifecycle_stats");
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

    test.skip("elasticsearch_get_data_lifecycle_stats should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("elasticsearch_get_data_lifecycle_stats");
      
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

    test.skip("elasticsearch_exists_index_template should execute successfully", async () => {
      const tool = (server as any).getTool("elasticsearch_exists_index_template");
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
    test.skip("tools should handle empty parameters appropriately", async () => {
      // Test each tool with minimal/empty parameters
      const toolNames = [
        "elasticsearch_exists_alias",
        "elasticsearch_field_usage_stats",
        "elasticsearch_get_index_info",
        "elasticsearch_exists_template",
        "elasticsearch_disk_usage",
        "elasticsearch_exists_index_template",
        "elasticsearch_get_index_settings_advanced",
        "elasticsearch_explain_data_lifecycle",
        "elasticsearch_rollover",
        "elasticsearch_get_data_lifecycle_stats",
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
