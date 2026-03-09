# Tool Coverage Strategy

## Current State
- **Total Tools**: 98
- **Tested**: 5 (5.1%)
- **Untested**: 93 (94.9%)

## Coverage Approach: Real Integration Tests Only

### Why Real Tests?
1. **Actual Validation**: Tests prove the tool works with real Elasticsearch
2. **API Compatibility**: Catches version differences and API changes
3. **Error Handling**: Tests real error responses and edge cases
4. **Performance**: Validates timeout handling and large datasets

### Testing Priority

#### Priority 1: Core Read Operations (Target: 100%)
These are safe to test on any cluster and most frequently used:
- `elasticsearch_search` 
- `elasticsearch_list_indices` 
- `elasticsearch_get_mappings` 
- `elasticsearch_count_documents` 
- `elasticsearch_get_document` 
- `elasticsearch_get_index` 
- `elasticsearch_get_cluster_health` 

#### Priority 2: Document Operations (Target: 80%)
Test with dedicated indices:
- `elasticsearch_index_document` 
- `elasticsearch_delete_document` 
- `elasticsearch_update_document` 
- `elasticsearch_bulk_operations` 
- `elasticsearch_multi_get` 

#### Priority 3: Index Management (Target: 60%)
Test with temporary indices:
- `elasticsearch_create_index` 
- `elasticsearch_delete_index` 
- `elasticsearch_index_exists` 
- `elasticsearch_refresh_index` 
- `elasticsearch_update_index_settings` 

#### Priority 4: Advanced Features (Target: 40%)
Complex features that need specific setup:
- ILM operations
- Watcher operations
- SQL operations
- Enrich policies
- Autoscaling

## Test Data Requirements

### Minimal Test Cluster Setup
```yaml
# docker-compose.yml for test environment
version: '3'
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.13.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - ES_JAVA_OPTS=-Xms512m -Xmx512m
    ports:
      - 9200:9200
```

### Test Data Fixtures
1. **Basic Documents**: Simple JSON for CRUD operations
2. **Time Series Data**: Logs with timestamps for date queries
3. **Nested Documents**: Complex structures for aggregations
4. **Large Datasets**: 1000+ docs for pagination testing

## Implementation Plan

### Phase 1: Core Operations (Week 1)
- [ ] Create test fixtures
- [ ] Test all search variations
- [ ] Test all get operations
- [ ] Achieve 100% coverage of read tools

### Phase 2: Write Operations (Week 2)
- [ ] Test document CRUD
- [ ] Test bulk operations
- [ ] Test index management
- [ ] Handle cleanup properly

### Phase 3: Advanced Features (Week 3)
- [ ] Test ILM with policies
- [ ] Test Watcher with simple watches
- [ ] Test SQL queries
- [ ] Test cluster operations

## Test Execution

### Local Development
```bash
# Start Elasticsearch
docker-compose up -d

# Run all tests
bun test

# Run specific category
bun test tests/integration/core-tools.test.ts
```

### CI Pipeline
```yaml
test:
  services:
    - elasticsearch:8.13.0
  script:
    - bun install
    - bun test
```

## Measuring Success

### Coverage Metrics
- **Line Coverage**: Not meaningful with real integration tests
- **Tool Coverage**: Percentage of tools with at least 1 integration test
- **Scenario Coverage**: Critical user paths tested

### Quality Metrics
- **Real Failures Caught**: Bugs found only with real ES
- **API Compatibility**: Version differences detected
- **Performance Issues**: Timeout and size problems found

## Maintenance

### Adding New Tools
1. Create tool implementation
2. Create integration test using template
3. Test with real Elasticsearch
4. Document any special requirements

### Updating Tests
- Run against new ES versions quarterly
- Update test data for new features
- Remove tests for deprecated tools

## Resources Needed

1. **Test Elasticsearch Cluster**
   - Local Docker for development
   - Elastic Cloud for CI ($100/month)

2. **Test Data**
   - Generate realistic datasets
   - Cover edge cases

3. **Time Investment**
   - ~2 hours per tool for comprehensive tests
   - ~200 hours total for 98 tools
   - Can be done incrementally

## Alternative: Hybrid Approach

If 100% real integration tests are not feasible:

1. **Critical Path Testing** (20% of tools, 80% of usage)
   - Full integration tests for top 20 tools
   - Basic smoke tests for others

2. **Contract Testing**
   - Validate tool schemas
   - Check parameter validation
   - Ensure response format

3. **Manual Testing**
   - Document manual test procedures
   - Test before releases
   - User acceptance testing

## Conclusion

Real integration tests are the only way to ensure tools work correctly. While achieving 100% coverage requires significant effort, the investment prevents production failures and provides confidence in the system's reliability.