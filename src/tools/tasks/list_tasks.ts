/* src/tools/tasks/list_tasks.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema
const ListTasksParams = z.object({
  actions: z.union([z.string(), z.array(z.string())]).optional(),
  detailed: z.boolean().optional(),
  groupBy: z.enum(["nodes", "parents", "none"]).optional(),
  nodes: z.union([z.string(), z.array(z.string())]).optional(),
  parentTaskId: z.string().optional(),
  timeout: z.union([z.string(), z.number(), z.literal(-1), z.literal(0)]).optional(),
  waitForCompletion: z.boolean().optional(),
});

type ListTasksParamsType = z.infer<typeof ListTasksParams>;

export const registerListTasksTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "elasticsearch_list_tasks",
    "Get information about tasks currently running on Elasticsearch cluster nodes. Best for cluster monitoring, performance troubleshooting, operation tracking. Use when you need to monitor long-running operations like reindexing, searches, or bulk operations in Elasticsearch.",
    {
      actions: z.union([z.string(), z.array(z.string())]).optional(),
      detailed: z.boolean().optional(),
      groupBy: z.enum(["nodes", "parents", "none"]).optional(),
      nodes: z.union([z.string(), z.array(z.string())]).optional(),
      parentTaskId: z.string().optional(),
      timeout: z.union([z.string(), z.number(), z.literal(-1), z.literal(0)]).optional(),
      waitForCompletion: z.boolean().optional(),
    },
    async (params: ListTasksParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.tasks.list({
          actions: params.actions,
          detailed: params.detailed,
          group_by: params.groupBy,
          nodes: params.nodes,
          parent_task_id: params.parentTaskId,
          timeout: params.timeout,
          wait_for_completion: params.waitForCompletion,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to list tasks:", {
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
    },
  );
};
