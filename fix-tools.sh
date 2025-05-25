#!/bin/bash

# Fix MCP TypeScript issues in all tool files
echo "🔧 Fixing all remaining tool files..."

# Directory containing tool files
TOOLS_DIR="/Users/SOwusu/WebstormProjects/mcp-server-elasticsearch/src/tools"

# Find all .ts files except types.ts
find "$TOOLS_DIR" -name "*.ts" ! -name "types.ts" ! -name "index.ts" | while read -r file; do
    echo "Fixing: $file"
    
    # Fix async function signatures
    sed -i '' 's/async (params: \([^)]*\)): Promise<SearchResult>/async (params: \1, extra?: any): Promise<SearchResult>/g' "$file"
    
    # Fix type: "text" to type: "text" as const
    sed -i '' 's/type: "text"/type: "text" as const/g' "$file"
    
    # Fix withReadOnlyCheck calls for tools that use them
    if grep -q "withReadOnlyCheck" "$file"; then
        # Fix the withReadOnlyCheck wrapper signature
        sed -i '' 's/withReadOnlyCheck("\([^"]*\)", async (params: \([^)]*\)) =>/withReadOnlyCheck("\1", async (params: \2, extra?: any) =>/g' "$file"
    fi
done

echo "✅ All tool files fixed!"
echo "🚀 You can now run: bun run build"
