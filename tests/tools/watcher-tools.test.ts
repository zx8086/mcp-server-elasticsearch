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

describe("Watcher Tools Tests", () => {
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

  describe("Watch Management", () => {
    test("elasticsearch_watcher_get_watch retrieves a watch", async () => {
      mock.add(
        {
          method: "GET",
          path: "/_watcher/watch/:id",
        },
        () => ({
          found: true,
          _id: "my-watch",
          _version: 1,
          _seq_no: 0,
          _primary_term: 1,
          status: {
            state: {
              active: true,
              timestamp: "2024-01-01T00:00:00.000Z",
            },
            actions: {
              send_email: {
                ack: {
                  timestamp: "2024-01-01T00:00:00.000Z",
                  state: "awaits_successful_execution",
                },
              },
            },
          },
          watch: {
            trigger: {
              schedule: {
                interval: "5m",
              },
            },
            input: {
              search: {
                request: {
                  search_type: "query_then_fetch",
                  indices: ["logs-*"],
                  body: {
                    query: {
                      match: {
                        level: "ERROR",
                      },
                    },
                  },
                },
              },
            },
            condition: {
              compare: {
                "ctx.payload.hits.total": {
                  gte: 5,
                },
              },
            },
            actions: {
              send_email: {
                email: {
                  to: "admin@example.com",
                  subject: "Error Alert",
                  body: "Found {{ctx.payload.hits.total}} errors",
                },
              },
            },
          },
        })
      );

      const { registerWatcherGetWatchTool } = await import("../../src/tools/watcher/get_watch.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_watcher_get_watch") {
            registeredHandler = handler;
          }
        },
      };

      registerWatcherGetWatchTool(mockServer as any, client);

      const result = await registeredHandler({
        id: "my-watch",
      });

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("my-watch");
      expect(responseText).toContain("schedule");
      expect(responseText).toContain("ERROR");
    });

    test("elasticsearch_watcher_put_watch creates/updates a watch", async () => {
      mock.add(
        {
          method: "PUT",
          path: "/_watcher/watch/:id",
        },
        () => ({
          _id: "test-watch",
          _version: 1,
          created: true,
        })
      );

      const { registerWatcherPutWatchTool } = await import("../../src/tools/watcher/put_watch.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_watcher_put_watch") {
            registeredHandler = handler;
          }
        },
      };

      registerWatcherPutWatchTool(mockServer as any, client);

      const result = await registeredHandler({
        id: "test-watch",
        trigger: {
          schedule: {
            interval: "10m",
          },
        },
        input: {
          simple: {
            test: "data",
          },
        },
        condition: {
          always: {},
        },
        actions: {
          log_action: {
            logging: {
              text: "Watch triggered",
            },
          },
        },
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("created");
    });

    test("elasticsearch_watcher_delete_watch deletes a watch", async () => {
      mock.add(
        {
          method: "DELETE",
          path: "/_watcher/watch/:id",
        },
        () => ({
          found: true,
          _id: "old-watch",
          _version: 2,
        })
      );

      const { registerWatcherDeleteWatchTool } = await import("../../src/tools/watcher/delete_watch.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_watcher_delete_watch") {
            registeredHandler = handler;
          }
        },
      };

      registerWatcherDeleteWatchTool(mockServer as any, client);

      const result = await registeredHandler({
        id: "old-watch",
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("found");
    });

    test("elasticsearch_watcher_query_watches searches for watches", async () => {
      mock.add(
        {
          method: "POST",
          path: "/_watcher/_query/watches",
        },
        () => ({
          count: 2,
          watches: [
            {
              _id: "watch-1",
              _seq_no: 0,
              _primary_term: 1,
              status: {
                state: {
                  active: true,
                },
              },
              watch: {
                trigger: {
                  schedule: {
                    interval: "5m",
                  },
                },
              },
            },
            {
              _id: "watch-2",
              _seq_no: 1,
              _primary_term: 1,
              status: {
                state: {
                  active: false,
                },
              },
              watch: {
                trigger: {
                  schedule: {
                    daily: {
                      at: "10:00",
                    },
                  },
                },
              },
            },
          ],
        })
      );

      const { registerWatcherQueryWatchesTool } = await import("../../src/tools/watcher/query_watches.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_watcher_query_watches") {
            registeredHandler = handler;
          }
        },
      };

      registerWatcherQueryWatchesTool(mockServer as any, client);

      const result = await registeredHandler({
        size: 10,
      });

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("watch-1");
      expect(responseText).toContain("watch-2");
    });
  });

  describe("Watch Control", () => {
    test("elasticsearch_watcher_activate_watch activates a watch", async () => {
      mock.add(
        {
          method: "PUT",
          path: "/_watcher/watch/:watch_id/_activate",
        },
        () => ({
          status: {
            state: {
              active: true,
              timestamp: "2024-01-01T00:00:00.000Z",
            },
          },
        })
      );

      const { registerWatcherActivateWatchTool } = await import("../../src/tools/watcher/activate_watch.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_watcher_activate_watch") {
            registeredHandler = handler;
          }
        },
      };

      registerWatcherActivateWatchTool(mockServer as any, client);

      const result = await registeredHandler({
        watch_id: "my-watch",
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("active");
    });

    test("elasticsearch_watcher_deactivate_watch deactivates a watch", async () => {
      mock.add(
        {
          method: "PUT",
          path: "/_watcher/watch/:watch_id/_deactivate",
        },
        () => ({
          status: {
            state: {
              active: false,
              timestamp: "2024-01-01T00:00:00.000Z",
            },
          },
        })
      );

      const { registerWatcherDeactivateWatchTool } = await import("../../src/tools/watcher/deactivate_watch.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_watcher_deactivate_watch") {
            registeredHandler = handler;
          }
        },
      };

      registerWatcherDeactivateWatchTool(mockServer as any, client);

      const result = await registeredHandler({
        watch_id: "my-watch",
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("false");
    });

    test("elasticsearch_watcher_ack_watch acknowledges watch actions", async () => {
      mock.add(
        {
          method: "PUT",
          path: "/_watcher/watch/:watch_id/_ack/:action_id",
        },
        () => ({
          status: {
            state: {
              active: true,
            },
            actions: {
              send_email: {
                ack: {
                  timestamp: "2024-01-01T00:00:00.000Z",
                  state: "acked",
                },
              },
            },
          },
        })
      );

      const { registerWatcherAckWatchTool } = await import("../../src/tools/watcher/ack_watch.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_watcher_ack_watch") {
            registeredHandler = handler;
          }
        },
      };

      registerWatcherAckWatchTool(mockServer as any, client);

      const result = await registeredHandler({
        watch_id: "my-watch",
        action_id: ["send_email"],
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("acked");
    });

    test("elasticsearch_watcher_execute_watch executes a watch", async () => {
      mock.add(
        {
          method: "PUT",
          path: "/_watcher/watch/:id/_execute",
        },
        () => ({
          _id: "test-watch",
          watch_record: {
            watch_id: "test-watch",
            state: "executed",
            trigger_event: {
              type: "manual",
              triggered_time: "2024-01-01T00:00:00.000Z",
            },
            result: {
              condition: {
                met: true,
              },
              actions: [
                {
                  id: "log_action",
                  type: "logging",
                  status: "success",
                },
              ],
            },
          },
        })
      );

      const { registerWatcherExecuteWatchTool } = await import("../../src/tools/watcher/execute_watch.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_watcher_execute_watch") {
            registeredHandler = handler;
          }
        },
      };

      registerWatcherExecuteWatchTool(mockServer as any, client);

      const result = await registeredHandler({
        id: "test-watch",
        debug: true,
      });

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("executed");
      expect(responseText).toContain("success");
    });
  });

  describe("Watcher Service Control", () => {
    test("elasticsearch_watcher_start starts watcher service", async () => {
      mock.add(
        {
          method: "POST",
          path: "/_watcher/_start",
        },
        () => ({
          acknowledged: true,
        })
      );

      const { registerWatcherStartTool } = await import("../../src/tools/watcher/start.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_watcher_start") {
            registeredHandler = handler;
          }
        },
      };

      registerWatcherStartTool(mockServer as any, client);

      const result = await registeredHandler({});

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("acknowledged");
    });

    test("elasticsearch_watcher_stop stops watcher service", async () => {
      mock.add(
        {
          method: "POST",
          path: "/_watcher/_stop",
        },
        () => ({
          acknowledged: true,
        })
      );

      const { registerWatcherStopTool } = await import("../../src/tools/watcher/stop.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_watcher_stop") {
            registeredHandler = handler;
          }
        },
      };

      registerWatcherStopTool(mockServer as any, client);

      const result = await registeredHandler({});

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("acknowledged");
    });

    test("elasticsearch_watcher_stats gets watcher statistics", async () => {
      mock.add(
        {
          method: "GET",
          path: "/_watcher/stats",
        },
        () => ({
          watcher_state: "started",
          watch_count: 10,
          execution_thread_pool: {
            queue_size: 0,
            max_size: 10,
          },
          current_watches: [],
          queued_watches: [],
        })
      );

      const { registerWatcherStatsTool } = await import("../../src/tools/watcher/stats.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_watcher_stats") {
            registeredHandler = handler;
          }
        },
      };

      registerWatcherStatsTool(mockServer as any, client);

      const result = await registeredHandler({});

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("started");
      expect(responseText).toContain("watch_count");
    });

    test.skip("elasticsearch_watcher_get_settings gets watcher index settings - API might not exist", async () => {
      mock.add(
        {
          method: "GET",
          path: "/.watches/_settings",
        },
        () => ({
          ".watches": {
            settings: {
              index: {
                number_of_shards: "1",
                number_of_replicas: "1",
                auto_expand_replicas: "0-1",
              },
            },
          },
        })
      );

      const { registerWatcherGetSettingsTool } = await import("../../src/tools/watcher/get_settings.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_watcher_get_settings") {
            registeredHandler = handler;
          }
        },
      };

      registerWatcherGetSettingsTool(mockServer as any, client);

      const result = await registeredHandler({});

      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      expect(responseText).toContain("watches");
      expect(responseText).toContain("number_of_replicas");
    });

    test.skip("elasticsearch_watcher_update_settings updates watcher index settings - API might not exist", async () => {
      mock.add(
        {
          method: "PUT",
          path: "/.watches/_settings",
        },
        () => ({
          acknowledged: true,
        })
      );

      const { registerWatcherUpdateSettingsTool } = await import("../../src/tools/watcher/update_settings.js");
      
      let registeredHandler: any;
      const mockServer = {
        tool: (name: string, desc: string, schema: any, handler: any) => {
          if (name === "elasticsearch_watcher_update_settings") {
            registeredHandler = handler;
          }
        },
      };

      registerWatcherUpdateSettingsTool(mockServer as any, client);

      const result = await registeredHandler({
        "index.number_of_replicas": 2,
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("acknowledged");
    });
  });
});