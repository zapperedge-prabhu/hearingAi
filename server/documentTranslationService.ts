import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";
import fetch from "node-fetch";

// Translation metadata structure stored on source blob
interface TranslationMetadata {
  translatedLanguages: string[];  // e.g., ["de", "fr", "hi"]
  translations: {
    [languageCode: string]: {
      blobPath: string;           // e.g., "translated_doc/Hiring/cvs/resume_de_2026-01-10.pdf"
      translatedAt: string;       // ISO timestamp
      originalFilename: string;   // Original source filename
    };
  };
}

interface TranslateDocumentInput {
  sourceSasUrl: string;
  destinationContainerSasUrl: string;
  targetLanguage: string;
  hubName: string;
  targetFolder?: string; // Optional folder prefix for translated files (e.g., "translated_doc")
}

interface TranslationResult {
  success: boolean;
  status: string;
  translatedFiles?: string[];
  computedTargetPath?: string;
  error?: string;
}

interface TranslationStatus {
  id: string;
  status: string;
  summary?: {
    total: number;
    success: number;
    failed: number;
    inProgress: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

const COGNITIVE_SERVICES_SCOPE = "https://cognitiveservices.azure.com/.default";
const MAX_POLL_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 5000;

/**
 * Safely decode URI component, handling already-decoded or malformed strings
 * Metadata stores encoded paths (from Azure Translator), but Azure SDK expects decoded paths
 */
function safeDecodeURIComponent(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch (e) {
    // If decoding fails, the string is likely already decoded or malformed
    return str;
  }
}

/**
 * Sanitize language code for use as Azure Blob metadata key
 * Azure metadata keys must be valid C# identifiers (letters, digits, underscores only)
 * Language codes like "zh-Hans" have hyphens that must be replaced with underscores
 */
function sanitizeLanguageCodeForMetadataKey(langCode: string): string {
  return langCode.replace(/-/g, '_');
}

/**
 * Reverse sanitization: convert metadata key back to original language code
 * Converts "zh_Hans" back to "zh-Hans"
 */
function unsanitizeLanguageCodeFromMetadataKey(sanitizedCode: string): string {
  // Map of known sanitized codes back to original
  const knownMappings: { [key: string]: string } = {
    'zh_Hans': 'zh-Hans',
    'zh_Hant': 'zh-Hant',
  };
  return knownMappings[sanitizedCode] || sanitizedCode;
}

/**
 * Decode a blob path that may contain encoded segments (e.g., "test%20folder/file.pdf")
 * Returns decoded path for Azure SDK operations (e.g., "test folder/file.pdf")
 */
function decodeBlobPath(encodedPath: string): string {
  return encodedPath.split('/').map(seg => safeDecodeURIComponent(seg)).join('/');
}

/**
 * Supported language codes for translation detection
 * Must match the list in client/src/pages/document-translation.tsx
 */
const SUPPORTED_LANGUAGE_CODES = [
  'ar', 'zh-Hans', 'zh-Hant', 'nl', 'en', 'fr', 'de', 'hi', 'it', 'ja', 'ko', 'pl', 'pt', 'ru', 'es', 'tr', 'vi'
];

/**
 * Parse a translated filename to extract language code and timestamp
 * Pattern: {baseName}_{langCode}_{date}_{time}_{rand}.{ext}
 * Example: "CoverLetter_hi_2026-01-10_11-49-20_1442.txt" -> { lang: "hi", timestamp: "2026-01-10T11:49:20" }
 */
function parseTranslatedFilename(filename: string, sourceBaseName: string): { lang: string; timestamp: string } | null {
  // Remove extension
  const lastDotIndex = filename.lastIndexOf('.');
  const nameWithoutExt = lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename;
  
  // The pattern is: {sourceBaseName}_{langCode}_{date}_{time}_{rand}
  // where date is YYYY-MM-DD and time is HH-MM-SS
  // Example: CoverLetter_hi_2026-01-10_11-49-20_1442
  
  // Start by checking if the filename starts with the source base name
  if (!nameWithoutExt.startsWith(sourceBaseName + '_')) {
    return null;
  }
  
  // Remove the source base name prefix
  const remainder = nameWithoutExt.substring(sourceBaseName.length + 1);
  
  // Try to match pattern: {lang}_{YYYY-MM-DD}_{HH-MM-SS}_{rand}
  // For simple language codes like "hi", "de", "fr"
  for (const lang of SUPPORTED_LANGUAGE_CODES) {
    const langPrefix = lang + '_';
    if (remainder.startsWith(langPrefix)) {
      const afterLang = remainder.substring(langPrefix.length);
      // Try to match date pattern: YYYY-MM-DD_HH-MM-SS_NNNN
      const dateTimeMatch = afterLang.match(/^(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})_\d+$/);
      if (dateTimeMatch) {
        const date = dateTimeMatch[1];
        const time = dateTimeMatch[2].replace(/-/g, ':');
        return {
          lang,
          timestamp: `${date}T${time}`,
        };
      }
    }
  }
  
  return null;
}

interface ParsedSourcePath {
  directoryPath: string;  // e.g., "Hiring/cvs" or "" for root
  filename: string;       // e.g., "resume.pdf"
  uniqueFilename: string; // e.g., "resume_hi_2026-01-10_06-20-31_1234.pdf"
}

function parseSourcePathAndGenerateUniqueName(sourceUrl: string, targetLanguage: string): ParsedSourcePath {
  try {
    const url = new URL(sourceUrl.split('?')[0]);
    // pathname is like: /container-name/Hiring/cvs/filename.pdf
    // We need to extract path after container name
    const pathParts = url.pathname.split('/').filter(p => p.length > 0);
    
    if (pathParts.length === 0) {
      throw new Error('No path segments found in URL');
    }
    
    // First segment is container name, rest is the path including filename
    // pathParts[0] = container name
    // pathParts[1...n-1] = directory path
    // pathParts[n] = filename
    const containerName = pathParts[0];
    const originalFilename = decodeURIComponent(pathParts[pathParts.length - 1]);
    
    // Directory path is everything between container and filename
    const directorySegments = pathParts.slice(1, -1);
    const directoryPath = directorySegments.map(s => decodeURIComponent(s)).join('/');
    
    // Generate unique filename
    const lastDotIndex = originalFilename.lastIndexOf('.');
    const baseName = lastDotIndex > 0 ? originalFilename.substring(0, lastDotIndex) : originalFilename;
    const extension = lastDotIndex > 0 ? originalFilename.substring(lastDotIndex) : '';
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
    const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    
    const uniqueFilename = `${baseName}_${targetLanguage}_${timestamp}_${randomNum}${extension}`;
    
    console.log(`[DOC-TRANSLATE] Parsed source path:`);
    console.log(`[DOC-TRANSLATE]   Container: ${containerName}`);
    console.log(`[DOC-TRANSLATE]   Directory: ${directoryPath || '(root)'}`);
    console.log(`[DOC-TRANSLATE]   Original filename: ${originalFilename}`);
    console.log(`[DOC-TRANSLATE]   Unique filename: ${uniqueFilename}`);
    
    return {
      directoryPath,
      filename: originalFilename,
      uniqueFilename,
    };
  } catch (error) {
    console.error('[DOC-TRANSLATE] Error parsing source path:', error);
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 10000);
    return {
      directoryPath: '',
      filename: 'unknown.pdf',
      uniqueFilename: `translated_${targetLanguage}_${timestamp}_${randomNum}.pdf`,
    };
  }
}

