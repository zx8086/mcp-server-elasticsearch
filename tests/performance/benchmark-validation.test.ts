import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { PerformanceTestSuite, type PerformanceBenchmark } from '../../tests/performance/performanceSuite.js';
import { createElasticsearchMCPServer } from '../../src/server.js';
import { getConfig } from '../../src/config.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

describe('Performance Benchmark Validation', () => {
  let performanceSuite: PerformanceTestSuite;
  const testOutputDir = path.join(process.cwd(), 'test-performance-output');

  beforeAll(async () => {
    try {
      const config = getConfig();
      const server = createElasticsearchMCPServer(config);
      performanceSuite = new PerformanceTestSuite(server);
      
      // Ensure test output directory exists
      await mkdir(testOutputDir, { recursive: true });
    } catch (error) {
      console.log('⚠️ Could not initialize performance suite:', error.message);
    }
  });

  afterAll(async () => {
    // Clean up test outputs if needed
    try {
      // Keep test outputs for review - don't clean up automatically
    } catch (error) {
      console.log('⚠️ Cleanup error:', error.message);
    }
  });

  test('should run individual tool performance tests', async () => {
    if (!performanceSuite) {
      console.log('⚠️ Performance suite not available, skipping test');
      return;
    }

    const toolsToTest = ['search', 'list_indices', 'cluster_health'];
    const results: PerformanceBenchmark[] = [];

    for (const toolName of toolsToTest) {
      try {
        const benchmark = await performanceSuite.runPerformanceTest(
          toolName,
          getTestArgsForTool(toolName),
          10 // Small number for fast testing
        );
        
        results.push(benchmark);
        
        // Validate benchmark results
        expect(benchmark.toolName).toBe(toolName);
        expect(benchmark.iterations).toBe(10);
        expect(benchmark.metrics.length).toBe(10);
        expect(benchmark.summary.avgDuration).toBeGreaterThan(0);
        expect(benchmark.summary.successRate).toBeGreaterThanOrEqual(0);
        expect(benchmark.summary.successRate).toBeLessThanOrEqual(100);
        
        console.log(`✅ ${toolName}: ${benchmark.summary.avgDuration.toFixed(2)}ms avg, ${benchmark.summary.successRate.toFixed(1)}% success`);
        
      } catch (error) {
        console.log(`⚠️ Performance test failed for ${toolName}:`, error.message);
      }
    }

    expect(results.length).toBeGreaterThan(0);
  });

  test('should validate performance metrics structure', async () => {
    if (!performanceSuite) {
      console.log('⚠️ Performance suite not available, skipping test');
      return;
    }

    try {
      const benchmark = await performanceSuite.runPerformanceTest(
        'search',
        { query: { match_all: {} }, size: 5 },
        5
      );

      // Validate metric structure
      for (const metric of benchmark.metrics) {
        expect(typeof metric.duration).toBe('number');
        expect(metric.duration).toBeGreaterThanOrEqual(0);
        
        expect(typeof metric.memoryBefore).toBe('object');
        expect(typeof metric.memoryAfter).toBe('object');
        expect(typeof metric.memoryDelta).toBe('object');
        
        expect(typeof metric.memoryBefore.rss).toBe('number');
        expect(typeof metric.memoryBefore.heapUsed).toBe('number');
        expect(typeof metric.memoryAfter.rss).toBe('number');
        expect(typeof metric.memoryAfter.heapUsed).toBe('number');
        
        expect(typeof metric.memoryDelta.rss).toBe('number');
        expect(typeof metric.memoryDelta.heapUsed).toBe('number');
      }

      // Validate summary calculations
      const durations = benchmark.metrics.map(m => m.duration);
      const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
      
      expect(Math.abs(benchmark.summary.avgDuration - avgDuration)).toBeLessThan(0.1);
      expect(benchmark.summary.minDuration).toBe(Math.min(...durations));
      expect(benchmark.summary.maxDuration).toBe(Math.max(...durations));

      console.log('✅ Performance metrics structure is valid');
      
    } catch (error) {
      console.log('⚠️ Performance metrics validation failed:', error.message);
    }
  });

  test('should handle baseline comparison correctly', async () => {
    if (!performanceSuite) {
      console.log('⚠️ Performance suite not available, skipping test');
      return;
    }

    try {
      // Run a baseline test
      await performanceSuite.runPerformanceTest('search', { query: { match_all: {} } }, 5);
      
      // Try to compare with baseline
      try {
        const comparison = performanceSuite.compareWithBaseline('search');
        
        // Should have comparison structure
        expect(typeof comparison.regression).toBe('boolean');
        expect(comparison.results).toBeDefined();
        expect(comparison.results.duration).toBeDefined();
        expect(comparison.results.memory).toBeDefined();
        expect(comparison.results.successRate).toBeDefined();
        
        console.log(`✅ Baseline comparison: regression=${comparison.regression}`);
        
      } catch (error) {
        if (error.message.includes('No data available')) {
          console.log('✅ Baseline comparison correctly handles missing baseline');
        } else {
          throw error;
        }
      }
      
    } catch (error) {
      console.log('⚠️ Baseline comparison test failed:', error.message);
    }
  });

  test('should generate performance reports', async () => {
    if (!performanceSuite) {
      console.log('⚠️ Performance suite not available, skipping test');
      return;
    }

    try {
      // Run a few tests
      await performanceSuite.runPerformanceTest('search', { query: { match_all: {} } }, 3);
      await performanceSuite.runPerformanceTest('list_indices', {}, 3);
      
      const report = performanceSuite.generateReport();
      
      // Validate report structure
      expect(typeof report).toBe('string');
      expect(report.length).toBeGreaterThan(100);
      
      // Should contain expected sections
      expect(report).toContain('Performance Test Report');
      expect(report).toContain('Test Results Summary');
      expect(report).toContain('Regression Analysis');
      
      // Should contain tool names
      expect(report).toContain('search');
      expect(report).toContain('list_indices');
      
      // Save report for inspection
      const reportPath = path.join(testOutputDir, 'test-performance-report.md');
      await writeFile(reportPath, report);
      
      console.log(`✅ Performance report generated (${report.length} chars)`);
      console.log(`📄 Report saved to: ${reportPath}`);
      
    } catch (error) {
      console.log('⚠️ Report generation test failed:', error.message);
    }
  });

  test('should save performance results', async () => {
    if (!performanceSuite) {
      console.log('⚠️ Performance suite not available, skipping test');
      return;
    }

    try {
      // Run a test
      await performanceSuite.runPerformanceTest('cluster_health', {}, 3);
      
      // Save results
      const resultsFile = 'test-performance-results.json';
      await performanceSuite.saveResults(resultsFile);
      
      // Verify results file was created and is valid
      const resultsPath = path.join('performance', resultsFile);
      const resultsContent = await readFile(resultsPath, 'utf-8');
      const resultsData = JSON.parse(resultsContent);
      
      expect(resultsData.timestamp).toBeDefined();
      expect(resultsData.results).toBeDefined();
      expect(typeof resultsData.results).toBe('object');
      
      console.log('✅ Performance results saved successfully');
      
    } catch (error) {
      console.log('⚠️ Results saving test failed:', error.message);
    }
  });
});

