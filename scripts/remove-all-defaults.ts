#!/usr/bin/env bun

import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

async function removeDefaults(dir: string) {
  const files = await readdir(dir, { withFileTypes: true });
  
  for (const file of files) {
    const fullPath = join(dir, file.name);
    
    if (file.isDirectory()) {
      await removeDefaults(fullPath);
    } else if (file.name.endsWith(".ts") && !file.name.endsWith(".test.ts")) {
      const content = await readFile(fullPath, "utf-8");
      
      // Pattern to find .default(...) calls in Zod schemas
      const patterns = [
        // Simple defaults like .default(20), .default("*"), .default(true)
        /\.default\(([^)]+)\)/g,
      ];
      
      let modified = content;
      let changeCount = 0;
      
      for (const pattern of patterns) {
        const matches = [...modified.matchAll(pattern)];
        
        for (const match of matches.reverse()) { // Reverse to preserve indices
          const fullMatch = match[0];
          const defaultValue = match[1];
          
          // Check if this is in a Zod schema context (rough heuristic)
          const beforeContext = modified.substring(Math.max(0, match.index! - 100), match.index);
          const afterContext = modified.substring(match.index! + fullMatch.length, Math.min(modified.length, match.index! + fullMatch.length + 100));
          
          // Look for Zod indicators
          if (beforeContext.includes("z.") || afterContext.includes(".describe(") || afterContext.includes(".optional()")) {
            // Replace .default(...) with .optional()
            const startIdx = match.index!;
            const endIdx = startIdx + fullMatch.length;
            
            // Check if .optional() already exists after
            if (!afterContext.trim().startsWith(".optional()")) {
              modified = modified.substring(0, startIdx) + ".optional()" + modified.substring(endIdx);
            } else {
              // Just remove the .default() call
              modified = modified.substring(0, startIdx) + modified.substring(endIdx);
            }
            changeCount++;
          }
        }
      }
      
      if (changeCount > 0) {
        console.log(`📝 ${file.name}: Removed ${changeCount} default(s)`);
        await writeFile(fullPath, modified);
      }
    }
  }
}

console.log("🔍 Removing all .default() calls from tool schemas...\n");

const toolsDir = join(process.cwd(), "src", "tools");
await removeDefaults(toolsDir);

console.log("\n✅ Done! All defaults have been removed.");