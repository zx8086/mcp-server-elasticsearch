#!/usr/bin/env bun
/**
 * Comprehensive test execution script for Elasticsearch MCP Server
 * Runs all test suites with detailed reporting and validation
 */

import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

interface TestResult {
  suite: string;
  category: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  output: string;
  errors: string[];
}

interface TestSummary {
  totalSuites: number;
  totalTests: number;
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
  totalDuration: number;
  results: TestResult[];
  coverage?: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
}

class TestRunner {
  private results: TestResult[] = [];
  private startTime = 0;
  private verbose = false;
  private generateReport = true;
  private runCoverage = false;

  constructor(
    options: {
      verbose?: boolean;
      generateReport?: boolean;
      runCoverage?: boolean;
    } = {},
  ) {
    this.verbose = options.verbose ?? false;
    this.generateReport = options.generateReport ?? true;
    this.runCoverage = options.runCoverage ?? false;
  }

  async runAllTests(): Promise<TestSummary> {
    this.startTime = Date.now();

    console.log("🧪 Starting comprehensive test execution...");
    console.log("═".repeat(60));

    // Discover all test files
    const testFiles = await this.discoverTestFiles();

    if (testFiles.length === 0) {
      console.log("⚠️  No test files found!");
      return this.generateSummary();
    }

    console.log(`📋 Found ${testFiles.length} test suites:`);
    testFiles.forEach((file) => console.log(`   • ${file.category}/${file.name}`));
    console.log("");

    // Run tests by category for better organization
    const categories = [...new Set(testFiles.map((f) => f.category))];

    for (const category of categories) {
      const categoryFiles = testFiles.filter((f) => f.category === category);
      console.log(`🏷️  Running ${category} tests (${categoryFiles.length} suites):`);

      for (const testFile of categoryFiles) {
        await this.runTestSuite(testFile);
      }

      console.log("");
    }

    // Run coverage analysis if requested
    if (this.runCoverage) {
      await this.runCoverageAnalysis();
    }

    // Generate test report
    const summary = this.generateSummary();

    if (this.generateReport) {
      await this.saveTestReport(summary);
    }

    this.printSummary(summary);
    return summary;
  }

  private async discoverTestFiles(): Promise<
    Array<{
      name: string;
      category: string;
      path: string;
    }>
  > {
    const testFiles: Array<{ name: string; category: string; path: string }> = [];
    const testsDir = path.join(process.cwd(), "tests");

    try {
      await stat(testsDir);
    } catch {
      console.log("⚠️  Tests directory not found");
      return testFiles;
    }

    const categories = await readdir(testsDir, { withFileTypes: true });

    for (const category of categories) {
      if (category.isDirectory()) {
        const categoryPath = path.join(testsDir, category.name);
        const files = await readdir(categoryPath);

        for (const file of files) {
          if (file.endsWith(".test.ts") || file.endsWith(".test.js")) {
            testFiles.push({
              name: file,
              category: category.name,
              path: path.join(categoryPath, file),
            });
          }
        }
      }
    }

    return testFiles.sort((a, b) => {
      // Sort by category first, then by name
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.name.localeCompare(b.name);
    });
  }

  private async runTestSuite(testFile: {
    name: string;
    category: string;
    path: string;
  }): Promise<void> {
    const startTime = Date.now();
    const suiteName = testFile.name.replace(".test.ts", "").replace(".test.js", "");

    console.log(`  ▶️  ${suiteName}...`);

    try {
      const result = await this.executeTest(testFile.path);
      const duration = Date.now() - startTime;

      this.results.push({
        suite: suiteName,
        category: testFile.category,
        passed: result.passed,
        failed: result.failed,
        skipped: result.skipped,
        duration,
        output: result.output,
        errors: result.errors,
      });

      // Print immediate result
      const status = result.failed > 0 ? "❌" : "✅";
      const timing = `${duration}ms`;
      const counts = `${result.passed}✅ ${result.failed}❌ ${result.skipped}⏭️`;

      console.log(`     ${status} ${timing.padEnd(8)} ${counts}`);

      // Show errors if any and verbose mode
      if (result.failed > 0 && this.verbose) {
        result.errors.forEach((error) => {
          console.log(`       🔍 ${error}`);
        });
      }
    } catch (error) {
      const duration = Date.now() - startTime;

      this.results.push({
        suite: suiteName,
        category: testFile.category,
        passed: 0,
        failed: 1,
        skipped: 0,
        duration,
        output: "",
        errors: [error instanceof Error ? error.message : String(error)],
      });

      console.log(`     💥 ${duration}ms - Test suite failed to run`);
      if (this.verbose) {
        console.log(`       🔍 ${error}`);
      }
    }
  }

