/* src/tools/template/put_index_template.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerPutIndexTemplateTool(server, esClient) {
  server.tool(
    "put_index_template",
    "Create or update an index template in Elasticsearch",
    {
      name: z.string().min(1, "Template name is required"),
      indexPatterns: z.array(z.string()).optional(),
      template: z.record(z.any()).optional(),
      composedOf: z.array(z.string()).optional(),
      priority: z.number().optional(),
      version: z.number().optional(),
      meta: z.record(z.any()).optional(),
      allowAutoCreate: z.boolean().optional(),
      create: z.boolean().optional(),
      masterTimeout: z.string().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.indices.putIndexTemplate({
          name: params.name,
          index_patterns: params.indexPatterns,
          template: params.template,
          composed_of: params.composedOf,
          priority: params.priority,
          version: params.version,
          _meta: params.meta,
          allow_auto_create: params.allowAutoCreate,
          create: params.create,
          master_timeout: params.masterTimeout,
        }, {
          opaqueId: 'put_index_template'
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to put index template:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 