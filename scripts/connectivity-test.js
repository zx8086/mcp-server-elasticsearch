#!/usr/bin/env bun

import http from 'http';

// Create a simple server that listens on all interfaces and outputs client info
const server = http.createServer((req, res) => {
  const clientInfo = {
    remoteAddress: req.socket.remoteAddress,
    remotePort: req.socket.remotePort,
    method: req.method,
    url: req.url,
    headers: req.headers,
    timestamp: new Date().toISOString()
  };
  
  console.log('Client connection:', JSON.stringify(clientInfo, null, 2));
  
  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  if (req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', message: 'pong', clientInfo }));
    return;
  }
  
  if (req.url === '/sse-test') {
    // SSE endpoint
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    // Send initial message
    res.write('event: connected\ndata: {"status":"connected","sessionId":"test-session"}\n\n');
    
    // Send a message every 5 seconds
    const interval = setInterval(() => {
      res.write(`event: ping\ndata: {"time":"${new Date().toISOString()}"}\n\n`);
    }, 5000);
    
    // Handle client disconnect
    req.on('close', () => {
      clearInterval(interval);
      console.log('SSE client disconnected');
    });
    
    return;
  }
  
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'error', message: 'Not found' }));
});

const PORT = 8082;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Test server listening on all interfaces (0.0.0.0) port ${PORT}`);
  console.log(`Use these URLs to test connectivity:`);
  console.log(`- HTTP ping: http://localhost:${PORT}/ping`);
  console.log(`- SSE test: http://localhost:${PORT}/sse-test`);
});
