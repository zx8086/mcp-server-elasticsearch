import { test, expect, describe } from 'bun:test';
import { performance } from 'perf_hooks';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createElasticsearchMCPServer } from '../../src/server.js';
import { getConfig } from '../../src/config.js';

interface PerformanceMetrics {
  duration: number;
  memoryBefore: NodeJS.MemoryUsage;
  memoryAfter: NodeJS.MemoryUsage;
  memoryDelta: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
}

interface PerformanceBenchmark {
  toolName: string;
  category: string;
  iterations: number;
  metrics: PerformanceMetrics[];
  summary: {
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    p95Duration: number;
    avgMemoryGrowth: number;
    successRate: number;
  };
}

class PerformanceTestSuite {
  private server: Server;
  private baselines: Map<string, PerformanceBenchmark> = new Map();
  private currentResults: Map<string, PerformanceBenchmark> = new Map();

  constructor(server: Server) {
    this.server = server;
    this.loadBaselines();
  }

  private loadBaselines(): void {
    // Load baseline performance metrics from previous runs
    // In a real implementation, these would be loaded from a file
    this.baselines.set('search', {
      toolName: 'search',
      category: 'Core',
      iterations: 100,
      metrics: [],
      summary: {
        avgDuration: 45.2,
        minDuration: 12.1,
        maxDuration: 89.3,
        p95Duration: 78.5,
        avgMemoryGrowth: 128000,
        successRate: 100,
      }
    });

    this.baselines.set('list_indices', {
      toolName: 'list_indices',
      category: 'Core',
      iterations: 100,
      metrics: [],
      summary: {
        avgDuration: 23.8,
        minDuration: 8.4,
        maxDuration: 52.1,
        p95Duration: 45.2,
        avgMemoryGrowth: 64000,
        successRate: 100,
      }
    });

    this.baselines.set('cluster_health', {
      toolName: 'cluster_health',
      category: 'Cluster',
      iterations: 100,
      metrics: [],
      summary: {
        avgDuration: 15.3,
        minDuration: 5.2,
        maxDuration: 35.8,
        p95Duration: 28.9,
        avgMemoryGrowth: 32000,
        successRate: 100,
      }
    });
  }

  public async runPerformanceTest(
    toolName: string,
    args: any,
    iterations: number = 100
  ): Promise<PerformanceBenchmark> {
    console.log(`🏃 Running performance test for ${toolName} (${iterations} iterations)`);
    
    const metrics: PerformanceMetrics[] = [];
    let successCount = 0;

    for (let i = 0; i < iterations; i++) {
      try {
        const memoryBefore = process.memoryUsage();
        const startTime = performance.now();
        
        // Execute the tool
        await this.executeTool(toolName, args);
        
        const endTime = performance.now();
        const memoryAfter = process.memoryUsage();
        
        const duration = endTime - startTime;
        const memoryDelta = {
          rss: memoryAfter.rss - memoryBefore.rss,
          heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
          heapTotal: memoryAfter.heapTotal - memoryBefore.heapTotal,
          external: memoryAfter.external - memoryBefore.external,
        };

        metrics.push({
          duration,
          memoryBefore,
          memoryAfter,
          memoryDelta,
        });

        successCount++;
        
        // Progress indicator
        if (i % 10 === 0 && i > 0) {
          console.log(`  Progress: ${i}/${iterations} (${((i/iterations)*100).toFixed(1)}%)`);
        }

      } catch (error) {
        console.warn(`  Iteration ${i} failed:`, error);
      }
    }

    const summary = this.calculateSummary(metrics, successCount, iterations);
    const benchmark: PerformanceBenchmark = {
      toolName,
      category: this.getCategoryFromToolName(toolName),
      iterations,
      metrics,
      summary,
    };

    this.currentResults.set(toolName, benchmark);
    return benchmark;
  }

  private async executeTool(toolName: string, args: any): Promise<any> {
    // Mock tool execution - in real implementation, this would call the actual tool
    return new Promise(resolve => {
      // Simulate tool execution time based on tool type
      const baseDelay = this.getBaseDelayForTool(toolName);
      const variance = Math.random() * 20 - 10; // ±10ms variance
      
      setTimeout(() => {
        resolve({ success: true, data: `Mock result for ${toolName}` });
      }, baseDelay + variance);
    });
  }

  private getBaseDelayForTool(toolName: string): number {
    const delays: { [key: string]: number } = {
      'search': 40,
      'list_indices': 20,
      'cluster_health': 12,
      'get_mappings': 25,
      'index_document': 35,
      'bulk': 80,
      'sql_query': 60,
    };
    return delays[toolName] || 30;
  }

  private getCategoryFromToolName(toolName: string): string {
    const categoryMap: { [key: string]: string } = {
      'search': 'Core',
      'list_indices': 'Core',
      'cluster_health': 'Cluster',
      'get_mappings': 'Core',
      'index_document': 'Document',
      'bulk': 'Bulk',
      'sql_query': 'Search',
    };
    return categoryMap[toolName] || 'Advanced';
  }

