/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from "@elastic/elasticsearch";

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export function validateEnvironment(): ValidationResult {
  const requiredVars = ["ES_URL"];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  // Check for potential URL format issues
  if (process.env.ES_URL) {
    try {
      const url = new URL(process.env.ES_URL);
      if (!url.protocol.startsWith('http')) {
        errors.push("ES_URL must use http or https protocol");
      }
    } catch (e) {
      errors.push("ES_URL is not a valid URL format");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateConfig(config: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.url) {
    errors.push("ES_URL is required");
  }

  if (!config.apiKey && (!config.username || !config.password)) {
    errors.push("Either ES_API_KEY or both ES_USERNAME and ES_PASSWORD must be provided");
  }

  // Add version compatibility warning
  warnings.push("Ensure Elasticsearch client version is compatible with server version");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export async function checkElasticsearchConnection(client: Client): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Test basic connectivity first
    const info = await client.info({
      // Add explicit request options to handle potential compatibility issues
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    if (!info || !info.version) {
      return {
        valid: false,
        errors: ["Invalid response from Elasticsearch"],
      };
    }

    // Check version compatibility
    const serverVersion = info.version.number;
    const majorVersion = parseInt(serverVersion.split('.')[0]);
    
    if (majorVersion >= 9) {
      warnings.push(`Server version ${serverVersion} detected. Ensure client compatibility.`);
    }

    // Test a simple operation to verify full functionality
    try {
      await client.cat.health({ format: 'json' });
    } catch (catError) {
      warnings.push("Basic operations may not work properly - check client/server compatibility");
    }

    return {
      valid: true,
      errors: [],
      warnings,
    };
  } catch (error) {
    let errorMessage = "Unknown error occurred";
    
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Provide specific guidance for common errors
      if (errorMessage.includes("response.headers")) {
        errors.push("Client/server version compatibility issue detected");
        errors.push("Consider updating the Elasticsearch JavaScript client");
        errors.push(`Original error: ${errorMessage}`);
      } else if (errorMessage.includes("ECONNREFUSED")) {
        errors.push("Connection refused - check if Elasticsearch is running and accessible");
      } else if (errorMessage.includes("ENOTFOUND")) {
        errors.push("Host not found - check the ES_URL configuration");
      } else if (errorMessage.includes("401")) {
        errors.push("Authentication failed - check your credentials");
      } else if (errorMessage.includes("403")) {
        errors.push("Access denied - check your permissions");
      } else {
        errors.push(`Failed to connect to Elasticsearch: ${errorMessage}`);
      }
    } else {
      errors.push(`Failed to connect to Elasticsearch: ${String(error)}`);
    }

    return {
      valid: false,
      errors,
      warnings,
    };
  }
}

// Additional utility function to test specific operations
export async function testBasicOperations(client: Client): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const tests = [
    {
      name: "Cluster Health",
      test: () => client.cat.health({ format: 'json' })
    },
    {
      name: "List Indices", 
      test: () => client.cat.indices({ format: 'json' })
    },
    {
      name: "Cluster Stats",
      test: () => client.cluster.stats()
    }
  ];

  for (const { name, test } of tests) {
    try {
      await test();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes("response.headers")) {
        errors.push(`${name} failed: Client compatibility issue`);
      } else {
        warnings.push(`${name} test failed: ${errorMsg}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
} 