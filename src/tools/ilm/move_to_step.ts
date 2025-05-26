/* src/tools/ilm/move_to_step.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { withReadOnlyCheck, OperationType } from "../../utils/readOnlyMode.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import type {
  ToolRegistrationFunction,
  SearchResult,
} from "../types.js";

// Define the parameter schema
const MoveToStepParams = z.object({
  index: z.string().min(1, "Index name is required"),
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

type MoveToStepParamsType = z.infer<typeof MoveToStepParams>;

export const registerMoveToStepTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const moveToStepImpl = async (
    params: MoveToStepParamsType,
    extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
      const result = await esClient.ilm.moveToStep({
        index: params.index,
        current_step: params.currentStep,
        next_step: params.nextStep,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to move to step:", {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  };

  server.tool(
    "ilm_move_to_step",
    "Manually move an index into a specific step in the lifecycle policy and run that step. WARNING: This operation can result in the loss of data. This is a potentially destructive action and should be considered an expert level API.",
    {
      index: z.string().min(1, "Index name is required"),
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
    },
    withReadOnlyCheck(
      "ilm_move_to_step",
      moveToStepImpl,
      OperationType.DESTRUCTIVE,
    ),
  );
};
