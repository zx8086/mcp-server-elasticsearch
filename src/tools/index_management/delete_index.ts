import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { readOnlyManager } from "../../utils/readOnlyMode.js";

export function registerDeleteIndexTool(server, esClient) {
  server.tool(
    "delete_index",
    "Delete an index in Elasticsearch",
    {
      index: z.string().min(1, "Index is required"),
      timeout: z.string().optional(),
      masterTimeout: z.string().optional(),
      ignoreUnavailable: z.boolean().optional(),
      allowNoIndices: z.boolean().optional(),
      expandWildcards: z.string().optional(),
    },
    async (params) => {
      // Check read-only mode with enhanced warning for destructive operation
      const readOnlyCheck = readOnlyManager.checkOperation("delete_index");
      if (!readOnlyCheck.allowed) {
        return readOnlyManager.createBlockedResponse("delete_index");
      }

      try {
        // Enhanced warning for particularly destructive operations
        if (readOnlyCheck.warning) {
          logger.warn("🚨 CRITICAL: About to delete entire index", { 
            tool: "delete_index", 
            index: params.index,
            warning: "This will permanently delete all data in the index"
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
        const response = { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        
        if (readOnlyCheck.warning) {
          return readOnlyManager.createWarningResponse("delete_index", response);
        }
        
        return response;
      } catch (error) {
        logger.error("Failed to delete index:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 