import { describe, expect, test, beforeEach } from "bun:test";
import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { zodToJsonSchemaCompat as zodToJsonSchema } from "../../src/utils/zodToJsonSchema.js";
import { createMockClient, createMockServer } from "../utils/test-helpers.js";

// Import document tools
import { registerIndexDocumentTool } from "../../src/tools/document/index_document.js";
import { registerGetDocumentTool } from "../../src/tools/document/get_document.js";
import { registerUpdateDocumentTool } from "../../src/tools/document/update_document.js";
import { registerDeleteDocumentTool } from "../../src/tools/document/delete_document.js";
import { registerDocumentExistsTool } from "../../src/tools/document/document_exists.js";

describe("Document Tools Tests", () => {
  let mockClient: Client;
  let mockServer: McpServer & { getTools: () => any[]; getTool: (name: string) => any };

  beforeEach(() => {
    mockClient = createMockClient();
    mockServer = createMockServer();
  });

  describe("elasticsearch_index_document tool", () => {
    test("should register successfully", () => {
      registerIndexDocumentTool(mockServer, mockClient);
      const tool = mockServer.getTool("elasticsearch_index_document");

      expect(tool).toBeDefined();
      expect(tool.name).toBe("elasticsearch_index_document");
      expect(tool.description).toContain("Index a JSON document");
      expect(tool.schema).toBeDefined();
    });

    test("should have valid schema with document object", () => {
      registerIndexDocumentTool(mockServer, mockClient);
      const tool = mockServer.getTool("elasticsearch_index_document");

      expect(tool.schema.type).toBe("object");
      expect(tool.schema.properties).toBeDefined();
      expect(tool.schema.properties.index).toBeDefined();
      expect(tool.schema.properties.document).toBeDefined();
      expect(tool.schema.required).toContain("index");
      expect(tool.schema.required).toContain("document");
    });

    test("should validate document parameter correctly", () => {
      const schema = z.object({
        index: z.string().min(1),
        document: z.object({}).passthrough(),
        id: z.string().optional(),
        pipeline: z.string().optional(),
        refresh: z.enum(["true", "false", "wait_for"]).optional(),
        routing: z.string().optional(),
      });

      const testCases = [
        {
          index: "test-index",
          document: { title: "Test", content: "Content" },
        },
        {
          index: "test-index",
          document: { nested: { field: "value" }, array: [1, 2, 3] },
          id: "doc-1",
        },
        {
          index: "test-index",
          document: {},
          refresh: "true",
        },
      ];

      for (const testCase of testCases) {
        const result = schema.parse(testCase);
        expect(result).toBeDefined();
        expect(result.document).toEqual(testCase.document);
      }
    });
  });

  describe("elasticsearch_get_document tool", () => {
    test("should register successfully", () => {
      registerGetDocumentTool(mockServer, mockClient);
      const tool = mockServer.getTool("elasticsearch_get_document");

      expect(tool).toBeDefined();
      expect(tool.name).toBe("elasticsearch_get_document");
      expect(tool.description).toContain("Get a document");
      expect(tool.schema).toBeDefined();
    });

    test("should require index and id", () => {
      registerGetDocumentTool(mockServer, mockClient);
      const tool = mockServer.getTool("elasticsearch_get_document");

      expect(tool.schema.required).toContain("index");
      expect(tool.schema.required).toContain("id");
    });
  });

  describe("elasticsearch_update_document tool", () => {
    test("should register successfully", () => {
      registerUpdateDocumentTool(mockServer, mockClient);
      const tool = mockServer.getTool("elasticsearch_update_document");

      expect(tool).toBeDefined();
      expect(tool.name).toBe("elasticsearch_update_document");
      expect(tool.description).toContain("Update a JSON document");
      expect(tool.schema).toBeDefined();
    });

    test("should handle doc and script parameters", () => {
      const schema = z.object({
        index: z.string().min(1),
        id: z.string().min(1),
        doc: z.object({}).passthrough().optional(),
        script: z.object({}).passthrough().optional(),
        docAsUpsert: z.boolean().optional(),
        upsert: z.object({}).passthrough().optional(),
        refresh: z.enum(["true", "false", "wait_for"]).optional(),
      });

      const testCases = [
        {
          index: "test-index",
          id: "doc-1",
          doc: { field: "updated value" },
        },
        {
          index: "test-index",
          id: "doc-1",
          script: {
            source: "ctx._source.counter += params.count",
            params: { count: 1 },
          },
        },
        {
          index: "test-index",
          id: "doc-1",
          doc: { field: "value" },
          docAsUpsert: true,
        },
      ];

      for (const testCase of testCases) {
        const result = schema.parse(testCase);
        expect(result).toBeDefined();
      }
    });
  });

  describe("elasticsearch_delete_document tool", () => {
    test("should register successfully", () => {
      registerDeleteDocumentTool(mockServer, mockClient);
      const tool = mockServer.getTool("elasticsearch_delete_document");

      expect(tool).toBeDefined();
      expect(tool.name).toBe("elasticsearch_delete_document");
      expect(tool.description).toContain("Delete a document");
      expect(tool.schema).toBeDefined();
    });

    test("should require index and id", () => {
      registerDeleteDocumentTool(mockServer, mockClient);
      const tool = mockServer.getTool("elasticsearch_delete_document");

      expect(tool.schema.required).toContain("index");
      expect(tool.schema.required).toContain("id");
    });
  });

  describe("elasticsearch_document_exists tool", () => {
    test("should register successfully", () => {
      registerDocumentExistsTool(mockServer, mockClient);
      const tool = mockServer.getTool("elasticsearch_document_exists");

      expect(tool).toBeDefined();
      expect(tool.name).toBe("elasticsearch_document_exists");
      expect(tool.description).toContain("Check if a document exists");
      expect(tool.schema).toBeDefined();
    });

    test("should require index and id", () => {
      registerDocumentExistsTool(mockServer, mockClient);
      const tool = mockServer.getTool("elasticsearch_document_exists");

      expect(tool.schema.required).toContain("index");
      expect(tool.schema.required).toContain("id");
    });
  });
});

