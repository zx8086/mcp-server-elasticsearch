/* src/tools/ilm/delete_lifecycle.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema
const DeleteLifecycleParams = z.object({
  policy: z.string().min(1, "Policy identifier is required"),
  masterTimeout: z.string().optional(),
  timeout: z.string().optional(),
});

type DeleteLifecycleParamsType = z.infer<typeof DeleteLifecycleParams>;

export const registerDeleteLifecycleTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  // Implementation function without read-only checks
  const deleteLifecycleImpl = async (
    params: DeleteLifecycleParamsType,
    _extra: Record<string, unknown>,
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
    "elasticsearch_ilm_delete_lifecycle",
    "Delete an Index Lifecycle Management policy in Elasticsearch. Best for policy cleanup, configuration management, lifecycle optimization. Use when you need to remove unused ILM policies from Elasticsearch. Cannot delete policies currently in use.",
    {
      policy: z.string().min(1, "Policy identifier is required"),
      masterTimeout: z.string().optional(),
      timeout: z.string().optional(),
    },
    withReadOnlyCheck("elasticsearch_ilm_delete_lifecycle", deleteLifecycleImpl, OperationType.DELETE),
  );
};
