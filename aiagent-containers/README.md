# Zapper AI Agent Containers

**Production-ready Docker containers for scalable AI agent processing**

## Overview

This directory contains the Docker containers and deployment templates for Zapper's AI Agent feature. The architecture uses a **two-stage decoupled design** for massive scalability:

- **Stage 1: Detector** - Lightweight Event Grid webhook that enqueues manifests to Azure Queue
- **Stage 2: Processor** - Heavy processor that polls queue and invokes AI services

**Production-tested:** Successfully handles **100,000+ files** with 100% success rate.

## Architecture

```
User triggers AI Agent
       ↓
Zapper creates manifest file in blob storage
       ↓
Event Grid detects blob creation
       ↓
Detector container receives webhook → enqueues to Azure Queue (< 50ms)
       ↓
Azure Queue buffers messages (retry logic, dead-letter queue)
       ↓
Processor containers poll queue → call AI service → write results
       ↓
Auto-scales to 200 instances based on queue depth
```

## Directory Structure

```
aiagent-containers/
├── detector/               # Lightweight Event Grid webhook container
│   ├── detector.js        # Node.js webhook server
│   ├── Dockerfile         # Docker image definition
│   ├── package.json       # Dependencies
│   └── .dockerignore      # Docker ignore rules
├── processor/             # Heavy AI processing container
│   ├── processor.js       # Queue consumer + AI service caller
│   ├── Dockerfile         # Docker image definition
│   ├── package.json       # Dependencies
│   └── .dockerignore      # Docker ignore rules
└── deployment/            # Azure Marketplace ARM templates
    ├── createUIDefinition.json  # Azure Portal deployment UI
    └── mainTemplate.json        # ARM template for infrastructure
```

## Deployment Methods

### Method 1: Azure Marketplace (Recommended)

The easiest way to deploy is via Azure Marketplace using the provided ARM templates.

**What gets deployed:**
- Azure Queue Storage (aiagent-processing-queue)
- Detector Container App (with Event Grid webhook)
- Processor Container App (with queue-based auto-scaling)
- Event Grid System Topic and Subscription (optional)

**Steps:**
1. Publish Docker images to Azure Container Registry
2. Upload ARM templates to Azure Marketplace offer
3. Customers deploy with one click from Azure Portal

### Method 2: Manual Deployment

For testing or custom deployments:

#### Prerequisites
- Azure Container Registry
- Azure Container Apps Environment
- Azure Storage Account
- Docker installed locally

#### Step 1: Build Docker Images

```bash
# Build detector
cd detector
docker build -t yourregistry.azurecr.io/zapper-aiagent-detector:latest .

# Build processor
cd ../processor
docker build -t yourregistry.azurecr.io/zapper-aiagent-processor:latest .
```

#### Step 2: Push to Azure Container Registry

```bash
# Login to ACR
az acr login --name yourregistry

# Push images
docker push yourregistry.azurecr.io/zapper-aiagent-detector:latest
docker push yourregistry.azurecr.io/zapper-aiagent-processor:latest
```

#### Step 3: Deploy with ARM Template

```bash
az deployment group create \
  --resource-group zapper-rg \
  --template-file deployment/mainTemplate.json \
  --parameters resourceName=zapper-aiagent \
               storageAccountName=zapperstorage \
               containerAppEnvironmentId=/subscriptions/.../managedEnvironments/zapper-env \
               containerRegistry=yourregistry.azurecr.io
```

## Configuration

### Detector Container

**Environment Variables:**
- `AZURE_STORAGE_CONNECTION_STRING` - Connection string to storage account (required)
- `PORT` - HTTP port (default: 8080)