class DocumentTranslationService {
  private credential: DefaultAzureCredential;
  private isDevelopment: boolean;

  constructor() {
    this.credential = new DefaultAzureCredential();
    this.isDevelopment = process.env.NODE_ENV === 'development';
    console.log('[DOC-TRANSLATE] Document Translation Service initialized');
  }

  private async getAccessToken(): Promise<string> {
    try {
      const tokenResponse = await this.credential.getToken(COGNITIVE_SERVICES_SCOPE);
      return tokenResponse.token;
    } catch (error) {
      console.error('[DOC-TRANSLATE] Failed to get Azure access token:', error);
      throw new Error('Azure authentication failed for Document Translation');
    }
  }

  private buildTranslatorEndpoint(hubName: string): string {
    return `https://${hubName}.cognitiveservices.azure.com/translator/document/batches?api-version=2024-05-01`;
  }

  async translateDocumentWithLayout(input: TranslateDocumentInput): Promise<TranslationResult> {
    const { sourceSasUrl, destinationContainerSasUrl, targetLanguage, hubName, targetFolder } = input;
    
    console.log('[DOC-TRANSLATE] Starting document translation');
    console.log(`[DOC-TRANSLATE] Hub: ${hubName}`);
    console.log(`[DOC-TRANSLATE] Target language: ${targetLanguage}`);
    console.log(`[DOC-TRANSLATE] Target folder: ${targetFolder || '(none - preserve original path)'}`);
    
    if (this.isDevelopment) {
      console.log('[DOC-TRANSLATE] Running in development mode - Azure features may be limited');
    }

    try {
      const accessToken = await this.getAccessToken();
      const endpoint = this.buildTranslatorEndpoint(hubName);
      
      console.log(`[DOC-TRANSLATE] Calling endpoint: ${endpoint}`);

      // Detect if source is blob-level SAS (sr=b) or container-level (sr=c)
      const isFileLevelSas = sourceSasUrl.includes('sr=b');
      console.log(`[DOC-TRANSLATE] Source SAS type: ${isFileLevelSas ? 'blob/file level' : 'container level'}`);

      // Parse source path and generate unique filename preserving directory structure
      const parsedPath = parseSourcePathAndGenerateUniqueName(sourceSasUrl, targetLanguage);

      // Build the target URL with directory path and unique filename
      let targetUrl = destinationContainerSasUrl;
      let computedTargetPath: string | undefined;
      
      if (isFileLevelSas) {
        // For file-level source, we need file-level target with preserved directory structure
        const destUrlParts = destinationContainerSasUrl.split('?');
        const destBaseUrl = destUrlParts[0];
        const destSasQuery = destUrlParts[1] || '';
        
        // Build path: [targetFolder/]directoryPath/uniqueFilename
        // If targetFolder is provided, prepend it to preserve organization
        // IMPORTANT: Azure Translator returns ENCODED paths in /documents response.
        // We store ENCODED paths in metadata for consistency with existing pipeline.
        // When calling Azure SDK methods (getBlobClient), decode the path first.
        let pathSegments: string[] = [];
        
        if (targetFolder && targetFolder.trim()) {
          pathSegments.push(encodeURIComponent(targetFolder.trim()));
        }
        
        // Add original directory path if it exists (encode each segment)
        if (parsedPath.directoryPath) {
          pathSegments = pathSegments.concat(
            parsedPath.directoryPath.split('/').map(seg => encodeURIComponent(seg))
          );
        }
        
        // Add the unique filename (encoded)
        pathSegments.push(encodeURIComponent(parsedPath.uniqueFilename));
        
        // Store ENCODED path for metadata - matches Azure Translator's /documents response format
        const targetPath = pathSegments.join('/');
        computedTargetPath = targetPath;
        
        targetUrl = `${destBaseUrl}/${targetPath}?${destSasQuery}`;
        console.log(`[DOC-TRANSLATE] Target URL with directory structure: ${targetUrl.split('?')[0]}`);
        console.log(`[DOC-TRANSLATE] Computed target blob path (encoded for metadata): ${computedTargetPath}`);
      } else {
        // Container-level SAS (sr=c) - batch operations can't compute fallback paths
        // because we don't know individual file paths until translation completes
        console.log(`[DOC-TRANSLATE] Container-level SAS detected - metadata fallback not available`);
        console.log(`[DOC-TRANSLATE] Will rely on /documents API response for metadata updates`);
      }

      const requestBody: any = {
        inputs: [
          {
            storageType: isFileLevelSas ? 'File' : 'Folder',
            source: {
              sourceUrl: sourceSasUrl,
            },
            targets: [
              {
                targetUrl: targetUrl,
                language: targetLanguage,
              },
            ],
          },
        ],
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[DOC-TRANSLATE] Translation API error: ${response.status} ${response.statusText}`);
        console.error(`[DOC-TRANSLATE] Error details: ${errorText}`);
        return {
          success: false,
          status: 'Failed',
          error: `Translation API returned ${response.status}: ${errorText}`,
        };
      }

      const operationLocation = response.headers.get('Operation-Location');
      if (!operationLocation) {
        console.error('[DOC-TRANSLATE] No Operation-Location header in response');
        return {
          success: false,
          status: 'Failed',
          error: 'No Operation-Location header returned by Azure Translator',
        };
      }

      console.log(`[DOC-TRANSLATE] Operation started. Polling: ${operationLocation}`);

      const result = await this.pollTranslationStatus(operationLocation, accessToken, computedTargetPath);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[DOC-TRANSLATE] Translation failed: ${errorMessage}`);
      return {
        success: false,
        status: 'Failed',
        error: errorMessage,
      };
    }
  }

