/* src/tools/alias/update_aliases.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerUpdateAliasesTool(server, esClient) {
  server.tool(
    "update_aliases",
    "Update aliases in Elasticsearch using the aliases API",
    {
      actions: z.array(z.record(z.any())),
      timeout: z.string().optional(),
      masterTimeout: z.string().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.indices.updateAliases({
          actions: params.actions,
          timeout: params.timeout,
          master_timeout: params.masterTimeout,
        }, {
          opaqueId: 'update_aliases'
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to update aliases:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 