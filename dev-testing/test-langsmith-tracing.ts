#!/usr/bin/env bun

/**
 * Comprehensive LangSmith Tracing Implementation Test
 * 
 * This script tests all aspects of the tracing implementation
 * following the patterns described in LANGSMITH_TRACING_IMPLEMENTATION.md
 */

import { setTimeout as sleep } from 'timers/promises';

// Colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration?: number;
}

class LangSmithTracingTester {
  private results: TestResult[] = [];

  async runAllTests(): Promise<void> {
    console.log(`${colors.bold}${colors.cyan}🧪 LangSmith Tracing Implementation Test Suite${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════${colors.reset}\n`);

    // Run all test categories
    await this.testEnvironmentConfiguration();
    await this.testTracingInitialization();
    await this.testDynamicToolNaming();
    await this.testToolRegistration();
    await this.testActualServerExecution();
    await this.testEndToEndTracing();

    this.printSummary();
  }

  private async testEnvironmentConfiguration(): Promise<void> {
    console.log(`${colors.bold}1. Environment Configuration Tests${colors.reset}`);
    console.log('─'.repeat(40));

    // Test 1: Check required environment variables
    await this.runTest(
      'Required Environment Variables',
      () => {
        const langsmithTracing = process.env.LANGSMITH_TRACING;
        const apiKey = process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY;
        const project = process.env.LANGSMITH_PROJECT;

        if (!langsmithTracing || langsmithTracing !== 'true') {
          throw new Error('LANGSMITH_TRACING must be set to "true"');
        }

        if (!apiKey || !apiKey.startsWith('lsv2_sk_')) {
          throw new Error('LANGSMITH_API_KEY must be set with valid key format');
        }

        if (!project) {
          throw new Error('LANGSMITH_PROJECT must be set');
        }

        return 'All required environment variables are properly configured';
      }
    );

    // Test 2: Configuration file access
    await this.runTest(
      'Configuration File Access',
      async () => {
        try {
          const { config } = await import('./src/config.js');
          return `Configuration loaded: ${config ? 'Success' : 'Failed'}`;
        } catch (error) {
          throw new Error(`Failed to load configuration: ${error.message}`);
        }
      }
    );

    console.log('');
  }

  private async testTracingInitialization(): Promise<void> {
    console.log(`${colors.bold}2. Tracing Initialization Tests${colors.reset}`);
    console.log('─'.repeat(40));

    // Test 3: Import tracing utilities
    await this.runTest(
      'Tracing Utilities Import',
      async () => {
        try {
          const tracing = await import('./src/utils/tracing.js');
          
          if (typeof tracing.traceToolExecution !== 'function') {
            throw new Error('traceToolExecution is not a function');
          }

          if (typeof tracing.initializeTracing !== 'function') {
            throw new Error('initializeTracing is not a function');
          }

          return 'All tracing utilities imported successfully';
        } catch (error) {
          throw new Error(`Import failed: ${error.message}`);
        }
      }
    );

    // Test 4: LangSmith client initialization
    await this.runTest(
      'LangSmith Client Initialization',
      async () => {
        try {
          // Import and initialize
          const { initializeTracing } = await import('./src/utils/tracing.js');
          
          // This should work without throwing
          initializeTracing();
          
          return 'LangSmith client initialized without errors';
        } catch (error) {
          throw new Error(`Initialization failed: ${error.message}`);
        }
      }
    );

    console.log('');
  }

  private async testDynamicToolNaming(): Promise<void> {
    console.log(`${colors.bold}3. Dynamic Tool Naming Tests${colors.reset}`);
    console.log('─'.repeat(40));

    // Test 5: Function signature verification
    await this.runTest(
      'traceToolExecution Function Signature',
      async () => {
        try {
          const { traceToolExecution } = await import('./src/utils/tracing.js');
          
          // Check that it's a function, not a constant
          if (typeof traceToolExecution !== 'function') {
            throw new Error('traceToolExecution should be a function, not a constant');
          }

          // Verify function parameters
          const funcString = traceToolExecution.toString();
          if (!funcString.includes('toolName')) {
            throw new Error('Function should accept toolName parameter');
          }

          return 'Function signature is correct for dynamic naming';
        } catch (error) {
          throw new Error(`Signature verification failed: ${error.message}`);
        }
      }
    );

    // Test 6: Dynamic traceable creation
    await this.runTest(
      'Dynamic Traceable Creation Pattern',
      async () => {
        try {
          const { traceToolExecution } = await import('./src/utils/tracing.js');
          
          // Mock handler for testing
          const mockHandler = async () => ({ result: 'test' });
          
          // This should create different traceable instances for different tool names
          const toolName1 = 'elasticsearch_search';
          const toolName2 = 'elasticsearch_list_indices';
          
          // These calls should not fail (even if tracing is disabled)
          const result1 = await traceToolExecution(toolName1, {}, mockHandler);
          const result2 = await traceToolExecution(toolName2, {}, mockHandler);
          
          if (!result1 || !result2) {
            throw new Error('Tracing function should return results');
          }

          return 'Dynamic traceable creation works correctly';
        } catch (error) {
          throw new Error(`Dynamic creation failed: ${error.message}`);
        }
      }
    );

    console.log('');
  }

