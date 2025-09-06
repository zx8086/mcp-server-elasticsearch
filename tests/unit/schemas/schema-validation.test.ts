import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { zodToJsonSchemaCompat as zodToJsonSchema } from "../../../src/utils/zodToJsonSchema";
import { Glob } from "bun";
import { readFile } from "node:fs/promises";
import path from "node:path";

interface ToolSchema {
  name: string;
  inputSchema: z.ZodSchema<any>;
  filePath: string;
}

async function collectAllToolSchemas(): Promise<ToolSchema[]> {
  const glob = new Glob("src/tools/**/*.ts");
  const toolFiles = [];
  
  for await (const file of glob.scan(".")) {
    if (file.includes("index.ts") || file.includes("types.ts") || file.includes(".test.ts") || file.includes("README.md")) {
      continue;
    }
    toolFiles.push(file);
  }

  const schemas: ToolSchema[] = [];

  for (const file of toolFiles) {
    const content = await readFile(file, "utf-8");

    // Extract tool name and schema
    const toolNameMatch = content.match(/name:\s*["']([^"']+)["']/);
    const schemaMatch = content.match(/(?:inputSchema|Params)\s*=\s*z\.object\([^)]*\)/s);

    if (toolNameMatch && schemaMatch) {
      schemas.push({
        name: toolNameMatch[1],
        inputSchema: z.object({}), // Placeholder - we'll validate conversion
        filePath: file,
      });
    }
  }

  return schemas;
}

describe("Schema Validation Tests", () => {
  test("zod-to-json-schema converts without errors", () => {
    const testSchema = z.object({
      stringField: z.string(),
      numberField: z.number(),
      booleanField: z.boolean(),
      optionalField: z.string().optional(),
      arrayField: z.array(z.string()),
      objectField: z.object({
        nested: z.string(),
      }),
    });

    const jsonSchema = zodToJsonSchema(testSchema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.type).toBe("object");
    expect(jsonSchema.properties).toBeDefined();
  });

  test("record type with passthrough works correctly", () => {
    const recordSchema = z.object({}).passthrough();

    const jsonSchema = zodToJsonSchema(recordSchema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.type).toBe("object");
    expect(jsonSchema.additionalProperties).toBe(true);
  });

  test("z.record(z.any()) converts correctly", () => {
    const recordSchema = z.record(z.any());

    const jsonSchema = zodToJsonSchema(recordSchema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.type).toBe("object");
    expect(jsonSchema.additionalProperties).toBeDefined();
  });

  test("z.unknown() converts correctly", () => {
    const unknownSchema = z.unknown();

    const jsonSchema = zodToJsonSchema(unknownSchema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });

    expect(jsonSchema).toBeDefined();
  });

  test("union types convert correctly", () => {
    const unionSchema = z.union([z.string(), z.number()]);

    const jsonSchema = zodToJsonSchema(unionSchema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });

    expect(jsonSchema).toBeDefined();
    // Union types in zod-to-json-schema are represented as anyOf array
    expect(jsonSchema.anyOf).toBeDefined();
    expect(Array.isArray(jsonSchema.anyOf)).toBe(true);
    expect(jsonSchema.anyOf.some(s => s.type === "string")).toBe(true);
    expect(jsonSchema.anyOf.some(s => s.type === "number")).toBe(true);
  });

  test("enum types convert correctly", () => {
    const enumSchema = z.enum(["option1", "option2", "option3"]);

    const jsonSchema = zodToJsonSchema(enumSchema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.enum).toEqual(["option1", "option2", "option3"]);
  });

  test("nullable and optional fields convert correctly", () => {
    const schema = z.object({
      nullableField: z.string().nullable(),
      optionalField: z.string().optional(),
      nullableOptionalField: z.string().nullable().optional(),
    });

    const jsonSchema = zodToJsonSchema(schema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.properties).toBeDefined();
  });

  test("deeply nested objects convert correctly", () => {
    const nestedSchema = z.object({
      level1: z.object({
        level2: z.object({
          level3: z.object({
            value: z.string(),
          }),
        }),
      }),
    });

    const jsonSchema = zodToJsonSchema(nestedSchema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.properties?.level1).toBeDefined();
    expect(jsonSchema.properties?.level1?.properties?.level2).toBeDefined();
  });

  test("arrays with complex types convert correctly", () => {
    const arraySchema = z.object({
      simpleArray: z.array(z.string()),
      objectArray: z.array(
        z.object({
          id: z.string(),
          value: z.number(),
        }),
      ),
      nestedArray: z.array(z.array(z.string())),
    });

    const jsonSchema = zodToJsonSchema(arraySchema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.properties?.simpleArray?.type).toBe("array");
    expect(jsonSchema.properties?.objectArray?.type).toBe("array");
    expect(jsonSchema.properties?.nestedArray?.type).toBe("array");
  });

  test("refinements are preserved", () => {
    const refinedSchema = z.object({
      email: z.string().email(),
      url: z.string().url(),
      uuid: z.string().uuid(),
      minLength: z.string().min(5),
      maxLength: z.string().max(10),
      pattern: z.string().regex(/^[A-Z]+$/),
    });

    const jsonSchema = zodToJsonSchema(refinedSchema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.properties?.email?.format).toBe("email");
    expect(jsonSchema.properties?.url?.format).toBe("uri");
    expect(jsonSchema.properties?.uuid?.format).toBe("uuid");
    expect(jsonSchema.properties?.minLength?.minLength).toBe(5);
    expect(jsonSchema.properties?.maxLength?.maxLength).toBe(10);
  });

  test("default values are preserved", () => {
    const schemaWithDefaults = z.object({
      withDefault: z.string().default("default value"),
      withNumberDefault: z.number().default(42),
      withBooleanDefault: z.boolean().default(true),
    });

    const jsonSchema = zodToJsonSchema(schemaWithDefaults, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.properties?.withDefault?.default).toBe("default value");
    expect(jsonSchema.properties?.withNumberDefault?.default).toBe(42);
    expect(jsonSchema.properties?.withBooleanDefault?.default).toBe(true);
  });

  test("descriptions are preserved", () => {
    const schemaWithDescriptions = z.object({
      field1: z.string().describe("This is field 1"),
      field2: z.number().describe("This is field 2"),
      nested: z
        .object({
          subfield: z.string().describe("This is a nested field"),
        })
        .describe("This is a nested object"),
    });

    const jsonSchema = zodToJsonSchema(schemaWithDescriptions, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.properties?.field1?.description).toBe("This is field 1");
    expect(jsonSchema.properties?.field2?.description).toBe("This is field 2");
    expect(jsonSchema.properties?.nested?.description).toBe("This is a nested object");
  });
});

