import type { Request, Response } from "express";
import { z } from "zod";
import { DefaultAzureCredential } from "@azure/identity";
import { ResourceManagementClient } from "@azure/arm-resources";
import {
  StorageManagementClient,
  type StorageAccountCreateParameters,
} from "@azure/arm-storage";
import {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  ContainerSASPermissions,
  SASProtocol,
} from "@azure/storage-blob";
import { DataLakeServiceClient } from "@azure/storage-file-datalake";
import { configureCORS } from "./routes";
// Import the logUserActivity function from routes.ts - will be available in context

// ───────────────────────────────────────────────────────────────────────────────
// CONFIG
// ───────────────────────────────────────────────────────────────────────────────
// Get subscription ID from environment - more secure than hardcoding
// Optional in development, required in production when Azure features are used
const SUBSCRIPTION_ID = process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || "";
const DEFAULT_LOCATION = process.env.ZAPPER_DEFAULT_LOCATION || "centralindia";
const SAS_TIMEOUT_MINUTES = parseInt(process.env.ZAPPER_SAS_TIMEOUT_MINUTES || "30", 10);

const inputSchema = z.object({
  // Resource group name - will be created if it doesn't exist
  rgName: z.string().min(2).max(90).regex(/^[a-zA-Z0-9._-]+$/, "Invalid resource group name"),
  // Must be globally unique, 3–24, lowercase letters/numbers
  storageAccountName: z.string().regex(/^[a-z0-9]{3,24}$/, "Storage account name must be 3-24 lowercase letters/numbers"),
  // 3–63, lowercase letters, numbers, hyphens
  filesystemName: z.string().regex(/^[a-z0-9-]{3,63}$/, "Filesystem name must be 3-63 lowercase letters/numbers/hyphens"),
  // Optional override for location; defaults to Central India
  location: z.string().optional(),
  // Whether to turn on SFTP; defaults false
  enableSftp: z.boolean().optional().default(false),
  // Organization ID for tracking
  organizationId: z.number().int().positive(),
  // Optional tags
  tags: z.record(z.string()).optional(),
  // Whether to create new resource group
  createNewResourceGroup: z.boolean().optional().default(false),
  // Whether to use existing storage account instead of creating new one
  useExistingStorageAccount: z.boolean().optional().default(false),
  // ID of the existing storage account to use (when useExistingStorageAccount is true)
  existingStorageAccountId: z.number().optional(),
});

/**
 * Try to create the filesystem using OAuth (MI) first.
 * Requires the MI to have data-plane role "Storage Blob Data Contributor" (or Owner) on the account.
 */
async function createFilesystemWithOAuth(
  accountName: string,
  filesystemName: string,
  credential: DefaultAzureCredential
) {
  console.log(`🔧 [ADLS] Attempting to create filesystem '${filesystemName}' using OAuth...`);
  const dfsEndpoint = `https://${accountName}.dfs.core.windows.net`;
  const dls = new DataLakeServiceClient(dfsEndpoint, credential);
  const fsClient = dls.getFileSystemClient(filesystemName);
  
  const resp = await fsClient.createIfNotExists();
  console.log(`✅ [ADLS] Filesystem creation via OAuth - succeeded: ${resp.succeeded}`);
  return { created: resp.succeeded === true, url: fsClient.url };
}

/**
 * Build a User Delegation SAS for the *container name* (filesystem),
 * then use DFS endpoint with that SAS to create the filesystem.
 * This bypasses control-plane locks and still uses AAD to mint the UD key.
 */
async function createFilesystemWithUdSas(
  accountName: string,
  filesystemName: string,
  credential: DefaultAzureCredential,
  minutes: number
) {
  console.log(`🔧 [ADLS] Falling back to User Delegation SAS for filesystem creation...`);
  
  // Create a short-lived UD SAS with rights to create the container/filesystem.
  const blobEndpoint = `https://${accountName}.blob.core.windows.net`;
  const bsc = new BlobServiceClient(blobEndpoint, credential);

  // 1) Acquire a user delegation key
  const now = new Date();
  const start = new Date(now.getTime() - 60 * 1000); // clock skew
  const expiry = new Date(now.getTime() + minutes * 60 * 1000);
  console.log(`🔧 [ADLS] Acquiring user delegation key (expires: ${expiry.toISOString()})...`);
  
  const udKey = await bsc.getUserDelegationKey(start, expiry);
  console.log(`✅ [ADLS] User delegation key acquired successfully`);

  // 2) Build container-level SAS using UD key (no account key)
  const sas = generateBlobSASQueryParameters(
    {
      containerName: filesystemName,
      permissions: ContainerSASPermissions.parse("rwcl"), // minimum for create
      protocol: SASProtocol.Https,
      startsOn: start,
      expiresOn: expiry,
    },
    udKey,
    accountName
  ).toString();

  // 3) Use DFS endpoint + SAS to create filesystem (data-plane)
  const dfsUrl = `https://${accountName}.dfs.core.windows.net?${sas}`;
  const dlsWithSas = new DataLakeServiceClient(dfsUrl);
  const fsClient = dlsWithSas.getFileSystemClient(filesystemName);

  try {
    console.log(`🔧 [ADLS] Creating filesystem using User Delegation SAS...`);
    await fsClient.create();
    console.log(`✅ [ADLS] Filesystem created successfully with UD-SAS`);
    return { created: true, url: fsClient.url };
  } catch (e: any) {
    // If already exists, treat as success
    if (e?.statusCode === 409) {
      console.log(`ℹ️ [ADLS] Filesystem '${filesystemName}' already exists (409). Treating as success.`);
      return { created: false, url: fsClient.url };
    }
    throw e;
  }
}

