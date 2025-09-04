#!/usr/bin/env bun

/**
 * Script to identify and fix boolean parameter coercion in all tools
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const TOOLS_DIR = "./src/tools";

async function findToolsWithBooleans(): Promise<string[]> {
  const files: string[] = [];

  async function scanDir(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await scanDir(fullPath);
      } else if (entry.name.endsWith(".ts")) {
        const content = await readFile(fullPath, "utf-8");
        // Check for z.boolean() usage
        if (content.includes("z.boolean()") && !content.includes("booleanField")) {
          files.push(fullPath);
        }
      }
    }
  }

  await scanDir(TOOLS_DIR);
  return files;
}

async function updateFile(filePath: string): Promise<boolean> {
  try {
    let content = await readFile(filePath, "utf-8");
    let modified = false;

    // Check if file has z.boolean() but not booleanField
    if (!content.includes("z.boolean()") || content.includes("booleanField")) {
      return false;
    }

    // Add import if not present
    if (!content.includes("booleanField") && !content.includes("zodHelpers")) {
      const importRegex = /^import .* from "\.\.\/types\.js";$/m;
      if (importRegex.test(content)) {
        content = content.replace(importRegex, `import { booleanField } from "../../utils/zodHelpers.js";\n$&`);
        modified = true;
      }
    }

    // Replace z.boolean().default(true) patterns
    content = content.replace(
      /z\.boolean\(\)\.default\((true|false)\)\.describe\("([^"]*)"\)/g,
      'booleanField($1, "$2")',
    );

    // Replace z.boolean().describe() patterns
    content = content.replace(/z\.boolean\(\)\.describe\("([^"]*)"\)/g, 'booleanField(false, "$1")');

    // Replace z.boolean().optional() patterns
    content = content.replace(/z\.boolean\(\)\.optional\(\)/g, "booleanField().optional()");

    // Replace plain z.boolean()
    content = content.replace(/z\.boolean\(\)(?!\.)/g, "booleanField()");

    if (content.includes("booleanField")) {
      modified = true;
    }

    // Check if handler needs validation
    if (modified && content.includes("handler: async")) {
      const handlerRegex = /handler: async \([^)]+\) => \{[\s\S]*?const \{([^}]+)\} = params;/;
      const match = content.match(handlerRegex);

      if (match && !content.includes("inputSchema.parse(params)")) {
        content = content.replace(
          /const \{([^}]+)\} = params;/,
          "// Parse and validate parameters properly\n        const validatedParams = inputSchema.parse(params);\n        const {$1} = validatedParams;",
        );
      }
    }

    if (modified) {
      await writeFile(filePath, content);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`Error updating ${filePath}:`, error);
    return false;
  }
}

async function main() {
  console.log("🔍 Scanning for tools with boolean parameters...\n");

  const files = await findToolsWithBooleans();

  if (files.length === 0) {
    console.log("✅ All tools are already using boolean coercion!");
    return;
  }

  console.log(`Found ${files.length} files that need updating:\n`);

  for (const file of files) {
    const relativePath = file.replace("./src/tools/", "");
    console.log(`  - ${relativePath}`);
  }

  console.log("\n📝 Updating files...\n");

  let updatedCount = 0;
  for (const file of files) {
    const updated = await updateFile(file);
    const relativePath = file.replace("./src/tools/", "");

    if (updated) {
      console.log(`  ✅ Updated: ${relativePath}`);
      updatedCount++;
    } else {
      console.log(`  ⚠️  Skipped: ${relativePath} (manual review needed)`);
    }
  }

  console.log(`\n✨ Updated ${updatedCount} of ${files.length} files`);

  if (updatedCount < files.length) {
    console.log("\n⚠️  Some files need manual review. They may have:");
    console.log("  - Complex boolean patterns");
    console.log("  - Custom validation logic");
    console.log("  - Non-standard import structures");
  }
}

main().catch(console.error);
