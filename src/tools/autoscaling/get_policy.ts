/* src/tools/autoscaling/get_policy.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { type SearchResult, TextContent, type ToolRegistrationFunction } from "../types.js";

// Define the parameter schema
const GetAutoscalingPolicyParams = z.object({
  name: z.string().min(1, "Policy name cannot be empty"),
  masterTimeout: z.string().optional(),
});

type GetAutoscalingPolicyParamsType = z.infer<typeof GetAutoscalingPolicyParams>;

export const registerAutoscalingGetPolicyTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  // Tool registration using modern registerTool method

  server.registerTool(

    "elasticsearch_autoscaling_get_policy",

    {

      title: "Autoscaling Get Policy",

      description: "Get an autoscaling policy from Elasticsearch. Best for policy inspection, capacity planning, configuration review. Use when you need to retrieve autoscaling policies in Elasticsearch Service, ECE, or ECK environments. NOTE: Designed for indirect use.",

      inputSchema: {
      name: z.string().min(1, "Policy name cannot be empty"),
      masterTimeout: z.string().optional(),
    },

    },

    async (params: GetAutoscalingPolicyParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.autoscaling.getAutoscalingPolicy(
          {
            name: params.name,
            master_timeout: params.masterTimeout,
          },
          {
            opaqueId: "elasticsearch_autoscaling_get_policy",
          },
        );
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

  );;
};
