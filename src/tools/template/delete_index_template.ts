/* src/tools/template/delete_index_template.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Zod validator for runtime validation
const deleteIndexTemplateValidator = z.object({
  name: z.string().min(1, "Template name cannot be empty"),
  masterTimeout: z.string().optional(),
});

type DeleteIndexTemplateParams = z.infer<typeof deleteIndexTemplateValidator>;

// MCP error handling
function createTemplateMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "template_not_found" | "access_denied";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    template_not_found: ErrorCode.InvalidParams,
    access_denied: ErrorCode.InvalidParams,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_delete_index_template] ${message}`, context.details);
}

// Tool implementation
export const registerDeleteIndexTemplateTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const deleteIndexTemplateHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = deleteIndexTemplateValidator.parse(args);
      const { name, masterTimeout } = params;

      logger.debug("Deleting index template", { name });

      const result = await esClient.indices.deleteIndexTemplate(
        {
          name,
          master_timeout: masterTimeout,
        },
        {
          opaqueId: "elasticsearch_delete_index_template",
        },
      );

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow template operation", { duration });
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createTemplateMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      if (error instanceof Error) {
        if (
          error.message.includes("index_template_missing_exception") ||
          error.message.includes("resource_not_found_exception")
        ) {
          throw createTemplateMcpError(`Template not found: ${args?.name}`, {
            type: "template_not_found",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("security_exception") || error.message.includes("unauthorized")) {
          throw createTemplateMcpError("Access denied to template operations", {
            type: "access_denied",
            details: { originalError: error.message },
          });
        }
      }

      throw createTemplateMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Tool registration - DESTRUCTIVE operation
  server.tool(
    "elasticsearch_delete_index_template",
    "Delete an index template in Elasticsearch. Uses direct JSON Schema and standardized MCP error codes. Best for template management, configuration cleanup, removing unused templates. Use when you need to remove Elasticsearch index templates that define settings and mappings for new indices. WARNING: This is a destructive operation that cannot be undone.",
    {
      name: z.string(), // Template name (cannot be empty)
      masterTimeout: z.string().optional(), // Timeout for master node operations
    },
    deleteIndexTemplateHandler,
  );
};