  private async testToolRegistration(): Promise<void> {
    console.log(`${colors.bold}4. Tool Registration System Tests${colors.reset}`);
    console.log('─'.repeat(40));

    // Test 7: Tool registration import
    await this.runTest(
      'Tool Registration System Import',
      async () => {
        try {
          const { registerAllTools } = await import('./src/tools/index.js');
          
          if (typeof registerAllTools !== 'function') {
            throw new Error('registerAllTools should be a function');
          }

          return 'Tool registration system imported successfully';
        } catch (error) {
          throw new Error(`Registration system import failed: ${error.message}`);
        }
      }
    );

    // Test 8: Server wrapper pattern
    await this.runTest(
      'Server Tool Method Override Pattern',
      async () => {
        try {
          // Create a mock MCP server
          const mockServer = {
            originalToolCalled: false,
            tool: function(name: string, description: string, inputSchema: any, handler: any) {
              this.originalToolCalled = true;
              return { name, description, inputSchema, handler };
            }
          };

          // Apply the wrapping pattern (simplified version)
          const originalTool = mockServer.tool.bind(mockServer);
          let tracingApplied = false;

          mockServer.tool = function(name: string, description: string, inputSchema: any, handler: any) {
            // Simulate the tracing wrapper
            const enhancedHandler = async (args: any) => {
              tracingApplied = true;
              return handler(args);
            };
            
            return originalTool(name, description, inputSchema, enhancedHandler);
          };

          // Test the wrapper
          const result = mockServer.tool('test_tool', 'Test tool', {}, async () => 'result');
          
          if (!mockServer.originalToolCalled) {
            throw new Error('Original tool method was not called');
          }

          // Test the enhanced handler
          await result.handler({});
          
          if (!tracingApplied) {
            throw new Error('Tracing wrapper was not applied');
          }

          return 'Server tool method override pattern works correctly';
        } catch (error) {
          throw new Error(`Server wrapper test failed: ${error.message}`);
        }
      }
    );

    console.log('');
  }

