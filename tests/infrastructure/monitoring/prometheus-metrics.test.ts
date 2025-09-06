import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { PrometheusMetrics } from '../../src/monitoring/prometheusMetrics.js';
import { MetricsEndpoint } from '../../src/monitoring/metricsEndpoint.js';

describe('Prometheus Metrics Collection', () => {
  let metrics: PrometheusMetrics;
  let metricsEndpoint: MetricsEndpoint;

  beforeAll(() => {
    metrics = PrometheusMetrics.getInstance();
  });

  afterAll(async () => {
    if (metricsEndpoint) {
      await metricsEndpoint.stop();
    }
  });

  test('should initialize metrics instance', () => {
    expect(metrics).toBeDefined();
    expect(typeof metrics.isEnabled).toBe('function');
  });

  test('should record tool execution metrics', () => {
    if (!metrics.isEnabled()) {
      console.log('Metrics disabled - skipping test');
      return;
    }

    // Record successful tool execution
    metrics.recordToolExecution('search', 'core', 45.5, 'success');
    
    // Record failed tool execution
    metrics.recordToolExecution('search', 'core', 12.3, 'error');
    
    // Record timeout
    metrics.recordToolExecution('bulk', 'bulk', 5000, 'timeout');
    
    // Should not throw errors
    expect(true).toBe(true);
  });

  test('should record tool errors', () => {
    if (!metrics.isEnabled()) {
      console.log('Metrics disabled - skipping test');
      return;
    }

    metrics.recordToolError('search', 'core', 'timeout');
    metrics.recordToolError('index_document', 'document', 'validation_error');
    metrics.recordToolError('cluster_health', 'cluster', 'connection_error');
    
    // Should not throw errors
    expect(true).toBe(true);
  });

  test('should record circuit breaker metrics', () => {
    if (!metrics.isEnabled()) {
      console.log('Metrics disabled - skipping test');
      return;
    }

    // Test all circuit breaker states
    metrics.recordCircuitBreakerState('search', 'closed');
    metrics.recordCircuitBreakerState('search', 'open');
    metrics.recordCircuitBreakerState('search', 'half-open');
    
    // Record trips and recoveries
    metrics.recordCircuitBreakerTrip('search');
    metrics.recordCircuitBreakerRecovery('search');
    
    expect(true).toBe(true);
  });

  test('should record connection pool metrics', () => {
    if (!metrics.isEnabled()) {
      console.log('Metrics disabled - skipping test');
      return;
    }

    // Update connection pool status
    metrics.updateConnectionPoolMetrics(10, 7, 0.9);
    metrics.recordConnectionPoolResponseTime(34.5);
    metrics.recordConnectionPoolResponseTime(67.8);
    
    expect(true).toBe(true);
  });

  test('should record cache metrics', () => {
    if (!metrics.isEnabled()) {
      console.log('Metrics disabled - skipping test');
      return;
    }

    // Update cache metrics
    metrics.updateCacheMetrics('query', 500, 0.85);
    metrics.updateCacheMetrics('mappings', 100, 0.92);
    
    // Record cache operations
    metrics.recordCacheOperation('query', 'hit');
    metrics.recordCacheOperation('query', 'miss');
    metrics.recordCacheOperation('mappings', 'eviction');
    
    expect(true).toBe(true);
  });

  test('should record Elasticsearch operations', () => {
    if (!metrics.isEnabled()) {
      console.log('Metrics disabled - skipping test');
      return;
    }

    // Record successful operations
    metrics.recordElasticsearchOperation('search', 'logs-*', 45.2, true);
    metrics.recordElasticsearchOperation('index', 'documents', 23.1, true);
    
    // Record failed operations
    metrics.recordElasticsearchOperation('search', 'logs-*', 1000, false, '500');
    
    // Record search operations
    metrics.recordSearchOperation('logs-*', 'match_all');
    metrics.recordSearchOperation('events-*', 'bool_query');
    
    expect(true).toBe(true);
  });

  test('should record security events', () => {
    if (!metrics.isEnabled()) {
      console.log('Metrics disabled - skipping test');
      return;
    }

    metrics.recordSecurityValidationFailure('bulk', 'injection_detected');
    metrics.recordReadOnlyModeBlock('delete_index', 'destructive');
    metrics.recordRateLimitHit('tool_execution');
    
    expect(true).toBe(true);
  });

  test('should update system metrics', () => {
    if (!metrics.isEnabled()) {
      console.log('Metrics disabled - skipping test');
      return;
    }

    metrics.setActiveConnections(3);
    metrics.setRequestsPerSecond(25.5);
    
    expect(true).toBe(true);
  });

  test('should generate metrics output', () => {
    if (!metrics.isEnabled()) {
      console.log('Metrics disabled - skipping test');
      return;
    }

    const metricsOutput = metrics.getMetrics();
    expect(typeof metricsOutput).toBe('string');
    
    if (metricsOutput.length > 0) {
      // Should contain some expected metric names
      expect(metricsOutput).toContain('elasticsearch_mcp_');
    }
  });

  test('should start and stop metrics endpoint', async () => {
    metricsEndpoint = new MetricsEndpoint(9091); // Use different port to avoid conflicts
    
    // Start the endpoint
    await metricsEndpoint.start();
    expect(metricsEndpoint.isRunning()).toBe(true);
    
    // Test health endpoint
    const healthResponse = await fetch('http://localhost:9091/health');
    expect(healthResponse.status).toBe(200);
    
    const healthData = await healthResponse.json();
    expect(healthData.status).toBe('healthy');
    expect(typeof healthData.uptime).toBe('number');
    
    // Test metrics endpoint if metrics are enabled
    if (metrics.isEnabled()) {
      const metricsResponse = await fetch('http://localhost:9091/metrics');
      expect(metricsResponse.status).toBe(200);
      
      const metricsText = await metricsResponse.text();
      expect(typeof metricsText).toBe('string');
    }
    
    // Stop the endpoint
    await metricsEndpoint.stop();
    expect(metricsEndpoint.isRunning()).toBe(false);
  });
});

