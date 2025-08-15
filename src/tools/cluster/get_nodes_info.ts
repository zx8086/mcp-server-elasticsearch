/* src/tools/cluster/get_nodes_info.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { type SearchResult, TextContent, type ToolRegistrationFunction } from "../types.js";

// Define the parameter schema type
const GetNodesInfoParams = z.object({
  nodeId: z.string().optional(),
  metric: z.string().optional(),
  flatSettings: z.boolean().optional(),
  timeout: z.string().optional(),
});

type GetNodesInfoParamsType = z.infer<typeof GetNodesInfoParams>;
export const registerGetNodesInfoTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_get_nodes_info",
    "Get information about nodes in the Elasticsearch cluster. Best for cluster monitoring, node diagnostics, infrastructure analysis. Use when you need to inspect node configuration, hardware details, and cluster topology in Elasticsearch.",
    {
      nodeId: z.string().optional(),
      metric: z.string().optional(),
      flatSettings: z.boolean().optional(),
      timeout: z.string().optional(),
    },
    async (params: GetNodesInfoParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.nodes.info(
          {
            node_id: params.nodeId,
            metric: params.metric,
            flat_settings: params.flatSettings,
            timeout: params.timeout,
          },
          {
            opaqueId: "elasticsearch_get_nodes_info",
          },
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to get nodes info:", {
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
