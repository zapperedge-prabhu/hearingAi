# ACI Folder Zipper - Docker Container

This container provides the Azure Container Instance (ACI) folder zipper service for the Zapper application. It creates zip archives of large directories in Azure Blob Storage using streaming to minimize memory usage.

## 🚀 Quick Start

### Prerequisites
- Azure CLI installed and logged in (`az login`)
- Access to Azure Container Registry (zipperaciacrregistry)
- Proper Azure permissions for container deployment

### Build and Deploy
```bash
# Run the automated build and deploy script
./build-and-deploy.sh

# Or manually:
az acr build --registry zipperaciacrregistry --image folder-zipper:latest .
```

## 🔧 Fixed Docker Build Issues

### Problem
The original Docker build was failing with:
```
npm error The `npm ci` command can only install with an existing package-lock.json
```

### Solutions Applied

1. **Added package-lock.json**: Created proper lockfile with Azure dependencies
2. **Flexible npm install**: Modified Dockerfile to use `npm ci` when lockfile exists, fallback to `npm install`
3. **Optimized Docker layers**: Proper caching and multi-stage approach
4. **Security hardening**: Non-root user, health checks, resource limits

### Key Files
- `Dockerfile`: Production-ready container configuration
- `package-lock.json`: Dependency lockfile for consistent builds
- `.dockerignore`: Excludes unnecessary files from build context
- `build-and-deploy.sh`: Automated deployment script

## 📋 Container Configuration

### Environment Variables
```bash
# Required
ZAPPER_ACI_STORAGE_ACCOUNT=your-storage-account
ZAPPER_ACI_CONTAINER_NAME=your-container
ZAPPER_ACI_DIRECTORY_PATH=path/to/folder
ZAPPER_ACI_OUTPUT_BLOB=output.zip

# Optional
ZAPPER_ACI_SAS_TOKEN=optional-sas-token
ZAPPER_MAX_MEMORY_MB=500
ZAPPER_CONCURRENT_DOWNLOADS=3
ZAPPER_STREAM_THRESHOLD_MB=100
```

### Resource Limits
- **CPU**: 1 vCPU
- **Memory**: 2 GB
- **Runtime**: Node.js 18 Alpine
- **User**: Non-root (zipper:1001)

## 🛠️ Deployment Options

### Option 1: Azure Container Registry Build (Recommended)
```bash
az acr build \
  --registry zipperaciacrregistry \
  --image folder-zipper:latest \
  --file Dockerfile \
  .
```

### Option 2: Local Build + Push
```bash
docker build -t folder-zipper:latest .
docker tag folder-zipper:latest zipperaciacrregistry.azurecr.io/folder-zipper:latest
az acr login --name zipperaciacrregistry
docker push zipperaciacrregistry.azurecr.io/folder-zipper:latest
```

### Option 3: Container Instance Deployment
```bash
az container create \
  --resource-group zapper-rg \
  --name zipper-aci \
  --image zipperaciacrregistry.azurecr.io/folder-zipper:latest \
  --registry-login-server zipperaciacrregistry.azurecr.io \
  --cpu 1 \
  --memory 2 \
  --restart-policy OnFailure \
  --environment-variables \
    NODE_ENV=production \
    ZAPPER_ACI_STORAGE_ACCOUNT=yourstorage \
    ZAPPER_ACI_CONTAINER_NAME=yourcontainer
```

## 🔍 Troubleshooting

### Build Issues
1. **Missing package-lock.json**: Now included and auto-generated if missing
2. **npm ci failures**: Dockerfile falls back to `npm install` automatically
3. **Permission errors**: Container runs as non-root user `zipper:1001`

### Runtime Issues
1. **Authentication**: Uses DefaultAzureCredential or SAS token
2. **Memory limits**: Configurable via `ZAPPER_MAX_MEMORY_MB`
3. **Network timeouts**: Optimized concurrent downloads

### Health Monitoring
- **Health check**: Monitors Node.js process every 30 seconds
- **Logs**: Available via `az container logs --name zipper-aci --resource-group zapper-rg`
- **Metrics**: CPU/Memory usage visible in Azure Portal

## 📊 Performance Optimization

### Memory Management
- Streaming downloads to minimize memory usage
- Configurable memory thresholds
- Automatic garbage collection

### Network Optimization
- Concurrent blob downloads
- Retry logic for failed transfers
- Efficient zip compression

### Azure Integration
- DefaultAzureCredential for seamless authentication
- Managed Identity support
- SAS token fallback for restricted environments

## 🔒 Security Features

- Non-root container execution
- Minimal Alpine Linux base image
- No unnecessary packages or tools
- Environment variable-based configuration
- Azure AD integration for authentication