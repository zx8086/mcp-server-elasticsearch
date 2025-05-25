/* src/tools/bulk/multi_get.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";


// Define the parameter schema type
const MultiGetParams = z.object({

      docs: z.array(z.record(z.any())).optional(),
      index: z.string().optional(),
      preference: z.string().optional(),
      realtime: z.boolean().optional(),
      refresh: z.boolean().optional(),
      routing: z.string().optional(),
      source: z.boolean().optional(),
      sourceExcludes: z.array(z.string()).optional(),
      sourceIncludes: z.array(z.string()).optional(),
    
});

type MultiGetParamsType = z.infer<typeof MultiGetParams>;
export const registerMultiGetTool: ToolRegistrationFunction = (
  server: McpServer, 
  esClient: Client
) => {
  server.tool(
    "multi_get",
    "Get multiple documents from Elasticsearch in a single request",
    {
      docs: z.array(z.record(z.any())).optional(),
      index: z.string().optional(),
      preference: z.string().optional(),
      realtime: z.boolean().optional(),
      refresh: z.boolean().optional(),
      routing: z.string().optional(),
      source: z.boolean().optional(),
      sourceExcludes: z.array(z.string()).optional(),
      sourceIncludes: z.array(z.string()).optional(),
    },
    async (params: MultiGetParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.mget({
          docs: params.docs,
          index: params.index,
          preference: params.preference,
          realtime: params.realtime,
          refresh: params.refresh,
          routing: params.routing,
          _source: params.source,
          _source_excludes: params.sourceExcludes,
          _source_includes: params.sourceIncludes,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to perform multi-get:", {
          error: error instanceof Error ? error.message : String(error)
        });
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 