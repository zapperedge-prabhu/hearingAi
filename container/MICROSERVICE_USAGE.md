# HTTP Microservice Usage Guide

## 🚀 What Changed

**Before (Container Job):**
- Used Azure Container Apps Job API to start ephemeral containers
- Passed environment variables via container template
- Required complex Azure REST API calls

**After (HTTP Microservice):**
- Long-running HTTP service listening on port 3000
- Simple POST request with JSON payload
- Direct communication without Azure Job API

## 📡 API Endpoints

### Health Check
```bash
GET /healthz
Response: "OK"
```

### Create Zip Archive
```bash
POST /zip
Content-Type: application/json

{
  "storage_account": "skybridgestorageaccount",
  "container": "container-1", 
  "directory_path": "DonotDelete",
  "output_blob": "zips/DonotDelete-1754324567890.zip",
  "sas_token": "optional-sas-token"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Folder zipper process completed successfully",
  "config": {
    "storage_account": "skybridgestorageaccount",
    "container": "container-1",
    "directory_path": "DonotDelete", 
    "output_blob": "zips/DonotDelete-1754324567890.zip",
    "sas_token_provided": true
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Missing required configuration: storageAccount, containerName, directoryPath, outputBlob",
  "timestamp": "2025-08-04T16:20:35.123Z"
}
```

## 🔧 Backend Service Update Example

```typescript
// New HTTP-based approach (replace existing createZipJob method)
async createZipJob(storageAccount: string, containerName: string, directoryPath: string): Promise<string> {
  const jobId = crypto.randomUUID();
  const outputBlobName = `zips/${directoryPath.replace(/\//g, '-')}-${Date.now()}.zip`;
  
  // Generate SAS token for authentication
  const sasToken = await this.generateSasToken(storageAccount, containerName);
  
  // Call HTTP microservice instead of Azure Job API
  const response = await fetch('http://folder-zipper-service:3000/zip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storage_account: storageAccount,
      container: containerName,
      directory_path: directoryPath,
      output_blob: outputBlobName,
      sas_token: sasToken
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Zip service failed: ${error.error}`);
  }
  
  const result = await response.json();
  console.log('✅ Zip created successfully:', result.message);
  
  return jobId;
}
```

## 🐳 Deployment

```bash
# Build and push the HTTP microservice
cd container
docker build -t zipperaciacrregistry.azurecr.io/folder-zipper-service:latest .
docker push zipperaciacrregistry.azurecr.io/folder-zipper-service:latest

# Deploy as Container App (not Container Job)
az containerapp create \
  --name folder-zipper-service \
  --resource-group agentsrepo \
  --environment zapper-env \
  --image zipperaciacrregistry.azurecr.io/folder-zipper-service:latest \
  --target-port 3000 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 3 \
  --cpu 0.5 \
  --memory 1Gi
```

## ✅ Benefits

1. **Simplified Architecture**: No more Azure Job API complexity
2. **Better Monitoring**: Standard HTTP logs and metrics 
3. **Easier Testing**: Direct HTTP calls for debugging
4. **Auto-scaling**: Container Apps automatically scale based on load
5. **Health Checks**: Built-in `/healthz` endpoint for monitoring