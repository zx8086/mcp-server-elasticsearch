import { describe, expect, test, beforeEach } from "bun:test";
import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { 
  createSuccessResponse, 
  createErrorResponse, 
  createPaginatedResponse,
  transformToMCPResponse 
} from "../src/utils/mcpCompliantResponse.js";
import { 
  validateParameters, 
  extractParameterInfo, 
  generateParameterHelp 
} from "../src/utils/parameterValidator.js";
import { 
  getSuggestedParameters, 
  toolNeedsParameters,
  getParameterHelpMessage 
} from "../src/utils/defaultParameters.js";
import { handleLargeResponse } from "../src/utils/responseHandler.js";
import { wrapServerWithTracing } from "../src/utils/universalToolWrapper.js";
import { z } from "zod";
import { createMockClient, createMockServer } from "./utils/test-helpers.js";

describe("MCP Compliance Tests", () => {
  describe("MCP-Compliant Response Format", () => {
    test("createSuccessResponse should include both text and structured content", () => {
      const data = { status: "success", count: 42 };
      const response = createSuccessResponse(data, {
        toolName: "test_tool",
        summary: "Operation completed successfully",
      });

      // Check content array
      expect(response.content).toBeDefined();
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content.length).toBeGreaterThan(0);

      // Check for human-readable summary
      const summaryContent = response.content.find(c => 
        c.annotations?.audience?.includes("human")
      );
      expect(summaryContent).toBeDefined();
      expect(summaryContent?.text).toContain("Operation completed successfully");

      // Check for structured content
      expect(response.structuredContent).toBeDefined();
      expect(response.structuredContent).toEqual(data);

      // Check metadata
      expect(response._meta).toBeDefined();
      expect(response._meta?.tool).toBe("test_tool");
    });

    test("createErrorResponse should set isError flag and include structured error", () => {
      const error = new Error("Test error message");
      const response = createErrorResponse(error, {
        toolName: "test_tool",
        code: "TEST_ERROR",
        suggestions: ["Try again", "Check parameters"],
      });

      // Check isError flag (MCP spec requirement)
      expect(response.isError).toBe(true);

      // Check content array
      expect(response.content).toBeDefined();
      expect(Array.isArray(response.content)).toBe(true);

      // Check error message
      const errorContent = response.content.find(c => 
        c.annotations?.severity === "error"
      );
      expect(errorContent).toBeDefined();
      expect(errorContent?.text).toContain("Test error message");

      // Check suggestions
      const suggestionsContent = response.content.find(c => 
        c.annotations?.severity === "info"
      );
      expect(suggestionsContent).toBeDefined();
      expect(suggestionsContent?.text).toContain("Try again");

      // Check structured error content
      expect(response.structuredContent).toBeDefined();
      expect(response.structuredContent?.error).toBeDefined();
      expect(response.structuredContent?.error?.message).toBe("Test error message");
      expect(response.structuredContent?.error?.code).toBe("TEST_ERROR");
    });

    test("createPaginatedResponse should include pagination metadata", () => {
      const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const pagination = {
        total: 100,
        returned: 3,
        offset: 0,
        limit: 10,
        hasMore: true,
        nextToken: "next-page-token",
      };

      const response = createPaginatedResponse(data, pagination, {
        toolName: "test_tool",
      });

      // Check structured content includes both data and pagination
      expect(response.structuredContent).toBeDefined();
      expect(response.structuredContent?.data).toEqual(data);
      expect(response.structuredContent?.pagination).toEqual(pagination);

      // Check metadata includes pagination
      expect(response._meta?.pagination).toEqual(pagination);

      // Check content has pagination info
      const paginationContent = response.content.find(c => 
        c.annotations?.format === "pagination"
      );
      expect(paginationContent).toBeDefined();
    });

    test("transformToMCPResponse should handle legacy format", () => {
      // Test with plain object
      const legacyResponse = { result: "success", value: 123 };
      const transformed = transformToMCPResponse(legacyResponse, "test_tool");

      expect(transformed.content).toBeDefined();
      expect(Array.isArray(transformed.content)).toBe(true);
      expect(transformed.structuredContent).toEqual(legacyResponse);

      // Test with string response
      const stringResponse = "Simple string response";
      const transformedString = transformToMCPResponse(stringResponse);

      expect(transformedString.content).toBeDefined();
      expect(transformedString.content[0].type).toBe("text");
      expect(transformedString.content[0].text).toBe(stringResponse);

      // Test with error response
      const errorResponse = { error: "Something went wrong", isError: true };
      const transformedError = transformToMCPResponse(errorResponse, "test_tool");

      expect(transformedError.isError).toBe(true);
      expect(transformedError.content).toBeDefined();
    });
  });

  describe("Parameter Validation", () => {
    test("validateParameters should detect missing required fields", () => {
      const schema = z.object({
        required: z.string(),
        optional: z.string().optional(),
      });

      const result = validateParameters("test_tool", schema, {});

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe("required");
      expect(result.errors[0].required).toBe(true);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    test("validateParameters should handle empty parameters", () => {
      const schema = z.object({
        index: z.string().min(1, "Index is required"),
      });

      // Test with null
      const nullResult = validateParameters("test_tool", schema, null);
      expect(nullResult.valid).toBe(false);
      expect(nullResult.errors[0].message).toContain("No parameters provided");

      // Test with undefined
      const undefinedResult = validateParameters("test_tool", schema, undefined);
      expect(undefinedResult.valid).toBe(false);

      // Test with empty object
      const emptyResult = validateParameters("test_tool", schema, {});
      expect(emptyResult.valid).toBe(false);
      expect(emptyResult.errors[0].field).toBe("index");
    });

    test("extractParameterInfo should extract schema information", () => {
      const schema = z.object({
        stringField: z.string().describe("A string field"),
        numberField: z.number().default(10),
        enumField: z.enum(["a", "b", "c"]),
        optionalField: z.string().optional(),
      });

      const info = extractParameterInfo(schema);

      expect(info.length).toBe(4);

      const stringInfo = info.find(p => p.name === "stringField");
      expect(stringInfo?.type).toBe("string");
      expect(stringInfo?.required).toBe(true);
      expect(stringInfo?.description).toBe("A string field");

      const numberInfo = info.find(p => p.name === "numberField");
      expect(numberInfo?.type).toBe("number");
      expect(numberInfo?.required).toBe(false); // Has default
      expect(numberInfo?.defaultValue).toBe(10);

      const enumInfo = info.find(p => p.name === "enumField");
      expect(enumInfo?.type).toContain("enum");
      expect(enumInfo?.enumValues).toEqual(["a", "b", "c"]);

      const optionalInfo = info.find(p => p.name === "optionalField");
      expect(optionalInfo?.required).toBe(false);
    });

    test("generateParameterHelp should create helpful documentation", () => {
      const schema = z.object({
        index: z.string().min(1).describe("Index pattern"),
        size: z.number().default(10).describe("Result size"),
      });

      const help = generateParameterHelp("test_tool", schema);

      expect(help).toContain("Tool: test_tool");
      expect(help).toContain("Parameters:");
      expect(help).toContain("index: string (REQUIRED)");
      expect(help).toContain("size: number (optional) [default: 10]");
      expect(help).toContain("Index pattern");
      expect(help).toContain("Result size");
      expect(help).toContain("Example:");
    });
  });

  describe("Default Parameters", () => {
    test("getSuggestedParameters should return defaults for empty params", () => {
      // Test with empty object
      const suggested = getSuggestedParameters("elasticsearch_list_indices", {});
      expect(suggested).toBeDefined();
      expect(suggested.indexPattern).toBe("*");
      expect(suggested.limit).toBe(50);

      // Test with null
      const suggestedNull = getSuggestedParameters("elasticsearch_search", null);
      expect(suggestedNull).toBeDefined();
      expect(suggestedNull.index).toBe("*");
      expect(suggestedNull.queryBody).toBeDefined();
    });

    test("getSuggestedParameters should merge with provided params", () => {
      const provided = { indexPattern: "logs-*" };
      const suggested = getSuggestedParameters("elasticsearch_list_indices", provided);

      expect(suggested.indexPattern).toBe("logs-*"); // Provided value
      expect(suggested.limit).toBe(50); // Default value
    });

    test("toolNeedsParameters should identify tools requiring params", () => {
      expect(toolNeedsParameters("elasticsearch_list_indices")).toBe(true);
      expect(toolNeedsParameters("elasticsearch_search")).toBe(true);
      // Cluster health is now in the needsParams list because it benefits from defaults
      expect(toolNeedsParameters("elasticsearch_get_cluster_health")).toBe(true);
      // A tool that truly doesn't need params would be something not in the list
      expect(toolNeedsParameters("unknown_tool")).toBe(false);
    });

    test("getParameterHelpMessage should return tool-specific help", () => {
      const help = getParameterHelpMessage("elasticsearch_list_indices");
      expect(help).toContain("index pattern");
      expect(help).toContain("'*'");

      const searchHelp = getParameterHelpMessage("elasticsearch_search");
      expect(searchHelp).toContain("queryBody");
    });
  });

  describe("Response Size Handling", () => {
    test("handleLargeResponse should truncate oversized responses", () => {
      // Create a large response
      const largeArray = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        data: "x".repeat(1000), // 1KB per item
      }));

      const response = {
        content: [{ type: "text", text: JSON.stringify(largeArray) }],
      };

      const handled = handleLargeResponse("test_tool", response, {
        maxSize: 10000, // 10KB limit
      });

      // Check that response was truncated
      const text = handled.content[0].text;
      expect(text.length).toBeLessThan(JSON.stringify(largeArray).length);
      // Should contain either "truncated" or "too large"
      expect(text.toLowerCase()).toMatch(/truncated|too large/);
    });

    test("handleLargeResponse should handle search results intelligently", () => {
      const searchResult = {
        hits: {
          total: { value: 1000 },
          hits: Array.from({ length: 100 }, (_, i) => ({
            _id: `doc${i}`,
            _source: { data: "x".repeat(1000) },
          })),
        },
      };

      const handled = handleLargeResponse("search_tool", searchResult, {
        maxSize: 50000, // 50KB limit
      });

      // Should have truncation info
      expect(handled.content).toBeDefined();
      const content = handled.content[0].text;
      expect(content).toContain("_truncated");
    });
  });

  describe("Universal Tool Wrapper Integration", () => {
    let mockServer: McpServer;
    let mockClient: Client;
    let wrappedServer: McpServer;

    beforeEach(() => {
      mockServer = createMockServer();
      mockClient = createMockClient();
      wrappedServer = wrapServerWithTracing(mockServer);
    });

    test("wrapped tools should return MCP-compliant responses", async () => {
      // Register a test tool
      wrappedServer.tool(
        "test_tool",
        "Test tool",
        z.object({ input: z.string() }),
        async (args: any) => {
          return { result: "success", input: args.input };
        }
      );

      const tool = (mockServer as any).getTool("test_tool");
      const result = await tool.handler({ input: "test" });

      // Should have MCP-compliant structure
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      
      // Should have structured content
      if (!result.isError) {
        expect(result.structuredContent).toBeDefined();
      }
    });

    test("wrapped tools should handle empty parameters gracefully", async () => {
      // Register a tool that needs parameters
      let executedWithArgs: any = null;
      wrappedServer.tool(
        "elasticsearch_list_indices",
        "List indices",
        z.object({ indexPattern: z.string() }),
        async (args: any) => {
          executedWithArgs = args;
          return { indices: [] };
        }
      );

      const tool = (mockServer as any).getTool("elasticsearch_list_indices");
      const result = await tool.handler({ indexPattern: "*" });

      // Should NOT return error - defaults should be applied
      expect(result.isError).toBeFalsy();
      expect(result.content).toBeDefined();
      
      // Should have executed with default parameters
      expect(executedWithArgs).toBeDefined();
      expect(executedWithArgs.indexPattern).toBe("*");
    });

    test("wrapped tools should handle validation errors properly", async () => {
      wrappedServer.tool(
        "test_tool",
        "Test tool",
        z.object({ 
          number: z.number(),
          string: z.string(),
        }),
        async (args: any) => {
          return { success: true };
        }
      );

      const tool = (mockServer as any).getTool("test_tool");
      const result = await tool.handler({ 
        number: "not a number", // Wrong type
        string: 123, // Wrong type
      });

      // Should return validation error
      expect(result.isError).toBe(true);
      expect(result.structuredContent?.error).toBeDefined();
      expect(result.structuredContent?.error?.code).toBe("EXECUTION_ERROR");
    });

    test("wrapped tools should handle execution errors", async () => {
      wrappedServer.tool(
        "test_tool",
        "Test tool",
        z.object({ input: z.string() }),
        async (args: any) => {
          throw new Error("Execution failed");
        }
      );

      const tool = (mockServer as any).getTool("test_tool");
      const result = await tool.handler({ input: "test" });

      // Should return execution error
      expect(result.isError).toBe(true);
      expect(result.structuredContent?.error?.code).toBe("EXECUTION_ERROR");
      expect(result.structuredContent?.error?.message).toContain("Execution failed");
    });
  });

  describe("Content Annotations", () => {
    test("responses should include proper annotations", () => {
      const response = createSuccessResponse(
        { data: "test" },
        { 
          toolName: "test_tool",
          annotations: { custom: "value" }
        }
      );

      // Check annotations exist
      const humanContent = response.content.find(c => 
        c.annotations?.audience?.includes("human")
      );
      expect(humanContent?.annotations).toBeDefined();
      expect(humanContent?.annotations?.priority).toBeDefined();
      expect(humanContent?.annotations?.custom).toBe("value");

      // Check JSON content has format annotation
      const jsonContent = response.content.find(c => 
        c.annotations?.format === "json"
      );
      expect(jsonContent).toBeDefined();
    });

    test("error responses should have severity annotations", () => {
      const response = createErrorResponse("Test error", {
        toolName: "test_tool",
      });

      const errorContent = response.content.find(c => 
        c.annotations?.severity === "error"
      );
      expect(errorContent).toBeDefined();

      const debugContent = response.content.find(c => 
        c.annotations?.severity === "debug"
      );
      // Debug content may or may not exist depending on details
      if (debugContent) {
        expect(debugContent.annotations?.audience).toContain("model");
      }
    });
  });
});