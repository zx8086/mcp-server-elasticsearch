/* src/tools/cluster/get_cluster_health.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult, TextContent } from "../types.js";

// Define the parameter schema type
const GetClusterHealthParams = z.object({
  index: z.string().optional(),
  expandWildcards: z
    .enum(["all", "open", "closed", "hidden", "none"])
    .optional(),
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

type GetClusterHealthParamsType = z.infer<typeof GetClusterHealthParams>;

export const registerGetClusterHealthTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  logger.info("Registering cluster health tool...");
  
  try {
    server.tool(
      "elasticsearch_get_cluster_health",
      "Get the health status of the Elasticsearch cluster. Best for cluster monitoring, health checks, system diagnostics. Use when you need to assess cluster status, node availability, and overall Elasticsearch system health.",
      GetClusterHealthParams.shape,
      async (params: GetClusterHealthParamsType): Promise<SearchResult> => {
        const requestId = Math.random().toString(36).substring(7);
        logger.info(`[${requestId}] Cluster health request received`, { 
          params: {
            ...params,
            index: params.index ? '[REDACTED]' : undefined
          }
        });

        try {
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
          const result = await esClient.cluster.health(
            requestParams,
            {
              opaqueId: "elasticsearch_get_cluster_health",
            },
          );

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

          const response: SearchResult = {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
          };

          logger.info(`[${requestId}] Returning response...`);
          return response;

        } catch (error) {
          // Enhanced error logging with request context
          logger.error(`[${requestId}] Failed to get cluster health:`, {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            name: error instanceof Error ? error.name : 'Unknown',
            cause: error instanceof Error ? error.cause : undefined,
            params: {
              ...params,
              index: params.index ? '[REDACTED]' : undefined
            },
            // Add Elasticsearch specific error details if available
            elasticsearchError: error instanceof Error && 'meta' in error ? error.meta : undefined,
            statusCode: error instanceof Error && 'statusCode' in error ? error.statusCode : undefined,
          });

          // Return a more detailed error response
          return {
            content: [
              {
                type: "text",
                text: `Error getting cluster health: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          };
        }
      },
    );
    
    logger.info("✅ Cluster health tool registered successfully");
  } catch (registrationError) {
    logger.error("Failed to register cluster health tool:", {
      error: registrationError instanceof Error ? registrationError.message : String(registrationError),
      stack: registrationError instanceof Error ? registrationError.stack : undefined,
      name: registrationError instanceof Error ? registrationError.name : 'Unknown',
    });
    throw registrationError;
  }
};
