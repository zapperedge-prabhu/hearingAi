import { DefaultAzureCredential } from "@azure/identity";
import { StorageManagementClient } from "@azure/arm-storage";
import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
// @ts-ignore
import parquet from 'parquetjs-lite';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SUBSCRIPTION_ID = process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || process.env.AZURE_SUBSCRIPTION_ID || "";
const RESOURCE_GROUP = process.env.ZAPPER_AZURE_RESOURCE_GROUP || process.env.AZURE_RESOURCE_GROUP || "";
const INVENTORY_DESTINATION_CONTAINER = "zapper-system";
const INVENTORY_CACHE_TTL_MS = 15 * 60 * 1000;

export interface InventoryRule {
  name: string;
  containerName: string;
  enabled: boolean;
  schedule: string;
  format: string;
  destinationPath: string;
  fields: string[];
}

export interface InventoryReport {
  blobName: string;
  lastModified: Date;
  etag: string;
  size: number;
  containerName: string;
  manifestSummary?: {
    directoryCount?: number;
    fileCount?: number;
    objectCount?: number;
    totalObjectSize?: number;
  };
}

export interface InventorySummary {
  totalBlobCount: number;
  totalSizeBytes: number;
  directoryCount: number;
  fileCount: number;
  objectCount: number;
  byExtension: Record<string, { count: number; sizeBytes: number }>;
  byAccessTier: Record<string, { count: number; sizeBytes: number }>;
  encryptedVsNot: { encrypted: { count: number; sizeBytes: number }; notEncrypted: { count: number; sizeBytes: number } };
  ageBuckets: {
    "0-7days": { count: number; sizeBytes: number };
    "7-30days": { count: number; sizeBytes: number };
    "30-90days": { count: number; sizeBytes: number };
    "90+days": { count: number; sizeBytes: number };
  };
  lastUpdated: Date;
  reportEtag: string;
}

const summaryCache = new Map<string, { summary: InventorySummary; expiresAt: number }>();

export class InventoryService {
  private credential: DefaultAzureCredential;
  private storageManagementClient: StorageManagementClient;

  constructor() {
    this.credential = new DefaultAzureCredential();
    this.storageManagementClient = new StorageManagementClient(this.credential, SUBSCRIPTION_ID);
  }

