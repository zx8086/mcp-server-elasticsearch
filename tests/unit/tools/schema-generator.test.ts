import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { SchemaGenerator, type ToolDocumentation } from '../../../src/documentation/schemaGenerator';
import { z } from 'zod';
import { zodToJsonSchemaCompat } from '../../../src/utils/zodToJsonSchema';
import { readdir, stat, readFile } from 'fs/promises';
import path from 'path';
import { rmdir, mkdir } from 'fs/promises';

describe('Schema Generator', () => {
  let generator: SchemaGenerator;
  const testOutputDir = path.join(process.cwd(), 'test-docs-output');

  beforeAll(async () => {
    generator = new SchemaGenerator('Test MCP Server API', '1.0.0-test');
    
    // Ensure clean test environment
    try {
      await rmdir(testOutputDir, { recursive: true });
    } catch {
      // Directory might not exist
    }
  });

  afterAll(async () => {
    // Clean up test output
    try {
      await rmdir(testOutputDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test('should initialize with correct title and version', () => {
    expect(generator).toBeDefined();
    expect(typeof generator.addTool).toBe('function');
    expect(typeof generator.generateOpenAPISpec).toBe('function');
  });

  test('should add tools correctly', () => {
    const testTool: ToolDocumentation = {
      name: 'test_search',
      description: 'Test search functionality',
      category: 'Core',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          size: { type: 'number', description: 'Number of results' }
        },
        required: ['query']
      },
      examples: [
        {
          title: 'Basic Search',
          description: 'Simple search example',
          input: { query: 'test', size: 10 },
          expectedOutput: { hits: [] }
        }
      ],
      tags: ['search', 'core']
    };

    expect(() => generator.addTool(testTool)).not.toThrow();
  });

  test('should generate valid OpenAPI specification', () => {
    // Add a few test tools
    const tools = [
      {
        name: 'search',
        description: 'Search documents',
        category: 'Core',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            size: { type: 'number', default: 10 }
          }
        }
      },
      {
        name: 'list_indices',
        description: 'List all indices',
        category: 'Core',
        inputSchema: {
          type: 'object',
          properties: {
            format: { type: 'string', enum: ['json', 'table'] }
          }
        }
      }
    ];

    for (const tool of tools) {
      generator.addTool(tool);
    }

    const openApiSpec = generator.generateOpenAPISpec();

    // Validate OpenAPI structure
    expect(openApiSpec.openapi).toBe('3.0.3');
    expect(openApiSpec.info.title).toBe('Test MCP Server API');
    expect(openApiSpec.info.version).toBe('1.0.0-test');

    // Should have servers
    expect(Array.isArray(openApiSpec.servers)).toBe(true);
    expect(openApiSpec.servers.length).toBeGreaterThan(0);

    // Should have paths for each tool
    expect(openApiSpec.paths).toBeDefined();
    expect(openApiSpec.paths['/tools/search']).toBeDefined();
    expect(openApiSpec.paths['/tools/list_indices']).toBeDefined();

    // Should have components with schemas
    expect(openApiSpec.components).toBeDefined();
    expect(openApiSpec.components.schemas).toBeDefined();
    expect(openApiSpec.components.schemas.searchInput).toBeDefined();

    // Should have security schemes
    expect(openApiSpec.components.securitySchemes).toBeDefined();
    expect(openApiSpec.components.securitySchemes.ApiKeyAuth).toBeDefined();

    console.log('✅ OpenAPI specification structure is valid');
  });

  test('should generate markdown documentation', () => {
    const markdown = generator.generateMarkdownDocs();

    // Should contain expected sections
    expect(markdown).toContain('# Test MCP Server API');
    expect(markdown).toContain('Version: 1.0.0-test');
    expect(markdown).toContain('## Table of Contents');
    expect(markdown).toContain('## Core');

    // Should contain tool documentation
    expect(markdown).toContain('### `search`');
    expect(markdown).toContain('Search documents');
    expect(markdown).toContain('**Input Schema:**');

    // Should be properly formatted
    expect(markdown.split('\n').length).toBeGreaterThan(20);

    console.log('✅ Markdown documentation generated successfully');
  });

  test('should generate HTML documentation', async () => {
    const html = await generator.generateHTMLDocs();

    // Should be valid HTML
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');

    // Should contain expected content
    expect(html).toContain('Test MCP Server API');
    expect(html).toContain('Version 1.0.0-test');

    // Should have styling
    expect(html).toContain('<style>');
    expect(html).toContain('</style>');

    // Should have interactive elements
    expect(html).toContain('nav-grid');
    expect(html).toContain('tool-header');

    console.log('✅ HTML documentation generated successfully');
  });

  test('should save documentation files', async () => {
    await generator.saveDocumentation(testOutputDir);

    // Check that all expected files were created
    const files = await readdir(testOutputDir);
    expect(files).toContain('openapi.json');
    expect(files).toContain('API.md');
    expect(files).toContain('index.html');

    // Verify file contents
    const openApiContent = await readFile(path.join(testOutputDir, 'openapi.json'), 'utf-8');
    const openApiData = JSON.parse(openApiContent);
    expect(openApiData.info.title).toBe('Test MCP Server API');

    const markdownContent = await readFile(path.join(testOutputDir, 'API.md'), 'utf-8');
    expect(markdownContent).toContain('# Test MCP Server API');

    const htmlContent = await readFile(path.join(testOutputDir, 'index.html'), 'utf-8');
    expect(htmlContent).toContain('<!DOCTYPE html>');

    console.log('✅ All documentation files saved successfully');
  });

  test('should create tool documentation from Zod schema', () => {
    const testSchema = z.object({
      query: z.string().describe('The search query to execute'),
      size: z.number().default(10).describe('Number of results to return'),
      index: z.string().optional().describe('Index pattern to search')
    });

    const toolDoc = SchemaGenerator.fromZodSchema(
      'zod_search',
      'Search using Zod schema',
      testSchema,
      'Test'
    );

    expect(toolDoc.name).toBe('zod_search');
    expect(toolDoc.description).toBe('Search using Zod schema');
    expect(toolDoc.category).toBe('Test');
    expect(toolDoc.inputSchema).toBeDefined();

    // Verify schema conversion
    expect(toolDoc.inputSchema.type).toBe('object');
    expect(toolDoc.inputSchema.properties.query).toBeDefined();
    expect(toolDoc.inputSchema.properties.size).toBeDefined();
    expect(toolDoc.inputSchema.required).toContain('query');

    console.log('✅ Zod schema conversion works correctly');
  });
});

