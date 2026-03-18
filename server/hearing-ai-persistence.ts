/**
 * HearingAI (CU) Result Persistence Service
 * 
 * Handles storage of CU analysis results in Azure Blob Storage.
 * 
 * Storage Structure:
 * /hai_folder/{original_directory}/{filename}_hai_result_{timestamp}_{number}.json
 * 
 * Metadata-Based Association (like translated documents):
 * CU result references are stored on the SOURCE FILE's metadata, not discovered by filename pattern.
 * This ensures:
 * - File renames don't break associations (metadata moves with blob)
 * - Single source of truth for CU results
 * - Fast listing without folder scanning
 * 
 * Source Blob Metadata Keys:
 * - hai_results_list: comma-separated result numbers (e.g., "1,2,3")
 * - hai_result_{n}_path: blob path to CU result file
 * - hai_result_{n}_timestamp: when it was saved
 * - hai_result_{n}_analyzedby: user email who analyzed
 * 
 * Example:
 * Original file: documents/reports/quarterly.pdf
 * CU result: hai_folder/documents/reports/quarterly.pdf_hai_result_20250110_143052_001.json
 * Source blob metadata: { hai_results_list: "1", hai_result_1_path: "hai_folder/...", ... }
 * 
 * Key Rules:
 * - CU results are ONLY stored when user explicitly saves
 * - Max 5 CU result files per source file
 * - When source file is deleted, all CU results are cascade deleted
 * - Uses Managed Identity (DefaultAzureCredential) for blob access
 * - Legacy results (without metadata) are discovered via backfill scan
 */

import { DefaultAzureCredential } from "@azure/identity";
import { 
  BlobServiceClient, 
  ContainerClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  SASProtocol
} from "@azure/storage-blob";
import { DataLakeServiceClient } from "@azure/storage-file-datalake";
import * as path from "path";

// Configurable CU results directory via environment variable (default: hai_folder)
const HAI_FOLDER_NAME = process.env.ZAPPER_HAI_RESULTS_DIR || "hai_folder";
// No hard limit on results per file — unlimited saves are allowed
const HAI_MAX_RESULTS_PER_FILE = parseInt(process.env.ZAPPER_HAI_HAI_MAX_RESULTS_PER_FILE || "0", 10);
const HAI_RESULT_PREFIX = "hai_result_";

export interface SaveHaiResultRequest {
  storageAccountName: string;
  containerName: string;
  sourceFilePath: string;
  analysisResult: any;
  organizationId: number;
  userEmail: string;
  fileName?: string;
  saveMode?: 'auto' | 'manual'; // 'auto' for video async save, 'manual' for user-initiated save
}

export interface SaveHaiResultResponse {
  success: boolean;
  blobPath?: string;
  resultNumber?: number;
  error?: string;
}

export interface HaiResultItem {
  blobPath: string;
  blobName: string;
  resultNumber: number;
  createdAt: string;
  size: number;
  metadata?: Record<string, string>;
}

export interface ListHaiResultsResponse {
  success: boolean;
  results?: HaiResultItem[];
  count?: number;
  error?: string;
}

export interface GetHaiResultResponse {
  success: boolean;
  result?: any;
  metadata?: Record<string, string>;
  error?: string;
}

export interface DeleteHaiResultResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * CU result metadata stored on source blob
 */
export interface CuResultMetadataEntry {
  resultNumber: number;
  blobPath: string;
  timestamp: string;
  analyzedBy: string;
}

/**
 * Full CU metadata from source blob
 */
export interface CuResultsMetadata {
  resultNumbers: number[];
  results: Record<number, CuResultMetadataEntry>;
}

/**
 * Safely decode URI component, returning original string if decoding fails
 */
function safeDecodeURIComponent(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch (e) {
    return str;
  }
}

/**
 * Decodes a blob path by decoding each path segment.
 * Azure SDK does its own encoding, so we need to decode before calling getBlobClient.
 * Example: "test%20folder/file.txt" -> "test folder/file.txt"
 */
function decodeBlobPath(blobPath: string): string {
  return blobPath.split('/').map(segment => safeDecodeURIComponent(segment)).join('/');
}

/**
 * Gets the full file name (with extension) from a file path
 */
function getFileName(filePath: string): string {
  const fileName = filePath.split('/').pop() || filePath;
  return safeDecodeURIComponent(fileName);
}

/**
 * Sanitizes a file name for use in blob paths (removes/replaces problematic characters)
 */