  private async pollTranslationStatus(operationUrl: string, accessToken: string, computedTargetPath?: string): Promise<TranslationResult> {
    let attempts = 0;

    while (attempts < MAX_POLL_ATTEMPTS) {
      attempts++;
      console.log(`[DOC-TRANSLATE] Polling attempt ${attempts}/${MAX_POLL_ATTEMPTS}`);

      try {
        const response = await fetch(operationUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[DOC-TRANSLATE] Poll error: ${response.status} - ${errorText}`);
          
          if (attempts >= MAX_POLL_ATTEMPTS) {
            return {
              success: false,
              status: 'Failed',
              error: `Polling failed after ${attempts} attempts: ${response.status}`,
            };
          }
          
          await this.sleep(POLL_INTERVAL_MS);
          continue;
        }

        const status = await response.json() as TranslationStatus;
        console.log(`[DOC-TRANSLATE] Status: ${status.status}`);

        if (status.status === 'Succeeded') {
          console.log('[DOC-TRANSLATE] Translation completed successfully');
          const translatedFiles = await this.getTranslatedDocuments(operationUrl, accessToken);
          return {
            success: true,
            status: 'Succeeded',
            translatedFiles,
            computedTargetPath,
          };
        }

        if (status.status === 'Failed' || status.status === 'Cancelled' || status.status === 'ValidationFailed') {
          // Fetch detailed document-level errors
          const detailedErrors = await this.getDocumentErrors(operationUrl, accessToken);
          const errorMsg = status.error 
            ? `${status.error.code}: ${status.error.message}` 
            : (detailedErrors || `Translation ${status.status}`);
          console.error(`[DOC-TRANSLATE] Translation ${status.status}: ${errorMsg}`);
          return {
            success: false,
            status: status.status,
            error: errorMsg,
          };
        }

        if (status.status === 'NotStarted' || status.status === 'Running') {
          if (status.summary) {
            console.log(`[DOC-TRANSLATE] Progress: ${status.summary.success}/${status.summary.total} completed, ${status.summary.inProgress} in progress`);
          }
          await this.sleep(POLL_INTERVAL_MS);
          continue;
        }

        await this.sleep(POLL_INTERVAL_MS);

      } catch (error) {
        console.error(`[DOC-TRANSLATE] Poll exception: ${error}`);
        if (attempts >= MAX_POLL_ATTEMPTS) {
          return {
            success: false,
            status: 'Failed',
            error: `Polling exception after ${attempts} attempts: ${error}`,
          };
        }
        await this.sleep(POLL_INTERVAL_MS);
      }
    }

    return {
      success: false,
      status: 'Timeout',
      error: `Translation polling timed out after ${MAX_POLL_ATTEMPTS} attempts`,
    };
  }

  private async getDocumentErrors(operationUrl: string, accessToken: string): Promise<string | null> {
    try {
      const documentsUrl = `${operationUrl}/documents`;
      console.log(`[DOC-TRANSLATE] Fetching document errors from: ${documentsUrl}`);
      
      const response = await fetch(documentsUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        console.warn(`[DOC-TRANSLATE] Could not fetch document errors: ${response.status}`);
        return null;
      }

      const data = await response.json() as { 
        value?: Array<{ 
          id?: string;
          path?: string;
          status?: string;
          error?: { code?: string; message?: string };
        }> 
      };
      
      console.log(`[DOC-TRANSLATE] Document status response:`, JSON.stringify(data, null, 2));
      
      if (data.value && Array.isArray(data.value)) {
        const errors = data.value
          .filter((doc: any) => doc.error || doc.status === 'ValidationFailed' || doc.status === 'Failed')
          .map((doc: any) => {
            const errorInfo = doc.error 
              ? `${doc.error.code || 'Unknown'}: ${doc.error.message || 'No message'}` 
              : `Status: ${doc.status}`;
            return `[${doc.path || doc.id || 'unknown'}] ${errorInfo}`;
          });
        
        if (errors.length > 0) {
          return errors.join('; ');
        }
      }
      return null;
    } catch (error) {
      console.warn(`[DOC-TRANSLATE] Error fetching document errors: ${error}`);
      return null;
    }
  }

  private async getTranslatedDocuments(operationUrl: string, accessToken: string): Promise<string[]> {
    try {
      const documentsUrl = `${operationUrl}/documents`;
      const response = await fetch(documentsUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        console.warn('[DOC-TRANSLATE] Could not fetch translated document list');
        return [];
      }

      const data = await response.json() as { value?: Array<{ path?: string }> };
      if (data.value && Array.isArray(data.value)) {
        return data.value.map((doc: any) => doc.path || doc.id || 'unknown').filter(Boolean);
      }
      return [];
    } catch (error) {
      console.warn(`[DOC-TRANSLATE] Error fetching translated documents: ${error}`);
      return [];
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============ BLOB METADATA MANAGEMENT ============

  /**
   * Get translation metadata from a source blob
   * Returns which languages have translations and their paths
   */
  async getTranslationMetadata(
    accountName: string,
    accountKey: string,
    containerName: string,
    blobPath: string
  ): Promise<TranslationMetadata> {
    try {
      const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
      const blobServiceClient = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net`,
        sharedKeyCredential
      );
      
      const containerClient = blobServiceClient.getContainerClient(containerName);
      // Decode blob path before Azure SDK call - SDK does its own encoding
      const decodedBlobPath = decodeBlobPath(blobPath);
      console.log(`[DOC-TRANSLATE] Getting metadata for blob: ${blobPath} -> decoded: ${decodedBlobPath}`);
      const blobClient = containerClient.getBlobClient(decodedBlobPath);
      
      const properties = await blobClient.getProperties();
      const metadata = properties.metadata || {};
      
      // Parse translation metadata from blob metadata
      // Note: Language codes in metadata are sanitized (zh-Hans -> zh_Hans) for Azure compatibility
      const sanitizedLanguages = metadata.translated_languages 
        ? metadata.translated_languages.split(',').filter((l: string) => l.trim())
        : [];
      
      // Convert sanitized language codes back to original format for API response
      const translatedLanguages = sanitizedLanguages.map(unsanitizeLanguageCodeFromMetadataKey);
      
      const translations: TranslationMetadata['translations'] = {};
      
      for (const sanitizedLang of sanitizedLanguages) {
        // Azure stores metadata keys in lowercase, so we need to lowercase the sanitized lang
        const lowerSanitizedLang = sanitizedLang.toLowerCase();
        const blobPathKey = `translated_${lowerSanitizedLang}_blob`;
        const timestampKey = `translated_${lowerSanitizedLang}_at`;
        const filenameKey = `translated_${lowerSanitizedLang}_filename`;
        
        // Use original (unsanitized) language code as key in response
        const originalLang = unsanitizeLanguageCodeFromMetadataKey(sanitizedLang);
        
        if (metadata[blobPathKey]) {
          translations[originalLang] = {
            blobPath: metadata[blobPathKey],
            translatedAt: metadata[timestampKey] || '',
            originalFilename: metadata[filenameKey] || '',
          };
        }
      }
      
      console.log(`[DOC-TRANSLATE] Retrieved translation metadata for ${blobPath}:`, {
        translatedLanguages,
        translationCount: Object.keys(translations).length
      });
      
      // If no metadata found, try to discover translations by scanning storage
      if (translatedLanguages.length === 0) {
        console.log(`[DOC-TRANSLATE] No metadata found, attempting backfill discovery for ${blobPath}`);
        const discovered = await this.discoverAndBackfillTranslations(
          accountName,
          accountKey,
          containerName,
          blobPath
        );
        if (discovered.translatedLanguages.length > 0) {
          console.log(`[DOC-TRANSLATE] Discovered ${discovered.translatedLanguages.length} translations via backfill`);
          return discovered;
        }
      }
      
      return { translatedLanguages, translations };
    } catch (error: any) {
      // If blob doesn't exist or no metadata, return empty
      if (error.statusCode === 404) {
        console.log(`[DOC-TRANSLATE] Blob not found: ${blobPath}`);
        return { translatedLanguages: [], translations: {} };
      }
      console.error(`[DOC-TRANSLATE] Error getting translation metadata:`, error);
      throw error;
    }
  }

  /**
   * Discover existing translations by scanning the translated folder
   * and backfill metadata for legacy translations created before metadata system
   */
  async discoverAndBackfillTranslations(
    accountName: string,
    accountKey: string,
    containerName: string,
    sourceBlobPath: string
  ): Promise<TranslationMetadata> {
    try {
      const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
      const blobServiceClient = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net`,
        sharedKeyCredential
      );
      
      const containerClient = blobServiceClient.getContainerClient(containerName);
      
      // Extract source filename info
      const decodedSourcePath = decodeBlobPath(sourceBlobPath);
      const sourcePathParts = decodedSourcePath.split('/');
      const sourceFilename = sourcePathParts[sourcePathParts.length - 1];
      const sourceDir = sourcePathParts.slice(0, -1).join('/');
      
      // Get base name without extension for matching
      const lastDotIndex = sourceFilename.lastIndexOf('.');
      const sourceBaseName = lastDotIndex > 0 ? sourceFilename.substring(0, lastDotIndex) : sourceFilename;
      const sourceExtension = lastDotIndex > 0 ? sourceFilename.substring(lastDotIndex) : '';
      
      // Build the translated folder path to scan
      // Convention: translated_doc/{original_directory}/
      const translatedFolderPath = sourceDir ? `translated_doc/${sourceDir}/` : 'translated_doc/';
      
      console.log(`[DOC-TRANSLATE] Scanning for translations in: ${translatedFolderPath}`);
      console.log(`[DOC-TRANSLATE] Looking for files matching base name: ${sourceBaseName}`);
      
      const discoveredTranslations: TranslationMetadata['translations'] = {};
      const discoveredLanguages: string[] = [];
      
      // List blobs in the translated folder
      for await (const blob of containerClient.listBlobsFlat({ prefix: translatedFolderPath })) {
        const blobName = blob.name;
        const filename = blobName.split('/').pop() || '';
        
        // Check if this blob matches our source file pattern
        // Filename pattern: {sourceBaseName}_{langCode}_{date}_{time}_{rand}{extension}
        if (!filename.startsWith(sourceBaseName + '_')) {
          continue;
        }
        
        // Check extension matches
        if (!filename.endsWith(sourceExtension)) {
          continue;
        }
        
        // Try to parse the translation info from filename
        const parsed = parseTranslatedFilename(filename, sourceBaseName);
        if (parsed) {
          console.log(`[DOC-TRANSLATE] Discovered translation: ${filename} -> lang=${parsed.lang}`);
          
          const encodedBlobPath = blobName.split('/').map(seg => encodeURIComponent(seg)).join('/');
          
          discoveredTranslations[parsed.lang] = {
            blobPath: encodedBlobPath,
            translatedAt: parsed.timestamp,
            originalFilename: sourceFilename,
          };
          
          if (!discoveredLanguages.includes(parsed.lang)) {
            discoveredLanguages.push(parsed.lang);
          }
        }
      }
      
      // If we discovered translations, backfill the metadata on the source blob
      if (discoveredLanguages.length > 0) {
        console.log(`[DOC-TRANSLATE] Backfilling metadata for ${discoveredLanguages.length} discovered translations`);
        
        // Get source blob and update its metadata
        const decodedPath = decodeBlobPath(sourceBlobPath);
        const sourceBlobClient = containerClient.getBlobClient(decodedPath);
        
        try {
          const properties = await sourceBlobClient.getProperties();
          const existingMetadata = properties.metadata || {};
          
          // Build new metadata
          const newMetadata: { [key: string]: string } = { ...existingMetadata };
          
          const sanitizedLangs = discoveredLanguages.map(sanitizeLanguageCodeForMetadataKey);
          newMetadata.translated_languages = sanitizedLangs.join(',');
          
          for (const lang of discoveredLanguages) {
            const sanitizedLang = sanitizeLanguageCodeForMetadataKey(lang);
            const translation = discoveredTranslations[lang];
            newMetadata[`translated_${sanitizedLang}_blob`] = translation.blobPath;
            newMetadata[`translated_${sanitizedLang}_at`] = translation.translatedAt;
            newMetadata[`translated_${sanitizedLang}_filename`] = translation.originalFilename;
          }
          
          await sourceBlobClient.setMetadata(newMetadata);
          console.log(`[DOC-TRANSLATE] Successfully backfilled metadata for ${sourceBlobPath}`);
        } catch (backfillError) {
          console.warn(`[DOC-TRANSLATE] Could not backfill metadata:`, backfillError);
          // Still return discovered translations even if backfill fails
        }
      }
      
      return {
        translatedLanguages: discoveredLanguages,
        translations: discoveredTranslations,
      };
    } catch (error) {
      console.warn(`[DOC-TRANSLATE] Error discovering translations:`, error);
      return { translatedLanguages: [], translations: {} };
    }
  }

  /**
   * Set translation metadata on a source blob after successful translation
   * Adds a new language translation to existing metadata
   */
  async setTranslationMetadata(
    accountName: string,
    accountKey: string,
    containerName: string,
    blobPath: string,
    languageCode: string,
    translatedBlobPath: string,
    originalFilename: string
  ): Promise<void> {
    try {
      const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
      const blobServiceClient = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net`,
        sharedKeyCredential
      );
      
      const containerClient = blobServiceClient.getContainerClient(containerName);
      // Decode blob path before Azure SDK call - SDK does its own encoding
      const decodedBlobPath = decodeBlobPath(blobPath);
      console.log(`[DOC-TRANSLATE] Setting metadata for blob: ${blobPath} -> decoded: ${decodedBlobPath}`);
      const blobClient = containerClient.getBlobClient(decodedBlobPath);
      
      // Get existing metadata
      const properties = await blobClient.getProperties();
      const existingMetadata = properties.metadata || {};
      
      // Sanitize language code for Azure metadata compatibility (zh-Hans -> zh_Hans)
      const sanitizedLangCode = sanitizeLanguageCodeForMetadataKey(languageCode);
      
      // Parse existing languages (already sanitized in metadata)
      const existingLanguages = existingMetadata.translated_languages 
        ? existingMetadata.translated_languages.split(',').filter((l: string) => l.trim())
        : [];
      
      // Add new sanitized language if not already present
      if (!existingLanguages.includes(sanitizedLangCode)) {
        existingLanguages.push(sanitizedLangCode);
      }
      
      // Update metadata with new translation info using sanitized key
      const newMetadata = {
        ...existingMetadata,
        translated_languages: existingLanguages.join(','),
        [`translated_${sanitizedLangCode}_blob`]: translatedBlobPath,
        [`translated_${sanitizedLangCode}_at`]: new Date().toISOString(),
        [`translated_${sanitizedLangCode}_filename`]: originalFilename,
      };
      
      // Set the metadata on the blob
      await blobClient.setMetadata(newMetadata);
      
      console.log(`[DOC-TRANSLATE] Set translation metadata for ${blobPath}:`, {
        languageCode,
        sanitizedLangCode,
        translatedBlobPath,
        totalLanguages: existingLanguages.length
      });
    } catch (error) {
      console.error(`[DOC-TRANSLATE] Error setting translation metadata:`, error);
      throw error;
    }
  }

