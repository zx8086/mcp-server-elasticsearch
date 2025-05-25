#!/usr/bin/env bun

/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from '@elastic/elasticsearch';

async function testConnection() {
  const url = process.env.ES_URL;
  const apiKey = process.env.ES_API_KEY;

  if (!url || !apiKey) {
    console.error("Please set ES_URL and ES_API_KEY environment variables");
    process.exit(1);
  }

  console.log("Testing connection to:", url);

  const client = new Client({
    node: url,
    auth: {
      apiKey
    },
    compression: true,
    maxRetries: 3,
    requestTimeout: 30000,
    context: {
      userAgent: 'elasticsearch-js/8.10.0 (bun 1.2.14)'
    }
  });

  try {
    // Test 1: Basic info
    console.log("\nTest 1: Info");
    const info = await client.info();
    console.log("✓ Connection successful");

    // Test 2: Version Info
    console.log("\nTest 2: Version Info");
    console.log("✓ Connected to Elasticsearch version:", info.version.number);
    console.log("✓ Cluster name:", info.cluster_name);

    // Test 3: Authentication
    console.log("\nTest 3: Authentication");
    const auth = await client.security.authenticate();
    console.log("✓ Authenticated as:", auth.username);

    // Test 4: List indices
    console.log("\nTest 4: List Indices");
    const indices = await client.cat.indices({ format: 'json' });
    console.log("✓ Found", indices.length, "indices");

    console.log("\n✅ All tests passed successfully!");
  } catch (error) {
    console.error("\n❌ Connection test failed:");
    if (error.name === 'ResponseError') {
      console.error(`Error (${error.statusCode}):`, error.message);
    } else if (error.name === 'ConnectionError') {
      console.error("Connection refused or timed out");
    } else if (error.name === 'TimeoutError') {
      console.error("Connection timed out while trying to reach Elasticsearch");
    } else {
      console.error(error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        console.error("\nStack trace:", error.stack);
      }
    }
    process.exit(1);
  }
}

testConnection().catch((error) => {
  console.error("\nConnection test failed:", error);
  process.exit(1);
});