  private async executeTest(testPath: string): Promise<{
    passed: number;
    failed: number;
    skipped: number;
    output: string;
    errors: string[];
  }> {
    return new Promise((resolve, reject) => {
      const process = spawn("bun", ["test", testPath, "--reporter", "verbose"], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: process.cwd,
      });

      let stdout = "";
      let stderr = "";

      process.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      process.on("close", (code) => {
        const output = stdout + stderr;
        const result = this.parseTestOutput(output);

        if (code === 0 || result.passed > 0) {
          resolve({
            ...result,
            output: stdout,
            errors: result.errors,
          });
        } else {
          reject(new Error(`Test execution failed: ${stderr || "Unknown error"}`));
        }
      });

      process.on("error", (error) => {
        reject(error);
      });

      // Set timeout for long-running tests
      setTimeout(() => {
        process.kill();
        reject(new Error("Test execution timeout"));
      }, 60000); // 60 second timeout
    });
  }

  private parseTestOutput(output: string): {
    passed: number;
    failed: number;
    skipped: number;
    errors: string[];
  } {
    const lines = output.split("\n");
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const line of lines) {
      // Parse Bun test output patterns
      if (line.includes("✅") || line.includes("PASS") || line.match(/\d+ pass/i)) {
        const match = line.match(/(\d+)/);
        if (match) {
          passed += Number.parseInt(match[1]);
        } else {
          passed++;
        }
      }

      if (line.includes("❌") || line.includes("FAIL") || line.match(/\d+ fail/i)) {
        const match = line.match(/(\d+)/);
        if (match) {
          failed += Number.parseInt(match[1]);
        } else {
          failed++;
        }
      }

      if (line.includes("⏭️") || line.includes("SKIP") || line.match(/\d+ skip/i)) {
        const match = line.match(/(\d+)/);
        if (match) {
          skipped += Number.parseInt(match[1]);
        } else {
          skipped++;
        }
      }

      // Capture error messages
      if (line.includes("Error:") || line.includes("Failed:") || line.includes("Exception:")) {
        errors.push(line.trim());
      }
    }

    // Fallback parsing for different output formats
    if (passed === 0 && failed === 0 && skipped === 0) {
      // Try alternative parsing
      const passMatches = output.match(/(\d+)\s+pass/gi);
      const failMatches = output.match(/(\d+)\s+fail/gi);
      const skipMatches = output.match(/(\d+)\s+skip/gi);

      if (passMatches) {
        passed = passMatches.reduce((sum, match) => {
          const num = match.match(/\d+/);
          return sum + (num ? Number.parseInt(num[0]) : 0);
        }, 0);
      }

      if (failMatches) {
        failed = failMatches.reduce((sum, match) => {
          const num = match.match(/\d+/);
          return sum + (num ? Number.parseInt(num[0]) : 0);
        }, 0);
      }

      if (skipMatches) {
        skipped = skipMatches.reduce((sum, match) => {
          const num = match.match(/\d+/);
          return sum + (num ? Number.parseInt(num[0]) : 0);
        }, 0);
      }
    }

    return { passed, failed, skipped, errors };
  }

  private async runCoverageAnalysis(): Promise<void> {
    console.log("📊 Running coverage analysis...");

    try {
      const coverageProcess = spawn("bun", ["test", "--coverage"], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: process.cwd(),
      });

      let _coverageOutput = "";
      coverageProcess.stdout?.on("data", (data) => {
        _coverageOutput += data.toString();
      });

      await new Promise((resolve, reject) => {
        coverageProcess.on("close", (code) => {
          if (code === 0) {
            console.log("✅ Coverage analysis completed");
            resolve(true);
          } else {
            console.log("⚠️  Coverage analysis failed");
            resolve(false);
          }
        });

        coverageProcess.on("error", (error) => {
          console.log(`⚠️  Coverage analysis error: ${error.message}`);
          resolve(false);
        });

        setTimeout(() => {
          coverageProcess.kill();
          reject(new Error("Coverage analysis timeout"));
        }, 30000);
      });
    } catch (error) {
      console.log(`⚠️  Coverage analysis failed: ${error}`);
    }
  }

  private generateSummary(): TestSummary {
    const totalDuration = Date.now() - this.startTime;

    return {
      totalSuites: this.results.length,
      totalTests: this.results.reduce((sum, r) => sum + r.passed + r.failed + r.skipped, 0),
      totalPassed: this.results.reduce((sum, r) => sum + r.passed, 0),
      totalFailed: this.results.reduce((sum, r) => sum + r.failed, 0),
      totalSkipped: this.results.reduce((sum, r) => sum + r.skipped, 0),
      totalDuration,
      results: this.results,
    };
  }

  private printSummary(summary: TestSummary): void {
    console.log("");
    console.log("🏁 Test Execution Complete");
    console.log("═".repeat(60));

    console.log("📊 Summary:");
    console.log(`   Suites:    ${summary.totalSuites}`);
    console.log(`   Tests:     ${summary.totalTests}`);
    console.log(`   Passed:    ${summary.totalPassed} ✅`);
    console.log(`   Failed:    ${summary.totalFailed} ❌`);
    console.log(`   Skipped:   ${summary.totalSkipped} ⏭️`);
    console.log(`   Duration:  ${(summary.totalDuration / 1000).toFixed(2)}s`);

    const successRate = summary.totalTests > 0 ? ((summary.totalPassed / summary.totalTests) * 100).toFixed(1) : "0";
    console.log(`   Success:   ${successRate}%`);

    if (summary.totalFailed > 0) {
      console.log("");
      console.log("❌ Failed Test Suites:");
      summary.results
        .filter((r) => r.failed > 0)
        .forEach((result) => {
          console.log(`   • ${result.category}/${result.suite} (${result.failed} failures)`);
          if (this.verbose && result.errors.length > 0) {
            result.errors.forEach((error) => {
              console.log(`     - ${error}`);
            });
          }
        });
    }

    // Performance insights
    console.log("");
    console.log("🚀 Performance Insights:");
    const slowestSuites = [...summary.results].sort((a, b) => b.duration - a.duration).slice(0, 3);

    slowestSuites.forEach((suite, index) => {
      console.log(`   ${index + 1}. ${suite.category}/${suite.suite}: ${suite.duration}ms`);
    });

    // Category breakdown
    console.log("");
    console.log("📂 By Category:");
    const categories = [...new Set(summary.results.map((r) => r.category))];

    categories.forEach((category) => {
      const categoryResults = summary.results.filter((r) => r.category === category);
      const categoryPassed = categoryResults.reduce((sum, r) => sum + r.passed, 0);
      const categoryFailed = categoryResults.reduce((sum, r) => sum + r.failed, 0);
      const categorySkipped = categoryResults.reduce((sum, r) => sum + r.skipped, 0);
      const categoryTotal = categoryPassed + categoryFailed + categorySkipped;

      const categoryRate = categoryTotal > 0 ? ((categoryPassed / categoryTotal) * 100).toFixed(1) : "0";

      console.log(`   ${category}: ${categoryPassed}/${categoryTotal} (${categoryRate}%)`);
    });

    console.log("");

    if (summary.totalFailed === 0) {
      console.log("🎉 All tests passed! 🎉");
    } else {
      console.log(`⚠️  ${summary.totalFailed} test(s) failed`);
      process.exitCode = 1;
    }
  }

  private async saveTestReport(summary: TestSummary): Promise<void> {
    try {
      const reportsDir = path.join(process.cwd(), "test-reports");
      await mkdir(reportsDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const reportPath = path.join(reportsDir, `test-report-${timestamp}.json`);

      await writeFile(reportPath, JSON.stringify(summary, null, 2));
      console.log(`📄 Test report saved: ${reportPath}`);

      // Also generate HTML report
      const htmlReport = this.generateHTMLReport(summary);
      const htmlPath = path.join(reportsDir, `test-report-${timestamp}.html`);
      await writeFile(htmlPath, htmlReport);
      console.log(`📄 HTML report saved: ${htmlPath}`);
    } catch (error) {
      console.log(`⚠️  Failed to save test report: ${error}`);
    }
  }

  private generateHTMLReport(summary: TestSummary): string {
    const timestamp = new Date().toISOString();
    const successRate = summary.totalTests > 0 ? ((summary.totalPassed / summary.totalTests) * 100).toFixed(1) : "0";

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Report - Elasticsearch MCP Server</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 8px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 20px 0; }
        .stat { background: white; padding: 15px; border-radius: 8px; border: 1px solid #ddd; text-align: center; }
        .stat-value { font-size: 2em; font-weight: bold; }
        .passed { color: #28a745; }
        .failed { color: #dc3545; }
        .skipped { color: #ffc107; }
        .results { margin-top: 20px; }
        .suite { margin: 10px 0; padding: 10px; border-radius: 5px; }
        .suite.success { background: #d4edda; border: 1px solid #c3e6cb; }
        .suite.failure { background: #f8d7da; border: 1px solid #f5c6cb; }
        .details { margin-top: 10px; font-size: 0.9em; color: #666; }
        .error { color: #dc3545; margin: 5px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Test Report - Elasticsearch MCP Server</h1>
        <p>Generated: ${timestamp}</p>
        <p>Success Rate: <strong>${successRate}%</strong></p>
    </div>

    <div class="summary">
        <div class="stat">
            <div class="stat-value">${summary.totalSuites}</div>
            <div>Test Suites</div>
        </div>
        <div class="stat">
            <div class="stat-value">${summary.totalTests}</div>
            <div>Total Tests</div>
        </div>
        <div class="stat">
            <div class="stat-value passed">${summary.totalPassed}</div>
            <div>Passed</div>
        </div>
        <div class="stat">
            <div class="stat-value failed">${summary.totalFailed}</div>
            <div>Failed</div>
        </div>
        <div class="stat">
            <div class="stat-value skipped">${summary.totalSkipped}</div>
            <div>Skipped</div>
        </div>
        <div class="stat">
            <div class="stat-value">${(summary.totalDuration / 1000).toFixed(2)}s</div>
            <div>Duration</div>
        </div>
    </div>

    <div class="results">
        <h2>Test Suites</h2>
        ${summary.results
          .map(
            (result) => `
            <div class="suite ${result.failed > 0 ? "failure" : "success"}">
                <h3>${result.category}/${result.suite}</h3>
                <div class="details">
                    <span class="passed">${result.passed} passed</span> •
                    <span class="failed">${result.failed} failed</span> •
                    <span class="skipped">${result.skipped} skipped</span> •
                    Duration: ${result.duration}ms
                </div>
                ${
                  result.errors.length > 0
                    ? `
                    <div class="errors">
                        ${result.errors.map((error) => `<div class="error">${error}</div>`).join("")}
                    </div>
                `
                    : ""
                }
            </div>
        `,
          )
          .join("")}
    </div>
</body>
</html>`;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {
    verbose: args.includes("--verbose") || args.includes("-v"),
    generateReport: !args.includes("--no-report"),
    runCoverage: args.includes("--coverage"),
  };

  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: bun run scripts/run-all-tests.ts [options]");
    console.log("");
    console.log("Options:");
    console.log("  --verbose, -v     Show verbose output including error details");
    console.log("  --coverage        Run coverage analysis");
    console.log("  --no-report       Skip generating test reports");
    console.log("  --help, -h        Show this help message");
    process.exit(0);
  }

  console.log("🔧 Elasticsearch MCP Server - Test Suite");
  console.log(`Runtime: ${process.version}`);
  console.log(`Platform: ${process.platform}`);
  console.log("");

  const runner = new TestRunner(options);

  try {
    const summary = await runner.runAllTests();

    // Exit with appropriate code
    if (summary.totalFailed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error("💥 Test runner failed:", error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.main) {
  main().catch(console.error);
}

export { TestRunner, type TestSummary, type TestResult };
