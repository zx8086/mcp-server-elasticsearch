#!/usr/bin/env bun

import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

interface ToolInfo {
  name: string;
  file: string;
  category: string;
  hasIntegrationTest: boolean;
  isDestructive: boolean;
  requiresData: boolean;
}

async function extractToolName(filePath: string): Promise<string | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    // Try different patterns
    let match = content.match(/server\.tool\(\s*["']([^"']+)["']/);
    if (!match) {
      match = content.match(/name:\s*["']([^"']+)["']/);
    }
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function isDestructiveOperation(filePath: string): Promise<boolean> {
  const _content = await readFile(filePath, "utf-8");
  const destructiveKeywords = ["delete", "update", "create", "put", "bulk", "reindex", "flush", "refresh", "rollover"];

  const fileName = basename(filePath).toLowerCase();
  return destructiveKeywords.some((keyword) => fileName.includes(keyword));
}

async function checkIfToolIsTested(toolName: string): Promise<boolean> {
  try {
    // Check if tool is referenced in integration tests
    const testFile = await readFile("tests/integration/real-elasticsearch.test.ts", "utf-8");
    return testFile.includes(toolName);
  } catch {
    return false;
  }
}

async function analyzeTools(): Promise<void> {
  const toolsDir = "src/tools";
  const categories = await readdir(toolsDir);
  const tools: ToolInfo[] = [];

  for (const category of categories) {
    if (category.endsWith(".ts") || category === "README.md") continue;

    const categoryPath = join(toolsDir, category);

    // Check if it's a directory
    try {
      const files = await readdir(categoryPath);

      for (const file of files) {
        if (!file.endsWith(".ts") || file === "index.ts" || file === "types.ts" || file.includes(".test.")) {
          continue;
        }

        const filePath = join(categoryPath, file);
        const toolName = await extractToolName(filePath);

        if (toolName) {
          tools.push({
            name: toolName,
            file: file,
            category: category,
            hasIntegrationTest: await checkIfToolIsTested(toolName),
            isDestructive: await isDestructiveOperation(filePath),
            requiresData: !file.includes("list") && !file.includes("get") && !file.includes("search"),
          });
        }
      }
    } catch {
      // Not a directory, skip
    }
  }

  // Generate report
  console.log("# Elasticsearch MCP Tool Coverage Report");
  console.log(`\nTotal Tools: ${tools.length}`);

  const tested = tools.filter((t) => t.hasIntegrationTest);
  const untested = tools.filter((t) => !t.hasIntegrationTest);
  const destructive = tools.filter((t) => t.isDestructive);
  const readOnly = tools.filter((t) => !t.isDestructive);

  console.log("\n## Coverage Summary");
  console.log(
    `- Tools with integration tests: ${tested.length} (${((tested.length / tools.length) * 100).toFixed(1)}%)`,
  );
  console.log(`- Tools without tests: ${untested.length} (${((untested.length / tools.length) * 100).toFixed(1)}%)`);
  console.log(`- Destructive operations: ${destructive.length}`);
  console.log(`- Read-only operations: ${readOnly.length}`);

  // Group by category
  const byCategory = tools.reduce(
    (acc, tool) => {
      if (!acc[tool.category]) {
        acc[tool.category] = [];
      }
      acc[tool.category].push(tool);
      return acc;
    },
    {} as Record<string, ToolInfo[]>,
  );

  console.log("\n## Coverage by Category");
  for (const [category, categoryTools] of Object.entries(byCategory)) {
    const testedCount = categoryTools.filter((t) => t.hasIntegrationTest).length;
    const coverage = ((testedCount / categoryTools.length) * 100).toFixed(1);
    console.log(`\n### ${category} (${testedCount}/${categoryTools.length} - ${coverage}%)`);

    for (const tool of categoryTools) {
      const status = tool.hasIntegrationTest ? "[PASS]" : "[FAIL]";
      const type = tool.isDestructive ? "[WRITE]" : "[READ]";
      console.log(`  ${status} ${type} ${tool.name} (${tool.file})`);
    }
  }

  // Priority recommendations
  console.log("\n## Testing Priority Recommendations");
  console.log("\n### High Priority (Core Read Operations):");
  const highPriority = untested.filter(
    (t) => !t.isDestructive && (t.category === "core" || t.category === "search" || t.category === "document"),
  );
  highPriority.slice(0, 10).forEach((t) => {
    console.log(`- ${t.name} (${t.category}/${t.file})`);
  });

  console.log("\n### Medium Priority (Index Management):");
  const mediumPriority = untested.filter(
    (t) => t.category === "index_management" || t.category === "indices" || t.category === "mapping",
  );
  mediumPriority.slice(0, 10).forEach((t) => {
    console.log(`- ${t.name} (${t.category}/${t.file})`);
  });

  console.log("\n### Low Priority (Destructive/Advanced):");
  const lowPriority = untested.filter((t) => t.isDestructive);
  lowPriority.slice(0, 10).forEach((t) => {
    console.log(`- ${t.name} (${t.category}/${t.file})`);
  });

  // Test strategy
  console.log("\n## Recommended Testing Strategy");
  console.log(`
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
`);
}

// Run the analysis
await analyzeTools();
