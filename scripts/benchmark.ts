#!/usr/bin/env bun

import { performance } from "node:perf_hooks";
import { getConfig } from "../src/config.js";
import { createElasticsearchMCPServer } from "../src/server.js";
import { PerformanceTestSuite } from "../tests/performance/performanceSuite.js";

interface BenchmarkConfig {
  tools: string[];
  iterations: number;
  warmup: number;
  reportPath?: string;
}

async function runBenchmarks() {
  console.log("🚀 Starting Elasticsearch MCP Server Benchmark Suite");
  console.log("=".repeat(60));

  const config = getConfig();
  const server = createElasticsearchMCPServer(config);
  const performanceSuite = new PerformanceTestSuite(server);

  const benchmarkConfig: BenchmarkConfig = {
    tools: [
      "search",
      "list_indices",
      "cluster_health",
      "get_mappings",
      "index_document",
      "bulk",
      "sql_query",
      "count",
      "get_aliases",
      "indices_summary",
    ],
    iterations: process.env.BENCHMARK_ITERATIONS ? Number.parseInt(process.env.BENCHMARK_ITERATIONS) : 100,
    warmup: 10,
  };

  console.log("📊 Configuration:");
  console.log(`   Tools: ${benchmarkConfig.tools.length}`);
  console.log(`   Iterations per tool: ${benchmarkConfig.iterations}`);
  console.log(`   Warmup iterations: ${benchmarkConfig.warmup}`);
  console.log("");

  // System information
  console.log("🖥️  System Information:");
  console.log(`   Runtime: Bun ${Bun.version}`);
  console.log(`   Platform: ${process.platform} ${process.arch}`);
  console.log(`   Node.js: ${process.version}`);
  console.log(`   Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`);
  console.log("");

  const startTime = performance.now();
  const results: Map<string, any> = new Map();

  // Run benchmarks for each tool
  for (const toolName of benchmarkConfig.tools) {
    console.log(`\n🔧 Benchmarking ${toolName}...`);

    try {
      // Warmup
      console.log(`   Warming up (${benchmarkConfig.warmup} iterations)...`);
      await runWarmup(performanceSuite, toolName, benchmarkConfig.warmup);

      // Main benchmark
      const args = getToolArgs(toolName);
      const benchmark = await performanceSuite.runPerformanceTest(toolName, args, benchmarkConfig.iterations);

      results.set(toolName, benchmark);

      // Print immediate results
      console.log(
        `   ✅ Completed: avg ${benchmark.summary.avgDuration.toFixed(2)}ms, ` +
          `p95 ${benchmark.summary.p95Duration.toFixed(2)}ms, ` +
          `success ${benchmark.summary.successRate.toFixed(1)}%`,
      );
    } catch (error) {
      console.error(`   ❌ Failed: ${error}`);
      results.set(toolName, { error: error.message });
    }
  }

  const totalTime = performance.now() - startTime;
  console.log(`\n⏱️  Total benchmark time: ${(totalTime / 1000).toFixed(2)}s`);

  // Generate comprehensive report
  console.log("\n📊 Generating performance report...");
  const report = await generateComprehensiveReport(performanceSuite, results, totalTime);

  // Save results
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = `performance/benchmark-report-${timestamp}.md`;
  await Bun.write(reportPath, report);

  const resultsPath = `performance/benchmark-results-${timestamp}.json`;
  await performanceSuite.saveResults(resultsPath);

  console.log("\n📝 Reports saved:");
  console.log(`   ${reportPath}`);
  console.log(`   ${resultsPath}`);

  // Summary
  console.log(`\n${"=".repeat(80)}`);
  console.log("BENCHMARK SUMMARY");
  console.log("=".repeat(80));

  const successfulTests = Array.from(results.values()).filter((r) => !r.error).length;
  console.log(`✅ Successful tests: ${successfulTests}/${benchmarkConfig.tools.length}`);

  if (successfulTests > 0) {
    const averages = Array.from(results.values())
      .filter((r) => !r.error)
      .map((r) => r.summary.avgDuration);

    const avgResponse = averages.reduce((sum, avg) => sum + avg, 0) / averages.length;
    console.log(`⚡ Average response time: ${avgResponse.toFixed(2)}ms`);

    const p95s = Array.from(results.values())
      .filter((r) => !r.error)
      .map((r) => r.summary.p95Duration);
    const avgP95 = p95s.reduce((sum, p95) => sum + p95, 0) / p95s.length;
    console.log(`📈 Average P95: ${avgP95.toFixed(2)}ms`);
  }

  // Regression warnings
  const regressions = [];
  for (const [toolName] of results) {
    try {
      const comparison = performanceSuite.compareWithBaseline(toolName);
      if (comparison.regression) {
        regressions.push(toolName);
      }
    } catch (_error) {
      // No baseline available
    }
  }

  if (regressions.length > 0) {
    console.log(`\n⚠️  Performance regressions detected in: ${regressions.join(", ")}`);
  } else {
    console.log("\n🎉 No performance regressions detected!");
  }

  console.log("=".repeat(80));
}

