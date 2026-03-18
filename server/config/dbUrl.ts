// zapper-mft/server/config/dbUrl.ts
import 'dotenv/config';
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

export async function getDatabaseUrl(): Promise<string> {
  const useKeyVault = String(process.env.ZAPPER_USE_KEYVAULT || "false").toLowerCase() === "true";

  if (!useKeyVault) {
    const local = process.env.DATABASE_URL;
    if (!local) {
      throw new Error("ZAPPER_USE_KEYVAULT=false, but DATABASE_URL is not set.");
    }
    return local;
  }

  const keyVaultUrl = process.env.KEY_VAULT_URL; // e.g. https://<vault>.vault.azure.net/
  if (!keyVaultUrl) {
    throw new Error("ZAPPER_USE_KEYVAULT=true, but KEY_VAULT_URL is not set.");
  }
  const secretName = process.env.DB_SECRET_NAME || "DatabaseUrl";

  try {
    const credential = new DefaultAzureCredential();
    const client = new SecretClient(keyVaultUrl, credential);
    const secret = await client.getSecret(secretName);
    const value = secret?.value?.trim();
    if (!value) throw new Error(`Secret '${secretName}' is empty or not found.`);
    return value;
  } catch (err: any) {
    const msg = err?.message || String(err);
    throw new Error(`Failed to read '${secretName}' from Key Vault: ${msg}`);
  }
}