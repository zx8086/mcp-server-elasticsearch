import { describe, expect, test } from "bun:test";
import { getConfig, envVarMapping } from "../../../src/config";

describe("Configuration Breaking Change Detection", () => {
  
  test("should maintain backward compatibility for all config sections", () => {
    const config = getConfig();
    
    // Server configuration backward compatibility
    expect(config.server).toHaveProperty('name');
    expect(config.server).toHaveProperty('version');
    expect(config.server).toHaveProperty('readOnlyMode');
    expect(config.server).toHaveProperty('readOnlyStrictMode');
    expect(config.server).toHaveProperty('maxQueryTimeout');
    expect(config.server).toHaveProperty('maxResultsPerQuery');
    expect(config.server).toHaveProperty('transportMode');
    expect(config.server).toHaveProperty('port');
    
    // New server configuration properties
    expect(config.server).toHaveProperty('maxResponseSizeBytes');
    expect(config.server).toHaveProperty('defaultPageSize');
    expect(config.server).toHaveProperty('maxPageSize');
    expect(config.server).toHaveProperty('enableResponseCompression');
    expect(config.server).toHaveProperty('autoSummarizeLargeResponses');
    
    // Elasticsearch configuration backward compatibility
    expect(config.elasticsearch).toHaveProperty('url');
    expect(config.elasticsearch).toHaveProperty('maxRetries');
    expect(config.elasticsearch).toHaveProperty('requestTimeout');
    expect(config.elasticsearch).toHaveProperty('compression');
    expect(config.elasticsearch).toHaveProperty('enableMetaHeader');
    expect(config.elasticsearch).toHaveProperty('disablePrototypePoisoningProtection');
    
    // Logging configuration backward compatibility
    expect(config.logging).toHaveProperty('level');
    expect(config.logging).toHaveProperty('format');
    expect(config.logging).toHaveProperty('includeMetadata');
    
    // Security configuration backward compatibility
    expect(config.security).toHaveProperty('allowDestructiveOperations');
    expect(config.security).toHaveProperty('allowSchemaModifications');
    expect(config.security).toHaveProperty('allowIndexManagement');
    expect(config.security).toHaveProperty('maxBulkOperations');
    
    // LangSmith configuration (new section)
    expect(config.langsmith).toHaveProperty('tracing');
    expect(config.langsmith).toHaveProperty('endpoint');
    expect(config.langsmith).toHaveProperty('project');
  });

  test("should validate all new environment variable mappings exist", () => {
    const requiredNewMappings = [
      // New server configuration mappings
      'MCP_MAX_RESPONSE_SIZE_BYTES',
      'MCP_DEFAULT_PAGE_SIZE', 
      'MCP_MAX_PAGE_SIZE',
      'MCP_ENABLE_RESPONSE_COMPRESSION',
      'MCP_AUTO_SUMMARIZE_LARGE_RESPONSES',
      
      // LangSmith configuration mappings
      'LANGSMITH_TRACING',
      'LANGSMITH_ENDPOINT',
      'LANGSMITH_API_KEY',
      'LANGSMITH_PROJECT'
    ];
    
    // Get all mapped environment variables
    const allMappedVars: string[] = [];
    Object.values(envVarMapping).forEach(section => {
      Object.values(section).forEach(envVar => {
        allMappedVars.push(envVar);
      });
    });
    
    // Check each required mapping exists
    requiredNewMappings.forEach(envVar => {
      expect(allMappedVars).toContain(envVar);
    });
  });

  test("should have consistent default values across refactoring", () => {
    const config = getConfig();
    
    // Verify critical default values haven't changed unexpectedly (account for env overrides)
    const expectedName = Bun.env.MCP_SERVER_NAME || "elasticsearch-mcp-server";
    expect(config.server.name).toBe(expectedName);
    expect(config.server.version).toBe("0.1.1");
    // Account for potential environment override
    const expectedTimeout = Bun.env.MCP_MAX_QUERY_TIMEOUT ? parseInt(Bun.env.MCP_MAX_QUERY_TIMEOUT) : 30000;
    expect(config.server.maxQueryTimeout).toBe(expectedTimeout);
    expect(config.server.maxResultsPerQuery).toBe(1000);
    
    // Port might be overridden by environment (MCP_PORT), so check appropriately
    const expectedPort = Bun.env.MCP_PORT ? parseInt(Bun.env.MCP_PORT) : 8080;
    expect(config.server.port).toBe(expectedPort);
    
    // Verify new defaults are reasonable
    expect(config.server.maxResponseSizeBytes).toBe(1000000); // 1MB
    expect(config.server.defaultPageSize).toBe(20);
    expect(config.server.maxPageSize).toBe(100);
    expect(config.server.enableResponseCompression).toBe(true);
    expect(config.server.autoSummarizeLargeResponses).toBe(true);
    
    // Elasticsearch URL might be overridden by environment (ES_URL)
    const expectedUrl = Bun.env.ES_URL || "http://localhost:9200";
    expect(config.elasticsearch.url).toBe(expectedUrl);
    expect(config.elasticsearch.maxRetries).toBe(3);
    expect(config.elasticsearch.requestTimeout).toBe(30000);
    expect(config.elasticsearch.compression).toBe(true);
    
    // Logging level might be overridden by environment (LOG_LEVEL)
    const expectedLogLevel = Bun.env.LOG_LEVEL || "info";
    expect(config.logging.level).toBe(expectedLogLevel);
    expect(config.logging.format).toBe("json");
    expect(config.logging.includeMetadata).toBe(true);
    
    expect(config.security.allowDestructiveOperations).toBe(false);
    expect(config.security.allowSchemaModifications).toBe(false);
    expect(config.security.allowIndexManagement).toBe(false);
    expect(config.security.maxBulkOperations).toBe(1000);
    
    // LangSmith tracing might be overridden by environment (LANGSMITH_TRACING)
    const expectedTracing = Bun.env.LANGSMITH_TRACING?.toLowerCase() === "true" || false;
    expect(config.langsmith.tracing).toBe(expectedTracing);
    expect(config.langsmith.endpoint).toBe("https://api.smith.langchain.com");
    expect(config.langsmith.project).toBe("elasticsearch-mcp-server");
  });

  test("should validate configuration system integrity", () => {
    const config = getConfig();
    
    // Test that the configuration system produces consistent results
    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
    
    // All major sections should exist
    expect(config).toHaveProperty('server');
    expect(config).toHaveProperty('elasticsearch');  
    expect(config).toHaveProperty('logging');
    expect(config).toHaveProperty('security');
    expect(config).toHaveProperty('langsmith');
    
    // All configuration values should be defined (not undefined)
    expect(config.server.name).toBeDefined();
    expect(config.server.port).toBeDefined();
    expect(config.elasticsearch.url).toBeDefined();
    expect(config.logging.level).toBeDefined();
    expect(config.langsmith.tracing).toBeDefined();
  });

  test("should maintain configuration validation rules", () => {
    const config = getConfig();
    
    // Test that current configuration values are within valid ranges
    expect(config.server.maxQueryTimeout).toBeGreaterThan(0);
    expect(config.server.maxQueryTimeout).toBeLessThanOrEqual(300000);
    
    expect(config.server.maxResultsPerQuery).toBeGreaterThan(0);
    expect(config.server.maxResultsPerQuery).toBeLessThanOrEqual(10000);
    
    expect(config.server.port).toBeGreaterThan(0);
    expect(config.server.port).toBeLessThanOrEqual(65535);
    
    // Validate string fields are not empty
    expect(config.server.name).toBeTruthy();
    expect(config.server.version).toBeTruthy();
    expect(config.elasticsearch.url).toBeTruthy();
  });

  test("should have proper TypeScript types after refactoring", () => {
    const config = getConfig();
    
    // Test that TypeScript compiler would catch type issues
    // These should all pass TypeScript checking
    const serverName: string = config.server.name;
    const serverPort: number = config.server.port;
    const readOnlyMode: boolean = config.server.readOnlyMode;
    const maxResponseSize: number = config.server.maxResponseSizeBytes;
    const defaultPageSize: number = config.server.defaultPageSize;
    const tracingEnabled: boolean = config.langsmith.tracing;
    
    // Verify the assignments worked (they're not undefined)
    expect(serverName).toBeDefined();
    expect(serverPort).toBeDefined();
    expect(readOnlyMode).toBeDefined();
    expect(maxResponseSize).toBeDefined();
    expect(defaultPageSize).toBeDefined();
    expect(tracingEnabled).toBeDefined();
  });
});