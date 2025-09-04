import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { DevelopmentWorkflowTools } from '../../src/dev-tools/developmentWorkflowTools.js';
import { readFile, writeFile, mkdir, rmdir, stat } from 'fs/promises';
import path from 'path';

describe('Development Workflow Tools', () => {
  let devTools: DevelopmentWorkflowTools;
  const testProjectDir = path.join(process.cwd(), 'test-dev-project');
  const testConfigPath = path.join(testProjectDir, 'dev-config.json');

  beforeEach(async () => {
    // Create test project directory
    try {
      await rmdir(testProjectDir, { recursive: true });
    } catch {
      // Directory might not exist
    }
    await mkdir(testProjectDir, { recursive: true });

    // Create test config
    const testConfig = {
      project: {
        name: 'test-mcp-server',
        type: 'mcp',
        runtime: 'bun'
      },
      hotReload: {
        enabled: true,
        watchPaths: ['src/**/*.ts'],
        excludePaths: ['node_modules/**', 'dist/**']
      },
      linting: {
        enabled: true,
        rules: ['typescript', 'mcp-best-practices'],
        autoFix: true
      },
      monitoring: {
        enabled: true,
        metricsPort: 3001,
        healthCheckInterval: 10000
      }
    };

    await writeFile(testConfigPath, JSON.stringify(testConfig, null, 2));

    devTools = new DevelopmentWorkflowTools({
      projectPath: testProjectDir,
      configPath: testConfigPath,
      logLevel: 'info'
    });
  });

  afterEach(async () => {
    if (devTools) {
      await devTools.stop();
    }
    // Clean up test project
    try {
      await rmdir(testProjectDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test('should initialize with project configuration', async () => {
    await devTools.initialize();

    expect(devTools).toBeDefined();
    expect(typeof devTools.startHotReload).toBe('function');
    expect(typeof devTools.runLinter).toBe('function');
    expect(typeof devTools.startMonitoring).toBe('function');

    const config = devTools.getConfig();
    expect(config.project.name).toBe('test-mcp-server');
    expect(config.project.type).toBe('mcp');
    expect(config.hotReload.enabled).toBe(true);

    console.log('✅ Development tools initialized with project configuration');
  });

  test('should create project scaffold', async () => {
    const scaffoldOptions = {
      projectName: 'new-mcp-server',
      template: 'elasticsearch',
      runtime: 'bun' as const,
      features: ['caching', 'monitoring', 'security']
    };

    await devTools.createProjectScaffold(scaffoldOptions);

    // Check that scaffold files were created
    const scaffoldDir = path.join(testProjectDir, 'new-mcp-server');
    
    const srcDir = await stat(path.join(scaffoldDir, 'src')).catch(() => null);
    const packageJson = await readFile(path.join(scaffoldDir, 'package.json'), 'utf-8').catch(() => null);
    const tsConfig = await readFile(path.join(scaffoldDir, 'tsconfig.json'), 'utf-8').catch(() => null);

    expect(srcDir?.isDirectory()).toBe(true);
    expect(packageJson).toBeDefined();
    expect(tsConfig).toBeDefined();

    if (packageJson) {
      const pkg = JSON.parse(packageJson);
      expect(pkg.name).toBe('new-mcp-server');
      expect(pkg.scripts.dev).toBeDefined();
      expect(pkg.dependencies['@modelcontextprotocol/sdk']).toBeDefined();
    }

    console.log('✅ Project scaffold created successfully');
  });

  test('should setup hot reload system', async () => {
    await devTools.initialize();

    // Create test source files
    const srcDir = path.join(testProjectDir, 'src');
    await mkdir(srcDir, { recursive: true });
    
    const testFile = path.join(srcDir, 'test.ts');
    await writeFile(testFile, 'export const test = "initial";');

    let reloadTriggered = false;
    devTools.on('hot_reload', () => {
      reloadTriggered = true;
    });

    // Start hot reload
    await devTools.startHotReload();

    // Wait a moment for watcher to initialize
    await new Promise(resolve => setTimeout(resolve, 100));

    // Modify the test file
    await writeFile(testFile, 'export const test = "modified";');

    // Wait for hot reload to trigger
    await new Promise(resolve => setTimeout(resolve, 200));

    expect(reloadTriggered).toBe(true);

    console.log('✅ Hot reload system working correctly');

    await devTools.stopHotReload();
  });

  test('should run linting with automatic fixes', async () => {
    await devTools.initialize();

    // Create test source with linting issues
    const srcDir = path.join(testProjectDir, 'src');
    await mkdir(srcDir, { recursive: true });

    const badCode = `
// Missing semicolon, bad formatting
const test = "hello world"
export function badFunction(   param:string   ){
return param+   " test"
}
`;

    const testFile = path.join(srcDir, 'bad-code.ts');
    await writeFile(testFile, badCode);

    const lintResults = await devTools.runLinter({
      fix: true,
      paths: ['src/**/*.ts']
    });

    expect(lintResults).toBeDefined();
    expect(lintResults.filesChecked).toBeGreaterThan(0);
    expect(typeof lintResults.issuesFound).toBe('number');
    expect(typeof lintResults.issuesFixed).toBe('number');

    // Check if file was fixed (basic check)
    const fixedContent = await readFile(testFile, 'utf-8');
    expect(fixedContent).not.toBe(badCode); // Should be different after fixing

    console.log(`✅ Linting completed: ${lintResults.filesChecked} files, ${lintResults.issuesFound} issues, ${lintResults.issuesFixed} fixed`);
  });

  test('should generate MCP tool templates', async () => {
    await devTools.initialize();

    const toolSpec = {
      name: 'test_search',
      description: 'Test search functionality',
      category: 'core',
      inputSchema: {
        query: { type: 'string', description: 'Search query' },
        size: { type: 'number', description: 'Result size', optional: true }
      },
      outputSchema: {
        hits: { type: 'array', description: 'Search results' },
        total: { type: 'number', description: 'Total results' }
      }
    };

    const generatedCode = await devTools.generateToolTemplate(toolSpec);

    expect(generatedCode).toBeDefined();
    expect(generatedCode).toContain('test_search');
    expect(generatedCode).toContain('inputSchema');
    expect(generatedCode).toContain('handler');
    expect(generatedCode).toContain('z.object');
    expect(generatedCode).toContain('Search query');

    // Should be valid TypeScript
    expect(generatedCode).toContain('export const testSearch');
    expect(generatedCode).toContain('async (client: Client');

    console.log('✅ MCP tool template generated correctly');
    console.log(`Generated code length: ${generatedCode.length} characters`);
  });

  test('should validate project structure', async () => {
    await devTools.initialize();

    // Create valid project structure
    const srcDir = path.join(testProjectDir, 'src');
    await mkdir(srcDir, { recursive: true });
    await mkdir(path.join(srcDir, 'tools'), { recursive: true });
    await mkdir(path.join(testProjectDir, 'tests'), { recursive: true });

    await writeFile(path.join(testProjectDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      main: 'dist/index.js',
      scripts: { dev: 'bun run src/index.ts' },
      dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' }
    }));

    await writeFile(path.join(srcDir, 'index.ts'), 'export const server = "test";');
    await writeFile(path.join(srcDir, 'tools', 'search.ts'), 'export const search = {};');

    const validation = await devTools.validateProjectStructure();

    expect(validation).toBeDefined();
    expect(validation.isValid).toBe(true);
    expect(validation.issues.length).toBe(0);
    expect(validation.suggestions.length).toBeGreaterThanOrEqual(0);

    console.log(`✅ Project structure validation: valid=${validation.isValid}, issues=${validation.issues.length}, suggestions=${validation.suggestions.length}`);
  });

  test('should run development server with monitoring', async () => {
    await devTools.initialize();

    // Create minimal server file
    const srcDir = path.join(testProjectDir, 'src');
    await mkdir(srcDir, { recursive: true });

    const serverCode = `
import { createServer } from './test-server';

const server = createServer();
console.log('Test server started');

export { server };
`;

    await writeFile(path.join(srcDir, 'index.ts'), serverCode);

    let serverStarted = false;
    let monitoringData: any = null;

    devTools.on('server_started', () => {
      serverStarted = true;
    });

    devTools.on('monitoring_update', (data) => {
      monitoringData = data;
    });

    // Start development server
    const serverProcess = await devTools.startDevelopmentServer({
      watch: true,
      enableMonitoring: true
    });

    expect(serverProcess).toBeDefined();

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 300));

    // Should have monitoring data
    expect(monitoringData).toBeDefined();
    if (monitoringData) {
      expect(typeof monitoringData.memoryUsage).toBe('number');
      expect(typeof monitoringData.cpuUsage).toBe('number');
    }

    console.log('✅ Development server started with monitoring');

    await devTools.stopDevelopmentServer();
  });

  test('should generate comprehensive tests', async () => {
    await devTools.initialize();

    const toolDefinition = {
      name: 'search_documents',
      description: 'Search through documents',
      inputSchema: {
        query: { type: 'string', required: true },
        index: { type: 'string', optional: true },
        size: { type: 'number', optional: true, default: 10 }
      },
      category: 'search'
    };

    const testCode = await devTools.generateTestSuite(toolDefinition);

    expect(testCode).toBeDefined();
    expect(testCode).toContain('describe(\'search_documents\'');
    expect(testCode).toContain('should handle valid inputs');
    expect(testCode).toContain('should validate required parameters');
    expect(testCode).toContain('should handle errors gracefully');
    expect(testCode).toContain('expect(');

    // Should include proper test structure
    expect(testCode).toContain('beforeEach');
    expect(testCode).toContain('afterEach');
    expect(testCode).toContain('test(');

    console.log('✅ Comprehensive test suite generated');
    console.log(`Test code length: ${testCode.length} characters`);
  });

  test('should provide development insights', async () => {
    await devTools.initialize();

    // Create some project files to analyze
    const srcDir = path.join(testProjectDir, 'src');
    await mkdir(srcDir, { recursive: true });
    await mkdir(path.join(srcDir, 'tools'), { recursive: true });

    // Create multiple tool files
    const tools = ['search', 'index', 'delete'];
    for (const tool of tools) {
      await writeFile(path.join(srcDir, 'tools', `${tool}.ts`), `export const ${tool} = { name: '${tool}' };`);
    }

    const insights = await devTools.getDevelopmentInsights();

    expect(insights).toBeDefined();
    expect(insights.projectStats).toBeDefined();
    expect(insights.codeQuality).toBeDefined();
    expect(insights.recommendations).toBeDefined();

    expect(insights.projectStats.totalFiles).toBeGreaterThan(0);
    expect(insights.projectStats.toolCount).toBe(3);
    expect(Array.isArray(insights.recommendations)).toBe(true);

    console.log(`✅ Development insights: ${insights.projectStats.totalFiles} files, ${insights.projectStats.toolCount} tools, ${insights.recommendations.length} recommendations`);
  });
});

describe('Development Workflow Integration', () => {
  test('should integrate with TypeScript compiler', async () => {
    const testDir = path.join(process.cwd(), 'test-ts-integration');
    await mkdir(testDir, { recursive: true });

    try {
      const devTools = new DevelopmentWorkflowTools({
        projectPath: testDir,
        logLevel: 'error'
      });

      await devTools.initialize();

      // Create TypeScript files with various issues
      const srcDir = path.join(testDir, 'src');
      await mkdir(srcDir, { recursive: true });

      const tsCode = `
interface TestInterface {
  name: string;
  value?: number;
}

export function testFunction(param: TestInterface): string {
  return param.name + (param.value || 0);
}

// Type error - should be caught
export const invalidAssignment: string = 123;
`;

      await writeFile(path.join(srcDir, 'test.ts'), tsCode);
      await writeFile(path.join(testDir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
          target: 'es2022',
          module: 'esnext',
          strict: true
        }
      }));

      const compileResults = await devTools.runTypeChecker();

      expect(compileResults).toBeDefined();
      expect(compileResults.errors.length).toBeGreaterThan(0); // Should catch the type error
      expect(compileResults.files.length).toBeGreaterThan(0);

      console.log(`✅ TypeScript integration: ${compileResults.errors.length} errors, ${compileResults.files.length} files`);

      await devTools.stop();
    } finally {
      await rmdir(testDir, { recursive: true }).catch(() => {});
    }
  });

  test('should integrate with package manager', async () => {
    const testDir = path.join(process.cwd(), 'test-pkg-integration');
    await mkdir(testDir, { recursive: true });

    try {
      const devTools = new DevelopmentWorkflowTools({
        projectPath: testDir,
        logLevel: 'error'
      });

      await devTools.initialize();

      // Create package.json
      await writeFile(path.join(testDir, 'package.json'), JSON.stringify({
        name: 'test-package',
        dependencies: {
          '@modelcontextprotocol/sdk': '^1.0.0',
          'zod': '^3.23.0'
        },
        devDependencies: {
          'typescript': '^5.0.0',
          '@types/node': '^20.0.0'
        }
      }));

      const packageInfo = await devTools.getPackageInfo();

      expect(packageInfo).toBeDefined();
      expect(packageInfo.dependencies).toBeDefined();
      expect(packageInfo.devDependencies).toBeDefined();
      expect(packageInfo.dependencies['@modelcontextprotocol/sdk']).toBeDefined();

      const outdated = await devTools.checkOutdatedPackages();
      expect(Array.isArray(outdated)).toBe(true);

      console.log(`✅ Package manager integration: ${Object.keys(packageInfo.dependencies).length} deps, ${outdated.length} outdated`);

      await devTools.stop();
    } finally {
      await rmdir(testDir, { recursive: true }).catch(() => {});
    }
  });

  test('should provide performance optimization suggestions', async () => {
    const testDir = path.join(process.cwd(), 'test-perf-suggestions');
    await mkdir(testDir, { recursive: true });

    try {
      const devTools = new DevelopmentWorkflowTools({
        projectPath: testDir,
        logLevel: 'error'
      });

      await devTools.initialize();

      // Create code with performance issues
      const srcDir = path.join(testDir, 'src');
      await mkdir(srcDir, { recursive: true });

      const performanceCode = `
// Inefficient code patterns
export function inefficientSearch(data: any[], query: string) {
  let results = [];
  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < data.length; j++) { // O(n²) loop
      if (data[i].includes(query)) {
        results.push(data[i]);
      }
    }
  }
  return results;
}

// Memory-intensive operations
export function memoryIntensive() {
  const largeArray = new Array(1000000).fill('data');
  return largeArray.map(item => item + 'processed');
}

// Synchronous operations that should be async
export function blockingOperation() {
  let count = 0;
  for (let i = 0; i < 10000000; i++) {
    count += i;
  }
  return count;
}
`;

      await writeFile(path.join(srcDir, 'performance-issues.ts'), performanceCode);

      const suggestions = await devTools.getPerformanceOptimizations();

      expect(suggestions).toBeDefined();
      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeGreaterThan(0);

      // Should identify common performance issues
      const hasComplexityIssue = suggestions.some(s => s.type === 'algorithm_complexity');
      const hasMemoryIssue = suggestions.some(s => s.type === 'memory_usage');
      const hasAsyncIssue = suggestions.some(s => s.type === 'async_optimization');

      expect(hasComplexityIssue || hasMemoryIssue || hasAsyncIssue).toBe(true);

      console.log(`✅ Performance suggestions: ${suggestions.length} optimizations found`);

      await devTools.stop();
    } finally {
      await rmdir(testDir, { recursive: true }).catch(() => {});
    }
  });
});

