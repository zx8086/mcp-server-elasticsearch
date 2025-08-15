/* src/tools/enrich/delete_policy.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema
const DeletePolicyParams = z.object({
  name: z.string().min(1, "Policy name is required"),
  masterTimeout: z.string().optional(),
});

type DeletePolicyParamsType = z.infer<typeof DeletePolicyParams>;

export const registerEnrichDeletePolicyTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  // Implementation function without read-only checks
  const deletePolicyImpl = async (
    params: DeletePolicyParamsType,
    _extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
      const result = await esClient.enrich.deletePolicy({
        name: params.name,
        master_timeout: params.masterTimeout,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to delete enrich policy:", {
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
    "elasticsearch_enrich_delete_policy",
    "Delete an enrich policy and its index in Elasticsearch. Best for policy cleanup, configuration management, removing unused enrichment. Use when you need to remove enrich policies and their associated indices from Elasticsearch.",
    {
      name: z.string().min(1, "Policy name is required"),
      masterTimeout: z.string().optional(),
    },
    withReadOnlyCheck("elasticsearch_enrich_delete_policy", deletePolicyImpl, OperationType.DELETE),
  );
};
