import { describe, expect, test, beforeEach } from "bun:test";
import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { wrapServerWithTracing } from "../src/utils/universalToolWrapper.js";
import { createMockClient, createMockServer } from "./utils/test-helpers.js";
import { z } from "zod";

describe("MCP SDK Parameter Passing Fix", () => {
  let mockServer: McpServer;
  let mockClient: Client;
  let wrappedServer: McpServer;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    wrappedServer = wrapServerWithTracing(mockServer);
  });

  test("should correctly receive parameters as first argument and metadata as second", async () => {
    let receivedArgs: any = null;
    
    wrappedServer.tool(
      "test_tool",
      "Test tool",
      z.object({
        param1: z.string(),
        param2: z.number(),
        param3: z.boolean().optional(),
      }),
      async (args: any) => {
        receivedArgs = args;
        // Note: The wrapper handles metadata extraction, 
        // the tool handler only receives the cleaned parameters
        return { success: true };
      }
    );

    const tool = (mockServer as any).getTool("test_tool");
    
    // MCP SDK passes parameters as first arg, metadata as second arg
    const parameters = {
      param1: "test value",
      param2: 42,
      param3: true
    };
    
    const metadata = {
      signal: {},
      requestId: "req-123",
      sessionId: "session-456",
      sendNotification: () => {},
      sendRequest: () => {}
    };
    
    const result = await tool.handler(parameters, metadata);

    // Verify parameters were received correctly
    expect(receivedArgs).toBeDefined();
    expect(receivedArgs.param1).toBe("test value");
    expect(receivedArgs.param2).toBe(42);
    expect(receivedArgs.param3).toBe(true);
    
    // Verify metadata didn't leak into parameters
    expect(receivedArgs.signal).toBeUndefined();
    expect(receivedArgs.requestId).toBeUndefined();
    expect(receivedArgs.sessionId).toBeUndefined();
    expect(receivedArgs.sendNotification).toBeUndefined();
    expect(receivedArgs.sendRequest).toBeUndefined();
  });

  test("should handle empty parameters correctly", async () => {
    let receivedArgs: any = null;
    
    wrappedServer.tool(
      "test_tool_with_defaults",
      "Test tool with defaults",
      z.object({
        optionalParam: z.string().optional(),
        defaultParam: z.number().default(100),
      }),
      async (args: any) => {
        receivedArgs = args;
        return { success: true };
      }
    );

    const tool = (mockServer as any).getTool("test_tool_with_defaults");
    
    // Call with empty parameters
    const result = await tool.handler({}, { signal: {}, requestId: "test" });

    // Should receive defaults
    expect(receivedArgs).toBeDefined();
    expect(receivedArgs.defaultParam).toBe(100);
    expect(receivedArgs.optionalParam).toBeUndefined();
  });

  test("should handle null parameters correctly", async () => {
    let receivedArgs: any = null;
    
    wrappedServer.tool(
      "test_tool_nullable",
      "Test tool nullable",
      z.object({
        requiredParam: z.string().default("default value"),
      }),
      async (args: any) => {
        receivedArgs = args;
        return { success: true };
      }
    );

    const tool = (mockServer as any).getTool("test_tool_nullable");
    
    // Call with null parameters
    const result = await tool.handler(null, { signal: {}, requestId: "test" });

    // Should receive defaults
    expect(receivedArgs).toBeDefined();
    expect(receivedArgs.requiredParam).toBe("default value");
  });

  test("should not confuse parameters with metadata fields", async () => {
    let receivedArgs: any = null;
    
    wrappedServer.tool(
      "test_no_confusion",
      "Test no confusion",
      z.object({
        // These have same names as metadata fields
        signal: z.string().optional(),
        requestId: z.string().optional(),
        // Regular parameters
        data: z.string(),
      }),
      async (args: any) => {
        receivedArgs = args;
        return { success: true };
      }
    );

    const tool = (mockServer as any).getTool("test_no_confusion");
    
    // Parameters that have same names as metadata
    const parameters = {
      signal: "user-signal-value",
      requestId: "user-request-id",
      data: "test data"
    };
    
    const metadata = {
      signal: {},
      requestId: "metadata-request-id",
    };
    
    const result = await tool.handler(parameters, metadata);

    // Should receive user parameters, not metadata
    expect(receivedArgs).toBeDefined();
    expect(receivedArgs.signal).toBe("user-signal-value");
    expect(receivedArgs.requestId).toBe("user-request-id");
    expect(receivedArgs.data).toBe("test data");
  });

  test("should work with complex nested parameters", async () => {
    let receivedArgs: any = null;
    
    wrappedServer.tool(
      "test_complex",
      "Test complex",
      z.object({
        query: z.object({
          match: z.object({
            field: z.string(),
            value: z.string(),
          }).optional(),
          size: z.number().default(10),
        }),
        options: z.object({
          timeout: z.string().optional(),
          refresh: z.boolean().default(false),
        }).optional(),
      }),
      async (args: any) => {
        receivedArgs = args;
        return { success: true };
      }
    );

    const tool = (mockServer as any).getTool("test_complex");
    
    const parameters = {
      query: {
        match: {
          field: "title",
          value: "elasticsearch"
        },
        size: 25
      },
      options: {
        timeout: "5s",
        refresh: true
      }
    };
    
    const result = await tool.handler(parameters, { signal: {}, requestId: "test" });

    // Should receive complex nested structure correctly
    expect(receivedArgs).toBeDefined();
    expect(receivedArgs.query).toBeDefined();
    expect(receivedArgs.query.match).toBeDefined();
    expect(receivedArgs.query.match.field).toBe("title");
    expect(receivedArgs.query.match.value).toBe("elasticsearch");
    expect(receivedArgs.query.size).toBe(25);
    expect(receivedArgs.options).toBeDefined();
    expect(receivedArgs.options.timeout).toBe("5s");
    expect(receivedArgs.options.refresh).toBe(true);
  });

  test("should handle passthrough objects correctly", async () => {
    let receivedArgs: any = null;
    
    wrappedServer.tool(
      "test_passthrough",
      "Test passthrough",
      z.object({
        index: z.string(),
        queryBody: z.object({}).passthrough(),
      }),
      async (args: any) => {
        receivedArgs = args;
        return { success: true };
      }
    );

    const tool = (mockServer as any).getTool("test_passthrough");
    
    const parameters = {
      index: "test-index",
      queryBody: {
        query: {
          bool: {
            must: [
              { term: { status: "active" } },
              { range: { age: { gte: 18 } } }
            ]
          }
        },
        aggs: {
          by_category: {
            terms: { field: "category" }
          }
        },
        customField: "custom value"
      }
    };
    
    const result = await tool.handler(parameters, { signal: {}, requestId: "test" });

    // Should receive passthrough object with all fields intact
    expect(receivedArgs).toBeDefined();
    expect(receivedArgs.index).toBe("test-index");
    expect(receivedArgs.queryBody).toBeDefined();
    expect(receivedArgs.queryBody.query).toBeDefined();
    expect(receivedArgs.queryBody.query.bool.must).toHaveLength(2);
    expect(receivedArgs.queryBody.aggs).toBeDefined();
    expect(receivedArgs.queryBody.customField).toBe("custom value");
  });

  test("should apply tool-specific defaults correctly", async () => {
    let receivedArgs: any = null;
    
    // Simulate elasticsearch_list_indices tool
    wrappedServer.tool(
      "elasticsearch_list_indices",
      "List indices",
      z.object({
        indexPattern: z.string().min(1, "Index pattern is required"),
        limit: z.number().min(1).max(1000).default(50),
        excludeSystemIndices: z.boolean().default(true),
        excludeDataStreams: z.boolean().default(false),
        sortBy: z.enum(["name", "size", "docs", "creation"]).default("name"),
      }),
      async (args: any) => {
        receivedArgs = args;
        return { indices: [] };
      }
    );

    const tool = (mockServer as any).getTool("elasticsearch_list_indices");
    
    // Call with partial parameters
    const result = await tool.handler(
      { indexPattern: "logs-*", limit: 100 },
      { signal: {}, requestId: "test" }
    );

    // Should merge provided params with defaults
    expect(receivedArgs).toBeDefined();
    expect(receivedArgs.indexPattern).toBe("logs-*");
    expect(receivedArgs.limit).toBe(100);
    expect(receivedArgs.excludeSystemIndices).toBe(true); // default
    expect(receivedArgs.excludeDataStreams).toBe(false); // default
    expect(receivedArgs.sortBy).toBe("name"); // default
  });
});