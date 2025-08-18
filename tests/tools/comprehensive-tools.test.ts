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

describe("Comprehensive Tools Tests", () => {
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

  describe("Template Operations", () => {
    test("elasticsearch_get_index_template retrieves templates", async () => {
      mock.add(
        {
          method: "GET",
          path: "/_index_template",
        },
        () => ({
          index_templates: [
            {
              name: "logs-template",
              index_template: {
                index_patterns: ["logs-*"],
                template: {
                  settings: {
                    number_of_shards: 1,
                    number_of_replicas: 1,
                  },
                  mappings: {
                    properties: {
                      timestamp: { type: "date" },
                      message: { type: "text" },
                    },
                  },
                },
                priority: 100,
                composed_of: ["component-template"],
              },
            },
          ],
        })
      );

      const { registerGetIndexTemplateTool } = await import("../../src/tools/template/get_index_template_improved.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_get_index_template") {
            registeredHandler = handler;
          }
        },
      };

      registerGetIndexTemplateTool(mockServer as any, client);

      const result = await registeredHandler({});

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("logs-template");
      expect(responseText).toContain("logs-*");
    });

    test("elasticsearch_put_index_template creates/updates template", async () => {
      mock.add(
        {
          method: "PUT",
          path: "/_index_template/:name",
        },
        () => ({
          acknowledged: true,
        })
      );

      const { registerPutIndexTemplateTool } = await import("../../src/tools/template/put_index_template.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_put_index_template") {
            registeredHandler = handler;
          }
        },
      };

      registerPutIndexTemplateTool(mockServer as any, client);

      const result = await registeredHandler({
        name: "test-template",
        indexPatterns: ["test-*"],
        template: {
          settings: {
            number_of_shards: 2,
          },
        },
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("acknowledged");
    });

    test("elasticsearch_delete_index_template deletes template", async () => {
      mock.add(
        {
          method: "DELETE",
          path: "/_index_template/:name",
        },
        () => ({
          acknowledged: true,
        })
      );

      const { registerDeleteIndexTemplateTool } = await import("../../src/tools/template/delete_index_template.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_delete_index_template") {
            registeredHandler = handler;
          }
        },
      };

      registerDeleteIndexTemplateTool(mockServer as any, client);

      const result = await registeredHandler({
        name: "old-template",
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("acknowledged");
    });

    test("elasticsearch_search_template executes search template", async () => {
      mock.add(
        {
          method: "POST",
          path: "/_search/template",
        },
        () => ({
          hits: {
            total: { value: 5, relation: "eq" },
            hits: [
              {
                _index: "test-index",
                _id: "1",
                _score: 1.0,
                _source: {
                  title: "Result from template",
                },
              },
            ],
          },
        })
      );

      const { registerSearchTemplateTool } = await import("../../src/tools/template/search_template.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_search_template") {
            registeredHandler = handler;
          }
        },
      };

      registerSearchTemplateTool(mockServer as any, client);

      const result = await registeredHandler({
        id: "search-template",
        params: {
          field: "title",
          value: "test",
        },
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("Result from template");
    });

    test("elasticsearch_multi_search_template executes multiple search templates", async () => {
      mock.add(
        {
          method: "POST",
          path: "/_msearch/template",
        },
        () => ({
          responses: [
            {
              hits: {
                total: { value: 3, relation: "eq" },
                hits: [
                  {
                    _index: "index-1",
                    _id: "1",
                    _source: { title: "First result" },
                  },
                ],
              },
            },
            {
              hits: {
                total: { value: 2, relation: "eq" },
                hits: [
                  {
                    _index: "index-2",
                    _id: "2",
                    _source: { title: "Second result" },
                  },
                ],
              },
            },
          ],
        })
      );

      const { registerMultiSearchTemplateTool } = await import("../../src/tools/template/multi_search_template.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_multi_search_template") {
            registeredHandler = handler;
          }
        },
      };

      registerMultiSearchTemplateTool(mockServer as any, client);

      const result = await registeredHandler({
        searches: [
          { id: "template-1", params: { query: "test" } },
          { id: "template-2", params: { query: "example" } },
        ],
      });

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("First result");
      expect(responseText).toContain("Second result");
    });
  });

  describe("Alias Operations", () => {
    test("elasticsearch_get_aliases retrieves aliases", async () => {
      mock.add(
        {
          method: "GET",
          path: "/_alias",
        },
        () => ({
          "index-1": {
            aliases: {
              "alias-1": {},
              "alias-2": {
                filter: {
                  term: { status: "active" },
                },
              },
            },
          },
          "index-2": {
            aliases: {
              "alias-1": {},
            },
          },
        })
      );

      const { registerGetAliasesTool } = await import("../../src/tools/alias/get_aliases_improved.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_get_aliases") {
            registeredHandler = handler;
          }
        },
      };

      registerGetAliasesTool(mockServer as any, client);

      const result = await registeredHandler({});

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("alias-1");
      expect(responseText).toContain("alias-2");
    });

    test("elasticsearch_put_alias creates alias", async () => {
      mock.add(
        {
          method: "PUT",
          path: "/:index/_alias/:name",
        },
        () => ({
          acknowledged: true,
        })
      );

      const { registerPutAliasTool } = await import("../../src/tools/alias/put_alias.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_put_alias") {
            registeredHandler = handler;
          }
        },
      };

      registerPutAliasTool(mockServer as any, client);

      const result = await registeredHandler({
        index: "test-index",
        name: "test-alias",
        filter: {
          term: { status: "active" },
        },
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("acknowledged");
    });

    test("elasticsearch_delete_alias removes alias", async () => {
      mock.add(
        {
          method: "DELETE",
          path: "/:index/_alias/:name",
        },
        () => ({
          acknowledged: true,
        })
      );

      const { registerDeleteAliasTool } = await import("../../src/tools/alias/delete_alias.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_delete_alias") {
            registeredHandler = handler;
          }
        },
      };

      registerDeleteAliasTool(mockServer as any, client);

      const result = await registeredHandler({
        index: "test-index",
        name: "old-alias",
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("acknowledged");
    });

    test("elasticsearch_update_aliases updates multiple aliases atomically", async () => {
      mock.add(
        {
          method: "POST",
          path: "/_aliases",
        },
        () => ({
          acknowledged: true,
        })
      );

      const { registerUpdateAliasesTool } = await import("../../src/tools/alias/update_aliases.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_update_aliases") {
            registeredHandler = handler;
          }
        },
      };

      registerUpdateAliasesTool(mockServer as any, client);

      const result = await registeredHandler({
        actions: [
          { add: { index: "index-1", alias: "alias-1" } },
          { remove: { index: "index-2", alias: "alias-2" } },
        ],
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("acknowledged");
    });
  });

  describe("Cluster Operations", () => {
    test("elasticsearch_get_cluster_health gets cluster health", async () => {
      mock.add(
        {
          method: "GET",
          path: "/_cluster/health",
        },
        () => ({
          cluster_name: "test-cluster",
          status: "green",
          timed_out: false,
          number_of_nodes: 3,
          number_of_data_nodes: 3,
          active_primary_shards: 10,
          active_shards: 20,
          relocating_shards: 0,
          initializing_shards: 0,
          unassigned_shards: 0,
          delayed_unassigned_shards: 0,
          number_of_pending_tasks: 0,
          number_of_in_flight_fetch: 0,
          task_max_waiting_in_queue_millis: 0,
          active_shards_percent_as_number: 100.0,
        })
      );

      const { registerGetClusterHealthTool } = await import("../../src/tools/cluster/get_cluster_health.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_get_cluster_health") {
            registeredHandler = handler;
          }
        },
      };

      registerGetClusterHealthTool(mockServer as any, client);

      const result = await registeredHandler({});

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("green");
      expect(responseText).toContain("test-cluster");
    });

    test("elasticsearch_get_cluster_stats gets cluster statistics", async () => {
      mock.add(
        {
          method: "GET",
          path: "/_cluster/stats",
        },
        () => ({
          cluster_name: "test-cluster",
          status: "green",
          indices: {
            count: 50,
            shards: {
              total: 100,
              primaries: 50,
            },
            docs: {
              count: 1000000,
              deleted: 1000,
            },
            store: {
              size_in_bytes: 10737418240,
            },
          },
          nodes: {
            count: {
              total: 3,
              data: 3,
              master: 3,
            },
          },
        })
      );

      const { registerGetClusterStatsTool } = await import("../../src/tools/cluster/get_cluster_stats.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_get_cluster_stats") {
            registeredHandler = handler;
          }
        },
      };

      registerGetClusterStatsTool(mockServer as any, client);

      const result = await registeredHandler({});

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("test-cluster");
      expect(responseText).toContain("indices");
    });

    test("elasticsearch_get_nodes_info gets node information", async () => {
      // Mock for minimal response (no params)
      mock.add(
        {
          method: "GET",
          path: "/_nodes/name",
        },
        () => ({
          cluster_name: "test-cluster",
          nodes: {
            "node-1": {
              name: "node-1",
              transport_address: "192.168.1.1:9300",
              host: "192.168.1.1",
              ip: "192.168.1.1",
              version: "8.11.0",
              roles: ["master", "data"],
            },
          },
        })
      );
      
      // Mock for compact mode
      mock.add(
        {
          method: "GET",
          path: "/_nodes/os,jvm,process,transport",
        },
        () => ({
          cluster_name: "test-cluster",
          nodes: {
            "node-1": {
              name: "node-1",
              transport_address: "192.168.1.1:9300",
              host: "192.168.1.1",
              ip: "192.168.1.1",
              version: "8.11.0",
              roles: ["master", "data"],
              os: {
                name: "Linux",
                version: "5.10",
                available_processors: 8,
              },
              jvm: {
                version: "17.0.5",
                vm_name: "OpenJDK 64-Bit Server VM",
                mem: {
                  heap_init_in_bytes: 1073741824,
                  heap_max_in_bytes: 2147483648,
                },
              },
              process: {
                id: 1234,
                mlockall: true,
              },
              http: {
                bound_address: "0.0.0.0:9200",
                publish_address: "192.168.1.1:9200",
              },
              transport: {
                bound_address: "0.0.0.0:9300",
                publish_address: "192.168.1.1:9300",
              },
            },
          },
        })
      );
      
      // Also add mock for full mode
      mock.add(
        {
          method: "GET",
          path: "/_nodes",
        },
        () => ({
          cluster_name: "test-cluster",
          nodes: {
            "node-1": {
              name: "node-1",
              transport_address: "192.168.1.1:9300",
              host: "192.168.1.1",
              ip: "192.168.1.1",
              version: "8.11.0",
              roles: ["master", "data"],
              os: {
                name: "Linux",
                version: "5.10",
              },
            },
          },
        })
      );

      const { registerGetNodesInfoTool } = await import("../../src/tools/cluster/get_nodes_info.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_get_nodes_info") {
            registeredHandler = handler;
          }
        },
      };

      registerGetNodesInfoTool(mockServer as any, client);

      const result = await registeredHandler({});

      expect(result.content).toBeDefined();
      // The compact mode returns multiple content items
      const fullResponse = result.content.map(c => c.text).join("\n");
      expect(fullResponse).toContain("node-1");
      expect(fullResponse).toContain("8.11.0");
    });

    test("elasticsearch_get_nodes_stats gets node statistics", async () => {
      // Mock for minimal stats (no metric specified)
      mock.add(
        {
          method: "GET",
          path: "/_nodes/stats/os,jvm",
        },
        () => ({
          cluster_name: "test-cluster",
          nodes: {
            "node-1": {
              name: "node-1",
              jvm: {
                mem: {
                  heap_used_percent: 45,
                  heap_used_in_bytes: 1073741824,
                },
              },
              os: {
                cpu: {
                  percent: 20,
                },
              },
            },
          },
        })
      );
      
      // Mock for full stats (backward compatibility)
      mock.add(
        {
          method: "GET",
          path: "/_nodes/stats",
        },
        () => ({
          cluster_name: "test-cluster",
          nodes: {
            "node-1": {
              name: "node-1",
              jvm: {
                mem: {
                  heap_used_percent: 45,
                  heap_used_in_bytes: 1073741824,
                },
              },
              fs: {
                total: {
                  total_in_bytes: 107374182400,
                  free_in_bytes: 53687091200,
                  available_in_bytes: 53687091200,
                },
              },
            },
          },
        })
      );

      const { registerGetNodesStatsTool } = await import("../../src/tools/cluster/get_nodes_stats.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_get_nodes_stats") {
            registeredHandler = handler;
          }
        },
      };

      registerGetNodesStatsTool(mockServer as any, client);

      const result = await registeredHandler({});

      expect(result.content).toBeDefined();
      // With no params, first item is warning, second is data
      const fullResponse = result.content.map(c => c.text).join("\n");
      expect(fullResponse).toContain("node-1");
      expect(fullResponse).toContain("jvm");
    });
  });

  describe("Analytics Operations", () => {
    test("elasticsearch_get_term_vectors analyzes term vectors", async () => {
      mock.add(
        {
          method: "POST",
          path: "/:index/_termvectors/:id",
        },
        () => ({
          _index: "test-index",
          _id: "1",
          found: true,
          took: 2,
          term_vectors: {
            content: {
              field_statistics: {
                sum_doc_freq: 100,
                doc_count: 10,
                sum_ttf: 150,
              },
              terms: {
                "elasticsearch": {
                  term_freq: 3,
                  tokens: [
                    { position: 0, start_offset: 0, end_offset: 13 },
                    { position: 5, start_offset: 50, end_offset: 63 },
                  ],
                },
              },
            },
          },
        })
      );

      const { registerGetTermVectorsTool } = await import("../../src/tools/analytics/get_term_vectors.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_get_term_vectors") {
            registeredHandler = handler;
          }
        },
      };

      registerGetTermVectorsTool(mockServer as any, client);

      const result = await registeredHandler({
        index: "test-index",
        id: "1",
        fields: ["content"],
      });

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("elasticsearch");
      expect(responseText).toContain("term_freq");
    });

    test("elasticsearch_get_multi_term_vectors gets multiple term vectors", async () => {
      mock.add(
        {
          method: "POST",
          path: "/_mtermvectors",
        },
        () => ({
          docs: [
            {
              _index: "test-index",
              _id: "1",
              found: true,
              term_vectors: {
                content: {
                  terms: {
                    "test": {
                      term_freq: 2,
                    },
                  },
                },
              },
            },
            {
              _index: "test-index",
              _id: "2",
              found: true,
              term_vectors: {
                content: {
                  terms: {
                    "example": {
                      term_freq: 1,
                    },
                  },
                },
              },
            },
          ],
        })
      );

      const { registerGetMultiTermVectorsTool } = await import("../../src/tools/analytics/get_multi_term_vectors.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_get_multi_term_vectors") {
            registeredHandler = handler;
          }
        },
      };

      registerGetMultiTermVectorsTool(mockServer as any, client);

      const result = await registeredHandler({
        docs: [
          { _index: "test-index", _id: "1" },
          { _index: "test-index", _id: "2" },
        ],
      });

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("test");
      expect(responseText).toContain("example");
    });
  });

  describe("Enrich Policy Operations", () => {
    test("elasticsearch_enrich_get_policy retrieves enrich policies", async () => {
      mock.add(
        {
          method: "GET",
          path: "/_enrich/policy",
        },
        () => ({
          policies: [
            {
              name: "users-policy",
              config: {
                match: {
                  indices: ["users"],
                  match_field: "email",
                  enrich_fields: ["first_name", "last_name", "city"],
                },
              },
            },
          ],
        })
      );

      const { registerEnrichGetPolicyTool } = await import("../../src/tools/enrich/get_policy_improved.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_enrich_get_policy") {
            registeredHandler = handler;
          }
        },
      };

      registerEnrichGetPolicyTool(mockServer as any, client);

      const result = await registeredHandler({});

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("Enrich Policies");
    });

    test("elasticsearch_enrich_put_policy creates enrich policy", async () => {
      mock.add(
        {
          method: "PUT",
          path: "/_enrich/policy/:name",
        },
        () => ({
          acknowledged: true,
        })
      );

      const { registerEnrichPutPolicyTool } = await import("../../src/tools/enrich/put_policy.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_enrich_put_policy") {
            registeredHandler = handler;
          }
        },
      };

      registerEnrichPutPolicyTool(mockServer as any, client);

      const result = await registeredHandler({
        name: "test-policy",
        match: {
          indices: ["test-index"],
          matchField: "id",
          enrichFields: ["name", "description"],
        },
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("acknowledged");
    });

    test("elasticsearch_enrich_delete_policy deletes enrich policy", async () => {
      mock.add(
        {
          method: "DELETE",
          path: "/_enrich/policy/:name",
        },
        () => ({
          acknowledged: true,
        })
      );

      const { registerEnrichDeletePolicyTool } = await import("../../src/tools/enrich/delete_policy.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_enrich_delete_policy") {
            registeredHandler = handler;
          }
        },
      };

      registerEnrichDeletePolicyTool(mockServer as any, client);

      const result = await registeredHandler({
        name: "old-policy",
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("acknowledged");
    });

    test("elasticsearch_enrich_execute_policy executes enrich policy", async () => {
      mock.add(
        {
          method: "PUT",
          path: "/_enrich/policy/:name/_execute",
        },
        () => ({
          status: {
            phase: "COMPLETE",
          },
        })
      );

      const { registerEnrichExecutePolicyTool } = await import("../../src/tools/enrich/execute_policy.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_enrich_execute_policy") {
            registeredHandler = handler;
          }
        },
      };

      registerEnrichExecutePolicyTool(mockServer as any, client);

      const result = await registeredHandler({
        name: "users-policy",
        waitForCompletion: false,
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("COMPLETE");
    });

    test("elasticsearch_enrich_stats gets enrich statistics", async () => {
      mock.add(
        {
          method: "GET",
          path: "/_enrich/_stats",
        },
        () => ({
          executing_policies: [],
          coordinator_stats: [
            {
              node_id: "node-1",
              queue_size: 0,
              remote_requests_current: 0,
              remote_requests_total: 100,
              executed_searches_total: 500,
            },
          ],
        })
      );

      const { registerEnrichStatsTool } = await import("../../src/tools/enrich/stats.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_enrich_stats") {
            registeredHandler = handler;
          }
        },
      };

      registerEnrichStatsTool(mockServer as any, client);

      const result = await registeredHandler({});

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("coordinator_stats");
    });
  });

  describe("Autoscaling Operations", () => {
    test("elasticsearch_autoscaling_get_capacity gets autoscaling capacity", async () => {
      mock.add(
        {
          method: "GET",
          path: "/_autoscaling/capacity",
        },
        () => ({
          policies: {
            "hot-tier": {
              required_capacity: {
                node_count: 3,
                storage: 107374182400,
                memory: 8589934592,
              },
              current_capacity: {
                node_count: 2,
                storage: 53687091200,
                memory: 4294967296,
              },
            },
          },
        })
      );

      const { registerAutoscalingGetCapacityTool } = await import("../../src/tools/autoscaling/get_capacity.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_autoscaling_get_capacity") {
            registeredHandler = handler;
          }
        },
      };

      registerAutoscalingGetCapacityTool(mockServer as any, client);

      const result = await registeredHandler({});

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("hot-tier");
      expect(responseText).toContain("required_capacity");
    });

    test("elasticsearch_autoscaling_get_policy gets autoscaling policy", async () => {
      mock.add(
        {
          method: "GET",
          path: "/_autoscaling/policy/:name",
        },
        () => ({
          policy: {
            roles: ["data_hot"],
            deciders: {
              fixed: {
                node_count: 3,
                storage: "100gb",
                memory: "8gb",
              },
            },
          },
        })
      );

      const { registerAutoscalingGetPolicyTool } = await import("../../src/tools/autoscaling/get_policy.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_autoscaling_get_policy") {
            registeredHandler = handler;
          }
        },
      };

      registerAutoscalingGetPolicyTool(mockServer as any, client);

      const result = await registeredHandler({
        name: "hot-tier",
      });

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("data_hot");
      expect(responseText).toContain("fixed");
    });

    test("elasticsearch_autoscaling_put_policy creates/updates autoscaling policy", async () => {
      mock.add(
        {
          method: "PUT",
          path: "/_autoscaling/policy/:name",
        },
        () => ({
          acknowledged: true,
        })
      );

      const { registerAutoscalingPutPolicyTool } = await import("../../src/tools/autoscaling/put_policy.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_autoscaling_put_policy") {
            registeredHandler = handler;
          }
        },
      };

      registerAutoscalingPutPolicyTool(mockServer as any, client);

      const result = await registeredHandler({
        name: "warm-tier",
        policy: {
          roles: ["data_warm"],
          deciders: {
            fixed: {
              node_count: 2,
            },
          },
        },
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("acknowledged");
    });

    test("elasticsearch_autoscaling_delete_policy deletes autoscaling policy", async () => {
      mock.add(
        {
          method: "DELETE",
          path: "/_autoscaling/policy/:name",
        },
        () => ({
          acknowledged: true,
        })
      );

      const { registerAutoscalingDeletePolicyTool } = await import("../../src/tools/autoscaling/delete_policy.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_autoscaling_delete_policy") {
            registeredHandler = handler;
          }
        },
      };

      registerAutoscalingDeletePolicyTool(mockServer as any, client);

      const result = await registeredHandler({
        name: "old-policy",
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("acknowledged");
    });
  });

  describe("Task Management Operations", () => {
    test("elasticsearch_list_tasks lists running tasks", async () => {
      mock.add(
        {
          method: "GET",
          path: "/_tasks",
        },
        () => ({
          nodes: {
            "node-1": {
              name: "node-1",
              tasks: {
                "task-1": {
                  node: "node-1",
                  id: 1,
                  type: "transport",
                  action: "indices:data/write/bulk",
                  start_time_in_millis: 1704067200000,
                  running_time_in_nanos: 1000000000,
                  cancellable: true,
                },
              },
            },
          },
        })
      );

      const { registerListTasksTool } = await import("../../src/tools/tasks/list_tasks.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_list_tasks") {
            registeredHandler = handler;
          }
        },
      };

      registerListTasksTool(mockServer as any, client);

      const result = await registeredHandler({});

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("task-1");
      expect(responseText).toContain("bulk");
    });

    test("elasticsearch_tasks_get_task gets specific task details", async () => {
      mock.add(
        {
          method: "GET",
          path: "/_tasks/:taskId",
        },
        () => ({
          completed: true,
          task: {
            node: "node-1",
            id: 1,
            type: "transport",
            action: "indices:data/write/reindex",
            status: {
              total: 1000,
              created: 500,
              updated: 0,
              deleted: 0,
            },
            description: "reindex from [source-index] to [dest-index]",
            start_time_in_millis: 1704067200000,
            running_time_in_nanos: 5000000000,
          },
        })
      );

      const { registerGetTaskTool } = await import("../../src/tools/tasks/get_task.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_tasks_get_task") {
            registeredHandler = handler;
          }
        },
      };

      registerGetTaskTool(mockServer as any, client);

      const result = await registeredHandler({
        taskId: "node-1:1",
      });

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("reindex");
      expect(responseText).toContain("completed");
    });

    test("elasticsearch_tasks_cancel_task cancels a task", async () => {
      mock.add(
        {
          method: "POST",
          path: "/_tasks/_cancel",
        },
        () => ({
          node_failures: [],
          nodes: {
            "node-1": {
              tasks: {
                "task-1": {
                  node: "node-1",
                  id: 1,
                  type: "transport",
                  action: "indices:data/write/bulk",
                  cancellable: true,
                },
              },
            },
          },
        })
      );

      const { registerCancelTaskTool } = await import("../../src/tools/tasks/cancel_task.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_tasks_cancel_task") {
            registeredHandler = handler;
          }
        },
      };

      registerCancelTaskTool(mockServer as any, client);

      const result = await registeredHandler({
        actions: "indices:data/write/bulk",
      });

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("task-1");
    });
  });

  describe("Index Management Advanced Operations", () => {
    test("elasticsearch_index_exists checks index existence", async () => {
      mock.add(
        {
          method: "HEAD",
          path: "/:index",
        },
        () => ({
          statusCode: 200,
        })
      );

      const { registerIndexExistsTool } = await import("../../src/tools/index_management/index_exists.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_index_exists") {
            registeredHandler = handler;
          }
        },
      };

      registerIndexExistsTool(mockServer as any, client);

      const result = await registeredHandler({
        index: "test-index",
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toBe("Exists: true");
    });

    test("elasticsearch_put_mapping updates index mappings", async () => {
      mock.add(
        {
          method: "PUT",
          path: "/:index/_mapping",
        },
        () => ({
          acknowledged: true,
        })
      );

      const { registerPutMappingTool } = await import("../../src/tools/index_management/put_mapping.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_put_mapping") {
            registeredHandler = handler;
          }
        },
      };

      registerPutMappingTool(mockServer as any, client);

      const result = await registeredHandler({
        index: "test-index",
        properties: {
          new_field: { type: "keyword" },
        },
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("acknowledged");
    });

    test("elasticsearch_reindex_documents reindexes from source to destination", async () => {
      mock.add(
        {
          method: "POST",
          path: "/_reindex",
        },
        () => ({
          took: 500,
          timed_out: false,
          total: 1000,
          updated: 0,
          created: 1000,
          deleted: 0,
          batches: 10,
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

      const { registerReindexDocumentsTool } = await import("../../src/tools/index_management/reindex_documents.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_reindex_documents") {
            registeredHandler = handler;
          }
        },
      };

      registerReindexDocumentsTool(mockServer as any, client);

      const result = await registeredHandler({
        source: {
          index: "source-index",
        },
        dest: {
          index: "dest-index",
        },
      });

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("created");
      expect(responseText).toContain("1000");
    });

    test("elasticsearch_update_index_settings updates index settings", async () => {
      mock.add(
        {
          method: "PUT",
          path: "/:index/_settings",
        },
        () => ({
          acknowledged: true,
        })
      );

      const { registerUpdateIndexSettingsTool } = await import("../../src/tools/index_management/update_index_settings.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_update_index_settings") {
            registeredHandler = handler;
          }
        },
      };

      registerUpdateIndexSettingsTool(mockServer as any, client);

      const result = await registeredHandler({
        index: "test-index",
        settings: {
          index: {
            number_of_replicas: 2,
          },
        },
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("acknowledged");
    });

    test("elasticsearch_get_index_settings retrieves index settings", async () => {
      mock.add(
        {
          method: "GET",
          path: "/:index/_settings",
        },
        () => ({
          "test-index": {
            settings: {
              index: {
                number_of_shards: "5",
                number_of_replicas: "1",
                creation_date: "1704067200000",
                uuid: "abc123",
              },
            },
          },
        })
      );

      const { registerGetIndexSettingsTool } = await import("../../src/tools/index_management/get_index_settings.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_get_index_settings") {
            registeredHandler = handler;
          }
        },
      };

      registerGetIndexSettingsTool(mockServer as any, client);

      const result = await registeredHandler({
        index: "test-index",
      });

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("number_of_shards");
      expect(responseText).toContain("5");
    });
  });

  describe("Field and Data Lifecycle Operations", () => {
    test("elasticsearch_get_field_mapping gets field mapping details", async () => {
      mock.add(
        {
          method: "GET",
          path: "/:index/_mapping/field/:field",
        },
        () => ({
          "test-index": {
            mappings: {
              title: {
                full_name: "title",
                mapping: {
                  title: {
                    type: "text",
                    analyzer: "standard",
                    fields: {
                      keyword: {
                        type: "keyword",
                        ignore_above: 256,
                      },
                    },
                  },
                },
              },
            },
          },
        })
      );

      const { registerGetFieldMappingTool } = await import("../../src/tools/mapping/get_field_mapping.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_get_field_mapping") {
            registeredHandler = handler;
          }
        },
      };

      registerGetFieldMappingTool(mockServer as any, client);

      const result = await registeredHandler({
        index: "test-index",
        field: "title",
      });

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("title");
      expect(responseText).toContain("text");
      expect(responseText).toContain("keyword");
    });

    test("elasticsearch_field_usage_stats gets field usage statistics", async () => {
      mock.add(
        {
          method: "GET",
          path: "/:index/_field_usage_stats",
        },
        () => ({
          "_shards": {
            total: 1,
            successful: 1,
            failed: 0,
          },
          "test-index": {
            shards: [
              {
                routing: {
                  state: "STARTED",
                  primary: true,
                  node: "node-1",
                },
                stats: {
                  all_fields: {
                    any: true,
                    inverted_index: {
                      terms: true,
                      postings: true,
                      proximity: true,
                      positions: false,
                      offsets: false,
                    },
                    stored_fields: true,
                    doc_values: true,
                    points: true,
                    norms: true,
                    term_vectors: false,
                  },
                  fields: {
                    title: {
                      any: true,
                      inverted_index: {
                        terms: true,
                        postings: true,
                      },
                    },
                  },
                },
              },
            ],
          },
        })
      );

      const { registerFieldUsageStatsTool } = await import("../../src/tools/indices/field_usage_stats.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_field_usage_stats") {
            registeredHandler = handler;
          }
        },
      };

      registerFieldUsageStatsTool(mockServer as any, client);

      const result = await registeredHandler({
        index: "test-index",
      });

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("title");
      expect(responseText).toContain("inverted_index");
    });

    test("elasticsearch_disk_usage analyzes disk usage by field", async () => {
      mock.add(
        {
          method: "POST",
          path: "/:index/_disk_usage",
        },
        () => ({
          "_shards": {
            total: 1,
            successful: 1,
            failed: 0,
          },
          "test-index": {
            store_size: "10mb",
            store_size_in_bytes: 10485760,
            all_fields: {
              total: "10mb",
              total_in_bytes: 10485760,
              inverted_index: {
                total: "3mb",
                total_in_bytes: 3145728,
              },
              stored_fields: "2mb",
              stored_fields_in_bytes: 2097152,
              doc_values: "2mb",
              doc_values_in_bytes: 2097152,
              points: "1mb",
              points_in_bytes: 1048576,
              norms: "1mb",
              norms_in_bytes: 1048576,
              term_vectors: "1mb",
              term_vectors_in_bytes: 1048576,
            },
            fields: {
              title: {
                total: "2mb",
                total_in_bytes: 2097152,
                inverted_index: {
                  total: "1mb",
                  total_in_bytes: 1048576,
                },
              },
            },
          },
        })
      );

      const { registerDiskUsageTool } = await import("../../src/tools/indices/disk_usage.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_disk_usage") {
            registeredHandler = handler;
          }
        },
      };

      registerDiskUsageTool(mockServer as any, client);

      const result = await registeredHandler({
        index: "test-index",
      });

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("store_size");
      expect(responseText).toContain("10mb");
      expect(responseText).toContain("title");
    });

    test("elasticsearch_get_data_lifecycle_stats gets data lifecycle statistics", async () => {
      mock.add(
        {
          method: "GET",
          path: "/_lifecycle/stats",
        },
        () => ({
          data_stream_count: 10,
          indices_count: 50,
          total_retention_time_millis: 7776000000,
          data_streams: [
            {
              name: "logs-app",
              backing_indices_count: 5,
              oldest_backing_index: "logs-app-000001",
              newest_backing_index: "logs-app-000005",
              lifecycle: {
                data_retention: "90d",
              },
            },
          ],
        })
      );

      const { registerGetDataLifecycleStatsTool } = await import("../../src/tools/indices/get_data_lifecycle_stats.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_get_data_lifecycle_stats") {
            registeredHandler = handler;
          }
        },
      };

      registerGetDataLifecycleStatsTool(mockServer as any, client);

      const result = await registeredHandler({});

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("data_stream_count");
      expect(responseText).toContain("logs-app");
    });

    test("elasticsearch_explain_data_lifecycle explains data lifecycle for indices", async () => {
      mock.add(
        {
          method: "GET",
          path: "/:index/_lifecycle/explain",
        },
        () => ({
          indices: {
            "logs-app-000001": {
              index: "logs-app-000001",
              managed_by_lifecycle: true,
              lifecycle: {
                data_retention: "90d",
              },
              generation_time: "2024-01-01T00:00:00.000Z",
              time_since_index_creation: "30d",
            },
          },
        })
      );

      const { registerExplainDataLifecycleTool } = await import("../../src/tools/indices/explain_data_lifecycle.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_explain_data_lifecycle") {
            registeredHandler = handler;
          }
        },
      };

      registerExplainDataLifecycleTool(mockServer as any, client);

      const result = await registeredHandler({
        index: "logs-app-*",
      });

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("logs-app-000001");
      expect(responseText).toContain("data_retention");
      expect(responseText).toContain("90d");
    });

    test("elasticsearch_rollover rolls over index or data stream", async () => {
      mock.add(
        {
          method: "POST",
          path: "/:alias/_rollover",
        },
        () => ({
          acknowledged: true,
          shards_acknowledged: true,
          old_index: "logs-app-000001",
          new_index: "logs-app-000002",
          rolled_over: true,
          dry_run: false,
          conditions: {
            "[max_age: 7d]": true,
            "[max_docs: 1000000]": false,
          },
        })
      );

      const { registerRolloverTool } = await import("../../src/tools/indices/rollover.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_rollover") {
            registeredHandler = handler;
          }
        },
      };

      registerRolloverTool(mockServer as any, client);

      const result = await registeredHandler({
        alias: "logs-app",
        conditions: {
          max_age: "7d",
          max_docs: 1000000,
        },
      });

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("rolled_over");
      expect(responseText).toContain("logs-app-000002");
    });
  });
});