  /**
   * Remove a language translation from metadata when translated file is deleted
   */
  async removeTranslationMetadata(
    accountName: string,
    accountKey: string,
    containerName: string,
    blobPath: string,
    languageCode: string
  ): Promise<void> {
    try {
      const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
      const blobServiceClient = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net`,
        sharedKeyCredential
      );
      
      const containerClient = blobServiceClient.getContainerClient(containerName);
      // Decode blob path before Azure SDK call - SDK does its own encoding
      const decodedBlobPath = decodeBlobPath(blobPath);
      console.log(`[DOC-TRANSLATE] Removing metadata for blob: ${blobPath} -> decoded: ${decodedBlobPath}`);
      const blobClient = containerClient.getBlobClient(decodedBlobPath);
      
      // Get existing metadata
      const properties = await blobClient.getProperties();
      const existingMetadata = properties.metadata || {};
      
      // Sanitize language code for Azure metadata compatibility
      const sanitizedLangCode = sanitizeLanguageCodeForMetadataKey(languageCode);
      // Azure stores metadata keys in lowercase
      const lowerSanitizedLangCode = sanitizedLangCode.toLowerCase();
      
      // Parse existing languages and remove the specified one (compare lowercase)
      const existingLanguages = existingMetadata.translated_languages 
        ? existingMetadata.translated_languages.split(',').filter((l: string) => l.trim() && l.toLowerCase() !== lowerSanitizedLangCode)
        : [];
      
      // Create new metadata without the removed language
      const newMetadata: { [key: string]: string } = {};
      
      // Copy all metadata except the removed language's entries (Azure keys are lowercase)
      for (const [key, value] of Object.entries(existingMetadata)) {
        if (!key.startsWith(`translated_${lowerSanitizedLangCode}_`)) {
          newMetadata[key] = value as string;
        }
      }
      
      // Update translated_languages
      newMetadata.translated_languages = existingLanguages.join(',');
      
      // If no translations left, remove the translated_languages key
      if (existingLanguages.length === 0) {
        delete newMetadata.translated_languages;
      }
      
      // Set the updated metadata
      await blobClient.setMetadata(newMetadata);
      
      console.log(`[DOC-TRANSLATE] Removed translation metadata for ${blobPath}:`, {
        removedLanguage: languageCode,
        sanitizedLangCode,
        remainingLanguages: existingLanguages
      });
    } catch (error) {
      console.error(`[DOC-TRANSLATE] Error removing translation metadata:`, error);
      throw error;
    }
  }

  /**
   * Delete a translated blob and update source metadata
   */
  async deleteTranslatedDocument(
    accountName: string,
    accountKey: string,
    containerName: string,
    translatedBlobPath: string,
    sourceBlobPath: string,
    languageCode: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
      const blobServiceClient = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net`,
        sharedKeyCredential
      );
      
      const containerClient = blobServiceClient.getContainerClient(containerName);
      
      // Delete the translated blob
      // Note: Metadata stores encoded paths, but Azure SDK expects decoded paths
      const decodedTranslatedPath = decodeBlobPath(translatedBlobPath);
      console.log(`[DOC-TRANSLATE] Deleting blob - encoded: ${translatedBlobPath}, decoded: ${decodedTranslatedPath}`);
      const translatedBlobClient = containerClient.getBlobClient(decodedTranslatedPath);
      const deleteResponse = await translatedBlobClient.deleteIfExists();
      
      if (!deleteResponse.succeeded) {
        console.warn(`[DOC-TRANSLATE] Translated blob may not exist: ${decodedTranslatedPath}`);
      }
      
      // Update source blob metadata to remove the translation reference
      await this.removeTranslationMetadata(
        accountName,
        accountKey,
        containerName,
        sourceBlobPath,
        languageCode
      );
      
      console.log(`[DOC-TRANSLATE] Deleted translated document:`, {
        translatedBlobPath,
        sourceBlobPath,
        languageCode
      });
      
      return { success: true };
    } catch (error: any) {
      console.error(`[DOC-TRANSLATE] Error deleting translated document:`, error);
      return { success: false, error: error.message || 'Failed to delete translated document' };
    }
  }

  /**
   * Check if a translated blob exists
   */
  async checkTranslatedBlobExists(
    accountName: string,
    accountKey: string,
    containerName: string,
    blobPath: string
  ): Promise<boolean> {
    try {
      const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
      const blobServiceClient = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net`,
        sharedKeyCredential
      );
      
      const containerClient = blobServiceClient.getContainerClient(containerName);
      // Note: Metadata stores encoded paths, but Azure SDK expects decoded paths
      const decodedBlobPath = decodeBlobPath(blobPath);
      const blobClient = containerClient.getBlobClient(decodedBlobPath);
      
      return await blobClient.exists();
    } catch (error) {
      console.error(`[DOC-TRANSLATE] Error checking blob existence:`, error);
      return false;
    }
  }
}

export const documentTranslationService = new DocumentTranslationService();
export { TranslateDocumentInput, TranslationResult, TranslationMetadata };
