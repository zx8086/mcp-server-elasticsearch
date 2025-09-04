/* src/tools/template/get_index_template_old.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const getIndexTemplateSchema = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Template name pattern to filter by (supports wildcards)"
    },
    flatSettings: {
      type: "boolean",
      description: "Return settings in flat format"
    },
    masterTimeout: {
      type: "string",
      description: "Timeout for master node operations"
    },
    local: {
      type: "boolean",
      description: "Retrieve information from local node only"
    }
  },
  additionalProperties: false
};

// Zod validator for runtime validation
const getIndexTemplateValidator = z.object({
  name: z.string().optional(),
  flatSettings: z.boolean().optional(),
  masterTimeout: z.string().optional(),
  local: z.boolean().optional(),
});

type GetIndexTemplateParams = z.infer<typeof getIndexTemplateValidator>;

// MCP error handling
function createTemplateMcpError(
  error: Error | string,
  context: {
    type: 'validation' | 'execution' | 'template_not_found' | 'access_denied';
    details?: any;
  }
): McpError {
  const message = error instanceof Error ? error.message : error;
  
  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    template_not_found: ErrorCode.InvalidParams,
    access_denied: ErrorCode.InvalidParams
  };
  
  return new McpError(
    errorCodeMap[context.type],
    `[elasticsearch_get_index_template_old] ${message}`,
    context.details
  );
}

// Tool implementation
export const registerGetIndexTemplateTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  
  const getIndexTemplateHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();
    
    try {
      // Validate parameters
      const params = getIndexTemplateValidator.parse(args);
      const { name, flatSettings, masterTimeout, local } = params;

      logger.debug("Getting index template (legacy)", { name, flatSettings, local });
      
      const result = await esClient.indices.getIndexTemplate(
        {
          name,
          flat_settings: flatSettings,
          master_timeout: masterTimeout,
          local,
        },
        {
          opaqueId: "elasticsearch_get_index_template_old",
        }
      );

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow template operation", { duration });
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
      };

    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createTemplateMcpError(`Validation failed: ${error.errors.map(e => e.message).join(', ')}`, {
          type: 'validation',
          details: { validationErrors: error.errors, providedArgs: args }
        });
      }

      if (error instanceof Error) {
        if (error.message.includes('index_template_missing_exception') || error.message.includes('resource_not_found_exception')) {
          throw createTemplateMcpError(`Template not found: ${args?.name || '*'}`, {
            type: 'template_not_found',
            details: { originalError: error.message }
          });
        }

        if (error.message.includes('security_exception') || error.message.includes('unauthorized')) {
          throw createTemplateMcpError(`Access denied to template operations`, {
            type: 'access_denied',
            details: { originalError: error.message }
          });
        }
      }

      throw createTemplateMcpError(error instanceof Error ? error.message : String(error), {
        type: 'execution',
        details: { 
          duration: performance.now() - perfStart,
          args 
        }
      });
    }
  };

  // Tool registration - READ operation
  server.tool(
    "elasticsearch_get_index_template_old",
    "Get index templates from Elasticsearch (legacy version). Uses direct JSON Schema and standardized MCP error codes. Best for template management, configuration review, index pattern analysis. Use when you need to inspect index template definitions, mappings, and settings in Elasticsearch.",
    getIndexTemplateSchema,
    getIndexTemplateHandler
  );
};