**Scaling:**
- Min replicas: 1
- Max replicas: 5 (detector is lightweight, doesn't need many replicas)
- Trigger: HTTP requests

**Endpoint:**
- POST `/api/eventgrid` - Event Grid webhook endpoint
- GET `/health` - Health check endpoint

### Processor Container

**Environment Variables:**
- `AZURE_STORAGE_CONNECTION_STRING` - Connection string to storage account (required)

**Scaling:**
- Min replicas: 0-1 (can scale to zero when queue is empty)
- Max replicas: 50-200 (for enterprise workloads)
- Trigger: Azure Queue depth (default: 10 messages)

**No HTTP endpoints** - this is a background worker that polls Azure Queue

## Event Grid Configuration

The deployment automatically creates an Event Grid subscription that:

1. Monitors blob creation events in the storage account
2. Filters for: `/blobServices/default/containers/data/blobs/aiagent_results/manifests/*.json`
3. Sends webhook to detector container at `/api/eventgrid`

**Manual setup (if not using ARM template):**

```bash
# Get detector webhook URL
DETECTOR_URL=$(az containerapp show \
  --name zapper-aiagent-detector \
  --resource-group zapper-rg \
  --query properties.configuration.ingress.fqdn -o tsv)

# Create Event Grid subscription
az eventgrid event-subscription create \
  --name zapper-aiagent-events \
  --source-resource-id /subscriptions/.../storageAccounts/zapperstorage \
  --endpoint https://$DETECTOR_URL/api/eventgrid \
  --included-event-types Microsoft.Storage.BlobCreated \
  --subject-begins-with /blobServices/default/containers/data/blobs/aiagent_results/manifests/ \
  --subject-ends-with .json
```

## Monitoring

### Logs

**View detector logs:**
```bash
az containerapp logs show \
  --name zapper-aiagent-detector \
  --resource-group zapper-rg \
  --follow
```

**View processor logs:**
```bash
az containerapp logs show \
  --name zapper-aiagent-processor \
  --resource-group zapper-rg \
  --follow
```

### Metrics

**Queue depth:**
```bash
az storage metrics show \
  --account-name zapperstorage \
  --services queue \
  --api QueueMessageCount
```

**Container Apps metrics:**
- CPU usage
- Memory usage
- Replica count
- Request count (detector only)

### Alerts

Configure alerts for:
- Queue depth > 50,000 (backlog building up)
- Processor failures > 5% (AI service issues)
- Detector availability < 99% (webhook not responding)

## Troubleshooting

### Detector Issues

**Event Grid webhook not receiving events:**
1. Check Event Grid subscription is active: `az eventgrid event-subscription show`
2. Verify detector endpoint is accessible: `curl https://<detector-url>/health`
3. Check detector logs for webhook validation handshake

**Messages not being enqueued:**
1. Check storage connection string is correct
2. Verify queue exists: `az storage queue exists --name aiagent-processing-queue`
3. Check detector logs for errors

### Processor Issues

**Messages not being processed:**
1. Check processor replicas are running: `az containerapp replica list`
2. Verify storage connection string is correct
3. Check processor logs for errors

**AI service failures:**
1. Check AI service is accessible from Azure
2. Verify API keys are correct in manifest files
3. Check SAS URLs are not expired (default: 5 minutes)

**Scaling not working:**
1. Verify queue-based scaling rule is configured
2. Check queue depth is above trigger threshold (default: 10)
3. Ensure max replicas is not already reached

## Performance Tuning

### For High Volume (10K+ files)

**Increase processor replicas:**
```bash
az containerapp update \
  --name zapper-aiagent-processor \
  --resource-group zapper-rg \
  --min-replicas 5 \
  --max-replicas 200
```

**Reduce queue length trigger:**
```bash
# Scale up when queue has 5+ messages (faster response)
# Update via ARM template parameter: queueLengthTrigger=5
```

**Increase CPU/memory for processor:**
```bash
az containerapp update \
  --name zapper-aiagent-processor \
  --resource-group zapper-rg \
  --cpu 2.0 \
  --memory 4Gi
```

### For Cost Optimization (Low Volume)

**Enable scale to zero:**
```bash
az containerapp update \
  --name zapper-aiagent-processor \
  --resource-group zapper-rg \
  --min-replicas 0
```

**Reduce max replicas:**
```bash
az containerapp update \
  --name zapper-aiagent-processor \
  --resource-group zapper-rg \
  --max-replicas 10
```

## Testing

### Local Testing with Docker

**Test detector:**
```bash
# Run locally
docker run -p 8080:8080 \
  -e AZURE_STORAGE_CONNECTION_STRING="<connection-string>" \
  yourregistry.azurecr.io/zapper-aiagent-detector:latest

# Test health endpoint
curl http://localhost:8080/health

# Test Event Grid webhook (send validation event)
curl -X POST http://localhost:8080/api/eventgrid \
  -H "Content-Type: application/json" \
  -d '[{"eventType":"Microsoft.EventGrid.SubscriptionValidationEvent","data":{"validationCode":"test123"}}]'
```

**Test processor:**
```bash
# Run locally
docker run \
  -e AZURE_STORAGE_CONNECTION_STRING="<connection-string>" \
  yourregistry.azurecr.io/zapper-aiagent-processor:latest

# Processor will start polling the queue automatically
# Add test messages to queue to trigger processing
```

### Production Testing

**Test with EICAR file:**
1. Upload a test file to Zapper
2. Create AI agent with test endpoint
3. Run AI agent on the file
4. Monitor detector logs for enqueue confirmation
5. Monitor processor logs for processing completion
6. Verify result file is created

**Load testing (100K files):**
See `docs/AI_AGENT_ARCHITECTURE.md` for detailed load testing procedures.

## Cost Estimation

**100,000 file processing cost breakdown:**

| Component | Usage | Cost |
|-----------|-------|------|
| Detector Container | 100K webhooks × 50ms | $0.02 |
| Processor Container | 100K executions × 30s avg | $40.00 |
| Azure Queue Operations | 500K operations | $0.05 |
| Blob Storage | 100K manifest files × 5KB | $0.50 |
| Event Grid | 100K events | $0.10 |
| **Total** | - | **$40.67** |

**Cost per file:** $0.000407 (~$0.41 per 1,000 files)

## Support

For issues or questions:
- **Documentation:** See `docs/AI_AGENT_ARCHITECTURE.md`
- **Admin Guide:** See `docs/ADMIN_REFERENCE.md`
- **GitHub Issues:** [Create an issue](https://github.com/zapper/zapper/issues)

## License

Copyright © 2025 Zapper. All rights reserved.
