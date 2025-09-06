/* src/tools/indices/exists_alias.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Zod validator for runtime validation
const existsAliasValidator = z.object({
  name: z.union([z.string(), z.array(z.string())]),
  index: z.union([z.string(), z.array(z.string())]).optional(),
  allowNoIndices: booleanField().optional(),
  expandWildcards: z
    .enum(["all", "open", "closed", "hidden", "none"])
    .or(z.array(z.enum(["all", "open", "closed", "hidden", "none"])))
    .optional(),
  ignoreUnavailable: booleanField().optional(),
  masterTimeout: z.string().optional(),
});

type ExistsAliasParams = z.infer<typeof existsAliasValidator>;

// MCP error handling
function createExistsAliasMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "index_not_found" | "timeout";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    index_not_found: ErrorCode.InvalidParams,
    timeout: ErrorCode.InternalError,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_exists_alias] ${message}`, context.details);
}

// Tool implementation
export const registerExistsAliasTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const existsAliasHandler = async (args: any): Promise<SearchResult> => {
    try {
      // Validate parameters
      const params = existsAliasValidator.parse(args);

      logger.debug("Checking if alias exists", { name: params.name, index: params.index });

      const result = await esClient.indices.existsAlias(
        {
          name: params.name,
          index: params.index,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
          ignore_unavailable: params.ignoreUnavailable,
          master_timeout: params.masterTimeout,
        },
        {
          opaqueId: "elasticsearch_exists_alias",
        },
      );

      return {
        content: [{ type: "text", text: JSON.stringify({ exists: result }, null, 2) }],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createExistsAliasMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      if (error instanceof Error) {
        if (error.message.includes("index_not_found_exception")) {
          throw createExistsAliasMcpError(`Index not found: ${args?.index}`, {
            type: "index_not_found",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("timeout") || error.message.includes("timed_out")) {
          throw createExistsAliasMcpError(`Operation timed out: ${error.message}`, {
            type: "timeout",
            details: { originalError: error.message },
          });
        }
      }

      throw createExistsAliasMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: { args },
      });
    }
  };

  // Tool registration
  server.tool(
    "elasticsearch_exists_alias",
    "Check if index or data stream aliases exist in Elasticsearch. Best for alias validation, deployment verification, configuration checks. Use when you need to verify alias presence before operations in Elasticsearch.",
    {
      name: z.any(), // Alias name(s) to check existence for. Examples: 'logs', ['alias1', 'alias2']
      index: z.any().optional(), // Index name(s) or pattern(s) to check for aliases
      allowNoIndices: z.boolean().optional(), // Whether to ignore if a wildcard indices expression resolves into no concrete indices
      expandWildcards: z.any().optional(), // Type of index that wildcard patterns can match
      ignoreUnavailable: z.boolean().optional(), // Whether specified concrete indices should be ignored when unavailable
      masterTimeout: z.string().optional(), // Timeout for connection to master node
    },
    existsAliasHandler,
  );
};
