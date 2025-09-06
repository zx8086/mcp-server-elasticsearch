/* src/utils/bunOptimizer.ts */

/**
 * Bun runtime optimization utilities for Elasticsearch MCP server
 * Provides high-performance alternatives using native Bun APIs
 */

import { logger } from "./logger.js";

/**
 * Runtime detection with Bun-first optimization
 */
export class BunRuntimeDetection {
  static isBun(): boolean {
    return typeof Bun !== "undefined";
  }

  static getRuntime(): "bun" | "node" | "unknown" {
    if (typeof Bun !== "undefined") return "bun";
    if (typeof process !== "undefined" && process.versions?.node) return "node";
    return "unknown";
  }

  static getBunInfo() {
    if (!BunRuntimeDetection.isBun()) return null;

    return {
      version: Bun.version,
      revision: Bun.revision || "unknown",
      isDebug: typeof Bun.debugBuild !== "undefined" ? Bun.debugBuild : false,
    };
  }
}

/**
 * High-performance file operations with Bun native APIs
 */
export class BunFileManager {
  /**
   * Optimized configuration file loading
   */
  static async loadConfig<T>(path: string): Promise<T> {
    if (BunRuntimeDetection.isBun()) {
      const configFile = Bun.file(path);

      if (await configFile.exists()) {
        return await configFile.json();
      }
    } else {
      // Node.js fallback
      const { readFile } = await import("node:fs/promises");
      const content = await readFile(path, "utf-8");
      return JSON.parse(content);
    }

    throw new Error(`Configuration file not found: ${path}`);
  }

  /**
   * High-performance log file writing
   */
  static async writeLog(path: string, content: string): Promise<void> {
    if (BunRuntimeDetection.isBun()) {
      await Bun.write(path, content);
    } else {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(path, content);
    }
  }

  /**
   * Stream processing for large responses
   */
  static async processLargeResponse(data: any, processor: (chunk: Uint8Array) => Promise<void>): Promise<void> {
    if (BunRuntimeDetection.isBun()) {
      const blob = new Blob([JSON.stringify(data)]);
      const stream = blob.stream();

      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await processor(value);
        }
      } finally {
        reader.releaseLock();
      }
    } else {
      // Node.js fallback - process in chunks
      const jsonString = JSON.stringify(data);
      const chunkSize = 64 * 1024; // 64KB chunks

      for (let i = 0; i < jsonString.length; i += chunkSize) {
        const chunk = jsonString.slice(i, i + chunkSize);
        await processor(new TextEncoder().encode(chunk));
      }
    }
  }
}

/**
 * High-precision performance monitoring with Bun.nanoseconds()
 */
export class BunPerformanceTimer {
  private startTime = 0;
  private measurements = new Map<string, number[]>();

  start(): void {
    if (BunRuntimeDetection.isBun()) {
      this.startTime = Bun.nanoseconds();
    } else {
      this.startTime = performance.now() * 1_000_000; // Convert to nanoseconds
    }
  }

  end(): number {
    const endTime = BunRuntimeDetection.isBun() ? Bun.nanoseconds() : performance.now() * 1_000_000;

    return (endTime - this.startTime) / 1_000_000; // Convert to milliseconds
  }

  static async measure<T>(
    _name: string,
    fn: () => Promise<T>,
  ): Promise<{ result: T; duration: number; runtime: string }> {
    const runtime = BunRuntimeDetection.getRuntime();
    const start = BunRuntimeDetection.isBun() ? Bun.nanoseconds() : performance.now() * 1_000_000;

    const result = await fn();

    const end = BunRuntimeDetection.isBun() ? Bun.nanoseconds() : performance.now() * 1_000_000;

    return {
      result,
      duration: (end - start) / 1_000_000,
      runtime,
    };
  }

  static measureSync<T>(
    _name: string,
    fn: () => T,
  ): { result: T; duration: number; runtime: string } {
    const runtime = BunRuntimeDetection.getRuntime();
    const start = BunRuntimeDetection.isBun() ? Bun.nanoseconds() : performance.now() * 1_000_000;

    const result = fn();

    const end = BunRuntimeDetection.isBun() ? Bun.nanoseconds() : performance.now() * 1_000_000;

    return {
      result,
      duration: (end - start) / 1_000_000,
      runtime,
    };
  }

  recordMeasurement(operation: string, duration: number): void {
    if (!this.measurements.has(operation)) {
      this.measurements.set(operation, []);
    }
    this.measurements.get(operation)!.push(duration);
  }

