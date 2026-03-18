// Azure Container Apps (ACA) AI Agent Service - Auto-detects processor endpoint
import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import fetch from "node-fetch";
import axios from "axios";

class AcaAIAgentService {
  private credential: DefaultAzureCredential;
  private subscriptionId: string;
  private resourceGroup: string;
  
  // 🔄 Dynamic Container App info caching - loaded once and reused
  private containerAppName: string;  // Container app name constructed from web app name
  private containerPrincipalId: string | null = null;              // Cached managed identity principal ID
  private containerFqdn: string | null = null;                     // Cached ingress FQDN for API calls

  constructor() {
    this.credential = new DefaultAzureCredential();
    this.subscriptionId = process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || process.env.AZURE_SUBSCRIPTION_ID || '';
    this.resourceGroup = process.env.ZAPPER_AZURE_RESOURCE_GROUP || process.env.AZURE_RESOURCE_GROUP || 'agentsrepo';
    
    // Construct container app name from web app name (matches ARM template pattern)
    // ARM template uses: [concat(parameters('webAppName'), '-aiagp')]
    const webAppName = process.env.WEBSITE_SITE_NAME || 'zapper';
    this.containerAppName = `${webAppName}-aiagp`;
    
    // Allow development mode without Azure configuration
    const isDevelopment = process.env.NODE_ENV === 'development';
    if (!this.subscriptionId || !this.resourceGroup) {
      if (!isDevelopment) {
        throw new Error('Azure subscription ID and resource group must be configured for AI Agent');
      } else {
        console.log('🔧 AI Agent Service running in development mode - Azure features disabled');
        return;
      }
    }

    console.log('🔧 AI Agent Service initialized with:');
    console.log(`   Web App Name: ${webAppName}`);
    console.log(`   Resource Group: ${this.resourceGroup}`);
    console.log(`   Container App Name: ${this.containerAppName}`);
  }

  /**
   * Get Azure access token for REST API calls
   */
  private async getAccessToken(): Promise<string> {
    try {
      const tokenResponse = await this.credential.getToken(['https://management.azure.com/.default']);
      return tokenResponse.token;
    } catch (error) {
      console.error('Failed to get Azure access token:', error);
      throw new Error('Azure authentication failed');
    }
  }

  /**
   * 🔍 Ensure we've loaded the container app's principal ID and FQDN
   * This method fetches container app details from Azure and caches them
   * for subsequent API calls. Only makes the API call once per service instance.
   */
  private async ensureContainerAppInfoLoaded(): Promise<void> {
    // 📋 Skip if already loaded - cache hit
    if (this.containerPrincipalId && this.containerFqdn) {
      console.log(`📋 [AI-AGENT-INFO] Using cached container app info - PrincipalID: ${this.containerPrincipalId}, FQDN: ${this.containerFqdn}`);
      return;
    }

    console.log(`🔍 [AI-AGENT-INFO] Fetching Container App details from Azure for: ${this.containerAppName}`);
    
    try {
      // 🔐 Get access token for Azure Resource Manager API
      const token = await this.getAccessToken();
      
      // 🌐 Build Azure Resource Manager API URL for Container App details
      const url = `https://management.azure.com/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}` + 
                  `/providers/Microsoft.App/containerApps/${this.containerAppName}?api-version=2023-05-01`;
      
      console.log(`🌐 [AI-AGENT-INFO] Calling Azure API: ${url}`);
      
      // 📡 Make API call to get container app information
      const res = await fetch(url, { 
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        } 
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`❌ [AI-AGENT-INFO] Failed to get Container App info: ${res.status} ${res.statusText}`);
        console.error(`❌ [AI-AGENT-INFO] Error details: ${errorText}`);
        
        // Provide user-friendly error message
        if (res.status === 404) {
          throw new Error(
            `AI Agent feature is not configured. The AI Agent Container App (${this.containerAppName}) was not found in your Azure deployment. ` +
            `Please ensure you have enabled AI Agent during deployment or redeploy with AI Agent enabled.`
          );
        }
        throw new Error(`Failed to get Container App info: ${res.status} ${res.statusText}`);
      }

      // 📦 Parse response and extract key information
      const appInfo = await res.json() as any;
      
      // 🆔 Extract managed identity principal ID for role assignments
      this.containerPrincipalId = appInfo.identity?.principalId;
      
      // 🌍 Extract ingress FQDN - try multiple possible locations
      this.containerFqdn = appInfo.properties?.latestRevisionFqdn || 
                          appInfo.properties?.configuration?.ingress?.fqdn ||
                          appInfo.properties?.ingress?.fqdn;

      // 📊 Log the extracted information for debugging
      console.log(`✅ [AI-AGENT-INFO] Successfully loaded container app info:`);
      console.log(`   📋 Container App: ${this.containerAppName}`);
      console.log(`   🆔 Principal ID: ${this.containerPrincipalId || 'not found'}`);
      console.log(`   🌍 FQDN: ${this.containerFqdn || 'not found'}`);

      // ⚠️ Warn if critical information is missing
      if (!this.containerPrincipalId) {
        console.warn(`⚠️  [AI-AGENT-INFO] No managed identity principal ID found - role assignment may fail`);
      }
      if (!this.containerFqdn) {
        console.warn(`⚠️  [AI-AGENT-INFO] No ingress FQDN found - will fall back to environment variable or default`);
      }

    } catch (error) {
      console.error(`❌ [AI-AGENT-INFO] Error loading container app info:`, error);
      // 🔄 Don't throw here - let the calling method handle fallbacks
      console.warn(`⚠️  [AI-AGENT-INFO] Will use fallback URL configuration`);
    }
  }

  /**
   * 🚀 Process an AI agent job synchronously
   * Calls the processor container app HTTP endpoint directly
   */
  async processAIAgent(manifest: any): Promise<any> {
    // 🔄 Determine the processor API endpoint
    let endpoint: string;
    if (process.env.AI_AGENT_PROCESSOR_URL) {
      endpoint = process.env.AI_AGENT_PROCESSOR_URL;
      console.log(`🔧 [AI-AGENT] Using environment override: ${endpoint}`);
    } else {
      console.log(`🌐 [AI-AGENT] Fetching dynamic endpoint from Azure Container App...`);
      await this.ensureContainerAppInfoLoaded();

      if (this.containerFqdn) {
        endpoint = `https://${this.containerFqdn}/api/process`;
        console.log(`✅ [AI-AGENT] Using dynamic endpoint: ${endpoint}`);
      } else {
        throw new Error(
          'AI Agent feature is not properly configured. The Container App endpoint could not be detected automatically. ' +
          'Please contact your administrator to verify that AI Agent was enabled during deployment.'
        );
      }
    }

    // 📡 Call processor endpoint with manifest
    console.log(`📡 [AI-AGENT] Calling processor at: ${endpoint}`);
    
    try {
      const response = await axios.post(
        endpoint,
        { manifest },
        {
          timeout: 120000, // 2 minute timeout
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log(`✅ [AI-AGENT] Processing completed successfully`);
      return response.data;
      
    } catch (error: any) {
      console.error(`❌ [AI-AGENT] Processor failed:`, error.response?.data || error.message);
      throw new Error(`AI Agent processing failed: ${error.response?.data?.details || error.message}`);
    }
  }

  /**
   * Check if AI Agent service is enabled and configured
   */
  isEnabled(): boolean {
    const isDevelopment = process.env.NODE_ENV === 'development';
    return !isDevelopment && !!this.subscriptionId && !!this.resourceGroup;
  }
}

// Singleton instance
export const acaAIAgentService = new AcaAIAgentService();
