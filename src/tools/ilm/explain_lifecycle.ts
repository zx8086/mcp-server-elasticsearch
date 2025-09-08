/* src/tools/ilm/explain_lifecycle_simplified.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

/* SIMPLIFIED VERSION: Direct JSON Schema + MCP Error Codes */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { createProgressTracker, notificationManager } from "../../utils/notifications.js";
import { createPaginationHeader, paginateResults, responsePresets } from "../../utils/responseHandling.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// =============================================================================
// 1. SIMPLIFIED SCHEMA APPROACH
// =============================================================================

// Direct JSON Schema definition (no complex Zod conversion)
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Simple Zod validator for runtime validation only
const explainLifecycleValidator = z.object({
  index: z.string().optional(),
  onlyErrors: z.boolean().optional(),
  onlyManaged: z.boolean().optional(),
  masterTimeout: z.string().optional(),
  limit: z.number().min(1).max(500).optional(),
  includeDetails: z.boolean().optional(),
});

type ExplainLifecycleParams = z.infer<typeof explainLifecycleValidator>;

// =============================================================================
// 2. STANDARDIZED MCP ERROR HANDLING
// =============================================================================

function createIlmExplainMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "not_found" | "permission";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    not_found: ErrorCode.InvalidRequest,
    permission: ErrorCode.InvalidRequest,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_ilm_explain_lifecycle] ${message}`, context.details);
}

// =============================================================================
// 3. SIMPLIFIED TOOL IMPLEMENTATION
// =============================================================================

export const registerExplainLifecycleTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const explainLifecycleHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Simple validation - no complex parameter extraction
      const params = explainLifecycleValidator.parse(args);

      const index = params.index || "*";
      
      // Create progress tracker for ILM analysis
      const tracker = await createProgressTracker(
        "ilm_explain_lifecycle",
        100, // percentage-based for analysis
        `Analyzing ILM lifecycle status for ${index}${params.limit ? ` (max ${params.limit})` : ''}`
      );

      logger.debug("Explaining ILM lifecycle (simplified)", {
        index,
        limit: params.limit,
        onlyManaged: params.onlyManaged,
        onlyErrors: params.onlyErrors,
        includeDetails: params.includeDetails,
      });

      // Send initial notification with analysis scope
      await notificationManager.sendInfo(
        `Starting ILM lifecycle analysis for ${index}`,
        {
          operation_type: "ilm_explain_lifecycle",
          index_pattern: index,
          filters: {
            only_managed: params.onlyManaged,
            only_errors: params.onlyErrors,
            include_details: params.includeDetails,
          },
          limit: params.limit,
        }
      );

      // Warn about large cluster analysis
      if (!params.limit && index === "*") {
        await notificationManager.sendWarning(
          `⚠️  Analyzing ALL indices without limit - this may return 1000+ indices and impact performance`,
          {
            operation_type: "ilm_explain_lifecycle",
            performance_warning: true,
            recommendation: "Consider using 'limit' parameter or specific index patterns",
            suggested_params: {
              limit: 50,
              onlyManaged: true,
              index: "logs-*,metrics-*",
            },
          }
        );
      }

      await tracker.updateProgress(20, "Fetching ILM lifecycle status from Elasticsearch");

      // Call Elasticsearch ILM explain API
      const result = await esClient.ilm.explainLifecycle({
        index: index,
        only_errors: params.onlyErrors,
        only_managed: params.onlyManaged,
        master_timeout: params.masterTimeout,
      });

      await tracker.updateProgress(50, "Processing ILM lifecycle information");

      // Convert to array and sort by index name
      const indices = Object.entries(result.indices || {})
        .map(([name, info]) => ({ name, ...info }))
        .sort((a, b) => a.name.localeCompare(b.name));

      await tracker.updateProgress(70, `Found ${indices.length} indices - analyzing status and errors`);

      // Send notification about analysis results
      await notificationManager.sendInfo(
        `ILM analysis found ${indices.length} indices`,
        {
          operation_type: "ilm_explain_lifecycle",
          total_indices: indices.length,
          analysis_scope: index,
          filters_applied: {
            only_managed: params.onlyManaged,
            only_errors: params.onlyErrors,
          },
        }
      );

      if (indices.length === 0) {
        await tracker.complete(
          { indices_found: 0, pattern: index },
          `No indices found matching pattern: ${index}`
        );

        await notificationManager.sendInfo(
          `No indices found matching criteria`,
          {
            operation_type: "ilm_explain_lifecycle",
            pattern: index,
            filters: {
              only_managed: params.onlyManaged,
              only_errors: params.onlyErrors,
            },
            note: "Try broadening your search criteria or check if ILM is enabled",
          }
        );

        return {
          content: [
            {
              type: "text",
              text: `No indices found matching pattern: ${index}${params.onlyManaged ? " (managed only)" : ""}${params.onlyErrors ? " (with errors only)" : ""}`,
            },
          ],
        };
      }

      // Apply pagination with smart defaults for large datasets
      const { results: displayedIndices, metadata } = paginateResults(indices, {
        limit: params.limit,
        defaultLimit: indices.length > 100 ? 50 : responsePresets.list.defaultLimit,
        maxLimit: responsePresets.list.maxLimit,
      });

      // Warn about pagination if results are limited
      if (metadata.hasMore) {
        await notificationManager.sendWarning(
          `Large result set: showing ${metadata.shown}/${metadata.total} indices`,
          {
            operation_type: "ilm_explain_lifecycle",
            result_pagination: true,
            total_indices: metadata.total,
            shown_indices: metadata.shown,
            recommendation: "Use 'limit' parameter to control result size or apply filters",
          }
        );
      }

      await tracker.updateProgress(85, "Building analysis report");

      // Build response content
      const content: string[] = [];

      // Header with summary
      content.push(createPaginationHeader(metadata, "ILM Status for Indices"));
      content.push(
        `Pattern: \`${index}\`${params.onlyManaged ? " | Managed only" : ""}${params.onlyErrors ? " | Errors only" : ""}\n`,
      );

      // Group indices by status for summary
      const statusGroups: Record<string, number> = {};
      const errorIndices: string[] = [];

      for (const idx of displayedIndices) {
        const phase = idx.phase || "unknown";
        const action = idx.action || "";
        const status = `${phase}${action ? `:${action}` : ""}`;

        statusGroups[status] = (statusGroups[status] || 0) + 1;

        if (idx.step_info?.type === "error" || idx.failed_step) {
          errorIndices.push(idx.name);
        }
      }

      // Status summary
      if (Object.keys(statusGroups).length > 1) {
        content.push("### Status Summary");
        for (const [status, count] of Object.entries(statusGroups).sort(([, a], [, b]) => b - a)) {
          content.push(`- **${status}**: ${count} indices`);
        }
        content.push("");
      }

      // Error summary
      if (errorIndices.length > 0) {
        content.push(`### ⚠️ Errors Found (${errorIndices.length})`);
        content.push(
          errorIndices
            .slice(0, 10)
            .map((name) => `- ${name}`)
            .join("\n"),
        );
        if (errorIndices.length > 10) {
          content.push(`... and ${errorIndices.length - 10} more`);
        }
        content.push("");
      }

      // Individual index details
      content.push("### Index Details");

      for (const idx of displayedIndices) {
        if (params.includeDetails) {
          // Detailed mode - full information
          const detail = {
            index: idx.name,
            managed: idx.managed || false,
            policy: idx.policy || "none",
            phase: idx.phase || "unknown",
            action: idx.action || "none",
            step: idx.step || "none",
            phase_time: idx.phase_time ? new Date(idx.phase_time).toISOString() : "unknown",
            ...(idx.step_info && { step_info: idx.step_info }),
            ...(idx.failed_step && { failed_step: idx.failed_step }),
            ...(idx.age && { age: idx.age }),
            ...(idx.lifecycle_date && { lifecycle_date: new Date(idx.lifecycle_date).toISOString() }),
          };

          content.push(`#### ${idx.name}`);
          content.push("```json");
          content.push(JSON.stringify(detail, null, 2));
          content.push("```\n");
        } else {
          // Compact mode - key information only
          const managed = idx.managed ? "✓" : "✗";
          const policy = idx.policy || "none";
          const phase = idx.phase || "unknown";
          const action = idx.action ? `:${idx.action}` : "";
          const error = idx.step_info?.type === "error" || idx.failed_step ? " ⚠️ ERROR" : "";

          content.push(
            `- **${idx.name}** | Managed: ${managed} | Policy: ${policy} | Phase: ${phase}${action}${error}`,
          );
        }
      }

      const duration = performance.now() - perfStart;
      
      // Calculate analysis summary
      const analysisSummary = {
        total_indices: indices.length,
        displayed_indices: displayedIndices.length,
        error_indices: errorIndices.length,
        status_groups: Object.keys(statusGroups).length,
        analysis_time_ms: duration,
        pattern: index,
        has_errors: errorIndices.length > 0,
      };

      await tracker.complete(
        analysisSummary,
        `ILM lifecycle analysis completed: ${indices.length} indices analyzed in ${Math.round(duration)}ms`
      );

      if (duration > 5000) {
        logger.warn("Slow ILM operation: explain_lifecycle", { duration });
        
        await notificationManager.sendWarning(
          `Slow ILM analysis: ${Math.round(duration / 1000)}s for ${indices.length} indices`,
          {
            operation_type: "ilm_explain_lifecycle",
            ...analysisSummary,
            performance_warning: true,
            recommendation: indices.length > 100 ? 
              "Consider using smaller result sets or specific index patterns for faster analysis" : 
              "Analysis completed but took longer than expected",
          }
        );
      } else {
        await notificationManager.sendInfo(
          `ILM analysis completed: ${indices.length} indices analyzed`,
          {
            operation_type: "ilm_explain_lifecycle",
            ...analysisSummary,
            performance_note: duration > 1000 ? "Standard analysis time" : "Fast analysis",
          }
        );
      }

      // Send error summary if errors were found
      if (errorIndices.length > 0) {
        await notificationManager.sendWarning(
          `⚠️  ILM errors detected in ${errorIndices.length} indices`,
          {
            operation_type: "ilm_explain_lifecycle",
            error_count: errorIndices.length,
            error_indices: errorIndices.slice(0, 5), // Show first 5 error indices
            total_indices: indices.length,
            error_percentage: ((errorIndices.length / indices.length) * 100).toFixed(1) + "%",
            recommendation: "Review error details and consider policy adjustments or manual intervention",
          }
        );
      }

      // MCP-compliant response
      return {
        content: [{ type: "text", text: content.join("\n") }],
      };
    } catch (error) {
      await tracker.fail(
        error instanceof Error ? error : new Error(String(error)),
        "ILM lifecycle analysis failed"
      );
      
      await notificationManager.sendError(
        "ILM lifecycle analysis failed",
        error instanceof Error ? error : new Error(String(error)),
        {
          operation_type: "ilm_explain_lifecycle",
          index_pattern: params?.index || "*",
          duration_ms: performance.now() - perfStart,
          failure_context: error instanceof Error && error.message.includes("security_exception") ? 
            "Insufficient permissions - ensure user has ILM read privileges" : 
            error instanceof Error && error.message.includes("index_not_found") ?
            "No matching indices found - check index patterns" :
            "Analysis failed - check cluster connectivity and status",
        }
      );

      // Standardized MCP error handling
      if (error instanceof z.ZodError) {
        throw createIlmExplainMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      if (error instanceof McpError) {
        throw error; // Re-throw MCP errors
      }

      if (error instanceof Error) {
        if (error.message.includes("security_exception")) {
          throw createIlmExplainMcpError("Insufficient permissions to explain ILM lifecycle", {
            type: "permission",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("index_not_found")) {
          throw createIlmExplainMcpError(`No indices found matching pattern: ${args.index || "*"}`, {
            type: "not_found",
            details: { pattern: args.index },
          });
        }
      }

      throw createIlmExplainMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Direct tool registration with JSON Schema
  // Tool registration using modern registerTool method

  server.registerTool(

    "elasticsearch_ilm_explain_lifecycle",

    {

      title: "Ilm Explain Lifecycle",

      description: "Explain ILM status for indices. WARNING: Large clusters have 1000+ indices! ALWAYS specify filters to avoid truncation. Examples: {onlyManaged: true, limit: 50}, {index: 'logs-*', limit: 100}, {onlyErrors: true}. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: {
      index: z.string().optional(), // Index pattern. Use '*' for all indices
      onlyErrors: z.boolean().optional(), // Only show indices with ILM errors
      onlyManaged: z.boolean().optional(), // Only show ILM-managed indices. Highly recommended for large clusters
      masterTimeout: z.string().optional(), // Master node timeout
      limit: z.number().min(1).max(500).optional(), // Maximum number of indices to return. Without this, returns ALL matching indices
      includeDetails: z.boolean().optional(), // Include full lifecycle details (false for compact output)
    },

    },

    // Direct JSON Schema - no Zod conversion
    explainLifecycleHandler,

  );
};

// =============================================================================
// COMPARISON NOTES
// =============================================================================

/*
IMPROVEMENTS vs explain_lifecycle.ts:

1. ✅ ELIMINATED COMPLEX ZOD CONVERSION
   - Direct JSON Schema instead of complex z.union with transforms
   - No more .pipe() chaining and regex transformations
   - Simple number validation instead of string->number transforms

2. ✅ STANDARDIZED MCP ERROR CODES
   - Using ErrorCode.InvalidParams, ErrorCode.InternalError, ErrorCode.InvalidRequest
   - Proper error categorization (validation, execution, not_found, permission)
   - Better error context and details

3. ✅ SIMPLIFIED TOOL REGISTRATION
   - Direct server.tool() call with JSON Schema
   - No complex parameter extraction
   - Trust MCP SDK parameter handling

4. ✅ IMPROVED RESPONSE FORMATTING
   - Better structured output with clear sections
   - Smart auto-limiting for large result sets
   - More readable compact vs detailed modes

5. ✅ BETTER PERFORMANCE MONITORING
   - Simple performance tracking
   - No complex wrapper overhead

BENEFITS:
- 🚀 Better MCP protocol compliance
- 🔧 Easier to debug and maintain
- 📈 Better error reporting with specific context
- ⚡ No expensive schema conversions
- 🎯 More predictable parameter handling
- 📊 Clearer response formatting
*/
