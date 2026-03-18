import * as openpgp from 'openpgp';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

// Initialize Azure Key Vault client
const keyVaultUrl = process.env.KEY_VAULT_URL;
let secretClient: SecretClient | null = null;

function getSecretClient(): SecretClient {
  if (!secretClient && keyVaultUrl) {
    const credential = new DefaultAzureCredential();
    secretClient = new SecretClient(keyVaultUrl, credential);
  }
  return secretClient!;
}

// Generate new PGP keypair
export async function generatePgpKeypair(organizationId: number): Promise<{
  publicKeyArmored: string;
  privateKeyArmored: string;
  keyId: string;
}> {
  try {
    const result = await openpgp.generateKey({
      type: 'rsa',
      rsaBits: 4096,
      userIDs: [
        {
          name: 'Zapper',
          email: `org-${organizationId}@zapper.local`,
        },
      ],
      format: 'armored',
    }) as any;

    // With format: 'armored', the property is 'publicKey' not 'publicKeyArmored'
    const publicKeyArmored = result.publicKey;
    const privateKeyArmored = result.privateKey;

    // Parse the public key to extract fingerprint
    const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
    const fingerprint = publicKey.getFingerprint();
    
    // Convert Uint8Array to hex string and take first 16 chars
    const keyId = Array.from(fingerprint as unknown as number[])
      .map((b: number) => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 16)
      .toUpperCase();

    return {
      publicKeyArmored,
      privateKeyArmored,
      keyId,
    };
  } catch (error) {
    console.error('Error generating PGP keypair:', error);
    throw new Error('Failed to generate PGP keypair');
  }
}

// Validate and parse imported PGP private key
export async function validateAndParsePrivateKey(
  privateKeyArmored: string,
  passphrase?: string
): Promise<{
  publicKeyArmored: string;
  keyId: string;
}> {
  try {
    const privateKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });

    // If passphrase provided, try to unlock
    if (passphrase) {
      await (privateKey as any).decrypt(passphrase);
    }

    // Extract public key
    const publicKey = privateKey.toPublic();
    const publicKeyArmored = publicKey.armor();

    // Get key ID from fingerprint
    const fingerprint = publicKey.getFingerprint();
    const keyId = Array.from(fingerprint as unknown as number[])
      .map((b: number) => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 16)
      .toUpperCase();

    return {
      publicKeyArmored,
      keyId,
    };
  } catch (error) {
    console.error('Error parsing private key:', error);
    throw new Error('Invalid PGP private key format or incorrect passphrase');
  }
}

// Validate and parse imported PGP public key (for partner keys)
export async function validateAndParsePublicKey(
  publicKeyArmored: string
): Promise<{
  publicKeyArmored: string;
  keyId: string;
}> {
  try {
    const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });

    // Get key ID from fingerprint
    const fingerprint = publicKey.getFingerprint();
    const keyId = Array.from(fingerprint as unknown as number[])
      .map((b: number) => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 16)
      .toUpperCase();

    return {
      publicKeyArmored: publicKey.armor(),
      keyId,
    };
  } catch (error) {
    console.error('Error parsing public key:', error);
    throw new Error('Invalid PGP public key format');
  }
}

// Validate that a private key and public key are a matching pair
export async function validateKeyPairMatch(
  privateKeyArmored: string,
  publicKeyArmored: string,
  passphrase?: string
): Promise<{
  keyId: string;
  isValid: boolean;
}> {
  // Parse private key
  let privateKey;
  try {
    privateKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });
  } catch (error) {
    console.error('Error parsing private key:', error);
    throw new Error('Invalid private key format. Please ensure you are providing a valid PGP private key.');
  }
  
  // If passphrase provided, try to unlock
  if (passphrase) {
    try {
      await (privateKey as any).decrypt(passphrase);
    } catch (error) {
      console.error('Error decrypting private key:', error);
      throw new Error('Failed to decrypt private key. The passphrase may be incorrect.');
    }
  }
  
  // Parse provided public key
  let publicKey;
  try {
    publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
  } catch (error) {
    console.error('Error parsing public key:', error);
    throw new Error('Invalid public key format. Please ensure you are providing a valid PGP public key.');
  }
  
  // Get fingerprint from private key's public component
  const privateKeyPublic = privateKey.toPublic();
  const privateFingerprint = privateKeyPublic.getFingerprint();
  const privateKeyId = Array.from(privateFingerprint as unknown as number[])
    .map((b: number) => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 16)
    .toUpperCase();
  
  const publicFingerprint = publicKey.getFingerprint();
  const publicKeyId = Array.from(publicFingerprint as unknown as number[])
    .map((b: number) => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 16)
    .toUpperCase();
  
  // Compare fingerprints to verify they match
  const privateFullFingerprint = Array.from(privateFingerprint as unknown as number[])
    .map((b: number) => b.toString(16).padStart(2, '0'))
    .join('');
  const publicFullFingerprint = Array.from(publicFingerprint as unknown as number[])
    .map((b: number) => b.toString(16).padStart(2, '0'))
    .join('');
  
  const isValid = privateFullFingerprint === publicFullFingerprint;
  
  if (!isValid) {
    console.error(`🔴 [PGP] Key pair mismatch: Private KeyID=${privateKeyId}, Public KeyID=${publicKeyId}`);
  }
  
  return {
    keyId: publicKeyId,
    isValid,
  };
}

