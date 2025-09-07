/* src/tools/core/list_indices.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { createPaginationHeader, paginateResults, responsePresets } from "../../utils/responseHandling.js";
import { createTextContent, createIndexMetadata } from "../../utils/mcpAnnotations.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const listIndicesSchema = {
  type: "object",
  properties: {
    indexPattern: {
      type: "string",
      description: "Index pattern to match. Use '*' for all indices. Supports wildcards like 'logs-*' or 'app-*'",
    },
    limit: {
      type: "number",
      minimum: 1,
      maximum: 1000,
      description: "Maximum number of indices to return (1-1000). Required for large clusters",
    },
    excludeSystemIndices: {
      type: "boolean",
      description: "Exclude system indices starting with '.'",
    },
    excludeDataStreams: {
      type: "boolean",
      description: "Exclude data stream backing indices",
    },
    sortBy: {
      type: "string",
      enum: ["name", "size", "docs", "creation"],
      description: "Sort order for results: 'name', 'size', 'docs', or 'creation'",
    },
    includeSize: {
      type: "boolean",
      description: "Include storage size and creation date information",
    },
  },
  additionalProperties: false,
};

// Zod validator for runtime validation
const listIndicesValidator = z.object({
  indexPattern: z.string().optional(),
  limit: z.number().min(1).max(1000).optional(),
  excludeSystemIndices: z.boolean().optional(),
  excludeDataStreams: z.boolean().optional(),
  sortBy: z.enum(["name", "size", "docs", "creation"]).optional(),
  includeSize: z.boolean().optional(),
});

type ListIndicesParams = z.infer<typeof listIndicesValidator>;

// MCP error handling

function createMcpError(
  error: Error | string,
  context: {
    toolName: string;
    type: "validation" | "execution" | "connection" | "not_found";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    connection: ErrorCode.InternalError,
    not_found: ErrorCode.InvalidRequest,
  };

  return new McpError(errorCodeMap[context.type], `[${context.toolName}] ${message}`, context.details);
}

// Tool implementation

export const registerListIndicesTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  // Tool handler
  const listIndicesHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = listIndicesValidator.parse(args);

      logger.debug("Listing indices", {
        pattern: params.indexPattern,
        limit: params.limit,
        filters: {
          excludeSystemIndices: params.excludeSystemIndices,
          excludeDataStreams: params.excludeDataStreams,
        },
      });

      // Build the cat indices request
      const catParams = {
        index: params.indexPattern,
        format: "json" as const,
        h: params.includeSize
          ? "index,health,status,docs.count,store.size,creation.date.string"
          : "index,health,status,docs.count",
      };

      const response = await esClient.cat.indices(catParams);

      // Apply filtering
      const filteredIndices = response.filter((index: any) => {
        if (params.excludeSystemIndices && index.index.startsWith(".")) {
          return false;
        }
        if (params.excludeDataStreams && index.index.includes(".ds-")) {
          return false;
        }
        return true;
      });

      // Sort indices
      filteredIndices.sort((a: any, b: any) => {
        switch (params.sortBy) {
          case "size": {
            const sizeA = Number.parseInt(a["store.size"]?.replace(/[^\d]/g, "") || "0");
            const sizeB = Number.parseInt(b["store.size"]?.replace(/[^\d]/g, "") || "0");
            return sizeB - sizeA; // Descending
          }
          case "docs": {
            const docsA = Number.parseInt(a["docs.count"] || "0");
            const docsB = Number.parseInt(b["docs.count"] || "0");
            return docsB - docsA; // Descending
          }
          case "creation": {
            const dateA = a["creation.date.string"] || "";
            const dateB = b["creation.date.string"] || "";
            return dateB.localeCompare(dateA); // Newest first
          }
          default:
            return a.index.localeCompare(b.index);
        }
      });

      // Apply pagination
      const { results: paginatedIndices, metadata } = paginateResults(filteredIndices, {
        limit: params.limit,
        defaultLimit: responsePresets.list.defaultLimit,
        maxLimit: responsePresets.list.maxLimit,
      });

      // Transform to consistent format
      const indicesInfo = paginatedIndices.map((index: any) => ({
        index: index.index,
        health: index.health,
        status: index.status,
        docsCount: index["docs.count"] || "0",
        ...(params.includeSize && {
          storeSize: index["store.size"] || "0b",
          creationDate: index["creation.date.string"] || "unknown",
        }),
      }));

      const summary = {
        total_found: filteredIndices.length,
        displayed: indicesInfo.length,
        limit_applied: params.limit,
        filters_applied: {
          excluded_system_indices: params.excludeSystemIndices,
          excluded_data_streams: params.excludeDataStreams,
        },
        sorted_by: params.sortBy,
      };

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow operation: elasticsearch_list_indices", { duration });
      }

      // Create enhanced content with metadata  
      const headerMessage = createPaginationHeader(metadata, "Indices");
      
      const indexMetadata = createIndexMetadata({
        executionTimeMs: Math.round(duration),
        index: params.indexPattern || "*",
        operation: "list_indices",
      });

      return {
        content: [
          createTextContent(headerMessage, indexMetadata),
          createTextContent(
            JSON.stringify(summary, null, 2),
            {
              operation: "indices_summary",
              totalResults: (indicesInfo as any[]).length,
              timestamp: new Date().toISOString(),
            }
          ),
          createTextContent(
            JSON.stringify(indicesInfo, null, 2),
            {
              operation: "indices_details",
              totalResults: (indicesInfo as any[]).length,
              returnedResults: metadata.returned,
              timestamp: new Date().toISOString(),
              audience: ["user"],
            }
          ),
        ],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          toolName: "elasticsearch_list_indices",
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      if (error instanceof Error && error.message.includes("index_not_found_exception")) {
        throw createMcpError(`No indices found matching pattern: ${args.indexPattern || "*"}`, {
          toolName: "elasticsearch_list_indices",
          type: "not_found",
          details: { pattern: args.indexPattern },
        });
      }

      throw createMcpError(error instanceof Error ? error.message : String(error), {
        toolName: "elasticsearch_list_indices",
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Tool registration - FIXED: Use Zod schema for proper MCP parameter handling
  server.tool(
    "elasticsearch_list_indices",
    "List indices with filtering. Uses Zod Schema for proper MCP parameter handling. TIP: Use this FIRST to check cluster size before other tools. Common patterns: {limit: 50, excludeSystemIndices: true} for overview, {indexPattern: 'logs-*', limit: 100} for specific indices.",
    {
      indexPattern: z.string().optional(),
      limit: z.number().min(1).max(1000).optional(),
      excludeSystemIndices: z.boolean().optional(),
      excludeDataStreams: z.boolean().optional(),
      sortBy: z.enum(["name", "size", "docs", "creation"]).optional(),
      includeSize: z.boolean().optional(),
    },
    withReadOnlyCheck("elasticsearch_list_indices", listIndicesHandler, OperationType.READ),
  );
};
