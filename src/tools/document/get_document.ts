/* src/tools/document/get_document.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const getDocumentSchema = {
  type: "object",
  properties: {
    index: {
      type: "string",
      minLength: 1,
      description: "REQUIRED: Name of the Elasticsearch index containing the document. Example: 'users', 'logs-2024.01'"
    },
    id: {
      type: "string", 
      minLength: 1,
      description: "REQUIRED: Unique identifier of the document to retrieve. Example: '123', 'user-456'"
    },
    source: {
      type: "boolean",
      description: "Whether to return the _source field"
    },
    sourceExcludes: {
      type: "array",
      items: { type: "string" },
      description: "Fields to exclude from the _source (optional)"
    },
    sourceIncludes: {
      type: "array", 
      items: { type: "string" },
      description: "Fields to include in the _source (optional)"
    },
    routing: {
      type: "string",
      description: "Custom routing value (optional)"
    },
    preference: {
      type: "string",
      description: "Preference for shard selection (optional)"
    },
    realtime: {
      type: "boolean",
      description: "Whether to perform a real-time get"
    },
    refresh: {
      type: "boolean", 
      description: "Whether to refresh before retrieval"
    },
    version: {
      type: "number",
      description: "Expected document version for optimistic concurrency control (optional)"
    },
    versionType: {
      type: "string",
      enum: ["internal", "external", "external_gte", "force"],
      description: "Version type for concurrency control (optional)"
    }
  },
  required: ["index", "id"],
  additionalProperties: false
};

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

type GetDocumentParams = z.infer<typeof getDocumentValidator>;

// MCP error handling
function createGetDocumentMcpError(
  error: Error | string,
  context: { type: string; details?: any }
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
    context.details
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
      });
      
      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow document retrieval", { duration });
      }

      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) }
        ],
      };

    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createGetDocumentMcpError(`Validation failed: ${error.errors.map(e => e.message).join(', ')}`, {
          type: 'validation',
          details: { validationErrors: error.errors, providedArgs: args }
        });
      }

      // Handle document not found error
      if (error instanceof Error && error.message.includes('document_not_found')) {
        throw createGetDocumentMcpError('Document not found', {
          type: 'document_not_found',
          details: { 
            duration: performance.now() - perfStart,
            args 
          }
        });
      }
      
      throw createGetDocumentMcpError(error instanceof Error ? error.message : String(error), {
        type: 'execution',
        details: { 
          duration: performance.now() - perfStart,
          args 
        }
      });
    }
  };

  // Tool registration (no withReadOnlyCheck for read operation)
  server.tool(
    "elasticsearch_get_document",
    "Get a document from Elasticsearch by index and id. Best for retrieving specific JSON documents, document validation, real-time data access. This tool REQUIRES both 'index' and 'id' parameters - it cannot work with empty {}. Use when you need to fetch individual documents by their unique identifier from Elasticsearch indices. Uses direct JSON Schema and standardized MCP error codes.",
    getDocumentSchema,
    getDocumentHandler
  );
};