import { StorageManagementClient } from "@azure/arm-storage";
import { DefaultAzureCredential } from "@azure/identity";
import * as crypto from "crypto";
import { generateKeyPairSync, createPublicKey } from "crypto";

interface AzureScope {
  subscriptionId: string;
  resourceGroup: string;
  storageAccountName: string;
}

interface SftpPermissions {
  read: boolean;
  write: boolean;
  list: boolean;
  delete: boolean;
}

interface LocalUserPermissionScope {
  containerName: string;
  permissions: SftpPermissions;
}

interface SshKeyPair {
  publicKey: string;
  privateKey: string;
  fingerprint: string;
}

interface AzureLocalUser {
  name?: string;
  hasSshKey?: boolean;
  hasSshPassword?: boolean;
  hasSharedKey?: boolean;
  permissionScopes?: Array<{
    permissions?: string;
    service?: string;
    resourceName?: string;
  }>;
  sshAuthorizedKeys?: Array<{
    key?: string;
    description?: string;
  }>;
}

interface AzurePasswordResult {
  sshPassword?: string;
}

export class AzureSftpLocalUsersService {
  private getClient(subscriptionId: string): any {
    const credential = new DefaultAzureCredential();
    return new StorageManagementClient(credential, subscriptionId);
  }

  async getLocalUser(scope: AzureScope, localUsername: string): Promise<AzureLocalUser | null> {
    try {
      const client = this.getClient(scope.subscriptionId);
      return await client.localUsersOperations.get(scope.resourceGroup, scope.storageAccountName, localUsername);
    } catch (error: any) {
      if (error.statusCode === 404) return null;
      throw error;
    }
  }

  async listLocalUsers(scope: AzureScope): Promise<AzureLocalUser[]> {
    try {
      const client = this.getClient(scope.subscriptionId);
      const users: AzureLocalUser[] = [];
      for await (const user of client.localUsersOperations.list(scope.resourceGroup, scope.storageAccountName)) {
        users.push(user);
      }
      return users;
    } catch (error: any) {
      console.error(`Failed to list local users for ${scope.storageAccountName}:`, error);
      throw error;
    }
  }

  async createLocalUser(
    scope: AzureScope,
    localUsername: string,
    options: {
      sshEnabled: boolean;
      passwordEnabled: boolean;
      permissionScopes: LocalUserPermissionScope[];
    }
  ): Promise<AzureLocalUser> {
    // Validate scope parameters
    if (!scope.subscriptionId) {
      throw new Error("Azure subscription ID is required but was empty");
    }
    if (!scope.resourceGroup) {
      throw new Error("Azure resource group is required but was empty");
    }
    if (!scope.storageAccountName) {
      throw new Error("Storage account name is required but was empty");
    }

    console.log(`[SFTP] Creating local user: ${localUsername} in ${scope.storageAccountName} (RG: ${scope.resourceGroup}, Sub: ${scope.subscriptionId})`);
    
    const client = this.getClient(scope.subscriptionId);
    
    const azureScopes = options.permissionScopes.map(s => ({
      permissions: this.buildPermissionString(s.permissions),
      service: "blob",
      resourceName: s.containerName,
    }));

    return await client.localUsersOperations.createOrUpdate(
      scope.resourceGroup,
      scope.storageAccountName,
      localUsername,
      {
        permissionScopes: azureScopes,
        hasSshKey: options.sshEnabled,
        hasSshPassword: options.passwordEnabled,
        hasSharedKey: false,
        homeDirectory: "/",
      }
    );
  }

  async updateLocalUser(
    scope: AzureScope,
    localUsername: string,
    options: {
      sshEnabled?: boolean;
      passwordEnabled?: boolean;
      permissionScopes?: LocalUserPermissionScope[];
    }
  ): Promise<AzureLocalUser> {
    const client = this.getClient(scope.subscriptionId);
    
    const updateParams: Partial<AzureLocalUser> = {};
    
    if (options.sshEnabled !== undefined) {
      updateParams.hasSshKey = options.sshEnabled;
    }
    if (options.passwordEnabled !== undefined) {
      updateParams.hasSshPassword = options.passwordEnabled;
    }
    if (options.permissionScopes) {
      updateParams.permissionScopes = options.permissionScopes.map(s => ({
        permissions: this.buildPermissionString(s.permissions),
        service: "blob",
        resourceName: s.containerName,
      }));
    }

    return await client.localUsersOperations.createOrUpdate(
      scope.resourceGroup,
      scope.storageAccountName,
      localUsername,
      updateParams
    );
  }

