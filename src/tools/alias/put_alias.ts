/* src/tools/alias/put_alias.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { type SearchResult, type ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const putAliasSchema = {
  type: "object",
  properties: {
    index: {
      type: "string",
      description: "Index name to add the alias to. Cannot be empty. Supports patterns with wildcards"
    },
    name: {
      type: "string",
      description: "Alias name to create. Cannot be empty. Will overwrite existing alias with same name"
    },
    filter: {
      type: "object",
      description: "Optional query filter to apply when accessing data through this alias"
    },
    routing: {
      type: "string",
      description: "Optional routing value for operations performed through this alias"
    },
    isWriteIndex: {
      type: "boolean",
      description: "Set to true to designate this as the write index for the alias (default: false)"
    }
  },
  required: ["index", "name"],
  additionalProperties: false
};

// Zod validator for runtime validation
const putAliasValidator = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  name: z.string().min(1, "Alias name cannot be empty"),
  filter: z.record(z.any()).optional(),
  routing: z.string().optional(),
  isWriteIndex: z.boolean().optional()
});

type PutAliasParams = z.infer<typeof putAliasValidator>;

// MCP error handling
function createMcpError(
  error: Error | string,
  context: {
    toolName: string;
    type: 'validation' | 'execution' | 'connection' | 'alias_already_exists' | 'invalid_alias';
    details?: any;
  }
): McpError {
  const message = error instanceof Error ? error.message : error;
  
  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    connection: ErrorCode.InternalError,
    alias_already_exists: ErrorCode.InvalidRequest,
    invalid_alias: ErrorCode.InvalidParams
  };
  
  return new McpError(
    errorCodeMap[context.type],
    `[${context.toolName}] ${message}`,
    context.details
  );
}

// Tool implementation
export const registerPutAliasTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  
  // Tool handler
  const putAliasHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();
    
    try {
      // Validate parameters
      const params = putAliasValidator.parse(args);
      
      logger.debug("Creating alias", {
        index: params.index,
        alias: params.name,
        hasFilter: !!params.filter,
        routing: params.routing,
        isWriteIndex: params.isWriteIndex
      });

      // Check if index exists before creating alias
      const indexExists = await esClient.indices.exists({ index: params.index });
      if (!indexExists) {
        throw createMcpError(`Index '${params.index}' does not exist`, {
          toolName: 'elasticsearch_put_alias',
          type: 'invalid_alias',
          details: { index: params.index, alias: params.name }
        });
      }

      const result = await esClient.indices.putAlias(
        {
          index: params.index,
          name: params.name,
          filter: params.filter,
          routing: params.routing,
          is_write_index: params.isWriteIndex,
        },
        {
          opaqueId: "elasticsearch_put_alias",
        },
      );

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn(`Slow operation: elasticsearch_put_alias`, { duration });
      }

      // Format successful response
      const summary = {
        action: "alias_created",
        index: params.index,
        alias: params.name,
        configuration: {
          has_filter: !!params.filter,
          routing: params.routing,
          is_write_index: params.isWriteIndex || false
        },
        operation_duration_ms: Math.round(duration)
      };

      return {
        content: [
          { type: "text", text: `✅ Successfully created alias '${params.name}' for index '${params.index}'` },
          { type: "text", text: JSON.stringify(summary, null, 2) },
          { type: "text", text: JSON.stringify(result, null, 2) }
        ],
      };

    } catch (error) {
      // Error handling with specific alias error types
      if (error instanceof z.ZodError) {
        throw createMcpError(`Validation failed: ${error.errors.map(e => e.message).join(', ')}`, {
          toolName: 'elasticsearch_put_alias',
          type: 'validation',
          details: { validationErrors: error.errors, providedArgs: args }
        });
      }

      if (error instanceof Error && error.message.includes('index_not_found_exception')) {
        throw createMcpError(`Index '${args.index}' does not exist. Create the index first before adding an alias.`, {
          toolName: 'elasticsearch_put_alias',
          type: 'invalid_alias',
          details: { index: args.index, alias: args.name }
        });
      }

      if (error instanceof Error && error.message.includes('invalid_alias_name_exception')) {
        throw createMcpError(`Invalid alias name '${args.name}'. Alias names must be valid and not conflict with existing indices.`, {
          toolName: 'elasticsearch_put_alias',
          type: 'invalid_alias', 
          details: { index: args.index, alias: args.name }
        });
      }

      if (error instanceof Error && error.message.includes('alias_already_exists_exception')) {
        throw createMcpError(`Alias '${args.name}' already exists. Use update_aliases to modify existing aliases.`, {
          toolName: 'elasticsearch_put_alias',
          type: 'alias_already_exists',
          details: { index: args.index, alias: args.name }
        });
      }

      throw createMcpError(error instanceof Error ? error.message : String(error), {
        toolName: 'elasticsearch_put_alias',
        type: 'execution',
        details: { 
          duration: performance.now() - perfStart,
          args 
        }
      });
    }
  };

  // Tool registration
  server.tool(
    "elasticsearch_put_alias",
    "Add an alias to an index in Elasticsearch. Best for alias creation, index abstraction, application decoupling. Use when you need to create named references to Elasticsearch indices for easier management and zero-downtime operations. DESTRUCTIVE: Creates permanent alias configuration that affects index access patterns.",
    putAliasSchema,
    withReadOnlyCheck("elasticsearch_put_alias", putAliasHandler, OperationType.WRITE)
  );
};