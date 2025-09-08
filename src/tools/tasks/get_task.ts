/* src/tools/tasks/get_task.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import { type SearchResult, TextContent, type ToolRegistrationFunction } from "../types.js";

// Define the parameter schema
const GetTaskParams = z.object({
  taskId: z.string().min(1, "Task ID cannot be empty"),
  timeout: z.union([z.string(), z.number(), z.literal(-1), z.literal(0)]).optional(),
  waitForCompletion: booleanField().optional(),
});

type GetTaskParamsType = z.infer<typeof GetTaskParams>;

export const registerGetTaskTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  // Tool registration using modern registerTool method

  server.registerTool(

    "elasticsearch_tasks_get_task",

    {

      title: "Tasks Get Task",

      description: "Get information about a specific Elasticsearch task. Best for task monitoring, operation tracking, performance analysis. Use when you need to inspect the status and details of running or completed tasks in Elasticsearch.",

      inputSchema: {
      taskId: z.string().min(1, "Task ID cannot be empty"),
      timeout: z.union([z.string(), z.number(), z.literal(-1), z.literal(0)]).optional(),
      waitForCompletion: booleanField().optional(),
    },

    },

    async (params: GetTaskParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.tasks.get({
          task_id: params.taskId,
          timeout: params.timeout,
          wait_for_completion: params.waitForCompletion,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to get task information:", {
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
    },

  );;
};