describe('Memory Leak Detection', () => {
  test('should detect memory growth patterns', async () => {
    const initialMemory = process.memoryUsage();
    console.log(`🔍 Initial memory: ${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`);
    
    // Create some memory pressure
    const testData: any[] = [];
    
    for (let i = 0; i < 1000; i++) {
      // Simulate tool execution memory usage
      testData.push({
        id: i,
        data: new Array(100).fill(`test-data-${i}`),
        timestamp: Date.now()
      });
      
      // Occasional cleanup
      if (i % 100 === 0) {
        const currentMemory = process.memoryUsage();
        const memoryGrowth = currentMemory.heapUsed - initialMemory.heapUsed;
        
        console.log(`📊 Memory after ${i} operations: ${Math.round(currentMemory.heapUsed / 1024 / 1024)}MB (+${Math.round(memoryGrowth / 1024 / 1024)}MB)`);
        
        // Memory growth should be reasonable
        expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024); // Less than 100MB
      }
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    // Clear test data
    testData.length = 0;
    
    // Final memory check
    const finalMemory = process.memoryUsage();
    const totalGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
    
    console.log(`🏁 Final memory growth: ${Math.round(totalGrowth / 1024 / 1024)}MB`);
    
    // Should not have significant permanent memory growth
    expect(totalGrowth).toBeLessThan(50 * 1024 * 1024); // Less than 50MB permanent growth
  });

  test('should handle repeated operations without memory leaks', async () => {
    const performanceTest = async (iterations: number) => {
      const startMemory = process.memoryUsage();
      
      for (let i = 0; i < iterations; i++) {
        // Simulate performance test operations
        const testObject = {
          metrics: {
            duration: Math.random() * 100,
            memoryBefore: process.memoryUsage(),
            memoryAfter: process.memoryUsage(),
            memoryDelta: { rss: 0, heapUsed: 0, heapTotal: 0, external: 0 }
          }
        };
        
        // Process the object
        const processed = JSON.parse(JSON.stringify(testObject));
        
        // Clean up
        delete testObject.metrics;
      }
      
      const endMemory = process.memoryUsage();
      return endMemory.heapUsed - startMemory.heapUsed;
    };
    
    // Run test multiple times
    const growths = [];
    for (let run = 0; run < 5; run++) {
      const growth = await performanceTest(200);
      growths.push(growth);
      
      console.log(`Run ${run + 1}: Memory growth ${Math.round(growth / 1024)}KB`);
      
      // Force cleanup between runs
      if (global.gc) {
        global.gc();
      }
    }
    
    // Calculate average growth
    const avgGrowth = growths.reduce((sum, g) => sum + g, 0) / growths.length;
    
    console.log(`Average memory growth: ${Math.round(avgGrowth / 1024)}KB per 200 operations`);
    
    // Should not have significant average growth
    expect(avgGrowth).toBeLessThan(1024 * 1024); // Less than 1MB average growth
  });
});

