/* src/tools/bulk/multi_get.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import { type SearchResult, TextContent, type ToolRegistrationFunction } from "../types.js";

// Define the parameter schema type
const MultiGetParams = z.object({
  docs: z
    .array(
      z.object({
        _id: z.string(),
        _index: z.string().optional(),
        _source: z.union([booleanField(), z.array(z.string())]).optional(),
        routing: z.string().optional(),
        stored_fields: z.array(z.string()).optional(),
        version: z.number().optional(),
        version_type: z.enum(["internal", "external", "external_gte", "force"]).optional(),
      }),
    )
    .optional(),
  index: z.string().optional(),
  preference: z.string().optional(),
  realtime: booleanField().optional(),
  refresh: booleanField().optional(),
  routing: z.string().optional(),
  _source: booleanField().optional(),
  _source_excludes: z.array(z.string()).optional(),
  _source_includes: z.array(z.string()).optional(),
});

type MultiGetParamsType = z.infer<typeof MultiGetParams>;
export const registerMultiGetTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_multi_get",
    "Get multiple documents from Elasticsearch in a single request. Best for batch document retrieval, efficient bulk operations, reducing network overhead. Use when you need to fetch multiple JSON documents by their IDs from Elasticsearch indices in one operation.",
    MultiGetParams.shape,
    async (params: MultiGetParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.mget({
          docs: params.docs,
          index: params.index,
          preference: params.preference,
          realtime: params.realtime,
          refresh: params.refresh,
          routing: params.routing,
          _source: params._source,
          _source_excludes: params._source_excludes,
          _source_includes: params._source_includes,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to perform multi-get:", {
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
