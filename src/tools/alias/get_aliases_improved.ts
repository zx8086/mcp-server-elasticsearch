/* src/tools/alias/get_aliases_improved.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { type SearchResult, type ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const getAliasesSchema = {
  type: "object",
  properties: {
    index: {
      type: "string",
      description: "Index pattern to filter by. Use '*' for all indices. Supports wildcards like 'logs-*'"
    },
    name: {
      type: "string", 
      description: "Alias name pattern to filter by. Supports wildcards"
    },
    ignoreUnavailable: {
      type: "boolean",
      description: "Whether to ignore if a specified index name doesn't exist (default: false)"
    },
    allowNoIndices: {
      type: "boolean",
      description: "Whether to ignore if a wildcard pattern matches no indices (default: true)"
    },
    expandWildcards: {
      type: "string",
      enum: ["all", "open", "closed", "hidden", "none"],
      description: "Whether to expand wildcard expressions to concrete indices"
    },
    limit: {
      type: "number",
      minimum: 1,
      maximum: 100,
      description: "Maximum number of aliases to return. Range: 1-100"
    },
    summary: {
      type: "boolean",
      description: "Return summarized alias information instead of full details"
    },
    sortBy: {
      type: "string",
      enum: ["name", "index_count", "alias_name"],
      description: "Sort aliases by specified field"
    }
  },
  additionalProperties: false
};

// Zod validator for runtime validation
const getAliasesValidator = z.object({
  index: z.string().optional(),
  name: z.string().optional(),
  ignoreUnavailable: z.boolean().optional(),
  allowNoIndices: z.boolean().optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
  limit: z.number().min(1).max(100).optional(),
  summary: z.boolean().optional(),
  sortBy: z.enum(["name", "index_count", "alias_name"]).optional()
});

type GetAliasesParams = z.infer<typeof getAliasesValidator>;

interface AliasSummary {
  alias: string;
  indices: string[];
  index_count: number;
  has_filter: boolean;
  is_write_index?: boolean;
  routing?: string;
}

// MCP error handling
function createMcpError(
  error: Error | string,
  context: {
    toolName: string;
    type: 'validation' | 'execution' | 'connection' | 'alias_not_found';
    details?: any;
  }
): McpError {
  const message = error instanceof Error ? error.message : error;
  
  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    connection: ErrorCode.InternalError,
    alias_not_found: ErrorCode.InvalidRequest
  };
  
  return new McpError(
    errorCodeMap[context.type],
    `[${context.toolName}] ${message}`,
    context.details
  );
}

// Tool implementation
export const registerGetAliasesTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  
  // Tool handler
  const getAliasesHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();
    
    try {
      // Validate parameters
      const params = getAliasesValidator.parse(args);
      
      logger.debug("Getting aliases with improved processing", {
        index: params.index,
        name: params.name,
        limit: params.limit,
        summary: params.summary,
        sortBy: params.sortBy,
        options: {
          ignoreUnavailable: params.ignoreUnavailable,
          allowNoIndices: params.allowNoIndices,
          expandWildcards: params.expandWildcards
        }
      });

      // Fetch aliases from Elasticsearch
      const result = await esClient.indices.getAlias(
        {
          index: params.index,
          name: params.name,
          ignore_unavailable: params.ignoreUnavailable,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
        },
        {
          opaqueId: "elasticsearch_get_aliases",
        },
      );

      // Transform the response into a more manageable format
      const aliasMap = new Map<string, AliasSummary>();

      // Process all indices and their aliases
      for (const [indexName, indexData] of Object.entries(result)) {
        const aliases = indexData.aliases || {};

        for (const [aliasName, aliasConfig] of Object.entries(aliases)) {
          if (!aliasMap.has(aliasName)) {
            aliasMap.set(aliasName, {
              alias: aliasName,
              indices: [],
              index_count: 0,
              has_filter: false,
              is_write_index: false,
            });
          }

          const aliasSummary = aliasMap.get(aliasName)!;
          aliasSummary.indices.push(indexName);
          aliasSummary.index_count++;

          if (aliasConfig.filter) {
            aliasSummary.has_filter = true;
          }

          if (aliasConfig.is_write_index) {
            aliasSummary.is_write_index = true;
          }

          if (aliasConfig.routing) {
            aliasSummary.routing = aliasConfig.routing;
          }
        }
      }

      // Convert to array and sort
      let aliasArray = Array.from(aliasMap.values());

      // Sort aliases
      aliasArray.sort((a, b) => {
        switch (params.sortBy) {
          case "index_count":
            return b.index_count - a.index_count;
          case "alias_name":
            return a.alias.localeCompare(b.alias);
          default:
            return a.alias.localeCompare(b.alias);
        }
      });

      // Apply pagination
      const totalFound = aliasArray.length;
      const limit = params.limit || 25; // Default limit
      if (limit && totalFound > limit) {
        aliasArray = aliasArray.slice(0, limit);
      }

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn(`Slow operation: elasticsearch_get_aliases`, { duration });
      }

      // Create response content
      const responseContent: string[] = [];

      // Add header with summary stats
      const headerMessage = totalFound > limit
        ? `⚠️ Found ${totalFound} aliases, showing first ${limit}. Use limit parameter to see more.`
        : `Found ${totalFound} aliases`;

      responseContent.push(headerMessage);

      if (aliasArray.length === 0) {
        responseContent.push("No aliases found matching the specified criteria.");
      } else if (params.summary) {
        // Summary mode - compact view
        responseContent.push("\n## Alias Summary\n");

        for (const alias of aliasArray) {
          responseContent.push(`### ${alias.alias}`);
          responseContent.push(`- **Indices**: ${alias.index_count}`);

          if (alias.index_count <= 5) {
            for (const idx of alias.indices) {
              responseContent.push(`  - ${idx}`);
            }
          } else {
            for (const idx of alias.indices.slice(0, 3)) {
              responseContent.push(`  - ${idx}`);
            }
            responseContent.push(`  - ... and ${alias.index_count - 3} more`);
          }

          if (alias.has_filter) {
            responseContent.push("- **Has Filter**: Yes");
          }

          if (alias.is_write_index) {
            responseContent.push("- **Write Index**: Yes");
          }

          if (alias.routing) {
            responseContent.push(`- **Routing**: ${alias.routing}`);
          }

          responseContent.push("");
        }

        // Add distribution summary if there are many aliases
        if (totalFound > 10) {
          responseContent.push("\n## Statistics");
          const totalIndices = aliasArray.reduce((sum, alias) => sum + alias.index_count, 0);
          const avgIndicesPerAlias = (totalIndices / aliasArray.length).toFixed(1);

          responseContent.push(`- **Total Aliases**: ${totalFound}`);
          responseContent.push(`- **Total Index Mappings**: ${totalIndices}`);
          responseContent.push(`- **Average Indices per Alias**: ${avgIndicesPerAlias}`);

          const writeAliases = aliasArray.filter((a) => a.is_write_index).length;
          if (writeAliases > 0) {
            responseContent.push(`- **Write Aliases**: ${writeAliases}`);
          }

          const filteredAliases = aliasArray.filter((a) => a.has_filter).length;
          if (filteredAliases > 0) {
            responseContent.push(`- **Filtered Aliases**: ${filteredAliases}`);
          }
        }
      } else {
        // Detailed mode - full alias information
        responseContent.push("\n## Alias Details\n");
        
        const detailedResults: any[] = [];

        for (const alias of aliasArray) {
          // Get the full alias configuration from the original result
          const aliasDetail: any = {
            name: alias.alias,
            indices: {},
          };

          for (const indexName of alias.indices) {
            if (result[indexName]?.aliases[alias.alias]) {
              aliasDetail.indices[indexName] = result[indexName].aliases[alias.alias];
            }
          }

          detailedResults.push(aliasDetail);
        }

        responseContent.push("```json");
        responseContent.push(JSON.stringify(detailedResults, null, 2));
        responseContent.push("```");
      }

      return {
        content: [
          { type: "text", text: responseContent.join("\n") }
        ],
      };

    } catch (error) {
      // Error handling with specific alias error types
      if (error instanceof z.ZodError) {
        throw createMcpError(`Validation failed: ${error.errors.map(e => e.message).join(', ')}`, {
          toolName: 'elasticsearch_get_aliases',
          type: 'validation',
          details: { validationErrors: error.errors, providedArgs: args }
        });
      }

      if (error instanceof Error && error.message.includes('index_not_found_exception')) {
        throw createMcpError(`No indices found matching pattern: ${args.index || '*'}`, {
          toolName: 'elasticsearch_get_aliases', 
          type: 'alias_not_found',
          details: { indexPattern: args.index, aliasName: args.name }
        });
      }

      if (error instanceof Error && error.message.includes('alias_not_found_exception')) {
        throw createMcpError(`No aliases found matching pattern: ${args.name || '*'}`, {
          toolName: 'elasticsearch_get_aliases',
          type: 'alias_not_found', 
          details: { indexPattern: args.index, aliasName: args.name }
        });
      }

      throw createMcpError(error instanceof Error ? error.message : String(error), {
        toolName: 'elasticsearch_get_aliases',
        type: 'execution',
        details: { 
          duration: performance.now() - perfStart,
          args 
        }
      });
    }
  };

  // Tool registration
  server.tool(
    "elasticsearch_get_aliases",
    "Get index aliases from Elasticsearch with pagination and filtering. Best for alias discovery, configuration review, index mapping analysis. Returns summarized or detailed alias information with configurable limits to handle large responses. TIP: Use {summary: true, limit: 50} for overview, {sortBy: 'index_count'} to find aliases with most indices.",
    getAliasesSchema,
    withReadOnlyCheck("elasticsearch_get_aliases", getAliasesHandler, OperationType.READ)
  );
};