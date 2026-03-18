import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { seedInitialDataFromEnv } from "./seed";
import { initializeDatabase } from "./db";
import {
  tokenRequired,
  permissionRequired,
  aiAgentPermissionRequired,
  verifyToken,
  getSSOConfig,
  microsoftSSOEnabled,
} from "./auth";
import {
  organizationAccessRequired,
  userManagementAccessRequired,
  specificPermissionRequired,
  fileManagementPermissionRequired,
  fileReadAccessRequired,
  userManagementPermissionRequired,
  organizationManagementAccessRequired,
  organizationManagementPermissionRequired,
  roleManagementPermissionRequired,
  roleManagementAccessRequired,
  aiAgentManagementAccessRequired,
  aiAgentManagementPermissionRequired,
  pgpKeyManagementPermissionRequired,
  dataProtectionPermissionRequired,
  dataLifecyclePermissionRequired,
  adminRoleRequired,
  storageManagementPermissionRequired,
  storageContainerAccessRequired,
  siemManagementPermissionRequired,
  foundryManagementPermissionRequired,
  foundryManagementAccessRequired,
  contentUnderstandingPermissionRequired,
  contentUnderstandingAccessRequired,
  documentTranslationPermissionRequired,
  sftpPermissionRequired,
  inventoryPermissionRequired
} from "./auth-middleware";
import { azureSftpService } from "./azureSftpLocalUsersService";
import { sftpSecretCache } from "./sftpSecretCache";
import {
  validateIntegerId,
  validateOrganizationId,
  isValidEmail,
  validateTextField,
  validateFilterString,
  validateSearchQuery,
  validatePath,
  MAX_LENGTHS,
  validateParamId,
  validateMultipleParamIds,
  validateEmailInBody,
  validateStorageAccountName,
  validateContainerName,
  validateAzureStorageUrl,
} from "./validation";
import {
  authenticateGoogleUser,
  googleSSOEnabled,
  getGoogleAuthUrl,
} from "./auth-google";
import {
  ClientSecretCredential,
  DefaultAzureCredential,
} from "@azure/identity";
import { StorageManagementClient } from "@azure/arm-storage";
import { AuthorizationManagementClient } from "@azure/arm-authorization";
import { DataLakeServiceClient } from "@azure/storage-file-datalake";
import {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  ContainerSASPermissions,
  StorageSharedKeyCredential,
  SASProtocol,
} from "@azure/storage-blob";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import archiver from "archiver";
import axios from "axios";
import { ActivityLogger, ActivityActions, ActivityCategories, ResourceTypes } from "./activityLogger";
import { db } from "./db";
import { userRoles, insertRoleSchema, insertAiAgentSchema, insertOrgPgpKeySchema, insertFoundryResourceSchema, insertFoundryResourceSetSchema, foundryResources, DEFAULT_FILE_MGMT_PERMISSIONS } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { encodeBlobPath, buildBlobUrl, buildDfsUrl } from "./utils/blobPath";
import { createStrictBooleanSchema } from "./validation";
import {
  generatePgpKeypair,
  validateAndParsePrivateKey,
  validateAndParsePublicKey,
  validateKeyPairMatch,
  storePrivateKey,
  storePrivateKeyInKeyVault,
  deletePrivateKeyFromKeyVault,
  encryptFileData,
  decryptFileData,
  getPrivateKey,
} from "./pgp-utils";
import {
  listKeys as listKeyVaultKeys,
  createKey as createKeyVaultKey,
  getKey as getKeyVaultKey,
  isKeyVaultConfigured,
  getKeyVaultUrl,
} from "./keyvault-keys";
import {
  enforceGeoAccess,
  getClientIp as getGeoClientIp,
  isGeoRestrictionError,
  GeoRestrictionError,
  isGeoFencingEnabled,
} from "./geoEnforcementService";

// Security: Strict validation schema for role permissions to prevent malicious data injection
// Uses createStrictBooleanSchema to prevent type coercion attacks (e.g., "true" -> true, 1 -> true)
const rolePermissionsSchema = z.object({
  userManagement: z.object({
    add: createStrictBooleanSchema(),
    edit: createStrictBooleanSchema(),
    delete: createStrictBooleanSchema(),
    view: createStrictBooleanSchema(),
    enableDisable: createStrictBooleanSchema(true, false),
  }).strict(),
  roleManagement: z.object({
    add: createStrictBooleanSchema(),
    edit: createStrictBooleanSchema(),
    delete: createStrictBooleanSchema(),
    view: createStrictBooleanSchema(),
  }).strict(),
  organizations: z.object({
    add: createStrictBooleanSchema(),
    edit: createStrictBooleanSchema(),
    delete: createStrictBooleanSchema(),
    view: createStrictBooleanSchema(),
  }).strict(),
  storage: z.object({
    addStorageContainer: createStrictBooleanSchema(),
    addContainer: createStrictBooleanSchema(),
    view: createStrictBooleanSchema(),
    delete: createStrictBooleanSchema(),
    dataProtection: createStrictBooleanSchema(true, false),
    dataLifecycle: createStrictBooleanSchema(true, false),
    inventoryView: createStrictBooleanSchema(true, false),
    inventoryConfigure: createStrictBooleanSchema(true, false),
  }).strict(),
  files: z.object({
    uploadFile: createStrictBooleanSchema(),
    uploadFolder: createStrictBooleanSchema(),
    downloadFile: createStrictBooleanSchema(),
    downloadFolder: createStrictBooleanSchema(),
    viewFiles: createStrictBooleanSchema(),
    createFolder: createStrictBooleanSchema(),
    deleteFilesAndFolders: createStrictBooleanSchema(),
    searchFiles: createStrictBooleanSchema(),
    renameFile: createStrictBooleanSchema(),
    rehydrate: createStrictBooleanSchema(),
  }).strict(),
  activityLogs: z.object({
    view: createStrictBooleanSchema(),
  }).strict(),
  aiAgentMgmt: z.object({
    add: createStrictBooleanSchema(),
    edit: createStrictBooleanSchema(),
    delete: createStrictBooleanSchema(),
    view: createStrictBooleanSchema(),
  }).strict(),
  pgpKeyMgmt: z.object({
    view: createStrictBooleanSchema(),
    generate: createStrictBooleanSchema(),
    delete: createStrictBooleanSchema(),
    copy: createStrictBooleanSchema(),
    decrypt: createStrictBooleanSchema(),
  }).strict(),
  siemManagement: z.object({
    install: createStrictBooleanSchema(),
    delete: createStrictBooleanSchema(),
    enableDisable: createStrictBooleanSchema(),
    view: createStrictBooleanSchema(),
    incidentsView: createStrictBooleanSchema(),
  }).strict().optional().default({
    install: false,
    delete: false,
    enableDisable: false,
    view: false,
    incidentsView: false,
  }),
  foundryMgmt: z.object({
    add: createStrictBooleanSchema(),
    edit: createStrictBooleanSchema(),
    delete: createStrictBooleanSchema(),
    view: createStrictBooleanSchema(),
    tabWizard: createStrictBooleanSchema(),
    tabResources: createStrictBooleanSchema(),
    tabFoundryAction: createStrictBooleanSchema(),
    tabChatPlayground: createStrictBooleanSchema(),
    tabResourceSets: createStrictBooleanSchema(),
    tabContentUnderstanding: createStrictBooleanSchema(),
  }).strict().optional().default({
    add: false,
    edit: false,
    delete: false,
    view: false,
    tabWizard: false,
    tabResources: false,
    tabFoundryAction: false,
    tabChatPlayground: false,
    tabResourceSets: false,
    tabContentUnderstanding: false,
  }),
  helpCenter: z.object({
    chapterWiseHelp: z.record(z.string(), z.boolean()).optional().default({}),
    api: z.record(z.string(), z.boolean()).optional().default({}),
    envVariable: z.record(z.string(), z.boolean()).optional().default({}),
    troubleshooting: z.record(z.string(), z.boolean()).optional().default({}),
  }).strict().optional().default({
    chapterWiseHelp: {},
    api: {},
    envVariable: {},
    troubleshooting: {},
  }),
  contentUnderstanding: z.object({
    view: createStrictBooleanSchema(),
    runAnalysis: createStrictBooleanSchema(),
    saveAnalysis: createStrictBooleanSchema(),
    deleteAnalysis: createStrictBooleanSchema(),
    menuVisibility: createStrictBooleanSchema(),
  }).strict().optional().default({
    view: false,
    runAnalysis: false,
    saveAnalysis: false,
    deleteAnalysis: false,
    menuVisibility: false,
  }),
  documentTranslation: z.object({
    view: createStrictBooleanSchema(),
    runTranslation: createStrictBooleanSchema(),
    deleteTranslation: createStrictBooleanSchema(),
  }).strict().optional().default({
    view: false,
    runTranslation: false,
    deleteTranslation: false,
  }),
  sftpMgmt: z.object({
    view: createStrictBooleanSchema(),
    create: createStrictBooleanSchema(),
    update: createStrictBooleanSchema(),
    disable: createStrictBooleanSchema(),
    delete: createStrictBooleanSchema(),
    mapUser: createStrictBooleanSchema(),
    viewSelfAccess: createStrictBooleanSchema(),
    rotateSshSelf: createStrictBooleanSchema(),
    rotatePasswordSelf: createStrictBooleanSchema(),
  }).strict().optional().default({
    view: false,
    create: false,
    update: false,
    disable: false,
    delete: false,
    mapUser: false,
    viewSelfAccess: false,
    rotateSshSelf: false,
    rotatePasswordSelf: false,
  }),
  customerOnboarding: z.object({
    view: createStrictBooleanSchema(),
    upload: createStrictBooleanSchema(),
    commit: createStrictBooleanSchema(),
    delete: createStrictBooleanSchema(),
  }).strict().optional().default({
    view: false,
    upload: false,
    commit: false,
    delete: false,
  }),
  transferReports: z.object({
    view: createStrictBooleanSchema(),
    viewDetails: createStrictBooleanSchema(),
    download: createStrictBooleanSchema(),
  }).strict().optional().default({
    view: false,
    viewDetails: false,
    download: false,
  }),
  eval: z.object({
    view: createStrictBooleanSchema(),
    run: createStrictBooleanSchema(),
    review: createStrictBooleanSchema(),
    finalize: createStrictBooleanSchema(),
    menuVisibility: createStrictBooleanSchema(),
  }).strict().optional().default({
    view: false,
    run: false,
    review: false,
    finalize: false,
    menuVisibility: false,
  }),
}).strict(); // strict() prevents additional properties
import { acaZipperService } from "./acaZipperService";
import { acaAIAgentService } from "./acaAIAgentService";
import { foundryProvisioningService } from "./foundry-provisioning";
import { 
  connectContentUnderstanding, 
  getContentUnderstandingStatus, 
  analyzeDocument, 
  logDevModeWarning as logCuDevModeWarning,
  submitVideoAnalysisAsync,
  checkVideoAnalysisStatus,
  detectContentType,
  submitCuAnalysisAsync,
  checkCuAnalysisStatus
} from "./content-understanding";
import { cuPersistenceService } from "./cu-persistence";
import { documentTranslationService } from "./documentTranslationService";
import { provisionAdlsRoute } from "./provision-adls";
import configRouter from "./routes/config";
import helpRouter from "./routes/help";
import onboardingRouter from "./routes/onboarding";
import evalRouter from "./routes/eval";
import { setMalwareTagsByUri, mapScanResult, isHNSEnabled } from "./blobtags-helper";
import { createEventGridTopic, createEventSubscription, deleteEventGridTopic, listEventGridTopicsForStorageAccount } from "./eventgrid-helper";
import * as officeParser from "officeparser";
import { getSentinelArmClient } from "./sentinelArmClient";
import { RULE_CATALOG, getRuleById, validateParams } from "./ruleCatalog";
// Remove CLI dependencies as we're using REST API instead

// Helper function to get domain from request
function getDomainFromRequest(req: any): string {
  // Check for custom domain header first
  const forwardedHost = req.headers['x-forwarded-host'] || req.headers['host'];
  
  if (forwardedHost) {
    // Remove port if present and return with https://
    const domain = forwardedHost.split(':')[0];
    return `https://${domain}`;
  }
  
  // Fallback to request protocol and host
  const protocol = req.protocol || 'https';
  const host = req.get('host') || 'localhost';
  return `${protocol}://${host}`;
}


// Helper function to configure CORS for Azure Storage Account using REST API
export async function configureCORS(req: any, storageAccountName: string, resourceGroupName?: string): Promise<void> {
  try {
    const domain = getDomainFromRequest(req);
    console.log(`🔧 [CORS] Configuring CORS for storage account '${storageAccountName}' with domain: ${domain}`);
    
    const subscriptionId = process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || process.env.AZURE_SUBSCRIPTION_ID;
    const resourceGroup = resourceGroupName || process.env.ZAPPER_AZURE_RESOURCE_GROUP || process.env.AZURE_RESOURCE_GROUP;
    
    console.log(`🔧 [CORS] Azure config - subscriptionId: ${subscriptionId ? 'SET' : 'MISSING'}, resourceGroup: ${resourceGroup ? resourceGroup : 'MISSING'}`);
    
    if (!subscriptionId || !resourceGroup) {
      console.warn(`⚠️ [CORS] Azure credentials not available for CORS configuration - missing subscriptionId or resourceGroup`);
      console.log(`💡 [CORS] Manual CORS configuration needed in Azure Portal for storage account '${storageAccountName}' with origin: ${domain}`);
      return;
    }

    const credential = new DefaultAzureCredential();
    console.log(`🔧 [CORS] Created DefaultAzureCredential, attempting to get storage account keys...`);

    // Get storage account keys using Storage Management API
    const storageClient = new StorageManagementClient(credential, subscriptionId);
    const keys = await storageClient.storageAccounts.listKeys(resourceGroup, storageAccountName);
    
    if (!keys.keys || keys.keys.length === 0) {
      throw new Error('No storage account keys found');
    }

    console.log(`🔧 [CORS] Retrieved ${keys.keys.length} storage account keys`);
    const accountKey = keys.keys[0].value!;
    const sharedKeyCredential = new StorageSharedKeyCredential(storageAccountName, accountKey);
    
    // Create blob service client
    const blobServiceClient = new BlobServiceClient(
      `https://${storageAccountName}.blob.core.windows.net`,
      sharedKeyCredential
    );

    console.log(`🔧 [CORS] Created BlobServiceClient, setting CORS properties...`);

    // Configure CORS settings with proper format
    const corsRules = [{
      allowedOrigins: domain,
      allowedMethods: 'GET,PUT,POST,HEAD,OPTIONS',
      allowedHeaders: '*',
      exposedHeaders: '*',
      maxAgeInSeconds: 3600
    }];

    console.log(`🔧 [CORS] CORS rules:`, JSON.stringify(corsRules, null, 2));

    await blobServiceClient.setProperties({
      cors: corsRules
    });
    
    console.log(`✅ [CORS] CORS successfully configured for storage account '${storageAccountName}' with domain: ${domain}`);
    
  } catch (error: any) {
    console.error(`❌ [CORS] Failed to configure CORS for storage account '${storageAccountName}':`, error.message);
    console.error(`❌ [CORS] Error stack:`, error.stack);
    
    // Don't throw the error - we want storage account creation to continue even if CORS fails
    // The user can manually configure CORS if needed
    console.log(`💡 [CORS] Manual CORS configuration: You can configure CORS manually in Azure Portal for storage account '${storageAccountName}' with origin: ${getDomainFromRequest(req)}`);
  }
}

// Helper function to extract client IP address from request
function getClientIp(req: any): string {
  // Primary: X-Forwarded-For header (first IP in chain when behind proxy/load balancer)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ip = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0].trim();
    console.log(`[IP] Extracted from X-Forwarded-For: ${ip}`);
    return ip;
  }
  
  // Secondary: Express req.ip (respects trust proxy setting)
  if (req.ip) {
    console.log(`[IP] Extracted from req.ip: ${req.ip}`);
    return req.ip;
  }
  
  // Fallback: Direct socket connection
  const socketIp = req.socket?.remoteAddress || '0.0.0.0';
  console.log(`[IP] Extracted from socket: ${socketIp}`);
  return socketIp;
}

// Helper function to extract and validate IPv4 from request (for per-agent IP restriction)
// Does NOT check global ZAPPER_USE_IP_FOR_SAS flag - used for AI agent-specific configuration
function getIpv4RangeFromRequest(req: any): { start: string; end: string } | undefined {
  // Still honor global bypass flag for development/testing
  if (process.env.ZAPPER_SKIP_SAS_IP_RESTRICTION === 'true') {
    console.log('[SAS-IP] IP restriction bypassed via ZAPPER_SKIP_SAS_IP_RESTRICTION');
    return undefined;
  }
  
  const clientIp = getClientIp(req);
  
  // Remove IPv6 prefix if present (::ffff:192.168.1.1 -> 192.168.1.1)
  let cleanIp = clientIp.replace(/^::ffff:/, '');
  
  // Strip port number if present (e.g., 192.168.1.1:4047 -> 192.168.1.1)
  if (cleanIp.includes(':') && cleanIp.split(':').length === 2) {
    cleanIp = cleanIp.split(':')[0];
  }
  
  // Validate that we have a valid IPv4 address
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(cleanIp)) {
    console.warn(`[SAS-IP] Client IP "${cleanIp}" is not valid IPv4 (likely IPv6). Azure SAS only supports IPv4 - skipping IP restriction.`);
    return undefined;
  }
  
  // Additional validation: ensure each octet is 0-255
  const octets = cleanIp.split('.').map(Number);
  if (octets.some(octet => isNaN(octet) || octet < 0 || octet > 255)) {
    console.warn(`[SAS-IP] Client IP "${cleanIp}" has invalid octets - skipping IP restriction.`);
    return undefined;
  }
  
  console.log(`[SAS-IP] Valid IPv4 detected for SAS restriction: ${cleanIp}`);
  
  // Return single IP range (strict security)
  return { start: cleanIp, end: cleanIp };
}

// Helper function to generate IP range for SAS token (legacy - checks global flag)
// Uses single IP for strict security, but can be extended for ranges if needed
function getClientIpRange(req: any): { start: string; end: string } | undefined {
  // Primary check: Only apply IP restrictions if ZAPPER_USE_IP_FOR_SAS is explicitly set to 'true'
  if (process.env.ZAPPER_USE_IP_FOR_SAS !== 'true') {
    console.log('[SAS-IP] IP restriction disabled (ZAPPER_USE_IP_FOR_SAS not set to true)');
    return undefined;
  }
  
  // Delegate to shared IPv4 extraction logic
  return getIpv4RangeFromRequest(req);
}


// Helper function to generate SAS URL for blob access with IP restriction
async function generateSasUrl(
  storageAccountName: string,
  containerName: string,
  blobPath: string,
  credential: any,
  reqOrResourceGroup?: any,
  resourceGroupNameOrTimeout?: string | number,
  timeoutMinutes?: number,
  aiAgentSettings?: { useIpForSas: boolean; allowedIpAddress?: string | null; sasValiditySeconds: number },
): Promise<string> {
  // Handle backward compatibility: determine if first optional param is Request or resourceGroup
  let req: any = undefined;
  let resourceGroupName: string | undefined = undefined;
  let sasTimeout: number | undefined = timeoutMinutes;
  
  // If reqOrResourceGroup has headers/ip properties, it's a Request object
  if (reqOrResourceGroup && (reqOrResourceGroup.headers || reqOrResourceGroup.ip)) {
    req = reqOrResourceGroup;
    resourceGroupName = typeof resourceGroupNameOrTimeout === 'string' ? resourceGroupNameOrTimeout : undefined;
    sasTimeout = typeof resourceGroupNameOrTimeout === 'number' ? resourceGroupNameOrTimeout : timeoutMinutes;
  } else {
    // Old signature: (name, container, path, credential, resourceGroup?, timeout?)
    resourceGroupName = reqOrResourceGroup;
    sasTimeout = typeof resourceGroupNameOrTimeout === 'number' ? resourceGroupNameOrTimeout : timeoutMinutes;
  }
  
  try {
    // Use AI agent-specific validity time if provided, otherwise fall back to timeout parameter or env var
    let sasTimeoutMinutes: number;
    if (aiAgentSettings?.sasValiditySeconds) {
      sasTimeoutMinutes = aiAgentSettings.sasValiditySeconds / 60; // Convert seconds to minutes
      console.log(`[SAS-AI-AGENT] Using per-agent SAS validity: ${aiAgentSettings.sasValiditySeconds}s (${sasTimeoutMinutes} min)`);
    } else {
      sasTimeoutMinutes = sasTimeout || parseInt(process.env.ZAPPER_AZURE_SAS_TIMEOUT || "5");
      console.log(`[SAS] Using default SAS validity: ${sasTimeoutMinutes} min`);
    }
    
    const expiryTime = new Date();
    expiryTime.setMinutes(expiryTime.getMinutes() + sasTimeoutMinutes + 15);

    // For DefaultAzureCredential, we need to use the storage account key approach
    // First, get the storage account key
    const subscriptionId = process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || process.env.AZURE_SUBSCRIPTION_ID;
    
    // Use provided resource group or fall back to environment variable
    const resourceGroup = resourceGroupName || process.env.ZAPPER_AZURE_RESOURCE_GROUP || process.env.AZURE_RESOURCE_GROUP;

    if (!subscriptionId || !resourceGroup) {
      throw new Error("Missing Azure subscription ID or resource group for SAS generation");
    }

    const storageClient = new StorageManagementClient(
      credential,
      subscriptionId,
    );
    const keys = await storageClient.storageAccounts.listKeys(
      resourceGroup,
      storageAccountName,
    );

    if (!keys.keys || keys.keys.length === 0) {
      throw new Error("No storage account keys available");
    }

    const accountKey = keys.keys[0].value;
    if (!accountKey) {
      throw new Error("Storage account key is empty");
    }

    // Create shared key credential
    const sharedKeyCredential = new StorageSharedKeyCredential(
      storageAccountName,
      accountKey,
    );

    // Determine IP range based on AI agent settings or default behavior
    let ipRange: { start: string; end: string } | undefined = undefined;

    if (aiAgentSettings) {
      // AI agent-specific IP restriction logic (independent of global flag)
      if (aiAgentSettings.useIpForSas) {
        if (aiAgentSettings.allowedIpAddress) {
          // Use custom IP address specified in agent configuration
          ipRange = { start: aiAgentSettings.allowedIpAddress, end: aiAgentSettings.allowedIpAddress };
          console.log(`[SAS-AI-AGENT] Using configured IP restriction: ${aiAgentSettings.allowedIpAddress}`);
        } else if (req) {
          // Use detected client IP from request (NEW helper - no global flag check)
          ipRange = getIpv4RangeFromRequest(req);
          if (ipRange) {
            console.log(`[SAS-AI-AGENT] Using detected client IP restriction: ${ipRange.start}`);
          } else {
            console.warn(`[SAS-AI-AGENT] IP restriction enabled but failed to extract valid IPv4 from request`);
          }
        } else {
          console.warn(`[SAS-AI-AGENT] IP restriction enabled but no IP available (no custom IP or request)`);
        }
      } else {
        console.log(`[SAS-AI-AGENT] IP restriction disabled for this agent`);
      }
    } else {
      // Default behavior for non-AI-agent calls (uses global ZAPPER_USE_IP_FOR_SAS flag)
      ipRange = req ? getClientIpRange(req) : undefined;
      if (ipRange) {
        console.log(`[SAS] Default IP restriction applied: ${ipRange.start} - ${ipRange.end}`);
      } else {
        console.log(`[SAS] No IP restriction applied (request not provided or bypassed)`);
      }
    }

    // Generate SAS parameters with IP restriction
    const sasOptions: any = {
      containerName,
      blobName: blobPath,
      permissions: BlobSASPermissions.parse("r"), // Read permission only
      startsOn: new Date(Date.now() - 5 * 60 * 1000), // Start 5 minutes ago to account for clock skew
      expiresOn: expiryTime,
      protocol: SASProtocol.Https,
    };

    // Add IP restriction if available
    if (ipRange) {
      sasOptions.ipRange = ipRange;
    }

    const sasToken = generateBlobSASQueryParameters(
      sasOptions,
      sharedKeyCredential,
    ).toString();

    // SECURITY FIX: Encode blob path in final URL to handle special characters (#, %, ?)
    // Do NOT encode blobName in sasOptions - Azure SDK needs raw name for signature
    const sasUrl = `https://${storageAccountName}.blob.core.windows.net/${containerName}/${encodeBlobPath(blobPath)}?${sasToken}`;

    console.log(`[SAS] Successfully generated SAS URL for ${blobPath}`);
    return sasUrl;
  } catch (error: any) {
    console.error(`[SAS] Error generating SAS URL for ${blobPath}:`, error);
    throw error;
  }
}

// Helper function to safely decode URI components
function safeDecodeURIComponent(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch (e) {
    // If decoding fails, return the original string
    // This handles cases where the string is already decoded or malformed
    return str;
  }
}

// Helper function to generate result file path
function generateResultFilePath(
  originalFilePath: string,
  originalFileName: string,
  agentName: string,
): string {
  // Get configurable AI Agent results directory from environment variable
  const aiAgentResultsDir = process.env.ZAPPER_AIAGENT_RESULTS_DIR || "aiagent_results";
  
  // SECURITY: Only decode the filename, NOT the path
  // Decoding the path could allow path traversal attacks via encoded sequences like %2e%2e%2f (../)
  // The path comes from Azure Storage and should already be properly formatted
  const decodedFileName = safeDecodeURIComponent(originalFileName);
  
  // Extract file name without extension from the decoded filename
  const fileNameWithoutExt = path.parse(decodedFileName).name;

  // Clean agent name for filename (remove special characters)
  const cleanAgentName = agentName.toLowerCase().replace(/[^a-zA-Z0-9]/g, "");

  // Generate timestamp (yyyymmdd_HHMMSS format)
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;

  // Generate random number
  const randomNum = Math.floor(Math.random() * 1000);

  // Create result filename with decoded name (no URL encoding)
  const resultFileName = `${fileNameWithoutExt}_${cleanAgentName}_${timestamp}_${randomNum}.txt`;

  // SECURITY: Use original path as-is (no decoding) to prevent path traversal
  // Determine directory path for the result
  const originalDir = path.dirname(originalFilePath);
  const resultDir =
    originalDir === "." || originalDir === ""
      ? aiAgentResultsDir
      : `${aiAgentResultsDir}/${originalDir}`;

  return `${resultDir}/${resultFileName}`;
}

// Helper function to create response file with content in Azure storage
async function createResponseFileWithContent(
  storageAccountName: string,
  containerName: string,
  resultFilePath: string,
  responseContent: string,
  credential: any, // Add credential parameter
): Promise<void> {
  try {
    // SECURITY: Validate storage account name before Azure SDK URL construction
    const helperValidation = validateStorageAccountName(storageAccountName);
    if (!helperValidation.valid) {
      throw new Error(`Invalid storage account name: ${helperValidation.error}`);
    }
    const validatedHelperName = helperValidation.sanitized!;

    const serviceClient = new DataLakeServiceClient(
      `https://${validatedHelperName}.dfs.core.windows.net`,
      credential,
    );

    const fileSystemClient = serviceClient.getFileSystemClient(containerName);

    // Create the file
    const fileClient = fileSystemClient.getFileClient(resultFilePath);

    // Upload the content
    await fileClient.create();
    await fileClient.append(
      Buffer.from(responseContent, "utf8"),
      0,
      Buffer.byteLength(responseContent, "utf8"),
    );
    await fileClient.flush(Buffer.byteLength(responseContent, "utf8"));
  } catch (error: any) {
    console.error("Error creating response file:", error);
    throw new Error(`Failed to create response file: ${error.message}`);
  }
}

// Helper function to resolve file metadata from Azure Files API for chat citations
async function resolveFileMetadata(
  baseEndpoint: string,
  projectName: string,
  fileId: string,
  token: string,
  apiVersion: string
): Promise<{ filename: string | null; error?: string }> {
  try {
    // Skip resolution for assistant-* IDs (internal vector store chunks - not resolvable)
    if (fileId.startsWith('assistant-')) {
      console.log(`[CHAT] Skipping resolution for internal vector store ID: ${fileId}`);
      return { filename: null, error: 'Internal vector store reference' };
    }
    
    const fileUrl = `${baseEndpoint}/api/projects/${encodeURIComponent(projectName)}/files/${fileId}?api-version=${apiVersion}`;
    const response = await fetch(fileUrl, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    if (!response.ok) {
      console.log(`[CHAT] Failed to resolve file ${fileId}: ${response.status}`);
      return { filename: null, error: `HTTP ${response.status}` };
    }
    
    const fileData = await response.json();
    console.log(`[CHAT] Resolved file ${fileId} -> ${fileData.filename}`);
    return { filename: fileData.filename || null };
  } catch (error: any) {
    console.error(`[CHAT] Error resolving file ${fileId}:`, error.message);
    return { filename: null, error: error.message };
  }
}

// Helper function to enrich messages with resolved citation filenames
async function enrichMessagesWithFilenames(
  messages: any[],
  baseEndpoint: string,
  projectName: string,
  token: string,
  apiVersion: string,
  vectorStoreId?: string
): Promise<any[]> {
  // Collect all unique file_ids from annotations
  const fileIdSet = new Set<string>();
  
  for (const message of messages) {
    if (message.content && Array.isArray(message.content)) {
      for (const contentItem of message.content) {
        if (contentItem.type === 'text' && contentItem.text?.annotations) {
          for (const annotation of contentItem.text.annotations) {
            if (annotation.type === 'file_citation' && annotation.file_citation?.file_id) {
              fileIdSet.add(annotation.file_citation.file_id);
            }
          }
        }
      }
    }
  }
  
  if (fileIdSet.size === 0) {
    return messages;
  }
  
  console.log(`[CHAT] Resolving ${fileIdSet.size} unique file IDs for citations`);
  
  const fileIdArray = Array.from(fileIdSet);
  const fileNameMap = new Map<string, string>();
  
  // Check if we have any assistant-* IDs that need vector store resolution
  const assistantFileIds = fileIdArray.filter(id => id.startsWith('assistant-'));
  const regularFileIds = fileIdArray.filter(id => !id.startsWith('assistant-'));
  
  // For assistant-* IDs, try to resolve via vector store file listing
  if (assistantFileIds.length > 0 && vectorStoreId) {
    console.log(`[CHAT] Resolving ${assistantFileIds.length} vector store file references via vector store ${vectorStoreId}`);
    
    try {
      // List all files in the vector store
      const vsFilesResult = await foundryProvisioningService.listVectorStoreFiles({
        projectName,
        vectorStoreId,
        hubEndpoint: baseEndpoint
      });
      
      if (vsFilesResult.success && vsFilesResult.files) {
        console.log(`[CHAT] Vector store contains ${vsFilesResult.files.length} files`);
        
        // Build a mapping from vector store file ID to the vector store file object
        const vsFileMap = new Map<string, any>();
        for (const vsFile of vsFilesResult.files) {
          vsFileMap.set(vsFile.id, vsFile);
        }
        
        // For each assistant-* file ID, find the corresponding vector store file
        // and resolve its original file_id to a filename
        for (const assistantId of assistantFileIds) {
          const vsFile = vsFileMap.get(assistantId);
          if (vsFile) {
            // Vector store file has a file_id field pointing to the original project file
            const originalFileId = vsFile.file_id;
            if (originalFileId && !originalFileId.startsWith('assistant-')) {
              // Resolve the original file to get its filename
              const resolution = await resolveFileMetadata(baseEndpoint, projectName, originalFileId, token, apiVersion);
              if (resolution.filename) {
                fileNameMap.set(assistantId, resolution.filename);
                console.log(`[CHAT] Resolved assistant ID ${assistantId} -> ${resolution.filename}`);
              }
            } else if (vsFile.filename) {
              // Use vector store file's own filename if available
              fileNameMap.set(assistantId, vsFile.filename);
              console.log(`[CHAT] Used VS file's own filename for ${assistantId} -> ${vsFile.filename}`);
            }
          }
        }
      } else {
        console.log(`[CHAT] Could not list vector store files: ${vsFilesResult.error}`);
      }
    } catch (error: any) {
      console.error(`[CHAT] Error resolving vector store files:`, error.message);
    }
  } else if (assistantFileIds.length > 0) {
    console.log(`[CHAT] Have ${assistantFileIds.length} assistant-* IDs but no vectorStoreId to resolve them`);
  }
  
  // Resolve regular file IDs in parallel
  if (regularFileIds.length > 0) {
    const resolutions = await Promise.all(
      regularFileIds.map(fileId => resolveFileMetadata(baseEndpoint, projectName, fileId, token, apiVersion))
    );
    
    regularFileIds.forEach((fileId, index) => {
      if (resolutions[index].filename) {
        fileNameMap.set(fileId, resolutions[index].filename!);
      }
    });
  }
  
  console.log(`[CHAT] Successfully resolved ${fileNameMap.size} of ${fileIdSet.size} file IDs`);
  
  // Enrich messages with resolved filenames
  return messages.map(message => {
    if (!message.content || !Array.isArray(message.content)) {
      return message;
    }
    
    return {
      ...message,
      content: message.content.map((contentItem: any) => {
        if (contentItem.type !== 'text' || !contentItem.text?.annotations) {
          return contentItem;
        }
        
        return {
          ...contentItem,
          text: {
            ...contentItem.text,
            annotations: contentItem.text.annotations.map((annotation: any) => {
              if (annotation.type !== 'file_citation' || !annotation.file_citation?.file_id) {
                return annotation;
              }
              
              const resolvedFilename = fileNameMap.get(annotation.file_citation.file_id);
              return {
                ...annotation,
                file_citation: {
                  ...annotation.file_citation,
                  resolved_filename: resolvedFilename || null
                }
              };
            })
          }
        };
      })
    };
  });
}

// Helper interface for activity logging context
interface ActivityLoggingContext {
  userId: string;
  userName: string;
  email: string;
  ipAddress: string;
  userAgent: string;
  organizationId?: number;
  organizationName?: string;
  roleId?: number;
  roleName?: string;
}

// Helper function to gather activity logging context with role and organization info
async function getActivityLoggingContext(
  req: any,
  organizationId?: number
): Promise<ActivityLoggingContext> {
  const userInfo = req.user;
  const userEmail = userInfo?.email;
  
  // Get user's roles to determine which role they're acting under
  const userRoles = userEmail ? await storage.getUserRolesByEmail(userEmail) : [];
  const primaryRole = userRoles.length > 0 ? userRoles[0] : null;
  
  // Get organization info if organizationId is provided
  let organizationName: string | undefined;
  if (organizationId) {
    const organization = await storage.getOrganization(organizationId);
    organizationName = organization?.name;
  }
  
  return {
    userId: userInfo?.oid || userInfo?.id?.toString() || "unknown",
    userName: userInfo?.name || userInfo?.displayName || "Unknown User",
    email: userEmail || "unknown",
    ipAddress: getClientIp(req),
    userAgent: req.get("User-Agent") || "Unknown",
    organizationId: organizationId || primaryRole?.organization.id,
    organizationName: organizationName || primaryRole?.organization.name,
    roleId: primaryRole?.role.id,
    roleName: primaryRole?.role.name,
  };
}

// Helper function to log user activities with role context
async function logUserActivity(
  req: any,
  action: string,
  category: string,
  resource?: string,
  resourceType?: string,
  orgContext?: { organizationId: number; organizationName?: string },
) {
  try {
    // Check if this activity should be logged based on environment variables
    const { shouldLogActivity } = await import("./config/activityLogConfig");
    
    if (!shouldLogActivity(action)) {
      console.log(`[ACTIVITY LOG] Skipping ${action} - logging disabled via environment variable`);
      return;
    }

    const userInfo = req.user;

    // Get user's roles to determine which role they're acting under
    const userRoles = await storage.getUserRolesByEmail(userInfo.email);
    const primaryRole = userRoles.length > 0 ? userRoles[0] : null;

    // Use explicit org context if provided, otherwise try to find matching role for the org
    let effectiveOrgId = orgContext?.organizationId || null;
    let effectiveOrgName = orgContext?.organizationName || null;
    let effectiveRoleId = primaryRole?.role.id || null;
    let effectiveRoleName = primaryRole?.role.name || null;

    if (effectiveOrgId && userRoles.length > 0) {
      // Find the user's role in the specific organization
      const matchingRole = userRoles.find(r => r.organization.id === effectiveOrgId);
      if (matchingRole) {
        effectiveRoleId = matchingRole.role.id;
        effectiveRoleName = matchingRole.role.name;
        effectiveOrgName = effectiveOrgName || matchingRole.organization.name;
      }
      // If org name still not resolved, look it up from DB
      if (!effectiveOrgName && effectiveOrgId) {
        try {
          const org = await storage.getOrganization(effectiveOrgId);
          if (org) effectiveOrgName = org.name;
        } catch (_) {}
      }
    } else if (!effectiveOrgId && primaryRole) {
      // Fallback to primary role's org if no explicit org context
      effectiveOrgId = primaryRole.organization.id;
      effectiveOrgName = primaryRole.organization.name;
    }

    console.log(
      `[ACTIVITY LOG] ${userInfo.email} performed ${action} on ${resourceType || "RESOURCE"} in org ${effectiveOrgName || 'unknown'} (id: ${effectiveOrgId})`,
    );

    const activityData = {
      userId: userInfo.oid || userInfo.id || "unknown",
      userName: userInfo.name || userInfo.displayName || "Unknown User",
      email: userInfo.email,
      ipAddress: getClientIp(req),
      action,
      actionCategory: category,
      resource: resource || null,
      resourceType: resourceType || null,
      userAgent: req.get("User-Agent") || "Unknown",
      roleId: effectiveRoleId || null,
      roleName: effectiveRoleName || null,
      organizationId: effectiveOrgId || null,
      organizationName: effectiveOrgName || null,
    };

    // Determine if DB logging is enabled (ZAPPER_ACTIVITY_LOG_STORE !== 'FALSE')
    const dbLoggingEnabled = process.env.ZAPPER_ACTIVITY_LOG_STORE !== 'FALSE';

    if (dbLoggingEnabled) {
      console.log(`✅ [ACTIVITY LOGGER] DB Logging is ENABLED - proceeding with database insert`);
      // Include role and organization context in activity log
      await storage.createUserActivity(activityData);
    } else {
      console.log(`💾 [ACTIVITY LOGGER] Skipping DB insert (ZAPPER_ACTIVITY_LOG_STORE=FALSE)`);
    }

    // Stream to Azure Sentinel for security monitoring
    const { SentinelLogger } = await import("./sentinelLogger");
    SentinelLogger.logActivity({
      action,
      actionCategory: category,
      email: activityData.email,
      userId: activityData.userId,
      userName: activityData.userName,
      ipAddress: activityData.ipAddress || undefined,
      userAgent: activityData.userAgent || undefined,
      resource: resource || undefined,
      resourceType: resourceType || undefined,
      organizationId: activityData.organizationId || undefined,
      organizationName: activityData.organizationName || undefined,
      roleId: activityData.roleId || undefined,
      roleName: activityData.roleName || undefined,
      result: 'Success'
    });
  } catch (error: unknown) {
    console.error("Failed to log activity:", error);
  }
}

// Helper function to generate AI agent response content
async function generateAiAgentResponse(
  agent: any,
  fileName: string,
  filePath: string,
  resultFilePath: string,
  storageAccountName?: string,
  containerName?: string,
  credential?: any,
): Promise<string> {
  const timestamp = new Date().toISOString();

  let fileUri = "Not available";
  let aiagentResultFileUri = "Not available";

  if (storageAccountName && containerName) {
    const sasTimeoutMinutes = parseInt(process.env.ZAPPER_AZURE_SAS_TIMEOUT || "5");

    if (sasTimeoutMinutes === 0) {
      // Generate regular URLs without SAS when ZAPPER_AZURE_SAS_TIMEOUT=0
      console.log(
        `[SAS] ZAPPER_AZURE_SAS_TIMEOUT is 0, using regular URLs for AI agent response`,
      );
      // SECURITY FIX: Encode blob paths to handle special characters
      fileUri = `https://${storageAccountName}.blob.core.windows.net/${containerName}/${encodeBlobPath(filePath)}`;
      if (resultFilePath) {
        aiagentResultFileUri = `https://${storageAccountName}.blob.core.windows.net/${containerName}/${encodeBlobPath(resultFilePath)}`;
      }
    } else {
      // Generate SAS URL for the original file when ZAPPER_AZURE_SAS_TIMEOUT > 0
      console.log(
        `[SAS] ZAPPER_AZURE_SAS_TIMEOUT is ${sasTimeoutMinutes}, generating SAS URL for AI agent response`,
      );

      if (credential) {
        try {
          fileUri = await generateSasUrl(
            storageAccountName,
            containerName,
            filePath,
            credential,
            undefined, // resourceGroupName - will use env variable fallback
            sasTimeoutMinutes,
          );
        } catch (error) {
          console.error("Error generating SAS URL:", error);
          // SECURITY FIX: Encode blob path in fallback URL
          // Fallback to regular URL
          fileUri = `https://${storageAccountName}.blob.core.windows.net/${containerName}/${encodeBlobPath(filePath)}`;
        }
      } else {
        // SECURITY FIX: Encode blob path when no credential available
        // No credential available, use regular URL
        fileUri = `https://${storageAccountName}.blob.core.windows.net/${containerName}/${encodeBlobPath(filePath)}`;
      }

      // SECURITY FIX: Encode result file path
      // Generate regular URL for result file (no SAS needed for result file)
      if (resultFilePath) {
        aiagentResultFileUri = `https://${storageAccountName}.blob.core.windows.net/${containerName}/${encodeBlobPath(resultFilePath)}`;
      }
    }
  }

  return `AI Agent Processing Report
=====================================

Agent: ${agent.name}
Endpoint: ${agent.apiEndpoint}
API Key: ${agent.apiKey || "Not available"}
File: ${fileName}
Original Path: ${filePath}
File URI: ${fileUri}
Processing Time: ${timestamp}
Agent ID: ${agent.id}
AI Agent Result File URI: ${aiagentResultFileUri}

Generated on: ${timestamp}
`;
}

import { AzureMonitorService } from "./azureMonitorService";

import { CuPollingService } from "./cuPollingService";
import { EvalPollingService } from "./evalPollingService";

export async function registerRoutes(app: Express): Promise<Server> {

  // Activity Log Store Configuration
  const dbLoggingEnabled = process.env.ZAPPER_ACTIVITY_LOG_STORE !== 'FALSE';
  const subscriptionId = process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || process.env.AZURE_SUBSCRIPTION_ID;
  const resourceGroup = process.env.ZAPPER_AZURE_RESOURCE_GROUP || process.env.AZURE_RESOURCE_GROUP;
  const useClientSecret =
    process.env.ZAPPER_AZURE_USE_CLIENT_SECRET?.toLowerCase() === "true";
  // Configure multer for file uploads based on environment
  const FILE_UPLOAD_MODE = process.env.ZAPPER_FILE_UPLOAD_MODE || "memory"; // memory, disk, or sas
  const UPLOAD_DIR = process.env.ZAPPER_UPLOAD_DIR || (process.platform === "win32" ? "./uploads" : "/tmp/uploads");
  const SAS_TIMEOUT_MINUTES = parseInt(process.env.ZAPPER_SAS_TIMEOUT_MINUTES || "15");
  const MEMORY_UPLOAD_LIMIT_MB = parseInt(process.env.ZAPPER_MEMORY_UPLOAD_LIMIT_MB || "100");
  
  // Chunked upload configuration
  const CHUNK_SIZE_MB = parseInt(process.env.ZAPPER_CHUNK_SIZE_MB || "4"); // Default 4MB chunks
  const UPLOAD_CONCURRENCY = parseInt(process.env.ZAPPER_UPLOAD_CONCURRENCY || "5"); // Default 5 parallel uploads
  const MAX_RETRIES = parseInt(process.env.ZAPPER_MAX_RETRIES || "3"); // Default 3 retry attempts per chunk

  const getMulterStorage = () => {
    if (FILE_UPLOAD_MODE === "disk") {
      // Ensure upload directory exists
      if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      }

      return multer.diskStorage({
        destination: function (req, file, cb) {
          cb(null, UPLOAD_DIR);
        },
        filename: function (req, file, cb) {
          // Preserve original name with timestamp prefix to avoid conflicts
          const uniqueSuffix =
            Date.now() + "-" + Math.round(Math.random() * 1e9);
          cb(null, uniqueSuffix + "-" + file.originalname);
        },
      });
    }
    return multer.memoryStorage();
  };

  const fileSizeLimit = FILE_UPLOAD_MODE === "memory" ? MEMORY_UPLOAD_LIMIT_MB * 1024 * 1024 : undefined;
  
  console.log(`📁 [DEBUG] Multer configuration:`, {
    mode: FILE_UPLOAD_MODE,
    fileSizeLimit: fileSizeLimit || 'unlimited',
    memoryLimitMB: MEMORY_UPLOAD_LIMIT_MB,
    uploadDir: UPLOAD_DIR,
    chunkSizeMB: CHUNK_SIZE_MB,
    uploadConcurrency: UPLOAD_CONCURRENCY,
    maxRetries: MAX_RETRIES
  });

  const upload = multer({
    storage: getMulterStorage(),
    limits: {
      fileSize: fileSizeLimit, // undefined means unlimited for disk mode
    },
    fileFilter: (req, file, cb) => {
      console.log(`📁 [DEBUG] File filter check:`, {
        filename: file.originalname,
        size: file.size,
        mode: FILE_UPLOAD_MODE
      });
      
      // Custom file size validation for better error messages (only for memory mode)
      if (FILE_UPLOAD_MODE === "memory") {
        const maxSize = MEMORY_UPLOAD_LIMIT_MB * 1024 * 1024;
        if (file.size && file.size > maxSize) {
          const error = new Error(`File "${file.originalname}" (${Math.round(file.size / 1024 / 1024)}MB) exceeds the ${MEMORY_UPLOAD_LIMIT_MB}MB limit for memory uploads. Please use disk or SAS mode for larger files.`);
          (error as any).code = 'FILE_TOO_LARGE';
          return cb(error as any, false);
        }
      }
      
      console.log(`📁 [DEBUG] File filter passed for: ${file.originalname}`);
      cb(null, true);
    }
  });

  // Create Azure credential with conditional fallback
  let credential = null;

  if (useClientSecret) {
    // Fallback to client secret authentication if explicitly requested
    const tenantId = process.env.ZAPPER_AZURE_TENANT_ID;
    const clientId = process.env.ZAPPER_AZURE_CLIENT_ID;
    const clientSecret = process.env.ZAPPER_AZURE_CLIENT_SECRET;

    if (tenantId && clientId && clientSecret) {
      credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
      console.log("Using ClientSecretCredential for Azure authentication");
    } else {
      console.error(
        "Client secret authentication requested but missing required environment variables",
      );
    }
  } else {
    // Use DefaultAzureCredential (recommended for production with managed identity)
    try {
      credential = new DefaultAzureCredential();
      console.log(
        "Using DefaultAzureCredential for Azure authentication (az login or managed identity)",
      );
    } catch (error) {
      console.error("Failed to initialize DefaultAzureCredential:", error);
    }
  }

  // Validate Azure environment variables
  if (!subscriptionId || !resourceGroup || !credential) {
    console.error("Missing Azure configuration:", {
      subscriptionId: !!subscriptionId,
      resourceGroup: !!resourceGroup,
      credential: !!credential,
      authMethod: useClientSecret ? "ClientSecret" : "DefaultAzureCredential",
    });
  }

  // Initialize database first, then seed initial data, then start background services
  // This ensures tables exist before any service tries to query them
  (async () => {
    try {
      await initializeDatabase();
      await seedInitialDataFromEnv();
      
      // Start background CU polling service AFTER database is initialized
      // This prevents "relation does not exist" errors on fresh deployments
      CuPollingService.getInstance().start();
      EvalPollingService.getInstance().start();
    } catch (error) {
      console.error("Failed to initialize database or seed initial data:", error);
      console.log("Application will continue without initial data seeding");
    }
  })();

  // Register config router
  app.use("/api/config", configRouter);
  app.use("/api/help", helpRouter);
  app.use("/api/onboarding", onboardingRouter);
  app.use("/api/eval", evalRouter);

  // SSO Configuration endpoint
  app.get("/api/sso-config", (req, res) => {
    const config = getSSOConfig();
    res.json({
      ssoFeature: config.ssoFeature,
      supportsMicrosoft: config.supportsMicrosoft,
      supportsGoogle: config.supportsGoogle,
      supportsBoth: config.supportsBoth,
      providers: {
        microsoft: config.supportsMicrosoft,
        google: config.supportsGoogle,
      },
    });
  });

  // Sentinel ARM health check endpoint
  app.get("/api/sentinel/health", tokenRequired, async (req, res) => {
    try {
      const client = getSentinelArmClient();
      const health = await client.checkHealth();
      res.json(health);
    } catch (error: any) {
      res.status(500).json({
        ok: false,
        workspaceFound: false,
        sentinelOnboarded: false,
        error: error.message,
      });
    }
  });

  // // Sentinel Analytics Rules - Create/Update PGP Generated rule
  // app.put("/api/sentinel/rules/zapper-pgp-generated", tokenRequired, async (req, res) => {
  //   try {
  //     const client = getSentinelArmClient();
  //     const result = await client.upsertPgpGeneratedRule();
  //     if (result.ok) {
  //       res.status(result.created ? 201 : 200).json(result);
  //     } else {
  //       const statusCode = result.errorCode === 'RBAC_DENIED' ? 403 : 
  //                         result.errorCode === 'NOT_FOUND' ? 404 :
  //                         result.errorCode === 'SENTINEL_DISABLED' ? 503 : 500;
  //       res.status(statusCode).json(result);
  //     }
  //   } catch (error: any) {
  //     res.status(500).json({
  //       ok: false,
  //       errorCode: 'ARM_ERROR',
  //       error: error.message,
  //     });
  //   }
  // });

  // // Sentinel Analytics Rules - Get PGP Generated rule
  // app.get("/api/sentinel/rules/zapper-pgp-generated", tokenRequired, async (req, res) => {
  //   try {
  //     const client = getSentinelArmClient();
  //     const result = await client.getPgpGeneratedRule();
  //     if (result.ok) {
  //       res.json(result);
  //     } else {
  //       const statusCode = result.errorCode === 'RBAC_DENIED' ? 403 : 
  //                         result.errorCode === 'NOT_FOUND' ? 404 :
  //                         result.errorCode === 'SENTINEL_DISABLED' ? 503 : 500;
  //       res.status(statusCode).json(result);
  //     }
  //   } catch (error: any) {
  //     res.status(500).json({
  //       ok: false,
  //       exists: false,
  //       errorCode: 'ARM_ERROR',
  //       error: error.message,
  //     });
  //   }
  // });

  // Sentinel Rule Catalog - Get available rules
  app.get("/api/sentinel/rules/catalog", tokenRequired, siemManagementPermissionRequired('view'), async (req, res) => {
    try {
      const catalog = RULE_CATALOG.map(rule => ({
        ruleId: rule.ruleId,
        displayName: rule.displayName,
        description: rule.description,
        severity: rule.severity,
        enabledByDefault: rule.enabledByDefault,
        params: rule.params,
        defaults: rule.defaults,
        tactics: rule.tactics || [],
      }));
      res.json({ ok: true, rules: catalog });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Sentinel Rule Catalog - Install a rule from catalog
  app.post("/api/sentinel/rules/install", tokenRequired, siemManagementPermissionRequired('install'), async (req, res) => {
    try {
      const { ruleId, params = {} } = req.body;
      
      if (!ruleId || typeof ruleId !== 'string') {
        return res.status(400).json({ ok: false, error: 'ruleId is required' });
      }

      const ruleDef = getRuleById(ruleId);
      if (!ruleDef) {
        return res.status(404).json({ ok: false, error: `Rule '${ruleId}' not found in catalog` });
      }

      const validation = validateParams(ruleDef, params);
      if (!validation.valid) {
        return res.status(400).json({ ok: false, error: validation.error });
      }

      const client = getSentinelArmClient();
      const result = await client.upsertRuleFromCatalog(ruleDef, params);
      
      if (result.ok) {
        const logContext = await getActivityLoggingContext(req);
        await ActivityLogger.log({
          userId: logContext.userId,
          userName: logContext.userName,
          email: logContext.email,
          ipAddress: logContext.ipAddress,
          userAgent: logContext.userAgent,
          action: ActivityActions.INSTALL_SENTINEL_RULE,
          actionCategory: 'SIEM_MANAGEMENT',
          resource: `Sentinel Rule: ${ruleId}`,
          resourceType: 'SENTINEL_RULE',
          details: { ruleId, displayName: ruleDef.displayName, params, created: result.created },
          roleId: logContext.roleId,
          roleName: logContext.roleName,
          organizationId: logContext.organizationId,
          organizationName: logContext.organizationName,
        });
        res.status(result.created ? 201 : 200).json(result);
      } else {
        const statusCode = result.errorCode === 'RBAC_DENIED' ? 403 : 
                          result.errorCode === 'NOT_FOUND' ? 404 :
                          result.errorCode === 'SENTINEL_DISABLED' ? 503 : 500;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      res.status(500).json({ ok: false, errorCode: 'ARM_ERROR', error: error.message });
    }
  });

  // Sentinel Rules - List installed Zapper rules
  app.get("/api/sentinel/rules/installed", tokenRequired, siemManagementPermissionRequired('view'), async (req, res) => {
    try {
      const client = getSentinelArmClient();
      const result = await client.listInstalledRules();
      
      if (result.ok) {
        const logContext = await getActivityLoggingContext(req);
        await ActivityLogger.log({
          userId: logContext.userId,
          userName: logContext.userName,
          email: logContext.email,
          ipAddress: logContext.ipAddress,
          userAgent: logContext.userAgent,
          action: ActivityActions.VIEW_SENTINEL_RULES,
          actionCategory: 'SIEM_MANAGEMENT',
          resource: 'Sentinel Rules',
          resourceType: 'SENTINEL_RULE',
          details: { ruleCount: result.rules?.length || 0 },
          roleId: logContext.roleId,
          roleName: logContext.roleName,
          organizationId: logContext.organizationId,
          organizationName: logContext.organizationName,
        });
        res.json(result);
      } else {
        const statusCode = result.errorCode === 'RBAC_DENIED' ? 403 : 
                          result.errorCode === 'SENTINEL_DISABLED' ? 503 : 500;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      res.status(500).json({ ok: false, errorCode: 'ARM_ERROR', error: error.message });
    }
  });

  // Sentinel Rules - Delete a rule
  app.delete("/api/sentinel/rules/:ruleId", tokenRequired, siemManagementPermissionRequired('delete'), async (req, res) => {
    try {
      const { ruleId } = req.params;
      
      if (!ruleId || typeof ruleId !== 'string') {
        return res.status(400).json({ ok: false, error: 'ruleId is required' });
      }

      const client = getSentinelArmClient();
      const result = await client.deleteRule(ruleId);
      
      if (result.ok) {
        const logContext = await getActivityLoggingContext(req);
        await ActivityLogger.log({
          userId: logContext.userId,
          userName: logContext.userName,
          email: logContext.email,
          ipAddress: logContext.ipAddress,
          userAgent: logContext.userAgent,
          action: ActivityActions.DELETE_SENTINEL_RULE,
          actionCategory: 'SIEM_MANAGEMENT',
          resource: `Sentinel Rule: ${ruleId}`,
          resourceType: 'SENTINEL_RULE',
          details: { ruleId },
          roleId: logContext.roleId,
          roleName: logContext.roleName,
          organizationId: logContext.organizationId,
          organizationName: logContext.organizationName,
        });
        res.json(result);
      } else {
        const statusCode = result.errorCode === 'RBAC_DENIED' ? 403 : 
                          result.errorCode === 'NOT_FOUND' ? 404 :
                          result.errorCode === 'SENTINEL_DISABLED' ? 503 : 500;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      res.status(500).json({ ok: false, errorCode: 'ARM_ERROR', error: error.message });
    }
  });

  // Sentinel Rules - Enable a rule
  app.patch("/api/sentinel/rules/:ruleId/enable", tokenRequired, siemManagementPermissionRequired('enableDisable'), async (req, res) => {
    try {
      const { ruleId } = req.params;
      
      if (!ruleId || typeof ruleId !== 'string') {
        return res.status(400).json({ ok: false, error: 'ruleId is required' });
      }

      const client = getSentinelArmClient();
      const result = await client.toggleRuleEnabled(ruleId, true);
      
      if (result.ok) {
        const logContext = await getActivityLoggingContext(req);
        await ActivityLogger.log({
          userId: logContext.userId,
          userName: logContext.userName,
          email: logContext.email,
          ipAddress: logContext.ipAddress,
          userAgent: logContext.userAgent,
          action: ActivityActions.ENABLE_SENTINEL_RULE,
          actionCategory: 'SIEM_MANAGEMENT',
          resource: `Sentinel Rule: ${ruleId}`,
          resourceType: 'SENTINEL_RULE',
          details: { ruleId, enabled: true },
          roleId: logContext.roleId,
          roleName: logContext.roleName,
          organizationId: logContext.organizationId,
          organizationName: logContext.organizationName,
        });
        res.json(result);
      } else {
        const statusCode = result.errorCode === 'RBAC_DENIED' ? 403 : 
                          result.errorCode === 'NOT_FOUND' ? 404 :
                          result.errorCode === 'SENTINEL_DISABLED' ? 503 : 500;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      res.status(500).json({ ok: false, errorCode: 'ARM_ERROR', error: error.message });
    }
  });

  // Sentinel Rules - Disable a rule
  app.patch("/api/sentinel/rules/:ruleId/disable", tokenRequired, siemManagementPermissionRequired('enableDisable'), async (req, res) => {
    try {
      const { ruleId } = req.params;
      
      if (!ruleId || typeof ruleId !== 'string') {
        return res.status(400).json({ ok: false, error: 'ruleId is required' });
      }

      const client = getSentinelArmClient();
      const result = await client.toggleRuleEnabled(ruleId, false);
      
      if (result.ok) {
        const logContext = await getActivityLoggingContext(req);
        await ActivityLogger.log({
          userId: logContext.userId,
          userName: logContext.userName,
          email: logContext.email,
          ipAddress: logContext.ipAddress,
          userAgent: logContext.userAgent,
          action: ActivityActions.DISABLE_SENTINEL_RULE,
          actionCategory: 'SIEM_MANAGEMENT',
          resource: `Sentinel Rule: ${ruleId}`,
          resourceType: 'SENTINEL_RULE',
          details: { ruleId, enabled: false },
          roleId: logContext.roleId,
          roleName: logContext.roleName,
          organizationId: logContext.organizationId,
          organizationName: logContext.organizationName,
        });
        res.json(result);
      } else {
        const statusCode = result.errorCode === 'RBAC_DENIED' ? 403 : 
                          result.errorCode === 'NOT_FOUND' ? 404 :
                          result.errorCode === 'SENTINEL_DISABLED' ? 503 : 500;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      res.status(500).json({ ok: false, errorCode: 'ARM_ERROR', error: error.message });
    }
  });

  // Sentinel Incidents - List incidents
  app.get("/api/sentinel/incidents", tokenRequired, siemManagementPermissionRequired('incidentsView'), async (req, res) => {
    try {
      const { range = '24h', status, severity, search, pageSize, cursor } = req.query;

      const client = getSentinelArmClient();
      const result = await client.listIncidents({
        range: String(range),
        status: status ? String(status) : undefined,
        severity: severity ? String(severity) : undefined,
        search: search ? String(search) : undefined,
        pageSize: pageSize ? parseInt(String(pageSize), 10) : undefined,
        cursor: cursor ? String(cursor) : undefined,
      });
      
      if (result.ok) {
        res.json(result);
      } else {
        const statusCode = result.errorCode === 'RBAC_DENIED' ? 403 : 
                          result.errorCode === 'NOT_FOUND' ? 404 :
                          result.errorCode === 'SENTINEL_NOT_CONFIGURED' ? 503 : 500;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      res.status(500).json({ ok: false, errorCode: 'ARM_ERROR', error: error.message });
    }
  });

  // Sentinel Incidents - Get incident details
  app.get("/api/sentinel/incidents/:incidentId", tokenRequired, siemManagementPermissionRequired('incidentsView'), async (req, res) => {
    try {
      const { incidentId } = req.params;
      
      if (!incidentId || typeof incidentId !== 'string') {
        return res.status(400).json({ ok: false, error: 'incidentId is required' });
      }

      const client = getSentinelArmClient();
      const result = await client.getIncident(incidentId);
      
      if (result.ok) {
        res.json(result);
      } else {
        const statusCode = result.errorCode === 'RBAC_DENIED' ? 403 : 
                          result.errorCode === 'NOT_FOUND' ? 404 :
                          result.errorCode === 'SENTINEL_NOT_CONFIGURED' ? 503 : 500;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      res.status(500).json({ ok: false, errorCode: 'ARM_ERROR', error: error.message });
    }
  });

  // Google SSO Routes
  app.get("/api/auth/google/url", googleSSOEnabled, (req, res) => {
    try {
      const authUrl = getGoogleAuthUrl(req);
      res.json({ authUrl });
    } catch (error) {
      console.error("Google auth URL generation error:", error);
      res.status(500).json({ error: "Failed to generate Google auth URL" });
    }
  });

  app.post(
    "/api/auth/google/callback",
    googleSSOEnabled,
    authenticateGoogleUser,
    async (req, res) => {
      try {
        const user = req.user;
        const sessionId = crypto.randomUUID();

        // Log user activity
        await logUserActivity(
          req,
          "LOGIN",
          "AUTH",
          `Google SSO Login`,
          "SESSION",
        );

        res.json({
          success: true,
          session_id: sessionId,
          message: "Google login successful",
          token: user.token, // Include JWT token for API security
          user: {
            email: user.email,
            name: user.name,
            provider: "google",
          },
        });
      } catch (error) {
        console.error("Google callback error:", error);
        res.status(500).json({ error: "Google authentication failed" });
      }
    },
  );

  // Auth routes
  app.post(
    "/api/login",
    microsoftSSOEnabled,
    tokenRequired,
    async (req, res) => {
      try {
        const userInfo = (req as any).user;
        const sessionId = crypto.randomUUID();
        const userName = userInfo.name || userInfo.preferred_username || "";
        const email = userInfo.email || userInfo.preferred_username || "";

        await ActivityLogger.logLogin({
          userId: userInfo.oid || "",
          userName,
          email,
          ipAddress: getClientIp(req),
          sessionId,
          userAgent: req.headers["user-agent"] as string,
        });

        res.json({
          success: true,
          session_id: sessionId,
          message: "Login activity recorded",
        });
      } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Failed to record login" });
      }
    },
  );

  app.post("/api/logout", tokenRequired, async (req, res) => {
    try {
      const { session_id } = req.body;
      if (!session_id) {
        // We'll still proceed with logout even if activity update can't be tied
        console.warn("Logout called without session_id; proceeding to clear session/cookie.");
      }

      // Update activity log first
      if (session_id) {
        try {
          await storage.updateUserActivity(session_id, { logoutTime: new Date() });
        } catch (e) {
          console.warn("updateUserActivity failed on logout:", e);
        }
      }
      
      // Destroy session properly
      if (!req.session) {
        // No server session (likely Azure token user)
        res.clearCookie("connect.sid");
        return res.json({ success: true, message: "Logout successful" });
      }
      req.session.destroy((err) => {
        // Always attempt to clear the cookie either way
        res.clearCookie("connect.sid");
        if (err) {
          console.error("Session destroy error:", err);
          return res.status(500).json({ error: "Logout failed" });
        }
        return res.json({ success: true, message: "Logout successful" });
      });
    } catch (error) {
      console.error("Logout error:", error);
      // Don't block the user from logging out due to logging failures
      res.clearCookie("connect.sid");
      res.status(200).json({ success: true, message: "Logout completed with warnings" });
    }
  });

  // Parse PPTX file and return text content
  app.post("/api/parse-pptx", tokenRequired, async (req, res) => {
    try {
      const { fileUrl } = req.body;
      
      if (!fileUrl) {
        return res.status(400).json({ error: "File URL is required" });
      }

      // SECURITY: Validate URL is from Azure Storage (SSRF Prevention)
      if (!validateAzureStorageUrl(fileUrl)) {
        return res.status(400).json({ error: "Invalid file URL" });
      }

      // Download the file from the URL
      const response = await axios.get(fileUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 second timeout
      });

      // Parse the PowerPoint file
      const text = await officeParser.parseOfficeAsync(response.data);
      
      res.json({ content: text || 'No text content found in this presentation' });
    } catch (error: any) {
      console.error("PPTX parsing error:", error);
      res.status(500).json({ 
        error: "Failed to parse PowerPoint file",
        message: error.message 
      });
    }
  });

  // Parse RTF file and return HTML content
  app.post("/api/parse-rtf", tokenRequired, async (req, res) => {
    try {
      const { fileUrl } = req.body;
      
      if (!fileUrl) {
        return res.status(400).json({ error: "File URL is required" });
      }

      // SECURITY: Validate URL is from Azure Storage (SSRF Prevention)
      if (!validateAzureStorageUrl(fileUrl)) {
        return res.status(400).json({ error: "Invalid file URL" });
      }

      // Download the file from the URL
      const response = await axios.get(fileUrl, {
        responseType: 'text',
        timeout: 30000, // 30 second timeout
      });

      // Import the RTF to HTML converter
      const rtfToHTML = await import('@iarna/rtf-to-html');
      
      // Parse the RTF file to HTML
      rtfToHTML.fromString(response.data, (err: Error | null, html: string) => {
        if (err) {
          console.error("RTF parsing error:", err);
          return res.status(500).json({ 
            error: "Failed to parse RTF file",
            message: err.message 
          });
        }
        
        res.json({ content: html || 'No content found in this RTF file' });
      });
    } catch (error: any) {
      console.error("RTF parsing error:", error);
      res.status(500).json({ 
        error: "Failed to parse RTF file",
        message: error.message 
      });
    }
  });

  app.get("/api/profile", tokenRequired, (req, res) => {
    const user = (req as any).user;
    res.json(user);
  });

  // Get current user's roles and organizations
  app.get("/api/my-roles", tokenRequired, async (req, res) => {
    try {
      const user = (req as any).user;
      const email = user?.email || user?.preferred_username;

      if (!email) {
        return res.status(400).json({ error: "User email not found" });
      }

      const userRoles = await storage.getUserRolesByEmail(email);
      res.json(userRoles);
    } catch (error) {
      console.error("Failed to fetch user roles:", error);
      res.status(500).json({ error: "Failed to fetch user roles" });
    }
  });

  // Get user info for current user
  app.get("/api/me", tokenRequired, async (req, res) => {
    try {
      const user = (req as any).user;
      res.json(user);
    } catch (error) {
      console.error("Failed to fetch user info:", error);
      res.status(500).json({ error: "Failed to fetch user info" });
    }
  });

  // Check if user exists by email (for authentication purposes only)
  // SECURITY: Uses email from JWT token only - no query parameter needed
  // This prevents email exposure in URLs, logs, and browser history
  app.get("/api/auth/user-exists", tokenRequired, async (req, res) => {
    try {
      const tokenEmail = (req.user?.email || (req as any).user?.preferred_username || "").toLowerCase().trim();
      
      if (!tokenEmail) {
        return res.status(401).json({
          error: "Unauthorized",
          details: "Unable to extract email from authentication token"
        });
      }

      const user = await storage.getUserByEmail(tokenEmail);
      
      if (user) {
        const userWithRole = await storage.getUser(user.id);
        res.json({ 
          exists: true,
          user: userWithRole
        });
      } else {
        res.json({ exists: false });
      }
    } catch (error) {
      console.error("User existence check error:", error);
      res.status(500).json({ error: "Failed to check user existence" });
    }
  });

  // Users routes
  app.get(
    "/api/users",
    tokenRequired,
    userManagementPermissionRequired('view'),
    async (req, res) => {
      try {
        const roleFilterRaw = (req.query.role as string) || "all";
        const orgFilterRaw = (req.query.organization as string) || "all";
        
        // Security: Validate filter strings to prevent DoS attacks and null byte injection
        // Validate role filter
        const roleValidation = validateFilterString(roleFilterRaw, 'Role filter', MAX_LENGTHS.ROLE_NAME);
        if (!roleValidation.valid) {
          return res.status(400).json({ 
            error: roleValidation.error,
            field: 'role'
          });
        }
        const roleFilter = roleValidation.sanitized!;
        
        // Validate organization filter
        const orgValidation = validateFilterString(orgFilterRaw, 'Organization filter', MAX_LENGTHS.ORGANIZATION_NAME);
        if (!orgValidation.valid) {
          return res.status(400).json({ 
            error: orgValidation.error,
            field: 'organization'
          });
        }
        const orgFilter = orgValidation.sanitized!;
        
        // Scope user list to only organizations the requesting user belongs to
        const userEmail = (req as any).user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "Authentication required" });
        }
        const userOrgRoles = await storage.getUserRolesByEmail(userEmail);
        const userOrgIds = [...new Set(userOrgRoles.map(r => r.organization.id))];
        
        const users = await storage.getUsersWithRolesForOrganizations(
          userOrgIds,
          roleFilter !== "all" ? roleFilter : undefined,
          orgFilter !== "all" ? orgFilter : undefined,
        );

        // Log user list viewing activity
        await logUserActivity(
          req,
          "VIEW_USERS",
          "USER_MANAGEMENT",
          "User List",
          "DATA",
        );

        res.json(users);
      } catch (error) {
        console.error("Users fetch error:", error);
        res.status(500).json({ error: "Failed to fetch users" });
      }
    },
  );

  app.get(
    "/api/users/:id",
    tokenRequired,
    userManagementPermissionRequired('view'),
    userManagementAccessRequired,
    async (req, res) => {
      try {
        // Use pre-validated user ID from middleware
        const userId = (req as any).validatedTargetUserId;
        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        const userRole = await storage.getUserRole(userId);
        res.json({ ...user, userRole });
      } catch (error) {
        console.error("User fetch error:", error);
        res.status(500).json({ error: "Failed to fetch user" });
      }
    },
  );

  app.post(
    "/api/users",
    tokenRequired,
    userManagementPermissionRequired('add'),
    async (req, res) => {
      try {
        const { name, email, role_id, organization_id, isEnabled = true, userType = "internal" } = req.body;
        
        if (!name || !email || !role_id || !organization_id) {
          return res.status(400).json({ error: "Missing required fields: name, email, role_id, and organization_id" });
        }

        if (userType && !["internal", "external"].includes(userType)) {
          return res.status(400).json({ error: "userType must be 'internal' or 'external'" });
        }

        // Security: Validate email format to prevent invalid data injection
        if (!isValidEmail(email)) {
          return res.status(400).json({ 
            error: "Invalid email format",
            received: email
          });
        }

        // Security: Validate text field lengths to prevent abuse
        const nameValidation = validateTextField(name, MAX_LENGTHS.NAME, 'Name');
        if (!nameValidation.valid) {
          return res.status(400).json({ error: nameValidation.error });
        }

        // Security: Validate integer IDs
        if (!Number.isInteger(role_id) || role_id <= 0) {
          return res.status(400).json({ error: "Invalid role_id: must be a positive integer" });
        }
        if (!Number.isInteger(organization_id) || organization_id <= 0) {
          return res.status(400).json({ error: "Invalid organization_id: must be a positive integer" });
        }

        // Normalize email to lowercase and use sanitized name
        const normalizedEmail = email.toLowerCase().trim();
        const sanitizedName = nameValidation.sanitized!;

        let user = await storage.getUserByEmail(normalizedEmail);
        if (!user) {
          user = await storage.createUser({ name: sanitizedName, email: normalizedEmail, userType: userType || "internal" });
        } else if (userType) {
          await storage.updateUser(user.id, { userType });
        }

        // Create user role (the storage method will check for duplicates)
        try {
          await storage.createUserRole({
            userId: user.id,
            roleId: role_id,
            organizationId: organization_id,
            isEnabled: isEnabled,
          });
        } catch (error: any) {
          if (error.message.includes("already has this role")) {
            return res.status(400).json({ error: error.message });
          }
          throw error;
        }

        // Log user creation activity
        await logUserActivity(
          req,
          "CREATE_USER",
          "USER_MANAGEMENT",
          `User: ${name} (${email})`,
          "USER",
          { organizationId: organization_id },
        );

        res.status(201).json({ ...user, message: "User created successfully" });
      } catch (error: any) {
        console.error("User creation error:", error);
        
        // Check for PostgreSQL unique constraint violation
        if (error.code === '23505' && error.constraint === 'user_role_org_unique') {
          return res.status(400).json({ 
            error: "Failed to create user: This user already has this role in the selected organization" 
          });
        }
        
        res.status(500).json({ error: "Failed to create user" });
      }
    },
  );

  app.put(
    "/api/users/:id",
    tokenRequired,
    userManagementPermissionRequired('edit'),
    userManagementAccessRequired,
    async (req, res) => {
      try {
        // Use pre-validated user ID from middleware
        const userId = (req as any).validatedTargetUserId;
        const { name, email, role_id, organization_id, user_role_id, userType } = req.body;

        if (userType !== undefined && !["internal", "external"].includes(userType)) {
          return res.status(400).json({ error: "userType must be 'internal' or 'external'" });
        }

        // Security: Validate email format if provided
        if (email && !isValidEmail(email)) {
          return res.status(400).json({ 
            error: "Invalid email format",
            received: email
          });
        }

        // Security: Validate name length if provided
        if (name) {
          const nameValidation = validateTextField(name, MAX_LENGTHS.NAME, 'Name');
          if (!nameValidation.valid) {
            return res.status(400).json({ error: nameValidation.error });
          }
        }

        // Security: Validate integer IDs if provided
        if (role_id !== undefined && (!Number.isInteger(role_id) || role_id <= 0)) {
          return res.status(400).json({ error: "Invalid role_id: must be a positive integer" });
        }
        if (organization_id !== undefined && (!Number.isInteger(organization_id) || organization_id <= 0)) {
          return res.status(400).json({ error: "Invalid organization_id: must be a positive integer" });
        }
        if (user_role_id !== undefined && (!Number.isInteger(user_role_id) || user_role_id <= 0)) {
          return res.status(400).json({ error: "Invalid user_role_id: must be a positive integer" });
        }

        // Prepare sanitized update data
        const updateData: any = {};
        if (name) {
          const nameValidation = validateTextField(name, MAX_LENGTHS.NAME, 'Name');
          updateData.name = nameValidation.sanitized;
        }
        if (email) {
          updateData.email = email.toLowerCase().trim();
        }
        if (userType) {
          updateData.userType = userType;
        }

        const user = await storage.updateUser(userId, updateData);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        if (role_id && organization_id) {
          // Update user role - delete the specific assignment and create new one
          if (!user_role_id) {
            return res.status(400).json({ 
              error: "user_role_id is required when updating user roles" 
            });
          }

          // Verify the user_role_id belongs to this user (security check)
          const userRoles = await storage.getUserRoles(userId);
          const roleToDelete = userRoles.find(r => r.id === user_role_id);
          
          if (!roleToDelete) {
            return res.status(403).json({ 
              error: "Invalid user_role_id: does not belong to this user" 
            });
          }

          // Delete the specific user role assignment by its ID (not the first one!)
          await storage.deleteUserRoleById(user_role_id);
          
          await storage.createUserRole({
            userId,
            roleId: role_id,
            organizationId: organization_id,
          });
        }

        // Log user update activity
        await logUserActivity(
          req,
          "UPDATE_USER",
          "USER_MANAGEMENT",
          `User: ${user.name} (${user.email})`,
          "USER",
          organization_id ? { organizationId: organization_id } : undefined,
        );

        res.json({ ...user, message: "User updated successfully" });
      } catch (error: any) {
        console.error("User update error:", error);
        
        // Check for PostgreSQL unique constraint violation
        if (error.code === '23505' && error.constraint === 'user_role_org_unique') {
          return res.status(400).json({ 
            error: "Failed to update user: This user already has this role in the selected organization" 
          });
        }
        
        res.status(500).json({ error: "Failed to update user" });
      }
    },
  );

  app.delete(
    "/api/users/:id",
    tokenRequired,
    userManagementPermissionRequired('delete'),
    userManagementAccessRequired,
    async (req, res) => {
      try {
        // Use pre-validated user ID from middleware
        const userId = (req as any).validatedTargetUserId;

        // Get user info before deletion for logging
        const userToDelete = await storage.getUser(userId);

        // CRITICAL: Prevent deleting the last enabled user in the system
        // This ensures at least one user can always log in
        
        // Step 1: Check if this user has any enabled roles
        const userRoles = await storage.getUserRoles(userId);
        const userHasEnabledRoles = userRoles.some(role => role.isEnabled === true);
        
        console.log(`[DELETE USER CHECK] User ${userId}:`, {
          totalRoles: userRoles.length,
          hasEnabledRoles: userHasEnabledRoles,
          roles: userRoles.map(r => ({ roleId: r.roleId, isEnabled: r.isEnabled }))
        });
        
        // Only check for last enabled user if this user has enabled roles
        if (userHasEnabledRoles) {
          // Step 2: Get ALL user-role assignments from database
          const allUsersWithRoles = await storage.getAllUsersWithRoles();
          
          // Step 3: Filter to get only enabled user-role assignments
          const enabledUserRoles = allUsersWithRoles.filter(ur => ur.isEnabled === true);
          
          // Step 4: Get unique user IDs who have at least one enabled role
          const allEnabledUserIds = new Set(enabledUserRoles.map(ur => ur.id));
          
          // Step 5: Remove current user from the set to see who else has enabled roles
          const allEnabledUserIdsArray = Array.from(allEnabledUserIds);
          const otherEnabledUserIds = new Set(allEnabledUserIdsArray.filter(id => id !== userId));
          
          console.log(`[DELETE USER CHECK] System state:`, {
            totalEnabledUserRoles: enabledUserRoles.length,
            uniqueUsersWithEnabledRoles: allEnabledUserIds.size,
            otherUsersWithEnabledRoles: otherEnabledUserIds.size,
            allEnabledUserIds: Array.from(allEnabledUserIds),
            otherEnabledUserIds: Array.from(otherEnabledUserIds)
          });
          
          // Step 6: If no other users have enabled roles, BLOCK deletion
          if (otherEnabledUserIds.size === 0) {
            console.log(`[DELETE USER] ❌ BLOCKED - User ${userId} is the LAST ENABLED user`);
            return res.status(400).json({ 
              error: "Cannot delete this user. The system requires at least one enabled user to remain operational. Please enable another user before deleting this one." 
            });
          }
          
          console.log(`[DELETE USER] ✅ ALLOWED - ${otherEnabledUserIds.size} other enabled users exist`);
        } else {
          console.log(`[DELETE USER] ✅ ALLOWED - User has no enabled roles, deletion safe`);
        }

        const success = await storage.deleteUser(userId);
        if (!success) {
          return res.status(404).json({ error: "User not found" });
        }

        // Log user deletion activity
        if (userToDelete) {
          await logUserActivity(
            req,
            "DELETE_USER",
            "USER_MANAGEMENT",
            `User: ${userToDelete.name} (${userToDelete.email})`,
            "USER",
          );
        }

        res.json({ message: "User deleted successfully" });
      } catch (error) {
        console.error("User deletion error:", error);
        res.status(500).json({ error: "Failed to delete user" });
      }
    },
  );

  // Delete specific user-role assignment (granular delete)
  app.delete(
    "/api/user-roles/:userId/:roleId/:organizationId",
    tokenRequired,
    userManagementPermissionRequired('delete'),
    async (req, res) => {
      try {
        const userId = parseInt(req.params.userId, 10);
        const roleId = parseInt(req.params.roleId, 10);
        const organizationId = validateOrganizationId(req.params.organizationId);

        // Security: Validate organization ID to ensure positive integer
        if (organizationId === null) {
          return res.status(400).json({
            error: "Invalid organization ID: must be a positive integer",
            received: req.params.organizationId
          });
        }

        // Get user info before deletion for logging
        const userToDelete = await storage.getUser(userId);
        const role = await storage.getRole(roleId);
        const organization = await storage.getOrganization(organizationId);

        // CRITICAL: Check if deleting this role would leave the system with no enabled users
        // Step 1: Get all user-role assignments
        const allUsersWithRoles = await storage.getAllUsersWithRoles();
        
        // Step 2: Filter for enabled role assignments only
        const enabledUserRoles = allUsersWithRoles.filter(ur => ur.isEnabled === true);
        
        // Step 3: Check if the role being deleted is currently enabled
        const roleBeingDeleted = enabledUserRoles.find(
          ur => ur.id === userId && ur.roleId === roleId && ur.organizationId === organizationId
        );
        const isRoleEnabled = !!roleBeingDeleted;
        
        console.log(`[DELETE USER-ROLE] Checking deletion of userId:${userId}, roleId:${roleId}, orgId:${organizationId}`, {
          isRoleEnabled,
          totalEnabledRoles: enabledUserRoles.length,
          enabledUserRoles: enabledUserRoles.map(ur => ({
            userId: ur.id,
            roleId: ur.roleId,
            orgId: ur.organizationId,
            roleName: ur.roleName
          }))
        });
        
        // Step 4: If this is an enabled role, check if it's the last enabled role in the system
        if (isRoleEnabled) {
          // Get unique user IDs who have enabled roles (excluding this specific role)
          const otherEnabledRoles = enabledUserRoles.filter(
            ur => !(ur.id === userId && ur.roleId === roleId && ur.organizationId === organizationId)
          );
          
          const otherEnabledUserIds = new Set(otherEnabledRoles.map(ur => ur.id));
          
          console.log(`[DELETE USER-ROLE] Last enabled check:`, {
            otherEnabledRolesCount: otherEnabledRoles.length,
            otherEnabledUsersCount: otherEnabledUserIds.size,
            otherEnabledUserIds: Array.from(otherEnabledUserIds)
          });
          
          // If no other enabled roles exist, BLOCK deletion
          if (otherEnabledRoles.length === 0) {
            console.log(`[DELETE USER-ROLE] ❌ BLOCKED - This is the LAST ENABLED role in the system`);
            return res.status(400).json({ 
              error: "Cannot delete this user role. The system requires at least one enabled user to remain operational. Please enable another user before deleting this role." 
            });
          }
          
          console.log(`[DELETE USER-ROLE] ✅ ALLOWED - ${otherEnabledRoles.length} other enabled roles exist`);
        }
        
        // Check if user has any remaining roles BEFORE deletion
        const currentRoles = await storage.getUserRoles(userId);
        
        // Check if this would be the last user with no roles
        if (currentRoles.length === 1) {
          // This is the last role for this user, check if this is the last user
          const allUsers = await storage.getAllUsersWithRoles();
          if (allUsers.length <= 1) {
            return res.status(400).json({ 
              error: "Cannot delete the last user role. The system requires at least one user with at least one role to remain operational." 
            });
          }
        }

        // Delete the specific user-role assignment
        const success = await storage.deleteUserRole(
          userId,
          roleId,
          organizationId,
        );
        if (!success) {
          return res
            .status(404)
            .json({ error: "User role assignment not found" });
        }

        // Check if user has any remaining roles after deletion
        const remainingRoles = await storage.getUserRoles(userId);

        // If no roles remain, delete the user completely
        if (remainingRoles.length === 0) {
          try {
            await storage.deleteUser(userId);

            // Log user deletion activity
            if (userToDelete) {
              await logUserActivity(
                req,
                "DELETE_USER",
                "USER_MANAGEMENT",
                `User: ${userToDelete.name} (${userToDelete.email}) - last role removed`,
                "USER",
                { organizationId },
              );
            }

            res.json({
              message: "User role removed and user deleted (no remaining roles)",
            });
          } catch (deleteError: any) {
            // Check for last user protection error
            if (deleteError?.message?.includes("Cannot delete the last user")) {
              return res.status(400).json({ error: deleteError.message });
            }
            throw deleteError;
          }
        } else {
          // Log role removal activity
          if (userToDelete && role && organization) {
            await logUserActivity(
              req,
              "REMOVE_USER_ROLE",
              "USER_MANAGEMENT",
              `User: ${userToDelete.name} (${userToDelete.email}) - Role: ${role.name} in ${organization.name}`,
              "USER",
              { organizationId },
            );
          }

          res.json({ message: "User role assignment removed successfully" });
        }
      } catch (error) {
        console.error("User role deletion error:", error);
        res
          .status(500)
          .json({ error: "Failed to delete user role assignment" });
      }
    },
  );

  // Enable user role
  app.put(
    "/api/user-roles/:userId/:roleId/:organizationId/enable",
    tokenRequired,
    userManagementPermissionRequired('enableDisable'),
    async (req, res) => {
      try {
        const userId = parseInt(req.params.userId, 10);
        const roleId = parseInt(req.params.roleId, 10);
        const organizationId = validateOrganizationId(req.params.organizationId);

        // Security: Validate organization ID to ensure positive integer
        if (organizationId === null) {
          return res.status(400).json({
            error: "Invalid organization ID: must be a positive integer",
            received: req.params.organizationId
          });
        }

        // Get user info for logging
        const user = await storage.getUser(userId);
        const role = await storage.getRole(roleId);
        const organization = await storage.getOrganization(organizationId);

        const success = await storage.enableUserRole(
          userId,
          roleId,
          organizationId,
        );
        if (!success) {
          return res
            .status(404)
            .json({ error: "User role assignment not found" });
        }

        // Log enable activity
        if (user && role && organization) {
          await logUserActivity(
            req,
            "ENABLE_USER_ROLE",
            "USER_MANAGEMENT",
            `User: ${user.name} (${user.email}) - Role: ${role.name} in ${organization.name}`,
            "USER",
            { organizationId },
          );
        }

        res.json({ message: "User role enabled successfully" });
      } catch (error: unknown) {
        console.error("User role enable error:", error);
        res.status(500).json({ error: "Failed to enable user role" });
      }
    },
  );

  // Disable user role
  app.put(
    "/api/user-roles/:userId/:roleId/:organizationId/disable",
    tokenRequired,
    userManagementPermissionRequired('enableDisable'),
    async (req, res) => {
      try {
        const userId = parseInt(req.params.userId, 10);
        const roleId = parseInt(req.params.roleId, 10);
        const organizationId = validateOrganizationId(req.params.organizationId);

        // Security: Validate organization ID to ensure positive integer
        if (organizationId === null) {
          return res.status(400).json({
            error: "Invalid organization ID: must be a positive integer",
            received: req.params.organizationId
          });
        }

        // Get user info for logging
        const user = await storage.getUser(userId);
        const role = await storage.getRole(roleId);
        const organization = await storage.getOrganization(organizationId);

        // CRITICAL: Check if disabling this role would leave the system with no enabled user roles
        // First, get all users with roles and their enabled status
        const allUsersWithRoles = await storage.getAllUsersWithRoles();
        const allEnabledRoles = allUsersWithRoles.filter(user => user.isEnabled === true);
        
        // Count enabled roles excluding the one we're about to disable
        const otherEnabledRoles = allEnabledRoles.filter(
          user => !(user.id === userId && user.roleId === roleId && user.organizationId === organizationId)
        );
        
        if (otherEnabledRoles.length === 0) {
          return res.status(400).json({ 
            error: "Cannot disable this user role. The system requires at least one user with an enabled role to remain operational. Please ensure another user has an enabled role before disabling this one." 
          });
        }

        const success = await storage.disableUserRole(
          userId,
          roleId,
          organizationId,
        );
        if (!success) {
          return res
            .status(404)
            .json({ error: "User role assignment not found" });
        }

        // Log disable activity
        if (user && role && organization) {
          await logUserActivity(
            req,
            "DISABLE_USER_ROLE",
            "USER_MANAGEMENT",
            `User: ${user.name} (${user.email}) - Role: ${role.name} in ${organization.name}`,
            "USER",
            { organizationId },
          );
        }

        res.json({ message: "User role disabled successfully" });
      } catch (error: unknown) {
        console.error("User role disable error:", error);
        res.status(500).json({ error: "Failed to disable user role" });
      }
    },
  );

  // Get current user's role permissions for the selected role
  app.get(
    "/api/my-role-permissions/:roleId",
    tokenRequired,
    async (req, res) => {
      try {
        const roleId = parseInt(req.params.roleId, 10);
        const userEmail = (req as any).user?.email;

        console.log(
          `Fetching permissions for roleId: ${roleId}, userEmail: ${userEmail}`,
        );

        if (!userEmail) {
          return res.status(401).json({ error: "User email not found" });
        }

        if (isNaN(roleId)) {
          return res.status(400).json({ error: "Invalid role ID" });
        }

        // IDOR prevention: Verify user is assigned to the requested role
        const isAssigned = await storage.isRoleAssignedToUser(userEmail, roleId);
        if (!isAssigned) {
          console.log(
            `[SECURITY] User ${userEmail} attempted to access role ${roleId} they are not assigned to`
          );
          return res.status(403).json({ error: "Access denied: Role not assigned to user" });
        }

        const permissions = await storage.getUserRolePermissions(
          userEmail,
          roleId,
        );

        console.log(
          `✅ [PERMISSIONS] Permissions result for ${userEmail} / roleId ${roleId}:`,
          JSON.stringify(permissions, null, 2),
        );

        res.json(permissions);
      } catch (error) {
        console.error("Role permissions fetch error:", error);
        res.status(500).json({ error: "Failed to fetch role permissions" });
      }
    },
  );

  // Get accessible help center chapters based on user's role permissions
  // Uses efficient aggregated permissions query with slug-based mapping
  // Returns chapter IDs for frontend compatibility
  app.get(
    "/api/help-center/accessible-chapters",
    tokenRequired,
    async (req, res) => {
      try {
        const userId = (req as any).dbUser?.id;

        if (!userId) {
          return res.status(401).json({ error: "User context not found" });
        }

        // Import centralized permission mapping and help data
        const { SLUG_TO_PERMISSION_MAP, hasChapterPermission } = await import("./utils/helpCenterPermissions");
        const { userGuideChapters } = await import("./data/helpUserGuide");
        const { troubleshootingChapters } = await import("./data/helpTroubleshooting");

        // Get aggregated permissions across ALL organizations (JSON structure)
        const permissions = await storage.getUserHelpCenterPermissions(userId);

        // Build array of accessible slugs using new JSON-based permission check
        const accessibleSlugs: string[] = [];
        for (const slug of Object.keys(SLUG_TO_PERMISSION_MAP)) {
          if (hasChapterPermission(permissions, slug)) {
            accessibleSlugs.push(slug);
          }
        }

        // Map slugs to chapter IDs for frontend compatibility
        const allChapters = [...userGuideChapters, ...troubleshootingChapters];
        const accessibleChapterIds: string[] = [];
        
        for (const slug of accessibleSlugs) {
          const chapter = allChapters.find(ch => ch.slug === slug);
          if (chapter?.id) {
            accessibleChapterIds.push(chapter.id);
          } else {
            // Log warning if permission exists but chapter content missing
            console.warn(`⚠️ [HELP CENTER] Permission granted for slug "${slug}" but chapter not found in data files`);
          }
        }

        console.log(`✅ [HELP CENTER] User has access to ${accessibleChapterIds.length} chapters:`, accessibleChapterIds);

        res.json({ accessibleChapters: accessibleChapterIds });
      } catch (error) {
        console.error("Help center chapters fetch error:", error);
        res.status(500).json({ error: "Failed to fetch accessible chapters" });
      }
    },
  );

  // Delete specific user-role assignment
  app.delete(
    "/api/user-roles/:userRoleId",
    tokenRequired,
    userManagementPermissionRequired('delete'),
    async (req, res) => {
      try {
        const userRoleId = parseInt(req.params.userRoleId, 10);

        // Note: User role info lookup would require additional method to get user role by ID
        // For now, we delete directly and log the action
        const success = await storage.deleteUserRoleById(userRoleId);
        if (!success) {
          return res
            .status(404)
            .json({ error: "User role assignment not found" });
        }

        // Log role removal activity
        await logUserActivity(
          req,
          "DELETE_USER_ROLE",
          "USER_MANAGEMENT",
          `Removed role assignment ID: ${userRoleId}`,
          "USER_ROLE",
        );

        res.json({ message: "Role assignment removed successfully" });
      } catch (error) {
        console.error("User role deletion error:", error);
        res.status(500).json({ error: "Failed to remove role assignment" });
      }
    },
  );

  // Roles routes - Updated for new modular permission system
  app.get("/api/userroles", tokenRequired, async (req, res) => {
    try {
      const userEmail = req.user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      const roles = await storage.getRolesForUser(userEmail);

      // Log roles viewing activity
      await logUserActivity(
        req,
        "VIEW_ROLES",
        "ROLE_MANAGEMENT",
        "Role List",
        "DATA",
      );

      res.json(roles);
    } catch (error) {
      console.error("Roles fetch error:", error);
      res.status(500).json({ error: "Failed to fetch roles" });
    }
  });

  app.get("/api/roles", tokenRequired, roleManagementAccessRequired, async (req, res) => {
    try {
      const roles = await storage.getAllRoles();

      // Ensure each role has a computed category if it doesn't already have one
      const rolesWithCategory = roles.map(role => ({
        ...role,
        category: role.category || (role.name === 'Super Admin' ? 'dangerous' : 'info')
      }));

      // Log roles viewing activity
      await logUserActivity(
        req,
        "VIEW_ROLES",
        "ROLE_MANAGEMENT",
        "Role List",
        "DATA",
      );

      res.json(rolesWithCategory);
    } catch (error) {
      console.error("Roles fetch error:", error);
      res.status(500).json({ error: "Failed to fetch roles" });
    }
  });

  // Create new role with modular permissions
  app.post(
    "/api/roles",
    tokenRequired,
    roleManagementPermissionRequired('add'),
    async (req, res) => {
      try {
        const { name, description, permissions } = req.body;

        console.log(
          "Role creation - received permissions:",
          JSON.stringify(permissions, null, 2),
        );

        // SECURITY: Validate role name using schema
        try {
          insertRoleSchema.parse({ name, description });
        } catch (validationError) {
          if (validationError instanceof z.ZodError) {
            const errorMessage = validationError.errors[0]?.message || "Invalid role name";
            return res.status(400).json({ error: errorMessage });
          }
          return res.status(400).json({ error: "Invalid role data" });
        }

        // SECURITY: Strict validation of permissions object to prevent malicious data
        let validatedPermissions;
        try {
          validatedPermissions = rolePermissionsSchema.parse(permissions);
        } catch (validationError) {
          if (validationError instanceof z.ZodError) {
            const errorMessage = validationError.errors[0]?.message || "Invalid permissions data";
            console.error("❌ [SECURITY] Invalid permissions submitted:", validationError.errors);
            return res.status(400).json({ error: `Invalid permissions: ${errorMessage}` });
          }
          return res.status(400).json({ error: "Invalid permissions data" });
        }

        // Validate that at least one file management permission is selected
        if (!Object.values(validatedPermissions.files).some((value: boolean) => value === true)) {
          return res.status(400).json({ error: "At least one file management permission must be selected" });
        }

        // Create the role with validated permissions (prevents injection attacks)
        const role = await storage.createRoleWithPermissions(
          { name, description },
          validatedPermissions,
        );

        await logUserActivity(
          req,
          "CREATE_ROLE",
          "ROLE_MANAGEMENT",
          `Role: ${name}`,
          "ROLE",
        );

        res.status(201).json(role);
      } catch (error: unknown) {
        console.error("Role creation error:", error);
        if (error instanceof Error && error.message?.includes("unique")) {
          res.status(400).json({ error: "Role name already exists" });
        } else {
          res.status(500).json({ error: "Failed to create role" });
        }
      }
    },
  );

  // Update role with modular permissions
  app.put(
    "/api/roles/:id",
    tokenRequired,
    roleManagementPermissionRequired('edit'),
    async (req, res) => {
      try {
        const roleId = parseInt(req.params.id);
        const { name, description, permissions } = req.body;

        // SECURITY: Validate role name using schema
        try {
          insertRoleSchema.parse({ name, description });
        } catch (validationError) {
          if (validationError instanceof z.ZodError) {
            const errorMessage = validationError.errors[0]?.message || "Invalid role name";
            return res.status(400).json({ error: errorMessage });
          }
          return res.status(400).json({ error: "Invalid role data" });
        }

        // SECURITY: Strict validation of permissions object to prevent malicious data
        let validatedPermissions;
        try {
          validatedPermissions = rolePermissionsSchema.parse(permissions);
        } catch (validationError) {
          if (validationError instanceof z.ZodError) {
            const errorMessage = validationError.errors[0]?.message || "Invalid permissions data";
            console.error("❌ [SECURITY] Invalid permissions submitted:", validationError.errors);
            return res.status(400).json({ error: `Invalid permissions: ${errorMessage}` });
          }
          return res.status(400).json({ error: "Invalid permissions data" });
        }

        // Validate that at least one file management permission is selected
        if (!Object.values(validatedPermissions.files).some((value: boolean) => value === true)) {
          return res.status(400).json({ error: "At least one file management permission must be selected" });
        }

    const role = await storage.getRole(roleId);
    if (!role) {
      return res.status(404).json({ error: "Role not found" });
    }

    const category = await storage.computeRoleCategory(validatedPermissions);

    // Update with validated permissions (prevents injection attacks)
    await storage.updateRoleModularPermissions(roleId, validatedPermissions);

    const updatedRole = await storage.updateRole(roleId, { name, description, category });

    await logUserActivity(
      req,
      "UPDATE_ROLE",
      "ROLE_MANAGEMENT",
      `Role: ${name}`,
      "ROLE",
    );

    res.json(updatedRole || role);
      } catch (error) {
        console.error("Role update error:", error);
        res.status(500).json({ error: "Failed to update role" });
      }
    },
  );

  app.get("/api/roles/:id", tokenRequired, roleManagementAccessRequired, async (req, res) => {
    try {
      const roleId = parseInt(req.params.id, 10);
      const role = await storage.getRole(roleId);
      if (!role) {
        return res.status(404).json({ error: "Role not found" });
      }

      // Get permissions from the new modular permission system
      const modularPermissions =
        await storage.getRoleModularPermissions(roleId);
      
      console.log(`[DEBUG] GET /api/roles/${roleId} - Raw modularPermissions.pgp_key_decrypt:`, modularPermissions?.pgp_key_decrypt);
      console.log(`[DEBUG] GET /api/roles/${roleId} - Raw modularPermissions.co_view:`, modularPermissions?.co_view);
      console.log(`[DEBUG] GET /api/roles/${roleId} - Raw modularPermissions.co_upload:`, modularPermissions?.co_upload);
      console.log(`[DEBUG] GET /api/roles/${roleId} - Raw modularPermissions.co_commit:`, modularPermissions?.co_commit);
      console.log(`[DEBUG] GET /api/roles/${roleId} - Raw modularPermissions.co_delete:`, modularPermissions?.co_delete);

      let permissions;
      if (modularPermissions) {
        // Use data from new modular system
        const userPerms = (typeof modularPermissions.user_permissions === 'object' && modularPermissions.user_permissions) 
          ? modularPermissions.user_permissions as any : {};
        permissions = {
          userManagement: {
            add: userPerms.add || false,
            edit: userPerms.edit || false,
            delete: userPerms.delete || false,
            view: userPerms.view || false,
            enableDisable: userPerms.enableDisable || false,
          },
          roleManagement: {
            add: modularPermissions.role_add || false,
            edit: modularPermissions.role_edit || false,
            delete: modularPermissions.role_delete || false,
            view: modularPermissions.role_view || false,
          },
          organizations: {
            add: modularPermissions.org_add || false,
            edit: modularPermissions.org_edit || false,
            delete: modularPermissions.org_delete || false,
            view: modularPermissions.org_view || false,
          },
          storage: {
            addStorageContainer:
              modularPermissions.storage_add_storage_container || false,
            addContainer: modularPermissions.storage_add_container || false,
            view: modularPermissions.storage_view || false,
            delete: modularPermissions.storage_delete || false,
            dataProtection: modularPermissions.storage_data_protection || false,
            dataLifecycle: modularPermissions.storage_data_lifecycle || false,
            inventoryView: modularPermissions.storage_inventory_view || false,
            inventoryConfigure: modularPermissions.storage_inventory_configure || false,
          },
          files: {
            ...DEFAULT_FILE_MGMT_PERMISSIONS,
            ...(modularPermissions.file_permissions || {}),
          },
          activityLogs: {
            view: modularPermissions.activity_view || false,
          },
          aiAgentMgmt: {
            add: modularPermissions.ai_agent_add || false,
            edit: modularPermissions.ai_agent_edit || false,
            delete: modularPermissions.ai_agent_delete || false,
            view: modularPermissions.ai_agent_view || false,
          },
          pgpKeyMgmt: {
            view: modularPermissions.pgp_key_view || false,
            generate: modularPermissions.pgp_key_generate || false,
            delete: modularPermissions.pgp_key_delete || false,
            copy: modularPermissions.pgp_key_copy || false,
            decrypt: modularPermissions.pgp_key_decrypt || false,
          },
          helpCenter: {
            chapterWiseHelp: modularPermissions.help_chapter_wise_help || {},
            api: modularPermissions.help_api || {},
            envVariable: modularPermissions.help_env_variable || {},
            troubleshooting: modularPermissions.help_troubleshooting || {},
          },
          siemMgmt: {
            install: modularPermissions.siem_install || false,
            delete: modularPermissions.siem_delete || false,
            enableDisable: modularPermissions.siem_enable_disable || false,
            view: modularPermissions.siem_view || false,
            incidentsView: modularPermissions.siem_incidents_view || false,
          },
          foundryMgmt: {
            add: modularPermissions.foundry_add || false,
            edit: modularPermissions.foundry_edit || false,
            delete: modularPermissions.foundry_delete || false,
            view: modularPermissions.foundry_view || false,
            tabWizard: modularPermissions.foundry_tab_wizard || false,
            tabResources: modularPermissions.foundry_tab_resources || false,
            tabFoundryAction: modularPermissions.foundry_tab_foundry_action || false,
            tabChatPlayground: modularPermissions.foundry_tab_chat_playground || false,
            tabResourceSets: modularPermissions.foundry_tab_resource_sets || false,
            tabContentUnderstanding: modularPermissions.foundry_tab_content_understanding || false,
          },
          contentUnderstanding: {
            view: modularPermissions.cu_view || false,
            runAnalysis: modularPermissions.cu_run_analysis || false,
            saveAnalysis: modularPermissions.cu_save_analysis || false,
            deleteAnalysis: modularPermissions.cu_delete_analysis || false,
            menuVisibility: modularPermissions.cu_menu_visibility || false,
          },
          documentTranslation: {
            view: modularPermissions.dt_view || false,
            runTranslation: modularPermissions.dt_run_translation || false,
            deleteTranslation: modularPermissions.dt_delete_translation || false,
          },
          sftpMgmt: {
            view: modularPermissions.sftp_view || false,
            create: modularPermissions.sftp_create || false,
            update: modularPermissions.sftp_update || false,
            disable: modularPermissions.sftp_disable || false,
            delete: modularPermissions.sftp_delete || false,
            mapUser: modularPermissions.sftp_map_user || false,
            viewSelfAccess: modularPermissions.sftp_view_self_access || false,
            rotateSshSelf: modularPermissions.sftp_rotate_ssh_self || false,
            rotatePasswordSelf: modularPermissions.sftp_rotate_password_self || false,
          },
          customerOnboarding: {
            view: modularPermissions.co_view || false,
            upload: modularPermissions.co_upload || false,
            commit: modularPermissions.co_commit || false,
            delete: modularPermissions.co_delete || false,
          },
          transferReports: {
            view: modularPermissions.tr_view || false,
            viewDetails: modularPermissions.tr_view_details || false,
            download: modularPermissions.tr_download || false,
          },
          eval: {
            view: modularPermissions.ev_view || false,
            run: modularPermissions.ev_run || false,
            review: modularPermissions.ev_review || false,
            finalize: modularPermissions.ev_finalize || false,
            menuVisibility: modularPermissions.ev_menu_visibility || false,
          },
        };
      } else {
        // Fallback to default permissions if no modular permissions found
        permissions = {
          userManagement: {
            add: false,
            edit: false,
            delete: false,
            view: false,
            enableDisable: false,
          },
          roleManagement: {
            add: false,
            edit: false,
            delete: false,
            view: false,
          },
          organizations: {
            add: false,
            edit: false,
            delete: false,
            view: false,
          },
          storage: {
            addStorageContainer: false,
            addContainer: false,
            view: false,
            delete: false,
            dataProtection: false,
            dataLifecycle: false,
            inventoryView: false,
            inventoryConfigure: false,
          },
          files: {
            uploadFile: false,
            uploadFolder: false,
            downloadFile: false,
            downloadFolder: false,
            viewFiles: false,
            createFolder: false,
            deleteFilesAndFolders: false,
          },
          activityLogs: { view: false },
          aiAgentMgmt: { add: false, edit: false, delete: false, view: false },
          pgpKeyMgmt: { view: false, generate: false, delete: false, copy: false, decrypt: false },
          helpCenter: {
            chapterWiseHelp: {},
            api: {},
            envVariable: {},
            troubleshooting: {},
          },
          siemMgmt: { install: false, delete: false, enableDisable: false, view: false, incidentsView: false },
          foundryMgmt: { add: false, edit: false, delete: false, view: false, tabWizard: false, tabResources: false, tabFoundryAction: false, tabChatPlayground: false, tabResourceSets: false, tabContentUnderstanding: false },
          contentUnderstanding: { view: false, runAnalysis: false, saveAnalysis: false, deleteAnalysis: false, menuVisibility: false },
          documentTranslation: { view: false, runTranslation: false, deleteTranslation: false },
          sftpMgmt: { view: false, create: false, update: false, disable: false, delete: false, mapUser: false, viewSelfAccess: false, rotateSshSelf: false, rotatePasswordSelf: false },
          customerOnboarding: { view: false, upload: false, commit: false, delete: false },
          transferReports: { view: false, viewDetails: false, download: false },
          eval: { view: false, run: false, review: false, finalize: false, menuVisibility: false },
        };
      }

      const roleWithPermissions = {
        ...role,
        permissions,
      };

      console.log(`[DEBUG] GET /api/roles/${roleId} - Final pgpKeyMgmt permissions:`, JSON.stringify(permissions.pgpKeyMgmt));
      console.log(`[DEBUG] GET /api/roles/${roleId} - customerOnboarding permissions:`, JSON.stringify(permissions.customerOnboarding));
      res.json(roleWithPermissions);
    } catch (error) {
      console.error("Role fetch error:", error);
      res.status(500).json({ error: "Failed to fetch role" });
    }
  });

  app.post(
    "/api/roles",
    tokenRequired,
    permissionRequired("ROLE_MANAGEMENT"),
    async (req, res) => {
      try {
        const { name, description } = req.body;
        if (!name) {
          return res.status(400).json({ error: "Role name is required" });
        }

        const role = await storage.createRole({ name, description });

        // Log role creation activity
        await logUserActivity(
          req,
          "CREATE_ROLE",
          "ROLE_MANAGEMENT",
          `Role: ${name}`,
          "ROLE",
        );

        res.status(201).json(role);
      } catch (error) {
        console.error("Role creation error:", error);
        res.status(500).json({ error: "Failed to create role" });
      }
    },
  );

  // Delete role endpoint
  app.delete(
    "/api/roles/:id",
    tokenRequired,
    roleManagementPermissionRequired('delete'),
    async (req, res) => {
      try {
        const roleId = parseInt(req.params.id);

        const role = await storage.getRole(roleId);
        if (!role) {
          return res.status(404).json({ error: "Role not found" });
        }

        const success = await storage.deleteRole(roleId);
        if (!success) {
          return res.status(500).json({ error: "Failed to delete role" });
        }

        await logUserActivity(
          req,
          "DELETE_ROLE",
          "ROLE_MANAGEMENT",
          `Role: ${role.name}`,
          "ROLE",
        );

        res.json({ success: true });
      } catch (error: any) {
        console.error("Role deletion error:", error);

        // Check for protection-related errors (last role, assigned to enabled users)
        if (
          error?.message?.includes("Cannot delete the last role") ||
          error?.message?.includes("Cannot delete role that is assigned to")
        ) {
          return res.status(400).json({ error: error.message });
        }

        // For any other errors, provide detailed message to user
        const errorMessage = error?.message || "Failed to delete role";
        res.status(500).json({ 
          error: `Failed to delete role: ${errorMessage}` 
        });
      }
    },
  );

    // Organizations routes - List accessible with ANY organization permission
    app.get("/api/organizations", tokenRequired, organizationManagementAccessRequired, async (req, res) => {
      try {
        const organizations = await storage.getAllOrganizations();
  
        // Log organizations viewing activity
        await logUserActivity(
          req,
          "VIEW_ORGANIZATIONS",
          "ORGANIZATION_MANAGEMENT",
          "Organization List",
          "DATA",
        );
  
        res.json(organizations);
      } catch (error) {
        console.error("Organizations fetch error:", error);
        res.status(500).json({ error: "Failed to fetch organizations" });
      }
    });

  // Organizations routes
  app.get("/api/userorganizations", tokenRequired, async (req, res) => {
    console.log(`🔍 [ORGANIZATIONS] Request received from user: ${(req as any).user?.email}`);
    console.log(`🔍 [ORGANIZATIONS] User object:`, (req as any).user);
    console.log(`🔍 [ORGANIZATIONS] DB User:`, (req as any).dbUser);
    try {
      const userEmail = req.user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      const organizations = await storage.getOrganizationsForUser(userEmail);

      // Log organizations viewing activity
      await logUserActivity(
        req,
        "VIEW_ORGANIZATIONS",
        "ORGANIZATION_MANAGEMENT",
        "Organization List",
        "DATA",
      );

      res.json(organizations);
    } catch (error) {
      console.error("Organizations fetch error:", error);
      res.status(500).json({ error: "Failed to fetch organizations" });
    }
  });

  app.post(
    "/api/organizations",
    tokenRequired,
    organizationManagementPermissionRequired('add'),
    async (req, res) => {
      try {
        const { name, description, geoFencingEnabled, geoEnforcementMode, allowedCountries } = req.body;
        if (!name) {
          return res
            .status(400)
            .json({ error: "Organization name is required" });
        }

        // Security: Validate organization name length
        const nameValidation = validateTextField(name, MAX_LENGTHS.ORGANIZATION_NAME, 'Organization name');
        if (!nameValidation.valid) {
          return res.status(400).json({ error: nameValidation.error });
        }

        // Security: Validate description length if provided
        if (description) {
          const descValidation = validateTextField(description, MAX_LENGTHS.DESCRIPTION, 'Description');
          if (!descValidation.valid) {
            return res.status(400).json({ error: descValidation.error });
          }
        }

        // Validate geo-fencing configuration
        const geoEnabled = geoFencingEnabled === true;
        let countryCodes: string[] = [];
        
        // Validate enforcement mode
        const validEnforcementModes = ['strict', 'audit'];
        const enforcementMode = validEnforcementModes.includes(geoEnforcementMode) ? geoEnforcementMode : 'strict';
        
        if (geoEnabled) {
          if (!Array.isArray(allowedCountries) || allowedCountries.length === 0) {
            return res.status(400).json({ error: "At least one allowed country is required when geo-fencing is enabled" });
          }
          
          // Normalize country codes to uppercase
          const normalizedCodes = allowedCountries.map((code: string) => code.toUpperCase());
          
          // Validate country codes
          const { validateCountryCodes } = await import("@shared/countries");
          const validation = validateCountryCodes(normalizedCodes);
          if (!validation.valid) {
            return res.status(400).json({ 
              error: `Invalid country codes: ${validation.invalidCodes.join(", ")}` 
            });
          }
          countryCodes = normalizedCodes;
        }

        const organization = await storage.createOrganization({
          name: nameValidation.sanitized!,
          description: description ? description.trim() : description,
          geoFencingEnabled: geoEnabled,
          geoEnforcementMode: enforcementMode,
          allowedCountries: countryCodes,
        });

        // Log organization creation activity
        await logUserActivity(
          req,
          "CREATE_ORGANIZATION",
          "ORGANIZATION_MANAGEMENT",
          `Organization: ${name}`,
          "ORGANIZATION",
        );

        res.status(201).json(organization);
      } catch (error) {
        console.error("Organization creation error:", error);
        res.status(500).json({ error: "Failed to create organization" });
      }
    },
  );

  app.put(
    "/api/organizations/:id",
    tokenRequired,
    organizationManagementPermissionRequired('edit'),
    async (req, res) => {
      try {
        // Security: Validate organization ID
        const organizationId = validateIntegerId(req.params.id);
        if (organizationId === null) {
          return res.status(400).json({ error: "Invalid organization ID: must be a positive integer" });
        }

        const { name, description, geoFencingEnabled, geoEnforcementMode, allowedCountries } = req.body;

        if (!name) {
          return res
            .status(400)
            .json({ error: "Organization name is required" });
        }

        // Security: Validate organization name length
        const nameValidation = validateTextField(name, MAX_LENGTHS.ORGANIZATION_NAME, 'Organization name');
        if (!nameValidation.valid) {
          return res.status(400).json({ error: nameValidation.error });
        }

        // Security: Validate description length if provided
        if (description) {
          const descValidation = validateTextField(description, MAX_LENGTHS.DESCRIPTION, 'Description');
          if (!descValidation.valid) {
            return res.status(400).json({ error: descValidation.error });
          }
        }

        // Get current organization for geo-fencing change logging
        const currentOrg = await storage.getOrganization(organizationId);
        if (!currentOrg) {
          return res.status(404).json({ error: "Organization not found" });
        }

        // Validate geo-fencing configuration
        const geoEnabled = geoFencingEnabled === true;
        let countryCodes: string[] = [];
        
        // Validate enforcement mode
        const validEnforcementModes = ['strict', 'audit'];
        const enforcementMode = validEnforcementModes.includes(geoEnforcementMode) ? geoEnforcementMode : 'strict';
        
        if (geoEnabled) {
          if (!Array.isArray(allowedCountries) || allowedCountries.length === 0) {
            return res.status(400).json({ error: "At least one allowed country is required when geo-fencing is enabled" });
          }
          
          // Normalize country codes to uppercase
          const normalizedCodes = allowedCountries.map((code: string) => code.toUpperCase());
          
          // Validate country codes
          const { validateCountryCodes } = await import("@shared/countries");
          const validation = validateCountryCodes(normalizedCodes);
          if (!validation.valid) {
            return res.status(400).json({ 
              error: `Invalid country codes: ${validation.invalidCodes.join(", ")}` 
            });
          }
          countryCodes = normalizedCodes;
        }

        const organization = await storage.updateOrganization(organizationId, {
          name: nameValidation.sanitized!,
          description: description ? description.trim() : description,
          geoFencingEnabled: geoEnabled,
          geoEnforcementMode: enforcementMode,
          allowedCountries: countryCodes,
        });

        if (!organization) {
          return res.status(404).json({ error: "Organization not found" });
        }

        // Log organization update activity
        await logUserActivity(
          req,
          "UPDATE_ORGANIZATION",
          "ORGANIZATION_MANAGEMENT",
          `Organization: ${name}`,
          "ORGANIZATION",
          { organizationId },
        );

        // Log geo-fencing changes separately if they changed
        const geoFencingChanged = currentOrg.geoFencingEnabled !== geoEnabled || 
          JSON.stringify(currentOrg.allowedCountries || []) !== JSON.stringify(countryCodes);
        
        if (geoFencingChanged) {
          await logUserActivity(
            req,
            "UPDATE_GEO_FENCING",
            "ORGANIZATION_MANAGEMENT",
            `Organization: ${name} - Geo-fencing ${geoEnabled ? 'enabled' : 'disabled'}${geoEnabled ? ` for countries: ${countryCodes.join(', ')}` : ''} | ${JSON.stringify({ previousSettings: { geoFencingEnabled: currentOrg.geoFencingEnabled, allowedCountries: currentOrg.allowedCountries || [] }, newSettings: { geoFencingEnabled: geoEnabled, allowedCountries: countryCodes } })}`,
            "ORGANIZATION",
            { organizationId },
          );
        }

        res.json(organization);
      } catch (error) {
        console.error("Organization update error:", error);
        res.status(500).json({ error: "Failed to update organization" });
      }
    },
  );

  app.delete(
    "/api/organizations/:id",
    tokenRequired,
    organizationManagementPermissionRequired('delete'),
    async (req, res) => {
      try {
        const organizationId = parseInt(req.params.id, 10);

        // Get organization details before deletion for logging
        const organization = await storage.getOrganization(organizationId);
        if (!organization) {
          return res.status(404).json({ error: "Organization not found" });
        }

        const deleted = await storage.deleteOrganization(organizationId);

        if (!deleted) {
          return res.status(404).json({ error: "Organization not found" });
        }

        // Log organization deletion activity
        await logUserActivity(
          req,
          "DELETE_ORGANIZATION",
          "ORGANIZATION_MANAGEMENT",
          `Organization: ${organization.name}`,
          "ORGANIZATION",
          { organizationId },
        );

        res.json({
          success: true,
          message: "Organization deleted successfully",
        });
      } catch (error: any) {
        console.error("Organization deletion error:", error);

        // Check for validation errors from storage layer
        if (error?.message?.includes("Cannot delete")) {
          return res.status(400).json({ error: error.message });
        }

        // Check for foreign key constraint violations (PostgreSQL error code 23503)
        if (error?.code === '23503') {
          // Determine which resource is blocking deletion based on constraint name
          if (error?.constraint?.includes('ai_agents')) {
            return res.status(400).json({ 
              error: "Cannot delete organization because it has AI agents configured. Please remove all AI agents first." 
            });
          } else if (error?.constraint?.includes('storage_accounts')) {
            return res.status(400).json({ 
              error: "Cannot delete organization because it has storage accounts configured. Please remove all storage accounts first." 
            });
          } else if (error?.constraint?.includes('user_roles')) {
            return res.status(400).json({ 
              error: "Cannot delete organization because it has users assigned. Please remove all users first." 
            });
          } else {
            // Generic foreign key error
            return res.status(400).json({ 
              error: "Cannot delete organization because it has associated resources. Please remove all related data first." 
            });
          }
        }

        res.status(500).json({ error: "Failed to delete organization" });
      }
    },
  );

  // Note: Traditional permissions endpoint removed - using modular permission system

  // User activities routes
  app.get("/api/user-activities", tokenRequired, organizationAccessRequired, specificPermissionRequired('ACTIVITY_LOGS'), async (req, res) => {
    try {
      // 🔒 Organization ID is validated and scoped by organizationAccessRequired middleware
      const organizationId = (req as any).validatedOrganizationId;
      
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization ID is required' });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      // Parse filter parameters
      const filters = {
        search: req.query.search as string | undefined,
        action: req.query.action as string | undefined,
        category: req.query.category as string | undefined,
        userEmail: req.query.userEmail as string | undefined,
      };

      console.log(`🔒 [ACTIVITY_LOGS] Fetching activities for organization: ${organizationId} (limit: ${limit}, offset: ${offset}, filters: ${JSON.stringify(filters)})`);
      
      let activities;
      let totalCount = 0;
      if (dbLoggingEnabled) {
        activities = await storage.getUserActivities(organizationId, limit, offset, filters);
        totalCount = await storage.getUserActivitiesCount(organizationId, filters);
      } else {
        const result = await AzureMonitorService.getUserActivities(organizationId, limit, offset, filters);
        activities = result.activities;
        totalCount = result.totalCount;
      }

      // Map activities to frontend interface
      const formattedActivities = (activities || []).map((activity: any) => ({
        id: activity.id,
        userId: activity.userId,
        userName: activity.userName,
        email: activity.email,
        ipAddress: activity.ipAddress,
        action: activity.action,
        actionCategory: activity.actionCategory,
        resource: activity.resource,
        resourceType: activity.resourceType,
        details: activity.details,
        actionTime:
          activity.actionTime instanceof Date ? activity.actionTime.toISOString() : 
          activity.createdAt instanceof Date ? activity.createdAt.toISOString() : 
          (typeof activity.actionTime === 'string' ? activity.actionTime : new Date().toISOString()),
        loginTime: activity.loginTime instanceof Date ? activity.loginTime.toISOString() : activity.loginTime,
        logoutTime: activity.logoutTime instanceof Date ? activity.logoutTime.toISOString() : activity.logoutTime,
        sessionId: activity.sessionId,
        userAgent: activity.userAgent,
      }));

      res.json({
        activities: formattedActivities,
        total: totalCount,
        limit,
        offset
      });
    } catch (error) {
      console.error("Activities fetch error:", error);
      res.status(500).json({ error: "Failed to fetch user activities" });
    }
  });

  // Cross-organization activity logs for authenticated user (actor-centric view)
  // Note: No longer uses specificPermissionRequired middleware since we need per-org permission filtering
  app.get("/api/user-activities/actor", tokenRequired, async (req, res) => {
    try {
      const userEmail = req.user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      // Parse filter parameters
      const filters = {
        search: req.query.search as string | undefined,
        action: req.query.action as string | undefined,
        category: req.query.category as string | undefined,
      };

      // Get only organizations where user has ACTIVITY_LOGS.view permission
      const permittedOrgIds = await storage.getOrganizationIdsWithActivityLogsPermission(userEmail);
      
      if (permittedOrgIds.length === 0) {
        console.log(`🔒 [ACTIVITY_LOGS] User ${userEmail} has no organizations with ACTIVITY_LOGS permission`);
        return res.json([]);
      }

      console.log(`🔒 [ACTIVITY_LOGS] Fetching cross-org activities for actor: ${userEmail} in permitted orgs [${permittedOrgIds.join(', ')}] (limit: ${limit}, offset: ${offset}, filters: ${JSON.stringify(filters)})`);
      
      let activities;
      let totalCount = 0;
      if (dbLoggingEnabled) {
        activities = await storage.getUserActivitiesForActor(userEmail, permittedOrgIds, limit, offset, filters);
        // For DB logging, we can easily get the total count
        totalCount = await storage.getUserActivitiesCountForActor(userEmail, permittedOrgIds, filters);
      } else {
        const result = await AzureMonitorService.getUserActivitiesForActor(userEmail, permittedOrgIds, limit, offset, filters);
        activities = result.activities;
        totalCount = result.totalCount;
      }

      // Map database fields to frontend interface with organization info
      const formattedActivities = (activities || []).map((activity: any) => ({
        id: activity.id,
        userId: activity.userId,
        userName: activity.userName,
        email: activity.email,
        ipAddress: activity.ipAddress,
        action: activity.action,
        actionCategory: activity.actionCategory,
        resource: activity.resource,
        resourceType: activity.resourceType,
        details: activity.details,
        actionTime:
          activity.actionTime instanceof Date ? activity.actionTime.toISOString() : 
          activity.createdAt instanceof Date ? activity.createdAt.toISOString() : 
          (typeof activity.actionTime === 'string' ? activity.actionTime : new Date().toISOString()),
        loginTime: activity.loginTime instanceof Date ? activity.loginTime.toISOString() : activity.loginTime,
        logoutTime: activity.logoutTime instanceof Date ? activity.logoutTime.toISOString() : activity.logoutTime,
        sessionId: activity.sessionId,
        userAgent: activity.userAgent,
        organizationId: activity.organizationId,
        organizationName: activity.organizationName,
      }));

      res.json({
        activities: formattedActivities,
        total: totalCount,
        limit,
        offset
      });
    } catch (error) {
      console.error("Actor activities fetch error:", error);
      res.status(500).json({ error: "Failed to fetch user activities" });
    }
  });

  // Storage accounts routes
  app.get("/api/storage-accounts", tokenRequired, async (req, res) => {
    try {
      const userEmail = req.user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      // Get user's organizations to filter by
      const userOrgIds = await storage.getUserOrganizationIds(userEmail);
      const accounts = await storage.getStorageAccountsForOrganizations(userOrgIds, 'blob');
      
      const result = accounts.map((acc) => ({
        id: acc.id,
        name: acc.name,
        location: acc.location || "East US",
        container: acc.containerName,
        resourceGroupName: acc.resourceGroupName,
        organizationId: acc.organizationId,
        organizationName: acc.organizationName,
        createdAt: acc.createdAt?.toISOString() || new Date().toISOString(),
      }));

      // Log storage accounts viewing activity
      await logUserActivity(
        req,
        "VIEW_STORAGE_ACCOUNTS",
        "STORAGE_MANAGEMENT",
        "Storage Account List",
        "DATA",
      );

      res.json(result);
    } catch (error: any) {
      console.error("Storage accounts fetch error:", error);
      res.status(500).json({ error: "Failed to fetch storage accounts" });
    }
  });

  // Get ALL storage accounts (both blob and ADLS) for dropdowns in ADLS provisioning
  app.get("/api/storage-accounts/all", tokenRequired, async (req, res) => {
    try {
      const userEmail = req.user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      // Get user's organizations to filter by
      const userOrgIds = await storage.getUserOrganizationIds(userEmail);
      // Get ALL storage accounts (no kind filter) for container creation in existing accounts
      const accounts = await storage.getStorageAccountsForOrganizations(userOrgIds);
      
      const result = accounts.map((acc) => ({
        id: acc.id,
        name: acc.name,
        location: acc.location || "East US",
        container: acc.containerName,
        resourceGroupName: acc.resourceGroupName,
        organizationId: acc.organizationId,
        organizationName: acc.organizationName,
        kind: acc.kind,
        createdAt: acc.createdAt?.toISOString() || new Date().toISOString(),
      }));

      // Log all storage accounts viewing activity
      await logUserActivity(
        req,
        "VIEW_ALL_STORAGE_ACCOUNTS",
        "STORAGE_MANAGEMENT",
        "All Storage Accounts List",
        "DATA",
      );

      res.json(result);
    } catch (error: any) {
      console.error("All storage accounts fetch error:", error);
      res.status(500).json({ error: "Failed to fetch all storage accounts" });
    }
  });

  // Get ADLS storage accounts 
  app.get("/api/adls-storage-accounts", tokenRequired, async (req, res) => {
    try {
      const userEmail = req.user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      // Get user's organizations to filter by
      const userOrgIds = await storage.getUserOrganizationIds(userEmail);
      const accounts = await storage.getStorageAccountsForOrganizations(userOrgIds, 'adls');
      
      // Fetch SFTP status for each account if Azure credentials are available
      const subscriptionId = process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || process.env.AZURE_SUBSCRIPTION_ID;
      const azureCredential = subscriptionId ? new DefaultAzureCredential() : null;
      
      const result = await Promise.all(accounts.map(async (acc) => {
        let sftpEnabled = false;
        
        // Try to fetch SFTP status from Azure if credentials are available
        if (azureCredential && subscriptionId && acc.resourceGroupName) {
          try {
            const storageClient = new StorageManagementClient(azureCredential, subscriptionId);
            const azureStorageAccount = await storageClient.storageAccounts.getProperties(
              acc.resourceGroupName,
              acc.name
            );
            sftpEnabled = azureStorageAccount.isSftpEnabled || false;
          } catch (error) {
            // Silently fail - account might not exist in Azure or credentials might be invalid
            console.log(`Could not fetch SFTP status for ${acc.name}:`, error instanceof Error ? error.message : 'Unknown error');
          }
        }
        
        return {
          id: acc.id,
          name: acc.name,
          location: acc.location || "East US",
          container: acc.containerName,
          resourceGroupName: acc.resourceGroupName,
          organizationId: acc.organizationId,
          organizationName: acc.organizationName,
          createdAt: acc.createdAt?.toISOString() || new Date().toISOString(),
          sftpEnabled: sftpEnabled,
        };
      }));

      // Log ADLS storage accounts viewing activity
      await logUserActivity(
        req,
        "VIEW_ADLS_STORAGE_ACCOUNTS",
        "STORAGE_MANAGEMENT",
        "ADLS Storage Account List",
        "DATA",
      );

      res.json(result);
    } catch (error: any) {
      console.error("ADLS storage accounts fetch error:", error);
      res.status(500).json({ error: "Failed to fetch ADLS storage accounts" });
    }
  });

  // Delete ADLS storage account
  app.delete(
    "/api/adls-storage-accounts/:id",
    tokenRequired,
    storageManagementPermissionRequired('delete'),
    async (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);

        // Get the ADLS account details before deletion
        const allAccounts = await storage.getAllStorageAccounts('adls');
        const accountToDelete = allAccounts.find((acc) => acc.id === id);

        if (!accountToDelete) {
          return res.status(404).json({ error: "ADLS storage account not found" });
        }

        // SECURITY: Validate storage account name before Azure SDK URL construction
        const accountNameValidation = validateStorageAccountName(accountToDelete.name);
        if (!accountNameValidation.valid) {
          return res.status(500).json({
            error: "Storage account validation failed",
            details: accountNameValidation.error,
            field: 'storageAccountName'
          });
        }
        const validatedAccountName = accountNameValidation.sanitized!;

        // Check if Azure credentials are available
        const subscriptionId = process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || process.env.AZURE_SUBSCRIPTION_ID;
        if (!subscriptionId) {
          return res.status(500).json({
            error: "Azure subscription not configured. Please check ZAPPER_AZURE_SUBSCRIPTION_ID or AZURE_SUBSCRIPTION_ID environment variable.",
          });
        }

        // Validate resource group exists
        if (!accountToDelete.resourceGroupName) {
          return res.status(400).json({
            error: "Cannot delete storage account: missing resource group information",
            details: "Storage account does not have resource group data. Azure resources cannot be removed safely.",
          });
        }

        const azureCredential = new DefaultAzureCredential();
        let filesystemDeleted = false;
        let storageAccountDeleted = false;

        // Delete the Data Lake filesystem/container first
        try {
          const dataLakeService = new DataLakeServiceClient(
            `https://${validatedAccountName}.dfs.core.windows.net`,
            azureCredential,
          );
          const fsClient = dataLakeService.getFileSystemClient(
            accountToDelete.containerName,
          );
          await fsClient.delete();
          filesystemDeleted = true;
          console.log(`✅ Deleted ADLS filesystem: ${accountToDelete.containerName}`);
        } catch (containerError: any) {
          console.error(
            `❌ Failed to delete ADLS filesystem ${accountToDelete.containerName}:`,
            containerError,
          );
          return res.status(500).json({
            error: "Failed to delete Azure filesystem",
            details: containerError.message,
            azureResource: `${accountToDelete.name}/${accountToDelete.containerName}`,
            suggestion: "Please verify Azure permissions and try again, or manually delete the filesystem from Azure portal",
          });
        }

        // Check if there are other containers for this storage account
        const otherContainers = allAccounts.filter(
          (acc) => acc.name === accountToDelete.name && acc.id !== id,
        );

        // If no other containers exist, delete the entire Azure storage account
        if (otherContainers.length === 0) {
          // Clean up Event Grid resources before deleting storage account (HNS mode only)
          if (isHNSEnabled()) {
            console.log(`[EVENT GRID] Last container deleted, cleaning up Event Grid resources for ${accountToDelete.name}`);
            
            try {
              const topics = await listEventGridTopicsForStorageAccount(
                subscriptionId,
                accountToDelete.resourceGroupName,
                accountToDelete.name
              );

              for (const topic of topics) {
                await deleteEventGridTopic(subscriptionId, accountToDelete.resourceGroupName, topic.name);
              }

              console.log(`[EVENT GRID] Successfully cleaned up ${topics.length} Event Grid topic(s) for ${accountToDelete.name}`);
            } catch (eventGridError: any) {
              console.error(`[EVENT GRID] Cleanup error for ${accountToDelete.name}:`, eventGridError.message);
              // Don't fail the deletion - Event Grid cleanup errors are not critical
            }
          }

          // Clean up Key Vault access policy for storage account's managed identity (CMK cleanup)
          const keyVaultUrl = process.env.KEY_VAULT_URL;
          if (keyVaultUrl) {
            console.log(`[KEY VAULT] Cleaning up access policy for storage account: ${accountToDelete.name}`);
            
            try {
              // Get storage account properties to retrieve managed identity
              const storageClientForIdentity = new StorageManagementClient(
                azureCredential,
                subscriptionId,
              );
              const storageAccountProps = await storageClientForIdentity.storageAccounts.getProperties(
                accountToDelete.resourceGroupName,
                accountToDelete.name,
              );
              
              const identityPrincipalId = storageAccountProps.identity?.principalId;
              
              if (identityPrincipalId) {
                // Extract Key Vault name from URL
                const keyVaultName = keyVaultUrl.replace(/^https?:\/\//, '').replace(/\.vault\.azure\.net\/?.*$/, '');
                const kvResourceGroup = process.env.ZAPPER_AZURE_RESOURCE_GROUP || process.env.AZURE_RESOURCE_GROUP || accountToDelete.resourceGroupName;
                const tenantId = process.env.AZURE_TENANT_ID || storageAccountProps.identity?.tenantId;
                
                if (tenantId && kvResourceGroup) {
                  const { KeyVaultManagementClient } = await import("@azure/arm-keyvault");
                  const kvManagementClient = new KeyVaultManagementClient(azureCredential, subscriptionId);
                  
                  // Use vaults.createOrUpdate for reliable access policy removal
                  // updateAccessPolicy with "replace" or "remove" is unreliable - Azure may return success without actually removing
                  console.log(`[KEY VAULT] Using vaults.createOrUpdate pattern to remove policy for objectId: ${identityPrincipalId}`);
                  
                  // Step 1: Get current vault with ALL properties (not just access policies)
                  const vault = await kvManagementClient.vaults.get(kvResourceGroup, keyVaultName);
                  
                  if (!vault.properties) {
                    console.error(`[KEY VAULT] ❌ Failed to get vault properties for ${keyVaultName}`);
                  } else {
                    const currentPolicies = vault.properties.accessPolicies || [];
                    console.log(`[KEY VAULT] Found ${currentPolicies.length} existing access policies`);
                    
                    // Step 2: Filter out the policy for this storage account's managed identity
                    const policyToRemove = currentPolicies.find(p => p.objectId === identityPrincipalId);
                    
                    if (policyToRemove) {
                      const filteredPolicies = currentPolicies.filter(p => p.objectId !== identityPrincipalId);
                      
                      console.log(`[KEY VAULT] Removing policy for objectId ${identityPrincipalId}, ${filteredPolicies.length} policies will remain`);
                      
                      // Step 3: Deep-clone policies to plain JSON objects to avoid SDK circular reference issues
                      const plainPolicies = filteredPolicies.map(p => {
                        const policy: any = {
                          tenantId: String(p.tenantId || ''),
                          objectId: String(p.objectId || ''),
                          permissions: {
                            keys: Array.isArray(p.permissions?.keys) ? [...p.permissions.keys] : [],
                            secrets: Array.isArray(p.permissions?.secrets) ? [...p.permissions.secrets] : [],
                            certificates: Array.isArray(p.permissions?.certificates) ? [...p.permissions.certificates] : [],
                            storage: Array.isArray(p.permissions?.storage) ? [...p.permissions.storage] : [],
                          },
                        };
                        if (p.applicationId) {
                          policy.applicationId = String(p.applicationId);
                        }
                        return policy;
                      });
                      
                      // Step 4: Use createOrUpdate to update the entire vault configuration
                      // This is more reliable than updateAccessPolicy for removing policies
                      // IMPORTANT: Deep clone entire vault config to preserve ALL properties
                      console.log(`[KEY VAULT] Updating vault with ${plainPolicies.length} policies using beginCreateOrUpdateAndWait`);
                      
                      // Deep clone the entire vault object to avoid circular references and preserve ALL properties
                      // This ensures we don't accidentally reset any security/network/private endpoint settings
                      const clonedProperties: any = JSON.parse(JSON.stringify(vault.properties));
                      
                      // Override only the accessPolicies with our filtered list
                      clonedProperties.accessPolicies = plainPolicies;
                      
                      // Ensure required properties are present (SKU is required)
                      if (!clonedProperties.sku) {
                        clonedProperties.sku = { family: "A", name: "standard" };
                      }
                      
                      // Build update params preserving ALL vault settings
                      const updateParams: any = {
                        location: vault.location!,
                        properties: clonedProperties,
                      };
                      
                      // Preserve all top-level properties
                      if (vault.tags) {
                        updateParams.tags = JSON.parse(JSON.stringify(vault.tags));
                      }
                      if (vault.identity) {
                        updateParams.identity = JSON.parse(JSON.stringify(vault.identity));
                      }
                      
                      await kvManagementClient.vaults.beginCreateOrUpdateAndWait(
                        kvResourceGroup,
                        keyVaultName,
                        updateParams
                      );
                      
                      console.log(`[KEY VAULT] createOrUpdate completed, verifying removal...`);
                      
                      // Step 5: Verify removal
                      const verifyVault = await kvManagementClient.vaults.get(kvResourceGroup, keyVaultName);
                      const verifyPolicies = verifyVault.properties?.accessPolicies || [];
                      const stillExists = verifyPolicies.some(p => p.objectId === identityPrincipalId);
                      
                      if (stillExists) {
                        console.error(`[KEY VAULT] ❌ CRITICAL: Policy for ${identityPrincipalId} still exists after createOrUpdate! This should not happen.`);
                      } else {
                        console.log(`[KEY VAULT] ✅ Successfully verified removal of access policy for identity: ${identityPrincipalId}`);
                      }
                    } else {
                      console.log(`[KEY VAULT] No access policy found for objectId ${identityPrincipalId}, nothing to remove`);
                    }
                  }
                } else {
                  console.warn(`[KEY VAULT] Missing tenant ID or resource group, skipping access policy cleanup`);
                }
              } else {
                console.log(`[KEY VAULT] Storage account has no managed identity, skipping access policy cleanup`);
              }
            } catch (kvError: any) {
              console.error(`[KEY VAULT] Cleanup error for ${accountToDelete.name}:`, kvError.message);
              // Don't fail the deletion - Key Vault cleanup errors are not critical
            }
          }

          try {
            const storageClient = new StorageManagementClient(
              azureCredential,
              subscriptionId,
            );
            await storageClient.storageAccounts.delete(
              accountToDelete.resourceGroupName,
              accountToDelete.name,
            );
            storageAccountDeleted = true;
            console.log(
              `✅ Deleted Azure storage account: ${accountToDelete.name} from resource group: ${accountToDelete.resourceGroupName}`,
            );
          } catch (storageError: any) {
            console.error(
              `❌ Failed to delete Azure storage account ${accountToDelete.name}:`,
              storageError,
            );
            return res.status(500).json({
              error: "Failed to delete Azure storage account",
              details: storageError.message,
              azureResource: accountToDelete.name,
              filesystemDeleted: true,
              suggestion: "Filesystem was deleted but storage account deletion failed. Please verify Azure permissions and try again, or manually delete the storage account from Azure portal",
            });
          }
        } else {
          console.log(
            `ℹ️ Storage account ${accountToDelete.name} has ${otherContainers.length} other container(s), only deleted filesystem ${accountToDelete.containerName}`,
          );
        }

        // Only delete from database after successful Azure deletion
        const deleted = await storage.deleteStorageAccount(id);
        if (!deleted) {
          return res.status(404).json({ error: "ADLS storage account not found in database" });
        }

        // Log deletion activity
        await logUserActivity(
          req,
          "DELETE_ADLS_STORAGE",
          "STORAGE_MANAGEMENT",
          `ADLS Gen2 Storage: ${accountToDelete.name}/${accountToDelete.containerName}`,
          "STORAGE_ACCOUNT",
          accountToDelete.organizationId ? { organizationId: accountToDelete.organizationId } : undefined,
        );

        res.json({ 
          message: "ADLS storage account deleted successfully from both Azure and database",
          details: {
            filesystemDeleted,
            storageAccountDeleted: otherContainers.length === 0 ? storageAccountDeleted : false,
            otherContainersRemaining: otherContainers.length,
          }
        });
      } catch (error: any) {
        console.error("ADLS storage account deletion error:", error);
        res.status(500).json({ error: "Failed to delete ADLS storage account" });
      }
    }
  );

  // Get Azure resource groups
  // Requires either storage management (addStorageContainer) or foundry wizard (add) permission
  app.get("/api/azure/resource-groups", tokenRequired, async (req, res) => {
    try {
      // Check if user has either storage management or foundry wizard permission
      const userEmail = req.user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      // Get user's roles across all their organizations
      const userRoles = await storage.getUserRolesByEmail(userEmail);
      let hasStoragePermission = false;
      let hasFoundryPermission = false;
      
      for (const userRole of userRoles) {
        const permissions = await storage.getUserRolePermissions(userEmail, userRole.roleId);
        // Allow if user has any storage management permission (view, add container, or add storage)
        if (permissions?.storageMgmt?.view === true || 
            permissions?.storageMgmt?.addStorageContainer === true || 
            permissions?.storageMgmt?.addContainer === true) {
          hasStoragePermission = true;
        }
        // Check Foundry wizard tab permission (correct path: foundryMgmt.tabWizard)
        if (permissions?.foundryMgmt?.tabWizard === true || permissions?.foundryMgmt?.add === true) {
          hasFoundryPermission = true;
        }
        if (hasStoragePermission || hasFoundryPermission) break;
      }
      
      if (!hasStoragePermission && !hasFoundryPermission) {
        return res.status(403).json({ 
          error: "Access denied. Requires storage management (add container) or Foundry AI wizard permission." 
        });
      }

      const { DefaultAzureCredential } = await import("@azure/identity");
      const { ResourceManagementClient } = await import("@azure/arm-resources");
      
      const subscriptionId = process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || process.env.AZURE_SUBSCRIPTION_ID;
      if (!subscriptionId) {
        return res.status(500).json({ error: "Azure subscription not configured" });
      }

      const credential = new DefaultAzureCredential();
      const resourceClient = new ResourceManagementClient(credential, subscriptionId);
      
      const resourceGroups = [];
      const resourceGroupNames = new Set(); // To avoid duplicates
      
      // 1. Add default resource group from environment if set
      const defaultRg = process.env.ZAPPER_AZURE_RESOURCE_GROUP || process.env.AZURE_RESOURCE_GROUP;
      if (defaultRg) {
        resourceGroups.push({
          name: defaultRg,
          location: "Unknown",
          isDefault: true,
        });
        resourceGroupNames.add(defaultRg);
      }
      
      // 2. Add resource groups from database (created through ADLS Gen2 Storage)
      try {
        const userEmail = req.user?.email;
        if (userEmail) {
          const userOrgIds = await storage.getUserOrganizationIds(userEmail);
          const allStorageAccounts = await storage.getStorageAccountsForOrganizations(userOrgIds);
          
          // Extract unique resource group names from database
          const dbResourceGroupSet = new Set(
            allStorageAccounts
              .map(acc => acc.resourceGroupName)
              .filter(rg => rg && !resourceGroupNames.has(rg))
          );
          const dbResourceGroups = Array.from(dbResourceGroupSet);
          
          for (const rgName of dbResourceGroups) {
            resourceGroups.push({
              name: rgName,
              location: "Unknown", // Will be updated from Azure if available
              isDefault: false,
            });
            resourceGroupNames.add(rgName);
          }
        }
      } catch (dbError) {
        console.warn("Could not fetch resource groups from database:", dbError);
      }
      
      // 3. Add existing resource groups from Azure
      try {
        for await (const rg of resourceClient.resourceGroups.list()) {
          if (rg.name && !resourceGroupNames.has(rg.name)) {
            resourceGroups.push({
              name: rg.name,
              location: rg.location || "Unknown",
              isDefault: false,
            });
            resourceGroupNames.add(rg.name);
          } else if (rg.name && resourceGroupNames.has(rg.name)) {
            // Update location for existing resource group if we have it from Azure
            const existingRg = resourceGroups.find(r => r.name === rg.name);
            if (existingRg && rg.location) {
              existingRg.location = rg.location;
            }
          }
        }
      } catch (azureError) {
        console.warn("Could not fetch Azure resource groups:", azureError);
        // Continue with DB and default RGs if Azure API fails
      }
      
      // Sort: Default first, then alphabetically
      resourceGroups.sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });
      
      res.json(resourceGroups);
    } catch (error: any) {
      console.error("Resource groups fetch error:", error);
      res.status(500).json({ error: "Failed to fetch resource groups" });
    }
  });

  // Get storage account for specific organization
  // SECURITY: No STORAGE_MANAGEMENT permission required - file users need to see their org's storage account
  // This is READ-ONLY access to see which storage is configured, not to manage it
  app.get(
    "/api/organizations/:organizationId/storage-account",
    tokenRequired,
    organizationAccessRequired,
    async (req, res) => {
      try {
        // Use pre-validated organization ID from middleware
        const organizationId = (req as any).validatedOrganizationId;

        const allStorageAccounts = await storage.getAllStorageAccounts();
        const orgStorageAccount = allStorageAccounts.find(
          (acc) => acc.organizationId === organizationId,
        );

        // Log storage account viewing activity for organization
        await logUserActivity(
          req,
          "VIEW_STORAGE_ACCOUNTS",
          "STORAGE_MANAGEMENT",
          `Organization Storage Account: ${organizationId}`,
          "DATA",
          { organizationId },
        );

        if (!orgStorageAccount) {
          return res.status(404).json({
            error: "No storage account configured for this organization",
          });
        }

        res.json({
          id: orgStorageAccount.id,
          name: orgStorageAccount.name,
          location: orgStorageAccount.location,
          containerName: orgStorageAccount.containerName,
          organizationId: orgStorageAccount.organizationId,
          organizationName: orgStorageAccount.organizationName,
          kind: orgStorageAccount.kind || 'blob',
          createdAt:
            orgStorageAccount.createdAt?.toISOString() ||
            new Date().toISOString(),
        });
      } catch (error: any) {
        console.error("Organization storage account fetch error:", error);
        res
          .status(500)
          .json({ error: "Failed to fetch organization storage account" });
      }
    },
  );

  // Update storage account type (kind: 'blob' or 'adls')
  app.patch(
    "/api/organizations/:organizationId/storage-account",
    tokenRequired,
    organizationAccessRequired,
    storageManagementPermissionRequired('addStorageContainer'),
    async (req, res) => {
      try {
        const organizationId = (req as any).validatedOrganizationId;
        const { kind } = req.body;

        // Validate kind
        if (!kind || !['blob', 'adls'].includes(kind)) {
          return res.status(400).json({
            error: "Invalid storage account type. Must be 'blob' or 'adls'",
          });
        }

        // Get current storage account
        const allStorageAccounts = await storage.getAllStorageAccounts();
        const orgStorageAccount = allStorageAccounts.find(
          (acc) => acc.organizationId === organizationId,
        );

        if (!orgStorageAccount) {
          return res.status(404).json({
            error: "No storage account configured for this organization",
          });
        }

        // Update the storage account kind
        const updated = await storage.updateStorageAccount(orgStorageAccount.id, { kind });

        if (!updated) {
          return res.status(500).json({
            error: "Failed to update storage account type",
          });
        }

        // Log the activity
        await logUserActivity(
          req,
          "UPDATE_STORAGE_ACCOUNT",
          "STORAGE_MANAGEMENT",
          `Updated storage account type to ${kind}: ${orgStorageAccount.name}`,
          "DATA",
          { organizationId },
        );

        res.json({
          id: updated.id,
          name: updated.name,
          location: updated.location,
          containerName: updated.containerName,
          organizationId: updated.organizationId,
          kind: updated.kind,
          message: `Storage account type updated to ${kind}`,
        });
      } catch (error: any) {
        console.error("Storage account update error:", error);
        res.status(500).json({ error: "Failed to update storage account type" });
      }
    },
  );

  app.post(
    "/api/storage-accounts",
    tokenRequired,
    organizationAccessRequired,
    storageManagementPermissionRequired('addStorageContainer'),
    async (req, res) => {
      try {
        const {
          name,
          location,
          container,
          resourceGroupName,
          organizationId,
          useExisting,
          existingAccountId,
          createNewResourceGroup,
        } = req.body;
        if (!container || !organizationId || !resourceGroupName) {
          return res.status(400).json({ error: "Missing required fields" });
        }

        // Security: Validate container name to prevent null bytes, path traversal, and DoS
        const containerValidation = validateContainerName(container);
        if (!containerValidation.valid) {
          return res.status(400).json({ 
            error: containerValidation.error,
            field: 'container'
          });
        }
        const validatedContainer = containerValidation.sanitized!;

        const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));


        // Check if Azure credentials are available
        if (!subscriptionId || !resourceGroup || !credential) {
          return res.status(500).json({
            error:
              "Azure credentials not configured. Please check Azure environment variables.",
          });
        }

        let storageAccountName = name;
        let storageLocation = location;

        // Check if using existing storage account
        if (useExisting && existingAccountId) {
          const existingAccount = await storage.getAllStorageAccounts();
          const selectedAccount = existingAccount.find(
            (acc) => acc.id === existingAccountId,
          );
          if (!selectedAccount) {
            return res
              .status(400)
              .json({ error: "Selected storage account not found" });
          }
          storageAccountName = selectedAccount.name;
          storageLocation = selectedAccount.location;
        } else {
          // Validate name for new storage account
          if (!name) {
            return res
              .status(400)
              .json({ error: "Storage account name is required" });
          }
        }

        // Check if container already exists with same name for this storage account
        const existingAccounts = await storage.getAllStorageAccounts();
        
        // RULE: One organization can only have ONE storage account + container association
        // Check if this organization already has a storage account association
        const existingOrgStorage = existingAccounts.find(
          (acc) => acc.organizationId === organizationId
        );
        
        if (existingOrgStorage) {
          return res.status(400).json({
            error: `Organization already has a storage account association (${existingOrgStorage.name}/${existingOrgStorage.containerName}). Each organization can only be associated with one storage account and container.`,
            code: 'ORG_STORAGE_LIMIT_EXCEEDED'
          });
        }
        
        const duplicateContainer = existingAccounts.find(
          (acc) =>
            acc.name === storageAccountName && acc.containerName === validatedContainer,
        );

        if (duplicateContainer) {
          return res.status(400).json({
            error: `Container '${validatedContainer}' already exists in storage account '${storageAccountName}'`,
          });
        }

        // If creating new storage account, check if name is already taken
        if (!useExisting) {
          // Check if this storage account name exists (any record with this name)
          const existingStorageAccountRecords = existingAccounts.filter(
            (acc) => acc.name === storageAccountName
          );
          if (existingStorageAccountRecords.length > 0) {
            return res.status(400).json({
              error: `Storage account '${storageAccountName}' already exists. Use 'existing account' option to add containers.`,
            });
          }

          // Create Azure Storage Account
          const storageClient = new StorageManagementClient(
            credential!,
            subscriptionId!,
          );
          await storageClient.storageAccounts.beginCreateAndWait(
            resourceGroupName,
            storageAccountName,
            {
              sku: { name: "Standard_LRS" },
              kind: "StorageV2",
              location: storageLocation || "East US",
              isHnsEnabled: true,
              minimumTlsVersion: "TLS1_2",
            },
          );
          console.log(`✅ [STORAGE] Storage account '${storageAccountName}' created.`);
        } 
        else {
          console.log(`ℹ️ [STORAGE] Using existing storage account '${storageAccountName}'.`);
        }
        
        // SECURITY: Validate storage account name before Azure SDK URL construction
        const storageNameValidation = validateStorageAccountName(storageAccountName);
        if (!storageNameValidation.valid) {
          return res.status(500).json({
            error: "Storage account validation failed",
            details: storageNameValidation.error,
            field: 'storageAccountName'
          });
        }
        const validatedStorageAccountName = storageNameValidation.sanitized!;

        console.log(`🔧 [FS] Creating filesystem '${validatedContainer}' on account '${validatedStorageAccountName}'...`);
        // Create Data Lake container
        const dataLakeService = new DataLakeServiceClient(
          `https://${validatedStorageAccountName}.dfs.core.windows.net`,
          credential!,
        );
        const fsClient = dataLakeService.getFileSystemClient(validatedContainer);
        //await fsClient.create();
        const maxAttempts = 8;              // ~1–2 min total worst case
      const baseDelayMs = 1000;           // 1s, doubles each retry up to ~15s
      const maxDelayMs  = 15000;          // cap each wait at 15s

      let attempt = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        attempt++;
        try {
          await fsClient.create();
          console.log(
            `✅ [FS] Filesystem '${validatedContainer}' ready on '${validatedStorageAccountName}' (attempt ${attempt}/${maxAttempts}).`,
          );
          break;
        } catch (e: any) {
          const status =
            e?.statusCode ?? e?.status ?? e?.response?.status ?? undefined;
          const code =
            e?.code ??
            e?.details?.errorCode ??
            e?.response?.data?.error?.code ??
            undefined;
          const reqId =
            e?.details?.["x-ms-request-id"] ??
            e?.response?.headers?.["x-ms-request-id"] ??
            undefined;

          // Treat "already exists" as success to avoid flaking
          if (
            status === 409 &&
            (code === "ContainerAlreadyExists" || code === "FileSystemAlreadyExists")
          ) {
            console.log(
              `ℹ️ [FS] '${validatedContainer}' already exists on '${validatedStorageAccountName}' (409). Treating as success.`,
            );
            break;
          }

          // Transient readiness/RBAC cases to retry: 403/404 (or unknown)
          const retryable =
            status === 403 || status === 404 || status === 0 || status === undefined;

          console.log(
            `⚠️ [FS] Create failed (attempt ${attempt}/${maxAttempts}) ` +
              `(status=${status}, code=${code}, reqId=${reqId}).` +
              (retryable
                ? " Likely RBAC/DFS readiness. Will retry..."
                : " Non-retryable. Aborting."),
          );

          if (!retryable || attempt >= maxAttempts) {
            console.log(
              `❌ [FS] Giving up after ${attempt} attempt(s). If this is a Managed Application with lockLevel=ReadOnly, ` +
                `post-deployment data-plane writes by the app identity are denied.`,
            );
            throw e;
          }

          const wait = Math.min(
            baseDelayMs * Math.pow(2, attempt - 1),
            maxDelayMs,
          );
          console.log(`🕒 [FS] Waiting ${wait}ms before retry...`);
          await sleep(wait);
        }
      }

        console.log(`✅ [FS] Filesystem '${validatedContainer}' ready on '${validatedStorageAccountName}'.`);


        // Assign Storage Blob Data Contributor role to the folder-zipper-aca container app
        console.log(`🔧 [STORAGE] About to assign role permissions for storage account: ${storageAccountName}`);
        try {
          await acaZipperService.assignStorageRole(storageAccountName);
          console.log(`🔧 [STORAGE] Role assignment completed successfully for storage account: ${storageAccountName}`);
        } catch (roleAssignmentError: any) {
          console.log(`⚠️ [STORAGE] Role assignment failed but continuing with storage account creation: ${roleAssignmentError.message}`);
          // Continue with storage account creation even if role assignment fails
        }

        // Configure CORS for the storage account
        console.log(`🔧 [STORAGE] About to configure CORS for storage account: ${storageAccountName}`);
        await configureCORS(req, storageAccountName);
        console.log(`🔧 [STORAGE] CORS configuration attempt completed for storage account: ${storageAccountName}`);

        // Save to database
        const account = await storage.createStorageAccount({
          name: storageAccountName,
          location: storageLocation || "East US",
          containerName: validatedContainer,
          resourceGroupName: resourceGroupName,
          organizationId: organizationId,
          kind: 'blob',
        });

        // Log appropriate activity based on whether this is a new storage account or new container
        if (useExisting && existingAccountId) {
          // This is container creation on existing storage account
          await logUserActivity(
            req,
            "CREATE_CONTAINER",
            "STORAGE_MANAGEMENT",
            `Container: ${validatedContainer} on Storage Account: ${storageAccountName}`,
            "CONTAINER",
            { organizationId },
          );
        } else {
          // This is new storage account creation
          await logUserActivity(
            req,
            "CREATE_STORAGE_ACCOUNT",
            "STORAGE_MANAGEMENT",
            `Storage Account: ${storageAccountName}/${validatedContainer}`,
            "STORAGE_ACCOUNT",
            { organizationId },
          );
        }

        res.status(201).json(account);
      } catch (error: any) {
        console.error("Storage account creation error:", error);
        
        // Check if this is an Azure authorization error
        const errorMessage = error?.message || "Storage account creation failed";
        let userFriendlyMessage = errorMessage;
        
        // Detect Azure permission errors
        if (errorMessage.includes("does not have authorization to perform action")) {
          userFriendlyMessage = 
            "Deployed App Service does not have proper permission to create storage account. " +
            "Please provide proper permission.\n\n" +
            "Refer to below link for more details:\n" +
            "https://zapperedge.com/storage-creation-permission-error\n\n" +
            "Or refer to Troubleshooting Guide for more details:\n" +
            "https://zapperedge.com/user-manuals";
        }
        
        res
          .status(500)
          .json({ error: userFriendlyMessage });
      }
    },
  );

  // Manual CORS configuration endpoint for existing storage accounts
  app.post(
    "/api/storage-accounts/:storageAccountName/configure-cors",
    tokenRequired,
    storageManagementPermissionRequired('addContainer'),
    async (req, res) => {
      try {
        const { storageAccountName } = req.params;
        
        // SECURITY: Validate storage account name format
        const nameValidation = validateStorageAccountName(storageAccountName);
        if (!nameValidation.valid) {
          return res.status(400).json({ error: nameValidation.error });
        }

        const validatedName = nameValidation.sanitized!;
        
        console.log(`🔧 [MANUAL CORS] Configuring CORS for storage account: ${validatedName}`);
        
        // Configure CORS for the storage account
        await configureCORS(req, validatedName);
        
        // Log activity
        await logUserActivity(
          req,
          "CONFIGURE_CORS",
          "STORAGE_MANAGEMENT",
          `Manual CORS Configuration: ${storageAccountName}`,
          "STORAGE_ACCOUNT",
        );

        res.json({ 
          success: true, 
          message: `CORS configuration attempt completed for ${storageAccountName}. Check server logs for details.`,
          domain: getDomainFromRequest(req)
        });
      } catch (error: any) {
        console.error("Manual CORS configuration error:", error);
        res.status(500).json({ 
          error: error?.message || "Manual CORS configuration failed",
          storageAccount: req.params.storageAccountName 
        });
      }
    }
  );

  // ============================================
  // Customer-Managed Key (CMK) Endpoints
  // ============================================

  // List available keys from Key Vault for CMK
  app.get("/api/keyvault/keys", tokenRequired, storageManagementPermissionRequired('view'), async (req, res) => {
    try {
      if (!isKeyVaultConfigured()) {
        return res.status(400).json({
          error: "Key Vault not configured",
          details: "KEY_VAULT_URL environment variable is not set",
        });
      }

      const keys = await listKeyVaultKeys();
      res.json({
        keyVaultUrl: getKeyVaultUrl(),
        keys,
      });
    } catch (error: any) {
      console.error("[CMK] Error listing Key Vault keys:", error);
      
      if (error.keyVaultKeyError) {
        return res.status(403).json({
          error: error.keyVaultKeyError.message,
          keyVaultError: error.keyVaultKeyError,
        });
      }
      
      res.status(500).json({
        error: error?.message || "Failed to list Key Vault keys",
      });
    }
  });

  // Create a new key in Key Vault for CMK
  app.post("/api/keyvault/keys", tokenRequired, storageManagementPermissionRequired('addContainer'), async (req, res) => {
    try {
      const { keyName, keySize } = req.body;

      if (!keyName) {
        return res.status(400).json({ error: "Key name is required" });
      }

      // Validate key name format (alphanumeric and hyphens only)
      const keyNameRegex = /^[a-zA-Z0-9-]+$/;
      if (!keyNameRegex.test(keyName)) {
        return res.status(400).json({
          error: "Invalid key name. Use only letters, numbers, and hyphens.",
        });
      }

      if (!isKeyVaultConfigured()) {
        return res.status(400).json({
          error: "Key Vault not configured",
          details: "KEY_VAULT_URL environment variable is not set",
        });
      }

      const key = await createKeyVaultKey(keyName, keySize || 2048);

      await logUserActivity(
        req,
        "CREATE_CMK_KEY",
        "STORAGE_MANAGEMENT",
        `Created CMK key: ${keyName}`,
        "ENCRYPTION_KEY",
      );

      res.status(201).json(key);
    } catch (error: any) {
      console.error("[CMK] Error creating Key Vault key:", error);
      
      if (error.keyVaultKeyError) {
        return res.status(403).json({
          error: error.keyVaultKeyError.message,
          keyVaultError: error.keyVaultKeyError,
        });
      }
      
      res.status(500).json({
        error: error?.message || "Failed to create Key Vault key",
      });
    }
  });

  // Get CMK status for a storage account
  app.get(
    "/api/storage-accounts/:storageAccountName/cmk",
    tokenRequired,
    storageManagementPermissionRequired('view'),
    async (req, res) => {
      try {
        const { storageAccountName } = req.params;

        // Validate storage account name
        const nameValidation = validateStorageAccountName(storageAccountName);
        if (!nameValidation.valid) {
          return res.status(400).json({ error: nameValidation.error });
        }
        const validatedName = nameValidation.sanitized!;

        // Get storage account from database to find resource group
        const dbAccount = await storage.getStorageAccountByName(validatedName);
        if (!dbAccount) {
          return res.status(404).json({ error: "Storage account not found" });
        }

        // 🔒 Validate user has access to storage account's organization (prevent IDOR)
        const userEmail = (req as any).user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User email not found in token" });
        }
        const userOrganizations = await storage.getOrganizationsForUser(userEmail);
        const userOrgIds = userOrganizations.map(org => org.id);
        if (dbAccount.organizationId && !userOrgIds.includes(dbAccount.organizationId)) {
          console.warn(`[CMK] IDOR attempt: User ${userEmail} tried to view CMK status for storage account ${validatedName} (org ${dbAccount.organizationId}) but only has access to orgs [${userOrgIds.join(', ')}]`);
          return res.status(403).json({ error: "Access denied: You do not have access to this storage account's organization" });
        }

        if (!dbAccount.resourceGroupName) {
          return res.status(400).json({
            error: "Resource group not configured for this storage account",
          });
        }

        // Check Azure credentials
        const azureSubscriptionId = process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || process.env.AZURE_SUBSCRIPTION_ID;
        if (!azureSubscriptionId) {
          return res.status(500).json({
            error: "Azure subscription not configured",
          });
        }

        // Get storage account properties from Azure
        const azureCredential = new DefaultAzureCredential();
        const storageClient = new StorageManagementClient(azureCredential, azureSubscriptionId);
        const azureStorageAccount = await storageClient.storageAccounts.getProperties(
          dbAccount.resourceGroupName,
          validatedName
        );

        // Extract encryption info
        const encryption = azureStorageAccount.encryption;
        const keySource = encryption?.keySource || "Microsoft.Storage";
        const isCmkEnabled = keySource === "Microsoft.Keyvault";

        let cmkDetails = null;
        if (isCmkEnabled && encryption?.keyVaultProperties) {
          cmkDetails = {
            keyVaultUri: encryption.keyVaultProperties.keyVaultUri,
            keyName: encryption.keyVaultProperties.keyName,
            keyVersion: encryption.keyVaultProperties.keyVersion || "latest",
          };
        }

        res.json({
          storageAccountName: validatedName,
          cmkEnabled: isCmkEnabled,
          keySource,
          cmkDetails,
          identity: azureStorageAccount.identity?.type || null,
          identityPrincipalId: azureStorageAccount.identity?.principalId || null,
        });
      } catch (error: any) {
        console.error("[CMK] Error getting CMK status:", error);
        res.status(500).json({
          error: error?.message || "Failed to get CMK status",
        });
      }
    }
  );

  // Enable CMK on a storage account
  app.post(
    "/api/storage-accounts/:storageAccountName/cmk/enable",
    tokenRequired,
    storageManagementPermissionRequired('addContainer'),
    async (req, res) => {
      try {
        const { storageAccountName } = req.params;
        const { keyName, keyVersion } = req.body;

        if (!keyName) {
          return res.status(400).json({ error: "Key name is required" });
        }

        // Validate storage account name
        const nameValidation = validateStorageAccountName(storageAccountName);
        if (!nameValidation.valid) {
          return res.status(400).json({ error: nameValidation.error });
        }
        const validatedName = nameValidation.sanitized!;

        // Get storage account from database
        const dbAccount = await storage.getStorageAccountByName(validatedName);
        if (!dbAccount) {
          return res.status(404).json({ error: "Storage account not found" });
        }

        // 🔒 Validate user has access to storage account's organization (prevent IDOR)
        const userEmail = (req as any).user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User email not found in token" });
        }
        const userOrganizations = await storage.getOrganizationsForUser(userEmail);
        const userOrgIds = userOrganizations.map(org => org.id);
        if (dbAccount.organizationId && !userOrgIds.includes(dbAccount.organizationId)) {
          console.warn(`[CMK] IDOR attempt: User ${userEmail} tried to enable CMK on storage account ${validatedName} (org ${dbAccount.organizationId}) but only has access to orgs [${userOrgIds.join(', ')}]`);
          return res.status(403).json({ error: "Access denied: You do not have access to this storage account's organization" });
        }

        if (!dbAccount.resourceGroupName) {
          return res.status(400).json({
            error: "Resource group not configured for this storage account",
          });
        }

        // Check Azure credentials
        const azureSubscriptionId = process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || process.env.AZURE_SUBSCRIPTION_ID;
        if (!azureSubscriptionId) {
          return res.status(500).json({
            error: "Azure subscription not configured",
          });
        }

        if (!isKeyVaultConfigured()) {
          return res.status(400).json({
            error: "Key Vault not configured",
            details: "KEY_VAULT_URL environment variable is not set",
          });
        }

        const keyVaultUrl = getKeyVaultUrl()!;
        const azureCredential = new DefaultAzureCredential();
        const storageClient = new StorageManagementClient(azureCredential, azureSubscriptionId);

        // Step 1: Ensure storage account has system-assigned managed identity
        console.log(`[CMK] Step 1: Ensuring managed identity for ${validatedName}`);
        const currentAccount = await storageClient.storageAccounts.getProperties(
          dbAccount.resourceGroupName,
          validatedName
        );

        if (!currentAccount.identity?.principalId) {
          console.log(`[CMK] Enabling system-assigned managed identity`);
          await storageClient.storageAccounts.update(
            dbAccount.resourceGroupName,
            validatedName,
            {
              identity: { type: "SystemAssigned" },
            }
          );

          // Wait for identity to be assigned
          await new Promise(resolve => setTimeout(resolve, 5000));
        }

        // Step 2: Get the updated storage account with identity
        const updatedAccount = await storageClient.storageAccounts.getProperties(
          dbAccount.resourceGroupName,
          validatedName
        );
        const identityPrincipalId = updatedAccount.identity?.principalId;

        if (!identityPrincipalId) {
          return res.status(500).json({
            error: "Failed to get storage account managed identity",
          });
        }

        console.log(`[CMK] Step 2: Storage account identity: ${identityPrincipalId}`);

        // Step 3: Grant Key Vault access to the storage account identity
        console.log(`[CMK] Step 3: Granting Key Vault access to storage account identity`);
        
        // Extract Key Vault name from URL
        const keyVaultName = keyVaultUrl.replace(/^https?:\/\//, '').replace(/\.vault\.azure\.net\/?.*$/, '');
        
        // Use Key Vault management to add access policy
        const { KeyVaultManagementClient } = await import("@azure/arm-keyvault");
        const kvManagementClient = new KeyVaultManagementClient(azureCredential, azureSubscriptionId);
        
        // Find the Key Vault resource group (try common patterns)
        let kvResourceGroup = process.env.ZAPPER_AZURE_RESOURCE_GROUP || process.env.AZURE_RESOURCE_GROUP || dbAccount.resourceGroupName;

        try {
          // Update Key Vault access policy to include storage account identity
          const tenantId = process.env.AZURE_TENANT_ID || updatedAccount.identity?.tenantId;
          
          if (!tenantId) {
            return res.status(500).json({
              error: "Azure tenant ID not configured",
            });
          }

          await kvManagementClient.vaults.updateAccessPolicy(
            kvResourceGroup!,
            keyVaultName,
            "add",
            {
              properties: {
                accessPolicies: [
                  {
                    tenantId,
                    objectId: identityPrincipalId,
                    permissions: {
                      keys: ["get", "wrapKey", "unwrapKey"],
                    },
                  },
                ],
              },
            }
          );
          console.log(`[CMK] Successfully granted Key Vault access to storage account`);
        } catch (kvError: any) {
          console.error("[CMK] Error granting Key Vault access:", kvError);
          return res.status(500).json({
            error: "Failed to grant Key Vault access to storage account",
            details: kvError?.message || "Key Vault access policy update failed",
          });
        }

        // Step 4: Wait for access policy to propagate
        console.log(`[CMK] Step 4: Waiting for access policy propagation...`);
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Step 5: Enable CMK on storage account
        console.log(`[CMK] Step 5: Enabling CMK encryption`);
        try {
          await storageClient.storageAccounts.update(
            dbAccount.resourceGroupName,
            validatedName,
            {
              encryption: {
                keySource: "Microsoft.Keyvault",
                keyVaultProperties: {
                  keyVaultUri: keyVaultUrl,
                  keyName,
                  keyVersion: keyVersion || undefined,
                },
                services: {
                  blob: { enabled: true, keyType: "Account" },
                  file: { enabled: true, keyType: "Account" },
                },
              },
            }
          );
        } catch (encryptionError: any) {
          console.error("[CMK] Error enabling encryption:", encryptionError);
          return res.status(500).json({
            error: "Failed to enable CMK encryption",
            details: encryptionError?.message || "Storage account encryption update failed",
          });
        }

        console.log(`[CMK] Successfully enabled CMK for ${validatedName}`);

        await logUserActivity(
          req,
          "ENABLE_CMK",
          "STORAGE_MANAGEMENT",
          `Enabled CMK for storage account: ${validatedName} with key: ${keyName}`,
          "ENCRYPTION_KEY",
          dbAccount.organizationId ? { organizationId: dbAccount.organizationId } : undefined,
        );

        res.json({
          success: true,
          message: `CMK enabled for storage account ${validatedName}`,
          storageAccountName: validatedName,
          keyName,
          keyVersion: keyVersion || "latest",
          keyVaultUri: keyVaultUrl,
        });
      } catch (error: any) {
        console.error("[CMK] Error enabling CMK:", error);
        res.status(500).json({
          error: error?.message || "Failed to enable CMK",
        });
      }
    }
  );

  // Disable CMK on a storage account (switch back to Microsoft-managed keys)
  app.post(
    "/api/storage-accounts/:storageAccountName/cmk/disable",
    tokenRequired,
    storageManagementPermissionRequired('addContainer'),
    async (req, res) => {
      try {
        const { storageAccountName } = req.params;

        // Validate storage account name
        const nameValidation = validateStorageAccountName(storageAccountName);
        if (!nameValidation.valid) {
          return res.status(400).json({ error: nameValidation.error });
        }
        const validatedName = nameValidation.sanitized!;

        // Get storage account from database
        const dbAccount = await storage.getStorageAccountByName(validatedName);
        if (!dbAccount) {
          return res.status(404).json({ error: "Storage account not found" });
        }

        // 🔒 Validate user has access to storage account's organization (prevent IDOR)
        const userEmail = (req as any).user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User email not found in token" });
        }
        const userOrganizations = await storage.getOrganizationsForUser(userEmail);
        const userOrgIds = userOrganizations.map(org => org.id);
        if (dbAccount.organizationId && !userOrgIds.includes(dbAccount.organizationId)) {
          console.warn(`[CMK] IDOR attempt: User ${userEmail} tried to disable CMK on storage account ${validatedName} (org ${dbAccount.organizationId}) but only has access to orgs [${userOrgIds.join(', ')}]`);
          return res.status(403).json({ error: "Access denied: You do not have access to this storage account's organization" });
        }

        if (!dbAccount.resourceGroupName) {
          return res.status(400).json({
            error: "Resource group not configured for this storage account",
          });
        }

        // Check Azure credentials
        const azureSubscriptionId = process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || process.env.AZURE_SUBSCRIPTION_ID;
        if (!azureSubscriptionId) {
          return res.status(500).json({
            error: "Azure subscription not configured",
          });
        }

        const azureCredential = new DefaultAzureCredential();
        const storageClient = new StorageManagementClient(azureCredential, azureSubscriptionId);

        // Switch back to Microsoft-managed keys
        // IMPORTANT: Must use beginCreateAndWait (full PUT) to properly clear keyVaultProperties
        // Azure SDK's update() only patches specified properties, leaving keyVaultProperties intact
        console.log(`[CMK] Disabling CMK for ${validatedName}`);
        
        // First, get current storage account to preserve all existing settings
        const currentAccount = await storageClient.storageAccounts.getProperties(
          dbAccount.resourceGroupName,
          validatedName
        );
        
        // Log current encryption state for debugging
        console.log(`[CMK] Current encryption state: keySource=${currentAccount.encryption?.keySource}, keyVaultUri=${currentAccount.encryption?.keyVaultProperties?.keyVaultUri}`);
        
        // IMPORTANT: Azure requires two-step process to disable CMK
        // Step 1: Clear keyVaultProperties (switch to Microsoft-managed keys) - keep identity for now
        // Step 2: Remove the managed identity in a separate operation
        // Error if combined: "The properties 'encryption.identity, encryption.keyvaultproperties' cannot be updated in a single operation"
        
        // Step 1: Switch to Microsoft-managed keys (keep identity temporarily)
        console.log(`[CMK] Step 1: Switching to Microsoft-managed keys for ${validatedName}`);
        const step1Params: any = {
          location: currentAccount.location!,
          kind: currentAccount.kind!,
          sku: currentAccount.sku!,
          tags: currentAccount.tags,
          // Preserve HNS and other critical settings
          isHnsEnabled: currentAccount.isHnsEnabled,
          accessTier: currentAccount.accessTier,
          minimumTlsVersion: currentAccount.minimumTlsVersion,
          allowBlobPublicAccess: currentAccount.allowBlobPublicAccess,
          allowSharedKeyAccess: currentAccount.allowSharedKeyAccess,
          publicNetworkAccess: currentAccount.publicNetworkAccess,
          networkRuleSet: currentAccount.networkRuleSet,
          largeFileSharesState: currentAccount.largeFileSharesState,
          allowCrossTenantReplication: currentAccount.allowCrossTenantReplication,
          defaultToOAuthAuthentication: currentAccount.defaultToOAuthAuthentication,
          // Keep identity for now - will remove in step 2
          identity: currentAccount.identity,
          // Switch encryption to Microsoft-managed keys
          encryption: {
            keySource: "Microsoft.Storage",
            services: {
              blob: { 
                enabled: true, 
                keyType: "Account" 
              },
              file: { 
                enabled: true, 
                keyType: "Account" 
              },
            },
            // Explicitly NOT including keyVaultProperties to clear CMK
          },
        };
        
        await storageClient.storageAccounts.beginCreateAndWait(
          dbAccount.resourceGroupName,
          validatedName,
          step1Params
        );
        console.log(`[CMK] Step 1 complete: Encryption switched to Microsoft-managed keys`);
        
        // Step 2: Remove the managed identity
        console.log(`[CMK] Step 2: Removing managed identity for ${validatedName}`);
        const step2Params: any = {
          location: currentAccount.location!,
          kind: currentAccount.kind!,
          sku: currentAccount.sku!,
          tags: currentAccount.tags,
          // Preserve HNS and other critical settings
          isHnsEnabled: currentAccount.isHnsEnabled,
          accessTier: currentAccount.accessTier,
          minimumTlsVersion: currentAccount.minimumTlsVersion,
          allowBlobPublicAccess: currentAccount.allowBlobPublicAccess,
          allowSharedKeyAccess: currentAccount.allowSharedKeyAccess,
          publicNetworkAccess: currentAccount.publicNetworkAccess,
          networkRuleSet: currentAccount.networkRuleSet,
          largeFileSharesState: currentAccount.largeFileSharesState,
          allowCrossTenantReplication: currentAccount.allowCrossTenantReplication,
          defaultToOAuthAuthentication: currentAccount.defaultToOAuthAuthentication,
          // Now remove the identity
          identity: {
            type: "None",
          },
          // Keep encryption as Microsoft-managed (no keyVaultProperties)
          encryption: {
            keySource: "Microsoft.Storage",
            services: {
              blob: { 
                enabled: true, 
                keyType: "Account" 
              },
              file: { 
                enabled: true, 
                keyType: "Account" 
              },
            },
          },
        };
        
        await storageClient.storageAccounts.beginCreateAndWait(
          dbAccount.resourceGroupName,
          validatedName,
          step2Params
        );
        console.log(`[CMK] Step 2 complete: Managed identity removed`);
        
        // Verify the change
        const updatedAccount = await storageClient.storageAccounts.getProperties(
          dbAccount.resourceGroupName,
          validatedName
        );
        console.log(`[CMK] After disable: keySource=${updatedAccount.encryption?.keySource}, keyVaultUri=${updatedAccount.encryption?.keyVaultProperties?.keyVaultUri || 'cleared'}, isHnsEnabled=${updatedAccount.isHnsEnabled}`);

        console.log(`[CMK] Successfully disabled CMK for ${validatedName}`);

        await logUserActivity(
          req,
          "DISABLE_CMK",
          "STORAGE_MANAGEMENT",
          `Disabled CMK for storage account: ${validatedName} (switched to Microsoft-managed keys)`,
          "ENCRYPTION_KEY",
          dbAccount.organizationId ? { organizationId: dbAccount.organizationId } : undefined,
        );

        res.json({
          success: true,
          message: `CMK disabled for storage account ${validatedName}. Now using Microsoft-managed keys.`,
          storageAccountName: validatedName,
        });
      } catch (error: any) {
        console.error("[CMK] Error disabling CMK:", error);
        res.status(500).json({
          error: error?.message || "Failed to disable CMK",
        });
      }
    }
  );

  app.delete(
    "/api/storage-accounts/:id",
    tokenRequired,
    storageManagementPermissionRequired('delete'),
    async (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);

        // Get the storage account details before deletion
        const allAccounts = await storage.getAllStorageAccounts();
        const accountToDelete = allAccounts.find((acc) => acc.id === id);

        if (!accountToDelete) {
          return res.status(404).json({ error: "Storage account not found" });
        }

        // SECURITY: Validate storage account name before Azure SDK URL construction
        const acctNameValidation = validateStorageAccountName(accountToDelete.name);
        if (!acctNameValidation.valid) {
          return res.status(500).json({
            error: "Storage account validation failed",
            details: acctNameValidation.error,
            field: 'storageAccountName'
          });
        }
        const validatedAcctName = acctNameValidation.sanitized!;

        // Check if Azure credentials are available
        if (!subscriptionId || !resourceGroup || !credential) {
          return res.status(500).json({
            error:
              "Azure credentials not configured. Please check Azure environment variables.",
          });
        }

        try {
          // Delete the Data Lake container first
          const dataLakeService = new DataLakeServiceClient(
            `https://${validatedAcctName}.dfs.core.windows.net`,
            credential!,
          );
          const fsClient = dataLakeService.getFileSystemClient(
            accountToDelete.containerName,
          );
          await fsClient.delete();
          console.log(`Deleted container: ${accountToDelete.containerName}`);
        } catch (containerError: any) {
          console.warn(
            `Failed to delete container ${accountToDelete.containerName}:`,
            containerError.message,
          );
          // Continue with storage account deletion even if container deletion fails
        }

        // Check if there are other containers for this storage account
        const otherContainers = allAccounts.filter(
          (acc) => acc.name === accountToDelete.name && acc.id !== id,
        );

        // If no other containers exist, delete the entire Azure storage account
        if (otherContainers.length === 0) {
          // Clean up Event Grid resources before deleting storage account (HNS mode only)
          if (isHNSEnabled()) {
            console.log(`[EVENT GRID] Last container deleted, cleaning up Event Grid resources for ${accountToDelete.name}`);
            
            try {
              const topics = await listEventGridTopicsForStorageAccount(
                subscriptionId!,
                resourceGroup!,
                accountToDelete.name
              );

              for (const topic of topics) {
                await deleteEventGridTopic(subscriptionId!, resourceGroup!, topic.name);
              }

              console.log(`[EVENT GRID] Successfully cleaned up ${topics.length} Event Grid topic(s) for ${accountToDelete.name}`);
            } catch (eventGridError: any) {
              console.error(`[EVENT GRID] Cleanup error for ${accountToDelete.name}:`, eventGridError.message);
              // Don't fail the deletion - Event Grid cleanup errors are not critical
            }
          }

          try {
            const storageClient = new StorageManagementClient(
              credential!,
              subscriptionId!,
            );
            await storageClient.storageAccounts.delete(
              resourceGroup!,
              accountToDelete.name,
            );
            console.log(
              `Deleted Azure storage account: ${accountToDelete.name}`,
            );
          } catch (storageError: any) {
            console.warn(
              `Failed to delete Azure storage account ${accountToDelete.name}:`,
              storageError.message,
            );
            // Continue with database deletion even if Azure deletion fails
          }
        } else {
          console.log(
            `Storage account ${accountToDelete.name} has other containers, only deleted container ${accountToDelete.containerName}`,
          );
        }

        // Delete from database
        const success = await storage.deleteStorageAccount(id);
        if (success) {
          // Log storage account deletion activity
          await logUserActivity(
            req,
            "DELETE_STORAGE_ACCOUNT",
            "STORAGE_MANAGEMENT",
            `Storage Account: ${accountToDelete.name}/${accountToDelete.containerName}`,
            "STORAGE_ACCOUNT",
            accountToDelete.organizationId ? { organizationId: accountToDelete.organizationId } : undefined,
          );

          res.json({
            success: true,
            message:
              otherContainers.length === 0
                ? "Storage account and container deleted from Azure and database"
                : "Container deleted from Azure, storage account retained (has other containers)",
          });
        } else {
          res.status(404).json({ error: "Failed to delete from database" });
        }
      } catch (error: any) {
        console.error("Storage account deletion error:", error);
        res
          .status(500)
          .json({ error: error?.message || "Storage account deletion failed" });
      }
    },
  );

  // ADLS Gen2 + SFTP Storage Provisioning - Version 2 Advanced Provisioning
  app.post(
    "/api/organizations/:organizationId/provision-adls",
    tokenRequired,
    organizationAccessRequired,
    storageManagementPermissionRequired('addStorageContainer'),
    async (req, res) => {
      try {
        // Security: Validate organization ID to ensure positive integer
        const pathOrgId = validateOrganizationId(req.params.organizationId);
        
        if (pathOrgId === null) {
          return res.status(400).json({
            error: "Invalid organization ID: must be a positive integer",
            received: req.params.organizationId
          });
        }
        
        // Validate organization ID consistency between path and body
        const bodyOrgId = req.body.organizationId;
        
        if (bodyOrgId && bodyOrgId !== pathOrgId) {
          return res.status(400).json({
            ok: false,
            error: "Organization ID in request body must match path parameter"
          });
        }
        
        // Override body organizationId with validated path parameter for security
        req.body.organizationId = pathOrgId;
        
        // Pass storage instance to the provisioning function
        res.locals.storage = storage;
        
        // Call the provisioning function
        await provisionAdlsRoute(req, res);
        
        // Log user activity for successful provisioning (error cases logged inside function)
        if (res.statusCode === 200) {
          const body = req.body;
          await logUserActivity(
            req,
            "CREATE_ADLS_STORAGE",
            "STORAGE_MANAGEMENT",
            `ADLS Gen2 Storage: ${body.storageAccountName}/${body.filesystemName} (SFTP: ${body.enableSftp ?? true}, HNS: ${body.enableHns ?? true})`,
            "STORAGE_ACCOUNT",
            { organizationId: pathOrgId },
          );
        }
      } catch (error: any) {
        console.error("ADLS provisioning error:", error);
        // Error handling is done inside provisionAdlsRoute
      }
    },
  );

  // File management routes - SECURE: Uses organization ID instead of exposing storage details
  app.get(
    "/api/files",
    tokenRequired,
    organizationAccessRequired,
    fileReadAccessRequired, // Allows users with viewFiles, downloadFile, or downloadFolder to list files
    async (req, res) => {
      try {
        // Use pre-validated organization ID from middleware
        const organizationId = (req as any).validatedOrganizationId;
        const pathRaw = (req.query.path as string) || "";

        // Security: Validate path parameter to prevent path traversal and null bytes
        const pathValidation = validatePath(pathRaw, 'Path');
        if (!pathValidation.valid) {
          return res.status(400).json({ 
            error: pathValidation.error,
            field: 'path'
          });
        }
        const path = pathValidation.sanitized!;

        // Get storage account details from organization mapping (SECURE)
        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res
            .status(404)
            .json({ error: "No storage account found for this organization" });
        }

        // SECURITY: Validate storage account name before Azure SDK URL construction
        const storageAcctValidation = validateStorageAccountName(storageAccount.name);
        if (!storageAcctValidation.valid) {
          return res.status(500).json({
            error: "Storage account validation failed",
            details: storageAcctValidation.error,
            field: 'storageAccountName'
          });
        }
        const validatedStorageAccountName = storageAcctValidation.sanitized!;

        if (!credential) {
          return res
            .status(500)
            .json({ error: "Azure credentials not configured" });
        }

        console.log(
          `[FILES API] Attempting to connect to storage account: ${validatedStorageAccountName}`,
        );
        console.log(
          `[FILES API] Using credential type: ${credential.constructor.name}`,
        );
        console.log(
          `[FILES API] Storage account type: ${storageAccount.kind}`,
        );

        const files: any[] = [];

        // Use different clients based on storage account type
        if (storageAccount.kind === 'adls') {
          // ADLS Gen2 storage account - use DataLakeServiceClient
          const dataLakeService = new DataLakeServiceClient(
            `https://${validatedStorageAccountName}.dfs.core.windows.net`,
            credential!,
          );

          console.log(
            `[FILES API] DataLakeServiceClient created, getting filesystem client for container: ${storageAccount.containerName}`,
          );
          const fsClient = dataLakeService.getFileSystemClient(storageAccount.containerName);

          console.log(`[FILES API] Starting ADLS file listing for path: "${path}"`);

          // Add timeout wrapper for the listing operation
          const listingPromise = (async () => {
            const listResponse = fsClient.listPaths({
              path: path,
              recursive: false,
            });

            // Collect file items for metadata fetch
            const fileItems: any[] = [];

            for await (const pathItem of listResponse) {
              const pathName = pathItem.name || "";
              const fileName = pathName.split("/").pop() || pathName;

              // Skip the current path itself
              if (pathName === path) continue;

              // Pattern-based encryption detection for ADLS
              const isEncrypted = !pathItem.isDirectory && fileName.endsWith('.pgp');

              const fileEntry: any = {
                name: fileName,
                type: pathItem.isDirectory ? "directory" : "file",
                size: pathItem.contentLength,
                lastModified: pathItem.lastModified,
                path: pathName,
                scanResult: null,
                scanTime: null,
                isEncrypted,
              };

              // For files, we need to fetch metadata separately for vector store tracking
              if (!pathItem.isDirectory) {
                fileItems.push({ entry: fileEntry, pathName });
              } else {
                files.push(fileEntry);
              }
            }

            // Fetch metadata for files in parallel (limit concurrency to avoid rate limiting)
            const BATCH_SIZE = 10;
            for (let i = 0; i < fileItems.length; i += BATCH_SIZE) {
              const batch = fileItems.slice(i, i + BATCH_SIZE);
              await Promise.all(batch.map(async ({ entry, pathName }) => {
                try {
                  const fileClient = fsClient.getFileClient(pathName);
                  const properties = await fileClient.getProperties();
                  entry.metadata = properties.metadata || {};
                } catch (err) {
                  // If metadata fetch fails, continue without it
                  entry.metadata = {};
                }
                files.push(entry);
              }));
            }
          })();

          // Add 30 second timeout
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(
              () =>
                reject(
                  new Error("File listing operation timed out after 30 seconds"),
                ),
              30000,
            );
          });

          await Promise.race([listingPromise, timeoutPromise]);
        } else {
          // Regular blob storage account - use BlobServiceClient
          const blobService = new BlobServiceClient(
            `https://${validatedStorageAccountName}.blob.core.windows.net`,
            credential!,
          );

          console.log(
            `[FILES API] BlobServiceClient created, getting container client for container: ${storageAccount.containerName}`,
          );
          const containerClient = blobService.getContainerClient(storageAccount.containerName);

          console.log(`[FILES API] Starting blob file listing for path: "${path}"`);

          // Add timeout wrapper for the listing operation
          const listingPromise = (async () => {
            const prefix = path ? `${path}/` : "";
            const delimiter = "/";
            
            // Include metadata to detect encrypted files
            const listResponse = containerClient.listBlobsByHierarchy(delimiter, { 
              prefix,
              includeMetadata: true 
            });

            for await (const item of listResponse) {
              if (item.kind === "prefix") {
                // This is a directory
                const dirName = item.name.slice(prefix.length).replace(/\/$/, "");
                if (dirName) {
                  files.push({
                    name: dirName,
                    type: "directory",
                    size: null,
                    lastModified: null,
                    path: item.name.replace(/\/$/, ""),
                  });
                }
              } else {
                // This is a file
                const fileName = item.name.slice(prefix.length);
                if (fileName) {
                  // Check for encryption metadata
                  const metadata = item.metadata || {};
                  const isEncrypted = metadata.isencrypted === 'true';
                  
                  const fileEntry: any = {
                    name: fileName,
                    type: "file",
                    size: item.properties.contentLength,
                    lastModified: item.properties.lastModified,
                    path: item.name,
                    scanResult: null,
                    scanTime: null,
                    accessTier: item.properties.accessTier || null,
                    archiveStatus: (item.properties as any).archiveStatus || null,
                    rehydratePriority: (item.properties as any).rehydratePriority || null,
                    // Add encryption metadata if present
                    isEncrypted,
                    encryptionKeyId: isEncrypted ? metadata.encryptionkeyid : undefined,
                    encryptionKeyVersion: isEncrypted ? parseInt(metadata.encryptionkeyversion || '1', 10) : undefined,
                    encryptedAt: isEncrypted ? metadata.encryptedat : undefined,
                    // Include full metadata for Foundry vector store tracking
                    metadata: metadata,
                  };

                  files.push(fileEntry);
                }
              }
            }
          })();

          // Add 30 second timeout
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(
              () =>
                reject(
                  new Error("File listing operation timed out after 30 seconds"),
                ),
              30000,
            );
          });

          await Promise.race([listingPromise, timeoutPromise]);
        }

        console.log(`[FILES API] Successfully listed ${files.length} items`);

        // Log file listing activity
        await logUserActivity(
          req,
          "VIEW_FILES",
          "FILE_MANAGEMENT",
          `Org:${organizationId}${path ? "/" + path : ""}`,
          "DIRECTORY",
          { organizationId },
        );

        res.json(files);
      } catch (error: any) {
        console.error("File listing error:", error);
        
        // Check specifically for Azure Storage AuthorizationPermissionMismatch error
        // This error occurs when the managed identity lacks RBAC roles on the storage account
        if (error.code === 'AuthorizationPermissionMismatch' || 
            error.details?.errorCode === 'AuthorizationPermissionMismatch') {
          const storageAccount = await storage.getStorageAccountByOrganization((req as any).validatedOrganizationId);
          const accountName = storageAccount?.name || 'storage account';
          
          console.error(`🔒 [AZURE RBAC] AuthorizationPermissionMismatch detected for storage account: ${accountName}`);
          
          return res.status(403).json({ 
            error: "Azure Role Assignment Required",
            accountName: accountName,
            message: `The App Service managed identity does not have the required permissions to access files in ${accountName}.`,
            details: "Please assign 'Storage Blob Data Reader' or 'Storage Blob Data Contributor' role to the App Service managed identity via Azure Portal.",
            instructions: [
              `1. Go to Azure Portal and navigate to your storage account: ${accountName}`,
              "2. Click 'Access Control (IAM)' in the left menu",
              "3. Click 'Add' → 'Add role assignment'",
              "4. Select 'Storage Blob Data Contributor' role",
              "5. Under 'Members', choose 'Managed Identity'",
              "6. Find and select your Zapper App Service managed identity",
              "7. Click 'Review + assign' to complete the setup"
            ],
            azureRoleRequired: "Storage Blob Data Contributor or Storage Blob Data Reader"
          });
        }
        
        // For other errors (including other 403s), return generic error
        res.status(500).json({ error: "Failed to list files" });
      }
    },
  );

  // ==========================================
  // ADLS Gen2 Recursive File Search Endpoint
  // ==========================================
  // Searches for files by name anywhere within a container/filesystem,
  // including nested directories and subdirectories.
  // Uses server-side recursive traversal with pagination support.
  app.get(
    "/api/adls/search",
    tokenRequired,
    organizationAccessRequired,
    fileManagementPermissionRequired('searchFiles'),
    async (req, res) => {
      const startTime = Date.now();
      
      try {
        // Get validated organization ID from middleware
        const organizationId = (req as any).validatedOrganizationId;
        
        // Extract and validate query parameters
        const {
          q,
          match = 'substring',
          caseSensitive = 'false',
          pathPrefix,
          pageSize: pageSizeParam = '200',
          continuationToken,
        } = req.query;
        
        // Validate required query parameter
        if (!q || typeof q !== 'string' || q.trim().length === 0) {
          return res.status(400).json({
            error: "Search query is required",
            field: "q",
            message: "Please provide a non-empty search query"
          });
        }
        
        // Validate query string using search-specific validation
        // This allows underscores and common filename characters (unlike validateFilterString)
        const queryValidation = validateSearchQuery(q.trim(), 'Search query', 200);
        if (!queryValidation.valid) {
          return res.status(400).json({
            error: queryValidation.error,
            field: "q"
          });
        }
        const searchQuery = queryValidation.sanitized!;
        
        // Validate match mode
        const matchMode = match === 'exact' ? 'exact' : 'substring';
        
        // Parse case sensitivity
        const isCaseSensitive = caseSensitive === 'true';
        
        // Validate and parse page size
        const maxPageSize = parseInt(process.env.ZAPPER_SEARCH_MAX_PAGE_SIZE || '1000', 10);
        const defaultPageSize = parseInt(process.env.ZAPPER_SEARCH_DEFAULT_PAGE_SIZE || '200', 10);
        let pageSize = parseInt(pageSizeParam as string, 10);
        if (isNaN(pageSize) || pageSize < 1) {
          pageSize = defaultPageSize;
        } else if (pageSize > maxPageSize) {
          pageSize = maxPageSize;
        }
        
        // Validate path prefix if provided
        let validatedPathPrefix: string | undefined;
        if (pathPrefix && typeof pathPrefix === 'string' && pathPrefix.trim().length > 0) {
          const pathValidation = validatePath(pathPrefix.trim(), 'Path prefix');
          if (!pathValidation.valid) {
            return res.status(400).json({
              error: pathValidation.error,
              field: "pathPrefix"
            });
          }
          validatedPathPrefix = pathValidation.sanitized!;
        }
        
        // Get storage account for this organization
        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res.status(404).json({
            error: "No storage account found for this organization"
          });
        }
        
        // Ensure this is an ADLS Gen2 storage account
        if (storageAccount.kind !== 'adls') {
          return res.status(400).json({
            error: "Search is only supported for ADLS Gen2 storage accounts",
            message: "This feature requires Azure Data Lake Storage Gen2 with Hierarchical Namespace enabled"
          });
        }
        
        // Validate storage account name
        const storageNameValidation = validateStorageAccountName(storageAccount.name);
        if (!storageNameValidation.valid) {
          return res.status(500).json({
            error: "Storage account validation failed",
            details: storageNameValidation.error
          });
        }
        const validatedStorageAccountName = storageNameValidation.sanitized!;
        
        if (!credential) {
          return res.status(500).json({
            error: "Azure credentials not configured"
          });
        }
        
        console.log(`🔍 [SEARCH] Starting search for "${searchQuery}" in ${validatedStorageAccountName}/${storageAccount.containerName}`);
        console.log(`🔍 [SEARCH] Options: match=${matchMode}, caseSensitive=${isCaseSensitive}, pathPrefix=${validatedPathPrefix || '(root)'}, pageSize=${pageSize}`);
        
        // Create DataLake service client
        const dataLakeService = new DataLakeServiceClient(
          `https://${validatedStorageAccountName}.dfs.core.windows.net`,
          credential,
        );
        const fsClient = dataLakeService.getFileSystemClient(storageAccount.containerName);
        
        // Prepare search results
        const results: any[] = [];
        let resultContinuationToken: string | undefined;
        let totalScanned = 0;
        let timedOut = false;
        
        // Server-side timeout (configurable, default 10 seconds)
        const searchTimeout = parseInt(process.env.ZAPPER_SEARCH_TIMEOUT_MS || '10000', 10);
        const timeoutAt = Date.now() + searchTimeout;
        
        // Prepare the search pattern
        const searchPattern = isCaseSensitive ? searchQuery : searchQuery.toLowerCase();
        
        // Helper function to check if filename matches
        const matchesSearch = (fileName: string): boolean => {
          const nameToCheck = isCaseSensitive ? fileName : fileName.toLowerCase();
          if (matchMode === 'exact') {
            return nameToCheck === searchPattern;
          }
          return nameToCheck.includes(searchPattern);
        };
        
        try {
          // Use recursive listing to search through all directories
          const listOptions: any = {
            recursive: true,
          };
          
          // If path prefix is provided, scope the search
          if (validatedPathPrefix) {
            listOptions.path = validatedPathPrefix;
          }
          
          // If continuation token provided, use it
          // Note: ADLS continuation tokens are passed via iterator.next() in byPage()
          const iterator = fsClient.listPaths(listOptions).byPage({
            maxPageSize: 5000, // Fetch larger batches for efficiency
            continuationToken: continuationToken as string | undefined,
          });
          
          // Iterate through pages
          pageLoop:
          for await (const page of iterator) {
            // Check timeout
            if (Date.now() > timeoutAt) {
              timedOut = true;
              resultContinuationToken = page.continuation;
              console.log(`🔍 [SEARCH] Timeout reached after scanning ${totalScanned} items`);
              break;
            }
            
            const pathItems = page.pathItems || [];
            
            for (const pathItem of pathItems) {
              totalScanned++;
              
              // Check timeout periodically
              if (totalScanned % 1000 === 0 && Date.now() > timeoutAt) {
                timedOut = true;
                resultContinuationToken = page.continuation;
                console.log(`🔍 [SEARCH] Timeout reached after scanning ${totalScanned} items`);
                break pageLoop;
              }
              
              const pathName = pathItem.name || "";
              const fileName = pathName.split("/").pop() || pathName;
              
              // Skip directories in results (we're searching for files)
              if (pathItem.isDirectory) continue;
              
              // Check if filename matches search pattern
              if (matchesSearch(fileName)) {
                // Pattern-based encryption detection
                const isEncrypted = fileName.endsWith('.pgp') || 
                                   fileName.endsWith('.gpg') || 
                                   fileName.endsWith('.asc');
                
                results.push({
                  name: fileName,
                  path: pathName,
                  isDirectory: false,
                  size: pathItem.contentLength,
                  lastModified: pathItem.lastModified,
                  isEncrypted,
                });
                
                // Check if we have enough results
                if (results.length >= pageSize) {
                  resultContinuationToken = page.continuation;
                  console.log(`🔍 [SEARCH] Page filled with ${results.length} results, continuation available`);
                  break pageLoop;
                }
              }
            }
            
            // Store continuation token for next page
            if (page.continuation && results.length < pageSize) {
              resultContinuationToken = page.continuation;
            } else if (!page.continuation) {
              // No more pages
              resultContinuationToken = undefined;
            }
          }
        } catch (listError: any) {
          console.error(`🔍 [SEARCH] Error during listing:`, listError);
          
          // Handle Azure authorization errors
          if (listError.code === 'AuthorizationPermissionMismatch' ||
              listError.details?.errorCode === 'AuthorizationPermissionMismatch') {
            return res.status(403).json({
              error: "Azure Role Assignment Required",
              accountName: validatedStorageAccountName,
              message: `The App Service managed identity does not have permission to access files in ${validatedStorageAccountName}.`,
              details: "Please assign 'Storage Blob Data Reader' or 'Storage Blob Data Contributor' role."
            });
          }
          
          throw listError;
        }
        
        const durationMs = Date.now() - startTime;
        console.log(`🔍 [SEARCH] Completed: ${results.length} matches found, ${totalScanned} items scanned in ${durationMs}ms`);
        
        // Log search activity
        await logUserActivity(
          req,
          "SEARCH_FILES",
          "FILE_MANAGEMENT",
          `Org:${organizationId} Query:"${searchQuery}" Results:${results.length}`,
          "SEARCH",
          { organizationId },
        );
        
        // Build response
        const response: any = {
          items: results,
          resultCount: results.length,
          searchMetadata: {
            query: searchQuery,
            matchMode,
            caseSensitive: isCaseSensitive,
            scopePath: validatedPathPrefix || null,
            pageSize,
            durationMs,
            itemsScanned: totalScanned,
            timedOut,
          },
        };
        
        // Include continuation token if there are more results
        if (resultContinuationToken) {
          response.continuationToken = resultContinuationToken;
        }
        
        res.json(response);
        
      } catch (error: any) {
        const durationMs = Date.now() - startTime;
        console.error(`🔍 [SEARCH] Error after ${durationMs}ms:`, error);
        
        res.status(500).json({
          error: "Search failed",
          message: error.message || "An unexpected error occurred during search"
        });
      }
    },
  );

  app.post(
    "/api/files/create-directory",
    tokenRequired,
    organizationAccessRequired,
    fileManagementPermissionRequired('createFolder'),
    async (req, res) => {
      try {
        // Use pre-validated organization ID from middleware
        const organizationId = (req as any).validatedOrganizationId;
        const { path: pathRaw, directoryName } = req.body;

        // Security: Validate path parameter to prevent path traversal and null bytes
        const pathValidation = validatePath(pathRaw, 'Path');
        if (!pathValidation.valid) {
          return res.status(400).json({ 
            error: pathValidation.error,
            field: 'path'
          });
        }
        const path = pathValidation.sanitized!;

        // Get storage account details from organization mapping (SECURE)
        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res
            .status(404)
            .json({ error: "No storage account found for this organization" });
        }

        // SECURITY: Validate storage account name before Azure SDK URL construction
        const createDirValidation = validateStorageAccountName(storageAccount.name);
        if (!createDirValidation.valid) {
          return res.status(500).json({
            error: "Storage account validation failed",
            details: createDirValidation.error,
            field: 'storageAccountName'
          });
        }
        const validatedCreateDirName = createDirValidation.sanitized!;

        if (!credential) {
          return res
            .status(500)
            .json({ error: "Azure credentials not configured" });
        }

        const dataLakeService = new DataLakeServiceClient(
          `https://${validatedCreateDirName}.dfs.core.windows.net`,
          credential!,
        );
        const fsClient = dataLakeService.getFileSystemClient(storageAccount.containerName);

        const fullPath = path ? `${path}/${directoryName}` : directoryName;
        const directoryClient = fsClient.getDirectoryClient(fullPath);
        await directoryClient.create();

        // Log directory creation activity
        await logUserActivity(
          req,
          "CREATE_DIRECTORY",
          "FILE_MANAGEMENT",
          `Org:${organizationId}/${fullPath}`,
          "DIRECTORY",
          { organizationId },
        );

        res.json({ success: true, message: "Directory created successfully" });
      } catch (error: any) {
        console.error("Directory creation error:", error);
        res
          .status(500)
          .json({ error: error?.message || "Failed to create directory" });
      }
    },
  );

  app.post(
    "/api/files/upload-file",
    tokenRequired,
    organizationAccessRequired,
    fileManagementPermissionRequired('uploadFile'),
    (req, res, next) => {
      const uploadStartTime = Date.now();
      console.log(`📁 [TIMING] Upload request started at: ${new Date(uploadStartTime).toISOString()}`);
      console.log(`📁 [DEBUG] Starting file upload with mode: ${FILE_UPLOAD_MODE}`);

      // === EARLY EXIT FOR SAS MODE ===
      if (FILE_UPLOAD_MODE === "sas") {
        const sasCheckTime = Date.now();
        console.log(`📁 [TIMING] SAS mode check completed in: ${sasCheckTime - uploadStartTime}ms`);
        console.log(`📁 [SAS] Direct upload mode detected. Skipping multer...`);
        return res.status(400).json({
          error: "Direct file uploads disabled. Use SAS-based upload instead.",
          sasEndpoint: "/api/files/generate-sas",
        });
      }

      // === ONLY INITIALIZE MULTER IF NOT SAS ===
      console.log(`📁 [DEBUG] Upload directory: ${UPLOAD_DIR}`);
      console.log(`📁 [DEBUG] Memory limit: ${MEMORY_UPLOAD_LIMIT_MB}MB`);
      
      upload.array("files")(req, res, (err) => {
        const multerEndTime = Date.now();
        console.log(`📁 [TIMING] Multer processing completed in: ${multerEndTime - uploadStartTime}ms`);
        
        if (err) {
          console.error(`📁 [ERROR] Upload failed after ${multerEndTime - uploadStartTime}ms:`, {
            code: err.code,
            message: err.message,
            mode: FILE_UPLOAD_MODE,
            stack: err.stack
          });
          
          // Handle multer errors with user-friendly messages
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
              error: `File size exceeds limit. Please use SAS mode for larger files.`
            });
          }
          if (err.code === 'FILE_TOO_LARGE') {
            return res.status(400).json({
              error: err.message
            });
          }
          // Handle other multer errors
          return res.status(400).json({
            error: `File upload error: ${err.message}`
          });
        }
        
        console.log(`📁 [DEBUG] Upload successful, proceeding to processing`);
        console.log(`📁 [TIMING] Multer upload successful after: ${multerEndTime - uploadStartTime}ms`);
        next();
      });
    },
    async (req, res) => {
      try {
        const processingStartTime = Date.now();
        console.log(`📁 [TIMING] File processing started at: ${new Date(processingStartTime).toISOString()}`);
        console.log(`📁 [DEBUG] Processing file upload using ${FILE_UPLOAD_MODE} mode`);
        // Use pre-validated organization ID from middleware
        const organizationId = (req as any).validatedOrganizationId;
        const { path: pathRaw, fileRelativePaths, encrypt } = req.body;
        const files = req.files as Express.Multer.File[];
        
        // Parse encrypt flag (can be string "true" or boolean true)
        const shouldEncrypt = encrypt === true || encrypt === "true";

        // Security: Validate path parameter to prevent path traversal and null bytes
        const pathValidation = validatePath(pathRaw, 'Path');
        if (!pathValidation.valid) {
          return res.status(400).json({ 
            error: pathValidation.error,
            field: 'path'
          });
        }
        const path = pathValidation.sanitized!;

        console.log(`📁 [DEBUG] Received files:`, files?.map(f => ({
          name: f.originalname,
          size: f.size,
          encoding: f.encoding,
          mimetype: f.mimetype,
          hasBuffer: !!f.buffer,
          hasPath: !!f.path
        })));

        if (!files || files.length === 0) {
          console.log(`📁 [ERROR] No files provided in request`);
          return res.status(400).json({ error: "No files provided" });
        }

        // Get storage account details from organization mapping (SECURE)
        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res
            .status(404)
            .json({ error: "No storage account found for this organization" });
        }

        // SECURITY: Validate storage account name before Azure SDK URL construction
        const uploadValidation = validateStorageAccountName(storageAccount.name);
        if (!uploadValidation.valid) {
          return res.status(500).json({
            error: "Storage account validation failed",
            details: uploadValidation.error,
            field: 'storageAccountName'
          });
        }
        const validatedUploadName = uploadValidation.sanitized!;

        if (!credential) {
          return res
            .status(500)
            .json({ error: "Azure credentials not configured" });
        }

        const dataLakeService = new DataLakeServiceClient(
          `https://${validatedUploadName}.dfs.core.windows.net`,
          credential!,
        );
        const fsClient = dataLakeService.getFileSystemClient(storageAccount.containerName);
        
        // Get user info for encryption metadata
        const token = req.headers.authorization?.split(" ")[1];
        const user = await verifyToken(token!);
        const userEmail = user?.email || "unknown";

        // GEO-FENCING: Enforce geographic access restrictions before upload
        try {
          const logContext = await getActivityLoggingContext(req, organizationId);
          (req as any).organizationName = logContext.organizationName;
          (req as any).roleId = logContext.roleId;
          (req as any).roleName = logContext.roleName;

          await enforceGeoAccess({
            req,
            orgId: organizationId,
            userId: user?.id,
            operation: 'upload',
          });
        } catch (geoError: any) {
          if (isGeoRestrictionError(geoError)) {
            console.warn(`[GEO] Upload blocked for user ${userEmail} from country ${geoError.country}`);
            return res.status(403).json({
              code: 'GEO_RESTRICTED',
              message: geoError.message,
            });
          }
          throw geoError;
        }

        // Parse relative paths if provided (for folder uploads)
        let relativePaths: string[] = [];
        if (fileRelativePaths) {
          try {
            relativePaths = JSON.parse(fileRelativePaths);
          } catch (e) {
            console.warn("Failed to parse fileRelativePaths:", e);
          }
        }
        
        // Get PGP key if encryption is requested
        let pgpKey: any = null;
        if (shouldEncrypt) {
          pgpKey = await storage.getOrgPgpKey(organizationId);
          if (!pgpKey) {
            return res.status(400).json({ 
              error: "Encryption requested but no PGP key configured for this organization" 
            });
          }
          console.log(`🔐 [ENCRYPTION] PGP encryption enabled for upload, using key: ${pgpKey.keyId}`);
        }

        const createdDirs = new Set(); // Cache to avoid redundant directory creation
        const azureStartTime = Date.now();
        console.log(`📁 [TIMING] Azure upload process starting at: ${new Date(azureStartTime).toISOString()}`);

        // Initialize file transfer report for multi-file uploads
        const { fileTransferReportService } = await import("./fileTransferReportService");
        let reportActionId: string | null = null;
        const fileResults: Array<{ fullPath: string; status: "SUCCESS" | "FAILED"; sizeBytes?: number; error?: string }> = [];
        
        if (files.length >= 1) {
          try {
            const { actionId } = await fileTransferReportService.initializeReport(
              organizationId,
              user?.id || 0,
              "UPLOAD",
              files.length,
              storageAccount.name,
              storageAccount.containerName,
              userEmail,
              user?.name
            );
            reportActionId = actionId;
            console.log(`📊 [REPORT] Initialized upload report: ${reportActionId}`);
          } catch (reportErr) {
            console.error("📊 [REPORT] Failed to initialize report:", reportErr);
          }
        }

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const fileStartTime = Date.now();
          const originalFileName = file.originalname;
          let fullPath = relativePaths[i]
            ? (path ? `${path}/${relativePaths[i]}` : relativePaths[i])
            : (path ? `${path}/${originalFileName}` : originalFileName);
          
          // If encrypting, only add .pgp extension - keep same folder structure
          let isEncrypted = false;
          if (shouldEncrypt && pgpKey) {
            // Add .pgp extension but keep same folder structure
            fullPath = `${fullPath}.pgp`;
            isEncrypted = true;
            console.log(`🔐 [ENCRYPTION] Encrypting file: ${originalFileName} -> ${fullPath}`);
          }
          
          console.log(`📁 [TIMING] Processing file ${i + 1}/${files.length}: ${originalFileName} (${Math.round(file.size / 1024)}KB)${isEncrypted ? ' [ENCRYPTED]' : ''}`);

          try {
            // Create parent directories if needed
            const pathParts = fullPath.split("/");
            if (pathParts.length > 1) {
              let currentPath = "";
              for (let j = 0; j < pathParts.length - 1; j++) {
                currentPath += pathParts[j];
                if (!createdDirs.has(currentPath)) {
                  try {
                    await fsClient.getDirectoryClient(currentPath).createIfNotExists();
                    createdDirs.add(currentPath);
                  } catch (err) {
                    console.log(`Directory ${currentPath} might already exist`);
                  }
                }
                currentPath += "/";
              }
            }

            const fileClient = fsClient.getFileClient(fullPath);
            await fileClient.create();

            // Get file data (either from disk or memory)
            let fileData: Buffer;
            if (FILE_UPLOAD_MODE === "disk" && file.path) {
              fileData = fs.readFileSync(file.path);
              // Clean temp file after reading
              fs.unlink(file.path, (err) => {
                if (err) console.error("Error cleaning up temp file:", err);
              });
            } else {
              fileData = file.buffer;
            }
            
            // Encrypt file data if encryption is enabled
            if (isEncrypted && pgpKey) {
              console.log(`🔐 [ENCRYPTION] Encrypting ${originalFileName} (${Math.round(fileData.length / 1024)}KB)...`);
              const encryptStartTime = Date.now();
              try {
                fileData = await encryptFileData(fileData, pgpKey.publicKeyArmored);
                const encryptEndTime = Date.now();
                console.log(`🔐 [ENCRYPTION] Encryption completed in ${encryptEndTime - encryptStartTime}ms, encrypted size: ${Math.round(fileData.length / 1024)}KB`);
              } catch (encryptError: any) {
                console.error(`🔐 [ENCRYPTION] Failed to encrypt ${originalFileName}:`, encryptError);
                // Log encryption failure for audit trail
                try {
                  await logUserActivity(
                    req,
                    "FILE_ENCRYPT_FAILED",
                    "FILE_MANAGEMENT",
                    `Org:${organizationId}/${fullPath} - Error: ${encryptError?.message || 'Unknown encryption error'}`,
                    "FILE",
                    { organizationId },
                  );
                } catch (logError) {
                  console.error("Failed to log encryption failure activity:", logError);
                }
                fileResults.push({ fullPath, status: "FAILED", sizeBytes: file.size, error: encryptError?.message || "Encryption failed" });
                continue; // Skip this file but continue with others
              }
            }
            
            // Upload the file data (encrypted or plain)
            await fileClient.append(fileData, 0, fileData.length);
            await fileClient.flush(fileData.length);
            
            // Set blob metadata for encrypted files using Azure Blob SDK
            if (isEncrypted && pgpKey) {
              const blobServiceClient = new BlobServiceClient(
                `https://${storageAccount.name}.blob.core.windows.net`,
                credential!,
              );
              const containerClient = blobServiceClient.getContainerClient(storageAccount.containerName);
              const blobClient = containerClient.getBlobClient(fullPath);
              
              await blobClient.setMetadata({
                isEncrypted: "true",
                encryptionKeyId: pgpKey.keyId,
                encryptionKeyVersion: "1",
                encryptedAt: new Date().toISOString(),
                encryptedByUserId: String(user?.id || ""),
                encryptedByUserEmail: userEmail,
                organizationId: String(organizationId),
                originalFileName: originalFileName,
              });
              console.log(`🔐 [ENCRYPTION] Blob metadata set for ${fullPath}`);
            }

            const fileEndTime = Date.now();
            console.log(`📁 [TIMING] File ${originalFileName} uploaded in: ${fileEndTime - fileStartTime}ms`);

            // Database logging
            await logUserActivity(
              req,
              isEncrypted ? "FILE_ENCRYPTED" : "UPLOAD_FILE",
              "FILE_MANAGEMENT",
              `Org:${organizationId}/${fullPath}`,
              "FILE",
              { organizationId },
            );
            
            fileResults.push({ fullPath, status: "SUCCESS", sizeBytes: file.size });
          } catch (fileError: any) {
            console.error(`📁 [ERROR] Failed to upload file ${fullPath}:`, fileError);
            fileResults.push({ fullPath, status: "FAILED", sizeBytes: file.size, error: fileError?.message || "Upload failed" });
          }
        }

        // Finalize the transfer report
        if (reportActionId) {
          try {
            await fileTransferReportService.finalizeReport(reportActionId, fileResults, userEmail, user?.name);
            console.log(`📊 [REPORT] Finalized upload report: ${reportActionId}`);
          } catch (reportErr) {
            console.error("📊 [REPORT] Failed to finalize report:", reportErr);
          }
        }

        const totalEndTime = Date.now();
        const totalUploadTime = totalEndTime - processingStartTime;
        const azureUploadTime = totalEndTime - azureStartTime;
        
        const successCount = fileResults.filter(f => f.status === "SUCCESS").length;
        const failureCount = fileResults.filter(f => f.status === "FAILED").length;
        
        console.log(`📁 [TIMING] === UPLOAD COMPLETE ===`);
        console.log(`📁 [TIMING] Total processing time: ${totalUploadTime}ms`);
        console.log(`📁 [TIMING] Azure upload time: ${azureUploadTime}ms`);
        console.log(`📁 [TIMING] Files processed: ${files.length} (${successCount} success, ${failureCount} failed)`);
        console.log(`📁 [TIMING] Average time per file: ${Math.round(azureUploadTime / files.length)}ms`);
        console.log(`📁 [TIMING] Total data uploaded: ${Math.round(files.reduce((sum, f) => sum + f.size, 0) / 1024)}KB`);

        res.json({ 
          success: failureCount === 0, 
          message: failureCount === 0 ? "Files uploaded successfully" : `${successCount} files uploaded, ${failureCount} failed`,
          timing: {
            totalTime: totalUploadTime,
            azureUploadTime: azureUploadTime,
            filesCount: files.length,
            avgTimePerFile: Math.round(azureUploadTime / files.length)
          },
          reportId: reportActionId,
          summary: { successCount, failureCount, total: files.length }
        });
      } catch (error: any) {
        console.error("File upload error:", error);
        res
          .status(500)
          .json({ error: error?.message || "Failed to upload files" });
      }
    },
  );

  // SAS-based direct upload endpoint
  app.post(
    "/api/files/generate-sas",
    tokenRequired,
    organizationAccessRequired,
    fileManagementPermissionRequired('uploadFile'),
    async (req, res) => {
      try {
        const sasStartTime = Date.now();
        console.log(`📁 [TIMING] SAS generation started at: ${new Date(sasStartTime).toISOString()}`);
        console.log(`📁 [SAS] === SAS URL Generation Request ===`);
        console.log(`📁 [SAS] Files to process: ${req.body.files?.length || 0}`);
        console.log(`📁 [SAS] Organization ID: ${req.body.organizationId}`);
        console.log(`📁 [SAS] Base path: ${req.body.path || 'root'}`);
        
        // Use pre-validated organization ID from middleware
        const organizationId = (req as any).validatedOrganizationId;
        const { path: basePathRaw, files } = req.body;

        // Security: Validate path parameter to prevent path traversal and null bytes
        const pathValidation = validatePath(basePathRaw, 'Base path');
        if (!pathValidation.valid) {
          console.log(`📁 [SAS] ERROR: Invalid path - ${pathValidation.error}`);
          return res.status(400).json({ 
            error: pathValidation.error,
            field: 'path'
          });
        }
        const basePath = pathValidation.sanitized!;

        if (!files || !Array.isArray(files)) {
          console.log(`📁 [SAS] ERROR: Missing files array`);
          return res.status(400).json({
            error: "Files array is required",
          });
        }

        // SERVER-SIDE VALIDATION: Enforce upload limits from environment variables
        const MAX_FILES_PER_UPLOAD = (() => {
          const parsed = parseInt(process.env.ZAPPER_MAX_FILES_COUNT || "1000");
          return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
        })();
        
        const MAX_SIZE_GB = (() => {
          const parsed = parseInt(process.env.ZAPPER_MAX_UPLOAD_SIZE || "15");
          return Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
        })();
        
        const MAX_SIZE_BYTES = MAX_SIZE_GB * 1024 * 1024 * 1024;
        
        const fileCount = files.length;
        const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
        
        if (fileCount > MAX_FILES_PER_UPLOAD) {
          console.log(`📁 [SAS] ERROR: File count ${fileCount} exceeds limit of ${MAX_FILES_PER_UPLOAD}`);
          return res.status(400).json({
            error: `Upload exceeds maximum file limit. You're trying to upload ${fileCount.toLocaleString()} files, but the maximum is ${MAX_FILES_PER_UPLOAD.toLocaleString()} files per upload. Please split your upload into smaller batches.`,
            limit: "MAX_FILES",
            current: fileCount,
            maximum: MAX_FILES_PER_UPLOAD
          });
        }
        
        if (totalSize > MAX_SIZE_BYTES) {
          // Security: Use safer number handling to avoid precision issues with large file sizes
          // Calculate GB with proper rounding instead of parseFloat which can lose precision
          const totalSizeGB = Math.round((totalSize / (1024 * 1024 * 1024)) * 100) / 100;
          console.log(`📁 [SAS] ERROR: Total size ${totalSizeGB}GB exceeds limit of ${MAX_SIZE_GB}GB`);
          return res.status(400).json({
            error: `Upload exceeds maximum size limit. Total size is ${totalSizeGB}GB, but the maximum is ${MAX_SIZE_GB}GB per upload. Please split your upload into smaller batches.`,
            limit: "MAX_SIZE",
            currentGB: totalSizeGB,
            maximumGB: MAX_SIZE_GB,
            currentBytes: totalSize,
            maximumBytes: MAX_SIZE_BYTES
          });
        }
        
        console.log(`📁 [SAS] ✓ Validation passed: ${fileCount} files, ${(totalSize / (1024 * 1024)).toFixed(2)}MB total`);

        // Get storage account details from organization mapping (SECURE)
        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          console.log(`📁 [SAS] ERROR: No storage account found for organization ${organizationId}`);
          return res
            .status(404)
            .json({ error: "No storage account found for this organization" });
        }

        console.log(`📁 [SAS] Using storage account: ${storageAccount.name}`);
        console.log(`📁 [SAS] Using container: ${storageAccount.containerName}`);
        console.log(`📁 [SAS] Using resource group: ${storageAccount.resourceGroupName}`);

        // GEO-FENCING: Enforce geographic access restrictions before SAS generation
        const user = (req as any).user;
        try {
          const logContext = await getActivityLoggingContext(req, organizationId);
          (req as any).organizationName = logContext.organizationName;
          (req as any).roleId = logContext.roleId;
          (req as any).roleName = logContext.roleName;

          await enforceGeoAccess({
            req,
            orgId: organizationId,
            userId: user?.id,
            operation: 'generate-sas-upload',
          });
        } catch (geoError: any) {
          if (isGeoRestrictionError(geoError)) {
            console.warn(`[GEO] SAS generation blocked for user ${user?.email} from country ${geoError.country}`);
            return res.status(403).json({
              code: 'GEO_RESTRICTED',
              message: geoError.message,
            });
          }
          throw geoError;
        }

        console.log(`📁 [SAS] Files details:`, files.map(f => ({
          name: f.name,
          size: f.size ? `${Math.round(f.size / 1024)}KB` : 'unknown',
          type: f.type || 'unknown'
        })));

        if (!credential) {
          console.log(`📁 [SAS] ERROR: Azure credentials not configured`);
          console.log(`📁 [SAS] Required environment variables:`);
          console.log(`📁 [SAS] - ZAPPER_AZURE_SUBSCRIPTION_ID: ${process.env.ZAPPER_AZURE_SUBSCRIPTION_ID ? '✓ Set' : '✗ Missing'}`);
          console.log(`📁 [SAS] - ZAPPER_AZURE_RESOURCE_GROUP: ${process.env.ZAPPER_AZURE_RESOURCE_GROUP ? '✓ Set' : '✗ Missing'}`);
          console.log(`📁 [SAS] - ZAPPER_AZURE_TENANT_ID: ${process.env.ZAPPER_AZURE_TENANT_ID ? '✓ Set' : '✗ Missing'}`);
          console.log(`📁 [SAS] - ZAPPER_AZURE_CLIENT_ID: ${process.env.ZAPPER_AZURE_CLIENT_ID ? '✓ Set' : '✗ Missing'}`);
          console.log(`📁 [SAS] - ZAPPER_AZURE_CLIENT_SECRET: ${process.env.ZAPPER_AZURE_CLIENT_SECRET ? '✓ Set' : '✗ Missing'}`);
          return res
            .status(500)
            .json({ error: "Azure credentials not configured" });
        }

        console.log(`📁 [SAS] Azure credentials available - proceeding with SAS generation`);
        console.log(`📁 [SAS] Subscription ID: ${subscriptionId?.substring(0, 8)}...`);
        console.log(`📁 [SAS] Resource Group from storage account: ${storageAccount.resourceGroupName}`);

        // Get storage account key for SAS generation
        const keyFetchStartTime = Date.now();
        console.log(`📁 [SAS] Fetching storage account keys...`);
        const storageClient = new StorageManagementClient(
          credential,
          subscriptionId!,
        );
        const keys = await storageClient.storageAccounts.listKeys(
          storageAccount.resourceGroupName!,
          storageAccount.name,
        );

        if (!keys.keys || keys.keys.length === 0) {
          console.log(`📁 [SAS] ERROR: No storage account keys available`);
          return res
            .status(500)
            .json({ error: "No storage account keys available" });
        }

        const accountKey = keys.keys[0].value;
        if (!accountKey) {
          console.log(`📁 [SAS] ERROR: Storage account key is empty`);
          return res
            .status(500)
            .json({ error: "Storage account key is empty" });
        }

        const keyFetchEndTime = Date.now();
        console.log(`📁 [SAS] Storage account key retrieved successfully`);
        console.log(`📁 [TIMING] Key fetch time: ${keyFetchEndTime - keyFetchStartTime}ms`);

        // SECURITY: Validate storage account name before Azure SDK URL construction
        const sasAcctValidation = validateStorageAccountName(storageAccount.name);
        if (!sasAcctValidation.valid) {
          return res.status(500).json({
            error: "Storage account validation failed",
            details: sasAcctValidation.error,
            field: 'storageAccountName'
          });
        }
        const validatedSasAcctName = sasAcctValidation.sanitized!;

        // Create shared key credential for SAS generation
        console.log(`📁 [SAS] Creating shared key credential...`);
        const sharedKeyCredential = new StorageSharedKeyCredential(
          validatedSasAcctName,
          accountKey,
        );
        const blobServiceClient = new BlobServiceClient(
          `https://${validatedSasAcctName}.blob.core.windows.net`,
          sharedKeyCredential,
        );
        console.log(`📁 [SAS] Blob service client created for: ${storageAccount.name}.blob.core.windows.net`);

        const uploads: Array<{
          file: string;
          url: string;
          relativePath?: string;
        }> = [];

        // Validate and generate SAS for each file
        const sasGenerationStartTime = Date.now();
        console.log(`📁 [SAS] Starting SAS generation for ${files.length} files...`);
        for (let i = 0; i < files.length; i++) {
          const fileInfo = files[i];
          const { name, size, type, relativePath } = fileInfo;
          console.log(`📁 [SAS] Processing file ${i + 1}/${files.length}: ${name}`);

          // Validate file metadata
          if (!name || typeof name !== "string") {
            console.log(`📁 [SAS] ERROR: Invalid file name for file ${i + 1}: ${name}`);
            return res
              .status(400)
              .json({ error: `Invalid file name: ${name}` });
          }

          if (
            size &&
            typeof size === "number" &&
            size > 5 * 1024 * 1024 * 1024
          ) {
            // 5GB limit
            console.log(`📁 [SAS] ERROR: File ${name} exceeds 5GB size limit (${Math.round(size / 1024 / 1024 / 1024)}GB)`);
            return res
              .status(400)
              .json({ error: `File ${name} exceeds 5GB size limit` });
          }

          // Construct full blob path
          let blobPath: string;
          if (relativePath) {
            blobPath = basePath ? `${basePath}/${relativePath}` : relativePath;
          } else {
            blobPath = basePath ? `${basePath}/${name}` : name;
          }
          console.log(`📁 [SAS] Blob path for ${name}: ${blobPath}`);

          // Generate SAS token with write permissions
          const expiresOn = new Date(
            Date.now() + SAS_TIMEOUT_MINUTES * 60 * 1000,
          );
          const permissions = BlobSASPermissions.parse("cw"); // Create and Write permissions

          // Get client IP for SAS restriction (only if ZAPPER_USE_IP_FOR_SAS=true)
          const ipRange = getClientIpRange(req);

          const sasOptions: any = {
            containerName: storageAccount.containerName,
            blobName: blobPath,
            permissions,
            expiresOn,
            startsOn: new Date(Date.now() - 5 * 60 * 1000), // Start 5 minutes ago to account for clock skew
          };

          // Add IP restriction if available
          if (ipRange) {
            sasOptions.ipRange = ipRange;
            if (i === 0) { // Log only once per batch
              console.log(`📁 [UPLOAD-SAS] IP restriction applied: ${ipRange.start} - ${ipRange.end}`);
            }
          } else {
            if (i === 0) { // Log only once per batch
              console.log(`📁 [UPLOAD-SAS] No IP restriction applied`);
            }
          }

          const sasToken = generateBlobSASQueryParameters(
            sasOptions,
            sharedKeyCredential,
          ).toString();

          // SECURITY FIX: Encode blob path in final URL to handle special characters (#, %, ?)
          // Do NOT encode blobName in sasOptions - Azure SDK needs raw name for signature
          const sasUrl = `https://${storageAccount.name}.blob.core.windows.net/${storageAccount.containerName}/${encodeBlobPath(blobPath)}?${sasToken}`;

          uploads.push({
            file: name,
            url: sasUrl,
            relativePath: relativePath || name,
          });
        }

        // Skip database logging as per requirements
        // No activity logging for SAS generation

        const sasEndTime = Date.now();
        const totalSasTime = sasEndTime - sasStartTime;
        const sasGenerationTime = sasEndTime - sasGenerationStartTime;
        
        console.log(`📁 [SAS] === SAS GENERATION COMPLETE ===`);
        console.log(`📁 [TIMING] Total SAS request time: ${totalSasTime}ms`);
        console.log(`📁 [TIMING] SAS generation time: ${sasGenerationTime}ms`);
        console.log(`📁 [TIMING] Average time per SAS URL: ${Math.round(sasGenerationTime / files.length)}ms`);
        console.log(`📁 [SAS] Total SAS URLs generated: ${uploads.length}`);
        console.log(`📁 [SAS] Files ready for direct upload:`, uploads.map(u => u.file));
        console.log(`📁 [SAS] Response sent to client`);

        res.json({ 
          uploads,
          timing: {
            totalTime: totalSasTime,
            sasGenerationTime: sasGenerationTime,
            keyFetchTime: keyFetchEndTime - keyFetchStartTime,
            filesCount: files.length,
            avgTimePerSas: Math.round(sasGenerationTime / files.length)
          }
        });
      } catch (error: any) {
        console.error(`📁 [SAS] ERROR: SAS generation failed:`, error);
        console.error(`📁 [SAS] Error details:`, {
          message: error?.message,
          code: error?.code,
          stack: error?.stack?.split('\n').slice(0, 3).join('\n')
        });
        res
          .status(500)
          .json({ error: error?.message || "Failed to generate SAS URLs" });
      }
    },
  );

  // Log upload completion endpoint - Called by frontend after successful SAS uploads
  app.post(
    "/api/files/log-upload-completion",
    tokenRequired,
    organizationAccessRequired,
    fileManagementPermissionRequired('uploadFile'),
    async (req, res) => {
      try {
        console.log(`📝 [UPLOAD LOG] === UPLOAD COMPLETION LOGGING ENDPOINT CALLED ===`);
        console.log(`📝 [UPLOAD LOG] Request received at: ${new Date().toISOString()}`);
        console.log(`📝 [UPLOAD LOG] User: ${(req as any).user?.email || 'UNKNOWN'}`);
        console.log(`📝 [UPLOAD LOG] Request body:`, JSON.stringify(req.body, null, 2));
        
        const { organizationId, path: pathRaw, files } = req.body;
        const user = (req as any).user;
        const userEmail = user?.email || 'unknown';

        // Security: Validate path parameter to prevent path traversal and null bytes
        const pathValidation = validatePath(pathRaw, 'Path');
        if (!pathValidation.valid) {
          console.log(`❌ [UPLOAD LOG] Invalid path - ${pathValidation.error}`);
          return res.status(400).json({ 
            error: pathValidation.error,
            field: 'path'
          });
        }
        const path = pathValidation.sanitized!;

        if (!organizationId || !Array.isArray(files)) {
          console.log(`❌ [UPLOAD LOG] Invalid request - missing organizationId or files array`);
          return res.status(400).json({
            error: "Organization ID and files array are required",
          });
        }

        console.log(`📝 [UPLOAD LOG] Logging upload completion for ${files.length} files`);
        console.log(`📝 [UPLOAD LOG] Organization ID: ${organizationId}`);
        console.log(`📝 [UPLOAD LOG] Path: ${path || 'root'}`);
        console.log(`📝 [UPLOAD LOG] User Email: ${userEmail}`);

        // Look up the user by email to get their database ID
        const dbUser = await storage.getUserByEmail(userEmail);
        const userId = dbUser?.id || user?.id;
        console.log(`📊 [REPORT] User lookup: email=${userEmail}, dbUserId=${userId}`);

        // Get storage account for transfer report
        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        console.log(`📊 [REPORT] Storage account lookup result:`, storageAccount ? `Found: ${storageAccount.name}` : 'NOT FOUND');
        
        // Initialize file transfer report for SAS-based uploads
        const { fileTransferReportService } = await import("./fileTransferReportService");
        let reportActionId: string | null = null;
        const fileResults: Array<{ fullPath: string; status: "SUCCESS" | "FAILED"; sizeBytes?: number; error?: string }> = [];
        
        console.log(`📊 [REPORT] Checking conditions: files.length=${files.length}, storageAccount=${!!storageAccount}, userId=${userId}`);
        
        if (files.length >= 1 && storageAccount && userId) {
          console.log(`📊 [REPORT] Conditions met, creating transfer report...`);
          try {
            const { actionId } = await fileTransferReportService.initializeReport(
              organizationId,
              userId,
              "UPLOAD",
              files.length,
              storageAccount.name,
              storageAccount.containerName,
              userEmail,
              user?.name || dbUser?.name
            );
            reportActionId = actionId;
            console.log(`📊 [REPORT] Initialized SAS upload report: ${reportActionId}`);
          } catch (reportErr: any) {
            console.error("📊 [REPORT] Failed to initialize SAS upload report:", reportErr);
            console.error("📊 [REPORT] Error message:", reportErr?.message);
            console.error("📊 [REPORT] Error stack:", reportErr?.stack);
          }
        } else {
          console.log(`📊 [REPORT] Skipping report creation - conditions not met`);
          if (!storageAccount) {
            console.log(`📊 [REPORT] No storage account found for org ${organizationId}`);
          }
          if (!userId) {
            console.log(`📊 [REPORT] No user ID found for email ${userEmail}`);
          }
        }

        // Log upload activity for each file
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const filePath = path ? `${path}/${file.relativePath || file.name}` : (file.relativePath || file.name);
          
          console.log(`📝 [UPLOAD LOG] --- Processing file ${i + 1}/${files.length} ---`);
          console.log(`📝 [UPLOAD LOG] File name: ${file.name}`);
          console.log(`📝 [UPLOAD LOG] File path: ${filePath}`);
          console.log(`📝 [UPLOAD LOG] Calling logUserActivity...`);
          
          await logUserActivity(
            req,
            "UPLOAD_FILE",
            "FILE_MANAGEMENT",
            `Org:${organizationId}/${filePath}`,
            "FILE",
            { organizationId },
          );
          
          // Track file result for transfer report
          fileResults.push({
            fullPath: filePath,
            status: file.status === 'FAILED' ? 'FAILED' : 'SUCCESS',
            sizeBytes: file.size,
            error: file.error
          });
          
          console.log(`✅ [UPLOAD LOG] Successfully logged upload for: ${filePath}`);
        }

        // Finalize the transfer report
        if (reportActionId) {
          try {
            await fileTransferReportService.finalizeReport(reportActionId, fileResults, userEmail, user?.name);
            console.log(`📊 [REPORT] Finalized SAS upload report: ${reportActionId}`);
          } catch (reportErr) {
            console.error("📊 [REPORT] Failed to finalize SAS upload report:", reportErr);
          }
        }

        console.log(`✅ [UPLOAD LOG] === ALL UPLOADS LOGGED SUCCESSFULLY ===`);
        res.json({ 
          success: true, 
          message: `Logged ${files.length} file upload(s)`,
          reportActionId,
        });
      } catch (error: any) {
        console.error("❌ [UPLOAD LOG] === UPLOAD LOGGING FAILED ===");
        console.error("❌ [UPLOAD LOG] Error type:", error?.constructor?.name);
        console.error("❌ [UPLOAD LOG] Error message:", error?.message);
        console.error("❌ [UPLOAD LOG] Error stack:", error?.stack);
        console.error("❌ [UPLOAD LOG] Full error object:", error);
        res.status(500).json({ 
          error: error?.message || "Failed to log upload completion" 
        });
      }
    },
  );

  // === SECURE FILE MANAGEMENT ENDPOINTS ===
  // All endpoints below use organizationId instead of exposing storage account details

  // Delete file endpoint - SECURE: Uses organizationId
  app.delete(
    "/api/files/file",
    tokenRequired,
    organizationAccessRequired,
    fileManagementPermissionRequired('deleteFilesAndFolders'),
    async (req, res) => {
      try {
        const { organizationId, path } = req.body;

        if (!organizationId || !path) {
          return res
            .status(400)
            .json({ error: "Organization ID and path are required" });
        }

        // Get storage account details from organization mapping (SECURE)
        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res
            .status(404)
            .json({ error: "No storage account found for this organization" });
        }

        // SECURITY: Validate storage account name before Azure SDK URL construction
        const deleteFileValidation = validateStorageAccountName(storageAccount.name);
        if (!deleteFileValidation.valid) {
          return res.status(500).json({
            error: "Storage account validation failed",
            details: deleteFileValidation.error,
            field: 'storageAccountName'
          });
        }
        const validatedDeleteFileName = deleteFileValidation.sanitized!;

        if (!credential) {
          return res
            .status(500)
            .json({ error: "Azure credentials not configured" });
        }

        const dataLakeService = new DataLakeServiceClient(
          `https://${validatedDeleteFileName}.dfs.core.windows.net`,
          credential!,
        );
        const fsClient = dataLakeService.getFileSystemClient(storageAccount.containerName);
        const fileClient = fsClient.getFileClient(path);

        await fileClient.delete();

        // Cascade delete any CU analysis results for this file
        try {
          await cuPersistenceService.deleteAllResultsForFile(
            storageAccount.name,
            storageAccount.containerName,
            path
          );
        } catch (cuDeleteError: any) {
          console.warn(`[CU] Failed to cascade delete CU results for ${path}:`, cuDeleteError.message);
        }

        // Log file deletion activity
        await logUserActivity(
          req,
          "DELETE_FILE",
          "FILE_MANAGEMENT",
          `Org:${organizationId}/${path}`,
          "FILE",
          { organizationId },
        );

        res.json({ success: true, message: "File deleted successfully" });
      } catch (error: any) {
        console.error("File deletion error:", error);
        res
          .status(500)
          .json({ error: error?.message || "Failed to delete file" });
      }
    },
  );

  // Delete directory endpoint - SECURE: Uses organizationId
  app.delete(
    "/api/files/directory",
    tokenRequired,
    organizationAccessRequired,
    fileManagementPermissionRequired('deleteFilesAndFolders'),
    async (req, res) => {
      try {
        const { organizationId, path } = req.body;

        if (!organizationId || !path) {
          return res
            .status(400)
            .json({ error: "Organization ID and path are required" });
        }

        // Get storage account details from organization mapping (SECURE)
        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res
            .status(404)
            .json({ error: "No storage account found for this organization" });
        }

        // SECURITY: Validate storage account name before Azure SDK URL construction
        const deleteDirValidation = validateStorageAccountName(storageAccount.name);
        if (!deleteDirValidation.valid) {
          return res.status(500).json({
            error: "Storage account validation failed",
            details: deleteDirValidation.error,
            field: 'storageAccountName'
          });
        }
        const validatedDeleteDirName = deleteDirValidation.sanitized!;

        if (!credential) {
          return res
            .status(500)
            .json({ error: "Azure credentials not configured" });
        }

        const dataLakeService = new DataLakeServiceClient(
          `https://${validatedDeleteDirName}.dfs.core.windows.net`,
          credential!,
        );
        const fsClient = dataLakeService.getFileSystemClient(storageAccount.containerName);
        const directoryClient = fsClient.getDirectoryClient(path);

        await directoryClient.deleteIfExists(true);

        // Log directory deletion activity
        await logUserActivity(
          req,
          "DELETE_DIRECTORY",
          "FILE_MANAGEMENT",
          `Org:${organizationId}/${path}`,
          "DIRECTORY",
          { organizationId },
        );

        res.json({ success: true, message: "Directory deleted successfully" });
      } catch (error: any) {
        console.error("Directory deletion error:", error);
        res
          .status(500)
          .json({ error: error?.message || "Failed to delete directory" });
      }
    },
  );

  // Rename file endpoint - SECURE: Uses organizationId
  app.patch(
    "/api/files/rename",
    tokenRequired,
    organizationAccessRequired,
    fileManagementPermissionRequired('renameFile'),
    async (req, res) => {
      try {
        const { organizationId, path: pathRaw, newName } = req.body;

        if (!organizationId || !pathRaw || !newName) {
          return res
            .status(400)
            .json({ error: "Organization ID, path, and newName are required" });
        }

        // Security: Validate path parameter to prevent path traversal and null bytes
        const pathValidation = validatePath(pathRaw, 'Path');
        if (!pathValidation.valid) {
          return res.status(400).json({ 
            error: pathValidation.error,
            field: 'path',
            code: 'INVALID_PATH'
          });
        }
        const filePath = pathValidation.sanitized!;

        // Validate newName - check for invalid characters and length
        const invalidChars = /[\\/:*?"<>|]/;
        if (invalidChars.test(newName)) {
          return res.status(400).json({
            error: "New name contains invalid characters. Cannot use: \\ / : * ? \" < > |",
            field: 'newName',
            code: 'INVALID_NAME'
          });
        }
        if (newName.length === 0 || newName.length > 255) {
          return res.status(400).json({
            error: "New name must be between 1 and 255 characters",
            field: 'newName',
            code: 'INVALID_NAME'
          });
        }
        if (newName.includes('/') || newName.includes('\\')) {
          return res.status(400).json({
            error: "New name cannot contain path separators",
            field: 'newName',
            code: 'INVALID_NAME'
          });
        }

        // Get storage account details from organization mapping (SECURE)
        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res
            .status(404)
            .json({ error: "No storage account found for this organization" });
        }

        // SECURITY: Validate storage account name before Azure SDK URL construction
        const renameFileValidation = validateStorageAccountName(storageAccount.name);
        if (!renameFileValidation.valid) {
          return res.status(500).json({
            error: "Storage account validation failed",
            details: renameFileValidation.error,
            field: 'storageAccountName'
          });
        }
        const validatedStorageName = renameFileValidation.sanitized!;

        if (!credential) {
          return res
            .status(500)
            .json({ error: "Azure credentials not configured" });
        }

        const dataLakeService = new DataLakeServiceClient(
          `https://${validatedStorageName}.dfs.core.windows.net`,
          credential!,
        );
        const fsClient = dataLakeService.getFileSystemClient(storageAccount.containerName);
        const fileClient = fsClient.getFileClient(filePath);

        // Build new path (keep same parent directory)
        const lastSlashIndex = filePath.lastIndexOf('/');
        const parentDir = lastSlashIndex > -1 ? filePath.substring(0, lastSlashIndex) : '';
        const newPath = parentDir ? `${parentDir}/${newName}` : newName;

        // Check if target already exists
        const targetClient = fsClient.getFileClient(newPath);
        try {
          await targetClient.getProperties();
          // If we get here, file exists - return conflict error
          return res.status(409).json({
            error: `A file with the name '${newName}' already exists in this location`,
            code: 'TARGET_EXISTS'
          });
        } catch (checkError: any) {
          if (checkError.statusCode !== 404) {
            // Some other error occurred
            throw checkError;
          }
          // 404 means target doesn't exist - safe to proceed
        }

        // Also check if a directory with this name exists
        const targetDirClient = fsClient.getDirectoryClient(newPath);
        try {
          await targetDirClient.getProperties();
          return res.status(409).json({
            error: `A folder with the name '${newName}' already exists in this location`,
            code: 'TARGET_EXISTS'
          });
        } catch (checkError: any) {
          if (checkError.statusCode !== 404) {
            throw checkError;
          }
        }

        // Perform the rename using move()
        await fileClient.move(newPath);

        // Log file rename activity
        await logUserActivity(
          req,
          "RENAME_FILE",
          "FILE_MANAGEMENT",
          `Org:${organizationId}/${filePath} → ${newPath}`,
          "FILE",
          { organizationId },
        );

        res.json({ 
          success: true, 
          message: "File renamed successfully",
          oldPath: filePath,
          newPath: newPath
        });
      } catch (error: any) {
        console.error("File rename error:", error);
        if (error.statusCode === 404) {
          return res.status(404).json({ 
            error: "Source file not found",
            code: 'NOT_FOUND'
          });
        }
        res.status(500).json({ 
          error: error?.message || "Failed to rename file",
          code: 'RENAME_FAILED'
        });
      }
    },
  );

  // Rename directory endpoint - SECURE: Uses organizationId
  app.patch(
    "/api/files/rename-directory",
    tokenRequired,
    organizationAccessRequired,
    fileManagementPermissionRequired('renameFile'),
    async (req, res) => {
      try {
        const { organizationId, path: pathRaw, newName } = req.body;

        if (!organizationId || !pathRaw || !newName) {
          return res
            .status(400)
            .json({ error: "Organization ID, path, and newName are required" });
        }

        // Security: Validate path parameter to prevent path traversal and null bytes
        const pathValidation = validatePath(pathRaw, 'Path');
        if (!pathValidation.valid) {
          return res.status(400).json({ 
            error: pathValidation.error,
            field: 'path',
            code: 'INVALID_PATH'
          });
        }
        const dirPath = pathValidation.sanitized!;

        // Validate newName - check for invalid characters and length
        const invalidChars = /[\\/:*?"<>|]/;
        if (invalidChars.test(newName)) {
          return res.status(400).json({
            error: "New name contains invalid characters. Cannot use: \\ / : * ? \" < > |",
            field: 'newName',
            code: 'INVALID_NAME'
          });
        }
        if (newName.length === 0 || newName.length > 255) {
          return res.status(400).json({
            error: "New name must be between 1 and 255 characters",
            field: 'newName',
            code: 'INVALID_NAME'
          });
        }
        if (newName.includes('/') || newName.includes('\\')) {
          return res.status(400).json({
            error: "New name cannot contain path separators",
            field: 'newName',
            code: 'INVALID_NAME'
          });
        }

        // Get storage account details from organization mapping (SECURE)
        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res
            .status(404)
            .json({ error: "No storage account found for this organization" });
        }

        // SECURITY: Validate storage account name before Azure SDK URL construction
        const renameDirValidation = validateStorageAccountName(storageAccount.name);
        if (!renameDirValidation.valid) {
          return res.status(500).json({
            error: "Storage account validation failed",
            details: renameDirValidation.error,
            field: 'storageAccountName'
          });
        }
        const validatedStorageName = renameDirValidation.sanitized!;

        if (!credential) {
          return res
            .status(500)
            .json({ error: "Azure credentials not configured" });
        }

        const dataLakeService = new DataLakeServiceClient(
          `https://${validatedStorageName}.dfs.core.windows.net`,
          credential!,
        );
        const fsClient = dataLakeService.getFileSystemClient(storageAccount.containerName);
        const directoryClient = fsClient.getDirectoryClient(dirPath);

        // Build new path (keep same parent directory)
        const lastSlashIndex = dirPath.lastIndexOf('/');
        const parentDir = lastSlashIndex > -1 ? dirPath.substring(0, lastSlashIndex) : '';
        const newPath = parentDir ? `${parentDir}/${newName}` : newName;

        // Check if target directory already exists
        const targetDirClient = fsClient.getDirectoryClient(newPath);
        try {
          await targetDirClient.getProperties();
          return res.status(409).json({
            error: `A folder with the name '${newName}' already exists in this location`,
            code: 'TARGET_EXISTS'
          });
        } catch (checkError: any) {
          if (checkError.statusCode !== 404) {
            throw checkError;
          }
        }

        // Also check if a file with this name exists
        const targetFileClient = fsClient.getFileClient(newPath);
        try {
          await targetFileClient.getProperties();
          return res.status(409).json({
            error: `A file with the name '${newName}' already exists in this location`,
            code: 'TARGET_EXISTS'
          });
        } catch (checkError: any) {
          if (checkError.statusCode !== 404) {
            throw checkError;
          }
        }

        // Perform the rename using move()
        await directoryClient.move(newPath);

        // Log directory rename activity
        await logUserActivity(
          req,
          "RENAME_DIRECTORY",
          "FILE_MANAGEMENT",
          `Org:${organizationId}/${dirPath} → ${newPath}`,
          "DIRECTORY",
          { organizationId },
        );

        res.json({ 
          success: true, 
          message: "Folder renamed successfully",
          oldPath: dirPath,
          newPath: newPath
        });
      } catch (error: any) {
        console.error("Directory rename error:", error);
        if (error.statusCode === 404) {
          return res.status(404).json({ 
            error: "Source folder not found",
            code: 'NOT_FOUND'
          });
        }
        res.status(500).json({ 
          error: error?.message || "Failed to rename folder",
          code: 'RENAME_FAILED'
        });
      }
    },
  );

  // Download file endpoint - SECURE: Generates SAS URL for direct Azure download
  // IMPROVED: No server bandwidth usage, 10-100x faster, unlimited scalability
  app.get(
    "/api/files/download",
    tokenRequired,
    organizationAccessRequired,
    async (req, res) => {
      try {
        // Security: Validate organization ID to ensure positive integer
        const organizationId = validateOrganizationId(req.query.organizationId as string);
        const pathRaw = req.query.path as string;

        if (organizationId === null || !pathRaw) {
          return res.status(400).json({
            error: "Organization ID and path are required",
            details: organizationId === null ? "Organization ID must be a positive integer" : undefined
          });
        }

        // Security: Validate path parameter to prevent path traversal and null bytes
        const pathValidation = validatePath(pathRaw, 'Path');
        if (!pathValidation.valid) {
          return res.status(400).json({ 
            error: pathValidation.error,
            field: 'path'
          });
        }
        const path = pathValidation.sanitized!;

        // Get storage account details from organization mapping (SECURE)
        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res
            .status(404)
            .json({ error: "No storage account found for this organization" });
        }

        if (!credential) {
          return res
            .status(500)
            .json({ error: "Azure credentials not configured" });
        }

        // Get user permissions to validate proper permission based on file vs directory
        const user = (req as any).user;
        const userRoles = await storage.getUserRolesByEmail(user.email);
        const primaryRole = userRoles.find(ur => ur.organizationId === organizationId);
        
        if (!primaryRole) {
          return res
            .status(403)
            .json({ error: "User does not have access to this organization" });
        }

        const rolePermissionsData = await storage.getUserRolePermissions(user.email, primaryRole.roleId);
        const filePermissions = rolePermissionsData?.fileMgmt || {};

        // GEO-FENCING: Enforce geographic access restrictions before SAS generation
        try {
          const logContext = await getActivityLoggingContext(req, organizationId);
          (req as any).organizationName = logContext.organizationName;
          (req as any).roleId = logContext.roleId;
          (req as any).roleName = logContext.roleName;

          await enforceGeoAccess({
            req,
            orgId: organizationId,
            userId: user.id,
            operation: 'download',
          });
        } catch (geoError: any) {
          if (isGeoRestrictionError(geoError)) {
            console.warn(`[GEO] Download blocked for user ${user.email} from country ${geoError.country}`);
            return res.status(403).json({
              code: 'GEO_RESTRICTED',
              message: geoError.message,
            });
          }
          throw geoError;
        }

        // SECURITY: Validate storage account name before Azure SDK URL construction
        const downloadSasValidation = validateStorageAccountName(storageAccount.name);
        if (!downloadSasValidation.valid) {
          return res.status(500).json({
            error: "Storage account validation failed",
            details: downloadSasValidation.error,
            field: 'storageAccountName'
          });
        }
        const validatedDownloadSasName = downloadSasValidation.sanitized!;

        // STEP 1: First detect if path is a file or directory (without permission checks)
        // Azure Data Lake Storage Gen2: getFileClient() works for both files and directories!
        // We must check the properties.isDirectory field to determine the type
        const dataLakeService = new DataLakeServiceClient(
          `https://${validatedDownloadSasName}.dfs.core.windows.net`,
          credential!,
        );
        const fsClient = dataLakeService.getFileSystemClient(storageAccount.containerName);
        
        let properties;
        let isDirectory = false;
        
        try {
          // In ADLS Gen2, getFileClient() can retrieve properties for both files AND directories
          // We must check the resourceType property in the response (exists at runtime, not in TS types)
          const pathClient = fsClient.getFileClient(path);
          properties = await pathClient.getProperties();
          
          // Check if this is actually a directory based on resourceType
          // Note: resourceType exists at runtime but not in TypeScript definitions
          const resourceType = (properties as any).resourceType;
          isDirectory = resourceType === 'directory';
          
          console.log(`[DOWNLOAD-SAS] Path type detection: ${path} → resourceType=${resourceType}, isDirectory=${isDirectory}`);
        } catch (error: any) {
          // Path not found
          console.error(`[DOWNLOAD-SAS] Path not found: ${path}`, error);
          return res.status(404).json({ error: "File or directory not found" });
        }
        
        // STEP 2: Now enforce correct permission based on detected type
        if (isDirectory) {
          // CRITICAL: Enforce downloadFolder permission for directories
          if (!(filePermissions as any).downloadFolder) {
            console.warn(`[DOWNLOAD-SAS] RBAC VIOLATION: User ${user.email} attempted to download directory ${path} without downloadFolder permission`);
            return res.status(403).json({ error: "Missing downloadFolder permission" });
          }
          
          // Directories should use the download-directory endpoint
          console.log(`[DOWNLOAD-SAS] Directory download attempted, redirecting to proper endpoint: ${path}`);
          return res.status(400).json({ 
            error: "Directories must be downloaded via /api/files/download-directory endpoint" 
          });
        } else {
          // CRITICAL: Enforce downloadFile permission for files
          if (!(filePermissions as any).downloadFile) {
            console.warn(`[DOWNLOAD-SAS] RBAC VIOLATION: User ${user.email} attempted to download file ${path} without downloadFile permission`);
            return res.status(403).json({ error: "Missing downloadFile permission" });
          }
        }
        
        const fileName = path.split('/').pop() || 'download';
        const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';

        // Generate SAS URL using Azure Blob SDK (required for SAS with managed identity)
        const blobServiceClient = new BlobServiceClient(
          `https://${storageAccount.name}.blob.core.windows.net`,
          credential!,
        );
        const containerClient = blobServiceClient.getContainerClient(storageAccount.containerName);
        const blobClient = containerClient.getBlobClient(path);

        // Generate SAS token with configurable expiry (default: 300 seconds = 5 minutes)
        // Validate expiry time with sane bounds (minimum 60s, maximum 3600s)
        let downloadSasTimeSeconds = parseInt(process.env.ZAPPER_DOWNLOAD_SAS_TIME || '300', 10);
        
        if (isNaN(downloadSasTimeSeconds) || downloadSasTimeSeconds < 60) {
          console.warn(`[DOWNLOAD-SAS] Invalid ZAPPER_DOWNLOAD_SAS_TIME (${process.env.ZAPPER_DOWNLOAD_SAS_TIME}), using minimum 60 seconds`);
          downloadSasTimeSeconds = 60;
        }
        
        if (downloadSasTimeSeconds > 3600) {
          console.warn(`[DOWNLOAD-SAS] ZAPPER_DOWNLOAD_SAS_TIME exceeds maximum (3600s), capping at 3600 seconds`);
          downloadSasTimeSeconds = 3600;
        }
        
        const startsOn = new Date();
        const expiresOn = new Date(startsOn.getTime() + downloadSasTimeSeconds * 1000);

        // Get user delegation key (required for managed identity SAS)
        const userDelegationKey = await blobServiceClient.getUserDelegationKey(
          startsOn,
          expiresOn
        );

        // Get client IP for SAS restriction (optional, controlled by env var)
        const ipRange = getClientIpRange(req);

        // Generate SAS query parameters with read-only permissions
        const sasOptions: any = {
          containerName: storageAccount.containerName,
          blobName: path,
          permissions: BlobSASPermissions.parse("r"), // Read-only (secure)
          startsOn,
          expiresOn,
        };

        // Add IP restriction if configured
        if (ipRange) {
          sasOptions.ipRange = ipRange;
          console.log(`[DOWNLOAD-SAS] IP restriction applied: ${ipRange.start} - ${ipRange.end}`);
        } else {
          console.log(`[DOWNLOAD-SAS] No IP restriction applied`);
        }

        const sasToken = generateBlobSASQueryParameters(
          sasOptions,
          userDelegationKey,
          storageAccount.name
        ).toString();

        // Generate SAS URL (Azure SDK handles URL encoding)
        const sasUrl = `${blobClient.url}?${sasToken}`;

        // Log file download activity
        await logUserActivity(
          req,
          "DOWNLOAD_FILE",
          "FILE_MANAGEMENT",
          `Org:${organizationId}/${path}`,
          "FILE",
          { organizationId },
        );

        // Create file transfer report for download
        try {
          const { fileTransferReportService } = await import("./fileTransferReportService");
          
          // Look up user by email to get database ID (JWT tokens don't contain DB user ID)
          let dbUserId = user?.id || 0;
          if (!dbUserId || dbUserId === 0) {
            const dbUser = await storage.getUserByEmail(user.email.toLowerCase().trim());
            dbUserId = dbUser?.id || 0;
          }
          
          if (!dbUserId || dbUserId === 0) {
            console.error("📊 [REPORT] Cannot create download report: user not found in database for email:", user?.email);
            throw new Error("User not found in database");
          }
          
          const { actionId: downloadReportId } = await fileTransferReportService.initializeReport(
            organizationId,
            dbUserId,
            "DOWNLOAD",
            1,
            storageAccount.name,
            storageAccount.containerName,
            user?.email,
            user?.name
          );
          
          const fileResults = [{
            fullPath: path,
            status: "SUCCESS" as const,
            sizeBytes: properties.contentLength || 0,
          }];
          
          await fileTransferReportService.finalizeReport(downloadReportId, fileResults, user?.email, user?.name);
          console.log(`📊 [REPORT] Download report created: ${downloadReportId} for ${fileName}`);
        } catch (reportErr) {
          console.error("📊 [REPORT] Failed to create download report:", reportErr);
        }

        console.log(`[DOWNLOAD-SAS] Generated SAS URL for ${fileName} (expires in ${downloadSasTimeSeconds}s)`);

        // Return SAS URL for direct client download from Azure
        res.json({
          url: sasUrl,
          fileName,
          fileSize: properties.contentLength || 0,
          expiresIn: downloadSasTimeSeconds,
        });
      } catch (error: any) {
        console.error("File download error:", error);
        res
          .status(500)
          .json({ error: error?.message || "Failed to generate download URL" });
      }
    },
  );

  // Rehydrate archived file endpoint - Sets access tier to Hot with High priority
  app.post(
    "/api/files/rehydrate",
    tokenRequired,
    organizationAccessRequired,
    fileManagementPermissionRequired('rehydrate'),
    async (req, res) => {
      try {
        const organizationId = validateOrganizationId(req.body.organizationId);
        const pathRaw = req.body.path as string;

        if (organizationId === null || !pathRaw) {
          return res.status(400).json({
            error: "Organization ID and path are required",
            details: organizationId === null ? "Organization ID must be a positive integer" : undefined
          });
        }

        const pathValidation = validatePath(pathRaw, 'Path');
        if (!pathValidation.valid) {
          return res.status(400).json({ 
            error: pathValidation.error,
            field: 'path'
          });
        }
        const path = pathValidation.sanitized!;

        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res.status(404).json({ error: "No storage account found for this organization" });
        }

        if (!credential) {
          return res.status(500).json({ error: "Azure credentials not configured" });
        }

        const user = (req as any).user;
        console.log(`[REHYDRATE] User ${user.email} requesting rehydration for file: ${path} in org ${organizationId}`);

        // Use BlobServiceClient for rehydration (works for both Blob Storage and ADLS via blob endpoint)
        const blobServiceClient = new BlobServiceClient(
          `https://${storageAccount.name}.blob.core.windows.net`,
          credential!,
        );
        const containerClient = blobServiceClient.getContainerClient(storageAccount.containerName);
        const blobClient = containerClient.getBlobClient(path);

        // Check current properties
        const properties = await blobClient.getProperties();
        
        if (properties.accessTier !== 'Archive') {
          return res.status(400).json({ 
            error: `File is not in Archive tier. Current tier: ${properties.accessTier}` 
          });
        }

        if ((properties as any).archiveStatus) {
          return res.status(400).json({ 
            error: "File is already being rehydrated. Please wait for the process to complete.",
            archiveStatus: (properties as any).archiveStatus,
            rehydratePriority: (properties as any).rehydratePriority
          });
        }

        // Set access tier to Hot with High priority rehydration
        await blobClient.setAccessTier("Hot", { rehydratePriority: "High" });

        console.log(`[REHYDRATE] Successfully initiated rehydration for ${path} to Hot tier with High priority`);

        // Log activity
        try {
          await ActivityLogger.log({
            userId: String(user.id || user.email),
            userName: user.name || user.email,
            email: user.email,
            action: ActivityActions.REHYDRATE_FILE,
            actionCategory: ActivityCategories.FILE_MANAGEMENT,
            resource: path,
            resourceType: ResourceTypes.FILE,
            organizationId,
            ipAddress: getClientIp(req),
            userAgent: req.headers['user-agent'] || '',
            sessionId: req.sessionID || '',
            details: { 
              message: `Initiated rehydration of file "${path}" from Archive to Hot tier with High priority`,
              targetTier: 'Hot', 
              rehydratePriority: 'High' 
            }
          });
        } catch (logError) {
          console.warn('[REHYDRATE] Failed to log activity:', logError);
        }

        res.json({ 
          success: true, 
          message: "Rehydration initiated successfully. The file will be moved to Hot tier shortly.",
          targetTier: "Hot",
          rehydratePriority: "High"
        });

      } catch (error: any) {
        console.error("[REHYDRATE] Error:", error);
        res.status(500).json({ error: error?.message || "Failed to initiate rehydration" });
      }
    },
  );

  // Download encrypted file endpoint - Decrypts file on server and streams to client
  app.get(
    "/api/files/download-encrypted",
    tokenRequired,
    organizationAccessRequired,
    fileManagementPermissionRequired('downloadFile'),
    async (req, res) => {
      try {
        const organizationId = validateOrganizationId(req.query.organizationId as string);
        const pathRaw = req.query.path as string;

        if (organizationId === null || !pathRaw) {
          return res.status(400).json({
            error: "Organization ID and path are required",
            details: organizationId === null ? "Organization ID must be a positive integer" : undefined
          });
        }

        // Security: Validate path parameter
        const pathValidation = validatePath(pathRaw, 'Path');
        if (!pathValidation.valid) {
          return res.status(400).json({ 
            error: pathValidation.error,
            field: 'path'
          });
        }
        const path = pathValidation.sanitized!;

        // Get storage account details
        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res.status(404).json({ error: "No storage account found for this organization" });
        }

        if (!credential) {
          return res.status(500).json({ error: "Azure credentials not configured" });
        }

        // Validate storage account name
        const downloadEncValidation = validateStorageAccountName(storageAccount.name);
        if (!downloadEncValidation.valid) {
          return res.status(500).json({
            error: "Storage account validation failed",
            details: downloadEncValidation.error
          });
        }
        const validatedName = downloadEncValidation.sanitized!;

        // Get blob client to read file and metadata
        const blobServiceClient = new BlobServiceClient(
          `https://${validatedName}.blob.core.windows.net`,
          credential!,
        );
        const containerClient = blobServiceClient.getContainerClient(storageAccount.containerName);
        const blobClient = containerClient.getBlobClient(path);

        // Read blob properties and metadata
        const properties = await blobClient.getProperties();
        const metadata = properties.metadata || {};

        // Verify this is an encrypted file (check metadata or file extension)
        const hasEncryptedMetadata = metadata.isencrypted === "true";
        const hasEncryptedExtension = path.toLowerCase().endsWith('.pgp') || 
                                       path.toLowerCase().endsWith('.gpg') ||
                                       path.toLowerCase().endsWith('.asc');
        
        if (!hasEncryptedMetadata && !hasEncryptedExtension) {
          return res.status(400).json({ 
            error: "File is not encrypted. Use regular download endpoint." 
          });
        }

        // Verify organization matches
        if (metadata.organizationid && String(metadata.organizationid) !== String(organizationId)) {
          console.warn(`[DOWNLOAD-ENCRYPTED] Organization mismatch: file org=${metadata.organizationid}, request org=${organizationId}`);
          return res.status(403).json({ error: "Access denied: organization mismatch" });
        }

        // Get the PGP key for this organization
        const pgpKey = await storage.getOrgPgpKey(organizationId);
        if (!pgpKey || (!pgpKey.keyVaultSecretName && !pgpKey.privateKeyData)) {
          return res.status(400).json({ 
            error: "PGP key not found for this organization. Cannot decrypt file." 
          });
        }

        console.log(`🔐 [DECRYPTION] Starting decryption of ${path}`);
        const decryptStartTime = Date.now();

        // Download the encrypted file
        const downloadResponse = await blobClient.download();
        const encryptedData = await streamToBuffer(downloadResponse.readableStreamBody!);

        // Decrypt the file - pass both keyVaultSecretName and privateKeyData (one will be used)
        const decryptedData = await decryptFileData(
          encryptedData, 
          pgpKey.keyVaultSecretName || null, 
          pgpKey.privateKeyData || null
        );

        const decryptEndTime = Date.now();
        console.log(`🔐 [DECRYPTION] Decryption completed in ${decryptEndTime - decryptStartTime}ms`);

        // Get original filename from metadata or derive from path
        const originalFileName = metadata.originalfilename || path.replace('.pgp', '').split('/').pop() || 'decrypted-file';

        // Log decryption activity
        await logUserActivity(
          req,
          "FILE_DECRYPTED",
          "FILE_MANAGEMENT",
          `Org:${organizationId}/${path}`,
          "FILE",
          { organizationId },
        );

        // Set response headers for file download
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${originalFileName}"`);
        res.setHeader('Content-Length', decryptedData.length);

        // Send decrypted file
        res.send(decryptedData);

      } catch (error: any) {
        console.error("Encrypted file download error:", error);
        
        // Log failed decryption attempt for audit trail
        const failedOrgId = validateOrganizationId(req.query.organizationId as string);
        const pathRaw = req.query.path as string;
        const errorMessage = error?.message || "Failed to download and decrypt file";
        try {
          await logUserActivity(
            req,
            "FILE_DECRYPT_FAILED",
            "FILE_MANAGEMENT",
            `Org:${failedOrgId}/${pathRaw} - Error: ${errorMessage}`,
            "FILE",
            failedOrgId ? { organizationId: failedOrgId } : undefined,
          );
        } catch (logError) {
          console.error("Failed to log decryption failure activity:", logError);
        }
        
        res.status(500).json({ error: errorMessage });
      }
    },
  );

  // Decrypt file to folder endpoint - Decrypts file and saves to "decrypted" folder maintaining directory structure
  // Requires pgpKeyMgmt.decrypt permission
  app.post(
    "/api/files/decrypt-to-folder",
    tokenRequired,
    organizationAccessRequired,
    pgpKeyManagementPermissionRequired('decrypt'),
    async (req, res) => {
      try {
        const organizationId = validateOrganizationId(req.body.organizationId as string);
        const pathRaw = req.body.path as string;
        const keyId = req.body.keyId ? parseInt(req.body.keyId as string, 10) : null;

        if (organizationId === null || !pathRaw) {
          return res.status(400).json({
            error: "Organization ID and path are required",
            details: organizationId === null ? "Organization ID must be a positive integer" : undefined
          });
        }

        // Security: Validate path parameter
        const pathValidation = validatePath(pathRaw, 'Path');
        if (!pathValidation.valid) {
          return res.status(400).json({ 
            error: pathValidation.error,
            field: 'path'
          });
        }
        const filePath = pathValidation.sanitized!;

        // Get storage account details
        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res.status(404).json({ error: "No storage account found for this organization" });
        }

        if (!credential) {
          return res.status(500).json({ error: "Azure credentials not configured" });
        }

        // Validate storage account name
        const storageValidation = validateStorageAccountName(storageAccount.name);
        if (!storageValidation.valid) {
          return res.status(500).json({
            error: "Storage account validation failed",
            details: storageValidation.error
          });
        }
        const validatedName = storageValidation.sanitized!;

        // Get blob client to read file and metadata
        const blobServiceClient = new BlobServiceClient(
          `https://${validatedName}.blob.core.windows.net`,
          credential!,
        );
        const containerClient = blobServiceClient.getContainerClient(storageAccount.containerName);
        const blobClient = containerClient.getBlobClient(filePath);

        // Read blob properties and metadata
        const properties = await blobClient.getProperties();
        const metadata = properties.metadata || {};

        // Verify this is an encrypted file (check metadata or file extension)
        const hasEncryptedMetadata = metadata.isencrypted === "true";
        const hasEncryptedExtension = filePath.toLowerCase().endsWith('.pgp') || 
                                       filePath.toLowerCase().endsWith('.gpg') ||
                                       filePath.toLowerCase().endsWith('.asc');
        
        if (!hasEncryptedMetadata && !hasEncryptedExtension) {
          return res.status(400).json({ 
            error: "File is not encrypted. Only encrypted files can be decrypted." 
          });
        }

        // Verify organization matches
        if (metadata.organizationid && String(metadata.organizationid) !== String(organizationId)) {
          console.warn(`[DECRYPT-TO-FOLDER] Organization mismatch: file org=${metadata.organizationid}, request org=${organizationId}`);
          return res.status(403).json({ error: "Access denied: organization mismatch" });
        }

        // Get the PGP key for decryption
        let pgpKey;
        if (keyId) {
          // User specified a key ID - fetch that specific key
          pgpKey = await storage.getOrgPgpKeyById(keyId);
          if (!pgpKey) {
            return res.status(404).json({ error: "Specified PGP key not found" });
          }
          // Verify key belongs to this organization
          if (pgpKey.organizationId !== organizationId) {
            return res.status(403).json({ error: "Access denied: key does not belong to this organization" });
          }
          // Verify key has private key data
          if (!pgpKey.keyVaultSecretName && !pgpKey.privateKeyData) {
            return res.status(400).json({ error: "Selected key does not have a private key for decryption" });
          }
        } else {
          // No key specified - get the organization's first OWN key
          pgpKey = await storage.getOrgPgpKey(organizationId);
          if (!pgpKey || (!pgpKey.keyVaultSecretName && !pgpKey.privateKeyData)) {
            return res.status(400).json({ 
              error: "PGP key not found for this organization. Cannot decrypt file." 
            });
          }
        }

        console.log(`🔐 [DECRYPT-TO-FOLDER] Starting decryption of ${filePath} using key ${pgpKey.keyId}`);
        const decryptStartTime = Date.now();

        // Download the encrypted file
        const downloadResponse = await blobClient.download();
        const encryptedData = await streamToBuffer(downloadResponse.readableStreamBody!);

        // Decrypt the file
        const decryptedData = await decryptFileData(
          encryptedData, 
          pgpKey.keyVaultSecretName || null, 
          pgpKey.privateKeyData || null
        );

        const decryptEndTime = Date.now();
        console.log(`🔐 [DECRYPT-TO-FOLDER] Decryption completed in ${decryptEndTime - decryptStartTime}ms`);

        // Get original filename from metadata or derive from path
        const originalFileName = metadata.originalfilename || filePath.replace('.pgp', '').split('/').pop() || 'decrypted-file';

        // Build the decrypted folder path maintaining directory structure
        // Original: some/path/to/file.txt.pgp
        // Decrypted: {ZAPPER_DECRYPT_RESULTS_DIR}/some/path/to/file.txt
        // Get configurable decrypt results directory from environment variable
        const decryptResultsDir = process.env.ZAPPER_DECRYPT_RESULTS_DIR || "decrypted";
        
        const pathParts = filePath.split('/');
        const encryptedFileName = pathParts.pop() || '';
        const directoryPath = pathParts.join('/');
        const decryptedFileName = originalFileName;
        
        // Create decrypted folder path
        let decryptedPath: string;
        if (directoryPath) {
          decryptedPath = `${decryptResultsDir}/${directoryPath}/${decryptedFileName}`;
        } else {
          decryptedPath = `${decryptResultsDir}/${decryptedFileName}`;
        }

        console.log(`🔐 [DECRYPT-TO-FOLDER] Uploading decrypted file to: ${decryptedPath}`);

        // Upload decrypted file to the decrypted folder
        const blockBlobClient = containerClient.getBlockBlobClient(decryptedPath);
        await blockBlobClient.uploadData(decryptedData, {
          metadata: {
            originalencryptedpath: filePath,
            decryptedat: new Date().toISOString(),
            decryptedbyuserid: String((req as any).user?.id || ""),
            decryptedbyuseremail: (req as any).userEmail || "",
            decryptionkeyid: String(pgpKey.id),
            decryptionkeyname: pgpKey.keyName || "",
            originalfilename: originalFileName,
          }
        });

        // Log decryption activity
        await logUserActivity(
          req,
          "FILE_DECRYPTED_TO_FOLDER",
          "FILE_MANAGEMENT",
          `Org:${organizationId}/${filePath} -> ${decryptedPath}`,
          "FILE",
          { organizationId },
        );

        console.log(`🔐 [DECRYPT-TO-FOLDER] Successfully saved decrypted file to: ${decryptedPath}`);

        res.json({
          success: true,
          message: "File decrypted successfully",
          decryptedPath: decryptedPath,
          originalPath: filePath,
          originalFileName: originalFileName,
          keyUsed: {
            id: pgpKey.id,
            keyName: pgpKey.keyName,
            keyId: pgpKey.keyId
          }
        });

      } catch (error: any) {
        console.error("Decrypt to folder error:", error);
        
        // Parse the error to provide detailed feedback
        const errorMessage = error?.message || "Failed to decrypt file to folder";
        let errorCode = "UNKNOWN_ERROR";
        let errorDetails = "";
        let suggestions: string[] = [];
        
        // Detect specific error types
        if (errorMessage.includes("No decryption key packets found") || 
            errorMessage.includes("Session key decryption failed")) {
          errorCode = "KEY_MISMATCH";
          errorDetails = "The selected private key does not match the public key that was used to encrypt this file.";
          suggestions = [
            "Verify you are using the correct private key that corresponds to the public key used for encryption.",
            "If this file was encrypted by a partner, ensure you have the matching private key for that keypair.",
            "Check if the file was encrypted with a different organization's key.",
            "Contact the sender to confirm which public key was used for encryption."
          ];
        } else if (errorMessage.includes("Encrypted message is not integrity protected") ||
                   errorMessage.includes("Modification detected")) {
          errorCode = "INTEGRITY_FAILURE";
          errorDetails = "The encrypted file appears to be corrupted or modified.";
          suggestions = [
            "Request a fresh copy of the encrypted file from the sender.",
            "Check if the file was completely transferred without interruption.",
            "Verify the file was not modified after encryption."
          ];
        } else if (errorMessage.includes("Unsupported OpenPGP message") ||
                   errorMessage.includes("Invalid PGP")) {
          errorCode = "INVALID_FORMAT";
          errorDetails = "The file does not appear to be a valid PGP encrypted file.";
          suggestions = [
            "Verify this file was encrypted using PGP/GPG encryption.",
            "Ensure the file has the correct extension (.pgp, .gpg, or .asc).",
            "Check if the file is corrupted or truncated."
          ];
        } else if (errorMessage.includes("Decryption failed") ||
                   errorMessage.includes("Error decrypting message")) {
          errorCode = "DECRYPTION_FAILED";
          errorDetails = "Unable to decrypt the file with the selected key.";
          suggestions = [
            "Try using a different private key if multiple keys are available.",
            "Verify the private key was not corrupted during import.",
            "Contact the file sender to confirm encryption details."
          ];
        } else if (errorMessage.includes("Key Vault") || errorMessage.includes("Azure")) {
          errorCode = "KEY_VAULT_ERROR";
          errorDetails = "Failed to retrieve the private key from Azure Key Vault.";
          suggestions = [
            "Check Azure Key Vault permissions and connectivity.",
            "Verify the managed identity has access to the Key Vault.",
            "Contact your administrator if the issue persists."
          ];
        }

        // Log failed decryption attempt for audit trail
        const failedOrgId2 = validateOrganizationId(req.body.organizationId as string);
        const pathRaw = req.body.path as string;
        const keyIdUsed = req.body.keyId ? parseInt(req.body.keyId as string, 10) : null;
        try {
          await logUserActivity(
            req,
            "FILE_DECRYPT_FAILED",
            "FILE_MANAGEMENT",
            `Org:${failedOrgId2}/${pathRaw} - Error: ${errorCode} - ${errorMessage}${keyIdUsed ? ` - KeyId:${keyIdUsed}` : ''}`,
            "FILE",
            failedOrgId2 ? { organizationId: failedOrgId2 } : undefined,
          );
        } catch (logError) {
          console.error("Failed to log decryption failure activity:", logError);
        }
        
        res.status(500).json({ 
          error: errorMessage,
          errorCode: errorCode,
          details: errorDetails,
          suggestions: suggestions,
          decryptError: {
            type: errorCode,
            message: errorMessage,
            details: errorDetails,
            suggestions: suggestions
          }
        });
      }
    },
  );

  // Get available private keys for decryption - returns keys that have private key data (SELF keys only)
  app.get(
    "/api/files/decrypt-keys",
    tokenRequired,
    organizationAccessRequired,
    pgpKeyManagementPermissionRequired('decrypt'),
    async (req, res) => {
      try {
        const organizationId = validateOrganizationId(req.query.organizationId as string);

        if (organizationId === null) {
          return res.status(400).json({
            error: "Organization ID is required",
            details: "Organization ID must be a positive integer"
          });
        }

        // Get only SELF keys (keys that have private key data for decryption)
        const allKeys = await storage.getOrgPgpKeysByType(organizationId, 'SELF');
        
        // Filter to only keys that have private key data available
        const decryptableKeys = allKeys.filter(key => 
          key.isActive && (key.keyVaultSecretName || key.privateKeyData)
        );

        res.json({
          keys: decryptableKeys.map(key => ({
            id: key.id,
            keyName: key.keyName,
            keyId: key.keyId,
            createdAt: key.createdAt,
          })),
          count: decryptableKeys.length,
        });

      } catch (error: any) {
        console.error("Get decrypt keys error:", error);
        res.status(500).json({ error: "Failed to fetch decryption keys" });
      }
    },
  );

  // Helper function to convert stream to buffer
  async function streamToBuffer(readableStream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      readableStream.on("data", (data) => {
        chunks.push(data instanceof Buffer ? data : Buffer.from(data));
      });
      readableStream.on("end", () => {
        resolve(Buffer.concat(chunks));
      });
      readableStream.on("error", reject);
    });
  }

  // Preview file endpoint - SECURE: Generates temporary SAS URL for read-only viewing
  app.get(
    "/api/files/preview",
    tokenRequired,
    organizationAccessRequired,
    fileManagementPermissionRequired('viewFiles'),
    async (req, res) => {
      try {
        // Security: Validate organization ID to ensure positive integer
        const organizationId = validateOrganizationId(req.query.organizationId as string);
        const pathRaw = req.query.path as string;

        if (organizationId === null || !pathRaw) {
          return res.status(400).json({
            error: "Organization ID and path are required",
            details: organizationId === null ? "Organization ID must be a positive integer" : undefined
          });
        }

        // Security: Validate path parameter to prevent path traversal and null bytes
        const pathValidation = validatePath(pathRaw, 'Path');
        if (!pathValidation.valid) {
          return res.status(400).json({ 
            error: pathValidation.error,
            field: 'path'
          });
        }
        const path = pathValidation.sanitized!;

        // Get storage account details from organization mapping (SECURE)
        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res
            .status(404)
            .json({ error: "No storage account found for this organization" });
        }

        if (!credential) {
          return res
            .status(500)
            .json({ error: "Azure credentials not configured" });
        }

        // GEO-FENCING: Enforce geographic access restrictions before SAS generation
        const user = (req as any).user;
        try {
          const logContext = await getActivityLoggingContext(req, organizationId);
          (req as any).organizationName = logContext.organizationName;
          (req as any).roleId = logContext.roleId;
          (req as any).roleName = logContext.roleName;

          await enforceGeoAccess({
            req,
            orgId: organizationId,
            userId: user?.id,
            operation: 'preview',
          });
        } catch (geoError: any) {
          if (isGeoRestrictionError(geoError)) {
            console.warn(`[GEO] Preview blocked for user ${user?.email} from country ${geoError.country}`);
            return res.status(403).json({
              code: 'GEO_RESTRICTED',
              message: geoError.message,
            });
          }
          throw geoError;
        }

        // SECURITY: Validate storage account name before Azure SDK URL construction
        const previewValidation = validateStorageAccountName(storageAccount.name);
        if (!previewValidation.valid) {
          return res.status(500).json({
            error: "Storage account validation failed",
            details: previewValidation.error,
            field: 'storageAccountName'
          });
        }
        const validatedPreviewName = previewValidation.sanitized!;

        // Generate temporary SAS URL (15 minutes expiry) for preview
        const dataLakeService = new DataLakeServiceClient(
          `https://${validatedPreviewName}.dfs.core.windows.net`,
          credential!,
        );
        const fsClient = dataLakeService.getFileSystemClient(storageAccount.containerName);
        const fileClient = fsClient.getFileClient(path);

        // Get file metadata
        const properties = await fileClient.getProperties();
        const fileName = path.split('/').pop() || 'file';
        const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
        
        // Determine MIME type based on extension
        const mimeTypes: { [key: string]: string } = {
          pdf: 'application/pdf',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          xls: 'application/vnd.ms-excel',
          pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          ppt: 'application/vnd.ms-powerpoint',
          txt: 'text/plain',
          json: 'application/json',
          js: 'text/javascript',
          ts: 'text/typescript',
          jsx: 'text/jsx',
          tsx: 'text/tsx',
          html: 'text/html',
          css: 'text/css',
          md: 'text/markdown',
          xml: 'text/xml',
          csv: 'text/csv',
          log: 'text/plain',
          png: 'image/png',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          gif: 'image/gif',
          svg: 'image/svg+xml',
          webp: 'image/webp',
          mp4: 'video/mp4',
          webm: 'video/webm',
          ogg: 'video/ogg',
          mp3: 'audio/mpeg',
          wav: 'audio/wav',
          m4a: 'audio/mp4',
        };

        const contentType = mimeTypes[fileExtension] || 'application/octet-stream';

        // SECURITY: Use validated name for blob service client (validation done above)
        // Generate SAS URL using Azure SDK
        // For ADLS Gen2, we need to use the blob endpoint for SAS
        const blobServiceClient = new BlobServiceClient(
          `https://${validatedPreviewName}.blob.core.windows.net`,
          credential!,
        );
        const containerClient = blobServiceClient.getContainerClient(storageAccount.containerName);
        const blobClient = containerClient.getBlobClient(path);

        // Generate SAS token using user delegation key for managed identity
        // Use configurable expiry time (default: 900 seconds = 15 minutes)
        const previewSasTimeSeconds = parseInt(process.env.ZAPPER_PREVIEW_SAS_TIME || '900', 10);
        const startsOn = new Date();
        const expiresOn = new Date(startsOn.getTime() + previewSasTimeSeconds * 1000);

        // Get user delegation key (required for managed identity SAS)
        const userDelegationKey = await blobServiceClient.getUserDelegationKey(
          startsOn,
          expiresOn
        );

        // Get client IP for SAS restriction
        const ipRange = getClientIpRange(req);

        // Generate SAS query parameters using user delegation with IP restriction
        const sasOptions: any = {
          containerName: storageAccount.containerName,
          blobName: path,
          permissions: BlobSASPermissions.parse("r"), // Read-only
          startsOn,
          expiresOn,
        };

        // Add IP restriction if available
        if (ipRange) {
          sasOptions.ipRange = ipRange;
          console.log(`[PREVIEW-SAS] IP restriction applied: ${ipRange.start} - ${ipRange.end}`);
        } else {
          console.log(`[PREVIEW-SAS] No IP restriction applied (bypassed)`);
        }

        const sasToken = generateBlobSASQueryParameters(
          sasOptions,
          userDelegationKey,
          storageAccount.name
        ).toString();

        // SECURITY FIX: Use blobClient.url which is already properly constructed by Azure SDK
        // The SDK handles URL encoding internally, so no manual encoding needed here
        const sasUrl = `${blobClient.url}?${sasToken}`;

        // Log file preview activity
        await logUserActivity(
          req,
          "PREVIEW_FILE",
          "FILE_MANAGEMENT",
          `Org:${organizationId}/${path}`,
          "FILE",
          { organizationId },
        );

        res.json({
          url: sasUrl,
          fileName,
          fileExtension,
          contentType,
          fileSize: properties.contentLength || 0,
          userEmail: user?.email || user?.displayName || "Unknown",
          timestamp: new Date().toISOString(),
        });
      } catch (error: any) {
        console.error("File preview error:", error);
        res
          .status(500)
          .json({ error: error?.message || "Failed to generate preview URL" });
      }
    },
  );

  // Download directory as ZIP endpoint - SECURE: Uses organizationId + Granular permission check
  app.get(
    "/api/files/download-directory", 
    tokenRequired,
    organizationAccessRequired,
    fileManagementPermissionRequired('downloadFolder'),
    async (req, res) => {
      try {
        // Security: Validate organization ID to ensure positive integer
        const organizationId = validateOrganizationId(req.query.organizationId as string);
        const pathRaw = req.query.path as string;
        const forceStrategy = req.query.strategy as string; // Optional override: 'aca', 'memory', or undefined

        if (organizationId === null || !pathRaw) {
          return res.status(400).json({
            error: "Organization ID and path are required",
            details: organizationId === null ? "Organization ID must be a positive integer" : undefined
          });
        }

        // Security: Validate path parameter to prevent path traversal and null bytes
        const pathValidation = validatePath(pathRaw, 'Path');
        if (!pathValidation.valid) {
          return res.status(400).json({ 
            error: pathValidation.error,
            field: 'path'
          });
        }
        const path = pathValidation.sanitized!;

        // Get storage account details from organization mapping (SECURE)
        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res
            .status(404)
            .json({ error: "No storage account found for this organization" });
        }

        if (!credential) {
          return res
            .status(500)
            .json({ error: "Azure credentials not configured" });
        }

        // GEO-FENCING: Enforce geographic access restrictions before directory download
        const user = (req as any).user;
        try {
          const logContext = await getActivityLoggingContext(req, organizationId);
          (req as any).organizationName = logContext.organizationName;
          (req as any).roleId = logContext.roleId;
          (req as any).roleName = logContext.roleName;

          await enforceGeoAccess({
            req,
            orgId: organizationId,
            userId: user?.id,
            operation: 'download-directory',
          });
        } catch (geoError: any) {
          if (isGeoRestrictionError(geoError)) {
            console.warn(`[GEO] Directory download blocked for user ${user?.email} from country ${geoError.country}`);
            return res.status(403).json({
              code: 'GEO_RESTRICTED',
              message: geoError.message,
            });
          }
          throw geoError;
        }

        // 🎯 Determine optimal strategy based on folder size (unless overridden)
        let strategy: 'aca' | 'memory';
        if (forceStrategy === 'aca' || forceStrategy === 'memory') {
          strategy = forceStrategy;
          console.log(`🔧 [DOWNLOAD] Using forced strategy: ${strategy.toUpperCase()}`);
        } else {
          strategy = await acaZipperService.determineZipStrategy(
            storageAccount.name,
            storageAccount.containerName,
            path
          );
        }

        console.log(`📁 [DOWNLOAD] Selected strategy: ${strategy.toUpperCase()} for folder: ${path}`);

        if (strategy === 'aca') {
          // ACA-based synchronous approach - returns download URL directly
          try {
            const downloadUrl = await acaZipperService.createZipJob(
              storageAccount.name,
              storageAccount.containerName,
              path,
              req // Pass request for IP restriction support
            );

            console.log(`📁 [ACA] Created zip download: Storage Account: ${storageAccount.name}, Container: ${storageAccount.containerName}, Path: ${path}, Download URL: ${downloadUrl}`);

            // Return download URL for immediate download
            res.json({ 
              jobId: downloadUrl, // Using downloadUrl as jobId for compatibility
              downloadUrl: downloadUrl,
              status: "completed",
              message: "Zip file created successfully using Azure Container Apps.",
              strategy: "aca",
              folderSizeMB: await acaZipperService.calculateFolderSizeMB(storageAccount.name, storageAccount.containerName, path)
            });

            // Log directory download activity (completion)
            await logUserActivity(
              req,
              "DOWNLOAD_DIRECTORY_ASYNC",
              "FILE_MANAGEMENT",
              `Org:${organizationId}/${path} (Download URL: ${downloadUrl})`,
              "DIRECTORY",
              { organizationId },
            );

            // Create file transfer report for directory download (ACA)
            try {
              const { fileTransferReportService } = await import("./fileTransferReportService");
              let dbUserId = user?.id || 0;
              if (!dbUserId || dbUserId === 0) {
                const dbUser = await storage.getUserByEmail(user.email.toLowerCase().trim());
                dbUserId = dbUser?.id || 0;
              }
              if (dbUserId && dbUserId !== 0) {
                const { actionId: dirReportId } = await fileTransferReportService.initializeReport(
                  organizationId, dbUserId, "DOWNLOAD", 1,
                  storageAccount.name, storageAccount.containerName,
                  user?.email, user?.name
                );
                const fileResults = [{ fullPath: path, status: "SUCCESS" as const, sizeBytes: 0 }];
                await fileTransferReportService.finalizeReport(dirReportId, fileResults, user?.email, user?.name);
                console.log(`📊 [REPORT] Directory download (ACA) report created: ${dirReportId}`);
              }
            } catch (reportErr) {
              console.error("📊 [REPORT] Failed to create directory download report:", reportErr);
            }

          } catch (acaError) {
            console.error("❌ [ACA] Container app zip creation failed:", acaError);
            // Fallback to traditional method
            console.log("📁 [FALLBACK] Falling back to in-memory zipping due to ACA failure");
            return await traditionalZipDownload(req, res, organizationId, path, storageAccount);
          }
        } else {
          // 💾 In-memory approach for small folders
          console.log(`💾 [MEMORY] Using in-memory zipping for small folder: ${path}`);
          return await traditionalZipDownload(req, res, organizationId, path, storageAccount);
        }

      } catch (error: any) {
        console.error("Directory download error:", error);
        if (!res.headersSent) {
          res
            .status(500)
            .json({ error: error?.message || "Failed to download directory" });
        }
      }
    },
  );

  // Traditional zip download function (extracted for reuse)
  async function traditionalZipDownload(req: any, res: any, organizationId: number, path: string, storageAccount: any) {
    const directoryPath = path;
    const dataLakeService = new DataLakeServiceClient(
      `https://${storageAccount.name}.dfs.core.windows.net`,
      credential!,
    );
    const fsClient = dataLakeService.getFileSystemClient(storageAccount.containerName);

    // Create zip archive
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Maximum compression
    });

    const directoryName = directoryPath.split("/").pop() || "directory";
    const zipFileName = `${directoryName}.zip`;

    // Set response headers for zip download
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${zipFileName}"`,
    );
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Transfer-Encoding", "chunked");

    // Handle archive errors
    archive.on("error", (err) => {
      console.error("Archive error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to create zip archive" });
      }
    });

    // Handle archive warnings
    archive.on("warning", (err) => {
      console.warn("Archive warning:", err);
    });

    // Pipe archive to response
    archive.pipe(res);

    // Get all files in the directory recursively
    const pathsToAdd: string[] = [];
    for await (const pathItem of fsClient.listPaths({
      path: directoryPath,
      recursive: true,
    })) {
      if (!pathItem.isDirectory && pathItem.name) {
        pathsToAdd.push(pathItem.name);
      }
    }

    console.log(
      `Adding ${pathsToAdd.length} files to zip for directory: ${directoryPath}`,
    );

    // Add each file to the archive with proper stream handling
    const streamPromises: Promise<void>[] = [];
    
    for (const filePath of pathsToAdd) {
      if (!filePath) continue;

      const streamPromise = new Promise<void>(async (resolve, reject) => {
        try {
          const fileClient = fsClient.getFileClient(filePath);
          const downloadResponse = await fileClient.read();

          if (downloadResponse.readableStreamBody) {
            // Calculate relative path within the directory
            const relativePath = filePath.startsWith(directoryPath)
              ? filePath.substring(directoryPath.length + 1)
              : filePath;

            console.log(`Adding file to zip: ${relativePath} (${filePath})`);

            // Convert ReadableStream to Node.js Readable and handle completion
            const nodeStream = downloadResponse.readableStreamBody as any;
            
            // Wait for the stream to be fully processed
            nodeStream.on('end', () => {
              console.log(`File stream completed: ${relativePath}`);
              resolve();
            });
            
            nodeStream.on('error', (error: any) => {
              console.error(`Stream error for ${relativePath}:`, error);
              reject(error);
            });
            
            archive.append(nodeStream, { name: relativePath });
          } else {
            resolve();
          }
        } catch (fileError) {
          console.warn(
            `Failed to add file ${filePath} to archive:`,
            fileError,
          );
          // Continue with other files even if one fails
          resolve();
        }
      });
      
      streamPromises.push(streamPromise);
    }

    // Wait for all streams to complete before finalizing
    console.log(`Waiting for ${streamPromises.length} file streams to complete...`);
    await Promise.allSettled(streamPromises);
    console.log('All file streams completed, finalizing archive...');

    // Log directory download activity
    await logUserActivity(
      req,
      "DOWNLOAD_DIRECTORY",
      "FILE_MANAGEMENT",
      `Org:${organizationId}/${directoryPath}`,
      "DIRECTORY",
      { organizationId },
    );

    // Create file transfer report for directory download (traditional)
    try {
      const { fileTransferReportService } = await import("./fileTransferReportService");
      const user = (req as any).user;
      let dbUserId = user?.id || 0;
      if (!dbUserId || dbUserId === 0) {
        const dbUser = await storage.getUserByEmail(user.email.toLowerCase().trim());
        dbUserId = dbUser?.id || 0;
      }
      if (dbUserId && dbUserId !== 0) {
        const storageAccountData = await storage.getStorageAccountByOrganization(organizationId);
        const { actionId: dirReportId } = await fileTransferReportService.initializeReport(
          organizationId, dbUserId, "DOWNLOAD", pathsToAdd.length,
          storageAccountData?.name || storageAccount.name, storageAccountData?.containerName || storageAccount.containerName,
          user?.email, user?.name
        );
        const fileResults = pathsToAdd.map(fp => ({ fullPath: fp, status: "SUCCESS" as const, sizeBytes: 0 }));
        await fileTransferReportService.finalizeReport(dirReportId, fileResults, user?.email, user?.name);
        console.log(`📊 [REPORT] Directory download (traditional) report created: ${dirReportId} with ${pathsToAdd.length} files`);
      }
    } catch (reportErr) {
      console.error("📊 [REPORT] Failed to create directory download report:", reportErr);
    }

    // Finalize the archive after all streams are processed
    await archive.finalize();
    console.log('Archive finalized successfully');
  }

  // Bulk download selected files/folders - SECURE: Generates SAS URLs for parallel downloads
  // IMPROVED: No server bandwidth, unlimited scalability, client downloads in parallel
  app.post(
    "/api/files/bulk-download",
    tokenRequired,
    organizationAccessRequired,
    async (req, res) => {
      try {
        const { organizationId, items } = req.body;

        if (!organizationId || !Array.isArray(items) || items.length === 0) {
          return res
            .status(400)
            .json({ error: "Organization ID and items array are required" });
        }

        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res
            .status(404)
            .json({ error: "No storage account found for this organization" });
        }

        if (!credential) {
          return res
            .status(500)
            .json({ error: "Azure credentials not configured" });
        }

        const user = (req as any).user;
        const userRoles = await storage.getUserRolesByEmail(user.email);
        const primaryRole = userRoles.find(ur => ur.organizationId === organizationId);
        
        if (!primaryRole) {
          return res
            .status(403)
            .json({ error: "User does not have access to this organization" });
        }

        const rolePermissionsData = await storage.getUserRolePermissions(user.email, primaryRole.roleId);
        const filePermissions = rolePermissionsData?.fileMgmt;

        const files: string[] = [];
        const folders: string[] = [];

        // SECURITY: Validate permissions per item type
        for (const item of items) {
          if (item.type === 'file') {
            if (!filePermissions?.downloadFile) {
              return res
                .status(403)
                .json({ error: "Missing downloadFile permission for selected files" });
            }
            files.push(item.path);
          } else if (item.type === 'directory') {
            if (!filePermissions?.downloadFolder) {
              return res
                .status(403)
                .json({ error: "Missing downloadFolder permission for selected folders" });
            }
            folders.push(item.path);
          }
        }

        // Collect all file paths (including files within folders)
        const dataLakeService = new DataLakeServiceClient(
          `https://${storageAccount.name}.dfs.core.windows.net`,
          credential!,
        );
        const fsClient = dataLakeService.getFileSystemClient(storageAccount.containerName);

        const allFilePaths: string[] = [];

        // Add individual files
        for (const filePath of files) {
          allFilePaths.push(filePath);
        }

        // Add all files within folders (recursively)
        for (const folderPath of folders) {
          for await (const pathItem of fsClient.listPaths({
            path: folderPath,
            recursive: true,
          })) {
            if (!pathItem.isDirectory && pathItem.name) {
              allFilePaths.push(pathItem.name);
            }
          }
        }

        console.log(
          `📦 [BULK DOWNLOAD] Processing ${allFilePaths.length} files (${files.length} files + ${folders.length} folders)`,
        );

        // Calculate total size to determine routing strategy
        let totalSize = 0;
        for (const filePath of allFilePaths) {
          try {
            const fileClient = fsClient.getFileClient(filePath);
            const properties = await fileClient.getProperties();
            totalSize += properties.contentLength || 0;
          } catch (error) {
            console.warn(`Failed to get size for ${filePath}:`, error);
          }
        }

        // Use existing ZIP strategy threshold from environment variable (default 100MB)
        const thresholdMB = parseInt(process.env.ZAPPER_ZIP_STRATEGY_THRESHOLD_MB || '100', 10);
        const thresholdBytes = thresholdMB * 1024 * 1024;
        const totalSizeMB = totalSize / (1024 * 1024);
        
        console.log(`📊 Total size: ${totalSizeMB.toFixed(2)} MB (threshold: ${thresholdMB} MB)`);

        // REJECT LARGE DOWNLOADS with helpful guidance
        if (totalSize >= thresholdBytes) {
          console.log(`⚠️ Large download rejected (${totalSizeMB.toFixed(2)} MB exceeds ${thresholdMB} MB limit)`);
          
          return res.status(413).json({
            error: "Download size exceeds limit",
            totalSizeMB: totalSizeMB.toFixed(2),
            limitMB: thresholdMB,
            totalFiles: allFilePaths.length,
            message: `The selected files total ${totalSizeMB.toFixed(2)} MB, which exceeds the bulk download limit of ${thresholdMB} MB. For large folders, please download them individually using the folder download option.`,
            suggestion: "Download large folders one at a time by clicking the download icon next to the folder name. This uses an asynchronous processing system that can handle folders up to 20GB+.",
          });
        }

        // HANDLE SMALL DOWNLOADS with fast inline ZIP creation
        console.log(`⚡ Small download (${totalSizeMB.toFixed(2)} MB), creating ZIP inline`);
        
        // CHECK: Detect if files have directory structure
        const hasDirectoryStructure = allFilePaths.some(path => path.includes('/'));
        
        // CREATE ZIP with folder structure preservation
        const blobServiceClient = new BlobServiceClient(
          `https://${storageAccount.name}.blob.core.windows.net`,
          credential!,
        );
        const containerClient = blobServiceClient.getContainerClient(storageAccount.containerName);

        // Generate unique ZIP filename
        const timestamp = Date.now();
        const zipFileName = `bulk-download-${timestamp}.zip`;
        const zipBlobClient = containerClient.getBlockBlobClient(zipFileName);

        // Create ZIP archive with folder structure
        const archive = archiver('zip', { zlib: { level: 6 } });
        
        // Handle archive errors
        archive.on('error', (err) => {
          console.error('❌ Archive error:', err);
          throw err;
        });
        
        archive.on('warning', (err) => {
          if (err.code === 'ENOENT') {
            console.warn('⚠️ Archiver warning:', err.message);
          } else {
            throw err;
          }
        });

        // Start upload to Azure Blob Storage
        const uploadPromise = zipBlobClient.uploadStream(
          archive,
          4 * 1024 * 1024, // 4MB blocks
          4, // 4 concurrent uploads
          { blobHTTPHeaders: { blobContentType: 'application/zip' } }
        );

        // Add files to archive with relative paths (preserves folder structure!)
        for (const filePath of allFilePaths) {
          try {
            const blobClient = containerClient.getBlobClient(filePath);
            const downloadResponse = await blobClient.download();
            
            if (!downloadResponse.readableStreamBody) {
              console.warn(`⚠️ No stream for ${filePath}, skipping`);
              continue;
            }

            // Add file to ZIP with its full path (preserves directory structure)
            // Azure SDK returns a Node.js Readable stream, which is compatible with archiver
            const stream = downloadResponse.readableStreamBody as NodeJS.ReadableStream;
            archive.append(stream as any, { name: filePath });
            console.log(`  ✅ Added to ZIP: ${filePath}`);
          } catch (fileError) {
            console.warn(`⚠️ Failed to add ${filePath} to ZIP:`, fileError);
          }
        }

        // Finalize the archive
        await archive.finalize();
        console.log(`📦 Archive finalized, waiting for upload to complete...`);
        
        // Wait for upload to finish
        await uploadPromise;
        console.log(`✅ ZIP uploaded to blob: ${zipFileName}`);

        // Generate SAS URL for the ZIP file
        let downloadSasTimeSeconds = parseInt(process.env.ZAPPER_DOWNLOAD_SAS_TIME || '300', 10);
        
        if (isNaN(downloadSasTimeSeconds) || downloadSasTimeSeconds < 60) {
          downloadSasTimeSeconds = 60;
        }
        if (downloadSasTimeSeconds > 3600) {
          downloadSasTimeSeconds = 3600;
        }
        
        const startsOn = new Date();
        const expiresOn = new Date(startsOn.getTime() + downloadSasTimeSeconds * 1000);
        
        const userDelegationKey = await blobServiceClient.getUserDelegationKey(
          startsOn,
          expiresOn
        );

        const ipRange = getClientIpRange(req);
        const sasOptions: any = {
          containerName: storageAccount.containerName,
          blobName: zipFileName,
          permissions: BlobSASPermissions.parse("r"),
          startsOn,
          expiresOn,
        };

        if (ipRange) {
          sasOptions.ipRange = ipRange;
        }

        const sasToken = generateBlobSASQueryParameters(
          sasOptions,
          userDelegationKey,
          storageAccount.name
        ).toString();

        const zipUrl = `${zipBlobClient.url}?${sasToken}`;

        // Log bulk download activity
        await ActivityLogger.log({
          userId: user.oid || user.id || "unknown",
          userName: user.name || user.displayName || "Unknown User",
          email: user.email,
          ipAddress: getClientIp(req),
          action: ActivityActions.DOWNLOAD_DIRECTORY,
          actionCategory: 'FILE_MANAGEMENT',
          resource: `Org:${organizationId}/bulk-download`,
          resourceType: 'DIRECTORY',
          roleId: primaryRole?.roleId,
          roleName: primaryRole?.role?.name,
          organizationId: organizationId,
          organizationName: primaryRole?.organization?.name,
          details: {
            itemCount: items.length,
            filesCount: files.length,
            foldersCount: folders.length,
            files: files,
            folders: folders,
            totalFiles: allFilePaths.length,
            zipFileName: zipFileName,
            hasDirectoryStructure,
            expiresIn: downloadSasTimeSeconds,
          },
        });

        console.log(`📦 [BULK DOWNLOAD-ZIP] ZIP created with folder structure preserved (expires in ${downloadSasTimeSeconds}s)`);

        // Create file transfer report for bulk download
        try {
          const { fileTransferReportService } = await import("./fileTransferReportService");
          let dbUserId = user?.id || 0;
          if (!dbUserId || dbUserId === 0) {
            const dbUser = await storage.getUserByEmail(user.email.toLowerCase().trim());
            dbUserId = dbUser?.id || 0;
          }
          if (dbUserId && dbUserId !== 0) {
            const { actionId: bulkReportId } = await fileTransferReportService.initializeReport(
              organizationId, dbUserId, "DOWNLOAD", allFilePaths.length,
              storageAccount.name, storageAccount.containerName,
              user?.email, user?.name
            );
            const fileResults = allFilePaths.map(fp => ({ fullPath: fp, status: "SUCCESS" as const, sizeBytes: 0 }));
            await fileTransferReportService.finalizeReport(bulkReportId, fileResults, user?.email, user?.name);
            console.log(`📊 [REPORT] Bulk download report created: ${bulkReportId} with ${allFilePaths.length} files`);
          }
        } catch (reportErr) {
          console.error("📊 [REPORT] Failed to create bulk download report:", reportErr);
        }

        // Return single ZIP download URL (preserves folder structure!)
        res.json({
          zipUrl,
          zipFileName,
          totalFiles: allFilePaths.length,
          expiresIn: downloadSasTimeSeconds,
          preservedStructure: hasDirectoryStructure,
        });
      } catch (error: any) {
        console.error("Bulk download error:", error);
        if (!res.headersSent) {
          res
            .status(500)
            .json({ error: error?.message || "Failed to create bulk download" });
        }
      }
    },
  );

  // Bulk manifest endpoint - NO ZIP! Direct folder download for modern browsers
  // Returns manifest with SAS URLs for parallel client-side downloads
  // Supports Chrome/Edge 86+ with File System Access API
  app.post(
    "/api/files/bulk-manifest",
    tokenRequired,
    organizationAccessRequired,
    async (req, res) => {
      try {
        const { organizationId, items } = req.body;

        if (!organizationId || !Array.isArray(items) || items.length === 0) {
          return res
            .status(400)
            .json({ error: "Organization ID and items array are required" });
        }

        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res
            .status(404)
            .json({ error: "No storage account found for this organization" });
        }

        if (!credential) {
          return res
            .status(500)
            .json({ error: "Azure credentials not configured" });
        }

        const user = (req as any).user;
        const userRoles = await storage.getUserRolesByEmail(user.email);
        const primaryRole = userRoles.find(ur => ur.organizationId === organizationId);
        
        if (!primaryRole) {
          return res
            .status(403)
            .json({ error: "User does not have access to this organization" });
        }

        const rolePermissionsData = await storage.getUserRolePermissions(user.email, primaryRole.roleId);
        const filePermissions = rolePermissionsData?.fileMgmt;

        const files: string[] = [];
        const folders: string[] = [];

        // SECURITY: Validate permissions per item type
        for (const item of items) {
          if (item.type === 'file') {
            if (!filePermissions?.downloadFile) {
              return res
                .status(403)
                .json({ error: "Missing downloadFile permission for selected files" });
            }
            files.push(item.path);
          } else if (item.type === 'directory') {
            if (!filePermissions?.downloadFolder) {
              return res
                .status(403)
                .json({ error: "Missing downloadFolder permission for selected folders" });
            }
            folders.push(item.path);
          }
        }

        // Collect all file paths (including files within folders)
        const dataLakeService = new DataLakeServiceClient(
          `https://${storageAccount.name}.dfs.core.windows.net`,
          credential!,
        );
        const fsClient = dataLakeService.getFileSystemClient(storageAccount.containerName);

        const allFilePaths: string[] = [];

        // Add individual files
        for (const filePath of files) {
          allFilePaths.push(filePath);
        }

        // Add all files within folders (recursively)
        for (const folderPath of folders) {
          for await (const pathItem of fsClient.listPaths({
            path: folderPath,
            recursive: true,
          })) {
            if (!pathItem.isDirectory && pathItem.name) {
              allFilePaths.push(pathItem.name);
            }
          }
        }

        console.log(
          `📋 [BULK MANIFEST] Generating manifest for ${allFilePaths.length} files (${files.length} files + ${folders.length} folders)`,
        );

        // Generate SAS URLs for each file
        const blobServiceClient = new BlobServiceClient(
          `https://${storageAccount.name}.blob.core.windows.net`,
          credential!,
        );

        // SAS token configuration (15 minutes should be enough for parallel downloads)
        let downloadSasTimeSeconds = parseInt(process.env.ZAPPER_DOWNLOAD_SAS_TIME || '900', 10);
        
        if (isNaN(downloadSasTimeSeconds) || downloadSasTimeSeconds < 60) {
          downloadSasTimeSeconds = 60;
        }
        if (downloadSasTimeSeconds > 3600) {
          downloadSasTimeSeconds = 3600;
        }
        
        const startsOn = new Date();
        const expiresOn = new Date(startsOn.getTime() + downloadSasTimeSeconds * 1000);
        
        const userDelegationKey = await blobServiceClient.getUserDelegationKey(
          startsOn,
          expiresOn
        );

        const ipRange = getClientIpRange(req);
        
        // Build manifest with file metadata and SAS URLs
        // Process files in parallel batches for better performance
        const manifestFiles = [];
        let totalSize = 0;
        const BATCH_SIZE = 50; // Process 50 files at a time

        for (let i = 0; i < allFilePaths.length; i += BATCH_SIZE) {
          const batch = allFilePaths.slice(i, i + BATCH_SIZE);
          
          const batchPromises = batch.map(async (filePath) => {
            try {
              const blobClient = blobServiceClient
                .getContainerClient(storageAccount.containerName)
                .getBlobClient(filePath);
              
              const properties = await blobClient.getProperties();
              const fileSize = properties.contentLength || 0;

              // Generate individual SAS URL for this file
              const sasOptions: any = {
                containerName: storageAccount.containerName,
                blobName: filePath,
                permissions: BlobSASPermissions.parse("r"),
                startsOn,
                expiresOn,
              };

              if (ipRange) {
                sasOptions.ipRange = ipRange;
              }

              const sasToken = generateBlobSASQueryParameters(
                sasOptions,
                userDelegationKey,
                storageAccount.name
              ).toString();

              const url = `${blobClient.url}?${sasToken}`;

              return {
                path: filePath,
                url: url,
                size: fileSize,
                contentType: properties.contentType || 'application/octet-stream',
              };
            } catch (error) {
              console.warn(`⚠️ Failed to get properties for ${filePath}:`, error);
              return null; // Skip failed files
            }
          });

          const batchResults = await Promise.all(batchPromises);
          
          // Add successful results to manifest
          for (const result of batchResults) {
            if (result) {
              manifestFiles.push(result);
              totalSize += result.size;
            }
          }
          
          console.log(`📋 [BULK MANIFEST] Processed ${Math.min(i + BATCH_SIZE, allFilePaths.length)}/${allFilePaths.length} files...`);
        }

        // Log bulk manifest generation activity
        await ActivityLogger.log({
          userId: user.oid || user.id || "unknown",
          userName: user.name || user.displayName || "Unknown User",
          email: user.email,
          ipAddress: getClientIp(req),
          action: ActivityActions.DOWNLOAD_DIRECTORY,
          actionCategory: 'FILE_MANAGEMENT',
          resource: `Org:${organizationId}/bulk-manifest`,
          resourceType: 'DIRECTORY',
          roleId: primaryRole?.roleId,
          roleName: primaryRole?.role?.name,
          organizationId: organizationId,
          organizationName: primaryRole?.organization?.name,
          details: {
            itemCount: items.length,
            filesCount: files.length,
            foldersCount: folders.length,
            totalFiles: manifestFiles.length,
            totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
            method: 'NO_ZIP_MANIFEST',
            expiresIn: downloadSasTimeSeconds,
          },
        });

        console.log(`📋 [BULK MANIFEST] Generated manifest for ${manifestFiles.length} files (${(totalSize / (1024 * 1024)).toFixed(2)} MB)`);

        // Create file transfer report for bulk manifest download
        try {
          const { fileTransferReportService } = await import("./fileTransferReportService");
          let dbUserId = user?.id || 0;
          if (!dbUserId || dbUserId === 0) {
            const dbUser = await storage.getUserByEmail(user.email.toLowerCase().trim());
            dbUserId = dbUser?.id || 0;
          }
          if (dbUserId && dbUserId !== 0) {
            const { actionId: manifestReportId } = await fileTransferReportService.initializeReport(
              organizationId, dbUserId, "DOWNLOAD", manifestFiles.length,
              storageAccount.name, storageAccount.containerName,
              user?.email, user?.name
            );
            const fileResults = manifestFiles.map(f => ({ fullPath: f.path, status: "SUCCESS" as const, sizeBytes: f.size || 0 }));
            await fileTransferReportService.finalizeReport(manifestReportId, fileResults, user?.email, user?.name);
            console.log(`📊 [REPORT] Bulk manifest download report created: ${manifestReportId} with ${manifestFiles.length} files`);
          }
        } catch (reportErr) {
          console.error("📊 [REPORT] Failed to create bulk manifest download report:", reportErr);
        }

        // Return manifest
        res.json({
          files: manifestFiles,
          totalFiles: manifestFiles.length,
          totalSize: totalSize,
          totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
          expiresIn: downloadSasTimeSeconds,
          expiresAt: expiresOn.toISOString(),
        });
      } catch (error: any) {
        console.error("Bulk manifest error:", error);
        if (!res.headersSent) {
          res
            .status(500)
            .json({ error: error?.message || "Failed to generate bulk manifest" });
        }
      }
    },
  );

  // Check download status endpoint for ACA-based downloads
  app.get(
    "/api/files/download-status",
    tokenRequired,
    organizationAccessRequired,
    fileReadAccessRequired,
    async (req, res) => {
      try {
        const jobId = req.query.jobId as string;

        if (!jobId) {
          return res
            .status(400)
            .json({ error: "Job ID is required" });
        }

        console.log(`📁 [STATUS] Checking status for job: ${jobId}`);
        const status = await acaZipperService.getJobStatus(jobId);

        res.json(status);
      } catch (error: any) {
        console.error("Status check error:", error);
        res
          .status(500)
          .json({ error: error?.message || "Failed to check job status" });
      }
    },
  );

  // SFTP Configuration Routes

  // Get SFTP status for a storage account
  app.get(
    "/api/storage-accounts/:storageAccountName/sftp",
    tokenRequired,
    storageManagementPermissionRequired('view'),
    async (req, res) => {
      try {
        const { storageAccountName } = req.params;

        // SECURITY: Validate storage account name format
        const nameValidation = validateStorageAccountName(storageAccountName);
        if (!nameValidation.valid) {
          return res.status(400).json({ error: nameValidation.error });
        }

        const validatedName = nameValidation.sanitized!;

        if (!subscriptionId || !resourceGroup || !credential) {
          return res
            .status(500)
            .json({ error: "Azure credentials not configured" });
        }

        const storageClient = new StorageManagementClient(
          credential!,
          subscriptionId!,
        );

        try {
          // Get storage account properties to check SFTP status
          const azureStorageAccount =
            await storageClient.storageAccounts.getProperties(
              resourceGroup!,
              validatedName,
            );
          const isSftpEnabled = azureStorageAccount.isSftpEnabled || false;

          // Log SFTP status check activity
          await logUserActivity(
            req,
            "VIEW_SFTP_STATUS",
            "STORAGE_MANAGEMENT",
            `Storage Account: ${validatedName}`,
            "STORAGE_ACCOUNT",
          );

          res.json({
            storageAccountName: validatedName,
            isEnabled: isSftpEnabled,
          });
        } catch (azureError: any) {
          console.error("Azure SFTP status check error:", azureError);
          res
            .status(404)
            .json({ error: "Storage account not found or inaccessible" });
        }
      } catch (error: any) {
        console.error("SFTP status check error:", error);
        res
          .status(500)
          .json({ error: error?.message || "Failed to check SFTP status" });
      }
    },
  );

  // Toggle SFTP status for a storage account
  app.put(
    "/api/storage-accounts/:storageAccountName/sftp",
    tokenRequired,
    storageManagementPermissionRequired('addContainer'),
    async (req, res) => {
      try {
        const { storageAccountName } = req.params;
        const { enabled } = req.body;

        // SECURITY: Validate storage account name format
        const nameValidation = validateStorageAccountName(storageAccountName);
        if (!nameValidation.valid) {
          return res.status(400).json({ error: nameValidation.error });
        }

        const validatedName = nameValidation.sanitized!;

        if (typeof enabled !== "boolean") {
          return res
            .status(400)
            .json({ error: "Enabled flag must be a boolean" });
        }

        if (!subscriptionId || !resourceGroup || !credential) {
          return res
            .status(500)
            .json({ error: "Azure credentials not configured" });
        }

        const storageClient = new StorageManagementClient(
          credential!,
          subscriptionId!,
        );

        try {
          // Update storage account to enable/disable SFTP
          const updateParams = {
            isSftpEnabled: enabled,
            isHnsEnabled: true, // Hierarchical namespace is required for SFTP
          };

          await storageClient.storageAccounts.update(
            resourceGroup!,
            validatedName,
            updateParams,
          );

          // Log SFTP toggle activity
          const action = enabled ? "ENABLE_SFTP" : "DISABLE_SFTP";
          await logUserActivity(
            req,
            action,
            "STORAGE_MANAGEMENT",
            `Storage Account: ${validatedName}`,
            "STORAGE_ACCOUNT",
          );

          res.json({
            success: true,
            message: `SFTP ${enabled ? "enabled" : "disabled"} successfully`,
            storageAccountName: validatedName,
            isEnabled: enabled,
          });
        } catch (azureError: any) {
          console.error("Azure SFTP toggle error:", azureError);

          // Handle common Azure errors
          if (azureError.code === "StorageAccountNotFound") {
            return res.status(404).json({ error: "Storage account not found" });
          } else if (azureError.code === "HierarchicalNamespaceNotEnabled") {
            return res.status(400).json({
              error: "Hierarchical namespace must be enabled for SFTP",
            });
          } else {
            return res.status(500).json({
              error: azureError.message || "Failed to update SFTP settings",
            });
          }
        }
      } catch (error: any) {
        console.error("SFTP toggle error:", error);
        res
          .status(500)
          .json({ error: error?.message || "Failed to toggle SFTP" });
      }
    },
  );

  // Get SFTP status for an ADLS storage account
  app.get(
    "/api/adls-storage-accounts/:storageAccountName/sftp",
    tokenRequired,
    storageManagementPermissionRequired('view'),
    async (req, res) => {
      try {
        const { storageAccountName } = req.params;

        // SECURITY: Validate storage account name format
        const nameValidation = validateStorageAccountName(storageAccountName);
        if (!nameValidation.valid) {
          return res.status(400).json({ error: nameValidation.error });
        }

        const validatedName = nameValidation.sanitized!;

        if (!subscriptionId || !credential) {
          return res
            .status(500)
            .json({ error: "Azure credentials not configured" });
        }

        // Get ADLS storage account from database to find resource group
        const storageAccount = await storage.getStorageAccountByName(validatedName);
        if (!storageAccount || storageAccount.kind !== 'adls' || !storageAccount.resourceGroupName) {
          return res
            .status(404)
            .json({ error: "ADLS storage account not found" });
        }

        const storageClient = new StorageManagementClient(
          credential!,
          subscriptionId!,
        );

        try {
          // Get storage account properties to check SFTP status
          const azureStorageAccount =
            await storageClient.storageAccounts.getProperties(
              storageAccount.resourceGroupName,
              validatedName,
            );
          const isSftpEnabled = azureStorageAccount.isSftpEnabled || false;

          // Log SFTP status check activity
          await logUserActivity(
            req,
            "VIEW_SFTP_STATUS",
            "STORAGE_MANAGEMENT",
            `ADLS Storage Account: ${validatedName}`,
            "ADLS_STORAGE_ACCOUNT",
            storageAccount.organizationId ? { organizationId: storageAccount.organizationId } : undefined,
          );

          res.json({
            storageAccountName: validatedName,
            isEnabled: isSftpEnabled,
          });
        } catch (azureError: any) {
          console.error("Azure ADLS SFTP status check error:", azureError);
          res
            .status(404)
            .json({ error: "Storage account not found or inaccessible" });
        }
      } catch (error: any) {
        console.error("ADLS SFTP status check error:", error);
        res
          .status(500)
          .json({ error: error?.message || "Failed to check SFTP status" });
      }
    },
  );

  // Toggle SFTP status for an ADLS storage account
  app.put(
    "/api/adls-storage-accounts/:storageAccountName/sftp",
    tokenRequired,
    storageManagementPermissionRequired('addContainer'),
    async (req, res) => {
      try {
        const { storageAccountName } = req.params;
        const { enabled } = req.body;

        // SECURITY: Validate storage account name format
        const nameValidation = validateStorageAccountName(storageAccountName);
        if (!nameValidation.valid) {
          return res.status(400).json({ error: nameValidation.error });
        }

        const validatedName = nameValidation.sanitized!;

        if (typeof enabled !== "boolean") {
          return res
            .status(400)
            .json({ error: "Enabled flag must be a boolean" });
        }

        if (!subscriptionId || !credential) {
          return res
            .status(500)
            .json({ error: "Azure credentials not configured" });
        }

        // Get ADLS storage account from database to find resource group
        const storageAccount = await storage.getStorageAccountByName(validatedName);
        if (!storageAccount || storageAccount.kind !== 'adls' || !storageAccount.resourceGroupName) {
          return res
            .status(404)
            .json({ error: "ADLS storage account not found" });
        }

        const storageClient = new StorageManagementClient(
          credential!,
          subscriptionId!,
        );

        try {
          // Update storage account to enable/disable SFTP
          const updateParams = {
            isSftpEnabled: enabled,
            isHnsEnabled: true, // Hierarchical namespace is always enabled for ADLS Gen2
          };

          await storageClient.storageAccounts.update(
            storageAccount.resourceGroupName,
            validatedName,
            updateParams,
          );

          // Log SFTP toggle activity
          const action = enabled ? "ENABLE_SFTP" : "DISABLE_SFTP";
          await logUserActivity(
            req,
            action,
            "STORAGE_MANAGEMENT",
            `ADLS Storage Account: ${validatedName}`,
            "ADLS_STORAGE_ACCOUNT",
            storageAccount.organizationId ? { organizationId: storageAccount.organizationId } : undefined,
          );

          res.json({
            success: true,
            message: `SFTP ${enabled ? "enabled" : "disabled"} successfully`,
            storageAccountName: validatedName,
            isEnabled: enabled,
          });
        } catch (azureError: any) {
          console.error("Azure ADLS SFTP toggle error:", azureError);

          // Handle common Azure errors
          if (azureError.code === "StorageAccountNotFound") {
            return res.status(404).json({ error: "Storage account not found" });
          } else if (azureError.code === "HierarchicalNamespaceNotEnabled") {
            return res.status(400).json({
              error: "Hierarchical namespace must be enabled for SFTP",
            });
          } else {
            return res.status(500).json({
              error: azureError.message || "Failed to update SFTP settings",
            });
          }
        }
      } catch (error: any) {
        console.error("ADLS SFTP toggle error:", error);
        res
          .status(500)
          .json({ error: error?.message || "Failed to toggle SFTP" });
      }
    },
  );

  // =========================================================================================
  // ORGANIZATION USERS ENDPOINT (for SFTP mapping and other features)
  // =========================================================================================

  // Get users by organization for mapping purposes (returns flattened list with organizationId)
  app.get(
    "/api/organization-users",
    tokenRequired,
    async (req, res) => {
      try {
        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // Get organizations the current user has access to
        const userOrgIds = await storage.getUserOrganizationIds(userEmail);
        
        // Get all users with roles for those organizations
        const allUsersWithRoles = await storage.getAllUsersWithRoles();
        
        // Filter to only users in the current user's organizations and flatten the data
        const organizationUsers = allUsersWithRoles
          .filter(user => user.organizationId && userOrgIds.includes(user.organizationId))
          .map(user => ({
            id: user.id,
            name: user.name,
            email: user.email,
            organizationId: user.organizationId,
            organizationName: user.organizationName,
            roleName: user.roleName,
          }));

        res.json(organizationUsers);
      } catch (error: any) {
        console.error("Organization users list error:", error);
        res.status(500).json({ error: error?.message || "Failed to list organization users" });
      }
    }
  );

  // =========================================================================================
  // SFTP LOCAL USER MANAGEMENT ROUTES
  // =========================================================================================

  // List SFTP local users for user's organizations
  app.get(
    "/api/sftp-local-users",
    tokenRequired,
    sftpPermissionRequired('view'),
    async (req, res) => {
      try {
        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        const userOrgIds = await storage.getUserOrganizationIds(userEmail);
        const localUsers = await storage.getSftpLocalUsers(userOrgIds);

        await logUserActivity(req, "VIEW_SFTP_LOCAL_USERS", "SFTP_MANAGEMENT", `Listed ${localUsers.length} SFTP local users`, "SFTP_LOCAL_USER");

        res.json(localUsers);
      } catch (error: any) {
        console.error("SFTP local users list error:", error);
        res.status(500).json({ error: error?.message || "Failed to list SFTP local users" });
      }
    }
  );

  // Get current user's mapped SFTP access (self-service) - MUST be before /:id route
  app.get(
    "/api/sftp-local-users/my-access",
    tokenRequired,
    sftpPermissionRequired('viewSelfAccess'),
    async (req, res) => {
      try {
        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        const user = await storage.getUserByEmail(userEmail);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        // Get organization ID from query parameter for organization-aware filtering
        const organizationIdParam = req.query.organizationId as string | undefined;
        const organizationId = organizationIdParam ? parseInt(organizationIdParam, 10) : null;

        let localUser;
        if (organizationId && !isNaN(organizationId)) {
          // Get SFTP access for specific organization
          localUser = await storage.getSftpLocalUserByMappingInOrg(user.id, organizationId);
        } else {
          // Fallback to first mapped SFTP user (legacy behavior)
          localUser = await storage.getSftpLocalUserByMapping(user.id);
        }

        await logUserActivity(req, "VIEW_SFTP_SELF_ACCESS", "SFTP_MANAGEMENT", `Viewed own SFTP access${organizationId ? ` for org ${organizationId}` : ''}`, "SFTP_LOCAL_USER", organizationId ? { organizationId } : undefined);

        res.json(localUser || null);
      } catch (error: any) {
        console.error("SFTP my-access error:", error);
        res.status(500).json({ error: error?.message || "Failed to get SFTP access" });
      }
    }
  );

  // Get single SFTP local user by ID
  app.get(
    "/api/sftp-local-users/:id",
    tokenRequired,
    sftpPermissionRequired('view'),
    async (req, res) => {
      try {
        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        const id = validateIntegerId(req.params.id);
        if (id === null) {
          return res.status(400).json({ error: "Invalid ID format" });
        }

        const localUser = await storage.getSftpLocalUserById(id);
        if (!localUser) {
          return res.status(404).json({ error: "SFTP local user not found" });
        }

        const userOrgIds = await storage.getUserOrganizationIds(userEmail);
        if (!userOrgIds.includes(localUser.organizationId)) {
          return res.status(403).json({ error: "Access denied to this SFTP local user" });
        }

        res.json(localUser);
      } catch (error: any) {
        console.error("SFTP local user get error:", error);
        res.status(500).json({ error: error?.message || "Failed to get SFTP local user" });
      }
    }
  );

  // Create SFTP local user (org-centric approach: org selection determines storage+container)
  app.post(
    "/api/sftp-local-users",
    tokenRequired,
    sftpPermissionRequired('create'),
    async (req, res) => {
      try {
        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        const { organizationId, localUsername, displayName, mappedUserId, permissions, sshEnabled, passwordEnabled } = req.body;

        // Validate required fields
        if (!organizationId || !localUsername || !mappedUserId) {
          return res.status(400).json({ error: "Missing required fields: organizationId, localUsername, mappedUserId" });
        }

        // Validate user has access to org
        const userOrgIds = await storage.getUserOrganizationIds(userEmail);
        if (!userOrgIds.includes(organizationId)) {
          return res.status(403).json({ error: "Access denied to this organization" });
        }

        // Get ADLS storage account for the organization (1:1 org-to-storage+container for SFTP)
        const adlsAccounts = await storage.getStorageAccountsByOrganization(organizationId, 'adls');
        if (!adlsAccounts || adlsAccounts.length === 0) {
          return res.status(400).json({ error: "No ADLS storage account configured for this organization. Please add an ADLS storage account first." });
        }
        const storageBinding = adlsAccounts[0]; // Use first ADLS account (1:1 mapping enforced by business rule)

        // Validate mapped user exists and belongs to the organization
        const mappedUser = await storage.getUser(mappedUserId);
        if (!mappedUser) {
          return res.status(400).json({ error: "Mapped user not found" });
        }

        // Check mapped user is in the organization
        const mappedUserOrgIds = await storage.getUserOrganizationIds(mappedUser.email);
        if (!mappedUserOrgIds.includes(organizationId)) {
          return res.status(400).json({ error: "Mapped user does not belong to this organization" });
        }

        // Check for unique mapping (one SFTP user per mapped user per org)
        const existingMapping = await storage.getSftpLocalUserByMappedUserInOrg(organizationId, mappedUserId);
        if (existingMapping) {
          return res.status(400).json({ error: "This user is already mapped to an SFTP user in this organization" });
        }

        const user = await storage.getUserByEmail(userEmail);
        if (!user) {
          return res.status(401).json({ error: "User not found" });
        }

        // Use storage account for Azure scope (subscriptionId from env, storage details from DB)
        const subscriptionId = process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || process.env.AZURE_SUBSCRIPTION_ID;
        if (!subscriptionId) {
          return res.status(500).json({ error: "Azure subscription not configured" });
        }
        const azureScope = {
          subscriptionId,
          resourceGroup: storageBinding.resourceGroupName || '',
          storageAccountName: storageBinding.name,
        };

        // Validate container name exists
        if (!storageBinding.containerName) {
          return res.status(400).json({ error: "Storage account does not have a container configured" });
        }

        // Create permission scope with the binding's container
        const permissionScopes = [{
          containerName: storageBinding.containerName,
          permissions: permissions || { read: true, write: false, list: true, delete: false },
        }];

        await azureSftpService.createLocalUser(azureScope, localUsername, {
          sshEnabled: sshEnabled !== false,
          passwordEnabled: passwordEnabled === true,
          permissionScopes,
        });

        let secretToken: string | undefined;
        let sshFingerprint: string | undefined;
        const credentials: { privateKey?: string; password?: string } = {};

        if (sshEnabled !== false) {
          const keyPair = azureSftpService.generateSshKeyPair();
          await azureSftpService.replaceAuthorizedKeys(azureScope, localUsername, keyPair.publicKey);
          credentials.privateKey = keyPair.privateKey;
          sshFingerprint = keyPair.fingerprint;
        }

        if (passwordEnabled === true) {
          credentials.password = await azureSftpService.regeneratePassword(azureScope, localUsername);
        }

        if (credentials.privateKey || credentials.password) {
          const secretValue = JSON.stringify(credentials);
          secretToken = sftpSecretCache.generateToken();
          sftpSecretCache.store(secretToken, secretValue, organizationId, 0);
        }

        const dbUser = await storage.createSftpLocalUser({
          organizationId,
          subscriptionId: azureScope.subscriptionId,
          resourceGroup: azureScope.resourceGroup,
          storageAccountName: storageBinding.name,
          containerName: storageBinding.containerName || '',
          localUsername,
          displayName: displayName || null,
          status: 'ACTIVE',
          sshEnabled: sshEnabled !== false,
          passwordEnabled: passwordEnabled === true,
          mappedUserId,
          mappedEntraEmail: mappedUser.email,
          sshKeyFingerprint: sshFingerprint,
          createdByUserId: user.id,
        });

        // Store the scope for the container with permissions
        await storage.replaceSftpLocalUserScopes(dbUser.id, organizationId, [{
          containerName: storageBinding.containerName,
          permissions: permissions || { read: true, write: false, list: true, delete: false },
        }]);

        await logUserActivity(req, "CREATE_SFTP_LOCAL_USER", "SFTP_MANAGEMENT", `Created SFTP local user: ${localUsername} on ${storageBinding.storageAccountName}`, "SFTP_LOCAL_USER", { organizationId });

        res.status(201).json({
          ...dbUser,
          secretToken,
          scopes: [{
            containerName: storageBinding.containerName,
            permissions: permissions || { read: true, write: false, list: true, delete: false },
          }],
          mappedUserEmail: mappedUser.email,
          mappedUserName: mappedUser.name,
        });
      } catch (error: any) {
        console.error("SFTP local user create error:", error);
        res.status(500).json({ error: error?.message || "Failed to create SFTP local user" });
      }
    }
  );

  // Update SFTP local user
  app.put(
    "/api/sftp-local-users/:id",
    tokenRequired,
    sftpPermissionRequired('update'),
    async (req, res) => {
      try {
        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        const id = validateIntegerId(req.params.id);
        if (id === null) {
          return res.status(400).json({ error: "Invalid ID format" });
        }

        const localUser = await storage.getSftpLocalUserById(id);
        if (!localUser) {
          return res.status(404).json({ error: "SFTP local user not found" });
        }

        const userOrgIds = await storage.getUserOrganizationIds(userEmail);
        if (!userOrgIds.includes(localUser.organizationId)) {
          return res.status(403).json({ error: "Access denied to this SFTP local user" });
        }

        const { scopes, status, mappedUserId } = req.body;

        const azureScope = {
          subscriptionId: localUser.subscriptionId,
          resourceGroup: localUser.resourceGroup,
          storageAccountName: localUser.storageAccountName,
        };

        if (scopes) {
          const permissionScopes = scopes.map((s: any) => ({
            containerName: s.containerName,
            permissions: s.permissions || { read: true, write: false, list: true, delete: false },
          }));
          await azureSftpService.updateLocalUser(azureScope, localUser.localUsername, { permissionScopes });
        }

        const user = await storage.getUserByEmail(userEmail);
        const updated = await storage.updateSftpLocalUser(id, {
          status: status || localUser.status,
          mappedUserId: mappedUserId !== undefined ? mappedUserId : localUser.mappedUserId,
          updatedByUserId: user?.id,
        });

        if (scopes) {
          await storage.replaceSftpLocalUserScopes(id, localUser.organizationId, scopes);
        }

        await logUserActivity(req, "UPDATE_SFTP_LOCAL_USER", "SFTP_MANAGEMENT", `Updated SFTP local user: ${localUser.localUsername}`, "SFTP_LOCAL_USER", { organizationId: localUser.organizationId });

        res.json(updated);
      } catch (error: any) {
        console.error("SFTP local user update error:", error);
        res.status(500).json({ error: error?.message || "Failed to update SFTP local user" });
      }
    }
  );

  // Delete SFTP local user
  app.delete(
    "/api/sftp-local-users/:id",
    tokenRequired,
    sftpPermissionRequired('delete'),
    async (req, res) => {
      try {
        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        const id = validateIntegerId(req.params.id);
        if (id === null) {
          return res.status(400).json({ error: "Invalid ID format" });
        }

        const localUser = await storage.getSftpLocalUserById(id);
        if (!localUser) {
          return res.status(404).json({ error: "SFTP local user not found" });
        }

        const userOrgIds = await storage.getUserOrganizationIds(userEmail);
        if (!userOrgIds.includes(localUser.organizationId)) {
          return res.status(403).json({ error: "Access denied to this SFTP local user" });
        }

        const azureScope = {
          subscriptionId: localUser.subscriptionId,
          resourceGroup: localUser.resourceGroup,
          storageAccountName: localUser.storageAccountName,
        };

        // Try to delete from Azure, but continue even if user doesn't exist there
        try {
          await azureSftpService.deleteLocalUser(azureScope, localUser.localUsername);
        } catch (azureError: any) {
          // If Azure says user doesn't exist, that's fine - we still want to clean up our database
          const isNotFound = azureError?.message?.includes('does not exist') || 
                            azureError?.statusCode === 404 ||
                            azureError?.code === 'BlobNotFound';
          if (!isNotFound) {
            throw azureError; // Re-throw if it's a different error
          }
          console.log(`SFTP user ${localUser.localUsername} not found in Azure, proceeding with database cleanup`);
        }

        await storage.deleteSftpLocalUser(id);

        await logUserActivity(req, "DELETE_SFTP_LOCAL_USER", "SFTP_MANAGEMENT", `Deleted SFTP local user: ${localUser.localUsername}`, "SFTP_LOCAL_USER", { organizationId: localUser.organizationId });

        res.json({ success: true, message: "SFTP local user deleted successfully" });
      } catch (error: any) {
        console.error("SFTP local user delete error:", error);
        res.status(500).json({ error: error?.message || "Failed to delete SFTP local user" });
      }
    }
  );

  // Enable SFTP local user
  app.post(
    "/api/sftp-local-users/:id/enable",
    tokenRequired,
    sftpPermissionRequired('disable'),
    async (req, res) => {
      try {
        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        const id = validateIntegerId(req.params.id);
        if (id === null) {
          return res.status(400).json({ error: "Invalid ID format" });
        }

        const localUser = await storage.getSftpLocalUserById(id);
        if (!localUser) {
          return res.status(404).json({ error: "SFTP local user not found" });
        }

        const userOrgIds = await storage.getUserOrganizationIds(userEmail);
        if (!userOrgIds.includes(localUser.organizationId)) {
          return res.status(403).json({ error: "Access denied to this SFTP local user" });
        }

        const user = await storage.getUserByEmail(userEmail);
        await storage.updateSftpLocalUser(id, {
          status: 'active',
          updatedByUserId: user?.id,
        });

        await logUserActivity(req, "UPDATE_SFTP_LOCAL_USER", "SFTP_MANAGEMENT", `Enabled SFTP local user: ${localUser.localUsername}`, "SFTP_LOCAL_USER", { organizationId: localUser.organizationId });

        res.json({ success: true, message: "SFTP local user enabled" });
      } catch (error: any) {
        console.error("SFTP local user enable error:", error);
        res.status(500).json({ error: error?.message || "Failed to enable SFTP local user" });
      }
    }
  );

  // Disable SFTP local user
  app.post(
    "/api/sftp-local-users/:id/disable",
    tokenRequired,
    sftpPermissionRequired('disable'),
    async (req, res) => {
      try {
        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        const id = validateIntegerId(req.params.id);
        if (id === null) {
          return res.status(400).json({ error: "Invalid ID format" });
        }

        const localUser = await storage.getSftpLocalUserById(id);
        if (!localUser) {
          return res.status(404).json({ error: "SFTP local user not found" });
        }

        const userOrgIds = await storage.getUserOrganizationIds(userEmail);
        if (!userOrgIds.includes(localUser.organizationId)) {
          return res.status(403).json({ error: "Access denied to this SFTP local user" });
        }

        const user = await storage.getUserByEmail(userEmail);
        await storage.updateSftpLocalUser(id, {
          status: 'disabled',
          updatedByUserId: user?.id,
        });

        await logUserActivity(req, "DISABLE_SFTP_LOCAL_USER", "SFTP_MANAGEMENT", `Disabled SFTP local user: ${localUser.localUsername}`, "SFTP_LOCAL_USER", { organizationId: localUser.organizationId });

        res.json({ success: true, message: "SFTP local user disabled" });
      } catch (error: any) {
        console.error("SFTP local user disable error:", error);
        res.status(500).json({ error: error?.message || "Failed to disable SFTP local user" });
      }
    }
  );

  // Rotate SSH key for SFTP local user
  app.post(
    "/api/sftp-local-users/:id/rotate-ssh",
    tokenRequired,
    async (req, res) => {
      try {
        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        const id = validateIntegerId(req.params.id);
        if (id === null) {
          return res.status(400).json({ error: "Invalid ID format" });
        }

        const localUser = await storage.getSftpLocalUserById(id);
        if (!localUser) {
          return res.status(404).json({ error: "SFTP local user not found" });
        }

        const userOrgIds = await storage.getUserOrganizationIds(userEmail);
        const hasAdminPermission = await storage.checkUserSftpPermission(userEmail, 'update');
        const user = await storage.getUserByEmail(userEmail);
        const isSelfAccess = localUser.mappedUserId === user?.id;
        const hasSelfRotatePermission = isSelfAccess && await storage.checkUserSftpPermission(userEmail, 'rotateSshSelf');

        if (!userOrgIds.includes(localUser.organizationId) || (!hasAdminPermission && !hasSelfRotatePermission)) {
          return res.status(403).json({ error: "Access denied to rotate SSH key" });
        }

        const azureScope = {
          subscriptionId: localUser.subscriptionId,
          resourceGroup: localUser.resourceGroup,
          storageAccountName: localUser.storageAccountName,
        };

        const keyPair = azureSftpService.generateSshKeyPair();
        await azureSftpService.replaceAuthorizedKeys(azureScope, localUser.localUsername, keyPair.publicKey);

        const secretValue = JSON.stringify({ privateKey: keyPair.privateKey });
        const secretToken = sftpSecretCache.generateToken();
        sftpSecretCache.store(secretToken, secretValue, localUser.organizationId, id);

        await storage.updateSftpLocalUser(id, {
          sshKeyFingerprint: keyPair.fingerprint,
          sshLastRotatedAt: new Date(),
        });

        await storage.createSftpRotationEvent({
          sftpLocalUserId: id,
          rotationType: 'SSH_KEY',
          action: 'ROTATE',
          status: 'SUCCESS',
          actorUserId: user?.id || 0,
          actorEmail: userEmail,
          organizationId: localUser.organizationId,
        });

        await logUserActivity(req, "ROTATE_SFTP_SSH_KEY", "SFTP_MANAGEMENT", `Rotated SSH key for: ${localUser.localUsername}`, "SFTP_LOCAL_USER", { organizationId: localUser.organizationId });

        res.json({ success: true, secretToken });
      } catch (error: any) {
        console.error("SFTP SSH key rotation error:", error);
        res.status(500).json({ error: error?.message || "Failed to rotate SSH key" });
      }
    }
  );

  // Rotate password for SFTP local user
  app.post(
    "/api/sftp-local-users/:id/rotate-password",
    tokenRequired,
    async (req, res) => {
      try {
        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        const id = validateIntegerId(req.params.id);
        if (id === null) {
          return res.status(400).json({ error: "Invalid ID format" });
        }

        const localUser = await storage.getSftpLocalUserById(id);
        if (!localUser) {
          return res.status(404).json({ error: "SFTP local user not found" });
        }

        const userOrgIds = await storage.getUserOrganizationIds(userEmail);
        const hasAdminPermission = await storage.checkUserSftpPermission(userEmail, 'update');
        const user = await storage.getUserByEmail(userEmail);
        const isSelfAccess = localUser.mappedUserId === user?.id;
        const hasSelfRotatePermission = isSelfAccess && await storage.checkUserSftpPermission(userEmail, 'rotatePasswordSelf');

        if (!userOrgIds.includes(localUser.organizationId) || (!hasAdminPermission && !hasSelfRotatePermission)) {
          return res.status(403).json({ error: "Access denied to rotate password" });
        }

        const azureScope = {
          subscriptionId: localUser.subscriptionId,
          resourceGroup: localUser.resourceGroup,
          storageAccountName: localUser.storageAccountName,
        };

        const newPassword = await azureSftpService.regeneratePassword(azureScope, localUser.localUsername);

        const secretValue = JSON.stringify({ password: newPassword });
        const secretToken = sftpSecretCache.generateToken();
        sftpSecretCache.store(secretToken, secretValue, localUser.organizationId, id);

        await storage.updateSftpLocalUser(id, {
          passwordEnabled: true,
          passwordLastRotatedAt: new Date(),
        });

        await storage.createSftpRotationEvent({
          sftpLocalUserId: id,
          rotationType: 'PASSWORD',
          action: 'ROTATE',
          status: 'SUCCESS',
          actorUserId: user?.id || 0,
          actorEmail: userEmail,
          organizationId: localUser.organizationId,
        });

        await logUserActivity(req, "ROTATE_SFTP_PASSWORD", "SFTP_MANAGEMENT", `Rotated password for: ${localUser.localUsername}`, "SFTP_LOCAL_USER", { organizationId: localUser.organizationId });

        res.json({ success: true, secretToken });
      } catch (error: any) {
        console.error("SFTP password rotation error:", error);
        res.status(500).json({ error: error?.message || "Failed to rotate password" });
      }
    }
  );

  // Download SFTP credentials (one-time download using secret token)
  app.get(
    "/api/sftp-local-users/download/:token",
    tokenRequired,
    async (req, res) => {
      try {
        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        const { token } = req.params;
        const result = sftpSecretCache.consume(token);

        if ('error' in result) {
          const errorMessages: Record<string, string> = {
            TOKEN_NOT_FOUND: "Credentials not found or expired. Please regenerate credentials.",
            TOKEN_EXPIRED: "Credentials have expired. Please regenerate credentials.",
            TOKEN_ALREADY_USED: "Credentials have already been downloaded. For security, each credential can only be downloaded once.",
          };
          return res.status(404).json({ error: errorMessages[result.error] || "Failed to retrieve credentials" });
        }

        await logUserActivity(req, "DOWNLOAD_SFTP_CREDENTIALS", "SFTP_MANAGEMENT", `Downloaded SFTP credentials`, "SFTP_LOCAL_USER");

        res.json(JSON.parse(result.value));
      } catch (error: any) {
        console.error("SFTP credentials download error:", error);
        res.status(500).json({ error: error?.message || "Failed to download credentials" });
      }
    }
  );

  // Map user to SFTP local user
  app.post(
    "/api/sftp-local-users/:id/map-user",
    tokenRequired,
    sftpPermissionRequired('mapUser'),
    async (req, res) => {
      try {
        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        const id = validateIntegerId(req.params.id);
        if (id === null) {
          return res.status(400).json({ error: "Invalid ID format" });
        }

        const localUser = await storage.getSftpLocalUserById(id);
        if (!localUser) {
          return res.status(404).json({ error: "SFTP local user not found" });
        }

        const userOrgIds = await storage.getUserOrganizationIds(userEmail);
        if (!userOrgIds.includes(localUser.organizationId)) {
          return res.status(403).json({ error: "Access denied to this SFTP local user" });
        }

        const { mappedUserId } = req.body;

        if (mappedUserId) {
          const mappedUser = await storage.getUser(mappedUserId);
          if (!mappedUser) {
            return res.status(404).json({ error: "User to map not found" });
          }
        }

        const updated = await storage.updateSftpLocalUser(id, {
          mappedUserId: mappedUserId || null,
        });

        await logUserActivity(req, "MAP_SFTP_USER", "SFTP_MANAGEMENT", `Mapped user ${mappedUserId || 'none'} to SFTP user: ${localUser.localUsername}`, "SFTP_LOCAL_USER", { organizationId: localUser.organizationId });

        res.json(updated);
      } catch (error: any) {
        console.error("SFTP user mapping error:", error);
        res.status(500).json({ error: error?.message || "Failed to map user" });
      }
    }
  );

  // SFTP permissions endpoint (checks user's permissions)
  app.get(
    "/api/sftp-permissions",
    tokenRequired,
    async (req, res) => {
      try {
        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        const permissions = {
          view: await storage.checkUserSftpPermission(userEmail, 'view'),
          create: await storage.checkUserSftpPermission(userEmail, 'create'),
          update: await storage.checkUserSftpPermission(userEmail, 'update'),
          disable: await storage.checkUserSftpPermission(userEmail, 'disable'),
          delete: await storage.checkUserSftpPermission(userEmail, 'delete'),
          mapUser: await storage.checkUserSftpPermission(userEmail, 'mapUser'),
          viewSelfAccess: await storage.checkUserSftpPermission(userEmail, 'viewSelfAccess'),
          rotateSshSelf: await storage.checkUserSftpPermission(userEmail, 'rotateSshSelf'),
          rotatePasswordSelf: await storage.checkUserSftpPermission(userEmail, 'rotatePasswordSelf'),
        };

        res.json(permissions);
      } catch (error: any) {
        console.error("SFTP permissions check error:", error);
        res.status(500).json({ error: error?.message || "Failed to check SFTP permissions" });
      }
    }
  );

  // AI Agent permissions endpoint (checks across all user roles)
  app.get("/api/ai-agent-permissions", tokenRequired, aiAgentManagementAccessRequired, async (req, res) => {
    try {
      const user = (req as any).user;
      const email = user?.email || user?.preferred_username;

      if (!email) {
        return res
          .status(403)
          .json({ error: "Forbidden: No user email found" });
      }

      // Check AI agent permissions across all roles
      const permissions = {
        view: await storage.checkUserAiAgentPermission(email, 'view'),
        add: await storage.checkUserAiAgentPermission(email, 'add'),
        edit: await storage.checkUserAiAgentPermission(email, 'edit'),
        delete: await storage.checkUserAiAgentPermission(email, 'delete'),
      };

      res.json(permissions);
    } catch (error) {
      console.error("AI agent permissions check error:", error);
      res.status(500).json({ error: "Failed to check AI agent permissions" });
    }
  });

  // AI Agents routes - List accessible with ANY AI agent permission
  app.get(
    "/api/ai-agents",
    tokenRequired,
    aiAgentManagementAccessRequired,
    async (req, res) => {
      try {
        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }
        
        // Get user's organizations to filter by
        const userOrgIds = await storage.getUserOrganizationIds(userEmail);
        let agents = await storage.getAiAgentsForOrganizations(userOrgIds);

        // Additional filter by specific organization if organizationId is provided
        // Security: Validate organization ID to ensure positive integer
        const organizationIdParam = req.query.organizationId as string | undefined;
        const organizationId = organizationIdParam ? validateOrganizationId(organizationIdParam) : undefined;
        
        if (organizationIdParam && organizationId === null) {
          return res.status(400).json({
            error: "Invalid organization ID: must be a positive integer",
            received: organizationIdParam
          });
        }
        if (organizationId) {
          // organizationId is already validated as a positive integer
          // Only filter if the user has access to this organization
          if (userOrgIds.includes(organizationId)) {
            agents = agents.filter((agent) => agent.organizationId === organizationId);
          } else {
            // User doesn't have access to this organization
            agents = [];
          }
        }

        // Return agents without API keys for security
        const safeAgents = agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          apiEndpoint: agent.apiEndpoint,
          organizationId: agent.organizationId,
          useIpForSas: agent.useIpForSas,
          allowedIpAddress: agent.allowedIpAddress,
          sasValiditySeconds: agent.sasValiditySeconds,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt,
        }));

        await logUserActivity(
          req,
          "VIEW_AI_AGENTS",
          "AI_MANAGEMENT",
          "AI Agents List",
          "DATA",
          organizationId ? { organizationId } : undefined,
        );

        res.json(safeAgents);
      } catch (error) {
        console.error("AI agents fetch error:", error);
        res.status(500).json({ error: "Failed to fetch AI agents" });
      }
    },
  );

  /**
   * POST /api/files/sas-url
   * Generates a SAS URL for a specific blob.
   * Used by Blob Inventory for raw data downloads.
   * Body: { accountName, containerName, blobPath, organizationId }
   */
  app.post("/api/files/sas-url", tokenRequired, async (req, res) => {
    try {
      const { accountName, containerName, blobPath, organizationId } = req.body;

      if (!accountName || !containerName || !blobPath) {
        return res.status(400).json({ error: "accountName, containerName, and blobPath are required" });
      }

      const userEmail = req.user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // 🔒 SECURITY: Verify storage account exists and user has access
      const storageAccount = await storage.getStorageAccountByName(accountName);
      if (!storageAccount) {
        return res.status(404).json({ error: "Storage account not found" });
      }

      // Special case: zapper-system container is used for inventory/internal data
      // We should check organizationId if it's provided in the request
      const effectiveOrgId = organizationId || storageAccount.organizationId;

      const userOrgIds = await storage.getUserOrganizationIds(userEmail);
      if (!userOrgIds.includes(effectiveOrgId)) {
        return res.status(403).json({ error: "Access denied to this storage account" });
      }

      // Use the resource group name from the database record if available
      const resourceGroup = storageAccount.resourceGroupName || undefined;

      const sasUrl = await generateSasUrl(
        accountName,
        containerName,
        blobPath,
        getCred(),
        req,
        resourceGroup
      );

      // CRITICAL FIX: Ensure the SAS URL actually contains a SAS token
      if (!sasUrl.includes('?')) {
        console.error(`[SAS-INVENTORY] FAILED to generate SAS token for ${blobPath}. URL: ${sasUrl}`);
        return res.status(500).json({ error: "Failed to generate a valid SAS token. Please check Azure configuration." });
      }

      console.log(`[SAS-INVENTORY] Generated SAS URL: ${sasUrl}`);
      res.json({ sasUrl });
    } catch (error: any) {
      console.error("SAS URL generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate SAS URL" });
    }
  });

  app.post(
    "/api/ai-agents",
    tokenRequired,
    aiAgentManagementPermissionRequired("add"),
    async (req, res) => {
      try {
        // Validate using Zod schema
        const validationResult = insertAiAgentSchema.safeParse(req.body);
        
        if (!validationResult.success) {
          const errors = validationResult.error.errors.map((err: any) => ({
            field: err.path.join('.'),
            message: err.message
          }));
          return res.status(400).json({ 
            error: "Validation failed", 
            details: errors 
          });
        }

        const validatedData = validationResult.data;
        let { name, apiEndpoint, apiKey, organizationId, useIpForSas, allowedIpAddress, sasValiditySeconds } = validatedData;

        // Validate agent name - only alphanumeric characters allowed
        const namePattern = /^[a-zA-Z0-9]+$/;
        if (!namePattern.test(name)) {
          return res.status(400).json({
            error:
              "Agent name must contain only alphanumeric characters (a-z, A-Z, 0-9). No spaces or special characters allowed.",
          });
        }

        // Auto-clear IP address when IP restriction is disabled
        if (!useIpForSas) {
          allowedIpAddress = null;
        }

        // Check for duplicates (same name in same organization)
        const existingAgents = await storage.getAllAiAgents();
        const duplicateName = existingAgents.find(
          (agent) =>
            agent.name === name &&
            agent.organizationId === organizationId,
        );

        if (duplicateName) {
          return res.status(400).json({
            error:
              "An AI agent with this name already exists in the selected organization",
          });
        }

        // Also check for duplicates (same endpoint and key)
        const duplicateConfig = existingAgents.find(
          (agent) =>
            agent.apiEndpoint === apiEndpoint && agent.apiKey === apiKey,
        );

        if (duplicateConfig) {
          return res.status(400).json({
            error: "An AI agent with this endpoint and API key already exists",
          });
        }

        const agent = await storage.createAiAgent({
          name,
          apiEndpoint,
          apiKey,
          organizationId,
          useIpForSas: useIpForSas ?? false,
          allowedIpAddress: allowedIpAddress || null,
          sasValiditySeconds: sasValiditySeconds ?? 900,
        });

        await logUserActivity(
          req,
          "CREATE_AI_AGENT",
          "AI_MANAGEMENT",
          `AI Agent: ${name}`,
          "AI_AGENT",
          { organizationId },
        );

        // Return without API key
        res.status(201).json({
          id: agent.id,
          name: agent.name,
          apiEndpoint: agent.apiEndpoint,
          organizationId: agent.organizationId,
          useIpForSas: agent.useIpForSas,
          allowedIpAddress: agent.allowedIpAddress,
          sasValiditySeconds: agent.sasValiditySeconds,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt,
        });
      } catch (error: any) {
        console.error("AI agent creation error:", error);
        if (error.message?.includes("unique")) {
          res.status(400).json({ error: "Duplicate AI agent configuration" });
        } else {
          res.status(500).json({ error: "Failed to create AI agent" });
        }
      }
    },
  );

  app.put(
    "/api/ai-agents/:id",
    tokenRequired,
    aiAgentManagementPermissionRequired("edit"),
    async (req, res) => {
      try {
        const agentId = parseInt(req.params.id);

        // Validate request body using Zod schema
        const validationResult = insertAiAgentSchema.omit({ apiKey: true }).safeParse(req.body);
        if (!validationResult.success) {
          const errors = validationResult.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }));
          return res.status(400).json({ 
            error: "Validation failed", 
            details: errors 
          });
        }

        const validatedData = validationResult.data;
        let { name, apiEndpoint, organizationId, useIpForSas, allowedIpAddress, sasValiditySeconds } = validatedData;

        // Validate agent name - only alphanumeric characters allowed
        const namePattern = /^[a-zA-Z0-9]+$/;
        if (!namePattern.test(name)) {
          return res.status(400).json({
            error:
              "Agent name must contain only alphanumeric characters (a-z, A-Z, 0-9). No spaces or special characters allowed.",
          });
        }

        // Auto-clear IP address when IP restriction is disabled
        if (!useIpForSas) {
          allowedIpAddress = null;
        }

        // Check for duplicate name in same organization (excluding current agent)
        const existingAgents = await storage.getAllAiAgents();
        const duplicateName = existingAgents.find(
          (agent) =>
            agent.name === name &&
            agent.organizationId === organizationId &&
            agent.id !== agentId,
        );

        if (duplicateName) {
          return res.status(400).json({
            error:
              "An AI agent with this name already exists in the selected organization",
          });
        }

        const agent = await storage.updateAiAgent(agentId, {
          name,
          apiEndpoint,
          organizationId,
          useIpForSas: useIpForSas ?? false,
          allowedIpAddress: allowedIpAddress || null,
          sasValiditySeconds: sasValiditySeconds ?? 900,
        });
        if (!agent) {
          return res.status(404).json({ error: "AI agent not found" });
        }

        await logUserActivity(
          req,
          "UPDATE_AI_AGENT",
          "AI_MANAGEMENT",
          `AI Agent: ${agent.name}`,
          "AI_AGENT",
          { organizationId },
        );

        // Return without API key
        res.json({
          id: agent.id,
          name: agent.name,
          apiEndpoint: agent.apiEndpoint,
          organizationId: agent.organizationId,
          useIpForSas: agent.useIpForSas,
          allowedIpAddress: agent.allowedIpAddress,
          sasValiditySeconds: agent.sasValiditySeconds,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt,
        });
      } catch (error) {
        console.error("AI agent update error:", error);
        res.status(500).json({ error: "Failed to update AI agent" });
      }
    },
  );

  app.delete(
    "/api/ai-agents/:id",
    tokenRequired,
    aiAgentManagementPermissionRequired("delete"),
    async (req, res) => {
      try {
        const agentId = parseInt(req.params.id);

        const agent = await storage.getAiAgent(agentId);
        if (!agent) {
          return res.status(404).json({ error: "AI agent not found" });
        }

        const success = await storage.deleteAiAgent(agentId);
        if (!success) {
          return res.status(500).json({ error: "Failed to delete AI agent" });
        }

        await logUserActivity(
          req,
          "DELETE_AI_AGENT",
          "AI_MANAGEMENT",
          `AI Agent: ${agent.name}`,
          "AI_AGENT",
          { organizationId: agent.organizationId },
        );

        res.json({ success: true });
      } catch (error) {
        console.error("AI agent deletion error:", error);
        res.status(500).json({ error: "Failed to delete AI agent" });
      }
    },
  );

  // Run AI agent on file (async via Detector Container App)
  app.post(
    "/api/ai-agents/run",
    tokenRequired,
    organizationAccessRequired,
    aiAgentPermissionRequired("view"),
    async (req, res) => {
      try {
        const {
          agentId,
          filePath,
          fileName,
        } = req.body;

        if (
          !agentId ||
          !filePath ||
          !fileName
        ) {
          return res.status(400).json({
            error:
              "All fields are required: agentId, filePath, fileName",
          });
        }

        // Use validated organization ID from middleware (prevents IDOR)
        const organizationId = (req as any).validatedOrganizationId;
        const userId = (req as any).user?.oid || (req as any).user?.id;

        // Get AI agent details
        const agent = await storage.getAiAgent(agentId);
        if (!agent) {
          return res.status(404).json({ error: "AI agent not found" });
        }

        // Security: Verify AI agent belongs to user's organization (defense in depth)
        if (agent.organizationId !== organizationId) {
          return res
            .status(403)
            .json({ error: "Access denied: AI agent does not belong to your organization" });
        }

        // Get storage account from organization (one storage account per organization)
        const storageAccountRecord = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccountRecord) {
          return res.status(403).json({ 
            error: "Access denied: No storage account found for your organization" 
          });
        }

      // GEO-FENCING: Enforce geographic access restrictions before AI agent execution
        const userObj = (req as any).user;
        try {
          await enforceGeoAccess({
            req,
            orgId: organizationId,
            userId: userId,
            operation: 'ai-agent-run',
          });
        } catch (geoError: any) {
          if (isGeoRestrictionError(geoError)) {
            console.warn(`[GEO] AI agent run blocked for user ${userObj?.email} from country ${geoError.country}`);
            return res.status(403).json({
              code: 'GEO_RESTRICTED',
              message: geoError.message,
            });
          }
          throw geoError;
        }

        // Use storage account and container from organization
        const storageAccount = storageAccountRecord.name;
        const container = storageAccountRecord.containerName;
        const resourceGroup = storageAccountRecord.resourceGroupName || undefined;

        // Generate result file path
        const resultFilePath = generateResultFilePath(
          filePath,
          fileName,
          agent.name,
        );

        // Generate SAS URL for source file using per-agent settings
        const sourceFileSasUrl = await generateSasUrl(
          storageAccount,
          container,
          filePath,
          credential,
          req, // Pass request for IP restriction support
          resourceGroup,
          undefined, // No explicit timeout - using agent settings
          {
            useIpForSas: agent.useIpForSas,
            allowedIpAddress: agent.allowedIpAddress,
            sasValiditySeconds: agent.sasValiditySeconds,
          },
        );

        // Create manifest object
        const manifest = {
          agent_name: agent.name,
          api_endpoint: agent.apiEndpoint,
          api_key: agent.apiKey,
          source_file: {
            name: fileName,
            path: filePath,
            sas_url: sourceFileSasUrl,
          },
          result_file: {
            path: resultFilePath,  // Keep the decoded path for file operations
            uri: `https://${storageAccount}.dfs.core.windows.net/${container}/${encodeBlobPath(resultFilePath)}`,  // Use encoded path for URI
          },
          organization_id: organizationId,
          user_id: userId,
          created_at: new Date().toISOString(),
        };

        // Call processor endpoint (which calls external AI API and writes results)
        // Processor handles: External AI API call + Blob storage write
        let processingResult;
        try {
          processingResult = await acaAIAgentService.processAIAgent(manifest);
        } catch (processorError: any) {
          console.error('[AI AGENT] Processor failed:', processorError.message);
          
          // Log failure to activity log
          await logUserActivity(
            req,
            "RUN_AI_AGENT",
            "AI_MANAGEMENT",
            `FAILED - Agent: ${agent.name}, File: ${fileName}, Error: ${processorError.message}`,
            "AI_AGENT",
            { organizationId },
          );
          
          // Send the detailed error message directly to the user
          return res.status(500).json({ 
            error: processorError.message || "AI Agent processing failed"
          });
        }

        // Processor already wrote the result to blob storage
        // No need to write again here - this is handled by processor.js

        await logUserActivity(
          req,
          "RUN_AI_AGENT",
          "AI_MANAGEMENT",
          `Agent: ${agent.name}, File: ${fileName}, Result: ${resultFilePath}`,
          "AI_AGENT",
          { organizationId },
        );

        res.json({
          success: true,
          message: "AI agent processing completed successfully",
          agentName: agent.name,
          fileName: fileName,
          filePath: filePath,
          resultFilePath: resultFilePath,
          duration: processingResult.duration,
          result: processingResult.result,
        });
      } catch (error: any) {
        console.error("AI agent run error:", error);
        
        // Log failure to activity log
        try {
          await logUserActivity(
            req,
            "RUN_AI_AGENT",
            "AI_MANAGEMENT",
            `FAILED - Error: ${error.message || "Unknown error"}`,
            "AI_AGENT",
          );
        } catch (logError) {
          console.error("Failed to log AI agent error:", logError);
        }
        
        res.status(500).json({ error: "Failed to run AI agent" });
      }
    },
  );

  // =============================================================================
  // Data Protection Azure helpers (using managed identity)
  // =============================================================================
  
  const serviceName = "default"; // Blob service 'default' (ARM identifier)

  function getCred() {
    return new DefaultAzureCredential();
  }

  function getClient(subscriptionId: string) {
    return new StorageManagementClient(getCred(), subscriptionId);
  }

  // Get Blob Service Properties for one storage account
  async function getBlobServiceProps(
    subscriptionId: string,
    resourceGroupName: string,
    accountName: string
  ) {
    const client = getClient(subscriptionId);
    const result = await client.blobServices.getServiceProperties(resourceGroupName, accountName);
    return result;
  }

  // Set Blob Service Properties for one storage account
  async function setBlobServiceProps(
    subscriptionId: string,
    resourceGroupName: string,
    accountName: string,
    options: {
      enableBlobSoftDelete: boolean;
      blobRetentionDays?: number;
      enableContainerSoftDelete: boolean;
      containerRetentionDays?: number;
    }
  ) {
    const client = getClient(subscriptionId);

    const params: any = {
      deleteRetentionPolicy: {
        enabled: options.enableBlobSoftDelete,
        days: options.enableBlobSoftDelete ? options.blobRetentionDays ?? 7 : undefined
      },
      containerDeleteRetentionPolicy: {
        enabled: options.enableContainerSoftDelete,
        days: options.enableContainerSoftDelete ? options.containerRetentionDays ?? 7 : undefined
      }
    };

    const result = await client.blobServices.setServiceProperties(
      resourceGroupName,
      accountName,
      params
    );

    return result;
  }

  // Get Microsoft Defender for Storage settings for one storage account
  async function getDefenderSettings(
    subscriptionId: string,
    resourceGroupName: string,
    accountName: string
  ): Promise<{ malwareScanningEnabled: boolean; sensitiveDataEnabled: boolean }> {
    try {
      const credential = getCred();
      const token = await credential.getToken("https://management.azure.com/.default");
      
      const url = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Storage/storageAccounts/${accountName}/providers/Microsoft.Security/defenderForStorageSettings/current?api-version=2022-12-01-preview`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        // If 404 or other error, Defender might not be enabled - return disabled
        if (response.status === 404) {
          console.log(`[DEFENDER] No Defender settings found for ${accountName}, assuming disabled`);
          return { malwareScanningEnabled: false, sensitiveDataEnabled: false };
        }
        const errorText = await response.text();
        console.error(`[DEFENDER] Error response for ${accountName}: ${response.status} - ${errorText}`);
        throw new Error(`Failed to get Defender settings: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const properties = data.properties || {};
      
      console.log(`[DEFENDER] Retrieved settings for ${accountName}:`, JSON.stringify(properties, null, 2));
      
      const malwareScanningEnabled = properties.malwareScanning?.onUpload?.isEnabled === true;
      const sensitiveDataEnabled = properties.sensitiveDataDiscovery?.isEnabled === true;
      
      console.log(`[DEFENDER] Parsed status for ${accountName}: malwareScanning=${malwareScanningEnabled}, sensitiveData=${sensitiveDataEnabled}`);
      
      return { malwareScanningEnabled, sensitiveDataEnabled };
    } catch (error: any) {
      console.error(`[DEFENDER] Error getting Defender settings for ${accountName}:`, error.message);
      // On error, return disabled status rather than failing the entire request
      return { malwareScanningEnabled: false, sensitiveDataEnabled: false };
    }
  }

  // Set Microsoft Defender for Storage settings for one storage account
  // Helper function to extract user-friendly error message from Azure error response
  function parseAzureErrorMessage(azureErrorMessage: string | undefined): string {
    if (!azureErrorMessage) return '';
    
    // Try to parse as JSON if it looks like JSON
    if (azureErrorMessage.trim().startsWith('{')) {
      try {
        const errorObj = JSON.parse(azureErrorMessage);
        // Extract nested error message if available
        return errorObj.error?.message || errorObj.message || azureErrorMessage;
      } catch {
        // If parsing fails, return as is
        return azureErrorMessage;
      }
    }
    
    return azureErrorMessage;
  }

  async function setDefenderSettings(
    subscriptionId: string,
    resourceGroupName: string,
    accountName: string,
    options: {
      malwareScanning: boolean;
      sensitiveData: boolean;
    }
  ) {
    const credential = getCred();
    const token = await credential.getToken("https://management.azure.com/.default");
    
    const url = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Storage/storageAccounts/${accountName}/providers/Microsoft.Security/defenderForStorageSettings/current?api-version=2022-12-01-preview`;
    
    // CRITICAL: Fetch current settings first to preserve existing configuration
    let currentSettings: any = {};
    try {
      const getCurrentResponse = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (getCurrentResponse.ok) {
        const currentData = await getCurrentResponse.json();
        currentSettings = currentData.properties || {};
        console.log(`[DEFENDER] Current settings for ${accountName}:`, JSON.stringify(currentSettings, null, 2));
      } else if (getCurrentResponse.status !== 404) {
        console.warn(`[DEFENDER] Warning: Could not fetch current settings (${getCurrentResponse.status}), proceeding with fresh configuration`);
      }
    } catch (error: any) {
      console.warn(`[DEFENDER] Warning: Error fetching current settings, proceeding with fresh configuration:`, error.message);
    }
    
    // If both features are disabled, disable the entire Defender plan
    const isEnabled = options.malwareScanning || options.sensitiveData;
    
    // Build malware scanning configuration
    const malwareScanningConfig: any = {
      onUpload: {
        isEnabled: options.malwareScanning
      }
    };
    
    // Only include capGBPerMonth if malware scanning is enabled
    if (options.malwareScanning) {
      malwareScanningConfig.onUpload.capGBPerMonth = 10000; // 10TB default cap
    }
    
    // Preserve existing automatedResponse if it exists
    if (currentSettings.malwareScanning?.automatedResponse) {
      malwareScanningConfig.automatedResponse = currentSettings.malwareScanning.automatedResponse;
    }
    
    const body = {
      properties: {
        isEnabled: isEnabled,
        malwareScanning: malwareScanningConfig,
        sensitiveDataDiscovery: { 
          isEnabled: options.sensitiveData 
        },
        overrideSubscriptionLevelSettings: true
      }
    };

    console.log(`[DEFENDER] Setting Defender for ${accountName}:`, JSON.stringify(body, null, 2));

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DEFENDER] Failed to set Defender settings:`, errorText);
      throw new Error(`Failed to set Defender settings: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    console.log(`[DEFENDER] Azure response for ${accountName}:`, JSON.stringify(result, null, 2));
    
    // CRITICAL: Check for operationStatus errors even when HTTP status is 200
    // Azure returns 200 but includes error details in the response body
    const properties = result.properties || {};
    
    // Check malware scanning operation status
    if (properties.malwareScanning?.operationStatus?.code) {
      const status = properties.malwareScanning.operationStatus;
      
      // Only treat as error if the code is NOT a success status
      if (status.code !== 'Success' && status.code !== 'Succeeded') {
        console.error(`[DEFENDER] Malware scanning operation failed:`, status);
        
        if (status.code === 'MissingPermissions') {
          throw new Error(
            `Configuration Failed\n\n` +
            `Deployed App Service does not have proper permissions to enable Malware Scanning. Please provide proper permission.\n\n` +
            `Refer to below link for more details:\n` +
            `https://zapperedge.com/malware-scanning-permission-error\n\n` +
            `Or refer to Troubleshooting Guide for more details:\n` +
            `https://zapperedge.com/troubleshooting-manuals`
          );
        } else {
          const cleanMessage = parseAzureErrorMessage(status.message);
          throw new Error(
            `Configuration Failed\n\n` +
            `Unable to configure Malware Scanning. ${cleanMessage || 'Please check your Azure permissions and try again.'}\n\n` +
            `Refer to Troubleshooting Guide for more details:\n` +
            `https://zapperedge.com/troubleshooting-manuals`
          );
        }
      } else {
        console.log(`[DEFENDER] Malware scanning configured successfully: ${status.code}`);
      }
    }
    
    // Check sensitive data discovery operation status
    if (properties.sensitiveDataDiscovery?.operationStatus?.code) {
      const status = properties.sensitiveDataDiscovery.operationStatus;
      
      // Only treat as error if the code is NOT a success status
      if (status.code !== 'Success' && status.code !== 'Succeeded') {
        console.error(`[DEFENDER] Sensitive data discovery operation failed:`, status);
        
        if (status.code === 'MissingPermissions') {
          throw new Error(
            `Configuration Failed\n\n` +
            `Deployed App Service does not have proper permissions to enable Sensitive Data Discovery. Please provide proper permission.\n\n` +
            `Refer to below link for more details:\n` +
            `https://zapperedge.com/sensitive-data-permission-error\n\n` +
            `Or refer to Troubleshooting Guide for more details:\n` +
            `https://zapperedge.com/troubleshooting-manuals`
          );
        } else {
          const cleanMessage = parseAzureErrorMessage(status.message);
          throw new Error(
            `Configuration Failed\n\n` +
            `Unable to configure Sensitive Data Discovery. ${cleanMessage || 'Please check your Azure permissions and try again.'}\n\n` +
            `Refer to Troubleshooting Guide for more details:\n` +
            `https://zapperedge.com/troubleshooting-manuals`
          );
        }
      } else {
        console.log(`[DEFENDER] Sensitive data discovery configured successfully: ${status.code}`);
      }
    }
    
    console.log(`[DEFENDER] Successfully set Defender for ${accountName} with no operation errors`);
    return result;
  }

  // List all storage accounts in a subscription
  async function listStorageAccounts(subscriptionId: string) {
    const client = getClient(subscriptionId);
    const out: Array<{ name: string; id: string; resourceGroup: string }> = [];
    for await (const acct of client.storageAccounts.list()) {
      const id = acct.id ?? "";
      const parts = id.split("/");
      const rgIndex = parts.findIndex(p => p.toLowerCase() === "resourcegroups");
      const resourceGroup = rgIndex >= 0 && parts[rgIndex + 1] ? parts[rgIndex + 1] : "";
      out.push({ name: acct.name!, id, resourceGroup });
    }
    return out;
  }

  // =============================================================================
  // Event Grid Webhook for Malware Scan Results (HNS Mode)
  // =============================================================================

  /**
   * POST /api/defender/events
   * Event Grid webhook endpoint to receive malware scan result events
   * Handles SubscriptionValidation and Notification events
   */
  app.post("/api/defender/events", async (req, res) => {
    try {
      const aegEventType = req.get('aeg-event-type');
      console.log(`[EVENT GRID] Received event type: ${aegEventType}`);

      // 1) Handle SubscriptionValidation handshake
      if (aegEventType === 'SubscriptionValidation') {
        const validationCode = req.body?.[0]?.data?.validationCode;
        console.log(`[EVENT GRID] Validation request received, code: ${validationCode}`);
        
        if (!validationCode) {
          return res.status(400).json({ error: "Validation code missing" });
        }

        return res.status(200).json({ validationResponse: validationCode });
      }

      // 2) Handle Notification events
      if (aegEventType === 'Notification') {
        const events = req.body || [];
        console.log(`[EVENT GRID] Processing ${events.length} notification event(s)`);

        for (const evt of events) {
          if (evt.eventType === 'Microsoft.Security.MalwareScanningResult') {
            const eventData = evt.data;
            console.log(`[EVENT GRID] Malware scan result event:`, {
              id: evt.id,
              blobUri: eventData?.blobUri,
              scanResult: eventData?.scanResultType
            });

            // Only write tags if HNS mode is enabled
            if (isHNSEnabled() || process.env.ZAPPER_HNS_FLAG === 'TRUE') {
              try {
                const mappedResult = mapScanResult(eventData?.scanResultType);
                const scanTime = eventData?.scanFinishedTimeUtc || new Date().toISOString();

                await setMalwareTagsByUri(
                  eventData.blobUri,
                  mappedResult,
                  scanTime
                );

                console.log(`[EVENT GRID] Successfully wrote tags for blob: ${eventData.blobUri}`);
              } catch (tagError: any) {
                console.error(`[EVENT GRID] Error writing tags:`, tagError.message);
                // Don't fail the entire event processing - just log the error
              }
            } else {
              console.log(`[EVENT GRID] HNS mode disabled, skipping tag write (Defender writes tags automatically)`);
            }
          } else {
            console.log(`[EVENT GRID] Ignoring non-malware-scan event: ${evt.eventType}`);
          }
        }

        return res.sendStatus(200);
      }

      // Unknown event type
      console.log(`[EVENT GRID] Unknown event type: ${aegEventType}, returning 200`);
      return res.sendStatus(200);
    } catch (error: any) {
      console.error("[EVENT GRID] Webhook error:", error.message);
      return res.status(500).json({ error: error.message });
    }
  });

  // =============================================================================
  // Data Protection API endpoints
  // =============================================================================

  /**
   * GET /api/data-protection/status/all
   * Returns current soft delete states + retention days for all storage accounts
   */
  app.get("/api/data-protection/status/all", tokenRequired, dataProtectionPermissionRequired, async (req, res) => {
    try {
      const subscriptionId = String(process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || "");

      if (!subscriptionId) {
        return res.status(400).json({ error: "Azure subscription must be configured in environment variables" });
      }

      // Get all storage accounts from database
      const allAccounts = await storage.getAllStorageAccounts(
        req.user!.organizationId!
      );

      // Deduplicate by name
      const uniqueMap = new Map<string, any>();
      allAccounts.forEach((account) => {
        if (!uniqueMap.has(account.name)) {
          uniqueMap.set(account.name, account);
        }
      });
      const uniqueAccounts = Array.from(uniqueMap.values());

      // Fetch status for each account
      const statusData = await Promise.all(
        uniqueAccounts.map(async (account) => {
          try {
            // 🔒 SECURITY: Validate storage account name from database
            const nameValidation = validateStorageAccountName(account.name);
            if (!nameValidation.valid) {
              console.error(`🔒 [DATA-PROTECTION] Invalid storage account name in database: ${account.name} - ${nameValidation.error}`);
              return {
                accountId: account.id,
                accountName: account.name,
                resourceGroup: account.resourceGroupName,
                kind: account.kind || 'blob',
                blobSoftDelete: { enabled: false, days: null },
                containerSoftDelete: { enabled: false, days: null },
                malwareScanning: { enabled: false },
                sensitiveData: { enabled: false },
                error: `Invalid storage account name: ${nameValidation.error}`
              };
            }

            const props = await getBlobServiceProps(
              subscriptionId,
              account.resourceGroupName,
              account.name
            );

            const blob = props.deleteRetentionPolicy ?? {};
            const container = props.containerDeleteRetentionPolicy ?? {};

            // Fetch Defender for Storage settings
            const defender = await getDefenderSettings(
              subscriptionId,
              account.resourceGroupName,
              account.name
            );

            return {
              accountId: account.id,
              accountName: account.name,
              resourceGroup: account.resourceGroupName,
              kind: account.kind || 'blob',
              blobSoftDelete: {
                enabled: !!blob.enabled,
                days: blob.days ?? null
              },
              containerSoftDelete: {
                enabled: !!container.enabled,
                days: container.days ?? null
              },
              malwareScanning: {
                enabled: defender.malwareScanningEnabled
              },
              sensitiveData: {
                enabled: defender.sensitiveDataEnabled
              }
            };
          } catch (error: any) {
            console.error(`Error fetching status for ${account.name}:`, error.message);
            return {
              accountId: account.id,
              accountName: account.name,
              resourceGroup: account.resourceGroupName,
              kind: account.kind || 'blob',
              blobSoftDelete: {
                enabled: false,
                days: null
              },
              containerSoftDelete: {
                enabled: false,
                days: null
              },
              malwareScanning: {
                enabled: false
              },
              sensitiveData: {
                enabled: false
              },
              error: error.message
            };
          }
        })
      );

      await logUserActivity(
        req,
        "VIEW_DATA_PROTECTION_STATUS_ALL",
        "STORAGE_MANAGEMENT",
        `Viewed all protection statuses (${statusData.length} accounts)`,
        "STORAGE_ACCOUNT"
      );

      res.json({ accounts: statusData });
    } catch (err: any) {
      console.error("GET /api/data-protection/status/all error", err);
      res.status(500).json({ error: err.message || "Failed to fetch data protection statuses" });
    }
  });

  /**
   * GET /api/data-protection/status
   * Query: accountName
   * Returns current soft delete states + retention days.
   */
  app.get("/api/data-protection/status", tokenRequired, dataProtectionPermissionRequired, async (req, res) => {
    try {
      const accountName = String(req.query.accountName || "");
      const subscriptionId = String(process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || "");

      if (!accountName) {
        return res.status(400).json({ error: "accountName is required" });
      }

      if (!subscriptionId) {
        return res.status(400).json({ error: "Azure subscription must be configured in environment variables" });
      }

      // Verify storage account exists in our database and get the actual resource group
      const storageAccount = await storage.getStorageAccountByName(accountName);
      if (!storageAccount) {
        return res.status(404).json({ error: "Storage account not found" });
      }

      if (!storageAccount.resourceGroupName) {
        return res.status(400).json({ error: "Storage account resource group not found in database" });
      }

      const resourceGroup = storageAccount.resourceGroupName;
      console.log(`[DATA PROTECTION] Using resource group from database: ${resourceGroup} for storage account: ${accountName}`);

      const props = await getBlobServiceProps(subscriptionId, resourceGroup, accountName);

      const blob = props.deleteRetentionPolicy ?? {};
      const container = props.containerDeleteRetentionPolicy ?? {};

      await logUserActivity(
        req,
        "VIEW_DATA_PROTECTION_STATUS",
        "STORAGE_MANAGEMENT",
        `Storage Account: ${accountName}`,
        "STORAGE_ACCOUNT",
        storageAccount.organizationId ? { organizationId: storageAccount.organizationId } : undefined,
      );

      res.json({
        subscriptionId,
        resourceGroup,
        accountName,
        blobSoftDelete: {
          enabled: !!blob.enabled,
          days: blob.days ?? null
        },
        containerSoftDelete: {
          enabled: !!container.enabled,
          days: container.days ?? null
        }
      });
    } catch (err: any) {
      console.error("GET /api/data-protection/status error", err);
      res.status(500).json({ error: err.message || "Failed to fetch data protection status" });
    }
  });

  /**
   * POST /api/data-protection/configure
   * Body: {
   *   accountName?: string,
   *   scope: "single" | "all",
   *   enableBlobSoftDelete: boolean,
   *   blobRetentionDays?: number,
   *   enableContainerSoftDelete: boolean,
   *   containerRetentionDays?: number,
   *   enableMalwareScanning?: boolean,
   *   enableSensitiveData?: boolean
   * }
   */
  app.post("/api/data-protection/configure", tokenRequired, dataProtectionPermissionRequired, async (req, res) => {
    try {
      const {
        accountName,
        scope,
        enableBlobSoftDelete,
        blobRetentionDays,
        enableContainerSoftDelete,
        containerRetentionDays,
        enableMalwareScanning,
        enableSensitiveData
      } = req.body || {};

      const subscriptionId = String(process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || "");
      
      if (!subscriptionId) {
        return res.status(400).json({ error: "Azure subscription must be configured in environment variables" });
      }

      if (scope === "single") {
        if (!accountName) {
          return res.status(400).json({ error: "accountName is required for scope=single" });
        }

        // Verify storage account exists in our database and get the actual resource group
        const storageAccount = await storage.getStorageAccountByName(accountName);
        if (!storageAccount) {
          return res.status(403).json({ error: "Access denied or resource not found" });
        }

        // Verify user has access to this storage account's organization
        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        if (!storageAccount.organizationId) {
          return res.status(400).json({ error: "Storage account organization not found in database" });
        }

        const userOrgIds = await storage.getUserOrganizationIds(userEmail);
        if (!userOrgIds.includes(storageAccount.organizationId)) {
          return res.status(403).json({ error: "Access denied: You do not have permission to configure data protection for this storage account" });
        }

        if (!storageAccount.resourceGroupName) {
          return res.status(400).json({ error: "Storage account resource group not found in database" });
        }

        const resourceGroup = storageAccount.resourceGroupName;
        console.log(`[DATA PROTECTION] User ${userEmail} configuring data protection for storage account: ${accountName} in org: ${storageAccount.organizationId}`);

        const result = await setBlobServiceProps(subscriptionId, resourceGroup, accountName, {
          enableBlobSoftDelete: !!enableBlobSoftDelete,
          blobRetentionDays,
          enableContainerSoftDelete: !!enableContainerSoftDelete,
          containerRetentionDays
        });

        // Update Defender for Storage settings if provided
        if (enableMalwareScanning !== undefined || enableSensitiveData !== undefined) {
          await setDefenderSettings(subscriptionId, resourceGroup, accountName, {
            malwareScanning: !!enableMalwareScanning,
            sensitiveData: !!enableSensitiveData
          });

          // If HNS mode is enabled and malware scanning is being enabled, set up Event Grid
          if (isHNSEnabled() && enableMalwareScanning) {
            console.log(`[DATA PROTECTION] HNS mode enabled, setting up Event Grid for ${accountName}`);
            
            try {
              // Get the public URL for the webhook
              const webhookUrl = `${getDomainFromRequest(req)}/api/defender/events`;
              console.log(`[DATA PROTECTION] Webhook URL: ${webhookUrl}`);

              // Create Event Grid Topic
              const { topicResourceId, topicEndpoint } = await createEventGridTopic(
                subscriptionId,
                resourceGroup,
                storageAccount.location || 'centralindia', // Use account location or default
                accountName
              );

              // Extract topic name from resource ID
              const topicName = topicResourceId.split('/').pop() || '';

              // Create Event Subscription
              await createEventSubscription(
                subscriptionId,
                resourceGroup,
                topicName,
                webhookUrl,
                accountName
              );

              // Now bind the Event Grid topic to Defender settings
              // We need to update Defender again with the topic ID
              const credential = getCred();
              const token = await credential.getToken("https://management.azure.com/.default");
              
              const defenderUrl = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${accountName}/providers/Microsoft.Security/defenderForStorageSettings/current?api-version=2022-12-01-preview`;
              
              const defenderResponse = await fetch(defenderUrl, {
                method: 'PUT',
                headers: {
                  'Authorization': `Bearer ${token.token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  properties: {
                    isEnabled: true,
                    malwareScanning: {
                      onUpload: { 
                        isEnabled: true,
                        capGBPerMonth: 10000
                      },
                      scanResultsEventGridTopicResourceId: topicResourceId
                    },
                    sensitiveDataDiscovery: {
                      isEnabled: !!enableSensitiveData
                    },
                    overrideSubscriptionLevelSettings: true
                  }
                })
              });

              if (!defenderResponse.ok) {
                const errorText = await defenderResponse.text();
                console.error(`[DATA PROTECTION] Failed to bind Event Grid to Defender: ${errorText}`);
                throw new Error(`Failed to bind Event Grid topic to Defender`);
              }

              console.log(`[DATA PROTECTION] Successfully configured Event Grid for ${accountName}`);
              console.log(`[DATA PROTECTION] Topic ID: ${topicResourceId}`);
            } catch (eventGridError: any) {
              console.error(`[DATA PROTECTION] Event Grid setup error:`, eventGridError.message);
              // Don't fail the entire operation, but log the error
              // The Defender settings are still applied, just without Event Grid integration
            }
          }

          // If malware scanning is being disabled and HNS mode is enabled, clean up Event Grid
          if (isHNSEnabled() && enableMalwareScanning === false) {
            console.log(`[DATA PROTECTION] Malware scanning disabled, cleaning up Event Grid resources`);
            
            try {
              // List and delete topics for this storage account
              const topics = await listEventGridTopicsForStorageAccount(
                subscriptionId,
                resourceGroup,
                accountName
              );

              for (const topic of topics) {
                await deleteEventGridTopic(subscriptionId, resourceGroup, topic.name);
              }

              console.log(`[DATA PROTECTION] Successfully cleaned up ${topics.length} Event Grid topic(s)`);
            } catch (cleanupError: any) {
              console.error(`[DATA PROTECTION] Event Grid cleanup error:`, cleanupError.message);
              // Don't fail - cleanup errors are not critical
            }
          }
        }

        await logUserActivity(
          req,
          "CONFIGURE_DATA_PROTECTION",
          "STORAGE_MANAGEMENT", 
          `Single Account: ${accountName}, Blob: ${enableBlobSoftDelete ? `${blobRetentionDays} days` : 'disabled'}, Container: ${enableContainerSoftDelete ? `${containerRetentionDays} days` : 'disabled'}, Malware: ${enableMalwareScanning ? 'enabled' : 'disabled'}, Sensitive Data: ${enableSensitiveData ? 'enabled' : 'disabled'}`,
          "STORAGE_ACCOUNT",
          storageAccount.organizationId ? { organizationId: storageAccount.organizationId } : undefined,
        );

        return res.json({ updated: [{ subscriptionId, resourceGroup, accountName }], result });
      }

      // scope === "all" => apply to storage accounts in user's organizations only
      const userEmail = req.user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Get user's organizations
      const userOrgIds = await storage.getUserOrganizationIds(userEmail);
      if (userOrgIds.length === 0) {
        return res.status(403).json({ error: "Access denied: You do not have access to any organizations" });
      }

      // Get storage accounts for user's organizations only
      const userStorageAccounts = await storage.getStorageAccountsForOrganizations(userOrgIds);
      const updated: Array<{ subscriptionId: string; resourceGroup: string; accountName: string; ok: boolean; error?: string }> = [];

      console.log(`[DATA PROTECTION] User ${userEmail} configuring data protection for ${userStorageAccounts.length} storage account(s) in their organizations`);

      for (const account of userStorageAccounts) {
        if (!account.resourceGroupName) {
          updated.push({ 
            subscriptionId, 
            resourceGroup: 'unknown', 
            accountName: account.name, 
            ok: false, 
            error: 'Resource group not found' 
          });
          continue;
        }

        try {
          await setBlobServiceProps(subscriptionId, account.resourceGroupName, account.name, {
            enableBlobSoftDelete: !!enableBlobSoftDelete,
            blobRetentionDays,
            enableContainerSoftDelete: !!enableContainerSoftDelete,
            containerRetentionDays
          });
          
          // Update Defender for Storage settings if provided
          if (enableMalwareScanning !== undefined || enableSensitiveData !== undefined) {
            await setDefenderSettings(subscriptionId, account.resourceGroupName, account.name, {
              malwareScanning: !!enableMalwareScanning,
              sensitiveData: !!enableSensitiveData
            });
          }
          
          updated.push({ subscriptionId, resourceGroup: account.resourceGroupName, accountName: account.name, ok: true });
        } catch (e: any) {
          updated.push({ subscriptionId, resourceGroup: account.resourceGroupName, accountName: account.name, ok: false, error: e.message });
        }
      }

      await logUserActivity(
        req,
        "CONFIGURE_DATA_PROTECTION_BULK",
        "STORAGE_MANAGEMENT",
        `All Accounts (${updated.length}), Blob: ${enableBlobSoftDelete ? `${blobRetentionDays} days` : 'disabled'}, Container: ${enableContainerSoftDelete ? `${containerRetentionDays} days` : 'disabled'}, Malware: ${enableMalwareScanning ? 'enabled' : 'disabled'}, Sensitive Data: ${enableSensitiveData ? 'enabled' : 'disabled'}`,
        "STORAGE_ACCOUNT"
      );

      res.json({ updated });
    } catch (err: any) {
      console.error("POST /api/data-protection/configure error", err);
      res.status(500).json({ error: err.message || "Failed to configure data protection" });
    }
  });

  // =============================================================================
  // Data Lifecycle Management API endpoints
  // =============================================================================

  // Get lifecycle management policy for one storage account
  async function getLifecyclePolicy(
    subscriptionId: string,
    resourceGroupName: string,
    accountName: string
  ) {
    const client = getClient(subscriptionId);
    try {
      const result = await client.managementPolicies.get(resourceGroupName, accountName, "default");
      return result;
    } catch (error: any) {
      // Return empty policy if none exists (404 is expected for accounts without lifecycle policies)
      if (error.statusCode === 404 || error.code === 'ManagementPolicyNotFound') {
        return { policy: null };
      }
      throw error;
    }
  }

  // Allowed lifecycle tier transitions (now includes Archive and Delete per Azure capabilities)
  const ALLOWED_TRANSITIONS = ["HotToCool", "HotToCold", "CoolToCold", "CoolToArchive", "ColdToArchive", "Delete"] as const;
  type LifecycleTransition = typeof ALLOWED_TRANSITIONS[number];

  // Action types for multi-action support
  type LifecycleActionType = "tierToCool" | "tierToCold" | "tierToArchive" | "delete";

  interface LifecycleAction {
    action: LifecycleActionType;
    days: number;
  }

  // Minimum retention periods per Azure requirements
  const MIN_RETENTION_DAYS: Record<LifecycleActionType, number> = {
    tierToCool: 0,
    tierToCold: 0,
    tierToArchive: 0,
    delete: 0
  };

  // Action order for validation (must be progressive)
  const ACTION_ORDER: LifecycleActionType[] = ["tierToCool", "tierToCold", "tierToArchive", "delete"];

  // Validate transition type (legacy single-action support)
  function validateTransition(transitionType: string): transitionType is LifecycleTransition {
    if (!ALLOWED_TRANSITIONS.includes(transitionType as any)) {
      throw new Error(`Invalid transition type. Allowed transitions: ${ALLOWED_TRANSITIONS.join(", ")}.`);
    }
    return true;
  }

  // Validate multiple actions for proper order and days progression
  // Note: Azure allows skipping tiers (e.g., Hot → Archive, Hot → Delete)
  // The key constraints are:
  // 1. Actions must follow the tier order (Cool < Cold < Archive < Delete)
  // 2. Days must be strictly progressive (each action's days > previous action's days)
  // Reference: https://learn.microsoft.com/en-us/azure/storage/blobs/lifecycle-management-policy-structure
  function validateMultipleActions(actions: LifecycleAction[]): { valid: boolean; error?: string } {
    if (!actions || actions.length === 0) {
      return { valid: false, error: "At least one action is required" };
    }

    // Check for duplicate actions
    const actionTypes = actions.map(a => a.action);
    const uniqueActions = new Set(actionTypes);
    if (uniqueActions.size !== actionTypes.length) {
      return { valid: false, error: "Duplicate actions are not allowed" };
    }

    // Verify actions follow the correct order (can skip tiers, but can't go backwards)
    // e.g., [tierToCool, tierToArchive] is valid (skipping tierToCold)
    // but [tierToArchive, tierToCool] is invalid (going backwards)
    let lastOrderIndex = -1;
    for (const action of actions) {
      const orderIndex = ACTION_ORDER.indexOf(action.action);
      if (orderIndex === -1) {
        return { valid: false, error: `Unknown action type: ${action.action}` };
      }
      if (orderIndex <= lastOrderIndex) {
        return { valid: false, error: `Invalid action order: ${action.action} cannot come after a colder tier action` };
      }
      lastOrderIndex = orderIndex;
    }

    // Sort actions by their order for days validation
    const sortedActions = [...actions].sort(
      (a, b) => ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action)
    );

    let previousDays = 0;
    for (const action of sortedActions) {
      // Check minimum retention
      const minDays = MIN_RETENTION_DAYS[action.action];
      if (action.days < minDays) {
        return { valid: false, error: `${action.action} requires minimum ${minDays} days` };
      }

      // Check days are progressive
      if (previousDays > 0 && action.days <= previousDays) {
        return { valid: false, error: `${action.action} (${action.days} days) must be greater than previous action (${previousDays} days)` };
      }

      // Check valid range
      if (action.days < 0 || action.days > 36500) {
        return { valid: false, error: `Days must be between 0 and 36500` };
      }

      previousDays = action.days;
    }

    return { valid: true };
  }

  // Set lifecycle management policy for one storage account (preserves existing rules)
  // Now supports multiple actions per rule
  async function setLifecyclePolicy(
    subscriptionId: string,
    resourceGroupName: string,
    accountName: string,
    options: {
      ruleName: string;
      containerName: string; // REQUIRED
      // Legacy single action support
      transitionType?: LifecycleTransition;
      days?: number;
      // New multi-action support
      actions?: LifecycleAction[];
      enabled: boolean;
    }
  ) {
    // 🔒 SECURITY: Validate storage account name parameter
    const nameValidation = validateStorageAccountName(accountName);
    if (!nameValidation.valid) {
      throw new Error(`Invalid storage account name: ${nameValidation.error}`);
    }

    const client = getClient(subscriptionId);

    // Get existing policy first to preserve other rules
    const existingPolicy = await getLifecyclePolicy(subscriptionId, resourceGroupName, accountName);

    const definition: any = {
      filters: {
        blobTypes: ["blockBlob"],
        prefixMatch: [options.containerName + "/"] // Container is required
      },
      actions: {
        baseBlob: {}
      }
    };

    // Configure actions based on new multi-action format or legacy single action
    if (options.enabled) {
      if (options.actions && options.actions.length > 0) {
        // New multi-action support
        const validation = validateMultipleActions(options.actions);
        if (!validation.valid) {
          throw new Error(validation.error || "Invalid actions configuration");
        }

        for (const action of options.actions) {
          if (action.action === "tierToCool") {
            definition.actions.baseBlob.tierToCool = {
              daysAfterModificationGreaterThan: action.days
            };
          } else if (action.action === "tierToCold") {
            definition.actions.baseBlob.tierToCold = {
              daysAfterModificationGreaterThan: action.days
            };
          } else if (action.action === "tierToArchive") {
            definition.actions.baseBlob.tierToArchive = {
              daysAfterModificationGreaterThan: action.days
            };
          } else if (action.action === "delete") {
            definition.actions.baseBlob.delete = {
              daysAfterModificationGreaterThan: action.days
            };
          }
        }
      } else if (options.transitionType && options.days) {
        // Legacy single action support for backward compatibility
        validateTransition(options.transitionType);
        
        if (options.days < 1 || options.days > 36500) {
          throw new Error("Days after modification must be between 1 and 36500");
        }

        if (options.transitionType === "HotToCool") {
          definition.actions.baseBlob.tierToCool = {
            daysAfterModificationGreaterThan: options.days
          };
        } else if (options.transitionType === "HotToCold") {
          definition.actions.baseBlob.tierToCold = {
            daysAfterModificationGreaterThan: options.days
          };
        } else if (options.transitionType === "CoolToCold") {
          definition.actions.baseBlob.tierToCold = {
            daysAfterModificationGreaterThan: options.days
          };
        } else if (options.transitionType === "CoolToArchive" || options.transitionType === "ColdToArchive") {
          definition.actions.baseBlob.tierToArchive = {
            daysAfterModificationGreaterThan: options.days
          };
        } else if (options.transitionType === "Delete") {
          definition.actions.baseBlob.delete = {
            daysAfterModificationGreaterThan: options.days
          };
        }
      }
    }

    const newRule = {
      enabled: options.enabled,
      name: options.ruleName,
      type: "Lifecycle",
      definition: definition
    };

    let rules: any[] = [];

    // Start with existing rules if they exist
    if (existingPolicy.policy && existingPolicy.policy.rules) {
      rules = [...existingPolicy.policy.rules];
    }

    // Find if a rule with the same name already exists
    const existingRuleIndex = rules.findIndex(rule => rule.name === options.ruleName);
    
    if (existingRuleIndex !== -1) {
      // Update existing rule
      rules[existingRuleIndex] = newRule;
      console.log(`📝 [LIFECYCLE] Updated existing rule: ${options.ruleName} for storage account: ${accountName}`);
    } else {
      // Add new rule
      rules.push(newRule);
      console.log(`➕ [LIFECYCLE] Added new rule: ${options.ruleName} for storage account: ${accountName}`);
    }

    const policyParams = {
      policy: {
        rules: rules
      }
    };

    console.log(`🔧 [LIFECYCLE] Applying lifecycle policy with ${rules.length} total rules for storage account: ${accountName}`);

    const result = await client.managementPolicies.createOrUpdate(
      resourceGroupName,
      accountName,
      "default",
      policyParams
    );

    return result;
  }

  /**
   * GET /api/storage-containers
   * Query: accountName (required)
   * Returns list of containers/file systems for the specified storage account
   * 🔒 Security: Requires storageContainerAccess (view OR dataLifecycle) + organization membership
   */
  app.get("/api/storage-containers", tokenRequired, storageContainerAccessRequired, async (req, res) => {
    try {
      const accountName = String(req.query.accountName || "");
      
      if (!accountName) {
        return res.status(400).json({ error: "accountName is required" });
      }

      // 🔒 SECURITY: Validate storage account name from query parameter
      const nameValidation = validateStorageAccountName(accountName);
      if (!nameValidation.valid) {
        return res.status(400).json({ error: `Invalid storage account name: ${nameValidation.error}` });
      }

      // Verify storage account exists in our database
      const storageAccount = await storage.getStorageAccountByName(accountName);
      if (!storageAccount) {
        return res.status(404).json({ error: "Storage account not found" });
      }

      // 🔒 SECURITY: Verify user has access to this storage account's organization
      const userEmail = (req as any).user?.email;
      if (!userEmail) {
        console.log(`🔒 [STORAGE-CONTAINERS] No user email in request`);
        return res.status(401).json({ error: "User not authenticated" });
      }

      if (!storageAccount.organizationId) {
        console.log(`🔒 [STORAGE-CONTAINERS] Storage account ${accountName} has no organization`);
        return res.status(400).json({ error: "Storage account organization not found" });
      }

      // Get all organizations the user belongs to
      const userOrgIds = await storage.getUserOrganizationIds(userEmail);
      
      // Verify user has access to this storage account's organization
      if (!userOrgIds.includes(storageAccount.organizationId)) {
        console.log(`🔒 [STORAGE-CONTAINERS] Access denied: ${userEmail} not in organization ${storageAccount.organizationId} for storage account ${accountName}`);
        return res.status(403).json({ 
          error: "Access denied: You do not have permission to access this storage account" 
        });
      }

      console.log(`✅ [STORAGE-CONTAINERS] Organization access verified: ${userEmail} can access storage account ${accountName} in org ${storageAccount.organizationId}`);

      if (!credential) {
        return res.status(500).json({ error: "Azure credentials not configured" });
      }

      const containers: { name: string }[] = [];

      // List containers based on storage account type
      if (storageAccount.kind === 'adls') {
        // ADLS Gen2 - use DataLakeServiceClient to list file systems
        const dataLakeService = new DataLakeServiceClient(
          `https://${storageAccount.name}.dfs.core.windows.net`,
          credential
        );

        console.log(`[CONTAINERS] Listing file systems for ADLS Gen2 account: ${storageAccount.name}`);
        
        for await (const fileSystem of dataLakeService.listFileSystems()) {
          containers.push({ name: fileSystem.name });
        }
      } else {
        // Regular Blob Storage - use BlobServiceClient to list containers
        const blobService = new BlobServiceClient(
          `https://${storageAccount.name}.blob.core.windows.net`,
          credential
        );

        console.log(`[CONTAINERS] Listing containers for Blob Storage account: ${storageAccount.name}`);
        
        for await (const container of blobService.listContainers()) {
          containers.push({ name: container.name });
        }
      }

      console.log(`[CONTAINERS] Found ${containers.length} containers for ${storageAccount.name}`);
      res.json(containers);
    } catch (err: any) {
      console.error("GET /api/storage-containers error", err);
      res.status(500).json({ error: err.message || "Failed to list containers" });
    }
  });

  /**
   * GET /api/data-lifecycle/rules
   * Query: accountName (required)
   * Returns array of all lifecycle rules for the storage account.
   */
  app.get("/api/data-lifecycle/rules", tokenRequired, dataLifecyclePermissionRequired, async (req, res) => {
    try {
      const accountName = String(req.query.accountName || "");
      const subscriptionId = String(process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || "");

      if (!accountName) {
        return res.status(400).json({ error: "accountName is required" });
      }

      if (!subscriptionId) {
        return res.status(400).json({ error: "Azure subscription must be configured in environment variables" });
      }

      // Verify storage account exists in our database and get the actual resource group
      const storageAccount = await storage.getStorageAccountByName(accountName);
      if (!storageAccount) {
        return res.status(404).json({ error: "Storage account not found" });
      }

      if (!storageAccount.resourceGroupName) {
        return res.status(400).json({ error: "Storage account resource group not found in database" });
      }

      const resourceGroup = storageAccount.resourceGroupName;
      console.log(`[DATA LIFECYCLE] Fetching all lifecycle rules for storage account: ${accountName}`);

      const policyResult = await getLifecyclePolicy(subscriptionId, resourceGroup, accountName);

      // Parse all lifecycle rules with full multi-action support
      const lifecycleRules: any[] = [];

      if (policyResult.policy && policyResult.policy.rules && policyResult.policy.rules.length > 0) {
        for (const rule of policyResult.policy.rules) {
          if (!rule) continue;

          const definition = rule.definition;
          let containerName = "";
          const actions: { action: string; days: number }[] = [];

          // Extract container name from prefixMatch filter
          if (definition && definition.filters && definition.filters.prefixMatch && definition.filters.prefixMatch.length > 0) {
            const prefix = definition.filters.prefixMatch[0];
            containerName = prefix.replace(/\/$/, ''); // Remove trailing slash
          }

          // Parse all actions from the rule
          if (definition && definition.actions && definition.actions.baseBlob) {
            const baseBlob = definition.actions.baseBlob;
            
            if (baseBlob.tierToCool) {
              actions.push({
                action: "tierToCool",
                days: baseBlob.tierToCool.daysAfterModificationGreaterThan || 30
              });
            }
            if (baseBlob.tierToCold) {
              actions.push({
                action: "tierToCold",
                days: baseBlob.tierToCold.daysAfterModificationGreaterThan || 30
              });
            }
            if (baseBlob.tierToArchive) {
              actions.push({
                action: "tierToArchive",
                days: baseBlob.tierToArchive.daysAfterModificationGreaterThan || 30
              });
            }
            if (baseBlob.delete) {
              actions.push({
                action: "delete",
                days: baseBlob.delete.daysAfterModificationGreaterThan || 30
              });
            }
          }

          // Sort actions by days for consistent display
          actions.sort((a, b) => a.days - b.days);

          // For backward compatibility, also include legacy single-action fields
          // (use first action as the "primary" for legacy UI)
          const primaryAction = actions[0];
          let transitionType = "HotToCool";
          let days = 30;

          if (primaryAction) {
            days = primaryAction.days;
            if (primaryAction.action === "tierToCool") {
              transitionType = "HotToCool";
            } else if (primaryAction.action === "tierToCold") {
              transitionType = "HotToCold";
            } else if (primaryAction.action === "tierToArchive") {
              transitionType = "CoolToArchive";
            } else if (primaryAction.action === "delete") {
              transitionType = "Delete";
            }
          }

          lifecycleRules.push({
            ruleName: rule.name || "",
            containerName,
            transitionType,  // Legacy single action field
            days,            // Legacy single action field
            actions,         // New multi-action array
            enabled: rule.enabled || false
          });
        }
      }

      await logUserActivity(
        req,
        "VIEW_DATA_LIFECYCLE_RULES",
        "STORAGE_MANAGEMENT",
        `Storage Account: ${accountName} (${lifecycleRules.length} rules)`,
        "STORAGE_ACCOUNT",
        storageAccount.organizationId ? { organizationId: storageAccount.organizationId } : undefined,
      );

      res.json({ rules: lifecycleRules });
    } catch (err: any) {
      console.error("GET /api/data-lifecycle/rules error", err);
      res.status(500).json({ error: err.message || "Failed to fetch lifecycle rules" });
    }
  });

  /**
   * POST /api/data-lifecycle/configure
   * Supports both legacy single-action format and new multi-action format
   * 
   * Legacy Body: {
   *   accountName: string,
   *   containerName: string (REQUIRED),
   *   ruleName: string,
   *   transitionType: "HotToCool" | "HotToCold" | "CoolToCold" | "CoolToArchive" | "ColdToArchive" | "Delete",
   *   days: number,
   *   enabled: boolean
   * }
   * 
   * New Multi-Action Body: {
   *   accountName: string,
   *   containerName: string (REQUIRED),
   *   ruleName: string,
   *   actions: [{ action: "tierToCool" | "tierToCold" | "tierToArchive" | "delete", days: number }],
   *   enabled: boolean
   * }
   */
  app.post("/api/data-lifecycle/configure", tokenRequired, dataLifecyclePermissionRequired, async (req, res) => {
    try {
      const userEmail = req.user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const {
        accountName,
        containerName,
        ruleName,
        transitionType,
        days,
        actions,
        enabled
      } = req.body || {};

      const subscriptionId = String(process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || "");
      
      if (!subscriptionId) {
        return res.status(400).json({ error: "Azure subscription must be configured in environment variables" });
      }

      // Input validation and sanitization
      if (!accountName || typeof accountName !== 'string') {
        return res.status(400).json({ error: "accountName is required and must be a string" });
      }

      // 🔒 SECURITY: Validate storage account name from request body
      const nameValidation = validateStorageAccountName(accountName);
      if (!nameValidation.valid) {
        return res.status(400).json({ error: `Invalid storage account name: ${nameValidation.error}` });
      }

      if (!ruleName || typeof ruleName !== 'string') {
        return res.status(400).json({ error: "ruleName is required and must be a string" });
      }

      // Sanitize rule name (alphanumeric and underscores only)
      const sanitizedRuleName = ruleName.replace(/[^a-zA-Z0-9_]/g, '');
      if (sanitizedRuleName.length === 0 || sanitizedRuleName.length > 64) {
        return res.status(400).json({ error: "ruleName must contain alphanumeric characters and be 1-64 characters long" });
      }

      if (!containerName || typeof containerName !== 'string') {
        return res.status(400).json({ error: "containerName is required and must be a string" });
      }

      // Determine if using new multi-action format or legacy single-action format
      const isMultiAction = Array.isArray(actions) && actions.length > 0;

      if (!isMultiAction) {
        // Legacy format validation
        try {
          validateTransition(transitionType);
        } catch (error: any) {
          return res.status(400).json({ error: error.message });
        }

        if (!days || typeof days !== 'number' || days < 0 || days > 36500) {
          return res.status(400).json({ error: "days must be a number between 0 and 36500" });
        }
      } else {
        // New multi-action format validation
        const validation = validateMultipleActions(actions);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.error });
        }
      }

      // Verify storage account exists in our database
      const storageAccount = await storage.getStorageAccountByName(accountName);
      if (!storageAccount) {
        return res.status(404).json({ error: "Storage account not found" });
      }

      // Verify user has access to this storage account's organization
      if (!storageAccount.organizationId) {
        return res.status(400).json({ error: "Storage account organization not found in database" });
      }

      const userOrgIds = await storage.getUserOrganizationIds(userEmail);
      if (!userOrgIds.includes(storageAccount.organizationId)) {
        return res.status(403).json({ error: "Access denied: You do not have permission to configure lifecycle policies for this storage account" });
      }

      if (!storageAccount.resourceGroupName) {
        return res.status(400).json({ error: "Storage account resource group not found in database" });
      }

      const resourceGroup = storageAccount.resourceGroupName;
      console.log(`[DATA LIFECYCLE] User ${userEmail} configuring lifecycle for storage account: ${accountName} in org: ${storageAccount.organizationId}`);

      // Build policy options based on format
      const policyOptions: any = {
        ruleName: sanitizedRuleName,
        containerName,
        enabled: !!enabled
      };

      if (isMultiAction) {
        policyOptions.actions = actions;
      } else {
        policyOptions.transitionType = transitionType;
        policyOptions.days = Number(days);
      }

      const result = await setLifecyclePolicy(subscriptionId, resourceGroup, accountName, policyOptions);

      // Build activity log message
      const actionsSummary = isMultiAction 
        ? actions.map((a: any) => `${a.action}:${a.days}d`).join(', ')
        : `${transitionType}:${days}d`;

      await logUserActivity(
        req,
        "CONFIGURE_DATA_LIFECYCLE",
        "STORAGE_MANAGEMENT", 
        `Account: ${accountName} / Container: ${containerName}, Rule: ${ruleName}, Actions: [${actionsSummary}], Enabled: ${enabled}`,
        "STORAGE_ACCOUNT",
        storageAccount.organizationId ? { organizationId: storageAccount.organizationId } : undefined,
      );

      res.json({ 
        success: true, 
        accountName,
        containerName,
        ruleName,
        actions: isMultiAction ? actions : [{ action: transitionType, days }],
        enabled,
        result 
      });
    } catch (err: any) {
      console.error("POST /api/data-lifecycle/configure error", err);
      res.status(500).json({ error: err.message || "Failed to configure data lifecycle" });
    }
  });

  /**
   * DELETE /api/data-lifecycle/rule
   * Body: {
   *   accountName: string,
   *   ruleName: string
   * }
   * Deletes a specific lifecycle rule by name
   */
  app.delete("/api/data-lifecycle/rule", tokenRequired, dataLifecyclePermissionRequired, async (req, res) => {
    try {
      const userEmail = req.user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { accountName, ruleName } = req.body || {};
      const subscriptionId = String(process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || "");

      if (!subscriptionId) {
        return res.status(400).json({ error: "Azure subscription must be configured in environment variables" });
      }

      if (!accountName || typeof accountName !== 'string') {
        return res.status(400).json({ error: "accountName is required and must be a string" });
      }

      if (!ruleName || typeof ruleName !== 'string') {
        return res.status(400).json({ error: "ruleName is required and must be a string" });
      }

      // Verify storage account exists in our database
      const storageAccount = await storage.getStorageAccountByName(accountName);
      if (!storageAccount) {
        return res.status(404).json({ error: "Storage account not found" });
      }

      // Verify user has access to this storage account's organization
      if (!storageAccount.organizationId) {
        return res.status(400).json({ error: "Storage account organization not found in database" });
      }

      const userOrgIds = await storage.getUserOrganizationIds(userEmail);
      if (!userOrgIds.includes(storageAccount.organizationId)) {
        return res.status(403).json({ error: "Access denied: You do not have permission to delete lifecycle policies for this storage account" });
      }

      if (!storageAccount.resourceGroupName) {
        return res.status(400).json({ error: "Storage account resource group not found in database" });
      }

      const resourceGroup = storageAccount.resourceGroupName;
      const client = getClient(subscriptionId);

      // Get existing policy
      const existingPolicy = await getLifecyclePolicy(subscriptionId, resourceGroup, accountName);

      if (!existingPolicy.policy || !existingPolicy.policy.rules || existingPolicy.policy.rules.length === 0) {
        return res.status(404).json({ error: "No lifecycle rules found for this storage account" });
      }

      // Filter out the rule to delete
      const filteredRules = existingPolicy.policy.rules.filter((rule: any) => rule.name !== ruleName);

      if (filteredRules.length === existingPolicy.policy.rules.length) {
        return res.status(404).json({ error: `Lifecycle rule '${ruleName}' not found` });
      }

      // Update the policy with filtered rules
      if (filteredRules.length === 0) {
        // If no rules left, delete the entire policy
        await client.managementPolicies.delete(resourceGroup, accountName, "default");
        console.log(`🗑️ [LIFECYCLE] Deleted all lifecycle rules for storage account: ${accountName}`);
      } else {
        // Update with remaining rules
        const policyParams = {
          policy: {
            rules: filteredRules
          }
        };
        await client.managementPolicies.createOrUpdate(
          resourceGroup,
          accountName,
          "default",
          policyParams
        );
        console.log(`🗑️ [LIFECYCLE] Deleted rule '${ruleName}' from storage account: ${accountName}`);
      }

      await logUserActivity(
        req,
        "DELETE_DATA_LIFECYCLE_RULE",
        "STORAGE_MANAGEMENT",
        `Account: ${accountName}, Rule: ${ruleName}`,
        "STORAGE_ACCOUNT",
        storageAccount.organizationId ? { organizationId: storageAccount.organizationId } : undefined,
      );

      res.json({ success: true, message: `Lifecycle rule '${ruleName}' deleted successfully` });
    } catch (err: any) {
      console.error("DELETE /api/data-lifecycle/rule error", err);
      res.status(500).json({ error: err.message || "Failed to delete lifecycle rule" });
    }
  });

  // =============================================================================
  // Blob Inventory API endpoints
  // =============================================================================

  const { inventoryService } = await import("./inventoryService");

  /**
   * GET /api/inventory/rules
   * Returns inventory policy rules for a storage account
   * Query params: accountName (required), resourceGroup (optional)
   */
  app.get("/api/inventory/rules", tokenRequired, inventoryPermissionRequired('view'), async (req, res) => {
    try {
      const accountName = req.query.accountName as string;
      const resourceGroupRaw = req.query.resourceGroup as string | undefined;

      if (!accountName) {
        return res.status(400).json({ error: "accountName is required" });
      }

      const accountValidation = validateStorageAccountName(accountName);
      if (!accountValidation.valid) {
        return res.status(400).json({ error: accountValidation.error, field: 'accountName' });
      }

      const userEmail = (req as any).user?.email;
      const userOrgIds = await storage.getUserOrganizationIds(userEmail);
      
      const storageAccounts = await storage.getStorageAccountsForOrganizations(userOrgIds);
      const storageAccount = storageAccounts.find((sa: any) => sa.name === accountName);
      
      if (!storageAccount) {
        return res.status(403).json({ error: "Access denied: storage account not in your organization or not found" });
      }

      const finalResourceGroup = resourceGroupRaw || storageAccount.resourceGroupName || storageAccount.resource_group_name;

      const allRules = await inventoryService.listInventoryRules(accountName, finalResourceGroup);

      const matchingAccounts = storageAccounts.filter((sa: any) => sa.name === accountName);
      const orgContainerNames = new Set<string>();
      for (const sa of matchingAccounts) {
        if ((sa as any).containerName) {
          orgContainerNames.add((sa as any).containerName);
        }
      }

      const rules = allRules.filter(r => orgContainerNames.has(r.containerName));

      await logUserActivity(
        req,
        "VIEW_INVENTORY_RULES",
        "STORAGE_MANAGEMENT",
        `Account: ${accountName} (${rules.length} rules)`,
        "STORAGE_ACCOUNT",
        storageAccount.organizationId ? { organizationId: storageAccount.organizationId } : undefined,
      );

      res.json({ rules });
    } catch (err: any) {
      console.error("GET /api/inventory/rules error", err);
      res.status(500).json({ error: err.message || "Failed to fetch inventory rules" });
    }
  });

  /**
   * POST /api/inventory/configure
   * Enable or disable inventory for a container
   * Body: { accountName, containerName, enabled, resourceGroup? }
   */
  app.post("/api/inventory/configure", tokenRequired, inventoryPermissionRequired('configure'), async (req, res) => {
    try {
      const { accountName, containerName, enabled, resourceGroup } = req.body;

      if (!accountName || !containerName || typeof enabled !== "boolean") {
        return res.status(400).json({ 
          error: "accountName, containerName, and enabled (boolean) are required" 
        });
      }

      const accountValidation = validateStorageAccountName(accountName);
      if (!accountValidation.valid) {
        return res.status(400).json({ error: accountValidation.error, field: 'accountName' });
      }

      const containerValidation = validateContainerName(containerName);
      if (!containerValidation.valid) {
        return res.status(400).json({ error: containerValidation.error, field: 'containerName' });
      }

      const userEmail = (req as any).user?.email;
      const userOrgIds = await storage.getUserOrganizationIds(userEmail);
      
      const storageAccounts = await storage.getStorageAccountsForOrganizations(userOrgIds);
      const storageAccount = storageAccounts.find((sa: any) => sa.name === accountName);
      
      if (!storageAccount) {
        return res.status(403).json({ error: "Access denied: storage account not in your organization or not found" });
      }

      // Use the resource group from the database record if not explicitly provided
      const finalResourceGroup = resourceGroup || storageAccount.resourceGroupName || storageAccount.resource_group_name;
      
      const result = await inventoryService.configureInventory(accountName, containerName, enabled, finalResourceGroup);

      await logUserActivity(
        req,
        enabled ? ActivityActions.CONFIGURE_INVENTORY : ActivityActions.CONFIGURE_INVENTORY,
        ActivityCategories.SYSTEM,
        `Account: ${accountName}, Container: ${containerName} (Enabled: ${enabled})`,
        ResourceTypes.CONTAINER,
        storageAccount.organizationId ? { organizationId: storageAccount.organizationId } : undefined,
      );

      res.json(result);
    } catch (err: any) {
      console.error("POST /api/inventory/configure error", err);
      res.status(500).json({ error: err.message || "Failed to configure inventory" });
    }
  });

  /**
   * POST /api/inventory/reconfigure-csv
   * Reconfigure all inventory rules for a storage account to use CSV format
   * Body: { accountName, resourceGroup? }
   */
  app.post("/api/inventory/reconfigure-csv", tokenRequired, inventoryPermissionRequired('configure'), async (req, res) => {
    try {
      const { accountName, resourceGroup } = req.body;

      if (!accountName) {
        return res.status(400).json({ error: "accountName is required" });
      }

      const accountValidation = validateStorageAccountName(accountName);
      if (!accountValidation.valid) {
        return res.status(400).json({ error: accountValidation.error, field: 'accountName' });
      }

      const userEmail = (req as any).user?.email;
      const userOrgIds = await storage.getUserOrganizationIds(userEmail);
      
      const storageAccounts = await storage.getStorageAccountsForOrganizations(userOrgIds);
      const storageAccount = storageAccounts.find((sa: any) => sa.name === accountName);
      
      if (!storageAccount) {
        return res.status(403).json({ error: "Access denied: storage account not in your organization or not found" });
      }

      const finalResourceGroup = resourceGroup || storageAccount.resourceGroupName || storageAccount.resource_group_name;

      const result = await inventoryService.reconfigureRulesToCSV(accountName, finalResourceGroup);

      await logUserActivity(
        req,
        "RECONFIGURE_INVENTORY_CSV",
        ActivityCategories.SYSTEM,
        `Account: ${accountName}, Updated rules: ${result.updatedRules.join(', ') || 'none'}`,
        ResourceTypes.CONTAINER,
        storageAccount.organizationId ? { organizationId: storageAccount.organizationId } : undefined,
      );

      if (!result.success) {
        return res.status(500).json(result);
      }
      res.json(result);
    } catch (err: any) {
      console.error("POST /api/inventory/reconfigure-csv error", err);
      res.status(500).json({ error: err.message || "Failed to reconfigure inventory format" });
    }
  });

  /**
   * GET /api/inventory/latest-report
   * Get info about the latest inventory report for a container
   * Query params: accountName, containerName
   */
  app.get("/api/inventory/latest-report", tokenRequired, inventoryPermissionRequired('view'), async (req, res) => {
    try {
      const accountName = req.query.accountName as string;
      const containerName = req.query.containerName as string;

      if (!accountName || !containerName) {
        return res.status(400).json({ error: "accountName and containerName are required" });
      }

      const userEmail = (req as any).user?.email;
      const userOrgIds = await storage.getUserOrganizationIds(userEmail);
      
      const storageAccounts = await storage.getStorageAccountsForOrganizations(userOrgIds);
      const hasAccess = storageAccounts.some((sa: any) => sa.name === accountName);
      
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied: storage account not in your organization" });
      }

      const report = await inventoryService.getLatestInventoryReport(accountName, containerName);

      res.json({ report });
    } catch (err: any) {
      console.error("GET /api/inventory/latest-report error", err);
      res.status(500).json({ error: err.message || "Failed to fetch latest report" });
    }
  });

  /**
   * GET /api/inventory/summary
   * Get computed summary for a container's inventory
   * Query params: accountName, containerName, forceRefresh?
   */
  app.get("/api/inventory/summary", tokenRequired, inventoryPermissionRequired('view'), async (req, res) => {
    try {
      const accountName = req.query.accountName as string;
      const containerName = req.query.containerName as string;
      const forceRefresh = req.query.forceRefresh === "true";

      if (!accountName || !containerName) {
        return res.status(400).json({ error: "accountName and containerName are required" });
      }

      const userEmail = (req as any).user?.email;
      const userOrgIds = await storage.getUserOrganizationIds(userEmail);
      
      const storageAccounts = await storage.getStorageAccountsForOrganizations(userOrgIds);
      const hasAccess = storageAccounts.some((sa: any) => sa.name === accountName);
      
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied: storage account not in your organization" });
      }

      const summary = await inventoryService.getContainerInventorySummary(accountName, containerName, forceRefresh);

      await logUserActivity(
        req,
        ActivityActions.VIEW_INVENTORY,
        ActivityCategories.SYSTEM,
        `Account: ${accountName}, Container: ${containerName}`,
        ResourceTypes.CONTAINER
      );

      res.json({ summary });
    } catch (err: any) {
      console.error("GET /api/inventory/summary error", err);
      res.status(500).json({ error: err.message || "Failed to fetch inventory summary" });
    }
  });

  /**
   * GET /api/inventory/summary-aggregate
   * Get aggregated summary across all containers for a storage account
   * Query params: accountName, resourceGroup?
   */
  app.get("/api/inventory/summary-aggregate", tokenRequired, inventoryPermissionRequired('view'), async (req, res) => {
    try {
      const accountName = req.query.accountName as string;
      const resourceGroup = req.query.resourceGroup as string | undefined;

      if (!accountName) {
        return res.status(400).json({ error: "accountName is required" });
      }

      const userEmail = (req as any).user?.email;
      const userOrgIds = await storage.getUserOrganizationIds(userEmail);
      
      const storageAccounts = await storage.getStorageAccountsForOrganizations(userOrgIds);
      const storageAccount = storageAccounts.find((sa: any) => sa.name === accountName);
      
      if (!storageAccount) {
        return res.status(403).json({ error: "Access denied: storage account not in your organization" });
      }

      const matchingAccounts = storageAccounts.filter((sa: any) => sa.name === accountName);
      const orgContainerNames = new Set<string>();
      for (const sa of matchingAccounts) {
        if ((sa as any).containerName) {
          orgContainerNames.add((sa as any).containerName);
        }
      }

      const aggregate: any = await inventoryService.getStorageAccountAggregateSummary(accountName, resourceGroup || storageAccount.resourceGroupName || storageAccount.resource_group_name);

      if (orgContainerNames.size > 0) {
        aggregate.containerSummaries = (aggregate.containerSummaries || []).filter(
          (cs: any) => orgContainerNames.has(cs.containerName)
        );
        let filteredTotalBlobs = 0;
        let filteredTotalSize = 0;
        for (const cs of aggregate.containerSummaries) {
          if (cs.summary) {
            filteredTotalBlobs += cs.totalBlobs || cs.summary.totalBlobCount || 0;
            filteredTotalSize += cs.summary.totalSizeBytes || cs.totalSizeBytes || 0;
          }
        }
        aggregate.totalBlobCount = filteredTotalBlobs;
        aggregate.totalSizeBytes = filteredTotalSize;
        if (aggregate.aggregate) {
          aggregate.aggregate.totalBlobCount = filteredTotalBlobs;
          aggregate.aggregate.totalSizeBytes = filteredTotalSize;
          aggregate.aggregate.containerCount = aggregate.containerSummaries.length;
          aggregate.aggregate.totalBlobs = filteredTotalBlobs;
        }
      }

      await logUserActivity(
        req,
        "VIEW_INVENTORY_AGGREGATE",
        "STORAGE_MANAGEMENT",
        `Account: ${accountName}`,
        "STORAGE_ACCOUNT",
        storageAccount.organizationId ? { organizationId: storageAccount.organizationId } : undefined,
      );

      res.json(aggregate);
    } catch (err: any) {
      console.error("GET /api/inventory/summary-aggregate error", err);
      res.status(500).json({ error: err.message || "Failed to fetch aggregate summary" });
    }
  });

  /**
   * GET /api/inventory/containers
   * List containers in a storage account for inventory configuration
   * Query params: accountName
   */
  app.get("/api/inventory/containers", tokenRequired, inventoryPermissionRequired('view'), async (req, res) => {
    try {
      const accountName = req.query.accountName as string;

      if (!accountName) {
        return res.status(400).json({ error: "accountName is required" });
      }

      const userEmail = (req as any).user?.email;
      const userOrgIds = await storage.getUserOrganizationIds(userEmail);
      
      const storageAccounts = await storage.getStorageAccountsForOrganizations(userOrgIds);
      const matchingAccounts = storageAccounts.filter((sa: any) => sa.name === accountName);
      
      if (matchingAccounts.length === 0) {
        return res.status(403).json({ error: "Access denied: storage account not in your organization" });
      }

      const orgContainerNames = new Set<string>();
      for (const sa of matchingAccounts) {
        if ((sa as any).containerName) {
          orgContainerNames.add((sa as any).containerName);
        }
      }

      const containers = Array.from(orgContainerNames).map(name => ({ name }));

      console.log(`[INVENTORY] Returning ${containers.length} org-associated container(s) for account ${accountName}: ${Array.from(orgContainerNames).join(', ')}`);

      res.json({ containers });
    } catch (err: any) {
      console.error("GET /api/inventory/containers error", err);
      res.status(500).json({ error: err.message || "Failed to fetch containers" });
    }
  });

  // =============================================================================
  // File Transfer Reports API endpoints
  // =============================================================================

  const { fileTransferReportService } = await import("./fileTransferReportService");

  /**
   * GET /api/reports/file-transfer
   * Returns paginated list of file transfer reports for the user's organization
   * Query params: page (default 1), pageSize (default 20), actionType (optional: UPLOAD | DOWNLOAD)
   */
  app.get("/api/reports/file-transfer", tokenRequired, async (req, res) => {
    try {
      const userEmail = (req as any).user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Get user's organization IDs
      const userOrgIds = await storage.getUserOrganizationIds(userEmail);
      if (!userOrgIds || userOrgIds.length === 0) {
        return res.status(403).json({ error: "No organization access" });
      }

      // Validate organizationId - must be provided and user must belong to it
      const organizationId = parseInt(req.query.organizationId as string);
      if (isNaN(organizationId)) {
        return res.status(400).json({ error: "organizationId query parameter is required" });
      }
      if (!userOrgIds.includes(organizationId)) {
        return res.status(403).json({ error: "Access denied: you do not belong to this organization" });
      }

      // RBAC: Check transfer reports 'view' permission for this organization
      const userRoles = await storage.getUserRolesByEmail(userEmail);
      const orgRole = userRoles.find(ur => ur.organizationId === organizationId);
      if (!orgRole) {
        return res.status(403).json({ error: "No role in this organization" });
      }
      const rolePermissions = await storage.getUserRolePermissions(userEmail, orgRole.roleId);
      if (!rolePermissions?.transferReports?.view) {
        return res.status(403).json({ error: "Missing transfer reports view permission" });
      }

      const page = parseInt(req.query.page as string) || 1;
      const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);
      const actionType = req.query.actionType as "UPLOAD" | "DOWNLOAD" | undefined;

      const result = await fileTransferReportService.listReports(organizationId, page, pageSize, actionType);
      
      res.json({
        reports: result.reports,
        total: result.total,
        page,
        pageSize,
        totalPages: Math.ceil(result.total / pageSize)
      });
    } catch (err: any) {
      console.error("[FILE-TRANSFER-REPORT] Error listing reports:", err);
      res.status(500).json({ error: err.message || "Failed to fetch reports" });
    }
  });

  /**
   * GET /api/reports/file-transfer/:actionId
   * Returns detailed file transfer report including file-level details from blob storage
   */
  app.get("/api/reports/file-transfer/:actionId", tokenRequired, async (req, res) => {
    try {
      const userEmail = (req as any).user?.email;
      if (!userEmail) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const actionId = req.params.actionId;
      if (!actionId) {
        return res.status(400).json({ error: "actionId is required" });
      }

      // Get user's organization IDs and roles
      const userOrgIds = await storage.getUserOrganizationIds(userEmail);
      if (!userOrgIds || userOrgIds.length === 0) {
        return res.status(403).json({ error: "No organization access" });
      }

      const userRoles = await storage.getUserRolesByEmail(userEmail);

      // Try to find the report in user's organizations (only those with viewDetails permission)
      let reportDetails = null;
      for (const orgId of userOrgIds) {
        const orgRole = userRoles.find(ur => ur.organizationId === orgId);
        if (!orgRole) continue;
        const rolePermissions = await storage.getUserRolePermissions(userEmail, orgRole.roleId);
        if (!rolePermissions?.transferReports?.viewDetails) continue;

        reportDetails = await fileTransferReportService.getReportDetails(actionId, orgId);
        if (reportDetails) break;
      }

      if (!reportDetails) {
        return res.status(404).json({ error: "Report not found or insufficient permissions" });
      }

      res.json(reportDetails);
    } catch (err: any) {
      console.error("[FILE-TRANSFER-REPORT] Error fetching report details:", err);
      res.status(500).json({ error: err.message || "Failed to fetch report details" });
    }
  });

  // =============================================================================
  // Blob Scan Status API endpoints (Microsoft Defender integration)
  // =============================================================================

  /**
   * GET /api/blobs/scan-status
   * Returns list of blobs with their Microsoft Defender scan status from blob tags
   * Query params: organizationId (required), path (optional)
   * Security: organizationAccessRequired validates user belongs to organization
   */
  app.get("/api/blobs/scan-status", tokenRequired, organizationAccessRequired, async (req, res) => {
    try {
      // Use pre-validated organization ID from middleware
      const organizationId = (req as any).validatedOrganizationId;
      const pathRaw = (req.query.path as string) || "";

      // Security: Validate path parameter to prevent path traversal and null bytes
      const pathValidation = validatePath(pathRaw, 'Path');
      if (!pathValidation.valid) {
        return res.status(400).json({ 
          error: pathValidation.error,
          field: 'path'
        });
      }
      const path = pathValidation.sanitized || "";

      // Get storage account details from organization mapping (SECURE)
      const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
      if (!storageAccount) {
        return res.status(404).json({ error: "No storage account found for this organization" });
      }

      if (!credential) {
        return res.status(500).json({ error: "Azure credentials not configured" });
      }

      console.log(`[BLOB SCAN] Fetching blob scan status for storage account: ${storageAccount.name}, path: "${path}"`);

      const blobs: any[] = [];
      const isHNS = isHNSEnabled();

      console.log(`[BLOB SCAN] Storage type: ${storageAccount.kind}, HNS mode: ${isHNS}`);

      // ADLS Gen2 with HNS enabled uses metadata (not blob index tags)
      // Regular Blob Storage uses blob index tags
      const useMetadataForScan = storageAccount.kind === 'adls' && isHNS;
      const useBlobTags = !useMetadataForScan;

      const prefix = path ? `${path}/` : "";
      const delimiter = "/";

      if (useMetadataForScan) {
        // HNS-enabled ADLS Gen2: Use DataLakeServiceClient and fetch metadata
        console.log(`[BLOB SCAN] Using DataLake API with metadata for HNS-enabled storage`);
        
        const dataLakeService = new DataLakeServiceClient(
          `https://${storageAccount.name}.dfs.core.windows.net`,
          credential!
        );
        const fsClient = dataLakeService.getFileSystemClient(storageAccount.containerName);

        // List paths (files and directories) - collect all items first
        const paths = fsClient.listPaths({ path: path || undefined, recursive: false });
        const directories: any[] = [];
        const fileItems: any[] = [];

        for await (const item of paths) {
          if (!item.name) continue; // Skip items without names
          
          if (item.isDirectory) {
            // Store directory info
            const dirName = item.name.slice(prefix.length).replace(/\/$/, "");
            if (dirName) {
              directories.push({
                name: dirName,
                type: "directory",
                size: null,
                lastModified: null,
                path: item.name,
                scanResult: null,
                scanTime: null
              });
            }
          } else {
            // Store file items for parallel processing
            fileItems.push(item);
          }
        }

        // Add directories to results
        blobs.push(...directories);

        // Parallelize metadata fetching for files
        const CONCURRENCY = 10; // Fetch 10 files in parallel
        const startTime = Date.now();
        console.log(`[BLOB SCAN] Starting parallel metadata fetch for ${fileItems.length} files with concurrency=${CONCURRENCY}`);

        for (let i = 0; i < fileItems.length; i += CONCURRENCY) {
          const batch = fileItems.slice(i, i + CONCURRENCY);
          
          const batchResults = await Promise.allSettled(
            batch.map(async (item) => {
              const fileName = item.name.slice(prefix.length);
              try {
                const fileClient = fsClient.getFileClient(item.name);
                const properties = await fileClient.getProperties();
                const metadata = properties.metadata || {};

                const scanResult = metadata["zapper_scan_result"] || null;
                const scanTimeTag = metadata["zapper_scan_time"] || null;

                return {
                  name: fileName,
                  type: "file",
                  size: item.contentLength || 0,
                  lastModified: item.lastModified,
                  path: item.name,
                  scanResult: scanResult,
                  scanTime: scanTimeTag || null,
                  accessTier: (properties as any).accessTier || null,
                  archiveStatus: (properties as any).archiveStatus || null,
                  rehydratePriority: (properties as any).rehydratePriority || null,
                  sensitiveDataType: null,
                  sensitiveDataConfidence: null
                };
              } catch (metadataError) {
                console.warn(`[BLOB SCAN] Failed to fetch metadata for ${item.name}:`, metadataError);
                return {
                  name: fileName,
                  type: "file",
                  size: item.contentLength || 0,
                  lastModified: item.lastModified,
                  path: item.name,
                  scanResult: "Unknown",
                  scanTime: null,
                  accessTier: null,
                  archiveStatus: null,
                  rehydratePriority: null,
                  sensitiveDataType: null,
                  sensitiveDataConfidence: null
                };
              }
            })
          );

          // Process batch results
          batchResults.forEach((result) => {
            if (result.status === 'fulfilled') {
              blobs.push(result.value);
              console.log(`[BLOB SCAN] ${result.value.name}: scanResult=${result.value.scanResult}, scanTime=${result.value.scanTime || 'N/A'}, source=metadata`);
            }
          });

          // Log progress for large batches
          if (fileItems.length > 100 && (i + CONCURRENCY) % 100 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`[BLOB SCAN] Progress: ${Math.min(i + CONCURRENCY, fileItems.length)}/${fileItems.length} files (${elapsed}s elapsed)`);
          }
        }

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[BLOB SCAN] Completed parallel metadata fetch for ${fileItems.length} files in ${totalTime}s`);
      } else {
        // Regular Blob Storage: Use BlobServiceClient with blob index tags
        console.log(`[BLOB SCAN] Using Blob API with index tags for non-HNS storage`);
        
        const blobService = new BlobServiceClient(
          `https://${storageAccount.name}.blob.core.windows.net`,
          credential!
        );
        const containerClient = blobService.getContainerClient(storageAccount.containerName);

        // List blobs hierarchically with tags
        for await (const item of containerClient.listBlobsByHierarchy(delimiter, { 
          prefix,
          includeTags: true  // Only for non-HNS storage
        })) {
          if (item.kind === "prefix") {
            // This is a directory - no scan status for directories
            const dirName = item.name.slice(prefix.length).replace(/\/$/, "");
            if (dirName) {
              blobs.push({
                name: dirName,
                type: "directory",
                size: null,
                lastModified: null,
                path: item.name.replace(/\/$/, ""),
                scanResult: null,
                scanTime: null
              });
            }
          } else {
            // This is a file - get scan status from blob index tags
            const fileName = item.name.slice(prefix.length);
            if (fileName) {
              const tags = item.tags || {};
              let scanResult = null;
              let scanTimeTag = null;

              // Read native Defender tags from blob index
              const scanResultTag = tags["Malware Scanning scan result"] || tags["malware scanning scan result"];
              scanTimeTag = tags["Malware Scanning scan time UTC"] || tags["malware scanning scan time utc"];

              // Normalize scan result
              if (scanResultTag) {
                if (scanResultTag.toLowerCase() === "no threats found") {
                  scanResult = "Clean";
                } else if (scanResultTag.toLowerCase() === "malicious") {
                  scanResult = "Malicious";
                } else if (scanResultTag.toLowerCase() === "not scanned") {
                  scanResult = "NotScanned";
                } else {
                  scanResult = "Unknown";
                }
              } else {
                // No tag means not scanned yet - leave as null (will show N/A in UI)
                // Don't default to "Scanning" to avoid spinning loaders on all files
                scanResult = null;
              }

              blobs.push({
                name: fileName,
                type: "file",
                size: item.properties.contentLength,
                lastModified: item.properties.lastModified,
                path: item.name,
                scanResult: scanResult,
                scanTime: scanTimeTag || null,
                accessTier: item.properties.accessTier || null,
                archiveStatus: (item.properties as any).archiveStatus || null,
                rehydratePriority: (item.properties as any).rehydratePriority || null,
                sensitiveDataType: null,
                sensitiveDataConfidence: null
              });

              console.log(`[BLOB SCAN] ${fileName}: scanResult=${scanResult}, scanTime=${scanTimeTag || 'N/A'}, source=tags`);
            }
          }
        }
      }

      console.log(`[BLOB SCAN] Retrieved ${blobs.length} items with scan status`);
      res.json({ blobs });
    } catch (err: any) {
      console.error("GET /api/blobs/scan-status error", err);
      res.status(500).json({ error: err.message || "Failed to fetch blob scan status" });
    }
  });

  // PGP Key Management Endpoints (Phase 2 - Multiple keys per org with SELF/PARTNER ownership)
  
  // GET /api/orgs/:orgId/pgp-keys - Get all PGP keys for organization
  app.get("/api/orgs/:orgId/pgp-keys", tokenRequired, organizationAccessRequired, pgpKeyManagementPermissionRequired('view'), async (req, res) => {
    try {
      const orgId = validateOrganizationId(req.params.orgId);
      if (!orgId) {
        return res.status(400).json({ error: "Invalid organization ID" });
      }

      // Optional filter by belongsTo (SELF or PARTNER)
      const belongsTo = req.query.belongsTo as string | undefined;
      let pgpKeys;
      
      if (belongsTo === 'SELF' || belongsTo === 'PARTNER') {
        pgpKeys = await storage.getOrgPgpKeysByType(orgId, belongsTo);
      } else {
        pgpKeys = await storage.getOrgPgpKeys(orgId);
      }
      
      res.json({
        keys: pgpKeys.map(key => ({
          id: key.id,
          orgId: key.organizationId,
          keyName: key.keyName,
          publicKeyArmored: key.publicKeyArmored,
          keyId: key.keyId,
          keyType: key.keyType,
          belongsTo: key.belongsTo,
          source: key.source,
          isActive: key.isActive,
          hasPrivateKey: !!key.keyVaultSecretName, // Indicates if private key is in Key Vault
          createdAt: key.createdAt,
        })),
        count: pgpKeys.length,
      });
    } catch (error: any) {
      console.error("GET /api/orgs/:orgId/pgp-keys error", error);
      res.status(500).json({ error: "Failed to fetch PGP keys" });
    }
  });

  // GET /api/orgs/:orgId/pgp-key - Get organization's first OWN PGP key (backward compatibility)
  app.get("/api/orgs/:orgId/pgp-key", tokenRequired, organizationAccessRequired, pgpKeyManagementPermissionRequired('view'), async (req, res) => {
    try {
      const orgId = validateOrganizationId(req.params.orgId);
      if (!orgId) {
        return res.status(400).json({ error: "Invalid organization ID" });
      }

      const pgpKey = await storage.getOrgPgpKey(orgId);
      
      if (!pgpKey) {
        return res.status(404).json({ hasKey: false, message: "No PGP key configured for this organization" });
      }

      res.json({
        hasKey: true,
        id: pgpKey.id,
        orgId: pgpKey.organizationId,
        keyName: pgpKey.keyName,
        publicKeyArmored: pgpKey.publicKeyArmored,
        keyId: pgpKey.keyId,
        keyType: pgpKey.keyType,
        belongsTo: pgpKey.belongsTo,
        source: pgpKey.source,
        isActive: pgpKey.isActive,
        createdAt: pgpKey.createdAt,
      });
    } catch (error: any) {
      console.error("GET /api/orgs/:orgId/pgp-key error", error);
      res.status(500).json({ error: "Failed to fetch PGP key" });
    }
  });

  // POST /api/orgs/:orgId/pgp-key/generate - Generate new OWN PGP key pair
  app.post("/api/orgs/:orgId/pgp-key/generate", tokenRequired, organizationAccessRequired, pgpKeyManagementPermissionRequired('generate'), async (req, res) => {
    try {
      const orgId = validateOrganizationId(req.params.orgId);
      if (!orgId) {
        return res.status(400).json({ error: "Invalid organization ID" });
      }

      const { keyName } = req.body;
      
      // Validate keyName
      if (!keyName || typeof keyName !== 'string' || keyName.trim().length === 0) {
        return res.status(400).json({ error: "Key name is required" });
      }
      if (keyName.length > 100) {
        return res.status(400).json({ error: "Key name must not exceed 100 characters" });
      }

      // Get user info for activity logging
      const userEmail = req.user?.email || "unknown";
      const user = await storage.getUserByEmail(userEmail);

      // Generate keypair
      const { publicKeyArmored, privateKeyArmored, keyId } = await generatePgpKeypair(orgId);

      // Create unique Key Vault secret name with timestamp to support multiple keys
      const timestamp = Date.now();
      const keyVaultSecretName = `PGP-ORG-${orgId}-${timestamp}`;

      // ATOMIC OPERATION: Store private key first, then database record
      // If Key Vault storage is required and fails, nothing is stored (no partial state)
      let storedKeyVaultSecretName: string | null = null;
      let storedPrivateKeyData: string | null = null;

      try {
        const storageResult = await storePrivateKey(keyVaultSecretName, privateKeyArmored);
        if (storageResult.storedInKeyVault) {
          storedKeyVaultSecretName = keyVaultSecretName;
        } else if (storageResult.storedInDatabase) {
          storedPrivateKeyData = privateKeyArmored;
        }
      } catch (storageError: any) {
        console.error("❌ [PGP KEY] Failed to store private key:", storageError);
        
        // Check if this is a Key Vault permission error - return structured error for frontend
        if (storageError.keyVaultError) {
          return res.status(403).json({
            error: storageError.message,
            keyVaultError: storageError.keyVaultError
          });
        }
        
        // Generic storage error
        return res.status(500).json({ 
          error: "Failed to store private key. The operation has been cancelled to prevent partial state.",
          details: storageError.message
        });
      }

      // Only create database record AFTER private key is successfully stored
      const pgpKey = await storage.createOrgPgpKey({
        organizationId: orgId,
        keyName: keyName.trim(),
        publicKeyArmored,
        keyVaultSecretName: storedKeyVaultSecretName,
        privateKeyData: storedPrivateKeyData,
        keyId,
        keyType: "OWN",
        belongsTo: "SELF",
        source: "GENERATED",
        isActive: true,
        createdByUserId: user?.id || undefined,
      });

      // Get activity logging context
      const logContext = await getActivityLoggingContext(req, orgId);

      // Log activity
      await ActivityLogger.log({
        userId: logContext.userId,
        userName: logContext.userName,
        email: logContext.email,
        action: "PGP_KEY_GENERATED",
        actionCategory: "SECURITY",
        resource: `org-${orgId}`,
        resourceType: "PGP_KEY",
        details: { keyId, keyName: keyName.trim(), keyType: "OWN", belongsTo: "SELF", source: "GENERATED" },
        organizationId: logContext.organizationId,
        organizationName: logContext.organizationName,
        roleId: logContext.roleId,
        roleName: logContext.roleName,
        ipAddress: logContext.ipAddress,
        userAgent: logContext.userAgent,
      });

      res.status(201).json({
        id: pgpKey.id,
        orgId: pgpKey.organizationId,
        keyName: pgpKey.keyName,
        publicKeyArmored: pgpKey.publicKeyArmored,
        keyId: pgpKey.keyId,
        keyType: pgpKey.keyType,
        belongsTo: pgpKey.belongsTo,
        source: pgpKey.source,
        isActive: pgpKey.isActive,
        createdAt: pgpKey.createdAt,
      });
    } catch (error: any) {
      console.error("POST /api/orgs/:orgId/pgp-key/generate error", error);
      res.status(500).json({ error: error.message || "Failed to generate PGP key" });
    }
  });

  // POST /api/orgs/:orgId/pgp-key/import - Import existing OWN PGP key pair (private + public)
  app.post("/api/orgs/:orgId/pgp-key/import", tokenRequired, organizationAccessRequired, pgpKeyManagementPermissionRequired('generate'), async (req, res) => {
    try {
      const orgId = validateOrganizationId(req.params.orgId);
      if (!orgId) {
        return res.status(400).json({ error: "Invalid organization ID" });
      }

      const { keyName, privateKeyArmored, publicKeyArmored, passphrase } = req.body;

      // Validate keyName
      if (!keyName || typeof keyName !== 'string' || keyName.trim().length === 0) {
        return res.status(400).json({ error: "Key name is required" });
      }
      if (keyName.length > 100) {
        return res.status(400).json({ error: "Key name must not exceed 100 characters" });
      }

      // Validate private key input
      if (!privateKeyArmored || typeof privateKeyArmored !== "string") {
        return res.status(400).json({ error: "Private key is required" });
      }

      if (privateKeyArmored.length > 102400) {
        return res.status(400).json({ error: "Private key is too large (max 100KB)" });
      }

      // Validate public key input
      if (!publicKeyArmored || typeof publicKeyArmored !== "string") {
        return res.status(400).json({ error: "Public key is required" });
      }

      if (publicKeyArmored.length > 102400) {
        return res.status(400).json({ error: "Public key is too large (max 100KB)" });
      }

      // Get user info for activity logging
      const userEmail = req.user?.email || "unknown";
      const user = await storage.getUserByEmail(userEmail);

      // First, validate the private key format and passphrase
      try {
        await validateAndParsePrivateKey(privateKeyArmored, passphrase || undefined);
      } catch (error: any) {
        return res.status(400).json({ error: error.message || "Invalid private key format or incorrect passphrase" });
      }

      // Then, validate the public key format
      try {
        await validateAndParsePublicKey(publicKeyArmored);
      } catch (error: any) {
        return res.status(400).json({ error: error.message || "Invalid public key format" });
      }

      // Validate that the private and public keys are a matching pair
      let keyId: string;
      try {
        const pairValidation = await validateKeyPairMatch(
          privateKeyArmored,
          publicKeyArmored,
          passphrase || undefined
        );
        
        if (!pairValidation.isValid) {
          return res.status(400).json({ 
            error: "Key pair mismatch: The private key and public key do not belong to the same key pair. Please ensure you are importing matching keys." 
          });
        }
        
        keyId = pairValidation.keyId;
      } catch (pairError: any) {
        console.error("❌ [PGP KEY] Key pair validation failed:", pairError);
        return res.status(400).json({ 
          error: pairError.message || "Failed to validate key pair. Please check that both keys are valid PGP keys and the passphrase is correct." 
        });
      }

      // Create unique Key Vault secret name with timestamp to support multiple keys
      const timestamp = Date.now();
      const keyVaultSecretName = `PGP-ORG-${orgId}-${timestamp}`;

      // ATOMIC OPERATION: Store private key first, then database record
      // If Key Vault storage is required and fails, nothing is stored (no partial state)
      let storedKeyVaultSecretName: string | null = null;
      let storedPrivateKeyData: string | null = null;

      try {
        const storageResult = await storePrivateKey(keyVaultSecretName, privateKeyArmored);
        if (storageResult.storedInKeyVault) {
          storedKeyVaultSecretName = keyVaultSecretName;
        } else if (storageResult.storedInDatabase) {
          storedPrivateKeyData = privateKeyArmored;
        }
      } catch (storageError: any) {
        console.error("❌ [PGP KEY] Failed to store private key:", storageError);
        
        // Check if this is a Key Vault permission error - return structured error for frontend
        if (storageError.keyVaultError) {
          return res.status(403).json({
            error: storageError.message,
            keyVaultError: storageError.keyVaultError
          });
        }
        
        // Generic storage error
        return res.status(500).json({ 
          error: "Failed to store private key. The operation has been cancelled to prevent partial state.",
          details: storageError.message
        });
      }

      // Only create database record AFTER private key is successfully stored
      const pgpKey = await storage.createOrgPgpKey({
        organizationId: orgId,
        keyName: keyName.trim(),
        publicKeyArmored,
        keyVaultSecretName: storedKeyVaultSecretName,
        privateKeyData: storedPrivateKeyData,
        keyId,
        keyType: "OWN",
        belongsTo: "SELF",
        source: "IMPORTED",
        isActive: true,
        createdByUserId: user?.id || undefined,
      });

      // Get activity logging context
      const logContext = await getActivityLoggingContext(req, orgId);

      // Log activity
      await ActivityLogger.log({
        userId: logContext.userId,
        userName: logContext.userName,
        email: logContext.email,
        action: "PGP_KEY_IMPORTED",
        actionCategory: "SECURITY",
        resource: `org-${orgId}`,
        resourceType: "PGP_KEY",
        details: { keyId, keyName: keyName.trim(), keyType: "OWN", belongsTo: "SELF", source: "IMPORTED" },
        organizationId: logContext.organizationId,
        organizationName: logContext.organizationName,
        roleId: logContext.roleId,
        roleName: logContext.roleName,
        ipAddress: logContext.ipAddress,
        userAgent: logContext.userAgent,
      });

      res.status(201).json({
        id: pgpKey.id,
        orgId: pgpKey.organizationId,
        keyName: pgpKey.keyName,
        publicKeyArmored: pgpKey.publicKeyArmored,
        keyId: pgpKey.keyId,
        keyType: pgpKey.keyType,
        belongsTo: pgpKey.belongsTo,
        source: pgpKey.source,
        isActive: pgpKey.isActive,
        createdAt: pgpKey.createdAt,
      });
    } catch (error: any) {
      console.error("POST /api/orgs/:orgId/pgp-key/import error", error);
      res.status(400).json({ error: error.message || "Failed to import PGP key" });
    }
  });

  // POST /api/orgs/:orgId/pgp-key/import-partner - Import PARTNER public key only
  app.post("/api/orgs/:orgId/pgp-key/import-partner", tokenRequired, organizationAccessRequired, pgpKeyManagementPermissionRequired('generate'), async (req, res) => {
    try {
      const orgId = validateOrganizationId(req.params.orgId);
      if (!orgId) {
        return res.status(400).json({ error: "Invalid organization ID" });
      }

      const { keyName, publicKeyArmored } = req.body;

      // Validate keyName
      if (!keyName || typeof keyName !== 'string' || keyName.trim().length === 0) {
        return res.status(400).json({ error: "Key name is required" });
      }
      if (keyName.length > 100) {
        return res.status(400).json({ error: "Key name must not exceed 100 characters" });
      }

      // Validate public key input
      if (!publicKeyArmored || typeof publicKeyArmored !== "string") {
        return res.status(400).json({ error: "publicKeyArmored is required" });
      }

      if (publicKeyArmored.length > 102400) {
        return res.status(400).json({ error: "PGP key is too large (max 100KB)" });
      }

      // Get user info for activity logging
      const userEmail = req.user?.email || "unknown";
      const user = await storage.getUserByEmail(userEmail);

      // Validate and parse public key
      const { publicKeyArmored: validatedPublicKey, keyId } = await validateAndParsePublicKey(publicKeyArmored);

      // Create database record - PARTNER key with PARTNER ownership (no Key Vault storage)
      const pgpKey = await storage.createOrgPgpKey({
        organizationId: orgId,
        keyName: keyName.trim(),
        publicKeyArmored: validatedPublicKey,
        keyVaultSecretName: null, // No private key for partner keys
        keyId,
        keyType: "PARTNER",
        belongsTo: "PARTNER",
        source: "IMPORTED",
        isActive: true,
        createdByUserId: user?.id || undefined,
      });

      // Get activity logging context
      const logContext = await getActivityLoggingContext(req, orgId);

      // Log activity
      await ActivityLogger.log({
        userId: logContext.userId,
        userName: logContext.userName,
        email: logContext.email,
        action: "PGP_KEY_IMPORTED",
        actionCategory: "SECURITY",
        resource: `org-${orgId}`,
        resourceType: "PGP_KEY",
        details: { keyId, keyName: keyName.trim(), keyType: "PARTNER", belongsTo: "PARTNER", source: "IMPORTED" },
        organizationId: logContext.organizationId,
        organizationName: logContext.organizationName,
        roleId: logContext.roleId,
        roleName: logContext.roleName,
        ipAddress: logContext.ipAddress,
        userAgent: logContext.userAgent,
      });

      res.status(201).json({
        id: pgpKey.id,
        orgId: pgpKey.organizationId,
        keyName: pgpKey.keyName,
        publicKeyArmored: pgpKey.publicKeyArmored,
        keyId: pgpKey.keyId,
        keyType: pgpKey.keyType,
        belongsTo: pgpKey.belongsTo,
        source: pgpKey.source,
        isActive: pgpKey.isActive,
        createdAt: pgpKey.createdAt,
      });
    } catch (error: any) {
      console.error("POST /api/orgs/:orgId/pgp-key/import-partner error", error);
      res.status(400).json({ error: error.message || "Failed to import partner PGP key" });
    }
  });

  // DELETE /api/orgs/:orgId/pgp-key/:keyId - Delete specific PGP key by ID
  app.delete("/api/orgs/:orgId/pgp-key/:keyId", tokenRequired, organizationAccessRequired, pgpKeyManagementPermissionRequired('delete'), async (req, res) => {
    try {
      const orgId = validateOrganizationId(req.params.orgId);
      if (!orgId) {
        return res.status(400).json({ error: "Invalid organization ID" });
      }

      const keyId = parseInt(req.params.keyId, 10);
      if (isNaN(keyId) || keyId <= 0) {
        return res.status(400).json({ error: "Invalid key ID" });
      }

      // Get key to verify ownership and get Key Vault secret name
      const pgpKey = await storage.getOrgPgpKeyById(keyId);
      if (!pgpKey) {
        return res.status(404).json({ error: "PGP key not found" });
      }

      // Verify the key belongs to the organization
      if (pgpKey.organizationId !== orgId) {
        return res.status(403).json({ error: "Key does not belong to this organization" });
      }

      const token = req.headers.authorization?.split(" ")[1];
      const user = await verifyToken(token!);
      const userEmail = user?.email || "unknown";

      // For OWN keys, delete from Key Vault first
      if (pgpKey.keyVaultSecretName && pgpKey.belongsTo === 'SELF') {
        try {
          await deletePrivateKeyFromKeyVault(pgpKey.keyVaultSecretName);
          console.log(`✅ [KEY VAULT] Deleted private key: ${pgpKey.keyVaultSecretName}`);
        } catch (keyVaultError) {
          console.error("Warning: Failed to delete key from Key Vault:", keyVaultError);
          // Continue with DB deletion even if Key Vault fails
        }
      }

      // Delete from database
      await storage.deleteOrgPgpKeyById(keyId);

      // Get activity logging context
      const logContext = await getActivityLoggingContext(req, orgId);

      // Log activity
      await ActivityLogger.log({
        userId: logContext.userId,
        userName: logContext.userName,
        email: logContext.email,
        action: "PGP_KEY_DELETED",
        actionCategory: "SECURITY",
        resource: `org-${orgId}`,
        resourceType: "PGP_KEY",
        details: { 
          keyId: pgpKey.keyId, 
          keyName: pgpKey.keyName,
          keyType: pgpKey.keyType,
          belongsTo: pgpKey.belongsTo,
          deleted: true 
        },
        organizationId: logContext.organizationId,
        organizationName: logContext.organizationName,
        roleId: logContext.roleId,
        roleName: logContext.roleName,
        ipAddress: logContext.ipAddress,
        userAgent: logContext.userAgent,
      });

      res.status(200).json({ success: true, message: "PGP key deleted successfully" });
    } catch (error: any) {
      console.error("DELETE /api/orgs/:orgId/pgp-key/:keyId error", error);
      res.status(400).json({ error: error.message || "Failed to delete PGP key" });
    }
  });

  // DELETE /api/orgs/:orgId/pgp-key - Delete all organization's PGP keys (backward compatibility)
  app.delete("/api/orgs/:orgId/pgp-key", tokenRequired, organizationAccessRequired, pgpKeyManagementPermissionRequired('delete'), async (req, res) => {
    try {
      const orgId = validateOrganizationId(req.params.orgId);
      if (!orgId) {
        return res.status(400).json({ error: "Invalid organization ID" });
      }

      const token = req.headers.authorization?.split(" ")[1];
      const user = await verifyToken(token!);
      const userEmail = user?.email || "unknown";

      // Get all keys to clean up Key Vault for OWN keys
      const allKeys = await storage.getOrgPgpKeys(orgId);
      for (const key of allKeys) {
        if (key.keyVaultSecretName && key.belongsTo === 'SELF') {
          try {
            await deletePrivateKeyFromKeyVault(key.keyVaultSecretName);
            console.log(`✅ [KEY VAULT] Deleted private key: ${key.keyVaultSecretName}`);
          } catch (keyVaultError) {
            console.error("Warning: Failed to delete key from Key Vault:", keyVaultError);
          }
        }
      }

      // Delete all keys from storage
      await storage.deleteOrgPgpKey(orgId);

      // Get activity logging context
      const logContext = await getActivityLoggingContext(req, orgId);

      // Log activity
      await ActivityLogger.log({
        userId: logContext.userId,
        userName: logContext.userName,
        email: logContext.email,
        action: "PGP_KEY_DELETED",
        actionCategory: "SECURITY",
        resource: `org-${orgId}`,
        resourceType: "PGP_KEY",
        details: { deletedCount: allKeys.length, deleted: true },
        organizationId: logContext.organizationId,
        organizationName: logContext.organizationName,
        roleId: logContext.roleId,
        roleName: logContext.roleName,
        ipAddress: logContext.ipAddress,
        userAgent: logContext.userAgent,
      });

      res.status(200).json({ success: true, message: "All PGP keys deleted successfully" });
    } catch (error: any) {
      console.error("DELETE /api/orgs/:orgId/pgp-key error", error);
      res.status(400).json({ error: error.message || "Failed to delete PGP key" });
    }
  });

  // ==========================================
  // FOUNDRY AI MANAGEMENT ENDPOINTS
  // ==========================================

  // GET /api/foundry/resources - List all Foundry resources (org-agnostic)
  // Resources are accessible to any user with foundry view permission
  app.get(
    "/api/foundry/resources",
    tokenRequired,
    foundryManagementAccessRequired,
    async (req, res) => {
      try {
        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }
        
        // Get all foundry resources - they are org-agnostic
        const resources = await storage.getFoundryResources();
        console.log(`[FOUNDRY] GET /api/foundry/resources - Found ${resources.length} resources for user ${userEmail}`);
        if (resources.length > 0) {
          console.log(`[FOUNDRY] Resources:`, resources.map(r => ({ id: r.id, name: r.resourceName, status: r.status })));
        }

        const logContext = await getActivityLoggingContext(req);
        await ActivityLogger.log({
          userId: logContext.userId,
          userName: logContext.userName,
          email: logContext.email,
          ipAddress: logContext.ipAddress,
          userAgent: logContext.userAgent,
          action: ActivityActions.VIEW_FOUNDRY_RESOURCES,
          actionCategory: "FOUNDRY_AI_MANAGEMENT",
          resource: "foundry-resources",
          resourceType: "FOUNDRY_RESOURCE",
          details: { count: resources.length },
          organizationId: logContext.organizationId,
          organizationName: logContext.organizationName,
          roleId: logContext.roleId,
          roleName: logContext.roleName,
        });

        res.json(resources);
      } catch (error) {
        console.error("Foundry resources fetch error:", error);
        res.status(500).json({ error: "Failed to fetch Foundry resources" });
      }
    }
  );

  // GET /api/foundry/org-resources - List Foundry resources linked to a specific organization
  // Returns resources that are linked to the specified org via foundry_resource_sets
  app.get(
    "/api/foundry/org-resources",
    tokenRequired,
    foundryManagementAccessRequired,
    async (req, res) => {
      try {
        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }
        
        const organizationId = parseInt(req.query.organizationId as string);
        if (isNaN(organizationId)) {
          return res.status(400).json({ error: "Valid organizationId is required" });
        }

        // Verify user has access to this organization
        const hasAccess = await storage.validateUserOrganizationAccess(userEmail, organizationId);
        if (!hasAccess) {
          console.log(`[FOUNDRY] Access denied: User ${userEmail} does not have access to organization ${organizationId}`);
          return res.status(403).json({ error: "Access denied to this organization" });
        }

        // Get resources linked to this organization via resource_sets
        const resources = await storage.getFoundryResourcesForOrganizations([organizationId]);

        res.json(resources);
      } catch (error) {
        console.error("Foundry org resources fetch error:", error);
        res.status(500).json({ error: "Failed to fetch organization Foundry resources" });
      }
    }
  );

  // POST /api/foundry/resources - Create a new Foundry resource (organization-scoped)
  // Each resource belongs to exactly one organization
  app.post(
    "/api/foundry/resources",
    tokenRequired,
    foundryManagementPermissionRequired("add"),
    async (req, res) => {
      try {
        const validationResult = insertFoundryResourceSchema.safeParse(req.body);
        
        if (!validationResult.success) {
          const errors = validationResult.error.errors.map((err: any) => ({
            field: err.path.join('.'),
            message: err.message
          }));
          return res.status(400).json({ 
            error: "Validation failed", 
            details: errors 
          });
        }

        const validatedData = validationResult.data;
        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // Validate user has access to the organization
        const hasAccess = await storage.validateUserOrganizationAccess(userEmail, validatedData.organizationId);
        if (!hasAccess) {
          console.log(`[FOUNDRY] Access denied: User ${userEmail} does not have access to organization ${validatedData.organizationId}`);
          return res.status(403).json({ error: "Access denied to this organization" });
        }

        // Check for existing resource with the same name to prevent duplicates
        const existingResource = await storage.getFoundryResourceByName(validatedData.resourceName);
        if (existingResource) {
          return res.status(409).json({
            error: `A Foundry resource named "${validatedData.resourceName}" already exists`,
            existingResourceId: existingResource.id,
            existingResource
          });
        }

        const user = await storage.getUserByEmail(userEmail);
        const resource = await storage.createFoundryResource({
          ...validatedData,
          createdByUserId: user?.id,
          status: "pending",
        });

        const logContext = await getActivityLoggingContext(req, validatedData.organizationId);
        await ActivityLogger.log({
          userId: logContext.userId,
          userName: logContext.userName,
          email: logContext.email,
          ipAddress: logContext.ipAddress,
          userAgent: logContext.userAgent,
          action: ActivityActions.CREATE_FOUNDRY_RESOURCE,
          actionCategory: "FOUNDRY_AI_MANAGEMENT",
          resource: resource.resourceName,
          resourceType: "FOUNDRY_RESOURCE",
          details: { resourceId: resource.id, resourceGroup: resource.resourceGroup, location: resource.location },
          organizationId: logContext.organizationId,
          organizationName: logContext.organizationName,
          roleId: logContext.roleId,
          roleName: logContext.roleName,
        });

        if (foundryProvisioningService.isEnabled()) {
          // Run provisioning synchronously so errors are returned to the UI
          try {
            await storage.updateFoundryResource(resource.id, { status: "provisioning" });
            console.log(`[FOUNDRY] Starting Azure provisioning for resource ${resource.id}`);

            const provisionResult = await foundryProvisioningService.provisionFoundryResources({
              resourceName: resource.resourceName,
              resourceGroup: resource.resourceGroup,
              location: resource.location,
              projectName: resource.projectName || undefined,
            });

            if (provisionResult.success) {
              const updatedResource = await storage.updateFoundryResource(resource.id, {
                status: "active",
                resourceId: provisionResult.resourceId,
                projectId: provisionResult.projectId,
                projectName: provisionResult.projectName,
                projectEndpoint: provisionResult.projectEndpoint,
                agentId: provisionResult.agentId,
                agentName: provisionResult.agentName,
                vectorStoreId: provisionResult.vectorStoreId,
              });
              console.log(`[FOUNDRY] Provisioning completed for resource ${resource.id}`);

              await ActivityLogger.log({
                userId: logContext.userId,
                userName: logContext.userName,
                email: logContext.email,
                ipAddress: logContext.ipAddress,
                userAgent: logContext.userAgent,
                action: ActivityActions.CREATE_FOUNDRY_RESOURCE,
                actionCategory: "FOUNDRY_AI_MANAGEMENT",
                resource: resource.resourceName,
                resourceType: "FOUNDRY_RESOURCE",
                details: { resourceId: resource.id, azureResourceId: provisionResult.resourceId },
                organizationId: logContext.organizationId,
                organizationName: logContext.organizationName,
                roleId: logContext.roleId,
                roleName: logContext.roleName,
              });

              return res.status(201).json(updatedResource);
            } else {
              // Provisioning failed - delete the resource and return error
              await storage.deleteFoundryResource(resource.id);
              console.error(`[FOUNDRY] Provisioning failed for resource ${resource.id}: ${provisionResult.error}`);
              return res.status(400).json({ 
                error: provisionResult.error || "Failed to provision Azure resources"
              });
            }
          } catch (error: any) {
            console.error(`[FOUNDRY] Provisioning error for resource ${resource.id}:`, error.message);
            // Delete the failed resource and return error
            await storage.deleteFoundryResource(resource.id);
            return res.status(400).json({ 
              error: error.message || "Failed to provision Azure resources"
            });
          }
        } else {
          console.log(`[FOUNDRY] Azure provisioning not configured - resource saved with pending status`);
          return res.status(201).json(resource);
        }
      } catch (error) {
        console.error("Foundry resource creation error:", error);
        res.status(500).json({ error: "Failed to create Foundry resource" });
      }
    }
  );

  // GET /api/foundry/resources/:id - Get a specific Foundry resource (org-agnostic)
  app.get(
    "/api/foundry/resources/:id",
    tokenRequired,
    foundryManagementPermissionRequired("view"),
    async (req, res) => {
      try {
        const resourceId = parseInt(req.params.id);
        if (isNaN(resourceId)) {
          return res.status(400).json({ error: "Invalid resource ID" });
        }

        const resource = await storage.getFoundryResource(resourceId);
        if (!resource) {
          return res.status(404).json({ error: "Foundry resource not found" });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // Validate user has access to the organization that owns this resource
        const hasAccess = await storage.validateUserOrganizationAccess(userEmail, resource.organizationId);
        if (!hasAccess) {
          console.log(`[FOUNDRY] Access denied: User ${userEmail} does not have access to organization ${resource.organizationId}`);
          return res.status(403).json({ error: "Access denied to this organization" });
        }

        res.json(resource);
      } catch (error) {
        console.error("Foundry resource fetch error:", error);
        res.status(500).json({ error: "Failed to fetch Foundry resource" });
      }
    }
  );

  // PUT /api/foundry/resources/:id - Update a Foundry resource (organization-scoped)
  app.put(
    "/api/foundry/resources/:id",
    tokenRequired,
    foundryManagementPermissionRequired("edit"),
    async (req, res) => {
      try {
        const resourceId = parseInt(req.params.id);
        if (isNaN(resourceId)) {
          return res.status(400).json({ error: "Invalid resource ID" });
        }

        const existingResource = await storage.getFoundryResource(resourceId);
        if (!existingResource) {
          return res.status(404).json({ error: "Foundry resource not found" });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // Validate user has access to the organization that owns this resource
        const hasAccess = await storage.validateUserOrganizationAccess(userEmail, existingResource.organizationId);
        if (!hasAccess) {
          console.log(`[FOUNDRY] Access denied: User ${userEmail} does not have access to organization ${existingResource.organizationId}`);
          return res.status(403).json({ error: "Access denied to this organization" });
        }

        // SECURITY: Prevent organizationId changes - resources cannot be transferred between organizations
        const { organizationId, ...safeUpdateData } = req.body;
        if (organizationId !== undefined && organizationId !== existingResource.organizationId) {
          console.log(`[FOUNDRY] Blocked attempt to change organizationId from ${existingResource.organizationId} to ${organizationId}`);
          return res.status(400).json({ error: "Cannot change the organization of a Foundry resource" });
        }

        const updatedResource = await storage.updateFoundryResource(resourceId, safeUpdateData);

        const logContext = await getActivityLoggingContext(req, existingResource.organizationId);
        await ActivityLogger.log({
          userId: logContext.userId,
          userName: logContext.userName,
          email: logContext.email,
          ipAddress: logContext.ipAddress,
          userAgent: logContext.userAgent,
          action: ActivityActions.UPDATE_FOUNDRY_RESOURCE,
          actionCategory: "FOUNDRY_AI_MANAGEMENT",
          resource: existingResource.resourceName,
          resourceType: "FOUNDRY_RESOURCE",
          details: { resourceId, organizationId: existingResource.organizationId, updates: Object.keys(req.body) },
          organizationId: logContext.organizationId,
          organizationName: logContext.organizationName,
          roleId: logContext.roleId,
          roleName: logContext.roleName,
        });

        res.json(updatedResource);
      } catch (error) {
        console.error("Foundry resource update error:", error);
        res.status(500).json({ error: "Failed to update Foundry resource" });
      }
    }
  );

  // DELETE /api/foundry/resources/:id - Delete a Foundry resource (organization-scoped)
  // Deletes from Azure first (project, then hub), then removes from database
  app.delete(
    "/api/foundry/resources/:id",
    tokenRequired,
    foundryManagementPermissionRequired("delete"),
    async (req, res) => {
      try {
        const resourceId = parseInt(req.params.id);
        if (isNaN(resourceId)) {
          return res.status(400).json({ error: "Invalid resource ID" });
        }

        const resource = await storage.getFoundryResource(resourceId);
        if (!resource) {
          return res.status(404).json({ error: "Foundry resource not found" });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // Validate user has access to the organization that owns this resource
        const hasAccess = await storage.validateUserOrganizationAccess(userEmail, resource.organizationId);
        if (!hasAccess) {
          console.log(`[FOUNDRY] Access denied: User ${userEmail} does not have access to organization ${resource.organizationId}`);
          return res.status(403).json({ error: "Access denied to this organization" });
        }

        // Check if resource is linked to any resource sets
        const linkedOrgsCount = await storage.countOrganizationsLinkedToResource(resourceId);
        if (linkedOrgsCount > 0) {
          console.log(`[FOUNDRY] Cannot delete resource ${resourceId}: linked to ${linkedOrgsCount} organization(s) via resource sets`);
          return res.status(400).json({ 
            error: `Cannot delete this Foundry resource. It is currently linked to ${linkedOrgsCount} organization(s) via Resource Sets. Please delete the associated Resource Set(s) first.` 
          });
        }

        const azureErrors: string[] = [];
        
        // Step 1: Delete project from Azure (if exists)
        if (resource.projectName && resource.resourceGroup && resource.hubName) {
          console.log(`[FOUNDRY] Deleting project ${resource.projectName} from Azure...`);
          const projectResult = await foundryProvisioningService.deleteFoundryProject(
            resource.resourceGroup,
            resource.hubName,
            resource.projectName
          );
          if (!projectResult.success) {
            console.warn(`[FOUNDRY] Failed to delete project from Azure: ${projectResult.error}`);
            azureErrors.push(`Project: ${projectResult.error}`);
          } else {
            console.log(`[FOUNDRY] Project ${resource.projectName} deleted from Azure`);
          }
        }

        // Step 2: Delete hub from Azure (if exists)
        if (resource.hubName && resource.resourceGroup) {
          console.log(`[FOUNDRY] Deleting hub ${resource.hubName} from Azure...`);
          const hubResult = await foundryProvisioningService.deleteFoundryHub(
            resource.resourceGroup,
            resource.hubName
          );
          if (!hubResult.success) {
            console.warn(`[FOUNDRY] Failed to delete hub from Azure: ${hubResult.error}`);
            azureErrors.push(`Hub: ${hubResult.error}`);
          } else {
            console.log(`[FOUNDRY] Hub ${resource.hubName} deleted from Azure`);
          }
        }

        // Step 3: Delete from database
        const success = await storage.deleteFoundryResource(resourceId);
        if (!success) {
          return res.status(500).json({ error: "Failed to delete Foundry resource from database" });
        }

        const logContext = await getActivityLoggingContext(req, resource.organizationId);
        await ActivityLogger.log({
          userId: logContext.userId,
          userName: logContext.userName,
          email: logContext.email,
          ipAddress: logContext.ipAddress,
          userAgent: logContext.userAgent,
          action: ActivityActions.DELETE_FOUNDRY_RESOURCE,
          actionCategory: "FOUNDRY_AI_MANAGEMENT",
          resource: resource.resourceName,
          resourceType: "FOUNDRY_RESOURCE",
          details: { 
            resourceId, 
            organizationId: resource.organizationId, 
            resourceName: resource.resourceName,
            hubName: resource.hubName,
            projectName: resource.projectName,
            azureErrors: azureErrors.length > 0 ? azureErrors : undefined,
          },
          organizationId: logContext.organizationId,
          organizationName: logContext.organizationName,
          roleId: logContext.roleId,
          roleName: logContext.roleName,
        });

        res.json({ 
          success: true,
          azureErrors: azureErrors.length > 0 ? azureErrors : undefined,
          message: azureErrors.length > 0 
            ? "Resource deleted from database. Some Azure resources may not have been deleted."
            : "Resource deleted successfully from Azure and database.",
        });
      } catch (error) {
        console.error("Foundry resource deletion error:", error);
        res.status(500).json({ error: "Failed to delete Foundry resource" });
      }
    }
  );

  // ==================== FOUNDRY RESOURCE SETS (Org-Scoped Chat Config) ====================

  // GET /api/foundry/resource-sets - List resource sets for user's orgs with joined data
  app.get(
    "/api/foundry/resource-sets",
    tokenRequired,
    foundryManagementPermissionRequired("view"),
    async (req, res) => {
      try {
        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // Filter by organization if provided
        const organizationId = req.query.organizationId ? parseInt(req.query.organizationId as string) : undefined;
        
        const userOrgIds = await storage.getUserOrganizationIds(userEmail);
        
        // If organizationId is provided, validate access and filter
        const orgIdsToQuery = organizationId && userOrgIds.includes(organizationId) 
          ? [organizationId] 
          : userOrgIds;
          
        const resourceSets = await storage.getFoundryResourceSetsForOrganizations(orgIdsToQuery);

        // Enrich with foundry resource data and organization names
        const enrichedResourceSets = await Promise.all(
          resourceSets.map(async (rs) => {
            // Get linked foundry resource
            const foundryResource = await storage.getFoundryResource(rs.foundryResourceId);
            // Get organization name
            const org = await storage.getOrganization(rs.organizationId);
            
            return {
              ...rs,
              // Include organization info
              organizationName: org?.name || `Org #${rs.organizationId}`,
              // Include linked resource info
              resourceName: foundryResource?.resourceName || `Resource #${rs.foundryResourceId}`,
              hubName: foundryResource?.hubName || null,
              projectName: foundryResource?.projectName || null,
              customSubdomain: foundryResource?.customSubdomain || null,
              resourceGroup: foundryResource?.resourceGroup || null,
              projectEndpoint: foundryResource?.projectEndpoint || null,
              // Fall back to foundry resource's agent/vector store if not overridden
              effectiveAgentId: rs.defaultAgentId || foundryResource?.agentId || null,
              effectiveAgentName: rs.defaultAgentName || foundryResource?.agentName || null,
              effectiveVectorStoreId: rs.defaultVectorStoreId || foundryResource?.vectorStoreId || null,
            };
          })
        );

        res.json(enrichedResourceSets);
      } catch (error) {
        console.error("Foundry resource sets fetch error:", error);
        res.status(500).json({ error: "Failed to fetch Foundry resource sets" });
      }
    }
  );

  // GET /api/foundry/resource-sets/org/:orgId - Get resource set for specific org with joined foundry resource data
  app.get(
    "/api/foundry/resource-sets/org/:orgId",
    tokenRequired,
    foundryManagementPermissionRequired("view"),
    async (req, res) => {
      try {
        const orgId = parseInt(req.params.orgId);
        if (isNaN(orgId)) {
          return res.status(400).json({ error: "Invalid organization ID" });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        const userOrgIds = await storage.getUserOrganizationIds(userEmail);
        if (!userOrgIds.includes(orgId)) {
          return res.status(403).json({ error: "Access denied to this organization" });
        }

        // Use the joined query to get resource set with foundry resource details
        const result = await storage.getFoundryResourceSetWithResourceByOrg(orgId);
        if (!result) {
          return res.status(404).json({ error: "No resource set found for this organization" });
        }

        // Merge resource set with foundry resource fields for frontend consumption
        // Fall back to foundry resource's agentId/vectorStoreId if resource set doesn't override them
        const { resourceSet, foundryResource } = result;
        const mergedData = {
          ...resourceSet,
          hubName: foundryResource.hubName,
          projectName: foundryResource.projectName,
          customSubdomain: foundryResource.customSubdomain,
          resourceName: foundryResource.resourceName,
          resourceGroup: foundryResource.resourceGroup,
          projectEndpoint: foundryResource.projectEndpoint,
          // Fall back to foundry resource's agent/vector store if resource set doesn't have overrides
          defaultAgentId: resourceSet.defaultAgentId || foundryResource.agentId,
          defaultAgentName: resourceSet.defaultAgentName || foundryResource.agentName,
          defaultVectorStoreId: resourceSet.defaultVectorStoreId || foundryResource.vectorStoreId,
        };

        res.json(mergedData);
      } catch (error) {
        console.error("Foundry resource set fetch error:", error);
        res.status(500).json({ error: "Failed to fetch Foundry resource set" });
      }
    }
  );

  // POST /api/foundry/resource-sets - Create a new resource set
  app.post(
    "/api/foundry/resource-sets",
    tokenRequired,
    foundryManagementPermissionRequired("add"),
    async (req, res) => {
      try {
        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        const validationResult = insertFoundryResourceSetSchema.safeParse({
          ...req.body,
          createdBy: userEmail,
        });

        if (!validationResult.success) {
          const errors = validationResult.error.errors.map((err: any) => ({
            field: err.path.join('.'),
            message: err.message
          }));
          return res.status(400).json({ error: "Validation failed", details: errors });
        }

        const data = validationResult.data;

        // Validate user has access to the organization
        const userOrgIds = await storage.getUserOrganizationIds(userEmail);
        if (!userOrgIds.includes(data.organizationId)) {
          return res.status(403).json({ error: "Access denied to this organization" });
        }

        // Note: One organization CAN have multiple resource sets (linking to different resources)
        // But one resource can only be linked to ONE organization (enforced below)

        // Validate the foundry resource exists (resources are org-agnostic)
        const foundryResource = await storage.getFoundryResource(data.foundryResourceId);
        if (!foundryResource) {
          return res.status(404).json({ error: "Referenced Foundry resource not found" });
        }

        // Check if this resource is already linked to another organization.
        // Shared resources (sharedAcrossOrgs = true) can be linked to multiple orgs.
        // Non-shared resources are limited to one organization for data segregation.
        if (!foundryResource.sharedAcrossOrgs) {
          const linkedOrgCount = await storage.countOrganizationsLinkedToResource(data.foundryResourceId);
          if (linkedOrgCount >= 1) {
            return res.status(409).json({ 
              error: "This Foundry resource is already linked to another organization. Each resource can only be used by one organization to maintain data segregation. To share it across organizations, enable the 'Shared' toggle in the Resources tab first." 
            });
          }
        }

        const resourceSet = await storage.createFoundryResourceSet(data);

        const logContext = await getActivityLoggingContext(req, data.organizationId);
        await ActivityLogger.log({
          userId: logContext.userId,
          userName: logContext.userName,
          email: logContext.email,
          ipAddress: logContext.ipAddress,
          userAgent: logContext.userAgent,
          action: ActivityActions.CREATE_FOUNDRY_RESOURCE,
          actionCategory: "FOUNDRY_AI_MANAGEMENT",
          resource: resourceSet.name,
          resourceType: "FOUNDRY_RESOURCE",
          details: { resourceSetId: resourceSet.id, name: resourceSet.name, foundryResourceId: resourceSet.foundryResourceId, type: "RESOURCE_SET" },
          organizationId: logContext.organizationId,
          organizationName: logContext.organizationName,
          roleId: logContext.roleId,
          roleName: logContext.roleName,
        });

        res.status(201).json(resourceSet);
      } catch (error) {
        console.error("Foundry resource set creation error:", error);
        res.status(500).json({ error: "Failed to create Foundry resource set" });
      }
    }
  );

  // PUT /api/foundry/resource-sets/:id - Update a resource set
  app.put(
    "/api/foundry/resource-sets/:id",
    tokenRequired,
    foundryManagementPermissionRequired("edit"),
    async (req, res) => {
      try {
        const resourceSetId = parseInt(req.params.id);
        if (isNaN(resourceSetId)) {
          return res.status(400).json({ error: "Invalid resource set ID" });
        }

        const existingSet = await storage.getFoundryResourceSet(resourceSetId);
        if (!existingSet) {
          return res.status(404).json({ error: "Foundry resource set not found" });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // Validate user has access to the organization
        const userOrgIds = await storage.getUserOrganizationIds(userEmail);
        if (!userOrgIds.includes(existingSet.organizationId)) {
          return res.status(403).json({ error: "Access denied to this resource set" });
        }

        // Don't allow changing the foundryResourceId or organizationId after creation
        const { foundryResourceId, organizationId, ...updateData } = req.body;

        const updated = await storage.updateFoundryResourceSet(resourceSetId, updateData);
        if (!updated) {
          return res.status(500).json({ error: "Failed to update resource set" });
        }

        const logContext = await getActivityLoggingContext(req, existingSet.organizationId);
        await ActivityLogger.log({
          userId: logContext.userId,
          userName: logContext.userName,
          email: logContext.email,
          ipAddress: logContext.ipAddress,
          userAgent: logContext.userAgent,
          action: ActivityActions.UPDATE_FOUNDRY_RESOURCE,
          actionCategory: "FOUNDRY_AI_MANAGEMENT",
          resource: updated.name,
          resourceType: "FOUNDRY_RESOURCE",
          details: { resourceSetId, changes: req.body, type: "RESOURCE_SET" },
          organizationId: logContext.organizationId,
          organizationName: logContext.organizationName,
          roleId: logContext.roleId,
          roleName: logContext.roleName,
        });

        res.json(updated);
      } catch (error) {
        console.error("Foundry resource set update error:", error);
        res.status(500).json({ error: "Failed to update Foundry resource set" });
      }
    }
  );

  // DELETE /api/foundry/resource-sets/:id - Delete a resource set
  app.delete(
    "/api/foundry/resource-sets/:id",
    tokenRequired,
    foundryManagementPermissionRequired("delete"),
    async (req, res) => {
      try {
        const resourceSetId = parseInt(req.params.id);
        if (isNaN(resourceSetId)) {
          return res.status(400).json({ error: "Invalid resource set ID" });
        }

        const existingSet = await storage.getFoundryResourceSet(resourceSetId);
        if (!existingSet) {
          return res.status(404).json({ error: "Foundry resource set not found" });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // Validate user has access to the organization
        if (existingSet.organizationId) {
          const userOrgIds = await storage.getUserOrganizationIds(userEmail);
          if (!userOrgIds.includes(existingSet.organizationId)) {
            return res.status(403).json({ error: "Access denied to this resource set" });
          }
        }

        const success = await storage.deleteFoundryResourceSet(resourceSetId);
        if (!success) {
          return res.status(500).json({ error: "Failed to delete resource set" });
        }

        const logContext = await getActivityLoggingContext(req, existingSet.organizationId || undefined);
        await ActivityLogger.log({
          userId: logContext.userId,
          userName: logContext.userName,
          email: logContext.email,
          ipAddress: logContext.ipAddress,
          userAgent: logContext.userAgent,
          action: ActivityActions.DELETE_FOUNDRY_RESOURCE,
          actionCategory: "FOUNDRY_AI_MANAGEMENT",
          resource: existingSet.name,
          resourceType: "FOUNDRY_RESOURCE",
          details: { resourceSetId, name: existingSet.name, type: "RESOURCE_SET" },
          organizationId: logContext.organizationId,
          organizationName: logContext.organizationName,
          roleId: logContext.roleId,
          roleName: logContext.roleName,
        });

        res.json({ success: true });
      } catch (error) {
        console.error("Foundry resource set deletion error:", error);
        res.status(500).json({ error: "Failed to delete Foundry resource set" });
      }
    }
  );

  // GET /api/foundry/resource-groups - List Azure resource groups
  app.get(
    "/api/foundry/resource-groups",
    tokenRequired,
    foundryManagementAccessRequired,
    async (req, res) => {
      try {
        const subscriptionId = process.env.ZAPPER_AZURE_SUBSCRIPTION_ID;
        if (!subscriptionId) {
          return res.status(500).json({ error: "Azure subscription ID not configured" });
        }

        const credential = new DefaultAzureCredential();
        const { ResourceManagementClient } = await import("@azure/arm-resources");
        const resourceClient = new ResourceManagementClient(credential, subscriptionId);
        
        const resourceGroups: { name: string; location: string }[] = [];
        for await (const rg of resourceClient.resourceGroups.list()) {
          resourceGroups.push({ name: rg.name || "", location: rg.location || "" });
        }

        res.json(resourceGroups);
      } catch (error) {
        console.error("Resource groups fetch error:", error);
        res.status(500).json({ error: "Failed to fetch resource groups" });
      }
    }
  );

  // GET /api/foundry/locations - List Azure locations for AI Foundry
  app.get(
    "/api/foundry/locations",
    tokenRequired,
    foundryManagementAccessRequired,
    async (req, res) => {
      try {
        // Azure AI Foundry Agent-supported regions only
        // See: https://learn.microsoft.com/en-us/azure/ai-services/agents/region-support
        const locations = [
          { name: "australiaeast", displayName: "Australia East" },
          { name: "brazilsouth", displayName: "Brazil South" },
          { name: "canadaeast", displayName: "Canada East" },
          { name: "centraluseuap", displayName: "Central US EUAP" },
          { name: "eastus", displayName: "East US" },
          { name: "eastus2", displayName: "East US 2" },
          { name: "francecentral", displayName: "France Central" },
          { name: "germanywestcentral", displayName: "Germany West Central" },
          { name: "italynorth", displayName: "Italy North" },
          { name: "japaneast", displayName: "Japan East" },
          { name: "koreacentral", displayName: "Korea Central" },
          { name: "norwayeast", displayName: "Norway East" },
          { name: "polandcentral", displayName: "Poland Central" },
          { name: "southafricanorth", displayName: "South Africa North" },
          { name: "southcentralus", displayName: "South Central US" },
          { name: "southeastasia", displayName: "Southeast Asia" },
          { name: "southindia", displayName: "South India" },
          { name: "swedencentral", displayName: "Sweden Central" },
          { name: "switzerlandnorth", displayName: "Switzerland North" },
          { name: "uaenorth", displayName: "UAE North" },
          { name: "uksouth", displayName: "UK South" },
          { name: "westeurope", displayName: "West Europe" },
          { name: "westus", displayName: "West US" },
          { name: "westus3", displayName: "West US 3" },
        ];
        res.json(locations);
      } catch (error) {
        console.error("Locations fetch error:", error);
        res.status(500).json({ error: "Failed to fetch locations" });
      }
    }
  );

  // ==========================================
  // FOUNDRY SDK-BASED API ENDPOINTS
  // ==========================================

  // POST /api/foundry/hubs - Create a Foundry Hub (AIServices account)
  // Creates a draft database record FIRST to track partial creations, then creates Hub in Azure
  app.post(
    "/api/foundry/hubs",
    tokenRequired,
    foundryManagementPermissionRequired("add"),
    async (req, res) => {
      try {
        const { resourceGroup, hubName, location, customSubdomain, organizationId } = req.body;

        if (!resourceGroup || !hubName || !location) {
          return res.status(400).json({
            error: "Missing required fields: resourceGroup, hubName, location"
          });
        }

        if (!organizationId) {
          return res.status(400).json({
            error: "Organization ID is required to track Foundry resources"
          });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // Check for existing resource with the same hub name to prevent duplicates
        const existingResource = await storage.getFoundryResourceByName(hubName);
        if (existingResource) {
          return res.status(409).json({
            error: `A Foundry resource with hub name "${hubName}" already exists`,
            existingResourceId: existingResource.id,
            existingResource
          });
        }

        const user = await storage.getUserByEmail(userEmail);

        // Step 1: Create a draft database record FIRST before any Azure calls
        // This ensures partial creations are tracked and can be cleaned up
        console.log(`[API] Creating draft database record for Hub: ${hubName}`);
        const draftResource = await storage.createFoundryResource({
          organizationId: parseInt(organizationId),
          resourceName: hubName,
          resourceGroup,
          location,
          hubName,
          customSubdomain: customSubdomain || hubName,
          status: "draft",
          currentStep: "creating_hub",
          createdBy: user?.id || 0,
        });
        console.log(`[API] Created draft resource with ID: ${draftResource.id}`);

        // Step 2: Create the Hub in Azure
        console.log(`[API] Creating Foundry Hub in Azure: ${hubName}`);
        const result = await foundryProvisioningService.createFoundryHub({
          resourceGroup,
          hubName,
          location,
          customSubdomain
        });

        if (result.success) {
          // Step 3: Update database record to hub_created status
          await storage.updateFoundryResource(draftResource.id, {
            status: "hub_created",
            currentStep: "hub_complete",
            resourceId: result.resourceId,
          });
          console.log(`[API] Updated resource ${draftResource.id} to hub_created status`);

          const logContext = await getActivityLoggingContext(req, parseInt(organizationId));
          await ActivityLogger.log({
            userId: logContext.userId,
            userName: logContext.userName,
            email: logContext.email,
            ipAddress: logContext.ipAddress,
            userAgent: logContext.userAgent,
            action: "FOUNDRY_HUB_CREATED" as any,
            actionCategory: "FOUNDRY_AI_MANAGEMENT",
            resource: hubName,
            resourceType: "FOUNDRY_HUB",
            details: { dbResourceId: draftResource.id, resourceId: result.resourceId, endpoint: result.endpoint },
            organizationId: logContext.organizationId,
            organizationName: logContext.organizationName,
            roleId: logContext.roleId,
            roleName: logContext.roleName,
          });
          res.status(201).json({ ...result, dbResourceId: draftResource.id });
        } else {
          // Hub creation failed - update the draft record with error
          await storage.updateFoundryResource(draftResource.id, {
            status: "failed",
            lastError: result.error || "Failed to create Azure Hub",
            currentStep: "hub_failed",
          });
          console.error(`[API] Hub creation failed, updated resource ${draftResource.id} to failed status`);
          res.status(400).json({ ...result, dbResourceId: draftResource.id });
        }
      } catch (error: any) {
        console.error("Foundry Hub creation error:", error);
        res.status(500).json({ error: error.message || "Failed to create Foundry Hub" });
      }
    }
  );

  // GET /api/foundry/hubs - List Foundry Hubs in a resource group
  app.get(
    "/api/foundry/hubs",
    tokenRequired,
    foundryManagementAccessRequired,
    async (req, res) => {
      try {
        const resourceGroup = req.query.resourceGroup as string;

        if (!resourceGroup) {
          return res.status(400).json({ error: "Missing required query parameter: resourceGroup" });
        }

        const result = await foundryProvisioningService.listFoundryHubs(resourceGroup);

        if (result.success) {
          res.json(result.hubs);
        } else {
          res.status(400).json({ error: result.error });
        }
      } catch (error: any) {
        console.error("Foundry Hubs list error:", error);
        res.status(500).json({ error: error.message || "Failed to list Foundry Hubs" });
      }
    }
  );

  // DELETE /api/foundry/hubs/:hubName - Delete a Foundry Hub
  app.delete(
    "/api/foundry/hubs/:hubName",
    tokenRequired,
    foundryManagementPermissionRequired("delete"),
    async (req, res) => {
      try {
        const { hubName } = req.params;
        const resourceGroup = req.query.resourceGroup as string;

        if (!resourceGroup) {
          return res.status(400).json({ error: "Missing required query parameter: resourceGroup" });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        console.log(`[API] Deleting Foundry Hub: ${hubName}`);
        const result = await foundryProvisioningService.deleteFoundryHub(resourceGroup, hubName);

        if (result.success) {
          const logContext = await getActivityLoggingContext(req);
          await ActivityLogger.log({
            userId: logContext.userId,
            userName: logContext.userName,
            email: logContext.email,
            ipAddress: logContext.ipAddress,
            userAgent: logContext.userAgent,
            action: "FOUNDRY_HUB_DELETED" as any,
            actionCategory: "FOUNDRY_AI_MANAGEMENT",
            resource: hubName,
            resourceType: "FOUNDRY_HUB",
            details: { resourceGroup },
            organizationId: logContext.organizationId,
            organizationName: logContext.organizationName,
            roleId: logContext.roleId,
            roleName: logContext.roleName,
          });
          res.json({ success: true, message: `Hub ${hubName} deleted successfully` });
        } else {
          res.status(400).json(result);
        }
      } catch (error: any) {
        console.error("Foundry Hub deletion error:", error);
        res.status(500).json({ error: error.message || "Failed to delete Foundry Hub" });
      }
    }
  );

  // POST /api/foundry/projects - Create a Foundry Project under a Hub
  // Updates the existing database record (created during Hub creation) with project details
  app.post(
    "/api/foundry/projects",
    tokenRequired,
    foundryManagementPermissionRequired("add"),
    async (req, res) => {
      try {
        const { resourceGroup, hubName, projectName, displayName, location } = req.body;

        if (!resourceGroup || !hubName || !projectName) {
          return res.status(400).json({
            error: "Missing required fields: resourceGroup, hubName, projectName"
          });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // Find the existing database record for this Hub (created during Hub creation)
        const existingResource = await storage.getFoundryResourceByName(hubName);
        if (!existingResource) {
          console.warn(`[API] No existing database record found for Hub: ${hubName}`);
          // Hub was created without a database record (legacy flow) - proceed without DB updates
        } else {
          // Update status to indicate project creation is in progress
          await storage.updateFoundryResource(existingResource.id, {
            currentStep: "creating_project",
          });
        }

        console.log(`[API] Creating Foundry Project: ${projectName} under Hub: ${hubName}`);
        const result = await foundryProvisioningService.createFoundryProject({
          resourceGroup,
          hubName,
          projectName,
          displayName,
          location
        });

        if (result.success) {
          // Update the existing database record with project details
          if (existingResource) {
            await storage.updateFoundryResource(existingResource.id, {
              projectName: result.projectName,
              projectId: result.projectId,
              projectEndpoint: result.projectEndpoint,
              status: "project_created",
              currentStep: "project_complete",
            });
            console.log(`[API] Updated resource ${existingResource.id} to project_created status`);
          }

          const logContext = await getActivityLoggingContext(req, existingResource?.organizationId);
          await ActivityLogger.log({
            userId: logContext.userId,
            userName: logContext.userName,
            email: logContext.email,
            ipAddress: logContext.ipAddress,
            userAgent: logContext.userAgent,
            action: "FOUNDRY_PROJECT_CREATED" as any,
            actionCategory: "FOUNDRY_AI_MANAGEMENT",
            resource: projectName,
            resourceType: "FOUNDRY_PROJECT",
            details: { projectId: result.projectId, hubName, dbResourceId: existingResource?.id },
            organizationId: logContext.organizationId,
            organizationName: logContext.organizationName,
            roleId: logContext.roleId,
            roleName: logContext.roleName,
          });
          res.status(201).json({ ...result, dbResourceId: existingResource?.id });
        } else {
          // Update the database record with error status
          if (existingResource) {
            await storage.updateFoundryResource(existingResource.id, {
              status: "failed",
              lastError: result.error || "Failed to create Azure Project",
              currentStep: "project_failed",
            });
          }
          res.status(400).json({ ...result, dbResourceId: existingResource?.id });
        }
      } catch (error: any) {
        console.error("Foundry Project creation error:", error);
        res.status(500).json({ error: error.message || "Failed to create Foundry Project" });
      }
    }
  );

  // GET /api/foundry/projects - List Projects under a Foundry Hub
  app.get(
    "/api/foundry/projects",
    tokenRequired,
    foundryManagementAccessRequired,
    async (req, res) => {
      try {
        const resourceGroup = req.query.resourceGroup as string;
        const hubName = req.query.hubName as string;

        if (!resourceGroup || !hubName) {
          return res.status(400).json({
            error: "Missing required query parameters: resourceGroup, hubName"
          });
        }

        const result = await foundryProvisioningService.listFoundryProjects(resourceGroup, hubName);

        if (result.success) {
          res.json(result.projects);
        } else {
          res.status(400).json({ error: result.error });
        }
      } catch (error: any) {
        console.error("Foundry Projects list error:", error);
        res.status(500).json({ error: error.message || "Failed to list Foundry Projects" });
      }
    }
  );

  // DELETE /api/foundry/projects/:projectName - Delete a Foundry Project
  app.delete(
    "/api/foundry/projects/:projectName",
    tokenRequired,
    foundryManagementPermissionRequired("delete"),
    async (req, res) => {
      try {
        const { projectName } = req.params;
        const resourceGroup = req.query.resourceGroup as string;
        const hubName = req.query.hubName as string;

        if (!resourceGroup || !hubName) {
          return res.status(400).json({
            error: "Missing required query parameters: resourceGroup, hubName"
          });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        console.log(`[API] Deleting Foundry Project: ${projectName}`);
        const result = await foundryProvisioningService.deleteFoundryProject(resourceGroup, hubName, projectName);

        if (result.success) {
          const logContext = await getActivityLoggingContext(req);
          await ActivityLogger.log({
            userId: logContext.userId,
            userName: logContext.userName,
            email: logContext.email,
            ipAddress: logContext.ipAddress,
            userAgent: logContext.userAgent,
            action: "FOUNDRY_PROJECT_DELETED" as any,
            actionCategory: "FOUNDRY_AI_MANAGEMENT",
            resource: projectName,
            resourceType: "FOUNDRY_PROJECT",
            details: { resourceGroup, hubName },
            organizationId: logContext.organizationId,
            organizationName: logContext.organizationName,
            roleId: logContext.roleId,
            roleName: logContext.roleName,
          });
          res.json({ success: true, message: `Project ${projectName} deleted successfully` });
        } else {
          res.status(400).json(result);
        }
      } catch (error: any) {
        console.error("Foundry Project deletion error:", error);
        res.status(500).json({ error: error.message || "Failed to delete Foundry Project" });
      }
    }
  );

  // POST /api/foundry/deployments - Deploy a model to a Foundry Hub
  app.post(
    "/api/foundry/deployments",
    tokenRequired,
    foundryManagementPermissionRequired("add"),
    async (req, res) => {
      try {
        const {
          organizationId,
          resourceGroup,
          hubName,
          deploymentName,
          modelName,
          modelVersion,
          modelFormat,
          skuName,
          skuCapacity
        } = req.body;

        if (!organizationId || !resourceGroup || !hubName || !deploymentName || !modelName) {
          return res.status(400).json({
            error: "Missing required fields: organizationId, resourceGroup, hubName, deploymentName, modelName"
          });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // Verify user has access to this organization
        const userOrganizations = await storage.getOrganizationsForUser(userEmail);
        const userOrgIds = userOrganizations.map(org => org.id);
        if (!userOrgIds.includes(organizationId)) {
          return res.status(403).json({ error: "Access denied: You do not have access to this organization" });
        }

        // Verify the hub belongs to the specified organization
        const foundryResource = await db
          .select()
          .from(foundryResources)
          .where(
            and(
              eq(foundryResources.organizationId, organizationId),
              eq(foundryResources.resourceName, hubName),
              eq(foundryResources.resourceGroup, resourceGroup)
            )
          )
          .limit(1);

        if (foundryResource.length === 0) {
          return res.status(403).json({ 
            error: "Access denied: This Foundry resource does not belong to your organization" 
          });
        }

        console.log(`[API] Deploying model: ${modelName} as ${deploymentName}`);
        const result = await foundryProvisioningService.deployModel({
          resourceGroup,
          hubName,
          deploymentName,
          modelName,
          modelVersion,
          modelFormat,
          skuName,
          skuCapacity
        });

        if (result.success) {
          const logContext = await getActivityLoggingContext(req);
          await ActivityLogger.log({
            userId: logContext.userId,
            userName: logContext.userName,
            email: logContext.email,
            ipAddress: logContext.ipAddress,
            userAgent: logContext.userAgent,
            action: "FOUNDRY_MODEL_DEPLOYED" as any,
            actionCategory: "FOUNDRY_AI_MANAGEMENT",
            resource: deploymentName,
            resourceType: "FOUNDRY_DEPLOYMENT",
            details: { deploymentId: result.deploymentId, modelName, hubName },
            organizationId: logContext.organizationId,
            organizationName: logContext.organizationName,
            roleId: logContext.roleId,
            roleName: logContext.roleName,
          });
          res.status(201).json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error: any) {
        console.error("Model deployment error:", error);
        res.status(500).json({ error: error.message || "Failed to deploy model" });
      }
    }
  );

  // GET /api/foundry/deployments - List model deployments for a Foundry Hub
  app.get(
    "/api/foundry/deployments",
    tokenRequired,
    foundryManagementAccessRequired,
    async (req, res) => {
      try {
        const organizationId = parseInt(req.query.organizationId as string);
        const resourceGroup = req.query.resourceGroup as string;
        const hubName = req.query.hubName as string;

        if (!organizationId || !resourceGroup || !hubName) {
          return res.status(400).json({
            error: "Missing required query parameters: organizationId, resourceGroup, hubName"
          });
        }

        // Verify user has access to this organization
        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }
        const userOrganizations = await storage.getOrganizationsForUser(userEmail);
        const userOrgIds = userOrganizations.map(org => org.id);
        if (!userOrgIds.includes(organizationId)) {
          return res.status(403).json({ error: "Access denied: You do not have access to this organization" });
        }

        // Verify the hub is accessible to the specified organization.
        // For shared resources, the foundryResources row may belong to a different org,
        // so we look up by resourceName + resourceGroup and then verify access.
        const foundryResourceRows = await db
          .select()
          .from(foundryResources)
          .where(
            and(
              eq(foundryResources.resourceName, hubName),
              eq(foundryResources.resourceGroup, resourceGroup)
            )
          )
          .limit(1);

        if (foundryResourceRows.length === 0) {
          return res.status(403).json({ 
            error: "Access denied: This Foundry resource does not belong to your organization" 
          });
        }

        const foundryResourceRow = foundryResourceRows[0];
        const resourceOwnedByUserOrg = userOrgIds.includes(foundryResourceRow.organizationId);
        const resourceSharedAndAccessible = foundryResourceRow.sharedAcrossOrgs === true;
        if (!resourceOwnedByUserOrg && !resourceSharedAndAccessible) {
          return res.status(403).json({ 
            error: "Access denied: This Foundry resource does not belong to your organization" 
          });
        }

        const result = await foundryProvisioningService.listDeployments(resourceGroup, hubName);

        if (result.success) {
          res.json(result.deployments);
        } else {
          res.status(400).json({ error: result.error });
        }
      } catch (error: any) {
        console.error("Deployments list error:", error);
        res.status(500).json({ error: error.message || "Failed to list deployments" });
      }
    }
  );

  // DELETE /api/foundry/deployments/:deploymentName - Delete a model deployment
  app.delete(
    "/api/foundry/deployments/:deploymentName",
    tokenRequired,
    foundryManagementPermissionRequired("delete"),
    async (req, res) => {
      try {
        const { deploymentName } = req.params;
        const organizationId = parseInt(req.query.organizationId as string);
        const resourceGroup = req.query.resourceGroup as string;
        const hubName = req.query.hubName as string;

        if (!organizationId || !resourceGroup || !hubName) {
          return res.status(400).json({
            error: "Missing required query parameters: organizationId, resourceGroup, hubName"
          });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // Verify user has access to this organization
        const userOrganizations = await storage.getOrganizationsForUser(userEmail);
        const userOrgIds = userOrganizations.map(org => org.id);
        if (!userOrgIds.includes(organizationId)) {
          return res.status(403).json({ error: "Access denied: You do not have access to this organization" });
        }

        // Verify the hub belongs to the specified organization
        const foundryResource = await db
          .select()
          .from(foundryResources)
          .where(
            and(
              eq(foundryResources.organizationId, organizationId),
              eq(foundryResources.resourceName, hubName),
              eq(foundryResources.resourceGroup, resourceGroup)
            )
          )
          .limit(1);

        if (foundryResource.length === 0) {
          return res.status(403).json({ 
            error: "Access denied: This Foundry resource does not belong to your organization" 
          });
        }

        console.log(`[API] Deleting deployment: ${deploymentName}`);
        const result = await foundryProvisioningService.deleteDeployment(resourceGroup, hubName, deploymentName);

        if (result.success) {
          const logContext = await getActivityLoggingContext(req);
          await ActivityLogger.log({
            userId: logContext.userId,
            userName: logContext.userName,
            email: logContext.email,
            ipAddress: logContext.ipAddress,
            userAgent: logContext.userAgent,
            action: "FOUNDRY_DEPLOYMENT_DELETED" as any,
            actionCategory: "FOUNDRY_AI_MANAGEMENT",
            resource: deploymentName,
            resourceType: "FOUNDRY_DEPLOYMENT",
            details: { resourceGroup, hubName },
            organizationId: logContext.organizationId,
            organizationName: logContext.organizationName,
            roleId: logContext.roleId,
            roleName: logContext.roleName,
          });
          res.json({ success: true, message: `Deployment ${deploymentName} deleted successfully` });
        } else {
          res.status(400).json(result);
        }
      } catch (error: any) {
        console.error("Deployment deletion error:", error);
        res.status(500).json({ error: error.message || "Failed to delete deployment" });
      }
    }
  );

  // POST /api/foundry/deploy-cu-models - Deploy all required CU models and configure defaults
  app.post(
    "/api/foundry/deploy-cu-models",
    tokenRequired,
    foundryManagementPermissionRequired("add"),
    async (req, res) => {
      try {
        const { organizationId: orgIdRaw, resourceGroup, hubName, skipModels } = req.body;
        const organizationId = parseInt(orgIdRaw, 10);
        const skipModelsList: string[] = Array.isArray(skipModels) ? skipModels : [];

        if (!organizationId || !resourceGroup || !hubName) {
          return res.status(400).json({
            error: "Missing required fields: organizationId, resourceGroup, hubName"
          });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // Verify user has access to this organization
        const userOrganizations = await storage.getOrganizationsForUser(userEmail);
        const userOrgIds = userOrganizations.map(org => org.id);
        if (!userOrgIds.includes(organizationId)) {
          return res.status(403).json({ error: "Access denied: You do not have access to this organization" });
        }

        // Verify the hub is accessible to the specified organization.
        // Shared resources may have a different organizationId in the DB,
        // so we look up by resourceName + resourceGroup and verify access.
        const foundryResourceRows2 = await db
          .select()
          .from(foundryResources)
          .where(
            and(
              eq(foundryResources.resourceName, hubName),
              eq(foundryResources.resourceGroup, resourceGroup)
            )
          )
          .limit(1);

        if (foundryResourceRows2.length === 0) {
          return res.status(403).json({ 
            error: "Access denied: This Foundry resource does not belong to your organization" 
          });
        }

        const foundryResourceRow2 = foundryResourceRows2[0];
        const resourceOwnedByUserOrg2 = userOrgIds.includes(foundryResourceRow2.organizationId);
        const resourceSharedAndAccessible2 = foundryResourceRow2.sharedAcrossOrgs === true;
        if (!resourceOwnedByUserOrg2 && !resourceSharedAndAccessible2) {
          return res.status(403).json({ 
            error: "Access denied: This Foundry resource does not belong to your organization" 
          });
        }

        console.log(`[API] Starting CU model deployment for hub: ${hubName}${skipModelsList.length > 0 ? ` (skipping: ${skipModelsList.join(', ')})` : ''}`);

        // Define the required models with Azure-compliant deployment names (no periods allowed)
        const allRequiredModels = [
          { modelName: "gpt-4.1", deploymentName: "gpt-4-1", modelVersion: "2025-04-14" },
          { modelName: "gpt-4.1-mini", deploymentName: "gpt-4-1-mini", modelVersion: "2025-04-14" },
          { modelName: "text-embedding-3-large", deploymentName: "text-embedding-3-large", modelVersion: "1" }
        ];

        // Skip models that are already deployed (sent by client)
        const requiredModels = allRequiredModels.filter(m => !skipModelsList.includes(m.modelName));

        const deploymentResults: { model: string; deploymentName: string; success: boolean; error?: string }[] = [];

        // Deploy each model
        for (const model of requiredModels) {
          try {
            console.log(`[API] Deploying model: ${model.modelName} as ${model.deploymentName}`);
            const result = await foundryProvisioningService.deployModel({
              resourceGroup,
              hubName,
              deploymentName: model.deploymentName,
              modelName: model.modelName,
              modelVersion: model.modelVersion,
              skuName: "GlobalStandard",
              skuCapacity: 10
            });

            if (result.success) {
              deploymentResults.push({ model: model.modelName, deploymentName: model.deploymentName, success: true });
            } else {
              // Check if already exists (not really an error)
              if (result.error?.includes("already exists") || result.error?.includes("Conflict")) {
                deploymentResults.push({ model: model.modelName, deploymentName: model.deploymentName, success: true });
              } else {
                deploymentResults.push({ model: model.modelName, deploymentName: model.deploymentName, success: false, error: result.error });
              }
            }
          } catch (deployError: any) {
            // Check if deployment already exists
            if (deployError.message?.includes("already exists") || deployError.message?.includes("Conflict")) {
              deploymentResults.push({ model: model.modelName, deploymentName: model.deploymentName, success: true });
            } else {
              deploymentResults.push({ model: model.modelName, deploymentName: model.deploymentName, success: false, error: deployError.message });
            }
          }
        }

        // Now configure CU defaults using deployment names (which map to model names in CU)
        console.log(`[API] Configuring Content Understanding defaults for hub: ${hubName}`);
        const cuResult = await connectContentUnderstanding({
          foundryResourceName: hubName,
          modelDeployments: {
            "gpt-4.1": "gpt-4-1",
            "gpt-4.1-mini": "gpt-4-1-mini",
            "text-embedding-3-large": "text-embedding-3-large"
          }
        });

        // Log activity
        const logContext = await getActivityLoggingContext(req);
        await ActivityLogger.log({
          userId: logContext.userId,
          userName: logContext.userName,
          email: logContext.email,
          ipAddress: logContext.ipAddress,
          userAgent: logContext.userAgent,
          action: "FOUNDRY_CU_MODELS_DEPLOYED" as any,
          actionCategory: "FOUNDRY_AI_MANAGEMENT",
          resource: hubName,
          resourceType: "FOUNDRY_HUB",
          details: { 
            deploymentResults,
            cuDefaultsConfigured: cuResult.success,
            cuError: cuResult.error
          },
          organizationId: logContext.organizationId,
          organizationName: logContext.organizationName,
          roleId: logContext.roleId,
          roleName: logContext.roleName,
        });

        const allDeploymentsSuccessful = deploymentResults.every(r => r.success);

        res.status(allDeploymentsSuccessful && cuResult.success ? 201 : 207).json({
          success: allDeploymentsSuccessful && cuResult.success,
          deployments: deploymentResults,
          cuDefaults: {
            configured: cuResult.success,
            message: cuResult.message,
            error: cuResult.error
          }
        });

      } catch (error: any) {
        console.error("CU model deployment error:", error);
        res.status(500).json({ error: error.message || "Failed to deploy CU models" });
      }
    }
  );

  // ==================== FOUNDRY AGENT ENDPOINTS ====================

  // POST /api/foundry/agents - Create a Foundry Agent
  // Updates the existing database record with agent details
  app.post(
    "/api/foundry/agents",
    tokenRequired,
    foundryManagementPermissionRequired("add"),
    async (req, res) => {
      try {
        const {
          hubName,
          projectName,
          agentName,
          deploymentName,
          instructions,
          tools,
          hubEndpoint,
          customSubdomain
        } = req.body;

        if (!hubName || !projectName || !agentName || !deploymentName) {
          return res.status(400).json({
            error: "Missing required fields: hubName, projectName, agentName, deploymentName"
          });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // Find the existing database record for this Hub
        const existingResource = await storage.getFoundryResourceByName(hubName);
        if (existingResource) {
          await storage.updateFoundryResource(existingResource.id, {
            currentStep: "creating_agent",
          });
        }

        console.log(`[API] Creating Foundry Agent: ${agentName}`);
        const result = await foundryProvisioningService.createFoundryAgent({
          hubName,
          projectName,
          agentName,
          deploymentName,
          instructions,
          tools,
          hubEndpoint,
          customSubdomain
        });

        if (result.success) {
          // Update the database record with agent details
          if (existingResource) {
            await storage.updateFoundryResource(existingResource.id, {
              agentId: result.agentId,
              agentName: agentName,
              status: "agent_created",
              currentStep: "agent_complete",
            });
            console.log(`[API] Updated resource ${existingResource.id} to agent_created status`);
          }

          const logContext = await getActivityLoggingContext(req, existingResource?.organizationId);
          await ActivityLogger.log({
            userId: logContext.userId,
            userName: logContext.userName,
            email: logContext.email,
            ipAddress: logContext.ipAddress,
            userAgent: logContext.userAgent,
            action: "FOUNDRY_AGENT_CREATED" as any,
            actionCategory: "FOUNDRY_AI_MANAGEMENT",
            resource: agentName,
            resourceType: "FOUNDRY_AGENT",
            details: { agentId: result.agentId, hubName, projectName, deploymentName, dbResourceId: existingResource?.id },
            organizationId: logContext.organizationId,
            organizationName: logContext.organizationName,
            roleId: logContext.roleId,
            roleName: logContext.roleName,
          });
          res.status(201).json({ ...result, dbResourceId: existingResource?.id });
        } else {
          if (existingResource) {
            await storage.updateFoundryResource(existingResource.id, {
              status: "failed",
              lastError: result.error || "Failed to create Azure Agent",
              currentStep: "agent_failed",
            });
          }
          res.status(400).json({ ...result, dbResourceId: existingResource?.id });
        }
      } catch (error: any) {
        console.error("Foundry Agent creation error:", error);
        res.status(500).json({ error: error.message || "Failed to create Foundry Agent" });
      }
    }
  );

  // GET /api/foundry/agents - List all Agents in a Project
  app.get(
    "/api/foundry/agents",
    tokenRequired,
    foundryManagementAccessRequired,
    async (req, res) => {
      try {
        const hubName = req.query.hubName as string;
        const projectName = req.query.projectName as string;
        const customSubdomain = req.query.customSubdomain as string;

        if (!hubName || !projectName) {
          return res.status(400).json({
            error: "Missing required query parameters: hubName, projectName"
          });
        }

        console.log(`[FOUNDRY] Listing agents - hubName: ${hubName}, projectName: ${projectName}, customSubdomain: ${customSubdomain || 'not provided'}`);
        const result = await foundryProvisioningService.listFoundryAgents(hubName, projectName, customSubdomain);

        if (result.success) {
          res.json(result.agents);
        } else {
          res.status(400).json({ error: result.error, details: result.details });
        }
      } catch (error: any) {
        console.error("Agents list error:", error);
        res.status(500).json({ error: error.message || "Failed to list agents" });
      }
    }
  );

  // GET /api/foundry/agents/:agentId - Get a specific Agent
  app.get(
    "/api/foundry/agents/:agentId",
    tokenRequired,
    foundryManagementAccessRequired,
    async (req, res) => {
      try {
        const { agentId } = req.params;
        const hubName = req.query.hubName as string;
        const projectName = req.query.projectName as string;

        if (!hubName || !projectName) {
          return res.status(400).json({
            error: "Missing required query parameters: hubName, projectName"
          });
        }

        const result = await foundryProvisioningService.getFoundryAgent(hubName, projectName, agentId);

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json({ error: result.error, details: result.details });
        }
      } catch (error: any) {
        console.error("Agent get error:", error);
        res.status(500).json({ error: error.message || "Failed to get agent" });
      }
    }
  );

  // POST /api/foundry/agents/:agentId - Update an Agent (attach vector store, change instructions, etc.)
  app.post(
    "/api/foundry/agents/:agentId",
    tokenRequired,
    foundryManagementPermissionRequired("edit"),
    async (req, res) => {
      try {
        const { agentId } = req.params;
        const {
          projectName,
          customSubdomain,
          hubEndpoint,
          name,
          instructions,
          tools,
          tool_resources,
          metadata
        } = req.body;

        if (!projectName) {
          return res.status(400).json({
            error: "Missing required field: projectName"
          });
        }

        if (!customSubdomain && !hubEndpoint) {
          return res.status(400).json({
            error: "Either customSubdomain or hubEndpoint is required"
          });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        console.log(`[API] Updating Foundry Agent: ${agentId}`);
        const result = await foundryProvisioningService.updateFoundryAgent({
          projectName,
          agentId,
          customSubdomain,
          hubEndpoint,
          name,
          instructions,
          tools,
          tool_resources,
          metadata
        });

        if (result.success) {
          const logContext = await getActivityLoggingContext(req);
          await ActivityLogger.log({
            userId: logContext.userId,
            userName: logContext.userName,
            email: logContext.email,
            ipAddress: logContext.ipAddress,
            userAgent: logContext.userAgent,
            action: "FOUNDRY_AGENT_UPDATED" as any,
            actionCategory: "FOUNDRY_AI_MANAGEMENT",
            resource: agentId,
            resourceType: "FOUNDRY_AGENT",
            details: { projectName, customSubdomain, tool_resources },
            organizationId: logContext.organizationId,
            organizationName: logContext.organizationName,
            roleId: logContext.roleId,
            roleName: logContext.roleName,
          });
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error: any) {
        console.error("Agent update error:", error);
        res.status(500).json({ error: error.message || "Failed to update agent" });
      }
    }
  );

  // DELETE /api/foundry/agents/:agentId - Delete an Agent
  app.delete(
    "/api/foundry/agents/:agentId",
    tokenRequired,
    foundryManagementPermissionRequired("delete"),
    async (req, res) => {
      try {
        const { agentId } = req.params;
        const hubName = req.query.hubName as string;
        const projectName = req.query.projectName as string;

        if (!hubName || !projectName) {
          return res.status(400).json({
            error: "Missing required query parameters: hubName, projectName"
          });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        console.log(`[API] Deleting Foundry Agent: ${agentId}`);
        const result = await foundryProvisioningService.deleteFoundryAgent(hubName, projectName, agentId);

        if (result.success) {
          const logContext = await getActivityLoggingContext(req);
          await ActivityLogger.log({
            userId: logContext.userId,
            userName: logContext.userName,
            email: logContext.email,
            ipAddress: logContext.ipAddress,
            userAgent: logContext.userAgent,
            action: "FOUNDRY_AGENT_DELETED" as any,
            actionCategory: "FOUNDRY_AI_MANAGEMENT",
            resource: agentId,
            resourceType: "FOUNDRY_AGENT",
            details: { hubName, projectName },
            organizationId: logContext.organizationId,
            organizationName: logContext.organizationName,
            roleId: logContext.roleId,
            roleName: logContext.roleName,
          });
          res.json({ success: true, message: `Agent ${agentId} deleted successfully` });
        } else {
          res.status(400).json(result);
        }
      } catch (error: any) {
        console.error("Agent deletion error:", error);
        res.status(500).json({ error: error.message || "Failed to delete agent" });
      }
    }
  );

  // POST /api/foundry/attach-tool - Attach a Vector Store to an Agent
  app.post(
    "/api/foundry/attach-tool",
    tokenRequired,
    foundryManagementPermissionRequired("edit"),
    async (req, res) => {
      try {
        const {
          hubName,
          projectName,
          customSubdomain,
          agentId,
          vectorStoreId,
        } = req.body;

        if (!projectName || !agentId || !vectorStoreId) {
          return res.status(400).json({
            error: "Missing required fields: projectName, agentId, vectorStoreId"
          });
        }

        if (!customSubdomain && !hubName) {
          return res.status(400).json({
            error: "Either customSubdomain or hubName is required"
          });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        console.log(`[API] Attaching Vector Store ${vectorStoreId} to Agent ${agentId}`);

        // First, get the current agent to preserve existing tool_resources
        const currentAgent = await foundryProvisioningService.getFoundryAgent(
          hubName || customSubdomain,
          projectName,
          agentId
        );

        // Build the updated tool_resources with the new vector store
        let existingVectorStoreIds: string[] = [];
        if (currentAgent.success && currentAgent.tool_resources?.file_search?.vector_store_ids) {
          existingVectorStoreIds = currentAgent.tool_resources.file_search.vector_store_ids;
        }

        // Add the new vector store if not already attached
        if (!existingVectorStoreIds.includes(vectorStoreId)) {
          existingVectorStoreIds.push(vectorStoreId);
        }

        // Build the tools array - ensure file_search tool is present
        let currentTools = currentAgent.success && currentAgent.tools ? currentAgent.tools : [];
        const hasFileSearchTool = currentTools.some((t: any) => t.type === "file_search");
        if (!hasFileSearchTool) {
          currentTools = [...currentTools, { type: "file_search" }];
        }

        // Update the agent with the new vector store
        const result = await foundryProvisioningService.updateFoundryAgent({
          projectName,
          agentId,
          customSubdomain: customSubdomain || hubName,
          tools: currentTools,
          tool_resources: {
            file_search: {
              vector_store_ids: existingVectorStoreIds
            }
          }
        });

        if (result.success) {
          const logContext = await getActivityLoggingContext(req);
          await ActivityLogger.log({
            userId: logContext.userId,
            userName: logContext.userName,
            email: logContext.email,
            ipAddress: logContext.ipAddress,
            userAgent: logContext.userAgent,
            action: "FOUNDRY_VECTOR_STORE_ATTACHED" as any,
            actionCategory: "FOUNDRY_AI_MANAGEMENT",
            resource: vectorStoreId,
            resourceType: "FOUNDRY_VECTOR_STORE",
            details: { agentId, projectName, customSubdomain, hubName },
            organizationId: logContext.organizationId,
            organizationName: logContext.organizationName,
            roleId: logContext.roleId,
            roleName: logContext.roleName,
          });
          res.json({ success: true, message: `Vector store ${vectorStoreId} attached to agent ${agentId}` });
        } else {
          res.status(400).json(result);
        }
      } catch (error: any) {
        console.error("Attach vector store error:", error);
        res.status(500).json({ error: error.message || "Failed to attach vector store to agent" });
      }
    }
  );

  // ==================== FOUNDRY VECTOR STORE ENDPOINTS ====================

  // POST /api/foundry/vector-stores - Create a Vector Store
  // Updates the existing database record with vector store details if hubName is provided
  app.post(
    "/api/foundry/vector-stores",
    tokenRequired,
    foundryManagementPermissionRequired("add"),
    async (req, res) => {
      try {
        const {
          projectName,
          vectorStoreName,
          customSubdomain,
          hubEndpoint,
          expiresAfterDays,
          metadata,
          hubName // Optional: if provided, updates the database record
        } = req.body;

        if (!projectName || !vectorStoreName) {
          return res.status(400).json({
            error: "Missing required fields: projectName, vectorStoreName"
          });
        }

        if (!customSubdomain && !hubEndpoint) {
          return res.status(400).json({
            error: "Either customSubdomain or hubEndpoint is required"
          });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // Find the existing database record if hubName is provided
        let existingResource = null;
        if (hubName) {
          existingResource = await storage.getFoundryResourceByName(hubName);
          if (existingResource) {
            await storage.updateFoundryResource(existingResource.id, {
              currentStep: "creating_vector_store",
            });
          }
        }

        console.log(`[API] Creating Vector Store: ${vectorStoreName}`);
        const result = await foundryProvisioningService.createVectorStore({
          projectName,
          vectorStoreName,
          customSubdomain,
          hubEndpoint,
          expiresAfterDays,
          metadata
        });

        if (result.success) {
          // Update the database record with vector store details
          if (existingResource) {
            await storage.updateFoundryResource(existingResource.id, {
              vectorStoreId: result.vectorStoreId,
              status: "completed",
              currentStep: "completed",
            });
            console.log(`[API] Updated resource ${existingResource.id} to completed status`);
          }

          const logContext = await getActivityLoggingContext(req, existingResource?.organizationId);
          await ActivityLogger.log({
            userId: logContext.userId,
            userName: logContext.userName,
            email: logContext.email,
            ipAddress: logContext.ipAddress,
            userAgent: logContext.userAgent,
            action: "FOUNDRY_VECTOR_STORE_CREATED" as any,
            actionCategory: "FOUNDRY_AI_MANAGEMENT",
            resource: result.vectorStoreId || vectorStoreName,
            resourceType: "FOUNDRY_VECTOR_STORE",
            details: { projectName, vectorStoreName, customSubdomain, dbResourceId: existingResource?.id },
            organizationId: logContext.organizationId,
            organizationName: logContext.organizationName,
            roleId: logContext.roleId,
            roleName: logContext.roleName,
          });
          res.json({ ...result, dbResourceId: existingResource?.id });
        } else {
          res.status(400).json(result);
        }
      } catch (error: any) {
        console.error("Vector Store creation error:", error);
        res.status(500).json({ error: error.message || "Failed to create vector store" });
      }
    }
  );

  // GET /api/foundry/vector-stores - List Vector Stores in a Project
  app.get(
    "/api/foundry/vector-stores",
    tokenRequired,
    foundryManagementPermissionRequired("view"),
    async (req, res) => {
      try {
        const projectName = req.query.projectName as string;
        const customSubdomain = req.query.customSubdomain as string;
        const hubEndpoint = req.query.hubEndpoint as string;

        if (!projectName) {
          return res.status(400).json({
            error: "Missing required query parameter: projectName"
          });
        }

        if (!customSubdomain && !hubEndpoint) {
          return res.status(400).json({
            error: "Either customSubdomain or hubEndpoint query parameter is required"
          });
        }

        console.log(`[API] Listing Vector Stores in project: ${projectName}`);
        const result = await foundryProvisioningService.listVectorStores({
          projectName,
          customSubdomain,
          hubEndpoint
        });

        if (result.success) {
          // Return just the array for consistency with other list endpoints
          res.json(result.vectorStores || []);
        } else {
          res.status(400).json({ error: result.error, details: result.details });
        }
      } catch (error: any) {
        console.error("Vector Store list error:", error);
        res.status(500).json({ error: error.message || "Failed to list vector stores" });
      }
    }
  );

  // GET /api/foundry/vector-stores/:vectorStoreId - Get a Vector Store by ID
  app.get(
    "/api/foundry/vector-stores/:vectorStoreId",
    tokenRequired,
    foundryManagementPermissionRequired("view"),
    async (req, res) => {
      try {
        const { vectorStoreId } = req.params;
        const projectName = req.query.projectName as string;
        const customSubdomain = req.query.customSubdomain as string;
        const hubEndpoint = req.query.hubEndpoint as string;

        if (!projectName) {
          return res.status(400).json({
            error: "Missing required query parameter: projectName"
          });
        }

        if (!customSubdomain && !hubEndpoint) {
          return res.status(400).json({
            error: "Either customSubdomain or hubEndpoint query parameter is required"
          });
        }

        console.log(`[API] Getting Vector Store: ${vectorStoreId}`);
        const result = await foundryProvisioningService.getVectorStore({
          projectName,
          vectorStoreId,
          customSubdomain,
          hubEndpoint
        });

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error: any) {
        console.error("Vector Store get error:", error);
        res.status(500).json({ error: error.message || "Failed to get vector store" });
      }
    }
  );

  // DELETE /api/foundry/vector-stores/:vectorStoreId - Delete a Vector Store
  app.delete(
    "/api/foundry/vector-stores/:vectorStoreId",
    tokenRequired,
    foundryManagementPermissionRequired("delete"),
    async (req, res) => {
      try {
        const { vectorStoreId } = req.params;
        const projectName = req.query.projectName as string;
        const customSubdomain = req.query.customSubdomain as string;
        const hubEndpoint = req.query.hubEndpoint as string;

        if (!projectName) {
          return res.status(400).json({
            error: "Missing required query parameter: projectName"
          });
        }

        if (!customSubdomain && !hubEndpoint) {
          return res.status(400).json({
            error: "Either customSubdomain or hubEndpoint query parameter is required"
          });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        console.log(`[API] Deleting Vector Store: ${vectorStoreId}`);
        const result = await foundryProvisioningService.deleteVectorStore({
          projectName,
          vectorStoreId,
          customSubdomain,
          hubEndpoint
        });

        if (result.success) {
          const logContext = await getActivityLoggingContext(req);
          await ActivityLogger.log({
            userId: logContext.userId,
            userName: logContext.userName,
            email: logContext.email,
            ipAddress: logContext.ipAddress,
            userAgent: logContext.userAgent,
            action: "FOUNDRY_VECTOR_STORE_DELETED" as any,
            actionCategory: "FOUNDRY_AI_MANAGEMENT",
            resource: vectorStoreId,
            resourceType: "FOUNDRY_VECTOR_STORE",
            details: { projectName, customSubdomain },
            organizationId: logContext.organizationId,
            organizationName: logContext.organizationName,
            roleId: logContext.roleId,
            roleName: logContext.roleName,
          });
          res.json({ success: true, message: `Vector Store ${vectorStoreId} deleted successfully` });
        } else {
          res.status(400).json(result);
        }
      } catch (error: any) {
        console.error("Vector Store deletion error:", error);
        res.status(500).json({ error: error.message || "Failed to delete vector store" });
      }
    }
  );

  // ==================== FOUNDRY FILE OPERATIONS ====================

  // POST /api/foundry/files/import - Import a file from SAS URL
  app.post(
    "/api/foundry/files/import",
    tokenRequired,
    foundryManagementPermissionRequired("add"),
    async (req, res) => {
      try {
        const {
          projectName,
          customSubdomain,
          hubEndpoint,
          contentUrl,
          filename,
          purpose
        } = req.body;

        if (!projectName || !contentUrl || !filename) {
          return res.status(400).json({
            error: "Missing required fields: projectName, contentUrl, filename"
          });
        }

        if (!customSubdomain && !hubEndpoint) {
          return res.status(400).json({
            error: "Either customSubdomain or hubEndpoint is required"
          });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        console.log(`[API] Importing file from URL: ${filename}`);
        const result = await foundryProvisioningService.importFileFromUrl({
          projectName,
          customSubdomain,
          hubEndpoint,
          contentUrl,
          filename,
          purpose
        });

        if (result.success) {
          const logContext = await getActivityLoggingContext(req);
          await ActivityLogger.log({
            userId: logContext.userId,
            userName: logContext.userName,
            email: logContext.email,
            ipAddress: logContext.ipAddress,
            userAgent: logContext.userAgent,
            action: "FOUNDRY_FILE_IMPORTED" as any,
            actionCategory: "FOUNDRY_AI_MANAGEMENT",
            resource: result.fileId || filename,
            resourceType: "FOUNDRY_FILE",
            details: { projectName, filename, customSubdomain },
            organizationId: logContext.organizationId,
            organizationName: logContext.organizationName,
            roleId: logContext.roleId,
            roleName: logContext.roleName,
          });
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error: any) {
        console.error("File import error:", error);
        res.status(500).json({ error: error.message || "Failed to import file" });
      }
    }
  );

  // GET /api/foundry/files/:fileId - Get file status
  app.get(
    "/api/foundry/files/:fileId",
    tokenRequired,
    foundryManagementPermissionRequired("view"),
    async (req, res) => {
      try {
        const { fileId } = req.params;
        const projectName = req.query.projectName as string;
        const customSubdomain = req.query.customSubdomain as string;
        const hubEndpoint = req.query.hubEndpoint as string;

        if (!projectName) {
          return res.status(400).json({
            error: "Missing required query parameter: projectName"
          });
        }

        if (!customSubdomain && !hubEndpoint) {
          return res.status(400).json({
            error: "Either customSubdomain or hubEndpoint query parameter is required"
          });
        }

        console.log(`[API] Getting file status: ${fileId}`);
        const result = await foundryProvisioningService.getFile({
          projectName,
          fileId,
          customSubdomain,
          hubEndpoint
        });

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error: any) {
        console.error("File get error:", error);
        res.status(500).json({ error: error.message || "Failed to get file" });
      }
    }
  );

  // POST /api/foundry/files/batch - Get multiple file details at once (for citation resolution)
  app.post(
    "/api/foundry/files/batch",
    tokenRequired,
    foundryManagementPermissionRequired("view"),
    async (req, res) => {
      try {
        const { fileIds, projectName, customSubdomain, hubEndpoint, organizationId, vectorStoreId } = req.body;

        if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
          return res.status(400).json({
            error: "Missing required field: fileIds (array)"
          });
        }

        let resolvedProjectName = projectName;
        let resolvedSubdomain = customSubdomain;
        let resolvedHubEndpoint = hubEndpoint;
        let resolvedVectorStoreId = vectorStoreId;

        // If organizationId is provided, look up the resource set configuration
        if (organizationId && (!projectName || !customSubdomain)) {
          const userEmail = req.user?.email;
          if (userEmail) {
            // Validate user has access to this organization
            const hasAccess = await storage.validateUserOrganizationAccess(userEmail, organizationId);
            if (!hasAccess) {
              return res.status(403).json({ error: "Access denied to this organization" });
            }
            
            // Get the resource set with its associated foundry resource
            const resourceSetResult = await storage.getFoundryResourceSetWithResourceByOrg(organizationId);
            if (resourceSetResult && resourceSetResult.foundryResource) {
              const resource = resourceSetResult.foundryResource;
              resolvedProjectName = resource.projectName || resolvedProjectName;
              resolvedSubdomain = resource.customSubdomain || resolvedSubdomain;
              // Use the default vector store from resource set if not provided
              if (!resolvedVectorStoreId) {
                resolvedVectorStoreId = resourceSetResult.resourceSet.defaultVectorStoreId || resource.vectorStoreId;
              }
              // Construct hub endpoint from customSubdomain if available
              if (!resolvedHubEndpoint && resolvedSubdomain) {
                resolvedHubEndpoint = `https://${resolvedSubdomain.toLowerCase()}.services.ai.azure.com`;
              }
            }
          }
        }

        if (!resolvedProjectName) {
          return res.status(400).json({
            error: "Missing required field: projectName"
          });
        }

        if (!resolvedSubdomain && !resolvedHubEndpoint) {
          return res.status(400).json({
            error: "Either customSubdomain or hubEndpoint is required"
          });
        }

        console.log(`[API] Batch resolving ${fileIds.length} file IDs to filenames`);

        const results: Record<string, { filename: string; status: string } | null> = {};

        // Check if file IDs look like vector store file references (assistant-XXX format)
        const hasVectorStoreRefs = fileIds.some((id: string) => id.startsWith('assistant-'));
        
        // If we have vector store references and a vector store ID, list vector store files first
        if (hasVectorStoreRefs && resolvedVectorStoreId) {
          console.log(`[API] Detected vector store file references, listing vector store ${resolvedVectorStoreId}`);
          
          const vsFilesResult = await foundryProvisioningService.listVectorStoreFiles({
            projectName: resolvedProjectName,
            vectorStoreId: resolvedVectorStoreId,
            customSubdomain: resolvedSubdomain,
            hubEndpoint: resolvedHubEndpoint
          });
          
          if (vsFilesResult.success && vsFilesResult.files) {
            console.log(`[API] Found ${vsFilesResult.files.length} files in vector store`);
            
            // Build a mapping from vector store file ID to file info
            // Vector store files have 'id' (vs file ID) and may reference the original file
            const vsFileMap = new Map<string, any>();
            for (const vsFile of vsFilesResult.files) {
              vsFileMap.set(vsFile.id, vsFile);
            }
            
            // For each requested file ID, look up in vector store files
            for (const fileId of fileIds) {
              const vsFile = vsFileMap.get(fileId);
              if (vsFile) {
                // Vector store file found - try to get original filename
                // The vector store file may have a 'file_id' field referencing the original project file
                const originalFileId = vsFile.file_id;
                if (originalFileId) {
                  try {
                    const fileResult = await foundryProvisioningService.getFile({
                      projectName: resolvedProjectName,
                      fileId: originalFileId,
                      customSubdomain: resolvedSubdomain,
                      hubEndpoint: resolvedHubEndpoint
                    });
                    if (fileResult.success && fileResult.file?.filename) {
                      results[fileId] = { 
                        filename: fileResult.file.filename, 
                        status: vsFile.status || fileResult.file.status 
                      };
                      continue;
                    }
                  } catch (e) {
                    console.log(`[API] Could not resolve original file ${originalFileId}`);
                  }
                }
                // Use vector store file's own filename if available
                if (vsFile.filename) {
                  results[fileId] = { filename: vsFile.filename, status: vsFile.status };
                  continue;
                }
              }
              results[fileId] = null;
            }
            
            res.json({ success: true, files: results });
            return;
          } else {
            console.log(`[API] Could not list vector store files: ${vsFilesResult.error}`);
          }
        }

        // Fallback: Try to resolve as regular project files
        const batchSize = 10;
        for (let i = 0; i < fileIds.length; i += batchSize) {
          const batch = fileIds.slice(i, i + batchSize);
          const promises = batch.map(async (fileId: string) => {
            try {
              const result = await foundryProvisioningService.getFile({
                projectName: resolvedProjectName,
                fileId,
                customSubdomain: resolvedSubdomain,
                hubEndpoint: resolvedHubEndpoint
              });
              if (result.success && result.file) {
                return { fileId, filename: result.file.filename, status: result.file.status };
              }
              return { fileId, filename: null, status: null };
            } catch {
              return { fileId, filename: null, status: null };
            }
          });

          const batchResults = await Promise.all(promises);
          batchResults.forEach((r) => {
            if (r.filename) {
              results[r.fileId] = { filename: r.filename, status: r.status };
            } else {
              results[r.fileId] = null;
            }
          });
        }

        res.json({ success: true, files: results });
      } catch (error: any) {
        console.error("Batch file info error:", error);
        res.status(500).json({ error: error.message || "Failed to get file info" });
      }
    }
  );

  // POST /api/foundry/vector-stores/:vectorStoreId/files - Attach file to vector store
  app.post(
    "/api/foundry/vector-stores/:vectorStoreId/files",
    tokenRequired,
    foundryManagementPermissionRequired("add"),
    async (req, res) => {
      try {
        const { vectorStoreId } = req.params;
        const {
          projectName,
          customSubdomain,
          hubEndpoint,
          fileId,
          chunkingStrategy
        } = req.body;

        if (!projectName || !fileId) {
          return res.status(400).json({
            error: "Missing required fields: projectName, fileId"
          });
        }

        if (!customSubdomain && !hubEndpoint) {
          return res.status(400).json({
            error: "Either customSubdomain or hubEndpoint is required"
          });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        console.log(`[API] Attaching file ${fileId} to vector store ${vectorStoreId}`);
        const result = await foundryProvisioningService.attachFileToVectorStore({
          projectName,
          vectorStoreId,
          fileId,
          customSubdomain,
          hubEndpoint,
          chunkingStrategy
        });

        if (result.success) {
          const logContext = await getActivityLoggingContext(req);
          await ActivityLogger.log({
            userId: logContext.userId,
            userName: logContext.userName,
            email: logContext.email,
            ipAddress: logContext.ipAddress,
            userAgent: logContext.userAgent,
            action: "FOUNDRY_FILE_ATTACHED_TO_VECTOR_STORE" as any,
            actionCategory: "FOUNDRY_AI_MANAGEMENT",
            resource: fileId,
            resourceType: "FOUNDRY_VECTOR_STORE_FILE",
            details: { projectName, vectorStoreId, fileId, customSubdomain },
            organizationId: logContext.organizationId,
            organizationName: logContext.organizationName,
            roleId: logContext.roleId,
            roleName: logContext.roleName,
          });
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error: any) {
        console.error("File attachment error:", error);
        res.status(500).json({ error: error.message || "Failed to attach file to vector store" });
      }
    }
  );

  // POST /api/foundry/vector-stores/:vectorStoreId/files/from-url - Add file from URL directly to vector store (WORKING)
  // This streams the file from SAS URL, uploads via multipart, then attaches to vector store
  app.post(
    "/api/foundry/vector-stores/:vectorStoreId/files/from-url",
    tokenRequired,
    foundryManagementPermissionRequired("add"),
    async (req, res) => {
      try {
        const { vectorStoreId } = req.params;
        const {
          projectName,
          customSubdomain,
          hubEndpoint,
          contentUrl,
          filename,
          mimeType,
          chunkingStrategy
        } = req.body;

        if (!projectName || !contentUrl || !filename) {
          return res.status(400).json({
            error: "Missing required fields: projectName, contentUrl, filename"
          });
        }

        if (!customSubdomain && !hubEndpoint) {
          return res.status(400).json({
            error: "Either customSubdomain or hubEndpoint is required"
          });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        console.log(`[API] Adding file from URL to vector store ${vectorStoreId}`);
        console.log(`[API] Filename: ${filename}, MimeType: ${mimeType || 'application/pdf'}`);
        
        const result = await foundryProvisioningService.addFileToVectorStoreFromUrl({
          projectName,
          vectorStoreId,
          contentUrl,
          filename,
          mimeType,
          customSubdomain,
          hubEndpoint,
          chunkingStrategy
        });

        if (result.success) {
          const logContext = await getActivityLoggingContext(req);
          await ActivityLogger.log({
            userId: logContext.userId,
            userName: logContext.userName,
            email: logContext.email,
            ipAddress: logContext.ipAddress,
            userAgent: logContext.userAgent,
            action: "FOUNDRY_FILE_ADDED_FROM_URL" as any,
            actionCategory: "FOUNDRY_AI_MANAGEMENT",
            resource: result.vectorStoreFileId || filename,
            resourceType: "FOUNDRY_VECTOR_STORE_FILE",
            details: { projectName, vectorStoreId, filename, fileId: result.fileId, customSubdomain },
            organizationId: logContext.organizationId,
            organizationName: logContext.organizationName,
            roleId: logContext.roleId,
            roleName: logContext.roleName,
          });
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error: any) {
        console.error("Add file from URL error:", error);
        res.status(500).json({ error: error.message || "Failed to add file from URL to vector store" });
      }
    }
  );

  // GET /api/foundry/vector-stores/:vectorStoreId/files - List files in vector store
  app.get(
    "/api/foundry/vector-stores/:vectorStoreId/files",
    tokenRequired,
    foundryManagementPermissionRequired("view"),
    async (req, res) => {
      try {
        const { vectorStoreId } = req.params;
        const projectName = req.query.projectName as string;
        const customSubdomain = req.query.customSubdomain as string;
        const hubEndpoint = req.query.hubEndpoint as string;

        if (!projectName) {
          return res.status(400).json({
            error: "Missing required query parameter: projectName"
          });
        }

        if (!customSubdomain && !hubEndpoint) {
          return res.status(400).json({
            error: "Either customSubdomain or hubEndpoint query parameter is required"
          });
        }

        console.log(`[API] Listing files in vector store: ${vectorStoreId}`);
        const result = await foundryProvisioningService.listVectorStoreFiles({
          projectName,
          vectorStoreId,
          customSubdomain,
          hubEndpoint
        });

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error: any) {
        console.error("Vector store files list error:", error);
        res.status(500).json({ error: error.message || "Failed to list vector store files" });
      }
    }
  );

  // GET /api/foundry/vector-stores/:vectorStoreId/files/:fileId - Get vector store file status
  app.get(
    "/api/foundry/vector-stores/:vectorStoreId/files/:fileId",
    tokenRequired,
    foundryManagementPermissionRequired("view"),
    async (req, res) => {
      try {
        const { vectorStoreId, fileId } = req.params;
        const projectName = req.query.projectName as string;
        const customSubdomain = req.query.customSubdomain as string;
        const hubEndpoint = req.query.hubEndpoint as string;

        if (!projectName) {
          return res.status(400).json({
            error: "Missing required query parameter: projectName"
          });
        }

        if (!customSubdomain && !hubEndpoint) {
          return res.status(400).json({
            error: "Either customSubdomain or hubEndpoint query parameter is required"
          });
        }

        console.log(`[API] Getting vector store file status: ${fileId}`);
        const result = await foundryProvisioningService.getVectorStoreFile({
          projectName,
          vectorStoreId,
          fileId,
          customSubdomain,
          hubEndpoint
        });

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error: any) {
        console.error("Vector store file get error:", error);
        res.status(500).json({ error: error.message || "Failed to get vector store file" });
      }
    }
  );

  // DELETE /api/foundry/vector-stores/:vectorStoreId/files/:fileId - Delete file from vector store
  app.delete(
    "/api/foundry/vector-stores/:vectorStoreId/files/:fileId",
    tokenRequired,
    foundryManagementPermissionRequired("delete"),
    async (req, res) => {
      try {
        const { vectorStoreId, fileId } = req.params;
        const projectName = req.query.projectName as string;
        const customSubdomain = req.query.customSubdomain as string;
        const hubEndpoint = req.query.hubEndpoint as string;

        if (!projectName) {
          return res.status(400).json({
            error: "Missing required query parameter: projectName"
          });
        }

        if (!customSubdomain && !hubEndpoint) {
          return res.status(400).json({
            error: "Either customSubdomain or hubEndpoint query parameter is required"
          });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        console.log(`[API] Deleting file ${fileId} from vector store: ${vectorStoreId}`);
        const result = await foundryProvisioningService.deleteVectorStoreFile({
          projectName,
          vectorStoreId,
          fileId,
          customSubdomain,
          hubEndpoint
        });

        if (result.success) {
          const logContext = await getActivityLoggingContext(req);
          await ActivityLogger.log({
            userId: logContext.userId,
            userName: logContext.userName,
            email: logContext.email,
            ipAddress: logContext.ipAddress,
            userAgent: logContext.userAgent,
            action: "FOUNDRY_FILE_DELETED_FROM_VECTOR_STORE" as any,
            actionCategory: "FOUNDRY_AI_MANAGEMENT",
            resource: fileId,
            resourceType: "FOUNDRY_VECTOR_STORE_FILE",
            details: { projectName, vectorStoreId, fileId, customSubdomain },
            organizationId: logContext.organizationId,
            organizationName: logContext.organizationName,
            roleId: logContext.roleId,
            roleName: logContext.roleName,
          });
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error: any) {
        console.error("Vector store file delete error:", error);
        res.status(500).json({ error: error.message || "Failed to delete vector store file" });
      }
    }
  );

  // ==================== FOUNDRY ACTION: ADD/REMOVE FILES WITH METADATA ====================

  // POST /api/foundry/vector-store-files - Add file from blob storage to vector store with metadata tagging
  app.post(
    "/api/foundry/vector-store-files",
    tokenRequired,
    foundryManagementPermissionRequired("add"),
    async (req, res) => {
      try {
        const {
          organizationId,
          filePath,
          vectorStoreId,
          customSubdomain,
          hubName,
          projectName,
          agentId,
        } = req.body;

        if (!organizationId || !filePath || !vectorStoreId || !customSubdomain || !projectName) {
          return res.status(400).json({
            error: "Missing required fields: organizationId, filePath, vectorStoreId, customSubdomain, projectName"
          });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // Verify user has access to this organization
        const hasAccess = await storage.validateUserOrganizationAccess(userEmail, organizationId);
        if (!hasAccess) {
          console.log(`[FOUNDRY-ACTION] Access denied: User ${userEmail} does not have access to organization ${organizationId}`);
          return res.status(403).json({ error: "Access denied to this organization" });
        }

        console.log(`[API] Adding file to vector store: ${filePath} -> ${vectorStoreId}`);

        // Step 1: Get storage account for organization
        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res.status(404).json({ error: "No storage account configured for this organization" });
        }

        // Step 2: Get Azure credentials and storage account keys
        if (!subscriptionId || !storageAccount.resourceGroupName || !credential) {
          return res.status(500).json({ error: "Azure credentials not configured" });
        }

        const storageClient = new StorageManagementClient(credential, subscriptionId);
        const keys = await storageClient.storageAccounts.listKeys(
          storageAccount.resourceGroupName,
          storageAccount.name
        );

        if (!keys.keys || keys.keys.length === 0 || !keys.keys[0].value) {
          return res.status(500).json({ error: "No storage account keys available" });
        }

        const accountKey = keys.keys[0].value;

        // Step 3: Generate SAS URL for the file
        const sharedKeyCredential = new StorageSharedKeyCredential(storageAccount.name, accountKey);
        const blobServiceClient = new BlobServiceClient(
          `https://${storageAccount.name}.blob.core.windows.net`,
          sharedKeyCredential
        );
        const containerClient = blobServiceClient.getContainerClient(storageAccount.containerName);
        const blobClient = containerClient.getBlobClient(filePath);

        // Check if file exists
        const exists = await blobClient.exists();
        if (!exists) {
          return res.status(404).json({ error: "File not found in storage" });
        }

        // Generate SAS URL for downloading
        const sasToken = generateBlobSASQueryParameters({
          containerName: storageAccount.containerName,
          blobName: filePath,
          permissions: BlobSASPermissions.parse("r"),
          startsOn: new Date(Date.now() - 5 * 60 * 1000), // Account for clock skew
          expiresOn: new Date(Date.now() + 75 * 60 * 1000), // 1 hour + 15 minutes buffer
        }, sharedKeyCredential).toString();

        const sasUrl = `${blobClient.url}?${sasToken}`;
        const filename = filePath.split("/").pop() || filePath;

        // Step 3: Add file to vector store using the from-url method
        const projectNameOnly = projectName.includes("/")
          ? projectName.split("/").pop() || projectName
          : projectName;

        const addResult = await foundryProvisioningService.addFileToVectorStoreFromUrl({
          projectName: projectNameOnly,
          vectorStoreId,
          contentUrl: sasUrl,
          filename,
          customSubdomain,
        });

        if (!addResult.success) {
          return res.status(400).json({ error: addResult.error || "Failed to add file to vector store" });
        }

        // Step 4: Update blob metadata to track vector store association
        const blockBlobClient = containerClient.getBlockBlobClient(filePath);
        const properties = await blockBlobClient.getProperties();
        const existingMetadata = properties.metadata || {};

        // Parse existing foundry vector stores metadata
        let vectorStores: any[] = [];
        if (existingMetadata.foundryvectorstores) {
          try {
            vectorStores = JSON.parse(existingMetadata.foundryvectorstores);
          } catch {
            vectorStores = [];
          }
        }

        // Add new vector store entry if not already present
        const newEntry = {
          vectorStoreId,
          hubName,
          projectName: projectNameOnly,
          agentId,
          fileId: addResult.fileId,
          addedAt: new Date().toISOString(),
          addedBy: userEmail,
        };

        const existingIndex = vectorStores.findIndex((s: any) => s.vectorStoreId === vectorStoreId);
        if (existingIndex >= 0) {
          vectorStores[existingIndex] = newEntry;
        } else {
          vectorStores.push(newEntry);
        }

        // Update blob metadata
        await blockBlobClient.setMetadata({
          ...existingMetadata,
          foundryvectorstores: JSON.stringify(vectorStores),
        });

        // Log activity
        const logContext = await getActivityLoggingContext(req, organizationId);
        await ActivityLogger.log({
          userId: logContext.userId,
          userName: logContext.userName,
          email: logContext.email,
          ipAddress: logContext.ipAddress,
          userAgent: logContext.userAgent,
          organizationId: logContext.organizationId,
          organizationName: logContext.organizationName,
          roleId: logContext.roleId,
          roleName: logContext.roleName,
          action: "FOUNDRY_FILE_ADDED_TO_VECTOR_STORE" as any,
          actionCategory: "FOUNDRY_AI_MANAGEMENT",
          resource: filePath,
          resourceType: "FOUNDRY_VECTOR_STORE" as any,
          details: {
            vectorStoreId,
            hubName,
            projectName: projectNameOnly,
            agentId,
            fileId: addResult.fileId,
          },
        });

        res.json({
          success: true,
          message: "File added to vector store successfully",
          fileId: addResult.fileId,
          vectorStoreId,
          filePath,
        });
      } catch (error: any) {
        console.error("Add file to vector store error:", error);
        res.status(500).json({ error: error.message || "Failed to add file to vector store" });
      }
    }
  );

  // DELETE /api/foundry/vector-store-files - Remove file from vector store and update blob metadata
  app.delete(
    "/api/foundry/vector-store-files",
    tokenRequired,
    foundryManagementPermissionRequired("delete"),
    async (req, res) => {
      try {
        const {
          organizationId,
          filePath,
          vectorStoreId,
          customSubdomain,
          hubName,
          projectName,
          agentId,
        } = req.body;

        if (!organizationId || !filePath || !vectorStoreId || !customSubdomain || !projectName) {
          return res.status(400).json({
            error: "Missing required fields: organizationId, filePath, vectorStoreId, customSubdomain, projectName"
          });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // Verify user has access to this organization
        const hasAccess = await storage.validateUserOrganizationAccess(userEmail, organizationId);
        if (!hasAccess) {
          console.log(`[FOUNDRY-ACTION] Access denied: User ${userEmail} does not have access to organization ${organizationId}`);
          return res.status(403).json({ error: "Access denied to this organization" });
        }

        console.log(`[API] Removing file from vector store: ${filePath} <- ${vectorStoreId}`);

        // Step 1: Get storage account for organization
        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res.status(404).json({ error: "No storage account configured for this organization" });
        }

        // Step 2: Get Azure credentials and storage account keys
        if (!subscriptionId || !storageAccount.resourceGroupName || !credential) {
          return res.status(500).json({ error: "Azure credentials not configured" });
        }

        const storageClient = new StorageManagementClient(credential, subscriptionId);
        const keys = await storageClient.storageAccounts.listKeys(
          storageAccount.resourceGroupName,
          storageAccount.name
        );

        if (!keys.keys || keys.keys.length === 0 || !keys.keys[0].value) {
          return res.status(500).json({ error: "No storage account keys available" });
        }

        const accountKey = keys.keys[0].value;

        // Step 3: Get blob metadata to find the fileId
        const sharedKeyCredential = new StorageSharedKeyCredential(storageAccount.name, accountKey);
        const blobServiceClient = new BlobServiceClient(
          `https://${storageAccount.name}.blob.core.windows.net`,
          sharedKeyCredential
        );
        const containerClient = blobServiceClient.getContainerClient(storageAccount.containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(filePath);

        // Check if file exists
        const exists = await blockBlobClient.exists();
        if (!exists) {
          return res.status(404).json({ error: "File not found in storage" });
        }

        // Get existing metadata
        const properties = await blockBlobClient.getProperties();
        const existingMetadata = properties.metadata || {};

        // Parse existing foundry vector stores metadata
        let vectorStores: any[] = [];
        if (existingMetadata.foundryvectorstores) {
          try {
            vectorStores = JSON.parse(existingMetadata.foundryvectorstores);
          } catch {
            vectorStores = [];
          }
        }

        // Find the vector store entry to get fileId
        const storeEntry = vectorStores.find((s: any) => s.vectorStoreId === vectorStoreId);
        if (!storeEntry || !storeEntry.fileId) {
          return res.status(404).json({ error: "File not found in this vector store" });
        }

        const projectNameOnly = projectName.includes("/")
          ? projectName.split("/").pop() || projectName
          : projectName;

        // Step 3: Delete file from vector store
        const deleteResult = await foundryProvisioningService.deleteVectorStoreFile({
          projectName: projectNameOnly,
          vectorStoreId,
          fileId: storeEntry.fileId,
          customSubdomain,
        });

        if (!deleteResult.success) {
          return res.status(400).json({ error: deleteResult.error || "Failed to remove file from vector store" });
        }

        // Step 4: Update blob metadata to remove vector store association
        const updatedVectorStores = vectorStores.filter((s: any) => s.vectorStoreId !== vectorStoreId);

        if (updatedVectorStores.length > 0) {
          await blockBlobClient.setMetadata({
            ...existingMetadata,
            foundryvectorstores: JSON.stringify(updatedVectorStores),
          });
        } else {
          // Remove the metadata key entirely if no vector stores left
          const { foundryvectorstores, ...cleanMetadata } = existingMetadata;
          await blockBlobClient.setMetadata(cleanMetadata);
        }

        // Log activity
        const logContext2 = await getActivityLoggingContext(req, organizationId);
        await ActivityLogger.log({
          userId: logContext2.userId,
          userName: logContext2.userName,
          email: logContext2.email,
          ipAddress: logContext2.ipAddress,
          userAgent: logContext2.userAgent,
          organizationId: logContext2.organizationId,
          organizationName: logContext2.organizationName,
          roleId: logContext2.roleId,
          roleName: logContext2.roleName,
          action: "FOUNDRY_FILE_REMOVED_FROM_VECTOR_STORE" as any,
          actionCategory: "FOUNDRY_AI_MANAGEMENT",
          resource: filePath,
          resourceType: "FOUNDRY_VECTOR_STORE" as any,
          details: {
            vectorStoreId,
            hubName,
            projectName: projectNameOnly,
            agentId,
            fileId: storeEntry.fileId,
          },
        });

        res.json({
          success: true,
          message: "File removed from vector store successfully",
          vectorStoreId,
          filePath,
        });
      } catch (error: any) {
        console.error("Remove file from vector store error:", error);
        res.status(500).json({ error: error.message || "Failed to remove file from vector store" });
      }
    }
  );

  // POST /api/foundry/provision - Full provisioning workflow (Hub + Project + optional Model + Agent + Vector Store)
  // Uses incremental provisioning to prevent orphaned Azure resources
  // Each step updates the database immediately after successful Azure resource creation
  app.post(
    "/api/foundry/provision",
    tokenRequired,
    foundryManagementPermissionRequired("add"),
    async (req, res) => {
      try {
        const {
          resourceName,
          resourceGroup,
          location,
          projectName,
          agentName,
          createVectorStore,
          deployModel,
          modelName,
          modelVersion,
          organizationId
        } = req.body;

        if (!resourceName || !resourceGroup || !location) {
          return res.status(400).json({
            error: "Missing required fields: resourceName, resourceGroup, location"
          });
        }

        if (!organizationId) {
          return res.status(400).json({
            error: "Organization ID is required"
          });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // Check for existing resource with the same name to prevent duplicates
        const existingResource = await storage.getFoundryResourceByName(resourceName);
        if (existingResource) {
          return res.status(409).json({
            error: `A Foundry resource named "${resourceName}" already exists`,
            existingResourceId: existingResource.id,
            existingResource
          });
        }

        const user = await storage.getUserByEmail(userEmail);

        // Create the foundry resource record in the database FIRST with status "draft"
        // This ensures the record exists before any Azure resources are created
        const resource = await storage.createFoundryResource({
          organizationId: parseInt(organizationId),
          resourceName,
          resourceGroup,
          location,
          projectName: projectName || undefined,
          hubName: resourceName,
          customSubdomain: resourceName.toLowerCase(),
          createdByUserId: user?.id,
          status: "draft",
          currentStep: "hub",
          provisioningStartedAt: new Date(),
        });

        console.log(`[API] Starting incremental provisioning workflow for: ${resourceName} (DB ID: ${resource.id})`);

        const logContext = await getActivityLoggingContext(req, parseInt(organizationId));
        await ActivityLogger.log({
          userId: logContext.userId,
          userName: logContext.userName,
          email: logContext.email,
          ipAddress: logContext.ipAddress,
          userAgent: logContext.userAgent,
          action: ActivityActions.CREATE_FOUNDRY_RESOURCE,
          actionCategory: "FOUNDRY_AI_MANAGEMENT",
          resource: resourceName,
          resourceType: "FOUNDRY_RESOURCE",
          details: { resourceId: resource.id, resourceGroup, location, status: "draft" },
          organizationId: logContext.organizationId,
          organizationName: logContext.organizationName,
          roleId: logContext.roleId,
          roleName: logContext.roleName,
        });

        // Callback to update database after each step completes
        const onStepComplete = async (
          step: 'hub' | 'project' | 'agent' | 'vector_store',
          data: {
            status: 'hub_created' | 'project_created' | 'agent_created' | 'vector_store_created' | 'completed' | 'failed';
            resourceId?: string;
            projectId?: string;
            projectName?: string;
            projectEndpoint?: string;
            agentId?: string;
            agentName?: string;
            vectorStoreId?: string;
            error?: string;
          }
        ) => {
          console.log(`[API] Step "${step}" completed with status: ${data.status}`);
          
          const updateData: any = {
            status: data.status,
            currentStep: step,
          };

          if (data.resourceId) updateData.resourceId = data.resourceId;
          if (data.projectId) updateData.projectId = data.projectId;
          if (data.projectName) updateData.projectName = data.projectName;
          if (data.projectEndpoint) updateData.projectEndpoint = data.projectEndpoint;
          if (data.agentId) updateData.agentId = data.agentId;
          if (data.agentName) updateData.agentName = data.agentName;
          if (data.vectorStoreId) updateData.vectorStoreId = data.vectorStoreId;
          if (data.error) updateData.lastError = data.error;
          if (data.status === 'completed' || data.status === 'failed') {
            updateData.provisioningCompletedAt = new Date();
          }

          await storage.updateFoundryResource(resource.id, updateData);

          await ActivityLogger.log({
            userId: logContext.userId,
            userName: logContext.userName,
            email: logContext.email,
            ipAddress: logContext.ipAddress,
            userAgent: logContext.userAgent,
            action: `FOUNDRY_PROVISION_STEP_${step.toUpperCase()}` as any,
            actionCategory: "FOUNDRY_AI_MANAGEMENT",
            resource: resourceName,
            resourceType: "FOUNDRY_RESOURCE",
            details: { dbResourceId: resource.id, step, ...data },
            organizationId: logContext.organizationId,
            organizationName: logContext.organizationName,
            roleId: logContext.roleId,
            roleName: logContext.roleName,
          });
        };

        // Use incremental provisioning that updates DB after each step
        const result = await foundryProvisioningService.provisionFoundryResourcesIncremental(
          {
            resourceName,
            resourceGroup,
            location,
            projectName,
            agentName,
            createVectorStore,
            deployModel,
            modelName,
            modelVersion
          },
          onStepComplete
        );

        // Fetch the latest resource state from the database
        const updatedResource = await storage.getFoundryResource(resource.id);

        if (result.success) {
          await ActivityLogger.log({
            userId: logContext.userId,
            userName: logContext.userName,
            email: logContext.email,
            ipAddress: logContext.ipAddress,
            userAgent: logContext.userAgent,
            action: "FOUNDRY_FULL_PROVISION" as any,
            actionCategory: "FOUNDRY_AI_MANAGEMENT",
            resource: resourceName,
            resourceType: "FOUNDRY_RESOURCE",
            details: {
              dbResourceId: resource.id,
              resourceId: result.resourceId,
              projectId: result.projectId,
              agentId: result.agentId,
              vectorStoreId: result.vectorStoreId
            },
            organizationId: logContext.organizationId,
            organizationName: logContext.organizationName,
            roleId: logContext.roleId,
            roleName: logContext.roleName,
          });

          res.status(201).json({
            ...result,
            dbResourceId: resource.id,
            resource: updatedResource
          });
        } else {
          // Provisioning failed but partial resources may exist
          // The database already has the partial state from the onStepComplete callbacks
          res.status(400).json({
            ...result,
            dbResourceId: resource.id,
            resource: updatedResource,
            message: "Provisioning failed but partial resources may have been created. Check the Resources tab to delete them."
          });
        }
      } catch (error: any) {
        console.error("Full provisioning error:", error);
        res.status(500).json({ error: error.message || "Failed to provision Foundry resources" });
      }
    }
  );

  // DELETE /api/foundry/resources/:id/partial - Delete partial/orphaned resources from Azure and DB
  // This cleans up resources in reverse dependency order: Agent → Vector Store → Project → Hub → DB record
  app.delete(
    "/api/foundry/resources/:id/partial",
    tokenRequired,
    foundryManagementPermissionRequired("delete"),
    async (req, res) => {
      try {
        const resourceId = parseInt(req.params.id);
        if (isNaN(resourceId)) {
          return res.status(400).json({ error: "Invalid resource ID" });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // Fetch the resource to get its current state
        const resource = await storage.getFoundryResource(resourceId);
        if (!resource) {
          return res.status(404).json({ error: "Resource not found" });
        }

        // Check if resource is linked to any resource sets
        const linkedOrgsCount = await storage.countOrganizationsLinkedToResource(resourceId);
        if (linkedOrgsCount > 0) {
          console.log(`[FOUNDRY] Cannot delete resource ${resourceId}: linked to ${linkedOrgsCount} organization(s) via resource sets`);
          return res.status(400).json({ 
            error: `Cannot delete this Foundry resource. It is currently linked to ${linkedOrgsCount} organization(s) via Resource Sets. Please delete the associated Resource Set(s) first.` 
          });
        }

        console.log(`[API] Deleting partial Foundry resource: ${resource.resourceName} (status: ${resource.status})`);

        // Delete Azure resources in reverse dependency order
        const deleteResult = await foundryProvisioningService.deletePartialFoundryResources({
          resourceGroup: resource.resourceGroup,
          hubName: resource.hubName || resource.resourceName,
          projectName: resource.projectName || undefined,
          agentId: resource.agentId || undefined,
          vectorStoreId: resource.vectorStoreId || undefined,
          customSubdomain: resource.customSubdomain || resource.resourceName.toLowerCase()
        });

        // Delete the database record regardless of Azure cleanup results
        await storage.deleteFoundryResource(resourceId);

        const logContext = await getActivityLoggingContext(req, resource.organizationId);
        await ActivityLogger.log({
          userId: logContext.userId,
          userName: logContext.userName,
          email: logContext.email,
          ipAddress: logContext.ipAddress,
          userAgent: logContext.userAgent,
          action: "FOUNDRY_PARTIAL_RESOURCE_DELETED" as any,
          actionCategory: "FOUNDRY_AI_MANAGEMENT",
          resource: resource.resourceName,
          resourceType: "FOUNDRY_RESOURCE",
          details: {
            resourceId,
            previousStatus: resource.status,
            deletedAzureResources: deleteResult.deletedResources,
            azureCleanupErrors: deleteResult.errors
          },
          organizationId: logContext.organizationId,
          organizationName: logContext.organizationName,
          roleId: logContext.roleId,
          roleName: logContext.roleName,
        });

        res.json({
          success: true,
          message: "Resource deleted successfully",
          deletedAzureResources: deleteResult.deletedResources,
          azureCleanupErrors: deleteResult.errors
        });
      } catch (error: any) {
        console.error("Delete partial resource error:", error);
        res.status(500).json({ error: error.message || "Failed to delete partial resource" });
      }
    }
  );

  // ==================== FOUNDRY CHAT PLAYGROUND ====================

  // POST /api/foundry/chat/threads - Create a new chat thread
  app.post(
    "/api/foundry/chat/threads",
    tokenRequired,
    foundryManagementPermissionRequired("view"),
    async (req, res) => {
      try {
        let { projectName, customSubdomain, hubEndpoint, organizationId } = req.body;

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // If organizationId is provided, fetch config from resource set
        if (organizationId) {
          const orgId = parseInt(organizationId);
          if (isNaN(orgId)) {
            return res.status(400).json({ error: "Invalid organization ID" });
          }

          // Validate user has access to this org
          const userOrgIds = await storage.getUserOrganizationIds(userEmail);
          if (!userOrgIds.includes(orgId)) {
            return res.status(403).json({ error: "Access denied to this organization" });
          }

          const result = await storage.getFoundryResourceSetWithResourceByOrg(orgId);
          if (!result) {
            return res.status(404).json({ error: "No Foundry resource set configured for this organization" });
          }

          const { resourceSet, foundryResource } = result;
          projectName = foundryResource.projectName;
          // Build customSubdomain from foundryResource's projectEndpoint or resourceName
          customSubdomain = foundryResource.projectEndpoint 
            ? new URL(foundryResource.projectEndpoint).hostname.split('.')[0]
            : foundryResource.resourceName;
          console.log(`[CHAT] Using org ${orgId} resource set: ${resourceSet.name}, project: ${projectName}`);
        }

        if (!projectName) {
          return res.status(400).json({ error: "Missing required field: projectName" });
        }

        if (!customSubdomain && !hubEndpoint) {
          return res.status(400).json({ error: "Either customSubdomain or hubEndpoint is required" });
        }

        // Extract just the project name if it comes as "hubName/projectName"
        const projectNameOnly = projectName.includes("/") 
          ? projectName.split("/").pop() || projectName
          : projectName;
        
        console.log(`[CHAT] Creating new thread for project: ${projectNameOnly} (original: ${projectName})`);

        const token = await foundryProvisioningService.getAIAccessToken();
        const apiVersion = "2025-05-01";
        
        let baseEndpoint: string;
        if (hubEndpoint) {
          baseEndpoint = hubEndpoint.replace(/\/$/, '');
        } else {
          baseEndpoint = `https://${customSubdomain!.toLowerCase()}.services.ai.azure.com`;
        }

        const url = `${baseEndpoint}/api/projects/${encodeURIComponent(projectNameOnly)}/threads?api-version=${apiVersion}`;

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({})
        });

        const responseText = await response.text();
        let responseData: any;
        try {
          responseData = JSON.parse(responseText);
        } catch {
          responseData = { rawResponse: responseText };
        }

        if (!response.ok) {
          console.error(`[CHAT] Thread creation failed:`, responseData);
          return res.status(response.status).json({ 
            error: responseData.error?.message || "Failed to create thread",
            details: responseData 
          });
        }

        console.log(`[CHAT] Thread created: ${responseData.id}`);
        res.json({ 
          success: true, 
          threadId: responseData.id,
          createdAt: responseData.created_at
        });
      } catch (error: any) {
        console.error("Chat thread creation error:", error);
        res.status(500).json({ error: error.message || "Failed to create chat thread" });
      }
    }
  );

  // POST /api/foundry/chat/files - Upload a file for chat playground
  app.post(
    "/api/foundry/chat/files",
    tokenRequired,
    foundryManagementPermissionRequired("view"),
    upload.single("file"),
    async (req, res) => {
      try {
        let { projectName, customSubdomain, hubEndpoint, organizationId } = req.body;
        const file = req.file;

        if (!file) {
          return res.status(400).json({ error: "No file provided" });
        }

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // If organizationId is provided, fetch config from resource set
        if (organizationId) {
          const orgId = parseInt(organizationId);
          if (isNaN(orgId)) {
            return res.status(400).json({ error: "Invalid organization ID" });
          }

          const userOrgIds = await storage.getUserOrganizationIds(userEmail);
          if (!userOrgIds.includes(orgId)) {
            return res.status(403).json({ error: "Access denied to this organization" });
          }

          const result = await storage.getFoundryResourceSetWithResourceByOrg(orgId);
          if (!result) {
            return res.status(404).json({ error: "No Foundry resource set configured for this organization" });
          }

          const { resourceSet, foundryResource } = result;
          projectName = foundryResource.projectName;
          customSubdomain = foundryResource.projectEndpoint 
            ? new URL(foundryResource.projectEndpoint).hostname.split('.')[0]
            : foundryResource.resourceName;
          console.log(`[CHAT] Using org ${orgId} resource set for file upload: ${resourceSet.name}`);
        }

        if (!projectName) {
          return res.status(400).json({ error: "Missing required field: projectName" });
        }

        if (!customSubdomain && !hubEndpoint) {
          return res.status(400).json({ error: "Either customSubdomain or hubEndpoint is required" });
        }

        // Extract just the project name if it comes as "hubName/projectName"
        const projectNameOnly = projectName.includes("/") 
          ? projectName.split("/").pop() || projectName
          : projectName;

        console.log(`[CHAT] Uploading file for chat: ${file.originalname} (${file.size} bytes)`);
        console.log(`[CHAT] Project: ${projectNameOnly}, User: ${userEmail}`);

        const result = await foundryProvisioningService.uploadFileDirectly({
          projectName: projectNameOnly,
          customSubdomain,
          hubEndpoint,
          fileBuffer: file.buffer,
          filename: file.originalname,
          mimeType: file.mimetype,
          purpose: "assistants"
        });

        if (!result.success) {
          console.error(`[CHAT] File upload failed:`, result.error);
          return res.status(500).json({ 
            error: result.error || "Failed to upload file",
            details: result.details 
          });
        }

        console.log(`[CHAT] File uploaded: ${result.fileId}`);
        res.json({
          success: true,
          fileId: result.fileId,
          filename: result.filename,
          status: result.status,
          bytes: result.bytes
        });
      } catch (error: any) {
        console.error("Chat file upload error:", error);
        res.status(500).json({ error: error.message || "Failed to upload file" });
      }
    }
  );

  // POST /api/foundry/chat/threads/:threadId/messages - Send message and run agent
  app.post(
    "/api/foundry/chat/threads/:threadId/messages",
    tokenRequired,
    foundryManagementPermissionRequired("view"),
    async (req, res) => {
      try {
        const { threadId } = req.params;
        let { projectName, customSubdomain, hubEndpoint, agentId, content, fileIds, organizationId, vectorStoreId } = req.body;

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // If organizationId is provided, fetch config from resource set
        if (organizationId) {
          const orgId = parseInt(organizationId);
          if (isNaN(orgId)) {
            return res.status(400).json({ error: "Invalid organization ID" });
          }

          const userOrgIds = await storage.getUserOrganizationIds(userEmail);
          if (!userOrgIds.includes(orgId)) {
            return res.status(403).json({ error: "Access denied to this organization" });
          }

          const result = await storage.getFoundryResourceSetWithResourceByOrg(orgId);
          if (!result) {
            return res.status(404).json({ error: "No Foundry resource set configured for this organization" });
          }

          const { resourceSet, foundryResource } = result;
          projectName = foundryResource.projectName;
          customSubdomain = foundryResource.projectEndpoint 
            ? new URL(foundryResource.projectEndpoint).hostname.split('.')[0]
            : foundryResource.resourceName;
          // Use default agent from resource set if not explicitly provided
          if (!agentId && resourceSet.defaultAgentId) {
            agentId = resourceSet.defaultAgentId;
          }
          // Use vector store ID for citation resolution
          if (!vectorStoreId) {
            vectorStoreId = resourceSet.defaultVectorStoreId || foundryResource.vectorStoreId;
          }
          console.log(`[CHAT] Using org ${orgId} resource set for message: ${resourceSet.name}`);
        }

        if (!projectName || !agentId || !content) {
          return res.status(400).json({ 
            error: "Missing required fields: projectName, agentId, content" 
          });
        }

        if (!customSubdomain && !hubEndpoint) {
          return res.status(400).json({ 
            error: "Either customSubdomain or hubEndpoint is required" 
          });
        }

        // Extract just the project name if it comes as "hubName/projectName"
        const projectNameOnly = projectName.includes("/") 
          ? projectName.split("/").pop() || projectName
          : projectName;
        
        console.log(`[CHAT] Sending message to thread: ${threadId}, project: ${projectNameOnly}`);
        if (fileIds && fileIds.length > 0) {
          console.log(`[CHAT] Message includes ${fileIds.length} file attachment(s): ${fileIds.join(', ')}`);
        }

        const token = await foundryProvisioningService.getAIAccessToken();
        const apiVersion = "2025-05-01";
        
        let baseEndpoint: string;
        if (hubEndpoint) {
          baseEndpoint = hubEndpoint.replace(/\/$/, '');
        } else {
          baseEndpoint = `https://${customSubdomain!.toLowerCase()}.services.ai.azure.com`;
        }

        const projectEndpoint = `${baseEndpoint}/api/projects/${encodeURIComponent(projectNameOnly)}`;

        // Step 1: Add user message to thread (with file attachments if provided)
        const messageUrl = `${projectEndpoint}/threads/${threadId}/messages?api-version=${apiVersion}`;
        
        // Build message body with optional file attachments
        const messageBody: any = {
          role: "user",
          content: content
        };
        
        // Add file attachments for file_search tool if files were uploaded
        if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
          messageBody.attachments = fileIds.map((fileId: string) => ({
            file_id: fileId,
            tools: [{ type: "file_search" }]
          }));
        }
        
        const messageResponse = await fetch(messageUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(messageBody)
        });

        if (!messageResponse.ok) {
          const errorText = await messageResponse.text();
          console.error(`[CHAT] Message creation failed:`, errorText);
          // Parse Azure error response for a cleaner error message
          let errorMessage = "Failed to send message";
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.error?.message) {
              errorMessage = errorData.error.message;
            }
          } catch {
            // Keep the generic message if parsing fails
          }
          return res.status(messageResponse.status).json({ 
            error: errorMessage,
            details: errorText 
          });
        }

        // Step 2: Create a run to process the message with the agent
        const runUrl = `${projectEndpoint}/threads/${threadId}/runs?api-version=${apiVersion}`;
        const runResponse = await fetch(runUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            assistant_id: agentId
          })
        });

        if (!runResponse.ok) {
          const errorText = await runResponse.text();
          console.error(`[CHAT] Run creation failed:`, errorText);
          // Parse Azure error response for a cleaner error message
          let errorMessage = "Failed to run agent";
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.error?.message) {
              errorMessage = errorData.error.message;
            }
          } catch {
            // Keep the generic message if parsing fails
          }
          return res.status(runResponse.status).json({ 
            error: errorMessage,
            details: errorText 
          });
        }

        const runData = await runResponse.json();
        const runId = runData.id;
        console.log(`[CHAT] Run created: ${runId}, status: ${runData.status}`);

        // Step 3: Poll for run completion (max 60 seconds)
        const maxWaitTime = 60000;
        const pollInterval = 1000;
        const startTime = Date.now();
        let runStatus = runData.status;
        let lastError: any = null;
        let failedAt: string | null = null;

        while (runStatus === 'queued' || runStatus === 'in_progress') {
          if (Date.now() - startTime > maxWaitTime) {
            return res.status(408).json({ 
              error: "Agent response timeout",
              runId,
              status: runStatus
            });
          }

          await new Promise(resolve => setTimeout(resolve, pollInterval));

          const statusUrl = `${projectEndpoint}/threads/${threadId}/runs/${runId}?api-version=${apiVersion}`;
          const statusResponse = await fetch(statusUrl, {
            headers: { "Authorization": `Bearer ${token}` }
          });

          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            runStatus = statusData.status;
            console.log(`[CHAT] Run status: ${runStatus}`);
            
            // Capture error details if run failed
            if (statusData.last_error) {
              lastError = statusData.last_error;
              console.error(`[CHAT] Run error details:`, JSON.stringify(lastError, null, 2));
            }
            if (statusData.failed_at) {
              failedAt = statusData.failed_at;
            }
          }
        }

        if (runStatus !== 'completed') {
          const errorMessage = lastError?.message || `Run failed with status: ${runStatus}`;
          const errorCode = lastError?.code || 'unknown';
          console.error(`[CHAT] Run failed - Code: ${errorCode}, Message: ${errorMessage}`);
          
          return res.status(500).json({ 
            error: errorMessage,
            errorCode,
            runId,
            status: runStatus,
            lastError,
            failedAt
          });
        }

        // Step 4: Fetch messages from thread
        const messagesUrl = `${projectEndpoint}/threads/${threadId}/messages?api-version=${apiVersion}`;
        const messagesResponse = await fetch(messagesUrl, {
          headers: { "Authorization": `Bearer ${token}` }
        });

        if (!messagesResponse.ok) {
          const errorText = await messagesResponse.text();
          return res.status(messagesResponse.status).json({ 
            error: "Failed to fetch messages",
            details: errorText 
          });
        }

        const messagesData = await messagesResponse.json();
        console.log(`[CHAT] Retrieved ${messagesData.data?.length || 0} messages`);

        // Enrich messages with resolved citation filenames
        const enrichedMessages = await enrichMessagesWithFilenames(
          messagesData.data || [],
          baseEndpoint,
          projectNameOnly,
          token,
          apiVersion,
          vectorStoreId
        );

        res.json({ 
          success: true,
          runId,
          messages: enrichedMessages
        });
      } catch (error: any) {
        console.error("Chat message error:", error);
        res.status(500).json({ error: error.message || "Failed to process chat message" });
      }
    }
  );

  // GET /api/foundry/chat/threads/:threadId/messages - Get messages from a thread
  app.get(
    "/api/foundry/chat/threads/:threadId/messages",
    tokenRequired,
    foundryManagementPermissionRequired("view"),
    async (req, res) => {
      try {
        const { threadId } = req.params;
        let { projectName, customSubdomain, hubEndpoint, organizationId, vectorStoreId } = req.query as Record<string, string>;

        const userEmail = req.user?.email;
        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // If organizationId is provided, fetch config from resource set
        if (organizationId) {
          const orgId = parseInt(organizationId);
          if (isNaN(orgId)) {
            return res.status(400).json({ error: "Invalid organization ID" });
          }

          const userOrgIds = await storage.getUserOrganizationIds(userEmail);
          if (!userOrgIds.includes(orgId)) {
            return res.status(403).json({ error: "Access denied to this organization" });
          }

          const result = await storage.getFoundryResourceSetWithResourceByOrg(orgId);
          if (!result) {
            return res.status(404).json({ error: "No Foundry resource set configured for this organization" });
          }

          const { resourceSet, foundryResource } = result;
          projectName = foundryResource.projectName || "";
          customSubdomain = foundryResource.projectEndpoint 
            ? new URL(foundryResource.projectEndpoint).hostname.split('.')[0]
            : foundryResource.resourceName;
          // Use vector store ID for citation resolution
          if (!vectorStoreId) {
            vectorStoreId = resourceSet.defaultVectorStoreId || foundryResource.vectorStoreId || undefined;
          }
        }

        if (!projectName) {
          return res.status(400).json({ error: "Missing required query parameter: projectName" });
        }

        if (!customSubdomain && !hubEndpoint) {
          return res.status(400).json({ 
            error: "Either customSubdomain or hubEndpoint query parameter is required" 
          });
        }

        console.log(`[CHAT] Fetching messages for thread: ${threadId}`);

        const token = await foundryProvisioningService.getAIAccessToken();
        const apiVersion = "2025-05-01";
        
        let baseEndpoint: string;
        if (hubEndpoint) {
          baseEndpoint = hubEndpoint.replace(/\/$/, '');
        } else {
          baseEndpoint = `https://${customSubdomain!.toLowerCase()}.services.ai.azure.com`;
        }

        const url = `${baseEndpoint}/api/projects/${encodeURIComponent(projectName)}/threads/${threadId}/messages?api-version=${apiVersion}`;

        const response = await fetch(url, {
          headers: { "Authorization": `Bearer ${token}` }
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[CHAT] Messages fetch failed:`, errorText);
          return res.status(response.status).json({ 
            error: "Failed to fetch messages",
            details: errorText 
          });
        }

        const data = await response.json();
        console.log(`[CHAT] Retrieved ${data.data?.length || 0} messages`);

        // Extract project name only if it has hubName prefix
        const projectNameOnly = projectName.includes("/") 
          ? projectName.split("/").pop() || projectName
          : projectName;

        // Enrich messages with resolved citation filenames
        const enrichedMessages = await enrichMessagesWithFilenames(
          data.data || [],
          baseEndpoint,
          projectNameOnly,
          token,
          apiVersion,
          vectorStoreId
        );

        res.json({ 
          success: true,
          messages: enrichedMessages
        });
      } catch (error: any) {
        console.error("Chat messages fetch error:", error);
        res.status(500).json({ error: error.message || "Failed to fetch chat messages" });
      }
    }
  );

  // ============================================
  // Content Understanding API (Phase 1)
  // ============================================

  // Log development mode warning for Content Understanding
  logCuDevModeWarning();

  // POST /api/content-understanding/connect - Connect CU to Foundry resource
  app.post(
    "/api/content-understanding/connect",
    tokenRequired,
    contentUnderstandingPermissionRequired('runAnalysis'),
    async (req, res) => {
      try {
        const { foundryResourceName, modelDeployments } = req.body;

        if (!foundryResourceName) {
          return res.status(400).json({
            success: false,
            error: "foundryResourceName is required"
          });
        }

        console.log(`[CU API] Connect request for Foundry resource: ${foundryResourceName}`);

        const result = await connectContentUnderstanding({
          foundryResourceName,
          modelDeployments
        });

        if (result.success) {
          res.json(result);
        } else {
          res.status(500).json(result);
        }
      } catch (error: any) {
        console.error("[CU API] Connect error:", error);
        res.status(500).json({
          success: false,
          error: error.message || "Failed to connect Content Understanding"
        });
      }
    }
  );

  // GET /api/content-understanding/status - Get current CU model mappings
  app.get(
    "/api/content-understanding/status/:foundryResourceName",
    tokenRequired,
    contentUnderstandingPermissionRequired('view'),
    async (req, res) => {
      try {
        const { foundryResourceName } = req.params;

        if (!foundryResourceName) {
          return res.status(400).json({
            success: false,
            error: "foundryResourceName is required"
          });
        }

        console.log(`[CU API] Status request for Foundry resource: ${foundryResourceName}`);

        const result = await getContentUnderstandingStatus(foundryResourceName);

        if (result.success) {
          res.json(result);
        } else {
          res.status(500).json(result);
        }
      } catch (error: any) {
        console.error("[CU API] Status error:", error);
        res.status(500).json({
          success: false,
          error: error.message || "Failed to get Content Understanding status"
        });
      }
    }
  );

  // POST /api/content-understanding/deploy-models - Deploy CU required models
  app.post(
    "/api/content-understanding/deploy-models",
    tokenRequired,
    contentUnderstandingPermissionRequired('runAnalysis'),
    async (req, res) => {
      try {
        const { resourceGroup, hubName, customDeploymentNames } = req.body;

        if (!resourceGroup || !hubName) {
          return res.status(400).json({
            success: false,
            error: "resourceGroup and hubName are required"
          });
        }

        console.log(`[CU API] Deploy models request for Hub: ${hubName}, ResourceGroup: ${resourceGroup}`);

        const result = await foundryProvisioningService.deployContentUnderstandingModels(
          resourceGroup,
          hubName,
          customDeploymentNames
        );

        if (result.success) {
          res.json({
            success: true,
            message: "Content Understanding models deployed successfully",
            deployments: result.deployments
          });
        } else {
          res.status(500).json(result);
        }
      } catch (error: any) {
        console.error("[CU API] Deploy models error:", error);
        res.status(500).json({
          success: false,
          error: error.message || "Failed to deploy Content Understanding models"
        });
      }
    }
  );

  // GET /api/content-understanding/generate-sas - Generate SAS URL without IP restrictions for Azure CU
  app.get(
    "/api/content-understanding/generate-sas",
    tokenRequired,
    organizationAccessRequired,
    contentUnderstandingPermissionRequired('view'),
    async (req, res) => {
      try {
        const { organizationId, path: filePath, storageAccountId: storageAccountIdParam } = req.query;

        if (!organizationId || !filePath) {
          return res.status(400).json({
            success: false,
            error: "organizationId and path are required"
          });
        }

        console.log(`[CU-SAS] Generating SAS URL for Content Understanding: ${filePath}`);

        // Get storage account for the organization (same pattern as download endpoint)
        const orgId = parseInt(organizationId as string, 10);
        const storageAccount = await storage.getStorageAccountByOrganization(orgId);
        if (!storageAccount) {
          return res.status(404).json({
            success: false,
            error: "No storage account found for this organization"
          });
        }

        if (!credential) {
          return res.status(500).json({
            success: false,
            error: "Azure credentials not configured"
          });
        }

        // GEO-FENCING: Enforce geographic access restrictions before Content Understanding SAS generation
        const user = (req as any).user;
        try {
          const logContext = await getActivityLoggingContext(req, orgId);
          await enforceGeoAccess({
            req,
            orgId,
            userId: user?.id,
            operation: 'content-understanding-sas',
          });
        } catch (geoError: any) {
          if (isGeoRestrictionError(geoError)) {
            console.warn(`[GEO] Content Understanding SAS blocked for user ${user?.email} from country ${geoError.country}`);
            return res.status(403).json({
              success: false,
              code: 'GEO_RESTRICTED',
              error: geoError.message,
            });
          }
          throw geoError;
        }

        // Construct blob path with base path if configured
        let blobPath = filePath as string;
        if (storageAccount.basePath && storageAccount.basePath.trim() !== "") {
          const cleanBasePath = storageAccount.basePath.replace(/^\/+|\/+$/g, "");
          const cleanFilePath = (filePath as string).replace(/^\/+/, "");
          blobPath = `${cleanBasePath}/${cleanFilePath}`;
        }

        console.log(`[CU-SAS] Storage account: ${storageAccount.name}, Container: ${storageAccount.containerName}`);
        console.log(`[CU-SAS] Blob path: ${blobPath}`);

        // Use BlobServiceClient with managed identity (same pattern as download endpoint)
        const blobServiceClient = new BlobServiceClient(
          `https://${storageAccount.name}.blob.core.windows.net`,
          credential
        );

        const containerClient = blobServiceClient.getContainerClient(storageAccount.containerName);
        const blobClient = containerClient.getBlobClient(blobPath);

        const startsOn = new Date();
        const expiresOn = new Date(startsOn.getTime() + 15 * 60 * 1000); // 15 minutes for CU processing

        // Get user delegation key (required for managed identity SAS)
        const userDelegationKey = await blobServiceClient.getUserDelegationKey(
          startsOn,
          expiresOn
        );

        // Generate SAS WITHOUT IP restriction for Azure Content Understanding
        const sasOptions: any = {
          containerName: storageAccount.containerName,
          blobName: blobPath,
          permissions: BlobSASPermissions.parse("r"), // Read-only
          startsOn,
          expiresOn
          // NOTE: No ipRange - Azure CU needs to access from Azure IPs
        };

        console.log(`[CU-SAS] Generating SAS without IP restriction for Azure Content Understanding`);

        const sasToken = generateBlobSASQueryParameters(
          sasOptions,
          userDelegationKey,
          storageAccount.name
        ).toString();

        // Generate SAS URL using blob client URL
        const sasUrl = `${blobClient.url}?${sasToken}`;

        console.log(`[CU-SAS] Generated SAS URL for Content Understanding (expires in 15 min)`);

        res.json({
          success: true,
          url: sasUrl,
          expiresIn: 900, // 15 minutes in seconds
          storageAccount: storageAccount.name,
          container: storageAccount.containerName
        });
      } catch (error: any) {
        console.error("[CU-SAS] Error generating SAS:", error);
        res.status(500).json({
          success: false,
          error: error.message || "Failed to generate SAS URL"
        });
      }
    }
  );

  // POST /api/content-understanding/analyze - Analyze a document using SAS URL
  app.post(
    "/api/content-understanding/analyze",
    tokenRequired,
    contentUnderstandingPermissionRequired('runAnalysis'),
    async (req, res) => {
      try {
        const { sasUrl, foundryResourceName, analyzerId, options } = req.body;

        if (!sasUrl) {
          return res.status(400).json({
            success: false,
            error: "sasUrl is required"
          });
        }

        if (!foundryResourceName) {
          return res.status(400).json({
            success: false,
            error: "foundryResourceName is required"
          });
        }

        console.log(`[CU API] Analyze request for: ${sasUrl.substring(0, 80)}...`);
        console.log(`[CU API] Foundry resource: ${foundryResourceName}`);

        const result = await analyzeDocument({
          sasUrl,
          foundryResourceName,
          analyzerId,
          options
        });

        if (result.success) {
          res.json(result);
        } else {
          // Return appropriate HTTP status based on error type
          const status = result.status === "timeout" ? 504 : 
                         result.status === "cancelled" ? 410 : 500;
          res.status(status).json(result);
        }
      } catch (error: any) {
        console.error("[CU API] Analyze error:", error);
        res.status(500).json({
          success: false,
          error: error.message || "Failed to analyze document"
        });
      }
    }
  );

  // ========================================
  // ========================================
  // Generalized Async CU Analysis Endpoints (All Content Types)
  // ========================================

  app.post(
    "/api/cu/jobs/submit",
    tokenRequired,
    organizationAccessRequired,
    contentUnderstandingPermissionRequired('runAnalysis'),
    async (req, res) => {
      try {
        const { sasUrl, foundryResourceName, organizationId, sourceFilePath, storageAccountName, containerName, contentType: requestedContentType, analyzerId } = req.body;
        const user = (req as any).user;

        if (!sasUrl) return res.status(400).json({ success: false, error: "sasUrl is required" });
        if (!foundryResourceName) return res.status(400).json({ success: false, error: "foundryResourceName is required" });
        if (!organizationId) return res.status(400).json({ success: false, error: "organizationId is required" });
        if (!sourceFilePath) return res.status(400).json({ success: false, error: "sourceFilePath is required" });
        if (!storageAccountName) return res.status(400).json({ success: false, error: "storageAccountName is required" });
        if (!containerName) return res.status(400).json({ success: false, error: "containerName is required" });

        const contentType = requestedContentType || detectContentType(sasUrl);
        const allowedTypes = ["video", "audio", "document", "image"];
        if (!allowedTypes.includes(contentType)) {
          return res.status(400).json({ success: false, error: `Unsupported content type: ${contentType}. Allowed: ${allowedTypes.join(", ")}` });
        }

        console.log(`[CU-ASYNC-API] ${contentType} analysis submit from: ${user?.email}`);
        console.log(`[CU-ASYNC-API] Organization: ${organizationId}, File: ${sourceFilePath}`);

        const dbUser = await storage.getUserByEmail(user.email);
        if (!dbUser) return res.status(403).json({ success: false, error: "User not found" });

        const submitResult = await submitCuAnalysisAsync({
          sasUrl,
          foundryResourceName,
          analyzerId,
          contentType
        });

        if (!submitResult.success) {
          console.error(`[CU-ASYNC-API] Failed to submit ${contentType} analysis: ${submitResult.error}`);
          return res.status(500).json({ success: false, error: submitResult.error || `Failed to submit ${contentType} for analysis` });
        }

        const jobId = crypto.randomUUID();
        const cuJobRecord = await storage.createCuJob({
          jobId,
          azureOperationLocation: submitResult.operationLocation!,
          organizationId: parseInt(organizationId),
          userId: dbUser.id,
          sourceFilePath,
          storageAccountName,
          containerName,
          foundryResourceName,
          analyzerId: submitResult.analyzerId || analyzerId || "",
          contentType,
          status: "submitted",
        });

        await ActivityLogger.log(req, {
          action: `CU_${contentType.toUpperCase()}_ANALYSIS_SUBMITTED`,
          actionCategory: ActivityCategories.CONTENT_UNDERSTANDING,
          resource: sourceFilePath,
          resourceType: ResourceTypes.FILE,
          organizationId: parseInt(organizationId),
          details: {
            jobId,
            contentType,
            storageAccountName,
            containerName,
            foundryResourceName
          }
        });

        res.json({
          success: true,
          jobId,
          contentType,
          status: "submitted",
          message: `${contentType} analysis job submitted and registered for background polling.`
        });

      } catch (error: any) {
        console.error("[CU-ASYNC-API] Submit error:", error);
        res.status(500).json({ success: false, error: error.message || "Failed to submit for analysis" });
      }
    }
  );

  app.get(
    "/api/cu/jobs/:jobId/status",
    tokenRequired,
    async (req, res) => {
      try {
        const { jobId } = req.params;
        const user = (req as any).user;

        const job = await storage.getCuJob(jobId);
        if (!job) return res.status(404).json({ success: false, error: "Job not found" });

        const dbUser = await storage.getUserByEmail(user.email);
        if (!dbUser) return res.status(403).json({ success: false, error: "User not found" });

        const userOrgIds = await storage.getUserOrganizationIds(user.email);
        if (!userOrgIds.includes(job.organizationId)) {
          return res.status(403).json({ success: false, error: "Access denied to this job" });
        }

        if (job.status === "failed" || job.status === "cancelled") {
          return res.json({
            success: true,
            jobId,
            contentType: job.contentType,
            status: job.status,
            resultPath: job.resultPath,
            error: job.error,
            createdAt: job.createdAt?.toISOString(),
            startedAt: job.startedAt?.toISOString(),
            completedAt: job.completedAt?.toISOString(),
            pollAttempts: job.pollAttempts
          });
        }

        if (job.status === "succeeded") {
          let result: any = null;
          
          // Try fetching from blob if resultPath exists
          if (job.resultPath && job.resultPath.includes(".json")) {
            try {
              const getResponse = await cuPersistenceService.getResult(
                job.resultPath,
                job.storageAccountName,
                job.containerName,
                job.organizationId
              );
              if (getResponse.success) {
                result = getResponse.result;
              }
            } catch (err) {
              console.error(`[CU-ASYNC-API] Error fetching result from blob for job ${jobId}:`, err);
            }
          }

          // Fallback to Azure poll if blob fetch failed or wasn't tried
          if (!result && job.azureOperationLocation) {
            try {
              const statusResult = await checkCuAnalysisStatus(job.azureOperationLocation);
              if (statusResult.status === "succeeded" && statusResult.result) {
                result = statusResult.result;
              }
            } catch (fetchErr: any) {
              console.warn(`[CU-ASYNC-API] Could not re-fetch result for completed job ${jobId}: ${fetchErr.message}`);
            }
          }
          return res.json({
            success: true,
            jobId,
            contentType: job.contentType,
            status: job.status,
            resultPath: job.resultPath,
            result,
            error: job.error,
            createdAt: job.createdAt?.toISOString(),
            startedAt: job.startedAt?.toISOString(),
            completedAt: job.completedAt?.toISOString(),
            pollAttempts: job.pollAttempts
          });
        }

        if (!job.azureOperationLocation) {
          return res.status(500).json({ success: false, error: "Job missing Azure operation location" });
        }

        const statusResult = await checkCuAnalysisStatus(job.azureOperationLocation);
        const newPollAttempts = (job.pollAttempts || 0) + 1;

        if (statusResult.status === "succeeded" && statusResult.result) {
          console.log(`[CU-ASYNC-API] Job ${jobId} (${job.contentType}) completed. Saving result...`);

          try {
            const saveResult = await cuPersistenceService.saveResult({
              organizationId: job.organizationId,
              storageAccountName: job.storageAccountName,
              containerName: job.containerName,
              sourceFilePath: job.sourceFilePath,
              analysisResult: statusResult.result,
              userEmail: user.email,
              saveMode: 'auto'
            });

            if (!saveResult.success) {
              await storage.updateCuJob(jobId, { status: "succeeded", error: `Result obtained but save failed: ${saveResult.error}`, pollAttempts: newPollAttempts, completedAt: new Date() });
              return res.json({ success: true, jobId, contentType: job.contentType, status: "succeeded", result: statusResult.result, warning: `Analysis completed but save failed: ${saveResult.error}`, pollAttempts: newPollAttempts });
            }

            const savedPath = saveResult.blobPath || job.sourceFilePath;
            await storage.updateCuJob(jobId, { status: "succeeded", resultPath: savedPath, pollAttempts: newPollAttempts, completedAt: new Date() });

            await ActivityLogger.log({
              userId: String(dbUser.id),
              userName: user.name || user.email,
              email: user.email,
              ipAddress: req.ip || "unknown",
              userAgent: req.headers["user-agent"] || "unknown",
              sessionId: `cu-${job.contentType}-${jobId}`,
              action: `CU_${(job.contentType || "unknown").toUpperCase()}_ANALYSIS_COMPLETED`,
              actionCategory: ActivityCategories.CONTENT_UNDERSTANDING,
              resource: job.sourceFilePath,
              resourceType: ResourceTypes.FILE,
              organizationId: job.organizationId,
              details: { jobId, contentType: job.contentType, resultPath: savedPath, storageAccountName: job.storageAccountName }
            });

            return res.json({ success: true, jobId, contentType: job.contentType, status: "succeeded", resultPath: savedPath, result: statusResult.result, pollAttempts: newPollAttempts, completedAt: new Date().toISOString() });
          } catch (saveError: any) {
            console.error(`[CU-ASYNC-API] Failed to save result: ${saveError.message}`);
            await storage.updateCuJob(jobId, { status: "succeeded", error: `Result obtained but save failed: ${saveError.message}`, pollAttempts: newPollAttempts, completedAt: new Date() });
            return res.json({ success: true, jobId, contentType: job.contentType, status: "succeeded", result: statusResult.result, warning: `Analysis completed but save failed: ${saveError.message}`, pollAttempts: newPollAttempts });
          }
        }

        if (statusResult.status === "failed") {
          await storage.updateCuJob(jobId, { status: "failed", error: statusResult.error || "Analysis failed", pollAttempts: newPollAttempts, completedAt: new Date() });
          return res.json({ success: false, jobId, contentType: job.contentType, status: "failed", error: statusResult.error, pollAttempts: newPollAttempts });
        }

        if (statusResult.status === "cancelled") {
          await storage.updateCuJob(jobId, { status: "cancelled", pollAttempts: newPollAttempts, completedAt: new Date() });
          return res.json({ success: false, jobId, contentType: job.contentType, status: "cancelled", pollAttempts: newPollAttempts });
        }

        await storage.updateCuJob(jobId, { pollAttempts: newPollAttempts });
        res.json({ success: true, jobId, contentType: job.contentType, status: "running", pollAttempts: newPollAttempts, createdAt: job.createdAt?.toISOString(), startedAt: job.startedAt?.toISOString() });

      } catch (error: any) {
        console.error("[CU-ASYNC-API] Status check error:", error);
        res.status(500).json({ success: false, error: error.message || "Failed to check job status" });
      }
    }
  );

  app.get(
    "/api/cu/jobs",
    tokenRequired,
    async (req, res) => {
      try {
        const user = (req as any).user;
        const limit = parseInt(req.query.limit as string) || 50;
        const organizationId = req.query.organizationId ? parseInt(req.query.organizationId as string) : undefined;
        const contentType = req.query.contentType as string | undefined;

        const dbUser = await storage.getUserByEmail(user.email);
        if (!dbUser) return res.status(403).json({ success: false, error: "User not found" });

        let jobs;
        if (organizationId) {
          const userOrgIds = await storage.getUserOrganizationIds(user.email);
          if (!userOrgIds.includes(organizationId)) {
            return res.status(403).json({ success: false, error: "Access denied to this organization" });
          }
          jobs = await storage.getCuJobsByOrganization(organizationId, limit);
        } else {
          jobs = await storage.getCuJobsByUser(dbUser.id, limit);
        }

        if (contentType) {
          jobs = jobs.filter((j: any) => j.contentType === contentType);
        }

        res.json({
          success: true,
          jobs: await Promise.all(jobs.map(async (job: any) => {
            let resultJson = null;
            if (job.status === "succeeded" && job.resultPath && job.resultPath.includes(".json")) {
              try {
                const getResponse = await cuPersistenceService.getResult(
                  job.resultPath,
                  job.storageAccountName,
                  job.containerName,
                  job.organizationId
                );
                if (getResponse.success) {
                  resultJson = getResponse.result;
                }
              } catch (err) {
                console.error(`[CU] Error fetching result for job ${job.jobId}:`, err);
              }
            }
            return {
              jobId: job.jobId,
              contentType: job.contentType,
              status: job.status,
              sourceFilePath: job.sourceFilePath,
              storageAccountName: job.storageAccountName,
              containerName: job.containerName,
              resultPath: job.resultPath,
              resultJson,
              error: job.error,
              pollAttempts: job.pollAttempts,
              createdAt: job.createdAt?.toISOString(),
              startedAt: job.startedAt?.toISOString(),
              completedAt: job.completedAt?.toISOString()
            };
          }))
        });

      } catch (error: any) {
        console.error("[CU-ASYNC-API] List jobs error:", error);
        res.status(500).json({ success: false, error: error.message || "Failed to list jobs" });
      }
    }
  );

  app.delete(
    "/api/cu/jobs/:jobId",
    tokenRequired,
    contentUnderstandingPermissionRequired('deleteAnalysis'),
    async (req, res) => {
      try {
        const { jobId } = req.params;
        const user = (req as any).user;

        const job = await storage.getCuJob(jobId);
        if (!job) return res.status(404).json({ success: false, error: "Job not found" });

        const userOrgIds = await storage.getUserOrganizationIds(user.email);
        if (!userOrgIds.includes(job.organizationId)) {
          return res.status(403).json({ success: false, error: "Access denied to this job" });
        }

        const deleted = await storage.deleteCuJob(jobId);
        if (deleted) {
          console.log(`[CU-ASYNC-API] Job ${jobId} (${job.contentType}) deleted by ${user.email}`);
          res.json({ success: true, message: "Job deleted" });
        } else {
          res.status(500).json({ success: false, error: "Failed to delete job" });
        }

      } catch (error: any) {
        console.error("[CU-ASYNC-API] Delete job error:", error);
        res.status(500).json({ success: false, error: error.message || "Failed to delete job" });
      }
    }
  );

  // Legacy /api/cu/video/* endpoints removed - consolidated into /api/cu/async/* with CuPollingService

  // POST_REMOVED: /api/cu/video/submit
  // GET_REMOVED: /api/cu/video/jobs/:jobId/status
  // GET_REMOVED: /api/cu/video/jobs
  // DELETE_REMOVED: /api/cu/video/jobs/:jobId
  // All async analysis now handled by /api/cu/async/* endpoints and CuPollingService


  // ========================================
  // CU Result Persistence Endpoints
  // ========================================

  // GET /api/cu/config - Get CU configuration (protected)
  app.get(
    "/api/cu/config",
    tokenRequired,
    contentUnderstandingPermissionRequired('view'),
    async (req, res) => {
      try {
        const MAX_RESULTS_PER_FILE = (() => {
          const parsed = parseInt(process.env.ZAPPER_CU_MAX_RESULTS_PER_FILE || "0");
          return Number.isFinite(parsed) && parsed > 0 ? parsed : 0; // 0 = unlimited
        })();

        const MAX_PAYLOAD_SIZE = (() => {
          const parsed = parseInt(process.env.ZAPPER_CU_MAX_PAYLOAD_SIZE || "5242880");
          return Number.isFinite(parsed) && parsed > 0 ? parsed : 5242880;
        })();

        const POLL_INTERVAL_MS = (() => {
          const parsed = parseInt(process.env.ZAPPER_CU_POLL_INTERVAL_MS || "2000");
          return Number.isFinite(parsed) && parsed > 0 ? parsed : 2000;
        })();

        const DEFAULT_TIMEOUT_SEC = (() => {
          const parsed = parseInt(process.env.ZAPPER_CU_DEFAULT_TIMEOUT_SEC || "120");
          return Number.isFinite(parsed) && parsed > 0 ? parsed : 120;
        })();

        const VIDEO_TIMEOUT_SEC = (() => {
          const parsed = parseInt(process.env.ZAPPER_CU_VIDEO_TIMEOUT_SEC || "900");
          return Number.isFinite(parsed) && parsed > 0 ? parsed : 900;
        })();

        const IMAGE_TIMEOUT_SEC = (() => {
          const parsed = parseInt(process.env.ZAPPER_CU_IMAGE_TIMEOUT_SEC || String(DEFAULT_TIMEOUT_SEC));
          return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_SEC;
        })();

        const DOCUMENT_TIMEOUT_SEC = (() => {
          const parsed = parseInt(process.env.ZAPPER_CU_DOCUMENT_TIMEOUT_SEC || String(DEFAULT_TIMEOUT_SEC));
          return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_SEC;
        })();

        const AUDIO_TIMEOUT_SEC = (() => {
          const parsed = parseInt(process.env.ZAPPER_CU_AUDIO_TIMEOUT_SEC || String(DEFAULT_TIMEOUT_SEC));
          return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_SEC;
        })();

        const config = {
          maxResultsPerFile: MAX_RESULTS_PER_FILE,
          maxPayloadSize: MAX_PAYLOAD_SIZE,
          pollIntervalMs: POLL_INTERVAL_MS,
          defaultTimeoutSec: DEFAULT_TIMEOUT_SEC,
          videoTimeoutSec: VIDEO_TIMEOUT_SEC,
          imageTimeoutSec: IMAGE_TIMEOUT_SEC,
          documentTimeoutSec: DOCUMENT_TIMEOUT_SEC,
          audioTimeoutSec: AUDIO_TIMEOUT_SEC,
        };

        res.setHeader("Cache-Control", "no-store");
        res.json({ success: true, config });
      } catch (error: any) {
        console.error("[CU-CONFIG] Error getting CU configuration:", error.message);
        res.status(500).json({
          success: false,
          error: "Failed to get CU configuration"
        });
      }
    }
  );

  // POST /api/cu/results/save - Save CU analysis result to blob storage
  app.post(
    "/api/cu/results/save",
    tokenRequired,
    organizationAccessRequired,
    contentUnderstandingPermissionRequired('saveAnalysis'),
    async (req, res) => {
      try {
        const { organizationId, sourceFilePath, analysisResult, fileName } = req.body;

        if (!organizationId) {
          return res.status(400).json({
            success: false,
            error: "organizationId is required"
          });
        }

        if (!sourceFilePath) {
          return res.status(400).json({
            success: false,
            error: "sourceFilePath is required"
          });
        }

        if (!analysisResult) {
          return res.status(400).json({
            success: false,
            error: "analysisResult is required"
          });
        }

        // Security: Prevent path traversal attacks
        if (sourceFilePath.includes('..') || sourceFilePath.includes('//')) {
          return res.status(400).json({
            success: false,
            error: "Invalid file path"
          });
        }

        // Security: Validate payload size (configurable, default 5MB)
        const payloadSize = JSON.stringify(analysisResult).length;
        const MAX_PAYLOAD_SIZE = parseInt(process.env.ZAPPER_CU_MAX_PAYLOAD_SIZE || String(5 * 1024 * 1024), 10); // Default 5MB
        if (payloadSize > MAX_PAYLOAD_SIZE) {
          return res.status(400).json({
            success: false,
            error: `Analysis result exceeds maximum size (${Math.round(MAX_PAYLOAD_SIZE / 1024 / 1024)}MB)`
          });
        }

        // Security: Basic schema validation
        if (typeof analysisResult !== 'object' || analysisResult === null) {
          return res.status(400).json({
            success: false,
            error: "analysisResult must be a valid object"
          });
        }

        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res.status(404).json({
            success: false,
            error: "No storage account found for this organization"
          });
        }

        // Security: Verify source file exists in org's storage before saving CU result
        const sourceFileExists = await cuPersistenceService.verifySourceFileExists(
          storageAccount.name,
          storageAccount.containerName,
          sourceFilePath
        );
        if (!sourceFileExists) {
          return res.status(404).json({
            success: false,
            error: "Source file not found in storage"
          });
        }

        const userEmail = (req as any).user?.email || "unknown";

        const result = await cuPersistenceService.saveResult({
          storageAccountName: storageAccount.name,
          containerName: storageAccount.containerName,
          sourceFilePath,
          analysisResult,
          organizationId,
          userEmail,
          fileName,
          saveMode: 'manual' // User-initiated save from UI
        });

        if (result.success) {
          console.log(`[CU API] Saved CU result: ${result.blobPath}`);
          
          // Get organization details for logging
          const organization = await storage.getOrganization(organizationId);
          const user = (req as any).user;
          const logContext = {
            userId: user?.userId || user?.id || 'unknown',
            userName: user?.name || user?.displayName || userEmail,
            email: userEmail,
            ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
            userAgent: req.headers['user-agent'],
            organizationId,
            organizationName: organization?.name,
          };
          
          await ActivityLogger.log({
            ...logContext,
            action: ActivityActions.SAVE_CU_RESULT,
            actionCategory: "CONTENT_UNDERSTANDING",
            resource: sourceFilePath,
            resourceType: "CU_RESULT",
            details: { 
              blobPath: result.blobPath, 
              resultNumber: result.resultNumber,
              fileName: fileName || sourceFilePath.split('/').pop()
            },
          });
          
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error: any) {
        console.error("[CU API] Save result error:", error);
        res.status(500).json({
          success: false,
          error: error.message || "Failed to save CU result"
        });
      }
    }
  );

  // GET /api/cu/results/list - List CU results for a source file
  app.get(
    "/api/cu/results/list",
    tokenRequired,
    organizationAccessRequired,
    contentUnderstandingPermissionRequired('view'),
    async (req, res) => {
      try {
        const organizationId = parseInt(req.query.organizationId as string);
        const sourceFilePath = req.query.sourceFilePath as string;

        if (!organizationId || isNaN(organizationId)) {
          return res.status(400).json({
            success: false,
            error: "organizationId is required"
          });
        }

        if (!sourceFilePath) {
          return res.status(400).json({
            success: false,
            error: "sourceFilePath is required"
          });
        }

        // Security: Prevent path traversal attacks
        if (sourceFilePath.includes('..') || sourceFilePath.includes('//')) {
          return res.status(400).json({
            success: false,
            error: "Invalid file path"
          });
        }

        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res.status(404).json({
            success: false,
            error: "No storage account found for this organization"
          });
        }

        const result = await cuPersistenceService.listResults(
          storageAccount.name,
          storageAccount.containerName,
          sourceFilePath
        );

        res.json(result);
      } catch (error: any) {
        console.error("[CU API] List results error:", error);
        res.status(500).json({
          success: false,
          error: error.message || "Failed to list CU results"
        });
      }
    }
  );

  // GET /api/cu/results/get - Get a specific CU result
  app.get(
    "/api/cu/results/get",
    tokenRequired,
    organizationAccessRequired,
    contentUnderstandingPermissionRequired('view'),
    async (req, res) => {
      try {
        const organizationId = parseInt(req.query.organizationId as string);
        const blobPath = req.query.blobPath as string;

        if (!organizationId || isNaN(organizationId)) {
          return res.status(400).json({
            success: false,
            error: "organizationId is required"
          });
        }

        if (!blobPath) {
          return res.status(400).json({
            success: false,
            error: "blobPath is required"
          });
        }

        // Security: Validate blobPath is within configured CU folder and prevent traversal
        const cuFolderName = process.env.ZAPPER_CU_RESULTS_DIR || "cu_folder";
        if (!blobPath.startsWith(`${cuFolderName}/`) || blobPath.includes('..') || blobPath.includes('//')) {
          return res.status(400).json({
            success: false,
            error: "Invalid blob path"
          });
        }

        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res.status(404).json({
            success: false,
            error: "No storage account found for this organization"
          });
        }

        const result = await cuPersistenceService.getResult(
          storageAccount.name,
          storageAccount.containerName,
          blobPath,
          organizationId
        );

        res.json(result);
      } catch (error: any) {
        console.error("[CU API] Get result error:", error);
        res.status(500).json({
          success: false,
          error: error.message || "Failed to get CU result"
        });
      }
    }
  );

  // DELETE /api/cu/results/delete - Delete a specific CU result
  app.delete(
    "/api/cu/results/delete",
    tokenRequired,
    organizationAccessRequired,
    contentUnderstandingPermissionRequired('deleteAnalysis'),
    async (req, res) => {
      try {
        const { organizationId, blobPath } = req.body;

        if (!organizationId) {
          return res.status(400).json({
            success: false,
            error: "organizationId is required"
          });
        }

        if (!blobPath) {
          return res.status(400).json({
            success: false,
            error: "blobPath is required"
          });
        }

        // Security: Validate blobPath is within configured CU folder and prevent traversal
        const cuFolderName = process.env.ZAPPER_CU_RESULTS_DIR || "cu_folder";
        if (!blobPath.startsWith(`${cuFolderName}/`) || blobPath.includes('..') || blobPath.includes('//')) {
          return res.status(400).json({
            success: false,
            error: "Invalid blob path"
          });
        }

        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res.status(404).json({
            success: false,
            error: "No storage account found for this organization"
          });
        }

        const result = await cuPersistenceService.deleteResult(
          storageAccount.name,
          storageAccount.containerName,
          blobPath,
          organizationId
        );

        if (result.success) {
          console.log(`[CU API] Deleted CU result: ${blobPath}`);
          
          // Activity logging for delete
          const organization = await storage.getOrganization(organizationId);
          const user = (req as any).user;
          const userEmail = user?.email || "unknown";
          const logContext = {
            userId: user?.userId || user?.id || 'unknown',
            userName: user?.name || user?.displayName || userEmail,
            email: userEmail,
            ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
            userAgent: req.headers['user-agent'],
            organizationId,
            organizationName: organization?.name,
          };
          
          await ActivityLogger.log({
            ...logContext,
            action: ActivityActions.DELETE_CU_RESULT,
            actionCategory: "CONTENT_UNDERSTANDING",
            resource: blobPath,
            resourceType: "CU_RESULT",
            details: { blobPath },
          });
        }

        res.json(result);
      } catch (error: any) {
        console.error("[CU API] Delete result error:", error);
        res.status(500).json({
          success: false,
          error: error.message || "Failed to delete CU result"
        });
      }
    }
  );

  // POST /api/cu/post-call-analysis - Run AI-powered post-call analysis on a call transcript
  app.post(
    "/api/cu/post-call-analysis",
    tokenRequired,
    organizationAccessRequired,
    contentUnderstandingPermissionRequired('runAnalysis'),
    async (req, res) => {
      try {
        const { organizationId, transcriptText, metadata } = req.body;
        const userEmail = req.user?.email;

        if (!userEmail) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        if (!organizationId || !transcriptText) {
          return res.status(400).json({ error: "organizationId and transcriptText are required" });
        }

        const orgId = parseInt(organizationId);
        if (isNaN(orgId)) {
          return res.status(400).json({ error: "Invalid organizationId" });
        }

        const foundryResult = await storage.getFoundryResourceSetWithResourceByOrg(orgId);
        if (!foundryResult) {
          return res.status(404).json({ error: "No Foundry resource set configured for this organization. Post-call analysis requires an AI agent." });
        }

        const { resourceSet, foundryResource } = foundryResult;
        if (!resourceSet.defaultAgentId) {
          return res.status(404).json({ error: "No default AI agent configured in the Foundry resource set." });
        }

        const projectName = foundryResource.projectName;
        const customSubdomain = foundryResource.projectEndpoint
          ? new URL(foundryResource.projectEndpoint).hostname.split('.')[0]
          : foundryResource.resourceName;
        const agentId = resourceSet.defaultAgentId;

        const projectNameOnly = projectName.includes("/") ? projectName.split("/").pop() || projectName : projectName;
        const baseEndpoint = `https://${customSubdomain.toLowerCase()}.services.ai.azure.com`;
        const projectEndpoint = `${baseEndpoint}/api/projects/${encodeURIComponent(projectNameOnly)}`;
        const apiVersion = "2025-05-01";

        console.log(`[POST-CALL] Starting analysis for org ${orgId}, project: ${projectNameOnly}`);

        const token = await foundryProvisioningService.getAIAccessToken();

        // Step 1: Create thread
        const threadUrl = `${projectEndpoint}/threads?api-version=${apiVersion}`;
        const threadResp = await fetch(threadUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        if (!threadResp.ok) {
          const err = await threadResp.text();
          console.error("[POST-CALL] Thread creation failed:", err);
          return res.status(threadResp.status).json({ error: "Failed to create AI thread", details: err });
        }
        const threadData = await threadResp.json();
        const threadId = threadData.id;
        console.log(`[POST-CALL] Thread created: ${threadId}`);

        // Step 2: Build prompt
        const callId = metadata?.callId || "Unknown";
        const duration = metadata?.duration || "Unknown";
        const agentIdMeta = metadata?.agentId || "Unknown";
        const callType = metadata?.callType || "Unknown";
        const industry = metadata?.industry || "Unknown";
        const date = metadata?.date || new Date().toISOString().split("T")[0];

        const prompt = `You are an expert conversational intelligence analyst. Perform a deep analysis on the following call transcript and return ONLY valid JSON — no markdown, no explanation outside the JSON.

TRANSCRIPT:
${transcriptText}

METADATA:
- Call ID: ${callId}
- Duration: ${duration}
- Agent ID: ${agentIdMeta}
- Call Type: ${callType}
- Industry: ${industry}
- Date: ${date}

Return this exact JSON schema fully populated (use null for unknown fields):
{
  "overview": {
    "call_id": "",
    "duration": "",
    "call_type": "",
    "agent_id": "",
    "customer_location": "",
    "primary_intent": "",
    "secondary_intents": [],
    "outcome": "",
    "outcome_type": "",
    "call_health": ""
  },
  "customer": {
    "profile_signals": { "estimated_tech_comfort": "", "communication_style": "", "vulnerability_indicators": [], "trust_level_toward_agent": "" },
    "sentiment": { "overall": "", "start_of_call": "", "end_of_call": "", "trajectory": "", "inflection_points": [] },
    "emotions_detected": [],
    "key_moments": [],
    "unmet_needs": [],
    "pain_points": [],
    "questions_asked": [],
    "questions_unanswered": []
  },
  "agent": {
    "communication": { "tone": "", "clarity": "", "listening_quality": "", "pacing": "", "language_complexity": "" },
    "behaviors_detected": [
      { "timestamp": "", "label": "", "description": "" }
    ],
    "techniques_used": [],
    "missed_opportunities": [],
    "strengths": [],
    "weaknesses": []
  },
  "qa_scorecard": [
    {
      "category": "",
      "evidence": "",
      "result": ""
    }
  ],
  "conversation_dynamics": {
    "talk_ratio": { "agent_percent": 0, "customer_percent": 0, "assessment": "" },
    "interruptions": { "agent_interrupted_customer": 0, "customer_interrupted_agent": 0 },
    "rapport_level": "",
    "power_dynamic": ""
  },
  "language_intelligence": {
    "keywords_by_category": { "problem_words": [], "trust_words": [], "urgency_words": [], "confusion_words": [], "compliance_words": [], "red_flag_words": [] },
    "tone_markers": [],
    "linguistic_patterns": []
  },
  "what_to_learn": {
    "for_agent_training": [],
    "for_process_improvement": [],
    "patterns_to_watch": []
  },
  "risk_signals": {
    "fraud_risk": "",
    "compliance_risk": "",
    "churn_risk": "",
    "escalation_risk": "",
    "customer_harm_risk": "",
    "flags": []
  },
  "recommendations": {
    "immediate_actions": [],
    "coaching_plan": { "overall_rating": "", "focus_areas": [], "suggested_training": [] },
    "follow_up_required": false,
    "follow_up_details": ""
  },
  "verbatim_highlights": []
}

IMPORTANT FIELD NOTES:
- qa_scorecard: List ALL key QA evaluation points. "result" must be one of: PASS | FAIL | CRITICAL | MANIPULATION | N/A. "evidence" is a direct quote or paraphrase from the call.
- agent.behaviors_detected: Each timeline event has a short "label" (e.g. "SOCIAL ENGINEERING", "REMOTE ACCESS — COMPUTER", "DECEPTION") and "description" with what happened at that timestamp.
- overview.call_health: One of — Excellent | Good | Needs Improvement | Poor | Critical | Fraudulent
- risk_signals.flags: Each flag has severity (CRITICAL/HIGH/MEDIUM/LOW), type (short label), and description.`;

        // Step 3: Send message
        const messageUrl = `${projectEndpoint}/threads/${threadId}/messages?api-version=${apiVersion}`;
        const msgResp = await fetch(messageUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ role: "user", content: prompt })
        });
        if (!msgResp.ok) {
          const err = await msgResp.text();
          console.error("[POST-CALL] Message failed:", err);
          return res.status(msgResp.status).json({ error: "Failed to send analysis prompt", details: err });
        }

        // Step 4: Create run
        const runUrl = `${projectEndpoint}/threads/${threadId}/runs?api-version=${apiVersion}`;
        const runResp = await fetch(runUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ assistant_id: agentId })
        });
        if (!runResp.ok) {
          const err = await runResp.text();
          console.error("[POST-CALL] Run creation failed:", err);
          return res.status(runResp.status).json({ error: "Failed to start agent run", details: err });
        }
        const runData = await runResp.json();
        const runId = runData.id;
        console.log(`[POST-CALL] Run created: ${runId}`);

        // Step 5: Poll for completion (max 120s — analysis may take longer than chat)
        const maxWait = 120000;
        const pollMs = 1500;
        const startTime = Date.now();
        let runStatus = runData.status;
        let lastError: any = null;

        while (runStatus === 'queued' || runStatus === 'in_progress') {
          if (Date.now() - startTime > maxWait) {
            return res.status(408).json({ error: "Analysis timed out. The AI agent took too long to respond." });
          }
          await new Promise(r => setTimeout(r, pollMs));
          const statusResp = await fetch(`${projectEndpoint}/threads/${threadId}/runs/${runId}?api-version=${apiVersion}`, {
            headers: { "Authorization": `Bearer ${token}` }
          });
          if (statusResp.ok) {
            const statusData = await statusResp.json();
            runStatus = statusData.status;
            if (statusData.last_error) lastError = statusData.last_error;
            console.log(`[POST-CALL] Run status: ${runStatus}`);
          }
        }

        if (runStatus !== 'completed') {
          const msg = lastError?.message || `Run failed with status: ${runStatus}`;
          console.error(`[POST-CALL] Run did not complete: ${msg}`);
          return res.status(500).json({ error: msg });
        }

        // Step 6: Fetch messages
        const messagesResp = await fetch(`${projectEndpoint}/threads/${threadId}/messages?api-version=${apiVersion}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (!messagesResp.ok) {
          const err = await messagesResp.text();
          return res.status(messagesResp.status).json({ error: "Failed to retrieve analysis result", details: err });
        }
        const messagesData = await messagesResp.json();
        const assistantMsg = (messagesData.data || []).find((m: any) => m.role === "assistant");
        if (!assistantMsg) {
          return res.status(500).json({ error: "No analysis response from agent" });
        }

        // Extract text content
        let rawContent = "";
        if (Array.isArray(assistantMsg.content)) {
          rawContent = assistantMsg.content
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text?.value || "")
            .join("");
        } else if (typeof assistantMsg.content === "string") {
          rawContent = assistantMsg.content;
        }

        // Strip markdown code fences if agent wrapped the JSON
        rawContent = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

        let analysisJson: any;
        try {
          analysisJson = JSON.parse(rawContent);
        } catch {
          console.error("[POST-CALL] Failed to parse JSON from agent response:", rawContent.slice(0, 500));
          return res.status(500).json({ error: "Agent returned invalid JSON. Try again or check agent configuration.", raw: rawContent.slice(0, 1000) });
        }

        console.log(`[POST-CALL] Analysis complete for org ${orgId}`);

        // Auto-save the result to blob storage so it can be retrieved later
        const sourceFilePath = req.body.sourceFilePath;
        let savedAt: string | undefined;
        if (sourceFilePath) {
          try {
            const storageAccount = await storage.getStorageAccountByOrganization(orgId);
            if (storageAccount) {
              const userEmail = req.user?.email || "unknown";
              const saveResult = await cuPersistenceService.savePostCallAnalysis(
                storageAccount.name,
                storageAccount.containerName,
                sourceFilePath,
                analysisJson,
                orgId,
                userEmail
              );
              if (saveResult.success) {
                savedAt = new Date().toISOString();
                console.log(`[POST-CALL] Auto-saved result to: ${saveResult.blobPath}`);
              } else {
                console.warn(`[POST-CALL] Auto-save failed: ${saveResult.error}`);
              }
            }
          } catch (saveErr: any) {
            console.warn(`[POST-CALL] Auto-save error (non-fatal): ${saveErr.message}`);
          }
        }

        res.json({ success: true, analysis: analysisJson, savedAt });
      } catch (error: any) {
        console.error("[POST-CALL] Error:", error);
        res.status(500).json({ error: error.message || "Post-call analysis failed" });
      }
    }
  );

  // GET /api/cu/post-call-analysis/get - Retrieve saved post-call analysis for a file
  app.get(
    "/api/cu/post-call-analysis/get",
    tokenRequired,
    organizationAccessRequired,
    contentUnderstandingPermissionRequired('view'),
    async (req, res) => {
      try {
        const organizationId = parseInt(req.query.organizationId as string);
        const sourceFilePath = req.query.sourceFilePath as string;
        const userEmail = req.user?.email;

        if (!userEmail) return res.status(401).json({ error: "Not authenticated" });
        if (!organizationId || isNaN(organizationId)) return res.status(400).json({ error: "organizationId is required" });
        if (!sourceFilePath) return res.status(400).json({ error: "sourceFilePath is required" });

        const storageAccount = await storage.getStorageAccountByOrganization(organizationId);
        if (!storageAccount) {
          return res.status(404).json({ success: false, error: "No storage account for this organization" });
        }

        const result = await cuPersistenceService.getPostCallAnalysis(
          storageAccount.name,
          storageAccount.containerName,
          sourceFilePath,
          organizationId
        );

        res.json(result);
      } catch (error: any) {
        console.error("[POST-CALL] Get error:", error);
        res.status(500).json({ error: error.message || "Failed to retrieve post-call analysis" });
      }
    }
  );

  // ============ DOCUMENT TRANSLATION API ============
  
  // POST /api/translate/document-from-path - Translate a document with server-generated SAS URLs
  // For Content Understanding integration - frontend sends path, backend generates SAS URLs
  app.post(
    "/api/translate/document-from-path",
    tokenRequired,
    organizationAccessRequired,
    documentTranslationPermissionRequired('runTranslation'),
    async (req, res) => {
      try {
        const { organizationId, filePath, targetLanguage, foundryResourceName } = req.body;

        if (!organizationId) {
          return res.status(400).json({
            success: false,
            error: "organizationId is required"
          });
        }

        if (!filePath) {
          return res.status(400).json({
            success: false,
            error: "filePath is required"
          });
        }

        const language = targetLanguage || "de";
        
        // Get the default destination folder from environment or use default
        const translatedDocFolder = process.env.ZAPPER_TRANSLATED_DOC_FOLDER || "translated_doc";

        console.log(`[DOC-TRANSLATE-PATH] Starting translation for file: ${filePath}`);
        console.log(`[DOC-TRANSLATE-PATH] Target language: ${language}, Dest folder: ${translatedDocFolder}`);

        // Get storage account for the organization
        const orgId = parseInt(organizationId as string, 10);
        const storageAccount = await storage.getStorageAccountByOrganization(orgId);
        if (!storageAccount) {
          return res.status(404).json({
            success: false,
            error: "No storage account found for this organization"
          });
        }

        if (!credential) {
          return res.status(500).json({
            success: false,
            error: "Azure credentials not configured"
          });
        }

        // Construct blob path (filePath is already the full path from file selector)
        const blobPath = (filePath as string).replace(/^\/+/, "");

        console.log(`[DOC-TRANSLATE-PATH] Storage: ${storageAccount.name}, Container: ${storageAccount.containerName}`);
        console.log(`[DOC-TRANSLATE-PATH] Blob path: ${blobPath}`);

        // Get storage account keys for SAS generation
        const subscriptionId = process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || process.env.AZURE_SUBSCRIPTION_ID;
        const resourceGroup = storageAccount.resourceGroupName || process.env.ZAPPER_AZURE_RESOURCE_GROUP || process.env.AZURE_RESOURCE_GROUP;

        if (!subscriptionId || !resourceGroup) {
          return res.status(500).json({
            success: false,
            error: "Missing Azure subscription ID or resource group for SAS generation"
          });
        }

        const storageClient = new StorageManagementClient(credential, subscriptionId);
        const keys = await storageClient.storageAccounts.listKeys(resourceGroup, storageAccount.name);

        if (!keys.keys || keys.keys.length === 0 || !keys.keys[0].value) {
          return res.status(500).json({
            success: false,
            error: "Unable to get storage account keys for SAS generation"
          });
        }

        const sharedKeyCredential = new StorageSharedKeyCredential(
          storageAccount.name,
          keys.keys[0].value
        );

        // SAS tokens valid for 30 minutes for translation processing
        const startsOn = new Date();
        const expiresOn = new Date(startsOn.getTime() + 30 * 60 * 1000);

        // Generate SOURCE SAS (read permission for the specific blob)
        const sourceSasOptions: any = {
          containerName: storageAccount.containerName,
          blobName: blobPath,
          permissions: BlobSASPermissions.parse("r"),
          startsOn,
          expiresOn
        };

        const sourceSasToken = generateBlobSASQueryParameters(
          sourceSasOptions,
          sharedKeyCredential
        ).toString();

        const sourceSasUrl = `https://${storageAccount.name}.blob.core.windows.net/${storageAccount.containerName}/${encodeBlobPath(blobPath)}?${sourceSasToken}`;
        console.log(`[DOC-TRANSLATE-PATH] Generated source SAS URL`);

        // Generate DESTINATION container SAS (write permission for the container)
        // Using StorageSharedKeyCredential for container-level write access
        const destSasOptions: any = {
          containerName: storageAccount.containerName,
          permissions: ContainerSASPermissions.parse("racwdl"), // read, add, create, write, delete, list
          startsOn,
          expiresOn
        };

        const destSasToken = generateBlobSASQueryParameters(
          destSasOptions,
          sharedKeyCredential
        ).toString();

        const destinationContainerSasUrl = `https://${storageAccount.name}.blob.core.windows.net/${storageAccount.containerName}?${destSasToken}`;
        console.log(`[DOC-TRANSLATE-PATH] Generated destination container SAS URL`);

        // Resolve hub name from Foundry resource or environment
        let resolvedHubName: string | undefined;
        
        if (foundryResourceName) {
          // If foundryResourceName is provided, use it directly
          resolvedHubName = foundryResourceName;
        } else {
          // Try to get from organization's Foundry resource set or environment
          // Check if there's a Foundry resource set for this organization
          const resourceSetWithResource = await storage.getFoundryResourceSetWithResourceByOrg(orgId);
          if (resourceSetWithResource?.foundryResource?.hubName) {
            resolvedHubName = resourceSetWithResource.foundryResource.hubName;
          }
          
          if (!resolvedHubName) {
            resolvedHubName = process.env.ZAPPER_FOUNDRY_HUB_NAME || process.env.AZURE_AI_SERVICES_NAME;
          }
        }
        
        if (!resolvedHubName) {
          return res.status(400).json({
            success: false,
            error: "No Foundry hub configured. Please provide foundryResourceName or configure a Foundry Resource Set for your organization."
          });
        }

        console.log(`[DOC-TRANSLATE-PATH] Using hub: ${resolvedHubName}`);

        // Call the translation service with target folder
        const result = await documentTranslationService.translateDocumentWithLayout({
          sourceSasUrl,
          destinationContainerSasUrl,
          targetLanguage: language,
          hubName: resolvedHubName,
          targetFolder: translatedDocFolder
        });

        if (!result.success) {
          const statusCode = result.status === 'Timeout' ? 504 : 502;
          return res.status(statusCode).json(result);
        }

        // Set translation metadata on the source blob
        // Use translatedFiles if available, otherwise fall back to computedTargetPath
        const translatedBlobPath = (result.translatedFiles && result.translatedFiles.length > 0) 
          ? result.translatedFiles[0] 
          : result.computedTargetPath;
        
        if (translatedBlobPath && keys.keys[0].value) {
          try {
            const originalFilename = blobPath.split('/').pop() || blobPath;
            
            await documentTranslationService.setTranslationMetadata(
              storageAccount.name,
              keys.keys[0].value,
              storageAccount.containerName,
              blobPath,
              language,
              translatedBlobPath,
              originalFilename
            );
            console.log(`[DOC-TRANSLATE-PATH] Set translation metadata on source blob using path: ${translatedBlobPath}`);
          } catch (metadataError) {
            // Log but don't fail the request - translation succeeded
            console.warn(`[DOC-TRANSLATE-PATH] Failed to set translation metadata:`, metadataError);
          }
        } else {
          console.warn(`[DOC-TRANSLATE-PATH] No translated blob path available - skipping metadata update`);
        }

        // Log the activity
        const logContext = await getActivityLoggingContext(req);
        
        await ActivityLogger.log({
          userId: logContext.userId,
          userName: logContext.userName,
          email: logContext.email,
          ipAddress: logContext.ipAddress,
          userAgent: logContext.userAgent,
          action: "TRANSLATE_DOCUMENT",
          actionCategory: "CONTENT_UNDERSTANDING",
          resource: filePath as string,
          resourceType: "FILE",
          details: { 
            targetLanguage: language, 
            status: result.status,
            hubName: resolvedHubName,
            translatedFiles: result.translatedFiles
          },
          organizationId: logContext.organizationId,
          organizationName: logContext.organizationName,
          roleId: logContext.roleId,
          roleName: logContext.roleName,
        });

        res.json(result);
      } catch (error: any) {
        console.error("[DOC-TRANSLATE-PATH] Error:", error);
        res.status(500).json({
          success: false,
          status: "Failed",
          error: error.message || "Document translation failed"
        });
      }
    }
  );

  // GET /api/translate/metadata - Get translation metadata for a blob
  // Returns which languages have translations and their paths
  app.get(
    "/api/translate/metadata",
    tokenRequired,
    organizationAccessRequired,
    documentTranslationPermissionRequired('view'),
    async (req, res) => {
      try {
        const { organizationId, filePath } = req.query;

        if (!organizationId) {
          return res.status(400).json({
            success: false,
            error: "organizationId is required"
          });
        }

        if (!filePath) {
          return res.status(400).json({
            success: false,
            error: "filePath is required"
          });
        }

        const orgId = parseInt(organizationId as string, 10);
        const storageAccount = await storage.getStorageAccountByOrganization(orgId);
        if (!storageAccount) {
          return res.status(404).json({
            success: false,
            error: "No storage account found for this organization"
          });
        }

        if (!credential) {
          return res.status(500).json({
            success: false,
            error: "Azure credentials not configured"
          });
        }

        const blobPath = (filePath as string).replace(/^\/+/, "");
        
        const subscriptionId = process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || process.env.AZURE_SUBSCRIPTION_ID;
        const resourceGroup = storageAccount.resourceGroupName || process.env.ZAPPER_AZURE_RESOURCE_GROUP || process.env.AZURE_RESOURCE_GROUP;

        if (!subscriptionId || !resourceGroup) {
          return res.status(500).json({
            success: false,
            error: "Missing Azure subscription ID or resource group"
          });
        }

        const storageClient = new StorageManagementClient(credential, subscriptionId);
        const keys = await storageClient.storageAccounts.listKeys(resourceGroup, storageAccount.name);

        if (!keys.keys || keys.keys.length === 0 || !keys.keys[0].value) {
          return res.status(500).json({
            success: false,
            error: "Unable to get storage account keys"
          });
        }

        const metadata = await documentTranslationService.getTranslationMetadata(
          storageAccount.name,
          keys.keys[0].value,
          storageAccount.containerName,
          blobPath
        );

        res.json({
          success: true,
          filePath: blobPath,
          ...metadata
        });
      } catch (error: any) {
        console.error("[DOC-TRANSLATE-METADATA] Error:", error);
        res.status(500).json({
          success: false,
          error: error.message || "Failed to get translation metadata"
        });
      }
    }
  );

  // DELETE /api/translate/translated-document - Delete a translated document and update metadata
  app.delete(
    "/api/translate/translated-document",
    tokenRequired,
    organizationAccessRequired,
    documentTranslationPermissionRequired('deleteTranslation'),
    async (req, res) => {
      try {
        const { organizationId, sourceBlobPath, translatedBlobPath, languageCode } = req.body;

        if (!organizationId) {
          return res.status(400).json({
            success: false,
            error: "organizationId is required"
          });
        }

        if (!sourceBlobPath || !translatedBlobPath || !languageCode) {
          return res.status(400).json({
            success: false,
            error: "sourceBlobPath, translatedBlobPath, and languageCode are required"
          });
        }

        const orgId = parseInt(organizationId as string, 10);
        const storageAccount = await storage.getStorageAccountByOrganization(orgId);
        if (!storageAccount) {
          return res.status(404).json({
            success: false,
            error: "No storage account found for this organization"
          });
        }

        if (!credential) {
          return res.status(500).json({
            success: false,
            error: "Azure credentials not configured"
          });
        }

        const subscriptionId = process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || process.env.AZURE_SUBSCRIPTION_ID;
        const resourceGroup = storageAccount.resourceGroupName || process.env.ZAPPER_AZURE_RESOURCE_GROUP || process.env.AZURE_RESOURCE_GROUP;

        if (!subscriptionId || !resourceGroup) {
          return res.status(500).json({
            success: false,
            error: "Missing Azure subscription ID or resource group"
          });
        }

        const storageClient = new StorageManagementClient(credential, subscriptionId);
        const keys = await storageClient.storageAccounts.listKeys(resourceGroup, storageAccount.name);

        if (!keys.keys || keys.keys.length === 0 || !keys.keys[0].value) {
          return res.status(500).json({
            success: false,
            error: "Unable to get storage account keys"
          });
        }

        const result = await documentTranslationService.deleteTranslatedDocument(
          storageAccount.name,
          keys.keys[0].value,
          storageAccount.containerName,
          translatedBlobPath as string,
          sourceBlobPath as string,
          languageCode as string
        );

        if (!result.success) {
          return res.status(500).json(result);
        }

        // Log the activity
        const logContext = await getActivityLoggingContext(req);
        
        await ActivityLogger.log({
          userId: logContext.userId,
          userName: logContext.userName,
          email: logContext.email,
          ipAddress: logContext.ipAddress,
          userAgent: logContext.userAgent,
          action: "DELETE_TRANSLATED_DOCUMENT",
          actionCategory: "CONTENT_UNDERSTANDING",
          resource: translatedBlobPath as string,
          resourceType: "FILE",
          details: { 
            sourceBlobPath,
            languageCode,
          },
          organizationId: logContext.organizationId,
          organizationName: logContext.organizationName,
          roleId: logContext.roleId,
          roleName: logContext.roleName,
        });

        res.json(result);
      } catch (error: any) {
        console.error("[DOC-TRANSLATE-DELETE] Error:", error);
        res.status(500).json({
          success: false,
          error: error.message || "Failed to delete translated document"
        });
      }
    }
  );

  // POST /api/translate/document - Translate a document using Azure AI Translator
  // Uses existing Foundry hub (AIServices) - hubName can be omitted to use default from env
  app.post(
    "/api/translate/document",
    tokenRequired,
    documentTranslationPermissionRequired('runTranslation'),
    async (req, res) => {
      try {
        const { sourceSasUrl, destinationContainerSasUrl, targetLanguage, hubName } = req.body;

        if (!sourceSasUrl) {
          return res.status(400).json({
            success: false,
            error: "sourceSasUrl is required"
          });
        }

        if (!destinationContainerSasUrl) {
          return res.status(400).json({
            success: false,
            error: "destinationContainerSasUrl is required"
          });
        }

        const language = targetLanguage || "de";
        
        // Use provided hubName or fallback to environment config (existing Foundry hub)
        const defaultHubName = process.env.ZAPPER_FOUNDRY_HUB_NAME || process.env.AZURE_AI_SERVICES_NAME;
        const resolvedHubName = hubName || defaultHubName;
        
        if (!resolvedHubName) {
          return res.status(400).json({
            success: false,
            error: "hubName is required (either in request or configure ZAPPER_FOUNDRY_HUB_NAME env variable)"
          });
        }

        console.log(`[DOC-TRANSLATE API] Starting translation request`);
        console.log(`[DOC-TRANSLATE API] Hub: ${resolvedHubName}, Target: ${language}`);

        const result = await documentTranslationService.translateDocumentWithLayout({
          sourceSasUrl,
          destinationContainerSasUrl,
          targetLanguage: language,
          hubName: resolvedHubName
        });

        if (!result.success) {
          const statusCode = result.status === 'Timeout' ? 504 : 502;
          return res.status(statusCode).json(result);
        }

        const logContext = await getActivityLoggingContext(req);
        
        await ActivityLogger.log({
          userId: logContext.userId,
          userName: logContext.userName,
          email: logContext.email,
          ipAddress: logContext.ipAddress,
          userAgent: logContext.userAgent,
          action: "TRANSLATE_DOCUMENT",
          actionCategory: "FOUNDRY_AI_MANAGEMENT",
          resource: resolvedHubName,
          resourceType: "FOUNDRY_RESOURCE",
          details: { targetLanguage: language, status: result.status },
          organizationId: logContext.organizationId,
          organizationName: logContext.organizationName,
          roleId: logContext.roleId,
          roleName: logContext.roleName,
        });

        res.json(result);
      } catch (error: any) {
        console.error("[DOC-TRANSLATE API] Error:", error);
        res.status(500).json({
          success: false,
          status: "Failed",
          error: error.message || "Document translation failed"
        });
      }
    }
  );

  // Permission Risk Categories Routes
  app.get("/api/permission-risk-categories", tokenRequired, async (req, res) => {
    try {
      const categories = await storage.getPermissionRiskCategories();
      res.json(categories);
    } catch (error) {
      console.error("Risk categories fetch error:", error);
      res.status(500).json({ error: "Failed to fetch risk categories" });
    }
  });

  app.patch("/api/permission-risk-categories/:id", tokenRequired, organizationAccessRequired, specificPermissionRequired('ROLE_MANAGEMENT'), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updatePermissionRiskCategory(id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Risk category not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Risk category update error:", error);
      res.status(500).json({ error: "Failed to update risk category" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
