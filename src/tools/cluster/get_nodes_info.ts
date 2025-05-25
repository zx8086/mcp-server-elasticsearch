/* src/tools/cluster/get_nodes_info.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerGetNodesInfoTool(server, esClient) {
  server.tool(
    "get_nodes_info",
    "Get information about nodes in the Elasticsearch cluster",
    {
      nodeId: z.string().optional(),
      metric: z.string().optional(),
      flatSettings: z.boolean().optional(),
      timeout: z.string().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.nodes.info({
          node_id: params.nodeId,
          metric: params.metric,
          flat_settings: params.flatSettings,
          timeout: params.timeout,
        }, {
          opaqueId: 'get_nodes_info'
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to get nodes info:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 