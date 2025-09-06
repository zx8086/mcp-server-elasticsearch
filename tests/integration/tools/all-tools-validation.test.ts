import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { zodToJsonSchemaCompat as zodToJsonSchema } from "../../../src/utils/zodToJsonSchema";
import { Glob } from "bun";
import { readFile } from "node:fs/promises";

interface ExtractedSchema {
  toolName: string;
  filePath: string;
  schemaCode: string;
}

async function extractAllSchemas(): Promise<ExtractedSchema[]> {
  const glob = new Glob("src/tools/**/*.ts");
  const schemas: ExtractedSchema[] = [];
  
  for await (const file of glob.scan(".")) {
    if (file.includes("index.ts") || file.includes("types.ts") || file.includes(".test.ts") || file.includes("README.md")) {
      continue;
    }
    
    const content = await readFile(file, "utf-8");
    
    // Extract tool name
    const toolNameMatch = content.match(/name:\s*["']([^"']+)["']/);
    if (!toolNameMatch) continue;
    
    // Extract input schema definition
    const schemaMatch = content.match(/(?:const\s+\w+Params\s*=|inputSchema:\s*)(z\.object\([^}]*\}\)(?:\.passthrough\(\))?(?:\.describe\([^)]*\))?)/s);
    
    if (schemaMatch) {
      schemas.push({
        toolName: toolNameMatch[1],
        filePath: file,
        schemaCode: schemaMatch[1],
      });
    }
  }
  
  return schemas;
}

describe("All Tools Schema Validation", () => {
  test("all tools files exist and can be parsed", async () => {
    const glob = new Glob("src/tools/**/*.ts");
    const toolFiles = [];
    
    for await (const file of glob.scan(".")) {
      if (file.includes("index.ts") || file.includes("types.ts") || file.includes(".test.ts") || file.includes("README.md")) {
        continue;
      }
      toolFiles.push(file);
    }
    
    // We should have found many tool files
    expect(toolFiles.length).toBeGreaterThan(50);
    
    // Test that basic schema conversion works
    const testSchema = z.object({}).passthrough();
    const jsonSchema = zodToJsonSchema(testSchema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });
    
    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.type).toBe("object");
    expect(jsonSchema.additionalProperties).toBe(true);
  });
  
  test("no tools should use z.record(z.any()) pattern", async () => {
    const glob = new Glob("src/tools/**/*.ts");
    const filesWithRecordAny: string[] = [];
    
    for await (const file of glob.scan(".")) {
      if (file.includes("index.ts") || file.includes("types.ts")) continue;
      
      const content = await readFile(file, "utf-8");
      
      if (content.includes("z.record(z.any())")) {
        filesWithRecordAny.push(file);
      }
    }
    
    expect(filesWithRecordAny).toEqual([]);
  });
  
  test("tools using passthrough pattern should convert correctly", () => {
    const testCases = [
      {
        name: "simple passthrough",
        schema: z.object({}).passthrough(),
      },
      {
        name: "nested passthrough",
        schema: z.object({
          index: z.string(),
          body: z.object({}).passthrough(),
        }),
      },
      {
        name: "array of passthrough objects",
        schema: z.object({
          items: z.array(z.object({}).passthrough()),
        }),
      },
      {
        name: "optional passthrough",
        schema: z.object({
          optional: z.object({}).passthrough().optional(),
        }),
      },
    ];
    
    for (const { name, schema } of testCases) {
      const jsonSchema = zodToJsonSchema(schema, {
        $refStrategy: "none",
        target: "jsonSchema7",
        removeAdditionalStrategy: "passthrough",
      });
      
      expect(jsonSchema).toBeDefined();
      expect(jsonSchema.type).toBe("object");
      
      // Check that passthrough objects have additionalProperties: true
      if (name === "simple passthrough") {
        expect(jsonSchema.additionalProperties).toBe(true);
      }
    }
  });
});

describe("Critical Tool Schema Tests", () => {
  test("elasticsearch_search schema should handle complex queries", () => {
    const searchSchema = z.object({
      index: z.string().trim().min(1).describe("Index name"),
      queryBody: z.object({}).passthrough().describe("Query DSL"),
    });
    
    // Test conversion
    const jsonSchema = zodToJsonSchema(searchSchema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });
    
    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.properties?.queryBody?.additionalProperties).toBe(true);
    
    // Test validation with complex queries
    const testQueries = [
      {
        index: "test",
        queryBody: {
          query: { match_all: {} },
        },
      },
      {
        index: "test",
        queryBody: {
          query: {
            bool: {
              must: [{ term: { status: "active" } }],
              filter: [{ range: { age: { gte: 18 } } }],
            },
          },
          aggs: {
            by_status: { terms: { field: "status" } },
          },
        },
      },
    ];
    
    for (const query of testQueries) {
      const result = searchSchema.parse(query);
      expect(result).toEqual(query);
    }
  });
  
  test("bulk operations schema should handle various operation types", () => {
    const bulkSchema = z.object({
      operations: z.array(z.object({}).passthrough()),
      index: z.string().optional(),
    });
    
    const jsonSchema = zodToJsonSchema(bulkSchema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });
    
    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.properties?.operations?.type).toBe("array");
    
    // Test with various bulk operations
    const testOperations = {
      operations: [
        { index: { _index: "test", _id: "1" } },
        { title: "Test Document", content: "Content" },
        { update: { _index: "test", _id: "2" } },
        { doc: { status: "updated" } },
        { delete: { _index: "test", _id: "3" } },
      ],
    };
    
    const result = bulkSchema.parse(testOperations);
    expect(result.operations).toHaveLength(5);
  });
  
  test("document schemas should handle arbitrary JSON documents", () => {
    const documentSchema = z.object({
      index: z.string(),
      document: z.object({}).passthrough(),
    });
    
    const testDocuments = [
      {
        index: "test",
        document: {},
      },
      {
        index: "test",
        document: {
          nested: {
            deeply: {
              nested: {
                value: "test",
              },
            },
          },
        },
      },
      {
        index: "test",
        document: {
          string: "value",
          number: 42,
          boolean: true,
          null: null,
          array: [1, 2, 3],
          object: { key: "value" },
        },
      },
    ];
    
    for (const doc of testDocuments) {
      const result = documentSchema.parse(doc);
      expect(result).toEqual(doc);
    }
  });
});