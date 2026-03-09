# Elasticsearch MCP Tool Coverage Report

Total Tools: 98

## Coverage Summary
- Tools with integration tests: 5 (5.1%)
- Tools without tests: 93 (94.9%)
- Destructive operations: 27
- Read-only operations: 71

## Coverage by Category

### mapping (0/2 - 0.0%)
  elasticsearch_clear_sql_cursor (clear_sql_cursor.ts)
  elasticsearch_get_field_mapping (get_field_mapping.ts)

### advanced (0/2 - 0.0%)
  elasticsearch_delete_by_query (delete_by_query.ts)
  elasticsearch_translate_sql_query (translate_sql_query.ts)

### cluster (0/4 - 0.0%)
  elasticsearch_get_nodes_info (get_nodes_info.ts)
  elasticsearch_get_nodes_stats (get_nodes_stats.ts)
  elasticsearch_get_cluster_stats (get_cluster_stats.ts)
  elasticsearch_get_cluster_health (get_cluster_health.ts)

### alias (0/5 - 0.0%)
  elasticsearch_update_aliases (update_aliases.ts)
  elasticsearch_delete_alias (delete_alias.ts)
  elasticsearch_put_alias (put_alias.ts)
  elasticsearch_get_aliases (get_aliases_old.ts)
  elasticsearch_get_aliases (get_aliases_improved.ts)

### tasks (0/3 - 0.0%)
  elasticsearch_list_tasks (list_tasks.ts)
  elasticsearch_tasks_get_task (get_task.ts)
  elasticsearch_tasks_cancel_task (cancel_task.ts)

### indices (0/10 - 0.0%)
  elasticsearch_exists_alias (exists_alias.ts)
  elasticsearch_field_usage_stats (field_usage_stats.ts)
  elasticsearch_get_index_info (get_index_info.ts)
  elasticsearch_exists_template (exists_template.ts)
  elasticsearch_disk_usage (disk_usage.ts)
  elasticsearch_exists_index_template (exists_index_template.ts)
  elasticsearch_get_index_settings_advanced (get_index_settings_advanced.ts)
  elasticsearch_explain_data_lifecycle (explain_data_lifecycle.ts)
  elasticsearch_rollover (rollover.ts)
  elasticsearch_get_data_lifecycle_stats (get_data_lifecycle_stats.ts)

### bulk (0/2 - 0.0%)
  elasticsearch_multi_get (multi_get.ts)
  elasticsearch_bulk_operations (bulk_operations.ts)

### core (4/6 - 66.7%)
  elasticsearch_search (search.ts)
  elasticsearch_list_indices (list_indices.ts)
  elasticsearch_list_indices (list_indices_traced.ts)
  elasticsearch_get_mappings (get_mappings.ts)
  elasticsearch_indices_summary (indices_summary.ts)
  elasticsearch_get_shards (get_shards.ts)

### index_management (0/10 - 0.0%)
  elasticsearch_flush_index (flush_index.ts)
  elasticsearch_reindex_documents (reindex_documents.ts)
  elasticsearch_put_mapping (put_mapping.ts)
  elasticsearch_index_exists (index_exists.ts)
  elasticsearch_refresh_index (refresh_index.ts)
  elasticsearch_delete_index (delete_index.ts)
  elasticsearch_update_index_settings (update_index_settings.ts)
  elasticsearch_create_index (create_index.ts)
  elasticsearch_get_index (get_index.ts)
  elasticsearch_get_index_settings (get_index_settings.ts)

### watcher (0/13 - 0.0%)
  elasticsearch_watcher_get_watch (get_watch.ts)
  elasticsearch_watcher_deactivate_watch (deactivate_watch.ts)
  elasticsearch_watcher_stats (stats.ts)
  elasticsearch_watcher_delete_watch (delete_watch.ts)
  elasticsearch_watcher_update_settings (update_settings.ts)
  elasticsearch_watcher_put_watch (put_watch.ts)
  elasticsearch_watcher_activate_watch (activate_watch.ts)
  elasticsearch_watcher_start (start.ts)
  elasticsearch_watcher_stop (stop.ts)
  elasticsearch_watcher_query_watches (query_watches.ts)
  elasticsearch_watcher_execute_watch (execute_watch.ts)
  elasticsearch_watcher_get_settings (get_settings.ts)
  elasticsearch_watcher_ack_watch (ack_watch.ts)

### template (0/6 - 0.0%)
  elasticsearch_put_index_template (put_index_template.ts)
  elasticsearch_search_template (search_template.ts)
  elasticsearch_get_index_template (get_index_template_old.ts)
  elasticsearch_multi_search_template (multi_search_template.ts)
  elasticsearch_delete_index_template (delete_index_template.ts)
  elasticsearch_get_index_template (get_index_template_improved.ts)

### document (1/5 - 20.0%)
  elasticsearch_delete_document (delete_document.ts)
  elasticsearch_update_document (update_document.ts)
  elasticsearch_index_document (index_document.ts)
  elasticsearch_document_exists (document_exists.ts)
  elasticsearch_get_document (get_document.ts)

