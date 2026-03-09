# Elasticsearch Query Examples for MCP Tools

## Table of Contents
- [Search Tool Query Formats](#search-tool-query-formats)
- [Index Management Queries](#index-management-queries)
- [Document Operations](#document-operations)
- [Mapping and Schema Analysis](#mapping-and-schema-analysis)
- [Cluster Operations](#cluster-operations)
- [SQL Query Examples](#sql-query-examples)
- [Advanced Query Patterns](#advanced-query-patterns)
- [Common Issues and Solutions](#common-issues-and-solutions)
- [Tips for LLMs](#tips-for-llms)

## Search Tool Query Formats

### Basic Match All Query
```json
{
  "index": "*",
  "queryBody": {
    "query": {
      "match_all": {}
    },
    "size": 10
  }
}
```

### Match Query
```json
{
  "index": "logs-*",
  "queryBody": {
    "query": {
      "match": {
        "message": "error"
      }
    },
    "size": 20
  }
}
```

### Bool Query with Must Clauses
```json
{
  "index": "logs-*",
  "queryBody": {
    "query": {
      "bool": {
        "must": [
          {
            "match": {
              "status": 200
            }
          },
          {
            "range": {
              "@timestamp": {
                "gte": "now-1h",
                "lte": "now"
              }
            }
          }
        ]
      }
    },
    "size": 50
  }
}
```

### Complex Bool Query
```json
{
  "index": "logs-*",
  "queryBody": {
    "query": {
      "bool": {
        "must": [
          {
            "term": {
              "level": "error"
            }
          }
        ],
        "filter": [
          {
            "range": {
              "@timestamp": {
                "gte": "now-24h"
              }
            }
          }
        ],
        "must_not": [
          {
            "term": {
              "status": 404
            }
          }
        ]
      }
    },
    "aggs": {
      "status_codes": {
        "terms": {
          "field": "status"
        }
      }
    },
    "size": 100
  }
}
```

### Time-based Error Search
```json
{
  "index": "logs-*",
  "queryBody": {
    "query": {
      "bool": {
        "must": [
          { "range": { "@timestamp": { "gte": "now-1h" } } },
          { "match": { "level": "ERROR" } }
        ]
      }
    },
    "size": 50,
    "sort": [{ "@timestamp": { "order": "desc" } }]
  }
}
```

### Term Query
```json
{
  "index": "users",
  "queryBody": {
    "query": {
      "term": {
        "user.id": "12345"
      }
    }
  }
}
```

### Range Query
```json
{
  "index": "metrics-*",
  "queryBody": {
    "query": {
      "range": {
        "cpu_usage": {
          "gte": 80,
          "lte": 100
        }
      }
    },
    "sort": [
      {
        "@timestamp": {
          "order": "desc"
        }
      }
    ],
    "size": 50
  }
}
```

### Multi-Match Query
```json
{
  "index": "products",
  "queryBody": {
    "query": {
      "multi_match": {
        "query": "laptop",
        "fields": ["name", "description", "category"]
      }
    },
    "highlight": {
      "fields": {
        "name": {},
        "description": {}
      }
    }
  }
}
```

### Aggregation Only Query
```json
{
  "index": "sales-*",
  "queryBody": {
    "size": 0,
    "aggs": {
      "sales_by_day": {
        "date_histogram": {
          "field": "@timestamp",
          "calendar_interval": "day"
        },
        "aggs": {
          "total_revenue": {
            "sum": {
              "field": "amount"
            }
          }
        }
      }
    }
  }
}
```

## Index Management Queries

### List Specific Index Patterns
```json
{
  "indexPattern": "*logs*,*metrics*,*apm*",
  "limit": 100,
  "excludeSystemIndices": false,
  "sortBy": "docs",
  "includeSize": true
}
```

### Get Index Summary by Type
```json
{
  "indexPattern": "logs-*",
  "groupBy": "date"
}
```

## Document Operations

### Get Specific Documents
```json
{
  "index": "logs-2025.01.16",
  "id": "document-id-here"
}
```

### Bulk Index with Routing
```json
{
  "index": "my-index",
  "operations": [
    {"index": {"_id": "1", "routing": "user123"}},
    {"message": "Log entry 1", "user_id": "user123"},
    {"index": {"_id": "2", "routing": "user456"}},
    {"message": "Log entry 2", "user_id": "user456"}
  ]
}
```

## Mapping and Schema Analysis

### Get Field Mappings with Filters
```json
{
  "index": "logs-*",
  "summarize": true,
  "fieldFilter": "message,@timestamp,level,service",
  "maxDepth": 2
}
```

### Analyze Index Structure
```json
{
  "index": "metrics-*",
  "includeMetaFields": false,
  "summarize": false
}
```

## Cluster Operations

### Health Check with Specific Indices
```json
{
  "index": "critical-*",
  "level": "indices"
}
```

### Shard Analysis
```json
{
  "index": "*",
  "summarize": true,
  "includeUnassigned": true,
  "sortBy": "store"
}
```

## SQL Query Examples

### Basic SELECT
```sql
SELECT * FROM logs-* LIMIT 10
```

### WHERE Clause
```sql
SELECT * FROM logs-* WHERE status = 200 AND level = 'info' LIMIT 100
```

### Aggregation
```sql
SELECT status, COUNT(*) as count 
FROM logs-* 
GROUP BY status 
ORDER BY count DESC
```

### Date Range
```sql
SELECT * FROM logs-* 
WHERE "@timestamp" >= NOW() - INTERVAL 1 HOUR 
ORDER BY "@timestamp" DESC 
LIMIT 50
```

## Advanced Query Patterns

### Application Performance Monitoring
```json
{
  "index": "apm-*",
  "queryBody": {
    "query": {
      "bool": {
        "must": [
          { "range": { "transaction.duration.us": { "gte": 1000000 } } },
          { "term": { "transaction.type": "request" } }
        ]
      }
    },
    "aggs": {
      "avg_duration": {
        "avg": { "field": "transaction.duration.us" }
      }
    }
  }
}
```

### Service-specific Metrics
```json
{
  "index": "metrics-*",
  "queryBody": {
    "query": {
      "bool": {
        "must": [
          { "term": { "service.name": "api-service" } },
          { "range": { "@timestamp": { "gte": "now-15m" } } }
        ]
      }
    },
    "aggs": {
      "cpu_usage": {
        "avg": { "field": "system.cpu.percent" }
      }
    }
  }
}
```

### Multi-Index Search with Aggregations
```json
{
  "index": "logs-*,metrics-*",
  "queryBody": {
    "query": {
      "bool": {
        "should": [
          { "match": { "message": "error" } },
          { "range": { "cpu_usage": { "gt": 80 } } }
        ]
      }
    },
    "aggs": {
      "by_index": {
        "terms": { "field": "_index" }
      },
      "error_trends": {
        "date_histogram": {
          "field": "@timestamp",
          "interval": "1h"
        }
      }
    }
  }
}
```

### Performance Analysis Query
```json
{
  "index": "apm-*,metrics-*",
  "queryBody": {
    "query": {
      "bool": {
        "must": [
          { "range": { "@timestamp": { "gte": "now-1d" } } },
          {
            "bool": {
              "should": [
                { "exists": { "field": "transaction.duration.us" } },
                { "exists": { "field": "system.cpu.percent" } }
              ]
            }
          }
        ]
      }
    },
    "aggs": {
      "service_performance": {
        "terms": { "field": "service.name" },
        "aggs": {
          "avg_response_time": {
            "avg": { "field": "transaction.duration.us" }
          }
        }
      }
    }
  }
}
```

## Common Issues and Solutions

### Issue: Escaped Quotes in Query
**Wrong:**
```json
{
  "queryBody": "{\"query\":{\"match\":{\"message\":\"error\"}}}"
}
```

**Correct:**
```json
{
  "queryBody": {
    "query": {
      "match": {
        "message": "error"
      }
    }
  }
}
```

### Issue: Missing Index
Always provide an index pattern. Use `"*"` to search all indices:
```json
{
  "index": "*",
  "queryBody": {
    "query": {
      "match_all": {}
    }
  }
}
```

### Issue: Invalid Query Structure
Ensure the query follows Elasticsearch Query DSL format. The `queryBody` should contain:
- `query`: The actual search query
- `size`: Number of results (optional, default 10)
- `from`: Starting offset (optional, default 0)
- `sort`: Sorting criteria (optional)
- `aggs`: Aggregations (optional)
- `highlight`: Highlighting configuration (optional)

## Tips for LLMs

1. **Always use proper JSON structure** - Don't send escaped JSON strings
2. **Include index parameter** - Even if using wildcard "*"
3. **Use match_all for testing** - Start simple, then add complexity
4. **Check field names** - Ensure fields exist in the target index
5. **Use appropriate query types**:
   - `match` for full-text search
   - `term` for exact matches
   - `range` for numeric/date ranges
   - `bool` for combining multiple conditions
6. **Consider index patterns** - Use wildcards for multiple indices
7. **Optimize aggregations** - Set `size: 0` when only aggregations are needed
8. **Use sorting wisely** - Sort by relevant fields for your use case
9. **Apply filters efficiently** - Use `filter` context for non-scoring queries