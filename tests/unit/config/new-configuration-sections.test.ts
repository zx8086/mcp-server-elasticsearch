import { describe, expect, test } from "bun:test";
import { getConfig, envVarMapping } from "../../../src/config";

describe("New Configuration Sections Validation", () => {
  
  test("should validate new server response handling configuration", () => {
    const config = getConfig();
    
    // Test new response handling configuration exists and has correct types
    expect(config.server.maxResponseSizeBytes).toBeDefined();
    expect(typeof config.server.maxResponseSizeBytes).toBe('number');
    expect(config.server.maxResponseSizeBytes).toBe(1000000); // 1MB default
    
    expect(config.server.defaultPageSize).toBeDefined();
    expect(typeof config.server.defaultPageSize).toBe('number');
    expect(config.server.defaultPageSize).toBe(20);
    
    expect(config.server.maxPageSize).toBeDefined();
    expect(typeof config.server.maxPageSize).toBe('number');
    expect(config.server.maxPageSize).toBe(100);
    
    expect(config.server.enableResponseCompression).toBeDefined();
    expect(typeof config.server.enableResponseCompression).toBe('boolean');
    expect(config.server.enableResponseCompression).toBe(true);
    
    expect(config.server.autoSummarizeLargeResponses).toBeDefined();
    expect(typeof config.server.autoSummarizeLargeResponses).toBe('boolean');
    expect(config.server.autoSummarizeLargeResponses).toBe(true);
  });

  test("should validate new server response handling environment variables", () => {
    const config = getConfig();
    
    // Test that new server response configuration reflects environment or defaults
    // If environment variables are set, they should be applied
    if (Bun.env.MCP_MAX_RESPONSE_SIZE_BYTES) {
      expect(config.server.maxResponseSizeBytes).toBe(parseInt(Bun.env.MCP_MAX_RESPONSE_SIZE_BYTES));
    } else {
      expect(config.server.maxResponseSizeBytes).toBe(1000000); // Default
    }
    
    if (Bun.env.MCP_DEFAULT_PAGE_SIZE) {
      expect(config.server.defaultPageSize).toBe(parseInt(Bun.env.MCP_DEFAULT_PAGE_SIZE));
    } else {
      expect(config.server.defaultPageSize).toBe(20); // Default
    }
    
    if (Bun.env.MCP_MAX_PAGE_SIZE) {
      expect(config.server.maxPageSize).toBe(parseInt(Bun.env.MCP_MAX_PAGE_SIZE));
    } else {
      expect(config.server.maxPageSize).toBe(100); // Default
    }
    
    // Verify all new config properties exist and have correct types
    expect(typeof config.server.maxResponseSizeBytes).toBe('number');
    expect(typeof config.server.defaultPageSize).toBe('number');
    expect(typeof config.server.maxPageSize).toBe('number');
    expect(typeof config.server.enableResponseCompression).toBe('boolean');
    expect(typeof config.server.autoSummarizeLargeResponses).toBe('boolean');
  });

  test("should validate LangSmith tracing configuration", () => {
    const config = getConfig();
    
    // Test LangSmith configuration exists and has correct structure
    expect(config.langsmith).toBeDefined();
    expect(typeof config.langsmith).toBe('object');
    
    expect(config.langsmith.tracing).toBeDefined();
    expect(typeof config.langsmith.tracing).toBe('boolean');
    // Default is false, but might be overridden by LANGSMITH_TRACING env var
    const expectedTracing = Bun.env.LANGSMITH_TRACING?.toLowerCase() === "true" || false;
    expect(config.langsmith.tracing).toBe(expectedTracing);
    
    expect(config.langsmith.endpoint).toBeDefined();
    expect(typeof config.langsmith.endpoint).toBe('string');
    // Endpoint might be overridden by LANGSMITH_ENDPOINT env var
    const expectedEndpoint = Bun.env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com";
    expect(config.langsmith.endpoint).toBe(expectedEndpoint);
    
    expect(config.langsmith.project).toBeDefined();
    expect(typeof config.langsmith.project).toBe('string');
    expect(config.langsmith.project).toBe("elasticsearch-mcp-server");
    
    // Optional API key should be undefined if not set
    if (config.langsmith.apiKey !== undefined) {
      expect(typeof config.langsmith.apiKey).toBe('string');
    }
  });

  test("should validate LangSmith environment variables", () => {
    const config = getConfig();
    
    // Verify LangSmith configuration reflects current environment
    // If LANGSMITH_TRACING is set, it should be applied
    if (Bun.env.LANGSMITH_TRACING !== undefined) {
      const expectedTracing = Bun.env.LANGSMITH_TRACING.toLowerCase() === "true";
      expect(config.langsmith.tracing).toBe(expectedTracing);
    }
    
    // If LANGSMITH_ENDPOINT is set, it should be applied
    if (Bun.env.LANGSMITH_ENDPOINT) {
      expect(config.langsmith.endpoint).toBe(Bun.env.LANGSMITH_ENDPOINT);
    }
    
    // If LANGSMITH_API_KEY is set, it should be applied
    if (Bun.env.LANGSMITH_API_KEY) {
      expect(config.langsmith.apiKey).toBe(Bun.env.LANGSMITH_API_KEY);
    }
    
    // If LANGSMITH_PROJECT is set, it should be applied
    if (Bun.env.LANGSMITH_PROJECT) {
      expect(config.langsmith.project).toBe(Bun.env.LANGSMITH_PROJECT);
    }
    
    // Configuration should be valid regardless of environment values
    expect(config.langsmith).toBeDefined();
    expect(typeof config.langsmith.tracing).toBe('boolean');
    expect(typeof config.langsmith.endpoint).toBe('string');
  });

  test("should have proper environment variable mappings for new sections", () => {
    // Verify all new environment variables are properly mapped
    const serverMappings = envVarMapping.server;
    
    expect(serverMappings).toHaveProperty('maxResponseSizeBytes');
    expect(serverMappings.maxResponseSizeBytes).toBe('MCP_MAX_RESPONSE_SIZE_BYTES');
    
    expect(serverMappings).toHaveProperty('defaultPageSize');
    expect(serverMappings.defaultPageSize).toBe('MCP_DEFAULT_PAGE_SIZE');
    
    expect(serverMappings).toHaveProperty('maxPageSize');
    expect(serverMappings.maxPageSize).toBe('MCP_MAX_PAGE_SIZE');
    
    expect(serverMappings).toHaveProperty('enableResponseCompression');
    expect(serverMappings.enableResponseCompression).toBe('MCP_ENABLE_RESPONSE_COMPRESSION');
    
    expect(serverMappings).toHaveProperty('autoSummarizeLargeResponses');
    expect(serverMappings.autoSummarizeLargeResponses).toBe('MCP_AUTO_SUMMARIZE_LARGE_RESPONSES');
    
    // Verify LangSmith mappings
    const langsmithMappings = envVarMapping.langsmith;
    
    expect(langsmithMappings).toHaveProperty('tracing');
    expect(langsmithMappings.tracing).toBe('LANGSMITH_TRACING');
    
    expect(langsmithMappings).toHaveProperty('endpoint');
    expect(langsmithMappings.endpoint).toBe('LANGSMITH_ENDPOINT');
    
    expect(langsmithMappings).toHaveProperty('apiKey');
    expect(langsmithMappings.apiKey).toBe('LANGSMITH_API_KEY');
    
    expect(langsmithMappings).toHaveProperty('project');
    expect(langsmithMappings.project).toBe('LANGSMITH_PROJECT');
  });

  test("should validate configuration ranges and constraints", () => {
    const config = getConfig();
    
    // Test that configuration values are within reasonable ranges
    expect(config.server.maxResponseSizeBytes).toBeGreaterThan(0);
    expect(config.server.maxResponseSizeBytes).toBeLessThanOrEqual(10000000); // Max 10MB
    
    expect(config.server.defaultPageSize).toBeGreaterThan(0);
    expect(config.server.defaultPageSize).toBeLessThanOrEqual(1000);
    
    expect(config.server.maxPageSize).toBeGreaterThanOrEqual(config.server.defaultPageSize);
    expect(config.server.maxPageSize).toBeLessThanOrEqual(10000);
    
    // Test LangSmith endpoint is a valid URL
    expect(config.langsmith.endpoint).toMatch(/^https?:\/\//);
  });

  test("should validate configuration structure is complete", () => {
    const config = getConfig();
    
    // Verify that all new configuration sections and properties exist
    const requiredServerProperties = [
      'maxResponseSizeBytes', 'defaultPageSize', 'maxPageSize', 
      'enableResponseCompression', 'autoSummarizeLargeResponses'
    ];
    
    for (const prop of requiredServerProperties) {
      expect(config.server).toHaveProperty(prop);
      expect(config.server[prop]).toBeDefined();
    }
    
    const requiredLangSmithProperties = [
      'tracing', 'endpoint', 'project'
    ];
    
    for (const prop of requiredLangSmithProperties) {
      expect(config.langsmith).toHaveProperty(prop);
      expect(config.langsmith[prop]).toBeDefined();
    }
    
    // Verify configuration values are reasonable
    expect(config.server.defaultPageSize).toBeGreaterThan(0);
    expect(config.server.maxPageSize).toBeGreaterThanOrEqual(config.server.defaultPageSize);
    expect(config.server.maxResponseSizeBytes).toBeGreaterThan(0);
  });
});