function sanitizeFileName(fileName: string): string {
  // Replace problematic characters with underscores, but keep dots for extension
  return fileName.replace(/[<>:"/\\|?*]/g, '_');
}

/**
 * Gets the directory path from a source file path
 */
function getDirectoryPath(sourceFilePath: string): string {
  const normalized = sourceFilePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash > 0 ? normalized.substring(0, lastSlash) : '';
}

/**
 * Gets the CU folder path for a source file.
 * Follows AI Agent/Decrypt naming convention: hai_folder/{original_directory}
 * 
 * Example:
 * Source: documents/reports/quarterly.pdf
 * CU Folder: hai_folder/documents/reports
 */
function getCuFolderPath(sourceFilePath: string): string {
  const dirPath = getDirectoryPath(sourceFilePath);
  return dirPath ? `${HAI_FOLDER_NAME}/${dirPath}` : HAI_FOLDER_NAME;
}

/**
 * Generates the CU result file name.
 * Format: {filename.ext}_hai_result_{timestamp}_{number}.json
 * 
 * Example: quarterly.pdf_hai_result_20250110_143052_001.json
 * 
 * Note: We include the full filename with extension to distinguish between
 * files with the same base name but different extensions (e.g., report.pdf vs report.docx)
 */
function generateCuResultFileName(sourceFilePath: string, resultNumber: number): string {
  const fullFileName = getFileName(sourceFilePath);
  const sanitizedFileName = sanitizeFileName(fullFileName);
  
  // Generate timestamp (yyyymmdd_HHMMSS format)
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;
  
  return `${sanitizedFileName}_hai_result_${timestamp}_${formatResultNumber(resultNumber)}.json`;
}

/**
 * Parses result number from blob name.
 * New format: filename_hai_result_20250110_143052_003.json -> 3
 * Old format: hai_result_003.json -> 3
 */
function parseResultNumber(blobName: string): number {
  // New format: {filename}_hai_result_{timestamp}_{number}.json
  const newMatch = blobName.match(/_hai_result_\d{8}_\d{6}_(\d{3})\.json$/);
  if (newMatch) {
    return parseInt(newMatch[1], 10);
  }
  // Legacy format: hai_result_003.json
  const oldMatch = blobName.match(/hai_result_(\d+)\.json$/);
  return oldMatch ? parseInt(oldMatch[1], 10) : 0;
}

/**
 * Checks if a blob name is a CU result file for a given source file.
 * Matches by full filename with extension to avoid collisions.
 */
function isCuResultForFile(blobName: string, sourceFileName: string): boolean {
  // Decode and sanitize the source file name to match what we generate
  const decodedSourceFileName = safeDecodeURIComponent(sourceFileName);
  const sanitizedSourceFileName = sanitizeFileName(decodedSourceFileName);
  
  // Check if blob name starts with the full source file name and contains _hai_result_
  // Pattern: {filename.ext}_hai_result_{timestamp}_{number}.json
  const pattern = new RegExp(`^${escapeRegExp(sanitizedSourceFileName)}_hai_result_\\d{8}_\\d{6}_\\d{3}\\.json$`, 'i');
  return pattern.test(blobName);
}

/**
 * Escape special regex characters
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Gets the next available result number (unbounded — no limit enforced)
 */
function getNextResultNumber(existingNumbers: number[]): number {
  if (existingNumbers.length === 0) return 1;
  return Math.max(...existingNumbers) + 1;
}

/**
 * Formats result number with leading zeros (e.g., 3 -> "003")
 */
function formatResultNumber(num: number): string {
  return num.toString().padStart(3, '0');
}

/**
 * CU Persistence Service Class
 */
export class HearingAiPersistenceService {
  private credential: DefaultAzureCredential;

  constructor() {
    this.credential = new DefaultAzureCredential();
  }

  /**
   * Gets a BlobServiceClient for the storage account
   */
  private getBlobServiceClient(storageAccountName: string): BlobServiceClient {
    const url = `https://${storageAccountName}.blob.core.windows.net`;
    return new BlobServiceClient(url, this.credential);
  }

  /**
   * Gets a ContainerClient for the container
   */
  private getContainerClient(storageAccountName: string, containerName: string): ContainerClient {
    return this.getBlobServiceClient(storageAccountName).getContainerClient(containerName);
  }

  /**
   * Verifies that a source file exists in the storage container
   */
  async verifySourceFileExists(
    storageAccountName: string, 
    containerName: string, 
    sourceFilePath: string
  ): Promise<boolean> {
    try {
      const containerClient = this.getContainerClient(storageAccountName, containerName);
      // Decode path before Azure SDK call - SDK does its own encoding
      const decodedPath = decodeBlobPath(sourceFilePath);
      console.log(`[HAI-PERSIST] Verifying file exists: ${sourceFilePath} -> decoded: ${decodedPath}`);
      const blobClient = containerClient.getBlobClient(decodedPath);
      return await blobClient.exists();
    } catch (error) {
      console.error(`[HAI-PERSIST] Error verifying source file:`, error);
      return false;
    }
  }

  /**
   * Get CU result references from source blob metadata
   * This is the primary method for listing CU results (metadata-based approach)
   */
  async getCuResultsMetadata(
    storageAccountName: string,
    containerName: string,
    sourceFilePath: string
  ): Promise<CuResultsMetadata> {
    try {
      const containerClient = this.getContainerClient(storageAccountName, containerName);
      const decodedPath = decodeBlobPath(sourceFilePath);
      const blobClient = containerClient.getBlobClient(decodedPath);
      
      const properties = await blobClient.getProperties();
      const metadata = properties.metadata || {};
      
      // Parse hai_results_list: comma-separated result numbers
      const resultNumbersStr = metadata.hai_results_list || '';
      const resultNumbers = resultNumbersStr
        ? resultNumbersStr.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n))
        : [];
      
      const results: Record<number, CuResultMetadataEntry> = {};
      
      for (const num of resultNumbers) {
        const pathKey = `hai_result_${num}_path`;
        const timestampKey = `hai_result_${num}_timestamp`;
        const analyzedByKey = `hai_result_${num}_analyzedby`;
        
        if (metadata[pathKey]) {
          results[num] = {
            resultNumber: num,
            blobPath: metadata[pathKey],
            timestamp: metadata[timestampKey] || '',
            analyzedBy: metadata[analyzedByKey] || '',
          };
        }
      }
      
      console.log(`[HAI-PERSIST] Retrieved CU metadata for ${sourceFilePath}: ${resultNumbers.length} result(s)`);
      
      return { resultNumbers, results };
    } catch (error: any) {
      // If blob doesn't exist or no metadata, return empty
      if (error.statusCode === 404) {
        console.log(`[HAI-PERSIST] Source blob not found: ${sourceFilePath}`);
        return { resultNumbers: [], results: {} };
      }
      console.error(`[HAI-PERSIST] Error getting CU metadata:`, error.message);
      return { resultNumbers: [], results: {} };
    }
  }

  /**
   * Add a CU result reference to source blob metadata
   * Called after saving a CU result file
   */
  async setCuResultMetadata(
    storageAccountName: string,
    containerName: string,
    sourceFilePath: string,
    resultNumber: number,
    cuResultBlobPath: string,
    analyzedBy: string
  ): Promise<void> {
    try {
      const containerClient = this.getContainerClient(storageAccountName, containerName);
      const decodedPath = decodeBlobPath(sourceFilePath);
      const blobClient = containerClient.getBlobClient(decodedPath);
      
      // Get existing metadata
      const properties = await blobClient.getProperties();
      const existingMetadata = properties.metadata || {};
      
      // Parse existing result numbers
      const existingResultsStr = existingMetadata.hai_results_list || '';
      const existingNumbers = existingResultsStr
        ? existingResultsStr.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n))
        : [];
      
      // Add new result number if not already present
      if (!existingNumbers.includes(resultNumber)) {
        existingNumbers.push(resultNumber);
        existingNumbers.sort((a, b) => a - b);
      }
      
      // Update metadata with new CU result reference
      const newMetadata = {
        ...existingMetadata,
        hai_results_list: existingNumbers.join(','),
        [`hai_result_${resultNumber}_path`]: cuResultBlobPath,
        [`hai_result_${resultNumber}_timestamp`]: new Date().toISOString(),
        [`hai_result_${resultNumber}_analyzedby`]: analyzedBy,
      };
      
      await blobClient.setMetadata(newMetadata);
      
      console.log(`[HAI-PERSIST] Set CU metadata on ${sourceFilePath}: result #${resultNumber} -> ${cuResultBlobPath}`);
    } catch (error: any) {
      console.error(`[HAI-PERSIST] Error setting CU metadata:`, error.message);
      throw error;
    }
  }

  /**
   * Remove a CU result reference from source blob metadata
   * Called after deleting a CU result file
   */
  async removeCuResultMetadata(
    storageAccountName: string,
    containerName: string,
    sourceFilePath: string,
    resultNumber: number
  ): Promise<void> {
    try {
      const containerClient = this.getContainerClient(storageAccountName, containerName);
      const decodedPath = decodeBlobPath(sourceFilePath);
      const blobClient = containerClient.getBlobClient(decodedPath);
      
      // Get existing metadata
      const properties = await blobClient.getProperties();
      const existingMetadata = properties.metadata || {};
      
      // Parse existing result numbers and remove the deleted one
      const existingResultsStr = existingMetadata.hai_results_list || '';
      const existingNumbers = existingResultsStr
        ? existingResultsStr.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n))
        : [];
      
      const updatedNumbers = existingNumbers.filter(n => n !== resultNumber);
      
      // Build new metadata without the deleted result's keys
      const newMetadata: Record<string, string> = {};
      for (const [key, value] of Object.entries(existingMetadata)) {
        // Skip keys for the deleted result number
        if (key.startsWith(`hai_result_${resultNumber}_`)) {
          continue;
        }
        newMetadata[key] = value;
      }
      
      // Update the results list
      if (updatedNumbers.length > 0) {
        newMetadata.hai_results_list = updatedNumbers.join(',');
      } else {
        // Remove the list key if no results remain
        delete newMetadata.hai_results_list;
      }
      
      await blobClient.setMetadata(newMetadata);
      
      console.log(`[HAI-PERSIST] Removed CU metadata from ${sourceFilePath}: result #${resultNumber}`);
    } catch (error: any) {
      // If source blob doesn't exist, that's OK (file was already deleted)
      if (error.statusCode === 404) {
        console.log(`[HAI-PERSIST] Source blob not found during metadata removal: ${sourceFilePath}`);
        return;
      }
      console.error(`[HAI-PERSIST] Error removing CU metadata:`, error.message);
      throw error;
    }
  }

  /**
   * Validates that a CU result blob belongs to the specified organization
   * Security: Checks organizationId from metadata, with fallback to JSON content for legacy files
   */
  private async validateBlobOwnership(
    containerClient: ContainerClient,
    blobPath: string,
    organizationId: number
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Decode path before Azure SDK call - SDK does its own encoding
      const decodedPath = decodeBlobPath(blobPath);
      console.log(`[HAI-PERSIST] Validating ownership for blob: ${blobPath} -> decoded: ${decodedPath}, orgId: ${organizationId}`);
      const blobClient = containerClient.getBlobClient(decodedPath);
      const exists = await blobClient.exists();
      if (!exists) {
        console.warn(`[HAI-PERSIST] Blob not found: ${blobPath}`);
        return { valid: false, error: "CU result not found" };
      }

      const properties = await blobClient.getProperties();
      console.log(`[HAI-PERSIST] Blob metadata keys:`, Object.keys(properties.metadata || {}));
      const storedOrgId = properties.metadata?.organizationid;
      
      // First, try to validate from metadata
      if (storedOrgId) {
        // Security: Verify organization ownership matches
        if (parseInt(storedOrgId, 10) !== organizationId) {
          console.warn(`[HAI-PERSIST] Organization mismatch: requested ${organizationId}, stored ${storedOrgId}`);
          return { valid: false, error: "Access denied" };
        }
        return { valid: true };
      }

      // Fallback: Check JSON content for organizationId (for legacy files saved before metadata was enforced)
      console.log(`[HAI-PERSIST] No organizationId metadata, checking JSON content for: ${blobPath}`);
      try {
        const downloadResponse = await blobClient.download();
        const content = await this.streamToString(downloadResponse.readableStreamBody!);
        const jsonData = JSON.parse(content);
        
        if (jsonData.organizationId !== undefined) {
          const contentOrgId = parseInt(jsonData.organizationId, 10);
          if (contentOrgId === organizationId) {
            console.log(`[HAI-PERSIST] Validated from JSON content, orgId: ${contentOrgId}`);
            return { valid: true };
          } else {
            console.warn(`[HAI-PERSIST] JSON content org mismatch: requested ${organizationId}, stored ${contentOrgId}`);
            return { valid: false, error: "Access denied" };
          }
        }
      } catch (jsonError: any) {
        console.warn(`[HAI-PERSIST] Failed to parse JSON content for legacy check: ${jsonError.message}`);
      }
      
      // If neither metadata nor JSON content has organizationId, deny access
      console.warn(`[HAI-PERSIST] No organizationId in metadata or content for blob: ${blobPath}`);
      return { valid: false, error: "Access denied - invalid CU result" };
    } catch (error: any) {
      console.error(`[HAI-PERSIST] Error validating blob ownership:`, error.message);
      return { valid: false, error: "Failed to validate access" };
    }
  }

  /**
   * Saves a CU analysis result to blob storage
   * Uses metadata-based approach: stores reference on source blob's metadata
   */
  async saveResult(request: SaveHaiResultRequest): Promise<SaveHaiResultResponse> {
    const { 
      storageAccountName, 
      containerName, 
      sourceFilePath, 
      analysisResult,
      organizationId,
      userEmail,
      fileName,
      saveMode = 'manual' // Default to manual
    } = request;

    console.log(`[HAI-PERSIST] Saving CU result for: ${sourceFilePath}`);

    try {
      const containerClient = this.getContainerClient(storageAccountName, containerName);
      const cuFolderPath = getCuFolderPath(sourceFilePath);

      // Use metadata-based approach to get existing results (primary method)
      const cuMetadata = await this.getCuResultsMetadata(storageAccountName, containerName, sourceFilePath);
      const metadataNumbers = new Set(cuMetadata.resultNumbers);
      
      // Always scan for legacy results to ensure accurate count for max-results enforcement
      // This catches results that exist but aren't in metadata (e.g., failed metadata update)
      const legacyResults = await this.listResultsInternal(containerClient, cuFolderPath, sourceFilePath);
      const legacyNumbers = legacyResults.map(r => r.resultNumber);
      
      // Find untracked legacy results and backfill their metadata
      const untrackedResults = legacyResults.filter(r => !metadataNumbers.has(r.resultNumber));
      if (untrackedResults.length > 0) {
        console.log(`[HAI-PERSIST] Found ${untrackedResults.length} untracked legacy result(s), backfilling metadata`);
        for (const result of untrackedResults) {
          try {
            await this.setCuResultMetadata(
              storageAccountName,
              containerName,
              sourceFilePath,
              result.resultNumber,
              result.blobPath,
              result.metadata?.analyzedby || 'unknown'
            );
          } catch (backfillErr: any) {
            console.warn(`[HAI-PERSIST] Failed to backfill metadata for result #${result.resultNumber}:`, backfillErr.message);
          }
        }
      }
      
      // Combine both sources for accurate existing count
      const existingNumbers = [...new Set([...cuMetadata.resultNumbers, ...legacyNumbers])];

      const nextNumber = getNextResultNumber(existingNumbers);

      // Use human-readable naming: {filename}_hai_result_{timestamp}_{number}.json
      const resultFileName = generateCuResultFileName(sourceFilePath, nextNumber);
      const blobPath = `${cuFolderPath}/${resultFileName}`;

      const resultData = {
        sourceFilePath,
        sourceFileName: fileName || sourceFilePath.split('/').pop(),
        organizationId,
        analyzedBy: userEmail,
        createdAt: new Date().toISOString(),
        resultNumber: nextNumber,
        saveMode, // 'auto' for video async, 'manual' for user-initiated
        analysisResult
      };

      const blobClient = containerClient.getBlockBlobClient(blobPath);
      const content = JSON.stringify(resultData, null, 2);
      
      // Prepare metadata for CU result blob
      const blobMetadata = {
        sourcefilepath: Buffer.from(sourceFilePath).toString('base64'),
        organizationid: organizationId.toString(),
        analyzedby: userEmail,
        resultnumber: nextNumber.toString(),
        createdat: new Date().toISOString()
      };
      
      console.log(`[HAI-PERSIST] DEBUG: Saving blob with metadata:`, JSON.stringify(blobMetadata));
      console.log(`[HAI-PERSIST] DEBUG: organizationId=${organizationId}, userEmail=${userEmail}`);
      console.log(`[HAI-PERSIST] DEBUG: blobPath=${blobPath}`);
      
      await blobClient.upload(content, Buffer.byteLength(content), {
        blobHTTPHeaders: {
          blobContentType: 'application/json'
        },
        metadata: blobMetadata
      });

      // Verify CU result blob metadata was set
      try {
        const props = await blobClient.getProperties();
        console.log(`[HAI-PERSIST] DEBUG: Verified CU result blob metadata:`, JSON.stringify(props.metadata || {}));
      } catch (verifyErr: any) {
        console.warn(`[HAI-PERSIST] DEBUG: Could not verify CU result blob metadata:`, verifyErr.message);
      }

      // CRITICAL: Update source blob's metadata with reference to this CU result
      // This is the single source of truth for CU result associations
      try {
        await this.setCuResultMetadata(
          storageAccountName,
          containerName,
          sourceFilePath,
          nextNumber,
          blobPath,
          userEmail
        );
        console.log(`[HAI-PERSIST] Updated source blob metadata with CU result reference`);
      } catch (metadataErr: any) {
        // Log error but don't fail - the CU result file was saved successfully
        console.error(`[HAI-PERSIST] WARNING: Failed to update source blob metadata:`, metadataErr.message);
        console.error(`[HAI-PERSIST] CU result saved at ${blobPath} but metadata link may be missing`);
      }

      console.log(`[HAI-PERSIST] Saved CU result: ${blobPath}`);

      return {
        success: true,
        blobPath,
        resultNumber: nextNumber
      };

    } catch (error: any) {
      console.error(`[HAI-PERSIST] Error saving CU result:`, error.message);
      return {
        success: false,
        error: error.message || "Failed to save CU result"
      };
    }
  }

  /**
   * Internal method to list ALL results in a CU folder (not filtered by source file)
   * Used for cascade delete when we need all results in a folder
   */
  private async listAllResultsInFolder(containerClient: ContainerClient, cuFolderPath: string): Promise<HaiResultItem[]> {
    const results: HaiResultItem[] = [];
    const prefix = `${cuFolderPath}/`;

    console.log(`[HAI-PERSIST] DEBUG: Listing blobs with prefix: ${prefix}, includeMetadata: true`);

    // Include metadata in the list response
    for await (const blob of containerClient.listBlobsFlat({ prefix, includeMetadata: true })) {
      if (blob.name.endsWith('.json') && blob.name.includes(HAI_RESULT_PREFIX)) {
        const blobName = blob.name.split('/').pop() || '';
        console.log(`[HAI-PERSIST] DEBUG: Found blob: ${blobName}, metadata:`, JSON.stringify(blob.metadata || {}));
        results.push({
          blobPath: blob.name,
          blobName,
          resultNumber: parseResultNumber(blobName),
          createdAt: blob.properties.createdOn?.toISOString() || '',
          size: blob.properties.contentLength || 0,
          metadata: blob.metadata
        });
      }
    }

    console.log(`[HAI-PERSIST] DEBUG: Found ${results.length} CU result(s) in folder`);
    return results.sort((a, b) => a.resultNumber - b.resultNumber);
  }

  /**
   * Internal method to list results for a specific source file (filtered by filename)
   */
  private async listResultsInternal(containerClient: ContainerClient, cuFolderPath: string, sourceFilePath: string): Promise<HaiResultItem[]> {
    const allResults = await this.listAllResultsInFolder(containerClient, cuFolderPath);
    
    // Get the source file name to filter results
    const sourceFileName = sourceFilePath.split('/').pop() || sourceFilePath;
    
    // Filter results that belong to this specific source file
    return allResults.filter(result => isCuResultForFile(result.blobName, sourceFileName));
  }

  /**
   * Lists all CU results for a source file
   * Uses metadata-based approach: reads references from source blob's metadata
   * Falls back to legacy folder scan if no metadata found (for backward compatibility)
   */
  async listResults(
    storageAccountName: string, 
    containerName: string, 
    sourceFilePath: string
  ): Promise<ListHaiResultsResponse> {
    console.log(`[HAI-PERSIST] Listing CU results for: ${sourceFilePath}`);

    try {
      const containerClient = this.getContainerClient(storageAccountName, containerName);
      const cuFolderPath = getCuFolderPath(sourceFilePath);

      // Primary method: Read CU result references from source blob's metadata
      const cuMetadata = await this.getCuResultsMetadata(storageAccountName, containerName, sourceFilePath);
      
      // Track stale metadata entries for cleanup
      const staleResultNumbers: number[] = [];
      const validResultsFromMetadata: HaiResultItem[] = [];
      
      if (cuMetadata.resultNumbers.length > 0) {
        // Convert metadata entries to HaiResultItem format
        // Need to fetch actual blob properties for size and verify existence
        
        for (const [numStr, entry] of Object.entries(cuMetadata.results)) {
          const num = parseInt(numStr, 10);
          const blobName = entry.blobPath.split('/').pop() || '';
          
          // Get blob properties for size
          let size = 0;
          try {
            const decodedPath = decodeBlobPath(entry.blobPath);
            const blobClient = containerClient.getBlobClient(decodedPath);
            const exists = await blobClient.exists();
            if (exists) {
              const props = await blobClient.getProperties();
              size = props.contentLength || 0;
            } else {
              // CU result blob doesn't exist anymore - mark for cleanup
              console.warn(`[HAI-PERSIST] CU result blob not found (stale metadata): ${entry.blobPath}`);
              staleResultNumbers.push(num);
              continue;
            }
          } catch (propErr: any) {
            console.warn(`[HAI-PERSIST] Failed to get properties for ${entry.blobPath}:`, propErr.message);
          }
          
          validResultsFromMetadata.push({
            blobPath: entry.blobPath,
            blobName,
            resultNumber: num,
            createdAt: entry.timestamp,
            size,
            metadata: {
              analyzedby: entry.analyzedBy,
              createdat: entry.timestamp,
            }
          });
        }
        
        // Clean up stale metadata entries (fire and forget)
        if (staleResultNumbers.length > 0) {
          console.log(`[HAI-PERSIST] Cleaning up ${staleResultNumbers.length} stale metadata entries`);
          for (const staleNum of staleResultNumbers) {
            try {
              await this.removeCuResultMetadata(storageAccountName, containerName, sourceFilePath, staleNum);
            } catch (cleanupErr: any) {
              console.warn(`[HAI-PERSIST] Failed to clean up stale metadata for result #${staleNum}:`, cleanupErr.message);
            }
          }
        }
      }
      
      // Always scan for legacy results to ensure consistency
      // This catches results that exist but aren't in metadata (e.g., failed metadata update)
      const legacyResults = await this.listResultsInternal(containerClient, cuFolderPath, sourceFilePath);
      const validResultNumbers = new Set(validResultsFromMetadata.map(r => r.resultNumber));
      
      // Find legacy results not tracked in metadata
      const untracked = legacyResults.filter(r => !validResultNumbers.has(r.resultNumber));
      
      if (untracked.length > 0) {
        console.log(`[HAI-PERSIST] Found ${untracked.length} untracked legacy result(s), adding to results and backfilling metadata`);
        
        // Add untracked results to the list
        for (const result of untracked) {
          validResultsFromMetadata.push(result);
          
          // Backfill metadata for untracked results
          try {
            await this.setCuResultMetadata(
              storageAccountName,
              containerName,
              sourceFilePath,
              result.resultNumber,
              result.blobPath,
              result.metadata?.analyzedby || 'unknown'
            );
          } catch (backfillErr: any) {
            console.warn(`[HAI-PERSIST] Failed to backfill metadata for result #${result.resultNumber}:`, backfillErr.message);
          }
        }
      }
      
      // Sort by result number
      validResultsFromMetadata.sort((a, b) => a.resultNumber - b.resultNumber);
      
      console.log(`[HAI-PERSIST] Found ${validResultsFromMetadata.length} CU result(s) total (metadata: ${cuMetadata.resultNumbers.length - staleResultNumbers.length}, legacy: ${untracked.length})`);

      return {
        success: true,
        results: validResultsFromMetadata,
        count: validResultsFromMetadata.length
      };

    } catch (error: any) {
      console.error(`[HAI-PERSIST] Error listing CU results:`, error.message);
      return {
        success: false,
        error: error.message || "Failed to list CU results"
      };
    }
  }

  /**
   * Gets a specific CU result by blob path
   */
  async getResult(
    storageAccountName: string,
    containerName: string,
    blobPath: string,
    organizationId: number
  ): Promise<GetHaiResultResponse> {
    console.log(`[HAI-PERSIST] Getting CU result: ${blobPath}`);

    try {
      const containerClient = this.getContainerClient(storageAccountName, containerName);
      
      // Security: Validate blob ownership before access
      const ownership = await this.validateBlobOwnership(containerClient, blobPath, organizationId);
      if (!ownership.valid) {
        return {
          success: false,
          error: ownership.error || "Access denied"
        };
      }

      // Decode path before Azure SDK call - SDK does its own encoding
      const decodedPath = decodeBlobPath(blobPath);
      const blobClient = containerClient.getBlobClient(decodedPath);
      const downloadResponse = await blobClient.download();
      const content = await this.streamToString(downloadResponse.readableStreamBody!);
      const result = JSON.parse(content);

      const properties = await blobClient.getProperties();

      return {
        success: true,
        result,
        metadata: properties.metadata
      };

    } catch (error: any) {
      console.error(`[HAI-PERSIST] Error getting CU result:`, error.message);
      return {
        success: false,
        error: error.message || "Failed to get CU result"
      };
    }
  }

  /**
   * Deletes a specific CU result
   * Also removes the reference from the source blob's metadata
   */
  async deleteResult(
    storageAccountName: string,
    containerName: string,
    blobPath: string,
    organizationId: number
  ): Promise<DeleteHaiResultResponse> {
    console.log(`[HAI-PERSIST] Deleting CU result: ${blobPath}`);

    try {
      const containerClient = this.getContainerClient(storageAccountName, containerName);
      
      // Security: Validate blob ownership before deletion
      const ownership = await this.validateBlobOwnership(containerClient, blobPath, organizationId);
      if (!ownership.valid) {
        return {
          success: false,
          error: ownership.error || "Access denied"
        };
      }

      // Decode path before Azure SDK call - SDK does its own encoding
      const decodedPath = decodeBlobPath(blobPath);
      const blobClient = containerClient.getBlobClient(decodedPath);
      
      // Before deleting, get the source file path and result number from the CU result blob
      // This is needed to update the source blob's metadata
      let sourceFilePath: string | null = null;
      let resultNumber: number | null = null;
      
      try {
        const properties = await blobClient.getProperties();
        const metadata = properties.metadata || {};
        
        // Try to get source file path from metadata (base64 encoded)
        if (metadata.sourcefilepath) {
          sourceFilePath = Buffer.from(metadata.sourcefilepath, 'base64').toString('utf-8');
        }
        
        // Get result number from metadata
        if (metadata.resultnumber) {
          resultNumber = parseInt(metadata.resultnumber, 10);
        }
        
        // Fallback: Read JSON content if metadata not available
        if (!sourceFilePath || !resultNumber) {
          console.log(`[HAI-PERSIST] Metadata incomplete, reading JSON content for source info`);
          const downloadResponse = await blobClient.download();
          const content = await this.streamToString(downloadResponse.readableStreamBody!);
          const jsonData = JSON.parse(content);
          sourceFilePath = jsonData.sourceFilePath || sourceFilePath;
          resultNumber = jsonData.resultNumber || resultNumber;
        }
      } catch (readErr: any) {
        console.warn(`[HAI-PERSIST] Could not read CU result for metadata cleanup:`, readErr.message);
      }
      
      // Delete the CU result blob
      await blobClient.deleteIfExists();
      console.log(`[HAI-PERSIST] Deleted CU result blob: ${blobPath}`);

      // Remove reference from source blob's metadata
      if (sourceFilePath && resultNumber) {
        try {
          await this.removeCuResultMetadata(
            storageAccountName,
            containerName,
            sourceFilePath,
            resultNumber
          );
          console.log(`[HAI-PERSIST] Removed CU result reference from source blob metadata`);
        } catch (metadataErr: any) {
          // Log but don't fail - the CU result file was deleted successfully
          console.warn(`[HAI-PERSIST] Failed to remove metadata reference:`, metadataErr.message);
        }
      } else {
        console.warn(`[HAI-PERSIST] Could not determine source file path or result number for metadata cleanup`);
      }

      return {
        success: true,
        message: "CU result deleted successfully"
      };

    } catch (error: any) {
      console.error(`[HAI-PERSIST] Error deleting CU result:`, error.message);
      return {
        success: false,
        error: error.message || "Failed to delete CU result"
      };
    }
  }

  /**
   * Deletes all CU results for a source file (cascade delete)
   * Called when source file is deleted
   * Uses metadata-based approach to find CU results, with fallback to legacy folder scan
   */
  async deleteAllResultsForFile(
    storageAccountName: string,
    containerName: string,
    sourceFilePath: string
  ): Promise<DeleteHaiResultResponse> {
    console.log(`[HAI-PERSIST] Cascade deleting all CU results for: ${sourceFilePath}`);

    try {
      const containerClient = this.getContainerClient(storageAccountName, containerName);
      const cuFolderPath = getCuFolderPath(sourceFilePath);

      // Primary method: Get CU result paths from source blob's metadata
      const cuMetadata = await this.getCuResultsMetadata(storageAccountName, containerName, sourceFilePath);
      let blobPathsToDelete: string[] = [];
      
      if (cuMetadata.resultNumbers.length > 0) {
        // Use metadata-based paths
        blobPathsToDelete = Object.values(cuMetadata.results).map(entry => entry.blobPath);
        console.log(`[HAI-PERSIST] Found ${blobPathsToDelete.length} CU result(s) via metadata for cascade delete`);
      } else {
        // Fallback: Legacy folder scan
        console.log(`[HAI-PERSIST] No metadata found, using legacy folder scan for cascade delete`);
        const legacyResults = await this.listResultsInternal(containerClient, cuFolderPath, sourceFilePath);
        blobPathsToDelete = legacyResults.map(r => r.blobPath);
      }
      
      if (blobPathsToDelete.length === 0) {
        console.log(`[HAI-PERSIST] No CU results found for cascade delete`);
        return {
          success: true,
          message: "No CU results to delete"
        };
      }

      let deletedCount = 0;
      for (const blobPath of blobPathsToDelete) {
        try {
          // Decode path before Azure SDK call - SDK does its own encoding
          const decodedPath = decodeBlobPath(blobPath);
          const blobClient = containerClient.getBlobClient(decodedPath);
          await blobClient.deleteIfExists();
          deletedCount++;
        } catch (deleteError: any) {
          console.warn(`[HAI-PERSIST] Failed to delete ${blobPath}:`, deleteError.message);
        }
      }

      console.log(`[HAI-PERSIST] Cascade deleted ${deletedCount}/${blobPathsToDelete.length} CU result(s)`);
      
      // Note: We don't need to update source blob's metadata here because the source file
      // is being deleted (hence cascade delete). The metadata will be deleted with the blob.

      return {
        success: true,
        message: `Deleted ${deletedCount} CU result(s)`
      };

    } catch (error: any) {
      console.error(`[HAI-PERSIST] Error cascade deleting CU results:`, error.message);
      return {
        success: false,
        error: error.message || "Failed to cascade delete CU results"
      };
    }
  }

  /**
   * Generates a SAS URL for downloading a CU result
   */
  async generateSasUrl(
    storageAccountName: string,
    containerName: string,
    blobPath: string,
    expiresInMinutes: number = 60
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const containerClient = this.getContainerClient(storageAccountName, containerName);
      // Decode path before Azure SDK call - SDK does its own encoding
      const decodedPath = decodeBlobPath(blobPath);
      console.log(`[HAI-PERSIST] Generating SAS URL for: ${blobPath} -> decoded: ${decodedPath}`);
      const blobClient = containerClient.getBlobClient(decodedPath);

      const delegationKey = await this.getBlobServiceClient(storageAccountName)
        .getUserDelegationKey(
          new Date(Date.now() - 5 * 60 * 1000), // Account for clock skew
          new Date(Date.now() + (expiresInMinutes + 15) * 60 * 1000)
        );

      const sasToken = generateBlobSASQueryParameters(
        {
          containerName,
          blobName: decodedPath,
          permissions: BlobSASPermissions.parse("r"),
          startsOn: new Date(Date.now() - 5 * 60 * 1000), // Account for clock skew
          expiresOn: new Date(Date.now() + (expiresInMinutes + 15) * 60 * 1000),
          protocol: SASProtocol.Https
        },
        delegationKey,
        storageAccountName
      ).toString();

      return {
        success: true,
        url: `${blobClient.url}?${sasToken}`
      };

    } catch (error: any) {
      console.error(`[HAI-PERSIST] Error generating SAS URL:`, error.message);
      return {
        success: false,
        error: error.message || "Failed to generate SAS URL"
      };
    }
  }

  /**
   * Saves a post-call analysis result to a fixed blob path per source file.
   * Path: hai_folder/{directory}/{filename}_postcall_analysis.json
   * Overwrites any existing result — one post-call analysis per file.
   */
  async savePostCallAnalysis(
    storageAccountName: string,
    containerName: string,
    sourceFilePath: string,
    analysisData: any,
    organizationId: number,
    userEmail: string
  ): Promise<{ success: boolean; blobPath?: string; error?: string }> {
    try {
      const containerClient = this.getContainerClient(storageAccountName, containerName);
      const cuFolderPath = getCuFolderPath(sourceFilePath);
      const fileName = sourceFilePath.split('/').pop() || sourceFilePath;
      const blobPath = `${cuFolderPath}/${fileName}_postcall_analysis.json`;

      const resultData = {
        sourceFilePath,
        sourceFileName: fileName,
        organizationId,
        savedBy: userEmail,
        savedAt: new Date().toISOString(),
        analysisData
      };

      const content = JSON.stringify(resultData, null, 2);
      const blobClient = containerClient.getBlockBlobClient(blobPath);
      await blobClient.upload(content, Buffer.byteLength(content), {
        blobHTTPHeaders: { blobContentType: 'application/json' },
        metadata: {
          sourcefilepath: Buffer.from(sourceFilePath).toString('base64'),
          organizationid: organizationId.toString(),
          savedby: userEmail,
          savedat: new Date().toISOString(),
          type: 'postcall_analysis'
        },
        overwrite: true
      });

      // Also tag the source file so it's easy to discover
      try {
        const sourceClient = containerClient.getBlockBlobClient(sourceFilePath);
        const props = await sourceClient.getProperties();
        const existingMeta = props.metadata || {};
        await sourceClient.setMetadata({
          ...existingMeta,
          postcall_path: Buffer.from(blobPath).toString('base64'),
          postcall_savedat: new Date().toISOString()
        });
      } catch (metaErr: any) {
        console.warn(`[HAI-PERSIST] Could not update source blob metadata with postcall ref:`, metaErr.message);
      }

      console.log(`[HAI-PERSIST] Saved post-call analysis: ${blobPath}`);
      return { success: true, blobPath };
    } catch (error: any) {
      console.error(`[HAI-PERSIST] Error saving post-call analysis:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Retrieves a previously saved post-call analysis for a source file.
   * Returns null data if not found.
   */
  async getPostCallAnalysis(
    storageAccountName: string,
    containerName: string,
    sourceFilePath: string,
    organizationId: number
  ): Promise<{ success: boolean; data?: any; savedAt?: string; savedBy?: string; error?: string }> {
    try {
      const containerClient = this.getContainerClient(storageAccountName, containerName);
      const cuFolderPath = getCuFolderPath(sourceFilePath);
      const fileName = sourceFilePath.split('/').pop() || sourceFilePath;
      const blobPath = `${cuFolderPath}/${fileName}_postcall_analysis.json`;

      const blobClient = containerClient.getBlockBlobClient(blobPath);
      const exists = await blobClient.exists();
      if (!exists) {
        return { success: true, data: null };
      }

      const downloadResp = await blobClient.download(0);
      const content = await this.streamToString(downloadResp.readableStreamBody as NodeJS.ReadableStream);
      const parsed = JSON.parse(content);

      // Verify org ownership
      if (parsed.organizationId !== undefined && parsed.organizationId !== organizationId) {
        console.warn(`[HAI-PERSIST] Post-call analysis org mismatch for: ${blobPath}`);
        return { success: false, error: "Access denied" };
      }

      return {
        success: true,
        data: parsed.analysisData,
        savedAt: parsed.savedAt,
        savedBy: parsed.savedBy
      };
    } catch (error: any) {
      if (error.statusCode === 404) {
        return { success: true, data: null };
      }
      console.error(`[HAI-PERSIST] Error retrieving post-call analysis:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Eval OCR Cache — lightweight markdown cache for eval pipeline
  // Stored at: hai_folder/{dir}/{filename}_eval_ocr_cache.json
  // Used to avoid re-running CU on the same question paper / standard
  // answer when processing a bulk batch of student answer sheets.
  // ─────────────────────────────────────────────────────────────────

  private getEvalOcrCachePath(sourceFilePath: string): string {
    const cuFolderPath = getCuFolderPath(sourceFilePath);
    const fullFileName = getFileName(sourceFilePath);
    const sanitized = sanitizeFileName(fullFileName);
    return `${cuFolderPath}/${sanitized}_eval_ocr_cache.json`;
  }

  async saveEvalOcrCache(
    storageAccountName: string,
    containerName: string,
    sourceFilePath: string,
    markdown: string,
    organizationId: number
  ): Promise<void> {
    try {
      const cachePath = this.getEvalOcrCachePath(sourceFilePath);
      const containerClient = this.getContainerClient(storageAccountName, containerName);
      const blobClient = containerClient.getBlockBlobClient(cachePath);
      const content = JSON.stringify({
        filePath: sourceFilePath,
        organizationId,
        markdown,
        cachedAt: new Date().toISOString(),
      }, null, 2);
      await blobClient.upload(content, Buffer.byteLength(content), {
        blobHTTPHeaders: { blobContentType: "application/json" },
        metadata: { organizationid: String(organizationId) },
        overwrite: true,
      } as any);
      console.log(`[EvalOcrCache] Saved OCR cache for: ${sourceFilePath} → ${cachePath}`);
    } catch (err: any) {
      console.warn(`[EvalOcrCache] Failed to save OCR cache for ${sourceFilePath}:`, err.message);
    }
  }

  async getEvalOcrCache(
    storageAccountName: string,
    containerName: string,
    sourceFilePath: string,
    organizationId: number
  ): Promise<string | null> {
    try {
      const cachePath = this.getEvalOcrCachePath(sourceFilePath);
      const containerClient = this.getContainerClient(storageAccountName, containerName);
      const blobClient = containerClient.getBlobClient(cachePath);
      const exists = await blobClient.exists();
      if (!exists) return null;
      const download = await blobClient.download();
      const text = await this.streamToString(download.readableStreamBody!);
      const data = JSON.parse(text);
      if (Number(data.organizationId) !== organizationId) {
        console.warn(`[EvalOcrCache] Org mismatch for ${cachePath}: expected ${organizationId}, got ${data.organizationId}`);
        return null;
      }
      console.log(`[EvalOcrCache] Cache HIT for: ${sourceFilePath} (cached at ${data.cachedAt})`);
      return data.markdown || null;
    } catch (err: any) {
      console.warn(`[EvalOcrCache] Cache miss/error for ${sourceFilePath}:`, err.message);
      return null;
    }
  }

  /**
   * Helper to convert readable stream to string
   */
  private async streamToString(readableStream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      readableStream.on("data", (data) => {
        chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
      });
      readableStream.on("end", () => {
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
      readableStream.on("error", reject);
    });
  }
}

export const hearingAiPersistenceService = new HearingAiPersistenceService();
