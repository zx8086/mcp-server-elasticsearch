# N8N Connection Troubleshooting Guide

This guide provides specific troubleshooting steps for connecting n8n to the Elasticsearch MCP Server, especially when running in Docker.

## Network Configuration

When n8n is running in Docker with `network_mode: host`, it should be able to access services running on the host machine via localhost. However, sometimes there are subtle networking issues that need to be addressed.

## Connection Testing

1. First, run the connectivity test server:
   ```bash
   bun run connectivity-test
   ```

2. In n8n, create a simple HTTP Request node that connects to:
   ```
   http://localhost:8082/ping
   ```

3. Execute the workflow and check if the connection succeeds. If it does, the basic network connectivity between n8n and your host is working.

4. Now try connecting to the SSE test endpoint:
   ```
   http://localhost:8082/sse-test
   ```
   This should establish an SSE connection. If this works but the MCP SSE connection doesn't, there might be an issue specific to the MCP implementation.

## MCP Client Configuration in n8n

For the MCP Client node in n8n, try these settings:

1. **Standard configuration**:
   - Transport Type: SSE
   - SSE Endpoint URL: `http://localhost:8081/sse`
   - Include All Tools: Yes

2. **Using host IP instead of localhost**:
   - Find your host machine's IP address using `ifconfig` or `ip addr show`
   - Transport Type: SSE
   - SSE Endpoint URL: `http://<YOUR_HOST_IP>:8081/sse`
   - Include All Tools: Yes

3. **Using Docker bridge network IP**:
   - If you're using a custom bridge network instead of host network mode, find the host's IP from within the container
   - Transport Type: SSE
   - SSE Endpoint URL: `http://<DOCKER_HOST_IP>:8081/sse`
   - Include All Tools: Yes

## Checking Server Logs

When attempting to connect from n8n, check the server logs for:

1. Connection attempts from n8n
2. Any error messages
3. The client IP address and user agent information

This information helps identify if n8n is actually reaching your server.

## Adjusting Server Configuration

If n8n is still unable to connect, try these server configuration changes:

1. **Allow connections from all IP addresses**:
   - Ensure your server is binding to `0.0.0.0` (all interfaces)
   - Add explicit CORS headers for the n8n origin

2. **Run the server on a different port**:
   - Sometimes port conflicts can cause connection issues
   - Try a different port like 8083 or 9090

## Firewall Considerations

Check if there are any firewall rules blocking connections:

1. Check host firewall settings:
   ```bash
   sudo ufw status
   # or
   sudo iptables -L
   ```

2. If a firewall is active, ensure ports 8081 and 8082 are allowed.

## Docker Configuration Adjustments

If all else fails, you might need to adjust your Docker configuration:

1. Use a bridge network instead of host network mode
2. Expose the MCP server port explicitly
3. Use the Docker container network gateway address

## Testing Connection from Inside the Container

You can exec into the n8n container and test connectivity directly:

```bash
docker exec -it <n8n_container_id> /bin/bash
curl -v http://<host_ip>:8081/sse
```

This can help diagnose if the issue is specific to n8n's JavaScript environment or a more general networking issue.
