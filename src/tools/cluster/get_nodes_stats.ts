import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerGetNodesStatsTool(server, esClient) {
  server.tool(
    "get_nodes_stats",
    "Get statistics about nodes in the Elasticsearch cluster",
    {
      nodeId: z.string().optional(),
      metric: z.string().optional(),
      indexMetric: z.string().optional(),
      timeout: z.string().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.nodes.stats({
          node_id: params.nodeId,
          metric: params.metric,
          index_metric: params.indexMetric,
          timeout: params.timeout,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to get nodes stats:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 