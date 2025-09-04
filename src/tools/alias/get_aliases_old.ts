/* src/tools/alias/get_aliases_old.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { type SearchResult, type ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const getAliasesSchema = {
  type: "object",
  properties: {
    index: {
      type: "string",
      description: "Index pattern to filter by. Use '*' for all indices. Supports wildcards like 'logs-*'"
    },
    name: {
      type: "string", 
      description: "Alias name pattern to filter by. Supports wildcards"
    },
    ignoreUnavailable: {
      type: "boolean",
      description: "Whether to ignore if a specified index name doesn't exist (default: false)"
    },
    allowNoIndices: {
      type: "boolean",
      description: "Whether to ignore if a wildcard pattern matches no indices (default: true)"
    },
    expandWildcards: {
      type: "string",
      enum: ["all", "open", "closed", "hidden", "none"],
      description: "Whether to expand wildcard expressions to concrete indices"
    }
  },
  additionalProperties: false
};

// Zod validator for runtime validation
const getAliasesValidator = z.object({
  index: z.string().optional(),
  name: z.string().optional(),
  ignoreUnavailable: z.boolean().optional(),
  allowNoIndices: z.boolean().optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional()
});

type GetAliasesParams = z.infer<typeof getAliasesValidator>;

// MCP error handling
function createMcpError(
  error: Error | string,
  context: {
    toolName: string;
    type: 'validation' | 'execution' | 'connection' | 'alias_not_found';
    details?: any;
  }
): McpError {
  const message = error instanceof Error ? error.message : error;
  
  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    connection: ErrorCode.InternalError,
    alias_not_found: ErrorCode.InvalidRequest
  };
  
  return new McpError(
    errorCodeMap[context.type],
    `[${context.toolName}] ${message}`,
    context.details
  );
}

// Tool implementation
export const registerGetAliasesTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  
  // Tool handler
  const getAliasesHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();
    
    try {
      // Validate parameters
      const params = getAliasesValidator.parse(args);
      
      logger.debug("Getting aliases", {
        index: params.index,
        name: params.name,
        options: {
          ignoreUnavailable: params.ignoreUnavailable,
          allowNoIndices: params.allowNoIndices,
          expandWildcards: params.expandWildcards
        }
      });

      const result = await esClient.indices.getAlias(
        {
          index: params.index,
          name: params.name,
          ignore_unavailable: params.ignoreUnavailable,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
        },
        {
          opaqueId: "elasticsearch_get_aliases",
        },
      );

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn(`Slow operation: elasticsearch_get_aliases`, { duration });
      }

      // Format response with summary information
      const aliasCount = Object.keys(result).reduce((count, index) => {
        return count + Object.keys(result[index].aliases || {}).length;
      }, 0);

      const summary = {
        indices_found: Object.keys(result).length,
        total_aliases: aliasCount,
        query_duration_ms: Math.round(duration)
      };

      return {
        content: [
          { type: "text", text: `Found ${aliasCount} aliases across ${Object.keys(result).length} indices` },
          { type: "text", text: JSON.stringify(summary, null, 2) },
          { type: "text", text: JSON.stringify(result, null, 2) }
        ],
      };

    } catch (error) {
      // Error handling with specific alias error types
      if (error instanceof z.ZodError) {
        throw createMcpError(`Validation failed: ${error.errors.map(e => e.message).join(', ')}`, {
          toolName: 'elasticsearch_get_aliases',
          type: 'validation',
          details: { validationErrors: error.errors, providedArgs: args }
        });
      }

      if (error instanceof Error && error.message.includes('index_not_found_exception')) {
        throw createMcpError(`No indices found matching pattern: ${args.index || '*'}`, {
          toolName: 'elasticsearch_get_aliases', 
          type: 'alias_not_found',
          details: { indexPattern: args.index, aliasName: args.name }
        });
      }

      if (error instanceof Error && error.message.includes('alias_not_found_exception')) {
        throw createMcpError(`No aliases found matching pattern: ${args.name || '*'}`, {
          toolName: 'elasticsearch_get_aliases',
          type: 'alias_not_found', 
          details: { indexPattern: args.index, aliasName: args.name }
        });
      }

      throw createMcpError(error instanceof Error ? error.message : String(error), {
        toolName: 'elasticsearch_get_aliases',
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
    "elasticsearch_get_aliases",
    "Get index aliases from Elasticsearch. Best for alias discovery, configuration review, index mapping analysis. Use when you need to inspect alias configurations and their associated indices in Elasticsearch. Supports filtering by index and alias patterns.",
    getAliasesSchema,
    withReadOnlyCheck("elasticsearch_get_aliases", getAliasesHandler, OperationType.READ)
  );
};