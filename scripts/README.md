# Scripts Directory

## Essential Scripts (Keep in repo)

These scripts are used by package.json and should be committed:

- `validate-config.ts` - Validates environment configuration
- `test-connection.ts` - Tests Elasticsearch connection
- `connectivity-test.js` - Tests connectivity

## Test Scripts (Should NOT be committed)

These scripts contain hardcoded API keys and should be deleted or moved to a local testing directory:

- `test-tracing.ts` - Basic tracing tests
- `test-direct-tracing.ts` - Contains hardcoded LANGSMITH_API_KEY
- `test-enhanced-tracing.ts` - Contains hardcoded LANGSMITH_API_KEY
- `test-all-tools-tracing.ts` - Contains hardcoded LANGSMITH_API_KEY
- `test-session-tracing.ts` - Contains hardcoded LANGSMITH_API_KEY
- `test-built-tracing.ts` - Contains hardcoded LANGSMITH_API_KEY
- `test-mcp-tracing.ts` - May contain sensitive data
- `test-config.ts` - May contain sensitive configuration

## Security Note

Never commit scripts with hardcoded API keys or sensitive credentials. Use environment variables instead.

## Testing Template

`test-tracing.template.ts` - Template for creating local tracing tests without hardcoding API keys

## Running Tests

For testing tracing:

1. Copy the template:
```bash
cp scripts/test-tracing.template.ts scripts/test-tracing-local.ts
```

2. Set your API key in the environment or .env file:
```bash
export LANGSMITH_API_KEY="your-api-key-here"
# OR add to .env file
```

3. Run the test:
```bash
bun run scripts/test-tracing-local.ts
```

Note: `test-tracing-local.ts` and any `test-*.ts` files are gitignored to prevent accidental commits of sensitive data.