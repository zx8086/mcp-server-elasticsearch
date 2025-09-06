/* src/tools/template/put_index_template.ts */
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
const putIndexTemplateValidator = z.object({
  name: z.string().min(1, "Template name cannot be empty"),
  indexPatterns: z.array(z.string()).optional(),
  template: z.object({}).passthrough().optional(),
  composedOf: z.array(z.string()).optional(),
  priority: z.number().optional(),
  version: z.number().optional(),
  meta: z.object({}).passthrough().optional(),
  allowAutoCreate: z.boolean().optional(),
  create: z.boolean().optional(),
  masterTimeout: z.string().optional(),
});

type PutIndexTemplateParams = z.infer<typeof putIndexTemplateValidator>;

// MCP error handling
function createTemplateMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "template_already_exists" | "invalid_template" | "access_denied";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    template_already_exists: ErrorCode.InvalidParams,
    invalid_template: ErrorCode.InvalidParams,
    access_denied: ErrorCode.InvalidParams,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_put_index_template] ${message}`, context.details);
}

// Tool implementation
export const registerPutIndexTemplateTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const putIndexTemplateHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = putIndexTemplateValidator.parse(args);
      const {
        name,
        indexPatterns,
        template,
        composedOf,
        priority,
        version,
        meta,
        allowAutoCreate,
        create,
        masterTimeout,
      } = params;

      logger.debug("Creating/updating index template", { name, indexPatterns, priority });

      const result = await esClient.indices.putIndexTemplate(
        {
          name,
          index_patterns: indexPatterns,
          template,
          composed_of: composedOf,
          priority,
          version,
          _meta: meta,
          allow_auto_create: allowAutoCreate,
          create,
          master_timeout: masterTimeout,
        },
        {
          opaqueId: "elasticsearch_put_index_template",
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
          error.message.includes("resource_already_exists_exception") ||
          error.message.includes("version_conflict_engine_exception")
        ) {
          throw createTemplateMcpError(`Template already exists: ${args?.name}`, {
            type: "template_already_exists",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("parsing_exception") || error.message.includes("mapper_parsing_exception")) {
          throw createTemplateMcpError(`Invalid template definition: ${error.message}`, {
            type: "invalid_template",
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

  // Tool registration - WRITE operation
  server.tool(
    "elasticsearch_put_index_template",
    "Create or update an index template in Elasticsearch. Uses direct JSON Schema and standardized MCP error codes. Best for index standardization, mapping management, settings automation. Use when you need to define templates for automatic index configuration in Elasticsearch. TIP: Define 'indexPatterns' to control which indices use this template, set 'priority' for template precedence.",
    {
      name: z.string(), // Template name (cannot be empty)
      indexPatterns: z.array(z.string().optional()).optional(), // Array of index patterns that this template applies to
      template: z.object({}).optional(), // Template definition containing settings, mappings, and/or aliases
      composedOf: z.array(z.string().optional()).optional(), // Array of component template names this template is composed of
      priority: z.number().optional(), // Template priority (higher number = higher priority)
      version: z.number().optional(), // Template version number
      meta: z.object({}).optional(), // Metadata about the template
      allowAutoCreate: z.boolean().optional(), // Allow automatic index creation
      create: z.boolean().optional(), // If true, only create if template doesn't exist
      masterTimeout: z.string().optional(), // Timeout for master node operations
    },
    putIndexTemplateHandler,
  );
};