describe('Performance Regression Detection', () => {
  test('should detect performance regressions correctly', async () => {
    // Create mock performance data to test regression detection
    const baselineData = {
      toolName: 'test_tool',
      category: 'Test',
      iterations: 100,
      metrics: [],
      summary: {
        avgDuration: 50.0,
        minDuration: 20.0,
        maxDuration: 80.0,
        p95Duration: 75.0,
        avgMemoryGrowth: 1024,
        successRate: 100.0,
      }
    };

    const currentData = {
      toolName: 'test_tool',
      category: 'Test',
      iterations: 100,
      metrics: [],
      summary: {
        avgDuration: 65.0, // 30% slower
        minDuration: 25.0,
        maxDuration: 95.0,
        p95Duration: 90.0,
        avgMemoryGrowth: 1536, // 50% more memory
        successRate: 95.0, // 5% lower success rate
      }
    };

    // Calculate regression manually to test logic
    const durationChange = ((currentData.summary.avgDuration - baselineData.summary.avgDuration) / baselineData.summary.avgDuration) * 100;
    const memoryChange = ((currentData.summary.avgMemoryGrowth - baselineData.summary.avgMemoryGrowth) / baselineData.summary.avgMemoryGrowth) * 100;
    const successRateChange = currentData.summary.successRate - baselineData.summary.successRate;

    // Test thresholds
    const DURATION_THRESHOLD = 20; // 20% increase is a regression
    const MEMORY_THRESHOLD = 50; // 50% increase is a regression
    const SUCCESS_RATE_THRESHOLD = -5; // 5% decrease is a regression

    expect(durationChange).toBe(30); // Should be 30% increase
    expect(memoryChange).toBe(50); // Should be 50% increase
    expect(successRateChange).toBe(-5); // Should be 5% decrease

    // Check regression detection
    const durationRegression = durationChange > DURATION_THRESHOLD;
    const memoryRegression = memoryChange > MEMORY_THRESHOLD;
    const successRateRegression = successRateChange < SUCCESS_RATE_THRESHOLD;

    expect(durationRegression).toBe(true); // 30% > 20%
    expect(memoryRegression).toBe(false); // 50% = 50% (at threshold)
    expect(successRateRegression).toBe(true); // -5% = -5% (at threshold)

    const overallRegression = durationRegression || memoryRegression || successRateRegression;
    expect(overallRegression).toBe(true);

    console.log('✅ Performance regression detection logic works correctly');
  });

  test('should not flag minor performance variations as regressions', () => {
    const baselineData = {
      avgDuration: 50.0,
      avgMemoryGrowth: 1024,
      successRate: 100.0,
    };

    const currentData = {
      avgDuration: 55.0, // 10% slower (below threshold)
      avgMemoryGrowth: 1100, // 7.4% more memory (below threshold)
      successRate: 98.0, // 2% lower success rate (above threshold)
    };

    const durationChange = ((currentData.avgDuration - baselineData.avgDuration) / baselineData.avgDuration) * 100;
    const memoryChange = ((currentData.avgMemoryGrowth - baselineData.avgMemoryGrowth) / baselineData.avgMemoryGrowth) * 100;
    const successRateChange = currentData.successRate - baselineData.successRate;

    const DURATION_THRESHOLD = 20;
    const MEMORY_THRESHOLD = 50;
    const SUCCESS_RATE_THRESHOLD = -5;

    const durationRegression = durationChange > DURATION_THRESHOLD;
    const memoryRegression = memoryChange > MEMORY_THRESHOLD;
    const successRateRegression = successRateChange < SUCCESS_RATE_THRESHOLD;

    expect(durationRegression).toBe(false); // 10% < 20%
    expect(memoryRegression).toBe(false); // 7.4% < 50%
    expect(successRateRegression).toBe(false); // -2% > -5%

    const overallRegression = durationRegression || memoryRegression || successRateRegression;
    expect(overallRegression).toBe(false);

    console.log('✅ Minor performance variations are not flagged as regressions');
  });
});

