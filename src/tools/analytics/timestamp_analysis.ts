/* src/tools/analytics/timestamp_analysis.ts */
import type { Client } from "@elastic/elasticsearch";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType } from "../../utils/readOnlyMode.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Timestamp analysis schema
const timestampAnalysisSchema = z.object({
  index: z.string().min(1, "Index pattern cannot be empty"),
  timestampField: z.string().default("@timestamp"),
  sampleSize: z.number().min(1).max(1000).default(100),
});

type TimestampAnalysisParams = z.infer<typeof timestampAnalysisSchema>;

function formatTimestamp(ts: any): string {
  if (typeof ts === "number") {
    return new Date(ts).toISOString();
  }
  if (typeof ts === "string") {
    return ts;
  }
  return String(ts);
}

function analyzeTimestamp(ts: any): {
  formatted: string;
  isValid: boolean;
  isFuture: boolean;
  isPast: boolean;
  daysFromNow: number;
} {
  const now = new Date();
  let date: Date;

  try {
    if (typeof ts === "number") {
      date = new Date(ts);
    } else if (typeof ts === "string") {
      date = new Date(ts);
    } else {
      return { formatted: String(ts), isValid: false, isFuture: false, isPast: false, daysFromNow: 0 };
    }

    const isValid = !isNaN(date.getTime());
    if (!isValid) {
      return { formatted: String(ts), isValid: false, isFuture: false, isPast: false, daysFromNow: 0 };
    }

    const diffMs = date.getTime() - now.getTime();
    const daysFromNow = diffMs / (1000 * 60 * 60 * 24);
    const isFuture = daysFromNow > 0;
    const isPast = daysFromNow < 0;

    return {
      formatted: date.toISOString(),
      isValid,
      isFuture,
      isPast,
      daysFromNow: Math.round(daysFromNow * 100) / 100,
    };
  } catch (error) {
    return { formatted: String(ts), isValid: false, isFuture: false, isPast: false, daysFromNow: 0 };
  }
}

