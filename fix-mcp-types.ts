#!/usr/bin/env bun

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const PROJECT_ROOT = '/Users/SOwusu/WebstormProjects/mcp-server-elasticsearch';

console.log('🔧 Starting MCP TypeScript fixes...');

// Helper function to find all .ts files recursively
function findTsFiles(dir: string): string[] {
  const files: string[] = [];
  const items = readdirSync(dir);
  
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...findTsFiles(fullPath));
    } else if (item.endsWith('.ts') && !item.includes('types.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

// Step 1: Fix types.ts
function fixTypesFile() {
  console.log('📝 Fixing types.ts...');
  
  const typesContent = `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";

export interface ToolParams {
  index?: string;
  queryBody?: Record<string, any>;
  [key: string]: any;
}

// MCP SDK compatible content types
export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image";
  data: string;
  mimeType: string;
};

export type AudioContent = {
  type: "audio";
  data: string;
  mimeType: string;
};

export type ResourceContent = {
  type: "resource";
  resource: {
    text: string;
    uri: string;
    mimeType?: string;
  } | {
    uri: string;
    blob: string;
    mimeType?: string;
  };
};

export type ContentItem = TextContent | ImageContent | AudioContent | ResourceContent;

// MCP SDK compatible result type
export interface SearchResult {
  content: ContentItem[];
  _meta?: Record<string, unknown>;
  structuredContent?: Record<string, unknown>;
}

export type ToolFunction = (
  server: McpServer,
  esClient: Client
) => void;

export type ToolHandler = (params: ToolParams) => Promise<SearchResult>;

// Helper type for tool registration functions
export type ToolRegistrationFunction = (
  server: McpServer, 
  esClient: Client
) => void;`;

  writeFileSync(join(PROJECT_ROOT, 'src/tools/types.ts'), typesContent);
  console.log('✅ Fixed types.ts');
}

// Step 2: Fix readOnlyMode.ts
function fixReadOnlyModeFile() {
  console.log('📝 Fixing readOnlyMode.ts...');
  
  const content = readFileSync(join(PROJECT_ROOT, 'src/utils/readOnlyMode.ts'), 'utf-8');
  
  let fixed = content;
  
  // Import the SearchResult type
  if (!fixed.includes('import { SearchResult }')) {
    fixed = fixed.replace(
      "import { logger } from './logger.js';",
      "import { logger } from './logger.js';\nimport { SearchResult } from '../tools/types.js';"
    );
  }
  
  // Fix createBlockedResponse return type
  fixed = fixed.replace(
    /createBlockedResponse\(toolName: string\): \{ content: Array<\{ type: string; text: string \}> \}/,
    'createBlockedResponse(toolName: string): SearchResult'
  );
  
  // Fix createWarningResponse return type  
  fixed = fixed.replace(
    /createWarningResponse\(toolName: string, originalResponse: any\): \{ content: Array<\{ type: string; text: string \}> \}/,
    'createWarningResponse(toolName: string, originalResponse: SearchResult): SearchResult'
  );
  
  // Fix the content type in createBlockedResponse
  fixed = fixed.replace(
    /type: "text",/g,
    'type: "text" as const,'
  );
  
  // Fix the withReadOnlyCheck function signature
  fixed = fixed.replace(
    /export function withReadOnlyCheck<T extends any\[\], R>\(/,
    'export function withReadOnlyCheck<T extends any[], R extends SearchResult>('
  );
  
  writeFileSync(join(PROJECT_ROOT, 'src/utils/readOnlyMode.ts'), fixed);
  console.log('✅ Fixed readOnlyMode.ts');
}

// Step 3: Fix all tool files
function fixToolFiles() {
  console.log('📁 Finding all tool files...');
  
  const toolsDir = join(PROJECT_ROOT, 'src/tools');
  const toolFiles = findTsFiles(toolsDir);
  
  let totalFiles = 0;
  
  toolFiles.forEach(fullPath => {
    const relativePath = fullPath.replace(PROJECT_ROOT + '/', '');
    console.log(`🔧 Fixing ${relativePath}...`);
    
    let content = readFileSync(fullPath, 'utf-8');
    
    // Fix async function signatures to include extra parameter
    content = content.replace(
      /async \(params: ([^)]+)\): Promise<SearchResult>/g,
      'async (params: $1, extra?: any): Promise<SearchResult>'
    );
    
    // Fix content type literals
    content = content.replace(
      /type: "text"/g,
      'type: "text" as const'
    );
    
    // Fix the ToolFunction type usage in search.ts
    if (fullPath.includes('search.ts') && fullPath.includes('core')) {
      content = content.replace(
        'export const registerSearchTool: ToolFunction =',
        'export const registerSearchTool: ToolRegistrationFunction ='
      );
      
      // Fix the parameter destructuring in search tool
      content = content.replace(
        'async ({ index, queryBody }: ToolParams): Promise<SearchResult>',
        'async ({ index, queryBody }: ToolParams, extra?: any): Promise<SearchResult>'
      );
    }
    
    // Special handling for tools that use withReadOnlyCheck
    if (content.includes('withReadOnlyCheck')) {
      // Fix the withReadOnlyCheck wrapper calls
      content = content.replace(
        /withReadOnlyCheck\("([^"]+)",\s*async \(params: ([^)]+)\) =>/g,
        'withReadOnlyCheck("$1", async (params: $2, extra?: any) =>'
      );
      
      // Fix the implementation functions to match
      content = content.replace(
        /const (\w+)Impl = async \(params: ([^)]+)\): Promise<SearchResult>/g,
        'const $1Impl = async (params: $2): Promise<SearchResult>'
      );
      
      // Fix the calls to implementation functions in withReadOnlyCheck
      content = content.replace(
        /async \(params: ([^,]+), extra\?: any\) => (\w+Impl)\(params\)/g,
        'async (params: $1, extra?: any) => $2(params)'
      );
    }
    
    writeFileSync(fullPath, content);
    totalFiles++;
  });
  
  console.log(`✅ Fixed ${totalFiles} tool files`);
}

// Step 4: Run all fixes
function main() {
  try {
    fixTypesFile();
    fixReadOnlyModeFile();
    fixToolFiles();
    
    console.log('🎉 All fixes completed successfully!');
    console.log('');
    console.log('📋 Summary of changes:');
    console.log('  ✅ Updated types.ts with MCP-compatible types');
    console.log('  ✅ Fixed readOnlyMode.ts return types and imports');
    console.log('  ✅ Updated all tool handler signatures to accept (params, extra?)');
    console.log('  ✅ Changed all "text" types to "text" as const');
    console.log('  ✅ Fixed withReadOnlyCheck wrapper functions');
    console.log('');
    console.log('🚀 You can now run: bun run build or bun run start');
    
  } catch (error) {
    console.error('❌ Error during fixes:', error);
    process.exit(1);
  }
}

main();
