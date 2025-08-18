# Elasticsearch MCP Filter Helper

## Common Filter Patterns

### Service-Based Filtering
```json
{
  "index": "*service-name*",
  "queryBody": {
    "query": {
      "bool": {
        "must": [
          {"term": {"service.name": "your-service"}},
          {"range": {"@timestamp": {"gte": "now-1h"}}}
        ]
      }
    }
  }
}
```

### Log Level Filtering
```json
{
  "index": "logs-*", 
  "queryBody": {
    "query": {
      "bool": {
        "must": [
          {"match": {"level": "ERROR"}},
          {"range": {"@timestamp": {"gte": "now-24h"}}}
        ]
      }
    }
  }
}
```

### Performance Metric Filtering
```json
{
  "index": "metrics-*",
  "queryBody": {
    "query": {
      "bool": {
        "must": [
          {"range": {"cpu.percent": {"gte": 80}}},
          {"exists": {"field": "host.name"}}
        ]
      }
    },
    "aggs": {
      "by_host": {
        "terms": {"field": "host.name"}
      }
    }
  }
}
```

## Quick Copy-Paste Filters

### Last Hour Errors
```json
{"index": "logs-*", "queryBody": {"query": {"bool": {"must": [{"match": {"level": "ERROR"}}, {"range": {"@timestamp": {"gte": "now-1h"}}}]}}}}
```

### High CPU Usage
```json
{"index": "metrics-*", "queryBody": {"query": {"range": {"cpu.percent": {"gte": 90}}}}}
```

### Slow Transactions
```json
{"index": "apm-*", "queryBody": {"query": {"range": {"transaction.duration.us": {"gte": 5000000}}}}}
```

### Index Size Analysis
```json
{"indexPattern": "*", "includeSize": true, "sortBy": "size", "limit": 20}
```