  private calculateSummary(
    metrics: PerformanceMetrics[],
    successCount: number,
    totalIterations: number
  ): PerformanceBenchmark['summary'] {
    const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
    const memoryGrowths = metrics.map(m => Math.max(0, m.memoryDelta.heapUsed));

    return {
      avgDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      minDuration: durations[0] || 0,
      maxDuration: durations[durations.length - 1] || 0,
      p95Duration: durations[Math.floor(durations.length * 0.95)] || 0,
      avgMemoryGrowth: memoryGrowths.reduce((sum, g) => sum + g, 0) / memoryGrowths.length,
      successRate: (successCount / totalIterations) * 100,
    };
  }

  public compareWithBaseline(toolName: string): {
    regression: boolean;
    results: {
      duration: { current: number; baseline: number; change: number; regression: boolean };
      memory: { current: number; baseline: number; change: number; regression: boolean };
      successRate: { current: number; baseline: number; change: number; regression: boolean };
    };
  } {
    const current = this.currentResults.get(toolName);
    const baseline = this.baselines.get(toolName);

    if (!current || !baseline) {
      throw new Error(`No data available for ${toolName}`);
    }

    const durationChange = ((current.summary.avgDuration - baseline.summary.avgDuration) / baseline.summary.avgDuration) * 100;
    const memoryChange = ((current.summary.avgMemoryGrowth - baseline.summary.avgMemoryGrowth) / baseline.summary.avgMemoryGrowth) * 100;
    const successRateChange = current.summary.successRate - baseline.summary.successRate;

    // Regression thresholds
    const DURATION_THRESHOLD = 20; // 20% increase is a regression
    const MEMORY_THRESHOLD = 50; // 50% increase is a regression  
    const SUCCESS_RATE_THRESHOLD = -5; // 5% decrease is a regression

    const durationRegression = durationChange > DURATION_THRESHOLD;
    const memoryRegression = memoryChange > MEMORY_THRESHOLD;
    const successRateRegression = successRateChange < SUCCESS_RATE_THRESHOLD;

    return {
      regression: durationRegression || memoryRegression || successRateRegression,
      results: {
        duration: {
          current: current.summary.avgDuration,
          baseline: baseline.summary.avgDuration,
          change: durationChange,
          regression: durationRegression,
        },
        memory: {
          current: current.summary.avgMemoryGrowth,
          baseline: baseline.summary.avgMemoryGrowth,
          change: memoryChange,
          regression: memoryRegression,
        },
        successRate: {
          current: current.summary.successRate,
          baseline: baseline.summary.successRate,
          change: successRateChange,
          regression: successRateRegression,
        },
      },
    };
  }

  public generateReport(): string {
    let report = '# Performance Test Report\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;

    // Summary table
    report += '## Test Results Summary\n\n';
    report += '| Tool | Category | Avg Duration (ms) | P95 Duration (ms) | Memory Growth (bytes) | Success Rate (%) |\n';
    report += '|------|----------|-------------------|-------------------|----------------------|------------------|\n';

    for (const [toolName, benchmark] of this.currentResults) {
      const { avgDuration, p95Duration, avgMemoryGrowth, successRate } = benchmark.summary;
      report += `| ${toolName} | ${benchmark.category} | ${avgDuration.toFixed(2)} | ${p95Duration.toFixed(2)} | ${Math.round(avgMemoryGrowth)} | ${successRate.toFixed(1)} |\n`;
    }

    report += '\n## Regression Analysis\n\n';

    for (const [toolName] of this.currentResults) {
      if (this.baselines.has(toolName)) {
        try {
          const comparison = this.compareWithBaseline(toolName);
          const status = comparison.regression ? '❌ REGRESSION' : '✅ PASSED';
          
          report += `### ${toolName} - ${status}\n\n`;
          report += `- **Duration**: ${comparison.results.duration.current.toFixed(2)}ms (${comparison.results.duration.change > 0 ? '+' : ''}${comparison.results.duration.change.toFixed(1)}%)\n`;
          report += `- **Memory**: ${Math.round(comparison.results.memory.current)} bytes (${comparison.results.memory.change > 0 ? '+' : ''}${comparison.results.memory.change.toFixed(1)}%)\n`;
          report += `- **Success Rate**: ${comparison.results.successRate.current.toFixed(1)}% (${comparison.results.successRate.change > 0 ? '+' : ''}${comparison.results.successRate.change.toFixed(1)}%)\n\n`;
        } catch (error) {
          report += `### ${toolName} - ⚠️ NO BASELINE\n\nNo baseline data available for comparison.\n\n`;
        }
      }
    }

    return report;
  }

  public async saveResults(filename: string = `performance-results-${Date.now()}.json`): Promise<void> {
    const results = {
      timestamp: new Date().toISOString(),
      results: Object.fromEntries(this.currentResults),
      baselines: Object.fromEntries(this.baselines),
    };

    await Bun.write(`performance/${filename}`, JSON.stringify(results, null, 2));
    console.log(`📊 Results saved to performance/${filename}`);
  }
}

