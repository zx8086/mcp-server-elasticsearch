/* src/tools/autoscaling/put_policy.ts */

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
const PutAutoscalingPolicyParams = z.object({
  name: z.string().min(1, "Policy name is required"),
  policy: z.object({
    roles: z.array(z.string()),
    deciders: z.record(z.any())
  }),
  masterTimeout: z.string().optional(),
  timeout: z.string().optional(),
});

type PutAutoscalingPolicyParamsType = z.infer<typeof PutAutoscalingPolicyParams>;

const putPolicySchema = {
  name: z.string().min(1, "Policy name is required"),
  policy: z.any(),
  masterTimeout: z.string().optional(),
  timeout: z.string().optional(),
} as const;

export const registerAutoscalingPutPolicyTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const putAutoscalingPolicyImpl = async (
    params: any,
    extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    const typedParams = params as PutAutoscalingPolicyParamsType;
    try {
      const result = await esClient.autoscaling.putAutoscalingPolicy({
        name: typedParams.name,
        policy: {
          roles: typedParams.policy.roles,
          deciders: typedParams.policy.deciders
        },
        master_timeout: typedParams.masterTimeout,
        timeout: typedParams.timeout,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to create/update autoscaling policy:", {
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
    "autoscaling_put_policy",
    "Create or update an autoscaling policy. NOTE: This feature is designed for indirect use by Elasticsearch Service, Elastic Cloud Enterprise, and Elastic Cloud on Kubernetes. Direct use is not supported.",
    putPolicySchema,
    withReadOnlyCheck(
      "autoscaling_put_policy",
      putAutoscalingPolicyImpl,
      OperationType.WRITE,
    ),
  );
};
