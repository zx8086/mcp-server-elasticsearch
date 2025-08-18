# Elasticsearch filter_path Examples for ILM Policies

This document shows how to use the `filter_path` parameter to control response size when querying ILM policies.

## Common filter_path Patterns

### 1. **Exclude Usage Data (Recommended for Large Policies)**
```bash
# Exclude indices and data streams lists
elasticsearch_ilm_get_lifecycle --filterPath "*.version,*.modified_date,*.policy,-*.in_use_by.indices,-*.in_use_by.data_streams"

# Exclude all usage data
elasticsearch_ilm_get_lifecycle --filterPath "*,-*.in_use_by"
```

### 2. **Get Only Policy Structure**
```bash
# Just the policy phases and settings
elasticsearch_ilm_get_lifecycle --filterPath "*.policy"

# Only specific phases
elasticsearch_ilm_get_lifecycle --filterPath "*.policy.phases.hot,*.policy.phases.delete"
```

### 3. **Get Only Metadata**
```bash
# Just version and modification info
elasticsearch_ilm_get_lifecycle --filterPath "*.version,*.modified_date"

# Include policy description
elasticsearch_ilm_get_lifecycle --filterPath "*.version,*.modified_date,*.policy._meta"
```

### 4. **Limited Usage Information**
```bash
# Keep data streams but exclude indices
elasticsearch_ilm_get_lifecycle --filterPath "*,-*.in_use_by.indices"

# Keep only composable templates
elasticsearch_ilm_get_lifecycle --filterPath "*.version,*.policy,*.in_use_by.composable_templates"
```

## Wildcard Patterns

### Single-level Wildcards (`*`)
- `*.version` - All policy versions
- `*.policy.*` - All policy sub-fields
- `*-default_policy.policy` - Policies ending with "-default_policy"

### Multi-level Wildcards (`**`)
- `**.hot` - All "hot" fields at any level
- `**.actions` - All "actions" fields at any level

### Exclusion Patterns (`-`)
- `-*.in_use_by` - Exclude all usage data
- `-**.indices` - Exclude all indices arrays
- `-*.policy.phases.warm` - Exclude warm phase

## Real-world Examples

### Problem: "logs" Policy Too Large
```bash
# Before: Fails with token limit
elasticsearch_ilm_get_lifecycle --policy "logs"

# Solution: Exclude usage data
elasticsearch_ilm_get_lifecycle --policy "logs" --filterPath "*.policy,-*.in_use_by"
```

### Use Case: Policy Comparison
```bash
# Get just the phases for comparison
elasticsearch_ilm_get_lifecycle --filterPath "*.policy.phases"

# Compare retention settings
elasticsearch_ilm_get_lifecycle --filterPath "*.policy.phases.delete.min_age"
```

### Use Case: Quick Overview
```bash
# Get basic info for all policies
elasticsearch_ilm_get_lifecycle --filterPath "*.version,*.modified_date,*.policy._meta.description"
```

## Default Behaviors in MCP Tool

The MCP tool automatically applies smart defaults:

1. **When `includeUsage: false`** (default):
   ```
   filterPath = "*.version,*.modified_date,*.policy,-*.in_use_by.indices,-*.in_use_by.data_streams"
   ```

2. **When `summary: true`** (default):
   ```
   filterPath = "*,-*.in_use_by.composable_templates"
   ```

3. **When `filterPath` is explicitly provided**:
   - User's filter_path takes precedence
   - No automatic filtering applied

## Benefits of filter_path

1. **Server-side Filtering**: Reduces network bandwidth and response time
2. **Precise Control**: Get exactly the fields you need
3. **Prevents Errors**: Avoids token limit issues with large policies
4. **Better Performance**: Less data processing on both server and client
5. **Flexible Queries**: Combine multiple filters for complex needs

## Tips

- Test filter patterns with small policies first
- Use exclusion (`-`) for large fields you don't need
- Combine inclusion and exclusion for precise control
- Remember that filtering happens at the Elasticsearch server level