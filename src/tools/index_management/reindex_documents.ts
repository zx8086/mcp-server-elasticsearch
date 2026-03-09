/* src/tools/index_management/reindex_documents.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { coerceBoolean } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Zod validator for runtime validation
const reindexDocumentsValidator = z.object({
  source: z.object({
    index: z.string(),
    query: z.object({}).passthrough().optional(),
    size: z.number().optional(),
    sort: z.array(z.object({}).passthrough()).optional(),
  }),
  dest: z.object({
    index: z.string(),
    version_type: z.enum(["internal", "external", "external_gte"]).optional(),
    op_type: z.enum(["index", "create"]).optional(),
  }),
  script: z.object({}).passthrough().optional(),
  conflicts: z.enum(["abort", "proceed"]).optional(),
  maxDocs: z.number().optional(),
  refresh: coerceBoolean.optional(),
  timeout: z.string().optional(),
  waitForActiveShards: z.union([z.literal("all"), z.number().min(1).max(9)]).optional(),
  waitForCompletion: coerceBoolean.optional(),
  requestsPerSecond: z.number().optional(),
  scroll: z.string().optional(),
  slices: z.number().optional(),
});

type _ReindexDocumentsParams = z.infer<typeof reindexDocumentsValidator>;

// MCP error handling
function createReindexDocumentsMcpError(
  error: Error | string,
  context: { type: "validation" | "execution" | "index_not_found" | "index_already_exists"; details?: any },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    index_not_found: ErrorCode.InvalidParams,
    index_already_exists: ErrorCode.InvalidRequest,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_reindex_documents] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerReindexDocumentsTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const reindexDocumentsHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = reindexDocumentsValidator.parse(args);

      const result = await esClient.reindex({
        source: params.source,
        dest: params.dest,
        script: params.script,
        conflicts: params.conflicts,
        max_docs: params.maxDocs,
        refresh: params.refresh,
        timeout: params.timeout,
        wait_for_active_shards: params.waitForActiveShards,
        wait_for_completion: params.waitForCompletion,
        requests_per_second: params.requestsPerSecond,
        scroll: params.scroll,
        slices: params.slices,
      } as any);

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow reindex operation", {
          duration,
          sourceIndex: params.source.index,
          destIndex: params.dest.index,
        });
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
      // Error handling
      if (error instanceof z.ZodError) {
        throw createReindexDocumentsMcpError(`Validation failed: ${error.issues.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.issues, providedArgs: args },
        });
      }

      // Handle index not found error
      if (error instanceof Error && error.message.includes("index_not_found_exception")) {
        const indexName = args.source?.index || args.dest?.index || "unknown";
        throw createReindexDocumentsMcpError(`Index not found: ${indexName}`, {
          type: "index_not_found",
          details: { sourceIndex: args.source?.index, destIndex: args.dest?.index },
        });
      }

      // Handle destination index already exists
      if (error instanceof Error && error.message.includes("resource_already_exists_exception")) {
        throw createReindexDocumentsMcpError(`Destination index already exists: ${args.dest?.index}`, {
          type: "index_already_exists",
          details: { destIndex: args.dest?.index },
        });
      }

      throw createReindexDocumentsMcpError(error instanceof Error ? error.message : String(error), {
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
    "elasticsearch_reindex_documents",

    {
      title: "Reindex Documents",

      description:
        "Reindex documents from source to destination index in Elasticsearch. Best for data migration, index restructuring, mapping changes. Use when you need to copy documents between Elasticsearch indices with optional transformations. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: {
        source: z
          .object({
            index: z.string().min(1, "Source index name is required"),
            query: z.object({}).passthrough().optional().describe("Optional query to filter source documents"),
            size: z.number().int().min(1).optional().describe("Batch size for reindexing"),
            sort: z.array(z.object({}).passthrough()).optional().describe("Sort order for source documents"),
          })
          .describe("Source index configuration"),
        dest: z
          .object({
            index: z.string().min(1, "Destination index name is required"),
            version_type: z
              .enum(["internal", "external", "external_gte"])
              .optional()
              .describe("Version handling strategy"),
            op_type: z.enum(["index", "create"]).optional().describe("Operation type for documents"),
          })
          .describe("Destination index configuration"),
        script: z.object({}).passthrough().optional().describe("Script to transform documents during reindexing"),
        conflicts: z.enum(["abort", "proceed"]).optional().describe("How to handle version conflicts"),
        maxDocs: z.number().int().min(1).optional().describe("Maximum number of documents to reindex"),
        refresh: z.boolean().optional().describe("Refresh the destination index after completion"),
        timeout: z.string().optional().describe("Operation timeout (e.g., '1m')"),
        waitForActiveShards: z
          .union([z.literal("all"), z.number().int().min(1)])
          .optional()
          .describe("Number of active shards to wait for"),
        waitForCompletion: z.boolean().optional().describe("Wait for the operation to complete"),
        requestsPerSecond: z.number().min(0).optional().describe("Throttle requests per second"),
        scroll: z.string().optional().describe("Scroll timeout for source index (e.g., '5m')"),
        slices: z.number().int().min(1).optional().describe("Number of slices for parallel processing"),
      },
    },

    withReadOnlyCheck("elasticsearch_reindex_documents", reindexDocumentsHandler, OperationType.WRITE),
  );
};
