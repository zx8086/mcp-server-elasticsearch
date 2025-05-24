import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";

import { registerListIndicesTool } from "./core/list_indices.js";
import { registerGetMappingsTool } from "./core/get_mappings.js";
import { registerSearchTool } from "./core/search.js";
import { registerGetShardsTool } from "./core/get_shards.js";

import { registerIndexDocumentTool } from "./document/index_document.js";
import { registerGetDocumentTool } from "./document/get_document.js";
import { registerUpdateDocumentTool } from "./document/update_document.js";
import { registerDeleteDocumentTool } from "./document/delete_document.js";
import { registerDocumentExistsTool } from "./document/document_exists.js";

import { registerBulkOperationsTool } from "./bulk/bulk_operations.js";
import { registerMultiGetTool } from "./bulk/multi_get.js";

import { registerExecuteSqlQueryTool } from "./search/execute_sql_query.js";
import { registerUpdateByQueryTool } from "./search/update_by_query.js";
import { registerCountDocumentsTool } from "./search/count_documents.js";
import { registerScrollSearchTool } from "./search/scroll_search.js";
import { registerMultiSearchTool } from "./search/multi_search.js";
import { registerClearScrollTool } from "./search/clear_scroll.js";

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

import { registerDeleteByQueryTool } from "./advanced/delete_by_query.js";
import { registerTranslateSqlQueryTool } from "./advanced/translate_sql_query.js";

import { registerSearchTemplateTool } from "./template/search_template.js";
import { registerMultiSearchTemplateTool } from "./template/multi_search_template.js";
import { registerGetIndexTemplateTool } from "./template/get_index_template.js";
import { registerPutIndexTemplateTool } from "./template/put_index_template.js";
import { registerDeleteIndexTemplateTool } from "./template/delete_index_template.js";

import { registerGetTermVectorsTool } from "./analytics/get_term_vectors.js";
import { registerGetMultiTermVectorsTool } from "./analytics/get_multi_term_vectors.js";

import { registerGetAliasesTool } from "./alias/get_aliases.js";
import { registerPutAliasTool } from "./alias/put_alias.js";
import { registerDeleteAliasTool } from "./alias/delete_alias.js";
import { registerUpdateAliasesTool } from "./alias/update_aliases.js";

import { registerGetClusterHealthTool } from "./cluster/get_cluster_health.js";
import { registerGetClusterStatsTool } from "./cluster/get_cluster_stats.js";
import { registerGetNodesInfoTool } from "./cluster/get_nodes_info.js";
import { registerGetNodesStatsTool } from "./cluster/get_nodes_stats.js";

import { registerGetFieldMappingTool } from "./mapping/get_field_mapping.js";
import { registerClearSqlCursorTool } from "./mapping/clear_sql_cursor.js";

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
} 