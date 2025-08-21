#!/usr/bin/env bun

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

interface FieldUsage {
  file: string;
  line: number;
  field: string;
  type: "integer" | "boolean" | "number" | "json";
  hasDefault: boolean;
  defaultValue?: any;
  code: string;
}

async function analyzeFile(filePath: string): Promise<FieldUsage[]> {
  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const usages: FieldUsage[] = [];

  const patterns = [
    {
      regex: /integerField\(\{([^}]*)\}\)/g,
      type: "integer" as const,
    },
    {
      regex: /booleanField\((true|false)\)/g,
      type: "boolean" as const,
    },
    {
      regex: /numberField\(\{([^}]*)\}\)/g,
      type: "number" as const,
    },
    {
      regex: /jsonField\(([^)]*)\)/g,
      type: "json" as const,
    },
  ];

  lines.forEach((line, index) => {
    for (const pattern of patterns) {
      const matches = [...line.matchAll(pattern.regex)];
      for (const match of matches) {
        const params = match[1];
        let hasDefault = false;
        let defaultValue = undefined;

        if (pattern.type === "boolean") {
          // booleanField(true) or booleanField(false)
          hasDefault = true;
          defaultValue = params === "true";
        } else if (params) {
          // Check for default in object params
          const defaultMatch = params.match(/default:\s*([^,}]+)/);
          if (defaultMatch) {
            hasDefault = true;
            defaultValue = defaultMatch[1].trim();
          }
        }

        // Extract field name from the line (look backwards for property name)
        const fieldMatch = lines
          .slice(Math.max(0, index - 2), index + 1)
          .join("\n")
          .match(/(\w+):\s*(integerField|booleanField|numberField|jsonField)/);
        const fieldName = fieldMatch ? fieldMatch[1] : "unknown";

        if (hasDefault) {
          usages.push({
            file: filePath,
            line: index + 1,
            field: fieldName,
            type: pattern.type,
            hasDefault,
            defaultValue,
            code: line.trim(),
          });
        }
      }
    }
  });

  return usages;
}

async function analyzeAllTools() {
  const toolsDir = join(process.cwd(), "src", "tools");
  const results: FieldUsage[] = [];

  async function scanDir(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await scanDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        const usages = await analyzeFile(fullPath);
        results.push(...usages);
      }
    }
  }

  await scanDir(toolsDir);
  return results;
}

async function main() {
  console.log("🔍 Analyzing all tools for field helpers with defaults...\n");

  const usages = await analyzeAllTools();

  if (usages.length === 0) {
    console.log("✅ No field helpers with defaults found!");
    return;
  }

  console.log(`Found ${usages.length} field helpers with defaults:\n`);

  // Group by file
  const byFile = new Map<string, FieldUsage[]>();
  for (const usage of usages) {
    const relativePath = usage.file.replace(`${process.cwd()}/`, "");
    if (!byFile.has(relativePath)) {
      byFile.set(relativePath, []);
    }
    byFile.get(relativePath)!.push(usage);
  }

  // Display results
  for (const [file, fileUsages] of byFile) {
    console.log(`\n📄 ${file}`);
    for (const usage of fileUsages) {
      console.log(`  Line ${usage.line}: ${usage.field} = ${usage.type}Field with default: ${usage.defaultValue}`);
      console.log(`    ${usage.code}`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("📊 Summary:");
  console.log(`  Total files affected: ${byFile.size}`);
  console.log(`  Total fields with defaults: ${usages.length}`);

  const typeCount = new Map<string, number>();
  for (const usage of usages) {
    typeCount.set(usage.type, (typeCount.get(usage.type) || 0) + 1);
  }

  console.log("\nBy type:");
  for (const [type, count] of typeCount) {
    console.log(`  ${type}: ${count}`);
  }

  console.log("\n⚠️  These defaults may override user-provided parameters!");
  console.log("Fix: Remove defaults from field helpers and handle them in code if needed.");
}

main().catch(console.error);
