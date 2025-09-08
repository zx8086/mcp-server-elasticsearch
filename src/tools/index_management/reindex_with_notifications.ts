/* src/tools/index_management/reindex_with_notifications.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { createProgressTracker, notificationManager, withNotificationContext } from "../../utils/notifications.js";

// Tool validator
const reindexWithNotificationsValidator = z.object({
  source: z.object({
    index: z.string().min(1).describe("Source index pattern or name"),
    query: z.record(z.any()).optional().describe("Optional query to filter source documents"),
  }).describe("Source configuration"),
  dest: z.object({
    index: z.string().min(1).describe("Destination index name"),
    pipeline: z.string().optional().describe("Ingest pipeline to apply during reindexing"),
  }).describe("Destination configuration"),
  conflicts: z.enum(["abort", "proceed"]).default("abort").describe("How to handle version conflicts"),
  refresh: z.boolean().default(true).describe("Whether to refresh the destination index"),
  wait_for_completion: z.boolean().default(false).describe("Whether to wait for completion or return task ID"),
  requests_per_second: z.number().min(1).default(1000).describe("Throttling for the reindex operation"),
});

type ReindexWithNotificationsParams = z.infer<typeof reindexWithNotificationsValidator>;

/**
 * Reindex documents with comprehensive notifications
 */
