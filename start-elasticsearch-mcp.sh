#!/bin/bash

# Get the directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Check if required environment variables are set
if [ -z "$ES_URL" ]; then
    echo "Error: ES_URL environment variable is not set"
    exit 1
fi

# Check if Bun is installed
if ! command -v bun &> /dev/null; then
    echo "Error: Bun is not installed"
    exit 1
fi

# Run the server with Bun and capture any errors
echo "Starting Elasticsearch MCP Server..."
bun run "$DIR/index.ts" --transport stdio 2>&1

# Check if the server started successfully
if [ $? -ne 0 ]; then
    echo "Error: Failed to start Elasticsearch MCP Server"
    exit 1
fi 