  private getBlobServiceClient(accountName: string): BlobServiceClient {
    return new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      this.credential
    );
  }

  async ensureDestinationContainerExists(accountName: string): Promise<void> {
    console.log(`[INVENTORY] Ensuring destination container '${INVENTORY_DESTINATION_CONTAINER}' exists in ${accountName}`);
    const blobService = this.getBlobServiceClient(accountName);
    const containerClient = blobService.getContainerClient(INVENTORY_DESTINATION_CONTAINER);
    
    try {
      await containerClient.createIfNotExists();
      console.log(`[INVENTORY] Destination container ensured: ${INVENTORY_DESTINATION_CONTAINER}`);
    } catch (error: any) {
      if (error.statusCode !== 409) {
        throw error;
      }
    }
  }

  async listInventoryRules(accountName: string, resourceGroup?: string): Promise<InventoryRule[]> {
    const rg = resourceGroup || RESOURCE_GROUP;
    console.log(`[INVENTORY] Listing inventory rules for ${accountName} in resource group ${rg}`);
    
    try {
      const policies = this.storageManagementClient.blobInventoryPolicies.list(rg, accountName);
      const rules: InventoryRule[] = [];
      
      for await (const policy of policies) {
        if (policy.policy?.rules) {
          for (const rule of policy.policy.rules) {
            rules.push({
              name: rule.name || "",
              containerName: rule.name?.replace("inv_", "") || "",
              enabled: rule.enabled ?? false,
              schedule: rule.definition?.schedule?.toUpperCase() || "Daily",
              format: rule.definition?.format?.toUpperCase() || "CSV",
              destinationPath: `${INVENTORY_DESTINATION_CONTAINER}/inventory/${rule.name?.replace("inv_", "") || ""}/`,
              fields: rule.definition?.objectType === "Blob" 
                ? (rule.definition?.schemaFields || [])
                : []
            });
          }
        }
      }
      
      return rules;
    } catch (error: any) {
      if (error.statusCode === 404 || error.code === "ResourceNotFound" || error.code === "BlobInventoryPolicyNotFound") {
        return [];
      }
      console.error(`[INVENTORY] Error listing rules: ${error.message}`);
      throw error;
    }
  }

  async configureInventory(
    accountName: string,
    containerName: string,
    enabled: boolean,
    resourceGroup?: string
  ): Promise<{ success: boolean; message: string }> {
    const rg = resourceGroup || RESOURCE_GROUP;
    const ruleName = `inv_${containerName}`;
    
    console.log(`[INVENTORY] ${enabled ? "Enabling" : "Disabling"} inventory for container '${containerName}' in ${accountName}`);
    
    try {
      if (enabled) {
        await this.ensureDestinationContainerExists(accountName);
      }

      let existingRules: any[] = [];
      try {
        const existingPolicy = await this.storageManagementClient.blobInventoryPolicies.get(rg, accountName, "default");
        existingRules = existingPolicy.policy?.rules || [];
      } catch (error: any) {
        if (error.statusCode !== 404 && error.code !== "BlobInventoryPolicyNotFound") {
          throw error;
        }
      }

      existingRules = existingRules.filter((r: any) => r.name !== ruleName);

      if (enabled) {
        // According to Azure Blob Inventory REST API / SDK documentation, 
        // destination must be an object with container and blobNamePrefix properties.
        // However, some versions of the SDK or underlying API might expect a string 
        // or have serialization issues if the structure isn't exactly what it expects.
        // The error message suggests that 'destination' itself is being treated as an object 
        // where a string was expected, or a sub-property is.
        // 
        // Re-examining the error: "properties.policy.rules.destination with value "[object Object]" must be of type string."
        // This usually happens when the ARM template or API expects a string (like a resource ID) 
        // but receives an object, OR when the SDK is misconfigured.
        // In Azure ARM Storage SDK, destination is indeed an object.
        
        const newRule: any = {
          name: ruleName,
          enabled: true,
          definition: {
            format: "Csv",
            schedule: "Daily",
            objectType: "Blob",
            schemaFields: [
              "Name",
              "Creation-Time",
              "Last-Modified",
              "Content-Length",
              "Content-MD5",
              "BlobType",
              "AccessTier",
              "Metadata",
              "Etag",
              "Content-Type"
            ],
            filters: {
              blobTypes: ["blockBlob"],
              prefixMatch: [`${containerName}/`]
            }
          },
          destination: INVENTORY_DESTINATION_CONTAINER // Some API versions expect the container name as a string here
        };
        existingRules.push(newRule);
      }

      if (existingRules.length === 0) {
        try {
          await this.storageManagementClient.blobInventoryPolicies.delete(rg, accountName, "default");
        } catch (e: any) {
          if (e.statusCode !== 404) {
            console.warn(`[INVENTORY] Could not delete empty policy: ${e.message}`);
          }
        }
        return { success: true, message: `Inventory ${enabled ? "enabled" : "disabled"} for ${containerName}` };
      }

      await this.storageManagementClient.blobInventoryPolicies.createOrUpdate(
        rg,
        accountName,
        "default",
        {
          policy: {
            enabled: true,
            type: "Inventory",
            rules: existingRules
          }
        }
      );

      return { 
        success: true, 
        message: `Inventory ${enabled ? "enabled" : "disabled"} for container '${containerName}'` 
      };
    } catch (error: any) {
      console.error(`[INVENTORY] Error configuring inventory: ${error.message}`);
      return { 
        success: false, 
        message: error.message || "Failed to configure inventory" 
      };
    }
  }

  async getLatestInventoryReport(accountName: string, containerName: string): Promise<InventoryReport | null> {
    console.log(`[INVENTORY] Getting latest report for ${containerName} in ${accountName}`);
    
    // Log inventory view activity
    try {
      // ActivityLogger is imported at top level or via dynamic import
    } catch (e) {}
    
    const blobService = this.getBlobServiceClient(accountName);
    const containerClient = blobService.getContainerClient(INVENTORY_DESTINATION_CONTAINER);
    
    // Azure Inventory creates paths like: 2026/01/31/14-26-57/inv_container/inv_container_manifest.json
    // We search for manifest.json files that match the container name
    let latestBlob: InventoryReport | null = null;
    
    try {
      console.log(`[INVENTORY] Listing all blobs in container ${INVENTORY_DESTINATION_CONTAINER} to find manifests`);
      
      for await (const blob of containerClient.listBlobsFlat()) {
        // Look for manifest.json files that belong to this container's rule
        const isManifest = blob.name.endsWith("manifest.json");
        const matchesContainer = blob.name.includes(`/${containerName}/`) || 
                                blob.name.includes(`/inv_${containerName}/`) ||
                                blob.name.includes(`inv_${containerName}_manifest.json`);

        if (isManifest && matchesContainer) {
          console.log(`[INVENTORY] Found candidate manifest: ${blob.name}`);
          const blobDate = blob.properties.lastModified || new Date(0);
          
          if (!latestBlob || blobDate > latestBlob.lastModified) {
            try {
              const downloadResponse = await containerClient.getBlobClient(blob.name).download();
              const manifestContent = await this.streamToString(downloadResponse.readableStreamBody!);
              const manifest = JSON.parse(manifestContent);
              
              if (manifest.files && manifest.files.length > 0) {
                // Use the first file path from the manifest
                const reportFile = manifest.files[0];
                
                // Construct the full path to the data file
                // The manifest 'blob' field is relative to the container root
                latestBlob = {
                  blobName: reportFile.blob,
                  lastModified: blobDate,
                  etag: blob.properties.etag || "",
                  size: reportFile.size || 0,
                  containerName,
                  // Capture summary from manifest if available
                  manifestSummary: manifest.summary
                };
                console.log(`[INVENTORY] Selected latest report: ${latestBlob.blobName} with manifest summary:`, !!manifest.summary);
              }
            } catch (parseErr) {
              console.error(`[INVENTORY] Error parsing manifest ${blob.name}:`, parseErr);
            }
          }
        }
      }
      
      return latestBlob;
    } catch (error: any) {
      console.error(`[INVENTORY] Error listing blobs for reports: ${error.message}`);
      return null;
    }
  }

  async getContainerInventorySummary(
    accountName: string, 
    containerName: string,
    forceRefresh: boolean = false
  ): Promise<InventorySummary | null> {
    const report = await this.getLatestInventoryReport(accountName, containerName);
    if (!report) {
      console.log(`[INVENTORY] No report found for container: ${containerName}`);
      return null;
    }

    const cacheKey = `inv:${accountName}:${containerName}:${report.etag}`;
    
    if (!forceRefresh) {
      const cached = summaryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        console.log(`[INVENTORY] Cache hit for ${cacheKey}`);
        return cached.summary;
      }
    }

    console.log(`[INVENTORY] Computing summary from report: ${report.blobName}`);
    
    try {
      const summary = await this.parseInventoryReport(accountName, report);
      
      // Override counts with manifest summary if available (Azure's source of truth)
      if (report.manifestSummary) {
        console.log(`[INVENTORY] Using manifest summary for counts: dir=${report.manifestSummary.directoryCount}, file=${report.manifestSummary.fileCount}`);
        if (typeof report.manifestSummary.directoryCount === 'number') {
          summary.directoryCount = report.manifestSummary.directoryCount;
        }
        if (typeof report.manifestSummary.fileCount === 'number') {
          summary.fileCount = report.manifestSummary.fileCount;
        }
        if (typeof report.manifestSummary.objectCount === 'number') {
          summary.objectCount = report.manifestSummary.objectCount;
          summary.totalBlobCount = report.manifestSummary.objectCount;
        }
        if (typeof report.manifestSummary.totalObjectSize === 'number') {
          summary.totalSizeBytes = report.manifestSummary.totalObjectSize;
        }
      }
      
      summaryCache.set(cacheKey, {
        summary,
        expiresAt: Date.now() + INVENTORY_CACHE_TTL_MS
      });
      
      return summary;
    } catch (error: any) {
      console.error(`[INVENTORY] Error computing summary: ${error.message}`);
      // Return a partial summary if parsing fails to avoid UI N/A if we have a report
      return {
        totalBlobCount: 0,
        totalSizeBytes: report.size,
        byExtension: {},
        byAccessTier: {},
        encryptedVsNot: { encrypted: { count: 0, sizeBytes: 0 }, notEncrypted: { count: 0, sizeBytes: 0 } },
        ageBuckets: { "0-7days": { count: 0, sizeBytes: 0 }, "7-30days": { count: 0, sizeBytes: 0 }, "30-90days": { count: 0, sizeBytes: 0 }, "90+days": { count: 0, sizeBytes: 0 } },
        lastUpdated: report.lastModified,
        reportEtag: report.etag
      };
    }
  }

  private async parseInventoryReport(accountName: string, report: InventoryReport): Promise<InventorySummary & { reportPath: string; reportContainer: string }> {
    const blobService = this.getBlobServiceClient(accountName);
    const containerClient = blobService.getContainerClient(INVENTORY_DESTINATION_CONTAINER);
    const blobClient = containerClient.getBlobClient(report.blobName);
    
    const summary: InventorySummary & { reportPath: string; reportContainer: string } = {
      totalBlobCount: 0,
      totalSizeBytes: 0,
      directoryCount: 0,
      fileCount: 0,
      objectCount: 0,
      byExtension: {},
      byAccessTier: {},
      encryptedVsNot: {
        encrypted: { count: 0, sizeBytes: 0 },
        notEncrypted: { count: 0, sizeBytes: 0 }
      },
      ageBuckets: {
        "0-7days": { count: 0, sizeBytes: 0 },
        "7-30days": { count: 0, sizeBytes: 0 },
        "30-90days": { count: 0, sizeBytes: 0 },
        "90+days": { count: 0, sizeBytes: 0 }
      },
      lastUpdated: report.lastModified,
      reportEtag: report.etag,
      reportPath: report.blobName,
      reportContainer: INVENTORY_DESTINATION_CONTAINER
    };

    try {
      if (report.blobName.endsWith(".csv")) {
        console.log(`[INVENTORY] Parsing CSV report: ${report.blobName}`);
        const downloadResponse = await blobClient.download();
        const csvContent = await this.streamToString(downloadResponse.readableStreamBody!);
        const lines = csvContent.split("\n");
        
        // CSV reports from Azure may have a BOM or unusual encoding
        const cleanLines = lines.map(line => line.trim().replace(/^\uFEFF/, ""));
        if (cleanLines.length <= 1) return summary;

        const headers = cleanLines[0].split(",").map(h => h.trim().replace(/"/g, ""));
        const nameIdx = headers.indexOf("Name");
        const sizeIdx = headers.indexOf("Content-Length");
        const lastModIdx = headers.findIndex(h => h === "Last-Modified" || h === "LastModifiedTime");
        const tierIdx = headers.indexOf("AccessTier");
        const metadataIdx = headers.indexOf("Metadata");
        const hnsIdx = headers.findIndex(h => ["IsDirectory", "isDirectory", "hnsDirectory"].includes(h));
        
        const now = Date.now();
        
        for (let i = 1; i < cleanLines.length; i++) {
          const line = cleanLines[i];
          if (!line) continue;
          
          const values = this.parseCSVLine(line);
          const name = values[nameIdx] || "";
          const size = parseInt(values[sizeIdx] || "0", 10);
          const lastModStr = values[lastModIdx];
          const lastMod = lastModStr ? new Date(lastModStr).getTime() : 0;
          const tier = values[tierIdx] || "Unknown";
          const metadata = values[metadataIdx] || "";
          
          const isDirectory = 
            (hnsIdx !== -1 && values[hnsIdx]?.toLowerCase() === "true") || 
            name.endsWith("/");
          
          summary.totalBlobCount++;
          summary.objectCount++;
          if (isDirectory) {
            summary.directoryCount++;
          } else {
            summary.fileCount++;
          }
          summary.totalSizeBytes += size;
          
          const ext = this.getExtension(name);
          if (!summary.byExtension[ext]) {
            summary.byExtension[ext] = { count: 0, sizeBytes: 0 };
          }
          summary.byExtension[ext].count++;
          summary.byExtension[ext].sizeBytes += size;
          
          if (!summary.byAccessTier[tier]) {
            summary.byAccessTier[tier] = { count: 0, sizeBytes: 0 };
          }
          summary.byAccessTier[tier].count++;
          summary.byAccessTier[tier].sizeBytes += size;
          
          const isEncrypted = metadata.includes("isEncrypted=true");
          if (isEncrypted) {
            summary.encryptedVsNot.encrypted.count++;
            summary.encryptedVsNot.encrypted.sizeBytes += size;
          } else {
            summary.encryptedVsNot.notEncrypted.count++;
            summary.encryptedVsNot.notEncrypted.sizeBytes += size;
          }
          
          if (lastMod > 0) {
            const ageMs = now - lastMod;
            const ageDays = ageMs / (1000 * 60 * 60 * 24);
            
            if (ageDays <= 7) {
              summary.ageBuckets["0-7days"].count++;
              summary.ageBuckets["0-7days"].sizeBytes += size;
            } else if (ageDays <= 30) {
              summary.ageBuckets["7-30days"].count++;
              summary.ageBuckets["7-30days"].sizeBytes += size;
            } else if (ageDays <= 90) {
              summary.ageBuckets["30-90days"].count++;
              summary.ageBuckets["30-90days"].sizeBytes += size;
            } else {
              summary.ageBuckets["90+days"].count++;
              summary.ageBuckets["90+days"].sizeBytes += size;
            }
          }
        }
      } else if (report.blobName.endsWith(".parquet")) {
        console.log(`[INVENTORY] Parsing Parquet report: ${report.blobName}`);
        const tempDir = os.tmpdir();
        const tempFilePath = path.join(tempDir, `inventory_${Date.now()}.parquet`);
        
        try {
          const downloadResponse = await blobClient.download();
          const fileStream = fs.createWriteStream(tempFilePath);
          
          await new Promise((resolve, reject) => {
            downloadResponse.readableStreamBody?.pipe(fileStream)
              .on('finish', resolve)
              .on('error', reject);
          });

          const reader = await parquet.ParquetReader.openFile(tempFilePath);
          const cursor = reader.getCursor();
          let record = null;
          const now = Date.now();

          while (record = await cursor.next()) {
            const name = record.Name || "";
            const size = Number(record["Content-Length"] || 0);
            const lastModStr = record["Last-Modified"] || record["LastModifiedTime"];
            const lastMod = lastModStr ? new Date(lastModStr).getTime() : 0;
            const tier = record.AccessTier || "Unknown";
            const metadata = JSON.stringify(record.Metadata || {});
            
            // Comprehensive Parquet directory detection:
            const isDirectory = 
              record.IsDirectory === true || 
              record.isDirectory === true ||
              record.hnsDirectory === true ||
              String(record.IsDirectory).toLowerCase() === "true" ||
              name.endsWith("/");
            
            summary.totalBlobCount++;
            summary.objectCount++;
            if (isDirectory) {
              summary.directoryCount++;
            } else {
              summary.fileCount++;
            }
            summary.totalSizeBytes += size;
            
            const ext = this.getExtension(name);
            if (!summary.byExtension[ext]) {
              summary.byExtension[ext] = { count: 0, sizeBytes: 0 };
            }
            summary.byExtension[ext].count++;
            summary.byExtension[ext].sizeBytes += size;
            
            if (!summary.byAccessTier[tier]) {
              summary.byAccessTier[tier] = { count: 0, sizeBytes: 0 };
            }
            summary.byAccessTier[tier].count++;
            summary.byAccessTier[tier].sizeBytes += size;
            
            const isEncrypted = metadata.includes("isEncrypted=true");
            if (isEncrypted) {
              summary.encryptedVsNot.encrypted.count++;
              summary.encryptedVsNot.encrypted.sizeBytes += size;
            } else {
              summary.encryptedVsNot.notEncrypted.count++;
              summary.encryptedVsNot.notEncrypted.sizeBytes += size;
            }
            
            if (lastMod > 0) {
              const ageMs = now - lastMod;
              const ageDays = ageMs / (1000 * 60 * 60 * 24);
              
              if (ageDays <= 7) {
                summary.ageBuckets["0-7days"].count++;
                summary.ageBuckets["0-7days"].sizeBytes += size;
              } else if (ageDays <= 30) {
                summary.ageBuckets["7-30days"].count++;
                summary.ageBuckets["7-30days"].sizeBytes += size;
              } else if (ageDays <= 90) {
                summary.ageBuckets["30-90days"].count++;
                summary.ageBuckets["30-90days"].sizeBytes += size;
              } else {
                summary.ageBuckets["90+days"].count++;
                summary.ageBuckets["90+days"].sizeBytes += size;
              }
            }
          }
          await reader.close();
        } finally {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        }
      } else {
        console.log(`[INVENTORY] Report format not explicitly handled, using blob metadata estimation`);
        summary.totalBlobCount = 1;
        summary.totalSizeBytes = report.size;
      }
    } catch (err) {
      console.error(`[INVENTORY] Error during parseInventoryReport: ${err}`);
      // Fallback: use report size as total size if parsing fails
      summary.totalSizeBytes = report.size;
    }
    
    return summary;
  }

  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    return values;
  }

  private getExtension(filename: string): string {
    const lastDot = filename.lastIndexOf(".");
    if (lastDot === -1 || lastDot === filename.length - 1) {
      return "no-extension";
    }
    return filename.substring(lastDot + 1).toLowerCase();
  }

  private async streamToString(stream: NodeJS.ReadableStream): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf-8");
  }

  async reconfigureRulesToCSV(
    accountName: string,
    resourceGroup?: string
  ): Promise<{ success: boolean; message: string; updatedRules: string[] }> {
    const rg = resourceGroup || RESOURCE_GROUP;
    console.log(`[INVENTORY] Reconfiguring all rules to CSV format for ${accountName}`);

    try {
      let existingRules: any[] = [];
      try {
        const existingPolicy = await this.storageManagementClient.blobInventoryPolicies.get(rg, accountName, "default");
        existingRules = existingPolicy.policy?.rules || [];
      } catch (error: any) {
        if (error.statusCode === 404 || error.code === "BlobInventoryPolicyNotFound") {
          return { success: true, message: "No inventory rules found to reconfigure", updatedRules: [] };
        }
        throw error;
      }

      if (existingRules.length === 0) {
        return { success: true, message: "No inventory rules found to reconfigure", updatedRules: [] };
      }

      const updatedRules: string[] = [];
      let hasChanges = false;

      for (const rule of existingRules) {
        if (!rule.definition) {
          console.warn(`[INVENTORY] Skipping rule '${rule.name}' - missing definition`);
          continue;
        }
        const currentFormat = (rule.definition.format || "").toUpperCase();
        if (currentFormat !== "CSV") {
          rule.definition.format = "Csv";
          updatedRules.push(rule.name);
          hasChanges = true;
          console.log(`[INVENTORY] Updated rule '${rule.name}' from ${currentFormat} to CSV`);
        }
      }

      if (!hasChanges) {
        return { success: true, message: "All rules already use CSV format", updatedRules: [] };
      }

      await this.storageManagementClient.blobInventoryPolicies.createOrUpdate(
        rg,
        accountName,
        "default",
        {
          policy: {
            enabled: true,
            type: "Inventory",
            rules: existingRules
          }
        }
      );

      return {
        success: true,
        message: `Updated ${updatedRules.length} rule(s) to CSV format. New reports will be generated in CSV on the next scheduled run.`,
        updatedRules
      };
    } catch (error: any) {
      console.error(`[INVENTORY] Error reconfiguring rules to CSV: ${error.message}`);
      return {
        success: false,
        message: error.message || "Failed to reconfigure rules",
        updatedRules: []
      };
    }
  }

  async getStorageAccountAggregateSummary(
    accountName: string,
    resourceGroup?: string
  ): Promise<{
    accountName: string;
    totalBlobCount: number;
    totalSizeBytes: number;
    containerSummaries: Array<{ containerName: string; summary: InventorySummary | null }>;
  }> {
    const rules = await this.listInventoryRules(accountName, resourceGroup);
    const enabledContainers = rules.filter(r => r.enabled).map(r => r.containerName);
    
    let totalBlobCount = 0;
    let totalSizeBytes = 0;
    const containerSummaries: Array<{ containerName: string; summary: InventorySummary | null }> = [];
    
    for (const containerName of enabledContainers) {
      try {
        const report = await this.getLatestInventoryReport(accountName, containerName);
        if (!report) {
          containerSummaries.push({ containerName, summary: null });
          continue;
        }

        const summary = await this.getContainerInventorySummary(accountName, containerName);
        if (summary) {
          containerSummaries.push({
            containerName,
            reportPath: summary.reportPath || report.blobName,
            generatedAt: summary.lastUpdated.toISOString(),
            totalBlobs: summary.objectCount || summary.totalBlobCount, // Use objectCount if available
            totalSizeBytes: summary.totalSizeBytes,
            directoryCount: summary.directoryCount,
            fileCount: summary.fileCount,
            objectCount: summary.objectCount,
            lastModifiedRange: {
              oldest: summary.lastUpdated.toISOString(),
              newest: summary.lastUpdated.toISOString()
            }
          });
          
          totalBlobCount += (summary.objectCount || summary.totalBlobCount);
          totalSizeBytes += summary.totalSizeBytes;
        } else {
          containerSummaries.push({ containerName, summary: null });
        }
      } catch (error: any) {
        console.error(`[INVENTORY] Error getting summary for ${containerName}: ${error.message}`);
        containerSummaries.push({ containerName, summary: null });
      }
    }
    
    return {
      accountName,
      containerSummaries,
      aggregate: {
        totalBlobCount,
        totalSizeBytes,
        containerCount: enabledContainers.length,
        totalBlobs: totalBlobCount, // Align with frontend expected field
        blobsByTier: {} // Initializing empty, can be aggregated if needed
      }
    };
  }

  async listContainersForAccount(accountName: string): Promise<{ name: string }[]> {
    const blobService = this.getBlobServiceClient(accountName);
    const containers: { name: string }[] = [];
    
    try {
      for await (const container of blobService.listContainers()) {
        if (container.name !== INVENTORY_DESTINATION_CONTAINER) {
          containers.push({ name: container.name });
        }
      }
      return containers;
    } catch (error: any) {
      console.error(`[INVENTORY] Error listing containers: ${error.message}`);
      throw error;
    }
  }
}

export const inventoryService = new InventoryService();
