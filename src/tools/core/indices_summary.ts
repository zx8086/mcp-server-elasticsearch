/* src/tools/core/indices_summary.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema type
const IndicesSummaryParams = z.object({
  indexPattern: z
    .string()
    .trim()
    .min(1, "Index pattern is required")
    .default("*")
    .describe("Index pattern of Elasticsearch indices to summarize"),
  groupBy: z
    .enum(["prefix", "date", "type"])
    .default("prefix")
    .describe("How to group indices for summary"),
});

type IndicesSummaryParamsType = z.infer<typeof IndicesSummaryParams>;

export const registerIndicesSummaryTool: ToolRegistrationFunction = (
  server: McpServer, 
  esClient: Client
) => {
  server.tool(
    "indices_summary",
    "Get a high-level summary of indices without overwhelming detail. Groups similar indices and shows statistics.",
    {
      indexPattern: z
        .string()
        .trim()
        .min(1, "Index pattern is required")
        .default("*")
        .describe("Index pattern of Elasticsearch indices to summarize"),
      groupBy: z
        .enum(["prefix", "date", "type"])
        .default("prefix")
        .describe("How to group indices for summary"),
    },
    async (params: IndicesSummaryParamsType): Promise<SearchResult> => {
      const { indexPattern, groupBy } = params;
      
      logger.debug("Getting indices summary", { pattern: indexPattern, groupBy });
      
      try {
        const response = await esClient.cat.indices({
          index: indexPattern,
          format: 'json',
          h: 'index,health,status,docs.count,store.size'
        });

        // Categorize indices
        const categories = {
          system: [],
          dataStreams: [],
          application: [],
          logs: [],
          metrics: [],
          other: []
        };

        const stats = {
          total: response.length,
          healthy: 0,
          yellow: 0,
          red: 0,
          totalDocs: 0,
          totalSize: 0
        };

        response.forEach((index: any) => {
          // Health stats
          if (index.health === 'green') stats.healthy++;
          else if (index.health === 'yellow') stats.yellow++;
          else if (index.health === 'red') stats.red++;

          // Document count
          const docCount = parseInt(index['docs.count'] || '0');
          stats.totalDocs += docCount;

          // Categorize
          const indexName = index.index;
          if (indexName.startsWith('.')) {
            categories.system.push({ name: indexName, docs: docCount });
          } else if (indexName.includes('.ds-')) {
            categories.dataStreams.push({ name: indexName, docs: docCount });
          } else if (indexName.includes('log')) {
            categories.logs.push({ name: indexName, docs: docCount });
          } else if (indexName.includes('metric')) {
            categories.metrics.push({ name: indexName, docs: docCount });
          } else if (indexName.match(/^[a-zA-Z]+$/)) {
            categories.application.push({ name: indexName, docs: docCount });
          } else {
            categories.other.push({ name: indexName, docs: docCount });
          }
        });

        // Group by pattern for detailed view
        const patterns = new Map<string, any[]>();
        response.forEach((index: any) => {
          let pattern;
          switch (groupBy) {
            case 'date':
              pattern = index.index.replace(/\d{4}\.\d{2}\.\d{2}.*$/, 'YYYY.MM.DD*');
              break;
            case 'type':
              if (index.index.startsWith('.')) pattern = 'system';
              else if (index.index.includes('log')) pattern = 'logs';
              else if (index.index.includes('metric')) pattern = 'metrics';
              else pattern = 'application';
              break;
            case 'prefix':
            default:
              pattern = index.index.replace(/[-_]\d.*$/, '*').replace(/\d+$/, '*');
              break;
          }
          
          if (!patterns.has(pattern)) {
            patterns.set(pattern, []);
          }
          patterns.get(pattern)!.push(index);
        });

        // Create summary by pattern
        const patternSummary = Array.from(patterns.entries())
          .map(([pattern, indices]) => ({
            pattern,
            count: indices.length,
            total_docs: indices.reduce((sum, idx) => sum + parseInt(idx['docs.count'] || '0'), 0),
            health_status: {
              green: indices.filter(i => i.health === 'green').length,
              yellow: indices.filter(i => i.health === 'yellow').length,
              red: indices.filter(i => i.health === 'red').length,
            },
            example_indices: indices.slice(0, 3).map(i => i.index)
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
              red: stats.red
            }
          },
          categories: {
            system_indices: categories.system.length,
            data_streams: categories.dataStreams.length,
            application_indices: categories.application.length,
            log_indices: categories.logs.length,
            metric_indices: categories.metrics.length,
            other_indices: categories.other.length
          },
          patterns: patternSummary,
          largest_indices: response
            .sort((a, b) => parseInt(b['docs.count'] || '0') - parseInt(a['docs.count'] || '0'))
            .slice(0, 10)
            .map(i => ({
              index: i.index,
              docs: i['docs.count'],
              health: i.health
            }))
        };

        return {
          content: [
            { type: "text", text: `📊 Indices Summary for pattern: ${indexPattern}` },
            { type: "text", text: JSON.stringify(summary, null, 2) },
          ],
        };
      } catch (error) {
        logger.error("Failed to get indices summary:", {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          content: [
            { type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` },
          ],
        };
      }
    }
  );
}; 