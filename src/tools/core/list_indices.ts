/* src/tools/core/list_indices.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { type SearchResult, TextContent, type ToolRegistrationFunction } from "../types.js";

// Define the parameter schema
const ListIndicesParams = z.object({
  indexPattern: z.string().min(1, "Index pattern is required"),
  limit: z.number().min(1).max(1000).default(50),
  excludeSystemIndices: z.boolean().default(true),
  excludeDataStreams: z.boolean().default(false),
  sortBy: z.enum(["name", "size", "docs", "creation"]).default("name"),
  includeSize: z.boolean().default(false),
});

type ListIndicesParamsType = z.infer<typeof ListIndicesParams>;

const listIndicesSchema = {
  indexPattern: z.string().min(1, "Index pattern is required"),
  limit: z.number().min(1).max(1000).default(50),
  excludeSystemIndices: z.boolean().default(true),
  excludeDataStreams: z.boolean().default(false),
  sortBy: z.enum(["name", "size", "docs", "creation"]).default("name"),
  includeSize: z.boolean().default(false),
} as const;

export const registerListIndicesTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const listIndicesImpl = async (params: any, _extra: Record<string, unknown>): Promise<SearchResult> => {
    const { indexPattern, limit, excludeSystemIndices, excludeDataStreams, sortBy, includeSize } =
      params as ListIndicesParamsType;

    logger.debug("Listing indices with smart filtering", {
      pattern: indexPattern,
      limit,
      excludeSystemIndices,
      excludeDataStreams,
      sortBy,
    });

    try {
      // Build the cat indices request
      const catParams = {
        index: indexPattern,
        format: "json" as const,
        h: includeSize
          ? "index,health,status,docs.count,store.size,creation.date.string"
          : "index,health,status,docs.count",
      };

      const response = await esClient.cat.indices(catParams);

      logger.debug("Raw indices response", { count: response.length });

      // Apply filtering
      let filteredIndices = response.filter((index: any) => {
        // Exclude system indices if requested
        if (excludeSystemIndices && index.index.startsWith(".")) {
          return false;
        }

        // Exclude data stream backing indices if requested
        if (excludeDataStreams && index.index.includes(".ds-")) {
          return false;
        }

        return true;
      });

      // Sort indices
      filteredIndices.sort((a: any, b: any) => {
        switch (sortBy) {
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

      // Apply limit
      const totalFound = filteredIndices.length;
      filteredIndices = filteredIndices.slice(0, limit);

      // Transform to consistent format
      const indicesInfo = filteredIndices.map((index: any) => {
        const info: any = {
          index: index.index,
          health: index.health,
          status: index.status,
          docsCount: index["docs.count"] || "0",
        };

        if (includeSize) {
          info.storeSize = index["store.size"] || "0b";
          info.creationDate = index["creation.date.string"] || "unknown";
        }

        return info;
      });

      // Group similar indices for summary
      const indexGroups = new Map<string, number>();
      for (const index of filteredIndices) {
        const baseName = index.index.replace(/[-_]\d{4}\.\d{2}\.\d{2}.*$/, "").replace(/[-_]\d+$/, "");
        indexGroups.set(baseName, (indexGroups.get(baseName) || 0) + 1);
      }

      const summary = {
        total_found: totalFound,
        displayed: indicesInfo.length,
        limit_applied: limit,
        filters_applied: {
          excluded_system_indices: excludeSystemIndices,
          excluded_data_streams: excludeDataStreams,
        },
        sorted_by: sortBy,
        index_groups: Object.fromEntries(
          Array.from(indexGroups.entries())
            .filter(([_, count]) => count > 1)
            .sort(([_, a], [__, b]) => b - a)
            .slice(0, 10), // Top 10 groups
        ),
      };

      const warningMessage =
        totalFound > limit
          ? `⚠️ Found ${totalFound} indices, showing first ${limit}. Use more specific patterns or increase limit.`
          : `Found ${totalFound} indices matching pattern.`;

      return {
        content: [
          { type: "text", text: warningMessage },
          { type: "text", text: JSON.stringify(summary, null, 2) },
          { type: "text", text: JSON.stringify(indicesInfo, null, 2) },
        ],
      };
    } catch (error) {
      logger.error("Failed to list indices:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return {
        content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      };
    }
  };

  server.tool(
    "elasticsearch_list_indices",
    "List Elasticsearch indices with smart filtering and pattern matching. Best for index discovery, monitoring index health, analyzing index structure. Use when you need to explore available indices in Elasticsearch clusters with intelligent filtering to prevent overwhelming responses.",
    listIndicesSchema,
    withReadOnlyCheck("elasticsearch_list_indices", listIndicesImpl, OperationType.READ),
  );
};