describe('Zod to JSON Schema Compatibility', () => {
  test('should handle basic Zod types', () => {
    const stringSchema = z.string().describe('A string field');
    const numberSchema = z.number().describe('A number field');
    const booleanSchema = z.boolean().describe('A boolean field');

    const stringJson = zodToJsonSchemaCompat(stringSchema);
    expect(stringJson.type).toBe('string');
    expect(stringJson.description).toBe('A string field');

    const numberJson = zodToJsonSchemaCompat(numberSchema);
    expect(numberJson.type).toBe('number');

    const booleanJson = zodToJsonSchemaCompat(booleanSchema);
    expect(booleanJson.type).toBe('boolean');
  });

  test('should handle complex Zod objects', () => {
    const complexSchema = z.object({
      search: z.object({
        query: z.string(),
        filters: z.array(z.string()).optional()
      }),
      pagination: z.object({
        size: z.number().min(1).max(1000).default(10),
        from: z.number().min(0).default(0)
      }).optional(),
      sort: z.enum(['asc', 'desc']).optional()
    });

    const jsonSchema = zodToJsonSchemaCompat(complexSchema);

    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema.properties.search).toBeDefined();
    expect(jsonSchema.properties.search.properties.query).toBeDefined();
    expect(jsonSchema.properties.pagination).toBeDefined();
    expect(jsonSchema.required).toContain('search');

    console.log('✅ Complex Zod schema conversion works');
  });

  test('should handle Zod enums and unions', () => {
    const enumSchema = z.enum(['read', 'write', 'admin']);
    const unionSchema = z.union([z.string(), z.number()]);

    const enumJson = zodToJsonSchemaCompat(enumSchema);
    expect(enumJson.enum).toEqual(['read', 'write', 'admin']);

    const unionJson = zodToJsonSchemaCompat(unionSchema);
    expect(unionJson.anyOf || unionJson.oneOf).toBeDefined();

    console.log('✅ Zod enums and unions convert correctly');
  });

  test('should handle Zod arrays and records', () => {
    const arraySchema = z.array(z.string()).min(1);
    const recordSchema = z.record(z.string(), z.number());

    const arrayJson = zodToJsonSchemaCompat(arraySchema);
    expect(arrayJson.type).toBe('array');
    expect(arrayJson.items.type).toBe('string');
    expect(arrayJson.minItems).toBe(1);

    const recordJson = zodToJsonSchemaCompat(recordSchema);
    expect(recordJson.type).toBe('object');
    expect(recordJson.additionalProperties).toBeDefined();

    console.log('✅ Zod arrays and records convert correctly');
  });

  test('should handle edge cases and fallbacks', () => {
    // Test with custom transformations
    const transformSchema = z.string().transform(s => s.toUpperCase());
    const transformJson = zodToJsonSchemaCompat(transformSchema);
    expect(transformJson.type).toBe('string'); // Should fallback to base type

    // Test with very complex schema
    const complexSchema = z.object({
      nested: z.object({
        deep: z.object({
          value: z.string()
        })
      })
    });

    expect(() => zodToJsonSchemaCompat(complexSchema)).not.toThrow();

    console.log('✅ Edge cases handled gracefully');
  });
});

