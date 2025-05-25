#!/usr/bin/env bun
/**
 * TypeScript Fixing Script for Elasticsearch MCP Server Tools
 * This script automatically fixes TypeScript errors in tool registration functions
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolsDir = join(__dirname, 'src', 'tools');

// List of directories to process
const toolDirectories = [
  'advanced',
  'alias',
  'analytics', 
  'bulk',
  'cluster',
  'core',
  'document',
  'index_management',
  'mapping',
  'search',
  'template'
];

// Function to convert a tool name to parameter type name
function toParamTypeName(fileName: string): string {
  return fileName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('') + 'Params';
}

// Function to convert function name to const export name
function toConstExportName(fileName: string): string {
  return 'register' + fileName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('') + 'Tool';
}

async function fixTypeScriptFile(filePath: string, fileName: string): Promise<void> {
  try {
    let content = await fs.readFile(filePath, 'utf-8');
    
    // Skip if file is already properly typed (has ToolRegistrationFunction)
    if (content.includes('ToolRegistrationFunction')) {
      console.log(`⏭️  Skipping ${fileName} - already properly typed`);
      return;
    }

    console.log(`🔧 Fixing ${fileName}...`);

    const paramTypeName = toParamTypeName(fileName.replace('.ts', ''));
    const constExportName = toConstExportName(fileName.replace('.ts', ''));
    
    // Add required imports at the top
    const importLines = [
      `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";`,
      `import { Client } from "@elastic/elasticsearch";`,
      `import { ToolRegistrationFunction, SearchResult } from "../types.js";`
    ];

    // Find the position after existing imports
    const lines = content.split('\n');
    let insertPosition = 0;
    let hasImports = false;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ')) {
        hasImports = true;
        insertPosition = i + 1;
      } else if (hasImports && !lines[i].startsWith('import ') && lines[i].trim() !== '') {
        break;
      }
    }

    // Add imports if not already present
    importLines.forEach(importLine => {
      if (!content.includes(importLine)) {
        lines.splice(insertPosition, 0, importLine);
        insertPosition++;
      }
    });

    content = lines.join('\n');

    // Extract the zod schema from the server.tool call to create parameter type
    const toolRegex = /server\.tool\(\s*"([^"]+)",\s*"[^"]*",\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s;
    const toolMatch = content.match(toolRegex);
    
    if (toolMatch) {
      const schemaContent = toolMatch[2];
      
      // Create the parameter schema type definition
      const paramTypeDefinition = `
// Define the parameter schema type
const ${paramTypeName} = z.object({
${schemaContent}
});

type ${paramTypeName}Type = z.infer<typeof ${paramTypeName}>;
`;

      // Replace the export function with typed version
      const functionRegex = /export function (\w+)\(server, esClient\) \{/;
      const functionMatch = content.match(functionRegex);
      
      if (functionMatch) {
        const newFunctionDeclaration = `export const ${constExportName}: ToolRegistrationFunction = (
  server: McpServer, 
  esClient: Client
) => {`;

        content = content.replace(functionRegex, newFunctionDeclaration);
        
        // Insert parameter type definition before the export
        const exportIndex = content.indexOf(`export const ${constExportName}`);
        content = content.slice(0, exportIndex) + paramTypeDefinition + content.slice(exportIndex);
      }
    }

    // Fix the async function parameter typing
    const asyncParamRegex = /async \(([^)]+)\) => \{/g;
    content = content.replace(asyncParamRegex, (match, params) => {
      if (params.includes(':')) {
        return match; // Already typed
      }
      
      // Handle destructured parameters like { index, queryBody }
      if (params.includes('{') && params.includes('}')) {
        return `async (params: ${paramTypeName}Type): Promise<SearchResult> => {
      const ${params} = params;`;
      } else if (params.trim() === 'params') {
        return `async (params: ${paramTypeName}Type): Promise<SearchResult> => {`;
      }
      return match;
    });

    // Fix logger.error calls to properly type the error parameter
    const loggerErrorRegex = /logger\.error\("([^"]*)", error\);/g;
    content = content.replace(loggerErrorRegex, (match, message) => {
      return `logger.error("${message}", {
          error: error instanceof Error ? error.message : String(error)
        });`;
    });

    // Fix logger.warn calls with untyped objects
    const loggerWarnRegex = /logger\.warn\('([^']*)', doc\);/g;
    content = content.replace(loggerWarnRegex, (match, message) => {
      return `logger.warn('${message}', { 
            document: JSON.stringify(doc, null, 2)
          });`;
    });

    await fs.writeFile(filePath, content, 'utf-8');
    console.log(`✅ Fixed ${fileName}`);
    
  } catch (error) {
    console.error(`❌ Error fixing ${fileName}:`, error);
  }
}

async function processDirectory(dirName: string): Promise<void> {
  const dirPath = join(toolsDir, dirName);
  
  try {
    const files = await fs.readdir(dirPath);
    
    for (const file of files) {
      if (file.endsWith('.ts') && file !== 'index.ts') {
        const filePath = join(dirPath, file);
        await fixTypeScriptFile(filePath, file);
      }
    }
  } catch (error) {
    console.error(`❌ Error processing directory ${dirName}:`, error);
  }
}

async function main() {
  console.log('🚀 Starting TypeScript fixing process...\n');
  
  for (const dir of toolDirectories) {
    console.log(`📁 Processing ${dir} directory...`);
    await processDirectory(dir);
    console.log('');
  }
  
  console.log('🎉 TypeScript fixing process completed!');
  console.log('\n📝 Next steps:');
  console.log('1. Run `bun run build` or `tsc` to check for any remaining TypeScript errors');
  console.log('2. Test the server to ensure all tools work correctly');
  console.log('3. Update any remaining manual type issues if needed');
}

if (import.meta.main) {
  main().catch(console.error);
}
