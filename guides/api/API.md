# Elasticsearch MCP Server API

Version: 1.0.0

## Overview

This is a comprehensive Elasticsearch MCP (Model Context Protocol) Server providing 3+ tools for enterprise-grade Elasticsearch operations.

## Table of Contents

- [Search](#search) (1 tools)
- [Core](#core) (1 tools)
- [Cluster](#cluster) (1 tools)

## Search

Advanced search capabilities including SQL queries, scrolling, and multi-search

**Available Tools (1):**

### `search`

Search documents across Elasticsearch indices with advanced query capabilities

**Tags:** `search`, `read`

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "index": {
      "type": "string",
      "description": "Index name or pattern"
    },
    "query": {
      "type": "object",
      "description": "Elasticsearch query DSL"
    },
    "size": {
      "type": "number",
      "description": "Number of results to return",
      "default": 10
    },
    "from": {
      "type": "number",
      "description": "Offset for pagination",
      "default": 0
    }
  }
}
```

**Examples:**

#### Basic Search

Simple text search across all indices

**Input:**
```json
{
  "query": {
    "match_all": {}
  },
  "size": 10
}
```

**Expected Output:**
```json
{
  "hits": {
    "total": {
      "value": 100
    },
    "hits": [
      {
        "_index": "logs",
        "_id": "1",
        "_source": {
          "message": "example log"
        }
      }
    ]
  }
}
```

#### Filtered Search

Search with filters and specific index

**Input:**
```json
{
  "index": "logs-2024",
  "query": {
    "bool": {
      "must": [
        {
          "match": {
            "level": "error"
          }
        }
      ],
      "filter": [
        {
          "range": {
            "timestamp": {
              "gte": "2024-01-01"
            }
          }
        }
      ]
    }
  }
}
```

---

## Core

Essential Elasticsearch operations including search, mappings, and indices management

**Available Tools (1):**

### `list_indices`

List all available Elasticsearch indices with health and document count information

**Tags:** `core`, `read`

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "format": {
      "type": "string",
      "description": "Output format",
      "enum": [
        "json",
        "table"
      ]
    },
    "health": {
      "type": "string",
      "description": "Filter by health status",
      "enum": [
        "green",
        "yellow",
        "red"
      ]
    }
  }
}
```

**Examples:**

#### List All Indices

Get all indices with basic information

**Input:**
```json
{}
```

**Expected Output:**
```json
[
  {
    "index": "logs-2024.01",
    "health": "green",
    "docs": 1000
  },
  {
    "index": "metrics-2024.01",
    "health": "green",
    "docs": 5000
  }
]
```

---

## Cluster

Cluster monitoring and health management tools

**Available Tools (1):**

### `cluster_health`

Get comprehensive cluster health information including node and shard status

**Tags:** `cluster`, `admin`

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "level": {
      "type": "string",
      "description": "Detail level",
      "enum": [
        "cluster",
        "indices",
        "shards"
      ]
    },
    "wait_for_status": {
      "type": "string",
      "description": "Wait for status",
      "enum": [
        "green",
        "yellow",
        "red"
      ]
    }
  }
}
```

**Examples:**

#### Check Cluster Health

Get overall cluster health status

**Input:**
```json
{}
```

**Expected Output:**
```json
{
  "status": "green",
  "number_of_nodes": 3,
  "active_primary_shards": 10,
  "active_shards": 20
}
```

---

