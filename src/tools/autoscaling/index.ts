import type { Client } from "@elastic/elasticsearch";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";

// Define autoscaling-specific error types
export class AutoscalingError extends Error {
  constructor(
    message: string,
    public readonly policyName?: string,
  ) {
    super(message);
    this.name = "AutoscalingError";
  }
}

export class AutoscalingPolicyNotFoundError extends AutoscalingError {
  constructor(policyName: string) {
    super(`Autoscaling policy not found: ${policyName}`, policyName);
    this.name = "AutoscalingPolicyNotFoundError";
  }
}

export class AutoscalingCapacityError extends AutoscalingError {
  constructor(reason: string) {
    super(`Failed to get autoscaling capacity: ${reason}`);
    this.name = "AutoscalingCapacityError";
  }
}

export class AutoscalingPolicyConfigError extends AutoscalingError {
  constructor(policyName: string, reason: string) {
    super(`Invalid autoscaling policy configuration for ${policyName}: ${reason}`, policyName);
    this.name = "AutoscalingPolicyConfigError";
  }
}

// ============================================================================
// GET AUTOSCALING CAPACITY
// ============================================================================

const getCapacitySchema = z.object({
  masterTimeout: z.string().optional(),
});

export const getCapacity = {
  name: "elasticsearch_autoscaling_get_capacity",
  description:
    "Get the current autoscaling capacity from Elasticsearch. Best for capacity planning, resource monitoring, cluster scaling analysis. Use when you need to monitor Elasticsearch cluster autoscaling decisions and capacity recommendations. NOTE: Designed for Elasticsearch Service, ECE, and ECK.",
  inputSchema: getCapacitySchema,
  operationType: OperationType.READ as const,
  handler: async (client: Client, args: z.infer<typeof getCapacitySchema>) => {
    try {
      logger.debug("Getting autoscaling capacity", {
        masterTimeout: args.masterTimeout,
      });

      const result = await client.autoscaling.getAutoscalingCapacity({
        master_timeout: args.masterTimeout,
      });

      logger.debug("Autoscaling capacity retrieved successfully", {
        capacityDataAvailable: !!result.policies,
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
      logger.error("Failed to get autoscaling capacity", {
        error: error instanceof Error ? error.message : String(error),
        masterTimeout: args.masterTimeout,
      });

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get autoscaling capacity: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

// ============================================================================
// GET AUTOSCALING POLICY
// ============================================================================

const getPolicySchema = z.object({
  name: z.string().min(1, "Policy name cannot be empty"),
  masterTimeout: z.string().optional(),
});

export const getPolicy = {
  name: "elasticsearch_autoscaling_get_policy",
  description:
    "Get an autoscaling policy from Elasticsearch. Best for policy inspection, capacity planning, configuration review. Use when you need to retrieve autoscaling policies in Elasticsearch Service, ECE, or ECK environments. NOTE: Designed for indirect use.",
  inputSchema: getPolicySchema,
  operationType: OperationType.READ as const,
  handler: async (client: Client, args: z.infer<typeof getPolicySchema>) => {
    try {
      logger.debug("Getting autoscaling policy", {
        policyName: args.name,
        masterTimeout: args.masterTimeout,
      });

      const result = await client.autoscaling.getAutoscalingPolicy(
        {
          name: args.name,
          master_timeout: args.masterTimeout,
        },
        {
          opaqueId: "elasticsearch_autoscaling_get_policy",
        },
      );

      logger.debug("Autoscaling policy retrieved successfully", {
        policyName: args.name,
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
      logger.error("Failed to get autoscaling policy", {
        error: error instanceof Error ? error.message : String(error),
        policyName: args.name,
      });

      if (error instanceof Error && error.message.includes("not found")) {
        throw new McpError(ErrorCode.InvalidRequest, `Autoscaling policy not found: ${args.name}`);
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get autoscaling policy: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

// ============================================================================
// PUT AUTOSCALING POLICY
// ============================================================================

const putPolicySchema = z.object({
  name: z.string().min(1, "Policy name cannot be empty"),
  policy: z.any(),
  masterTimeout: z.string().optional(),
  timeout: z.string().optional(),
});

const putPolicyImpl = async (client: Client, args: z.infer<typeof putPolicySchema>) => {
  try {
    logger.debug("Creating/updating autoscaling policy", {
      policyName: args.name,
      masterTimeout: args.masterTimeout,
      timeout: args.timeout,
    });

    const result = await client.autoscaling.putAutoscalingPolicy({
      name: args.name,
      policy: args.policy,
      master_timeout: args.masterTimeout,
      timeout: args.timeout,
    });

    logger.info("Autoscaling policy created/updated successfully", {
      policyName: args.name,
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
    logger.error("Failed to create/update autoscaling policy", {
      error: error instanceof Error ? error.message : String(error),
      policyName: args.name,
    });

    if (error instanceof Error && error.message.includes("validation")) {
      throw new McpError(ErrorCode.InvalidRequest, `Invalid autoscaling policy configuration: ${error.message}`);
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Failed to create/update autoscaling policy: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const putPolicy = {
  name: "elasticsearch_autoscaling_put_policy",
  description:
    "Create or update an autoscaling policy in Elasticsearch. Best for capacity management, resource automation, cluster scaling. Use when you need to define autoscaling policies for Elasticsearch Service, ECE, or ECK environments. NOTE: Designed for indirect use.",
  inputSchema: putPolicySchema,
  operationType: OperationType.WRITE as const,
  handler: withReadOnlyCheck("elasticsearch_autoscaling_put_policy", putPolicyImpl, OperationType.WRITE),
};

// ============================================================================
// DELETE AUTOSCALING POLICY
// ============================================================================

const deletePolicySchema = z.object({
  name: z.string().min(1, "Policy name cannot be empty"),
  masterTimeout: z.string().optional(),
  timeout: z.string().optional(),
});

const deletePolicyImpl = async (client: Client, args: z.infer<typeof deletePolicySchema>) => {
  try {
    logger.debug("Deleting autoscaling policy", {
      policyName: args.name,
      masterTimeout: args.masterTimeout,
      timeout: args.timeout,
    });

    const result = await client.autoscaling.deleteAutoscalingPolicy(
      {
        name: args.name,
        master_timeout: args.masterTimeout,
        timeout: args.timeout,
      },
      {
        opaqueId: "elasticsearch_autoscaling_delete_policy",
      },
    );

    logger.info("Autoscaling policy deleted successfully", {
      policyName: args.name,
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
    logger.error("Failed to delete autoscaling policy", {
      error: error instanceof Error ? error.message : String(error),
      policyName: args.name,
    });

    if (error instanceof Error && error.message.includes("not found")) {
      throw new McpError(ErrorCode.InvalidRequest, `Autoscaling policy not found: ${args.name}`);
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Failed to delete autoscaling policy: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const deletePolicy = {
  name: "elasticsearch_autoscaling_delete_policy",
  description:
    "Delete an autoscaling policy in Elasticsearch. Best for policy cleanup, configuration management, resource optimization. Use when you need to remove autoscaling policies in Elasticsearch Service, ECE, or ECK environments. NOTE: Designed for indirect use.",
  inputSchema: deletePolicySchema,
  operationType: OperationType.DESTRUCTIVE as const,
  handler: withReadOnlyCheck("elasticsearch_autoscaling_delete_policy", deletePolicyImpl, OperationType.DESTRUCTIVE),
};

// Export all tools
export const autoscalingTools = [getCapacity, getPolicy, putPolicy, deletePolicy] as const;
