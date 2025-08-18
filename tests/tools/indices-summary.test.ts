import { describe, expect, test, beforeEach } from "bun:test";
import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { wrapServerWithTracing } from "../../src/utils/universalToolWrapper.js";
import { createMockClient, createMockServer } from "../utils/test-helpers.js";
import { registerIndicesSummaryTool } from "../../src/tools/core/indices_summary.js";

describe("Indices Summary Tool", () => {
  let mockServer: McpServer;
  let mockClient: Client;
  let wrappedServer: McpServer;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    
    // Initialize cat.indices mock
    if (!mockClient.cat) {
      mockClient.cat = {} as any;
    }
    
    wrappedServer = wrapServerWithTracing(mockServer);
  });

  test("should not return undefined in pattern when using defaults", async () => {
    // Mock the Elasticsearch response
    (mockClient.cat.indices as any) = async () => {
      return [
        {
          index: "test-index-1",
          health: "green",
          status: "open",
          "docs.count": "100",
          "store.size": "1mb"
        },
        {
          index: "test-index-2",
          health: "yellow",
          status: "open",
          "docs.count": "200",
          "store.size": "2mb"
        }
      ];
    };

    // Register the tool
    registerIndicesSummaryTool(wrappedServer, mockClient);

    // Get the registered tool
    const tool = (mockServer as any).getTool("elasticsearch_indices_summary");
    
    // Call with empty parameters (should use defaults)
    const result = await tool.handler({ indexPattern: "*" });

    // Check that the result doesn't contain 'undefined' as a string
    const responseStr = JSON.stringify(result);
    expect(responseStr).not.toContain("undefined");
    
    // Check that it contains the default pattern
    expect(responseStr).toContain("Indices Summary for pattern: *");
    
    // Verify it's not an error
    expect(result.isError).toBeFalsy();
  });

  test("should handle MCP metadata wrapper correctly", async () => {
    // Mock the Elasticsearch response
    (mockClient.cat.indices as any) = async () => {
      return [
        {
          index: "logs-2024-01",
          health: "green",
          status: "open",
          "docs.count": "1000",
          "store.size": "10mb"
        }
      ];
    };

    // Register the tool
    registerIndicesSummaryTool(wrappedServer, mockClient);

    // Get the registered tool
    const tool = (mockServer as any).getTool("elasticsearch_indices_summary");
    
    // Call with MCP metadata wrapper
    const result = await tool.handler({
      signal: undefined,
      requestId: "test-request-123",
      sessionId: "session-456",
      indexPattern: "logs-*",
      groupBy: "date"
    });

    // Check that the result contains the correct pattern
    const responseStr = JSON.stringify(result);
    expect(responseStr).toContain("Indices Summary for pattern: logs-*");
    expect(responseStr).not.toContain("undefined");
    
    // Verify it's not an error
    expect(result.isError).toBeFalsy();
  });

  test("should handle empty index response gracefully", async () => {
    // Mock empty response
    (mockClient.cat.indices as any) = async () => {
      return [];
    };

    // Register the tool
    registerIndicesSummaryTool(wrappedServer, mockClient);

    // Get the registered tool
    const tool = (mockServer as any).getTool("elasticsearch_indices_summary");
    
    // Call the tool
    const result = await tool.handler({ indexPattern: "non-existent-*" });

    // Check that it handles empty response properly
    const responseStr = JSON.stringify(result);
    // The tool returns an empty summary when no indices found
    expect(responseStr).toContain("total_indices\\\": 0");
    expect(responseStr).not.toContain("undefined");
    
    // Verify it's not an error
    expect(result.isError).toBeFalsy();
  });

  test("should handle indices with missing fields", async () => {
    // Mock response with missing fields
    (mockClient.cat.indices as any) = async () => {
      return [
        {
          index: "test-index",
          health: "green",
          // Missing docs.count and store.size
        },
        {
          // Missing index name
          health: "yellow",
          "docs.count": "100"
        },
        {
          index: "another-index",
          // Missing health
          "docs.count": null // null value
        }
      ];
    };

    // Register the tool
    registerIndicesSummaryTool(wrappedServer, mockClient);

    // Get the registered tool
    const tool = (mockServer as any).getTool("elasticsearch_indices_summary");
    
    // Call the tool
    const result = await tool.handler({ indexPattern: "*" });

    // Check that it handles missing fields without undefined
    const responseStr = JSON.stringify(result);
    expect(responseStr).not.toContain("undefined");
    
    // Should still have valid structure
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    
    // Verify it's not an error
    expect(result.isError).toBeFalsy();
  });
});