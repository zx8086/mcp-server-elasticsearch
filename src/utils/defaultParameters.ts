/* src/utils/defaultParameters.ts */

/**
 * Default parameter suggestions for common Elasticsearch operations
 * These help LLMs understand what parameters to use when they're unsure
 */

export const DEFAULT_PARAMETERS: Record<string, any> = {
  // List indices - always needs a pattern
  elasticsearch_list_indices: {
    indexPattern: "*",  // List all indices by default
    limit: 50,
    excludeSystemIndices: true,
    excludeDataStreams: false,
    sortBy: "name",
  },
  
  // Search - always needs index and queryBody
  elasticsearch_search: {
    index: "*",  // Search all indices by default
    queryBody: {
      query: {
        match_all: {}  // Match all documents
      },
      size: 10,
    },
  },
  
  // Execute SQL - always needs a query
  elasticsearch_execute_sql_query: {
    query: "SELECT * FROM * LIMIT 10",  // Basic query to list data
  },
  
  // Get mappings - needs an index
  elasticsearch_get_mappings: {
    index: "*",  // Get mappings for all indices
    summarize: true,
  },
  
  // ILM explain - needs an index
  elasticsearch_ilm_explain_lifecycle: {
    index: "*",  // Explain all indices
    onlyErrors: false,
    onlyManaged: true,
  },
  
  // ILM get lifecycle
  elasticsearch_ilm_get_lifecycle: {
    policyName: "*",  // Get all policies
    summarize: true,
  },
  
  // Get nodes info - can work with defaults
  elasticsearch_get_nodes_info: {
    // No parameters needed, will get all nodes
  },
  
  // Get cluster health - no params needed
  elasticsearch_get_cluster_health: {
    // No parameters needed
  },
  
  // Get shards
  elasticsearch_get_shards: {
    index: "*",
    summarize: true,
  },
  
  // Indices summary
  elasticsearch_indices_summary: {
    indexPattern: "*",
    groupBy: "prefix",
  },
  
  // Count documents
  elasticsearch_count_documents: {
    index: "*",
    query: {
      match_all: {}
    },
  },
  
  // Index document - needs index, id, and document
  elasticsearch_index_document: {
    index: "test-index",
    document: {
      "message": "Example document",
      "@timestamp": new Date().toISOString(),
    },
  },
  
  // Get document - needs index and id
  elasticsearch_get_document: {
    index: "test-index",
    id: "1",
  },
  
  // Delete by query - needs index and query
  elasticsearch_delete_by_query: {
    index: "test-index",
    query: {
      match: {
        field: "value"
      }
    },
  },
  
  // Update by query - needs index and query
  elasticsearch_update_by_query: {
    index: "test-index",
    query: {
      match_all: {}
    },
  },
  
  // Reindex - needs source and destination
  elasticsearch_reindex_documents: {
    source: {
      index: "source-index"
    },
    destination: {
      index: "destination-index"
    },
  },
  
  // Create index - needs index name
  elasticsearch_create_index: {
    index: "new-index",
  },
  
  // Delete index - needs index name
  elasticsearch_delete_index: {
    index: "index-to-delete",
  },
  
  // Refresh index
  elasticsearch_refresh_index: {
    index: "*",
  },
  
  // Flush index
  elasticsearch_flush_index: {
    index: "*",
  },
  
  // Get aliases
  elasticsearch_get_aliases: {
    index: "*",
    summarize: true,
  },
  
  // Get index - needs index name
  elasticsearch_get_index: {
    index: "*",
    ignoreUnavailable: true,
    allowNoIndices: true,
  },
  
  // Get index info - comprehensive index information
  elasticsearch_get_index_info: {
    index: "*",
    ignoreUnavailable: true,
    allowNoIndices: true,
  },
  
  // Get index template
  elasticsearch_get_index_template: {
    name: "*",
    summarize: true,
  },
  
  // List tasks
  elasticsearch_list_tasks: {
    detailed: true,
    groupBy: "parents",
  },
  
  // Field usage stats
  elasticsearch_field_usage_stats: {
    index: "*",
  },
  
  // Disk usage
  elasticsearch_disk_usage: {
    index: "*",
    runExpensiveTasks: false,
  },
  
  // Enrich get policy
  elasticsearch_enrich_get_policy: {
    name: "*",
    summarize: true,
  },
  
  // Watcher get watch
  elasticsearch_watcher_get_watch: {
    id: "*",
  },
  
  // Watcher query watches
  elasticsearch_watcher_query_watches: {
    size: 10,
  },
  
  // Cluster tools - all optional params
  elasticsearch_get_cluster_health: {
    // All parameters are optional
  },
  elasticsearch_get_cluster_stats: {
    // All parameters are optional
  },
  elasticsearch_get_nodes_info: {
    // All parameters are optional
  },
  elasticsearch_get_nodes_stats: {
    // All parameters are optional
  },
  
  // More search tools
  elasticsearch_multi_search: {
    searches: [
      { index: "*", query: { match_all: {} } }
    ]
  },
  elasticsearch_scroll_search: {
    scroll: "1m",
    scrollId: null, // Will need to be provided
  },
  elasticsearch_clear_scroll: {
    scrollId: null, // Will need to be provided
  },
  
  // ILM tools
  elasticsearch_ilm_get_status: {
    // No parameters needed
  },
  elasticsearch_ilm_start: {
    // No parameters needed
  },
  elasticsearch_ilm_stop: {
    // No parameters needed
  },
  elasticsearch_ilm_put_lifecycle: {
    policyName: "example-policy",
    policy: {
      phases: {
        hot: {
          actions: {
            rollover: {
              max_age: "30d",
              max_size: "50gb"
            }
          }
        }
      }
    }
  },
  elasticsearch_ilm_delete_lifecycle: {
    policyName: null, // Will need to be provided
  },
  elasticsearch_ilm_retry: {
    index: "*",
  },
  elasticsearch_ilm_remove_policy: {
    index: null, // Will need to be provided
  },
  
  // Watcher tools
  elasticsearch_watcher_start: {
    // No parameters needed
  },
  elasticsearch_watcher_stop: {
    // No parameters needed
  },
  elasticsearch_watcher_stats: {
    // All parameters are optional
  },
  elasticsearch_watcher_get_settings: {
    // No parameters needed
  },
  
  // Bulk operations
  elasticsearch_bulk_operations: {
    operations: [], // Will need to be provided
  },
  elasticsearch_multi_get: {
    docs: [], // Will need to be provided
  },
  
  // Tasks
  elasticsearch_list_tasks: {
    detailed: true,
    groupBy: "parents",
  },
  elasticsearch_tasks_get_task: {
    taskId: null, // Will need to be provided
  },
  elasticsearch_tasks_cancel_task: {
    taskId: null, // Will need to be provided
  },
  
  // Advanced tools
  elasticsearch_translate_sql_query: {
    query: "SELECT * FROM * LIMIT 10",
  },
  
  // Analytics
  elasticsearch_get_term_vectors: {
    index: "*",
    id: null, // Will need to be provided if not using doc
  },
  elasticsearch_get_multi_term_vectors: {
    docs: [], // Will need to be provided
  },
  
  // Enrich tools
  elasticsearch_enrich_get_policy: {
    name: "*",
    summarize: true,
  },
  elasticsearch_enrich_execute_policy: {
    name: null, // Will need to be provided
  },
  elasticsearch_enrich_stats: {
    // All parameters are optional
  },
  
  // Autoscaling (for cloud deployments)
  elasticsearch_autoscaling_get_capacity: {
    // All parameters are optional
  },
};

