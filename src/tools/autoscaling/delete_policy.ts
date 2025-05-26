/* src/tools/autoscaling/delete_policy.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { withReadOnlyCheck, OperationType } from "../../utils/readOnlyMode.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import type {
  ToolRegistrationFunction,
  SearchResult,
} from "../types.js";

// Define the parameter schema
const DeleteAutoscalingPolicyParams = z.object({
  name: z.string().min(1, "Policy name is required"),
  masterTimeout: z.string().optional(),
  timeout: z.string().optional(),
});

type DeleteAutoscalingPolicyParamsType = z.infer<typeof DeleteAutoscalingPolicyParams>;

export const registerAutoscalingDeletePolicyTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const deleteAutoscalingPolicyImpl = async (
    params: DeleteAutoscalingPolicyParamsType,
    extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
      const result = await esClient.autoscaling.deleteAutoscalingPolicy({
        name: params.name,
        master_timeout: params.masterTimeout,
        timeout: params.timeout,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to delete autoscaling policy:", {
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

  server.tool(
    "autoscaling_delete_policy",
    "Delete an autoscaling policy. NOTE: This feature is designed for indirect use by Elasticsearch Service, Elastic Cloud Enterprise, and Elastic Cloud on Kubernetes. Direct use is not supported.",
    {
      name: z.string().min(1, "Policy name is required"),
      masterTimeout: z.string().optional(),
      timeout: z.string().optional(),
    },
    withReadOnlyCheck(
      "autoscaling_delete_policy",
      deleteAutoscalingPolicyImpl,
      OperationType.DELETE,
    ),
  );
};
