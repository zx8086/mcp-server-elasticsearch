/* src/tools/ilm/retry.ts */

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
const RetryParams = z.object({
  index: z.string().min(1, "Index name is required"),
});

type RetryParamsType = z.infer<typeof RetryParams>;

export const registerRetryTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const retryImpl = async (
    params: RetryParamsType,
    extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
      const result = await esClient.ilm.retry({
        index: params.index,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to retry lifecycle policy:", {
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
    "ilm_retry",
    "Retry running the lifecycle policy for an index that is in the ERROR step. The API sets the policy back to the step where the error occurred and runs the step. Use the explain lifecycle state API to determine whether an index is in the ERROR step.",
    {
      index: z.string().min(1, "Index name is required"),
    },
    withReadOnlyCheck(
      "ilm_retry",
      retryImpl,
      OperationType.WRITE,
    ),
  );
};
