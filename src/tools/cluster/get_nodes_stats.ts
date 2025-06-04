/* src/tools/cluster/get_nodes_stats.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult, TextContent } from "../types.js";

// Define the parameter schema type
const GetNodesStatsParams = z.object({
  nodeId: z.string().optional(),
  metric: z.string().optional(),
  indexMetric: z.string().optional(),
  timeout: z.string().optional(),
});

type GetNodesStatsParamsType = z.infer<typeof GetNodesStatsParams>;
export const registerGetNodesStatsTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "elasticsearch_get_nodes_stats",
    "Get node statistics from the Elasticsearch cluster. Best for performance monitoring, resource analysis, cluster diagnostics. Use when you need detailed metrics about node performance, memory usage, and operations in Elasticsearch.",
    {
      nodeId: z.string().optional(),
      metric: z.string().optional(),
      indexMetric: z.string().optional(),
      timeout: z.string().optional(),
    },
    async (params: GetNodesStatsParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.nodes.stats({
          node_id: params.nodeId,
          metric: params.metric,
          index_metric: params.indexMetric,
          timeout: params.timeout,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to get nodes stats:", {
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
