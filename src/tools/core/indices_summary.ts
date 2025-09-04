/* src/tools/core/indices_summary.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

const indicesSummarySchema = {
  type: "object",
  properties: {
    indexPattern: {
      type: "string",
      description: "Elasticsearch index pattern to summarize (supports wildcards like logs-*, app-*)",
    },
    groupBy: {
      type: "string",
      enum: ["prefix", "date", "type"],
      description: "How to group Elasticsearch indices for summary analysis",
    },
  },
  additionalProperties: false,
};

const indicesSummaryValidator = z.object({
  indexPattern: z.string().optional(),
  groupBy: z.enum(["prefix", "date", "type"]).optional(),
});

type IndicesSummaryParams = z.infer<typeof indicesSummaryValidator>;

function createIndicesSummaryMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  if (message.includes("index_not_found")) {
    return new McpError(
      ErrorCode.InvalidRequest,
      `Index pattern not found: ${context.details?.indexPattern || "unknown"}`,
    );
  }

  if (message.includes("cluster_block_exception")) {
    return new McpError(ErrorCode.InvalidRequest, "Cluster is blocked for index operations");
  }

  if (message.includes("timeout")) {
    return new McpError(ErrorCode.RequestTimeout, "Request timed out while retrieving indices summary");
  }

  return new McpError(ErrorCode.InternalError, `Failed to get indices summary: ${message}`);
}

export const registerIndicesSummaryTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const indicesSummaryHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      const params = indicesSummaryValidator.parse(args);
      const { indexPattern, groupBy } = params;

      logger.debug("Getting indices summary", { pattern: indexPattern, groupBy });

      const response = await esClient.cat.indices({
        index: indexPattern,
        format: "json",
        h: "index,health,status,docs.count,store.size",
      });

      const duration = performance.now() - perfStart;
      logger.debug("Retrieved indices summary", {
        indicesCount: response.length,
        duration: `${duration.toFixed(2)}ms`,
      });

      const categories = {
        system: [],
        dataStreams: [],
        application: [],
        logs: [],
        metrics: [],
        other: [],
      };

      const stats = {
        total: response.length,
        healthy: 0,
        yellow: 0,
        red: 0,
        totalDocs: 0,
        totalSize: 0,
      };

      for (const index of response) {
        if (!index.index) continue;

        if (index.health === "green") stats.healthy++;
        else if (index.health === "yellow") stats.yellow++;
        else if (index.health === "red") stats.red++;

        const docCount = Number.parseInt(index["docs.count"] || "0");
        stats.totalDocs += docCount;

        const indexName = index.index;
        if (indexName.startsWith(".")) {
          categories.system.push({ name: indexName, docs: docCount });
        } else if (indexName.includes(".ds-")) {
          categories.dataStreams.push({ name: indexName, docs: docCount });
        } else if (indexName.includes("log")) {
          categories.logs.push({ name: indexName, docs: docCount });
        } else if (indexName.includes("metric")) {
          categories.metrics.push({ name: indexName, docs: docCount });
        } else if (indexName.match(/^[a-zA-Z]+$/)) {
          categories.application.push({ name: indexName, docs: docCount });
        } else {
          categories.other.push({ name: indexName, docs: docCount });
        }
      }

      const patterns = new Map<string, any[]>();
      for (const index of response) {
        if (!index.index) continue;

        let pattern: string;
        switch (groupBy) {
          case "date":
            pattern = index.index.replace(/\d{4}\.\d{2}\.\d{2}.*$/, "YYYY.MM.DD*");
            break;
          case "type":
            if (index.index.startsWith(".")) pattern = "system";
            else if (index.index.includes("log")) pattern = "logs";
            else if (index.index.includes("metric")) pattern = "metrics";
            else pattern = "application";
            break;
          default:
            pattern = index.index.replace(/[-_]\d.*$/, "*").replace(/\d+$/, "*");
            break;
        }

        if (!patterns.has(pattern)) {
          patterns.set(pattern, []);
        }
        patterns.get(pattern)!.push(index);
      }

      const patternSummary = Array.from(patterns.entries())
        .map(([pattern, indices]) => ({
          pattern,
          count: indices.length,
          total_docs: indices.reduce((sum, idx) => sum + Number.parseInt(idx["docs.count"] || "0"), 0),
          health_status: {
            green: indices.filter((i) => i.health === "green").length,
            yellow: indices.filter((i) => i.health === "yellow").length,
            red: indices.filter((i) => i.health === "red").length,
          },
          example_indices: indices.slice(0, 3).map((i) => i.index),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

      const summary = {
        overview: {
          total_indices: stats.total,
          total_documents: stats.totalDocs,
          health_distribution: {
            green: stats.healthy,
            yellow: stats.yellow,
            red: stats.red,
          },
        },
        categories: {
          system_indices: categories.system.length,
          data_streams: categories.dataStreams.length,
          application_indices: categories.application.length,
          log_indices: categories.logs.length,
          metric_indices: categories.metrics.length,
          other_indices: categories.other.length,
        },
        patterns: patternSummary,
        largest_indices: response
          .sort((a, b) => Number.parseInt(b["docs.count"] || "0") - Number.parseInt(a["docs.count"] || "0"))
          .slice(0, 10)
          .map((i) => ({
            index: i.index,
            docs: i["docs.count"],
            health: i.health,
          })),
      };

      return {
        content: [
          { type: "text", text: `📊 Indices Summary for pattern: ${indexPattern || "*"}` },
          { type: "text", text: JSON.stringify(summary, null, 2) },
        ],
      };
    } catch (error) {
      const duration = performance.now() - perfStart;
      logger.error("Failed to get indices summary", {
        error: error instanceof Error ? error.message : String(error),
        duration: `${duration.toFixed(2)}ms`,
      });
      throw createIndicesSummaryMcpError(error instanceof Error ? error : new Error(String(error)), {
        type: "indices_summary",
        details: args,
      });
    }
  };

  server.tool(
    "elasticsearch_indices_summary",
    "Get a high-level summary of indices without overwhelming detail in Elasticsearch. Best for cluster overview, index organization analysis, storage planning. Use when you need to understand index patterns, health distribution, and storage usage across your Elasticsearch cluster. Uses direct JSON Schema and standardized MCP error codes.",
    indicesSummarySchema,
    indicesSummaryHandler,
  );
};
