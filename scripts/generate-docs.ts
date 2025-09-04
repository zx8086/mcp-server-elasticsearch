#!/usr/bin/env bun

import { SchemaGenerator, ToolDocumentation } from '../src/documentation/schemaGenerator.js';
import { getAllTools } from '../src/tools/index.js';
import path from 'path';

async function generateDocumentation() {
  console.log('🔧 Generating API documentation from Zod schemas...');
  
  const generator = new SchemaGenerator(
    'Elasticsearch MCP Server API',
    '1.0.0'
  );

  // Get all tools and their schemas
  const allTools = getAllTools();
  
  console.log(`📋 Found ${allTools.length} tools to document`);

  // Add tools to generator with enhanced metadata
  allTools.forEach(tool => {
    const category = getCategoryFromToolName(tool.name);
    const examples = getToolExamples(tool.name);
    const tags = getToolTags(tool.name, category);

    const toolDoc: ToolDocumentation = {
      name: tool.name,
      description: tool.description,
      category,
      inputSchema: tool.inputSchema,
      examples,
      tags,
    };

    generator.addTool(toolDoc);
  });

  // Generate documentation in docs directory
  const outputDir = path.resolve('docs/api');
  await generator.saveDocumentation(outputDir);

  console.log('✅ Documentation generation complete!');
  console.log(`📁 Output directory: ${outputDir}`);
  console.log('🌐 Open docs/api/index.html in your browser to view the interactive documentation');
}

function getCategoryFromToolName(toolName: string): string {
  // Map tool names to categories based on prefixes and patterns
  const categoryMappings: { [pattern: string]: string } = {
    // Core operations
    'list_indices': 'Core',
    'get_mappings': 'Core', 
    'search': 'Core',
    'get_shards': 'Core',
    'indices_summary': 'Core',

    // Document operations
    'index_document': 'Document',
    'get_document': 'Document',
    'update_document': 'Document',
    'delete_document': 'Document',
    'document_exists': 'Document',

    // Search operations
    'search': 'Search',
    'sql_query': 'Search',
    'update_by_query': 'Search',
    'count': 'Search',
    'scroll_search': 'Search',
    'multi_search': 'Search',
    'clear_scroll': 'Search',

    // Index management
    'create_index': 'Index Management',
    'delete_index': 'Index Management', 
    'index_exists': 'Index Management',
    'get_index_settings': 'Index Management',
    'update_index_settings': 'Index Management',
    'refresh_index': 'Index Management',
    'flush_index': 'Index Management',
    'reindex': 'Index Management',
    'put_mapping': 'Index Management',
    'get_field_mapping': 'Index Management',

    // Cluster operations
    'cluster_health': 'Cluster',
    'cluster_stats': 'Cluster',
    'nodes_info': 'Cluster',
    'nodes_stats': 'Cluster',

    // Bulk operations
    'bulk': 'Bulk',
    'multi_get': 'Bulk',

    // Analytics
    'term_vectors': 'Analytics',
    'multi_term_vectors': 'Analytics',

    // Templates
    'search_template': 'Templates',
    'multi_search_template': 'Templates',
    'put_search_template': 'Templates',
    'get_search_template': 'Templates',
    'delete_search_template': 'Templates',

    // Aliases
    'get_aliases': 'Aliases',
    'put_alias': 'Aliases',
    'delete_alias': 'Aliases',
    'update_aliases': 'Aliases',

    // ILM (Index Lifecycle Management)
    'ilm_': 'ILM',
    
    // Watcher
    'watcher_': 'Watcher',

    // Advanced features
    'enrich_': 'Advanced',
    'autoscaling_': 'Advanced',
    'tasks_': 'Advanced',
    'indices_': 'Advanced',
  };

  // Check for exact matches first
  if (categoryMappings[toolName]) {
    return categoryMappings[toolName];
  }

  // Check for prefix matches
  for (const [pattern, category] of Object.entries(categoryMappings)) {
    if (toolName.startsWith(pattern)) {
      return category;
    }
  }

  // Default to Advanced category
  return 'Advanced';
}

