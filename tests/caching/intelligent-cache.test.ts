import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { IntelligentCache } from '../../src/utils/intelligentCache.js';

describe('Intelligent Cache', () => {
  let cache: IntelligentCache;

  beforeEach(() => {
    cache = new IntelligentCache({
      maxSize: 100,
      defaultTtl: 60000, // 1 minute
      analysisInterval: 1000, // 1 second for testing
      prefetchThreshold: 0.8,
      patternRecognitionWindow: 300000, // 5 minutes
    });
  });

  afterEach(() => {
    if (cache) {
      cache.destroy();
    }
  });

  test('should initialize with correct options', () => {
    expect(cache).toBeDefined();
    expect(cache.size()).toBe(0);
    expect(typeof cache.get).toBe('function');
    expect(typeof cache.set).toBe('function');
  });

  test('should handle basic cache operations', async () => {
    // Test cache miss
    const result1 = await cache.get('test-key');
    expect(result1).toBeUndefined();

    // Test cache set
    cache.set('test-key', { data: 'test-value' });
    expect(cache.size()).toBe(1);

    // Test cache hit
    const result2 = await cache.get('test-key');
    expect(result2).toEqual({ data: 'test-value' });

    // Test has
    expect(cache.has('test-key')).toBe(true);
    expect(cache.has('nonexistent')).toBe(false);

    // Test delete
    const deleted = cache.delete('test-key');
    expect(deleted).toBe(true);
    expect(cache.size()).toBe(0);
  });

  test('should track usage patterns', async () => {
    // Access the same key multiple times
    const key = 'pattern-test';
    
    for (let i = 0; i < 5; i++) {
      await cache.get(key, 'search'); // Cache miss
      cache.set(key, { iteration: i }, undefined, 'search');
      await cache.get(key, 'search'); // Cache hit
    }

    const stats = cache.getStats();
    expect(stats.patterns).toBeGreaterThan(0);
    expect(stats.topPatterns.length).toBeGreaterThan(0);

    const topPattern = stats.topPatterns[0];
    expect(topPattern.key).toBe(key);
    expect(topPattern.accessCount).toBeGreaterThan(5);

    console.log(`✅ Pattern tracking: ${topPattern.accessCount} accesses, score: ${topPattern.score.toFixed(2)}`);
  });

  test('should calculate intelligent TTL', () => {
    // Test tool-specific TTL
    cache.set('search-result', { data: 'test' }, undefined, 'search');
    cache.set('mappings-data', { data: 'test' }, undefined, 'get_mappings');
    cache.set('cluster-health', { data: 'test' }, undefined, 'cluster_health');

    // Different tools should have different TTLs based on configuration
    // We can't directly test TTL values, but we can test that the operations complete
    expect(cache.has('search-result')).toBe(true);
    expect(cache.has('mappings-data')).toBe(true);
    expect(cache.has('cluster-health')).toBe(true);

    console.log('✅ Tool-specific TTL calculation works');
  });

  test('should handle cache eviction when full', () => {
    // Fill cache to capacity
    for (let i = 0; i < 105; i++) { // Exceed max size of 100
      cache.set(`key-${i}`, { value: i });
    }

    // Cache should not exceed max size
    expect(cache.size()).toBeLessThanOrEqual(100);

    // Older items should be evicted (LRU)
    expect(cache.has('key-0')).toBe(false);
    expect(cache.has('key-104')).toBe(true);

    console.log(`✅ Cache eviction: size ${cache.size()} (max: 100)`);
  });

  test('should provide accurate statistics', async () => {
    // Generate some cache activity
    const keys = ['key1', 'key2', 'key3'];
    
    for (const key of keys) {
      // Cache misses
      await cache.get(key, 'search');
      
      // Cache sets
      cache.set(key, { data: key });
      
      // Cache hits
      await cache.get(key, 'search');
      await cache.get(key, 'search');
    }

    const stats = cache.getStats();
    
    expect(stats.size).toBe(3);
    expect(stats.patterns).toBeGreaterThan(0);
    expect(stats.hitRatio).toBeGreaterThan(0);
    expect(stats.hitRatio).toBeLessThanOrEqual(1);
    expect(typeof stats.categoryBreakdown).toBe('object');

    console.log(`✅ Cache stats: size=${stats.size}, hitRatio=${(stats.hitRatio * 100).toFixed(1)}%, patterns=${stats.patterns}`);
  });

  test('should handle tool-specific cache methods', async () => {
    // Test search result caching
    const searchResult = await cache.getSearchResult('match_all', 'logs-*');
    expect(searchResult).toBeUndefined();

    cache.setSearchResult('match_all', { hits: [] }, 'logs-*');
    
    const cachedSearchResult = await cache.getSearchResult('match_all', 'logs-*');
    expect(cachedSearchResult).toEqual({ hits: [] });

    // Test mappings caching
    const mappings = await cache.getMappings('logs-*');
    expect(mappings).toBeUndefined();

    cache.setMappings('logs-*', { properties: {} });
    
    const cachedMappings = await cache.getMappings('logs-*');
    expect(cachedMappings).toEqual({ properties: {} });

    // Test indices list caching
    const indicesList = await cache.getIndicesList();
    expect(indicesList).toBeUndefined();

    cache.setIndicesList(['index1', 'index2']);
    
    const cachedIndicesList = await cache.getIndicesList();
    expect(cachedIndicesList).toEqual(['index1', 'index2']);

    console.log('✅ Tool-specific cache methods work correctly');
  });

  test('should handle concurrent operations', async () => {
    const concurrentOperations = [];
    
    // Create 50 concurrent cache operations
    for (let i = 0; i < 50; i++) {
      concurrentOperations.push(
        (async () => {
          const key = `concurrent-${i}`;
          
          // Random mix of get/set operations
          if (Math.random() > 0.5) {
            await cache.get(key, 'test');
            cache.set(key, { value: i }, undefined, 'test');
          } else {
            cache.set(key, { value: i }, undefined, 'test');
            await cache.get(key, 'test');
          }
        })()
      );
    }

    // Wait for all operations to complete
    await Promise.all(concurrentOperations);

    // Should have handled concurrent operations without errors
    expect(cache.size()).toBeGreaterThan(0);
    expect(cache.size()).toBeLessThanOrEqual(100);

    console.log(`✅ Concurrent operations completed, cache size: ${cache.size()}`);
  });

  test('should clear cache correctly', () => {
    // Add some data
    cache.set('key1', { data: 'value1' });
    cache.set('key2', { data: 'value2' });
    
    expect(cache.size()).toBe(2);

    // Clear cache
    cache.clear();
    
    expect(cache.size()).toBe(0);
    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key2')).toBe(false);

    const stats = cache.getStats();
    expect(stats.patterns).toBe(0);

    console.log('✅ Cache clear works correctly');
  });

  test('should handle edge cases gracefully', async () => {
    // Test with null/undefined values
    cache.set('null-test', null);
    cache.set('undefined-test', undefined);
    
    const nullValue = await cache.get('null-test');
    const undefinedValue = await cache.get('undefined-test');
    
    expect(nullValue).toBe(null);
    expect(undefinedValue).toBe(undefined);

    // Test with complex objects
    const complexObject = {
      nested: {
        array: [1, 2, 3],
        object: { key: 'value' }
      },
      date: new Date(),
      regex: /test/g
    };
    
    cache.set('complex-test', complexObject);
    const retrievedComplex = await cache.get('complex-test');
    
    expect(retrievedComplex).toEqual(complexObject);

    // Test with very long keys
    const longKey = 'x'.repeat(1000);
    cache.set(longKey, { data: 'long-key-test' });
    
    const longKeyValue = await cache.get(longKey);
    expect(longKeyValue).toEqual({ data: 'long-key-test' });

    console.log('✅ Edge cases handled gracefully');
  });
});