/**
 * Check if storage account already exists
 */
async function checkStorageAccountExists(
  smc: StorageManagementClient,
  rgName: string,
  accountName: string
) {
  try {
    const account = await smc.storageAccounts.getProperties(rgName, accountName);
    return { exists: true, account };
  } catch (error: any) {
    if (error?.statusCode === 404 || error?.code === 'ResourceNotFound') {
      return { exists: false, account: null };
    }
    throw error;
  }
}

export async function provisionAdlsRoute(req: Request, res: Response) {
  console.log("\n" + "=".repeat(80));
  console.log("🚀 AZURE ADLS Gen2 + SFTP PROVISIONING STARTED");
  console.log("=".repeat(80));
  
  try {
    // Validate Azure configuration is set
    if (!SUBSCRIPTION_ID) {
      return res.status(500).json({ 
        error: "Azure subscription not configured. Please set ZAPPER_AZURE_SUBSCRIPTION_ID environment variable." 
      });
    }
    
    const body = inputSchema.parse(req.body);
    const location = body.location || DEFAULT_LOCATION;

    console.log(`📍 Target Subscription: ${SUBSCRIPTION_ID}`);
    console.log(`📦 Resource Group: ${body.rgName}`);
    console.log(`🗄️  Storage Account: ${body.storageAccountName}`);
    console.log(`📋 Filesystem: ${body.filesystemName}`);
    console.log(`🌍 Location: ${location}`);
    console.log(`📡 SFTP Enabled: ${body.enableSftp} (disabled by default, can be enabled later)`);
    console.log(`🏢 HNS Enabled: true (always enabled for ADLS Gen2)`);
    console.log(`🏢 Organization ID: ${body.organizationId}`);
    console.log(`🔄 Use Existing Storage Account: ${body.useExistingStorageAccount}`);
    if (body.useExistingStorageAccount) {
      console.log(`📋 Existing Storage Account ID: ${body.existingStorageAccountId}`);
    }
    console.log("=".repeat(80));

    const cred = new DefaultAzureCredential();

    let storageAccount;
    let smc: StorageManagementClient;
    let rgResult: any = null;
    
    if (body.useExistingStorageAccount) {
      // When using existing storage account, skip resource group and storage account creation
      console.log("\n" + "=".repeat(80));
      console.log("🔄 USING EXISTING STORAGE ACCOUNT");
      console.log("=".repeat(80));
      console.log(`🔧 Creating StorageManagementClient...`);
      smc = new StorageManagementClient(cred, SUBSCRIPTION_ID);
      
      // Get the existing storage account properties
      console.log(`⚡ Getting existing storage account '${body.storageAccountName}' properties...`);
      const { exists, account: existingAccount } = await checkStorageAccountExists(
        smc,
        body.rgName,
        body.storageAccountName
      );

      if (!exists || !existingAccount) {
        throw new Error(`Storage account '${body.storageAccountName}' not found in resource group '${body.rgName}'`);
      }

      storageAccount = existingAccount;
      console.log(`✅ Using existing storage account: ${storageAccount.name} in ${body.rgName}`);
      
      // Set rgResult to match the existing resource group info
      rgResult = {
        id: `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${body.rgName}`,
        name: body.rgName,
        location: storageAccount.location
      };
    } else {
      // 1) Ensure RG exists
      console.log("\n" + "=".repeat(80));
      console.log("📦 STEP 1: ENSURING RESOURCE GROUP");
      console.log("=".repeat(80));
      console.log(`🔧 Creating ResourceManagementClient...`);
      const rmc = new ResourceManagementClient(cred, SUBSCRIPTION_ID);
      
      if (body.createNewResourceGroup) {
        // Create new resource group with specified location
        console.log(`⚡ Creating new resource group '${body.rgName}' in ${location}...`);
        rgResult = await rmc.resourceGroups.createOrUpdate(body.rgName, { 
          location,
          tags: {
            createdBy: "zapper-adls-provisioning",
            purpose: "adls-storage",
            organizationId: body.organizationId.toString(),
            ...body.tags
          }
        });
        console.log(`✅ Resource group created: ${rgResult.name} in ${rgResult.location}`);
      } else {
        // Use existing resource group - just verify it exists
        console.log(`⚡ Verifying existing resource group '${body.rgName}'...`);
        try {
          rgResult = await rmc.resourceGroups.get(body.rgName);
          console.log(`✅ Using existing resource group: ${rgResult.name} in ${rgResult.location}`);
          console.log(`ℹ️  Note: Storage account will be created in ${location}, resource group is in ${rgResult.location}`);
        } catch (error: any) {
          if (error.statusCode === 404 || error.code === 'ResourceGroupNotFound') {
            throw new Error(`Resource group '${body.rgName}' does not exist. Please create it first or set createNewResourceGroup to true.`);
          }
          throw error;
        }
      }

      // 2) Create/ensure StorageV2 with HNS + SFTP
      console.log("\n" + "=".repeat(80));
      console.log("🗄️  STEP 2: PROVISIONING STORAGE ACCOUNT");
      console.log("=".repeat(80));
      console.log(`🔧 Creating StorageManagementClient...`);
      smc = new StorageManagementClient(cred, SUBSCRIPTION_ID);
      
      // Check if storage account already exists
      console.log(`⚡ Checking if storage account '${body.storageAccountName}' exists...`);
      const { exists, account: existingAccount } = await checkStorageAccountExists(
        smc,
        body.rgName,
        body.storageAccountName
      );

      if (exists && existingAccount) {
        console.log(`ℹ️ Storage account '${body.storageAccountName}' already exists. Using existing account.`);
        storageAccount = existingAccount;
      } else {
        console.log(`🔨 Creating new storage account '${body.storageAccountName}'...`);
        const saParams: StorageAccountCreateParameters = {
          location,
          sku: { name: "Standard_LRS" },
        kind: "StorageV2",
        allowBlobPublicAccess: false,
        minimumTlsVersion: "TLS1_2",
        // Critical flags:
        isHnsEnabled: true,                             // ADLS Gen2 - always enabled
        isSftpEnabled: body.enableSftp === true,         // SFTP - disabled by default
        isLocalUserEnabled: body.enableSftp === true,    // for future SFTP local users
        encryption: {
          services: {
            blob: { enabled: true },
            file: { enabled: true },
          },
          keySource: "Microsoft.Storage",
        },
        tags: {
          createdBy: "zapper-adls-provisioning",
          purpose: "adls-storage",
          organizationId: body.organizationId.toString(),
          sftpEnabled: body.enableSftp.toString(),
          hnsEnabled: "true",
          ...body.tags
        },
      };

      await smc.storageAccounts.beginCreateAndWait(
        body.rgName,
        body.storageAccountName,
        saParams
      );
      console.log(`✨ New storage account created successfully!`);

      storageAccount = await smc.storageAccounts.getProperties(
        body.rgName,
        body.storageAccountName
      );
      }
    }

    console.log(`✅ Storage account ready: ${storageAccount.name} in ${storageAccount.location}`);
    console.log(`🏢 HNS Status: ${storageAccount.isHnsEnabled ? 'ENABLED' : 'DISABLED'}`);
    console.log(`📡 SFTP Status: ${storageAccount.isSftpEnabled ? 'ENABLED' : 'DISABLED'}`);

    // 3) Create/ensure filesystem — OAuth first, fallback to UD-SAS on 403
    console.log("\n" + "=".repeat(80));
    console.log("📋 STEP 3: CREATING ADLS GEN2 FILESYSTEM");
    console.log("=".repeat(80));
    
    let fsResult: { created: boolean; url: string } | null = null;
    try {
      fsResult = await createFilesystemWithOAuth(
        body.storageAccountName,
        body.filesystemName,
        cred
      );
    } catch (e: any) {
      console.log(`⚠️ OAuth filesystem creation failed: ${e?.message || e}`);
      if (e?.statusCode === 403 || e?.code === "AuthorizationPermissionDenied") {
        console.log(`🔄 Falling back to User Delegation SAS approach...`);
        // Fallback path (works under ReadOnly locks if MI can mint UD key)
        fsResult = await createFilesystemWithUdSas(
          body.storageAccountName,
          body.filesystemName,
          cred,
          SAS_TIMEOUT_MINUTES
        );
      } else if (e?.statusCode === 409) {
        // Already exists
        console.log(`ℹ️ Filesystem '${body.filesystemName}' already exists (409). Treating as success.`);
        fsResult = {
          created: false,
          url: `https://${body.storageAccountName}.dfs.core.windows.net/${body.filesystemName}`,
        };
      } else {
        throw e;
      }
    }

    console.log(`✅ Filesystem ready: ${body.filesystemName}`);
    console.log(`🔗 Filesystem URL: ${fsResult?.url}`);

    // Configure CORS for the storage account
    console.log("\n" + "=".repeat(80));
    console.log("🔧 STEP 4: CONFIGURING CORS FOR ADLS STORAGE ACCOUNT");
    console.log("=".repeat(80));
    console.log(`🔧 [ADLS] About to configure CORS for storage account: ${body.storageAccountName} in resource group: ${body.rgName}`);
    await configureCORS(req, body.storageAccountName, body.rgName);
    console.log(`🔧 [ADLS] CORS configuration attempt completed for storage account: ${body.storageAccountName}`);

    // Store ADLS storage account in database
    console.log("\n" + "=".repeat(80));
    console.log("💾 STEP 5: STORING ADLS STORAGE ACCOUNT IN DATABASE");
    console.log("=".repeat(80));
    
    // This will be injected by the routes handler
    const storage = res.locals.storage;
    if (storage) {
      const dbRecord = await storage.createStorageAccount({
        name: storageAccount.name!,
        location: storageAccount.location!,
        containerName: body.filesystemName,
        resourceGroupName: body.rgName,
        organizationId: body.organizationId,
        kind: 'adls',
      });
      console.log(`✅ ADLS storage account saved to database with ID: ${dbRecord.id}`);
    }

    // Activity logging will be handled by the routes file

    // SUCCESS MESSAGES
    console.log("\n" + "✅".repeat(40));
    console.log("🎉 SUCCESS! ADLS Gen2 + SFTP INFRASTRUCTURE CREATED!");
    console.log("✅".repeat(40));
    console.log(`🏷️  Resource Group ID: ${rgResult.id}`);
    console.log(`📦 Resource Group: ${rgResult.name}`);
    console.log(`🗄️  Storage Account: ${storageAccount.name}`);
    console.log(`📋 Filesystem: ${body.filesystemName}`);
    console.log(`🏢 HNS Enabled: ${storageAccount.isHnsEnabled}`);
    console.log(`📡 SFTP Enabled: ${storageAccount.isSftpEnabled}`);
    console.log(`🗺️  Location: ${storageAccount.location}`);
    console.log("✅".repeat(40));
    console.log("🎯 ADLS Gen2 + SFTP PROVISIONING COMPLETED SUCCESSFULLY!");
    console.log("✅".repeat(40) + "\n");

    return res.json({
      ok: true,
      message: "ADLS Gen2 + SFTP storage ensured successfully",
      resourceGroup: {
        id: rgResult.id,
        name: rgResult.name,
        location: rgResult.location,
      },
      storageAccount: {
        id: storageAccount.id,
        name: storageAccount.name,
        location: storageAccount.location,
        hnsEnabled: storageAccount.isHnsEnabled === true,
        sftpEnabled: storageAccount.isSftpEnabled === true,
        endpoints: storageAccount.primaryEndpoints,
      },
      filesystem: {
        name: body.filesystemName,
        created: fsResult?.created ?? false,
        url: fsResult?.url,
      },
    });
  } catch (err: any) {
    // FAILURE MESSAGES
    console.log("\n" + "❌".repeat(40));
    console.log("💥 FAILURE! ADLS Gen2 INFRASTRUCTURE CREATION FAILED!");
    console.log("❌".repeat(40));
    console.log(`🚨 Error Type: ${err?.name || 'Unknown Error'}`);
    console.log(`📄 Error Code: ${err?.code || 'N/A'}`);
    console.log(`💬 Error Message: ${err?.message || String(err)}`);
    console.log(`🎯 This could be Resource Group, Storage Account, or Filesystem creation failure`);
    console.log("❌".repeat(40));
    console.log("🔴 ADLS Gen2 + SFTP PROVISIONING FAILED!");
    console.log("❌".repeat(40) + "\n");

    console.error("[provision-adls] Full error details:", err);
    
    // Check if this is an Azure authorization error and make it user-friendly
    const errorMessage = err?.message || String(err);
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
    
    return res.status(err?.statusCode || 500).json({
      ok: false,
      error: userFriendlyMessage,
      code: err?.code,
      details: err?.details,
    });
  }
}