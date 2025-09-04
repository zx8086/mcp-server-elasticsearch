/* src/tools/autoscaling/get_capacity.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { type SearchResult, TextContent, type ToolRegistrationFunction } from "../types.js";

// Define the parameter schema
const GetAutoscalingCapacityParams = z.object({
  masterTimeout: z.string().optional(),
});

type GetAutoscalingCapacityParamsType = z.infer<typeof GetAutoscalingCapacityParams>;

export const registerAutoscalingGetCapacityTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_autoscaling_get_capacity",
    "Get the current autoscaling capacity from Elasticsearch. Best for capacity planning, resource monitoring, cluster scaling analysis. Use when you need to monitor Elasticsearch cluster autoscaling decisions and capacity recommendations. NOTE: Designed for Elasticsearch Service, ECE, and ECK.",
    {
      masterTimeout: z.string().optional(),
    },
    async (params: GetAutoscalingCapacityParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.autoscaling.getAutoscalingCapacity({
          master_timeout: params.masterTimeout,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to get autoscaling capacity:", {
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
