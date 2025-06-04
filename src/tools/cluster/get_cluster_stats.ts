/* src/tools/cluster/get_cluster_stats.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema type
const GetClusterStatsParams = z.object({
  nodeId: z.string().optional(),
  timeout: z.string().optional(),
});

type GetClusterStatsParamsType = z.infer<typeof GetClusterStatsParams>;
export const registerGetClusterStatsTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "elasticsearch_get_cluster_stats",
    "Get comprehensive cluster statistics from Elasticsearch. Best for: cluster monitoring, capacity planning, performance analysis. Use when you need detailed metrics about cluster-wide operations, storage, and resource utilization in Elasticsearch.",
    {
      nodeId: z.string().optional(),
      timeout: z.string().optional(),
    },
    async (params: GetClusterStatsParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.cluster.stats({
          node_id: params.nodeId,
          timeout: params.timeout,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to get cluster stats:", {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
};
