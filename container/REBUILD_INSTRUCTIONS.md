# Container Rebuild Instructions

## Why Rebuild is Needed
The container code has been updated to use `ZAPPER_ACA_*` environment variables instead of `ZAPPER_ACI_*` to properly align with Azure Container Apps naming convention.

## What Changed
- `ZAPPER_ACI_STORAGE_ACCOUNT` → `ZAPPER_ACA_STORAGE_ACCOUNT`
- `ZAPPER_ACI_CONTAINER_NAME` → `ZAPPER_ACA_CONTAINER_NAME`
- `ZAPPER_ACI_DIRECTORY_PATH` → `ZAPPER_ACA_DIRECTORY_PATH`
- `ZAPPER_ACI_OUTPUT_BLOB` → `ZAPPER_ACA_OUTPUT_BLOB`
- `ZAPPER_ACI_SAS_TOKEN` → `ZAPPER_ACA_SAS_TOKEN`

## Quick Rebuild Commands
Navigate to the container directory and run:

```bash
cd container
docker build -t zipperaciacrregistry.azurecr.io/folder-zipper:latest .
docker push zipperaciacrregistry.azurecr.io/folder-zipper:latest
```

## Verification
After rebuilding, the container logs should show:
```
📋 ACA Optimized Zipper Configuration:
   Storage Account: skybridgestorageaccount
   Container: container-1
   Directory: [user-specified-folder]
   Output Blob: zips/[folder-name]-[timestamp].zip
   SAS Token: [PROVIDED or NOT PROVIDED]
```

The container will no longer show "Missing required environment variables" errors.