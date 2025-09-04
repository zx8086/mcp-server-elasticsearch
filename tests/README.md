# Test Suite

## Philosophy: Real Tests Only

This project **does not use mock tests** for Elasticsearch functionality. Mock tests that pass but fail in production are worse than no tests at all - they provide false confidence and hide real issues.

## Test Categories

### 1. Integration Tests (`integration/`)
- **Require real Elasticsearch connection**
- Test actual document operations, searches, and index management
- Validate that the system works with real Elasticsearch responses
- Located in `tests/integration/real-elasticsearch.test.ts`

### 2. Configuration Tests (`config/`)
- Test environment variable loading using Bun.env
- Validate configuration schema and defaults
- These run without Elasticsearch but test real configuration loading

### 3. Zod Compatibility Tests
- Test the critical Zod 3.x parameter passing fixes
- Validate that complex nested objects pass through correctly
- These test the actual MCP SDK integration layer

### 4. Schema Validation Tests (`schemas/`)
- Validate tool input/output schemas
- Ensure schema compatibility with MCP protocol

## Running Tests

### Prerequisites
1. **Real Elasticsearch instance** (local or remote)
2. Configure connection in `.env`:
```bash
ES_URL=http://localhost:9200
# or with authentication:
ES_API_KEY=your-api-key
# or
ES_USERNAME=elastic
ES_PASSWORD=changeme
```

### Run All Tests
```bash
bun test
```

### Run Specific Test Categories
```bash
# Integration tests (requires Elasticsearch)
bun test tests/integration/

# Configuration tests (no Elasticsearch needed)
bun test tests/config/

# Zod compatibility tests
bun test tests/zod*.test.ts
```

### Skip Integration Tests
If you don't have Elasticsearch available:
```bash
SKIP_INTEGRATION_TESTS=true bun test
```

## Why No Mocks?

1. **False Positives**: Mock tests can pass while real implementation fails
2. **Maintenance Burden**: Mocks need constant updates to match Elasticsearch API changes
3. **Hidden Bugs**: Mocks don't catch issues with:
   - Network timeouts
   - Authentication problems
   - Version incompatibilities
   - Rate limiting
   - Actual query syntax errors
   - Response parsing issues

## Test Coverage

Since we use real integration tests, coverage metrics focus on:
- **Critical paths**: Authentication, search, document operations
- **Error handling**: Real error responses from Elasticsearch
- **Edge cases**: Large responses, timeouts, connection failures

## Adding New Tests

When adding tests:
1. **Use real Elasticsearch** for any functionality tests
2. **No mocks** for Elasticsearch client or responses
3. **Test real scenarios** that users will encounter
4. **Document prerequisites** if specific Elasticsearch setup is needed

## CI/CD Considerations

For CI pipelines:
1. Spin up real Elasticsearch using Docker:
```yaml
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.13.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
```

2. Or use Elastic Cloud for integration testing

Never skip tests in CI - if tests can't run with real dependencies, the deployment should fail.