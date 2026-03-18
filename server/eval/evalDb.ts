import { StorageManagementClient } from "@azure/arm-storage";
import { DefaultAzureCredential } from "@azure/identity";
import {
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  SASProtocol,
} from "@azure/storage-blob";
import { storage } from "../storage";

export async function generateReadSasForOrgPath(
  organizationId: number,
  blobPath: string
): Promise<string> {
  const orgStorage = await storage.getStorageAccountByOrganization(organizationId);
  if (!orgStorage) throw new Error(`No storage account for org ${organizationId}`);

  const accountName = orgStorage.name;
  const containerName = orgStorage.containerName;
  const storageResourceGroup = (orgStorage as any).resourceGroupName;

  const subscriptionId = process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || process.env.AZURE_SUBSCRIPTION_ID;
  const resourceGroup = storageResourceGroup || process.env.ZAPPER_AZURE_RESOURCE_GROUP || process.env.AZURE_RESOURCE_GROUP;

  if (!subscriptionId || !resourceGroup) {
    throw new Error("Missing Azure subscription ID or resource group for SAS generation");
  }

  console.log(`[EvalSAS] Using resource group '${resourceGroup}' for storage account '${accountName}'`);

  const credential = new DefaultAzureCredential();
  const mgmtClient = new StorageManagementClient(credential, subscriptionId);
  const keysResult = await mgmtClient.storageAccounts.listKeys(resourceGroup, accountName);
  const key = keysResult.keys?.[0]?.value;
  if (!key) throw new Error(`Could not retrieve storage key for ${accountName}`);

  const sharedKeyCred = new StorageSharedKeyCredential(accountName, key);
  const expiryTime = new Date();
  expiryTime.setMinutes(expiryTime.getMinutes() + 30);

  const sasParams = generateBlobSASQueryParameters(
    {
      containerName,
      blobName: blobPath,
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: expiryTime,
      protocol: SASProtocol.Https,
    },
    sharedKeyCred
  );

  return `https://${accountName}.blob.core.windows.net/${containerName}/${blobPath}?${sasParams.toString()}`;
}
