/* tests/unit/logger-metadata.test.ts */

/**
 * Test to ensure logger properly handles metadata and prevents undefined values
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { MCPCompatibleLogger } from "../../src/utils/logger.js";

describe("Logger Metadata Handling", () => {
  let logger: MCPCompatibleLogger;
  let originalStderr: typeof process.stderr.write;
  let logOutput: string[] = [];

  beforeEach(() => {
    // Set log level to debug to ensure all logs are captured
    process.env.LOG_LEVEL = "debug";
    
    logger = new MCPCompatibleLogger("test-context", { initialMeta: "test" });
    logOutput = [];

    // Mock stderr to capture log output
    originalStderr = process.stderr.write;
    process.stderr.write = ((data: any) => {
      const output = String(data);
      if (output.trim()) { // Only capture non-empty lines
        logOutput.push(output.trim()); // Remove trailing newline
      }
      return true;
    }) as any;
  });

  afterEach(() => {
    // Restore original stderr
    process.stderr.write = originalStderr;
    
    // Reset log level
    delete process.env.LOG_LEVEL;
  });

  test("should remove undefined metadata values", () => {
    logger.info("Test message", {
      validField: "test",
      undefinedField: undefined,
      nullField: null,
      emptyObject: {},
    });

    expect(logOutput).toHaveLength(1);
    const logEntry = JSON.parse(logOutput[0]);
    
    expect(logEntry).toHaveProperty("validField", "test");
    expect(logEntry).not.toHaveProperty("undefinedField");
    expect(logEntry).not.toHaveProperty("nullField");
    expect(logEntry).not.toHaveProperty("emptyObject");
  });

  test("should preserve valid metadata", () => {
    logger.info("Test message", {
      stringValue: "test",
      numberValue: 42,
      booleanValue: true,
      arrayValue: [1, 2, 3],
      objectValue: { nested: "value" },
    });

    expect(logOutput).toHaveLength(1);
    const logEntry = JSON.parse(logOutput[0]);
    
    expect(logEntry).toHaveProperty("stringValue", "test");
    expect(logEntry).toHaveProperty("numberValue", 42);
    expect(logEntry).toHaveProperty("booleanValue", true);
    expect(logEntry).toHaveProperty("arrayValue");
    expect(logEntry.arrayValue).toEqual([1, 2, 3]);
    expect(logEntry).toHaveProperty("objectValue");
    expect(logEntry.objectValue).toEqual({ nested: "value" });
  });

  test("should include instance metadata", () => {
    logger.info("Test message", { additionalMeta: "value" });

    expect(logOutput).toHaveLength(1);
    const logEntry = JSON.parse(logOutput[0]);
    
    expect(logEntry).toHaveProperty("initialMeta", "test");
    expect(logEntry).toHaveProperty("additionalMeta", "value");
  });

  test("should produce valid JSON without metadata property", () => {
    logger.info("Test message");

    expect(logOutput).toHaveLength(1);
    const logEntry = JSON.parse(logOutput[0]);
    
    // Should not have a separate "metadata" property
    expect(logEntry).not.toHaveProperty("metadata");
    
    // Should have standard log fields
    expect(logEntry).toHaveProperty("timestamp");
    expect(logEntry).toHaveProperty("level", "INFO");
    expect(logEntry).toHaveProperty("context", "test-context");
    expect(logEntry).toHaveProperty("message", "Test message");
    expect(logEntry).toHaveProperty("initialMeta", "test");
  });

  test("should handle complex nested objects correctly", () => {
    logger.info("Test message", {
      complex: {
        nested: {
          value: "test",
          undefinedNested: undefined,
          nullNested: null,
        },
        emptyNested: {},
        validNested: { data: "present" },
      },
    });

    expect(logOutput).toHaveLength(1);
    const logEntry = JSON.parse(logOutput[0]);
    
    expect(logEntry).toHaveProperty("complex");
    expect(logEntry.complex).toHaveProperty("nested");
    expect(logEntry.complex.nested).toHaveProperty("value", "test");
    expect(logEntry.complex).toHaveProperty("validNested");
    expect(logEntry.complex.validNested).toEqual({ data: "present" });
  });

  test("should output clean JSON without client-confusing metadata", () => {
    logger.info("Server starting", {
      url: "http://localhost:9200",
      hasAuth: true,
      version: "1.0.0",
    });

    expect(logOutput).toHaveLength(1);
    const output = logOutput[0];
    
    // Should be valid JSON
    expect(() => JSON.parse(output)).not.toThrow();
    
    // Should not contain patterns that confuse MCP clients
    expect(output).not.toContain("metadata: undefined");
    expect(output).not.toContain("{ metadata: undefined }");
    
    const logEntry = JSON.parse(output);
    expect(logEntry.message).toBe("Server starting");
    expect(logEntry.url).toBe("http://localhost:9200");
    expect(logEntry.hasAuth).toBe(true);
    expect(logEntry.version).toBe("1.0.0");
  });
});

console.log("Logger metadata test completed");