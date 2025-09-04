/* src/tools/template/search_template.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const searchTemplateSchema = {
  type: "object",
  properties: {
    index: {
      type: "string",
      description: "Index name or pattern to search"
    },
    id: {
      type: "string",
      description: "Template ID stored in Elasticsearch"
    },
    source: {
      type: "string",
      description: "Inline template source (Mustache template)"
    },
    params: {
      type: "object",
      description: "Parameters to substitute in the template",
      additionalProperties: true
    },
    explain: {
      type: "boolean",
      description: "Return detailed explanation of how each hit is scored"
    },
    profile: {
      type: "boolean",
      description: "Return timing information about the execution of individual components"
    },
    allowNoIndices: {
      type: "boolean",
      description: "Allow no indices when resolving wildcards"
    },
    expandWildcards: {
      type: "string",
      description: "Type of index wildcards to expand (open, closed, hidden, none, all)"
    },
    ignoreUnavailable: {
      type: "boolean",
      description: "Ignore unavailable indices"
    },
    ignoreThrottled: {
      type: "boolean",
      description: "Ignore throttled indices"
    },
    preference: {
      type: "string",
      description: "Specify the node or shard to perform the search on"
    },
    routing: {
      type: "string",
      description: "Routing value"
    },
    scroll: {
      type: "string",
      description: "Scroll timeout"
    },
    searchType: {
      type: "string",
      description: "Search operation type"
    },
    typedKeys: {
      type: "boolean",
      description: "Specify whether aggregation names should be prefixed by their type"
    }
  },
  additionalProperties: false
};

// Zod validator for runtime validation
const searchTemplateValidator = z.object({
  index: z.string().optional(),
  id: z.string().optional(),
  source: z.string().optional(),
  params: z.object({}).passthrough().optional(),
  explain: z.boolean().optional(),
  profile: z.boolean().optional(),
  allowNoIndices: z.boolean().optional(),
  expandWildcards: z.string().optional(),
  ignoreUnavailable: z.boolean().optional(),
  ignoreThrottled: z.boolean().optional(),
  preference: z.string().optional(),
  routing: z.string().optional(),
  scroll: z.string().optional(),
  searchType: z.string().optional(),
  typedKeys: z.boolean().optional(),
});

type SearchTemplateParams = z.infer<typeof searchTemplateValidator>;

// MCP error handling
function createSearchTemplateMcpError(
  error: Error | string,
  context: {
    type: 'validation' | 'execution' | 'template_not_found' | 'query_parsing' | 'index_not_found';
    details?: any;
  }
): McpError {
  const message = error instanceof Error ? error.message : error;
  
  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    template_not_found: ErrorCode.InvalidParams,
    query_parsing: ErrorCode.InvalidParams,
    index_not_found: ErrorCode.InvalidParams
  };
  
  return new McpError(
    errorCodeMap[context.type],
    `[elasticsearch_search_template] ${message}`,
    context.details
  );
}

// Tool implementation
export const registerSearchTemplateTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  
  const searchTemplateHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();
    
    try {
      // Validate parameters
      const params = searchTemplateValidator.parse(args);
      const { 
        index, 
        id, 
        source, 
        params: templateParams, 
        explain, 
        profile, 
        allowNoIndices, 
        expandWildcards, 
        ignoreUnavailable, 
        ignoreThrottled, 
        preference, 
        routing, 
        scroll, 
        searchType, 
        typedKeys 
      } = params;

      logger.debug("Executing search template", { index, id, hasSource: !!source });
      
      const result = await esClient.searchTemplate({
        index,
        id,
        source,
        params: templateParams,
        explain,
        profile,
        allow_no_indices: allowNoIndices,
        expand_wildcards: expandWildcards as any,
        ignore_unavailable: ignoreUnavailable,
        ignore_throttled: ignoreThrottled,
        preference,
        routing,
        scroll,
        search_type: searchType as any,
        typed_keys: typedKeys,
      }, {
        opaqueId: "elasticsearch_search_template",
      });

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow search template operation", { duration });
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
      };

    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createSearchTemplateMcpError(`Validation failed: ${error.errors.map(e => e.message).join(', ')}`, {
          type: 'validation',
          details: { validationErrors: error.errors, providedArgs: args }
        });
      }

      if (error instanceof Error) {
        if (error.message.includes('resource_not_found_exception') || error.message.includes('template_missing_exception')) {
          throw createSearchTemplateMcpError(`Template not found: ${args?.id || 'inline template'}`, {
            type: 'template_not_found',
            details: { originalError: error.message }
          });
        }

        if (error.message.includes('parsing_exception') || error.message.includes('query_shard_exception')) {
          throw createSearchTemplateMcpError(`Template parsing failed: ${error.message}`, {
            type: 'query_parsing',
            details: { template: args?.source, params: args?.params }
          });
        }

        if (error.message.includes('index_not_found_exception')) {
          throw createSearchTemplateMcpError(`Index not found: ${args?.index || '*'}`, {
            type: 'index_not_found',
            details: { originalError: error.message }
          });
        }
      }

      throw createSearchTemplateMcpError(error instanceof Error ? error.message : String(error), {
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
    "elasticsearch_search_template",
    "Execute a search template in Elasticsearch. Uses direct JSON Schema and standardized MCP error codes. Best for parameterized queries, reusable search patterns, query standardization. Use when you need to run templated searches with dynamic parameters in Elasticsearch. TIP: Use either 'id' for stored templates or 'source' for inline templates, provide 'params' for variable substitution.",
    searchTemplateSchema,
    searchTemplateHandler
  );
};