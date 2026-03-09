/* src/tools/search/scroll_search.ts */
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
const scrollSearchValidator = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  query: z.object({}).passthrough(),
  scroll: z.string().optional(),
  scrollId: z.string().optional(),
  maxDocuments: z.number().optional(),
  restTotalHitsAsInt: booleanField().optional(),
});

type _ScrollSearchParams = z.infer<typeof scrollSearchValidator>;

// MCP error handling
function createScrollSearchMcpError(
  error: Error | string,
  context: { type: "validation" | "execution"; details?: any },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_scroll_search] ${message}`, context.details);
}

// Tool implementation
export const registerScrollSearchTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const scrollSearchHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();
    let tracker: ProgressTracker | undefined;
    let params: z.infer<typeof scrollSearchValidator> | undefined;

    try {
      // Validate parameters
      params = scrollSearchValidator.parse(args);

      // Create progress tracker for scroll operation
      tracker = await createProgressTracker(
        "scroll_search",
        params.maxDocuments || 10000, // Use maxDocuments or estimated count
        `Scrolling through documents in ${params.index}${params.maxDocuments ? ` (max ${params.maxDocuments})` : ""}`,
      );

      logger.debug("Starting scroll search operation", {
        index: params.index,
        maxDocuments: params.maxDocuments,
        hasScrollId: !!params.scrollId,
      });

      // Send initial notification
      await notificationManager.sendInfo(`Starting scroll search operation`, {
        operation_type: "scroll_search",
        target_index: params.index,
        max_documents: params.maxDocuments,
        scroll_duration: params.scroll,
        mode: params.scrollId ? "continuation" : "new",
      });

      // If scrollId is provided, use the traditional scroll API
      if (params.scrollId) {
        await tracker.updateProgress(50, "Continuing scroll with existing scroll ID");

        const result = await esClient.scroll(
          {
            scroll_id: params.scrollId,
            scroll: params.scroll,
            rest_total_hits_as_int: params.restTotalHitsAsInt,
          },
          {
            opaqueId: "elasticsearch_scroll_search",
          },
        );

        const duration = performance.now() - perfStart;
        if (duration > 5000) {
          logger.warn("Slow operation", { duration });
        }

        const resultSize = result.hits?.hits?.length || 0;

        await tracker.complete(
          { documents_retrieved: resultSize, scroll_id: result._scroll_id },
          `Scroll continuation completed: retrieved ${resultSize} documents`,
        );

        await notificationManager.sendInfo(`Scroll continuation completed: ${resultSize} documents retrieved`, {
          operation_type: "scroll_search",
          documents_retrieved: resultSize,
          duration_ms: duration,
          has_more: !!result._scroll_id,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      // Otherwise, use the helper API for better memory management
      const documents = [];
      let count = 0;
      let batchCount = 0;
      const startTime = Date.now();

      await tracker.updateProgress(10, "Initializing scroll search");

      const scrollSearch = esClient.helpers.scrollSearch({
        index: params.index,
        query: params.query,
        scroll: params.scroll,
      });

      // Memory usage warnings
      if (params.maxDocuments && params.maxDocuments > 50000) {
        await notificationManager.sendWarning(
          `Large dataset retrieval: ${params.maxDocuments} documents may consume significant memory`,
          {
            operation_type: "scroll_search",
            max_documents: params.maxDocuments,
            memory_warning: true,
            recommendation: "Consider processing in smaller batches if memory issues occur",
          },
        );
      }

      for await (const result of scrollSearch) {
        batchCount++;
        const _batchSize = result.documents.length;

        for (const doc of result.documents) {
          documents.push(doc);
          count++;

          // Update progress every 1000 documents or 10% of max, whichever is smaller
          const progressInterval = params.maxDocuments
            ? Math.min(1000, Math.max(100, Math.floor(params.maxDocuments / 10)))
            : 1000;

          if (count % progressInterval === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = elapsed > 0 ? count / elapsed : 0;
            const progressPercent = params.maxDocuments
              ? Math.min(90, (count / params.maxDocuments) * 80 + 10)
              : // 10-90% range
                Math.min(90, Math.log10(count) * 20); // Logarithmic for unknown total

            await tracker.updateProgress(
              progressPercent,
              `Retrieved ${count} documents from ${batchCount} batches (${Math.round(rate)} docs/sec)`,
            );

            // Memory usage check every 10,000 documents
            if (count % 10000 === 0) {
              await notificationManager.sendInfo(`Progress: ${count} documents retrieved`, {
                operation_type: "scroll_search",
                documents_retrieved: count,
                batches_processed: batchCount,
                retrieval_rate: Math.round(rate),
                memory_note: count > 25000 ? "Consider processing data to free memory" : undefined,
              });
            }
          }

          if (params.maxDocuments && count >= params.maxDocuments) {
            await result.clear();
            break;
          }
        }

        if (params.maxDocuments && count >= params.maxDocuments) {
          break;
        }
      }

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow operation", { duration });
      }

      // Calculate final metrics
      const avgRate = duration > 0 ? count / (duration / 1000) : 0;
      const totalMemoryMB = Math.round((JSON.stringify(documents).length / 1024 / 1024) * 100) / 100;

      await tracker.complete(
        {
          total_documents: count,
          total_batches: batchCount,
          duration_ms: duration,
          avg_rate: Math.round(avgRate),
          memory_mb: totalMemoryMB,
        },
        `Scroll search completed: ${count} documents retrieved in ${Math.round(duration)}ms`,
      );

      await notificationManager.sendInfo(`Scroll search completed: ${count} documents retrieved`, {
        operation_type: "scroll_search",
        total_documents: count,
        total_batches: batchCount,
        duration_ms: duration,
        avg_retrieval_rate: Math.round(avgRate),
        memory_usage_mb: totalMemoryMB,
        performance_note:
          avgRate > 1000
            ? "Excellent performance"
            : avgRate > 100
              ? "Good performance"
              : "Consider optimizing query or index",
      });

      // Memory warning if result set is very large
      if (totalMemoryMB > 100) {
        await notificationManager.sendWarning(`Memory usage: ${totalMemoryMB}MB for ${count} documents`, {
          operation_type: "scroll_search",
          memory_usage_mb: totalMemoryMB,
          documents_count: count,
          recommendation: "Consider streaming results or processing in batches for very large datasets",
        });
      }

      return {
        content: [
          { type: "text", text: `Retrieved ${documents.length} documents` },
          { type: "text", text: JSON.stringify(documents, null, 2) },
        ],
      };
    } catch (error) {
      await tracker?.fail(error instanceof Error ? error : new Error(String(error)), "Scroll search operation failed");

      await notificationManager.sendError(
        "Scroll search operation failed",
        error instanceof Error ? error : new Error(String(error)),
        {
          operation_type: "scroll_search",
          target_index: params?.index,
          duration_ms: performance.now() - perfStart,
        },
      );

      // Error handling
      if (error instanceof z.ZodError) {
        throw createScrollSearchMcpError(`Validation failed: ${error.issues.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.issues, providedArgs: args },
        });
      }

      throw createScrollSearchMcpError(error instanceof Error ? error.message : String(error), {
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
    "elasticsearch_scroll_search",

    {
      title: "Scroll Search",

      description:
        "Perform scroll search in Elasticsearch for large result sets. Best for pagination, large dataset retrieval, memory-efficient iteration. Use when you need to retrieve all documents from large result sets without overwhelming memory in Elasticsearch. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: {
        index: z.string(), // Index name or pattern to search
        query: z.object({}), // Query DSL to filter documents
        scroll: z.string().optional(),
        scrollId: z.string().optional(),
        maxDocuments: z.number().optional(),
        restTotalHitsAsInt: z.boolean().optional(),
      },
    },

    scrollSearchHandler,
  );
};
