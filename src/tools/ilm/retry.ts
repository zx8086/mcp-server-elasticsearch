/* src/tools/ilm/retry.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema
const RetryParams = z.object({
  index: z.string().min(1, "Index name cannot be empty"),
});

type RetryParamsType = z.infer<typeof RetryParams>;

export const registerRetryTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  // Implementation function without read-only checks
  const retryImpl = async (params: RetryParamsType, _extra: Record<string, unknown>): Promise<SearchResult> => {
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
    "elasticsearch_ilm_retry",
    "Retry Index Lifecycle Management policy execution for failed indices in Elasticsearch. Best for error recovery, policy troubleshooting, automated remediation. Use when you need to retry ILM policy execution for indices in ERROR state in Elasticsearch.",
    {
      index: z.string().min(1, "Index name cannot be empty"),
    },
    withReadOnlyCheck("elasticsearch_ilm_retry", retryImpl, OperationType.WRITE),
  );
};
