/* src/tools/index.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";

// Core Tools (List Indices, Get Mappings, Search, Get Shards)
import { registerListIndicesTool } from "./core/list_indices.js";
import { registerGetMappingsTool } from "./core/get_mappings.js";
import { registerSearchTool } from "./core/search.js";
import { registerGetShardsTool } from "./core/get_shards.js";

// Document Tools (Index Document, Get Document, Update Document, Delete Document, Document Exists)
import { registerIndexDocumentTool } from "./document/index_document.js";
import { registerGetDocumentTool } from "./document/get_document.js";
import { registerUpdateDocumentTool } from "./document/update_document.js";
import { registerDeleteDocumentTool } from "./document/delete_document.js";
import { registerDocumentExistsTool } from "./document/document_exists.js";

// Bulk Tools (Bulk Operations, Multi Get)
import { registerBulkOperationsTool } from "./bulk/bulk_operations.js";
import { registerMultiGetTool } from "./bulk/multi_get.js";

// Search Tools (Execute SQL Query, Update By Query, Count Documents, Scroll Search, Multi Search, Clear Scroll)
import { registerExecuteSqlQueryTool } from "./search/execute_sql_query.js";
import { registerUpdateByQueryTool } from "./search/update_by_query.js";
import { registerCountDocumentsTool } from "./search/count_documents.js";
import { registerScrollSearchTool } from "./search/scroll_search.js";
import { registerMultiSearchTool } from "./search/multi_search.js";
import { registerClearScrollTool } from "./search/clear_scroll.js";

// Index Management Tools (Create Index, Delete Index, Index Exists, Get Index, Update Index Settings, Get Index Settings, Refresh Index, Flush Index, Reindex Documents, Put Mapping)
import { registerCreateIndexTool } from "./index_management/create_index.js";
import { registerDeleteIndexTool } from "./index_management/delete_index.js";
import { registerIndexExistsTool } from "./index_management/index_exists.js";
import { registerGetIndexTool } from "./index_management/get_index.js";
import { registerUpdateIndexSettingsTool } from "./index_management/update_index_settings.js";
import { registerGetIndexSettingsTool } from "./index_management/get_index_settings.js";
import { registerRefreshIndexTool } from "./index_management/refresh_index.js";
import { registerFlushIndexTool } from "./index_management/flush_index.js";
import { registerReindexDocumentsTool } from "./index_management/reindex_documents.js";
import { registerPutMappingTool } from "./index_management/put_mapping.js";

// Advanced Tools (Delete By Query, Translate SQL Query)
import { registerDeleteByQueryTool } from "./advanced/delete_by_query.js";
import { registerTranslateSqlQueryTool } from "./advanced/translate_sql_query.js";

// Template Tools (Search Template, Multi Search Template, Get Index Template, Put Index Template, Delete Index Template)
import { registerSearchTemplateTool } from "./template/search_template.js";
import { registerMultiSearchTemplateTool } from "./template/multi_search_template.js";
import { registerGetIndexTemplateTool } from "./template/get_index_template.js";
import { registerPutIndexTemplateTool } from "./template/put_index_template.js";
import { registerDeleteIndexTemplateTool } from "./template/delete_index_template.js";

// Analytics Tools (Get Term Vectors, Get Multi Term Vectors)
import { registerGetTermVectorsTool } from "./analytics/get_term_vectors.js";
import { registerGetMultiTermVectorsTool } from "./analytics/get_multi_term_vectors.js";

// Alias Tools (Get Aliases, Put Alias, Delete Alias, Update Aliases)
import { registerGetAliasesTool } from "./alias/get_aliases.js";
import { registerPutAliasTool } from "./alias/put_alias.js";
import { registerDeleteAliasTool } from "./alias/delete_alias.js";
import { registerUpdateAliasesTool } from "./alias/update_aliases.js";

// Cluster Tools (Get Cluster Health, Get Cluster Stats, Get Nodes Info, Get Nodes Stats)
import { registerGetClusterHealthTool } from "./cluster/get_cluster_health.js";
import { registerGetClusterStatsTool } from "./cluster/get_cluster_stats.js";
import { registerGetNodesInfoTool } from "./cluster/get_nodes_info.js";
import { registerGetNodesStatsTool } from "./cluster/get_nodes_stats.js";

// Field Mapping Tools (Get Field Mapping, Clear SQL Cursor)
import { registerGetFieldMappingTool } from "./mapping/get_field_mapping.js";
import { registerClearSqlCursorTool } from "./mapping/clear_sql_cursor.js";

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

// Enrich Tools (Get Policy, Put Policy, Delete Policy, Execute Policy, Stats)
import { registerEnrichGetPolicyTool } from "./enrich/get_policy.js";
import { registerEnrichPutPolicyTool } from "./enrich/put_policy.js";
import { registerEnrichDeletePolicyTool } from "./enrich/delete_policy.js";
import { registerEnrichExecutePolicyTool } from "./enrich/execute_policy.js";
import { registerEnrichStatsTool } from "./enrich/stats.js";

// Autoscaling Tools (Get Policy, Put Policy, Delete Policy, Get Capacity)
import { registerAutoscalingGetPolicyTool } from "./autoscaling/get_policy.js";
import { registerAutoscalingPutPolicyTool } from "./autoscaling/put_policy.js";
import { registerAutoscalingDeletePolicyTool } from "./autoscaling/delete_policy.js";
import { registerAutoscalingGetCapacityTool } from "./autoscaling/get_capacity.js";

// Task Tools (List Tasks, Get Task, Cancel Task)
import { registerListTasksTool } from "./tasks/list_tasks.js";
import { registerGetTaskTool } from "./tasks/get_task.js";
import { registerCancelTaskTool } from "./tasks/cancel_task.js";

// Indices Analysis Tools (Field Usage Stats, Disk Usage, Data Lifecycle Stats, Enhanced Index Info)
import { registerFieldUsageStatsTool } from "./indices/field_usage_stats.js";
import { registerDiskUsageTool } from "./indices/disk_usage.js";
import { registerGetDataLifecycleStatsTool } from "./indices/get_data_lifecycle_stats.js";
import { registerGetIndexInfoTool } from "./indices/get_index_info.js";
import { registerGetIndexSettingsAdvancedTool } from "./indices/get_index_settings_advanced.js";
import { registerRolloverTool } from "./indices/rollover.js";
import { registerExistsAliasTool } from "./indices/exists_alias.js";
import { registerExistsIndexTemplateTool } from "./indices/exists_index_template.js";
import { registerExistsTemplateTool } from "./indices/exists_template.js";
import { registerExplainDataLifecycleTool } from "./indices/explain_data_lifecycle.js";

export function registerAllTools(server: McpServer, esClient: Client) {
  registerListIndicesTool(server, esClient);
  registerGetMappingsTool(server, esClient);
  registerSearchTool(server, esClient);
  registerGetShardsTool(server, esClient);

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
} 