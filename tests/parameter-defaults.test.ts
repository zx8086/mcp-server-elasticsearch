import { describe, expect, test, beforeEach } from "bun:test";
import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { wrapServerWithTracing } from "../src/utils/universalToolWrapper.js";
import { createMockClient, createMockServer } from "./utils/test-helpers.js";
import { z } from "zod";

describe("Parameter Default Handling", () => {
  let mockServer: McpServer;
  let mockClient: Client;
  let wrappedServer: McpServer;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    wrappedServer = wrapServerWithTracing(mockServer);
  });

  test("should NOT force defaults - user parameters should pass through", async () => {
    // Register a tool that mimics our FIXED elasticsearch_list_indices
    let executedWithArgs: any = null;
    
    wrappedServer.tool(
      "elasticsearch_list_indices",
      "List indices",
      z.object({
        indexPattern: z.string().min(1, "Index pattern is required").optional(),
        limit: z.number().optional(), // NO default - let user decide
      }),
      async (args: any) => {
        executedWithArgs = args;
        return { indices: [] };
      }
    );

    const tool = (mockServer as any).getTool("elasticsearch_list_indices");
    
    // Test 1: Empty object should not have forced defaults
    const result1 = await tool.handler({}, { signal: {}, requestId: "test" });
    expect(result1.isError).toBeFalsy();
    expect(executedWithArgs).toBeDefined();
    expect(executedWithArgs.limit).toBeUndefined(); // NO forced default
    
    // Test 2: User-provided limit should be used exactly
    const result2 = await tool.handler({ limit: 5 }, { signal: {}, requestId: "test" });
    expect(result2.isError).toBeFalsy();
    expect(executedWithArgs.limit).toBe(5); // User value used
  });

  test("should return error when required params are missing", async () => {
    let executedWithArgs: any = null;
    
    wrappedServer.tool(
      "elasticsearch_search",
      "Search",
      z.object({
        index: z.string().min(1), // Required
        queryBody: z.object({}).passthrough(), // Required
      }),
      async (args: any) => {
        executedWithArgs = args;
        return { hits: { hits: [] } };
      }
    );

    const tool = (mockServer as any).getTool("elasticsearch_search");
    // MCP SDK passes parameters as first arg, extra as second arg
    const result = await tool.handler(null, { signal: {}, requestId: "test" });

    // Should return an error when required params are missing
    expect(result.isError).toBeTruthy();
    
    // Should not have executed
    expect(executedWithArgs).toBeNull();
  });

  test("should use provided parameters without forcing defaults", async () => {
    let executedWithArgs: any = null;
    
    wrappedServer.tool(
      "elasticsearch_list_indices",
      "List indices",
      z.object({
        indexPattern: z.string().min(1).optional(),
        limit: z.number().optional(), // NO default
      }),
      async (args: any) => {
        executedWithArgs = args;
        return { indices: [] };
      }
    );

    const tool = (mockServer as any).getTool("elasticsearch_list_indices");
    // MCP SDK passes parameters as first arg, extra as second arg
    const result = await tool.handler({ limit: 100 }, { signal: {}, requestId: "test" }); // Provide only limit

    // Should not return an error
    expect(result.isError).toBeFalsy();
    
    // Should use provided value, no forced defaults
    expect(executedWithArgs).toBeDefined();
    expect(executedWithArgs.indexPattern).toBeUndefined(); // NOT forced
    expect(executedWithArgs.limit).toBe(100); // From provided
  });

  test("should work for ILM explain with wrong parameter names", async () => {
    let executedWithArgs: any = null;
    
    wrappedServer.tool(
      "elasticsearch_ilm_explain_lifecycle",
      "Explain ILM",
      z.object({
        index: z.string().min(1, "Index is required"),
        onlyErrors: z.boolean().optional(),
      }),
      async (args: any) => {
        executedWithArgs = args;
        return { indices: {} };
      }
    );

    const tool = (mockServer as any).getTool("elasticsearch_ilm_explain_lifecycle");
    
    // Call with wrong parameter name (indexPattern instead of index)
    // MCP SDK passes parameters as first arg, extra as second arg
    const result = await tool.handler({ indexPattern: "logs-*" }, { signal: {}, requestId: "test" });

    // Should error when required param 'index' is missing
    expect(result.isError).toBeTruthy();
    
    // Should not have executed
    expect(executedWithArgs).toBeNull();
  });

  test("should work for tools that don't need parameters", async () => {
    let executed = false;
    
    wrappedServer.tool(
      "elasticsearch_get_cluster_health",
      "Get cluster health",
      z.object({
        index: z.string().optional(),
        level: z.enum(["cluster", "indices", "shards"]).optional(),
      }),
      async (args: any) => {
        executed = true;
        return { status: "green" };
      }
    );

    const tool = (mockServer as any).getTool("elasticsearch_get_cluster_health");
    // MCP SDK passes parameters as first arg, extra as second arg
    const result = await tool.handler({}, { signal: {}, requestId: "test" });

    // Should not return an error
    expect(result.isError).toBeFalsy();
    
    // Should have executed
    expect(executed).toBe(true);
  });

  test("should still return error for truly invalid parameters", async () => {
    wrappedServer.tool(
      "test_tool",
      "Test",
      z.object({
        number: z.number(),
        required: z.string(),
      }),
      async (args: any) => {
        return { success: true };
      }
    );

    const tool = (mockServer as any).getTool("test_tool");
    
    // Call with wrong types that can't be fixed by defaults
    // MCP SDK passes parameters as first arg, extra as second arg
    const result = await tool.handler({ 
      number: "not a number",
      required: 123  // Wrong type
    }, { signal: {}, requestId: "test" });

    // Should return an error
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error?.code).toBe("EXECUTION_ERROR"); // Error code from wrapper
  });

  test("should handle parameters correctly with MCP SDK two-argument pattern", async () => {
    let executedWithArgs: any = null;
    let executedWithExtra: any = null;
    
    wrappedServer.tool(
      "elasticsearch_search",
      "Search",
      z.object({
        index: z.string().default("*"),
        queryBody: z.object({}).passthrough().default({ query: { match_all: {} }, size: 10 }),
      }),
      async (args: any, extra?: any) => {
        executedWithArgs = args;
        executedWithExtra = extra;
        return { hits: { hits: [] } };
      }
    );

    const tool = (mockServer as any).getTool("elasticsearch_search");
    
    // MCP SDK passes parameters as first arg, metadata as second arg
    const params = {
      index: "logs-*",
      queryBody: { query: { term: { status: "error" } }, size: 50 }
    };
    const metadata = {
      signal: {},
      requestId: "test-request-123",
      sessionId: "session-456"
    };
    
    const result = await tool.handler(params, metadata);

    // Should not return an error
    expect(result.isError).toBeFalsy();
    
    // Should have received parameters correctly
    expect(executedWithArgs).toBeDefined();
    expect(executedWithArgs.index).toBe("logs-*");
    expect(executedWithArgs.queryBody).toEqual({ query: { term: { status: "error" } }, size: 50 });
    
    // Metadata should be in extra, not in args
    expect(executedWithArgs.signal).toBeUndefined();
    expect(executedWithArgs.requestId).toBeUndefined();
    expect(executedWithArgs.sessionId).toBeUndefined();
  });

  test("should handle parameters correctly with proper MCP SDK pattern", async () => {
    let executedWithArgs: any = null;
    
    wrappedServer.tool(
      "elasticsearch_execute_sql_query",
      "Execute SQL",
      z.object({
        query: z.string().default("SELECT * FROM * LIMIT 10"),
        format: z.string().optional(),
      }),
      async (args: any) => {
        executedWithArgs = args;
        return { columns: [], rows: [] };
      }
    );

    const tool = (mockServer as any).getTool("elasticsearch_execute_sql_query");
    
    // MCP SDK passes parameters as first arg, metadata as second arg
    const params = {
      query: "SELECT * FROM logs-* WHERE level = 'ERROR' LIMIT 100",
      format: "json"
    };
    const metadata = {
      signal: {},
      requestId: "test-request-456"
    };
    
    const result = await tool.handler(params, metadata);

    // Should not return an error
    expect(result.isError).toBeFalsy();
    
    // Should have received parameters correctly
    expect(executedWithArgs).toBeDefined();
    expect(executedWithArgs.query).toBe("SELECT * FROM logs-* WHERE level = 'ERROR' LIMIT 100");
    expect(executedWithArgs.format).toBe("json");
  });

  test("should apply defaults when called with empty parameters using MCP SDK pattern", async () => {
    let executedWithArgs: any = null;
    
    wrappedServer.tool(
      "elasticsearch_list_indices",
      "List indices",
      z.object({
        indexPattern: z.string().default("*"),
        limit: z.number().default(50),
      }),
      async (args: any) => {
        executedWithArgs = args;
        return { indices: [] };
      }
    );

    const tool = (mockServer as any).getTool("elasticsearch_list_indices");
    
    // MCP SDK passes empty params as first arg, metadata as second arg
    const result = await tool.handler({}, {
      signal: {},
      requestId: "test-request-789",
      sessionId: "session-123",
      connectionId: "conn-456"
    });

    // Should not return an error
    expect(result.isError).toBeFalsy();
    
    // Should have applied defaults
    expect(executedWithArgs).toBeDefined();
    expect(executedWithArgs.indexPattern).toBe("*");
    expect(executedWithArgs.limit).toBe(50);
    // Metadata should not be in args
    expect(executedWithArgs.signal).toBeUndefined();
    expect(executedWithArgs.requestId).toBeUndefined();
  });
});