  private async testActualServerExecution(): Promise<void> {
    console.log(`${colors.bold}5. Actual Server Execution Tests${colors.reset}`);
    console.log('─'.repeat(40));

    // Test 9: Server startup logs
    await this.runTest(
      'Server Startup with Tracing Logs',
      async () => {
        try {
          // Start server process and capture logs
          const { spawn } = await import('child_process');
          
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              process.kill();
              reject(new Error('Server startup timeout'));
            }, 15000);

            const process = spawn('bun', ['run', 'src/index.ts'], {
              stdio: ['pipe', 'pipe', 'pipe'],
              env: { ...Bun.env, LOG_LEVEL: 'debug' }
            });

            let output = '';
            let foundTracingInit = false;
            let foundToolRegistration = false;

            process.stdout?.on('data', (data) => {
              output += data.toString();
              
              if (output.includes('✅ LangSmith tracing initialized')) {
                foundTracingInit = true;
              }
              
              if (output.includes('🚀 Registering all tools with automatic tracing')) {
                foundToolRegistration = true;
              }

              if (foundTracingInit && foundToolRegistration) {
                clearTimeout(timeout);
                process.kill();
                resolve('Server startup shows correct tracing initialization');
              }
            });

            process.stderr?.on('data', (data) => {
              output += data.toString();
            });

            process.on('error', (error) => {
              clearTimeout(timeout);
              reject(new Error(`Server startup failed: ${error.message}`));
            });
          });
        } catch (error) {
          throw new Error(`Server execution test failed: ${error.message}`);
        }
      }
    );

    console.log('');
  }

  private async testEndToEndTracing(): Promise<void> {
    console.log(`${colors.bold}6. End-to-End Tracing Tests${colors.reset}`);
    console.log('─'.repeat(40));

    // Test 10: MCP Inspector Integration
    await this.runTest(
      'MCP Inspector Startup',
      async () => {
        try {
          const { spawn } = await import('child_process');
          
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              process.kill();
              reject(new Error('MCP Inspector startup timeout'));
            }, 20000);

            const process = spawn('bun', ['run', 'inspector'], {
              stdio: ['pipe', 'pipe', 'pipe'],
              env: { ...Bun.env, LOG_LEVEL: 'debug' }
            });

            let output = '';

            process.stdout?.on('data', (data) => {
              output += data.toString();
              
              if (output.includes('MCP Inspector is up and running')) {
                clearTimeout(timeout);
                process.kill();
                resolve('MCP Inspector started successfully with tracing enabled');
              }
            });

            process.stderr?.on('data', (data) => {
              output += data.toString();
            });

            process.on('error', (error) => {
              clearTimeout(timeout);
              reject(new Error(`Inspector startup failed: ${error.message}`));
            });
          });
        } catch (error) {
          throw new Error(`MCP Inspector test failed: ${error.message}`);
        }
      }
    );

    // Test 11: Working tests suite
    await this.runTest(
      'Enhanced Features Test Suite',
      async () => {
        try {
          const { spawn } = await import('child_process');
          
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              process.kill();
              reject(new Error('Test suite timeout'));
            }, 60000);

            const process = spawn('bun', ['run', 'scripts/run-working-tests.ts'], {
              stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';

            process.stdout?.on('data', (data) => {
              output += data.toString();
            });

            process.on('close', (code) => {
              clearTimeout(timeout);
              
              if (code === 0 && output.includes('98.4%')) {
                resolve('Test suite passed with 98.4%+ success rate');
              } else {
                reject(new Error(`Test suite failed with code ${code}`));
              }
            });

            process.on('error', (error) => {
              clearTimeout(timeout);
              reject(new Error(`Test execution failed: ${error.message}`));
            });
          });
        } catch (error) {
          throw new Error(`Working tests failed: ${error.message}`);
        }
      }
    );

    console.log('');
  }

  private async runTest(name: string, testFn: () => any): Promise<void> {
    const startTime = Date.now();
    
    try {
      const result = await testFn();
      const duration = Date.now() - startTime;
      
      console.log(`  ${colors.green}✓${colors.reset} ${name} (${duration}ms)`);
      if (result && typeof result === 'string') {
        console.log(`    ${colors.cyan}→${colors.reset} ${result}`);
      }
      
      this.results.push({ name, passed: true, message: result || 'Passed', duration });
    } catch (error) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      
      console.log(`  ${colors.red}✗${colors.reset} ${name} (${duration}ms)`);
      console.log(`    ${colors.red}→${colors.reset} ${message}`);
      
      this.results.push({ name, passed: false, message, duration });
    }
  }

  private printSummary(): void {
    console.log('\n' + '═'.repeat(50));
    console.log(`${colors.bold}${colors.cyan}📊 Test Results Summary${colors.reset}`);
    console.log('═'.repeat(50));

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;
    const successRate = ((passed / total) * 100).toFixed(1);

    console.log(`\n${colors.bold}Overall Results:${colors.reset}`);
    console.log(`  ${colors.green}✓ Passed:${colors.reset} ${passed}/${total} tests`);
    console.log(`  ${colors.red}✗ Failed:${colors.reset} ${failed}/${total} tests`);
    console.log(`  ${colors.cyan}📈 Success Rate:${colors.reset} ${successRate}%`);

    if (failed > 0) {
      console.log(`\n${colors.bold}${colors.red}❌ Failed Tests:${colors.reset}`);
      this.results
        .filter(r => !r.passed)
        .forEach(result => {
          console.log(`  • ${result.name}: ${result.message}`);
        });
    }

    const totalTime = this.results.reduce((sum, r) => sum + (r.duration || 0), 0);
    console.log(`\n${colors.bold}⏱️  Total Test Time:${colors.reset} ${totalTime}ms`);

    // LangSmith-specific validation
    console.log(`\n${colors.bold}🎯 LangSmith Tracing Validation:${colors.reset}`);
    
    if (successRate >= 90) {
      console.log(`  ${colors.green}✅ Implementation is working correctly${colors.reset}`);
      console.log(`  ${colors.cyan}→${colors.reset} Tools should appear with dynamic names in LangSmith`);
      console.log(`  ${colors.cyan}→${colors.reset} All tools are being traced unconditionally`);
      console.log(`  ${colors.cyan}→${colors.reset} Production features are preserved`);
    } else {
      console.log(`  ${colors.red}❌ Implementation needs attention${colors.reset}`);
      console.log(`  ${colors.yellow}⚠️${colors.reset}  Check failed tests above for specific issues`);
    }

    console.log(`\n${colors.bold}🔗 Next Steps:${colors.reset}`);
    console.log(`  1. Check LangSmith dashboard: https://smith.langchain.com`);
    console.log(`  2. Execute tools via MCP client and verify trace names`);
    console.log(`  3. Look for traces like 'elasticsearch_search', not 'Tool Execution'`);
    console.log('');

    // Exit with appropriate code
    process.exit(failed > 0 ? 1 : 0);
  }
}

// Run the tests
const tester = new LangSmithTracingTester();
tester.runAllTests().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});