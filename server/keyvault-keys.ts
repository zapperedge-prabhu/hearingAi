import { DefaultAzureCredential } from '@azure/identity';
import { KeyClient, KeyVaultKey, CreateRsaKeyOptions } from '@azure/keyvault-keys';

const keyVaultUrl = process.env.KEY_VAULT_URL;
let keyClient: KeyClient | null = null;

export interface KeyVaultKeyInfo {
  name: string;
  id: string;
  keyType: string;
  enabled: boolean;
  createdOn?: Date;
  updatedOn?: Date;
  expiresOn?: Date;
  version?: string;
  keyUri: string;
  keyUriWithVersion: string;
}

export interface KeyVaultKeyError {
  type: 'KEY_VAULT_KEY_ERROR';
  code: string;
  message: string;
  keyVaultUrl: string;
  details: string;
  instructions: string[];
}

function getKeyClient(): KeyClient {
  if (!keyClient && keyVaultUrl) {
    const credential = new DefaultAzureCredential();
    keyClient = new KeyClient(keyVaultUrl, credential);
  }
  if (!keyClient) {
    throw new Error('Azure Key Vault URL not configured');
  }
  return keyClient;
}

export function isKeyVaultConfigured(): boolean {
  return !!keyVaultUrl;
}

export function getKeyVaultUrl(): string | undefined {
  return keyVaultUrl;
}

export async function listKeys(): Promise<KeyVaultKeyInfo[]> {
  if (!keyVaultUrl) {
    console.warn('[KEY VAULT KEYS] KEY_VAULT_URL not configured');
    return [];
  }

  try {
    console.log(`[KEY VAULT KEYS] Listing keys from: ${keyVaultUrl}`);
    const client = getKeyClient();
    const keys: KeyVaultKeyInfo[] = [];

    for await (const keyProperties of client.listPropertiesOfKeys()) {
      const keyUri = `${keyVaultUrl.replace(/\/$/, '')}/keys/${keyProperties.name}`;
      const keyUriWithVersion = keyProperties.version 
        ? `${keyUri}/${keyProperties.version}` 
        : keyUri;

      keys.push({
        name: keyProperties.name,
        id: keyProperties.id || keyUri,
        keyType: 'RSA',
        enabled: keyProperties.enabled ?? true,
        createdOn: keyProperties.createdOn,
        updatedOn: keyProperties.updatedOn,
        expiresOn: keyProperties.expiresOn,
        version: keyProperties.version,
        keyUri,
        keyUriWithVersion,
      });
    }

    console.log(`[KEY VAULT KEYS] Found ${keys.length} keys`);
    return keys;
  } catch (error: any) {
    console.error('[KEY VAULT KEYS] Error listing keys:', error);
    throw createKeyVaultError(error, 'list keys');
  }
}

export async function createKey(
  keyName: string,
  keySize: number = 2048
): Promise<KeyVaultKeyInfo> {
  if (!keyVaultUrl) {
    const error: any = new Error('Azure Key Vault URL not configured');
    error.keyVaultKeyError = {
      type: 'KEY_VAULT_KEY_ERROR',
      code: 'NotConfigured',
      message: 'Azure Key Vault URL is not configured',
      keyVaultUrl: 'Not Set',
      details: 'KEY_VAULT_URL environment variable is not set',
      instructions: [
        'Set the KEY_VAULT_URL environment variable to your Azure Key Vault URL',
        'Example: https://my-keyvault.vault.azure.net/',
      ],
    } as KeyVaultKeyError;
    throw error;
  }

  try {
    console.log(`[KEY VAULT KEYS] Creating RSA key: ${keyName} (${keySize} bits)`);
    const client = getKeyClient();

    const options: CreateRsaKeyOptions = {
      keySize,
      keyOps: ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'],
    };

    const key: KeyVaultKey = await client.createRsaKey(keyName, options);

    const keyUri = `${keyVaultUrl.replace(/\/$/, '')}/keys/${key.name}`;
    const keyUriWithVersion = key.properties.version 
      ? `${keyUri}/${key.properties.version}` 
      : keyUri;

    console.log(`[KEY VAULT KEYS] Successfully created key: ${keyName}`);

    return {
      name: key.name,
      id: key.id || keyUri,
      keyType: key.keyType || 'RSA',
      enabled: key.properties.enabled ?? true,
      createdOn: key.properties.createdOn,
      updatedOn: key.properties.updatedOn,
      expiresOn: key.properties.expiresOn,
      version: key.properties.version,
      keyUri,
      keyUriWithVersion,
    };
  } catch (error: any) {
    console.error('[KEY VAULT KEYS] Error creating key:', error);
    throw createKeyVaultError(error, 'create key');
  }
}

