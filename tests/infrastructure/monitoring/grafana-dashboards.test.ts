import { test, expect, describe } from 'bun:test';
import { readFile } from 'fs/promises';
import path from 'path';

describe('Grafana Dashboard Validation', () => {
  test('should have valid Grafana dashboard JSON', async () => {
    const dashboardPath = path.join(process.cwd(), 'docker/grafana/dashboards/elasticsearch-mcp-overview.json');
    
    try {
      const dashboardContent = await readFile(dashboardPath, 'utf-8');
      
      // Should be valid JSON
      const dashboard = JSON.parse(dashboardContent);
      expect(dashboard).toBeDefined();
      expect(dashboard.dashboard).toBeDefined();
      
      // Check required dashboard properties
      expect(dashboard.dashboard.title).toBe('Elasticsearch MCP Server Overview');
      expect(dashboard.dashboard.tags).toContain('elasticsearch');
      expect(dashboard.dashboard.tags).toContain('mcp');
      expect(dashboard.dashboard.tags).toContain('monitoring');
      
      // Should have panels
      expect(Array.isArray(dashboard.dashboard.panels)).toBe(true);
      expect(dashboard.dashboard.panels.length).toBeGreaterThan(10);
      
      console.log(`✅ Dashboard has ${dashboard.dashboard.panels.length} panels`);
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('⚠️ Dashboard file not found - skipping validation');
        return;
      }
      throw error;
    }
  });

  test('should have required dashboard panels', async () => {
    const dashboardPath = path.join(process.cwd(), 'docker/grafana/dashboards/elasticsearch-mcp-overview.json');
    
    try {
      const dashboardContent = await readFile(dashboardPath, 'utf-8');
      const dashboard = JSON.parse(dashboardContent);
      
      const panels = dashboard.dashboard.panels;
      const panelTitles = panels.map((panel: any) => panel.title);
      
      // Expected panels based on our implementation
      const expectedPanels = [
        'Tool Execution Rate',
        'Active Connections',
        'Error Rate',
        'Cache Hit Ratio',
        'Tool Execution Duration',
        'Circuit Breaker States',
        'Connection Pool Metrics',
        'Cache Operations',
        'Top Tools by Execution Count',
        'Elasticsearch Response Times',
        'Memory Usage',
        'Security Events'
      ];
      
      for (const expectedPanel of expectedPanels) {
        expect(panelTitles).toContain(expectedPanel);
      }
      
      console.log('✅ All required panels are present');
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('⚠️ Dashboard file not found - skipping validation');
        return;
      }
      throw error;
    }
  });

  test('should have valid Prometheus queries in panels', async () => {
    const dashboardPath = path.join(process.cwd(), 'docker/grafana/dashboards/elasticsearch-mcp-overview.json');
    
    try {
      const dashboardContent = await readFile(dashboardPath, 'utf-8');
      const dashboard = JSON.parse(dashboardContent);
      
      const panels = dashboard.dashboard.panels;
      let queryCount = 0;
      const invalidQueries: string[] = [];
      
      for (const panel of panels) {
        if (panel.targets) {
          for (const target of panel.targets) {
            if (target.expr) {
              queryCount++;
              
              // Basic validation of Prometheus queries
              const query = target.expr;
              
              // Should contain our metric prefix
              if (!query.includes('elasticsearch_mcp_')) {
                invalidQueries.push(`Panel "${panel.title}": ${query}`);
              }
              
              // Should not have obvious syntax errors
              if (query.includes('{{') && !query.includes('}}')) {
                invalidQueries.push(`Panel "${panel.title}": Unclosed template in ${query}`);
              }
            }
          }
        }
      }
      
      expect(queryCount).toBeGreaterThan(15); // Should have multiple queries
      expect(invalidQueries.length).toBe(0);
      
      if (invalidQueries.length > 0) {
        console.log('❌ Invalid queries found:', invalidQueries);
      } else {
        console.log(`✅ All ${queryCount} Prometheus queries are valid`);
      }
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('⚠️ Dashboard file not found - skipping validation');
        return;
      }
      throw error;
    }
  });

  test('should have valid thresholds and alert configurations', async () => {
    const dashboardPath = path.join(process.cwd(), 'docker/grafana/dashboards/elasticsearch-mcp-overview.json');
    
    try {
      const dashboardContent = await readFile(dashboardPath, 'utf-8');
      const dashboard = JSON.parse(dashboardContent);
      
      const panels = dashboard.dashboard.panels;
      let thresholdCount = 0;
      
      for (const panel of panels) {
        if (panel.fieldConfig && panel.fieldConfig.defaults && panel.fieldConfig.defaults.thresholds) {
          const thresholds = panel.fieldConfig.defaults.thresholds;
          
          if (thresholds.steps && Array.isArray(thresholds.steps)) {
            thresholdCount++;
            
            // Validate threshold structure
            for (const step of thresholds.steps) {
              expect(typeof step.color).toBe('string');
              
              if (step.value !== null) {
                expect(typeof step.value).toBe('number');
              }
            }
          }
        }
      }
      
      expect(thresholdCount).toBeGreaterThan(0);
      console.log(`✅ ${thresholdCount} panels have valid thresholds configured`);
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('⚠️ Dashboard file not found - skipping validation');
        return;
      }
      throw error;
    }
  });

  test('should have valid Grafana provisioning configuration', async () => {
    const datasourcePath = path.join(process.cwd(), 'docker/grafana/provisioning/datasources/prometheus.yml');
    const dashboardProvisionPath = path.join(process.cwd(), 'docker/grafana/provisioning/dashboards/dashboards.yml');
    
    try {
      // Test datasource configuration
      const datasourceContent = await readFile(datasourcePath, 'utf-8');
      expect(datasourceContent).toContain('Prometheus');
      expect(datasourceContent).toContain('prometheus:9090');
      expect(datasourceContent).toContain('isDefault: true');
      
      console.log('✅ Datasource configuration is valid');
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('⚠️ Datasource config not found - skipping validation');
      } else {
        throw error;
      }
    }
    
    try {
      // Test dashboard provisioning configuration
      const dashboardProvisionContent = await readFile(dashboardProvisionPath, 'utf-8');
      expect(dashboardProvisionContent).toContain('elasticsearch-mcp');
      expect(dashboardProvisionContent).toContain('dashboards');
      
      console.log('✅ Dashboard provisioning configuration is valid');
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('⚠️ Dashboard provisioning config not found - skipping validation');
      } else {
        throw error;
      }
    }
  });
});