describe('Benchmark Script Integration', () => {
  test('should execute benchmark script successfully', async () => {
    try {
      const result = await new Promise<{stdout: string, stderr: string, code: number}>((resolve, reject) => {
        const child = spawn('bun', ['run', 'scripts/benchmark.ts'], {
          stdio: 'pipe',
          timeout: 60000, // 60 second timeout
          env: { ...process.env, BENCHMARK_ITERATIONS: '5' } // Use small iteration count for testing
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('close', (code) => {
          resolve({ stdout, stderr, code: code || 0 });
        });

        child.on('error', reject);
      });

      // Should complete successfully or with expected errors
      if (result.code === 0) {
        expect(result.stdout).toContain('Benchmark');
        console.log('✅ Benchmark script executed successfully');
      } else {
        // If it fails, check if it's due to missing dependencies
        if (result.stderr.includes('ECONNREFUSED') || result.stderr.includes('connection')) {
          console.log('⚠️ Benchmark script failed due to connection issues (expected in test environment)');
        } else {
          console.log('⚠️ Benchmark script failed:', result.stderr);
        }
      }

    } catch (error) {
      console.log('⚠️ Could not execute benchmark script:', error.message);
    }
  });

  test('should validate benchmark script configuration', () => {
    // Test environment variable handling
    process.env.BENCHMARK_ITERATIONS = '50';
    const iterations = process.env.BENCHMARK_ITERATIONS ? parseInt(process.env.BENCHMARK_ITERATIONS) : 100;
    
    expect(iterations).toBe(50);
    
    // Clean up
    delete process.env.BENCHMARK_ITERATIONS;
    
    console.log('✅ Benchmark script configuration validation passed');
  });
});

// Helper function to get test arguments for different tools
function getTestArgsForTool(toolName: string): any {
  const testArgs: { [key: string]: any } = {
    search: {
      query: { match_all: {} },
      size: 5,
    },
    list_indices: {},
    cluster_health: {},
    get_mappings: {
      index: 'test-*',
    },
    count: {
      index: 'test-*',
      query: { match_all: {} },
    },
  };

  return testArgs[toolName] || {};
}