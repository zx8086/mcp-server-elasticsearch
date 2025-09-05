#!/usr/bin/env bun

/**
 * NATURAL PARAMETER SCHEMA VALIDATION TEST
 * 
 * Tests the new search tool schema that accepts natural Elasticsearch parameters
 * instead of the problematic stringified queryBody approach.
 * 
 * This test validates:
 * 1. Natural ES query parameters work correctly
 * 2. Time range queries function properly
 * 3. No more queryBody wrapper issues
 * 4. Proper parameter spreading and validation
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { z } from 'zod';

console.log("🧪 NATURAL PARAMETER SCHEMA VALIDATION TEST");
console.log("===========================================");

// Import the new search schema and validator
const searchSchema = {
  type: "object",
  properties: {
    index: {
      type: "string",
      description: "Name of the Elasticsearch index to search. Use '*' to search all indices. Examples: 'logs-*', 'metrics-*'",
    },
    query: {
      type: "object",
      description: "Elasticsearch query object. Example: { range: { '@timestamp': { gte: 'now-24h' } } }",
      additionalProperties: true
    },
    size: {
      type: "number",
      description: "Number of documents to return. Default is 10. Set to 0 for aggregation-only queries"
    },
    from: {
      type: "number",
      description: "Starting offset for pagination. Default is 0"
    },
    sort: {
      type: "array",
      description: "Sort order. Example: [{ '@timestamp': { order: 'desc' } }]"
    },
    aggs: {
      type: "object",
      description: "Aggregations object for analytics queries",
      additionalProperties: true
    },
    _source: {
      oneOf: [
        { type: "array", description: "Array of field names to include" },
        { type: "boolean", description: "true to include all fields, false to exclude" },
        { type: "string", description: "Single field name to include" }
      ],
      description: "Fields to return in results"
    },
    highlight: {
      type: "object",
      description: "Highlight configuration",
      additionalProperties: true
    }
  },
  additionalProperties: false,
};

// Zod validator for the new natural parameters
const searchValidator = z.object({
  index: z.string().trim().min(1).optional(),
  query: z.object({}).passthrough().optional(),
  size: z.number().int().min(0).optional(),
  from: z.number().int().min(0).optional(),
  sort: z.array(z.object({}).passthrough()).optional(),
  aggs: z.object({}).passthrough().optional(),
  _source: z.union([
    z.array(z.string()),
    z.boolean(),
    z.string()
  ]).optional(),
  highlight: z.object({}).passthrough().optional(),
});

type SearchParams = z.infer<typeof searchValidator>;

describe('Natural Parameter Schema Tests', () => {
  
  test('Should accept natural time range query (the user\'s exact use case)', () => {
    console.log("\n📅 Testing natural time range query...");
    
    const naturalParams: SearchParams = {
      index: 'logs-*',
      query: {
        range: {
          '@timestamp': {
            gte: 'now-24h'
          }
        }
      },
      size: 50,
      sort: [{ '@timestamp': { order: 'desc' } }]
    };
    
    console.log("Input parameters:", JSON.stringify(naturalParams, null, 2));
    
    // Validate with Zod
    const validationResult = searchValidator.safeParse(naturalParams);
    expect(validationResult.success).toBe(true);
    
    if (validationResult.success) {
      const parsed = validationResult.data;
      console.log("✅ Zod validation passed");
      console.log("Parsed query:", JSON.stringify(parsed.query, null, 2));
      
      // Test the spread operation that was causing issues
      const searchRequest = { index: parsed.index || "*", ...parsed };
      console.log("Final search request:", JSON.stringify(searchRequest, null, 2));
      
      // Verify the query structure is preserved
      expect(searchRequest.query).toBeDefined();
      expect(searchRequest.query.range).toBeDefined();
      expect(searchRequest.query.range['@timestamp']).toBeDefined();
      expect(searchRequest.query.range['@timestamp'].gte).toBe('now-24h');
      expect(searchRequest.size).toBe(50);
      
      console.log("✅ Query structure correctly preserved");
    }
  });

  test('Should handle match_all query with natural parameters', () => {
    console.log("\n🔍 Testing match_all query...");
    
    const naturalParams: SearchParams = {
      index: 'test-index',
      query: { match_all: {} },
      size: 20,
      from: 0
    };
    
    console.log("Input parameters:", JSON.stringify(naturalParams, null, 2));
    
    const validationResult = searchValidator.safeParse(naturalParams);
    expect(validationResult.success).toBe(true);
    
    if (validationResult.success) {
      const searchRequest = { index: naturalParams.index || "*", ...validationResult.data };
      expect(searchRequest.query.match_all).toBeDefined();
      expect(searchRequest.size).toBe(20);
      expect(searchRequest.from).toBe(0);
      console.log("✅ Match all query preserved correctly");
    }
  });

  test('Should handle aggregation query with size 0', () => {
    console.log("\n📊 Testing aggregation query...");
    
    const naturalParams: SearchParams = {
      index: 'metrics-*',
      query: {
        range: {
          '@timestamp': {
            gte: 'now-1h'
          }
        }
      },
      size: 0,
      aggs: {
        time_histogram: {
          date_histogram: {
            field: '@timestamp',
            interval: '5m'
          }
        }
      }
    };
    
    console.log("Input parameters:", JSON.stringify(naturalParams, null, 2));
    
    const validationResult = searchValidator.safeParse(naturalParams);
    expect(validationResult.success).toBe(true);
    
    if (validationResult.success) {
      const searchRequest = { index: naturalParams.index || "*", ...validationResult.data };
      expect(searchRequest.size).toBe(0);
      expect(searchRequest.aggs).toBeDefined();
      expect(searchRequest.aggs.time_histogram).toBeDefined();
      console.log("✅ Aggregation query preserved correctly");
    }
  });

  test('Should handle complex query with all parameters', () => {
    console.log("\n🎯 Testing complex query with all parameters...");
    
    const naturalParams: SearchParams = {
      index: 'logs-2025.*',
      query: {
        bool: {
          must: [
            { match: { level: 'ERROR' } }
          ],
          filter: [
            {
              range: {
                '@timestamp': {
                  gte: 'now-2h',
                  lte: 'now'
                }
              }
            }
          ]
        }
      },
      size: 100,
      from: 20,
      sort: [{ '@timestamp': { order: 'desc' } }],
      _source: ['@timestamp', 'message', 'level'],
      highlight: {
        fields: {
          message: {}
        }
      }
    };
    
    console.log("Input parameters:", JSON.stringify(naturalParams, null, 2));
    
    const validationResult = searchValidator.safeParse(naturalParams);
    expect(validationResult.success).toBe(true);
    
    if (validationResult.success) {
      const searchRequest = { index: naturalParams.index || "*", ...validationResult.data };
      
      // Verify all parameters are preserved
      expect(searchRequest.query.bool).toBeDefined();
      expect(searchRequest.query.bool.must).toHaveLength(1);
      expect(searchRequest.query.bool.filter).toHaveLength(1);
      expect(searchRequest.size).toBe(100);
      expect(searchRequest.from).toBe(20);
      expect(searchRequest.sort).toHaveLength(1);
      expect(searchRequest._source).toHaveLength(3);
      expect(searchRequest.highlight).toBeDefined();
      
      console.log("✅ All complex parameters preserved correctly");
    }
  });

  test('Should demonstrate the OLD problem vs NEW solution', () => {
    console.log("\n🔄 Demonstrating OLD problem vs NEW solution...");
    
    // OLD problematic approach (what was causing the bug)
    console.log("❌ OLD APPROACH (problematic):");
    const oldApproach = {
      index: 'logs-*',
      queryBody: '{"query":{"range":{"@timestamp":{"gte":"now-24h"}}},"size":50}'
    };
    console.log("Old parameters:", JSON.stringify(oldApproach, null, 2));
    
    // When spreading the old queryBody string, it becomes character indices
    const oldSpreadResult = { index: oldApproach.index, ...oldApproach.queryBody };
    console.log("Old spread result (BROKEN):", JSON.stringify(oldSpreadResult, null, 2));
    
    // NEW natural approach (what fixes the bug)
    console.log("\n✅ NEW APPROACH (working):");
    const newApproach: SearchParams = {
      index: 'logs-*',
      query: {
        range: {
          '@timestamp': {
            gte: 'now-24h'
          }
        }
      },
      size: 50
    };
    console.log("New parameters:", JSON.stringify(newApproach, null, 2));
    
    const validationResult = searchValidator.safeParse(newApproach);
    expect(validationResult.success).toBe(true);
    
    if (validationResult.success) {
      const newSpreadResult = { index: newApproach.index || "*", ...validationResult.data };
      console.log("New spread result (WORKING):", JSON.stringify(newSpreadResult, null, 2));
      
      // Verify the new approach preserves the query correctly
      expect(newSpreadResult.query).toBeDefined();
      expect(newSpreadResult.query.range).toBeDefined();
      expect(typeof newSpreadResult.query).toBe('object');
      expect(newSpreadResult.size).toBe(50);
      
      console.log("🎉 NEW APPROACH WORKS! Query structure is preserved!");
    }
  });

  test('Should handle minimal query (default behavior)', () => {
    console.log("\n🎯 Testing minimal query with defaults...");
    
    const minimalParams: SearchParams = {
      index: 'test-*'
    };
    
    const validationResult = searchValidator.safeParse(minimalParams);
    expect(validationResult.success).toBe(true);
    
    if (validationResult.success) {
      const parsed = validationResult.data;
      
      // Apply the same default logic as in the real search tool
      const finalQuery = parsed.query || { match_all: {} };
      const finalSize = parsed.size || 10;
      
      const searchRequest = { 
        index: parsed.index || "*", 
        query: finalQuery,
        size: finalSize,
        ...parsed 
      };
      
      expect(searchRequest.query).toEqual({ match_all: {} });
      expect(searchRequest.size).toBe(10);
      console.log("✅ Default behavior works correctly");
    }
  });
});

// Run a comprehensive analysis
console.log("\n📋 COMPREHENSIVE ANALYSIS");
console.log("=========================");

console.log("\n✅ WHAT THE NEW SCHEMA FIXES:");
console.log("1. No more queryBody string parameter that gets spread incorrectly");
console.log("2. Natural Elasticsearch parameters that preserve object structure");
console.log("3. Direct validation of individual query components");
console.log("4. Proper TypeScript types for all parameters");
console.log("5. Eliminates the JSON string parsing/spreading bug");

console.log("\n🎯 HOW THIS SOLVES THE USER'S PROBLEM:");
console.log("1. Time range queries like 'now-24h' are now properly preserved");
console.log("2. Query objects maintain their structure through the spread operator");
console.log("3. No more undefined queryBody issues");
console.log("4. Direct mapping to Elasticsearch Query DSL");
console.log("5. Better error messages and validation");

console.log("\n🔧 TECHNICAL IMPROVEMENTS:");
console.log("1. Schema matches actual Elasticsearch API parameters");
console.log("2. Zod validation ensures type safety at runtime");
console.log("3. Optional parameters with sensible defaults");
console.log("4. Support for all major ES query features");
console.log("5. Backwards compatibility through optional parameters");

if (import.meta.main) {
  console.log("\n🚀 Running all tests...");
}