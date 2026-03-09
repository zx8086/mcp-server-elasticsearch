/* src/tools/search/update_by_query.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { ProgressTracker } from "../../utils/notifications.js";
import { createProgressTracker, notificationManager } from "../../utils/notifications.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Zod validator for runtime validation
const updateByQueryValidator = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  query: z.object({}).passthrough(),
  script: z.object({}).passthrough().optional(),
  maxDocs: z.number().optional(),
  conflicts: z.enum(["abort", "proceed"]).optional(),
  refresh: booleanField().optional(),
  timeout: z.string().optional(),
  waitForActiveShards: z.union([z.literal("all"), z.number().min(1).max(9)]).optional(),
  waitForCompletion: booleanField().optional(),
  requestsPerSecond: z.number().optional(),
  scroll: z.string().optional(),
  scrollSize: z.number().optional(),
  searchType: z.enum(["query_then_fetch", "dfs_query_then_fetch"]).optional(),
  searchTimeout: z.string().optional(),
  slices: z.number().optional(),
});

type _UpdateByQueryParams = z.infer<typeof updateByQueryValidator>;

// MCP error handling
function createUpdateByQueryMcpError(
  error: Error | string,
  context: { type: "validation" | "execution"; details?: any },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_update_by_query] ${message}`, context.details);
}

// Tool implementation
export const registerUpdateByQueryTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const updateByQueryHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();
    let tracker: ProgressTracker | undefined;
    let params: z.infer<typeof updateByQueryValidator> | undefined;

    try {
      // Validate parameters
      params = updateByQueryValidator.parse(args);

      // Create progress tracker
      tracker = await createProgressTracker(
        "update_by_query",
        100, // percentage-based for async operations
        `Updating documents in ${params.index} matching query`,
      );

      logger.debug("Starting update by query operation", {
        index: params.index,
        hasScript: !!params.script,
        maxDocs: params.maxDocs,
        waitForCompletion: params.waitForCompletion,
      });

      // Send initial notification
      await notificationManager.sendInfo(`Starting update by query operation`, {
        operation_type: "update_by_query",
        target_index: params.index,
        max_docs: params.maxDocs,
        wait_for_completion: params.waitForCompletion,
        requests_per_second: params.requestsPerSecond,
      });

      // First, get a count of documents that match the query for progress estimation
      let estimatedTotal = 0;
      try {
        await tracker.updateProgress(10, "Counting documents matching query");
        const countResult = await esClient.count({
          index: params.index,
          query: params.query,
        } as any);
        estimatedTotal = countResult.count;

        await notificationManager.sendInfo(`Found ${estimatedTotal} documents matching update query`, {
          operation_type: "update_by_query",
          estimated_documents: estimatedTotal,
          index: params.index,
        });
      } catch (countError) {
        logger.warn("Could not get document count for progress estimation", {
          error: countError instanceof Error ? countError.message : String(countError),
        });
      }

      await tracker.updateProgress(20, "Starting document update operation");

      const result = await esClient.updateByQuery(
        {
          index: params.index,
          query: params.query,
          script: params.script,
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
        },
        {
          opaqueId: "elasticsearch_update_by_query",
        },
      );

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow operation", { duration });
      }

      // Handle different response types based on wait_for_completion
      if (params.waitForCompletion === false && result.task) {
        // Asynchronous mode - return task ID
        await tracker.complete({ task: result.task }, `Update by query task created: ${result.task}`);

        await notificationManager.sendInfo(`Update by query task created: ${result.task}`, {
          operation_type: "update_by_query",
          mode: "asynchronous",
          task_id: result.task,
          note: "Use task management API to monitor progress",
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  task: result.task,
                  message: "Update by query started asynchronously. Use task management API to monitor progress.",
                  monitor_command: `elasticsearch_tasks_get_task with taskId: "${result.task}"`,
                },
                null,
                2,
              ),
            },
          ],
        };
      } else {
        // Synchronous mode - operation completed
        const summary = {
          total: result.total || 0,
          updated: result.updated || 0,
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
            `Update completed with issues: ${summary.updated} updated, ${summary.version_conflicts} conflicts, ${summary.failures.length} failures`,
          );

          await notificationManager.sendWarning(`Update by query completed with issues`, {
            ...summary,
            operation_type: "update_by_query",
            duration_ms: duration,
            success_rate: summary.total > 0 ? `${((summary.updated / summary.total) * 100).toFixed(1)}%` : "N/A",
          });
        } else {
          await tracker.complete(
            summary,
            `Update by query completed successfully: ${summary.updated} documents updated in ${summary.took}ms`,
          );

          await notificationManager.sendInfo(`Update by query completed: ${summary.updated} documents updated`, {
            ...summary,
            operation_type: "update_by_query",
            duration_ms: duration,
            success_rate: "100%",
          });
        }

        return {
          content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        };
      }
    } catch (error) {
      await tracker?.fail(
        error instanceof Error ? error : new Error(String(error)),
        "Update by query operation failed",
      );

      await notificationManager.sendError(
        "Update by query operation failed",
        error instanceof Error ? error : new Error(String(error)),
        {
          operation_type: "update_by_query",
          target_index: params?.index,
          duration_ms: performance.now() - perfStart,
        },
      );

      // Error handling
      if (error instanceof z.ZodError) {
        throw createUpdateByQueryMcpError(`Validation failed: ${error.issues.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.issues, providedArgs: args },
        });
      }

      throw createUpdateByQueryMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Tool registration
  // Tool registration using modern registerTool method

  server.registerTool(
    "elasticsearch_update_by_query",

    {
      title: "Update By Query",

      description:
        "Update documents by query in Elasticsearch. Best for bulk document updates, field modifications, script-based transformations. Use when you need to update multiple documents based on query conditions rather than individual document updates. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: {
        index: z.string(), // Index name or pattern to update
        query: z.object({}), // Query DSL to select documents to update
        script: z.object({}).optional(), // Script to apply to matching documents
        maxDocs: z.number().optional(),
        conflicts: z.enum(["abort", "proceed"]).optional(),
        refresh: z.boolean().optional(),
        timeout: z.string().optional(),
        waitForActiveShards: z.any().optional(),
        waitForCompletion: z.boolean().optional(),
        requestsPerSecond: z.number().optional(),
        scroll: z.string().optional(),
        scrollSize: z.number().optional(),
        searchType: z.enum(["query_then_fetch", "dfs_query_then_fetch"]).optional(),
        searchTimeout: z.string().optional(),
        slices: z.number().optional(),
      },
    },

    updateByQueryHandler,
  );
};
