/* src/tools/cluster/get_nodes_info.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import { type SearchResult, TextContent, type ToolRegistrationFunction } from "../types.js";

// Define the parameter schema type
const GetNodesInfoParams = z.object({
  nodeId: z.string().optional()
    .describe("Specific node ID, or '_local' for current node, or leave empty for all"),
  metric: z.string().optional()
    .describe("Specific metrics: 'name', 'os', 'jvm', 'process', 'thread_pool', 'transport', 'http', 'plugins', 'ingest'. Combine: 'os,jvm'"),
  flatSettings: booleanField().optional()
    .describe("Return settings in flat format"),
  timeout: z.string().optional()
    .describe("Timeout for the request"),
  compact: z.boolean().optional()
    .describe("Auto-select essential metrics (os,jvm,process,transport). Overrides 'metric' parameter"),
});

type GetNodesInfoParamsType = z.infer<typeof GetNodesInfoParams>;
export const registerGetNodesInfoTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_get_nodes_info",
    "Get node information (static configuration). WARNING: Full info exceeds 1MB per node. SAFE OPTIONS: {metric: 'name'} for node list, {metric: 'os,jvm'} for basic info, {metric: 'process,transport'} for network info. The 'compact' parameter auto-selects essential metrics. NEVER use empty {} - it will fail.",
    GetNodesInfoParams,
    async (params: GetNodesInfoParamsType): Promise<SearchResult> => {
      try {
        const { nodeId, metric, flatSettings, timeout, compact } = params;
        
        logger.debug("Getting nodes info", { nodeId, metric, compact });
        
        let result: any;
        
        // Handle no parameters - return minimal info
        if (!metric && !compact) {
          logger.warn("nodes.info called without metric or compact - forcing minimal response");
          
          // Return just node names to prevent huge response
          result = await esClient.nodes.info(
            {
              node_id: nodeId,
              metric: "name",  // Just node names
              flat_settings: flatSettings,
              timeout: timeout,
            },
            {
              opaqueId: "elasticsearch_get_nodes_info",
            },
          );
          
          return {
            content: [
              {
                type: "text",
                text: "⚠️ No parameters specified. Returning node names only. Use {metric: 'os,jvm'} for basic info or {compact: true} for essential metrics.",
              },
              { type: "text", text: JSON.stringify(result, null, 2) },
            ],
          };
        }
        
        if (compact === true) {
          // Compact mode: request only essential metrics (overrides metric param)
          result = await esClient.nodes.info(
            {
              node_id: nodeId,
              metric: "os,jvm,process,transport",  // Essential metrics only
              flat_settings: flatSettings,
              timeout: timeout,
            },
            {
              opaqueId: "elasticsearch_get_nodes_info",
            },
          );
          
          return {
            content: [
              {
                type: "text",
                text: "📊 Compact node information (os,jvm,process,transport metrics)",
              },
              { type: "text", text: JSON.stringify(result, null, 2) },
            ],
          };
        } else {
          // Use specified metric or fail gracefully
          result = await esClient.nodes.info(
            {
              node_id: nodeId,
              metric: metric,
              flat_settings: flatSettings,
              timeout: timeout,
            },
            {
              opaqueId: "elasticsearch_get_nodes_info",
            },
          );
        }
        
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
