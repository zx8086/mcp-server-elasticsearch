#!/usr/bin/env bun
import { exec } from 'child_process';

// Stop any existing server processes
console.log("Starting MCP server with SSE transport...");

// Run the server in the background
const serverProcess = exec('bun run dev', (error, stdout, stderr) => {
  if (error) {
    console.error(`Server execution error: ${error}`);
    return;
  }
  console.log(`Server stdout: ${stdout}`);
  console.error(`Server stderr: ${stderr}`);
});

// Give the server a moment to start up
console.log("Waiting for server to start...");
await new Promise(resolve => setTimeout(resolve, 2000));

// Now run the inspector with environment variables to help it connect
console.log("Starting MCP inspector...");
process.env.MCP_PROXY_HOST = "localhost:8081";
process.env.MCP_PROXY_TRANSPORT_TYPE = "sse";
process.env.DANGEROUSLY_OMIT_AUTH = "true";

const inspectorProcess = exec('bun x --bun @modelcontextprotocol/inspector', (error, stdout, stderr) => {
  if (error) {
    console.error(`Inspector execution error: ${error}`);
    return;
  }
  console.log(`Inspector stdout: ${stdout}`);
  console.error(`Inspector stderr: ${stderr}`);
});

// Handle clean shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server and inspector...');
  serverProcess.kill();
  inspectorProcess.kill();
  process.exit(0);
});

console.log("Both server and inspector should now be running.");
console.log("Press Ctrl+C to stop both processes.");

// Keep the script running
await new Promise(() => {});