/**
 * Get suggested parameters for a tool if the provided params are empty or invalid
 */
export function getSuggestedParameters(toolName: string, providedParams: any): any {
  // Check if we have defaults for this tool
  const defaults = DEFAULT_PARAMETERS[toolName];
  
  if (!defaults) {
    return null;
  }
  
  // If no params provided or empty object, return defaults
  if (!providedParams || (typeof providedParams === "object" && Object.keys(providedParams).length === 0)) {
    return defaults;
  }
  
  // Merge defaults with provided params (provided params take precedence)
  return { ...defaults, ...providedParams };
}

/**
 * Check if a tool typically needs parameters
 */
export function toolNeedsParameters(toolName: string): boolean {
  // Tools that work fine with empty {} or need defaults applied
  const needsParams = [
    // Core tools
    "elasticsearch_list_indices",
    "elasticsearch_search",
    "elasticsearch_get_mappings",
    "elasticsearch_get_shards",
    "elasticsearch_indices_summary",
    "elasticsearch_get_index",
    
    // Search tools
    "elasticsearch_execute_sql_query",
    "elasticsearch_count_documents",
    "elasticsearch_update_by_query",
    "elasticsearch_delete_by_query",
    "elasticsearch_multi_search",
    "elasticsearch_translate_sql_query",
    
    // Index management
    "elasticsearch_index_document",
    "elasticsearch_get_document",
    "elasticsearch_delete_document",
    "elasticsearch_update_document",
    "elasticsearch_document_exists",
    "elasticsearch_create_index",
    "elasticsearch_delete_index",
    "elasticsearch_refresh_index",
    "elasticsearch_flush_index",
    "elasticsearch_reindex_documents",
    "elasticsearch_get_index_info",
    
    // ILM tools
    "elasticsearch_ilm_explain_lifecycle",
    "elasticsearch_ilm_get_lifecycle",
    "elasticsearch_ilm_retry",
    
    // Templates
    "elasticsearch_get_index_template",
    "elasticsearch_search_template",
    "elasticsearch_multi_search_template",
    
    // Aliases
    "elasticsearch_get_aliases",
    
    // Watcher
    "elasticsearch_watcher_get_watch",
    "elasticsearch_watcher_query_watches",
    
    // Cluster tools (all work with empty {})
    "elasticsearch_get_cluster_health",
    "elasticsearch_get_cluster_stats",
    "elasticsearch_get_nodes_info",
    "elasticsearch_get_nodes_stats",
    
    // Tasks
    "elasticsearch_list_tasks",
    
    // Analytics
    "elasticsearch_get_term_vectors",
    
    // Enrich
    "elasticsearch_enrich_get_policy",
    "elasticsearch_enrich_stats",
    
    // Field tools
    "elasticsearch_field_usage_stats",
    "elasticsearch_disk_usage",
  ];
  
  return needsParams.includes(toolName);
}

