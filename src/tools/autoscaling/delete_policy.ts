/* src/tools/autoscaling/delete_policy.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Define Zod schema for validation
const DeleteAutoscalingPolicyParams = z.object({
  name: z.string().min(1, "Policy name is required"),
  masterTimeout: z.string().optional(),
  timeout: z.string().optional(),
});

export const registerAutoscalingDeletePolicyTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_autoscaling_delete_policy",
    "Delete an autoscaling policy in Elasticsearch. Best for policy cleanup, configuration management, resource optimization. Use when you need to remove autoscaling policies in Elasticsearch Service, ECE, or ECK environments. NOTE: Designed for indirect use.",
    DeleteAutoscalingPolicyParams.shape,
    async (
      params: z.infer<typeof DeleteAutoscalingPolicyParams>,
      _extra: Record<string, unknown>,
    ): Promise<SearchResult> => {
      try {
        const result = await esClient.autoscaling.deleteAutoscalingPolicy(
          {
            name: params.name,
            master_timeout: params.masterTimeout,
            timeout: params.timeout,
          },
          {
            opaqueId: "elasticsearch_autoscaling_delete_policy",
          },
        );
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
    },
  );
};
