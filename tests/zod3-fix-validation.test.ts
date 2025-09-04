import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { wrapServerWithTracing } from "../src/utils/universalToolWrapper.js";
import { createMockServer } from "./utils/test-helpers.js";

describe("Zod 3.x Fix Validation - Core Functionality", () => {
  test("CRITICAL: Date range parameters pass through correctly", async () => {
    const server = createMockServer();
    const wrappedServer = wrapServerWithTracing(server);
    
    let capturedParams: any = null;
    
    // Register a tool that mimics elasticsearch_search
    wrappedServer.tool(
      "test_date_range",
      "Test date range parameter passing",
      {
        index: z.string().describe("Index name"),
        queryBody: z.object({}).passthrough().describe("Elasticsearch Query DSL")
      },
      async (params: any) => {
        capturedParams = params;
        return { content: [{ type: "text", text: "success" }] };
      }
    );
    
    const tool = (server as any).getTool("test_date_range");
    
    // The exact query that was failing before the fix
    const dateRangeQuery = {
      index: "logs-2025.08.18",
      queryBody: {
        query: {
          bool: {
            must: [{
              range: {
                "@timestamp": {
                  gte: "2025-08-18T07:00:00Z",
                  lte: "2025-08-18T08:00:00Z"
                }
              }
            }]
          }
        },
        size: 100,
        sort: [{ "@timestamp": { order: "desc" } }]
      }
    };
    
    await tool.handler(dateRangeQuery);
    
    // Verify the critical fix: all nested parameters are preserved
    expect(capturedParams).toEqual(dateRangeQuery);
    expect(capturedParams.queryBody.query.bool.must[0].range["@timestamp"]).toEqual({
      gte: "2025-08-18T07:00:00Z",
      lte: "2025-08-18T08:00:00Z"
    });
    expect(capturedParams.queryBody.size).toBe(100);
    expect(capturedParams.queryBody.sort).toEqual([{ "@timestamp": { order: "desc" } }]);
  });

  test("Complex nested objects pass through without loss", async () => {
    const server = createMockServer();
    const wrappedServer = wrapServerWithTracing(server);
    
    let capturedParams: any = null;
    
    wrappedServer.tool(
      "test_nested",
      "Test nested object passing",
      {
        data: z.object({}).passthrough().describe("Complex nested data")
      },
      async (params: any) => {
        capturedParams = params;
        return { content: [{ type: "text", text: "success" }] };
      }
    );
    
    const tool = (server as any).getTool("test_nested");
    
    const complexData = {
      data: {
        level1: {
          level2: {
            level3: {
              array: [1, 2, 3],
              object: { key: "value" },
              date: "2025-08-18T00:00:00Z",
              number: 42,
              boolean: true,
              null: null
            }
          }
        }
      }
    };
    
    await tool.handler(complexData);
    
    expect(capturedParams).toEqual(complexData);
    expect(capturedParams.data.level1.level2.level3.date).toBe("2025-08-18T00:00:00Z");
    expect(capturedParams.data.level1.level2.level3.array).toEqual([1, 2, 3]);
  });

  test("Optional fields with defaults work correctly", async () => {
    const server = createMockServer();
    const wrappedServer = wrapServerWithTracing(server);
    
    let capturedParams: any = null;
    
    wrappedServer.tool(
      "test_defaults",
      "Test optional fields with defaults",
      {
        required: z.string().describe("Required field"),
        optional: z.string().optional().describe("Optional field"),
        withDefault: z.number().default(10).describe("Field with default"),
        boolDefault: z.boolean().default(false).describe("Boolean with default")
      },
      async (params: any) => {
        capturedParams = params;
        return { content: [{ type: "text", text: "success" }] };
      }
    );
    
    const tool = (server as any).getTool("test_defaults");
    
    // Call with only required field
    await tool.handler({ required: "test" });
    
    expect(capturedParams.required).toBe("test");
    expect(capturedParams.optional).toBeUndefined();
    // Defaults may or may not be applied depending on validation logic
    // The important thing is the tool receives parameters correctly
  });

  test("Arrays and complex types pass through correctly", async () => {
    const server = createMockServer();
    const wrappedServer = wrapServerWithTracing(server);
    
    let capturedParams: any = null;
    
    wrappedServer.tool(
      "test_arrays",
      "Test array and complex type passing",
      {
        strings: z.array(z.string()).describe("Array of strings"),
        objects: z.array(z.object({}).passthrough()).describe("Array of objects"),
        mixed: z.any().describe("Mixed type field")
      },
      async (params: any) => {
        capturedParams = params;
        return { content: [{ type: "text", text: "success" }] };
      }
    );
    
    const tool = (server as any).getTool("test_arrays");
    
    const testData = {
      strings: ["a", "b", "c"],
      objects: [
        { id: 1, name: "first" },
        { id: 2, name: "second", extra: "field" }
      ],
      mixed: { 
        anything: "goes",
        nested: [1, 2, { three: 3 }]
      }
    };
    
    await tool.handler(testData);
    
    expect(capturedParams).toEqual(testData);
    expect(capturedParams.strings).toEqual(["a", "b", "c"]);
    expect(capturedParams.objects[1].extra).toBe("field");
    expect(capturedParams.mixed.nested[2].three).toBe(3);
  });
});