/* src/tools/index.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../utils/logger.js";
import { withSecurityValidation } from "../utils/securityEnhancer.js";
import { wrapServerWithTracing } from "../utils/universalToolWrapper.js";

import { registerGetMappingsTool } from "./core/get_mappings.js";
import { registerGetShardsTool } from "./core/get_shards.js";
import { registerIndicesSummaryTool } from "./core/indices_summary.js";
// Core Tools (List Indices, Get Mappings, Search, Get Shards)
import { registerListIndicesTool } from "./core/list_indices.js";
import { registerSearchTool } from "./core/search.js";
// import { registerEnhancedSearchTool } from "./core/search_enhanced.js";

import { registerDeleteDocumentTool } from "./document/delete_document.js";
import { registerDocumentExistsTool } from "./document/document_exists.js";
import { registerGetDocumentTool } from "./document/get_document.js";
// Document Tools (Index Document, Get Document, Update Document, Delete Document, Document Exists)
import { registerIndexDocumentTool } from "./document/index_document.js";
import { registerUpdateDocumentTool } from "./document/update_document.js";

// Bulk Tools (Bulk Operations, Multi Get)
import { registerBulkOperationsTool } from "./bulk/bulk_operations.js";
import { registerMultiGetTool } from "./bulk/multi_get.js";

import { registerClearScrollTool } from "./search/clear_scroll.js";
import { registerCountDocumentsTool } from "./search/count_documents.js";
// Search Tools (Execute SQL Query, Update By Query, Count Documents, Scroll Search, Multi Search, Clear Scroll)
import { registerExecuteSqlQueryTool } from "./search/execute_sql_query.js";
import { registerMultiSearchTool } from "./search/multi_search.js";
import { registerScrollSearchTool } from "./search/scroll_search.js";
import { registerUpdateByQueryTool } from "./search/update_by_query.js";

// Index Management Tools (Create Index, Delete Index, Index Exists, Get Index, Update Index Settings, Get Index Settings, Refresh Index, Flush Index, Reindex Documents, Put Mapping)
import { registerCreateIndexTool } from "./index_management/create_index.js";
import { registerDeleteIndexTool } from "./index_management/delete_index.js";
import { registerFlushIndexTool } from "./index_management/flush_index.js";
import { registerGetIndexTool } from "./index_management/get_index.js";
import { registerGetIndexSettingsTool } from "./index_management/get_index_settings.js";
import { registerIndexExistsTool } from "./index_management/index_exists.js";
import { registerPutMappingTool } from "./index_management/put_mapping.js";
import { registerRefreshIndexTool } from "./index_management/refresh_index.js";
import { registerReindexDocumentsTool } from "./index_management/reindex_documents.js";
import { registerUpdateIndexSettingsTool } from "./index_management/update_index_settings.js";

// Advanced Tools (Delete By Query, Translate SQL Query)
import { registerDeleteByQueryTool } from "./advanced/delete_by_query.js";
import { registerTranslateSqlQueryTool } from "./advanced/translate_sql_query.js";

import { registerDeleteIndexTemplateTool } from "./template/delete_index_template.js";
import { registerGetIndexTemplateTool } from "./template/get_index_template_improved.js";
import { registerMultiSearchTemplateTool } from "./template/multi_search_template.js";
import { registerPutIndexTemplateTool } from "./template/put_index_template.js";
// Template Tools (Search Template, Multi Search Template, Get Index Template, Put Index Template, Delete Index Template)
import { registerSearchTemplateTool } from "./template/search_template.js";

import { registerGetMultiTermVectorsTool } from "./analytics/get_multi_term_vectors.js";
// Analytics Tools (Get Term Vectors, Get Multi Term Vectors)
import { registerGetTermVectorsTool } from "./analytics/get_term_vectors.js";

import { registerDeleteAliasTool } from "./alias/delete_alias.js";
// Alias Tools (Get Aliases, Put Alias, Delete Alias, Update Aliases)
import { registerGetAliasesTool } from "./alias/get_aliases_improved.js";
import { registerPutAliasTool } from "./alias/put_alias.js";
import { registerUpdateAliasesTool } from "./alias/update_aliases.js";

// Cluster Tools (Get Cluster Health, Get Cluster Stats, Get Nodes Info, Get Nodes Stats)
import { registerGetClusterHealthTool } from "./cluster/get_cluster_health.js";
import { registerGetClusterStatsTool } from "./cluster/get_cluster_stats.js";
import { registerGetNodesInfoTool } from "./cluster/get_nodes_info.js";
import { registerGetNodesStatsTool } from "./cluster/get_nodes_stats.js";

import { registerClearSqlCursorTool } from "./mapping/clear_sql_cursor.js";
// Field Mapping Tools (Get Field Mapping, Clear SQL Cursor)
import { registerGetFieldMappingTool } from "./mapping/get_field_mapping.js";

// ILM Tools (Index Lifecycle Management)
import { registerDeleteLifecycleTool } from "./ilm/delete_lifecycle.js";
import { registerExplainLifecycleTool } from "./ilm/explain_lifecycle.js";
import { registerGetLifecycleTool } from "./ilm/get_lifecycle.js";
import { registerGetStatusTool } from "./ilm/get_status.js";
import { registerMigrateToDataTiersTool } from "./ilm/migrate_to_data_tiers.js";
import { registerMoveToStepTool } from "./ilm/move_to_step.js";
import { registerPutLifecycleTool } from "./ilm/put_lifecycle.js";
import { registerRemovePolicyTool } from "./ilm/remove_policy.js";
import { registerRetryTool } from "./ilm/retry.js";
import { registerStartTool } from "./ilm/start.js";
import { registerStopTool } from "./ilm/stop.js";

import { registerEnrichDeletePolicyTool } from "./enrich/delete_policy.js";
import { registerEnrichExecutePolicyTool } from "./enrich/execute_policy.js";
// Enrich Tools (Get Policy, Put Policy, Delete Policy, Execute Policy, Stats)
import { registerEnrichGetPolicyTool } from "./enrich/get_policy_improved.js";
import { registerEnrichPutPolicyTool } from "./enrich/put_policy.js";
import { registerEnrichStatsTool } from "./enrich/stats.js";

import { registerAutoscalingDeletePolicyTool } from "./autoscaling/delete_policy.js";
import { registerAutoscalingGetCapacityTool } from "./autoscaling/get_capacity.js";
// Autoscaling Tools (Get Policy, Put Policy, Delete Policy, Get Capacity)
import { registerAutoscalingGetPolicyTool } from "./autoscaling/get_policy.js";
import { registerAutoscalingPutPolicyTool } from "./autoscaling/put_policy.js";

import { registerCancelTaskTool } from "./tasks/cancel_task.js";
import { registerGetTaskTool } from "./tasks/get_task.js";
// Task Tools (List Tasks, Get Task, Cancel Task)
import { registerListTasksTool } from "./tasks/list_tasks.js";

import { registerDiskUsageTool } from "./indices/disk_usage.js";
import { registerExistsAliasTool } from "./indices/exists_alias.js";
import { registerExistsIndexTemplateTool } from "./indices/exists_index_template.js";
import { registerExistsTemplateTool } from "./indices/exists_template.js";
import { registerExplainDataLifecycleTool } from "./indices/explain_data_lifecycle.js";
// Indices Analysis Tools (Field Usage Stats, Disk Usage, Data Lifecycle Stats, Enhanced Index Info)
import { registerFieldUsageStatsTool } from "./indices/field_usage_stats.js";
import { registerGetDataLifecycleStatsTool } from "./indices/get_data_lifecycle_stats.js";
import { registerGetIndexInfoTool } from "./indices/get_index_info.js";
import { registerGetIndexSettingsAdvancedTool } from "./indices/get_index_settings_advanced.js";
import { registerRolloverTool } from "./indices/rollover.js";

// Watcher Tools
import {
  registerWatcherAckWatchTool,
  registerWatcherActivateWatchTool,
  registerWatcherDeactivateWatchTool,
  registerWatcherDeleteWatchTool,
  registerWatcherExecuteWatchTool,
  registerWatcherGetSettingsTool,
  registerWatcherGetWatchTool,
  registerWatcherPutWatchTool,
  registerWatcherQueryWatchesTool,
  registerWatcherStartTool,
  registerWatcherStatsTool,
  registerWatcherStopTool,
  registerWatcherUpdateSettingsTool,
} from "./watcher/index.js";

interface ToolInfo {
  name: string;
  description: string;
  inputSchema: any;
}

export function registerAllTools(server: McpServer, esClient: Client): ToolInfo[] {
  // Wrap the server to automatically add tracing to ALL tools
  const wrappedServer = wrapServerWithTracing(server);
  
  // Track registered tools for MCP tools/list handler
  const registeredTools: ToolInfo[] = [];
  
  // Override the tool method to capture tool information and add security validation
  const originalTool = wrappedServer.tool.bind(wrappedServer);
  wrappedServer.tool = (name: string, description: string, inputSchema: any, handler: any) => {
    registeredTools.push({ name, description, inputSchema });
    
    // Wrap handler with security validation
    const secureHandler = withSecurityValidation(name, handler);
    
    return originalTool(name, description, inputSchema, secureHandler);
  };

  logger.info("🚀 Registering all tools with automatic tracing", {
    tracingEnabled: process.env.LANGSMITH_TRACING === "true",
  });

  // Now register all tools with the wrapped server
  // They will automatically get tracing without any changes!
  registerListIndicesTool(wrappedServer, esClient);
  registerGetMappingsTool(wrappedServer, esClient);
  registerSearchTool(wrappedServer, esClient);
  // registerEnhancedSearchTool(wrappedServer, esClient);
  registerGetShardsTool(wrappedServer, esClient);
  registerIndicesSummaryTool(wrappedServer, esClient);

  registerIndexDocumentTool(wrappedServer, esClient);
  registerGetDocumentTool(wrappedServer, esClient);
  registerUpdateDocumentTool(wrappedServer, esClient);
  registerDeleteDocumentTool(wrappedServer, esClient);
  registerDocumentExistsTool(wrappedServer, esClient);

  registerBulkOperationsTool(wrappedServer, esClient);
  registerMultiGetTool(wrappedServer, esClient);

  registerExecuteSqlQueryTool(wrappedServer, esClient);
  registerUpdateByQueryTool(wrappedServer, esClient);
  registerCountDocumentsTool(wrappedServer, esClient);
  registerScrollSearchTool(wrappedServer, esClient);
  registerMultiSearchTool(wrappedServer, esClient);
  registerClearScrollTool(wrappedServer, esClient);

  registerCreateIndexTool(wrappedServer, esClient);
  registerDeleteIndexTool(wrappedServer, esClient);
  registerIndexExistsTool(wrappedServer, esClient);
  registerGetIndexTool(wrappedServer, esClient);
  registerUpdateIndexSettingsTool(wrappedServer, esClient);
  registerGetIndexSettingsTool(wrappedServer, esClient);
  registerRefreshIndexTool(wrappedServer, esClient);
  registerFlushIndexTool(wrappedServer, esClient);
  registerReindexDocumentsTool(wrappedServer, esClient);
  registerPutMappingTool(wrappedServer, esClient);

  registerDeleteByQueryTool(wrappedServer, esClient);
  registerTranslateSqlQueryTool(wrappedServer, esClient);

  registerSearchTemplateTool(wrappedServer, esClient);
  registerMultiSearchTemplateTool(wrappedServer, esClient);
  registerGetIndexTemplateTool(wrappedServer, esClient);
  registerPutIndexTemplateTool(wrappedServer, esClient);
  registerDeleteIndexTemplateTool(wrappedServer, esClient);

  registerGetTermVectorsTool(wrappedServer, esClient);
  registerGetMultiTermVectorsTool(wrappedServer, esClient);

  registerGetAliasesTool(wrappedServer, esClient);
  registerPutAliasTool(wrappedServer, esClient);
  registerDeleteAliasTool(wrappedServer, esClient);
  registerUpdateAliasesTool(wrappedServer, esClient);

  registerGetClusterHealthTool(wrappedServer, esClient);
  registerGetClusterStatsTool(wrappedServer, esClient);
  registerGetNodesInfoTool(wrappedServer, esClient);
  registerGetNodesStatsTool(wrappedServer, esClient);

  registerGetFieldMappingTool(wrappedServer, esClient);
  registerClearSqlCursorTool(wrappedServer, esClient);

  // Register ILM Tools
  registerDeleteLifecycleTool(wrappedServer, esClient);
  registerExplainLifecycleTool(wrappedServer, esClient);
  registerGetLifecycleTool(wrappedServer, esClient);
  registerGetStatusTool(wrappedServer, esClient);
  registerMigrateToDataTiersTool(wrappedServer, esClient);
  registerMoveToStepTool(wrappedServer, esClient);
  registerPutLifecycleTool(wrappedServer, esClient);
  registerRemovePolicyTool(wrappedServer, esClient);
  registerRetryTool(wrappedServer, esClient);
  registerStartTool(wrappedServer, esClient);
  registerStopTool(wrappedServer, esClient);

  // Register Enrich Tools
  registerEnrichGetPolicyTool(wrappedServer, esClient);
  registerEnrichPutPolicyTool(wrappedServer, esClient);
  registerEnrichDeletePolicyTool(wrappedServer, esClient);
  registerEnrichExecutePolicyTool(wrappedServer, esClient);
  registerEnrichStatsTool(wrappedServer, esClient);

  // Register Autoscaling Tools
  registerAutoscalingGetPolicyTool(wrappedServer, esClient);
  registerAutoscalingPutPolicyTool(wrappedServer, esClient);
  registerAutoscalingDeletePolicyTool(wrappedServer, esClient);
  registerAutoscalingGetCapacityTool(wrappedServer, esClient);

  // Register Task Tools
  registerListTasksTool(wrappedServer, esClient);
  registerGetTaskTool(wrappedServer, esClient);
  registerCancelTaskTool(wrappedServer, esClient);

  // Register Indices Analysis Tools
  registerFieldUsageStatsTool(wrappedServer, esClient);
  registerDiskUsageTool(wrappedServer, esClient);
  registerGetDataLifecycleStatsTool(wrappedServer, esClient);
  registerGetIndexInfoTool(wrappedServer, esClient);
  registerGetIndexSettingsAdvancedTool(wrappedServer, esClient);
  registerRolloverTool(wrappedServer, esClient);
  registerExistsAliasTool(wrappedServer, esClient);
  registerExistsIndexTemplateTool(wrappedServer, esClient);
  registerExistsTemplateTool(wrappedServer, esClient);
  registerExplainDataLifecycleTool(wrappedServer, esClient);

  // Register Watcher Tools
  registerWatcherGetWatchTool(wrappedServer, esClient);
  registerWatcherPutWatchTool(wrappedServer, esClient);
  registerWatcherDeleteWatchTool(wrappedServer, esClient);
  registerWatcherQueryWatchesTool(wrappedServer, esClient);
  registerWatcherActivateWatchTool(wrappedServer, esClient);
  registerWatcherDeactivateWatchTool(wrappedServer, esClient);
  registerWatcherAckWatchTool(wrappedServer, esClient);
  registerWatcherExecuteWatchTool(wrappedServer, esClient);
  registerWatcherStartTool(wrappedServer, esClient);
  registerWatcherStopTool(wrappedServer, esClient);
  registerWatcherGetSettingsTool(wrappedServer, esClient);
  registerWatcherUpdateSettingsTool(wrappedServer, esClient);
  registerWatcherStatsTool(wrappedServer, esClient);

  // EXPERIMENTAL: Register a plain JSON Schema tool for testing
  logger.info("🧪 Registering experimental plain JSON Schema tool for comparison...");

  // Plain JSON Schema tool (no Zod conversion)
  wrappedServer.tool(
    "plain_elasticsearch_list_indices",
    "EXPERIMENTAL: List indices using plain JSON Schema (no Zod conversion)",
    {
      type: "object",
      properties: {
        indexPattern: {
          type: "string",
          description: "Index pattern to match. Use '*' to list all indices.",
          default: "*",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          default: 50,
          description: "Maximum number of indices to return",
        },
        excludeSystemIndices: {
          type: "boolean",
          default: true,
          description: "Exclude system indices starting with '.'",
        },
      },
      additionalProperties: false,
    },
    async (args: any) => {
      logger.debug("Plain JSON Schema tool called", { args });

      // Apply defaults manually
      const indexPattern = args?.indexPattern || "*";
      const limit = args?.limit || 50;
      const excludeSystemIndices = args?.excludeSystemIndices !== undefined ? args.excludeSystemIndices : true;

      logger.info("Plain tool processing with params:", {
        indexPattern,
        limit,
        excludeSystemIndices,
        receivedArgs: args,
      });

      try {
        const catParams = {
          index: indexPattern,
          format: "json" as const,
          h: "index,health,status,docs.count",
        };

        const response = await esClient.cat.indices(catParams);

        let filteredIndices = response.filter((index: any) => {
          if (excludeSystemIndices && index.index.startsWith(".")) return false;
          return true;
        });

        const totalFound = filteredIndices.length;
        filteredIndices = filteredIndices.slice(0, limit);

        const summary = {
          approach: "PLAIN_JSON_SCHEMA",
          parameters_received: args,
          parameters_processed: { indexPattern, limit, excludeSystemIndices },
          total_found: totalFound,
          displayed: filteredIndices.length,
          success: true,
        };

        return {
          content: [
            {
              type: "text",
              text: `✅ PLAIN JSON SCHEMA SUCCESS!\n${JSON.stringify(summary, null, 2)}\n\nFirst 3 indices:\n${JSON.stringify(filteredIndices.slice(0, 3), null, 2)}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Plain schema error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );

  logger.info("✅ All tools registered with automatic tracing wrapper", {
    toolCount: registeredTools.length,
  });
  
  return registeredTools;
}
