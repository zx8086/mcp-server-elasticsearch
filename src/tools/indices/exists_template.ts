/* src/tools/indices/exists_template.ts */
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
const existsTemplateValidator = z.object({
  name: z.union([z.string(), z.array(z.string())]),
  flatSettings: booleanField().optional(),
  local: booleanField().optional(),
  masterTimeout: z.string().optional(),
});

type _ExistsTemplateParams = z.infer<typeof existsTemplateValidator>;

// MCP error handling
function createExistsTemplateMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "template_not_found" | "timeout";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    template_not_found: ErrorCode.InvalidParams,
    timeout: ErrorCode.InternalError,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_exists_template] ${message}`, context.details);
}

// Tool implementation
export const registerExistsTemplateTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const existsTemplateHandler = async (args: any): Promise<SearchResult> => {
    try {
      // Validate parameters
      const params = existsTemplateValidator.parse(args);

      logger.debug("Checking if legacy template exists", { name: params.name });

      const result = await esClient.indices.existsTemplate(
        {
          name: params.name,
          flat_settings: params.flatSettings,
          local: params.local,
          master_timeout: params.masterTimeout,
        },
        {
          opaqueId: "elasticsearch_exists_template",
        },
      );

      return {
        content: [{ type: "text", text: JSON.stringify({ exists: result }, null, 2) }],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createExistsTemplateMcpError(`Validation failed: ${error.issues.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.issues, providedArgs: args },
        });
      }

      if (error instanceof Error) {
        if (
          error.message.includes("index_template_missing_exception") ||
          error.message.includes("resource_not_found")
        ) {
          throw createExistsTemplateMcpError(`Template not found: ${args?.name}`, {
            type: "template_not_found",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("timeout") || error.message.includes("timed_out")) {
          throw createExistsTemplateMcpError(`Operation timed out: ${error.message}`, {
            type: "timeout",
            details: { originalError: error.message },
          });
        }
      }

      throw createExistsTemplateMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: { args },
      });
    }
  };

  // Tool registration
  // Tool registration using modern registerTool method

  server.registerTool(
    "elasticsearch_exists_template",

    {
      title: "Exists Template",

      description:
        "Check existence of legacy index templates in Elasticsearch. Best for legacy template validation, migration planning, compatibility checks. Use when you need to verify legacy index template presence in Elasticsearch (deprecated, use composable templates instead).",

      inputSchema: {
        name: z.any(), // Legacy template name(s) to check existence for. Examples: 'template1', ['template1', 'template2']
        flatSettings: z.boolean().optional(), // Return settings in flat format
        local: z.boolean().optional(), // Return local information, do not retrieve the state from master node
        masterTimeout: z.string().optional(), // Timeout for connection to master node
      },
    },

    existsTemplateHandler,
  );
};
