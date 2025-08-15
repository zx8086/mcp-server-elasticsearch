#!/usr/bin/env bun

/**
 * This script creates a simple proxy to connect the MCP Inspector to the 
 * SSE transport of the Elasticsearch MCP Server.
 */

import http from 'http';
import { createProxyServer } from 'http-proxy';
import { logger } from '../src/utils/logger.js';

// Set up the proxy server
const proxy = createProxyServer({});
const PORT = 6278;
const TARGET_PORT = 8081;

// Create the server
const server = http.createServer((req, res) => {
  // Log the request
  logger.info(`Proxy request: ${req.method} ${req.url}`);
  
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // Proxy the request
  proxy.web(req, res, {
    target: `http://localhost:${TARGET_PORT}`,
    changeOrigin: true
  }, (err) => {
    logger.error(`Proxy error: ${err.message}`);
    res.writeHead(500);
    res.end(`Proxy error: ${err.message}`);
  });
});

// Listen on the proxy port
server.listen(PORT, () => {
  console.log(`🔄 MCP Inspector Proxy running on http://localhost:${PORT}`);
  console.log(`⚡ Forwarding requests to http://localhost:${TARGET_PORT}`);
  console.log(`\n📋 Instructions:`);
  console.log(`1. Start your Elasticsearch MCP Server with SSE transport mode in another terminal:`);
  console.log(`   bun run dev`);
  console.log(`\n2. In the MCP Inspector, use these settings:`);
  console.log(`   - MCP URL: http://localhost:${PORT}/mcp`);
  console.log(`   - SSE URL: http://localhost:${PORT}/sse`);
  console.log(`\n3. The proxy will forward requests to your running server.`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down proxy...');
  server.close(() => {
    console.log('Proxy shut down.');
    process.exit(0);
  });
});