export const registerReindexWithNotifications = (server: McpServer, esClient: Client) => {
  const handler = async (toolArgs: any, extra: any): Promise<any> => {
    try {
      // Always validate parameters
      const params = reindexWithNotificationsValidator.parse(toolArgs);

      // Create progress tracker
      const tracker = await createProgressTracker(
        "reindex",
        100, // Percentage-based progress
        `Reindexing from ${params.source.index} to ${params.dest.index}`
      );

      // Security validation is handled automatically by the server wrapper

      logger.info("Starting reindex operation with notifications", {
        source: params.source.index,
        destination: params.dest.index,
        waitForCompletion: params.wait_for_completion,
      });

      // Send pre-operation notifications
      await notificationManager.sendInfo(
        "Preparing reindex operation",
        {
          operation_type: "reindex",
          source_index: params.source.index,
          dest_index: params.dest.index,
          phase: "preparation",
        }
      );

      // First, check if source index exists and get document count
      let totalDocs = 0;
      try {
        await tracker.updateProgress(10, "Checking source index");
        
        const sourceExists = await esClient.indices.exists({
          index: params.source.index,
        });

        if (!sourceExists) {
          await tracker.fail(
            new Error(`Source index ${params.source.index} does not exist`),
            "Source index validation failed"
          );
          
          throw new McpError(
            ErrorCode.InvalidParams,
            `Source index ${params.source.index} does not exist`
          );
        }

        // Get document count for progress tracking
        const countResponse = await esClient.count({
          index: params.source.index,
          body: params.source.query ? { query: params.source.query } : {},
        });
        
        totalDocs = countResponse.count;
        
        await notificationManager.sendInfo(
          `Source index validated: ${totalDocs} documents found`,
          {
            source_index: params.source.index,
            total_documents: totalDocs,
            phase: "validation",
          }
        );

        await tracker.updateProgress(20, `Found ${totalDocs} documents in source index`);
      } catch (validationError) {
        await tracker.fail(
          validationError instanceof Error ? validationError : new Error(String(validationError)),
          "Source index validation failed"
        );
        throw validationError;
      }

      // Check destination index
      try {
        await tracker.updateProgress(30, "Preparing destination index");
        
        const destExists = await esClient.indices.exists({
          index: params.dest.index,
        });

        if (destExists) {
          await notificationManager.sendWarning(
            `Destination index ${params.dest.index} already exists - documents may be updated`,
            {
              dest_index: params.dest.index,
              phase: "preparation",
            }
          );
        } else {
          await notificationManager.sendInfo(
            `Destination index ${params.dest.index} will be created`,
            {
              dest_index: params.dest.index,
              phase: "preparation",
            }
          );
        }
      } catch (destError) {
        logger.warn("Could not check destination index", {
          error: destError instanceof Error ? destError.message : String(destError),
        });
      }

      // Start the reindex operation
      await tracker.updateProgress(40, "Starting reindex operation");
      
      const reindexRequest: any = {
        source: {
          index: params.source.index,
          ...(params.source.query && { query: params.source.query }),
        },
        dest: {
          index: params.dest.index,
          ...(params.dest.pipeline && { pipeline: params.dest.pipeline }),
        },
        conflicts: params.conflicts,
        refresh: params.refresh,
        wait_for_completion: params.wait_for_completion,
        requests_per_second: params.requests_per_second,
      };

      let reindexResult;
      
      if (params.wait_for_completion) {
        // Synchronous reindex with progress simulation
        await notificationManager.sendInfo(
          "Reindex operation started (synchronous mode)",
          {
            mode: "synchronous",
            requests_per_second: params.requests_per_second,
            phase: "execution",
          }
        );

        // Simulate progress updates during reindex
        const progressInterval = setInterval(async () => {
          const currentProgress = 50 + Math.random() * 30; // Simulate progress between 50-80%
          await tracker.updateProgress(
            Math.min(currentProgress, 90),
            "Reindexing documents..."
          );
        }, 2000);

        try {
          reindexResult = await esClient.reindex(reindexRequest);
          clearInterval(progressInterval);
          await tracker.updateProgress(95, "Reindex operation completed");
        } catch (reindexError) {
          clearInterval(progressInterval);
          throw reindexError;
        }

        // Process synchronous result
        const result = {
          took: reindexResult.took,
          timed_out: reindexResult.timed_out,
          total: reindexResult.total,
          updated: reindexResult.updated,
          created: reindexResult.created,
          deleted: reindexResult.deleted,
          batches: reindexResult.batches,
          version_conflicts: reindexResult.version_conflicts,
          noops: reindexResult.noops,
          retries: reindexResult.retries,
          throttled_millis: reindexResult.throttled_millis,
          requests_per_second: reindexResult.requests_per_second,
          throttled_until_millis: reindexResult.throttled_until_millis,
          failures: reindexResult.failures || [],
        };

        if (reindexResult.failures && reindexResult.failures.length > 0) {
          await tracker.complete(
            result,
            `Reindex completed with ${reindexResult.failures.length} failures`
          );
          
          await notificationManager.sendWarning(
            `Reindex completed with failures: ${reindexResult.total} total, ${reindexResult.failures.length} failed`,
            {
              ...result,
              phase: "completion",
            }
          );
        } else {
          await tracker.complete(
            result,
            `Reindex completed successfully: ${reindexResult.total} documents processed`
          );
          
          await notificationManager.sendInfo(
            `Reindex completed successfully: ${reindexResult.total} documents processed`,
            {
              ...result,
              phase: "completion",
            }
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
        
      } else {
        // Asynchronous reindex - return task ID
        await notificationManager.sendInfo(
          "Reindex operation started (asynchronous mode)",
          {
            mode: "asynchronous",
            requests_per_second: params.requests_per_second,
            phase: "execution",
          }
        );

        reindexResult = await esClient.reindex(reindexRequest);
        
        await tracker.complete(
          { task: reindexResult.task },
          `Reindex task created: ${reindexResult.task}`
        );

        await notificationManager.sendInfo(
          `Reindex task created: ${reindexResult.task}`,
          {
            task_id: reindexResult.task,
            phase: "task_created",
            note: "Use the task management API to monitor progress",
          }
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                task: reindexResult.task,
                message: "Reindex operation started asynchronously. Use task management API to monitor progress.",
                monitor_command: `elasticsearch_tasks_get_task with taskId: "${reindexResult.task}"`,
              }, null, 2),
            },
          ],
        };
      }

    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Validation failed: ${error.errors.map(e => e.message).join(", ")}`
        );
      }
      
      logger.error("Reindex with notifications failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      
      await notificationManager.sendError(
        "Reindex operation failed",
        error instanceof Error ? error : new Error(String(error)),
        {
          operation_type: "reindex",
          phase: "error",
        }
      );
      
      throw new McpError(
        ErrorCode.InternalError,
        `Reindex operation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  // Tool registration using modern registerTool method


  server.registerTool(


    "elasticsearch_reindex_with_notifications",


    {


      title: "Reindex With Notifications",


      description: "Reindex documents from source to destination with comprehensive progress notifications and status updates. Supports both synchronous and asynchronous modes with real-time progress tracking and error reporting.",


      inputSchema: {
      source: z.object({
        index: z.string().min(1).describe("Source index pattern or name"),
        query: z.record(z.any()).optional().describe("Optional query to filter source documents"),
      }).describe("Source configuration"),
      dest: z.object({
        index: z.string().min(1).describe("Destination index name"),
        pipeline: z.string().optional().describe("Ingest pipeline to apply during reindexing"),
      }).describe("Destination configuration"),
      conflicts: z.enum(["abort", "proceed"]).default("abort").describe("How to handle version conflicts"),
      refresh: z.boolean().default(true).describe("Whether to refresh the destination index"),
      wait_for_completion: z.boolean().default(false).describe("Whether to wait for completion or return task ID"),
      requests_per_second: z.number().min(1).default(1000).describe("Throttling for the reindex operation"),
    },


    },


    withNotificationContext(handler),


  );;
};