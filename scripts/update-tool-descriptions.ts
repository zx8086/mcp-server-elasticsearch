#!/usr/bin/env bun

import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface ToolUpdate {
  file: string;
  toolName: string;
  category: string;
  updates: string[];
}

// Map of tool names to their typical use cases and default behavior
const TOOL_DEFAULTS: Record<string, { defaults: string; usage: string }> = {
  // Core tools
  elasticsearch_list_indices: {
    defaults: "indexPattern='*', limit=50, excludeSystemIndices=true",
    usage: "listing all indices with sensible filters",
  },
  elasticsearch_search: {
    defaults: "index='*', queryBody={query:{match_all:{}}, size:10}",
    usage: "searching all indices with match_all query",
  },
  elasticsearch_get_mappings: {
    defaults: "index='*', summarize=true",
    usage: "getting mappings for all indices",
  },
  elasticsearch_get_shards: {
    defaults: "index='*', summarize=true",
    usage: "getting shard information for all indices",
  },
  elasticsearch_indices_summary: {
    defaults: "indexPattern='*', groupBy='prefix'",
    usage: "summarizing all indices",
  },

  // Document tools
  elasticsearch_get_document: {
    defaults: "requires index and id",
    usage: "retrieving a specific document",
  },
  elasticsearch_index_document: {
    defaults: "requires index and document",
    usage: "indexing a new document",
  },
  elasticsearch_update_document: {
    defaults: "requires index, id, and doc/script",
    usage: "updating a specific document",
  },
  elasticsearch_delete_document: {
    defaults: "requires index and id",
    usage: "deleting a specific document",
  },
  elasticsearch_document_exists: {
    defaults: "requires index and id",
    usage: "checking if a document exists",
  },

  // Search tools
  elasticsearch_count_documents: {
    defaults: "index='*', query={match_all:{}}",
    usage: "counting all documents",
  },
  elasticsearch_execute_sql_query: {
    defaults: "query='SELECT * FROM * LIMIT 10'",
    usage: "executing a basic SQL query",
  },
  elasticsearch_scroll_search: {
    defaults: "requires scrollId or initial search params",
    usage: "paginating through large result sets",
  },
  elasticsearch_multi_search: {
    defaults: "requires searches array",
    usage: "executing multiple searches",
  },
  elasticsearch_update_by_query: {
    defaults: "index='*', query={match_all:{}}",
    usage: "updating all matching documents",
  },

  // Cluster tools
  elasticsearch_get_cluster_health: {
    defaults: "all parameters optional",
    usage: "getting basic cluster health status",
  },
  elasticsearch_get_cluster_stats: {
    defaults: "all parameters optional",
    usage: "getting comprehensive cluster statistics",
  },
  elasticsearch_get_nodes_info: {
    defaults: "all parameters optional, returns all nodes",
    usage: "getting information about all nodes",
  },
  elasticsearch_get_nodes_stats: {
    defaults: "all parameters optional, returns all nodes",
    usage: "getting statistics for all nodes",
  },

  // Index management
  elasticsearch_get_index: {
    defaults: "index='*', ignoreUnavailable=true, allowNoIndices=true",
    usage: "getting information for all indices",
  },
  elasticsearch_get_index_settings: {
    defaults: "index='*'",
    usage: "getting settings for all indices",
  },
  elasticsearch_index_exists: {
    defaults: "requires index name",
    usage: "checking if an index exists",
  },
  elasticsearch_create_index: {
    defaults: "requires index name",
    usage: "creating a new index",
  },
  elasticsearch_delete_index: {
    defaults: "requires index name",
    usage: "deleting an index",
  },
  elasticsearch_refresh_index: {
    defaults: "index='*'",
    usage: "refreshing all indices",
  },
  elasticsearch_flush_index: {
    defaults: "index='*'",
    usage: "flushing all indices",
  },

  // ILM tools
  elasticsearch_ilm_explain_lifecycle: {
    defaults: "index='*', onlyManaged=true",
    usage: "explaining lifecycle for all managed indices",
  },
  elasticsearch_ilm_get_lifecycle: {
    defaults: "policyName='*', summarize=true",
    usage: "getting all lifecycle policies",
  },
  elasticsearch_ilm_get_status: {
    defaults: "no parameters needed",
    usage: "getting ILM plugin status",
  },
  elasticsearch_ilm_start: {
    defaults: "no parameters needed",
    usage: "starting ILM plugin",
  },
  elasticsearch_ilm_stop: {
    defaults: "no parameters needed",
    usage: "stopping ILM plugin",
  },

  // Template tools
  elasticsearch_get_index_template: {
    defaults: "name='*', summarize=true",
    usage: "getting all index templates",
  },
  elasticsearch_put_index_template: {
    defaults: "requires name and template definition",
    usage: "creating or updating a template",
  },
  elasticsearch_delete_index_template: {
    defaults: "requires template name",
    usage: "deleting a template",
  },

  // Alias tools
  elasticsearch_get_aliases: {
    defaults: "index='*', summarize=true",
    usage: "getting all aliases",
  },
  elasticsearch_put_alias: {
    defaults: "requires index and alias name",
    usage: "creating an alias",
  },
  elasticsearch_delete_alias: {
    defaults: "requires index and alias name",
    usage: "deleting an alias",
  },

  // Watcher tools
  elasticsearch_watcher_get_watch: {
    defaults: "id='*' to get all watches",
    usage: "getting watch definitions",
  },
  elasticsearch_watcher_stats: {
    defaults: "all parameters optional",
    usage: "getting watcher statistics",
  },
  elasticsearch_watcher_start: {
    defaults: "no parameters needed",
    usage: "starting the watcher service",
  },
  elasticsearch_watcher_stop: {
    defaults: "no parameters needed",
    usage: "stopping the watcher service",
  },
};

