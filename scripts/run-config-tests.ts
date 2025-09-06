#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

interface TestResult {
  suite: string;
  success: boolean;
  passed: number;
  failed: number;
  duration: number;
  errors: string[];
}

interface TestSummary {
  total_suites: number;
  successful_suites: number;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  success_rate: number;
  duration: number;
}

export class ConfigurationTestRunner {
  private verbose = false;
  
  constructor(verbose = false) {
    this.verbose = verbose;
  }

  async runConfigTests(): Promise<{ summary: TestSummary; results: TestResult[] }> {
    console.log("🔧 Configuration Test Suite");
    console.log("════════════════════════════════════════════════════════");
    
    const configTestSuites = [
      { name: "Environment Config", path: "tests/config/environment-config.test.ts" },
      { name: "Single Source Truth", path: "tests/config/single-source-truth.test.ts" },
      { name: "Breaking Change Detection", path: "tests/config/breaking-change-detection.test.ts" },
      { name: "New Configuration Sections", path: "tests/config/new-configuration-sections.test.ts" }
    ];

    console.log(`📋 Running ${configTestSuites.length} configuration test suites...\n`);

    const results: TestResult[] = [];
    const startTime = Date.now();

    for (const suite of configTestSuites) {
      if (!existsSync(suite.path)) {
        console.log(`⚠️  Skipping ${suite.name}: File not found at ${suite.path}`);
        continue;
      }

      console.log(`🧪 Running ${suite.name}...`);
      const result = await this.runTestSuite(suite.path);
      result.suite = suite.name;
      results.push(result);

      const status = result.success ? "✅" : "❌";
      if (result.success) {
        console.log(`   ${status} ${suite.name}: ${result.passed} passed (${result.duration}ms)`);
      } else {
        console.log(`   ${status} ${suite.name}: ${result.passed} passed, ${result.failed} failed (${result.duration}ms)`);
        if (this.verbose && result.errors.length > 0) {
          result.errors.forEach(error => {
            console.log(`       🔍 ${error}`);
          });
        }
      }
    }

    const totalDuration = Date.now() - startTime;
    const summary = this.generateSummary(results, totalDuration);
    this.displayResults(summary, results);

    return { summary, results };
  }

  async validateConfigRefactoring(): Promise<boolean> {
    console.log("🔍 Configuration Refactoring Validation");
    console.log("════════════════════════════════════════════════════════");
    
    const criticalTests = [
      "should have no .default() calls in Zod schemas",
      "should use defaultConfig as single source",
      "should merge environment variables correctly",
      "should maintain backward compatibility",
      "should validate new environment variable mappings"
    ];

    console.log("📋 Running critical refactoring validation tests...\n");

    // Run specific tests that validate our refactoring
    const { results } = await this.runConfigTests();
    
    let allCriticalTestsPassed = true;
    let criticalTestsPassed = 0;

    for (const result of results) {
      if (!result.success && result.suite.includes("Single Source")) {
        console.log(`❌ Critical: Single source of truth validation failed`);
        allCriticalTestsPassed = false;
      }
      if (!result.success && result.suite.includes("Breaking Change")) {
        console.log(`❌ Critical: Breaking change detection failed`);
        allCriticalTestsPassed = false;
      }
      if (result.success) {
        criticalTestsPassed++;
      }
    }

    console.log("\n🎯 Refactoring Validation Results");
    console.log("────────────────────────────────────────");
    console.log(`✅ Critical Tests Passed: ${criticalTestsPassed}/${results.length}`);
    console.log(`📊 Success Rate: ${((criticalTestsPassed / results.length) * 100).toFixed(1)}%`);

    if (allCriticalTestsPassed) {
      console.log("🎉 Configuration refactoring validation PASSED");
      return true;
    } else {
      console.log("⚠️  Configuration refactoring validation FAILED");
      return false;
    }
  }

  private async runTestSuite(testPath: string): Promise<TestResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const result: TestResult = {
        suite: testPath,
        success: false,
        passed: 0,
        failed: 0,
        duration: 0,
        errors: []
      };

