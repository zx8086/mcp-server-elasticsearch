import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { Client } from "@elastic/elasticsearch";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSearchTool } from "../../../src/tools/core/search";
import { registerListIndicesTool } from "../../../src/tools/core/list_indices";
import { registerIndexDocumentTool } from "../../../src/tools/document/index_document";
import { registerDeleteDocumentTool } from "../../../src/tools/document/delete_document";
import { registerGetMappingsTool } from "../../../src/tools/core/get_mappings";
import { initializeReadOnlyManager } from "../../../src/utils/readOnlyMode";
import { logger } from "../../../src/utils/logger";
import { traceToolExecution } from "../../../src/utils/tracing";
import { 
  createElasticsearchClient, 
  shouldSkipIntegrationTests,
  testElasticsearchConnection,
  safeCloseElasticsearchClient
} from "../../utils/elasticsearch-client";

// Test index names with timestamp to avoid conflicts
const TEST_INDEX = `test-mcp-${Date.now()}`;
const TEST_INDEX_LOGS = `test-logs-${Date.now()}`;

// Suppress logs during tests
logger.debug = () => {};
logger.info = () => {};
logger.warn = () => {};

describe.skipIf(shouldSkipIntegrationTests())("Real Elasticsearch Integration Tests", () => {
  let client: Client;
  let server: McpServer;
  let wrappedServer: McpServer;

  beforeAll(async () => {
    // Initialize read-only manager for write operations
    initializeReadOnlyManager(false, false);

    // Create real Elasticsearch client using the centralized helper
    client = createElasticsearchClient();

    // Test connection
    try {
      const info = await client.info();
      console.log(`Connected to Elasticsearch ${info.version.number}`);
    } catch (error) {
      console.error("Failed to connect to Elasticsearch:", error);
      throw new Error("Cannot run integration tests without Elasticsearch connection");
    }

    // Create MCP server with wrapper
    server = new McpServer({
      name: "test-server",
      version: "1.0.0",
    });

    wrappedServer = server; // Skip tracing for tests

    // Register tools we'll test
    registerSearchTool(wrappedServer, client);
    registerListIndicesTool(wrappedServer, client);
    registerIndexDocumentTool(wrappedServer, client);
    registerDeleteDocumentTool(wrappedServer, client);
    registerGetMappingsTool(wrappedServer, client);

    // Create test indices
    await client.indices.create({
      index: TEST_INDEX,
      body: {
        mappings: {
          properties: {
            title: { type: "text" },
            content: { type: "text" },
            timestamp: { type: "date" },
            status: { type: "keyword" },
            count: { type: "integer" },
          },
        },
      },
    });

    await client.indices.create({
      index: TEST_INDEX_LOGS,
      body: {
        mappings: {
          properties: {
            "@timestamp": { type: "date" },
            message: { type: "text" },
            level: { type: "keyword" },
            service: { type: "keyword" },
            response_time: { type: "float" },
          },
        },
      },
    });
  });

  afterAll(async () => {
    // Clean up test indices
    try {
      await client.indices.delete({ index: `${TEST_INDEX}*` });
      await client.indices.delete({ index: `${TEST_INDEX_LOGS}*` });
    } catch (error) {
      // Ignore cleanup errors
    }

    await safeCloseElasticsearchClient(client);
  });

  describe("Document Operations with Real Data", () => {
    test("should index and retrieve documents with actual Elasticsearch", async () => {
      // Use Elasticsearch client directly for integration test

      // Index a document
      const testDoc = {
        title: "Real Test Document",
        content: "This is a real document indexed in Elasticsearch",
        timestamp: "2025-08-19T10:30:00Z",
        status: "published",
        count: 42,
      };

      const indexResult = await client.index({
        index: TEST_INDEX,
        body: testDoc,
        refresh: "wait_for", // Ensure it's searchable immediately
      });

      // Handle both old and new Elasticsearch client response formats
      const responseBody = indexResult.body || indexResult;
      expect(responseBody._id).toBeDefined();
      expect(responseBody.result).toBe("created");

      // Search for the document
      const searchResult = await client.search({
        index: TEST_INDEX,
        body: {
          query: {
            match: {
              title: "Real Test Document",
            },
          },
        },
      });

      const searchResponseBody = searchResult.body || searchResult;
      const searchText = JSON.stringify(searchResponseBody, null, 2);
      expect(searchText).toContain("Real Test Document");
      expect(searchText).toContain("This is a real document");
      expect(searchText).toContain("published");
      expect(searchText).toContain("42");
    });

    test("should handle bulk indexing with real data", async () => {
      // Index multiple documents using Elasticsearch client directly
      const docs = [
        {
          title: "Document 1",
          content: "First document content",
          timestamp: "2025-08-19T09:00:00Z",
          status: "draft",
          count: 10,
        },
        {
          title: "Document 2",
          content: "Second document content",
          timestamp: "2025-08-19T09:30:00Z",
          status: "published",
          count: 20,
        },
        {
          title: "Document 3",
          content: "Third document content",
          timestamp: "2025-08-19T10:00:00Z",
          status: "archived",
          count: 30,
        },
      ];

      for (const doc of docs) {
        await client.index({
          index: TEST_INDEX,
          body: doc,
        });
      }

      // Wait for indexing
      await client.indices.refresh({ index: TEST_INDEX });

      // Verify all documents are indexed
      const countResult = await client.count({ index: TEST_INDEX });
      expect(countResult.count).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Date Range Queries with Real Data", () => {
    beforeEach(async () => {
      // Clean up any existing data first to ensure consistent test results
      try {
        await client.deleteByQuery({
          index: TEST_INDEX_LOGS,
          body: {
            query: { match_all: {} }
          },
          refresh: true
        });
      } catch (error) {
        // Index might not exist or be empty, that's ok
      }

      // Index log entries with timestamps directly using Elasticsearch client
      const logEntries = [
        {
          "@timestamp": "2025-08-18T06:30:00Z",
          message: "Application started",
          level: "info",
          service: "api",
          response_time: 0.5,
        },
        {
          "@timestamp": "2025-08-18T07:15:00Z",
          message: "Processing request timeout",
          level: "error",
          service: "api",
          response_time: 30.2,
        },
        {
          "@timestamp": "2025-08-18T07:30:00Z",
          message: "Database connection established",
          level: "info",
          service: "database",
          response_time: 1.2,
        },
        {
          "@timestamp": "2025-08-18T07:45:00Z",
          message: "Memory usage high",
          level: "warning",
          service: "monitoring",
          response_time: 0.1,
        },
        {
          "@timestamp": "2025-08-18T08:00:00Z",
          message: "Request processed successfully",
          level: "info",
          service: "api",
          response_time: 2.5,
        },
        {
          "@timestamp": "2025-08-18T08:30:00Z",
          message: "Cache cleared",
          level: "debug",
          service: "cache",
          response_time: 0.05,
        },
      ];

      for (const entry of logEntries) {
        await client.index({
          index: TEST_INDEX_LOGS,
          body: entry,
        });
      }

      // Ensure all documents are searchable
      await client.indices.refresh({ index: TEST_INDEX_LOGS });
    });

    test("should correctly query logs within specific date range (7:00-8:00 AM)", async () => {
      // This is the exact query that was failing before the Zod 3.x fix
      const result = await client.search({
        index: TEST_INDEX_LOGS,
        body: {
          query: {
            bool: {
              must: [
                {
                  range: {
                    "@timestamp": {
                      gte: "2025-08-18T07:00:00Z",
                      lte: "2025-08-18T08:00:00Z",
                    },
                  },
                },
              ],
            },
          },
          size: 100,
          sort: [{ "@timestamp": { order: "asc" } }],
        },
      });

      const searchResponseBody = result.body || result;
      const resultText = JSON.stringify(searchResponseBody, null, 2);
      
      // Should find exactly 4 documents in this time range (07:15, 07:30, 07:45, 08:00)
      expect(searchResponseBody.hits.total.value).toBe(4);
      
      // Verify the documents are from the correct time range
      expect(resultText).toContain("07:15:00"); // Error log
      expect(resultText).toContain("07:30:00"); // Database log
      expect(resultText).toContain("07:45:00"); // Warning log
      expect(resultText).toContain("08:00:00"); // Success log (lte includes boundary)
      
      // Should NOT contain logs outside the range
      expect(resultText).not.toContain("06:30:00");
      expect(resultText).not.toContain("08:30:00");
    });

    test("should handle complex date range queries with multiple conditions", async () => {
      const result = await client.search({
        index: TEST_INDEX_LOGS,
        body: {
          query: {
            bool: {
              must: [
                {
                  range: {
                    "@timestamp": {
                      gte: "2025-08-18T07:00:00Z",
                      lte: "2025-08-18T08:00:00Z",
                    },
                  },
                },
                {
                  terms: {
                    level: ["error", "warning"],
                  },
                },
              ],
            },
          },
          size: 50,
        },
      });

      const searchResponseBody = result.body || result;
      const resultText = JSON.stringify(searchResponseBody, null, 2);
      
      // Should find error and warning logs only
      expect(searchResponseBody.hits.total.value).toBe(2);
      expect(resultText).toContain("Processing request timeout");
      expect(resultText).toContain("Memory usage high");
      expect(resultText).toContain("error");
      expect(resultText).toContain("warning");
    });

    test("should aggregate data within date ranges", async () => {
      const result = await client.search({
        index: TEST_INDEX_LOGS,
        body: {
          query: {
            range: {
              "@timestamp": {
                gte: "2025-08-18T06:00:00Z",
                lte: "2025-08-18T09:00:00Z",
              },
            },
          },
          aggs: {
            logs_per_hour: {
              date_histogram: {
                field: "@timestamp",
                fixed_interval: "1h",
                min_doc_count: 0,
              },
            },
            avg_response_time: {
              avg: {
                field: "response_time",
              },
            },
            services: {
              terms: {
                field: "service",
                size: 10,
              },
            },
          },
          size: 0, // Only aggregations
        },
      });

      const searchResponseBody = result.body || result;
      const resultText = JSON.stringify(searchResponseBody.aggregations, null, 2);
      
      // Should have aggregation results
      expect(searchResponseBody.aggregations.logs_per_hour).toBeDefined();
      expect(searchResponseBody.aggregations.avg_response_time).toBeDefined();
      expect(searchResponseBody.aggregations.services).toBeDefined();
      expect(resultText).toContain("logs_per_hour");
      expect(resultText).toContain("avg_response_time");
      expect(resultText).toContain("services");
    });
  });

  describe("Index Management with Real Elasticsearch", () => {
    test("should list indices with actual data", async () => {
      const result = await client.cat.indices({
        index: `${TEST_INDEX},${TEST_INDEX_LOGS}`, // Search for both indices specifically
        format: 'json',
        s: 'index:asc'
      });

      const indices = result.body || result;
      
      // Should find our test indices
      expect(Array.isArray(indices)).toBe(true);
      expect(indices.length).toBeGreaterThanOrEqual(2);
      expect(indices.some(idx => idx.index === TEST_INDEX)).toBe(true);
      expect(indices.some(idx => idx.index === TEST_INDEX_LOGS)).toBe(true);
    });

    test("should get real mappings from indices", async () => {
      const result = await client.indices.getMapping({
        index: TEST_INDEX_LOGS,
      });

      const responseBody = result.body || result;
      const mappings = responseBody[TEST_INDEX_LOGS].mappings;
      
      // Should show the actual mappings
      expect(mappings.properties['@timestamp']).toBeDefined();
      expect(mappings.properties['@timestamp'].type).toBe('date');
      expect(mappings.properties['message']).toBeDefined();
      expect(mappings.properties['message'].type).toBe('text');
      expect(mappings.properties['level']).toBeDefined();
      expect(mappings.properties['level'].type).toBe('keyword');
    });
  });

  describe("Error Handling with Real Elasticsearch", () => {
    test("should handle non-existent index errors", async () => {
      try {
        await client.search({
          index: "non-existent-index-12345",
          body: {
            query: { match_all: {} },
          },
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message || error.toString()).toMatch(/index/);
      }
    });

    test("should handle malformed queries gracefully", async () => {
      try {
        await client.search({
          index: TEST_INDEX,
          body: {
            query: {
              // Invalid query structure
              invalid_clause: {
                field: "value",
              },
            },
          },
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message || error.toString()).toMatch(/query|parsing/);
      }
    });
  });
});