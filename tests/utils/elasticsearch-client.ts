import { readFileSync } from "node:fs";
import { Client, type ClientOptions } from "@elastic/elasticsearch";
import { HttpConnection } from "@elastic/transport";
import { getConfig } from "../../src/config.js";

// Bun automatically loads .env files, no need for dotenv

/**
 * Creates an Elasticsearch client using the EXACT same configuration as the main application
 * This ensures tests use the identical connection settings to avoid connection issues
 */
export function createElasticsearchClient(): Client {
  const config = getConfig();

  // Build client options exactly like the real server does (src/server.ts lines 53-104)
  const clientOptions: ClientOptions = {
    node: config.elasticsearch.url,
    auth: config.elasticsearch.apiKey
      ? { apiKey: config.elasticsearch.apiKey }
      : config.elasticsearch.username && config.elasticsearch.password
        ? { username: config.elasticsearch.username, password: config.elasticsearch.password }
        : undefined,

    // Use HttpConnection for better compatibility (CRITICAL - fixes response.headers issues)
    Connection: HttpConnection,

    // Apply configuration from config
    compression: config.elasticsearch.compression,
    maxRetries: config.elasticsearch.maxRetries,
    requestTimeout: config.elasticsearch.requestTimeout,

    // Client identification and observability
    name: config.server.name,
    opaqueIdPrefix: `${config.server.name}-test::`,

    // Headers for better compatibility (CRITICAL - prevents header issues)
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Accept-Encoding": "gzip, deflate",
    },

    // User agent with version info
    context: {
      userAgent: `${config.server.name}/${config.server.version} (bun-test)`,
    },

    // Enhanced error handling and redaction
    redaction: {
      type: "replace",
      additionalKeys: ["authorization", "x-elastic-client-meta"],
    },

    // Use configuration for meta header
    enableMetaHeader: config.elasticsearch.enableMetaHeader,

    // Use configuration for prototype poisoning protection
    disablePrototypePoisoningProtection: config.elasticsearch.disablePrototypePoisoningProtection,

    // Add TLS configuration if CA cert is provided
    ...(config.elasticsearch.caCert && {
      tls: {
        ca: readFileSync(config.elasticsearch.caCert),
        rejectUnauthorized: true,
      },
    }),
  };

  return new Client(clientOptions);
}

/**
 * Safely closes an Elasticsearch client, handling pool.close errors gracefully
 * This prevents test failures due to connection cleanup issues
 */
export async function safeCloseElasticsearchClient(client: Client): Promise<void> {
  try {
    await client.close();
  } catch (error: any) {
    // Only log unexpected errors - silently handle known pool.close issues
    const errorMessage = error?.message || error?.toString() || "";
    
    // Silent handling for known @elastic/transport pool.close issues
    if (errorMessage.includes("pool.close is not a function") || 
        errorMessage.includes("this.pool.close")) {
      // This is a known non-critical issue with @elastic/transport - suppress completely
      return;
    }
    
    // Log other unexpected close errors for debugging
    console.debug("Client close error (non-critical):", error);
  }
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
 * Uses the exact same client configuration as the real server
 */
export async function testElasticsearchConnection(): Promise<boolean> {
  try {
    const client = createElasticsearchClient();
    
    // Use info() instead of ping() to match what the real server does
    await client.info();
    
    // Proper cleanup to avoid pool.close errors
    try {
      await client.close();
    } catch (closeError) {
      // Ignore close errors - they're not critical for connectivity tests
      console.debug("Client close error (non-critical):", closeError);
    }
    
    return true;
  } catch (error) {
    return false;
  }
}