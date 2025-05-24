import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerMultiGetTool(server, esClient) {
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
    async (params) => {
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
        logger.error("Failed to perform multi-get:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 