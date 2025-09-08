/* src/tools/watcher/query_watches.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { formatAsMarkdown } from "../../utils/responseHandling.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Zod validator for runtime validation
const queryWatchesValidator = z.object({
  from: z.number().min(0).optional(),
  size: z.number().min(1).max(50).optional(),
  query: z.object({}).passthrough().optional(),
  sort: z
    .union([z.string(), z.object({}).passthrough(), z.array(z.union([z.string(), z.object({}).passthrough()]))])
    .optional(),
  search_after: z.array(z.union([z.number(), z.string(), booleanField(), z.null()])).optional(),
});

type QueryWatchesParams = z.infer<typeof queryWatchesValidator>;

// MCP error handling
function createQueryWatchesMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_watcher_query_watches] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerWatcherQueryWatchesTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const queryWatchesHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = queryWatchesValidator.parse(args);

      const result = await esClient.watcher.queryWatches({
        from: params.from,
        size: params.size || 20, // Default size if not specified
        query: params.query,
        sort: params.sort,
        search_after: params.search_after,
      });

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow watcher operation", { duration });
      }

      // Format response for better readability
      const responseContent: string[] = [];

      // Add header with search results summary
      const total = result.count || 0;
      const watches = result.watches || [];
      const returned = watches.length;
      const from = params.from || 0;

      responseContent.push(`## Watcher Query Results`);
      responseContent.push(`Found ${total} watches total, showing ${returned} (from ${from})\n`);

      if (returned === 0) {
        responseContent.push("No watches found matching the query criteria.");
      } else {
        // Display each watch with formatted information
        for (const watch of watches) {
          responseContent.push(`### Watch: ${watch._id || "Unknown"}`);

          if (watch._source) {
            const source = watch._source;

            // Show key watch information
            if (source.trigger) {
              responseContent.push(`- **Trigger**: ${Object.keys(source.trigger)[0] || "Unknown"}`);
            }

            if (source.condition) {
              responseContent.push(`- **Condition**: ${Object.keys(source.condition)[0] || "Unknown"}`);
            }

            if (source.actions) {
              const actionNames = Object.keys(source.actions);
              responseContent.push(`- **Actions**: ${actionNames.join(", ")}`);
            }

            if (source.metadata?.description) {
              responseContent.push(`- **Description**: ${source.metadata.description}`);
            }

            // Show full watch configuration in collapsible JSON
            responseContent.push("\n**Full Configuration:**");
            responseContent.push("```json");
            responseContent.push(JSON.stringify(source, null, 2));
            responseContent.push("```\n");
          }
        }

        // Add pagination info if results were truncated
        if (total > returned + from) {
          const remaining = total - returned - from;
          responseContent.push(
            `\n⚠️ ${remaining} more watches available. Use 'from' and 'size' parameters for pagination.`,
          );
        }
      }

      return {
        content: [
          {
            type: "text",
            text: responseContent.join("\n"),
          },
        ],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createQueryWatchesMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      throw createQueryWatchesMcpError(error instanceof Error ? error.message : String(error), {
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

    "elasticsearch_watcher_query_watches",

    {

      title: "Watcher Query Watches",

      description: "Query and filter watches in Elasticsearch Watcher. Best for watch discovery, configuration management, monitoring overview. Use when you need to search and paginate through watch definitions in Elasticsearch alerting system. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: {
      from: z.number().min(0).optional(), // Starting offset for pagination
      size: z.number().min(1).max(50).optional(), // Number of watches to return
      query: z.object({}).optional(), // Query to filter watches
      sort: z.any().optional(), // Sort criteria for results
      search_after: z.array(z.any().optional()).optional(), // Values to search after for pagination
    },

    },

    withReadOnlyCheck("elasticsearch_watcher_query_watches", queryWatchesHandler, OperationType.READ),

  );;
};
