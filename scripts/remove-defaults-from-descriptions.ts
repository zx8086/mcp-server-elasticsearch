#!/usr/bin/env bun

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Files identified with default mentions
const filesToUpdate = [
  "src/tools/cluster/get_cluster_health.ts",
  "src/tools/alias/get_aliases_improved.ts",
  "src/tools/indices/get_index_info.ts",
  "src/tools/core/search_enhanced.ts",
  "src/tools/core/search.ts",
  "src/tools/core/list_indices.ts",
  "src/tools/core/get_mappings.ts",
  "src/tools/core/indices_summary.ts",
  "src/tools/core/get_shards.ts",
  "src/tools/index_management/get_index.ts",
  "src/tools/template/get_index_template_improved.ts",
  "src/tools/document/get_document.ts",
  "src/tools/search/execute_sql_query.ts",
  "src/tools/search/count_documents.ts",
  "src/tools/enrich/get_policy_improved.ts",
  "src/tools/ilm/explain_lifecycle.ts",
  "src/tools/ilm/get_lifecycle_improved.ts",
];

async function removeDefaultsFromFile(filePath: string) {
  const fullPath = join(process.cwd(), filePath);
  let content = await readFile(fullPath, "utf-8");
  const originalContent = content;

  // Patterns to replace
  const replacements = [
    // Remove "Default: X" or "Defaults to X" from descriptions
    { pattern: /\. Default(?:s to)?:[^"]*(?=")/g, replacement: "" },
    { pattern: /Default(?:s to)?:[^"]*\./g, replacement: "" },
    { pattern: /\(default:[^)]+\)/g, replacement: "" },

    // Clean up specific problematic patterns
    { pattern: /Defaults to '\*' if not provided\./g, replacement: "" },
    { pattern: /Defaults to '\*' \(all indices\)\./g, replacement: "" },
    { pattern: /Default: \{[^}]+\}\./g, replacement: "" },
    { pattern: /Default: "[^"]+"\./g, replacement: "" },

    // Remove size: 10 mentions in examples
    { pattern: /size: 10(?=[,}\s])/g, replacement: "size: 100" },
    { pattern: /size:10(?=[,}\s])/g, replacement: "size:100" },

    // Fix ES default mentions to be clearer
    { pattern: /\(default is ES default: 10\)/g, replacement: "(ES returns 10 if not specified)" },
    { pattern: /default: 10/g, replacement: "ES default if not specified" },

    // Clean up double spaces that might result
    { pattern: /\s{2,}/g, replacement: " " },
    { pattern: /\.\./g, replacement: "." },
  ];

  for (const { pattern, replacement } of replacements) {
    content = content.replace(pattern, replacement);
  }

  if (content !== originalContent) {
    await writeFile(fullPath, content, "utf-8");
    return true;
  }

  return false;
}

async function main() {
  console.log("🧹 Removing default mentions from descriptions...\n");

  let updatedCount = 0;

  for (const file of filesToUpdate) {
    try {
      const updated = await removeDefaultsFromFile(file);
      if (updated) {
        console.log(`✅ Updated: ${file}`);
        updatedCount++;
      } else {
        console.log(`⏭️  No changes: ${file}`);
      }
    } catch (error) {
      console.log(`❌ Error updating ${file}: ${error.message}`);
    }
  }

  console.log(`\n📊 Summary: Updated ${updatedCount} of ${filesToUpdate.length} files`);
  console.log("\n💡 Next steps:");
  console.log("1. Review the changes to ensure descriptions still make sense");
  console.log("2. Run bun run build to rebuild the project");
  console.log("3. Test that tools still work correctly");
}

main().catch(console.error);
