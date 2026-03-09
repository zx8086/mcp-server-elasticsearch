#!/usr/bin/env bun

/**
 * Configuration Validator Script
 *
 * This script validates your environment configuration and shows the resolved
 * configuration values without starting the server.
 *
 * Usage:
 *   bun run scripts/validate-config.ts
 *   bun run scripts/validate-config.ts --show-all
 *   bun run scripts/validate-config.ts --check-connection
 */

import { Client } from "@elastic/elasticsearch";
import { config, getConfigDocumentation, validateEnvironment } from "../src/config.js";
import { checkElasticsearchConnection } from "../src/validation.js";

interface ValidationOptions {
  showAll: boolean;
  checkConnection: boolean;
  showDocs: boolean;
}

function parseArgs(): ValidationOptions {
  const args = process.argv.slice(2);
  return {
    showAll: args.includes("--show-all"),
    checkConnection: args.includes("--check-connection"),
    showDocs: args.includes("--docs"),
  };
}

function formatValue(value: any): string {
  if (typeof value === "string" && (value.includes("password") || value.includes("key"))) {
    return "[REDACTED]";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return `${value}`;
  }
  if (typeof value === "string") {
    return `"${value}"`;
  }
  return JSON.stringify(value);
}

function printSection(title: string, data: Record<string, any>, showSensitive = false) {
  console.log(`\n${title}`);
  console.log("=".repeat(50));

  for (const [key, value] of Object.entries(data)) {
    if (!showSensitive && (key.toLowerCase().includes("password") || key.toLowerCase().includes("key"))) {
      console.log(`  ${key}: [REDACTED]`);
    } else {
      console.log(`  ${key}: ${formatValue(value)}`);
    }
  }
}

async function validateConnection() {
  console.log("\nTesting Elasticsearch Connection");
  console.log("=".repeat(50));

  try {
    const client = new Client({
      node: config.elasticsearch.url,
      auth: config.elasticsearch.apiKey
        ? { apiKey: config.elasticsearch.apiKey }
        : config.elasticsearch.username && config.elasticsearch.password
          ? { username: config.elasticsearch.username, password: config.elasticsearch.password }
          : undefined,
      maxRetries: 1,
      requestTimeout: 10000,
    });

    console.log("  Creating client... done");

    const result = await checkElasticsearchConnection(client);

    if (result.valid) {
      console.log("  Connection test: [PASS] SUCCESS");
      if (result.warnings && result.warnings.length > 0) {
        console.log("  Warnings:");
        for (const warning of result.warnings) {
          console.log(`    [WARN] ${warning}`);
        }
      }
    } else {
      console.log("  Connection test: [FAIL] FAILED");
      for (const error of result.errors) {
        console.log(`    [FAIL] ${error}`);
      }
    }
  } catch (error) {
    console.log(`  Connection test: [FAIL] ERROR - ${error instanceof Error ? error.message : String(error)}`);
  }
}

function showEnvironmentVariables() {
  console.log("\nAvailable Environment Variables");
  console.log("=".repeat(50));

  const docs = getConfigDocumentation();
  const envVars = docs.environmentVariables;

  console.log("\nServer Variables:");
  for (const [_key, envVar] of Object.entries(envVars.server)) {
    const value = process.env[envVar as string];
    console.log(`  ${envVar}: ${value ? "SET" : "NOT SET"}`);
  }

  console.log("\nElasticsearch Variables:");
  for (const [key, envVar] of Object.entries(envVars.elasticsearch)) {
    const value = process.env[envVar as string];
    const status = value ? "SET" : "NOT SET";
    if (key === "apiKey" || key === "username" || key === "password") {
      console.log(`  ${envVar}: ${value ? "SET (hidden)" : "NOT SET"}`);
    } else {
      console.log(`  ${envVar}: ${status}`);
    }
  }

  console.log("\nLogging Variables:");
  for (const [_key, envVar] of Object.entries(envVars.logging)) {
    const value = process.env[envVar as string];
    console.log(`  ${envVar}: ${value ? "SET" : "NOT SET"}`);
  }

  console.log("\nSecurity Variables:");
  for (const [_key, envVar] of Object.entries(envVars.security)) {
    const value = process.env[envVar as string];
    console.log(`  ${envVar}: ${value ? "SET" : "NOT SET"}`);
  }
}

async function main() {
  const options = parseArgs();

  console.log("Elasticsearch MCP Server - Configuration Validator");
  console.log("=".repeat(60));

  // Validate environment variables
  console.log("\nEnvironment Validation");
  console.log("=".repeat(50));

  const envValidation = validateEnvironment();

  if (envValidation.valid) {
    console.log("  Status: [PASS] VALID");
  } else {
    console.log("  Status: [FAIL] INVALID");
    console.log("  Errors:");
    for (const error of envValidation.errors) {
      console.log(`    [FAIL] ${error}`);
    }
  }

  if (envValidation.warnings && envValidation.warnings.length > 0) {
    console.log("  Warnings:");
    for (const warning of envValidation.warnings) {
      console.log(`    [WARN] ${warning}`);
    }
  }

  if (!envValidation.valid) {
    console.log("\n[FAIL] Cannot proceed with invalid configuration. Please fix the errors above.");
    process.exit(1);
  }

  // Show resolved configuration
  printSection("Server Configuration", config.server, options.showAll);
  printSection("Elasticsearch Configuration", {
    url: config.elasticsearch.url,
    hasApiKey: !!config.elasticsearch.apiKey,
    hasUsername: !!config.elasticsearch.username,
    hasPassword: !!config.elasticsearch.password,
    hasCaCert: !!config.elasticsearch.caCert,
    maxRetries: config.elasticsearch.maxRetries,
    requestTimeout: config.elasticsearch.requestTimeout,
    compression: config.elasticsearch.compression,
    enableMetaHeader: config.elasticsearch.enableMetaHeader,
    disablePrototypePoisoningProtection: config.elasticsearch.disablePrototypePoisoningProtection,
  });
  printSection("Logging Configuration", config.logging);
  printSection("Security Configuration", config.security);

  // Show environment variables if requested
  if (options.showAll || options.showDocs) {
    showEnvironmentVariables();
  }

  // Test connection if requested
  if (options.checkConnection) {
    await validateConnection();
  }

  // Summary
  console.log("\nConfiguration Summary");
  console.log("=".repeat(50));
  console.log(`  Server Name: ${config.server.name}`);
  console.log(`  Server Version: ${config.server.version}`);
  console.log(`  Elasticsearch URL: ${config.elasticsearch.url}`);
  console.log(
    `  Authentication: ${config.elasticsearch.apiKey ? "API Key" : config.elasticsearch.username ? "Username/Password" : "None"}`,
  );
  console.log(`  Read-Only Mode: ${config.server.readOnlyMode ? "ENABLED" : "DISABLED"}`);
  console.log(`  Strict Mode: ${config.server.readOnlyStrictMode ? "BLOCK" : "WARN"}`);
  console.log(`  Log Level: ${config.logging.level.toUpperCase()}`);
  console.log(`  Transport: ${config.server.transportMode.toUpperCase()}`);

  console.log("\nConfiguration validation completed!");

  if (!options.checkConnection) {
    console.log("\nTip: Use --check-connection to test Elasticsearch connectivity");
  }

  if (!options.showAll) {
    console.log("Tip: Use --show-all to see all configuration details");
  }
}

// Run the validator
main().catch((error) => {
  console.error("\nConfiguration validation failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
