/* src/tools/ilm/remove_policy.ts */

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
const RemovePolicyParams = z.object({
  index: z.string().min(1, "Index name is required"),
});

type RemovePolicyParamsType = z.infer<typeof RemovePolicyParams>;

export const registerRemovePolicyTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const removePolicyImpl = async (
    params: RemovePolicyParamsType,
    extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
      const result = await esClient.ilm.removePolicy({
        index: params.index,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to remove policy:", {
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
    "elasticsearch_ilm_remove_policy",
    "Remove Index Lifecycle Management policy from indices in Elasticsearch. Best for policy detachment, manual management, lifecycle control. Use when you need to stop ILM management and remove policy assignments from Elasticsearch indices.",
    {
      index: z.string().min(1, "Index name is required"),
    },
    withReadOnlyCheck(
      "elasticsearch_ilm_remove_policy",
      removePolicyImpl,
      OperationType.WRITE,
    ),
  );
};
