/* src/tools/cluster/get_cluster_health.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";


// Define the parameter schema type
const GetClusterHealthParams = z.object({

      index: z.string().optional(),
      expandWildcards: z.string().optional(),
      level: z.string().optional(),
      local: z.boolean().optional(),
      masterTimeout: z.string().optional(),
      timeout: z.string().optional(),
      waitForActiveShards: z.string().optional(),
      waitForEvents: z.string().optional(),
      waitForNoInitializingShards: z.boolean().optional(),
      waitForNoRelocatingShards: z.boolean().optional(),
      waitForNodes: z.string().optional(),
      waitForStatus: z.string().optional(),
    
});

type GetClusterHealthParamsType = z.infer<typeof GetClusterHealthParams>;
export const registerGetClusterHealthTool: ToolRegistrationFunction = (
  server: McpServer, 
  esClient: Client
) => {
  server.tool(
    "get_cluster_health",
    "Get the health status of the Elasticsearch cluster",
    {
      index: z.string().optional(),
      expandWildcards: z.string().optional(),
      level: z.string().optional(),
      local: z.boolean().optional(),
      masterTimeout: z.string().optional(),
      timeout: z.string().optional(),
      waitForActiveShards: z.string().optional(),
      waitForEvents: z.string().optional(),
      waitForNoInitializingShards: z.boolean().optional(),
      waitForNoRelocatingShards: z.boolean().optional(),
      waitForNodes: z.string().optional(),
      waitForStatus: z.string().optional(),
    },
    async (params: GetClusterHealthParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.cluster.health({
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
        }, {
          opaqueId: 'get_cluster_health'
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to get cluster health:", {
          error: error instanceof Error ? error.message : String(error)
        });
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 