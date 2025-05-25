import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const TOOLS_DIR = 'src/tools';

async function updateToolFile(filePath: string) {
  const content = await readFile(filePath, 'utf-8');
  
  // Add imports if they don't exist
  let updatedContent = content;
  if (!content.includes('import { McpServer }')) {
    updatedContent = `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";\n` + updatedContent;
  }
  if (!content.includes('import { Client }')) {
    updatedContent = `import { Client } from "@elastic/elasticsearch";\n` + updatedContent;
  }
  if (!content.includes('import { ToolFunction, ToolParams, SearchResult }')) {
    updatedContent = `import { ToolFunction, ToolParams, SearchResult } from "../types.js";\n` + updatedContent;
  }

  // Update function signature
  updatedContent = updatedContent.replace(
    /export function register(\w+)Tool\(server, esClient\)/g,
    'export const register$1Tool: ToolFunction = (server: McpServer, esClient: Client)'
  );

  // Update handler function signature
  updatedContent = updatedContent.replace(
    /async \(\{([^}]+)\}\) =>/g,
    'async ({ $1 }: ToolParams): Promise<SearchResult> =>'
  );

  // Add type assertions to logger calls
  updatedContent = updatedContent.replace(
    /logger\.(debug|info|warn|error)\(([^,]+),\s*{([^}]+)}\)/g,
    'logger.$1($2, { $3 } as const)'
  );

  // Write the updated content back to the file
  await writeFile(filePath, updatedContent);
}

async function processDirectory(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      await processDirectory(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.includes('types.ts')) {
      console.log(`Processing ${fullPath}...`);
      await updateToolFile(fullPath);
    }
  }
}

// Create types.ts if it doesn't exist
async function createTypesFile() {
  const typesContent = `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";

export interface ToolParams {
  index?: string;
  queryBody?: Record<string, any>;
  [key: string]: any;
}

export interface SearchResult {
  content: Array<{
    type: string;
    text: string;
  }>;
}

export type ToolFunction = (
  server: McpServer,
  esClient: Client
) => void;

export type ToolHandler = (params: ToolParams) => Promise<SearchResult>;
`;

  await writeFile(join(TOOLS_DIR, 'types.ts'), typesContent);
}

async function main() {
  try {
    // Create types.ts first
    await createTypesFile();
    
    // Process all tool files
    await processDirectory(TOOLS_DIR);
    
    console.log('Successfully updated all tool files!');
  } catch (error) {
    console.error('Error updating tool files:', error);
    process.exit(1);
  }
}

main(); 