// Error type for Key Vault permission issues
export interface KeyVaultPermissionError {
  type: 'KEY_VAULT_PERMISSION_ERROR';
  code: string;
  message: string;
  keyVaultUrl: string;
  details: string;
  instructions: string[];
}

// Decide where to store private key based on environment configuration
// ATOMIC: If Key Vault is required and fails, throws error - no fallback
export async function storePrivateKey(
  secretName: string,
  privateKeyArmored: string
): Promise<{ storedInKeyVault: boolean; storedInDatabase: boolean }> {
  const useKeyVault = process.env.ZAPPER_READ_PGP_MY_KB === 'true';

  if (useKeyVault) {
    // Key Vault is required - throw error on failure, no fallback
    await storePrivateKeyInKeyVault(secretName, privateKeyArmored);
    return { storedInKeyVault: true, storedInDatabase: false };
  } else {
    console.log('✅ [PGP STORAGE] ZAPPER_READ_PGP_MY_KB is false/not set - private key will be stored in database');
    return { storedInKeyVault: false, storedInDatabase: true };
  }
}

// Store private key in Azure Key Vault
export async function storePrivateKeyInKeyVault(
  secretName: string,
  privateKeyArmored: string
): Promise<void> {
  if (!keyVaultUrl) {
    console.error('🔴 [KEY VAULT] KEY_VAULT_URL environment variable is NOT configured!');
    const error: any = new Error('Azure Key Vault URL not configured. ZAPPER_READ_PGP_MY_KB is set to true but KEY_VAULT_URL is missing.');
    error.keyVaultError = {
      type: 'KEY_VAULT_PERMISSION_ERROR',
      code: 'NotConfigured',
      message: 'Azure Key Vault URL is not configured',
      keyVaultUrl: 'Not Set',
      details: 'The ZAPPER_READ_PGP_MY_KB environment variable is set to "true" which requires Key Vault storage, but KEY_VAULT_URL is not configured.',
      instructions: [
        'Set the KEY_VAULT_URL environment variable to your Azure Key Vault URL',
        'Example: https://my-keyvault.vault.azure.net/',
        'Or set ZAPPER_READ_PGP_MY_KB to "false" to store private keys in the database instead'
      ]
    } as KeyVaultPermissionError;
    throw error;
  }

  try {
    console.log(`✅ [KEY VAULT] Storing private key with secret name: ${secretName}`);
    console.log(`✅ [KEY VAULT] Key Vault URL: ${keyVaultUrl}`);
    const client = getSecretClient();
    await client.setSecret(secretName, privateKeyArmored);
    console.log(`✅ [KEY VAULT] ========================================`);
    console.log(`✅ [KEY VAULT] SUCCESS! Private key stored in Key Vault`);
    console.log(`✅ [KEY VAULT] ========================================`);
    console.log(`✅ [KEY VAULT] Key Vault URL: ${keyVaultUrl}`);
    console.log(`✅ [KEY VAULT] Secret Name: ${secretName}`);
    console.log(`✅ [KEY VAULT] Access in Azure Portal: ${keyVaultUrl.replace(/\/$/, '')}/secrets/${secretName}`);
    console.log(`✅ [KEY VAULT] ========================================`);
  } catch (error: any) {
    console.error('❌ [KEY VAULT] Error storing private key in Key Vault:', error);
    
    // Extract Key Vault name from URL for error message
    const keyVaultName = keyVaultUrl.replace(/^https?:\/\//, '').replace(/\.vault\.azure\.net\/?.*$/, '');
    
    // Check for permission/authorization errors (403 Forbidden)
    if (error.code === 'Forbidden' || error.statusCode === 403) {
      const permissionError: any = new Error('Key Vault permission denied - the application does not have secrets set permission');
      permissionError.keyVaultError = {
        type: 'KEY_VAULT_PERMISSION_ERROR',
        code: 'Forbidden',
        message: `The application does not have permission to set secrets in Key Vault "${keyVaultName}"`,
        keyVaultUrl: keyVaultUrl,
        details: error.message || 'Access denied by Azure Key Vault policy',
        instructions: [
          `Go to Azure Portal > Key Vault "${keyVaultName}" > Access policies`,
          'Add an access policy for the application\'s managed identity',
          'Grant "Secret permissions: Get, Set, Delete" to the application',
          'The application\'s managed identity ID can be found in Container Apps > Identity',
          'Or set ZAPPER_READ_PGP_MY_KB to "false" to store private keys in the database instead'
        ]
      } as KeyVaultPermissionError;
      throw permissionError;
    }
    
    // Generic Key Vault error
    const genericError: any = new Error('Failed to store private key in Azure Key Vault');
    genericError.keyVaultError = {
      type: 'KEY_VAULT_PERMISSION_ERROR',
      code: error.code || 'Unknown',
      message: `Failed to store secret in Key Vault "${keyVaultName}"`,
      keyVaultUrl: keyVaultUrl,
      details: error.message || 'Unknown error occurred',
      instructions: [
        'Check that the Key Vault exists and is accessible',
        'Verify the application has proper permissions configured',
        'Check Azure Portal for any Key Vault firewall rules that may block access',
        'Or set ZAPPER_READ_PGP_MY_KB to "false" to store private keys in the database instead'
      ]
    } as KeyVaultPermissionError;
    throw genericError;
  }
}

// Retrieve private key from Azure Key Vault (internal use only)
export async function getPrivateKeyFromKeyVault(secretName: string): Promise<string> {
  try {
    if (!keyVaultUrl) {
      throw new Error('Azure Key Vault URL not configured');
    }

    const client = getSecretClient();
    const secret = await client.getSecret(secretName);
    return secret.value!;
  } catch (error) {
    console.error('Error retrieving private key from Key Vault:', error);
    throw new Error('Failed to retrieve private key from Azure Key Vault');
  }
}

// Delete private key from Azure Key Vault
export async function deletePrivateKeyFromKeyVault(secretName: string): Promise<void> {
  try {
    if (!keyVaultUrl) {
      console.warn('Azure Key Vault URL not configured');
      return;
    }

    const client = getSecretClient();
    const poller = await client.beginDeleteSecret(secretName);
    await poller.pollUntilDone();
  } catch (error) {
    console.error('Error deleting private key from Key Vault:', error);
    throw new Error('Failed to delete private key from Azure Key Vault');
  }
}

// Encrypt file data using public key
export async function encryptFileData(
  data: Buffer,
  publicKeyArmored: string
): Promise<Buffer> {
  try {
    const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
    
    const message = await openpgp.createMessage({ binary: data });
    const encrypted = await openpgp.encrypt({
      message,
      encryptionKeys: publicKey,
      format: 'binary'
    });
    
    return Buffer.from(encrypted as Uint8Array);
  } catch (error) {
    console.error('Error encrypting file data:', error);
    throw new Error('Failed to encrypt file data');
  }
}

// Retrieve private key from either Key Vault or database
export async function getPrivateKey(
  keyVaultSecretName: string | null,
  databasePrivateKeyData: string | null
): Promise<string> {
  if (databasePrivateKeyData) {
    console.log('✅ [PGP STORAGE] Retrieving private key from database');
    return databasePrivateKeyData;
  }
  
  if (keyVaultSecretName) {
    console.log('✅ [PGP STORAGE] Retrieving private key from Key Vault');
    return await getPrivateKeyFromKeyVault(keyVaultSecretName);
  }
  
  throw new Error('No private key storage found (neither Key Vault secret name nor database data)');
}

// Decrypt file data using private key from Key Vault or Database
export async function decryptFileData(
  encryptedData: Buffer,
  keyVaultSecretName: string | null,
  databasePrivateKeyData: string | null,
  passphrase?: string
): Promise<Buffer> {
  try {
    // Retrieve private key from appropriate storage
    const privateKeyArmored = await getPrivateKey(keyVaultSecretName, databasePrivateKeyData);
    
    let privateKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });
    
    // Decrypt the private key if passphrase is provided
    if (passphrase) {
      privateKey = await openpgp.decryptKey({
        privateKey,
        passphrase
      });
    }
    
    const message = await openpgp.readMessage({ binaryMessage: encryptedData });
    const decrypted = await openpgp.decrypt({
      message,
      decryptionKeys: privateKey,
      format: 'binary'
    });
    
    return Buffer.from(decrypted.data as Uint8Array);
  } catch (error) {
    console.error('Error decrypting file data:', error);
    throw new Error('Failed to decrypt file data');
  }
}
