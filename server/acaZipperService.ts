// Azure Container Apps (ACA) Zipper Service - Manages container jobs for zip operations
import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } from "@azure/storage-blob";
import crypto from "crypto";
import fetch from "node-fetch";
import { buildBlobUrl } from "./utils/blobPath";

interface AcaZipJob {
  jobId: string;
  appName: string;
  storageAccount: string;
  containerName: string;
  directoryPath: string;
  outputBlobName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: Date;
}

class AcaZipperService {
  private credential: DefaultAzureCredential;
  private subscriptionId: string;
  private resourceGroup: string;
  private acaEnvironment: string;
  private zipperImage: string;
  private activeJobs: Map<string, AcaZipJob> = new Map();
  
  // 🔄 Dynamic Container App info caching - loaded once and reused
  private containerAppName: string = 'folder-zipper-aca';  // Default container app name
  private containerPrincipalId: string | null = null;      // Cached managed identity principal ID
  private containerFqdn: string | null = null;             // Cached ingress FQDN for API calls

  constructor() {
    this.credential = new DefaultAzureCredential();
    this.subscriptionId = process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || process.env.AZURE_SUBSCRIPTION_ID || '';
    this.resourceGroup = process.env.ZAPPER_AZURE_RESOURCE_GROUP || process.env.AZURE_RESOURCE_GROUP || 'agentsrepo';
    this.acaEnvironment = process.env.ZAPPER_ACA_ENVIRONMENT || 'zapper-env';
    this.zipperImage = process.env.ZIPPER_IMAGE || 'zapperedgedocker.azurecr.io/folder-zipper:latest';
    
    // Allow development mode without Azure configuration
    const isDevelopment = process.env.NODE_ENV === 'development';
    if (!this.subscriptionId || !this.resourceGroup) {
      if (!isDevelopment) {
        throw new Error('Azure subscription ID and resource group must be configured for ACA deployment');
      } else {
        console.log('🔧 ACA Zipper Service running in development mode - Azure features disabled');
        return;
      }
    }

    console.log('🔧 ACA Zipper Service initialized with:');
    console.log(`   Resource Group: ${this.resourceGroup}`);
    console.log(`   ACA Environment: ${this.acaEnvironment}`);
    console.log(`   Container Image: ${this.zipperImage}`);
    console.log(`   Container App Name: ${this.containerAppName}`);
    console.log(`   📏 Size Threshold: ${this.getZipStrategyThresholdMB()}MB (ACA used for folders >= threshold)`);
  }

  /**
   * Get the configurable threshold for choosing zip strategy (in MB)
   * Folders >= threshold use ACA, smaller folders use in-memory
   */
  private getZipStrategyThresholdMB(): number {
    const threshold = parseInt(process.env.ZAPPER_ZIP_STRATEGY_THRESHOLD_MB || '100', 10);
    return isNaN(threshold) ? 100 : threshold; // Default to 100MB if not configured or invalid
  }

