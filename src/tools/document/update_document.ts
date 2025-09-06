/* src/tools/document/update_document.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Zod validator for runtime validation
const updateDocumentValidator = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  id: z.string().min(1, "Document ID cannot be empty"),
  doc: z.object({}).passthrough().optional(),
  script: z.object({}).passthrough().optional(),
  upsert: z.object({}).passthrough().optional(),
  docAsUpsert: booleanField().optional(),
  detectNoop: booleanField().optional(),
  scriptedUpsert: booleanField().optional(),
  refresh: z.enum(["true", "false", "wait_for"]).optional(),
  routing: z.string().optional(),
  timeout: z.string().optional(),
  waitForActiveShards: z.union([z.literal("all"), z.number().min(1).max(9)]).optional(),
  ifSeqNo: z.number().optional(),
  ifPrimaryTerm: z.number().optional(),
});

type UpdateDocumentParams = z.infer<typeof updateDocumentValidator>;

// MCP error handling
function createUpdateDocumentMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    document_not_found: ErrorCode.InvalidParams,
    version_conflict: ErrorCode.InvalidRequest,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_update_document] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerUpdateDocumentTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const updateDocumentHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = updateDocumentValidator.parse(args);

      const result = await esClient.update(
        {
          index: params.index,
          id: params.id,
          doc: params.doc,
          script: params.script,
          upsert: params.upsert,
          doc_as_upsert: params.docAsUpsert,
          detect_noop: params.detectNoop,
          scripted_upsert: params.scriptedUpsert,
          refresh: params.refresh,
          routing: params.routing,
          timeout: params.timeout,
          wait_for_active_shards: params.waitForActiveShards,
          if_seq_no: params.ifSeqNo,
          if_primary_term: params.ifPrimaryTerm,
        },
        {
          opaqueId: "elasticsearch_update_document",
        },
      );

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow document update", { duration });
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createUpdateDocumentMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      // Handle document not found error
      if (error instanceof Error && error.message.includes("document_not_found")) {
        throw createUpdateDocumentMcpError("Document not found", {
          type: "document_not_found",
          details: {
            duration: performance.now() - perfStart,
            args,
          },
        });
      }

      // Handle version conflict error
      if (error instanceof Error && error.message.includes("version_conflict")) {
        throw createUpdateDocumentMcpError("Version conflict occurred", {
          type: "version_conflict",
          details: {
            duration: performance.now() - perfStart,
            args,
          },
        });
      }

      throw createUpdateDocumentMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Tool registration with read-only check for write operation
  server.tool(
    "elasticsearch_update_document",
    "Update a JSON document in Elasticsearch by index and id. Best for partial document updates, scripted updates, upsert operations. Use when you need to modify existing documents in Elasticsearch indices with optimistic concurrency control. Uses direct JSON Schema and standardized MCP error codes.",
  {
    index: z.string(), // REQUIRED: Name of the Elasticsearch index containing the document. Example: 'users', 'logs-2024.01'
    id: z.string(), // REQUIRED: Unique identifier of the document to update
    doc: z.object({}).optional(), // Partial document with fields to update
    script: z.object({}).optional(), // Script to run for updating the document
    upsert: z.object({}).optional(), // Document to create if the document doesn't exist
    docAsUpsert: z.boolean().optional(), // Use the doc as upsert value if document doesn't exist
    detectNoop: z.boolean().optional(), // Whether to detect if the update is a no-op
    scriptedUpsert: z.boolean().optional(), // Whether to run the script during upsert
    refresh: z.enum(["true", "false", "wait_for"]).optional(), // Whether to refresh the index after the operation
    routing: z.string().optional(), // Custom routing value for document placement
    timeout: z.string().optional(), // Operation timeout (e.g., '5s', '1m')
    waitForActiveShards: z.any().optional(), // Number of active shards to wait for
    ifSeqNo: z.number().optional(), // Sequence number for optimistic concurrency control
    ifPrimaryTerm: z.number().optional(), // Primary term for optimistic concurrency control
  },
    withReadOnlyCheck("elasticsearch_update_document", updateDocumentHandler, OperationType.WRITE),
  );
};