describe('Development Workflow Performance', () => {
  test('should handle large projects efficiently', async () => {
    const testDir = path.join(process.cwd(), 'test-large-project');
    await mkdir(testDir, { recursive: true });

    try {
      const devTools = new DevelopmentWorkflowTools({
        projectPath: testDir,
        logLevel: 'error'
      });

      await devTools.initialize();

      // Create a project with many files
      const srcDir = path.join(testDir, 'src');
      const toolsDir = path.join(srcDir, 'tools');
      await mkdir(srcDir, { recursive: true });
      await mkdir(toolsDir, { recursive: true });

      // Generate 50 tool files
      const fileCreationPromises = [];
      for (let i = 0; i < 50; i++) {
        const toolCode = `
export const tool${i} = {
  name: 'tool_${i}',
  description: 'Test tool number ${i}',
  inputSchema: z.object({
    param${i}: z.string().describe('Parameter ${i}')
  }),
  handler: async (client, args) => {
    return { result: 'tool${i} executed' };
  }
};
`;
        fileCreationPromises.push(
          writeFile(path.join(toolsDir, `tool${i}.ts`), toolCode)
        );
      }

      const startTime = performance.now();
      await Promise.all(fileCreationPromises);
      const creationTime = performance.now() - startTime;

      // Test project analysis performance
      const analysisStart = performance.now();
      const insights = await devTools.getDevelopmentInsights();
      const analysisTime = performance.now() - analysisStart;

      expect(insights.projectStats.totalFiles).toBeGreaterThanOrEqual(50);
      expect(creationTime).toBeLessThan(5000); // Should create files quickly
      expect(analysisTime).toBeLessThan(10000); // Should analyze quickly

      console.log(`✅ Large project handling: created 50 files in ${creationTime.toFixed(2)}ms, analyzed in ${analysisTime.toFixed(2)}ms`);

      await devTools.stop();
    } finally {
      await rmdir(testDir, { recursive: true }).catch(() => {});
    }
  });

  test('should optimize hot reload for minimal impact', async () => {
    const testDir = path.join(process.cwd(), 'test-hot-reload-perf');
    await mkdir(testDir, { recursive: true });

    try {
      const devTools = new DevelopmentWorkflowTools({
        projectPath: testDir,
        logLevel: 'error'
      });

      await devTools.initialize();

      // Create source files
      const srcDir = path.join(testDir, 'src');
      await mkdir(srcDir, { recursive: true });

      const testFile = path.join(srcDir, 'test.ts');
      await writeFile(testFile, 'export const test = "initial";');

      let reloadCount = 0;
      let totalReloadTime = 0;

      devTools.on('hot_reload', (data) => {
        reloadCount++;
        totalReloadTime += data.reloadTime || 0;
      });

      await devTools.startHotReload();

      // Make several file changes
      for (let i = 0; i < 10; i++) {
        const changeStart = performance.now();
        await writeFile(testFile, `export const test = "change_${i}";`);
        
        // Wait for reload to complete
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const changeTime = performance.now() - changeStart;
        expect(changeTime).toBeLessThan(1000); // Each change should be fast
      }

      expect(reloadCount).toBeGreaterThan(5); // Should have triggered reloads
      
      if (totalReloadTime > 0) {
        const avgReloadTime = totalReloadTime / reloadCount;
        expect(avgReloadTime).toBeLessThan(500); // Average reload should be fast
      }

      console.log(`✅ Hot reload performance: ${reloadCount} reloads, avg time=${totalReloadTime / reloadCount || 0}ms`);

      await devTools.stopHotReload();
      await devTools.stop();
    } finally {
      await rmdir(testDir, { recursive: true }).catch(() => {});
    }
  });
});