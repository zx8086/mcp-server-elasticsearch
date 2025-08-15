/* src/tools/ilm/move_to_step.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

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

export const registerMoveToStepTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  // Implementation function without read-only checks
  const moveToStepImpl = async (
    params: MoveToStepParamsType,
    _extra: Record<string, unknown>,
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
    "elasticsearch_ilm_move_to_step",
    "Manually move an index to a specific ILM policy step in Elasticsearch. Best for expert troubleshooting, policy debugging, manual intervention. Use when you need to force index progression in ILM policies. WARNING: Potentially destructive, expert-level operation.",
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
    withReadOnlyCheck("elasticsearch_ilm_move_to_step", moveToStepImpl, OperationType.DESTRUCTIVE),
  );
};
