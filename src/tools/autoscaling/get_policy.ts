/* src/tools/autoscaling/get_policy.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema
const GetAutoscalingPolicyParams = z.object({
  name: z.string().min(1, "Policy name is required"),
  masterTimeout: z.string().optional(),
});

type GetAutoscalingPolicyParamsType = z.infer<typeof GetAutoscalingPolicyParams>;

export const registerAutoscalingGetPolicyTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "autoscaling_get_policy",
    "Get an autoscaling policy. NOTE: This feature is designed for indirect use by Elasticsearch Service, Elastic Cloud Enterprise, and Elastic Cloud on Kubernetes. Direct use is not supported.",
    {
      name: z.string().min(1, "Policy name is required"),
      masterTimeout: z.string().optional(),
    },
    async (params: GetAutoscalingPolicyParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.autoscaling.getAutoscalingPolicy({
          name: params.name,
          master_timeout: params.masterTimeout,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to get autoscaling policy:", {
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