### search (0/6 - 0.0%)
  elasticsearch_clear_scroll (clear_scroll.ts)
  elasticsearch_scroll_search (scroll_search.ts)
  elasticsearch_execute_sql_query (execute_sql_query.ts)
  elasticsearch_count_documents (count_documents.ts)
  elasticsearch_update_by_query (update_by_query.ts)
  elasticsearch_multi_search (multi_search.ts)

### enrich (0/6 - 0.0%)
  elasticsearch_enrich_execute_policy (execute_policy.ts)
  elasticsearch_enrich_put_policy (put_policy.ts)
  elasticsearch_enrich_stats (stats.ts)
  elasticsearch_enrich_delete_policy (delete_policy.ts)
  elasticsearch_enrich_get_policy (get_policy_improved.ts)
  elasticsearch_enrich_get_policy (get_policy_old.ts)

### autoscaling (0/4 - 0.0%)
  elasticsearch_autoscaling_put_policy (put_policy.ts)
  elasticsearch_autoscaling_get_policy (get_policy.ts)
  elasticsearch_autoscaling_get_capacity (get_capacity.ts)
  elasticsearch_autoscaling_delete_policy (delete_policy.ts)

### ilm (0/12 - 0.0%)
  elasticsearch_ilm_remove_policy (remove_policy.ts)
  elasticsearch_ilm_retry (retry.ts)
  elasticsearch_ilm_get_lifecycle (get_lifecycle_old.ts)
  elasticsearch_ilm_start (start.ts)
  elasticsearch_ilm_stop (stop.ts)
  elasticsearch_ilm_explain_lifecycle (explain_lifecycle.ts)
  elasticsearch_ilm_migrate_to_data_tiers (migrate_to_data_tiers.ts)
  elasticsearch_ilm_delete_lifecycle (delete_lifecycle.ts)
  elasticsearch_ilm_move_to_step (move_to_step.ts)
  elasticsearch_ilm_get_lifecycle (get_lifecycle_improved.ts)
  elasticsearch_ilm_get_status (get_status.ts)
  elasticsearch_ilm_put_lifecycle (put_lifecycle.ts)

### analytics (0/2 - 0.0%)
  elasticsearch_get_term_vectors (get_term_vectors.ts)
  elasticsearch_get_multi_term_vectors (get_multi_term_vectors.ts)

## Testing Priority Recommendations

### High Priority (Core Read Operations):
- elasticsearch_indices_summary (core/indices_summary.ts)
- elasticsearch_get_shards (core/get_shards.ts)
- elasticsearch_document_exists (document/document_exists.ts)
- elasticsearch_get_document (document/get_document.ts)
- elasticsearch_clear_scroll (search/clear_scroll.ts)
- elasticsearch_scroll_search (search/scroll_search.ts)
- elasticsearch_execute_sql_query (search/execute_sql_query.ts)
- elasticsearch_count_documents (search/count_documents.ts)
- elasticsearch_multi_search (search/multi_search.ts)

### Medium Priority (Index Management):
- elasticsearch_clear_sql_cursor (mapping/clear_sql_cursor.ts)
- elasticsearch_get_field_mapping (mapping/get_field_mapping.ts)
- elasticsearch_exists_alias (indices/exists_alias.ts)
- elasticsearch_field_usage_stats (indices/field_usage_stats.ts)
- elasticsearch_get_index_info (indices/get_index_info.ts)
- elasticsearch_exists_template (indices/exists_template.ts)
- elasticsearch_disk_usage (indices/disk_usage.ts)
- elasticsearch_exists_index_template (indices/exists_index_template.ts)
- elasticsearch_get_index_settings_advanced (indices/get_index_settings_advanced.ts)
- elasticsearch_explain_data_lifecycle (indices/explain_data_lifecycle.ts)

### Low Priority (Destructive/Advanced):
- elasticsearch_delete_by_query (advanced/delete_by_query.ts)
- elasticsearch_update_aliases (alias/update_aliases.ts)
- elasticsearch_delete_alias (alias/delete_alias.ts)
- elasticsearch_put_alias (alias/put_alias.ts)
- elasticsearch_rollover (indices/rollover.ts)
- elasticsearch_bulk_operations (bulk/bulk_operations.ts)
- elasticsearch_flush_index (index_management/flush_index.ts)
- elasticsearch_reindex_documents (index_management/reindex_documents.ts)
- elasticsearch_put_mapping (index_management/put_mapping.ts)
- elasticsearch_refresh_index (index_management/refresh_index.ts)

## Recommended Testing Strategy

1. **Core Operations First**: Focus on search, get, list operations
2. **Use Test Indices**: Create temporary indices for each test run
3. **Test Categories**:
   - Read operations: Safe to test on any cluster
   - Write operations: Use dedicated test indices
   - Destructive operations: Test in isolated environment
4. **Data Requirements**:
   - Create fixtures with realistic data
   - Test edge cases (empty results, large datasets, errors)
5. **Coverage Goals**:
   - 100% for core read operations
   - 80% for index management
   - 60% for advanced/destructive operations

