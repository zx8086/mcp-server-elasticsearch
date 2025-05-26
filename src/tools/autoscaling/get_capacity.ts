/* src/tools/autoscaling/get_capacity.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema
const GetAutoscalingCapacityParams = z.object({
  masterTimeout: z.string().optional(),
});

type GetAutoscalingCapacityParamsType = z.infer<typeof GetAutoscalingCapacityParams>;

export const registerAutoscalingGetCapacityTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "autoscaling_get_capacity",
    "Get the autoscaling capacity. NOTE: This feature is designed for indirect use by Elasticsearch Service, Elastic Cloud Enterprise, and Elastic Cloud on Kubernetes. Direct use is not supported. This API gets the current autoscaling capacity based on the configured autoscaling policy.",
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
