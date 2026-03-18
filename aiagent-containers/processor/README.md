# AI Agent Processor Container

HTTP endpoint processor for Zapper AI Agent feature.

## Architecture
- **Simple HTTP endpoint** - No queues, no complexity
- **Synchronous processing** - Returns results immediately
- **Managed identity** - No secrets required
- **Auto-scaling** - 1-5 replicas based on HTTP load

## Building the Docker Image

### Prerequisites
- Docker installed
- Node.js 18+ (for local development)

### Build Command

```bash
# From the processor directory
docker build -t zapper-aiagent-processor:latest .

# Or with your ACR name
docker build -t <your-acr>.azurecr.io/zapper-aiagent-processor:latest .
```

### Push to Azure Container Registry

```bash
# Login to ACR
az acr login --name <your-acr-name>

# Tag the image
docker tag zapper-aiagent-processor:latest <your-acr>.azurecr.io/zapper-aiagent-processor:latest

# Push to ACR
docker push <your-acr>.azurecr.io/zapper-aiagent-processor:latest
```

## Dependencies

- **@azure/storage-blob** - For writing results back to storage
- **@azure/identity** - For managed identity authentication
- **express** - HTTP server
- **axios** - For calling external AI APIs

## Endpoints

### Health Check
```
GET /health
Response: { "status": "healthy", "service": "ai-agent-processor" }
```

### Process AI Job
```
POST /api/process
Body: { "manifest": { ... } }
Response: { "success": true, "result": { ... } }
```

## Environment Variables

- `PORT` - HTTP port (default: 8080)

## Local Development

```bash
# Install dependencies
npm install

# Run locally
npm start

# Test endpoint
curl http://localhost:8080/health
```

## Deployment

This container is deployed as an Azure Container App with:
- Min replicas: 1
- Max replicas: 5
- Scale trigger: 10 concurrent HTTP requests
- Auto-detected endpoint (no manual configuration)
