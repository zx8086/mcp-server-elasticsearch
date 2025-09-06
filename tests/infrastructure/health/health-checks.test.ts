import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { HealthCheckSystem, HealthCheckType, HealthStatus } from '../../src/health/healthCheckSystem.js';
import { Client } from '@elastic/elasticsearch';

// Mock Elasticsearch client for testing
const mockClient = {
  ping: async () => ({ body: true }),
  cluster: {
    health: async () => ({
      body: {
        status: 'green',
        number_of_nodes: 3,
        active_primary_shards: 10,
        active_shards: 20,
        unassigned_shards: 0
      }
    })
  },
  indices: {
    stats: async () => ({
      body: {
        _all: {
          total: {
            docs: { count: 1000000 },
            store: { size_in_bytes: 500000000 }
          }
        }
      }
    })
  },
  cat: {
    nodes: async () => ({
      body: [
        { name: 'node-1', heap: '50', cpu: '10', load: '1.0' },
        { name: 'node-2', heap: '60', cpu: '15', load: '1.2' },
        { name: 'node-3', heap: '45', cpu: '8', load: '0.8' }
      ]
    })
  },
  info: async () => ({
    body: {
      version: { number: '8.11.0' },
      cluster_name: 'test-cluster'
    }
  })
} as unknown as Client;