  /**
   * Generate User Delegation SAS token using managed identity (enhanced security)
   * @param req Optional request object for IP restriction support
   */
  private async generateSasToken(storageAccount: string, containerName: string, permissions: string = 'rlcw', req?: any): Promise<string> {
    try {
      // Use DefaultAzureCredential with managed identity for User Delegation SAS
      const blobServiceClient = new BlobServiceClient(
        `https://${storageAccount}.blob.core.windows.net`,
        this.credential
      );

      // Set up time boundaries for SAS token
      const startsOn = new Date();
      const expiresOn = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiration

      // Get User Delegation Key using Azure AD authentication
      console.log(`🔑 [SAS] Requesting User Delegation Key for storage account: ${storageAccount}`);
      const delegationKey = await blobServiceClient.getUserDelegationKey(startsOn, expiresOn);

      // Get client IP for SAS restriction (only if ZAPPER_USE_IP_FOR_SAS=true and request provided)
      let ipRange: { start: string; end: string } | undefined = undefined;
      if (req) {
        // Import getClientIpRange helper from routes (ideally this should be extracted to a shared module)
        // For now, we'll implement it inline since we can't easily import from routes
        if (process.env.ZAPPER_USE_IP_FOR_SAS === 'true' && process.env.ZAPPER_SKIP_SAS_IP_RESTRICTION !== 'true') {
          const getClientIp = (r: any): string => {
            const forwarded = r.headers?.['x-forwarded-for'];
            if (forwarded) {
              return (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0].trim();
            }
            return r.ip || r.socket?.remoteAddress || '0.0.0.0';
          };
          const clientIp = getClientIp(req);
          let cleanIp = clientIp.replace(/^::ffff:/, '');
          
          // Strip port number if present (e.g., 192.168.1.1:4047 -> 192.168.1.1)
          // This handles cases where X-Forwarded-For includes port numbers
          if (cleanIp.includes(':') && cleanIp.split(':').length === 2) {
            cleanIp = cleanIp.split(':')[0];
          }
          
          // Validate that we have a valid IPv4 address
          // Azure Storage SAS only supports IPv4 addresses in ipRange parameter
          const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
          if (ipv4Regex.test(cleanIp)) {
            // Additional validation: ensure each octet is 0-255
            const octets = cleanIp.split('.').map(Number);
            if (!octets.some(octet => isNaN(octet) || octet < 0 || octet > 255)) {
              ipRange = { start: cleanIp, end: cleanIp };
              console.log(`🔑 [ACA-SAS] IP restriction applied: ${cleanIp}`);
            } else {
              console.warn(`🔑 [ACA-SAS] Client IP "${cleanIp}" has invalid octets - skipping IP restriction.`);
            }
          } else {
            console.warn(`🔑 [ACA-SAS] Client IP "${cleanIp}" is not valid IPv4 (likely IPv6). Azure SAS only supports IPv4 - skipping IP restriction.`);
          }
        }
      }

      // Generate User Delegation SAS token
      const sasOptions: any = {
        containerName,
        permissions: BlobSASPermissions.parse(permissions),
        startsOn,
        expiresOn,
      };

      // Add IP restriction if available
      if (ipRange) {
        sasOptions.ipRange = ipRange;
      } else {
        console.log(`🔑 [ACA-SAS] No IP restriction applied`);
      }

      const sasToken = generateBlobSASQueryParameters(
        sasOptions,
        delegationKey,
        storageAccount
      ).toString();

      console.log(`🔑 [SAS] User Delegation SAS token generated successfully for container: ${containerName}`);
      return sasToken;
    } catch (error) {
      console.error(`❌ [SAS] Failed to generate User Delegation SAS token:`, error);
      throw new Error(`Failed to generate SAS token: ${error}`);
    }
  }

  /**
   * Get Azure access token for REST API calls
   */
  private async getAccessToken(): Promise<string> {
    try {
      const tokenResponse = await this.credential.getToken(['https://management.azure.com/.default']);
      return tokenResponse.token;
    } catch (error) {
      console.error('Failed to get Azure access token:', error);
      throw new Error('Azure authentication failed');
    }
  }

