/* src/tools/ilm/remove_policy.ts */
/* SIMPLIFIED VERSION: Direct JSON Schema + MCP Error Codes */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// =============================================================================
// 1. SIMPLIFIED SCHEMA APPROACH
// =============================================================================

// Direct JSON Schema definition
const removePolicySchema = {
  type: "object",
  properties: {
    index: {
      type: "string",
      minLength: 1,
      description: "Index name or pattern to remove ILM policy from (cannot be empty)",
    },
  },
  required: ["index"],
  additionalProperties: false,
};

// Simple Zod validator for runtime validation only
const removePolicyValidator = z.object({
  index: z.string().min(1, "Index name cannot be empty"),
});

type RemovePolicyParams = z.infer<typeof removePolicyValidator>;

// =============================================================================
// 2. STANDARDIZED MCP ERROR HANDLING
// =============================================================================

function createIlmRemovePolicyMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "permission" | "index_not_found" | "no_policy";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    permission: ErrorCode.InvalidRequest,
    index_not_found: ErrorCode.InvalidParams,
    no_policy: ErrorCode.InvalidRequest,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_ilm_remove_policy] ${message}`, context.details);
}

// =============================================================================
// 3. SIMPLIFIED TOOL IMPLEMENTATION
// =============================================================================

export const registerRemovePolicyTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const removePolicyHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Simple validation - no complex parameter extraction
      const params = removePolicyValidator.parse(args);

      logger.debug("Removing ILM policy from index", {
        index: params.index,
      });

      const result = await esClient.ilm.removePolicy({
        index: params.index,
      });

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow ILM operation: remove_policy", { duration, index: params.index });
      }

      logger.info("ILM policy removed successfully", { index: params.index });

      // Extract information about affected indices
      const hasFailures = result.has_failures || false;
      const failedIndices = result.failed_indexes || [];
      const successfulCount =
        result.has_failures && result.failed_indexes
          ? `Some indices (failures: ${result.failed_indexes.length})`
          : "All matching indices";

      // MCP-compliant success response
      return {
        content: [
          {
            type: "text",
            text: `🚫 **ILM Policy Removed from: ${params.index}**

**Result**: ${successfulCount} have been detached from ILM management.

${hasFailures ? `⚠️ **Failures**: ${failedIndices.length} indices could not be updated:\n${failedIndices.map((f) => `- ${f}`).join("\n")}\n` : ""}ℹ️ **Effect**: Affected indices will no longer follow ILM policies and must be managed manually.
⚙️ **Next**: Use \`elasticsearch_ilm_explain_lifecycle\` to verify policy removal.

Operation completed at: ${new Date().toISOString()}`,
          },
          {
            type: "text",
            text: JSON.stringify(
              {
                has_failures: hasFailures,
                failed_indexes: failedIndices,
                index_pattern: params.index,
                operation: "remove_policy",
                timestamp: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      // Standardized MCP error handling
      if (error instanceof z.ZodError) {
        throw createIlmRemovePolicyMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      if (error instanceof Error) {
        if (error.message.includes("security_exception")) {
          throw createIlmRemovePolicyMcpError("Insufficient permissions to remove ILM policy", {
            type: "permission",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("index_not_found") || error.message.includes("no such index")) {
          throw createIlmRemovePolicyMcpError(`Index not found: ${params?.index || "unknown"}`, {
            type: "index_not_found",
            details: { suggestion: "Verify the index name or pattern exists" },
          });
        }

        if (error.message.includes("no_policy") || error.message.includes("no lifecycle policy")) {
          throw createIlmRemovePolicyMcpError(`No ILM policy assigned to: ${params?.index || "unknown"}`, {
            type: "no_policy",
            details: { suggestion: "Use explain_lifecycle to check current policy assignments" },
          });
        }
      }

      throw createIlmRemovePolicyMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Direct tool registration with JSON Schema + read-only protection
  // Tool registration using modern registerTool method

  server.registerTool(

    "elasticsearch_ilm_remove_policy",

    {

      title: "Ilm Remove Policy",

      description: "Remove ILM policy from indices. Remove Index Lifecycle Management policy assignment from indices, stopping automated lifecycle management. Uses direct JSON Schema and standardized MCP error codes. Examples: {index: logs-*}, {index: my-index-000001}",

      inputSchema: removePolicySchema,

    },

    // Direct JSON Schema - no Zod conversion
    withReadOnlyCheck("elasticsearch_ilm_remove_policy", removePolicyHandler, OperationType.WRITE),

  );;
};
