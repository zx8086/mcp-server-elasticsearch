/* src/tools/autoscaling/delete_policy.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import type {
  ToolRegistrationFunction,
  SearchResult,
} from "../types.js";

// Define Zod schema for validation
const DeleteAutoscalingPolicyParams = z.object({
  name: z.string().min(1, "Policy name is required"),
  masterTimeout: z.string().optional(),
  timeout: z.string().optional(),
});

export const registerAutoscalingDeletePolicyTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "autoscaling_delete_policy",
    "Delete an autoscaling policy. NOTE: This feature is designed for indirect use by Elasticsearch Service, Elastic Cloud Enterprise, and Elastic Cloud on Kubernetes. Direct use is not supported.",
    DeleteAutoscalingPolicyParams.shape,
    async (params: z.infer<typeof DeleteAutoscalingPolicyParams>, extra: Record<string, unknown>): Promise<SearchResult> => {
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
    }
  );
};