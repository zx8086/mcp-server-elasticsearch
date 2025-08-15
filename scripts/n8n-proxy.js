#!/usr/bin/env bun

/**
 * Simple HTTP to SSE proxy optimized for n8n compatibility
 * This helps bridge any compatibility issues between n8n and the MCP SSE implementation
 */

import http from 'http';
import https from 'https';

// Configuration
const PROXY_PORT = 8085;                   // Port for the proxy
const TARGET_HOST = '192.168.178.4';      // Your machine's IP address
const TARGET_PORT = 8081;                 // Your MCP server port

// Create a server to handle requests
const server = http.createServer(async (req, res) => {
  console.log(`Proxy received request: ${req.method} ${req.url}`);
  
  // Add CORS headers to all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight CORS requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  if (req.url?.startsWith('/sse')) {
    // Handle SSE connection
    if (req.method === 'GET') {
      console.log('Proxying SSE connection');
      
      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      
      // Connect to the target SSE endpoint
      const targetReq = http.request({
        host: TARGET_HOST,
        port: TARGET_PORT,
        path: '/sse',
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'User-Agent': 'n8n-proxy'
        }
      });
      
      // Handle the response from the target
      targetReq.on('response', (targetRes) => {
        console.log(`Connected to target SSE, status: ${targetRes.statusCode}`);
        
        // Forward data to the client
        targetRes.on('data', (chunk) => {
          const data = chunk.toString();
          console.log(`Received from target: ${data}`);
          
          // Look for session ID in the response
          const sessionIdMatch = data.match(/sessionId=([^&"\s]+)/);
          if (sessionIdMatch && sessionIdMatch[1]) {
            // Store the session ID for later use with POST requests
            const sessionId = sessionIdMatch[1];
            console.log(`Extracted session ID: ${sessionId}`);
            
            // Modify the endpoint URL to point to our proxy
            const modifiedData = data.replace(
              /\/mcp\?sessionId=[^&"\s]+/,
              `/mcp?sessionId=${sessionId}`
            );
            
            res.write(modifiedData);
          } else {
            // Forward as-is if no session ID found
            res.write(data);
          }
        });
        
        // Handle close events
        targetRes.on('close', () => {
          console.log('Target SSE connection closed');
          res.end();
        });
        
        targetRes.on('error', (err) => {
          console.error(`Target SSE error: ${err.message}`);
          res.end(`event: error\ndata: {"error":"${err.message}"}\n\n`);
        });
      });
      
      // Handle client disconnect
      req.on('close', () => {
        console.log('Client disconnected from proxy');
        targetReq.destroy();
      });
      
      // Handle errors
      targetReq.on('error', (err) => {
        console.error(`Error connecting to target: ${err.message}`);
        res.end(`event: error\ndata: {"error":"${err.message}"}\n\n`);
      });
      
      // Send the request
      targetReq.end();
    } else {
      // Method not allowed
      res.writeHead(405);
      res.end('Method not allowed');
    }
  } else if (req.url?.startsWith('/mcp')) {
    // Handle MCP endpoint (POST requests)
    if (req.method === 'POST') {
      console.log('Proxying MCP request');
      
      // Extract the session ID from the URL
      const url = new URL(req.url, `http://${req.headers.host}`);
      const sessionId = url.searchParams.get('sessionId');
      
      if (!sessionId) {
        res.writeHead(400);
        res.end('Missing sessionId parameter');
        return;
      }
      
      // Get the request body
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      
      req.on('end', () => {
        // Forward the request to the target
        const targetReq = http.request({
          host: TARGET_HOST,
          port: TARGET_PORT,
          path: `/mcp?sessionId=${sessionId}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          }
        });
        
        // Handle the response
        targetReq.on('response', (targetRes) => {
          // Copy status code and headers
          res.writeHead(targetRes.statusCode, targetRes.headers);
          
          // Forward the response body
          targetRes.pipe(res);
        });
        
        // Handle errors
        targetReq.on('error', (err) => {
          console.error(`Error forwarding MCP request: ${err.message}`);
          res.writeHead(500);
          res.end(JSON.stringify({ error: err.message }));
        });
        
        // Send the request body
        targetReq.write(body);
        targetReq.end();
      });
    } else if (req.method === 'OPTIONS') {
      // Handle preflight requests
      res.writeHead(204);
      res.end();
    } else {
      // Method not allowed
      res.writeHead(405);
      res.end('Method not allowed');
    }
  } else {
    // Not found
    res.writeHead(404);
    res.end('Not found');
  }
});

// Start the server
server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║           n8n-compatible MCP SSE Proxy Server                    ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Proxy now running on http://0.0.0.0:${PROXY_PORT}                    ║
║                                                                  ║
║  In n8n, configure the MCP Client with:                          ║
║    - SSE Endpoint URL: http://192.168.178.4:${PROXY_PORT}/sse           ║
║    - Authentication: None                                        ║
║                                                                  ║
║  Forwarding requests to: http://${TARGET_HOST}:${TARGET_PORT}               ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down proxy...');
  server.close(() => {
    console.log('Proxy shut down.');
    process.exit(0);
  });
});
