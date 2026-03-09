/* src/tools/tasks/cancel_task.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema
const CancelTaskParams = z.object({
  taskId: z.string().optional(),
  actions: z.union([z.string(), z.array(z.string())]).optional(),
  nodes: z.array(z.string()).optional(),
  parentTaskId: z.string().optional(),
  waitForCompletion: booleanField().optional(),
});

type CancelTaskParamsType = z.infer<typeof CancelTaskParams>;

export const registerCancelTaskTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  // Implementation function without read-only checks
  const cancelTaskImpl = async (
    params: CancelTaskParamsType,
    _extra: Record<string, unknown>,
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

  // Tool registration using modern registerTool method

  server.registerTool(
    "elasticsearch_tasks_cancel_task",

    {
      title: "Tasks Cancel Task",

      description:
        "Cancel a running Elasticsearch task. Best for operation control, resource management, stopping long-running operations. Use when you need to terminate tasks that are taking too long or consuming too many resources in Elasticsearch. WARNING: Task management API is beta.",

      inputSchema: {
        taskId: z.string().optional(),
        actions: z.union([z.string(), z.array(z.string())]).optional(),
        nodes: z.array(z.string()).optional(),
        parentTaskId: z.string().optional(),
        waitForCompletion: booleanField().optional(),
      },
    },

    withReadOnlyCheck("elasticsearch_tasks_cancel_task", cancelTaskImpl, OperationType.WRITE),
  );
};
