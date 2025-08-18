import { describe, expect, test, beforeEach } from "bun:test";
import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { zodToJsonSchemaCompat as zodToJsonSchema } from "../../src/utils/zodToJsonSchema.js";
import { registerSearchTool } from "../../src/tools/core/search.js";
import { registerListIndicesTool } from "../../src/tools/core/list_indices.js";
import { registerGetMappingsTool } from "../../src/tools/core/get_mappings.js";
import { registerGetShardsTool } from "../../src/tools/core/get_shards.js";
import { registerIndicesSummaryTool } from "../../src/tools/core/indices_summary.js";
import { createMockClient, createMockServer } from "../utils/test-helpers.js";

describe("Core Tools Tests", () => {
  let mockClient: Client;
  let mockServer: McpServer & { getTools: () => any[]; getTool: (name: string) => any };

  beforeEach(() => {
    mockClient = createMockClient();
    mockServer = createMockServer();
  });

  describe("elasticsearch_search tool", () => {
    test("should register successfully", () => {
      registerSearchTool(mockServer, mockClient);
      const tool = mockServer.getTool("elasticsearch_search");

      expect(tool).toBeDefined();
      expect(tool.name).toBe("elasticsearch_search");
      expect(tool.description).toContain("Search Elasticsearch");
      expect(tool.schema).toBeDefined();
    });

    test("should convert schema to JSON Schema correctly", () => {
      registerSearchTool(mockServer, mockClient);
      const tool = mockServer.getTool("elasticsearch_search");

      // The schema should be a valid JSON Schema
      expect(tool.schema).toHaveProperty("type");
      expect(tool.schema.type).toBe("object");
      expect(tool.schema).toHaveProperty("properties");
      expect(tool.schema.properties).toHaveProperty("index");
      expect(tool.schema.properties).toHaveProperty("queryBody");
    });

    test("should validate queryBody as passthrough object", () => {
      const inputSchema = z.object({
        index: z.string().trim().min(1).describe("Index name"),
        queryBody: z.object({}).passthrough().describe("Query DSL"),
      });

      const jsonSchema = zodToJsonSchema(inputSchema, {
        $refStrategy: "none",
        target: "jsonSchema7",
        removeAdditionalStrategy: "passthrough",
      });

      expect(jsonSchema.properties?.queryBody).toBeDefined();
      expect(jsonSchema.properties?.queryBody?.type).toBe("object");
      expect(jsonSchema.properties?.queryBody?.additionalProperties).toBe(true);
    });

    test("should handle various query body structures", () => {
      const testQueries = [
        // Simple match query
        {
          index: "test-index",
          queryBody: {
            query: {
              match: {
                title: "search term",
              },
            },
          },
        },
        // Complex bool query
        {
          index: "test-index",
          queryBody: {
            query: {
              bool: {
                must: [{ term: { status: "active" } }],
                filter: [{ range: { age: { gte: 18 } } }],
              },
            },
            size: 10,
            from: 0,
          },
        },
        // Aggregation query
        {
          index: "test-index",
          queryBody: {
            size: 0,
            aggs: {
              status_count: {
                terms: {
                  field: "status",
                },
              },
            },
          },
        },
        // Empty query (match all)
        {
          index: "test-index",
          queryBody: {},
        },
      ];

      const inputSchema = z.object({
        index: z.string().trim().min(1),
        queryBody: z.object({}).passthrough(),
      });

      for (const query of testQueries) {
        const result = inputSchema.parse(query);
        expect(result).toBeDefined();
        expect(result.index).toBe(query.index);
        expect(result.queryBody).toEqual(query.queryBody);
      }
    });
  });

  describe("elasticsearch_list_indices tool", () => {
    test("should register successfully", () => {
      registerListIndicesTool(mockServer, mockClient);
      const tool = mockServer.getTool("elasticsearch_list_indices");

      expect(tool).toBeDefined();
      expect(tool.name).toBe("elasticsearch_list_indices");
      expect(tool.description).toContain("List indices");
      expect(tool.schema).toBeDefined();
    });

    test("should have valid schema", () => {
      registerListIndicesTool(mockServer, mockClient);
      const tool = mockServer.getTool("elasticsearch_list_indices");

      expect(tool.schema.type).toBe("object");
      expect(tool.schema.properties).toBeDefined();
      expect(tool.schema.properties.indexPattern).toBeDefined();
      // All fields are optional now (no defaults)
      expect(tool.schema.required).toBeUndefined();
      // Verify NO defaults are present (to avoid LLM parameter issues)
      expect(tool.schema.properties.indexPattern.default).toBeUndefined();
      expect(tool.schema.properties.limit).toBeDefined();
      expect(tool.schema.properties.excludeSystemIndices).toBeDefined();
    });
  });

  describe("elasticsearch_get_mappings tool", () => {
    test("should register successfully", () => {
      registerGetMappingsTool(mockServer, mockClient);
      const tool = mockServer.getTool("elasticsearch_get_mappings");

      expect(tool).toBeDefined();
      expect(tool.name).toBe("elasticsearch_get_mappings");
      expect(tool.description).toContain("field mappings");
      expect(tool.schema).toBeDefined();
    });

    test("should have valid schema", () => {
      registerGetMappingsTool(mockServer, mockClient);
      const tool = mockServer.getTool("elasticsearch_get_mappings");

      expect(tool.schema.type).toBe("object");
      expect(tool.schema.properties).toBeDefined();
      expect(tool.schema.properties.index).toBeDefined();
      // Index now has a default so it's optional
      expect(tool.schema.required).toBeUndefined();
    });
  });

  describe("elasticsearch_get_shards tool", () => {
    test("should register successfully", () => {
      registerGetShardsTool(mockServer, mockClient);
      const tool = mockServer.getTool("elasticsearch_get_shards");

      expect(tool).toBeDefined();
      expect(tool.name).toBe("elasticsearch_get_shards");
      expect(tool.description).toContain("shard information");
      expect(tool.schema).toBeDefined();
    });

    test("should have valid schema", () => {
      registerGetShardsTool(mockServer, mockClient);
      const tool = mockServer.getTool("elasticsearch_get_shards");

      expect(tool.schema.type).toBe("object");
      expect(tool.schema.properties).toBeDefined();
    });
  });

  describe("elasticsearch_indices_summary tool", () => {
    test("should register successfully", () => {
      registerIndicesSummaryTool(mockServer, mockClient);
      const tool = mockServer.getTool("elasticsearch_indices_summary");

      expect(tool).toBeDefined();
      expect(tool.name).toBe("elasticsearch_indices_summary");
      expect(tool.description).toContain("high-level summary");
      expect(tool.schema).toBeDefined();
    });

    test("should have valid schema", () => {
      registerIndicesSummaryTool(mockServer, mockClient);
      const tool = mockServer.getTool("elasticsearch_indices_summary");

      expect(tool.schema.type).toBe("object");
      expect(tool.schema.properties).toBeDefined();
    });
  });
});

describe("Schema Conversion Edge Cases", () => {
  test("should handle z.any() correctly", () => {
    const schema = z.object({
      field: z.any(),
    });

    const jsonSchema = zodToJsonSchema(schema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.properties?.field).toBeDefined();
  });

  test("should handle z.unknown() correctly", () => {
    const schema = z.object({
      field: z.unknown(),
    });

    const jsonSchema = zodToJsonSchema(schema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.properties?.field).toBeDefined();
  });

  test("should handle z.record(z.unknown()) correctly", () => {
    const schema = z.object({
      field: z.record(z.unknown()),
    });

    const jsonSchema = zodToJsonSchema(schema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.properties?.field).toBeDefined();
    expect(jsonSchema.properties?.field?.type).toBe("object");
  });

  test("should handle mixed object and record types", () => {
    const schema = z.object({
      strictField: z.string(),
      flexibleField: z.object({}).passthrough(),
      recordField: z.record(z.string()),
    });

    const jsonSchema = zodToJsonSchema(schema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.properties?.strictField?.type).toBe("string");
    expect(jsonSchema.properties?.flexibleField?.type).toBe("object");
    expect(jsonSchema.properties?.recordField?.type).toBe("object");
  });
});