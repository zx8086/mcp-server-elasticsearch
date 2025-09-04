# Production Dockerfile for Elasticsearch MCP Server
# Multi-stage build for optimized production image

# ================================
# Build Stage
# ================================
FROM oven/bun:1.2-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package.json bun.lockb ./

# Install dependencies (production only)
RUN bun install --frozen-lockfile --production

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./
COPY biome.json ./
COPY CLAUDE.md ./

# Build the application
RUN bun run build

# Verify the build
RUN ls -la dist/ && test -f dist/index.js

# ================================
# Production Stage
# ================================
FROM oven/bun:1.2-alpine AS production

# Install security updates and utilities
RUN apk update && \
    apk upgrade && \
    apk add --no-cache \
        dumb-init \
        curl \
        ca-certificates && \
    apk del --no-cache \
        apk-tools && \
    rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S mcpuser && \
    adduser -u 1001 -S mcpuser -G mcpuser

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=mcpuser:mcpuser /app/dist ./dist/
COPY --from=builder --chown=mcpuser:mcpuser /app/package.json ./
COPY --from=builder --chown=mcpuser:mcpuser /app/CLAUDE.md ./

# Copy production dependencies
COPY --from=builder --chown=mcpuser:mcpuser /app/node_modules ./node_modules/

# Switch to non-root user
USER mcpuser

# Expose port (if using SSE mode)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD if [ "$MCP_TRANSPORT" = "sse" ]; then \
            curl -f http://localhost:${MCP_PORT:-8080}/health || exit 1; \
        else \
            echo "stdio mode - health check via process"; \
        fi

# Environment variables with secure defaults
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV LOG_FORMAT=json
ENV MCP_TRANSPORT=stdio
ENV MCP_PORT=8080
ENV READ_ONLY_MODE=true
ENV READ_ONLY_STRICT_MODE=true

# Set resource limits
ENV BUN_HEAP_SIZE=512m
ENV BUN_MAX_OLD_SPACE_SIZE=512

# Labels for container metadata
LABEL org.opencontainers.image.title="Elasticsearch MCP Server"
LABEL org.opencontainers.image.description="Production-ready MCP server for Elasticsearch operations"
LABEL org.opencontainers.image.version="0.1.1"
LABEL org.opencontainers.image.vendor="Community"
LABEL org.opencontainers.image.licenses="Apache-2.0"
LABEL org.opencontainers.image.documentation="https://github.com/elastic/mcp-server-elasticsearch"

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Default command - can be overridden
CMD ["bun", "run", "dist/index.js"]