async function runWarmup(
  performanceSuite: PerformanceTestSuite,
  toolName: string,
  warmupIterations: number,
): Promise<void> {
  const args = getToolArgs(toolName);

  for (let i = 0; i < warmupIterations; i++) {
    try {
      await performanceSuite.executeTool(toolName, args);
    } catch (_error) {
      // Ignore warmup errors
    }
  }
}

function getToolArgs(toolName: string): any {
  const toolArgs: { [key: string]: any } = {
    search: {
      query: { match_all: {} },
      size: 10,
    },
    list_indices: {},
    cluster_health: {},
    get_mappings: {
      index: "test-*",
    },
    index_document: {
      index: "test-index",
      id: "1",
      body: { field: "value", timestamp: new Date().toISOString() },
    },
    bulk: {
      body: [
        { index: { _index: "test", _id: "1" } },
        { field: "value1", timestamp: new Date().toISOString() },
        { index: { _index: "test", _id: "2" } },
        { field: "value2", timestamp: new Date().toISOString() },
      ],
    },
    sql_query: {
      query: "SELECT * FROM test-* LIMIT 10",
    },
    count: {
      index: "test-*",
      query: { match_all: {} },
    },
    get_aliases: {},
    indices_summary: {},
  };

  return toolArgs[toolName] || {};
}

