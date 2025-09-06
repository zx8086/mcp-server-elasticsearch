import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getConfig, defaultConfig, envVarMapping } from "../../../src/config";

describe("Single Source of Truth Configuration Pattern", () => {
  
  test("should have no .default() calls in Zod schemas", () => {
    const configPath = join(process.cwd(), "src/config.ts");
    const content = readFileSync(configPath, "utf-8");
    
    // Count .default() occurrences in schema definitions
    const defaultCalls = content.match(/\.default\(/g);
    
    if (defaultCalls) {
      // Find the context of each .default() call
      const lines = content.split('\n');
      const defaultLines: string[] = [];
      
      lines.forEach((line, index) => {
        if (line.includes('.default(')) {
          defaultLines.push(`Line ${index + 1}: ${line.trim()}`);
        }
      });
      
      console.log('Found .default() calls in schemas:');
      defaultLines.forEach(line => console.log('  ', line));
    }
    
    expect(defaultCalls).toBeNull();
  });

  test("should use defaultConfig as single source for defaults", () => {
    const config = getConfig();
    
    // Verify that config values match defaultConfig values when no env vars override
    expect(config.server.name).toBe(defaultConfig.server.name);
    expect(config.server.version).toBe(defaultConfig.server.version);
    expect(config.server.maxQueryTimeout).toBe(defaultConfig.server.maxQueryTimeout);
    expect(config.elasticsearch.maxRetries).toBe(defaultConfig.elasticsearch.maxRetries);
    expect(config.logging.level).toBe(defaultConfig.logging.level);
    expect(config.security.allowDestructiveOperations).toBe(defaultConfig.security.allowDestructiveOperations);
    
    // For langsmith.tracing, check if it's overridden by environment or matches default
    if (Bun.env.LANGSMITH_TRACING === undefined) {
      expect(config.langsmith.tracing).toBe(defaultConfig.langsmith.tracing);
    } else {
      // If env var is set, verify it's being applied correctly
      const expectedValue = Bun.env.LANGSMITH_TRACING?.toLowerCase() === "true";
      expect(config.langsmith.tracing).toBe(expectedValue);
    }
  });

  test("should have complete environment variable mappings", () => {
    // Verify all config sections have corresponding env var mappings
    const configSections = Object.keys(defaultConfig);
    const mappingSections = Object.keys(envVarMapping);
    
    expect(mappingSections).toEqual(expect.arrayContaining(configSections));
    
    // Verify new configuration fields have mappings
    const expectedServerMappings = [
      'name', 'version', 'readOnlyMode', 'readOnlyStrictMode',
      'maxQueryTimeout', 'maxResultsPerQuery', 'transportMode', 'port',
      'maxResponseSizeBytes', 'defaultPageSize', 'maxPageSize',
      'enableResponseCompression', 'autoSummarizeLargeResponses'
    ];
    
    const serverMappingKeys = Object.keys(envVarMapping.server);
    expectedServerMappings.forEach(key => {
      expect(serverMappingKeys).toContain(key);
    });
  });

  test("should merge environment variables correctly", () => {
    // Test that environment variables override defaults correctly
    const originalEnv = { ...process.env };
    
    try {
      // Set test environment variables
      process.env.MCP_SERVER_NAME = "test-server";
      process.env.MCP_MAX_QUERY_TIMEOUT = "45000";
      process.env.READ_ONLY_MODE = "false";
      process.env.LOG_LEVEL = "debug";
      
      // Force config reload by clearing module cache if needed  
      delete require.cache[require.resolve("../../../src/config")];
      const { getConfig: getConfigFresh } = require("../../../src/config");
      
      const config = getConfigFresh();
      
      // Verify environment variables override defaults
      expect(config.server.name).toBe("test-server");
      expect(config.server.maxQueryTimeout).toBe(45000);
      expect(config.server.readOnlyMode).toBe(false);
      expect(config.logging.level).toBe("debug");
      
    } finally {
      // Restore original environment
      process.env = originalEnv;
    }
  });

  test("should validate configuration structure consistency", () => {
    const config = getConfig();
    
    // Verify all expected sections exist
    expect(config).toHaveProperty('server');
    expect(config).toHaveProperty('elasticsearch');
    expect(config).toHaveProperty('logging');
    expect(config).toHaveProperty('security');
    expect(config).toHaveProperty('langsmith');
    
    // Verify new server configuration properties exist
    expect(config.server).toHaveProperty('maxResponseSizeBytes');
    expect(config.server).toHaveProperty('defaultPageSize');
    expect(config.server).toHaveProperty('maxPageSize');
    expect(config.server).toHaveProperty('enableResponseCompression');
    expect(config.server).toHaveProperty('autoSummarizeLargeResponses');
    
    // Verify LangSmith configuration exists
    expect(config.langsmith).toHaveProperty('tracing');
    expect(config.langsmith).toHaveProperty('endpoint');
    expect(config.langsmith).toHaveProperty('project');
  });

  test("should maintain type safety after refactoring", () => {
    const config = getConfig();
    
    // Verify types are correct
    expect(typeof config.server.name).toBe('string');
    expect(typeof config.server.port).toBe('number');
    expect(typeof config.server.readOnlyMode).toBe('boolean');
    expect(typeof config.server.maxResponseSizeBytes).toBe('number');
    expect(typeof config.server.defaultPageSize).toBe('number');
    
    expect(typeof config.elasticsearch.url).toBe('string');
    expect(typeof config.elasticsearch.maxRetries).toBe('number');
    expect(typeof config.elasticsearch.compression).toBe('boolean');
    
    expect(typeof config.langsmith.tracing).toBe('boolean');
    expect(typeof config.langsmith.endpoint).toBe('string');
    expect(typeof config.langsmith.project).toBe('string');
  });
});