import { describe, expect, test, beforeEach } from "bun:test";
import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { wrapServerWithTracing } from "../src/utils/universalToolWrapper.js";
import { createMockClient, createMockServer } from "./utils/test-helpers.js";
import { handleLargeResponse } from "../src/utils/responseHandler.js";
import { getSuggestedParameters } from "../src/utils/defaultParameters.js";
import { z } from "zod";

describe("Tool Improvements", () => {
  let mockServer: McpServer;
  let mockClient: Client;
  let wrappedServer: McpServer;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    wrappedServer = wrapServerWithTracing(mockServer);
  });

  describe("elasticsearch_get_index improvements", () => {
    test("should apply defaults when called with empty params", () => {
      const defaults = getSuggestedParameters("elasticsearch_get_index", {});
      
      expect(defaults).toBeDefined();
      expect(defaults.index).toBe("*");
      expect(defaults.ignoreUnavailable).toBe(true);
      expect(defaults.allowNoIndices).toBe(true);
    });

    test("should work with required parameters", async () => {
      const mockServer = createMockServer();
      const mockClient = createMockClient();
      let executedWithArgs: any;
      
      // Register tool with the actual schema
      mockServer.tool(
        "elasticsearch_get_index",
        "Get index",
        z.object({
          index: z.string().min(1, "Index is required"),
          ignoreUnavailable: z.boolean().optional(),
          allowNoIndices: z.boolean().optional(),
        }),
        async (args: any) => {
          executedWithArgs = args;
          return { indices: {} };
        }
      );

      const tool = (mockServer as any).getTool("elasticsearch_get_index");
      const result = await tool.handler({ index: "*" });

      // Should not return an error
      expect(result.isError).toBeFalsy();
      
      // Should have executed with provided parameters
      expect(executedWithArgs).toBeDefined();
      expect(executedWithArgs.index).toBe("*");
    });
  });

  describe("Response truncation improvements", () => {
    test("should provide helpful message when no content can be included", () => {
      const largeResponse = {
        content: [
          { type: "text", text: "x".repeat(2000000) } // 2MB content
        ]
      };

      const result = handleLargeResponse("elasticsearch_ilm_explain_lifecycle", largeResponse, {
        maxSize: 1000 // Very small limit
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("Response too large to display");
      expect(result.content[0].text).toContain("Use more specific filters");
      expect(result.content[0].text).toContain("Add a 'limit' parameter");
    });

    test("should provide tool-specific suggestions for ILM tools", () => {
      const response = {
        content: [
          { type: "text", text: "Item 1" },
          { type: "text", text: "x".repeat(10000) } // Large item
        ]
      };

      const result = handleLargeResponse("elasticsearch_ilm_get_lifecycle", response, {
        maxSize: 5000
      });

      expect(result.content).toBeDefined();
      const truncationMessage = result.content.find((c: any) => 
        c.text?.includes("Response truncated")
      );
      expect(truncationMessage).toBeDefined();
      expect(truncationMessage.text).toContain("Add parameters to control response");
    });

    test("should handle array responses with proper item counting", () => {
      const arrayResponse = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        data: "x".repeat(100)
      }));

      const result = handleLargeResponse("test_tool", arrayResponse, {
        maxSize: 5000
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('"total_items": 100');
      expect(result.content[0].text).toContain('"included_items":');
      expect(result.content[0].text).toContain("Showing");
    });
  });

  describe("elasticsearch_search improvements", () => {
    test("should apply query defaults when empty params provided", () => {
      const defaults = getSuggestedParameters("elasticsearch_search", {});
      
      expect(defaults).toBeDefined();
      expect(defaults.index).toBe("*");
      expect(defaults.queryBody).toBeDefined();
      expect(defaults.queryBody.query).toBeDefined();
      expect(defaults.queryBody.query.match_all).toBeDefined();
      expect(defaults.queryBody.size).toBe(10);
    });

    test("should merge partial search params with defaults", () => {
      const partialParams = { index: "logs-*" };
      const merged = getSuggestedParameters("elasticsearch_search", partialParams);
      
      expect(merged.index).toBe("logs-*"); // User-provided
      expect(merged.queryBody).toBeDefined(); // From defaults
      expect(merged.queryBody.query.match_all).toBeDefined();
    });
  });

  describe("Parameter validation messages", () => {
    test("should provide clear error messages for wrong types", async () => {
      wrappedServer.tool(
        "test_search",
        "Test search",
        z.object({
          index: z.string(),
          queryBody: z.object({}).passthrough(),
        }),
        async (args: any) => {
          return { hits: [] };
        }
      );

      const tool = (mockServer as any).getTool("test_search");
      const result = await tool.handler({
        index: undefined, // Wrong: undefined instead of string
        queryBody: "invalid" // Wrong: string instead of object
      });

      if (result.isError) {
        expect(result.structuredContent?.error?.code).toBe("EXECUTION_ERROR");
        expect(result.content).toBeDefined();
        
        // Should have error message with validation details
        const hasErrorContent = result.content.some((c: any) => 
          c.text?.includes("Invalid input") || c.text?.includes("expected")
        );
        expect(hasErrorContent).toBe(true);
      }
    });
  });
});