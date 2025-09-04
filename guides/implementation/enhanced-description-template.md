# Enhanced Tool Description Template

## Format for Enhanced Descriptions

Since MCP SDK corrupts parameter schemas, we embed ALL parameter documentation directly in descriptions:

```
[Primary purpose and use case]. [Secondary benefits]. 

**Parameters (JSON format):**
- `paramName` (type, required/optional): Description. Default: value. Example: `"example-value"`
- `paramName2` (object, optional): Description. Example: `{"key": "value"}`

**Quick Examples:**
✅ Basic: `{"param1": "value1", "param2": "value2"}`
✅ Advanced: `{"param1": "value1", "param2": {"nested": "object"}}`
✅ Empty for defaults: `{}` (uses: param1="default", param2=defaultObj)

**Common Patterns:**
- Pattern 1: [copy-paste example]
- Pattern 2: [copy-paste example]

Use when: [specific scenarios]. Best for: [primary use cases].
```

## Tool Categories and Enhanced Descriptions

### Core Discovery Tools
Tools for basic Elasticsearch exploration and index discovery.

### Search & Query Tools  
Tools for searching documents and analyzing data.

### Index Management Tools
Tools for managing indices, mappings, and lifecycle.

### Cluster Monitoring Tools
Tools for cluster health, nodes, and performance monitoring.

### Document Operations Tools
Tools for CRUD operations on individual documents.

### Advanced Analytics Tools
Tools for aggregations, term vectors, and complex analysis.

### Administration Tools
Tools for ILM, templates, aliases, and system management.