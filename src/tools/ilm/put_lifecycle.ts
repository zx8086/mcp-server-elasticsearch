/* src/tools/ilm/put_lifecycle.ts */
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
const putLifecycleSchema = {
  type: "object",
  properties: {
    policy: {
      type: "string",
      minLength: 1,
      description: "Policy identifier (cannot be empty)",
    },
    body: {
      type: "object",
      description: "ILM policy definition with phases and actions",
      additionalProperties: true,
    },
    masterTimeout: {
      type: "string",
      description: "Master node timeout",
    },
    timeout: {
      type: "string",
      description: "Request timeout",
    },
  },
  required: ["policy"],
  additionalProperties: false,
};

// Simple Zod validator for runtime validation only
const putLifecycleValidator = z.object({
  policy: z.string().min(1, "Policy identifier cannot be empty"),
  body: z.object({
    policy: z.object({
      phases: z.record(z.string(), z.object({
        actions: z.record(z.string(), z.unknown()).optional(),
        min_age: z.string().optional()
      }).passthrough()).optional()
    }).passthrough().optional()
  }).passthrough().optional(),
  masterTimeout: z.string().optional(),
  timeout: z.string().optional(),
});

type PutLifecycleParams = z.infer<typeof putLifecycleValidator>;

// =============================================================================
// 2. STANDARDIZED MCP ERROR HANDLING
// =============================================================================

function createIlmPutLifecycleMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "permission" | "policy_conflict";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    permission: ErrorCode.InvalidRequest,
    policy_conflict: ErrorCode.InvalidRequest,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_ilm_put_lifecycle] ${message}`, context.details);
}

// =============================================================================
// 3. SIMPLIFIED TOOL IMPLEMENTATION
// =============================================================================

export const registerPutLifecycleTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const putLifecycleHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Simple validation - no complex parameter extraction
      const params = putLifecycleValidator.parse(args);

      logger.debug("Creating/updating ILM policy", {
        policy: params.policy,
        hasBody: !!params.body,
        masterTimeout: params.masterTimeout,
        timeout: params.timeout,
      });

      const result = await esClient.ilm.putLifecycle({
        name: params.policy,
        body: params.body,
        master_timeout: params.masterTimeout,
        timeout: params.timeout,
      });

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow ILM operation: put_lifecycle", { duration, policy: params.policy });
      }

      logger.info("ILM policy created/updated successfully", { policy: params.policy });

      // MCP-compliant success response
      return {
        content: [
          {
            type: "text",
            text: `📝 **ILM Policy Created/Updated: ${params.policy}**

The Index Lifecycle Management policy has been successfully ${result.acknowledged ? "created or updated" : "processed"}.

ℹ️ **Next Steps**: The policy will apply to indices matching the configured patterns. Use \`elasticsearch_ilm_explain_lifecycle\` to check policy application.

Operation completed at: ${new Date().toISOString()}`,
          },
          {
            type: "text",
            text: JSON.stringify(
              {
                acknowledged: result.acknowledged || true,
                policy: params.policy,
                operation: "put_lifecycle",
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
        throw createIlmPutLifecycleMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      if (error instanceof Error) {
        if (error.message.includes("security_exception")) {
          throw createIlmPutLifecycleMcpError("Insufficient permissions to create/update ILM policy", {
            type: "permission",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("version_conflict") || error.message.includes("policy_already_exists")) {
          throw createIlmPutLifecycleMcpError(`Policy conflict: ${error.message}`, {
            type: "policy_conflict",
            details: { suggestion: "Policy may already exist with different settings" },
          });
        }

        if (error.message.includes("parsing_exception") || error.message.includes("invalid_policy")) {
          throw createIlmPutLifecycleMcpError(`Invalid policy definition: ${error.message}`, {
            type: "validation",
            details: { suggestion: "Check policy structure and phase configurations" },
          });
        }
      }

      throw createIlmPutLifecycleMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Direct tool registration with JSON Schema + read-only protection
  server.tool(
    "elasticsearch_ilm_put_lifecycle",
    "Create or update ILM policy. Define Index Lifecycle Management policy with automated transitions through hot, warm, cold, and delete phases. Uses direct JSON Schema and standardized MCP error codes. Examples: {policy: 'my-policy', body: {policy: {phases: {hot: {actions: {}}}}}}",
    putLifecycleSchema, // Direct JSON Schema - no Zod conversion
    withReadOnlyCheck("elasticsearch_ilm_put_lifecycle", putLifecycleHandler, OperationType.WRITE),
  );
};
