import { z } from 'zod';
import { zodToJsonSchemaCompat } from '../utils/zodToJsonSchema.js';
import fs from 'fs/promises';
import path from 'path';

export interface ToolDocumentation {
  name: string;
  description: string;
  category: string;
  inputSchema: any;
  outputExample?: any;
  examples?: ToolExample[];
  tags?: string[];
}

export interface ToolExample {
  title: string;
  description: string;
  input: any;
  expectedOutput?: any;
}

export interface APIDocumentation {
  title: string;
  version: string;
  description: string;
  tools: ToolDocumentation[];
  categories: CategoryDocumentation[];
}

export interface CategoryDocumentation {
  name: string;
  description: string;
  tools: string[];
  count: number;
}

export class SchemaGenerator {
  private tools: ToolDocumentation[] = [];
  private version: string;
  private title: string;

  constructor(title: string = 'Elasticsearch MCP Server API', version: string = '1.0.0') {
    this.title = title;
    this.version = version;
  }

  public addTool(tool: ToolDocumentation): void {
    this.tools.push(tool);
  }

  public generateOpenAPISpec(): any {
    const categories = this.generateCategories();

    return {
      openapi: '3.0.3',
      info: {
        title: this.title,
        description: 'Comprehensive Elasticsearch MCP Server with 104+ tools for enterprise-grade operations',
        version: this.version,
        contact: {
          name: 'MCP Elasticsearch Team',
        },
        license: {
          name: 'MIT',
        },
      },
      servers: [
        {
          url: 'http://localhost:8080',
          description: 'Development server (SSE transport)',
        },
        {
          url: 'stdio://',
          description: 'Studio transport (Claude Desktop)',
        },
      ],
      tags: categories.map(cat => ({
        name: cat.name,
        description: cat.description,
        externalDocs: {
          description: `${cat.count} tools available`,
        },
      })),
      paths: this.generatePaths(),
      components: {
        schemas: this.generateSchemas(),
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'Authorization',
            description: 'Elasticsearch API Key authentication',
          },
          BasicAuth: {
            type: 'http',
            scheme: 'basic',
            description: 'Elasticsearch username/password authentication',
          },
        },
      },
      security: [
        { ApiKeyAuth: [] },
        { BasicAuth: [] },
      ],
    };
  }

  public generateMarkdownDocs(): string {
    const categories = this.generateCategories();
    
    let markdown = `# ${this.title}\n\n`;
    markdown += `Version: ${this.version}\n\n`;
    markdown += `## Overview\n\n`;
    markdown += `This is a comprehensive Elasticsearch MCP (Model Context Protocol) Server providing ${this.tools.length}+ tools for enterprise-grade Elasticsearch operations.\n\n`;
    
    // Table of Contents
    markdown += `## Table of Contents\n\n`;
    categories.forEach(category => {
      markdown += `- [${category.name}](#${category.name.toLowerCase().replace(/\s+/g, '-')}) (${category.count} tools)\n`;
    });
    markdown += `\n`;

    // Categories
    categories.forEach(category => {
      markdown += `## ${category.name}\n\n`;
      markdown += `${category.description}\n\n`;
      markdown += `**Available Tools (${category.count}):**\n\n`;

      const categoryTools = this.tools.filter(tool => tool.category === category.name);
      categoryTools.forEach(tool => {
        markdown += `### \`${tool.name}\`\n\n`;
        markdown += `${tool.description}\n\n`;
        
        if (tool.tags && tool.tags.length > 0) {
          markdown += `**Tags:** ${tool.tags.map(tag => `\`${tag}\``).join(', ')}\n\n`;
        }

        // Input Schema
        markdown += `**Input Schema:**\n\n`;
        markdown += '```json\n';
        markdown += JSON.stringify(tool.inputSchema, null, 2);
        markdown += '\n```\n\n';

        // Examples
        if (tool.examples && tool.examples.length > 0) {
          markdown += `**Examples:**\n\n`;
          tool.examples.forEach((example, index) => {
            markdown += `#### ${example.title}\n\n`;
            markdown += `${example.description}\n\n`;
            markdown += `**Input:**\n`;
            markdown += '```json\n';
            markdown += JSON.stringify(example.input, null, 2);
            markdown += '\n```\n\n';
            
            if (example.expectedOutput) {
              markdown += `**Expected Output:**\n`;
              markdown += '```json\n';
              markdown += JSON.stringify(example.expectedOutput, null, 2);
              markdown += '\n```\n\n';
            }
          });
        }

        markdown += `---\n\n`;
      });
    });

    return markdown;
  }

  public async generateHTMLDocs(): Promise<string> {
    const categories = this.generateCategories();
    
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            border-radius: 10px;
            margin-bottom: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 2.5em;
        }
        .header p {
            margin: 10px 0 0 0;
            opacity: 0.9;
        }
        .stats {
            display: flex;
            justify-content: center;
            gap: 40px;
            margin-top: 20px;
        }
        .stat {
            text-align: center;
        }
        .stat-number {
            font-size: 2em;
            font-weight: bold;
        }
        .nav {
            background: white;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .nav h2 {
            margin-top: 0;
            color: #667eea;
        }
        .nav-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
        }
        .nav-item {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            text-decoration: none;
            color: #333;
            transition: all 0.3s ease;
            border-left: 4px solid #667eea;
        }
        .nav-item:hover {
            background: #e9ecef;
            transform: translateY(-2px);
        }
        .category {
            background: white;
            margin-bottom: 40px;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .category-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
        }
        .category-header h2 {
            margin: 0;
            font-size: 1.8em;
        }
        .category-content {
            padding: 30px;
        }
        .tool {
            border-bottom: 1px solid #eee;
            padding: 30px 0;
        }
        .tool:last-child {
            border-bottom: none;
        }
        .tool-header {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
        }
        .tool-name {
            font-size: 1.4em;
            font-weight: bold;
            color: #667eea;
            margin-right: 15px;
        }
        .tool-tags {
            display: flex;
            gap: 8px;
        }
        .tag {
            background: #e9ecef;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8em;
            color: #495057;
        }
        .tool-description {
            margin-bottom: 20px;
            color: #666;
        }
        .schema-container {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        .schema-title {
            font-weight: bold;
            margin-bottom: 10px;
            color: #495057;
        }
        pre {
            background: #2d3748;
            color: #e2e8f0;
            padding: 20px;
            border-radius: 8px;
            overflow-x: auto;
            font-size: 0.9em;
        }
        .examples {
            margin-top: 20px;
        }
        .example {
            background: #f1f3f4;
            border-left: 4px solid #667eea;
            padding: 20px;
            margin: 15px 0;
            border-radius: 0 8px 8px 0;
        }
        .example-title {
            font-weight: bold;
            margin-bottom: 10px;
            color: #667eea;
        }
        .footer {
            text-align: center;
            padding: 40px;
            color: #666;
            background: white;
            border-radius: 10px;
            margin-top: 40px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${this.title}</h1>
        <p>Version ${this.version} - Production-Ready Elasticsearch MCP Server</p>
        <div class="stats">
            <div class="stat">
                <div class="stat-number">${this.tools.length}+</div>
                <div>Tools</div>
            </div>
            <div class="stat">
                <div class="stat-number">${categories.length}</div>
                <div>Categories</div>
            </div>
        </div>
    </div>

    <div class="nav">
        <h2>Categories</h2>
        <div class="nav-grid">`;

    categories.forEach(category => {
      html += `
            <a href="#${category.name.toLowerCase().replace(/\s+/g, '-')}" class="nav-item">
                <strong>${category.name}</strong><br>
                ${category.count} tools
            </a>`;
    });

    html += `
        </div>
    </div>`;

    categories.forEach(category => {
      html += `
    <div class="category" id="${category.name.toLowerCase().replace(/\s+/g, '-')}">
        <div class="category-header">
            <h2>${category.name}</h2>
        </div>
        <div class="category-content">
            <p>${category.description}</p>`;

      const categoryTools = this.tools.filter(tool => tool.category === category.name);
      categoryTools.forEach(tool => {
        html += `
            <div class="tool">
                <div class="tool-header">
                    <span class="tool-name">${tool.name}</span>
                    <div class="tool-tags">`;
        
        if (tool.tags) {
          tool.tags.forEach(tag => {
            html += `<span class="tag">${tag}</span>`;
          });
        }

        html += `
                    </div>
                </div>
                <div class="tool-description">${tool.description}</div>
                <div class="schema-container">
                    <div class="schema-title">Input Schema</div>
                    <pre><code>${JSON.stringify(tool.inputSchema, null, 2)}</code></pre>
                </div>`;

        if (tool.examples && tool.examples.length > 0) {
          html += `<div class="examples">`;
          tool.examples.forEach(example => {
            html += `
                <div class="example">
                    <div class="example-title">${example.title}</div>
                    <p>${example.description}</p>
                    <div class="schema-container">
                        <div class="schema-title">Input</div>
                        <pre><code>${JSON.stringify(example.input, null, 2)}</code></pre>
                    </div>`;
            
            if (example.expectedOutput) {
              html += `
                    <div class="schema-container">
                        <div class="schema-title">Expected Output</div>
                        <pre><code>${JSON.stringify(example.expectedOutput, null, 2)}</code></pre>
                    </div>`;
            }

            html += `</div>`;
          });
          html += `</div>`;
        }

        html += `</div>`;
      });

      html += `
        </div>
    </div>`;
    });

    html += `
    <div class="footer">
        <p>Generated automatically from Zod schemas • ${new Date().toISOString()}</p>
    </div>
</body>
</html>`;

    return html;
  }

  private generatePaths(): any {
    const paths: any = {};
    
    this.tools.forEach(tool => {
      const pathKey = `/tools/${tool.name}`;
      paths[pathKey] = {
        post: {
          tags: [tool.category],
          summary: tool.description,
          description: tool.description,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: `#/components/schemas/${tool.name}Input`,
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Successful response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      content: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            type: { type: 'string', example: 'text' },
                            text: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': {
              description: 'Invalid request parameters',
            },
            '500': {
              description: 'Internal server error',
            },
          },
        },
      };
    });

    return paths;
  }

  private generateSchemas(): any {
    const schemas: any = {};
    
    this.tools.forEach(tool => {
      schemas[`${tool.name}Input`] = tool.inputSchema;
    });

    return schemas;
  }

  private generateCategories(): CategoryDocumentation[] {
    const categoryMap = new Map<string, string[]>();
    
    this.tools.forEach(tool => {
      if (!categoryMap.has(tool.category)) {
        categoryMap.set(tool.category, []);
      }
      categoryMap.get(tool.category)!.push(tool.name);
    });

    const categoryDescriptions: { [key: string]: string } = {
      'Core': 'Essential Elasticsearch operations including search, mappings, and indices management',
      'Document': 'Document CRUD operations for creating, reading, updating, and deleting documents',
      'Search': 'Advanced search capabilities including SQL queries, scrolling, and multi-search',
      'Index Management': 'Complete index lifecycle management including creation, settings, and maintenance',
      'Cluster': 'Cluster monitoring and health management tools',
      'Bulk': 'High-throughput bulk operations for efficient data processing',
      'Analytics': 'Text analysis and term vector operations',
      'ILM': 'Index Lifecycle Management for automated index policies and transitions',
      'Watcher': 'Comprehensive alerting and monitoring capabilities',
      'Templates': 'Search and index template management',
      'Aliases': 'Index alias management for flexible index routing',
      'Advanced': 'Advanced Elasticsearch features and specialized operations',
    };

    return Array.from(categoryMap.entries()).map(([name, tools]) => ({
      name,
      description: categoryDescriptions[name] || `${name} related operations`,
      tools,
      count: tools.length,
    }));
  }

  public async saveDocumentation(outputDir: string): Promise<void> {
    await fs.mkdir(outputDir, { recursive: true });

    // Save OpenAPI spec
    const openApiSpec = this.generateOpenAPISpec();
    await fs.writeFile(
      path.join(outputDir, 'openapi.json'),
      JSON.stringify(openApiSpec, null, 2)
    );

    // Save Markdown docs
    const markdownDocs = this.generateMarkdownDocs();
    await fs.writeFile(
      path.join(outputDir, 'API.md'),
      markdownDocs
    );

    // Save HTML docs
    const htmlDocs = await this.generateHTMLDocs();
    await fs.writeFile(
      path.join(outputDir, 'index.html'),
      htmlDocs
    );

    console.log(`Documentation generated in ${outputDir}`);
    console.log('- openapi.json: OpenAPI 3.0 specification');
    console.log('- API.md: Markdown documentation');
    console.log('- index.html: Interactive HTML documentation');
  }

  public static fromZodSchema(name: string, description: string, schema: z.ZodTypeAny, category: string): ToolDocumentation {
    return {
      name,
      description,
      category,
      inputSchema: zodToJsonSchemaCompat(schema),
    };
  }
}