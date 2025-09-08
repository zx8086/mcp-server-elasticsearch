/* src/tools/template/get_index_template_improved.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import {
  createPaginationHeader,
  paginateResults,
  responsePresets,
  truncateResponse,
} from "../../utils/responseHandling.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

interface TemplateSummary {
  name: string;
  index_patterns: string[];
  priority: number;
  version?: number;
  composed_of?: string[];
  data_stream?: boolean;
  template?: {
    settings?: boolean;
    mappings?: boolean;
    aliases?: boolean;
  };
  _meta?: any;
}

// Direct JSON Schema definition
const getIndexTemplateSchema = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Template name pattern to filter by (supports wildcards)",
    },
    flatSettings: {
      type: "boolean",
      description: "Return settings in flat format",
    },
    masterTimeout: {
      type: "string",
      description: "Timeout for master node operations",
    },
    local: {
      type: "boolean",
      description: "Retrieve information from local node only",
    },
    limit: {
      oneOf: [
        { type: "number", minimum: 1, maximum: 50 },
        { type: "string", pattern: "^\\d+$" },
      ],
      description: "Maximum number of templates to return. Range: 1-50",
    },
    summary: {
      type: "boolean",
      description: "Return summarized template information instead of full details",
    },
    includeComposed: {
      type: "boolean",
      description: "Include composed_of templates in the response",
    },
    sortBy: {
      type: "string",
      enum: ["name", "priority", "index_patterns", "version"],
      description: "Sort templates by specified field",
    },
  },
  additionalProperties: false,
};

// Zod validator for runtime validation
const getIndexTemplateValidator = z.object({
  name: z.string().optional(),
  flatSettings: z.boolean().optional(),
  masterTimeout: z.string().optional(),
  local: z.boolean().optional(),
  limit: z
    .union([
      z.number(),
      z
        .string()
        .regex(/^\d+$/)
        .transform((val) => Number.parseInt(val, 10)),
    ])
    .pipe(z.number().min(1).max(50))
    .optional(),
  summary: z.boolean().optional(),
  includeComposed: z.boolean().optional(),
  sortBy: z.enum(["name", "priority", "index_patterns", "version"]).optional(),
});

type GetIndexTemplateParams = z.infer<typeof getIndexTemplateValidator>;

// MCP error handling
function createTemplateMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "template_not_found" | "access_denied";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    template_not_found: ErrorCode.InvalidParams,
    access_denied: ErrorCode.InvalidParams,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_get_index_template] ${message}`, context.details);
}

// Tool implementation
export const registerGetIndexTemplateTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const getIndexTemplateHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = getIndexTemplateValidator.parse(args);
      const { name, flatSettings, masterTimeout, local, limit, summary, sortBy } = params;

      logger.debug("Getting index templates", { name, summary, limit });

      // Fetch templates from Elasticsearch
      const result = await esClient.indices.getIndexTemplate(
        {
          name,
          flat_settings: flatSettings,
          master_timeout: masterTimeout,
          local,
        },
        {
          opaqueId: "elasticsearch_get_index_template",
        },
      );

      // Transform templates into a more manageable format
      const templates: TemplateSummary[] = result.index_templates.map((template: any) => {
        const summary: TemplateSummary = {
          name: template.name,
          index_patterns: template.index_template.index_patterns || [],
          priority: template.index_template.priority || 0,
        };

        if (template.index_template.version) {
          summary.version = template.index_template.version;
        }

        if (template.index_template.composed_of) {
          summary.composed_of = template.index_template.composed_of;
        }

        if (template.index_template.data_stream) {
          summary.data_stream = true;
        }

        // Check what's included in the template
        if (template.index_template.template) {
          summary.template = {
            settings: !!template.index_template.template.settings,
            mappings: !!template.index_template.template.mappings,
            aliases: !!template.index_template.template.aliases,
          };
        }

        if (template.index_template._meta) {
          summary._meta = template.index_template._meta;
        }

        return summary;
      });

      // If a specific template was requested, filter results
      if (name && !name.includes("*")) {
        const filtered = templates.filter((t) => t.name === name);
        if (filtered.length > 0) {
          // Return just the specific template requested
          const template = result.index_templates.find((t: any) => t.name === name);
          return {
            content: [
              {
                type: "text",
                text: `## Index Template: ${name}\n\n\`\`\`json\n${JSON.stringify(template, null, 2)}\n\`\`\``,
              } as TextContent,
            ],
          };
        }
      }

      // Sort templates
      templates.sort((a, b) => {
        switch (sortBy) {
          case "priority":
            return b.priority - a.priority;
          case "index_patterns":
            return b.index_patterns.length - a.index_patterns.length;
          case "version":
            return (b.version || 0) - (a.version || 0);
          default:
            return a.name.localeCompare(b.name);
        }
      });

      // Apply pagination
      const { results: paginatedTemplates, metadata } = paginateResults(templates, {
        limit,
        defaultLimit: responsePresets.detail.defaultLimit,
        maxLimit: responsePresets.detail.maxLimit,
      });

      // Create response content
      const responseContent: string[] = [];

      // Add header with summary stats
      responseContent.push(createPaginationHeader(metadata, "Index Templates"));

      if (paginatedTemplates.length === 0) {
        responseContent.push("No index templates found matching the specified criteria.");
      } else if (summary) {
        // Summary mode - compact view
        for (const template of paginatedTemplates) {
          responseContent.push(`### ${template.name}`);
          responseContent.push(`- **Priority**: ${template.priority}`);

          if (template.version) {
            responseContent.push(`- **Version**: ${template.version}`);
          }

          responseContent.push(`- **Index Patterns**: ${template.index_patterns.length}`);
          if (template.index_patterns.length <= 5) {
            for (const pattern of template.index_patterns) {
              responseContent.push(`  - ${pattern}`);
            }
          } else {
            for (const pattern of template.index_patterns.slice(0, 3)) {
              responseContent.push(`  - ${pattern}`);
            }
            responseContent.push(`  - ... and ${template.index_patterns.length - 3} more`);
          }

          if (template.composed_of && template.composed_of.length > 0) {
            responseContent.push(`- **Composed Of**: ${template.composed_of.join(", ")}`);
          }

          if (template.data_stream) {
            responseContent.push("- **Data Stream**: Enabled");
          }

          if (template.template) {
            const includes = [];
            if (template.template.settings) includes.push("settings");
            if (template.template.mappings) includes.push("mappings");
            if (template.template.aliases) includes.push("aliases");
            if (includes.length > 0) {
              responseContent.push(`- **Includes**: ${includes.join(", ")}`);
            }
          }

          if (template._meta?.description) {
            responseContent.push(`- **Description**: ${template._meta.description}`);
          }

          responseContent.push("");
        }

        // Add template statistics if there are many templates
        if (metadata.total > 5) {
          responseContent.push("\n## Template Statistics");

          const dataStreamTemplates = templates.filter((t) => t.data_stream).length;
          const composableTemplates = templates.filter((t) => t.composed_of && t.composed_of.length > 0).length;
          const avgPatterns = (
            templates.reduce((sum, t) => sum + t.index_patterns.length, 0) / templates.length
          ).toFixed(1);

          responseContent.push(`- **Total Templates**: ${metadata.total}`);
          responseContent.push(`- **Data Stream Templates**: ${dataStreamTemplates}`);
          responseContent.push(`- **Composable Templates**: ${composableTemplates}`);
          responseContent.push(`- **Average Patterns per Template**: ${avgPatterns}`);

          // Priority distribution
          const priorityGroups = templates.reduce(
            (acc, t) => {
              const range = t.priority >= 100 ? "100+" : t.priority >= 50 ? "50-99" : t.priority >= 1 ? "1-49" : "0";
              acc[range] = (acc[range] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>,
          );

          responseContent.push("- **Priority Distribution**:");
          for (const [range, count] of Object.entries(priorityGroups).sort(([a], [b]) => b.localeCompare(a))) {
            responseContent.push(`  - ${range}: ${count} templates`);
          }
        }
      } else {
        // Detailed mode - full template information
        responseContent.push("## Template Details\n");
        responseContent.push("```json");

        const detailedResults = paginatedTemplates.map((template) => {
          const fullTemplate = result.index_templates.find((t: any) => t.name === template.name);
          return fullTemplate;
        });

        responseContent.push(JSON.stringify(detailedResults, null, 2));
        responseContent.push("```");
      }

      // Truncate response if needed
      const fullResponse = responseContent.join("\n");
      const { content: finalContent, truncated } = truncateResponse(fullResponse, {
        maxTokens: responsePresets.detail.maxTokens,
      });

      if (truncated) {
        logger.warn("Template response truncated due to size", {
          originalLength: fullResponse.length,
          truncatedLength: finalContent.length,
        });
      }

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow template operation", { duration });
      }

      return {
        content: [{ type: "text", text: finalContent } as TextContent],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createTemplateMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      if (error instanceof Error) {
        if (
          error.message.includes("index_template_missing_exception") ||
          error.message.includes("resource_not_found_exception")
        ) {
          throw createTemplateMcpError(`Template not found: ${args?.name || "*"}`, {
            type: "template_not_found",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("security_exception") || error.message.includes("unauthorized")) {
          throw createTemplateMcpError("Access denied to template operations", {
            type: "access_denied",
            details: { originalError: error.message },
          });
        }
      }

      throw createTemplateMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Tool registration - READ operation
  // Tool registration using modern registerTool method

  server.registerTool(

    "elasticsearch_get_index_template",

    {

      title: "Get Index Template",

      description: "Get index templates from Elasticsearch with pagination and filtering. Uses direct JSON Schema and standardized MCP error codes. Best for template management, configuration review, index pattern analysis. Returns summarized or detailed template information with configurable limits to handle large responses. TIP: Use 'summary: true' for overview, 'name' with wildcards for filtering.",

      inputSchema: getIndexTemplateSchema,

    },

    getIndexTemplateHandler,

  );
};
