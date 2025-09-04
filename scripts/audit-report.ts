#!/usr/bin/env bun

import { SecurityAuditTrail, AuditEventType } from '../src/security/auditTrail.js';

async function generateAuditReport() {
  console.log('🔒 Generating Security Audit Report');
  console.log('='.repeat(40));

  try {
    const auditTrail = new SecurityAuditTrail({
      enabled: true,
      logLevel: 'detailed',
      storage: {
        type: 'file',
        directory: 'audit',
      },
    });

    // Generate sample audit events for demonstration
    await generateSampleAuditData(auditTrail);

    // Get audit summary for last 24 hours
    console.log('📊 Analyzing audit data for the last 24 hours...');
    const summary = await auditTrail.getAuditSummary(24);

    displayAuditSummary(summary);

    // Clean up
    await auditTrail.cleanup();

    console.log('\n✅ Audit report generation completed');

  } catch (error) {
    console.error('❌ Audit report generation failed:', error);
    process.exit(1);
  }
}

async function generateSampleAuditData(auditTrail: SecurityAuditTrail): Promise<void> {
  console.log('📝 Generating sample audit data...');

  // Sample tool executions
  await auditTrail.logToolExecution(
    'search',
    'core',
    {
      operation: 'elasticsearch_search',
      operationType: 'read',
      targetIndex: 'logs-*',
      parameters: { query: { match_all: {} }, size: 10 },
    },
    {
      status: 'success',
      duration: 45.2,
      recordsAffected: 10,
      dataSize: 2048,
    },
    {
      ipAddress: '192.168.1.100',
      userAgent: 'Claude Desktop',
      validationsPassed: ['input_validation', 'rate_limit_check'],
      validationsFailed: [],
      securityScore: 8,
    },
    {
      sessionId: 'session_123',
      userId: 'user_456',
      clientType: 'claude_desktop',
    }
  );

  // Sample security violation
  await auditTrail.logSecurityViolation(
    'bulk_operations',
    'injection_attempt',
    {
      suspiciousPattern: 'DROP TABLE',
      inputSize: 5000,
    },
    {
      ipAddress: '10.0.0.50',
      validationsPassed: [],
      validationsFailed: ['sql_injection_check'],
      securityScore: 2,
    }
  );

  // Sample suspicious activity
  await auditTrail.logSuspiciousActivity(
    'Multiple failed authentication attempts from same IP',
    'high',
    {
      ipAddress: '192.168.1.200',
      attemptCount: 15,
      timeWindow: '5 minutes',
    }
  );

  // More sample tool executions
  const tools = ['list_indices', 'cluster_health', 'get_mappings', 'index_document'];
  for (const tool of tools) {
    await auditTrail.logToolExecution(
      tool,
      'core',
      {
        operation: tool,
        operationType: tool.includes('index_document') ? 'write' : 'read',
      },
      {
        status: 'success',
        duration: Math.random() * 100 + 20,
      },
      {
        securityScore: Math.floor(Math.random() * 4) + 6,
        validationsPassed: ['input_validation'],
        validationsFailed: [],
      }
    );
  }

  console.log('✅ Sample audit data generated');
}

function displayAuditSummary(summary: any): void {
  console.log('\n📋 Security Audit Summary');
  console.log('-'.repeat(30));

  console.log(`📊 Total Events: ${summary.totalEvents}`);
  console.log(`🔒 Security Events: ${summary.securityEvents}`);

  // Events by type
  if (Object.keys(summary.eventsByType).length > 0) {
    console.log('\n📈 Events by Type:');
    for (const [eventType, count] of Object.entries(summary.eventsByType)) {
      const emoji = getEventTypeEmoji(eventType);
      console.log(`   ${emoji} ${eventType}: ${count}`);
    }
  }

  // Top tools
  if (summary.topTools.length > 0) {
    console.log('\n🔧 Most Used Tools:');
    for (const { tool, count } of summary.topTools.slice(0, 5)) {
      console.log(`   📦 ${tool}: ${count} executions`);
    }
  }

  // Suspicious activity
  if (summary.suspiciousActivity.length > 0) {
    console.log('\n⚠️  Suspicious Activity Patterns:');
    for (const { pattern, count } of summary.suspiciousActivity) {
      console.log(`   🚨 ${pattern}: ${count} occurrences`);
    }
  }

  // Recommendations
  if (summary.recommendations.length > 0) {
    console.log('\n💡 Security Recommendations:');
    for (const recommendation of summary.recommendations) {
      console.log(`   • ${recommendation}`);
    }
  }

  // Security score assessment
  const securityScore = calculateSecurityScore(summary);
  const scoreEmoji = getSecurityScoreEmoji(securityScore);
  console.log(`\n${scoreEmoji} Overall Security Score: ${securityScore}/10`);

  if (securityScore < 7) {
    console.log('⚠️  Security attention required - review recommendations above');
  } else if (securityScore >= 9) {
    console.log('✅ Excellent security posture maintained');
  } else {
    console.log('👍 Good security posture - monitor for improvements');
  }
}

function getEventTypeEmoji(eventType: string): string {
  switch (eventType) {
    case 'tool_execution': return '🔧';
    case 'security_violation': return '🚨';
    case 'suspicious_activity': return '🔍';
    case 'authentication_failure': return '🔐';
    case 'rate_limit_hit': return '🚦';
    case 'circuit_breaker_trip': return '⚡';
    case 'read_only_block': return '🔒';
    case 'configuration_change': return '⚙️';
    case 'connection_event': return '🔌';
    case 'error_event': return '❌';
    default: return '📝';
  }
}

function calculateSecurityScore(summary: any): number {
  let score = 10;

  // Deduct points for security events
  if (summary.securityEvents > 0) {
    score -= Math.min(summary.securityEvents * 0.5, 3);
  }

  // Deduct points for suspicious activity
  if (summary.suspiciousActivity.length > 0) {
    score -= Math.min(summary.suspiciousActivity.length * 0.5, 2);
  }

  // Deduct points for high number of failures
  const failureEvents = (summary.eventsByType.authentication_failure || 0) +
                       (summary.eventsByType.error_event || 0);
  if (failureEvents > 5) {
    score -= Math.min(failureEvents * 0.1, 2);
  }

  // Bonus for good activity
  if (summary.totalEvents > 10 && summary.securityEvents === 0) {
    score = Math.min(score + 0.5, 10);
  }

  return Math.max(Math.round(score * 10) / 10, 0);
}

function getSecurityScoreEmoji(score: number): string {
  if (score >= 9) return '🛡️';
  if (score >= 8) return '✅';
  if (score >= 7) return '👍';
  if (score >= 5) return '⚠️';
  return '🚨';
}

if (import.meta.main) {
  generateAuditReport().catch(console.error);
}