describe("Document Tools Schema Edge Cases", () => {
  test("should handle complex document structures", () => {
    const documentSchema = z.object({}).passthrough();

    const complexDocuments = [
      // Simple flat document
      { title: "Test", content: "Content" },
      // Nested objects
      {
        user: {
          name: "John",
          address: {
            street: "123 Main St",
            city: "Example",
          },
        },
      },
      // Arrays
      {
        tags: ["tag1", "tag2", "tag3"],
        items: [{ name: "item1" }, { name: "item2" }],
      },
      // Mixed types
      {
        string: "value",
        number: 42,
        boolean: true,
        null: null,
        nested: { field: "value" },
        array: [1, "two", { three: 3 }],
      },
      // Empty document
      {},
    ];

    for (const doc of complexDocuments) {
      const result = documentSchema.parse(doc);
      expect(result).toEqual(doc);
    }
  });

  test("should convert document schema to JSON Schema correctly", () => {
    const schema = z.object({
      index: z.string().min(1).describe("Index name"),
      document: z.object({}).passthrough().describe("Document to index"),
      id: z.string().optional().describe("Document ID"),
    });

    const jsonSchema = zodToJsonSchema(schema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.properties?.document).toBeDefined();
    expect(jsonSchema.properties?.document?.type).toBe("object");
    expect(jsonSchema.properties?.document?.additionalProperties).toBe(true);
  });

  test("should handle script objects correctly", () => {
    const scriptSchema = z.object({}).passthrough();

    const scripts = [
      {
        source: "ctx._source.field = params.value",
        params: { value: "new value" },
      },
      {
        source: "ctx._source.counter++",
      },
      {
        id: "stored-script-id",
        params: { multiplier: 2 },
      },
      {
        source: "if (ctx._source.status == 'active') { ctx._source.processed = true }",
        lang: "painless",
      },
    ];

    for (const script of scripts) {
      const result = scriptSchema.parse(script);
      expect(result).toEqual(script);
    }
  });
});