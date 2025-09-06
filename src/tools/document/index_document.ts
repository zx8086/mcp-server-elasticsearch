/* src/tools/document/index_document.ts */
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
const indexDocumentValidator = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  id: z.string().optional(),
  document: z.object({}).passthrough(),
  refresh: z.enum(["true", "false", "wait_for"]).optional(),
  routing: z.string().optional(),
  pipeline: z.string().optional(),
});

type IndexDocumentParams = z.infer<typeof indexDocumentValidator>;

// MCP error handling
function createIndexDocumentMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    document_already_exists: ErrorCode.InvalidRequest,
    version_conflict: ErrorCode.InvalidRequest,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_index_document] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerIndexDocumentTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const indexDocumentHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = indexDocumentValidator.parse(args);

      const result = await esClient.index(
        {
          index: params.index,
          id: params.id,
          document: params.document,
          refresh: params.refresh,
          routing: params.routing,
          pipeline: params.pipeline,
        },
        {
          opaqueId: "elasticsearch_index_document",
        },
      );

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow document indexing", { duration });
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createIndexDocumentMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      // Handle document already exists error
      if (error instanceof Error && error.message.includes("document_already_exists")) {
        throw createIndexDocumentMcpError("Document already exists", {
          type: "document_already_exists",
          details: {
            duration: performance.now() - perfStart,
            args,
          },
        });
      }

      // Handle version conflict error
      if (error instanceof Error && error.message.includes("version_conflict")) {
        throw createIndexDocumentMcpError("Version conflict occurred", {
          type: "version_conflict",
          details: {
            duration: performance.now() - perfStart,
            args,
          },
        });
      }

      throw createIndexDocumentMcpError(error instanceof Error ? error.message : String(error), {
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
    "elasticsearch_index_document",
    "Index a JSON document into Elasticsearch. Best for adding new documents, bulk data ingestion, real-time indexing. Use when you need to store structured JSON documents in Elasticsearch indices with optional routing and pipeline processing. Uses direct JSON Schema and standardized MCP error codes.",
    {
      index: z.string(), // REQUIRED: Name of the Elasticsearch index to store the document. Example: 'users', 'logs-2024.01'
      id: z.string().optional(), // Optional: Unique identifier for the document. If not provided, Elasticsearch will generate one
      document: z.object({}), // REQUIRED: The JSON document to index
      refresh: z.enum(["true", "false", "wait_for"]).optional(), // Whether to refresh the index after the operation
      routing: z.string().optional(), // Custom routing value for document placement
      pipeline: z.string().optional(), // Ingest pipeline to use for document processing
    },
    withReadOnlyCheck("elasticsearch_index_document", indexDocumentHandler, OperationType.WRITE),
  );
};
