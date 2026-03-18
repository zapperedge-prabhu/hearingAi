/**
 * Utility functions for handling Azure blob path encoding
 * 
 * CRITICAL: Azure Storage blob paths require special handling of reserved URL characters
 * like #, %, ?, etc. to prevent browser truncation and SAS signature mismatches.
 */

/**
 * URL-encode blob path for Azure Storage while preserving folder structure.
 * 
 * IMPORTANT: Only use this when manually constructing URLs for browser consumption.
 * Do NOT use when passing blob names to Azure SDK methods (getBlobClient, generateBlobSASQueryParameters, etc.)
 * as those methods expect raw blob names and handle encoding internally.
 * 
 * This function encodes special URL characters (#, %, ?, etc.) that browsers interpret
 * as URL delimiters, which would otherwise cause blob name truncation and SAS signature mismatches.
 * 
 * @param blobPath - Raw blob path (may include folder/file.txt format)
 * @returns URL-encoded blob path safe for browser URLs
 * 
 * @example
 * encodeBlobPath("folder/Booking_#_123.pdf")
 * // Returns: "folder/Booking_%23_123.pdf"
 * 
 * @example
 * encodeBlobPath("path/file%20with%20spaces.txt")
 * // Returns: "path/file%2520with%2520spaces.txt" (double-encoded if already encoded)
 * 
 * @example
 * // CORRECT usage - manual URL construction:
 * const sasUrl = `https://account.blob.core.windows.net/container/${encodeBlobPath(blobPath)}?${sasToken}`;
 * 
 * @example
 * // WRONG usage - Azure SDK call (DO NOT encode here):
 * const options = { blobName: encodeBlobPath(blobPath) }; // ❌ WRONG - breaks SAS signature
 * const options = { blobName: blobPath }; // ✅ CORRECT - SDK handles encoding
 */
export function encodeBlobPath(blobPath: string): string {
  // Split by forward slash to preserve Azure's virtual folder hierarchy
  const parts = blobPath.split('/');
  
  // Encode each path segment separately using standard URI encoding
  // This handles special characters: # → %23, % → %25, ? → %3F, etc.
  const encodedParts = parts.map(segment => encodeURIComponent(segment));
  
  // Rejoin with forward slashes (unencoded) to maintain folder structure
  return encodedParts.join('/');
}

/**
 * Build a complete Azure Blob Storage URL with proper encoding
 * 
 * @param storageAccount - Storage account name
 * @param containerName - Container name
 * @param blobPath - Raw blob path
 * @param sasToken - Optional SAS token (without leading ?)
 * @returns Fully constructed and encoded blob URL
 * 
 * @example
 * buildBlobUrl("mystorageacct", "mycontainer", "folder/file#123.pdf")
 * // Returns: "https://mystorageacct.blob.core.windows.net/mycontainer/folder/file%23123.pdf"
 * 
 * @example
 * buildBlobUrl("mystorageacct", "mycontainer", "folder/file.pdf", "sig=abc123&se=2024...")
 * // Returns: "https://mystorageacct.blob.core.windows.net/mycontainer/folder/file.pdf?sig=abc123&se=2024..."
 */
export function buildBlobUrl(
  storageAccount: string,
  containerName: string,
  blobPath: string,
  sasToken?: string
): string {
  const baseUrl = `https://${storageAccount}.blob.core.windows.net/${containerName}/${encodeBlobPath(blobPath)}`;
  return sasToken ? `${baseUrl}?${sasToken}` : baseUrl;
}

/**
 * Build a complete Azure Data Lake Storage Gen2 URL with proper encoding
 * 
 * @param storageAccount - Storage account name
 * @param containerName - Container/filesystem name
 * @param blobPath - Raw blob path
 * @param sasToken - Optional SAS token (without leading ?)
 * @returns Fully constructed and encoded ADLS Gen2 URL
 * 
 * @example
 * buildDfsUrl("mystorageacct", "mycontainer", "folder/file#123.pdf")
 * // Returns: "https://mystorageacct.dfs.core.windows.net/mycontainer/folder/file%23123.pdf"
 */
export function buildDfsUrl(
  storageAccount: string,
  containerName: string,
  blobPath: string,
  sasToken?: string
): string {
  const baseUrl = `https://${storageAccount}.dfs.core.windows.net/${containerName}/${encodeBlobPath(blobPath)}`;
  return sasToken ? `${baseUrl}?${sasToken}` : baseUrl;
}
