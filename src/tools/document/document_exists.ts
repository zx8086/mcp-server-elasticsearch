/* src/tools/document/document_exists.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Zod validator for runtime validation
const documentExistsValidator = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  id: z.string().min(1, "Document ID cannot be empty"),
  routing: z.string().optional(),
  preference: z.string().optional(),
  realtime: booleanField().optional(),
  refresh: booleanField().optional(),
  version: z.number().optional(),
  versionType: z.enum(["internal", "external", "external_gte", "force"]).optional(),
});

type DocumentExistsParams = z.infer<typeof documentExistsValidator>;

// MCP error handling
function createDocumentExistsMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    version_conflict: ErrorCode.InvalidRequest,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_document_exists] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerDocumentExistsTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const documentExistsHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = documentExistsValidator.parse(args);

      const exists = await esClient.exists({
        index: params.index,
        id: params.id,
        routing: params.routing,
        preference: params.preference,
        realtime: params.realtime,
        refresh: params.refresh,
        version: params.version,
        version_type: params.versionType,
      });

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow document existence check", { duration });
      }

      return {
        content: [{ type: "text", text: `Exists: ${exists}` }],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createDocumentExistsMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      // Handle version conflict error
      if (error instanceof Error && error.message.includes("version_conflict")) {
        throw createDocumentExistsMcpError("Version conflict occurred", {
          type: "version_conflict",
          details: {
            duration: performance.now() - perfStart,
            args,
          },
        });
      }

      throw createDocumentExistsMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Tool registration (no withReadOnlyCheck for read operation)
  server.tool(
    "elasticsearch_document_exists",
    "Check if a document exists in Elasticsearch by index and id. Best for document validation, existence checks, conditional operations. Use when you need to verify document presence in Elasticsearch indices before performing operations. Uses direct JSON Schema and standardized MCP error codes.",
    {
      index: z.string(), // REQUIRED: Name of the Elasticsearch index containing the document. Example: 'users', 'logs-2024.01'
      id: z.string(), // REQUIRED: Unique identifier of the document to check
      routing: z.string().optional(), // Custom routing value for document placement
      preference: z.string().optional(), // Preference for shard selection
      realtime: z.boolean().optional(), // Whether to perform a real-time check
      refresh: z.boolean().optional(), // Whether to refresh before checking existence
      version: z.number().optional(), // Expected document version for optimistic concurrency control
      versionType: z.enum(["internal", "external", "external_gte", "force"]).optional(), // Version type for concurrency control
    },
    documentExistsHandler,
  );
};