describe("Tool-specific Schema Tests", () => {
  test("elasticsearch_search schema", () => {
    const searchSchema = z.object({
      index: z.string().trim().min(1).describe("Name of the Elasticsearch index"),
      queryBody: z.object({}).passthrough().describe("Elasticsearch Query DSL object"),
    });

    const jsonSchema = zodToJsonSchema(searchSchema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.type).toBe("object");
    expect(jsonSchema.properties?.index).toBeDefined();
    expect(jsonSchema.properties?.queryBody).toBeDefined();
    expect(jsonSchema.properties?.queryBody?.additionalProperties).toBe(true);
  });

  test("bulk operations schema", () => {
    const bulkSchema = z.object({
      operations: z.array(z.object({}).passthrough()),
      index: z.string().optional(),
      pipeline: z.string().optional(),
      refresh: z.string().optional(),
    });

    const jsonSchema = zodToJsonSchema(bulkSchema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.properties?.operations?.type).toBe("array");
    expect(jsonSchema.properties?.operations?.items).toBeDefined();
  });

  test("ILM policy schema", () => {
    const ilmSchema = z.object({
      policy: z.string().min(1),
      body: z.object({}).passthrough().optional(),
      masterTimeout: z.string().optional(),
      timeout: z.string().optional(),
    });

    const jsonSchema = zodToJsonSchema(ilmSchema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.properties?.policy).toBeDefined();
    expect(jsonSchema.properties?.body).toBeDefined();
  });

  test("complex nested query schema", () => {
    const complexSchema = z.object({
      index: z.string(),
      query: z.object({
        bool: z
          .object({
            must: z.array(z.object({}).passthrough()).optional(),
            should: z.array(z.object({}).passthrough()).optional(),
            filter: z.array(z.object({}).passthrough()).optional(),
            must_not: z.array(z.object({}).passthrough()).optional(),
          })
          .passthrough()
          .optional(),
      }),
      aggs: z.object({}).passthrough().optional(),
    });

    const jsonSchema = zodToJsonSchema(complexSchema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.properties?.query).toBeDefined();
    expect(jsonSchema.properties?.aggs).toBeDefined();
  });
});