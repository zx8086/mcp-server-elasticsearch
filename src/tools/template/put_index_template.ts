/* src/tools/template/put_index_template.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import { type SearchResult, TextContent, type ToolRegistrationFunction } from "../types.js";

// Define the parameter schema type
const PutIndexTemplateParams = z.object({
  name: z.string().min(1, "Template name cannot be empty"),
  indexPatterns: z.array(z.string()).optional(),
  template: z.object({}).passthrough().optional(),
  composedOf: z.array(z.string()).optional(),
  priority: z.number().optional(),
  version: z.number().optional(),
  meta: z.object({}).passthrough().optional(),
  allowAutoCreate: booleanField().optional(),
  create: booleanField().optional(),
  masterTimeout: z.string().optional(),
});

type PutIndexTemplateParamsType = z.infer<typeof PutIndexTemplateParams>;
export const registerPutIndexTemplateTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_put_index_template",
    "Create or update an index template in Elasticsearch. Best for index standardization, mapping management, settings automation. Use when you need to define templates for automatic index configuration in Elasticsearch.",
    {
      name: z.string().min(1, "Template name cannot be empty"),
      indexPatterns: z.array(z.string()).optional(),
      template: z.object({}).passthrough().optional(),
      composedOf: z.array(z.string()).optional(),
      priority: z.number().optional(),
      version: z.number().optional(),
      meta: z.object({}).passthrough().optional(),
      allowAutoCreate: booleanField().optional(),
      create: booleanField().optional(),
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
            opaqueId: "elasticsearch_put_index_template",
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