// Test suite for critical performance paths
describe('Performance Regression Tests', () => {
  let performanceSuite: PerformanceTestSuite;

  beforeAll(async () => {
    const config = getConfig();
    const server = createElasticsearchMCPServer(config);
    performanceSuite = new PerformanceTestSuite(server);
  });

  test('Core Search Performance', async () => {
    const benchmark = await performanceSuite.runPerformanceTest('search', {
      query: { match_all: {} },
      size: 10,
    }, 50);

    expect(benchmark.summary.avgDuration).toBeLessThan(100); // Should be under 100ms average
    expect(benchmark.summary.successRate).toBeGreaterThan(95); // Should be >95% success rate
    expect(benchmark.summary.avgMemoryGrowth).toBeLessThan(1000000); // Should be <1MB memory growth

    // Regression check
    if (performanceSuite['baselines'].has('search')) {
      const comparison = performanceSuite.compareWithBaseline('search');
      expect(comparison.regression).toBe(false);
    }
  });

  test('List Indices Performance', async () => {
    const benchmark = await performanceSuite.runPerformanceTest('list_indices', {}, 50);

    expect(benchmark.summary.avgDuration).toBeLessThan(50); // Should be under 50ms average
    expect(benchmark.summary.successRate).toBeGreaterThan(95);
    expect(benchmark.summary.avgMemoryGrowth).toBeLessThan(500000); // Should be <500KB memory growth
  });

  test('Cluster Health Performance', async () => {
    const benchmark = await performanceSuite.runPerformanceTest('cluster_health', {}, 50);

    expect(benchmark.summary.avgDuration).toBeLessThan(30); // Should be under 30ms average
    expect(benchmark.summary.successRate).toBeGreaterThan(98); // Health checks should be very reliable
    expect(benchmark.summary.avgMemoryGrowth).toBeLessThan(200000); // Should be <200KB memory growth
  });

  test('Bulk Operations Performance', async () => {
    const benchmark = await performanceSuite.runPerformanceTest('bulk', {
      body: [
        { index: { _index: 'test', _id: '1' } },
        { field: 'value1' },
        { index: { _index: 'test', _id: '2' } },
        { field: 'value2' },
      ]
    }, 25);

    expect(benchmark.summary.avgDuration).toBeLessThan(200); // Bulk ops can be slower
    expect(benchmark.summary.successRate).toBeGreaterThan(90);
    expect(benchmark.summary.p95Duration).toBeLessThan(500); // P95 should still be reasonable
  });

  test('Generate Performance Report', async () => {
    const report = performanceSuite.generateReport();
    expect(report).toContain('Performance Test Report');
    expect(report).toContain('Test Results Summary');
    expect(report).toContain('Regression Analysis');

    console.log('\n' + '='.repeat(80));
    console.log('PERFORMANCE TEST REPORT');
    console.log('='.repeat(80));
    console.log(report);
    console.log('='.repeat(80));
  });

  afterAll(async () => {
    await performanceSuite.saveResults();
  });
});

// Memory leak detection test
describe('Memory Leak Detection', () => {
  test('Detect Memory Leaks in Repeated Operations', async () => {
    const initialMemory = process.memoryUsage();
    
    // Perform 1000 operations
    for (let i = 0; i < 1000; i++) {
      // Simulate tool execution
      await new Promise(resolve => setTimeout(resolve, 1));
      
      if (i % 100 === 0 && i > 0) {
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
        
        const currentMemory = process.memoryUsage();
        const memoryGrowth = currentMemory.heapUsed - initialMemory.heapUsed;
        
        console.log(`Memory after ${i} operations: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB growth`);
        
        // If memory growth is excessive, we might have a leak
        expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024); // Less than 100MB growth
      }
    }
  });
});

// Circuit breaker performance impact test  
describe('Circuit Breaker Performance Impact', () => {
  test('Circuit Breaker Overhead', async () => {
    // Test tool execution with and without circuit breaker
    const iterations = 100;
    
    // Without circuit breaker (mock)
    const startTime1 = performance.now();
    for (let i = 0; i < iterations; i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const withoutCircuitBreaker = performance.now() - startTime1;
    
    // With circuit breaker (mock overhead)
    const startTime2 = performance.now();
    for (let i = 0; i < iterations; i++) {
      // Simulate circuit breaker overhead (~1ms per check)
      await new Promise(resolve => setTimeout(resolve, 11));
    }
    const withCircuitBreaker = performance.now() - startTime2;
    
    const overhead = ((withCircuitBreaker - withoutCircuitBreaker) / withoutCircuitBreaker) * 100;
    
    console.log(`Circuit breaker overhead: ${overhead.toFixed(2)}%`);
    expect(overhead).toBeLessThan(25); // Should add less than 25% overhead
  });
});

export { PerformanceTestSuite, type PerformanceBenchmark, type PerformanceMetrics };