async function generateComprehensiveReport(
  performanceSuite: PerformanceTestSuite,
  results: Map<string, any>,
  totalTime: number,
): Promise<string> {
  let report = "# Elasticsearch MCP Server Performance Benchmark Report\n\n";
  report += `**Generated:** ${new Date().toISOString()}\n`;
  report += `**Duration:** ${(totalTime / 1000).toFixed(2)} seconds\n`;
  report += `**Runtime:** Bun ${Bun.version}\n`;
  report += `**Platform:** ${process.platform} ${process.arch}\n\n`;

  // Executive Summary
  const successful = Array.from(results.values()).filter((r) => !r.error);
  const failed = Array.from(results.values()).filter((r) => r.error);

  report += "## Executive Summary\n\n";
  report += `- **Total Tests:** ${results.size}\n`;
  report += `- **Successful:** ${successful.length}\n`;
  report += `- **Failed:** ${failed.length}\n`;

  if (successful.length > 0) {
    const avgDurations = successful.map((r) => r.summary.avgDuration);
    const overallAvg = avgDurations.reduce((sum, avg) => sum + avg, 0) / avgDurations.length;
    report += `- **Overall Average Response Time:** ${overallAvg.toFixed(2)}ms\n`;

    const p95Durations = successful.map((r) => r.summary.p95Duration);
    const overallP95 = p95Durations.reduce((sum, p95) => sum + p95, 0) / p95Durations.length;
    report += `- **Overall P95 Response Time:** ${overallP95.toFixed(2)}ms\n`;
  }
  report += "\n";

  // Performance Results Table
  report += "## Performance Results\n\n";
  report += "| Tool | Category | Avg (ms) | Min (ms) | Max (ms) | P95 (ms) | Memory (KB) | Success Rate | Status |\n";
  report += "|------|----------|----------|----------|----------|----------|-------------|--------------|--------|\n";

  for (const [toolName, result] of results) {
    if (result.error) {
      report += `| ${toolName} | - | - | - | - | - | - | - | ❌ ERROR |\n`;
    } else {
      const { summary } = result;
      const memoryKB = Math.round(summary.avgMemoryGrowth / 1024);
      const status = summary.successRate >= 95 ? "✅" : summary.successRate >= 90 ? "⚠️" : "❌";

      report += `| ${toolName} | ${result.category} | ${summary.avgDuration.toFixed(2)} | ${summary.minDuration.toFixed(2)} | ${summary.maxDuration.toFixed(2)} | ${summary.p95Duration.toFixed(2)} | ${memoryKB} | ${summary.successRate.toFixed(1)}% | ${status} |\n`;
    }
  }
  report += "\n";

  // Regression Analysis
  report += "## Regression Analysis\n\n";
  let hasRegressions = false;

  for (const [toolName] of results) {
    try {
      const comparison = performanceSuite.compareWithBaseline(toolName);
      const status = comparison.regression ? "❌ REGRESSION" : "✅ PASSED";

      report += `### ${toolName} - ${status}\n\n`;

      if (comparison.regression) {
        hasRegressions = true;
        report += "**⚠️ Performance regression detected!**\n\n";
      }

      report += `- **Duration:** ${comparison.results.duration.current.toFixed(2)}ms `;
      report += `(${comparison.results.duration.change > 0 ? "+" : ""}${comparison.results.duration.change.toFixed(1)}% vs baseline)\n`;

      report += `- **Memory:** ${Math.round(comparison.results.memory.current / 1024)}KB `;
      report += `(${comparison.results.memory.change > 0 ? "+" : ""}${comparison.results.memory.change.toFixed(1)}% vs baseline)\n`;

      report += `- **Success Rate:** ${comparison.results.successRate.current.toFixed(1)}% `;
      report += `(${comparison.results.successRate.change > 0 ? "+" : ""}${comparison.results.successRate.change.toFixed(1)}% vs baseline)\n\n`;
    } catch (_error) {
      report += `### ${toolName} - ⚠️ NO BASELINE\n\nNo baseline data available for regression analysis.\n\n`;
    }
  }

  if (!hasRegressions) {
    report += "🎉 **No performance regressions detected!**\n\n";
  }

  // Performance Categories
  report += "## Performance by Category\n\n";
  const categories = new Map<string, any[]>();

  for (const [toolName, result] of results) {
    if (!result.error) {
      if (!categories.has(result.category)) {
        categories.set(result.category, []);
      }
      categories.get(result.category)!.push({ toolName, ...result.summary });
    }
  }

  for (const [category, tools] of categories) {
    const avgDuration = tools.reduce((sum, tool) => sum + tool.avgDuration, 0) / tools.length;
    const avgMemory = tools.reduce((sum, tool) => sum + tool.avgMemoryGrowth, 0) / tools.length;
    const avgSuccessRate = tools.reduce((sum, tool) => sum + tool.successRate, 0) / tools.length;

    report += `### ${category}\n\n`;
    report += `- **Tools:** ${tools.length}\n`;
    report += `- **Average Duration:** ${avgDuration.toFixed(2)}ms\n`;
    report += `- **Average Memory:** ${Math.round(avgMemory / 1024)}KB\n`;
    report += `- **Average Success Rate:** ${avgSuccessRate.toFixed(1)}%\n\n`;
  }

  // System Information
  report += "## System Information\n\n";
  const memInfo = process.memoryUsage();
  report += `- **Runtime:** Bun ${Bun.version}\n`;
  report += `- **Platform:** ${process.platform} ${process.arch}\n`;
  report += `- **Node.js:** ${process.version}\n`;
  report += "- **Memory Usage:**\n";
  report += `  - RSS: ${Math.round(memInfo.rss / 1024 / 1024)}MB\n`;
  report += `  - Heap Used: ${Math.round(memInfo.heapUsed / 1024 / 1024)}MB\n`;
  report += `  - Heap Total: ${Math.round(memInfo.heapTotal / 1024 / 1024)}MB\n`;
  report += `  - External: ${Math.round(memInfo.external / 1024 / 1024)}MB\n\n`;

  // Recommendations
  report += "## Recommendations\n\n";

  if (hasRegressions) {
    report += "🔍 **Performance Investigation Required:**\n";
    report += "- Review recent changes that may impact performance\n";
    report += "- Consider profiling regressed operations\n";
    report += "- Check for memory leaks or inefficient algorithms\n\n";
  }

  report += "⚡ **Optimization Opportunities:**\n";

  const slowOperations = Array.from(results.entries())
    .filter(([_, result]) => !result.error && result.summary.avgDuration > 100)
    .map(([toolName]) => toolName);

  if (slowOperations.length > 0) {
    report += `- Optimize slow operations: ${slowOperations.join(", ")}\n`;
  }

  const memoryIntensive = Array.from(results.entries())
    .filter(([_, result]) => !result.error && result.summary.avgMemoryGrowth > 1024 * 1024)
    .map(([toolName]) => toolName);

  if (memoryIntensive.length > 0) {
    report += `- Review memory usage for: ${memoryIntensive.join(", ")}\n`;
  }

  report += "- Consider implementing response caching for frequently used operations\n";
  report += "- Monitor circuit breaker effectiveness and tune thresholds if needed\n";
  report += "- Review connection pool settings for optimal performance\n\n";

  report += "---\n\n";
  report += "*Report generated by Elasticsearch MCP Server Benchmark Suite*\n";

  return report;
}

// Run benchmarks if called directly
if (import.meta.main) {
  runBenchmarks().catch(console.error);
}