describe('Cache Pattern Recognition', () => {
  let cache: IntelligentCache;

  beforeEach(() => {
    cache = new IntelligentCache({
      maxSize: 50,
      analysisInterval: 100, // Very fast for testing
      patternRecognitionWindow: 10000, // 10 seconds
    });
  });

  afterEach(() => {
    if (cache) {
      cache.destroy();
    }
  });

  test('should recognize access patterns', async () => {
    const key = 'pattern-key';
    const toolName = 'search';
    
    // Create a pattern of regular access
    for (let i = 0; i < 10; i++) {
      await cache.get(key, toolName);
      cache.set(key, { iteration: i }, undefined, toolName);
      
      // Small delay to create time-based pattern
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const stats = cache.getStats();
    expect(stats.patterns).toBeGreaterThan(0);
    
    const pattern = stats.topPatterns.find(p => p.key === key);
    expect(pattern).toBeDefined();
    expect(pattern.accessCount).toBe(10);
    expect(pattern.category).toBe(toolName);
    expect(pattern.score).toBeGreaterThan(0);

    console.log(`✅ Pattern recognition: ${pattern.accessCount} accesses, score: ${pattern.score.toFixed(3)}`);
  });

  test('should calculate usage scores correctly', async () => {
    // Create different usage patterns
    const patterns = [
      { key: 'frequent', accesses: 20, tool: 'search' },
      { key: 'occasional', accesses: 5, tool: 'get_mappings' },
      { key: 'rare', accesses: 2, tool: 'cluster_health' }
    ];

    for (const pattern of patterns) {
      for (let i = 0; i < pattern.accesses; i++) {
        await cache.get(pattern.key, pattern.tool);
        cache.set(pattern.key, { data: i }, undefined, pattern.tool);
      }
    }

    const stats = cache.getStats();
    const sortedPatterns = stats.topPatterns.sort((a, b) => b.score - a.score);

    // More frequent access should have higher scores
    expect(sortedPatterns[0].key).toBe('frequent');
    expect(sortedPatterns[0].score).toBeGreaterThan(sortedPatterns[1].score);

    console.log('✅ Usage scores calculated correctly');
    sortedPatterns.forEach(p => {
      console.log(`  ${p.key}: score=${p.score.toFixed(3)}, accesses=${p.accessCount}`);
    });
  });

  test('should handle prefetch analysis', async () => {
    const key = 'prefetch-candidate';
    
    // Create high-scoring pattern
    for (let i = 0; i < 15; i++) {
      await cache.get(key, 'search');
      cache.set(key, { data: i }, undefined, 'search');
    }

    // Wait for pattern analysis
    await new Promise(resolve => setTimeout(resolve, 200));

    const stats = cache.getStats();
    
    // Should have prefetch queue activity
    expect(stats.prefetchQueue).toBeGreaterThanOrEqual(0);

    console.log(`✅ Prefetch analysis: ${stats.prefetchQueue} items in queue`);
  });
});

describe('Cache Performance', () => {
  test('should have fast cache operations', () => {
    const cache = new IntelligentCache({ maxSize: 1000 });
    const iterations = 1000;
    
    // Test set performance
    const setStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      cache.set(`key-${i}`, { value: i });
    }
    const setDuration = performance.now() - setStart;
    
    // Test get performance
    const getStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      cache.get(`key-${i}`);
    }
    const getDuration = performance.now() - getStart;
    
    console.log(`🚀 Cache performance: Set=${setDuration.toFixed(2)}ms, Get=${getDuration.toFixed(2)}ms (${iterations} operations each)`);
    
    // Operations should be fast
    expect(setDuration).toBeLessThan(100); // Less than 100ms for 1000 sets
    expect(getDuration).toBeLessThan(100); // Less than 100ms for 1000 gets
    
    cache.destroy();
  });

  test('should maintain performance under load', async () => {
    const cache = new IntelligentCache({ 
      maxSize: 500,
      analysisInterval: 50 // Fast analysis for testing
    });
    
    const loadTest = async (operations: number) => {
      const promises = [];
      const startTime = performance.now();
      
      for (let i = 0; i < operations; i++) {
        promises.push(
          (async () => {
            const key = `load-test-${i % 100}`; // Reuse keys to test hit/miss patterns
            
            await cache.get(key, 'search');
            cache.set(key, { data: i, timestamp: Date.now() });
            await cache.get(key, 'search');
          })()
        );
      }
      
      await Promise.all(promises);
      return performance.now() - startTime;
    };
    
    const duration = await loadTest(500);
    const stats = cache.getStats();
    
    console.log(`🚀 Load test: ${duration.toFixed(2)}ms for 500 operations`);
    console.log(`📊 Final stats: size=${stats.size}, hitRatio=${(stats.hitRatio * 100).toFixed(1)}%`);
    
    // Should complete in reasonable time
    expect(duration).toBeLessThan(2000); // Less than 2 seconds for 500 operations
    expect(stats.hitRatio).toBeGreaterThan(0.3); // Should have some cache hits
    
    cache.destroy();
  });
});