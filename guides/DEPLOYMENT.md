# Production Deployment Guide

This guide provides comprehensive instructions for deploying the Elasticsearch MCP Server in production environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Container Deployment](#container-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Configuration](#configuration)
- [Security Hardening](#security-hardening)
- [Monitoring & Health Checks](#monitoring--health-checks)
- [Scaling & Performance](#scaling--performance)
- [Troubleshooting](#troubleshooting)
- [Maintenance](#maintenance)

## Prerequisites

### System Requirements

- **Container Runtime**: Docker 20.0+ or Podman 3.0+
- **Orchestration**: Kubernetes 1.24+ (if using K8s deployment)
- **Memory**: Minimum 512MB, Recommended 1GB per instance
- **CPU**: Minimum 0.5 cores, Recommended 1+ cores per instance
- **Storage**: 1GB for logs and cache
- **Network**: HTTPS connectivity to Elasticsearch cluster

### Elasticsearch Requirements

- **Version**: Elasticsearch 8.0+ (tested with 8.15.0 and 9.1.3)
- **Authentication**: API Key or Username/Password
- **Network**: Reachable from container/pod network
- **Permissions**: Read permissions minimum, write permissions if needed

### Dependencies

- **Bun Runtime**: 1.2+ (included in container)
- **Node.js**: Not required (Bun replaces Node.js)
- **SSL/TLS**: Certificates if using HTTPS

## Quick Start

### Option 1: Docker Compose (Recommended for testing)

```bash
# Clone the repository
git clone <repository-url>
cd mcp-server-elasticsearch

# Configure environment
cp .env.example .env
# Edit .env with your Elasticsearch configuration

# Start with Docker Compose
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f mcp-server
```

### Option 2: Direct Docker Run

```bash
# Build the image
docker build -t elasticsearch-mcp-server .

# Run the container
docker run -d \
  --name elasticsearch-mcp \
  -p 8080:8080 \
  -e ES_URL="https://your-elasticsearch-cluster.com:9200" \
  -e ES_API_KEY="your-api-key" \
  -e MCP_TRANSPORT="sse" \
  -e READ_ONLY_MODE="true" \
  elasticsearch-mcp-server
```

### Option 3: Kubernetes (Production)

```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -n elasticsearch-mcp
kubectl logs -f deployment/elasticsearch-mcp-server -n elasticsearch-mcp
```

## Container Deployment

### Building the Production Image

```bash
# Build optimized production image
docker build -t elasticsearch-mcp-server:latest .

# Build with specific tag
docker build -t elasticsearch-mcp-server:v0.1.1 .

# Multi-platform build (optional)
docker buildx build --platform linux/amd64,linux/arm64 \
  -t elasticsearch-mcp-server:latest .
```

### Environment Configuration

Create a `.env` file or set environment variables:

```bash
# Required Configuration
ES_URL=https://your-elasticsearch-cluster.com:9200
ES_API_KEY=your_elasticsearch_api_key

# Server Configuration
MCP_TRANSPORT=sse
MCP_PORT=8080
READ_ONLY_MODE=true
READ_ONLY_STRICT_MODE=true

# Performance Configuration
MCP_MAX_QUERY_TIMEOUT=30000
MCP_MAX_RESULTS_PER_QUERY=1000

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

### Docker Run Options

```bash
# Production deployment with all options
docker run -d \
  --name elasticsearch-mcp-production \
  --restart unless-stopped \
  -p 8080:8080 \
  --env-file .env \
  --memory 512m \
  --cpus 1.0 \
  --health-cmd="curl -f http://localhost:8080/health || exit 1" \
  --health-interval=30s \
  --health-timeout=10s \
  --health-retries=3 \
  elasticsearch-mcp-server:latest
```

## Kubernetes Deployment

### Prerequisites

```bash
# Ensure you have kubectl configured
kubectl cluster-info

# Create namespace (if not exists)
kubectl create namespace elasticsearch-mcp
```

### Configuration Steps

1. **Configure Secrets**:

```bash
# Create secrets for sensitive data
kubectl create secret generic elasticsearch-mcp-secrets \
  --namespace=elasticsearch-mcp \
  --from-literal=ES_API_KEY="your_actual_api_key" \
  --from-literal=LANGSMITH_API_KEY="your_langsmith_key"
```

2. **Update Configuration**:

Edit `k8s/configmap.yaml` and `k8s/deployment.yaml` with your specific values:
- Elasticsearch URL
- Resource limits
- Replica count
- Domain names (in ingress.yaml)

3. **Deploy Application**:

```bash
# Apply all manifests
kubectl apply -f k8s/

# Or apply in specific order
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/ingress.yaml # Optional
```

4. **Verify Deployment**:

```bash
# Check all resources
kubectl get all -n elasticsearch-mcp

# Check pod logs
kubectl logs -f deployment/elasticsearch-mcp-server -n elasticsearch-mcp

# Check service
kubectl get svc -n elasticsearch-mcp

# Test health endpoint
kubectl port-forward svc/elasticsearch-mcp-server 8080:80 -n elasticsearch-mcp
curl http://localhost:8080/health
```

### Ingress Configuration (Optional)

If using external access via Ingress:

```bash
# Install NGINX Ingress Controller (if not installed)
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml

# Install cert-manager for SSL (if not installed)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.2/cert-manager.yaml
```

## Configuration

### Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `ES_URL` | *required* | Elasticsearch cluster URL |
| `ES_API_KEY` | *optional* | Elasticsearch API key |
| `ES_USERNAME` | *optional* | Elasticsearch username |
| `ES_PASSWORD` | *optional* | Elasticsearch password |
| `MCP_TRANSPORT` | `stdio` | Transport mode: `stdio` or `sse` |
| `MCP_PORT` | `8080` | Port for SSE mode |
| `READ_ONLY_MODE` | `false` | Enable read-only mode |
| `READ_ONLY_STRICT_MODE` | `true` | Block destructive operations |
| `LOG_LEVEL` | `info` | Logging level: `debug`, `info`, `warn`, `error` |
| `LANGSMITH_TRACING` | `false` | Enable LangSmith tracing |

### Configuration Validation

Before deployment, validate your configuration:

```bash
# Validate configuration and test connectivity
bun run validate-config:full

# For CI/CD environments, use the test runner
bun run scripts/run-working-tests.ts
```

**Testing Excellence**: The server includes a comprehensive testing strategy with 100% TypeError elimination. See `guides/TESTING_STRATEGY_ANALYSIS.md` for the complete validation approach.

### Configuration Best Practices

1. **Security**:
   - Always use `READ_ONLY_MODE=true` in production
   - Use API keys instead of username/password
   - Rotate credentials regularly
   - Use secrets management for sensitive data

2. **Performance**:
   - Set appropriate resource limits
   - Configure connection pooling
   - Use compression for large responses
   - Enable tracing for monitoring

3. **Reliability**:
   - Configure health checks
   - Set up monitoring and alerting
   - Use multiple replicas for high availability
   - Configure proper logging levels

## Security Hardening

### Container Security

1. **Non-root User**:
   The container runs as user `mcpuser` (UID 1001) by default.

2. **Read-only Filesystem**:
   Most of the container filesystem is read-only with temporary directories mounted.

3. **Security Context** (Kubernetes):
```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1001
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop:
    - ALL
```

### Network Security

1. **TLS Configuration**:
   - Always use HTTPS for Elasticsearch connections
   - Configure proper CA certificates
   - Use TLS for ingress traffic

2. **Network Policies** (Kubernetes):
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: elasticsearch-mcp-network-policy
  namespace: elasticsearch-mcp
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: elasticsearch-mcp-server
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: nginx-ingress
    ports:
    - protocol: TCP
      port: 8080
  egress:
  - to: []
    ports:
    - protocol: TCP
      port: 443 # HTTPS to Elasticsearch
    - protocol: TCP
      port: 53 # DNS
    - protocol: UDP
      port: 53 # DNS
```

### Authentication & Authorization

1. **Elasticsearch Authentication**:
   - Prefer API keys over username/password
   - Use principle of least privilege
   - Create dedicated service accounts

2. **Example API Key Creation**:
```bash
# Create API key with read-only permissions
curl -X POST "https://elasticsearch:9200/_security/api_key" \
  -H "Content-Type: application/json" \
  -u elastic:password \
  -d '{
    "name": "mcp-server-readonly",
    "role_descriptors": {
      "mcp_role": {
        "cluster": ["monitor"],
        "indices": [
          {
            "names": ["*"],
            "privileges": ["read", "view_index_metadata"]
          }
        ]
      }
    }
  }'
```

## Monitoring & Health Checks

### Health Check Endpoints

The server provides several health check endpoints:

- `GET /health` - Overall health status
- Health check includes:
  - Elasticsearch connectivity
  - Connection pool status
  - Memory usage
  - Circuit breaker states

### Example Health Response

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "elasticsearch": {
    "status": "healthy",
    "clusterName": "production-cluster",
    "version": "8.15.0",
    "responseTime": 45
  },
  "server": {
    "status": "healthy",
    "uptime": 86400000,
    "memoryUsage": {
      "heapUsed": 134217728,
      "heapTotal": 268435456
    }
  }
}
```

### Monitoring Integration

1. **LangSmith Integration** (Built-in):
```bash
# Enable LangSmith tracing
export LANGSMITH_TRACING=true
export LANGSMITH_API_KEY="your-api-key"
export LANGSMITH_PROJECT="elasticsearch-mcp-production"
```

2. **Custom Metrics Collection**:
The server provides detailed logging that can be collected by:
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Fluentd/Fluent Bit
- Prometheus + Grafana
- DataDog, New Relic, etc.

### Alerting Rules

Create alerts for:
- Pod/container restart frequency
- High memory usage (>80%)
- Elasticsearch connection failures
- Response time degradation
- Circuit breaker trips

## Scaling & Performance

### Horizontal Scaling

The server is stateless and can be scaled horizontally:

```bash
# Scale deployment
kubectl scale deployment elasticsearch-mcp-server --replicas=5 -n elasticsearch-mcp

# Auto-scaling is configured via HPA (k8s/hpa.yaml)
# Scales based on CPU (70%) and memory (80%) utilization
```

### Vertical Scaling

Adjust resource limits based on usage patterns:

```yaml
resources:
  requests:
    memory: "512Mi" # Increase for heavy workloads
    cpu: "500m" # Increase for CPU-intensive operations
  limits:
    memory: "1Gi" # Set appropriate limits
    cpu: "1000m" # Prevent resource starvation
```

### Performance Tuning

1. **Connection Pool Configuration**:
   - Increase connection pool size for high throughput
   - Configure appropriate timeouts
   - Use connection warming for faster startup

2. **Caching Configuration**:
   - Enable response caching for repeated queries
   - Configure appropriate TTL values
   - Monitor cache hit rates

3. **Elasticsearch Optimization**:
   - Use appropriate index settings
   - Configure proper sharding strategy
   - Enable compression for large responses

## Troubleshooting

### Common Issues

#### 1. Connection Refused

```bash
# Check Elasticsearch connectivity
curl -k https://your-elasticsearch:9200/_cluster/health

# Check DNS resolution
nslookup your-elasticsearch-host

# Verify network policies (Kubernetes)
kubectl describe networkpolicy -n elasticsearch-mcp
```

#### 2. Authentication Failures

```bash
# Test API key
curl -H "Authorization: ApiKey your-api-key" \
     https://your-elasticsearch:9200/_cluster/health

# Check secret mounting (Kubernetes)
kubectl get secret elasticsearch-mcp-secrets -n elasticsearch-mcp -o yaml
```

#### 3. High Memory Usage

```bash
# Check container memory usage
docker stats elasticsearch-mcp

# Check Kubernetes metrics
kubectl top pod -n elasticsearch-mcp

# Review memory configuration
grep -i memory k8s/deployment.yaml
```

#### 4. Circuit Breaker Trips

```bash
# Check logs for circuit breaker events
kubectl logs deployment/elasticsearch-mcp-server -n elasticsearch-mcp | grep "circuit"

# Monitor Elasticsearch performance
curl https://your-elasticsearch:9200/_cluster/stats
```

### Debug Mode

Enable debug logging for troubleshooting:

```bash
# Docker
docker run -e LOG_LEVEL=debug elasticsearch-mcp-server

# Kubernetes
kubectl patch deployment elasticsearch-mcp-server -n elasticsearch-mcp \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"mcp-server","env":[{"name":"LOG_LEVEL","value":"debug"}]}]}}}}'
```

### Log Analysis

Key log patterns to monitor:

```bash
# Connection issues
grep "Failed to connect" /var/log/mcp-server.log