export async function getKey(keyName: string): Promise<KeyVaultKeyInfo | null> {
  if (!keyVaultUrl) {
    return null;
  }

  try {
    console.log(`[KEY VAULT KEYS] Getting key: ${keyName}`);
    const client = getKeyClient();
    const key = await client.getKey(keyName);

    const keyUri = `${keyVaultUrl.replace(/\/$/, '')}/keys/${key.name}`;
    const keyUriWithVersion = key.properties.version 
      ? `${keyUri}/${key.properties.version}` 
      : keyUri;

    return {
      name: key.name,
      id: key.id || keyUri,
      keyType: key.keyType || 'unknown',
      enabled: key.properties.enabled ?? true,
      createdOn: key.properties.createdOn,
      updatedOn: key.properties.updatedOn,
      expiresOn: key.properties.expiresOn,
      version: key.properties.version,
      keyUri,
      keyUriWithVersion,
    };
  } catch (error: any) {
    if (error.code === 'KeyNotFound' || error.statusCode === 404) {
      return null;
    }
    console.error('[KEY VAULT KEYS] Error getting key:', error);
    throw createKeyVaultError(error, 'get key');
  }
}

export async function deleteKey(keyName: string): Promise<void> {
  if (!keyVaultUrl) {
    console.warn('[KEY VAULT KEYS] KEY_VAULT_URL not configured');
    return;
  }

  try {
    console.log(`[KEY VAULT KEYS] Deleting key: ${keyName}`);
    const client = getKeyClient();
    const poller = await client.beginDeleteKey(keyName);
    await poller.pollUntilDone();
    console.log(`[KEY VAULT KEYS] Successfully deleted key: ${keyName}`);
  } catch (error: any) {
    console.error('[KEY VAULT KEYS] Error deleting key:', error);
    throw createKeyVaultError(error, 'delete key');
  }
}

function createKeyVaultError(error: any, operation: string): Error {
  const keyVaultName = keyVaultUrl 
    ? keyVaultUrl.replace(/^https?:\/\//, '').replace(/\.vault\.azure\.net\/?.*$/, '') 
    : 'unknown';

  let keyVaultKeyError: KeyVaultKeyError;

  if (error.code === 'Forbidden' || error.statusCode === 403) {
    keyVaultKeyError = {
      type: 'KEY_VAULT_KEY_ERROR',
      code: 'Forbidden',
      message: `The application does not have permission to ${operation} in Key Vault "${keyVaultName}"`,
      keyVaultUrl: keyVaultUrl || 'unknown',
      details: error.message || 'Access denied',
      instructions: [
        `Ensure the application's managed identity has Key Vault key permissions`,
        `Required permissions: get, list, create, update, import`,
        `You can configure this in Azure Portal > Key Vault > Access policies`,
      ],
    };
  } else if (error.code === 'Unauthorized' || error.statusCode === 401) {
    keyVaultKeyError = {
      type: 'KEY_VAULT_KEY_ERROR',
      code: 'Unauthorized',
      message: `Authentication failed for Key Vault "${keyVaultName}"`,
      keyVaultUrl: keyVaultUrl || 'unknown',
      details: error.message || 'Authentication error',
      instructions: [
        'Ensure the application has a valid managed identity',
        'Check that DefaultAzureCredential can authenticate',
      ],
    };
  } else {
    keyVaultKeyError = {
      type: 'KEY_VAULT_KEY_ERROR',
      code: error.code || 'Unknown',
      message: `Failed to ${operation}: ${error.message || 'Unknown error'}`,
      keyVaultUrl: keyVaultUrl || 'unknown',
      details: error.message || 'An unexpected error occurred',
      instructions: [
        'Check the Key Vault URL is correct',
        'Verify the key exists and is enabled',
        'Check application permissions on Key Vault',
      ],
    };
  }

  const wrappedError: any = new Error(keyVaultKeyError.message);
  wrappedError.keyVaultKeyError = keyVaultKeyError;
  return wrappedError;
}
