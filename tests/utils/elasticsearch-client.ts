import { Client } from "@elastic/elasticsearch";
import { getConfig } from "../../src/config.js";

// Bun automatically loads .env files, no need for dotenv

/**
 * Creates an Elasticsearch client using the same configuration as the main application
 * This ensures tests use the exact same connection settings from .env
 */
export function createElasticsearchClient(): Client {
  const config = getConfig();

  const clientConfig: any = {
    node: config.elasticsearch.url,
    compression: config.elasticsearch.compression,
    maxRetries: config.elasticsearch.maxRetries,
    requestTimeout: config.elasticsearch.requestTimeout,
    disablePrototypePoisoningProtection: config.elasticsearch.disablePrototypePoisoningProtection,
    enableMetaHeader: config.elasticsearch.enableMetaHeader,
  };

  // Use the same authentication method as configured
  if (config.elasticsearch.apiKey) {
    clientConfig.auth = { apiKey: config.elasticsearch.apiKey };
  } else if (config.elasticsearch.username && config.elasticsearch.password) {
    clientConfig.auth = {
      username: config.elasticsearch.username,
      password: config.elasticsearch.password,
    };
  }

  // Add CA certificate if configured
  if (config.elasticsearch.caCert) {
    clientConfig.tls = {
      ca: config.elasticsearch.caCert,
      rejectUnauthorized: true,
    };
  }

  return new Client(clientConfig);
}

/**
 * Checks if integration tests should be skipped
 */
export function shouldSkipIntegrationTests(): boolean {
  const config = getConfig();
  
  // Skip if no Elasticsearch URL is configured
  if (!config.elasticsearch.url) {
    return true;
  }

  // Skip if explicitly disabled
  if (Bun.env.SKIP_INTEGRATION_TESTS === "true") {
    return true;
  }

  // Skip if URL is localhost but Elasticsearch is not running
  if (config.elasticsearch.url.includes("localhost") || config.elasticsearch.url.includes("127.0.0.1")) {
    // We'll check connectivity in the actual test
    return false;
  }

  return false;
}

/**
 * Test if Elasticsearch connection is available
 */
export async function testElasticsearchConnection(): Promise<boolean> {
  try {
    const client = createElasticsearchClient();
    await client.ping();
    await client.close();
    return true;
  } catch (error) {
    return false;
  }
}