describe('Health Check System', () => {
  let healthSystem: HealthCheckSystem;
  let eventCallbacks: any[] = [];

  beforeEach(() => {
    healthSystem = new HealthCheckSystem({
      elasticsearch: mockClient,
      checkInterval: 100, // Fast interval for testing
      trendAnalysisWindow: 1000, // 1 second window
      thresholds: {
        responseTime: 1000,
        errorRate: 0.05,
        memoryUsage: 0.8,
        cpuUsage: 0.7,
        diskUsage: 0.8
      },
      retryAttempts: 2
    });

    // Capture events for testing
    eventCallbacks = [];
    healthSystem.on('health_check_completed', (data) => {
      eventCallbacks.push({ type: 'completed', data });
    });
    healthSystem.on('health_degraded', (data) => {
      eventCallbacks.push({ type: 'degraded', data });
    });
    healthSystem.on('health_critical', (data) => {
      eventCallbacks.push({ type: 'critical', data });
    });
  });

  afterEach(() => {
    if (healthSystem) {
      healthSystem.destroy();
    }
  });

  test('should initialize with correct configuration', () => {
    expect(healthSystem).toBeDefined();
    expect(typeof healthSystem.runHealthChecks).toBe('function');
    expect(typeof healthSystem.getSystemHealth).toBe('function');
    expect(typeof healthSystem.startMonitoring).toBe('function');
  });

  test('should run basic connectivity checks', async () => {
    const healthSnapshot = await healthSystem.runHealthChecks(HealthCheckType.CONNECTIVITY);

    expect(healthSnapshot).toBeDefined();
    expect(healthSnapshot.timestamp).toBeTypeOf('number');
    expect(healthSnapshot.checks.connectivity).toBeDefined();
    expect(healthSnapshot.checks.connectivity.status).toBe(HealthStatus.HEALTHY);
    expect(healthSnapshot.checks.connectivity.responseTime).toBeTypeOf('number');

    console.log(`✅ Connectivity check: ${healthSnapshot.checks.connectivity.status} (${healthSnapshot.checks.connectivity.responseTime}ms)`);
  });

  test('should run comprehensive system checks', async () => {
    const healthSnapshot = await healthSystem.runHealthChecks(HealthCheckType.SYSTEM);

    expect(healthSnapshot.checks.connectivity).toBeDefined();
    expect(healthSnapshot.checks.cluster).toBeDefined();
    expect(healthSnapshot.checks.performance).toBeDefined();

    // Verify cluster health
    const clusterCheck = healthSnapshot.checks.cluster;
    expect(clusterCheck.status).toBe(HealthStatus.HEALTHY);
    expect(clusterCheck.details.clusterStatus).toBe('green');
    expect(clusterCheck.details.nodeCount).toBe(3);

    // Verify performance metrics
    const perfCheck = healthSnapshot.checks.performance;
    expect(perfCheck.status).toMatch(/healthy|warning/);
    expect(typeof perfCheck.details.avgCpuUsage).toBe('number');
    expect(typeof perfCheck.details.avgMemoryUsage).toBe('number');

    console.log(`✅ System checks completed: connectivity=${healthSnapshot.checks.connectivity.status}, cluster=${clusterCheck.status}, performance=${perfCheck.status}`);
  });

  test('should detect performance degradation', async () => {
    // Mock degraded performance
    const degradedClient = {
      ...mockClient,
      ping: async () => {
        await new Promise(resolve => setTimeout(resolve, 1200)); // Slow response
        return { body: true };
      },
      cat: {
        nodes: async () => ({
          body: [
            { name: 'node-1', heap: '85', cpu: '75', load: '3.0' }, // High usage
            { name: 'node-2', heap: '90', cpu: '80', load: '3.5' },
            { name: 'node-3', heap: '78', cpu: '70', load: '2.8' }
          ]
        })
      }
    } as unknown as Client;

    const degradedSystem = new HealthCheckSystem({
      elasticsearch: degradedClient,
      thresholds: {
        responseTime: 1000,
        errorRate: 0.05,
        memoryUsage: 0.8,
        cpuUsage: 0.7,
        diskUsage: 0.8
      }
    });

    const healthSnapshot = await degradedSystem.runHealthChecks(HealthCheckType.PERFORMANCE);

    expect(healthSnapshot.checks.connectivity.status).toMatch(/warning|critical/);
    expect(healthSnapshot.checks.performance.status).toMatch(/warning|critical/);
    expect(healthSnapshot.overallStatus).toMatch(/warning|critical/);

    console.log(`✅ Performance degradation detected: overall=${healthSnapshot.overallStatus}`);
    
    degradedSystem.destroy();
  });

  test('should run security validation checks', async () => {
    const healthSnapshot = await healthSystem.runHealthChecks(HealthCheckType.SECURITY);

    expect(healthSnapshot.checks.security).toBeDefined();
    const securityCheck = healthSnapshot.checks.security;
    
    expect(securityCheck.status).toMatch(/healthy|warning/);
    expect(securityCheck.details.authenticationEnabled).toBeDefined();
    expect(securityCheck.details.tlsEnabled).toBeDefined();
    expect(typeof securityCheck.details.failedAuthAttempts).toBe('number');

    console.log(`✅ Security validation: status=${securityCheck.status}, auth=${securityCheck.details.authenticationEnabled}, tls=${securityCheck.details.tlsEnabled}`);
  });

  test('should track health trends over time', async () => {
    // Run multiple health checks to build trend data
    for (let i = 0; i < 5; i++) {
      await healthSystem.runHealthChecks(HealthCheckType.CONNECTIVITY);
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    const trends = healthSystem.getHealthTrends(HealthCheckType.CONNECTIVITY);
    
    expect(trends).toBeDefined();
    expect(trends.dataPoints.length).toBeGreaterThanOrEqual(3);
    expect(typeof trends.averageResponseTime).toBe('number');
    expect(typeof trends.trend).toBe('string');
    expect(['improving', 'stable', 'degrading']).toContain(trends.trend);

    console.log(`✅ Health trends: ${trends.dataPoints.length} data points, trend=${trends.trend}, avg response=${trends.averageResponseTime}ms`);
  });

  test('should emit health events', async () => {
    // Start monitoring to trigger events
    healthSystem.startMonitoring();

    // Wait for at least one monitoring cycle
    await new Promise(resolve => setTimeout(resolve, 200));

    // Should have received at least one event
    expect(eventCallbacks.length).toBeGreaterThan(0);

    const completedEvents = eventCallbacks.filter(e => e.type === 'completed');
    expect(completedEvents.length).toBeGreaterThan(0);

    const latestEvent = completedEvents[completedEvents.length - 1];
    expect(latestEvent.data.overallStatus).toBeDefined();
    expect(latestEvent.data.timestamp).toBeTypeOf('number');

    console.log(`✅ Health events: ${eventCallbacks.length} total, latest status=${latestEvent.data.overallStatus}`);

    healthSystem.stopMonitoring();
  });

  test('should handle check failures gracefully', async () => {
    // Mock failing client
    const failingClient = {
      ping: async () => {
        throw new Error('Connection failed');
      },
      cluster: {
        health: async () => {
          throw new Error('Cluster unreachable');
        }
      }
    } as unknown as Client;

    const failingSystem = new HealthCheckSystem({
      elasticsearch: failingClient,
      retryAttempts: 1
    });

    const healthSnapshot = await failingSystem.runHealthChecks(HealthCheckType.CONNECTIVITY);

    expect(healthSnapshot.checks.connectivity.status).toBe(HealthStatus.CRITICAL);
    expect(healthSnapshot.checks.connectivity.error).toBeDefined();
    expect(healthSnapshot.overallStatus).toBe(HealthStatus.CRITICAL);

    console.log(`✅ Failure handling: status=${healthSnapshot.overallStatus}, error handling works`);
    
    failingSystem.destroy();
  });

  test('should validate health check configuration', () => {
    // Test invalid configuration
    expect(() => {
      new HealthCheckSystem({
        elasticsearch: null as any,
        checkInterval: -1,
        thresholds: {
          responseTime: -100,
          errorRate: 2.0, // Invalid > 1.0
          memoryUsage: -0.5,
          cpuUsage: 1.5, // Invalid > 1.0
          diskUsage: 0.8
        }
      });
    }).toThrow();

    console.log('✅ Configuration validation works correctly');
  });

  test('should generate health reports', async () => {
    // Run various types of checks
    await healthSystem.runHealthChecks(HealthCheckType.SYSTEM);
    await healthSystem.runHealthChecks(HealthCheckType.PERFORMANCE);
    
    const healthReport = await healthSystem.generateHealthReport();

    expect(healthReport).toBeDefined();
    expect(healthReport.summary).toBeDefined();
    expect(healthReport.summary.overallStatus).toBeDefined();
    expect(healthReport.checks).toBeDefined();
    expect(healthReport.recommendations).toBeDefined();
    expect(Array.isArray(healthReport.recommendations)).toBe(true);
    expect(healthReport.timestamp).toBeTypeOf('number');

    // Should have recommendations if any issues found
    if (healthReport.summary.overallStatus !== HealthStatus.HEALTHY) {
      expect(healthReport.recommendations.length).toBeGreaterThan(0);
    }

    console.log(`✅ Health report generated: status=${healthReport.summary.overallStatus}, recommendations=${healthReport.recommendations.length}`);
  });
});

describe('Health Check Integration', () => {
  test('should integrate with cache health monitoring', async () => {
    // Mock cache for testing
    const mockCache = {
      getStats: () => ({
        size: 150,
        hitRatio: 0.75,
        patterns: 25,
        prefetchQueue: 5,
        categoryBreakdown: { search: 100, mappings: 50 }
      }),
      getHealthMetrics: () => ({
        memoryUsage: 0.6,
        operationsPerSecond: 50,
        errorRate: 0.02
      })
    };

    const healthSystem = new HealthCheckSystem({
      elasticsearch: mockClient,
      cache: mockCache as any
    });

    const healthSnapshot = await healthSystem.runHealthChecks(HealthCheckType.CACHE);

    expect(healthSnapshot.checks.cache).toBeDefined();
    const cacheCheck = healthSnapshot.checks.cache;
    
    expect(cacheCheck.status).toBe(HealthStatus.HEALTHY);
    expect(cacheCheck.details.hitRatio).toBe(0.75);
    expect(cacheCheck.details.size).toBe(150);
    expect(cacheCheck.details.memoryUsage).toBe(0.6);

    console.log(`✅ Cache health integration: status=${cacheCheck.status}, hit ratio=${cacheCheck.details.hitRatio}`);
    
    healthSystem.destroy();
  });

  test('should integrate with circuit breaker monitoring', async () => {
    // Mock circuit breaker
    const mockCircuitBreaker = {
      getState: () => 'CLOSED',
      getStats: () => ({
        failures: 2,
        successes: 98,
        rejections: 0,
        timeouts: 1,
        lastFailure: Date.now() - 30000
      }),
      isHealthy: () => true
    };

    const healthSystem = new HealthCheckSystem({
      elasticsearch: mockClient,
      circuitBreaker: mockCircuitBreaker as any
    });

    const healthSnapshot = await healthSystem.runHealthChecks(HealthCheckType.CIRCUIT_BREAKER);

    expect(healthSnapshot.checks.circuitBreaker).toBeDefined();
    const cbCheck = healthSnapshot.checks.circuitBreaker;
    
    expect(cbCheck.status).toBe(HealthStatus.HEALTHY);
    expect(cbCheck.details.state).toBe('CLOSED');
    expect(cbCheck.details.failures).toBe(2);
    expect(cbCheck.details.successes).toBe(98);

    console.log(`✅ Circuit breaker health: status=${cbCheck.status}, state=${cbCheck.details.state}`);
    
    healthSystem.destroy();
  });

  test('should aggregate health from multiple components', async () => {
    const mockComponents = {
      cache: {
        getStats: () => ({ hitRatio: 0.85, memoryUsage: 0.4 }),
        getHealthMetrics: () => ({ operationsPerSecond: 100, errorRate: 0.01 })
      },
      circuitBreaker: {
        getState: () => 'CLOSED',
        getStats: () => ({ failures: 1, successes: 199 }),
        isHealthy: () => true
      },
      rateLimiter: {
        getStats: () => ({ 
          totalRequests: 1000,
          rejectedRequests: 10,
          currentLoad: 0.5 
        }),
        isHealthy: () => true
      }
    };

    const healthSystem = new HealthCheckSystem({
      elasticsearch: mockClient,
      cache: mockComponents.cache as any,
      circuitBreaker: mockComponents.circuitBreaker as any,
      rateLimiter: mockComponents.rateLimiter as any
    });

    const healthSnapshot = await healthSystem.runHealthChecks(HealthCheckType.SYSTEM);

    // Should have all component checks
    expect(healthSnapshot.checks.connectivity).toBeDefined();
    expect(healthSnapshot.checks.cluster).toBeDefined();
    expect(healthSnapshot.checks.cache).toBeDefined();
    expect(healthSnapshot.checks.circuitBreaker).toBeDefined();
    expect(healthSnapshot.checks.rateLimiter).toBeDefined();

    // Overall status should be aggregate of all components
    const allStatuses = Object.values(healthSnapshot.checks).map(check => check.status);
    const hasWarning = allStatuses.includes(HealthStatus.WARNING);
    const hasCritical = allStatuses.includes(HealthStatus.CRITICAL);

    if (hasCritical) {
      expect(healthSnapshot.overallStatus).toBe(HealthStatus.CRITICAL);
    } else if (hasWarning) {
      expect(healthSnapshot.overallStatus).toBe(HealthStatus.WARNING);
    } else {
      expect(healthSnapshot.overallStatus).toBe(HealthStatus.HEALTHY);
    }

    console.log(`✅ Aggregated health: overall=${healthSnapshot.overallStatus}, components=${Object.keys(healthSnapshot.checks).length}`);
    
    healthSystem.destroy();
  });

  test('should handle partial component failures', async () => {
    const mockComponents = {
      cache: {
        getStats: () => {
          throw new Error('Cache unavailable');
        }
      },
      circuitBreaker: {
        getState: () => 'CLOSED',
        getStats: () => ({ failures: 0, successes: 100 }),
        isHealthy: () => true
      }
    };

    const healthSystem = new HealthCheckSystem({
      elasticsearch: mockClient,
      cache: mockComponents.cache as any,
      circuitBreaker: mockComponents.circuitBreaker as any
    });

    const healthSnapshot = await healthSystem.runHealthChecks(HealthCheckType.SYSTEM);

    // Cache check should fail, but others should succeed
    expect(healthSnapshot.checks.cache.status).toBe(HealthStatus.CRITICAL);
    expect(healthSnapshot.checks.cache.error).toBeDefined();
    expect(healthSnapshot.checks.circuitBreaker.status).toBe(HealthStatus.HEALTHY);

    // Overall status should reflect the partial failure
    expect(healthSnapshot.overallStatus).toMatch(/warning|critical/);

    console.log(`✅ Partial failure handling: cache failed, circuit breaker healthy, overall=${healthSnapshot.overallStatus}`);
    
    healthSystem.destroy();
  });
});

describe('Health Check Performance', () => {
  test('should complete health checks quickly', async () => {
    const healthSystem = new HealthCheckSystem({
      elasticsearch: mockClient
    });

    const startTime = performance.now();
    await healthSystem.runHealthChecks(HealthCheckType.CONNECTIVITY);
    const duration = performance.now() - startTime;

    expect(duration).toBeLessThan(1000); // Should complete in under 1 second

    console.log(`✅ Health check performance: ${duration.toFixed(2)}ms`);
    
    healthSystem.destroy();
  });

  test('should handle concurrent health checks', async () => {
    const healthSystem = new HealthCheckSystem({
      elasticsearch: mockClient
    });

    // Run multiple concurrent health checks
    const concurrentChecks = [
      healthSystem.runHealthChecks(HealthCheckType.CONNECTIVITY),
      healthSystem.runHealthChecks(HealthCheckType.PERFORMANCE),
      healthSystem.runHealthChecks(HealthCheckType.SECURITY),
      healthSystem.runHealthChecks(HealthCheckType.SYSTEM)
    ];

    const results = await Promise.all(concurrentChecks);

    expect(results).toHaveLength(4);
    results.forEach(result => {
      expect(result).toBeDefined();
      expect(result.overallStatus).toMatch(/healthy|warning|critical/);
    });

    console.log(`✅ Concurrent health checks: ${results.length} completed successfully`);
    
    healthSystem.destroy();
  });

  test('should maintain performance under load', async () => {
    const healthSystem = new HealthCheckSystem({
      elasticsearch: mockClient,
      checkInterval: 50 // Fast monitoring
    });

    healthSystem.startMonitoring();

    // Let it run for a short period under load
    await new Promise(resolve => setTimeout(resolve, 500));

    const trends = healthSystem.getHealthTrends(HealthCheckType.CONNECTIVITY);
    expect(trends.dataPoints.length).toBeGreaterThan(5);

    // Performance should remain consistent
    const responseTimes = trends.dataPoints.map(dp => dp.responseTime);
    const avgResponseTime = responseTimes.reduce((a, b) => a + b) / responseTimes.length;
    const maxResponseTime = Math.max(...responseTimes);

    expect(avgResponseTime).toBeLessThan(500);
    expect(maxResponseTime).toBeLessThan(1000);

    console.log(`✅ Load performance: ${trends.dataPoints.length} checks, avg=${avgResponseTime.toFixed(2)}ms, max=${maxResponseTime.toFixed(2)}ms`);
    
    healthSystem.stopMonitoring();
    healthSystem.destroy();
  });
});