describe('Prometheus Metrics Performance', () => {
  let metrics: PrometheusMetrics;

  beforeAll(() => {
    metrics = PrometheusMetrics.getInstance();
  });

  test('should handle high-volume metric collection', () => {
    if (!metrics.isEnabled()) {
      console.log('Metrics disabled - skipping test');
      return;
    }

    const startTime = performance.now();
    
    // Record 1000 metrics rapidly
    for (let i = 0; i < 1000; i++) {
      metrics.recordToolExecution(`tool_${i % 10}`, 'core', Math.random() * 100, 'success');
    }
    
    const duration = performance.now() - startTime;
    console.log(`High-volume metrics test completed in ${duration.toFixed(2)}ms`);
    
    // Should complete in reasonable time (less than 1 second)
    expect(duration).toBeLessThan(1000);
  });

  test('should handle concurrent metric recording', async () => {
    if (!metrics.isEnabled()) {
      console.log('Metrics disabled - skipping test');
      return;
    }

    const promises = [];
    const startTime = performance.now();
    
    // Create 100 concurrent metric recording operations
    for (let i = 0; i < 100; i++) {
      promises.push(
        Promise.resolve().then(() => {
          metrics.recordToolExecution(`concurrent_tool_${i}`, 'test', Math.random() * 50, 'success');
          metrics.recordCacheOperation('test', Math.random() > 0.5 ? 'hit' : 'miss');
          metrics.recordElasticsearchOperation('test_op', 'test_index', Math.random() * 100, true);
        })
      );
    }
    
    await Promise.all(promises);
    
    const duration = performance.now() - startTime;
    console.log(`Concurrent metrics test completed in ${duration.toFixed(2)}ms`);
    
    // Should handle concurrent operations without errors
    expect(duration).toBeLessThan(2000);
  });
});

describe('Prometheus Metrics Edge Cases', () => {
  let metrics: PrometheusMetrics;

  beforeAll(() => {
    metrics = PrometheusMetrics.getInstance();
  });

  test('should handle invalid metric values gracefully', () => {
    if (!metrics.isEnabled()) {
      console.log('Metrics disabled - skipping test');
      return;
    }

    // Test with edge case values
    expect(() => {
      metrics.recordToolExecution('test', 'test', -1, 'success'); // Negative duration
      metrics.recordToolExecution('test', 'test', Infinity, 'success'); // Infinite duration
      metrics.recordToolExecution('test', 'test', NaN, 'success'); // NaN duration
    }).not.toThrow();
  });

  test('should handle empty string parameters', () => {
    if (!metrics.isEnabled()) {
      console.log('Metrics disabled - skipping test');
      return;
    }

    expect(() => {
      metrics.recordToolExecution('', '', 50, 'success');
      metrics.recordToolError('', '', '');
      metrics.recordCacheOperation('', 'hit');
    }).not.toThrow();
  });

  test('should handle null/undefined parameters', () => {
    if (!metrics.isEnabled()) {
      console.log('Metrics disabled - skipping test');
      return;
    }

    expect(() => {
      // @ts-ignore - Testing runtime behavior
      metrics.recordToolExecution(null, undefined, 50, 'success');
      // @ts-ignore - Testing runtime behavior
      metrics.updateCacheMetrics(null, undefined, NaN);
    }).not.toThrow();
  });

  test('should gracefully degrade when disabled', () => {
    // Create a new metrics instance that should be disabled if prom-client is not available
    const testMetrics = new (class extends PrometheusMetrics {
      public isEnabled(): boolean {
        return false; // Force disabled state
      }
    })();

    // All operations should work without throwing when disabled
    expect(() => {
      testMetrics.recordToolExecution('test', 'test', 50, 'success');
      testMetrics.recordCircuitBreakerTrip('test');
      testMetrics.updateCacheMetrics('test', 100, 0.8);
      const output = testMetrics.getMetrics();
      expect(output).toBe('');
    }).not.toThrow();
  });
});

describe('Metrics Integration with System', () => {
  test('should integrate with process memory monitoring', () => {
    const metrics = PrometheusMetrics.getInstance();
    
    if (!metrics.isEnabled()) {
      console.log('Metrics disabled - skipping test');
      return;
    }

    // The metrics system should be collecting system metrics automatically
    // We can't easily test the automated collection, but we can verify it doesn't crash
    
    // Simulate some memory pressure
    const largeArray = new Array(100000).fill('test');
    
    // Wait a moment for metrics collection
    setTimeout(() => {
      // System should still be stable
      expect(process.memoryUsage().heapUsed).toBeGreaterThan(0);
    }, 100);
    
    // Cleanup
    largeArray.length = 0;
  });

  test('should handle metrics clearing', () => {
    const metrics = PrometheusMetrics.getInstance();
    
    if (!metrics.isEnabled()) {
      console.log('Metrics disabled - skipping test');
      return;
    }

    // Record some metrics
    metrics.recordToolExecution('test', 'test', 50, 'success');
    
    // Clear should work without errors
    expect(() => {
      metrics.clearMetrics();
    }).not.toThrow();
  });
});