/* src/tools/document/delete_document.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Zod validator for runtime validation
const deleteDocumentValidator = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  id: z.string().min(1, "Document ID cannot be empty"),
  routing: z.string().optional(),
  refresh: z.enum(["true", "false", "wait_for"]).optional(),
  version: z.number().optional(),
  versionType: z.enum(["internal", "external", "external_gte", "force"]).optional(),
  ifSeqNo: z.number().optional(),
  ifPrimaryTerm: z.number().optional(),
  timeout: z.string().optional(),
  waitForActiveShards: z.union([z.literal("all"), z.number().min(1).max(9)]).optional(),
});

type DeleteDocumentParams = z.infer<typeof deleteDocumentValidator>;

// MCP error handling
function createDeleteDocumentMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    document_not_found: ErrorCode.InvalidParams,
    version_conflict: ErrorCode.InvalidRequest,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_delete_document] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerDeleteDocumentTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const deleteDocumentHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = deleteDocumentValidator.parse(args);

      const result = await esClient.delete({
        index: params.index,
        id: params.id,
        routing: params.routing,
        refresh: params.refresh,
        version: params.version,
        version_type: params.versionType,
        if_seq_no: params.ifSeqNo,
        if_primary_term: params.ifPrimaryTerm,
        timeout: params.timeout,
        wait_for_active_shards: params.waitForActiveShards,
      });

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow document deletion", { duration });
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createDeleteDocumentMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      // Handle document not found error
      if (error instanceof Error && error.message.includes("document_not_found")) {
        throw createDeleteDocumentMcpError("Document not found", {
          type: "document_not_found",
          details: {
            duration: performance.now() - perfStart,
            args,
          },
        });
      }

      // Handle version conflict error
      if (error instanceof Error && error.message.includes("version_conflict")) {
        throw createDeleteDocumentMcpError("Version conflict occurred", {
          type: "version_conflict",
          details: {
            duration: performance.now() - perfStart,
            args,
          },
        });
      }

      throw createDeleteDocumentMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Tool registration with read-only check for destructive operation
  // Tool registration using modern registerTool method

  server.registerTool(

    "elasticsearch_delete_document",

    {

      title: "Delete Document",

      description: "Delete a document from Elasticsearch by index and id. Best for removing specific documents, data cleanup, document lifecycle management. Use when you need to permanently remove individual JSON documents from Elasticsearch indices with optimistic concurrency control. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: {
      index: z.string(), // REQUIRED: Name of the Elasticsearch index containing the document. Example: 'users', 'logs-2024.01'
      id: z.string(), // REQUIRED: Unique identifier of the document to delete
      routing: z.string().optional(), // Custom routing value for document placement
      refresh: z.enum(["true", "false", "wait_for"]).optional(), // Whether to refresh the index after the operation
      version: z.number().optional(), // Expected document version for optimistic concurrency control
      versionType: z.enum(["internal", "external", "external_gte", "force"]).optional(), // Version type for concurrency control
      ifSeqNo: z.number().optional(), // Sequence number for optimistic concurrency control
      ifPrimaryTerm: z.number().optional(), // Primary term for optimistic concurrency control
      timeout: z.string().optional(), // Operation timeout (e.g., '5s', '1m')
      waitForActiveShards: z.any().optional(), // Number of active shards to wait for
    },

    },

    withReadOnlyCheck("elasticsearch_delete_document", deleteDocumentHandler, OperationType.DESTRUCTIVE),

  );;
};
