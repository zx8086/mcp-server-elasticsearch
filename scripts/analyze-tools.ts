#!/usr/bin/env bun

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

interface ToolInfo {
  file: string;
  name: string;
  hasEmptyParamsSupport: boolean;
  requiresParams: boolean;
  description: string;
  hasDescribeOnParams: boolean;
}

async function analyzeTools() {
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

  const tools: ToolInfo[] = [];

  for (const dir of toolDirs) {
    try {
      const files = await readdir(dir);

      for (const file of files) {
        if (file.endsWith(".ts") && !file.includes("index") && !file.includes("types")) {
          const filePath = join(dir, file);
          const content = await readFile(filePath, "utf-8");

          // Extract tool name
          const toolNameMatch = content.match(/server\.tool\(\s*["']([^"']+)["']/);
          const toolName = toolNameMatch ? toolNameMatch[1] : file.replace(".ts", "");

          // Check if description mentions empty params or defaults
          const hasEmptyParamsSupport =
            content.includes("Empty {}") ||
            content.includes("empty {}") ||
            content.includes("defaults:") ||
            content.includes("smart defaults");

          // Check if has required params without defaults
          const hasRequired = content.includes(".min(1") || content.includes("is required");
          const hasDefaults = content.includes(".default(") || content.includes("booleanField(");
          const requiresParams = hasRequired && !hasDefaults;

          // Extract description
          const descMatch = content.match(/server\.tool\(\s*["'][^"']+["'],\s*["']([^"']+)["']/);
          const description = descMatch ? `${descMatch[1].substring(0, 100)}...` : "No description";

          // Check if parameters have .describe()
          const hasDescribeOnParams = content.includes(".describe(");

          tools.push({
            file: filePath,
            name: toolName,
            hasEmptyParamsSupport,
            requiresParams,
            description,
            hasDescribeOnParams,
          });
        }
      }
    } catch (error) {
      console.error(`Error processing ${dir}:`, error);
    }
  }

  // Group and display results
  console.log("\n=== TOOLS ANALYSIS ===\n");

  const needsUpdate = tools.filter((t) => !t.hasEmptyParamsSupport || !t.hasDescribeOnParams);
  const upToDate = tools.filter((t) => t.hasEmptyParamsSupport && t.hasDescribeOnParams);

  console.log(`Total tools: ${tools.length}`);
  console.log(`Need updates: ${needsUpdate.length}`);
  console.log(`Up to date: ${upToDate.length}`);

  console.log("\n=== TOOLS NEEDING UPDATES ===\n");

  const byCategory = new Map<string, ToolInfo[]>();

  for (const tool of needsUpdate) {
    const category = tool.file.split("/")[2];
    if (!byCategory.has(category)) {
      byCategory.set(category, []);
    }
    byCategory.get(category)!.push(tool);
  }

  for (const [category, tools] of byCategory) {
    console.log(`\n${category.toUpperCase()}:`);
    for (const tool of tools) {
      const issues = [];
      if (!tool.hasEmptyParamsSupport) issues.push("needs empty {} support");
      if (!tool.hasDescribeOnParams) issues.push("needs param descriptions");
      console.log(`  - ${tool.name}: ${issues.join(", ")}`);
    }
  }

  // List tools that might need defaults in defaultParameters.ts
  console.log("\n=== TOOLS THAT MAY NEED DEFAULT PARAMETERS ===\n");

  const needsDefaults = tools.filter((t) => t.requiresParams && !t.hasEmptyParamsSupport);
  for (const tool of needsDefaults) {
    console.log(`  - ${tool.name}`);
  }
}

analyzeTools().catch(console.error);
