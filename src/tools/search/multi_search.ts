/* src/tools/search/multi_search.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { createProgressTracker, notificationManager } from "../../utils/notifications.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Zod validator for runtime validation
const multiSearchValidator = z.object({
  searches: z.array(z.object({}).passthrough()),
  index: z.string().optional(),
  maxConcurrentSearches: z.number().optional(),
  ccsMinimizeRoundtrips: booleanField().optional(),
  restTotalHitsAsInt: booleanField().optional(),
  typedKeys: booleanField().optional(),
});

type MultiSearchParams = z.infer<typeof multiSearchValidator>;

// MCP error handling
function createMultiSearchMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_multi_search] ${message}`, context.details);
}

// Tool implementation
export const registerMultiSearchTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const multiSearchHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = multiSearchValidator.parse(args);

      const searchCount = params.searches?.length || 0;
      
      // Create progress tracker for multi-search operation
      const tracker = await createProgressTracker(
        "multi_search",
        100, // percentage-based for parallel execution
        `Executing ${searchCount} searches${params.index ? ` on ${params.index}` : ' across indices'}`
      );

      logger.debug("Starting multi-search operation", {
        searchCount,
        index: params.index,
        maxConcurrentSearches: params.maxConcurrentSearches,
      });

      // Send initial notification with multi-search details
      await notificationManager.sendInfo(
        `Starting multi-search: ${searchCount} parallel searches`,
        {
          operation_type: "multi_search",
          total_searches: searchCount,
          target_index: params.index,
          max_concurrent_searches: params.maxConcurrentSearches,
          ccs_minimize_roundtrips: params.ccsMinimizeRoundtrips,
        }
      );

      // Warn about large batch operations
      if (searchCount > 20) {
        await notificationManager.sendWarning(
          `⚠️  Large multi-search batch: ${searchCount} searches may impact cluster performance`,
          {
            operation_type: "multi_search",
            search_count: searchCount,
            performance_warning: true,
            recommendation: "Consider reducing batch size or using lower concurrency for better cluster stability",
            suggested_concurrency: Math.min(5, Math.ceil(searchCount / 4)),
          }
        );
      }

      if (!searchCount || searchCount === 0) {
        await tracker.complete(
          { searches_count: 0 },
          "No searches provided for multi-search operation"
        );

        await notificationManager.sendWarning(
          "Multi-search called with no search queries",
          {
            operation_type: "multi_search",
            warning: "No searches array provided or empty searches array",
            recommendation: "Provide at least one search query in the searches array",
          }
        );

        return {
          content: [{ type: "text", text: "No searches provided" }],
        };
      }

      await tracker.updateProgress(25, `Submitting ${searchCount} searches for parallel execution`);

      const result = await esClient.msearch({
        searches: params.searches,
        index: params.index,
        max_concurrent_searches: params.maxConcurrentSearches,
        ccs_minimize_roundtrips: params.ccsMinimizeRoundtrips,
        rest_total_hits_as_int: params.restTotalHitsAsInt,
        typed_keys: params.typedKeys,
      });

      await tracker.updateProgress(80, "Processing multi-search results");

      const duration = performance.now() - perfStart;

      // Analyze results
      const responses = result.responses || [];
      let successfulSearches = 0;
      let failedSearches = 0;
      let totalHits = 0;

      for (const response of responses) {
        if (response.error) {
          failedSearches++;
        } else {
          successfulSearches++;
          if (response.hits?.total) {
            totalHits += typeof response.hits.total === 'number' ? 
              response.hits.total : 
              response.hits.total.value || 0;
          }
        }
      }

      const searchSummary = {
        total_searches: searchCount,
        successful_searches: successfulSearches,
        failed_searches: failedSearches,
        total_hits_across_searches: totalHits,
        duration_ms: duration,
        avg_time_per_search: searchCount > 0 ? Math.round(duration / searchCount) : 0,
        concurrency_used: params.maxConcurrentSearches,
      };

      await tracker.complete(
        searchSummary,
        `Multi-search completed: ${successfulSearches}/${searchCount} searches successful in ${Math.round(duration)}ms`
      );

      if (duration > 5000) {
        logger.warn("Slow operation", { duration });
        
        await notificationManager.sendWarning(
          `Slow multi-search: ${Math.round(duration / 1000)}s for ${searchCount} searches`,
          {
            operation_type: "multi_search",
            ...searchSummary,
            performance_warning: true,
            recommendation: searchCount > 10 ? 
              "Consider reducing batch size, optimizing queries, or increasing cluster resources" : 
              "Multi-search took longer than expected - check query complexity and cluster health",
          }
        );
      } else {
        await notificationManager.sendInfo(
          `Multi-search completed: ${successfulSearches}/${searchCount} searches successful`,
          {
            operation_type: "multi_search",
            ...searchSummary,
            performance_note: duration > 1000 ? "Standard execution time" : "Fast execution",
          }
        );
      }

      // Send failure notification if any searches failed
      if (failedSearches > 0) {
        const failedDetails = responses
          .map((response, index) => response.error ? { search_index: index, error: response.error } : null)
          .filter(Boolean)
          .slice(0, 5); // Show first 5 failures

        await notificationManager.sendWarning(
          `⚠️  ${failedSearches} out of ${searchCount} searches failed`,
          {
            operation_type: "multi_search",
            failed_searches: failedSearches,
            successful_searches: successfulSearches,
            failure_rate: ((failedSearches / searchCount) * 100).toFixed(1) + "%",
            failed_details: failedDetails,
            recommendation: "Review failed search queries and check index availability",
          }
        );
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      await tracker.fail(
        error instanceof Error ? error : new Error(String(error)),
        "Multi-search operation failed"
      );
      
      await notificationManager.sendError(
        "Multi-search operation failed",
        error instanceof Error ? error : new Error(String(error)),
        {
          operation_type: "multi_search",
          total_searches: params?.searches?.length || 0,
          target_index: params?.index,
          duration_ms: performance.now() - perfStart,
          failure_context: "Multi-search execution failed - check search queries and cluster connectivity",
        }
      );

      // Error handling
      if (error instanceof z.ZodError) {
        throw createMultiSearchMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      throw createMultiSearchMcpError(error instanceof Error ? error.message : String(error), {
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

    "elasticsearch_multi_search",

    {

      title: "Multi Search",

      description: "Perform multiple searches in Elasticsearch in a single request. Best for batch search operations, dashboard queries, parallel search execution. Use when you need to execute multiple Query DSL searches across different Elasticsearch indices efficiently. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: {
      searches: z.array(z.object({}).optional()).optional(),
      index: z.string().optional(),
      maxConcurrentSearches: z.number().optional(),
      ccsMinimizeRoundtrips: z.boolean().optional(),
      restTotalHitsAsInt: z.boolean().optional(),
      typedKeys: z.boolean().optional(),
    },

    },

    multiSearchHandler,

  );;
};