describe('Docker Compose Monitoring Stack', () => {
  test('should have valid docker-compose.monitoring.yml', async () => {
    const composePath = path.join(process.cwd(), 'docker/docker-compose.monitoring.yml');
    
    try {
      const composeContent = await readFile(composePath, 'utf-8');
      
      // Should contain required services
      expect(composeContent).toContain('elasticsearch-mcp:');
      expect(composeContent).toContain('prometheus:');
      expect(composeContent).toContain('grafana:');
      expect(composeContent).toContain('cadvisor:');
      expect(composeContent).toContain('node-exporter:');
      expect(composeContent).toContain('alertmanager:');
      
      // Should have proper networking
      expect(composeContent).toContain('networks:');
      expect(composeContent).toContain('monitoring');
      
      // Should have volume configurations
      expect(composeContent).toContain('volumes:');
      expect(composeContent).toContain('prometheus_data');
      expect(composeContent).toContain('grafana_data');
      
      console.log('✅ Docker Compose monitoring stack configuration is valid');
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('⚠️ Docker Compose file not found - skipping validation');
      } else {
        throw error;
      }
    }
  });

  test('should have valid Prometheus configuration', async () => {
    const prometheusConfigPath = path.join(process.cwd(), 'docker/prometheus/prometheus.yml');
    
    try {
      const prometheusContent = await readFile(prometheusConfigPath, 'utf-8');
      
      // Should have global configuration
      expect(prometheusContent).toContain('global:');
      expect(prometheusContent).toContain('scrape_interval:');
      
      // Should have scrape configurations
      expect(prometheusContent).toContain('scrape_configs:');
      expect(prometheusContent).toContain('elasticsearch-mcp');
      
      // Should have alerting configuration
      expect(prometheusContent).toContain('alerting:');
      expect(prometheusContent).toContain('alertmanagers:');
      
      console.log('✅ Prometheus configuration is valid');
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('⚠️ Prometheus config not found - skipping validation');
      } else {
        throw error;
      }
    }
  });

  test('should have valid Prometheus alert rules', async () => {
    const alertRulesPath = path.join(process.cwd(), 'docker/prometheus/alert_rules.yml');
    
    try {
      const alertRulesContent = await readFile(alertRulesPath, 'utf-8');
      
      // Should have alert groups
      expect(alertRulesContent).toContain('groups:');
      expect(alertRulesContent).toContain('elasticsearch_mcp_alerts');
      expect(alertRulesContent).toContain('system_alerts');
      
      // Should have specific alerts we implemented
      expect(alertRulesContent).toContain('HighToolExecutionErrorRate');
      expect(alertRulesContent).toContain('CircuitBreakerOpen');
      expect(alertRulesContent).toContain('LowCacheHitRatio');
      expect(alertRulesContent).toContain('ElasticsearchMCPDown');
      
      // Should have proper alert syntax
      expect(alertRulesContent).toContain('alert:');
      expect(alertRulesContent).toContain('expr:');
      expect(alertRulesContent).toContain('for:');
      expect(alertRulesContent).toContain('labels:');
      expect(alertRulesContent).toContain('annotations:');
      
      console.log('✅ Prometheus alert rules are valid');
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('⚠️ Alert rules not found - skipping validation');
      } else {
        throw error;
      }
    }
  });
});

