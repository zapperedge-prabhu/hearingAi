import { apiRequest } from "@/lib/queryClient";

// Types for ADLS provisioning
export interface ProvisionAdlsRequest {
  rgName: string;
  storageAccountName: string;
  filesystemName: string;
  location?: string;
  enableSftp?: boolean;
  enableHns?: boolean;
  organizationId: number;
  tags?: Record<string, string>;
}

export interface ProvisionAdlsResponse {
  ok: boolean;
  message: string;
  resourceGroup: {
    id: string;
    name: string;
    location: string;
  };
  storageAccount: {
    id: string;
    name: string;
    location: string;
    hnsEnabled: boolean;
    sftpEnabled: boolean;
    endpoints: any;
  };
  filesystem: {
    name: string;
    created: boolean;
    url: string;
  };
}

/**
 * Provisions a new ADLS Gen2 storage account with SFTP support
 * This uses the advanced v2 provisioning API with OAuth + User Delegation SAS fallback
 */
export async function provisionAdlsStorage(data: ProvisionAdlsRequest): Promise<ProvisionAdlsResponse> {
  const response = await apiRequest("POST", `/api/organizations/${data.organizationId}/provision-adls`, data);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Provisioning failed" }));
    throw new Error(errorData.error || `Provisioning failed with status ${response.status}`);
  }
  
  return response.json();
}

/**
 * Validates storage account name according to Azure naming rules
 */
export function validateStorageAccountName(name: string): { valid: boolean; error?: string } {
  if (!name) {
    return { valid: false, error: "Storage account name is required" };
  }
  
  if (name.length < 3 || name.length > 24) {
    return { valid: false, error: "Storage account name must be 3-24 characters long" };
  }
  
  if (!/^[a-z0-9]+$/.test(name)) {
    return { valid: false, error: "Storage account name must contain only lowercase letters and numbers" };
  }
  
  return { valid: true };
}

/**
 * Validates filesystem name according to ADLS Gen2 naming rules
 */
export function validateFilesystemName(name: string): { valid: boolean; error?: string } {
  if (!name) {
    return { valid: false, error: "Filesystem name is required" };
  }
  
  if (name.length < 3 || name.length > 63) {
    return { valid: false, error: "Filesystem name must be 3-63 characters long" };
  }
  
  if (!/^[a-z0-9-]+$/.test(name)) {
    return { valid: false, error: "Filesystem name must contain only lowercase letters, numbers, and hyphens" };
  }
  
  if (name.startsWith('-') || name.endsWith('-')) {
    return { valid: false, error: "Filesystem name cannot start or end with a hyphen" };
  }
  
  return { valid: true };
}

/**
 * Validates resource group name according to Azure naming rules
 */
export function validateResourceGroupName(name: string): { valid: boolean; error?: string } {
  if (!name) {
    return { valid: false, error: "Resource group name is required" };
  }
  
  if (name.length < 2 || name.length > 90) {
    return { valid: false, error: "Resource group name must be 2-90 characters long" };
  }
  
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    return { valid: false, error: "Resource group name must contain only letters, numbers, periods, underscores, and hyphens" };
  }
  
  if (name.endsWith('.')) {
    return { valid: false, error: "Resource group name cannot end with a period" };
  }
  
  return { valid: true };
}

/**
 * Azure regions commonly used for ADLS Gen2 deployments
 */
export const AZURE_REGIONS = [
  { value: "centralindia", label: "Central India" },
  { value: "eastus", label: "East US" },
  { value: "eastus2", label: "East US 2" },
  { value: "westus", label: "West US" },
  { value: "westus2", label: "West US 2" },
  { value: "northeurope", label: "North Europe" },
  { value: "westeurope", label: "West Europe" },
  { value: "southeastasia", label: "Southeast Asia" },
  { value: "australiaeast", label: "Australia East" },
  { value: "canadacentral", label: "Canada Central" },
  { value: "japaneast", label: "Japan East" },
  { value: "koreacentral", label: "Korea Central" },
  { value: "uksouth", label: "UK South" },
  { value: "brazilsouth", label: "Brazil South" },
  { value: "southafricanorth", label: "South Africa North" },
  { value: "uaenorth", label: "UAE North" },
] as const;

export type AzureRegion = typeof AZURE_REGIONS[number]['value'];