import type { Client } from "@elastic/elasticsearch";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { booleanField } from "../../utils/zodHelpers.js";

// Define task-specific error types
export class TaskError extends Error {
  constructor(
    message: string,
    public readonly taskId?: string,
  ) {
    super(message);
    this.name = "TaskError";
  }
}

export class TaskNotFoundError extends TaskError {
  constructor(taskId: string) {
    super(`Task not found: ${taskId}`, taskId);
    this.name = "TaskNotFoundError";
  }
}

export class TaskCancellationError extends TaskError {
  constructor(taskId: string, reason?: string) {
    super(`Failed to cancel task ${taskId}: ${reason || "Unknown error"}`, taskId);
    this.name = "TaskCancellationError";
  }
}

// ============================================================================
// LIST TASKS
// ============================================================================

const listTasksSchema = z.object({
  actions: z.union([z.string(), z.array(z.string())]).optional(),
  detailed: booleanField().optional(),
  groupBy: z.enum(["nodes", "parents", "none"]).optional(),
  nodes: z.union([z.string(), z.array(z.string())]).optional(),
  parentTaskId: z.string().optional(),
  timeout: z.union([z.string(), z.number(), z.literal(-1), z.literal(0)]).optional(),
  waitForCompletion: booleanField().optional(),
});

export const listTasks = {
  name: "elasticsearch_list_tasks",
  description:
    "Get information about tasks currently running on Elasticsearch cluster nodes. Best for cluster monitoring, performance troubleshooting, operation tracking. Use when you need to monitor long-running operations like reindexing, searches, or bulk operations in Elasticsearch.",
  inputSchema: listTasksSchema,
  operationType: OperationType.READ as const,
  handler: async (client: Client, args: z.infer<typeof listTasksSchema>) => {
    try {
      logger.debug("Listing Elasticsearch tasks", {
        actions: args.actions,
        groupBy: args.groupBy,
        nodes: args.nodes,
      });

      const result = await client.tasks.list({
        actions: args.actions,
        detailed: args.detailed,
        group_by: args.groupBy,
        nodes: args.nodes,
        parent_task_id: args.parentTaskId,
        timeout: args.timeout,
        wait_for_completion: args.waitForCompletion,
      });

      logger.debug("Tasks retrieved successfully", {
        taskCount: Object.keys(result.tasks || {}).length,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to list tasks", {
        error: error instanceof Error ? error.message : String(error),
        actions: args.actions,
        nodes: args.nodes,
      });

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list tasks: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

// ============================================================================
// GET TASK
// ============================================================================

const getTaskSchema = z.object({
  taskId: z.string().min(1, "Task ID cannot be empty"),
  timeout: z.union([z.string(), z.number(), z.literal(-1), z.literal(0)]).optional(),
  waitForCompletion: booleanField().optional(),
});

export const getTask = {
  name: "elasticsearch_get_task",
  description:
    "Get information about a specific Elasticsearch task. Best for task monitoring, operation tracking, performance analysis. Use when you need to inspect the status and details of running or completed tasks in Elasticsearch.",
  inputSchema: getTaskSchema,
  operationType: OperationType.READ as const,
  handler: async (client: Client, args: z.infer<typeof getTaskSchema>) => {
    try {
      logger.debug("Getting Elasticsearch task details", {
        taskId: args.taskId,
        timeout: args.timeout,
      });

      const result = await client.tasks.get({
        task_id: args.taskId,
        timeout: args.timeout,
        wait_for_completion: args.waitForCompletion,
      });

      logger.debug("Task details retrieved successfully", {
        taskId: args.taskId,
        completed: result.completed,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to get task", {
        error: error instanceof Error ? error.message : String(error),
        taskId: args.taskId,
      });

      if (error instanceof Error && error.message.includes("not found")) {
        throw new McpError(ErrorCode.InvalidRequest, `Task not found: ${args.taskId}`);
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get task: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

// ============================================================================
// CANCEL TASK
// ============================================================================

const cancelTaskSchema = z.object({
  taskId: z.string().optional(),
  actions: z.union([z.string(), z.array(z.string())]).optional(),
  nodes: z.array(z.string()).optional(),
  parentTaskId: z.string().optional(),
  waitForCompletion: booleanField().optional(),
});

const cancelTaskImpl = async (client: Client, args: z.infer<typeof cancelTaskSchema>) => {
  try {
    logger.debug("Cancelling Elasticsearch task", {
      taskId: args.taskId,
      actions: args.actions,
      nodes: args.nodes,
    });

    const result = await client.tasks.cancel({
      task_id: args.taskId,
      actions: args.actions,
      nodes: args.nodes,
      parent_task_id: args.parentTaskId,
      wait_for_completion: args.waitForCompletion,
    });

    logger.info("Task cancellation completed", {
      taskId: args.taskId,
      nodesAffected: result.nodes ? Object.keys(result.nodes).length : 0,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error("Failed to cancel task", {
      error: error instanceof Error ? error.message : String(error),
      taskId: args.taskId,
    });

    if (args.taskId && error instanceof Error && error.message.includes("not found")) {
      throw new McpError(ErrorCode.InvalidRequest, `Task not found: ${args.taskId}`);
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Failed to cancel task: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const cancelTask = {
  name: "elasticsearch_cancel_task",
  description:
    "Cancel a running Elasticsearch task. Best for operation control, resource management, stopping long-running operations. Use when you need to terminate tasks that are taking too long or consuming too many resources in Elasticsearch. WARNING: Task management API is beta.",
  inputSchema: cancelTaskSchema,
  operationType: OperationType.WRITE as const,
  handler: withReadOnlyCheck("elasticsearch_cancel_task", cancelTaskImpl, OperationType.WRITE),
};

// Export all tools
export const tasksTools = [listTasks, getTask, cancelTask] as const;
