/* src/tools/core/get_mappings.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const getMappingsSchema = {
  type: "object",
  properties: {
    index: {
      type: "string",
      description: "Name of the Elasticsearch index to get mappings for. Use '*' for all indices",
    },
  },
  additionalProperties: false,
};

// Zod validator for runtime validation
const getMappingsValidator = z.object({
  index: z.string().trim().min(1).optional(),
});

type GetMappingsParams = z.infer<typeof getMappingsValidator>;

// MCP error handling
function createGetMappingsMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "index_not_found";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    index_not_found: ErrorCode.InvalidParams,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_get_mappings] ${message}`, context.details);
}

// Tool implementation
export const registerGetMappingsTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const getMappingsHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = getMappingsValidator.parse(args);
      const { index } = params;

      logger.debug("Getting mappings", { index });

      const response = await esClient.indices.getMapping({ index });

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow mappings operation", { duration });
      }

      logger.debug("Retrieved mappings", { index });

      return {
        content: [
          { type: "text", text: `Mappings for index: ${index || "*"}` },
          { type: "text", text: JSON.stringify(response, null, 2) },
        ],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createGetMappingsMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      if (error instanceof Error) {
        if (error.message.includes("index_not_found_exception")) {
          throw createGetMappingsMcpError(`Index not found: ${args?.index || "*"}`, {
            type: "index_not_found",
            details: { originalError: error.message },
          });
        }
      }

      throw createGetMappingsMcpError(error instanceof Error ? error.message : String(error), {
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

    "elasticsearch_get_mappings",

    {

      title: "Get Mappings",

      description: "Get field mappings for Elasticsearch indices. Uses direct JSON Schema and standardized MCP error codes. PARAMETER: 'index' (string, default '*'). Best for understanding document structure, field types, and analyzers. Example: {index: 'logs-*'}",

      inputSchema: getMappingsSchema,

    },

    getMappingsHandler,

  );
};
