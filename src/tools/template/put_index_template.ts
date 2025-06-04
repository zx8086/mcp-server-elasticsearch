/* src/tools/template/put_index_template.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema type
const PutIndexTemplateParams = z.object({
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
});

type PutIndexTemplateParamsType = z.infer<typeof PutIndexTemplateParams>;
export const registerPutIndexTemplateTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
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
    async (params: PutIndexTemplateParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.putIndexTemplate(
          {
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
          },
          {
            opaqueId: "put_index_template",
          },
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to put index template:", {
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
