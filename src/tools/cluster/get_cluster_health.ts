/* src/tools/cluster/get_cluster_health.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Zod validator for runtime validation
const clusterHealthValidator = z.object({
  index: z.string().optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
  level: z.enum(["cluster", "indices", "shards"]).optional(),
  local: z.boolean().optional(),
  masterTimeout: z.string().optional(),
  timeout: z.string().optional(),
  waitForActiveShards: z.union([z.literal("all"), z.number()]).optional(),
  waitForEvents: z.enum(["immediate", "urgent", "high", "normal", "low", "languid"]).optional(),
  waitForNoInitializingShards: z.boolean().optional(),
  waitForNoRelocatingShards: z.boolean().optional(),
  waitForNodes: z.string().optional(),
  waitForStatus: z.enum(["green", "yellow", "red"]).optional(),
});

type _ClusterHealthParams = z.infer<typeof clusterHealthValidator>;

// MCP error handling
function createClusterHealthMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "cluster_unhealthy" | "node_unavailable";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    cluster_unhealthy: ErrorCode.InternalError,
    node_unavailable: ErrorCode.InternalError,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_get_cluster_health] ${message}`, context.details);
}

// Tool implementation
export const registerGetClusterHealthTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const clusterHealthHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();
    const requestId = Math.random().toString(36).substring(7);

    try {
      // Validate parameters
      const params = clusterHealthValidator.parse(args);

      logger.info(`[${requestId}] Cluster health request received`, {
        params: {
          ...params,
          index: params.index ? "[REDACTED]" : undefined,
        },
      });

      logger.info(`[${requestId}] Preparing cluster health request...`);
      const requestParams = {
        index: params.index,
        expand_wildcards: params.expandWildcards,
        level: params.level,
        local: params.local,
        master_timeout: params.masterTimeout,
        timeout: params.timeout,
        wait_for_active_shards: params.waitForActiveShards,
        wait_for_events: params.waitForEvents,
        wait_for_no_initializing_shards: params.waitForNoInitializingShards,
        wait_for_no_relocating_shards: params.waitForNoRelocatingShards,
        wait_for_nodes: params.waitForNodes,
        wait_for_status: params.waitForStatus,
      };

      logger.debug(`[${requestId}] Request parameters:`, requestParams);
      logger.info(`[${requestId}] Executing cluster.health()...`);

      const result = await esClient.cluster.health(requestParams, {
        opaqueId: "elasticsearch_get_cluster_health",
      });

      logger.info(`[${requestId}] Successfully retrieved cluster health`, {
        status: result.status,
        numberOfNodes: result.number_of_nodes,
        activeShards: result.active_shards,
        clusterName: result.cluster_name,
        taskMaxWaitingInQueueMillis: result.task_max_waiting_in_queue_millis,
        numberOfPendingTasks: result.number_of_pending_tasks,
        numberOfInFlightFetch: result.number_of_in_flight_fetch,
        initializingShards: result.initializing_shards,
        unassignedShards: result.unassigned_shards,
        delayedUnassignedShards: result.delayed_unassigned_shards,
        activeShardsPercentAsNumber: result.active_shards_percent_as_number,
      });

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow cluster health operation", { duration, requestId });
      }

      logger.info(`[${requestId}] Returning response...`);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createClusterHealthMcpError(`Validation failed: ${error.issues.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.issues, providedArgs: args },
        });
      }

      if (error instanceof Error) {
        // Cluster-specific error handling
        if (error.message.includes("cluster_block_exception") || error.message.includes("cluster_unhealthy")) {
          throw createClusterHealthMcpError(`Cluster is unhealthy: ${error.message}`, {
            type: "cluster_unhealthy",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("node_not_connected") || error.message.includes("no_node_available")) {
          throw createClusterHealthMcpError(`Node unavailable: ${error.message}`, {
            type: "node_unavailable",
            details: { originalError: error.message },
          });
        }
      }

      // Enhanced error logging with request context
      logger.error(`[${requestId}] Failed to get cluster health:`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : "Unknown",
        cause: error instanceof Error ? error.cause : undefined,
        params: {
          ...args,
          index: args?.index ? "[REDACTED]" : undefined,
        },
        elasticsearchError: error instanceof Error && "meta" in error ? error.meta : undefined,
        statusCode: error instanceof Error && "statusCode" in error ? error.statusCode : undefined,
      });

      throw createClusterHealthMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          requestId,
          args,
        },
      });
    }
  };

  // Tool registration
  // Tool registration using modern registerTool method

  server.registerTool(
    "elasticsearch_get_cluster_health",

    {
      title: "Get Cluster Health",

      description:
        "Get the health status of the Elasticsearch cluster. Best for cluster monitoring, health checks, system diagnostics. Use when you need to assess cluster status, node availability, and overall Elasticsearch system health. READ operation - safe for production use.",

      inputSchema: {
        index: z.string().optional(), // Comma-separated list of indices to check health for. Leave empty for cluster-wide health.
        expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(), // Controls which types of indices to include when using wildcards
        level: z.enum(["cluster", "indices", "shards"]).optional(), // Level of detail to return: cluster (default), indices, or shards
        local: z.boolean().optional(), // Return local information, do not retrieve from master node
        masterTimeout: z.string().optional(), // Timeout for connecting to master node (e.g., '30s', '1m')
        timeout: z.string().optional(), // Timeout for the request (e.g., '30s', '1m')
        waitForActiveShards: z.any().optional(), // Wait until the specified number of shards are active
        waitForEvents: z.enum(["immediate", "urgent", "high", "normal", "low", "languid"]).optional(), // Wait until all pending events are processed
        waitForNoInitializingShards: z.boolean().optional(), // Wait until there are no initializing shards
        waitForNoRelocatingShards: z.boolean().optional(), // Wait until there are no relocating shards
        waitForNodes: z.string().optional(), // Wait until the specified number of nodes are available (e.g., '>=2')
        waitForStatus: z.enum(["green", "yellow", "red"]).optional(), // Wait until cluster status reaches the specified level
      },
    },

    clusterHealthHandler,
  );
};
