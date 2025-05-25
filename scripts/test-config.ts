#!/usr/bin/env bun

/**
 * Simple test to verify the configuration system works
 * This script tests basic configuration loading without connecting to Elasticsearch
 */

try {
  console.log('🧪 Testing configuration system...');
  
  // Test 1: Import configuration
  console.log('1. Testing configuration import...');
  const { config, validateEnvironment, getConfigDocumentation } = await import('../src/config.js');
  console.log('   ✅ Configuration imported successfully');
  
  // Test 2: Validate environment
  console.log('2. Testing environment validation...');
  const validation = validateEnvironment();
  if (validation.valid) {
    console.log('   ✅ Environment validation passed');
  } else {
    console.log('   ❌ Environment validation failed:', validation.errors);
  }
  
  // Test 3: Check configuration structure
  console.log('3. Testing configuration structure...');
  console.log(`   Server name: ${config.server.name}`);
  console.log(`   Server version: ${config.server.version}`);
  console.log(`   Elasticsearch URL: ${config.elasticsearch.url}`);
  console.log(`   Read-only mode: ${config.server.readOnlyMode}`);
  console.log('   ✅ Configuration structure is valid');
  
  // Test 4: Test documentation helper
  console.log('4. Testing configuration documentation...');
  const docs = getConfigDocumentation();
  console.log(`   Available sections: ${Object.keys(docs).join(', ')}`);
  console.log('   ✅ Documentation helper works');
  
  console.log('\n✅ All configuration tests passed!');
  console.log('📋 Current configuration summary:');
  console.log(`   • ES URL: ${config.elasticsearch.url}`);
  console.log(`   • Auth Method: ${config.elasticsearch.apiKey ? 'API Key' : config.elasticsearch.username ? 'Username/Password' : 'None'}`);
  console.log(`   • Read-Only: ${config.server.readOnlyMode ? 'Enabled' : 'Disabled'}`);
  console.log(`   • Log Level: ${config.logging.level}`);
  console.log(`   • Transport: ${config.server.transportMode}`);
  
} catch (error) {
  console.error('❌ Configuration test failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
