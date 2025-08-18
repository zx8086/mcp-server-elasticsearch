import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Client } from "@elastic/elasticsearch";
import Mock from "@elastic/elasticsearch-mock";
import { logger } from "../../src/utils/logger.js";
import { initializeReadOnlyManager } from "../../src/utils/readOnlyMode.js";

// Suppress logs during tests
logger.debug = () => {};
logger.info = () => {};
logger.warn = () => {};
logger.error = () => {};

// Initialize readOnlyManager for tests
initializeReadOnlyManager(false, false);

describe("SQL and Advanced Tools Tests", () => {
  let mock: Mock;
  let client: Client;

  beforeEach(() => {
    mock = new Mock();
    client = new Client({
      node: "http://localhost:9200",
      Connection: mock.getConnection(),
    });
  });

  afterEach(() => {
    mock.clearAll();
  });

  describe("SQL Query Operations", () => {
    test("elasticsearch_execute_sql_query executes SQL and returns results", async () => {
      mock.add(
        {
          method: "POST",
          path: "/_sql",
        },
        () => ({
          columns: [
            { name: "title", type: "text" },
            { name: "status", type: "keyword" },
            { name: "count", type: "long" },
          ],
          rows: [
            ["Document 1", "active", 100],
            ["Document 2", "inactive", 50],
            ["Document 3", "pending", 75],
          ],
        })
      );

      const { registerExecuteSqlQueryTool } = await import("../../src/tools/search/execute_sql_query.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_execute_sql_query") {
            registeredHandler = handler;
          }
        },
      };

      registerExecuteSqlQueryTool(mockServer as any, client);

      const result = await registeredHandler({
        query: "SELECT title, status, count FROM test_index WHERE status = 'active'",
      });

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("Document 1");
      expect(responseText).toContain("active");
    });

    test("elasticsearch_translate_sql_query converts SQL to Query DSL", async () => {
      mock.add(
        {
          method: "POST",
          path: "/_sql/translate",
        },
        () => ({
          query: {
            bool: {
              must: [
                { match: { status: "active" } }
              ]
            }
          },
          size: 100,
          _source: ["title", "status", "count"],
        })
      );

      const { registerTranslateSqlQueryTool } = await import("../../src/tools/advanced/translate_sql_query.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_translate_sql_query") {
            registeredHandler = handler;
          }
        },
      };

      registerTranslateSqlQueryTool(mockServer as any, client);

      const result = await registeredHandler({
        query: "SELECT * FROM test_index WHERE status = 'active'",
      });

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("bool");
      expect(responseText).toContain("match");
    });

    test("elasticsearch_clear_sql_cursor frees SQL cursor resources", async () => {
      mock.add(
        {
          method: "POST",
          path: "/_sql/close",
        },
        () => ({
          succeeded: true,
        })
      );

      const { registerClearSqlCursorTool } = await import("../../src/tools/mapping/clear_sql_cursor.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_clear_sql_cursor") {
            registeredHandler = handler;
          }
        },
      };

      registerClearSqlCursorTool(mockServer as any, client);

      const result = await registeredHandler({
        cursor: "cursor-id-123",
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("succeeded");
    });
  });

  describe("Advanced Query Operations", () => {
    test("elasticsearch_delete_by_query deletes documents matching query", async () => {
      mock.add(
        {
          method: "POST",
          path: "/:index/_delete_by_query",
        },
        () => ({
          took: 100,
          timed_out: false,
          total: 50,
          deleted: 50,
          batches: 1,
          version_conflicts: 0,
          noops: 0,
          retries: {
            bulk: 0,
            search: 0,
          },
          throttled_millis: 0,
          requests_per_second: -1.0,
          throttled_until_millis: 0,
          failures: [],
        })
      );

      const { registerDeleteByQueryTool } = await import("../../src/tools/advanced/delete_by_query.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_delete_by_query") {
            registeredHandler = handler;
          }
        },
      };

      registerDeleteByQueryTool(mockServer as any, client);

      const result = await registeredHandler({
        index: "test-index",
        query: {
          match: {
            status: "obsolete",
          },
        },
      });

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("deleted");
      expect(responseText).toContain("50");
    });

    test("elasticsearch_update_by_query updates documents matching query", async () => {
      mock.add(
        {
          method: "POST",
          path: "/:index/_update_by_query",
        },
        () => ({
          took: 200,
          timed_out: false,
          total: 100,
          updated: 100,
          deleted: 0,
          batches: 2,
          version_conflicts: 0,
          noops: 0,
          retries: {
            bulk: 0,
            search: 0,
          },
          throttled_millis: 0,
          requests_per_second: -1.0,
          throttled_until_millis: 0,
          failures: [],
        })
      );

      const { registerUpdateByQueryTool } = await import("../../src/tools/search/update_by_query.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_update_by_query") {
            registeredHandler = handler;
          }
        },
      };

      registerUpdateByQueryTool(mockServer as any, client);

      const result = await registeredHandler({
        index: "test-index",
        query: {
          match: {
            status: "pending",
          },
        },
        script: {
          source: "ctx._source.status = 'active'",
          lang: "painless",
        },
      });

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("updated");
      expect(responseText).toContain("100");
    });

    test("elasticsearch_count_documents counts matching documents", async () => {
      mock.add(
        {
          method: "POST",
          path: "/:index/_count",
        },
        () => ({
          count: 42,
          _shards: {
            total: 1,
            successful: 1,
            skipped: 0,
            failed: 0,
          },
        })
      );

      const { registerCountDocumentsTool } = await import("../../src/tools/search/count_documents.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_count_documents") {
            registeredHandler = handler;
          }
        },
      };

      registerCountDocumentsTool(mockServer as any, client);

      const result = await registeredHandler({
        index: "test-index",
        query: {
          match: {
            status: "active",
          },
        },
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("42");
    });
  });

  describe("Scroll and Multi-Search Operations", () => {
    test.skip("elasticsearch_scroll_search retrieves large result sets - requires helpers API mock", async () => {
      // This test requires mocking the helpers.scrollSearch API which is complex
      // Skipping for now as the tool implementation uses a different API pattern
    });

    test("elasticsearch_clear_scroll releases scroll context", async () => {
      mock.add(
        {
          method: "DELETE",
          path: "/_search/scroll",
        },
        () => ({
          succeeded: true,
          num_freed: 1,
        })
      );

      const { registerClearScrollTool } = await import("../../src/tools/search/clear_scroll.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_clear_scroll") {
            registeredHandler = handler;
          }
        },
      };

      registerClearScrollTool(mockServer as any, client);

      const result = await registeredHandler({
        scrollId: "scroll-id-123",
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("succeeded");
    });

    test("elasticsearch_multi_search executes multiple searches", async () => {
      mock.add(
        {
          method: "POST",
          path: "/_msearch",
        },
        () => ({
          responses: [
            {
              took: 5,
              timed_out: false,
              hits: {
                total: { value: 10, relation: "eq" },
                hits: [
                  {
                    _index: "index-1",
                    _id: "1",
                    _score: 1.0,
                    _source: { title: "Result 1" },
                  },
                ],
              },
            },
            {
              took: 3,
              timed_out: false,
              hits: {
                total: { value: 5, relation: "eq" },
                hits: [
                  {
                    _index: "index-2",
                    _id: "2",
                    _score: 0.9,
                    _source: { title: "Result 2" },
                  },
                ],
              },
            },
          ],
        })
      );

      const { registerMultiSearchTool } = await import("../../src/tools/search/multi_search.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_multi_search") {
            registeredHandler = handler;
          }
        },
      };

      registerMultiSearchTool(mockServer as any, client);

      const result = await registeredHandler({
        searches: [
          { index: "index-1" },
          { query: { match: { title: "test" } } },
          { index: "index-2" },
          { query: { match_all: {} } },
        ],
      });

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("Result 1");
      expect(responseText).toContain("Result 2");
    });
  });
});