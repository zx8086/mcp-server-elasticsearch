#!/usr/bin/env bun

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const PROJECT_ROOT = '/Users/SOwusu/WebstormProjects/mcp-server-elasticsearch';

// Files that have already been fixed manually
const ALREADY_FIXED = new Set([
  'types.ts',
  'search.ts', 
  'get_mappings.ts',
  'delete_by_query.ts',
  'bulk_operations.ts',
  'delete_document.ts',
  'get_document.ts'
]);

function fixFile(filePath: string) {
  try {
    let content = readFileSync(filePath, 'utf-8');
    let changed = false;
    
    // Fix async function signatures
    const newContent = content.replace(
      /async \(params: ([^)]+)\): Promise<SearchResult>/g,
      'async (params: $1, extra?: any): Promise<SearchResult>'
    );
    if (newContent !== content) {
      content = newContent;
      changed = true;
    }
    
    // Fix type: "text" to type: "text" as const
    const newContent2 = content.replace(
      /type: "text"/g,
      'type: "text" as const'
    );
    if (newContent2 !== content) {
      content = newContent2;
      changed = true;
    }
    
    if (changed) {
      writeFileSync(filePath, content);
      console.log(`✅ Fixed: ${filePath.replace(PROJECT_ROOT, '')}`);
    }
  } catch (error) {
    console.error(`❌ Error fixing ${filePath}:`, error);
  }
}

function processDirectory(dirPath: string) {
  try {
    const items = readdirSync(dirPath);
    
    for (const item of items) {
      const fullPath = join(dirPath, item);
      
      if (item.endsWith('.ts') && !ALREADY_FIXED.has(item) && item !== 'index.ts') {
        fixFile(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${dirPath}:`, error);
  }
}

console.log('🔧 Starting comprehensive TypeScript fixes...');

// Process all tool subdirectories
const toolDirs = [
  'src/tools/advanced',
  'src/tools/alias', 
  'src/tools/analytics',
  'src/tools/bulk',
  'src/tools/cluster',
  'src/tools/core',
  'src/tools/document',
  'src/tools/index_management',
  'src/tools/mapping',
  'src/tools/search',
  'src/tools/template'
];

for (const dir of toolDirs) {
  const fullDir = join(PROJECT_ROOT, dir);
  console.log(`📁 Processing ${dir}...`);
  processDirectory(fullDir);
}

console.log('🎉 All files processed!');
console.log('🚀 You can now run: bun run build');
