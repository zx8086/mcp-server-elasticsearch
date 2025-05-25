/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from "@elastic/elasticsearch";

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateEnvironment(): ValidationResult {
  const requiredVars = ["ES_URL"];
  const errors: string[] = [];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateConfig(config: any): ValidationResult {
  const errors: string[] = [];

  if (!config.url) {
    errors.push("ES_URL is required");
  }

  if (!config.apiKey && (!config.username || !config.password)) {
    errors.push("Either ES_API_KEY or both ES_USERNAME and ES_PASSWORD must be provided");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export async function checkElasticsearchConnection(client: Client): Promise<ValidationResult> {
  try {
    const info = await client.info();
    if (!info || !info.version) {
      return {
        valid: false,
        errors: ["Invalid response from Elasticsearch"],
      };
    }

    return {
      valid: true,
      errors: [],
    };
  } catch (error) {
    return {
      valid: false,
      errors: [
        `Failed to connect to Elasticsearch: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
    };
  }
}