      const childProcess = spawn("bun", ["test", testPath], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: process.cwd(),
      });

      let stdout = "";
      let stderr = "";

      childProcess.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      childProcess.on("close", (code: number | null) => {
        result.duration = Date.now() - startTime;
        
        // Parse test output to extract results
        const output = stdout + stderr;
        
        // Extract passed/failed counts from Bun test output
        const passedMatch = output.match(/(\d+) passed/);
        const failedMatch = output.match(/(\d+) failed/);
        
        result.passed = passedMatch ? parseInt(passedMatch[1]) : 0;
        result.failed = failedMatch ? parseInt(failedMatch[1]) : 0;
        result.success = code === 0 && result.failed === 0;

        // Extract error messages
        if (!result.success) {
          const errorLines = output.split('\n').filter(line => 
            line.includes('Error:') || 
            line.includes('AssertionError') ||
            line.includes('expect(')
          );
          result.errors = errorLines.slice(0, 5); // Limit to first 5 errors
        }

        resolve(result);
      });

      childProcess.on("error", (error: Error) => {
        result.duration = Date.now() - startTime;
        result.errors = [error.message];
        resolve(result);
      });
    });
  }

  private generateSummary(results: TestResult[], totalDuration: number): TestSummary {
    const successfulSuites = results.filter(r => r.success).length;
    const totalTests = results.reduce((sum, r) => sum + r.passed + r.failed, 0);
    const passedTests = results.reduce((sum, r) => sum + r.passed, 0);
    const failedTests = results.reduce((sum, r) => sum + r.failed, 0);

    return {
      total_suites: results.length,
      successful_suites: successfulSuites,
      total_tests: totalTests,
      passed_tests: passedTests,
      failed_tests: failedTests,
      success_rate: totalTests > 0 ? Math.round((passedTests / totalTests) * 100 * 10) / 10 : 0,
      duration: totalDuration
    };
  }

  private displayResults(summary: TestSummary, results: TestResult[]): void {
    console.log("\n📊 Configuration Test Results Summary");
    console.log("────────────────────────────────────────");
    
    // Group results by category
    const categories: { [key: string]: TestResult[] } = {};
    for (const result of results) {
      const category = "Configuration Tests";
      if (!categories[category]) categories[category] = [];
      categories[category].push(result);
    }

    for (const [category, categoryResults] of Object.entries(categories)) {
      console.log(`\n🏷️  ${category}:`);
      
      for (const result of categoryResults) {
        const status = result.success ? "✅" : "❌";
        const percentage = result.passed + result.failed > 0 
          ? ((result.passed / (result.passed + result.failed)) * 100).toFixed(1)
          : "0.0";
        
        console.log(`   ${status} ${result.suite}: ${result.passed}/${result.passed + result.failed} tests (${percentage}%) - ${result.duration}ms`);
        
        if (!result.success && result.errors.length > 0 && this.verbose) {
          console.log(`      💡 ${result.errors[0]}`);
        }
      }
    }

    console.log("\n🏁 Overall Results");
    console.log("────────────────────────────────────────");
    console.log(`📈 Test Suites: ${summary.successful_suites}/${summary.total_suites} successful`);
    console.log(`📊 Test Cases: ${summary.passed_tests}/${summary.total_tests} passed (${summary.success_rate}%)`);
    console.log(`⏱️  Total Duration: ${summary.duration}ms`);

    if (summary.failed_tests > 0) {
      console.log(`\n⚠️  ${summary.total_suites - summary.successful_suites} test suite(s) need attention`);
    } else {
      console.log("\n🎉 All configuration tests passed!");
    }
  }
}

// CLI usage
if (import.meta.main) {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const validateRefactoring = args.includes('--validate-refactoring');

  const runner = new ConfigurationTestRunner(verbose);

  if (validateRefactoring) {
    runner.validateConfigRefactoring().then(success => {
      process.exit(success ? 0 : 1);
    });
  } else {
    runner.runConfigTests().then(({ summary }) => {
      process.exit(summary.success_rate === 100 ? 0 : 1);
    });
  }
}