# Performance issues
grep "Slow operation" /var/log/mcp-server.log

# Circuit breaker events
grep "Circuit breaker" /var/log/mcp-server.log

# Health check failures
grep "Health check failed" /var/log/mcp-server.log
```

## Maintenance

### Updates and Upgrades

1. **Rolling Updates** (Kubernetes):
```bash
# Update image
kubectl set image deployment/elasticsearch-mcp-server \
  mcp-server=elasticsearch-mcp-server:v0.1.2 \
  -n elasticsearch-mcp

# Check rollout status
kubectl rollout status deployment/elasticsearch-mcp-server -n elasticsearch-mcp

# Rollback if needed
kubectl rollout undo deployment/elasticsearch-mcp-server -n elasticsearch-mcp
```

2. **Zero-downtime Updates** (Docker):
```bash
# Blue-green deployment
docker run -d --name elasticsearch-mcp-new elasticsearch-mcp-server:new
# Test new container
# Switch traffic
# Remove old container
```

### Backup and Recovery

1. **Configuration Backup**:
   - Store all configuration files in version control
   - Backup Kubernetes secrets and configmaps
   - Document environment-specific configurations

2. **Log Retention**:
   - Configure appropriate log retention policies
   - Archive logs for compliance requirements
   - Monitor log volume and storage usage

### Monitoring Checklist

Regular maintenance tasks:

- [ ] Check resource utilization trends
- [ ] Review error rates and patterns
- [ ] Validate health check responses
- [ ] Monitor Elasticsearch cluster health
- [ ] Update security credentials
- [ ] Review and update resource limits
- [ ] Test backup and recovery procedures
- [ ] Update documentation

## Support

For issues and questions:

1. Check the [main README](README.md) for configuration help
2. Review the [troubleshooting section](#troubleshooting) above
3. Check logs for specific error messages
4. Verify Elasticsearch cluster health and connectivity
5. Create an issue in the repository with:
   - Environment details
   - Configuration (sanitized)
   - Error logs
   - Steps to reproduce

## License

This deployment guide is provided under the same license as the main project (Apache 2.0).