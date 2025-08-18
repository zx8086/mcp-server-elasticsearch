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

describe("ILM (Index Lifecycle Management) Tools Tests", () => {
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

  describe("ILM Policy Management", () => {
    test("elasticsearch_ilm_get_lifecycle retrieves ILM policies", async () => {
      mock.add(
        {
          method: "GET",
          path: "/_ilm/policy",
        },
        () => ({
          "my-policy": {
            version: 1,
            modified_date: "2024-01-01T00:00:00.000Z",
            policy: {
              phases: {
                hot: {
                  min_age: "0ms",
                  actions: {
                    rollover: {
                      max_age: "30d",
                      max_size: "50gb",
                      max_docs: 1000000,
                    },
                    set_priority: {
                      priority: 100,
                    },
                  },
                },
                warm: {
                  min_age: "30d",
                  actions: {
                    shrink: {
                      number_of_shards: 1,
                    },
                    forcemerge: {
                      max_num_segments: 1,
                    },
                    set_priority: {
                      priority: 50,
                    },
                  },
                },
                cold: {
                  min_age: "90d",
                  actions: {
                    set_priority: {
                      priority: 0,
                    },
                  },
                },
                delete: {
                  min_age: "180d",
                  actions: {
                    delete: {},
                  },
                },
              },
            },
          },
        })
      );

      const { registerGetLifecycleImprovedTool } = await import("../../src/tools/ilm/get_lifecycle_improved.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_ilm_get_lifecycle") {
            registeredHandler = handler;
          }
        },
      };

      registerGetLifecycleImprovedTool(mockServer as any, client);

      const result = await registeredHandler({});

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("my-policy");
      expect(responseText).toContain("hot");
      expect(responseText).toContain("warm");
      expect(responseText).toContain("cold");
      expect(responseText).toContain("delete");
    });

    test("elasticsearch_ilm_put_lifecycle creates/updates ILM policy", async () => {
      mock.add(
        {
          method: "PUT",
          path: "/_ilm/policy/:policy",
        },
        () => ({
          acknowledged: true,
        })
      );

      const { registerPutLifecycleTool } = await import("../../src/tools/ilm/put_lifecycle.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_ilm_put_lifecycle") {
            registeredHandler = handler;
          }
        },
      };

      registerPutLifecycleTool(mockServer as any, client);

      const result = await registeredHandler({
        policy: "test-policy",
        body: {
          policy: {
            phases: {
              hot: {
                actions: {
                  rollover: {
                    max_age: "7d",
                  },
                },
              },
            },
          },
        },
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("acknowledged");
    });

    test("elasticsearch_ilm_delete_lifecycle deletes ILM policy", async () => {
      mock.add(
        {
          method: "DELETE",
          path: "/_ilm/policy/:policy",
        },
        () => ({
          acknowledged: true,
        })
      );

      const { registerDeleteLifecycleTool } = await import("../../src/tools/ilm/delete_lifecycle.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_ilm_delete_lifecycle") {
            registeredHandler = handler;
          }
        },
      };

      registerDeleteLifecycleTool(mockServer as any, client);

      const result = await registeredHandler({
        policy: "old-policy",
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("acknowledged");
    });

    test("elasticsearch_ilm_explain_lifecycle explains ILM status for indices", async () => {
      mock.add(
        {
          method: "GET",
          path: "/:index/_ilm/explain",
        },
        () => ({
          indices: {
            "test-index-000001": {
              index: "test-index-000001",
              managed: true,
              policy: "my-policy",
              lifecycle_date_millis: 1704067200000,
              age: "30d",
              phase: "warm",
              phase_time_millis: 1704067200000,
              action: "shrink",
              action_time_millis: 1704067200000,
              step: "shrink",
              step_time_millis: 1704067200000,
              phase_execution: {
                policy: "my-policy",
                phase_definition: {
                  min_age: "30d",
                  actions: {
                    shrink: {
                      number_of_shards: 1,
                    },
                  },
                },
                version: 1,
                modified_date_in_millis: 1704067200000,
              },
            },
          },
        })
      );

      const { registerExplainLifecycleTool } = await import("../../src/tools/ilm/explain_lifecycle.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_ilm_explain_lifecycle") {
            registeredHandler = handler;
          }
        },
      };

      registerExplainLifecycleTool(mockServer as any, client);

      const result = await registeredHandler({
        index: "test-index-*",
        includeDetails: true, // Request full details for test
      });

      expect(result.content).toBeDefined();
      // Check both metadata and content
      const fullResponse = result.content.map(c => c.text).join("\n");
      expect(fullResponse).toContain("test-index-000001");
      expect(fullResponse).toContain("warm");
      expect(fullResponse).toContain("shrink");
    });
  });

  describe("ILM Service Control", () => {
    test("elasticsearch_ilm_get_status gets ILM status", async () => {
      mock.add(
        {
          method: "GET",
          path: "/_ilm/status",
        },
        () => ({
          operation_mode: "RUNNING",
        })
      );

      const { registerGetStatusTool } = await import("../../src/tools/ilm/get_status.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_ilm_get_status") {
            registeredHandler = handler;
          }
        },
      };

      registerGetStatusTool(mockServer as any, client);

      const result = await registeredHandler({});

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("RUNNING");
    });

    test("elasticsearch_ilm_start starts ILM service", async () => {
      mock.add(
        {
          method: "POST",
          path: "/_ilm/start",
        },
        () => ({
          acknowledged: true,
        })
      );

      const { registerStartTool } = await import("../../src/tools/ilm/start.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_ilm_start") {
            registeredHandler = handler;
          }
        },
      };

      registerStartTool(mockServer as any, client);

      const result = await registeredHandler({});

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("acknowledged");
    });

    test("elasticsearch_ilm_stop stops ILM service", async () => {
      mock.add(
        {
          method: "POST",
          path: "/_ilm/stop",
        },
        () => ({
          acknowledged: true,
        })
      );

      const { registerStopTool } = await import("../../src/tools/ilm/stop.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_ilm_stop") {
            registeredHandler = handler;
          }
        },
      };

      registerStopTool(mockServer as any, client);

      const result = await registeredHandler({});

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("acknowledged");
    });
  });

  describe("ILM Operations", () => {
    test("elasticsearch_ilm_move_to_step moves index to specific ILM step", async () => {
      mock.add(
        {
          method: "POST",
          path: "/_ilm/move/:index",
        },
        () => ({
          acknowledged: true,
        })
      );

      const { registerMoveToStepTool } = await import("../../src/tools/ilm/move_to_step.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_ilm_move_to_step") {
            registeredHandler = handler;
          }
        },
      };

      registerMoveToStepTool(mockServer as any, client);

      const result = await registeredHandler({
        index: "test-index",
        currentStep: {
          phase: "hot",
          action: "rollover",
          name: "check-rollover-ready",
        },
        nextStep: {
          phase: "warm",
          action: "shrink",
          name: "shrink",
        },
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("acknowledged");
    });

    test("elasticsearch_ilm_retry retries failed ILM actions", async () => {
      mock.add(
        {
          method: "POST",
          path: "/:index/_ilm/retry",
        },
        () => ({
          acknowledged: true,
        })
      );

      const { registerRetryTool } = await import("../../src/tools/ilm/retry.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_ilm_retry") {
            registeredHandler = handler;
          }
        },
      };

      registerRetryTool(mockServer as any, client);

      const result = await registeredHandler({
        index: "failed-index",
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("acknowledged");
    });

    test("elasticsearch_ilm_remove_policy removes ILM policy from index", async () => {
      mock.add(
        {
          method: "POST",
          path: "/:index/_ilm/remove",
        },
        () => ({
          has_failures: false,
          failed_indexes: [],
        })
      );

      const { registerRemovePolicyTool } = await import("../../src/tools/ilm/remove_policy.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_ilm_remove_policy") {
            registeredHandler = handler;
          }
        },
      };

      registerRemovePolicyTool(mockServer as any, client);

      const result = await registeredHandler({
        index: "test-index",
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("has_failures");
    });

    test("elasticsearch_ilm_migrate_to_data_tiers migrates to data tiers", async () => {
      mock.add(
        {
          method: "POST",
          path: "/_ilm/migrate_to_data_tiers",
        },
        () => ({
          dry_run: false,
          migrated_ilm_policies: ["policy1", "policy2"],
          migrated_indices: ["index1", "index2"],
          migrated_legacy_templates: ["template1"],
          migrated_composable_templates: ["composable1"],
          migrated_component_templates: ["component1"],
        })
      );

      const { registerMigrateToDataTiersTool } = await import("../../src/tools/ilm/migrate_to_data_tiers.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_ilm_migrate_to_data_tiers") {
            registeredHandler = handler;
          }
        },
      };

      registerMigrateToDataTiersTool(mockServer as any, client);

      const result = await registeredHandler({
        dryRun: false,
      });

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("policy1");
      expect(responseText).toContain("index1");
    });
  });
});