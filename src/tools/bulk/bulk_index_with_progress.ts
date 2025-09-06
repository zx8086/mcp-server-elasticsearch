/* src/tools/bulk/bulk_index_with_progress.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { createProgressTracker, notificationManager } from "../../utils/notifications.js";

// Tool validator
const bulkIndexWithProgressValidator = z.object({
  index: z.string().min(1).describe("Target index for bulk indexing"),
  documents: z.array(z.record(z.any())).min(1).max(1000).describe("Array of documents to index (max 1000)"),
  refresh: z.enum(["true", "false", "wait_for"]).optional().describe("Whether to refresh the index after operations"),
  pipeline: z.string().optional().describe("Ingest pipeline to use"),
  routing: z.string().optional().describe("Custom routing value"),
  batchSize: z.number().min(1).max(100).default(50).describe("Number of documents to process per batch"),
});

type BulkIndexWithProgressParams = z.infer<typeof bulkIndexWithProgressValidator>;

/**
 * Bulk index documents with progress notifications
 */
export const registerBulkIndexWithProgress = (server: McpServer, esClient: Client) => {
  const handler = async (toolArgs: any, extra: any): Promise<any> => {
    try {
      // Always validate parameters
      const params = bulkIndexWithProgressValidator.parse(toolArgs);

      // Check for progress token from MCP client
      const progressToken = extra?.params?._meta?.progressToken;
      
      // Create progress tracker
      const tracker = await createProgressTracker(
        "bulk_index",
        params.documents.length,
        `Bulk indexing ${params.documents.length} documents to ${params.index}`
      );

      // Security validation is handled automatically by the server wrapper

      const { index, documents, refresh, pipeline, routing, batchSize } = params;
      const totalDocs = documents.length;
      const batches = Math.ceil(totalDocs / batchSize);

      logger.info("Starting bulk index operation with progress", {
        index,
        totalDocs,
        batchSize,
        batches,
        progressToken,
      });

      // Send initial notification
      await notificationManager.sendInfo(
        `Starting bulk indexing of ${totalDocs} documents`,
        {
          operation_type: "bulk_index",
          index,
          total_documents: totalDocs,
          batch_size: batchSize,
          batches,
        }
      );

      let totalProcessed = 0;
      let totalErrors = 0;
      let totalSuccess = 0;
      const errors: any[] = [];

      // Process documents in batches
      for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
        const startIdx = batchIndex * batchSize;
        const endIdx = Math.min(startIdx + batchSize, totalDocs);
        const batchDocs = documents.slice(startIdx, endIdx);

        await tracker.updateProgress(
          totalProcessed,
          `Processing batch ${batchIndex + 1} of ${batches} (${batchDocs.length} documents)`
        );

        try {
          // Prepare bulk request body
          const body = [];
          for (const doc of batchDocs) {
            // Index operation metadata
            const indexOp: any = { index: { _index: index } };
            if (pipeline) indexOp.index.pipeline = pipeline;
            if (routing) indexOp.index.routing = routing;
            
            body.push(indexOp);
            body.push(doc);
          }

          // Execute bulk request
          const bulkResponse = await esClient.bulk({
            body,
            refresh: refresh as any,
          });

          // Process results
          if (bulkResponse.items) {
            for (const item of bulkResponse.items) {
              const operation = item.index || item.create || item.update || item.delete;
              if (operation) {
                if (operation.error) {
                  totalErrors++;
                  errors.push({
                    document_index: totalProcessed,
                    error: operation.error,
                  });
                } else {
                  totalSuccess++;
                }
                totalProcessed++;
              }
            }
          }

          // Update progress after batch
          const progress = Math.min(totalProcessed, totalDocs);
          await tracker.updateProgress(
            progress,
            `Completed batch ${batchIndex + 1}: ${totalSuccess} success, ${totalErrors} errors`
          );

          // Small delay to allow progress to be visible
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (batchError) {
          logger.error("Batch processing error", {
            batchIndex,
            error: batchError instanceof Error ? batchError.message : String(batchError),
          });

          // Count all documents in failed batch as errors
          totalErrors += batchDocs.length;
          totalProcessed += batchDocs.length;
          
          errors.push({
            batch_index: batchIndex,
            batch_size: batchDocs.length,
            error: batchError instanceof Error ? batchError.message : String(batchError),
          });

          await tracker.updateProgress(
            totalProcessed,
            `Batch ${batchIndex + 1} failed: ${batchError instanceof Error ? batchError.message : String(batchError)}`
          );
        }
      }

      // Prepare final result
      const result = {
        processed: totalProcessed,
        successful: totalSuccess,
        errors: totalErrors,
        error_details: errors.length > 0 ? errors.slice(0, 10) : [], // Limit error details
        index,
        batches_processed: batches,
        batch_size: batchSize,
      };

      // Complete or fail based on results
      if (totalErrors === totalDocs) {
        await tracker.fail(
          new Error(`All ${totalDocs} documents failed to index`),
          "Bulk indexing operation failed completely"
        );
        
        throw new McpError(
          ErrorCode.InternalError,
          `Bulk indexing failed: All ${totalDocs} documents failed to index`
        );
      } else if (totalErrors > 0) {
        await tracker.complete(
          result,
          `Bulk indexing completed with ${totalSuccess} successes and ${totalErrors} errors`
        );
        
        await notificationManager.sendWarning(
          `Bulk indexing completed with errors: ${totalSuccess} successful, ${totalErrors} failed`,
          result
        );
      } else {
        await tracker.complete(
          result,
          `Bulk indexing completed successfully: ${totalSuccess} documents indexed`
        );
        
        await notificationManager.sendInfo(
          `Bulk indexing completed successfully: ${totalSuccess} documents indexed`,
          result
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

    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Validation failed: ${error.errors.map(e => e.message).join(", ")}`
        );
      }
      
      logger.error("Bulk index with progress failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw new McpError(
        ErrorCode.InternalError,
        `Bulk index operation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  server.tool(
    "elasticsearch_bulk_index_with_progress",
    "Bulk index multiple documents into Elasticsearch with real-time progress notifications. Processes documents in batches and reports progress for long-running operations. Use for indexing large datasets with progress tracking.",
    {
      index: z.string().min(1).describe("Target index for bulk indexing"),
      documents: z.array(z.record(z.any())).min(1).max(1000).describe("Array of documents to index (max 1000)"),
      refresh: z.enum(["true", "false", "wait_for"]).optional().describe("Whether to refresh the index after operations"),
      pipeline: z.string().optional().describe("Ingest pipeline to use"),
      routing: z.string().optional().describe("Custom routing value"),
      batchSize: z.number().min(1).max(100).default(50).describe("Number of documents to process per batch"),
    },
    handler
  );
};