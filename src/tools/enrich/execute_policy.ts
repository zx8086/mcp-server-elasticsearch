/* src/tools/enrich/execute_policy.ts */

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
const ExecutePolicyParams = z.object({
  name: z.string().min(1, "Policy name is required"),
  masterTimeout: z.string().optional(),
  waitForCompletion: z.boolean().optional(),
});

type ExecutePolicyParamsType = z.infer<typeof ExecutePolicyParams>;

export const registerEnrichExecutePolicyTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const executePolicyImpl = async (
    params: ExecutePolicyParamsType,
    extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
      const result = await esClient.enrich.executePolicy({
        name: params.name,
        master_timeout: params.masterTimeout,
        wait_for_completion: params.waitForCompletion,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to execute enrich policy:", {
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
    "elasticsearch_enrich_execute_policy",
    "Execute Elasticsearch enrich policy to create the enrich index. Best for: policy activation, data preparation, enrichment setup. Use when you need to build the enrich index from source data for document enrichment in Elasticsearch.",
    {
      name: z.string().min(1, "Policy name is required"),
      masterTimeout: z.string().optional(),
      waitForCompletion: z.boolean().optional(),
    },
    withReadOnlyCheck(
      "enrich_execute_policy",
      executePolicyImpl,
      OperationType.WRITE,
    ),
  );
};
