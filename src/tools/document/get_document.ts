/* src/tools/document/get_document.ts */
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
const getDocumentValidator = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  id: z.string().min(1, "Document ID cannot be empty"),
  source: booleanField().optional(),
  sourceExcludes: z.array(z.string()).optional(),
  sourceIncludes: z.array(z.string()).optional(),
  routing: z.string().optional(),
  preference: z.string().optional(),
  realtime: booleanField().optional(),
  refresh: booleanField().optional(),
  version: z.number().optional(),
  versionType: z.enum(["internal", "external", "external_gte", "force"]).optional(),
});

type _GetDocumentParams = z.infer<typeof getDocumentValidator>;

// MCP error handling
function createGetDocumentMcpError(
  error: Error | string,
  context: { type: "validation" | "execution" | "document_not_found" | "version_conflict"; details?: any },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    document_not_found: ErrorCode.InvalidParams,
    version_conflict: ErrorCode.InvalidRequest,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_get_document] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerGetDocumentTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const getDocumentHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = getDocumentValidator.parse(args);

      const result = await esClient.get({
        index: params.index,
        id: params.id,
        _source: params.source,
        _source_excludes: params.sourceExcludes,
        _source_includes: params.sourceIncludes,
        routing: params.routing,
        preference: params.preference,
        realtime: params.realtime,
        refresh: params.refresh,
        version: params.version,
        version_type: params.versionType,
      } as any);

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow document retrieval", { duration });
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createGetDocumentMcpError(`Validation failed: ${error.issues.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.issues, providedArgs: args },
        });
      }

      // Handle document not found error
      if (error instanceof Error && error.message.includes("document_not_found")) {
        throw createGetDocumentMcpError("Document not found", {
          type: "document_not_found",
          details: {
            duration: performance.now() - perfStart,
            args,
          },
        });
      }

      throw createGetDocumentMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Tool registration (no withReadOnlyCheck for read operation)
  // Tool registration using modern registerTool method

  server.registerTool(
    "elasticsearch_get_document",

    {
      title: "Get Document",

      description:
        "Get a document from Elasticsearch by index and id. Best for retrieving specific JSON documents, document validation, real-time data access. This tool REQUIRES both 'index' and 'id' parameters - it cannot work with empty {}. Use when you need to fetch individual documents by their unique identifier from Elasticsearch indices. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: {
        index: z.string(), // REQUIRED: Name of the Elasticsearch index containing the document. Example: 'users', 'logs-2024.01'
        id: z.string(), // REQUIRED: Unique identifier of the document to retrieve. Example: '123', 'user-456'
        source: z.boolean().optional(), // Whether to return the _source field
        sourceExcludes: z.array(z.string().optional()).optional(), // Fields to exclude from the _source (optional)
        sourceIncludes: z.array(z.string().optional()).optional(), // Fields to include in the _source (optional)
        routing: z.string().optional(), // Custom routing value (optional)
        preference: z.string().optional(), // Preference for shard selection (optional)
        realtime: z.boolean().optional(), // Whether to perform a real-time get
        refresh: z.boolean().optional(), // Whether to refresh before retrieval
        version: z.number().optional(), // Expected document version for optimistic concurrency control (optional)
        versionType: z.enum(["internal", "external", "external_gte", "force"]).optional(), // Version type for concurrency control (optional)
      },
    },

    getDocumentHandler,
  );
};
