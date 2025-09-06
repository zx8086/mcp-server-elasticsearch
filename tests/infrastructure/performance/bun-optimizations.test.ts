/* tests/performance/bun-optimizations.test.ts */

import { describe, test, expect, beforeAll } from "bun:test";
import { BunOptimizer } from "../../../src/utils/bunOptimizer";

describe("Bun Runtime Optimizations", () => {
  beforeAll(() => {
    // Ensure we're testing the right environment
    if (!BunOptimizer.RuntimeDetection.isBun()) {
      console.warn("Warning: Tests designed for Bun runtime, but running on " + 
                   BunOptimizer.RuntimeDetection.getRuntime());
    }
  });

  describe("Runtime Detection", () => {
    test("should correctly identify Bun runtime", () => {
      const runtime = BunOptimizer.RuntimeDetection.getRuntime();
      expect(runtime).toBe("bun");
    });

    test("should provide Bun version information", () => {
      const bunInfo = BunOptimizer.RuntimeDetection.getBunInfo();
      expect(bunInfo).not.toBeNull();
      expect(bunInfo?.version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe("File Operations Performance", () => {
    test("should perform file I/O efficiently", async () => {
      const testData = { 
        timestamp: Date.now(), 
        data: "test".repeat(1000) 
      };
      const testFile = "/tmp/bun-test-file.json";

      const result = await BunOptimizer.PerformanceTimer.measure(
        "file-io-test",
        async () => {
          await BunOptimizer.FileManager.writeLog(testFile, JSON.stringify(testData));
          return await BunOptimizer.FileManager.loadConfig(testFile);
        }
      );

      expect(result.result).toEqual(testData);
      expect(result.duration).toBeLessThan(100); // Should complete in < 100ms
      expect(result.runtime).toBe("bun");
    });

    test("should handle large file operations efficiently", async () => {
      const largeData = {
        records: Array.from({ length: 10000 }, (_, i) => ({
          id: i,
          timestamp: Date.now(),
          content: `Record ${i} with content`.repeat(10)
        }))
      };
      const testFile = "/tmp/bun-large-file.json";

      const result = await BunOptimizer.PerformanceTimer.measure(
        "large-file-io",
        async () => {
          await BunOptimizer.FileManager.writeLog(testFile, JSON.stringify(largeData));
          return await BunOptimizer.FileManager.loadConfig(testFile);
        }
      );

      expect(result.result.records.length).toBe(10000);
      expect(result.duration).toBeLessThan(1000); // Should complete in < 1 second
    });
  });

  describe("Performance Timing Precision", () => {
    test("should provide nanosecond precision timing", async () => {
      const timer = new BunOptimizer.PerformanceTimer();
      timer.start();
      
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const duration = timer.end();

      expect(duration).toBeGreaterThan(8); // At least 8ms (accounting for timer precision)
      expect(duration).toBeLessThan(50); // Should be less than 50ms
    });

    test("should accurately measure rapid operations", async () => {
      const measurements: number[] = [];
      
      for (let i = 0; i < 100; i++) {
        const result = await BunOptimizer.PerformanceTimer.measure(
          "rapid-operation",
          async () => {
            // Very fast operation
            return JSON.parse('{"test": "value"}');
          }
        );
        
        measurements.push(result.duration);
      }

      const avgDuration = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      expect(avgDuration).toBeLessThan(5); // Should be very fast
      expect(measurements.every(m => m >= 0)).toBe(true); // All measurements should be positive
    });
  });

  describe("Memory Management", () => {
    test("should provide accurate memory usage information", () => {
      const memoryBefore = BunOptimizer.MemoryManager.getMemoryUsage();
      
      // Allocate some memory
      const largeArray = new Array(100000).fill("memory-test");
      
      const memoryAfter = BunOptimizer.MemoryManager.getMemoryUsage();

      expect(memoryAfter.heapUsed).toBeGreaterThan(memoryBefore.heapUsed);
      expect(memoryAfter.runtime).toBe("bun");
      expect(memoryAfter.rss).toBeGreaterThan(0);
    });

    test("should successfully force garbage collection", async () => {
      const memoryBefore = BunOptimizer.MemoryManager.getMemoryUsage();
      
      // Create and release memory
      let largeObjects = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        data: new Array(1000).fill(`data-${i}`)
      }));

      const memoryDuringAllocation = BunOptimizer.MemoryManager.getMemoryUsage();
      
      // Release references
      largeObjects = [];
      
      // Force garbage collection
      await BunOptimizer.MemoryManager.forceGC();
      
      const memoryAfterGC = BunOptimizer.MemoryManager.getMemoryUsage();

      expect(memoryDuringAllocation.heapUsed).toBeGreaterThan(memoryBefore.heapUsed);
      // After GC, memory should be lower (though not necessarily back to original due to V8 behavior)
      expect(memoryAfterGC.heapUsed).toBeLessThanOrEqual(memoryDuringAllocation.heapUsed);
    });
  });

  describe("Process Management", () => {
    test("should execute commands efficiently", async () => {
      const result = await BunOptimizer.PerformanceTimer.measure(
        "command-execution",
        async () => {
          return await BunOptimizer.ProcessManager.executeCommand(["echo", "test"]);
        }
      );

      expect(result.result.success).toBe(true);
      expect(result.result.stdout.trim()).toBe("test");
      expect(result.result.exitCode).toBe(0);
      expect(result.duration).toBeLessThan(1000); // Should complete quickly
    });

    test("should handle command failures properly", async () => {
      const result = await BunOptimizer.ProcessManager.executeCommand([
        "nonexistent-command"
      ]);

      expect(result.success).toBe(false);
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe("System Information", () => {
    test("should provide comprehensive system information", () => {
      const sysInfo = BunOptimizer.SystemInfo.getSystemInfo();

      expect(sysInfo.runtime).toBe("bun");
      expect(sysInfo.bunInfo).not.toBeNull();
      expect(sysInfo.platform).toBeDefined();
      expect(sysInfo.arch).toBeDefined();
      expect(sysInfo.pid).toBeGreaterThan(0);
      expect(sysInfo.uptime).toBeGreaterThan(0);
    });

    test("should generate benchmark data", async () => {
      const benchmarkData = await BunOptimizer.SystemInfo.getBenchmarkData();

      expect(benchmarkData.runtime).toBe("bun");
      expect(benchmarkData.fileIO).toBeGreaterThan(0);
      expect(benchmarkData.jsonParsing).toBeGreaterThan(0);
      expect(benchmarkData.memoryAllocation).toBeGreaterThan(0);

      // All operations should complete reasonably quickly
      expect(benchmarkData.fileIO).toBeLessThan(1000);
      expect(benchmarkData.jsonParsing).toBeLessThan(1000);
      expect(benchmarkData.memoryAllocation).toBeLessThan(1000);
    });
  });

  describe("Environment Variable Access", () => {
    test("should access Bun.env efficiently", () => {
      // Set a test environment variable
      Bun.env.BUN_TEST_VAR = "test-value";

      const result = BunOptimizer.PerformanceTimer.measureSync(
        "env-access",
        () => {
          const values = [];
          
          // Access environment variables many times
          for (let i = 0; i < 1000; i++) {
            values.push(Bun.env.BUN_TEST_VAR);
          }
          
          return values;
        }
      );

      expect(result.result.every(v => v === "test-value")).toBe(true);
      expect(result.duration).toBeLessThan(10); // Should be very fast
      
      // Cleanup
      delete Bun.env.BUN_TEST_VAR;
    });
  });

  describe("Large Data Processing", () => {
    test("should handle large JSON payloads efficiently", async () => {
      // Simulate large Elasticsearch response
      const largeResponse = {
        took: 145,
        timed_out: false,
        hits: {
          total: { value: 50000, relation: "eq" },
          hits: Array.from({ length: 5000 }, (_, i) => ({
            _index: `test-index-${i % 20}`,
            _id: `doc-${i}`,
            _score: Math.random() * 10,
            _source: {
              title: `Document ${i}`,
              content: `This is the content for document ${i}`.repeat(5),
              timestamp: new Date().toISOString(),
              metadata: {
                tags: Array.from({ length: 5 }, (_, j) => `tag-${j}-${i % 10}`),
                category: `category-${i % 15}`,
                priority: i % 10,
                nested: {
                  field1: `nested-value-${i}`,
                  field2: Math.random() * 1000,
                  field3: {
                    deep: `deep-${i}`,
                    deeper: Array.from({ length: 3 }, (_, k) => `item-${k}-${i}`)
                  }
                }
              }
            }
          }))
        }
      };

      const result = await BunOptimizer.PerformanceTimer.measure(
        "large-json-processing",
        async () => {
          const jsonString = JSON.stringify(largeResponse);
          const parsed = JSON.parse(jsonString);
          
          // Simulate some processing
          const processedHits = parsed.hits.hits.map((hit: any) => ({
            id: hit._id,
            title: hit._source.title,
            score: hit._score
          }));

          return {
            originalSize: jsonString.length,
            hitCount: processedHits.length,
            processed: processedHits.slice(0, 10) // Return sample
          };
        }
      );

      expect(result.result.hitCount).toBe(5000);
      expect(result.result.originalSize).toBeGreaterThan(1000000); // Should be > 1MB
      expect(result.duration).toBeLessThan(2000); // Should complete in < 2 seconds
    });
  });

  describe("Concurrent Operations", () => {
    test("should handle concurrent file operations", async () => {
      const concurrentOperations = Array.from({ length: 10 }, async (_, i) => {
        const testFile = `/tmp/concurrent-test-${i}.json`;
        const testData = { id: i, data: `test-data-${i}` };

        return await BunOptimizer.PerformanceTimer.measure(
          `concurrent-op-${i}`,
          async () => {
            await BunOptimizer.FileManager.writeLog(testFile, JSON.stringify(testData));
            return await BunOptimizer.FileManager.loadConfig(testFile);
          }
        );
      });

      const results = await Promise.all(concurrentOperations);

      // All operations should succeed
      results.forEach((result, i) => {
        expect(result.result.id).toBe(i);
        expect(result.result.data).toBe(`test-data-${i}`);
        expect(result.duration).toBeLessThan(1000);
      });

      // Average duration should be reasonable
      const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
      expect(avgDuration).toBeLessThan(500);
    });
  });
});