async function updateToolFile(filePath: string): Promise<ToolUpdate | null> {
  try {
    let content = await readFile(filePath, "utf-8");
    const originalContent = content;

    // Extract tool name
    const toolNameMatch = content.match(/server\.tool\(\s*["']([^"']+)["']/);
    if (!toolNameMatch) return null;

    const toolName = toolNameMatch[1];
    const category = filePath.split("/")[2];
    const updates: string[] = [];

    // Get default info for this tool
    const defaultInfo = TOOL_DEFAULTS[toolName] || {
      defaults: "see parameter descriptions",
      usage: "the default operation",
    };

    // Update tool description to mention empty {} behavior
    const descriptionRegex = /server\.tool\(\s*["']([^"']+)["'],\s*["']([^"']+)["']/;
    const descMatch = content.match(descriptionRegex);

    if (descMatch) {
      const currentDesc = descMatch[2];

      // Check if description already mentions empty {} or defaults
      if (!currentDesc.includes("Empty {}") && !currentDesc.includes("smart defaults")) {
        // Add empty {} and defaults info to description
        const enhancedDesc = currentDesc.replace(
          /\. Use when/,
          `. Empty {} parameters will default to ${defaultInfo.usage}. Use when`,
        );

        const finalDesc = enhancedDesc.includes("Parameters")
          ? enhancedDesc
          : enhancedDesc.replace(/\.$/, `. Parameters have smart defaults: ${defaultInfo.defaults}.`);

        content = content.replace(descriptionRegex, `server.tool(\n    "${toolName}",\n    "${finalDesc}"`);

        updates.push("Updated tool description with empty {} behavior");
      }
    }

    // Add .describe() to parameters that don't have it
    // Look for parameter definitions without .describe()
    const paramPatterns = [
      /z\.string\(\)(?!\.describe)/g,
      /z\.number\(\)(?!\.describe)/g,
      /z\.boolean\(\)(?!\.describe)/g,
      /z\.object\(\{[^}]+\}\)(?!\.describe)/g,
      /z\.array\([^)]+\)(?!\.describe)/g,
      /booleanField\(\)(?!\.describe)/g,
      /integerField\([^)]+\)(?!\.describe)/g,
    ];

    let paramsUpdated = false;
    for (const pattern of paramPatterns) {
      if (pattern.test(content)) {
        paramsUpdated = true;
        break;
      }
    }

    if (paramsUpdated) {
      updates.push("Need to add .describe() to parameters");
    }

    // Only write if changes were made
    if (content !== originalContent) {
      await writeFile(filePath, content, "utf-8");
      return {
        file: filePath,
        toolName,
        category,
        updates,
      };
    }

    return null;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
    return null;
  }
}

async function main() {
  const toolDirs = [
    "src/tools/core",
    "src/tools/document",
    "src/tools/search",
    "src/tools/cluster",
    "src/tools/index_management",
    "src/tools/ilm",
    "src/tools/template",
    "src/tools/bulk",
    "src/tools/alias",
    "src/tools/mapping",
    "src/tools/watcher",
    "src/tools/indices",
    "src/tools/tasks",
    "src/tools/advanced",
    "src/tools/analytics",
    "src/tools/enrich",
    "src/tools/autoscaling",
  ];

  console.log("🔧 Updating tool descriptions...\n");

  const updates: ToolUpdate[] = [];

  for (const dir of toolDirs) {
    try {
      const files = await readdir(dir);

      for (const file of files) {
        if (file.endsWith(".ts") && !file.includes("index") && !file.includes("types")) {
          const filePath = join(dir, file);
          const update = await updateToolFile(filePath);

          if (update) {
            updates.push(update);
            console.log(`✅ Updated ${update.toolName}`);
          }
        }
      }
    } catch (error) {
      console.error(`Error processing ${dir}:`, error);
    }
  }

  console.log(`\n📊 Summary: Updated ${updates.length} tools`);

  // Group by category
  const byCategory = new Map<string, ToolUpdate[]>();
  for (const update of updates) {
    if (!byCategory.has(update.category)) {
      byCategory.set(update.category, []);
    }
    byCategory.get(update.category)!.push(update);
  }

  console.log("\nUpdates by category:");
  for (const [category, tools] of byCategory) {
    console.log(`  ${category}: ${tools.length} tools`);
  }
}

main().catch(console.error);
