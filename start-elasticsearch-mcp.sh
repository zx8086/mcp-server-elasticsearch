#!/bin/bash

# Get the directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Run the server with Bun
/Users/SOwusu/.bun/bin/bun run "$DIR/index.ts" --transport stdio 