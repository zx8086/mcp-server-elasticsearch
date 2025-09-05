/* src/tools/alias/update_aliases.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const updateAliasesSchema = {
  type: "object",
  properties: {
    actions: {
      type: "array",
      description:
        "Array of alias actions to perform atomically. Each action should have 'add', 'remove', or 'remove_index' key with appropriate configuration",
      items: {
        type: "object",
        description:
          "Alias action: {add: {index: 'idx', alias: 'alias'}}, {remove: {index: 'idx', alias: 'alias'}}, or {remove_index: {index: 'idx'}}",
      },
    },
    timeout: {
      type: "string",
      description: "Timeout for the request (e.g., '30s', '1m'). Optional",
    },
    masterTimeout: {
      type: "string",
      description: "Timeout for waiting for master node response (e.g., '30s', '1m'). Optional",
    },
  },
  required: ["actions"],
  additionalProperties: false,
};

// Zod validator for runtime validation
const updateAliasesValidator = z.object({
  actions: z
    .array(
      z.union([
        z.object({
          add: z
            .object({
              index: z.string(),
              alias: z.string(),
              filter: z.record(z.string(), z.unknown()).optional(),
              routing: z.string().optional(),
              is_write_index: z.boolean().optional(),
            })
            .passthrough(),
        }),
        z.object({
          remove: z
            .object({
              index: z.string(),
              alias: z.string(),
            })
            .passthrough(),
        }),
        z.object({
          remove_index: z
            .object({
              index: z.string(),
            })
            .passthrough(),
        }),
      ]),
    )
    .min(1, "At least one action is required"),
  timeout: z.string().optional(),
  masterTimeout: z.string().optional(),
});

type UpdateAliasesParams = z.infer<typeof updateAliasesValidator>;

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

// Validate alias actions
function validateAliasActions(actions: any[]): void {
  const validActionTypes = ["add", "remove", "remove_index"];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const actionKeys = Object.keys(action);

    if (actionKeys.length !== 1) {
      throw new Error(`Action ${i}: Each action must have exactly one key (add, remove, or remove_index)`);
    }

    const actionType = actionKeys[0];
    if (!validActionTypes.includes(actionType)) {
      throw new Error(
        `Action ${i}: Invalid action type '${actionType}'. Must be one of: ${validActionTypes.join(", ")}`,
      );
    }

    const actionConfig = action[actionType];
    if (!actionConfig || typeof actionConfig !== "object") {
      throw new Error(`Action ${i}: Action configuration must be an object`);
    }

    // Validate required fields based on action type
    if (actionType === "add" || actionType === "remove") {
      if (!actionConfig.index || !actionConfig.alias) {
        throw new Error(`Action ${i}: ${actionType} actions require 'index' and 'alias' fields`);
      }
    } else if (actionType === "remove_index") {
      if (!actionConfig.index) {
        throw new Error(`Action ${i}: remove_index actions require 'index' field`);
      }
    }
  }
}

// Tool implementation
export const registerUpdateAliasesTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  // Tool handler
  const updateAliasesHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = updateAliasesValidator.parse(args);

      // Validate alias actions structure
      validateAliasActions(params.actions);

      logger.debug("Updating aliases", {
        actionCount: params.actions.length,
        actions: params.actions.map((action) => Object.keys(action)[0]),
        timeout: params.timeout,
        masterTimeout: params.masterTimeout,
      });

      const result = await esClient.indices.updateAliases(
        {
          actions: params.actions,
          timeout: params.timeout,
          master_timeout: params.masterTimeout,
        },
        {
          opaqueId: "elasticsearch_update_aliases",
        },
      );

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow operation: elasticsearch_update_aliases", { duration });
      }

      // Analyze actions for summary
      const actionSummary = params.actions.reduce(
        (summary, action) => {
          const actionType = Object.keys(action)[0];
          summary[actionType] = (summary[actionType] || 0) + 1;
          return summary;
        },
        {} as Record<string, number>,
      );

      // Format successful response
      const summary = {
        action: "aliases_updated",
        total_actions: params.actions.length,
        actions_performed: actionSummary,
        operation_duration_ms: Math.round(duration),
      };

      const actionMessages = Object.entries(actionSummary)
        .map(([type, count]) => `${count} ${type} action${count > 1 ? "s" : ""}`)
        .join(", ");

      return {
        content: [
          { type: "text", text: `✅ Successfully executed ${params.actions.length} alias actions: ${actionMessages}` },
          { type: "text", text: JSON.stringify(summary, null, 2) },
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    } catch (error) {
      // Error handling with specific alias error types
      if (error instanceof z.ZodError) {
        throw createMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          toolName: "elasticsearch_update_aliases",
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      // Handle action validation errors
      if (error instanceof Error && error.message.includes("Action ")) {
        throw createMcpError(error.message, {
          toolName: "elasticsearch_update_aliases",
          type: "validation",
          details: { actions: args.actions },
        });
      }

      if (error instanceof Error && error.message.includes("index_not_found_exception")) {
        throw createMcpError(
          "One or more indices in the actions do not exist. Check index names and ensure they exist before updating aliases.",
          {
            toolName: "elasticsearch_update_aliases",
            type: "invalid_alias",
            details: { actions: args.actions },
          },
        );
      }

      if (error instanceof Error && error.message.includes("alias_not_found_exception")) {
        throw createMcpError(
          "One or more aliases in remove actions do not exist. Check alias names before attempting to remove.",
          {
            toolName: "elasticsearch_update_aliases",
            type: "alias_not_found",
            details: { actions: args.actions },
          },
        );
      }

      if (error instanceof Error && error.message.includes("invalid_alias_name_exception")) {
        throw createMcpError(
          `One or more alias names are invalid. Check alias name formats and ensure they don't conflict with existing indices.`,
          {
            toolName: "elasticsearch_update_aliases",
            type: "invalid_alias",
            details: { actions: args.actions },
          },
        );
      }

      throw createMcpError(error instanceof Error ? error.message : String(error), {
        toolName: "elasticsearch_update_aliases",
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
    "elasticsearch_update_aliases",
    "Update index aliases in Elasticsearch using the aliases API. Best for alias management, index switching, zero-downtime deployments. Use when you need to atomically add, remove, or modify multiple index aliases in Elasticsearch. DESTRUCTIVE: Actions are performed atomically but modify alias configurations permanently. TIP: Use [{add: {index: 'new-index', alias: 'my-alias'}}, {remove: {index: 'old-index', alias: 'my-alias'}}] for zero-downtime index switching.",
    updateAliasesSchema,
    withReadOnlyCheck("elasticsearch_update_aliases", updateAliasesHandler, OperationType.DESTRUCTIVE),
  );
};
