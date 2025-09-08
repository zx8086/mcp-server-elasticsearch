#!/bin/bash

echo "🔧 Converting all remaining server.tool() calls to server.registerTool()..."

# Find all files that still have server.tool calls
files=$(grep -l "server\.tool(" src/tools/**/*.ts | grep -v "/search.ts" | grep -v "/list_indices.ts" | grep -v "/get_mappings.ts")

count=0
for file in $files; do
    echo "Processing $file..."
    
    # Create a backup
    cp "$file" "$file.backup"
    
    # Use a more targeted approach - convert one pattern at a time
    # This handles the most common pattern: server.tool(name, desc, {schema}, handler);
    
    # First, let's see what we're dealing with
    if grep -q "server\.tool(" "$file"; then
        echo "  Found server.tool() call in $file"
        
        # For now, let's just mark these files for manual review
        echo "  → Needs manual conversion: $file"
        ((count++))
        
        # Restore backup
        mv "$file.backup" "$file"
    else
        # Remove backup if no changes needed
        rm "$file.backup" 2>/dev/null || true
    fi
done

echo
echo "📊 Summary:"
echo "Files needing manual conversion: $count"
echo
echo "✅ The key tools (search, list_indices, get_mappings) are already converted."
echo "✅ The wrapper is updated to handle server.registerTool()."
echo
echo "🔧 Let's test with the converted tools first..."

bun run build
if [ $? -eq 0 ]; then
    echo "✅ Build successful with converted core tools!"
else
    echo "❌ Build failed"
    exit 1
fi