/* src/tools/ilm/explain_lifecycle.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { type SearchResult, TextContent, type ToolRegistrationFunction } from "../types.js";

// Define the parameter schema
const ExplainLifecycleParams = z.object({
  index: z.string().min(1, "Index is required"),
  onlyErrors: z.boolean().optional(),
  onlyManaged: z.boolean().optional(),
  masterTimeout: z.string().optional(),
});

type ExplainLifecycleParamsType = z.infer<typeof ExplainLifecycleParams>;

export const registerExplainLifecycleTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_ilm_explain_lifecycle",
    "Explain Index Lifecycle Management status for indices in Elasticsearch. Best for lifecycle monitoring, troubleshooting, policy analysis. Use when you need to understand ILM execution status and phase transitions for Elasticsearch indices.",
    {
      index: z.string().min(1, "Index is required"),
      onlyErrors: z.boolean().optional(),
      onlyManaged: z.boolean().optional(),
      masterTimeout: z.string().optional(),
    },
    async (params: ExplainLifecycleParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.ilm.explainLifecycle(
          {
            index: params.index,
            only_errors: params.onlyErrors,
            only_managed: params.onlyManaged,
            master_timeout: params.masterTimeout,
          },
          {
            opaqueId: "elasticsearch_ilm_explain_lifecycle",
          },
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to explain lifecycle:", {
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
