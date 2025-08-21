#!/usr/bin/env bun

import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

async function fixValidationMessages(dir: string) {
  const files = await readdir(dir, { withFileTypes: true });

  for (const file of files) {
    const fullPath = join(dir, file.name);

    if (file.isDirectory()) {
      await fixValidationMessages(fullPath);
    } else if (file.name.endsWith(".ts") && !file.name.endsWith(".test.ts")) {
      let content = await readFile(fullPath, "utf-8");
      const originalContent = content;
      let changeCount = 0;

      // Pattern 1: Remove .min(1, "... is required") from optional fields
      // This validation is too aggressive for optional fields
      content = content.replace(/z\.string\(\)\.min\(1,\s*"[^"]*\s+is required"\)\.optional\(\)/g, (_match) => {
        changeCount++;
        return "z.string().optional()";
      });

      // Pattern 2: For fields that are genuinely required (not followed by .optional())
      // Keep the validation but improve the message
      content = content.replace(
        /z\.string\(\)\.min\(1,\s*"([^"]+)\s+is required"\)(?!\.optional)/g,
        (_match, fieldName) => {
          changeCount++;
          return `z.string().min(1, "${fieldName} cannot be empty")`;
        },
      );

      // Pattern 3: Fix double .optional().optional()
      content = content.replace(/\.optional\(\)\.optional\(\)/g, (_match) => {
        changeCount++;
        return ".optional()";
      });

      // Pattern 4: Remove .min(1) from fields that will have runtime defaults
      // Look for patterns where we're setting a default in the handler
      if (
        content.includes('params.index || "*"') ||
        content.includes('params.index ?? "*"') ||
        content.includes("const index = params.index")
      ) {
        content = content.replace(/index:\s*z\.string\(\)\.min\(1[^)]*\)/g, "index: z.string()");
      }

      if (changeCount > 0 && content !== originalContent) {
        console.log(`📝 ${file.name}: Fixed ${changeCount} validation issue(s)`);
        await writeFile(fullPath, content);
      }
    }
  }
}

console.log("🔧 Fixing overly aggressive validation messages...\n");

const toolsDir = join(process.cwd(), "src", "tools");
await fixValidationMessages(toolsDir);

console.log("\n✅ Done! Validation messages have been improved.");
