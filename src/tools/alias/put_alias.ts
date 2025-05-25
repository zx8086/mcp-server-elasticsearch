/* src/tools/alias/put_alias.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerPutAliasTool(server, esClient) {
  server.tool(
    "put_alias",
    "Add an alias to an index in Elasticsearch",
    {
      index: z.string().min(1, "Index is required"),
      name: z.string().min(1, "Alias name is required"),
      filter: z.record(z.any()).optional(),
      routing: z.string().optional(),
      isWriteIndex: z.boolean().optional(),
      isHidden: z.boolean().optional(),
      mustExist: z.boolean().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.indices.putAlias({
          index: params.index,
          name: params.name,
          filter: params.filter,
          routing: params.routing,
          is_write_index: params.isWriteIndex,
          is_hidden: params.isHidden,
          must_exist: params.mustExist,
        }, {
          opaqueId: 'put_alias'
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to put alias:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 