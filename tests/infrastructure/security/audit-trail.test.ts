import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { SecurityAuditTrail, SecurityEventType, AuditEvent } from '../../src/security/auditTrail.js';
import { readFile, writeFile, mkdir, rmdir } from 'fs/promises';
import path from 'path';

describe('Security Audit Trail', () => {
  let auditTrail: SecurityAuditTrail;
  const testLogDir = path.join(process.cwd(), 'test-audit-logs');

  beforeEach(async () => {
    // Ensure clean test environment
    try {
      await rmdir(testLogDir, { recursive: true });
    } catch {
      // Directory might not exist
    }
    await mkdir(testLogDir, { recursive: true });

    auditTrail = new SecurityAuditTrail({
      logDirectory: testLogDir,
      enablePatternDetection: true,
      maxLogFileSize: 1024 * 10, // 10KB for testing
      maxLogFiles: 5,
      patternAnalysisInterval: 100, // 100ms for testing
      suspiciousThreshold: 3
    });
  });

  afterEach(async () => {
    if (auditTrail) {
      await auditTrail.stop();
    }
    // Clean up test logs
    try {
      await rmdir(testLogDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test('should initialize with correct configuration', () => {
    expect(auditTrail).toBeDefined();
    expect(typeof auditTrail.logEvent).toBe('function');
    expect(typeof auditTrail.getSecurityInsights).toBe('function');
  });

  test('should log authentication events', async () => {
    const authEvent = {
      type: SecurityEventType.AUTHENTICATION,
      action: 'api_key_validation',
      userId: 'test-user',
      clientId: 'test-client',
      metadata: {
        apiKeyPrefix: 'key_abc',
        ipAddress: '192.168.1.100'
      }
    };

    await auditTrail.logEvent(authEvent);

    // Verify log file was created
    const logFiles = await readdir(testLogDir);
    expect(logFiles.length).toBeGreaterThan(0);

    const logContent = await readFile(path.join(testLogDir, logFiles[0]), 'utf-8');
    expect(logContent).toContain('AUTHENTICATION');
    expect(logContent).toContain('api_key_validation');
    expect(logContent).toContain('test-user');

    console.log('✅ Authentication events logged correctly');
  });

  test('should log authorization events with tool access', async () => {
    const authzEvent = {
      type: SecurityEventType.AUTHORIZATION,
      action: 'tool_access',
      userId: 'test-user',
      toolName: 'search',
      metadata: {
        readOnlyMode: false,
        permissions: ['read', 'search'],
        ipAddress: '10.0.0.1'
      }
    };

    await auditTrail.logEvent(authzEvent);

    const logFiles = await readdir(testLogDir);
    const logContent = await readFile(path.join(testLogDir, logFiles[0]), 'utf-8');
    
    expect(logContent).toContain('AUTHORIZATION');
    expect(logContent).toContain('tool_access');
    expect(logContent).toContain('search');
    expect(logContent).toContain('readOnlyMode\":false');

    console.log('✅ Authorization events logged correctly');
  });

  test('should detect suspicious patterns', async () => {
    // Generate rapid-fire authentication failures
    const suspiciousEvents = [
      {
        type: SecurityEventType.AUTHENTICATION,
        action: 'api_key_validation_failed',
        userId: 'attacker',
        metadata: { ipAddress: '192.168.1.200', reason: 'invalid_key' }
      },
      {
        type: SecurityEventType.AUTHENTICATION,
        action: 'api_key_validation_failed',
        userId: 'attacker',
        metadata: { ipAddress: '192.168.1.200', reason: 'invalid_key' }
      },
      {
        type: SecurityEventType.AUTHENTICATION,
        action: 'api_key_validation_failed',
        userId: 'attacker2',
        metadata: { ipAddress: '192.168.1.200', reason: 'invalid_key' }
      },
      {
        type: SecurityEventType.AUTHENTICATION,
        action: 'api_key_validation_failed',
        userId: 'attacker3',
        metadata: { ipAddress: '192.168.1.200', reason: 'invalid_key' }
      }
    ];

    for (const event of suspiciousEvents) {
      await auditTrail.logEvent(event);
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
    }

    // Wait for pattern analysis
    await new Promise(resolve => setTimeout(resolve, 200));

    const insights = await auditTrail.getSecurityInsights();
    expect(insights.suspiciousPatterns.length).toBeGreaterThan(0);
    
    const ipPattern = insights.suspiciousPatterns.find(p => 
      p.type === 'repeated_failures' && p.details.ipAddress === '192.168.1.200'
    );
    expect(ipPattern).toBeDefined();
    expect(ipPattern.severity).toBe('high');

    console.log(`✅ Detected ${insights.suspiciousPatterns.length} suspicious patterns`);
  });

  test('should generate security insights', async () => {
    // Generate various security events
    const events = [
      {
        type: SecurityEventType.AUTHENTICATION,
        action: 'successful_login',
        userId: 'user1',
        metadata: { ipAddress: '192.168.1.10' }
      },
      {
        type: SecurityEventType.AUTHORIZATION,
        action: 'tool_access',
        userId: 'user1',
        toolName: 'search',
        metadata: { readOnlyMode: true }
      },
      {
        type: SecurityEventType.DATA_ACCESS,
        action: 'elasticsearch_query',
        userId: 'user1',
        metadata: { 
          index: 'logs-2024',
          queryType: 'search',
          resultCount: 150,
          sensitiveData: false
        }
      },
      {
        type: SecurityEventType.SYSTEM,
        action: 'rate_limit_triggered',
        userId: 'user2',
        metadata: { 
          limit: 100,
          requests: 150,
          timeWindow: '1m'
        }
      }
    ];

    for (const event of events) {
      await auditTrail.logEvent(event);
    }

    const insights = await auditTrail.getSecurityInsights();

    expect(insights.totalEvents).toBe(4);
    expect(insights.eventTypes.AUTHENTICATION).toBe(1);
    expect(insights.eventTypes.AUTHORIZATION).toBe(1);
    expect(insights.eventTypes.DATA_ACCESS).toBe(1);
    expect(insights.eventTypes.SYSTEM).toBe(1);

    expect(insights.topUsers.length).toBeGreaterThan(0);
    expect(insights.topActions.length).toBeGreaterThan(0);

    console.log(`✅ Generated insights: ${insights.totalEvents} events, ${insights.suspiciousPatterns.length} patterns`);
  });

  test('should handle log rotation', async () => {
    // Generate enough events to trigger log rotation
    const largeEvent = {
      type: SecurityEventType.DATA_ACCESS,
      action: 'bulk_operation',
      userId: 'bulk-user',
      metadata: {
        // Large metadata to trigger file size limit
        data: 'x'.repeat(2000),
        operation: 'bulk_index',
        documents: 1000
      }
    };

    // Log multiple large events
    for (let i = 0; i < 10; i++) {
      await auditTrail.logEvent({
        ...largeEvent,
        metadata: { ...largeEvent.metadata, iteration: i }
      });
    }

    // Wait for rotation to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    const logFiles = await readdir(testLogDir);
    expect(logFiles.length).toBeGreaterThan(1);

    // Check that logs are distributed across files
    let totalLogEntries = 0;
    for (const file of logFiles) {
      const content = await readFile(path.join(testLogDir, file), 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      totalLogEntries += lines.length;
    }

    expect(totalLogEntries).toBe(10);
    console.log(`✅ Log rotation created ${logFiles.length} files with ${totalLogEntries} total entries`);
  });

  test('should track user behavior patterns', async () => {
    const userId = 'pattern-user';
    
    // Simulate user session with various activities
    const sessionEvents = [
      { action: 'login', toolName: null },
      { action: 'tool_access', toolName: 'search' },
      { action: 'elasticsearch_query', toolName: 'search' },
      { action: 'tool_access', toolName: 'list_indices' },
      { action: 'elasticsearch_query', toolName: 'list_indices' },
      { action: 'tool_access', toolName: 'search' },
      { action: 'elasticsearch_query', toolName: 'search' },
      { action: 'logout', toolName: null }
    ];

    for (const event of sessionEvents) {
      await auditTrail.logEvent({
        type: event.toolName ? SecurityEventType.AUTHORIZATION : SecurityEventType.AUTHENTICATION,
        action: event.action,
        userId: userId,
        toolName: event.toolName,
        metadata: { 
          sessionId: 'session-123',
          timestamp: Date.now()
        }
      });
      
      // Small delay between events
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    const insights = await auditTrail.getSecurityInsights();
    
    expect(insights.topUsers).toContain(userId);
    expect(insights.toolUsage.search).toBeGreaterThan(1);
    expect(insights.toolUsage.list_indices).toBe(1);

    console.log('✅ User behavior patterns tracked successfully');
  });

  test('should handle concurrent logging', async () => {
    const concurrentEvents = [];
    
    // Create 50 concurrent logging operations
    for (let i = 0; i < 50; i++) {
      concurrentEvents.push(
        auditTrail.logEvent({
          type: SecurityEventType.DATA_ACCESS,
          action: 'concurrent_test',
          userId: `user-${i % 10}`, // 10 different users
          metadata: {
            operationId: i,
            timestamp: Date.now()
          }
        })
      );
    }

    // Wait for all operations to complete
    await Promise.all(concurrentEvents);

    const insights = await auditTrail.getSecurityInsights();
    expect(insights.totalEvents).toBe(50);

    // Verify log integrity
    const logFiles = await readdir(testLogDir);
    let totalLoggedEvents = 0;

    for (const file of logFiles) {
      const content = await readFile(path.join(testLogDir, file), 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      totalLoggedEvents += lines.length;
    }

    expect(totalLoggedEvents).toBe(50);
    console.log(`✅ Concurrent logging handled: ${totalLoggedEvents} events across ${logFiles.length} files`);
  });

  test('should export audit data', async () => {
    // Generate sample events
    const events = [
      {
        type: SecurityEventType.AUTHENTICATION,
        action: 'login',
        userId: 'export-user',
        metadata: { method: 'api_key' }
      },
      {
        type: SecurityEventType.DATA_ACCESS,
        action: 'sensitive_query',
        userId: 'export-user',
        metadata: { 
          index: 'sensitive-data',
          resultCount: 10,
          sensitiveData: true
        }
      }
    ];

    for (const event of events) {
      await auditTrail.logEvent(event);
    }

    // Test export functionality
    const exportData = await auditTrail.exportAuditData({
      startDate: new Date(Date.now() - 60000), // 1 minute ago
      endDate: new Date(),
      format: 'json'
    });

    expect(exportData).toBeDefined();
    expect(exportData.events).toBeDefined();
    expect(exportData.events.length).toBe(2);
    expect(exportData.summary).toBeDefined();
    expect(exportData.summary.totalEvents).toBe(2);

    console.log(`✅ Exported ${exportData.events.length} audit events`);
  });

  test('should validate event data integrity', async () => {
    // Test with invalid event data
    const invalidEvents = [
      null,
      undefined,
      {},
      { type: 'INVALID_TYPE' },
      { type: SecurityEventType.AUTHENTICATION } // Missing required action
    ];

    let validationErrors = 0;
    
    for (const invalidEvent of invalidEvents) {
      try {
        await auditTrail.logEvent(invalidEvent as any);
      } catch (error) {
        validationErrors++;
      }
    }

    expect(validationErrors).toBeGreaterThan(0);

    // Test with valid event
    const validEvent = {
      type: SecurityEventType.SYSTEM,
      action: 'health_check',
      metadata: { status: 'healthy' }
    };

    expect(async () => {
      await auditTrail.logEvent(validEvent);
    }).not.toThrow();

    console.log(`✅ Event validation caught ${validationErrors} invalid events`);
  });
});

describe('Security Pattern Detection', () => {
  let auditTrail: SecurityAuditTrail;
  const testLogDir = path.join(process.cwd(), 'test-pattern-logs');

  beforeEach(async () => {
    try {
      await rmdir(testLogDir, { recursive: true });
    } catch {}
    await mkdir(testLogDir, { recursive: true });

    auditTrail = new SecurityAuditTrail({
      logDirectory: testLogDir,
      enablePatternDetection: true,
      patternAnalysisInterval: 50, // Very fast for testing
      suspiciousThreshold: 2, // Lower threshold for testing
      brute_force_threshold: 3,
      unusual_access_threshold: 5
    });
  });

  afterEach(async () => {
    if (auditTrail) {
      await auditTrail.stop();
    }
    try {
      await rmdir(testLogDir, { recursive: true });
    } catch {}
  });

  test('should detect brute force attacks', async () => {
    const attackerIP = '192.168.1.100';
    
    // Simulate brute force attack
    for (let i = 0; i < 5; i++) {
      await auditTrail.logEvent({
        type: SecurityEventType.AUTHENTICATION,
        action: 'api_key_validation_failed',
        userId: `attempt-${i}`,
        metadata: { 
          ipAddress: attackerIP,
          reason: 'invalid_key',
          userAgent: 'attack-bot/1.0'
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Wait for pattern analysis
    await new Promise(resolve => setTimeout(resolve, 100));

    const insights = await auditTrail.getSecurityInsights();
    const bruteForcePattern = insights.suspiciousPatterns.find(p => 
      p.type === 'brute_force_attempt' && p.details.ipAddress === attackerIP
    );

    expect(bruteForcePattern).toBeDefined();
    expect(bruteForcePattern.severity).toBe('critical');
    expect(bruteForcePattern.details.attemptCount).toBeGreaterThanOrEqual(3);

    console.log(`✅ Detected brute force: ${bruteForcePattern.details.attemptCount} attempts from ${attackerIP}`);
  });

  test('should detect unusual access patterns', async () => {
    const userId = 'unusual-user';
    
    // Normal pattern first
    await auditTrail.logEvent({
      type: SecurityEventType.DATA_ACCESS,
      action: 'normal_query',
      userId: userId,
      metadata: { 
        index: 'logs-prod',
        timeOfDay: 'business_hours',
        queryComplexity: 'simple'
      }
    });

    // Then unusual patterns
    const unusualEvents = [
      {
        action: 'sensitive_query',
        metadata: { 
          index: 'financial-data',
          timeOfDay: 'night',
          queryComplexity: 'complex',
          sensitiveData: true
        }
      },
      {
        action: 'bulk_download',
        metadata: { 
          index: 'user-data',
          recordCount: 10000,
          timeOfDay: 'night'
        }
      },
      {
        action: 'admin_query',
        metadata: { 
          index: 'system-logs',
          elevated: true,
          timeOfDay: 'weekend'
        }
      }
    ];

    for (const event of unusualEvents) {
      await auditTrail.logEvent({
        type: SecurityEventType.DATA_ACCESS,
        action: event.action,
        userId: userId,
        metadata: event.metadata
      });
    }

    // Wait for pattern analysis
    await new Promise(resolve => setTimeout(resolve, 100));

    const insights = await auditTrail.getSecurityInsights();
    const unusualPattern = insights.suspiciousPatterns.find(p => 
      p.type === 'unusual_access_pattern' && p.details.userId === userId
    );

    expect(unusualPattern).toBeDefined();
    expect(unusualPattern.severity).toMatch(/medium|high/);

    console.log(`✅ Detected unusual access pattern for user ${userId}`);
  });

  test('should detect privilege escalation attempts', async () => {
    const userId = 'escalation-user';
    
    // Start with normal user activity
    await auditTrail.logEvent({
      type: SecurityEventType.AUTHORIZATION,
      action: 'tool_access',
      userId: userId,
      toolName: 'search',
      metadata: { 
        permissions: ['read'],
        readOnlyMode: true
      }
    });

    // Then attempt privileged operations
    const escalationAttempts = [
      { toolName: 'delete_index', permissions: ['admin'] },
      { toolName: 'cluster_settings', permissions: ['admin'] },
      { toolName: 'create_user', permissions: ['admin'] },
      { toolName: 'modify_security', permissions: ['admin'] }
    ];

    for (const attempt of escalationAttempts) {
      await auditTrail.logEvent({
        type: SecurityEventType.AUTHORIZATION,
        action: 'unauthorized_access_attempt',
        userId: userId,
        toolName: attempt.toolName,
        metadata: { 
          requiredPermissions: attempt.permissions,
          userPermissions: ['read'],
          blocked: true
        }
      });
    }

    // Wait for pattern analysis
    await new Promise(resolve => setTimeout(resolve, 100));

    const insights = await auditTrail.getSecurityInsights();
    const escalationPattern = insights.suspiciousPatterns.find(p => 
      p.type === 'privilege_escalation' && p.details.userId === userId
    );

    expect(escalationPattern).toBeDefined();
    expect(escalationPattern.severity).toBe('high');

    console.log(`✅ Detected privilege escalation attempts by ${userId}`);
  });

  test('should calculate security risk scores', async () => {
    // High-risk user behavior
    const highRiskUser = 'high-risk-user';
    const highRiskEvents = [
      { action: 'multiple_failed_auth', metadata: { failures: 5 } },
      { action: 'sensitive_data_access', metadata: { sensitiveData: true } },
      { action: 'unusual_time_access', metadata: { timeOfDay: 'night' } },
      { action: 'bulk_export', metadata: { recordCount: 50000 } },
      { action: 'admin_attempt', metadata: { blocked: true } }
    ];

    for (const event of highRiskEvents) {
      await auditTrail.logEvent({
        type: SecurityEventType.SYSTEM,
        action: event.action,
        userId: highRiskUser,
        metadata: event.metadata
      });
    }

    // Low-risk user behavior
    const lowRiskUser = 'low-risk-user';
    const lowRiskEvents = [
      { action: 'normal_search', metadata: { index: 'public-data' } },
      { action: 'read_only_access', metadata: { readOnlyMode: true } }
    ];

    for (const event of lowRiskEvents) {
      await auditTrail.logEvent({
        type: SecurityEventType.DATA_ACCESS,
        action: event.action,
        userId: lowRiskUser,
        metadata: event.metadata
      });
    }

    const insights = await auditTrail.getSecurityInsights();
    
    expect(insights.riskScores).toBeDefined();
    expect(insights.riskScores[highRiskUser]).toBeGreaterThan(insights.riskScores[lowRiskUser]);
    expect(insights.riskScores[highRiskUser]).toBeGreaterThan(50); // High risk threshold

    console.log(`✅ Risk scores calculated: ${highRiskUser}=${insights.riskScores[highRiskUser]}, ${lowRiskUser}=${insights.riskScores[lowRiskUser]}`);
  });
});

// Helper function for readdir (not available in initial imports)
async function readdir(dirPath: string): Promise<string[]> {
  try {
    const { readdir: fsReaddir } = await import('fs/promises');
    return await fsReaddir(dirPath);
  } catch (error) {
    return [];
  }
}