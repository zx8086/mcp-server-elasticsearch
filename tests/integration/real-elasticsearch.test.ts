import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { Client } from "@elastic/elasticsearch";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSearchTool } from "../../src/tools/core/search.js";
import { registerListIndicesTool } from "../../src/tools/core/list_indices.js";
import { registerIndexDocumentTool } from "../../src/tools/document/index_document.js";
import { registerDeleteDocumentTool } from "../../src/tools/document/delete_document.js";
import { registerGetMappingsTool } from "../../src/tools/core/get_mappings.js";
import { initializeReadOnlyManager } from "../../src/utils/readOnlyMode.js";
import { logger } from "../../src/utils/logger.js";
import { wrapServerWithTracing } from "../../src/utils/universalToolWrapper.js";
import { 
  createElasticsearchClient, 
  shouldSkipIntegrationTests,
  testElasticsearchConnection 
} from "../utils/elasticsearch-client.js";

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

    wrappedServer = wrapServerWithTracing(server);

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

    await client.close();
  });

  describe("Document Operations with Real Data", () => {
    test("should index and retrieve documents with actual Elasticsearch", async () => {
      const indexTool = (server as any).getTool("elasticsearch_index_document");
      const searchTool = (server as any).getTool("elasticsearch_search");

      // Index a document
      const testDoc = {
        title: "Real Test Document",
        content: "This is a real document indexed in Elasticsearch",
        timestamp: "2025-08-19T10:30:00Z",
        status: "published",
        count: 42,
      };

      const indexResult = await indexTool.handler({
        index: TEST_INDEX,
        document: testDoc,
        refresh: "wait_for", // Ensure it's searchable immediately
      });

      expect(indexResult.content[0].text).toContain("_id");
      expect(indexResult.content[0].text).toContain("created");

      // Search for the document
      const searchResult = await searchTool.handler({
        index: TEST_INDEX,
        queryBody: {
          query: {
            match: {
              title: "Real Test Document",
            },
          },
        },
      });

      const searchText = searchResult.content[1].text;
      expect(searchText).toContain("Real Test Document");
      expect(searchText).toContain("This is a real document");
      expect(searchText).toContain("status: published");
      expect(searchText).toContain("count: 42");
    });

    test("should handle bulk indexing with real data", async () => {
      const indexTool = (server as any).getTool("elasticsearch_index_document");

      // Index multiple documents
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
        await indexTool.handler({
          index: TEST_INDEX,
          document: doc,
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
      // Index log entries with timestamps
      const indexTool = (server as any).getTool("elasticsearch_index_document");

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
        await indexTool.handler({
          index: TEST_INDEX_LOGS,
          document: entry,
        });
      }

      // Ensure all documents are searchable
      await client.indices.refresh({ index: TEST_INDEX_LOGS });
    });

    test("should correctly query logs within specific date range (7:00-8:00 AM)", async () => {
      const searchTool = (server as any).getTool("elasticsearch_search");

      // This is the exact query that was failing before the Zod 3.x fix
      const result = await searchTool.handler({
        index: TEST_INDEX_LOGS,
        queryBody: {
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

      const resultText = result.content[1].text;
      
      // Should find exactly 3 documents in this time range
      expect(result.content[0].text).toContain("Found 3 documents");
      
      // Verify the documents are from the correct time range
      expect(resultText).toContain("07:15:00"); // Error log
      expect(resultText).toContain("07:30:00"); // Database log
      expect(resultText).toContain("07:45:00"); // Warning log
      
      // Should NOT contain logs outside the range
      expect(resultText).not.toContain("06:30:00");
      expect(resultText).not.toContain("08:30:00");
    });

    test("should handle complex date range queries with multiple conditions", async () => {
      const searchTool = (server as any).getTool("elasticsearch_search");

      const result = await searchTool.handler({
        index: TEST_INDEX_LOGS,
        queryBody: {
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

      const resultText = result.content[1].text;
      
      // Should find error and warning logs only
      expect(result.content[0].text).toContain("Found 2 documents");
      expect(resultText).toContain("Processing request timeout");
      expect(resultText).toContain("Memory usage high");
      expect(resultText).toContain("level: error");
      expect(resultText).toContain("level: warning");
    });

    test("should aggregate data within date ranges", async () => {
      const searchTool = (server as any).getTool("elasticsearch_search");

      const result = await searchTool.handler({
        index: TEST_INDEX_LOGS,
        queryBody: {
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

      const resultText = result.content[2].text;
      
      // Should have aggregation results
      expect(resultText).toContain("logs_per_hour");
      expect(resultText).toContain("avg_response_time");
      expect(resultText).toContain("services");
    });
  });

  describe("Index Management with Real Elasticsearch", () => {
    test("should list indices with actual data", async () => {
      const listTool = (server as any).getTool("elasticsearch_list_indices");

      const result = await listTool.handler({
        indexPattern: `${TEST_INDEX}*`,
        includeSize: true,
        sortBy: "name",
      });

      const resultText = result.content[0].text;
      
      // Should find our test indices
      expect(resultText).toContain("Found");
      expect(resultText).toContain("indices");
      expect(resultText).toContain(TEST_INDEX);
      expect(resultText).toContain(TEST_INDEX_LOGS);
    });

    test("should get real mappings from indices", async () => {
      const mappingsTool = (server as any).getTool("elasticsearch_get_mappings");

      const result = await mappingsTool.handler({
        index: TEST_INDEX_LOGS,
      });

      const resultText = result.content[0].text;
      
      // Should show the actual mappings
      expect(resultText).toContain("@timestamp");
      expect(resultText).toContain("type: date");
      expect(resultText).toContain("message");
      expect(resultText).toContain("type: text");
      expect(resultText).toContain("level");
      expect(resultText).toContain("type: keyword");
    });
  });

  describe("Error Handling with Real Elasticsearch", () => {
    test("should handle non-existent index errors", async () => {
      const searchTool = (server as any).getTool("elasticsearch_search");

      const result = await searchTool.handler({
        index: "non-existent-index-12345",
        queryBody: {
          query: { match_all: {} },
        },
      });

      const errorText = result.content[0].text;
      expect(errorText).toContain("Error");
      expect(errorText.toLowerCase()).toContain("index");
    });

    test("should handle malformed queries gracefully", async () => {
      const searchTool = (server as any).getTool("elasticsearch_search");

      const result = await searchTool.handler({
        index: TEST_INDEX,
        queryBody: {
          query: {
            // Invalid query structure
            invalid_clause: {
              field: "value",
            },
          },
        },
      });

      const errorText = result.content[0].text;
      expect(errorText).toContain("Error");
    });
  });
});