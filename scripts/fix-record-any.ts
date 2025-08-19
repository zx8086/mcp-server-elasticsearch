#!/usr/bin/env bun

import { readFile, writeFile } from "fs/promises";
import { Glob } from "bun";

async function fixRecordAny() {
  console.log("🔧 Fixing z.record(z.any()) usages...\n");

  const pattern = new Glob("src/tools/**/*.ts");
  let fixedCount = 0;

  for await (const file of pattern.scan(".")) {
    try {
      let content = await readFile(file, "utf-8");
      const originalContent = content;

      // Replace z.record(z.any()) with z.object({}).passthrough()
      content = content.replace(/z\.record\(z\.any\(\)\)/g, "z.object({}).passthrough()");

      if (content !== originalContent) {
        await writeFile(file, content);
        console.log(`✅ Fixed ${file}`);
        fixedCount++;
      }
    } catch (error) {
      console.log(`❌ Error processing ${file}:`, error);
    }
  }

  console.log(`\n✨ Fixed ${fixedCount} files with z.record(z.any()) patterns!`);
}

fixRecordAny().catch(console.error);