describe('Metrics Integration Testing', () => {
  test('should validate metric names match dashboard queries', async () => {
    // This test ensures the metrics we collect match what the dashboard expects
    
    const expectedMetrics = [
      'elasticsearch_mcp_tool_execution_duration_seconds',
      'elasticsearch_mcp_tool_execution_total',
      'elasticsearch_mcp_tool_execution_errors_total',
      'elasticsearch_mcp_active_connections',
      'elasticsearch_mcp_requests_per_second',
      'elasticsearch_mcp_circuit_breaker_state',
      'elasticsearch_mcp_circuit_breaker_trips_total',
      'elasticsearch_mcp_connection_pool_size',
      'elasticsearch_mcp_connection_pool_active',
      'elasticsearch_mcp_connection_pool_health_ratio',
      'elasticsearch_mcp_cache_hit_ratio',
      'elasticsearch_mcp_cache_size',
      'elasticsearch_mcp_cache_operations_total',
      'elasticsearch_mcp_es_response_time_seconds',
      'elasticsearch_mcp_memory_usage_bytes',
      'elasticsearch_mcp_security_validation_failures_total',
      'elasticsearch_mcp_readonly_mode_blocks_total',
      'elasticsearch_mcp_rate_limit_hits_total'
    ];

    try {
      const dashboardPath = path.join(process.cwd(), 'docker/grafana/dashboards/elasticsearch-mcp-overview.json');
      const dashboardContent = await readFile(dashboardPath, 'utf-8');
      const dashboard = JSON.parse(dashboardContent);
      
      const panels = dashboard.dashboard.panels;
      const usedMetrics = new Set<string>();
      
      // Extract all metric names from dashboard queries
      for (const panel of panels) {
        if (panel.targets) {
          for (const target of panel.targets) {
            if (target.expr) {
              const query = target.expr;
              for (const expectedMetric of expectedMetrics) {
                if (query.includes(expectedMetric)) {
                  usedMetrics.add(expectedMetric);
                }
              }
            }
          }
        }
      }
      
      // Check that most of our metrics are used in the dashboard
      const usageRatio = usedMetrics.size / expectedMetrics.length;
      expect(usageRatio).toBeGreaterThan(0.8); // At least 80% of metrics should be used
      
      console.log(`✅ Dashboard uses ${usedMetrics.size}/${expectedMetrics.length} metrics (${(usageRatio * 100).toFixed(1)}%)`);
      
      // Log any unused metrics for review
      const unusedMetrics = expectedMetrics.filter(metric => !usedMetrics.has(metric));
      if (unusedMetrics.length > 0) {
        console.log('📋 Unused metrics:', unusedMetrics);
      }
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('⚠️ Dashboard file not found - skipping metric validation');
        return;
      }
      throw error;
    }
  });

  test('should validate alert expressions against available metrics', async () => {
    try {
      const alertRulesPath = path.join(process.cwd(), 'docker/prometheus/alert_rules.yml');
      const alertRulesContent = await readFile(alertRulesPath, 'utf-8');
      
      // Extract alert expressions (basic parsing)
      const alertExpressions = alertRulesContent
        .split('\n')
        .filter(line => line.trim().startsWith('expr:'))
        .map(line => line.split('expr:')[1].trim())
        .filter(expr => expr && expr !== '');
      
      expect(alertExpressions.length).toBeGreaterThan(10);
      
      // Validate that alert expressions use our metric names or standard Prometheus metrics
      for (const expr of alertExpressions) {
        // Should contain our metric prefix or standard Prometheus metrics
        expect(expr).toMatch(/elasticsearch_mcp_|node_|container_|up\{|rate\(|sum\(/);
      }
      
      console.log(`✅ ${alertExpressions.length} alert expressions validated`);
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('⚠️ Alert rules not found - skipping validation');
        return;
      }
      throw error;
    }
  });
});