  /**
   * 🔍 Ensure we've loaded the container app's principal ID and FQDN
   * This method fetches container app details from Azure and caches them
   * for subsequent API calls. Only makes the API call once per service instance.
   */
  private async ensureContainerAppInfoLoaded(): Promise<void> {
    // 📋 Skip if already loaded - cache hit
    if (this.containerPrincipalId && this.containerFqdn) {
      console.log(`📋 [CONTAINER-INFO] Using cached container app info - PrincipalID: ${this.containerPrincipalId}, FQDN: ${this.containerFqdn}`);
      return;
    }

    console.log(`🔍 [CONTAINER-INFO] Fetching Container App details from Azure for: ${this.containerAppName}`);
    
    try {
      // 🔐 Get access token for Azure Resource Manager API
      const token = await this.getAccessToken();
      
      // 🌐 Build Azure Resource Manager API URL for Container App details
      const url = `https://management.azure.com/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}` + 
                  `/providers/Microsoft.App/containerApps/${this.containerAppName}?api-version=2023-05-01`;
      
      console.log(`🌐 [CONTAINER-INFO] Calling Azure API: ${url}`);
      
      // 📡 Make API call to get container app information
      const res = await fetch(url, { 
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        } 
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`❌ [CONTAINER-INFO] Failed to get Container App info: ${res.status} ${res.statusText}`);
        console.error(`❌ [CONTAINER-INFO] Error details: ${errorText}`);
        throw new Error(`Failed to get Container App info: ${res.status} ${res.statusText}`);
      }

      // 📦 Parse response and extract key information
      const appInfo = await res.json() as any;
      
      // 🆔 Extract managed identity principal ID for role assignments
      this.containerPrincipalId = appInfo.identity?.principalId;
      
      // 🌍 Extract ingress FQDN - try multiple possible locations
      this.containerFqdn = appInfo.properties?.latestRevisionFqdn || 
                          appInfo.properties?.configuration?.ingress?.fqdn ||
                          appInfo.properties?.ingress?.fqdn;

      // 📊 Log the extracted information for debugging
      console.log(`✅ [CONTAINER-INFO] Successfully loaded container app info:`);
      console.log(`   📋 Container App: ${this.containerAppName}`);
      console.log(`   🆔 Principal ID: ${this.containerPrincipalId || 'not found'}`);
      console.log(`   🌍 FQDN: ${this.containerFqdn || 'not found'}`);

      // ⚠️ Warn if critical information is missing
      if (!this.containerPrincipalId) {
        console.warn(`⚠️  [CONTAINER-INFO] No managed identity principal ID found - role assignment may fail`);
      }
      if (!this.containerFqdn) {
        console.warn(`⚠️  [CONTAINER-INFO] No ingress FQDN found - will fall back to environment variable or default`);
      }

    } catch (error) {
      console.error(`❌ [CONTAINER-INFO] Error loading container app info:`, error);
      // 🔄 Don't throw here - let the calling method handle fallbacks
      console.warn(`⚠️  [CONTAINER-INFO] Will use fallback URL configuration`);
    }
  }

  /**
   * Calculate folder size in MB for strategy selection
   * @param storageAccount The storage account name
   * @param containerName The container name  
   * @param directoryPath The directory path to analyze
   * @returns Folder size in MB
   */
  async calculateFolderSizeMB(storageAccount: string, containerName: string, directoryPath: string): Promise<number> {
    try {
      const blobServiceClient = new BlobServiceClient(
        `https://${storageAccount}.blob.core.windows.net`,
        this.credential
      );
      
      const containerClient = blobServiceClient.getContainerClient(containerName);
      
      // List all blobs in the directory path
      const prefix = directoryPath.endsWith('/') ? directoryPath : `${directoryPath}/`;
      const blobIterator = containerClient.listBlobsFlat({ prefix });
      
      let totalSizeBytes = 0;
      let fileCount = 0;
      
      for await (const blob of blobIterator) {
        if (blob.properties.contentLength) {
          totalSizeBytes += blob.properties.contentLength;
          fileCount++;
        }
      }
      
      const sizeMB = totalSizeBytes / (1024 * 1024); // Convert bytes to MB
      console.log(`📏 [SIZE-CHECK] Folder "${directoryPath}" contains ${fileCount} files, total size: ${sizeMB.toFixed(2)}MB`);
      
      return sizeMB;
    } catch (error) {
      console.error(`❌ [SIZE-CHECK] Failed to calculate folder size for ${directoryPath}:`, error);
      // Return a conservative estimate that will trigger ACA if size check fails
      const fallbackMB = 200; 
      console.log(`⚠️ [SIZE-CHECK] Using fallback size: ${fallbackMB}MB (will trigger ACA strategy)`);
      return fallbackMB;
    }
  }

  /**
   * Determine the optimal zip strategy based on folder size
   * @param storageAccount The storage account name
   * @param containerName The container name
   * @param directoryPath The directory path to zip
   * @returns 'aca' for large folders, 'memory' for small folders
   */
  async determineZipStrategy(storageAccount: string, containerName: string, directoryPath: string): Promise<'aca' | 'memory'> {
    // In development mode, always use memory strategy
    if (process.env.NODE_ENV === 'development' && (!this.subscriptionId || !this.resourceGroup)) {
      console.log('🔧 [DEV] Using memory strategy (Azure services not configured)');
      return 'memory';
    }
    
    const folderSizeMB = await this.calculateFolderSizeMB(storageAccount, containerName, directoryPath);
    const thresholdMB = this.getZipStrategyThresholdMB();
    
    const strategy = folderSizeMB >= thresholdMB ? 'aca' : 'memory';
    
    console.log(`🎯 [STRATEGY] Folder size: ${folderSizeMB.toFixed(2)}MB, Threshold: ${thresholdMB}MB → Using ${strategy.toUpperCase()} strategy`);
    
    return strategy;
  }

  /**
   * Create a zip job using Azure Container Apps (for large folders)
   * @param storageAccount The storage account name
   * @param containerName The container name
   * @param directoryPath The directory path to zip
   * @returns Download URL for the created zip file
   */
 async createZipJob(storageAccount: string, containerName: string, directoryPath: string, req?: any): Promise<string> {
  // Build an output blob name that is URL-safe and sortable
  const now = new Date();
  const formattedDate = now.toISOString().replace(/[:.]/g, '-'); 
  const outputBlobName = `zips/${directoryPath.replace(/\//g, '-')}-${formattedDate}.zip`;

  // 🔄 Determine the folder-zipper API endpoint
  let endpoint: string;
  if (process.env.FOLDER_ZIPPER_API_URL) {
    endpoint = process.env.FOLDER_ZIPPER_API_URL;
    console.log(`🔧 [ENDPOINT] Using environment override: ${endpoint}`);
  } else {
    console.log(`🌐 [ENDPOINT] Fetching dynamic endpoint from Azure Container App...`);
    await this.ensureContainerAppInfoLoaded();

    if (this.containerFqdn) {
      endpoint = `https://${this.containerFqdn}/zip`;
      console.log(`✅ [ENDPOINT] Using dynamic endpoint: ${endpoint}`);
    } else {
      endpoint = "https://folder-zipper-aca.icyplant-96cf9957.eastus.azurecontainerapps.io/zip";
      console.warn(`⚠️  [ENDPOINT] Falling back to hardcoded endpoint: ${endpoint}`);
    }
  }

  const payload = {
    storage_account: storageAccount,
    container: containerName,
    directory_path: directoryPath,
    output_blob: outputBlobName
    // NOTE: If you choose the SAS approach (Step B - Option 1), add `sas_token` here.
  };

  console.log(`📦 [API-ZIP] Calling zipper API: ${endpoint}`);
  console.log(`📦 [API-ZIP] Payload:`, payload);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    // Read raw first so we can log proper diagnostics even if it's HTML/text
    const raw = await res.text();

    // Log helper: trim large outputs
    const preview = raw.length > 1200 ? raw.slice(0, 1200) + '…[truncated]' : raw;

    if (!res.ok) {
      console.error(`❌ [API-ZIP] HTTP ${res.status} ${res.statusText}`);
      console.error(`❌ [API-ZIP] Response preview:\n${preview}`);
      // Try extracting structured error if body is JSON
      try {
        const maybeJson = JSON.parse(raw);
        throw new Error(`Zipper API failed: ${res.status} ${res.statusText} :: ${JSON.stringify(maybeJson)}`);
      } catch {
        throw new Error(`Zipper API failed: ${res.status} ${res.statusText} :: ${preview}`);
      }
    }

    // Try to parse JSON; if it isn't JSON, surface the body for quick debugging
    let json: any;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      console.error('❌ [API-ZIP] Non-JSON response preview:\n' + preview);
      throw new Error('Zipper API returned non-JSON response (see logs for preview).');
    }

    if (!json?.success) {
      console.error('❌ [API-ZIP] Reported failure payload:', json);
      throw new Error(json?.error || 'Zipper API reported failure without details.');
    }

    console.log("✅ [API-ZIP] Zipping successful:", json.output_url);

    // ⏱ Generate 30-minute SAS token for direct download (managed identity fallback)
    const sasToken = await this.generateSasToken(storageAccount, containerName, 'r', req); // 'r' = read permission, pass req for IP restriction
    // SECURITY FIX: Use buildBlobUrl helper to properly encode blob paths and handle SAS tokens
    const sasUrl = buildBlobUrl(storageAccount, containerName, outputBlobName, sasToken);

    console.log("🔐 [SAS] Output download URL:", sasUrl);

    return sasUrl;

  } catch (err: any) {
    console.error("❌ [API-ZIP] Error calling zipper API:", err?.stack || err);
    throw new Error("Zipper API call failed");
  }
}

  
  /**
   * Check the status of a zip job using Azure REST API
   */
  async getJobStatus(jobId: string): Promise<{ ready: boolean; downloadUrl?: string; status?: string; error?: string }> {
    const job = this.activeJobs.get(jobId);
    if (!job) {
      return { ready: false, error: 'Job not found' };
    }

    try {
      // Get access token for Azure API calls
      const accessToken = await this.getAccessToken();
      
      // Check ACA job execution status using REST API
      const apiUrl = `https://management.azure.com/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.App/jobs/${job.appName}/executions?api-version=2023-05-01`;
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        return { ready: false, error: `Failed to check job status: ${response.status}` };
      }

      const data = await response.json() as any;
      const executions = data.value || [];
      
      if (executions.length === 0) {
        return { ready: false, status: 'pending', error: 'No executions found' };
      }

      // Get the latest execution
      const latestExecution = executions[0];
      const executionStatus = latestExecution.properties?.status;

      if (executionStatus === 'Succeeded') {
        // Job completed, check if output blob exists
        try {
          const blobServiceClient = new BlobServiceClient(
            `https://${job.storageAccount}.blob.core.windows.net`,
            this.credential
          );
          const containerClient = blobServiceClient.getContainerClient(job.containerName);
          const blobClient = containerClient.getBlobClient(job.outputBlobName);
          
          const exists = await blobClient.exists();
          if (exists) {
            job.status = 'completed';
            
            // Generate download URL (SAS token for temporary access)
            const downloadSas = await this.generateSasToken(job.storageAccount, job.containerName, 'r');
            // SECURITY FIX: Use buildBlobUrl helper to properly encode blob paths and handle SAS tokens
            const downloadUrl = buildBlobUrl(job.storageAccount, job.containerName, job.outputBlobName, downloadSas);
            
            return { ready: true, downloadUrl, status: 'completed' };
          } else {
            return { ready: false, status: 'running', error: 'Output file not yet available' };
          }
        } catch (blobError) {
          console.error('Error checking output blob:', blobError);
          return { ready: false, status: 'running', error: 'Error accessing output file' };
        }
      } else if (executionStatus === 'Failed') {
        job.status = 'failed';
        console.error(`Container job failed for ${jobId}`);
        return { ready: true, status: 'failed', error: 'Job execution failed' };
      } else {
        // Still running or pending
        return { ready: false, status: 'running' };
      }
    } catch (error) {
      console.error(`Failed to check job status for ${jobId}:`, error);
      return { ready: false, error: 'Failed to check job status' };
    }
  }

  /**
   * Check if a blob exists in storage
   */
  private async checkBlobExists(storageAccount: string, containerName: string, blobName: string): Promise<boolean> {
    try {
      const blobServiceClient = new BlobServiceClient(
        `https://${storageAccount}.blob.core.windows.net`,
        this.credential
      );
      
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blobClient = containerClient.getBlobClient(blobName);
      
      return await blobClient.exists();
    } catch (error) {
      console.error('Error checking blob existence:', error);
      return false;
    }
  }

  /**
   * Generate download URL with SAS token for the zipped file
   */
  private async generateDownloadUrl(storageAccount: string, containerName: string, blobName: string): Promise<string> {
    try {
      const sasToken = await this.generateSasToken(storageAccount, containerName, 'r'); // Read-only for download
      // SECURITY FIX: Use buildBlobUrl helper to properly encode blob paths and handle SAS tokens
      return buildBlobUrl(storageAccount, containerName, blobName, sasToken);
    } catch (error) {
      console.error('Failed to generate download URL:', error);
      // SECURITY FIX: Use buildBlobUrl helper even in fallback case
      return buildBlobUrl(storageAccount, containerName, blobName);
    }
  }

  /**
   * Clean up ACA job after completion (using REST API)
   */
  private async cleanupAcaJob(appName: string): Promise<void> {
    console.log(`🧹 Job cleanup not implemented for reusable jobs: ${appName}`);
    // Note: We're using a persistent job "folder-zipper-aca" that doesn't need cleanup
    // Individual executions are automatically cleaned up by Azure Container Apps
  }

  /**
   * Get all active jobs (for monitoring/debugging)
   */
  getActiveJobs(): AcaZipJob[] {
    return Array.from(this.activeJobs.values());
  }

  /**
   * Clean up old completed/failed jobs from memory
   */
  cleanupOldJobs(maxAgeHours: number = 24): void {
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    
    this.activeJobs.forEach((job, jobId) => {
      if (job.createdAt < cutoffTime && (job.status === 'completed' || job.status === 'failed')) {
        this.activeJobs.delete(jobId);
        console.log(`🧹 Cleaned up old job: ${jobId}`);
      }
    });
  }

  /**
   * Assign "Storage Blob Data Contributor" role to the folder-zipper-aca container app's managed identity
   * This is called when new storage accounts are created to ensure ACA has access
   */

  async assignStorageRole(storageAccountName: string): Promise<void> {
    // In development mode, skip role assignment
    if (process.env.NODE_ENV === 'development' && (!this.subscriptionId || !this.resourceGroup)) {
      console.log('🔧 [DEV] Skipping storage role assignment (Azure services not configured)');
      return;
    }
    
    // 🔄 Ensure we have the container app's managed identity principal ID
    await this.ensureContainerAppInfoLoaded();
    if (!this.containerPrincipalId) {
      throw new Error('Container App managed identity principal ID not found - cannot assign storage role');
    }

    const scope = `/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.Storage/storageAccounts/${storageAccountName}`;
    const roleDefinitionId = `/subscriptions/${this.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/ba92f5b4-2d11-453d-a403-e96b0029c9fe`;
    const assignmentId = crypto.randomUUID();
    const url = `https://management.azure.com${scope}/providers/Microsoft.Authorization/roleAssignments/${assignmentId}?api-version=2022-04-01`;

    const body = {
      properties: {
        principalId: this.containerPrincipalId,
        roleDefinitionId,
        principalType: 'ServicePrincipal'
      }
    };

    const token = await this.getAccessToken();
    console.log(`🔐 [ROLE-ASSIGN] Assigning 'Storage Blob Data Contributor' role...`);
    console.log(`   📋 Principal ID: ${this.containerPrincipalId}`);
    console.log(`   🗃️  Storage Account: ${storageAccountName}`);

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errorDetails = await res.text();
      console.error(`❌ [ROLE-ASSIGN] Failed: ${res.status} ${res.statusText}`);
      console.error(`❌ [ROLE-ASSIGN] Details: ${errorDetails}`);
      throw new Error(`Role assignment failed: ${res.status} ${res.statusText}`);
    }

    console.log(`✅ [ROLE-ASSIGN] Successfully assigned storage role to container app`);
  }
}

export const acaZipperService = new AcaZipperService();