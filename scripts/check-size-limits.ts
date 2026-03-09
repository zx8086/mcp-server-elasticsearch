#!/usr/bin/env bun

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

interface SizeDefault {
  file: string;
  line: number;
  code: string;
  type: "size" | "limit" | "max" | "fetch_size";
  value: string;
}

async function checkFile(filePath: string): Promise<SizeDefault[]> {
  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const issues: SizeDefault[] = [];

  lines.forEach((line, index) => {
    // Check for problematic patterns
    const patterns = [
      // size defaults in query bodies
      { regex: /size\s*:\s*(\d+)(?!.*max|.*min)/, type: "size" as const },
      // jsonField with size defaults
      { regex: /jsonField\([^)]*size\s*:\s*(\d+)/, type: "size" as const },
      // Direct .default() with numbers (for limit/size fields)
      { regex: /(?:size|limit).*\.default\((\d+)\)/, type: "limit" as const },
      // Hard-coded fetch_size
      { regex: /fetch_size\s*:\s*(\d+)/, type: "fetch_size" as const },
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (match) {
        // Skip if it's in a comment or description
        if (line.trim().startsWith("//") || line.includes("describe(") || line.includes('"') || line.includes("'")) {
          continue;
        }

        issues.push({
          file: filePath,
          line: index + 1,
          code: line.trim(),
          type: pattern.type,
          value: match[1],
        });
      }
    }
  });

  return issues;
}

async function scanTools() {
  const toolsDir = join(process.cwd(), "src", "tools");
  const issues: SizeDefault[] = [];

  async function scanDir(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await scanDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.includes("test")) {
        const fileIssues = await checkFile(fullPath);
        issues.push(...fileIssues);
      }
    }
  }

  await scanDir(toolsDir);
  return issues;
}

async function main() {
  console.log("🔍 Scanning for hardcoded size/limit defaults in tools...\n");

  const issues = await scanTools();

  // Filter out known okay patterns
  const problematicIssues = issues.filter((issue) => {
    // Skip if it's a scroll timeout or other non-result size
    if (issue.code.includes("scroll") && issue.value === "30") return false;
    // Skip large values that are probably byte sizes
    if (Number.parseInt(issue.value, 10) > 1000) return false;
    // Skip if it's in test files
    if (issue.file.includes(".test.")) return false;

    return true;
  });

  if (problematicIssues.length === 0) {
    console.log("✅ No problematic size/limit defaults found!");
    return;
  }

  console.log(`⚠️  Found ${problematicIssues.length} potential issues:\n`);

  // Group by file
  const byFile = new Map<string, SizeDefault[]>();
  for (const issue of problematicIssues) {
    const relativePath = issue.file.replace(`${process.cwd()}/`, "");
    if (!byFile.has(relativePath)) {
      byFile.set(relativePath, []);
    }
    byFile.get(relativePath)!.push(issue);
  }

  for (const [file, fileIssues] of byFile) {
    console.log(`\n📄 ${file}`);
    for (const issue of fileIssues) {
      console.log(`  Line ${issue.line}: ${issue.type} = ${issue.value}`);
      console.log(`    ${issue.code}`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("📊 Summary:");
  console.log(`  Files with issues: ${byFile.size}`);
  console.log(`  Total issues: ${problematicIssues.length}`);

  const typeCount = new Map<string, number>();
  for (const issue of problematicIssues) {
    typeCount.set(issue.type, (typeCount.get(issue.type) || 0) + 1);
  }

  console.log("\nBy type:");
  for (const [type, count] of typeCount) {
    console.log(`  ${type}: ${count}`);
  }
}

main().catch(console.error);