function getToolExamples(toolName: string): any[] {
  // Provide realistic examples for common tools
  const examples: { [toolName: string]: any[] } = {
    'search': [
      {
        title: 'Basic Search',
        description: 'Simple text search across all indices',
        input: {
          query: { match_all: {} },
          size: 10
        },
        expectedOutput: {
          hits: {
            total: { value: 100 },
            hits: [
              { _index: 'logs', _id: '1', _source: { message: 'example log' } }
            ]
          }
        }
      },
      {
        title: 'Filtered Search', 
        description: 'Search with filters and specific index',
        input: {
          index: 'logs-2024',
          query: {
            bool: {
              must: [{ match: { level: 'error' } }],
              filter: [{ range: { timestamp: { gte: '2024-01-01' } } }]
            }
          }
        }
      }
    ],
    'list_indices': [
      {
        title: 'List All Indices',
        description: 'Get all indices with basic information',
        input: {},
        expectedOutput: [
          { index: 'logs-2024.01', health: 'green', docs: 1000 },
          { index: 'metrics-2024.01', health: 'green', docs: 5000 }
        ]
      }
    ],
    'cluster_health': [
      {
        title: 'Check Cluster Health',
        description: 'Get overall cluster health status',
        input: {},
        expectedOutput: {
          status: 'green',
          number_of_nodes: 3,
          active_primary_shards: 10,
          active_shards: 20
        }
      }
    ]
  };

  return examples[toolName] || [];
}

function getToolTags(toolName: string, category: string): string[] {
  const tags: string[] = [category.toLowerCase()];
  
  // Add operation-type tags
  if (toolName.includes('create') || toolName.includes('put') || toolName.includes('index')) {
    tags.push('write');
  } else if (toolName.includes('delete') || toolName.includes('remove')) {
    tags.push('destructive');
  } else if (toolName.includes('get') || toolName.includes('list') || toolName.includes('search')) {
    tags.push('read');
  } else if (toolName.includes('update')) {
    tags.push('write', 'update');
  }

  // Add feature tags
  if (toolName.includes('bulk') || toolName.includes('multi')) {
    tags.push('bulk');
  }
  
  if (toolName.includes('async') || toolName.includes('background')) {
    tags.push('async');
  }

  if (toolName.includes('admin') || toolName.includes('cluster') || toolName.includes('nodes')) {
    tags.push('admin');
  }

  return [...new Set(tags)]; // Remove duplicates
}

// Helper function to get all tools (this would need to be implemented)
function getAllTools(): Array<{ name: string; description: string; inputSchema: any }> {
  // This is a placeholder - in the real implementation, you would
  // import and collect all tool definitions from your tools directory
  
  // For now, return a sample set based on the tools we know exist
  return [
    {
      name: 'search',
      description: 'Search documents across Elasticsearch indices with advanced query capabilities',
      inputSchema: {
        type: 'object',
        properties: {
          index: { type: 'string', description: 'Index name or pattern' },
          query: { type: 'object', description: 'Elasticsearch query DSL' },
          size: { type: 'number', description: 'Number of results to return', default: 10 },
          from: { type: 'number', description: 'Offset for pagination', default: 0 }
        }
      }
    },
    {
      name: 'list_indices',
      description: 'List all available Elasticsearch indices with health and document count information',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', description: 'Output format', enum: ['json', 'table'] },
          health: { type: 'string', description: 'Filter by health status', enum: ['green', 'yellow', 'red'] }
        }
      }
    },
    {
      name: 'cluster_health',
      description: 'Get comprehensive cluster health information including node and shard status',
      inputSchema: {
        type: 'object',
        properties: {
          level: { type: 'string', description: 'Detail level', enum: ['cluster', 'indices', 'shards'] },
          wait_for_status: { type: 'string', description: 'Wait for status', enum: ['green', 'yellow', 'red'] }
        }
      }
    }
    // Add more tools as needed...
  ];
}

// Run the documentation generation
if (import.meta.main) {
  generateDocumentation().catch(console.error);
}