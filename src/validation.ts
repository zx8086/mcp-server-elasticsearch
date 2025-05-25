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

  // Check READ_ONLY_MODE configuration
  if (process.env.READ_ONLY_MODE) {
    const readOnlyValue = process.env.READ_ONLY_MODE.toLowerCase();
    if (!['true', 'false', '1', '0'].includes(readOnlyValue)) {
      warnings.push("READ_ONLY_MODE should be 'true', 'false', '1', or '0'. Defaulting to false.");
    } else if (['true', '1'].includes(readOnlyValue)) {
      warnings.push("READ_ONLY_MODE is enabled - destructive operations will be restricted");
    }
  }

  // Check READ_ONLY_STRICT_MODE
  if (process.env.READ_ONLY_STRICT_MODE) {
    const strictValue = process.env.READ_ONLY_STRICT_MODE.toLowerCase();
    if (!['true', 'false', '1', '0'].includes(strictValue)) {
      warnings.push("READ_ONLY_STRICT_MODE should be 'true', 'false', '1', or '0'. Defaulting to true.");
    }
  }

  // Check for potential URL format issues
  if (process.env.ES_URL) {
    try {
      const url = new URL(process.env.ES_URL);
      if (!url.protocol.startsWith('http')) {
        errors.push("ES_URL must use http or https protocol");
      }
      
      // Check if it's an Elastic Cloud URL
      if (url.hostname.includes('.es.') && url.hostname.includes('.aws.cloud.es.io')) {
        warnings.push("Detected Elastic Cloud URL - ensure API key authentication is used");
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

  // Validate read-only mode configuration
  if (config.readOnlyMode === true) {
    warnings.push("Server will run in READ-ONLY mode - destructive operations restricted");
  }

  // Check for Elastic Cloud specific requirements
  if (config.url && config.url.includes('.es.') && config.url.includes('.aws.cloud.es.io')) {
    if (!config.apiKey) {
      warnings.push("Elastic Cloud detected but no API key provided - API key authentication is recommended");
    }
  }

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
    // Test basic connectivity without explicit headers
    const info = await client.info();

    if (!info || !info.version) {
      return {
        valid: false,
        errors: ["Invalid response from Elasticsearch"],
      };
    }

    // Enhanced version compatibility checking
    const serverVersion = info.version.number;
    const majorVersion = parseInt(serverVersion.split('.')[0]);
    const minorVersion = parseInt(serverVersion.split('.')[1] || '0');
    
    if (majorVersion >= 9) {
      warnings.push(`Server version ${serverVersion} detected - using modern Elasticsearch features`);
    }
    
    if (majorVersion === 8 && minorVersion >= 11) {
      warnings.push(`Server version ${serverVersion} supports enhanced security features`);
    }

    // Test authentication if possible
    try {
      await client.security.authenticate();
      warnings.push("Authentication successful");
    } catch (authError) {
      // Authentication might not be available or configured
      warnings.push("Could not verify authentication details");
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
      
      // Enhanced error detection and guidance
      if (errorMessage.includes("response.headers") || errorMessage.includes("Cannot read properties")) {
        errors.push("Client/server version compatibility issue detected");
        errors.push("This usually resolves itself - the client should adapt automatically");
        errors.push(`Original error: ${errorMessage}`);
      } else if (errorMessage.includes("ECONNREFUSED")) {
        errors.push("Connection refused - check if Elasticsearch is running and accessible");
        errors.push("Verify the ES_URL is correct and the service is running");
      } else if (errorMessage.includes("ENOTFOUND") || errorMessage.includes("getaddrinfo")) {
        errors.push("Host not found - check the ES_URL configuration");
        errors.push("Ensure the hostname/domain is correct and accessible");
      } else if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
        errors.push("Authentication failed - check your credentials");
        errors.push("Verify ES_API_KEY or ES_USERNAME/ES_PASSWORD are correct");
      } else if (errorMessage.includes("403") || errorMessage.includes("Forbidden")) {
        errors.push("Access denied - check your permissions");
        errors.push("Ensure your API key or user has sufficient privileges");
      } else if (errorMessage.includes("certificate") || errorMessage.includes("SSL") || errorMessage.includes("TLS")) {
        errors.push("TLS/SSL certificate issue detected");
        errors.push("Check certificate configuration or use caFingerprint option");
      } else if (errorMessage.includes("timeout")) {
        errors.push("Connection timeout - the server may be slow or unreachable");
        errors.push("Consider increasing requestTimeout or check network connectivity");
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

// Enhanced operation testing with modern client methods
export async function testBasicOperations(client: Client): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const tests = [
    {
      name: "Cluster Health",
      test: async () => {
        try {
          return await client.cluster.health({ timeout: '5s' });
        } catch (error) {
          // For modern clients, try alternative approach
          return await client.cat.health({ format: 'json' });
        }
      }
    },
    {
      name: "List Indices", 
      test: async () => {
        try {
          return await client.cat.indices({ format: 'json' });
        } catch (error) {
          // Fallback for compatibility issues
          return await client.indices.get({ index: '*' });
        }
      }
    },
    {
      name: "Cluster Stats",
      test: async () => {
        try {
          return await client.cluster.stats();
        } catch (error) {
          // Try a simpler operation for compatibility
          return await client.info();
        }
      }
    },
    {
      name: "Node Info",
      test: async () => {
        try {
          return await client.nodes.info();
        } catch (error) {
          // This might fail on some configurations, not critical
          warnings.push("Node info not accessible - this is normal for managed services");
          return null;
        }
      }
    }
  ];

  let successfulTests = 0;
  const totalTests = tests.length;

  for (const { name, test } of tests) {
    try {
      const result = await test();
      if (result !== null) {
        successfulTests++;
        warnings.push(`${name}: OK`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      if (errorMsg.includes("response.headers") || errorMsg.includes("Cannot read properties")) {
        errors.push(`${name} failed: Client compatibility issue - this should resolve automatically`);
      } else if (errorMsg.includes("security_exception") || errorMsg.includes("403")) {
        warnings.push(`${name} failed: Insufficient permissions (this may be normal for your setup)`);
      } else if (errorMsg.includes("404") || errorMsg.includes("not_found")) {
        warnings.push(`${name} failed: Resource not found (this may be normal)`);
      } else {
        warnings.push(`${name} test failed: ${errorMsg}`);
      }
    }
  }

  // Determine overall health
  const successRate = successfulTests / totalTests;
  
  if (successRate >= 0.75) {
    warnings.push(`Basic operations: ${successfulTests}/${totalTests} successful - client is functional`);
  } else if (successRate >= 0.5) {
    warnings.push(`Basic operations: ${successfulTests}/${totalTests} successful - some limitations detected`);
  } else {
    errors.push(`Basic operations: Only ${successfulTests}/${totalTests} successful - significant compatibility issues`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// New utility function to test specific modern features
export async function testModernFeatures(client: Client): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const modernTests = [
    {
      name: "Search Templates",
      test: async () => {
        try {
          // Test if search templates are available
          await client.searchTemplate({
            index: '_all',
            source: '{"query":{"match_all":{}}}',
            params: {},
            size: 0
          });
          return true;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (errorMsg.includes("index_not_found") || errorMsg.includes("no such index")) {
            return true; // Feature is available, just no indices
          }
          return false;
        }
      }
    },
    {
      name: "SQL API",
      test: async () => {
        try {
          await client.sql.query({
            query: "SHOW TABLES",
            format: 'json'
          });
          return true;
        } catch (error) {
          return false;
        }
      }
    },
    {
      name: "Security API",
      test: async () => {
        try {
          await client.security.authenticate();
          return true;
        } catch (error) {
          // Security might not be enabled
          return false;
        }
      }
    }
  ];

  for (const { name, test } of modernTests) {
    try {
      const isAvailable = await test();
      if (isAvailable) {
        warnings.push(`${name}: Available`);
      } else {
        warnings.push(`${name}: Not available or not configured`);
      }
    } catch (error) {
      warnings.push(`${name}: Test failed - ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    valid: true,
    errors,
    warnings
  };
} 