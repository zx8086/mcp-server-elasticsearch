#!/bin/bash

# Setup script for git hooks
# This creates a pre-commit hook to validate schemas

HOOK_FILE=".git/hooks/pre-commit"

# Create the pre-commit hook
cat > "$HOOK_FILE" << 'EOF'
#!/bin/bash

# Pre-commit hook for MCP Server Elasticsearch
# Validates schemas before allowing commit

echo "🔍 Running pre-commit checks..."

# Check if bun is installed
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed. Please install bun first."
    exit 1
fi

# Run schema validation
echo "🔧 Validating MCP tool schemas..."
bun run validate-schemas
SCHEMA_RESULT=$?

if [ $SCHEMA_RESULT -ne 0 ]; then
    echo ""
    echo "❌ Schema validation failed!"
    echo "📚 Please review the implementation guide:"
    echo "   guides/ZOD_MCP_IMPLEMENTATION_GUIDE.md"
    echo ""
    echo "Common fixes:"
    echo "  1. Use registerTracedTool for automatic conversion"
    echo "  2. Convert z.object() with zodToJsonSchema"
    echo "  3. Use plain objects with Zod validators"
    exit 1
fi

# Run linting if available
if [ -f "package.json" ] && grep -q '"lint"' package.json; then
    echo "📝 Running linter..."
    bun run lint
    if [ $? -ne 0 ]; then
        echo "❌ Linting failed. Please fix the issues before committing."
        exit 1
    fi
fi

echo "✅ All pre-commit checks passed!"
EOF

# Make the hook executable
chmod +x "$HOOK_FILE"

echo "✅ Git pre-commit hook installed successfully!"
echo "📍 Location: $HOOK_FILE"
echo ""
echo "The hook will:"
echo "  • Validate all MCP tool schemas"
echo "  • Run linting checks"
echo "  • Prevent commits with invalid schemas"
echo ""
echo "To bypass the hook (not recommended):"
echo "  git commit --no-verify"