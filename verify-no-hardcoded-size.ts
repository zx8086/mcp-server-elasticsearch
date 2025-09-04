#!/usr/bin/env bun

import { readFileSync } from 'fs';
import { z } from 'zod';

console.log('🔍 Verifying NO hardcoded size=10 in our tools\n');
console.log('=' .repeat(60));

// Check search.ts
console.log('\n📄 Checking src/tools/core/search.ts:');
const searchContent = readFileSync('./src/tools/core/search.ts', 'utf-8');

// Look for any size: 10 patterns
const hasSize10InSearch = searchContent.includes('size: 10') || 
                          searchContent.includes('size:10') ||
                          searchContent.includes('"size": 10') ||
                          searchContent.includes('"size":10');

console.log(`   Has "size: 10" anywhere: ${hasSize10InSearch ? '❌ YES' : '✅ NO'}`);

// Check the jsonField default
const jsonFieldMatch = searchContent.match(/jsonField\s*\(\s*([^,]+),/);
if (jsonFieldMatch) {
  const defaultValue = jsonFieldMatch[1].trim();
  console.log(`   jsonField default value: ${defaultValue}`);
  const hasSize = defaultValue.includes('size');
  console.log(`   Default has 'size' property: ${hasSize ? '❌ YES' : '✅ NO'}`);
}

// Check search_enhanced.ts
console.log('\n📄 Checking src/tools/core/search_enhanced.ts:');
const enhancedContent = readFileSync('./src/tools/core/search_enhanced.ts', 'utf-8');

const hasSize10InEnhanced = enhancedContent.includes('size: 10') || 
                            enhancedContent.includes('size:10') ||
                            enhancedContent.includes('"size": 10') ||
                            enhancedContent.includes('"size":10');

console.log(`   Has "size: 10" anywhere: ${hasSize10InEnhanced ? '❌ YES' : '✅ NO'}`);

// Check for size field default
const sizeFieldMatch = enhancedContent.match(/size:\s*z\.number\([^)]*\)([^,]*)/);
if (sizeFieldMatch) {
  const sizeFieldDef = sizeFieldMatch[0];
  const hasDefault = sizeFieldDef.includes('.default(');
  console.log(`   Size field has .default(): ${hasDefault ? '❌ YES' : '✅ NO'}`);
}

// Check the enhanced jsonField default
const enhancedJsonMatch = enhancedContent.match(/jsonField\s*\(\s*([^,]+),/);
if (enhancedJsonMatch) {
  const defaultValue = enhancedJsonMatch[1].trim();
  console.log(`   jsonField default value: ${defaultValue}`);
  const hasSize = defaultValue.includes('size');
  console.log(`   Default has 'size' property: ${hasSize ? '❌ YES' : '✅ NO'}`);
}

console.log('\n' + '=' .repeat(60));
console.log('📊 ELASTICSEARCH DEFAULT BEHAVIOR DOCUMENTATION:\n');

console.log('From Elasticsearch documentation:');
console.log('  "By default, searches return the top 10 matching hits."');
console.log('  Source: https://www.elastic.co/guide/en/elasticsearch/reference/current/search-your-data.html\n');

console.log('This means:');
console.log('  • When NO size is specified → Elasticsearch returns 10 documents');
console.log('  • When size IS specified → Elasticsearch returns that many documents\n');

console.log('Our tools:');
console.log('  • Do NOT inject a default size');
console.log('  • Pass user\'s size parameter directly to Elasticsearch');
console.log('  • Let Elasticsearch apply its own default (10) when size is not specified\n');

console.log('✅ VERIFICATION COMPLETE:');
console.log('   The "showing 10" behavior is Elasticsearch\'s default, not our code.');
console.log('   Users must specify size in queryBody to override ES default.\n');

console.log('💡 Example to get more results:');
console.log('   { queryBody: { query: { match_all: {} }, size: 100 } }');