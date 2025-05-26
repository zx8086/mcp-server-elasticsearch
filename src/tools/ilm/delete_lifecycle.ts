/* src/tools/ilm/delete_lifecycle.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { withReadOnlyCheck, OperationType } from "../../utils/readOnlyMode.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import type {
  ToolRegistrationFunction,
  SearchResult,
  TextContent,
} from "../types.js";

// Define the parameter schema
const DeleteLifecycleParams = z.object({
  policy: z.string().min(1, "Policy identifier is required"),
  masterTimeout: z.string().optional(),
  timeout: z.string().optional(),
});

type DeleteLifecycleParamsType = z.infer<typeof DeleteLifecycleParams>;

export const registerDeleteLifecycleTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const deleteLifecycleImpl = async (
    params: DeleteLifecycleParamsType,
    extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
      const result = await esClient.ilm.deleteLifecycle({
        name: params.policy,
        master_timeout: params.masterTimeout,
        timeout: params.timeout,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
      };
    } catch (error) {
      logger.error("Failed to delete lifecycle policy:", {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          } as TextContent,
        ],
      };
    }
  };

  server.tool(
    "ilm_delete_lifecycle",
    "Delete a lifecycle policy. You cannot delete policies that are currently in use. If the policy is being used to manage any indices, the request fails and returns an error.",
    {
      policy: z.string().min(1, "Policy identifier is required"),
      masterTimeout: z.string().optional(),
      timeout: z.string().optional(),
    },
    withReadOnlyCheck(
      "ilm_delete_lifecycle",
      deleteLifecycleImpl,
      OperationType.DELETE,
    ),
  );
};
