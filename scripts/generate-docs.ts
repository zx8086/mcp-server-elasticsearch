#!/usr/bin/env bun

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getAllTools } from "../src/tools/index.js";

async function generateDocumentation() {
  console.log("Generating API documentation from tool definitions...");

  const allTools = getAllTools();
  console.log(`Found ${allTools.length} tools to document`);

  const outputDir = path.resolve("docs/api");
  mkdirSync(outputDir, { recursive: true });

  // Group tools by category
  const categories: Record<string, typeof allTools> = {};
  for (const tool of allTools) {
    const category = getCategoryFromToolName(tool.name);
    if (!categories[category]) categories[category] = [];
    categories[category].push(tool);
  }

  // Generate simple markdown documentation
  let markdown = `# Elasticsearch MCP Server API\n\n`;
  markdown += `**Total tools:** ${allTools.length}\n\n`;
  markdown += `## Table of Contents\n\n`;

  for (const category of Object.keys(categories).sort()) {
    markdown += `- [${category}](#${category.toLowerCase().replace(/\s+/g, "-")}) (${categories[category].length} tools)\n`;
  }

  markdown += `\n---\n\n`;

  for (const [category, tools] of Object.entries(categories).sort(([a], [b]) => a.localeCompare(b))) {
    markdown += `## ${category}\n\n`;
    for (const tool of tools.sort((a, b) => a.name.localeCompare(b.name))) {
      markdown += `### \`${tool.name}\`\n\n`;
      markdown += `${tool.description}\n\n`;
    }
  }

  writeFileSync(path.join(outputDir, "tools.md"), markdown);
  console.log(`Documentation written to ${outputDir}/tools.md`);
}

function getCategoryFromToolName(toolName: string): string {
  const prefixMap: Record<string, string> = {
    elasticsearch_search: "Search",
    elasticsearch_list_indices: "Core",
    elasticsearch_get_mappings: "Core",
    elasticsearch_get_shards: "Core",
    elasticsearch_indices_summary: "Core",
    elasticsearch_index_document: "Document",
    elasticsearch_get_document: "Document",
    elasticsearch_update_document: "Document",
    elasticsearch_delete_document: "Document",
    elasticsearch_document_exists: "Document",
    elasticsearch_create_index: "Index Management",
    elasticsearch_delete_index: "Index Management",
    elasticsearch_get_cluster_health: "Cluster",
    elasticsearch_get_cluster_stats: "Cluster",
    elasticsearch_get_nodes_info: "Cluster",
    elasticsearch_get_nodes_stats: "Cluster",
    elasticsearch_bulk: "Bulk",
    elasticsearch_multi_get: "Bulk",
  };

  if (prefixMap[toolName]) return prefixMap[toolName];

  if (toolName.includes("ilm_")) return "ILM";
  if (toolName.includes("watcher_")) return "Watcher";
  if (toolName.includes("alias")) return "Aliases";
  if (toolName.includes("template")) return "Templates";
  if (toolName.includes("enrich_")) return "Enrich";
  if (toolName.includes("autoscaling_")) return "Autoscaling";
  if (toolName.includes("search") || toolName.includes("scroll") || toolName.includes("sql")) return "Search";
  if (toolName.includes("index")) return "Index Management";

  return "Advanced";
}

if (import.meta.main) {
  generateDocumentation().catch(console.error);
}
