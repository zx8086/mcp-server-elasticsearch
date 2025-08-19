import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { zodToJsonSchemaCompat as zodToJsonSchema } from "../../src/utils/zodToJsonSchema.js";

describe("elasticsearch_search Tool Fix Validation", () => {
  test("original z.record(z.any()) pattern vs new z.object({}).passthrough()", () => {
    // The old pattern that was causing issues
    const oldPattern = () => {
      try {
        const schema = z.object({
          index: z.string(),
          queryBody: z.record(z.any()),
        });
        
        const jsonSchema = zodToJsonSchema(schema, {
          $refStrategy: "none",
          target: "jsonSchema7",
          removeAdditionalStrategy: "passthrough",
        });
        
        return jsonSchema;
      } catch (error) {
        return { error: String(error) };
      }
    };
    
    // The new pattern that works correctly
    const newPattern = () => {
      const schema = z.object({
        index: z.string(),
        queryBody: z.object({}).passthrough(),
      });
      
      const jsonSchema = zodToJsonSchema(schema, {
        $refStrategy: "none",
        target: "jsonSchema7",
        removeAdditionalStrategy: "passthrough",
      });
      
      return jsonSchema;
    };
    
    const oldResult = oldPattern();
    const newResult = newPattern();
    
    // The new pattern should successfully create a JSON schema
    expect(newResult).toBeDefined();
    expect(newResult.type).toBe("object");
    expect(newResult.properties).toBeDefined();
    expect(newResult.properties.queryBody).toBeDefined();
    expect(newResult.properties.queryBody.type).toBe("object");
    expect(newResult.properties.queryBody.additionalProperties).toBe(true);
  });
  
  test("queryBody accepts any valid Elasticsearch query", () => {
    const schema = z.object({
      index: z.string().trim().min(1),
      queryBody: z.object({}).passthrough(),
    });
    
    const testQueries = [
      // Empty query (match all)
      {
        index: "test-index",
        queryBody: {},
      },
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
      // Complex bool query with nested conditions
      {
        index: "test-index",
        queryBody: {
          query: {
            bool: {
              must: [
                { term: { status: "active" } },
                { match: { content: "important" } },
              ],
              should: [
                { match: { category: "news" } },
                { match: { category: "blog" } },
              ],
              filter: [
                { range: { date: { gte: "2024-01-01" } } },
                { exists: { field: "author" } },
              ],
              must_not: [
                { term: { deleted: true } },
              ],
              minimum_should_match: 1,
            },
          },
          size: 20,
          from: 0,
          sort: [
            { date: { order: "desc" } },
            "_score",
          ],
        },
      },
      // Aggregation query
      {
        index: "test-index",
        queryBody: {
          size: 0,
          aggs: {
            status_breakdown: {
              terms: {
                field: "status.keyword",
                size: 10,
              },
              aggs: {
                avg_score: {
                  avg: {
                    field: "score",
                  },
                },
              },
            },
            date_histogram: {
              date_histogram: {
                field: "date",
                calendar_interval: "month",
              },
            },
          },
        },
      },
      // Query with highlighting
      {
        index: "test-index",
        queryBody: {
          query: {
            multi_match: {
              query: "search text",
              fields: ["title^2", "content", "summary"],
            },
          },
          highlight: {
            fields: {
              title: {},
              content: {
                fragment_size: 150,
                number_of_fragments: 3,
              },
            },
          },
        },
      },
      // Query with script fields
      {
        index: "test-index",
        queryBody: {
          query: { match_all: {} },
          script_fields: {
            calculated_score: {
              script: {
                lang: "painless",
                source: "doc['likes'].value * params.multiplier",
                params: {
                  multiplier: 2,
                },
              },
            },
          },
        },
      },
    ];
    
    // All queries should parse successfully
    for (const query of testQueries) {
      const result = schema.parse(query);
      expect(result).toBeDefined();
      expect(result.index).toBe(query.index);
      expect(result.queryBody).toEqual(query.queryBody);
    }
  });
  
  test("converted schema works with MCP protocol expectations", () => {
    const schema = z.object({
      index: z.string().trim().min(1).describe("Name of the Elasticsearch index"),
      queryBody: z.object({}).passthrough().describe("Elasticsearch Query DSL object"),
    });
    
    const jsonSchema = zodToJsonSchema(schema, {
      $refStrategy: "none",
      target: "jsonSchema7",
      removeAdditionalStrategy: "passthrough",
    });
    
    // Verify the JSON Schema structure matches MCP expectations
    // Note: We now remove $schema for MCP SDK compatibility
    expect(jsonSchema).not.toHaveProperty("$schema");
    expect(jsonSchema.type).toBe("object");
    expect(jsonSchema.properties).toBeDefined();
    expect(jsonSchema.required).toEqual(["index", "queryBody"]);
    
    // Index property
    expect(jsonSchema.properties.index).toBeDefined();
    expect(jsonSchema.properties.index.type).toBe("string");
    expect(jsonSchema.properties.index.minLength).toBe(1);
    expect(jsonSchema.properties.index.description).toBe("Name of the Elasticsearch index");
    
    // QueryBody property
    expect(jsonSchema.properties.queryBody).toBeDefined();
    expect(jsonSchema.properties.queryBody.type).toBe("object");
    expect(jsonSchema.properties.queryBody.additionalProperties).toBe(true);
    expect(jsonSchema.properties.queryBody.description).toBe("Elasticsearch Query DSL object");
  });
});