/* src/tools/core/list_indices_traced.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { registerTracedTool } from "../../utils/toolWrapper.js";
import { traceElasticsearchCall } from "../../utils/toolWrapper.js";

const _MAX_INDICES_WITHOUT_SUMMARY = 50;
const DEFAULT_LIMIT = 50;

export const registerListIndicesTracedTool = (server: McpServer, esClient: Client) => {
  const inputSchema = z.object({
    indexPattern: z
      .string()
      .trim()
      .min(1, "Index pattern is required")
      .describe("Index pattern to match (supports wildcards like logs-*, app-*)"),
    sortBy: z
      .enum(["name", "size", "docs", "creation"])
      .optional()
      .optional()
      .describe("Sort indices by name, size, document count, or creation date"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .optional()
      .describe("Maximum number of indices to return"),
    includeSize: booleanField().optional().describe("Include index size information (slower)"),
    excludeSystemIndices: booleanField().optional().describe("Exclude system indices (starting with .)"),
    excludeDataStreams: booleanField().optional().describe("Exclude data stream backing indices"),
  });

  registerTracedTool(server, esClient, {
    name: "elasticsearch_list_indices",
    description:
      "List Elasticsearch indices with smart filtering and pattern matching. Best for index discovery, monitoring index health, analyzing index structure. Use when you need to explore available indices in Elasticsearch clusters with intelligent filtering to prevent overwhelming responses.",
    inputSchema,
    operationType: "read",
    handler: async (esClient: Client, args: any) => {
      try {
        logger.debug("Listing indices", {
          pattern: args.indexPattern,
          sortBy: args.sortBy,
          limit: args.limit,
          includeSize: args.includeSize,
        });

        // Get indices using cat API for better performance
        const catIndicesResponse = await traceElasticsearchCall(
          "cat.indices",
          args.indexPattern,
          async () =>
            esClient.cat.indices({
              index: args.indexPattern,
              format: "json",
              h: args.includeSize
                ? "index,health,status,pri,rep,docs.count,docs.deleted,store.size,pri.store.size,creation.date,creation.date.string"
                : "index,health,status,pri,rep,docs.count,creation.date,creation.date.string",
              s:
                args.sortBy === "size"
                  ? "store.size:desc"
                  : args.sortBy === "docs"
                    ? "docs.count:desc"
                    : args.sortBy === "creation"
                      ? "creation.date:desc"
                      : "index:asc",
              expand_wildcards: ["open", "closed"],
            }),
          { operation: "list_indices", pattern: args.indexPattern },
        );

        let indices = catIndicesResponse as any[];

        // Filter system indices if requested
        if (args.excludeSystemIndices) {
          indices = indices.filter((idx: any) => !idx.index.startsWith("."));
        }

        // Filter data stream backing indices if requested
        if (args.excludeDataStreams) {
          indices = indices.filter((idx: any) => !idx.index.startsWith(".ds-"));
        }

        // Apply limit
        const totalCount = indices.length;
        indices = indices.slice(0, args.limit);

        // Format response
        if (indices.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No indices found matching pattern: ${args.indexPattern}`,
              },
            ],
          };
        }

        // Prepare content based on number of indices
        const content = [];

        // Add summary
        content.push({
          type: "text",
          text: `Found ${totalCount} indices matching "${args.indexPattern}", showing ${indices.length}:`,
        });

        // Format indices list
        const indicesList = indices
          .map((idx: any) => {
            let info = `• ${idx.index} - ${idx.health} (${idx.status})`;
            info += ` | Docs: ${idx["docs.count"] || 0}`;
            if (args.includeSize && idx["store.size"]) {
              info += ` | Size: ${idx["store.size"]}`;
            }
            if (idx["creation.date.string"]) {
              info += ` | Created: ${idx["creation.date.string"]}`;
            }
            return info;
          })
          .join("\n");

        content.push({
          type: "text",
          text: indicesList,
        });

        // Add note if results were limited
        if (totalCount > indices.length) {
          content.push({
            type: "text",
            text: `\n(Showing ${indices.length} of ${totalCount} total indices. Adjust limit or pattern to see more.)`,
          });
        }

        return { content };
      } catch (error) {
        logger.error("Failed to list indices:", {
          error: error instanceof Error ? error.message : String(error),
        });

        return {
          content: [
            {
              type: "text",
              text: `Error listing indices: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  });
};