export const registerTimestampAnalysisTool: ToolRegistrationFunction = (server, esClient: Client) => {
  const handler = async (args: any): Promise<SearchResult> => {
    try {
      const params = timestampAnalysisSchema.parse(args);
      const { index, timestampField, sampleSize } = params;

      logger.debug("Analyzing timestamps", { index, timestampField, sampleSize });

      // Get min/max timestamps via aggregation
      const aggResult = await esClient.search({
        index,
        size: 0,
        aggs: {
          timestamp_stats: {
            stats: {
              field: timestampField,
            },
          },
          earliest: {
            top_hits: {
              sort: [{ [timestampField]: { order: "asc" } }],
              size: 1,
              _source: [timestampField],
            },
          },
          latest: {
            top_hits: {
              sort: [{ [timestampField]: { order: "desc" } }],
              size: 1,
              _source: [timestampField],
            },
          },
        },
      });

      // Get sample documents for detailed analysis
      const sampleResult = await esClient.search({
        index,
        size: sampleSize,
        sort: [{ [timestampField]: { order: "desc" } }],
        _source: [timestampField, "service.name", "message"],
      });

      const stats = aggResult.aggregations?.timestamp_stats as any;
      const earliest = (aggResult.aggregations?.earliest as any)?.hits?.hits?.[0];
      const latest = (aggResult.aggregations?.latest as any)?.hits?.hits?.[0];
      const now = new Date();

      let analysis = `# Timestamp Analysis for ${index}\n\n`;
      analysis += `**Analysis Time:** ${now.toISOString()}\n`;
      analysis += `**Total Documents:** ${typeof aggResult.hits.total === "number" ? aggResult.hits.total : aggResult.hits.total?.value || 0}\n`;
      analysis += `**Sample Size:** ${sampleResult.hits.hits.length}\n\n`;

      if (stats) {
        analysis += `## Statistical Overview\n`;
        analysis += `- **Count:** ${stats.count}\n`;
        analysis += `- **Min:** ${formatTimestamp(stats.min)} (${analyzeTimestamp(stats.min).daysFromNow} days from now)\n`;
        analysis += `- **Max:** ${formatTimestamp(stats.max)} (${analyzeTimestamp(stats.max).daysFromNow} days from now)\n`;
        analysis += `- **Average:** ${formatTimestamp(stats.avg)} (${analyzeTimestamp(stats.avg).daysFromNow} days from now)\n\n`;
      }

      if (earliest && latest) {
        const earliestTs = earliest._source?.[timestampField];
        const latestTs = latest._source?.[timestampField];

        analysis += `## Document Range\n`;
        analysis += `- **Earliest Document:** ${formatTimestamp(earliestTs)} (ID: ${earliest._id})\n`;
        analysis += `- **Latest Document:** ${formatTimestamp(latestTs)} (ID: ${latest._id})\n\n`;
      }

      // Analyze sample timestamps
      const futureCount = sampleResult.hits.hits.filter((hit) => {
        const ts = hit._source?.[timestampField];
        return analyzeTimestamp(ts).isFuture;
      }).length;

      const validCount = sampleResult.hits.hits.filter((hit) => {
        const ts = hit._source?.[timestampField];
        return analyzeTimestamp(ts).isValid;
      }).length;

      analysis += `## Sample Analysis\n`;
      analysis += `- **Valid Timestamps:** ${validCount}/${sampleResult.hits.hits.length}\n`;
      analysis += `- **Future Timestamps:** ${futureCount}/${sampleResult.hits.hits.length} (${Math.round((futureCount / sampleResult.hits.hits.length) * 100)}%)\n\n`;

      if (futureCount > 0) {
        analysis += `## ⚠️ WARNING: Future Timestamps Detected!\n`;
        analysis += `Found ${futureCount} documents with future timestamps in the sample.\n`;
        analysis += `This explains why recent time range queries (like "now-24h") may return unexpected results.\n\n`;
      }

      analysis += `## Recent Sample Documents\n`;
      sampleResult.hits.hits.slice(0, 10).forEach((hit, i) => {
        const ts = hit._source?.[timestampField];
        const tsAnalysis = analyzeTimestamp(ts);
        const service = hit._source?.["service.name"] || "unknown";
        const message = hit._source?.message || "no message";

        analysis += `${i + 1}. **${hit._id}** (${service})\n`;
        analysis += `   - Timestamp: ${tsAnalysis.formatted}\n`;
        analysis += `   - Days from now: ${tsAnalysis.daysFromNow}\n`;
        analysis += `   - Status: ${tsAnalysis.isFuture ? "🔮 FUTURE" : tsAnalysis.isPast ? "📅 PAST" : "⏰ NOW"}\n`;
        analysis += `   - Message: ${message.substring(0, 100)}${message.length > 100 ? "..." : ""}\n\n`;
      });

      analysis += `## Recommendations\n`;
      if (futureCount > 0) {
        analysis += `1. **Data Quality Issue:** ${Math.round((futureCount / sampleResult.hits.hits.length) * 100)}% of sampled documents have future timestamps\n`;
        analysis += `2. **Fix Strategy:** Consider using absolute date ranges instead of relative ones (e.g., "2025-09-04" instead of "now-24h")\n`;
        analysis += `3. **Investigation:** Check your data ingestion pipeline for timestamp handling issues\n`;
      } else {
        analysis += `1. **Data Quality:** Timestamps appear to be within expected ranges\n`;
        analysis += `2. **Time Range Queries:** Should work correctly with relative dates like "now-24h"\n`;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: analysis,
          },
        ],
      };
    } catch (error) {
      logger.error("Timestamp analysis failed", { error: error instanceof Error ? error.message : String(error) });

      if (error instanceof z.ZodError) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid parameters: ${error.errors.map((e) => e.message).join(", ")}`,
        );
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Timestamp analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  // Tool registration using modern registerTool method


  server.registerTool(


    "elasticsearch_analyze_timestamps",


    {


      title: "Analyze Timestamps",


      description: "Analyze timestamp distribution in Elasticsearch indices to identify data quality issues. Helps diagnose why time range queries may return unexpected results. Provides statistics and sample analysis.",


      inputSchema: {
      type: "object",
      properties: {
        index: {
          type: "string",
          description: "Index pattern to analyze (e.g., 'logs-*', '.ds-logs-*')",
        },
        timestampField: {
          type: "string",
          description: "Timestamp field to analyze (default: '@timestamp')",
          default: "@timestamp",
        },
        sampleSize: {
          type: "number",
          description: "Number of recent documents to sample for analysis (1-1000, default: 100)",
          minimum: 1,
          maximum: 1000,
          default: 100,
        },
      },
      required: ["index"],
      additionalProperties: false,
    },


    },


    handler,


  );;
};
