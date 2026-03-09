#!/usr/bin/env bun
/**
 * Test data generation script for comprehensive testing
 * Creates realistic test data for various test scenarios
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

interface TestDataGenerator {
  generateMockElasticsearchData(): Promise<void>;
  generatePerformanceTestData(): Promise<void>;
  generateSecurityTestData(): Promise<void>;
  generateCacheTestData(): Promise<void>;
  generateIntegrationTestData(): Promise<void>;
}

class ElasticsearchTestDataGenerator implements TestDataGenerator {
  private outputDir: string;

  constructor(outputDir = "test-data") {
    this.outputDir = outputDir;
  }

  async initialize(): Promise<void> {
    await mkdir(this.outputDir, { recursive: true });
    await mkdir(path.join(this.outputDir, "elasticsearch"), { recursive: true });
    await mkdir(path.join(this.outputDir, "performance"), { recursive: true });
    await mkdir(path.join(this.outputDir, "security"), { recursive: true });
    await mkdir(path.join(this.outputDir, "cache"), { recursive: true });
    await mkdir(path.join(this.outputDir, "integration"), { recursive: true });
  }

  async generateMockElasticsearchData(): Promise<void> {
    console.log("Generating Elasticsearch mock data...");

    // Mock cluster health responses
    const clusterHealthResponses = {
      healthy: {
        status: "green",
        timed_out: false,
        number_of_nodes: 3,
        number_of_data_nodes: 3,
        active_primary_shards: 15,
        active_shards: 30,
        relocating_shards: 0,
        initializing_shards: 0,
        unassigned_shards: 0,
        delayed_unassigned_shards: 0,
        number_of_pending_tasks: 0,
        number_of_in_flight_fetch: 0,
        task_max_waiting_in_queue_millis: 0,
        active_shards_percent_as_number: 100.0,
      },
      warning: {
        status: "yellow",
        timed_out: false,
        number_of_nodes: 3,
        number_of_data_nodes: 3,
        active_primary_shards: 15,
        active_shards: 25,
        relocating_shards: 2,
        initializing_shards: 1,
        unassigned_shards: 5,
        delayed_unassigned_shards: 0,
        number_of_pending_tasks: 3,
        number_of_in_flight_fetch: 1,
        task_max_waiting_in_queue_millis: 150,
        active_shards_percent_as_number: 83.3,
      },
      critical: {
        status: "red",
        timed_out: false,
        number_of_nodes: 2,
        number_of_data_nodes: 1,
        active_primary_shards: 10,
        active_shards: 10,
        relocating_shards: 0,
        initializing_shards: 5,
        unassigned_shards: 15,
        delayed_unassigned_shards: 8,
        number_of_pending_tasks: 12,
        number_of_in_flight_fetch: 5,
        task_max_waiting_in_queue_millis: 2500,
        active_shards_percent_as_number: 40.0,
      },
    };

    await writeFile(
      path.join(this.outputDir, "elasticsearch", "cluster-health-responses.json"),
      JSON.stringify(clusterHealthResponses, null, 2),
    );

    // Mock search results
    const searchResults = {
      small_result: {
        took: 15,
        timed_out: false,
        _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
        hits: {
          total: { value: 5, relation: "eq" },
          max_score: 1.0,
          hits: Array.from({ length: 5 }, (_, i) => ({
            _index: "test-logs-2024",
            _type: "_doc",
            _id: `doc_${i + 1}`,
            _score: 1.0 - i * 0.1,
            _source: {
              timestamp: new Date(Date.now() - i * 3600000).toISOString(),
              level: ["INFO", "WARN", "ERROR"][i % 3],
              message: `Test log message ${i + 1}`,
              service: "test-service",
              host: `server-${(i % 3) + 1}`,
            },
          })),
        },
      },
      large_result: {
        took: 125,
        timed_out: false,
        _shards: { total: 5, successful: 5, skipped: 0, failed: 0 },
        hits: {
          total: { value: 10000, relation: "gte" },
          max_score: 2.5,
          hits: Array.from({ length: 1000 }, (_, i) => ({
            _index: "large-dataset-2024",
            _type: "_doc",
            _id: `large_doc_${i + 1}`,
            _score: 2.5 - i * 0.001,
            _source: {
              id: i + 1,
              category: ["A", "B", "C", "D"][i % 4],
              value: Math.random() * 1000,
              tags: [`tag_${i % 10}`, `category_${i % 4}`],
              nested: {
                field1: `nested_value_${i}`,
                field2: Math.floor(Math.random() * 100),
              },
            },
          })),
        },
      },
    };

    await writeFile(
      path.join(this.outputDir, "elasticsearch", "search-results.json"),
      JSON.stringify(searchResults, null, 2),
    );

    // Mock indices information
    const indicesInfo = [
      {
        health: "green",
        status: "open",
        index: "logs-2024.01",
        uuid: "abc123-def456-ghi789",
        pri: "1",
        rep: "1",
        "docs.count": "50000",
        "docs.deleted": "150",
        "store.size": "25.5mb",
        "pri.store.size": "12.7mb",
      },
      {
        health: "yellow",
        status: "open",
        index: "metrics-2024.01",
        uuid: "def456-ghi789-jkl012",
        pri: "2",
        rep: "1",
        "docs.count": "150000",
        "docs.deleted": "500",
        "store.size": "85.2mb",
        "pri.store.size": "42.6mb",
      },
      {
        health: "green",
        status: "open",
        index: "user-data",
        uuid: "ghi789-jkl012-mno345",
        pri: "3",
        rep: "2",
        "docs.count": "25000",
        "docs.deleted": "75",
        "store.size": "15.8mb",
        "pri.store.size": "5.3mb",
      },
    ];

    await writeFile(
      path.join(this.outputDir, "elasticsearch", "indices-info.json"),
      JSON.stringify(indicesInfo, null, 2),
    );

    // Mock mapping responses
    const mappings = {
      "logs-2024.01": {
        mappings: {
          properties: {
            "@timestamp": { type: "date" },
            level: { type: "keyword" },
            message: {
              type: "text",
              analyzer: "standard",
              fields: {
                keyword: { type: "keyword", ignore_above: 256 },
              },
            },
            service: { type: "keyword" },
            host: { type: "keyword" },
            tags: { type: "keyword" },
            metadata: {
              type: "object",
              properties: {
                request_id: { type: "keyword" },
                user_id: { type: "keyword" },
                session_id: { type: "keyword" },
              },
            },
          },
        },
      },
    };

    await writeFile(path.join(this.outputDir, "elasticsearch", "mappings.json"), JSON.stringify(mappings, null, 2));

    console.log("[PASS] Elasticsearch mock data generated");
  }

  async generatePerformanceTestData(): Promise<void> {
    console.log("Generating performance test data...");

    // Performance baselines
    const performanceBaselines = {
      tool_execution_times: {
        search: { avg: 150, p95: 300, p99: 500 },
        list_indices: { avg: 50, p95: 100, p99: 150 },
        cluster_health: { avg: 25, p95: 50, p99: 75 },
        get_mappings: { avg: 75, p95: 150, p99: 200 },
        index_document: { avg: 100, p95: 200, p99: 300 },
        bulk: { avg: 500, p95: 1000, p99: 1500 },
      },
      cache_performance: {
        hit_ratio_baseline: 0.75,
        average_lookup_time: 5,
        cache_size_efficiency: 0.85,
      },
      system_resources: {
        memory_usage_baseline: 0.6,
        cpu_usage_baseline: 0.3,
        connection_pool_efficiency: 0.9,
      },
    };

    await writeFile(
      path.join(this.outputDir, "performance", "baselines.json"),
      JSON.stringify(performanceBaselines, null, 2),
    );

    // Load test scenarios
    const loadTestScenarios = {
      light_load: {
        concurrent_users: 10,
        requests_per_second: 50,
        duration_seconds: 300,
        tools: ["search", "list_indices", "cluster_health"],
        expected_performance: {
          avg_response_time: 200,
          error_rate: 0.01,
          throughput: 45,
        },
      },
      medium_load: {
        concurrent_users: 50,
        requests_per_second: 200,
        duration_seconds: 600,
        tools: ["search", "get_mappings", "index_document", "bulk"],
        expected_performance: {
          avg_response_time: 350,
          error_rate: 0.02,
          throughput: 180,
        },
      },
      heavy_load: {
        concurrent_users: 100,
        requests_per_second: 500,
        duration_seconds: 900,
        tools: ["search", "bulk", "multi_search", "scroll_search"],
        expected_performance: {
          avg_response_time: 750,
          error_rate: 0.05,
          throughput: 400,
        },
      },
    };

    await writeFile(
      path.join(this.outputDir, "performance", "load-scenarios.json"),
      JSON.stringify(loadTestScenarios, null, 2),
    );

    // Performance test datasets
    const testDatasets = {
      small_dataset: {
        documents: 1000,
        size_mb: 5,
        complexity: "simple",
        indices: ["test-small"],
        queries: [{ match_all: {} }, { term: { status: "active" } }, { range: { timestamp: { gte: "now-1h" } } }],
      },
      medium_dataset: {
        documents: 100000,
        size_mb: 250,
        complexity: "moderate",
        indices: ["test-medium-1", "test-medium-2"],
        queries: [
          { bool: { must: [{ term: { category: "important" } }] } },
          { multi_match: { query: "search term", fields: ["title", "content"] } },
          { nested: { path: "metadata", query: { term: { "metadata.type": "log" } } } },
        ],
      },
      large_dataset: {
        documents: 1000000,
        size_mb: 2500,
        complexity: "complex",
        indices: ["test-large-1", "test-large-2", "test-large-3"],
        queries: [
          {
            bool: {
              must: [{ range: { timestamp: { gte: "now-24h" } } }],
              filter: [{ terms: { tags: ["production", "critical"] } }],
              should: [{ match: { message: "error" } }, { match: { message: "warning" } }],
            },
          },
        ],
      },
    };

    await writeFile(
      path.join(this.outputDir, "performance", "test-datasets.json"),
      JSON.stringify(testDatasets, null, 2),
    );

    console.log("[PASS] Performance test data generated");
  }

  async generateSecurityTestData(): Promise<void> {
    console.log("Generating security test data...");

    // Security test scenarios
    const securityScenarios = {
      authentication_tests: [
        {
          name: "valid_api_key",
          type: "success",
          credentials: { api_key: "valid_key_123" },
          expected_outcome: "authenticated",
          user_id: "test-user-1",
        },
        {
          name: "invalid_api_key",
          type: "failure",
          credentials: { api_key: "invalid_key_456" },
          expected_outcome: "authentication_failed",
          expected_error: "Invalid API key",
        },
        {
          name: "expired_api_key",
          type: "failure",
          credentials: { api_key: "expired_key_789" },
          expected_outcome: "authentication_failed",
          expected_error: "API key expired",
        },
      ],
      authorization_tests: [
        {
          name: "read_only_access",
          user_id: "readonly-user",
          permissions: ["read"],
          allowed_tools: ["search", "list_indices", "cluster_health"],
          forbidden_tools: ["index_document", "delete_index", "bulk"],
        },
        {
          name: "admin_access",
          user_id: "admin-user",
          permissions: ["read", "write", "admin"],
          allowed_tools: ["*"],
          forbidden_tools: [],
        },
        {
          name: "limited_write_access",
          user_id: "writer-user",
          permissions: ["read", "write"],
          allowed_tools: ["search", "index_document", "update_document"],
          forbidden_tools: ["delete_index", "cluster_settings"],
        },
      ],
      attack_simulations: [
        {
          name: "brute_force_attack",
          type: "authentication",
          pattern: "multiple_failed_attempts",
          attempts: 20,
          time_window: 60,
          source_ips: ["192.168.1.100", "192.168.1.101"],
          expected_detection: "high_severity_alert",
        },
        {
          name: "privilege_escalation",
          type: "authorization",
          pattern: "unauthorized_access_attempts",
          user_id: "limited-user",
          attempted_tools: ["delete_index", "cluster_settings", "create_user"],
          expected_detection: "medium_severity_alert",
        },
        {
          name: "data_exfiltration",
          type: "data_access",
          pattern: "bulk_data_access",
          user_id: "suspicious-user",
          queries: [
            { size: 10000, index: "*" },
            { scroll: "1m", size: 1000 },
            { _source: ["sensitive_field"], size: 5000 },
          ],
          expected_detection: "critical_severity_alert",
        },
      ],
    };

    await writeFile(
      path.join(this.outputDir, "security", "test-scenarios.json"),
      JSON.stringify(securityScenarios, null, 2),
    );

    // Sample audit events for testing
    const auditEvents = Array.from({ length: 100 }, (_, i) => ({
      timestamp: new Date(Date.now() - i * 60000).toISOString(),
      event_id: `evt_${i + 1}`,
      type: ["AUTHENTICATION", "AUTHORIZATION", "DATA_ACCESS", "SYSTEM"][i % 4],
      action: ["api_key_validation", "tool_access_check", "elasticsearch_query", "health_check"][i % 4],
      user_id: [`user_${(i % 10) + 1}`, "admin", "service_account"][i % 3] || `user_${i % 10}`,
      client_ip: `192.168.1.${(i % 50) + 100}`,
      user_agent: "MCP-Client/1.0",
      outcome: ["success", "failure"][i % 10 === 0 ? 1 : 0], // 10% failure rate
      tool_name: i % 4 === 1 ? ["search", "index_document", "cluster_health"][i % 3] : undefined,
      metadata: {
        request_duration: Math.floor(Math.random() * 1000),
        elasticsearch_index: i % 4 === 2 ? `index_${(i % 5) + 1}` : undefined,
        result_count: i % 4 === 2 ? Math.floor(Math.random() * 10000) : undefined,
      },
    }));

    await writeFile(
      path.join(this.outputDir, "security", "sample-audit-events.json"),
      JSON.stringify(auditEvents, null, 2),
    );

    console.log("[PASS] Security test data generated");
  }

  async generateCacheTestData(): Promise<void> {
    console.log("Generating cache test data...");

    // Cache test scenarios
    const cacheScenarios = {
      access_patterns: [
        {
          name: "frequent_search_pattern",
          type: "search_result",
          key_pattern: "search:{query}:{index}",
          access_frequency: "high",
          ttl_seconds: 300,
          sample_keys: [
            "search:error logs:logs-2024",
            "search:status:active:user-data",
            "search:level:ERROR:application-logs",
          ],
          access_count: 50,
          cache_hit_expected: 0.8,
        },
        {
          name: "mappings_caching",
          type: "mappings",
          key_pattern: "mappings:{index}",
          access_frequency: "medium",
          ttl_seconds: 3600,
          sample_keys: ["mappings:logs-2024.01", "mappings:metrics-2024.01", "mappings:user-data"],
          access_count: 20,
          cache_hit_expected: 0.9,
        },
        {
          name: "cluster_info_caching",
          type: "cluster_info",
          key_pattern: "cluster:{info_type}",
          access_frequency: "low",
          ttl_seconds: 600,
          sample_keys: ["cluster:health", "cluster:stats", "cluster:nodes"],
          access_count: 10,
          cache_hit_expected: 0.6,
        },
      ],
      performance_scenarios: [
        {
          name: "high_volume_caching",
          cache_size: 1000,
          operations: [
            { type: "set", ratio: 0.3 },
            { type: "get", ratio: 0.6 },
            { type: "delete", ratio: 0.1 },
          ],
          concurrent_operations: 100,
          expected_hit_ratio: 0.7,
          expected_avg_response_time: 5,
        },
        {
          name: "cache_eviction_test",
          cache_size: 100,
          items_to_add: 200,
          eviction_policy: "lru",
          expected_evictions: 100,
          access_pattern: "recent_bias",
        },
        {
          name: "intelligent_ttl_test",
          scenarios: [
            { tool: "search", expected_ttl_range: [300, 900] },
            { tool: "get_mappings", expected_ttl_range: [3600, 7200] },
            { tool: "cluster_health", expected_ttl_range: [60, 300] },
          ],
        },
      ],
    };

    await writeFile(path.join(this.outputDir, "cache", "test-scenarios.json"), JSON.stringify(cacheScenarios, null, 2));

    // Sample cache data
    const sampleCacheData = {
      search_results: Array.from({ length: 50 }, (_, i) => ({
        key: `search:query_${i}:index_${i % 5}`,
        value: {
          hits: Array.from({ length: 10 }, (_, j) => ({
            _id: `doc_${i}_${j}`,
            _score: 1.0 - j * 0.1,
            _source: { field: `value_${i}_${j}` },
          })),
          total: { value: 10 + i, relation: "eq" },
        },
        ttl: 300 + i * 10,
        access_count: Math.floor(Math.random() * 20) + 1,
        last_accessed: Date.now() - Math.random() * 3600000,
      })),
      mappings: Array.from({ length: 10 }, (_, i) => ({
        key: `mappings:index_${i}`,
        value: {
          properties: {
            field1: { type: "text" },
            field2: { type: "keyword" },
            timestamp: { type: "date" },
          },
        },
        ttl: 3600,
        access_count: Math.floor(Math.random() * 10) + 1,
        last_accessed: Date.now() - Math.random() * 7200000,
      })),
    };

    await writeFile(path.join(this.outputDir, "cache", "sample-data.json"), JSON.stringify(sampleCacheData, null, 2));

    console.log("[PASS] Cache test data generated");
  }

  async generateIntegrationTestData(): Promise<void> {
    console.log("Generating integration test data...");

    // MCP protocol test messages
    const mcpProtocolMessages = {
      initialization: [
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            clientInfo: { name: "test-client", version: "1.0.0" },
          },
        },
      ],
      tools: [
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        },
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "search",
            arguments: {
              query: { match_all: {} },
              size: 10,
              index: "test-logs",
            },
          },
        },
        {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: {
            name: "cluster_health",
            arguments: {},
          },
        },
      ],
    };

    await writeFile(
      path.join(this.outputDir, "integration", "mcp-protocol-messages.json"),
      JSON.stringify(mcpProtocolMessages, null, 2),
    );

    // Integration test scenarios
    const integrationScenarios = {
      full_workflow: {
        name: "Complete MCP workflow test",
        steps: [
          {
            step: 1,
            action: "initialize_server",
            expected: "server_ready",
          },
          {
            step: 2,
            action: "list_tools",
            expected: "tools_returned",
            min_tools: 10,
          },
          {
            step: 3,
            action: "test_readonly_tools",
            tools: ["search", "list_indices", "cluster_health"],
            expected: "all_succeed",
          },
          {
            step: 4,
            action: "test_monitoring_integration",
            expected: "metrics_recorded",
          },
          {
            step: 5,
            action: "test_caching_behavior",
            expected: "cache_hits_recorded",
          },
        ],
      },
      error_handling: {
        name: "Error handling and recovery",
        scenarios: [
          {
            name: "invalid_tool_call",
            tool: "nonexistent_tool",
            expected_error: "tool_not_found",
          },
          {
            name: "invalid_parameters",
            tool: "search",
            params: { invalid_param: "value" },
            expected_error: "validation_error",
          },
          {
            name: "elasticsearch_connection_error",
            simulate: "connection_failure",
            expected_error: "elasticsearch_unavailable",
          },
        ],
      },
      performance_integration: {
        name: "Performance under integration load",
        concurrent_requests: 20,
        request_types: [
          { tool: "search", weight: 0.4 },
          { tool: "list_indices", weight: 0.2 },
          { tool: "cluster_health", weight: 0.2 },
          { tool: "get_mappings", weight: 0.2 },
        ],
        duration_seconds: 60,
        expected_metrics: {
          avg_response_time: 500,
          error_rate: 0.02,
          cache_hit_ratio: 0.6,
        },
      },
    };

    await writeFile(
      path.join(this.outputDir, "integration", "test-scenarios.json"),
      JSON.stringify(integrationScenarios, null, 2),
    );

    // Environment configurations for testing
    const testEnvironments = {
      local: {
        elasticsearch_url: "http://localhost:9200",
        transport: "stdio",
        log_level: "debug",
        features: {
          monitoring: true,
          caching: true,
          security_audit: true,
          read_only_mode: false,
        },
      },
      ci: {
        elasticsearch_url: "http://elasticsearch:9200",
        transport: "stdio",
        log_level: "error",
        features: {
          monitoring: false,
          caching: true,
          security_audit: false,
          read_only_mode: true,
        },
      },
      staging: {
        elasticsearch_url: "https://staging-es.example.com:443",
        transport: "sse",
        log_level: "info",
        features: {
          monitoring: true,
          caching: true,
          security_audit: true,
          read_only_mode: true,
        },
      },
    };

    await writeFile(
      path.join(this.outputDir, "integration", "test-environments.json"),
      JSON.stringify(testEnvironments, null, 2),
    );

    console.log("[PASS] Integration test data generated");
  }

  async generateAll(): Promise<void> {
    console.log("Generating comprehensive test data...");
    console.log("═".repeat(50));

    await this.initialize();
    await this.generateMockElasticsearchData();
    await this.generatePerformanceTestData();
    await this.generateSecurityTestData();
    await this.generateCacheTestData();
    await this.generateIntegrationTestData();

    // Generate summary
    const summary = {
      generated_at: new Date().toISOString(),
      categories: ["elasticsearch", "performance", "security", "cache", "integration"],
      total_files: 15,
      description: "Comprehensive test data for Elasticsearch MCP Server",
      usage: {
        elasticsearch: "Mock responses for ES client testing",
        performance: "Baselines and scenarios for performance testing",
        security: "Attack simulations and audit event samples",
        cache: "Cache behavior and performance scenarios",
        integration: "End-to-end testing scenarios and MCP protocol messages",
      },
    };

    await writeFile(path.join(this.outputDir, "README.json"), JSON.stringify(summary, null, 2));

    console.log("");
    console.log("Test data generation complete!");
    console.log(`Output directory: ${this.outputDir}`);
    console.log(`Total files generated: ${summary.total_files}`);
    console.log("");
    console.log("Usage:");
    console.log("   Import test data in your tests using:");
    console.log(`   const data = await import('./${this.outputDir}/[category]/[file].json');`);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: bun run scripts/generate-test-data.ts [options]");
    console.log("");
    console.log("Options:");
    console.log("  --output, -o <dir>    Output directory (default: test-data)");
    console.log("  --elasticsearch       Generate only Elasticsearch data");
    console.log("  --performance         Generate only performance data");
    console.log("  --security           Generate only security data");
    console.log("  --cache              Generate only cache data");
    console.log("  --integration        Generate only integration data");
    console.log("  --help, -h           Show this help message");
    console.log("");
    console.log("Examples:");
    console.log("  bun run scripts/generate-test-data.ts");
    console.log("  bun run scripts/generate-test-data.ts --output custom-test-data");
    console.log("  bun run scripts/generate-test-data.ts --performance --cache");
    process.exit(0);
  }

  const outputIndex = args.findIndex((arg) => arg === "--output" || arg === "-o");
  const outputDir = outputIndex !== -1 && args[outputIndex + 1] ? args[outputIndex + 1] : "test-data";

  const generator = new ElasticsearchTestDataGenerator(outputDir);

  // Check for specific category flags
  const categories = ["elasticsearch", "performance", "security", "cache", "integration"];

  const requestedCategories = categories.filter((cat) => args.includes(`--${cat}`));

  if (requestedCategories.length > 0) {
    console.log(`Generating test data for: ${requestedCategories.join(", ")}`);
    await generator.initialize();

    for (const category of requestedCategories) {
      switch (category) {
        case "elasticsearch":
          await generator.generateMockElasticsearchData();
          break;
        case "performance":
          await generator.generatePerformanceTestData();
          break;
        case "security":
          await generator.generateSecurityTestData();
          break;
        case "cache":
          await generator.generateCacheTestData();
          break;
        case "integration":
          await generator.generateIntegrationTestData();
          break;
      }
    }

    console.log("[PASS] Selected test data generated successfully!");
  } else {
    // Generate all data
    await generator.generateAll();
  }
}

// Run if called directly
if (import.meta.main) {
  main().catch(console.error);
}

export { ElasticsearchTestDataGenerator };