  async disableLocalUser(scope: AzureScope, localUsername: string): Promise<void> {
    const client = this.getClient(scope.subscriptionId);
    await client.localUsersOperations.createOrUpdate(
      scope.resourceGroup,
      scope.storageAccountName,
      localUsername,
      {
        hasSshKey: false,
        hasSshPassword: false,
        permissionScopes: [],
      }
    );
  }

  async deleteLocalUser(scope: AzureScope, localUsername: string): Promise<void> {
    const client = this.getClient(scope.subscriptionId);
    await client.localUsersOperations.delete(scope.resourceGroup, scope.storageAccountName, localUsername);
  }

  async replaceAuthorizedKeys(
    scope: AzureScope,
    localUsername: string,
    publicKey: string,
    description: string = "zapperedge-managed"
  ): Promise<void> {
    const client = this.getClient(scope.subscriptionId);
    await client.localUsersOperations.createOrUpdate(
      scope.resourceGroup,
      scope.storageAccountName,
      localUsername,
      {
        sshAuthorizedKeys: [{ key: publicKey, description }],
        hasSshKey: true,
      }
    );
  }

  async regeneratePassword(scope: AzureScope, localUsername: string): Promise<string> {
    const client = this.getClient(scope.subscriptionId);
    const result = await client.localUsersOperations.regeneratePassword(
      scope.resourceGroup,
      scope.storageAccountName,
      localUsername
    );
    return result.sshPassword!;
  }

  generateSshKeyPair(): SshKeyPair {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });
    
    const opensshPublic = this.pemToOpenSsh(publicKey);
    const fingerprint = this.computeFingerprint(publicKey);
    
    return { publicKey: opensshPublic, privateKey, fingerprint };
  }

  generateSecurePassword(length: number = 32): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const all = uppercase + lowercase + numbers + special;
    
    let password = '';
    password += uppercase[crypto.randomInt(uppercase.length)];
    password += lowercase[crypto.randomInt(lowercase.length)];
    password += numbers[crypto.randomInt(numbers.length)];
    password += special[crypto.randomInt(special.length)];
    
    for (let i = 4; i < length; i++) {
      password += all[crypto.randomInt(all.length)];
    }
    
    return password.split('').sort(() => crypto.randomInt(3) - 1).join('');
  }

  private buildPermissionString(perms: SftpPermissions): string {
    let result = "";
    if (perms.read) result += "r";
    if (perms.write) result += "w";
    if (perms.list) result += "l";
    if (perms.delete) result += "d";
    return result || "r";
  }

  private pemToOpenSsh(pemPublicKey: string): string {
    try {
      const publicKeyObj = createPublicKey({
        key: pemPublicKey,
        format: 'pem',
        type: 'pkcs1'
      });
      
      const jwk = publicKeyObj.export({ format: 'jwk' }) as { e: string; n: string };
      
      const eBytes = Buffer.from(jwk.e, 'base64url');
      const nBytes = Buffer.from(jwk.n, 'base64url');
      
      const nWithPadding = nBytes[0] & 0x80 ? Buffer.concat([Buffer.from([0]), nBytes]) : nBytes;
      
      const keyType = 'ssh-rsa';
      const typeBuffer = Buffer.alloc(4 + keyType.length);
      typeBuffer.writeUInt32BE(keyType.length, 0);
      typeBuffer.write(keyType, 4);
      
      const eBuffer = Buffer.alloc(4 + eBytes.length);
      eBuffer.writeUInt32BE(eBytes.length, 0);
      eBytes.copy(eBuffer, 4);
      
      const nBuffer = Buffer.alloc(4 + nWithPadding.length);
      nBuffer.writeUInt32BE(nWithPadding.length, 0);
      nWithPadding.copy(nBuffer, 4);
      
      const combined = Buffer.concat([typeBuffer, eBuffer, nBuffer]);
      return `${keyType} ${combined.toString('base64')} zapperedge-managed`;
    } catch (error) {
      console.error('Error converting PEM to OpenSSH:', error);
      throw new Error('Failed to convert SSH key format');
    }
  }

  private computeFingerprint(pemPublicKey: string): string {
    try {
      const publicKeyObj = createPublicKey({
        key: pemPublicKey,
        format: 'pem',
        type: 'pkcs1'
      });
      const exported = publicKeyObj.export({ type: 'spki', format: 'der' });
      const hash = crypto.createHash('sha256').update(exported).digest('base64');
      return `SHA256:${hash.replace(/=+$/, '')}`;
    } catch (error) {
      console.error('Error computing fingerprint:', error);
      throw new Error('Failed to compute SSH key fingerprint');
    }
  }
}

export const azureSftpService = new AzureSftpLocalUsersService();
