/* src/tools/advanced/delete_by_query.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { createProgressTracker, notificationManager } from "../../utils/notifications.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction, WaitForActiveShards } from "../types.js";

// Define the parameter schema
const DeleteByQueryParams = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  query: z.object({}).passthrough(),
  maxDocs: z.number().optional(),
  conflicts: z.enum(["abort", "proceed"]).optional(),
  refresh: booleanField().optional(),
  timeout: z.string().optional(),
  waitForActiveShards: z.custom<WaitForActiveShards>().optional(),
  waitForCompletion: booleanField().optional(),
  requestsPerSecond: z.number().optional(),
  scroll: z.string().optional(),
  scrollSize: z.number().optional(),
  searchType: z.enum(["query_then_fetch", "dfs_query_then_fetch"]).optional(),
  searchTimeout: z.string().optional(),
  slices: z.number().optional(),
});

type DeleteByQueryParamsType = z.infer<typeof DeleteByQueryParams>;

export const registerDeleteByQueryTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  // Implementation function without read-only checks
  const deleteByQueryImpl = async (
    params: DeleteByQueryParamsType,
    _extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    // Create progress tracker for delete operation
    const tracker = await createProgressTracker(
      "delete_by_query",
      100, // percentage-based
      `Deleting documents from ${params.index} matching query`
    );

    try {
      logger.debug("Starting delete by query operation", {
        index: params.index,
        maxDocs: params.maxDocs,
        waitForCompletion: params.waitForCompletion,
      });

      // CRITICAL SAFETY WARNING for destructive operation
      await notificationManager.sendWarning(
        `🚨 DESTRUCTIVE OPERATION: About to delete documents from ${params.index}`,
        {
          operation_type: "delete_by_query",
          target_index: params.index,
          max_docs: params.maxDocs,
          warning: "This operation permanently deletes documents and cannot be undone",
        }
      );

      // First, get a count of documents that will be deleted
      let documentsToDelete = 0;
      try {
        await tracker.updateProgress(10, "Counting documents to be deleted");
        const countResult = await esClient.count({
          index: params.index,
          body: { query: params.query },
        });
        documentsToDelete = countResult.count;
        
        await notificationManager.sendWarning(
          `⚠️  DELETION SCOPE: ${documentsToDelete} documents will be permanently deleted`,
          {
            operation_type: "delete_by_query",
            documents_to_delete: documentsToDelete,
            index: params.index,
            confirmation_required: true,
          }
        );

        if (documentsToDelete > 10000) {
          await notificationManager.sendWarning(
            `🔥 LARGE DELETION: Deleting ${documentsToDelete} documents - this may impact cluster performance`,
            {
              operation_type: "delete_by_query", 
              large_deletion_warning: true,
              documents_count: documentsToDelete,
              recommendation: "Consider using smaller batches or lower requests_per_second",
            }
          );
        }
      } catch (countError) {
        logger.warn("Could not get document count for deletion estimate", {
          error: countError instanceof Error ? countError.message : String(countError),
        });
        
        await notificationManager.sendWarning(
          "Unable to determine deletion scope - proceeding with caution",
          {
            operation_type: "delete_by_query",
            warning: "Could not count documents to be deleted",
          }
        );
      }

      await tracker.updateProgress(20, "Starting document deletion operation");

      const result = await esClient.deleteByQuery({
        index: params.index,
        query: params.query,
        max_docs: params.maxDocs,
        conflicts: params.conflicts,
        refresh: params.refresh,
        timeout: params.timeout,
        wait_for_active_shards: params.waitForActiveShards,
        wait_for_completion: params.waitForCompletion,
        requests_per_second: params.requestsPerSecond,
        scroll: params.scroll,
        scroll_size: params.scrollSize,
        search_type: params.searchType,
        search_timeout: params.searchTimeout,
        slices: params.slices,
      });

      // Handle different response types based on wait_for_completion
      if (params.waitForCompletion === false && result.task) {
        // Asynchronous mode - return task ID
        await tracker.complete(
          { task: result.task },
          `Delete by query task created: ${result.task}`
        );
        
        await notificationManager.sendInfo(
          `Delete by query task created: ${result.task}`,
          {
            operation_type: "delete_by_query",
            mode: "asynchronous",
            task_id: result.task,
            note: "Use task management API to monitor deletion progress",
          }
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                task: result.task,
                message: "Delete by query started asynchronously. Use task management API to monitor progress.",
                monitor_command: `elasticsearch_tasks_get_task with taskId: "${result.task}"`,
                warning: "Deletion is in progress - documents are being permanently removed",
              }, null, 2),
            },
          ],
        };
      } else {
        // Synchronous mode - deletion completed
        const summary = {
          total: result.total || 0,
          deleted: result.deleted || 0,
          version_conflicts: result.version_conflicts || 0,
          noops: result.noops || 0,
          retries: result.retries || { bulk: 0, search: 0 },
          throttled_millis: result.throttled_millis || 0,
          requests_per_second: result.requests_per_second || 0,
          throttled_until_millis: result.throttled_until_millis || 0,
          took: result.took || 0,
          timed_out: result.timed_out || false,
          failures: result.failures || [],
        };

        if (summary.failures.length > 0 || summary.version_conflicts > 0) {
          await tracker.complete(
            summary,
            `Deletion completed with issues: ${summary.deleted} deleted, ${summary.version_conflicts} conflicts, ${summary.failures.length} failures`
          );
          
          await notificationManager.sendWarning(
            `Delete by query completed with issues`,
            {
              ...summary,
              operation_type: "delete_by_query",
              success_rate: summary.total > 0 ? ((summary.deleted / summary.total) * 100).toFixed(1) + "%" : "N/A",
            }
          );
        } else {
          await tracker.complete(
            summary,
            `Delete by query completed: ${summary.deleted} documents permanently deleted in ${summary.took}ms`
          );
          
          await notificationManager.sendInfo(
            `✅ Delete by query completed: ${summary.deleted} documents permanently deleted`,
            {
              ...summary,
              operation_type: "delete_by_query",
              success_rate: "100%",
              note: "Documents have been permanently removed from the index",
            }
          );
        }

        return {
          content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        };
      }
    } catch (error) {
      await tracker.fail(
        error instanceof Error ? error : new Error(String(error)),
        "Delete by query operation failed"
      );
      
      await notificationManager.sendError(
        "Delete by query operation failed",
        error instanceof Error ? error : new Error(String(error)),
        {
          operation_type: "delete_by_query",
          target_index: params.index,
          partial_deletion_risk: "Some documents may have been deleted before the error occurred",
          recovery_suggestion: "Check index state and consider running the operation again if needed",
        }
      );
      
      logger.error("Failed to delete by query:", {
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
    "elasticsearch_delete_by_query",
    "Delete documents by query in Elasticsearch. Best for bulk document deletion, data cleanup, removing documents matching specific criteria. Use when you need to delete multiple documents based on query conditions rather than individual document IDs in Elasticsearch.",
    {
      index: z.string().min(1, "Index cannot be empty"),
      query: z.object({}).passthrough(),
      maxDocs: z.number().optional(),
      conflicts: z.enum(["abort", "proceed"]).optional(),
      refresh: booleanField().optional(),
      timeout: z.string().optional(),
      waitForActiveShards: z.custom<WaitForActiveShards>().optional(),
      waitForCompletion: booleanField().optional(),
      requestsPerSecond: z.number().optional(),
      scroll: z.string().optional(),
      scrollSize: z.number().optional(),
      searchType: z.enum(["query_then_fetch", "dfs_query_then_fetch"]).optional(),
      searchTimeout: z.string().optional(),
      slices: z.number().optional(),
    },
    withReadOnlyCheck("elasticsearch_delete_by_query", deleteByQueryImpl, OperationType.DELETE),
  );
};
