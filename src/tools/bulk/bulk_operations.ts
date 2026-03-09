/* src/tools/bulk/bulk_operations.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { createProgressTracker, notificationManager } from "../../utils/notifications.js";
import { readOnlyManager } from "../../utils/readOnlyMode.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema type
const BulkOperationsParams = z.object({
  operations: z.array(z.object({}).passthrough()),
  index: z.string().optional(),
  routing: z.string().optional(),
  pipeline: z.string().optional(),
  refresh: z.string().optional(),
  requireAlias: booleanField().optional(),
  timeout: z.string().optional(),
  waitForActiveShards: z.string().optional(),
  flushBytes: z.number().optional(),
  concurrency: z.number().optional(),
  retries: z.number().optional(),
});

type BulkOperationsParamsType = z.infer<typeof BulkOperationsParams>;
export const registerBulkOperationsTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  // Tool registration using modern registerTool method

  server.registerTool(
    "elasticsearch_bulk_operations",

    {
      title: "Bulk Operations",

      description:
        "Perform bulk operations in Elasticsearch for high-throughput data ingestion. Best for batch indexing, bulk updates, mass data import, performance optimization. Use when you need to efficiently index, update, or delete large volumes of documents in Elasticsearch.",

      inputSchema: {
        operations: z.array(z.object({}).passthrough()),
        index: z.string().optional(),
        routing: z.string().optional(),
        pipeline: z.string().optional(),
        refresh: z.string().optional(),
        requireAlias: booleanField().optional(),
        timeout: z.string().optional(),
        waitForActiveShards: z.string().optional(),
        flushBytes: z.number().optional(),
        concurrency: z.number().optional(),
        retries: z.number().optional(),
      },
    },

    async (params: BulkOperationsParamsType): Promise<SearchResult> => {
      // Check read-only mode first
      const readOnlyCheck = readOnlyManager.checkOperation("elasticsearch_bulk_operations");
      if (!readOnlyCheck.allowed) {
        return readOnlyManager.createBlockedResponse("elasticsearch_bulk_operations");
      }

      // Validation: Ensure index is provided globally or per-document
      const hasGlobalIndex = !!params.index;
      const allDocsHaveIndex = params.operations.every((doc) => doc._index);
      if (!hasGlobalIndex && !allDocsHaveIndex) {
        const content: TextContent[] = [
          {
            type: "text",
            text: "Error: You must provide an 'index' parameter or ensure every operation document has a '_index' property.",
          } as TextContent,
        ];
        return { content };
      }

      // Create progress tracker for bulk operation
      const tracker = await createProgressTracker(
        "bulk_operations",
        params.operations.length,
        `Processing ${params.operations.length} bulk operations to ${params.index || "multiple indices"}`,
      );

      try {
        if (readOnlyCheck.warning) {
          logger.warn("🚨 CRITICAL: About to perform bulk operations", {
            tool: "elasticsearch_bulk_operations",
            operationCount: params.operations.length,
            warning: "This may create, update, or delete multiple documents",
          });

          await notificationManager.sendWarning(`About to perform ${params.operations.length} bulk operations`, {
            tool: "elasticsearch_bulk_operations",
            operation_count: params.operations.length,
            target_index: params.index || "multiple indices",
            warning: "This may create, update, or delete multiple documents",
          });
        }

        // Send initial status
        await notificationManager.sendInfo(`Starting bulk operations processing`, {
          operation_type: "bulk_operations",
          total_operations: params.operations.length,
          target_index: params.index || "multiple indices",
          flush_bytes: params.flushBytes,
          concurrency: params.concurrency,
        });

        // Progress tracking variables
        let processed = 0;
        let failed = 0;
        const startTime = Date.now();

        // Use the helper API for better performance and reliability
        const result = await esClient.helpers.bulk(
          {
            datasource: params.operations,
            onDocument(doc) {
              processed++;

              // Update progress every 100 documents or 10% of total, whichever is smaller
              const progressInterval = Math.min(100, Math.max(1, Math.floor(params.operations.length / 10)));
              if (processed % progressInterval === 0 || processed === params.operations.length) {
                const elapsed = (Date.now() - startTime) / 1000;
                const rate = elapsed > 0 ? processed / elapsed : 0;

                // Use setTimeout to make progress update async without blocking
                setTimeout(async () => {
                  await tracker.updateProgress(
                    processed,
                    `Processed ${processed}/${params.operations.length} operations (${failed} failed, ${Math.round(rate)} ops/sec)`,
                  );
                }, 0);
              }

              return {
                index: {
                  _index: params.index || doc._index,
                  routing: params.routing,
                  pipeline: params.pipeline,
                  refresh: params.refresh,
                  require_alias: params.requireAlias,
                  timeout: params.timeout,
                  wait_for_active_shards: params.waitForActiveShards,
                },
              } as any;
            },
            flushBytes: params.flushBytes,
            concurrency: params.concurrency,
            retries: params.retries,
            onDrop(doc) {
              failed++;
              logger.warn("Document failed after retries:", {
                document: JSON.stringify(doc, null, 2),
              });
            },
          },
          {
            opaqueId: "elasticsearch_bulk_operations",
          },
        );

        // Complete the operation with results
        const resultSummary = {
          total: result.total,
          successful: result.successful,
          failed: result.failed,
          time: result.time,
          bytes: result.bytes,
        };

        if (result.failed > 0) {
          await tracker.complete(
            resultSummary,
            `Bulk operations completed with ${result.failed} failures out of ${result.total} operations`,
          );

          await notificationManager.sendWarning(
            `Bulk operations completed with errors: ${result.successful} successful, ${result.failed} failed`,
            {
              ...resultSummary,
              operation_type: "bulk_operations",
              success_rate: `${((result.successful / result.total) * 100).toFixed(1)}%`,
            },
          );
        } else {
          await tracker.complete(
            resultSummary,
            `All ${result.total} bulk operations completed successfully in ${result.time}ms`,
          );

          await notificationManager.sendInfo(
            `Bulk operations completed successfully: ${result.total} operations in ${result.time}ms`,
            {
              ...resultSummary,
              operation_type: "bulk_operations",
              success_rate: "100%",
            },
          );
        }

        const content: TextContent[] = [
          {
            type: "text",
            text: JSON.stringify(resultSummary, null, 2),
          } as TextContent,
        ];
        const response: SearchResult = { content };

        if (readOnlyCheck.warning) {
          return readOnlyManager.createWarningResponse("elasticsearch_bulk_operations", response);
        }

        return response;
      } catch (error) {
        await tracker.fail(error instanceof Error ? error : new Error(String(error)), "Bulk operations failed");

        await notificationManager.sendError(
          "Bulk operations failed",
          error instanceof Error ? error : new Error(String(error)),
          {
            operation_type: "bulk_operations",
            total_operations: params.operations.length,
            target_index: params.index || "multiple indices",
          },
        );

        logger.error("Failed to perform bulk operations:", {
          error: error instanceof Error ? error.message : String(error),
        });
        const content: TextContent[] = [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          } as TextContent,
        ];
        return { content };
      }
    },
  );
};