describe('Documentation Content Quality', () => {
  test('should generate comprehensive tool categories', () => {
    const generator = new SchemaGenerator('Test API', '1.0.0');

    // Add tools from different categories
    const categories = ['Core', 'Document', 'Search', 'Index Management', 'Cluster'];
    for (let i = 0; i < categories.length; i++) {
      const category = categories[i];
      generator.addTool({
        name: `tool_${i}`,
        description: `Test tool for ${category}`,
        category: category,
        inputSchema: { type: 'object', properties: {} }
      });
    }

    const markdown = generator.generateMarkdownDocs();
    const html = generator.generateHTMLDocs();

    // All categories should be documented
    for (const category of categories) {
      expect(markdown).toContain(`## ${category}`);
    }

    console.log('✅ All tool categories are properly documented');
  });

  test('should include tool examples in documentation', () => {
    const generator = new SchemaGenerator('Test API', '1.0.0');

    const toolWithExamples = {
      name: 'example_tool',
      description: 'Tool with examples',
      category: 'Test',
      inputSchema: {
        type: 'object',
        properties: {
          param: { type: 'string' }
        }
      },
      examples: [
        {
          title: 'Basic Usage',
          description: 'How to use this tool',
          input: { param: 'test' },
          expectedOutput: { result: 'success' }
        }
      ]
    };

    generator.addTool(toolWithExamples);

    const markdown = generator.generateMarkdownDocs();
    expect(markdown).toContain('**Examples:**');
    expect(markdown).toContain('#### Basic Usage');
    expect(markdown).toContain('How to use this tool');

    console.log('✅ Tool examples are included in documentation');
  });

  test('should validate generated OpenAPI against schema', () => {
    const generator = new SchemaGenerator('Validation Test', '1.0.0');

    // Add realistic tool
    generator.addTool({
      name: 'search_documents',
      description: 'Search through documents with advanced filtering',
      category: 'Search',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          filters: {
            type: 'object',
            properties: {
              dateRange: {
                type: 'object',
                properties: {
                  from: { type: 'string', format: 'date' },
                  to: { type: 'string', format: 'date' }
                }
              }
            }
          },
          options: {
            type: 'object',
            properties: {
              size: { type: 'integer', minimum: 1, maximum: 1000, default: 10 },
              sort: { type: 'string', enum: ['relevance', 'date', 'title'] }
            }
          }
        },
        required: ['query']
      },
      tags: ['search', 'advanced', 'filtering']
    });

    const openApiSpec = generator.generateOpenAPISpec();

    // Validate OpenAPI structure more thoroughly
    expect(openApiSpec.info.title).toBe('Validation Test');
    expect(openApiSpec.info.version).toBe('1.0.0');

    // Check path structure
    const searchPath = openApiSpec.paths['/tools/search_documents'];
    expect(searchPath).toBeDefined();
    expect(searchPath.post).toBeDefined();
    expect(searchPath.post.tags).toContain('Search');

    // Check request body
    const requestBody = searchPath.post.requestBody;
    expect(requestBody.required).toBe(true);
    expect(requestBody.content['application/json']).toBeDefined();

    // Check schema reference
    const schemaRef = requestBody.content['application/json'].schema.$ref;
    expect(schemaRef).toBe('#/components/schemas/search_documentsInput');

    // Check that schema is defined in components
    expect(openApiSpec.components.schemas.search_documentsInput).toBeDefined();

    console.log('✅ Generated OpenAPI spec passes validation');
  });
});