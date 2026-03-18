import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";

/**
 * Blob Metadata Helper Module for Zapper
 * Handles writing malware scan result metadata to blob storage
 * Used for HNS storage accounts where Defender doesn't write tags automatically
 * 
 * Note: Uses blob metadata instead of blob index tags because ADLS Gen2 (HNS-enabled)
 * storage accounts do not support blob index tags. This is a platform limitation.
 */

/**
 * Parse blob URI to extract account, container, and blob name
 * Example: https://storageaccount.blob.core.windows.net/container/path/to/blob.txt
 * Note: Handles URL-encoded blob names (e.g., File%20Name.jpg becomes File Name.jpg)
 */
export function parseBlobUri(blobUri: string): {
  accountUrl: string;
  containerName: string;
  blobName: string;
  accountName: string;
} {
  try {
    const url = new URL(blobUri);
    const accountName = url.hostname.split('.')[0];
    const accountUrl = `https://${url.hostname}`;
    
    // Path format: /container/path/to/blob
    const pathParts = url.pathname.slice(1).split('/');
    const containerName = decodeURIComponent(pathParts[0]);
    // Decode the blob name to handle special characters like spaces (%20)
    const blobName = decodeURIComponent(pathParts.slice(1).join('/'));

    return {
      accountUrl,
      containerName,
      blobName,
      accountName
    };
  } catch (error: any) {
    throw new Error(`Failed to parse blob URI: ${blobUri}. Error: ${error.message}`);
  }
}

/**
 * Map Defender scan result to our standardized tag values
 * Returns values matching the frontend expectations (Clean, Malicious, etc.)
 */
export function mapScanResult(scanResultType: string | undefined): string {
  switch (scanResultType) {
    case 'No threats found':
      return 'Clean';
    case 'Malicious':
      return 'Malicious';
    case 'Not Scanned':
      return 'NotScanned';
    case 'Error':
    case 'Scan aborted':
    case 'Scan timed out':
      return 'Error';
    default:
      console.warn(`[BLOB TAGS] Unknown scan result type: ${scanResultType}, defaulting to 'Error'`);
      return 'Error';
  }
}

/**
 * Write malware scan result metadata to a blob
 * Used for HNS mode where Defender doesn't write tags automatically
 * Note: Uses metadata instead of index tags because ADLS Gen2 doesn't support blob index tags
 */
export async function setMalwareTagsByUri(
  blobUri: string,
  result: string,
  scanTimeUtc: string
): Promise<void> {
  const { accountUrl, containerName, blobName } = parseBlobUri(blobUri);

  console.log(`[BLOB METADATA] Writing metadata to blob: ${blobName} in container: ${containerName}`);
  console.log(`[BLOB METADATA] Scan result: ${result}, Scan time: ${scanTimeUtc}`);

  try {
    // Use Azure AD authentication (DefaultAzureCredential)
    const credential = new DefaultAzureCredential();
    const blobServiceClient = new BlobServiceClient(accountUrl, credential);
    
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(blobName);

    // IMPORTANT: Read existing metadata first, then merge with new values
    // setMetadata() REPLACES all metadata, so we must preserve existing keys
    let existingMetadata: Record<string, string> = {};
    try {
      const properties = await blobClient.getProperties();
      existingMetadata = properties.metadata || {};
      console.log(`[BLOB METADATA] Existing metadata keys: ${Object.keys(existingMetadata).join(', ') || '(none)'}`);
    } catch (readErr: any) {
      console.warn(`[BLOB METADATA] Could not read existing metadata, will set fresh: ${readErr.message}`);
    }

    // Merge: preserve existing metadata and add/update scan results
    const mergedMetadata = {
      ...existingMetadata,
      zapper_scan_result: result,
      zapper_scan_time: scanTimeUtc
    };

    await blobClient.setMetadata(mergedMetadata);

    console.log(`[BLOB METADATA] Successfully wrote merged metadata to ${blobName} (${Object.keys(mergedMetadata).length} keys)`);
  } catch (error: any) {
    console.error(`[BLOB METADATA] Error writing metadata to blob:`, error.message);
    throw new Error(`Failed to write malware metadata to blob: ${error.message}`);
  }
}

/**
 * Read malware scan metadata from a blob
 * Returns null if no metadata found
 * Note: Uses metadata instead of index tags because ADLS Gen2 doesn't support blob index tags
 */
export async function getMalwareTagsByUri(
  blobUri: string
): Promise<{ result: string; scanTime: string } | null> {
  const { accountUrl, containerName, blobName } = parseBlobUri(blobUri);

  console.log(`[BLOB METADATA] Reading metadata from blob: ${blobName} in container: ${containerName}`);

  try {
    const credential = new DefaultAzureCredential();
    const blobServiceClient = new BlobServiceClient(accountUrl, credential);
    
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(blobName);

    // Get blob properties which includes metadata
    const properties = await blobClient.getProperties();
    const metadata = properties.metadata;

    if (metadata && (metadata.zapper_scan_result || metadata.zapper_scan_time)) {
      return {
        result: metadata.zapper_scan_result || 'NotScanned',
        scanTime: metadata.zapper_scan_time || ''
      };
    }

    return null;
  } catch (error: any) {
    console.error(`[BLOB METADATA] Error reading metadata from blob:`, error.message);
    return null;
  }
}

/**
 * Check if HNS mode is enabled via environment variable
 * When enabled, Zapper writes custom scan result tags via Event Grid webhook
 * When disabled, Defender writes native tags automatically
 */
export function isHNSEnabled(): boolean {
  return process.env.ZAPPER_HNS_FLAG === 'TRUE';
}

/**
 * Check if a storage account is HNS-enabled (ADLS Gen2)
 * This is important because HNS accounts need Event Grid + tag writing
 */
export function isStorageAccountHNS(kind: string | undefined): boolean {
  if (!kind) return false;
  return kind === 'adls' || kind === 'StorageV2' || kind.includes('Gen2');
}
