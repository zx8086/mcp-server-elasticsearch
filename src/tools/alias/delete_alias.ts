/* src/tools/alias/delete_alias.ts */
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
const deleteAliasValidator = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  name: z.string().min(1, "Alias name cannot be empty"),
  timeout: z.string().optional(),
  masterTimeout: z.string().optional(),
});

type DeleteAliasParams = z.infer<typeof deleteAliasValidator>;

// MCP error handling
function createMcpError(
  error: Error | string,
  context: {
    toolName: string;
    type: "validation" | "execution" | "connection" | "alias_not_found" | "invalid_alias";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    connection: ErrorCode.InternalError,
    alias_not_found: ErrorCode.InvalidRequest,
    invalid_alias: ErrorCode.InvalidParams,
  };

  return new McpError(errorCodeMap[context.type], `[${context.toolName}] ${message}`, context.details);
}

// Tool implementation
export const registerDeleteAliasTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  // Tool handler
  const deleteAliasHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = deleteAliasValidator.parse(args);

      logger.debug("Deleting alias", {
        index: params.index,
        alias: params.name,
        timeout: params.timeout,
        masterTimeout: params.masterTimeout,
      });

      // Check if alias exists before attempting to delete
      try {
        await esClient.indices.getAlias({
          index: params.index,
          name: params.name,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("alias_not_found_exception")) {
          throw createMcpError(`Alias '${params.name}' not found on index '${params.index}'`, {
            toolName: "elasticsearch_delete_alias",
            type: "alias_not_found",
            details: { index: params.index, alias: params.name },
          });
        }
        throw error; // Re-throw other errors
      }

      const result = await esClient.indices.deleteAlias({
        index: params.index,
        name: params.name,
        timeout: params.timeout,
        master_timeout: params.masterTimeout,
      });

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow operation: elasticsearch_delete_alias", { duration });
      }

      // Format successful response
      const summary = {
        action: "alias_deleted",
        index: params.index,
        alias: params.name,
        operation_duration_ms: Math.round(duration),
      };

      return {
        content: [
          { type: "text", text: `✅ Successfully deleted alias '${params.name}' from index '${params.index}'` },
          { type: "text", text: JSON.stringify(summary, null, 2) },
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    } catch (error) {
      // Error handling with specific alias error types
      if (error instanceof z.ZodError) {
        throw createMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          toolName: "elasticsearch_delete_alias",
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      if (error instanceof Error && error.message.includes("index_not_found_exception")) {
        throw createMcpError(`Index '${args.index}' does not exist`, {
          toolName: "elasticsearch_delete_alias",
          type: "alias_not_found",
          details: { index: args.index, alias: args.name },
        });
      }

      if (error instanceof Error && error.message.includes("alias_not_found_exception")) {
        throw createMcpError(`Alias '${args.name}' not found on index '${args.index}'`, {
          toolName: "elasticsearch_delete_alias",
          type: "alias_not_found",
          details: { index: args.index, alias: args.name },
        });
      }

      if (error instanceof Error && error.message.includes("invalid_alias_name_exception")) {
        throw createMcpError(`Invalid alias name '${args.name}'. Check alias name format.`, {
          toolName: "elasticsearch_delete_alias",
          type: "invalid_alias",
          details: { index: args.index, alias: args.name },
        });
      }

      throw createMcpError(error instanceof Error ? error.message : String(error), {
        toolName: "elasticsearch_delete_alias",
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Tool registration
  server.tool(
    "elasticsearch_delete_alias",
    "Delete an alias from an index in Elasticsearch. Best for alias cleanup, configuration management, removing unused references. Use when you need to remove named references to Elasticsearch indices during maintenance or restructuring. DESTRUCTIVE: Permanently removes alias configuration and may break applications relying on the alias.",
    {
      index: z.string(), // Index name to remove the alias from. Cannot be empty. Supports patterns with wildcards
      name: z.string(), // Alias name to delete. Cannot be empty. Must exist on the specified index
      timeout: z.string().optional(), // Timeout for the request (e.g., '30s', '1m'). Optional
      masterTimeout: z.string().optional(), // Timeout for waiting for master node response (e.g., '30s', '1m'). Optional
    },
    withReadOnlyCheck("elasticsearch_delete_alias", deleteAliasHandler, OperationType.DESTRUCTIVE),
  );
};