/**
 * Get a helpful message about required parameters
 */
export function getParameterHelpMessage(toolName: string): string | null {
  const messages: Record<string, string> = {
    elasticsearch_list_indices: "This tool requires an index pattern. Use '*' to list all indices, or specify a pattern like 'logs-*'.",
    elasticsearch_search: "This tool requires an index and queryBody. Use index='*' and queryBody={query:{match_all:{}}} to search all indices.",
    elasticsearch_execute_sql_query: "This tool requires a SQL query string. Example: 'SELECT * FROM my-index LIMIT 10'",
    elasticsearch_get_mappings: "This tool requires an index pattern. Use '*' to get mappings for all indices.",
    elasticsearch_get_index: "This tool requires an index pattern. Use '*' to get information for all indices.",
    elasticsearch_ilm_explain_lifecycle: "This tool requires an index pattern. Use '*' to explain lifecycle for all indices.",
    elasticsearch_index_document: "This tool requires an index name and a document to index.",
    elasticsearch_get_document: "This tool requires an index name and document ID.",
    elasticsearch_delete_by_query: "This tool requires an index pattern and a query to match documents to delete.",
    elasticsearch_update_by_query: "This tool requires an index pattern and a query to match documents to update.",
    elasticsearch_reindex_documents: "This tool requires source and destination index configurations.",
    elasticsearch_create_index: "This tool requires an index name to create.",
    elasticsearch_delete_index: "This tool requires an index name to delete.",
  };
  
  return messages[toolName] || null;
}