/* src/tools/index_management/delete_index.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { readOnlyManager } from "../../utils/readOnlyMode.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema type
const DeleteIndexParams = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  timeout: z.string().optional(),
  masterTimeout: z.string().optional(),
  ignoreUnavailable: booleanField().optional(),
  allowNoIndices: booleanField().optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
});

type DeleteIndexParamsType = z.infer<typeof DeleteIndexParams>;
export const registerDeleteIndexTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_delete_index",
    "Delete an entire index in Elasticsearch. Best for index cleanup, data lifecycle management, removing obsolete indices. Use when you need to permanently remove complete Elasticsearch indices and all their documents. DESTRUCTIVE OPERATION.",
    {
      index: z.string().min(1, "Index cannot be empty"),
      timeout: z.string().optional(),
      masterTimeout: z.string().optional(),
      ignoreUnavailable: booleanField().optional(),
      allowNoIndices: booleanField().optional(),
      expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
    },
    async (params: DeleteIndexParamsType): Promise<SearchResult> => {
      // Check read-only mode with enhanced warning for destructive operation
      const readOnlyCheck = readOnlyManager.checkOperation("elasticsearch_delete_index");
      if (!readOnlyCheck.allowed) {
        return readOnlyManager.createBlockedResponse("elasticsearch_delete_index");
      }

      try {
        // Enhanced warning for particularly destructive operations
        if (readOnlyCheck.warning) {
          logger.warn("🚨 CRITICAL: About to delete entire index", {
            tool: "elasticsearch_delete_index",
            index: params.index,
            warning: "This will permanently delete all data in the index",
          });
        }

        const result = await esClient.indices.delete({
          index: params.index,
          timeout: params.timeout,
          master_timeout: params.masterTimeout,
          ignore_unavailable: params.ignoreUnavailable,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
        });
        const response: SearchResult = {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
        };

        if (readOnlyCheck.warning) {
          return readOnlyManager.createWarningResponse("elasticsearch_delete_index", response);
        }

        return response;
      } catch (error) {
        logger.error("Failed to delete index:", {
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
    },
  );
};
