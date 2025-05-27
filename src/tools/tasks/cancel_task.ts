/* src/tools/tasks/cancel_task.ts */

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
const CancelTaskParams = z.object({
  taskId: z.string().optional(),
  actions: z.union([z.string(), z.array(z.string())]).optional(),
  nodes: z.array(z.string()).optional(),
  parentTaskId: z.string().optional(),
  waitForCompletion: z.boolean().optional(),
});

type CancelTaskParamsType = z.infer<typeof CancelTaskParams>;

export const registerCancelTaskTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const cancelTaskImpl = async (
    params: CancelTaskParamsType,
    extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
      const result = await esClient.tasks.cancel({
        task_id: params.taskId,
        actions: params.actions,
        nodes: params.nodes,
        parent_task_id: params.parentTaskId,
        wait_for_completion: params.waitForCompletion,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to cancel task:", {
        error: error instanceof Error ? error.message : String(error),
        taskId: params.taskId,
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
    "cancel_task",
    "Cancel a task. WARNING: The task management API is new and should still be considered a beta feature. The API may change in ways that are not backwards compatible. A task may continue to run for some time after it has been cancelled because it may not be able to safely stop its current activity straight away.",
    {
      taskId: z.string().optional(),
      actions: z.union([z.string(), z.array(z.string())]).optional(),
      nodes: z.array(z.string()).optional(),
      parentTaskId: z.string().optional(),
      waitForCompletion: z.boolean().optional(),
    },
    withReadOnlyCheck(
      "cancel_task",
      cancelTaskImpl,
      OperationType.WRITE,
    ),
  );
};
