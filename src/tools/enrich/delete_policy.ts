/* src/tools/enrich/delete_policy.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const deletePolicySchema = {
  type: "object",
  properties: {
    name: {
      type: "string",
      minLength: 1,
      description: "Name of the enrich policy to delete"
    },
    masterTimeout: {
      type: "string",
      description: "Timeout for master node operations. Examples: '30s', '1m'"
    }
  },
  required: ["name"],
  additionalProperties: false
};

// Zod validator for runtime validation
const deletePolicyValidator = z.object({
  name: z.string().min(1, "Policy name cannot be empty"),
  masterTimeout: z.string().optional(),
});

type DeletePolicyParams = z.infer<typeof deletePolicyValidator>;

// MCP error handling
function createDeletePolicyMcpError(
  error: Error | string,
  context: {
    type: 'validation' | 'execution' | 'policy_not_found' | 'timeout' | 'policy_in_use';
    details?: any;
  }
): McpError {
  const message = error instanceof Error ? error.message : error;
  
  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    policy_not_found: ErrorCode.InvalidParams,
    timeout: ErrorCode.InternalError,
    policy_in_use: ErrorCode.InvalidParams
  };
  
  return new McpError(
    errorCodeMap[context.type],
    `[elasticsearch_enrich_delete_policy] ${message}`,
    context.details
  );
}

// Tool implementation
export const registerEnrichDeletePolicyTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  
  const deletePolicyHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();
    
    try {
      // Validate parameters
      const params = deletePolicyValidator.parse(args);
      const { name, masterTimeout } = params;

      logger.debug("Deleting enrich policy", { name, masterTimeout });

      const result = await esClient.enrich.deletePolicy({
        name,
        master_timeout: masterTimeout,
      });

      const duration = performance.now() - perfStart;
      if (duration > 10000) {
        logger.warn("Slow delete enrich policy operation", { duration });
      }

      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) } as TextContent
        ],
      };

    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createDeletePolicyMcpError(`Validation failed: ${error.errors.map(e => e.message).join(', ')}`, {
          type: 'validation',
          details: { validationErrors: error.errors, providedArgs: args }
        });
      }

      if (error instanceof Error) {
        if (error.message.includes('timeout') || error.message.includes('timed_out')) {
          throw createDeletePolicyMcpError(`Operation timed out: ${error.message}`, {
            type: 'timeout',
            details: { duration: performance.now() - perfStart }
          });
        }

        if (error.message.includes('not_found') || error.message.includes('resource_not_found_exception')) {
          throw createDeletePolicyMcpError(`Enrich policy not found: ${args?.name || 'unknown'}`, {
            type: 'policy_not_found',
            details: { policyName: args?.name }
          });
        }

        if (error.message.includes('in_use') || error.message.includes('policy_is_in_use') || error.message.includes('cannot_delete')) {
          throw createDeletePolicyMcpError(`Cannot delete policy in use: ${error.message}`, {
            type: 'policy_in_use',
            details: { originalError: error.message, policyName: args?.name }
          });
        }
      }

      throw createDeletePolicyMcpError(error instanceof Error ? error.message : String(error), {
        type: 'execution',
        details: { 
          duration: performance.now() - perfStart,
          args 
        }
      });
    }
  };

  // Implementation function without read-only checks for withReadOnlyCheck wrapper
  const deletePolicyImpl = async (
    params: DeletePolicyParams,
    _extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    return deletePolicyHandler(params);
  };

  // Tool registration - DESTRUCTIVE operation with read-only mode protection
  server.tool(
    "elasticsearch_enrich_delete_policy",
    "Delete an enrich policy and its index in Elasticsearch. Best for policy cleanup, configuration management, removing unused enrichment. Use when you need to remove enrich policies and their associated indices from Elasticsearch.",
    deletePolicySchema,
    withReadOnlyCheck("elasticsearch_enrich_delete_policy", deletePolicyImpl, OperationType.DELETE)
  );
};