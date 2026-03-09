# Elasticsearch MCP Server API

Version: 0.1.1

## Overview

Comprehensive Elasticsearch MCP (Model Context Protocol) Server providing 99 tools across 18 categories for enterprise-grade Elasticsearch operations. Built with TypeScript on the Bun runtime.

## Table of Contents

- [Advanced](#advanced) (2 tools)
- [Alias](#alias) (4 tools)
- [Analytics](#analytics) (3 tools)
- [Autoscaling](#autoscaling) (4 tools)
- [Bulk](#bulk) (3 tools)
- [Cluster](#cluster) (4 tools)
- [Core](#core) (5 tools)
- [Diagnostics](#diagnostics) (1 tool)
- [Document](#document) (5 tools)
- [Enrich](#enrich) (5 tools)
- [ILM](#ilm) (11 tools)
- [Index Management](#index-management) (11 tools)
- [Indices](#indices) (10 tools)
- [Mapping](#mapping) (2 tools)
- [Search](#search) (6 tools)
- [Tasks](#tasks) (4 tools)
- [Template](#template) (5 tools)
- [Watcher](#watcher) (13 tools)

---

## Advanced

Advanced Elasticsearch features including SQL translation and delete-by-query operations.

**Available Tools (2):**

### `elasticsearch_delete_by_query`

Delete documents matching a query from an Elasticsearch index. Supports throttling, conflict handling, and asynchronous execution with task tracking.

**Tags:** `advanced`, `destructive`

### `elasticsearch_translate_sql_query`

Translate SQL queries to Elasticsearch Query DSL. Useful for users familiar with SQL who want to understand the equivalent Elasticsearch query structure.

**Tags:** `advanced`, `read`

---

## Alias

Index alias management for zero-downtime deployments and index abstraction.

**Available Tools (4):**

### `elasticsearch_delete_alias`

Delete an alias from an index. Permanently removes alias configuration. Use during maintenance or restructuring.

**Tags:** `alias`, `destructive`

### `elasticsearch_get_aliases`

Get index aliases with pagination and filtering. Supports summary mode and sorting by index count.

**Tags:** `alias`, `read`

### `elasticsearch_put_alias`

Add an alias to an index. Creates named references for easier management and zero-downtime operations.

**Tags:** `alias`, `write`

### `elasticsearch_update_aliases`

Atomically add, remove, or modify multiple index aliases. Supports zero-downtime index switching patterns.

**Tags:** `alias`, `write`

---

## Analytics

Analytics, term vectors, and timestamp analysis operations.

**Available Tools (3):**

### `elasticsearch_analyze_timestamps`

Analyze timestamp distribution in indices to identify data quality issues. Diagnoses why time range queries may return unexpected results.

**Tags:** `analytics`, `read`

### `elasticsearch_get_multi_term_vectors`

Get term vectors for multiple documents. Used for text analysis, similarity calculations, and relevance tuning.

**Tags:** `analytics`, `read`

### `elasticsearch_get_term_vectors`

Get term vectors for a single document including term frequency, positions, and offsets.

**Tags:** `analytics`, `read`

---

## Autoscaling

Autoscaling policy management for Elasticsearch Service, ECE, and ECK environments.

**Available Tools (4):**

### `elasticsearch_autoscaling_delete_policy`

Delete an autoscaling policy.

**Tags:** `autoscaling`, `destructive`

### `elasticsearch_autoscaling_get_capacity`

Get current autoscaling capacity and scaling recommendations.

**Tags:** `autoscaling`, `read`

### `elasticsearch_autoscaling_get_policy`

Retrieve an autoscaling policy for inspection.

**Tags:** `autoscaling`, `read`

### `elasticsearch_autoscaling_put_policy`

Create or update an autoscaling policy.

**Tags:** `autoscaling`, `write`

---

## Bulk

Bulk operations for efficient large-scale data management.

**Available Tools (3):**

### `elasticsearch_bulk_index_with_progress`

Bulk index multiple documents with real-time progress notifications. Processes in batches with progress tracking for long-running operations. Max 1000 documents per call.

**Tags:** `bulk`, `write`

### `elasticsearch_bulk_operations`

Execute bulk operations (index, create, update, delete) in a single API call. Supports mixed operation types.

**Tags:** `bulk`, `write`

### `elasticsearch_multi_get`

Retrieve multiple documents by ID in a single request. More efficient than individual get requests.

**Tags:** `bulk`, `read`

---

## Cluster

Cluster monitoring and health management.

**Available Tools (4):**

### `elasticsearch_get_cluster_health`

Get comprehensive cluster health including node count, shard status, and index-level health. Supports waiting for specific status levels.

**Tags:** `cluster`, `read`

### `elasticsearch_get_cluster_stats`

Get cluster-wide statistics including memory, CPU, storage, and index metrics.

**Tags:** `cluster`, `read`

### `elasticsearch_get_nodes_info`

Get detailed information about cluster nodes including OS, JVM, plugins, and roles. Supports filtering by node ID and info categories.

**Tags:** `cluster`, `read`

### `elasticsearch_get_nodes_stats`

Get node-level statistics including JVM heap, CPU, disk, indexing, and search metrics with trend analysis.

**Tags:** `cluster`, `read`

---

## Core

Essential Elasticsearch operations for daily use.

**Available Tools (5):**

### `elasticsearch_get_mappings`

Get index mappings showing field types and configurations.

**Tags:** `core`, `read`

### `elasticsearch_get_shards`

Get shard allocation information across cluster nodes.

**Tags:** `core`, `read`

### `elasticsearch_indices_summary`

Get a high-level summary of all indices with health, document counts, and storage usage.

**Tags:** `core`, `read`

### `elasticsearch_list_indices`

List all indices with health status, document count, and storage information. Supports filtering and pagination.

**Tags:** `core`, `read`

### `elasticsearch_search`

Search documents with full Query DSL support. Supports aggregations, highlighting, sorting, pagination, and source filtering. Use `size=0` for pure analytics.

**Tags:** `core`, `read`

**Example:**
```json
{
  "index": "logs-*",
  "query": { "range": { "@timestamp": { "gte": "now-24h" } } },
  "size": 50,
  "aggs": { "hourly": { "date_histogram": { "field": "@timestamp", "fixed_interval": "1h" } } }
}
```

---

## Diagnostics

System diagnostics and health monitoring.

**Available Tools (1):**

### `elasticsearch_diagnostics`

Run comprehensive Elasticsearch diagnostics including cluster health, node status, index statistics, and configuration review.

**Tags:** `diagnostics`, `read`

---

## Document

Document CRUD operations.

**Available Tools (5):**

### `elasticsearch_delete_document`

Delete a document by ID from an index.

**Tags:** `document`, `destructive`

### `elasticsearch_document_exists`

Check if a document exists by ID without retrieving it.

**Tags:** `document`, `read`

### `elasticsearch_get_document`

Retrieve a document by ID with optional source filtering.

**Tags:** `document`, `read`

### `elasticsearch_index_document`

Index (create or update) a document in an index.

**Tags:** `document`, `write`

### `elasticsearch_update_document`

Partially update a document using doc or script.

**Tags:** `document`, `write`

---

## Enrich

Enrich processor management for data enrichment pipelines.

**Available Tools (5):**

### `elasticsearch_enrich_delete_policy`

Delete an enrich policy.

**Tags:** `enrich`, `destructive`

### `elasticsearch_enrich_execute_policy`

Execute an enrich policy to create the enrich index from source data.

**Tags:** `enrich`, `write`

### `elasticsearch_enrich_get_policy`

Get enrich policy details with status and configuration.

**Tags:** `enrich`, `read`

### `elasticsearch_enrich_put_policy`

Create or update an enrich policy for match or geo_match enrichment.

**Tags:** `enrich`, `write`

### `elasticsearch_enrich_stats`

Get enrich coordinator and executing policy statistics.

**Tags:** `enrich`, `read`

---

## ILM

Index Lifecycle Management for automated index lifecycle operations.

**Available Tools (11):**

### `elasticsearch_ilm_delete_lifecycle`

Delete an ILM policy. Policy must not be in use by any indices or templates.

**Tags:** `ilm`, `destructive`

### `elasticsearch_ilm_explain_lifecycle`

Get detailed ILM status for indices including current phase, action, and step. Supports filtering and pagination.

**Tags:** `ilm`, `read`

### `elasticsearch_ilm_get_lifecycle`

Get ILM policy definitions with phase configurations and associated indices.

**Tags:** `ilm`, `read`

### `elasticsearch_ilm_get_status`

Get the current ILM operation status (RUNNING, STOPPING, STOPPED).

**Tags:** `ilm`, `read`

### `elasticsearch_ilm_migrate_to_data_tiers`

Migrate ILM policies to use data tiers (hot, warm, cold, frozen) instead of custom node attributes.

**Tags:** `ilm`, `write`

### `elasticsearch_ilm_move_to_step`

Manually move an index to a specific ILM step. Useful for troubleshooting stuck lifecycle operations.

**Tags:** `ilm`, `write`

### `elasticsearch_ilm_put_lifecycle`

Create or update an ILM policy with phase definitions (hot, warm, cold, frozen, delete).

**Tags:** `ilm`, `write`

### `elasticsearch_ilm_remove_policy`

Remove an ILM policy from an index without deleting the policy itself.

**Tags:** `ilm`, `write`

### `elasticsearch_ilm_retry`

Retry a failed ILM step for an index.

**Tags:** `ilm`, `write`

### `elasticsearch_ilm_start`

Start the ILM plugin if it has been stopped.

**Tags:** `ilm`, `write`

### `elasticsearch_ilm_stop`

Stop the ILM plugin. Running policies continue but no new actions are started.

**Tags:** `ilm`, `write`

---

## Index Management

Index creation, configuration, and maintenance operations.

**Available Tools (11):**

### `elasticsearch_create_index`

Create an index with custom settings and mappings.

**Tags:** `index_management`, `write`

### `elasticsearch_delete_index`

Delete an entire index and all its documents. Destructive operation.

**Tags:** `index_management`, `destructive`

### `elasticsearch_flush_index`

Flush an index to ensure all data is written to disk.

**Tags:** `index_management`, `write`

### `elasticsearch_get_index`

Get comprehensive index information including settings, mappings, and aliases.

**Tags:** `index_management`, `read`

### `elasticsearch_get_index_settings`

Get index settings with optional filtering by setting name.

**Tags:** `index_management`, `read`

### `elasticsearch_index_exists`

Check if an index exists without retrieving its data.

**Tags:** `index_management`, `read`

### `elasticsearch_put_mapping`

Update field mappings for an existing index. Supports adding new fields; existing field type changes are restricted.

**Tags:** `index_management`, `write`

### `elasticsearch_refresh_index`

Refresh an index to make recently indexed documents immediately searchable.

**Tags:** `index_management`, `write`

### `elasticsearch_reindex_documents`

Reindex documents from one index to another with query filtering and pipeline support.

**Tags:** `index_management`, `write`

### `elasticsearch_reindex_with_notifications`

Reindex with comprehensive progress notifications. Supports sync and async modes with real-time progress tracking.

**Tags:** `index_management`, `write`

### `elasticsearch_update_index_settings`

Update dynamic index settings (replicas, refresh interval, etc.).

**Tags:** `index_management`, `write`

---

## Indices

Index-specific information and lifecycle operations.

**Available Tools (10):**

### `elasticsearch_disk_usage`

Analyze disk usage for an index including field-level storage breakdown.

**Tags:** `indices`, `read`

### `elasticsearch_exists_alias`

Check if an index alias exists.

**Tags:** `indices`, `read`

### `elasticsearch_exists_index_template`

Check if a composable index template exists.

**Tags:** `indices`, `read`

### `elasticsearch_exists_template`

Check if a legacy index template exists.

**Tags:** `indices`, `read`

### `elasticsearch_explain_data_lifecycle`

Explain the data lifecycle status for data stream backing indices.

**Tags:** `indices`, `read`

### `elasticsearch_field_usage_stats`

Get field usage statistics showing which fields are actively queried or aggregated.

**Tags:** `indices`, `read`

### `elasticsearch_get_data_lifecycle_stats`

Get data lifecycle statistics for data streams.

**Tags:** `indices`, `read`

### `elasticsearch_get_index_info`

Get detailed index information including mappings, settings, aliases, and statistics.

**Tags:** `indices`, `read`

### `elasticsearch_get_index_settings_advanced`

Get advanced index settings with detailed breakdowns and analysis.

**Tags:** `indices`, `read`

### `elasticsearch_rollover`

Roll over a data stream or index alias to a new backing index based on age, size, or document count conditions.

**Tags:** `indices`, `write`

---

## Mapping

Field mapping inspection and SQL cursor management.

**Available Tools (2):**

### `elasticsearch_clear_sql_cursor`

Close an open SQL cursor to release server resources.

**Tags:** `mapping`, `write`

### `elasticsearch_get_field_mapping`

Get mapping information for specific fields across one or more indices.

**Tags:** `mapping`, `read`

---

## Search

Advanced search capabilities including SQL, scrolling, and multi-search.

**Available Tools (6):**

### `elasticsearch_clear_scroll`

Clear a scroll context to release server resources.

**Tags:** `search`, `write`

### `elasticsearch_count_documents`

Count documents matching a query without returning document data.

**Tags:** `search`, `read`

### `elasticsearch_execute_sql_query`

Execute SQL queries against Elasticsearch with configurable result formats.

**Tags:** `search`, `read`

### `elasticsearch_multi_search`

Execute multiple search requests in a single API call. More efficient than individual searches.

**Tags:** `search`, `read`

### `elasticsearch_scroll_search`

Perform paginated search using scroll API for retrieving large result sets beyond 10,000 documents.

**Tags:** `search`, `read`

### `elasticsearch_update_by_query`

Update documents matching a query using a script. Supports throttling and conflict handling.

**Tags:** `search`, `write`

---

## Tasks

Task monitoring and control for long-running operations.

**Available Tools (4):**

### `elasticsearch_cancel_task`

Cancel a running task. Use to terminate long-running or resource-intensive operations.

**Tags:** `tasks`, `write`

### `elasticsearch_get_task`

Get information about a specific task by ID. Use for monitoring operation progress.

**Tags:** `tasks`, `read`

### `elasticsearch_list_tasks`

List all currently running tasks across the cluster with optional filtering.

**Tags:** `tasks`, `read`

### `elasticsearch_tasks_get_task`

Get detailed task information including status, progress, and parent task relationships.

**Tags:** `tasks`, `read`

---

## Template

Index template management for automated index configuration.

**Available Tools (5):**

### `elasticsearch_delete_index_template`

Delete a composable index template.

**Tags:** `template`, `destructive`

### `elasticsearch_get_index_template`

Get composable index template definitions with detailed configuration.

**Tags:** `template`, `read`

### `elasticsearch_multi_search_template`

Execute multiple search template requests in a single API call.

**Tags:** `template`, `read`

### `elasticsearch_put_index_template`

Create or update a composable index template with index patterns, mappings, and settings.

**Tags:** `template`, `write`

### `elasticsearch_search_template`

Execute a search using a stored or inline search template with parameters.

**Tags:** `template`, `read`

---

## Watcher

Alerting and watch management for automated monitoring and notifications.

**Available Tools (13):**

### `elasticsearch_watcher_ack_watch`

Acknowledge a watch to prevent repeated notifications until the condition changes.

**Tags:** `watcher`, `write`

### `elasticsearch_watcher_activate_watch`

Activate a previously deactivated watch.

**Tags:** `watcher`, `write`

### `elasticsearch_watcher_deactivate_watch`

Deactivate a watch to temporarily stop execution without deleting it.

**Tags:** `watcher`, `write`

### `elasticsearch_watcher_delete_watch`

Delete a watch definition.

**Tags:** `watcher`, `destructive`

### `elasticsearch_watcher_execute_watch`

Manually execute a watch to test conditions and actions.

**Tags:** `watcher`, `write`

### `elasticsearch_watcher_get_settings`

Get watcher service settings.

**Tags:** `watcher`, `read`

### `elasticsearch_watcher_get_watch`

Get a watch definition by ID.

**Tags:** `watcher`, `read`

### `elasticsearch_watcher_put_watch`

Create or update a watch with trigger, input, condition, and actions.

**Tags:** `watcher`, `write`

### `elasticsearch_watcher_query_watches`

Query watches with filtering and pagination.

**Tags:** `watcher`, `read`

### `elasticsearch_watcher_start`

Start the watcher service.

**Tags:** `watcher`, `write`

### `elasticsearch_watcher_stats`

Get watcher service statistics including execution metrics.

**Tags:** `watcher`, `read`

### `elasticsearch_watcher_stop`

Stop the watcher service.

**Tags:** `watcher`, `write`

### `elasticsearch_watcher_update_settings`

Update watcher service settings.

**Tags:** `watcher`, `write`

---

## Architecture

### Security
- **Read-Only Mode**: Strict or warning modes to prevent write operations in production monitoring
- **Input Validation**: SQL injection, XSS, and command injection detection with Elasticsearch-specific exemptions

### Observability
- **LangSmith Tracing**: Automatic tracing of all tool executions with dynamic tool names
- **Structured Logging**: MCP-compatible logging with configurable log levels

### Transport
- **stdio**: Standard I/O for CLI and desktop integration (default)
- **SSE**: Server-Sent Events for web integration (e.g., n8n)

### Error Handling
All tools return standardized MCP-compliant errors using `McpError` with appropriate error codes:
- `ErrorCode.InvalidParams` for validation failures
- `ErrorCode.InvalidRequest` for not-found or conflict errors
- `ErrorCode.InternalError` for execution failures