  getStats(operation: string) {
    const durations = this.measurements.get(operation) || [];
    if (durations.length === 0) return null;

    const sorted = [...durations].sort((a, b) => a - b);
    return {
      count: durations.length,
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }
}

/**
 * Memory usage optimization with Bun.gc()
 */
export class BunMemoryManager {
  static getMemoryUsage() {
    // Force garbage collection if using Bun
    if (BunRuntimeDetection.isBun() && typeof Bun.gc === "function") {
      Bun.gc(true);
    }

    return {
      rss: process.memoryUsage().rss,
      heapTotal: process.memoryUsage().heapTotal,
      heapUsed: process.memoryUsage().heapUsed,
      external: process.memoryUsage().external,
      runtime: BunRuntimeDetection.getRuntime(),
    };
  }

  static async forceGC(): Promise<void> {
    if (BunRuntimeDetection.isBun() && typeof Bun.gc === "function") {
      Bun.gc(true);
      // Wait a tick for GC to complete
      await new Promise((resolve) => setTimeout(resolve, 0));
    } else if (global.gc) {
      global.gc();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  static logMemoryUsage(operation: string): void {
    const usage = BunMemoryManager.getMemoryUsage();

    logger.debug(`Memory usage after ${operation}`, {
      rss: `${(usage.rss / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(usage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      external: `${(usage.external / 1024 / 1024).toFixed(2)} MB`,
      runtime: usage.runtime,
    });
  }
}

/**
 * Enhanced process management utilities
 */
export class BunProcessManager {
  /**
   * Optimized subprocess execution
   */
  static async executeCommand(
    command: string[],
    options: { cwd?: string; env?: Record<string, string> } = {},
  ): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }> {
    if (BunRuntimeDetection.isBun()) {
      const proc = Bun.spawn(command, {
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env },
        stdout: "pipe",
        stderr: "pipe",
      });

      const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);

      const exitCode = await proc.exited;

      return {
        success: exitCode === 0,
        stdout,
        stderr,
        exitCode,
      };
    }
    // Node.js fallback
    const { spawn } = await import("node:child_process");
    return new Promise((resolve, reject) => {
      const proc = spawn(command[0], command.slice(1), options);

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        resolve({
          success: code === 0,
          stdout,
          stderr,
          exitCode: code || 0,
        });
      });

      proc.on("error", reject);
    });
  }
}

/**
 * System information utilities
 */
export class BunSystemInfo {
  static getSystemInfo() {
    const bunInfo = BunRuntimeDetection.getBunInfo();

    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      bunInfo,
      uptime: process.uptime(),
      cwd: process.cwd(),
      pid: process.pid,
      runtime: BunRuntimeDetection.getRuntime(),
    };
  }

  static async getBenchmarkData(): Promise<{
    fileIO: number;
    jsonParsing: number;
    memoryAllocation: number;
    runtime: string;
  }> {
    const runtime = BunRuntimeDetection.getRuntime();

    // File I/O benchmark
    const fileIOResult = await BunPerformanceTimer.measure("file-io", async () => {
      const testData = { test: "data", timestamp: Date.now(), large: "x".repeat(10000) };
      const testFile = "/tmp/bun-benchmark-test.json";

      if (BunRuntimeDetection.isBun()) {
        await Bun.write(testFile, JSON.stringify(testData));
        const readData = await Bun.file(testFile).json();
        return readData;
      }
      const fs = await import("node:fs/promises");
      await fs.writeFile(testFile, JSON.stringify(testData));
      const content = await fs.readFile(testFile, "utf-8");
      return JSON.parse(content);
    });

    // JSON parsing benchmark
    const jsonResult = await BunPerformanceTimer.measure("json-parsing", async () => {
      const largeObject = {
        data: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          value: `item-${i}`,
          metadata: { created: Date.now(), index: i },
        })),
      };
      const jsonString = JSON.stringify(largeObject);
      return JSON.parse(jsonString);
    });

    // Memory allocation benchmark
    const memoryResult = await BunPerformanceTimer.measure("memory-allocation", async () => {
      const arrays = [];
      for (let i = 0; i < 100; i++) {
        arrays.push(new Array(10000).fill(i));
      }
      return arrays.length;
    });

    return {
      fileIO: fileIOResult.duration,
      jsonParsing: jsonResult.duration,
      memoryAllocation: memoryResult.duration,
      runtime,
    };
  }
}

// Export all utilities
export const BunOptimizer = {
  RuntimeDetection: BunRuntimeDetection,
  FileManager: BunFileManager,
  PerformanceTimer: BunPerformanceTimer,
  MemoryManager: BunMemoryManager,
  ProcessManager: BunProcessManager,
  SystemInfo: BunSystemInfo,
};
