/* src/tools/ilm/put_lifecycle.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { withReadOnlyCheck, OperationType } from "../../utils/readOnlyMode.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import type {
  ToolRegistrationFunction,
  SearchResult,
  TextContent,
} from "../types.js";

// Define the parameter schema
const PutLifecycleParams = z.object({
  policy: z.string().min(1, "Policy identifier is required"),
  body: z.record(z.any()).optional(),
  masterTimeout: z.string().optional(),
  timeout: z.string().optional(),
});

type PutLifecycleParamsType = z.infer<typeof PutLifecycleParams>;

export const registerPutLifecycleTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const putLifecycleImpl = async (
    params: PutLifecycleParamsType,
    extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
      const result = await esClient.ilm.putLifecycle({
        name: params.policy,
        body: params.body,
        master_timeout: params.masterTimeout,
        timeout: params.timeout,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
      };
    } catch (error) {
      logger.error("Failed to put lifecycle policy:", {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          } as TextContent,
        ],
      };
    }
  };

  server.tool(
    "elasticsearch_ilm_put_lifecycle",
    "Create or update an Index Lifecycle Management policy in Elasticsearch. Best for: data lifecycle automation, policy configuration, index management. Use when you need to define automated transitions through hot, warm, cold, and delete phases in Elasticsearch.",
    {
      policy: z.string().min(1, "Policy identifier is required"),
      body: z.record(z.any()).optional(),
      masterTimeout: z.string().optional(),
      timeout: z.string().optional(),
    },
    withReadOnlyCheck(
      "elasticsearch_ilm_put_lifecycle",
      putLifecycleImpl,
      OperationType.WRITE,
    ),
  );
};
