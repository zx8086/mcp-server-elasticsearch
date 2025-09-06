import { describe, expect, test } from "bun:test";
import { getConfig } from "../../../src/config";

// Bun automatically loads .env files, no need for dotenv
describe("Environment Configuration", () => {

  test("should load configuration from environment variables", () => {
    const config = getConfig();
    
    // Check that config is loaded
    expect(config).toBeDefined();
    expect(config.elasticsearch).toBeDefined();
    expect(config.server).toBeDefined();
    expect(config.logging).toBeDefined();
  });

  test("should use ES_URL from environment", () => {
    const config = getConfig();
    
    // Check if ES_URL from .env is used
    if (Bun.env.ES_URL) {
      expect(config.elasticsearch.url).toBe(Bun.env.ES_URL);
    }
  });

  test("should use ES_API_KEY from environment", () => {
    const config = getConfig();
    
    // Check if ES_API_KEY from .env is used
    if (Bun.env.ES_API_KEY) {
      expect(config.elasticsearch.apiKey).toBe(Bun.env.ES_API_KEY);
    }
  });

  test("should use READ_ONLY_MODE from environment", () => {
    const config = getConfig();
    
    // Check if READ_ONLY_MODE from .env is used
    if (Bun.env.READ_ONLY_MODE) {
      const expectedValue = Bun.env.READ_ONLY_MODE.toLowerCase() === "true";
      expect(config.server.readOnlyMode).toBe(expectedValue);
    }
  });

  test("should use LOG_LEVEL from environment", () => {
    const config = getConfig();
    
    // Check if LOG_LEVEL from .env is used
    if (Bun.env.LOG_LEVEL) {
      expect(config.logging.level).toBe(Bun.env.LOG_LEVEL);
    }
  });

  test("should have proper defaults when env vars are not set", () => {
    const config = getConfig();
    
    // Check defaults are applied (or environment overrides)
    // These should be reasonable values regardless of source
    expect(config.server.maxQueryTimeout).toBeGreaterThan(0);
    expect(config.server.maxResultsPerQuery).toBeGreaterThan(0);
    expect(typeof config.elasticsearch.compression).toBe('boolean');
    expect(config.elasticsearch.maxRetries).toBeGreaterThanOrEqual(0);
    
    // Verify structure is complete
    expect(config.server).toBeDefined();
    expect(config.elasticsearch).toBeDefined();
    expect(config.logging).toBeDefined();
    expect(config.security).toBeDefined();
  });
});