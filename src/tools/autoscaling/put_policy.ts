/* src/tools/autoscaling/put_policy.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema
const PutAutoscalingPolicyParams = z.object({
  name: z.string().min(1, "Policy name cannot be empty"),
  policy: z.any(),
  masterTimeout: z.string().optional(),
  timeout: z.string().optional(),
});

type PutAutoscalingPolicyParamsType = z.infer<typeof PutAutoscalingPolicyParams>;

export const registerAutoscalingPutPolicyTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  // Implementation function without read-only checks
  const putAutoscalingPolicyImpl = async (
    params: PutAutoscalingPolicyParamsType,
    _extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
      const result = await esClient.autoscaling.putAutoscalingPolicy({
        name: params.name,
        policy: params.policy,
        master_timeout: params.masterTimeout,
        timeout: params.timeout,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to create/update autoscaling policy:", {
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
  };

  // Tool registration using modern registerTool method

  server.registerTool(
    "elasticsearch_autoscaling_put_policy",

    {
      title: "Autoscaling Put Policy",

      description:
        "Create or update an autoscaling policy in Elasticsearch. Best for capacity management, resource automation, cluster scaling. Use when you need to define autoscaling policies for Elasticsearch Service, ECE, or ECK environments. NOTE: Designed for indirect use.",

      inputSchema: {
        name: z.string().min(1, "Policy name cannot be empty"),
        policy: z.any(),
        masterTimeout: z.string().optional(),
        timeout: z.string().optional(),
      },
    },

    withReadOnlyCheck("elasticsearch_autoscaling_put_policy", putAutoscalingPolicyImpl, OperationType.WRITE),
  );
};
