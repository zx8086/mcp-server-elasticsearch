/* src/tools/ilm/move_to_step.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

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
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Simple Zod validator for runtime validation only
const moveToStepValidator = z.object({
  index: z.string().min(1, "Index name cannot be empty"),
  currentStep: z.object({
    phase: z.string(),
    action: z.string(),
    name: z.string(),
  }),
  nextStep: z.object({
    phase: z.string(),
    action: z.string().optional(),
    name: z.string().optional(),
  }),
});

type MoveToStepParams = z.infer<typeof moveToStepValidator>;

// =============================================================================
// 2. STANDARDIZED MCP ERROR HANDLING
// =============================================================================

function createIlmMoveToStepMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "permission" | "step_conflict" | "index_not_found";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    permission: ErrorCode.InvalidRequest,
    step_conflict: ErrorCode.InvalidRequest,
    index_not_found: ErrorCode.InvalidParams,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_ilm_move_to_step] ${message}`, context.details);
}

// =============================================================================
// 3. SIMPLIFIED TOOL IMPLEMENTATION
// =============================================================================

export const registerMoveToStepTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const moveToStepHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Simple validation - no complex parameter extraction
      const params = moveToStepValidator.parse(args);

      logger.debug("Moving index to ILM step", {
        index: params.index,
        currentStep: params.currentStep,
        nextStep: params.nextStep,
      });

      const result = await esClient.ilm.moveToStep({
        index: params.index,
        current_step: params.currentStep,
        next_step: params.nextStep,
      });

      const duration = performance.now() - perfStart;
      if (duration > 10000) {
        logger.warn("Slow ILM operation: move_to_step", { duration, index: params.index });
      }

      logger.info("Index moved to ILM step successfully", {
        index: params.index,
        from: `${params.currentStep.phase}.${params.currentStep.action}.${params.currentStep.name}`,
        to: `${params.nextStep.phase}.${params.nextStep.action || "default"}.${params.nextStep.name || "default"}`,
      });

      // MCP-compliant success response with step transition details
      return {
        content: [
          {
            type: "text",
            text: `⚙️ **ILM Step Transition Completed**

**Index**: ${params.index}

**From Step**: 
- Phase: ${params.currentStep.phase}
- Action: ${params.currentStep.action}
- Step: ${params.currentStep.name}

**To Step**: 
- Phase: ${params.nextStep.phase}
- Action: ${params.nextStep.action || "default"}
- Step: ${params.nextStep.name || "default"}

⚠️ **Warning**: This is an expert-level operation that manually overrides ILM progression.
ℹ️ **Next**: Use \`elasticsearch_ilm_explain_lifecycle\` to verify the index is in the expected step.

Operation completed at: ${new Date().toISOString()}`,
          },
          {
            type: "text",
            text: JSON.stringify(
              {
                acknowledged: result.acknowledged || true,
                index: params.index,
                from_step: `${params.currentStep.phase}.${params.currentStep.action}.${params.currentStep.name}`,
                to_step: `${params.nextStep.phase}.${params.nextStep.action || "default"}.${params.nextStep.name || "default"}`,
                operation: "move_to_step",
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
        throw createIlmMoveToStepMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      if (error instanceof Error) {
        if (error.message.includes("security_exception")) {
          throw createIlmMoveToStepMcpError("Insufficient permissions to move ILM step", {
            type: "permission",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("index_not_found") || error.message.includes("no such index")) {
          throw createIlmMoveToStepMcpError(`Index not found: ${params?.index || "unknown"}`, {
            type: "index_not_found",
            details: { suggestion: "Verify the index name exists" },
          });
        }

        if (error.message.includes("step_not_found") || error.message.includes("invalid_step")) {
          throw createIlmMoveToStepMcpError(`Invalid step transition: ${error.message}`, {
            type: "step_conflict",
            details: { suggestion: "Use explain_lifecycle to check current step and valid transitions" },
          });
        }

        if (error.message.includes("step_conflict") || error.message.includes("cannot_move")) {
          throw createIlmMoveToStepMcpError(`Step conflict: ${error.message}`, {
            type: "step_conflict",
            details: { suggestion: "Check current step matches the specified currentStep parameter" },
          });
        }
      }

      throw createIlmMoveToStepMcpError(error instanceof Error ? error.message : String(error), {
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
    "elasticsearch_ilm_move_to_step",
    "Move index to ILM step. Manually move an index to a specific ILM policy step. Uses direct JSON Schema and standardized MCP error codes. Expert-level operation for troubleshooting. Examples: {index: 'my-index', currentStep: {phase: 'hot', action: 'rollover', name: 'check-rollover-ready'}, nextStep: {phase: 'warm'}}",
    {
      index: z.string().min(1, "Index name cannot be empty"),
      currentStep: z.object({
        phase: z.string().min(1, "Phase is required"),
        action: z.string().min(1, "Action is required"),  
        name: z.string().min(1, "Step name is required"),
      }).describe("Current ILM step the index is in"),
      nextStep: z.object({
        phase: z.string().min(1, "Phase is required"),
        action: z.string().optional().describe("Action (optional, will use default if not provided)"),
        name: z.string().optional().describe("Step name (optional, will use default if not provided)"),
      }).describe("Target ILM step to move the index to"),
    },
    withReadOnlyCheck("elasticsearch_ilm_move_to_step", moveToStepHandler, OperationType.DESTRUCTIVE),
  );
};
