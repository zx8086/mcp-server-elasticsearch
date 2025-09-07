/* src/tools/index.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../utils/logger.js";
import { withSecurityValidation } from "../utils/securityEnhancer.js";
import { traceToolExecutionWithConversation } from "../utils/tracingEnhanced.js";
import { getCurrentSession } from "../utils/sessionContext.js";

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
// Analytics Tools (Get Term Vectors, Get Multi Term Vectors, Timestamp Analysis)
import { registerGetTermVectorsTool } from "./analytics/get_term_vectors.js";
import { registerTimestampAnalysisTool } from "./analytics/timestamp_analysis.js";

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

// Diagnostics Tools
import { registerElasticsearchDiagnostics } from "./diagnostics/index.js";

// Notification Tools (Progress tracking and status updates)
import { notificationTools } from "./notifications/index.js";

interface ToolInfo {
  name: string;
  description: string;
  inputSchema: any;
}

export function registerAllTools(server: McpServer, esClient: Client): ToolInfo[] {
  // Wrap the server to automatically add tracing to ALL tools
  // Direct server usage without wrapper

  // Track registered tools for MCP tools/list handler
  const registeredTools: ToolInfo[] = [];

  // Override the tool method to capture tool information and add both tracing and security validation
  const originalTool = server.tool.bind(server);
  server.tool = (name: string, description: string, inputSchema: any, handler: any) => {
    registeredTools.push({ name, description, inputSchema });

    // Skip security validation for read-only search operations
    const readOnlyTools = [
      "elasticsearch_search",
      "elasticsearch_list_indices",
      "elasticsearch_get_mappings",
      "elasticsearch_get_shards",
      "elasticsearch_indices_summary",
      "elasticsearch_diagnostics",
    ];
    const shouldValidate = !readOnlyTools.includes(name);

    // Create enhanced handler with both tracing and security validation
    let enhancedHandler = handler;

    // Add conversation-aware tracing wrapper to ALL tools
    enhancedHandler = async (toolArgs: any, extra: any) => {
      // Extract connection and client info from context for tracing (same as before)
      const currentSession = getCurrentSession();
      const connectionId = currentSession?.connectionId || `conn-${Date.now()}`;
      const clientInfo = currentSession?.clientInfo || { name: "Claude Desktop", platform: "desktop" };
      
      logger.debug("Tool execution with conversation-aware tracing", {
        toolName: name,
        connectionId: connectionId.substring(0, 8) + "...",
      });
      
      // Pass context information to conversation-aware tracing (maintains exact same signature)
      const contextSession = { sessionId: connectionId, connectionId, clientInfo };
      return traceToolExecutionWithConversation(name, toolArgs, extra, contextSession, async (toolArgs: any, extra: any) => {
        return handler(toolArgs, extra);
      });
    };

    // Add security validation wrapper for write operations
    if (shouldValidate) {
      enhancedHandler = withSecurityValidation(name, enhancedHandler);
    }

    return originalTool(name, description, inputSchema, enhancedHandler);
  };

  logger.info("Registering all tools with conversation-aware tracing and security validation", {
    conversationTracingEnabled: true, // All tools will be traced with conversation context
    securityEnabled: true,
  });

  // Now register all tools with the wrapped server
  // They will automatically get tracing without any changes!
  registerListIndicesTool(server, esClient);
  registerGetMappingsTool(server, esClient);
  registerSearchTool(server, esClient);
  // registerEnhancedSearchTool(server, esClient);
  registerGetShardsTool(server, esClient);
  registerIndicesSummaryTool(server, esClient);

  registerIndexDocumentTool(server, esClient);
  registerGetDocumentTool(server, esClient);
  registerUpdateDocumentTool(server, esClient);
  registerDeleteDocumentTool(server, esClient);
  registerDocumentExistsTool(server, esClient);

  registerBulkOperationsTool(server, esClient);
  registerMultiGetTool(server, esClient);

  registerExecuteSqlQueryTool(server, esClient);
  registerUpdateByQueryTool(server, esClient);
  registerCountDocumentsTool(server, esClient);
  registerScrollSearchTool(server, esClient);
  registerMultiSearchTool(server, esClient);
  registerClearScrollTool(server, esClient);

  registerCreateIndexTool(server, esClient);
  registerDeleteIndexTool(server, esClient);
  registerIndexExistsTool(server, esClient);
  registerGetIndexTool(server, esClient);
  registerUpdateIndexSettingsTool(server, esClient);
  registerGetIndexSettingsTool(server, esClient);
  registerRefreshIndexTool(server, esClient);
  registerFlushIndexTool(server, esClient);
  registerReindexDocumentsTool(server, esClient);
  registerPutMappingTool(server, esClient);

  registerDeleteByQueryTool(server, esClient);
  registerTranslateSqlQueryTool(server, esClient);

  registerSearchTemplateTool(server, esClient);
  registerMultiSearchTemplateTool(server, esClient);
  registerGetIndexTemplateTool(server, esClient);
  registerPutIndexTemplateTool(server, esClient);
  registerDeleteIndexTemplateTool(server, esClient);

  registerGetTermVectorsTool(server, esClient);
  registerGetMultiTermVectorsTool(server, esClient);
  registerTimestampAnalysisTool(server, esClient);

  registerGetAliasesTool(server, esClient);
  registerPutAliasTool(server, esClient);
  registerDeleteAliasTool(server, esClient);
  registerUpdateAliasesTool(server, esClient);

  registerGetClusterHealthTool(server, esClient);
  registerGetClusterStatsTool(server, esClient);
  registerGetNodesInfoTool(server, esClient);
  registerGetNodesStatsTool(server, esClient);

  registerGetFieldMappingTool(server, esClient);
  registerClearSqlCursorTool(server, esClient);

  // Register ILM Tools
  registerDeleteLifecycleTool(server, esClient);
  registerExplainLifecycleTool(server, esClient);
  registerGetLifecycleTool(server, esClient);
  registerGetStatusTool(server, esClient);
  registerMigrateToDataTiersTool(server, esClient);
  registerMoveToStepTool(server, esClient);
  registerPutLifecycleTool(server, esClient);
  registerRemovePolicyTool(server, esClient);
  registerRetryTool(server, esClient);
  registerStartTool(server, esClient);
  registerStopTool(server, esClient);

  // Register Enrich Tools
  registerEnrichGetPolicyTool(server, esClient);
  registerEnrichPutPolicyTool(server, esClient);
  registerEnrichDeletePolicyTool(server, esClient);
  registerEnrichExecutePolicyTool(server, esClient);
  registerEnrichStatsTool(server, esClient);

  // Register Autoscaling Tools
  registerAutoscalingGetPolicyTool(server, esClient);
  registerAutoscalingPutPolicyTool(server, esClient);
  registerAutoscalingDeletePolicyTool(server, esClient);
  registerAutoscalingGetCapacityTool(server, esClient);

  // Register Task Tools
  registerListTasksTool(server, esClient);
  registerGetTaskTool(server, esClient);
  registerCancelTaskTool(server, esClient);

  // Register Indices Analysis Tools
  registerFieldUsageStatsTool(server, esClient);
  registerDiskUsageTool(server, esClient);
  registerGetDataLifecycleStatsTool(server, esClient);
  registerGetIndexInfoTool(server, esClient);
  registerGetIndexSettingsAdvancedTool(server, esClient);
  registerRolloverTool(server, esClient);
  registerExistsAliasTool(server, esClient);
  registerExistsIndexTemplateTool(server, esClient);
  registerExistsTemplateTool(server, esClient);
  registerExplainDataLifecycleTool(server, esClient);

  // Register Watcher Tools
  registerWatcherGetWatchTool(server, esClient);
  registerWatcherPutWatchTool(server, esClient);
  registerWatcherDeleteWatchTool(server, esClient);
  registerWatcherQueryWatchesTool(server, esClient);
  registerWatcherActivateWatchTool(server, esClient);
  registerWatcherDeactivateWatchTool(server, esClient);
  registerWatcherAckWatchTool(server, esClient);
  registerWatcherExecuteWatchTool(server, esClient);
  registerWatcherStartTool(server, esClient);
  registerWatcherStopTool(server, esClient);
  registerWatcherGetSettingsTool(server, esClient);
  registerWatcherUpdateSettingsTool(server, esClient);
  registerWatcherStatsTool(server, esClient);

  // Register Diagnostics Tools
  registerElasticsearchDiagnostics(server, esClient);

  // Register Notification Tools (with progress tracking)
  for (const registerTool of notificationTools) {
    registerTool(server, esClient);
  }

  logger.info("All tools registered with conversation-aware tracing and security validation", {
    toolCount: registeredTools.length,
    conversationTracingActive: true, // All tools are traced with conversation context
    enhancementsEnabled: true,
    notificationTools: notificationTools.length,
  });

  return registeredTools;
}
