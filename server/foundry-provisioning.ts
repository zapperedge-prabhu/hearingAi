import { DefaultAzureCredential } from "@azure/identity";
import { ResourceManagementClient } from "@azure/arm-resources";
import { CognitiveServicesManagementClient, Account, Project, Deployment } from "@azure/arm-cognitiveservices";

const SUBSCRIPTION_ID = process.env.ZAPPER_AZURE_SUBSCRIPTION_ID || "";
const DEFAULT_LOCATION = process.env.ZAPPER_DEFAULT_LOCATION || "eastus";

const RESOURCE_TAGS = {
  createdBy: "zapper",
  purpose: "ai-foundry"
};

export interface FoundryHubInput {
  resourceGroup: string;
  hubName: string;
  location: string;
  customSubdomain?: string;
}

export interface FoundryProjectInput {
  resourceGroup: string;
  hubName: string;
  projectName: string;
  displayName?: string;
  location?: string;
}

export interface ModelDeploymentInput {
  resourceGroup: string;
  hubName: string;
  deploymentName: string;
  modelName: string;
  modelVersion?: string;
  modelFormat?: string;
  skuName?: string;
  skuCapacity?: number;
}

export interface FoundryHubResult {
  success: boolean;
  resourceId?: string;
  endpoint?: string;
  provisioningState?: string;
  error?: string;
  details?: any;
}

export interface FoundryProjectResult {
  success: boolean;
  projectId?: string;
  projectName?: string;
  displayName?: string;
  provisioningState?: string;
  error?: string;
  details?: any;
}

export interface ModelDeploymentResult {
  success: boolean;
  deploymentId?: string;
  deploymentName?: string;
  provisioningState?: string;
  error?: string;
  details?: any;
}

export interface FoundryAgentInput {
  hubName: string;
  projectName: string;
  agentName: string;
  deploymentName: string;
  instructions?: string;
  tools?: Array<{ type: string }>;
  hubEndpoint?: string;  // Full endpoint URL (e.g., https://mysubdomain.services.ai.azure.com)
  customSubdomain?: string;  // Just the subdomain part (e.g., mysubdomain)
}

export interface FoundryAgentResult {
  success: boolean;
  agentId?: string;
  agentName?: string;
  model?: string;
  instructions?: string;
  tools?: any[];
  error?: string;
  details?: any;
}

export interface FoundryProvisioningResult {
  success: boolean;
  resourceId?: string;
  projectId?: string;
  projectName?: string;
  projectEndpoint?: string;
  agentId?: string;
  agentName?: string;
  vectorStoreId?: string;
  deploymentId?: string;
  deploymentName?: string;
  error?: string;
  details?: any;
}

export interface FoundryProvisioningInput {
  resourceName: string;
  resourceGroup: string;
  location: string;
  projectName?: string;
  agentName?: string;
  createVectorStore?: boolean;
  deployModel?: boolean;
  modelName?: string;
  modelVersion?: string;
}

class FoundryProvisioningService {
  private credential: DefaultAzureCredential;
  private subscriptionId: string;
  private isConfigured: boolean;
  private cognitiveClient: CognitiveServicesManagementClient | null = null;

  constructor() {
    this.credential = new DefaultAzureCredential();
    this.subscriptionId = SUBSCRIPTION_ID;
    
    const isDevelopment = process.env.NODE_ENV === 'development';
    this.isConfigured = !!this.subscriptionId;
    
    if (!this.isConfigured) {
      if (!isDevelopment) {
        console.error('🔧 [FOUNDRY] Azure subscription ID must be configured for Foundry provisioning');
      } else {
        console.log('🔧 [FOUNDRY] Provisioning service running in development mode - Azure features disabled');
      }
    } else {
      console.log('🔧 [FOUNDRY] Provisioning service initialized with SDK');
      console.log(`   Subscription ID: ${this.subscriptionId.substring(0, 8)}...`);
      this.cognitiveClient = new CognitiveServicesManagementClient(this.credential, this.subscriptionId);
    }
  }

  isEnabled(): boolean {
    return this.isConfigured;
  }

  private getCognitiveClient(): CognitiveServicesManagementClient {
    if (!this.cognitiveClient) {
      throw new Error('Azure not configured for Foundry provisioning');
    }
    return this.cognitiveClient;
  }

  private static readonly ARM_SCOPE = 'https://management.azure.com/.default';
  private static readonly AI_SCOPE = 'https://ai.azure.com/.default';

  private async getAccessToken(): Promise<string> {
    try {
      const tokenResponse = await this.credential.getToken([FoundryProvisioningService.ARM_SCOPE]);
      return tokenResponse.token;
    } catch (error) {
      console.error('[FOUNDRY] Failed to get Azure access token:', error);
      throw new Error('Azure authentication failed');
    }
  }

  private async getAIAccessToken(): Promise<string> {
    try {
      const tokenResponse = await this.credential.getToken([FoundryProvisioningService.AI_SCOPE]);
      return tokenResponse.token;
    } catch (error) {
      console.error('[FOUNDRY] Failed to get Azure AI access token:', error);
      throw new Error('Azure AI authentication failed');
    }
  }

  private getFoundryHost(hubName: string): string {
    return `https://${hubName.toLowerCase()}.services.ai.azure.com`;
  }

  private getProjectEndpoint(hubName: string, projectName: string): string {
    return `${this.getFoundryHost(hubName)}/api/projects/${encodeURIComponent(projectName)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async ensureResourceGroupExists(resourceGroupName: string, location: string): Promise<boolean> {
    if (!this.isConfigured) {
      console.log('[FOUNDRY] Skipping resource group check - not configured');
      return false;
    }

    try {
      console.log(`[FOUNDRY] Checking/creating resource group: ${resourceGroupName}`);
      const resourceClient = new ResourceManagementClient(this.credential, this.subscriptionId);
      
      const exists = await resourceClient.resourceGroups.checkExistence(resourceGroupName);
      
      if (!exists) {
        console.log(`[FOUNDRY] Creating resource group: ${resourceGroupName} in ${location}`);
        await resourceClient.resourceGroups.createOrUpdate(resourceGroupName, {
          location: location,
          tags: RESOURCE_TAGS
        });
        console.log(`[FOUNDRY] Resource group created: ${resourceGroupName}`);
      } else {
        console.log(`[FOUNDRY] Resource group already exists: ${resourceGroupName}`);
      }
      
      return true;
    } catch (error: any) {
      console.error('[FOUNDRY] Error with resource group:', error.message);
      throw new Error(`Failed to ensure resource group: ${error.message}`);
    }
  }

  /**
   * Create a Foundry Hub (Azure Cognitive Services account with kind=AIServices)
   * Uses SDK: client.accounts.beginCreateAndWait
   */
  async createFoundryHub(input: FoundryHubInput): Promise<FoundryHubResult> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Azure not configured. Please set ZAPPER_AZURE_SUBSCRIPTION_ID environment variable.'
      };
    }

    const { resourceGroup, hubName, location, customSubdomain } = input;
    const subdomain = customSubdomain || hubName.toLowerCase();

    try {
      console.log(`[FOUNDRY] Creating Foundry Hub (AIServices): ${hubName}`);
      console.log(`[FOUNDRY] Resource Group: ${resourceGroup}, Location: ${location}`);

      await this.ensureResourceGroupExists(resourceGroup, location);

      const client = this.getCognitiveClient();

      const accountParams: Account = {
        location: location,
        kind: "AIServices",
        sku: { name: "S0" },
        identity: { type: "SystemAssigned" },
        properties: {
          customSubDomainName: subdomain,
          publicNetworkAccess: "Enabled",
          allowProjectManagement: true,
          networkAcls: {
            defaultAction: "Allow"
          }
        } as any,
        tags: RESOURCE_TAGS
      };

      console.log(`[FOUNDRY] Initiating Hub creation with SDK...`);
      const accountResult = await client.accounts.beginCreateAndWait(resourceGroup, hubName, accountParams);

      console.log(`[FOUNDRY] Foundry Hub '${hubName}' created successfully`);
      console.log(`[FOUNDRY] Resource ID: ${accountResult.id}`);
      console.log(`[FOUNDRY] Endpoint: ${accountResult.properties?.endpoint}`);
      console.log(`[FOUNDRY] Provisioning State: ${accountResult.properties?.provisioningState}`);

      return {
        success: true,
        resourceId: accountResult.id,
        endpoint: accountResult.properties?.endpoint,
        provisioningState: accountResult.properties?.provisioningState
      };
    } catch (error: any) {
      console.error('[FOUNDRY] Error creating Foundry Hub:', error.message);
      return {
        success: false,
        error: error.message,
        details: error.details || error.stack
      };
    }
  }

  /**
   * Create a Foundry Project under an existing Hub
   * Uses direct REST API with api-version=2025-06-01 (matches working CLI command)
   */
  async createFoundryProject(input: FoundryProjectInput): Promise<FoundryProjectResult> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Azure not configured. Please set ZAPPER_AZURE_SUBSCRIPTION_ID environment variable.'
      };
    }

    const { resourceGroup, hubName, projectName, displayName, location } = input;
    const projectDisplayName = displayName || projectName;
    const projectLocation = location || DEFAULT_LOCATION;

    try {
      console.log(`[FOUNDRY] Creating Foundry Project: ${projectName}`);
      console.log(`[FOUNDRY] Under Hub: ${hubName}, Resource Group: ${resourceGroup}`);
      console.log(`[FOUNDRY] Using direct REST API with api-version=2025-06-01`);

      const token = await this.getAccessToken();
      
      // Build the REST API URL matching the working CLI command
      const apiVersion = "2025-06-01";
      const url = `https://management.azure.com/subscriptions/${this.subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.CognitiveServices/accounts/${hubName}/projects/${projectName}?api-version=${apiVersion}`;

      const requestBody = {
        location: projectLocation,
        properties: {
          displayName: projectDisplayName
        },
        identity: { type: "SystemAssigned" }
      };

      console.log(`[FOUNDRY] PUT ${url}`);
      console.log(`[FOUNDRY] Request body:`, JSON.stringify(requestBody, null, 2));

      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      const responseText = await response.text();
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { rawResponse: responseText };
      }

      if (!response.ok) {
        console.error(`[FOUNDRY] Project creation failed: ${response.status} ${response.statusText}`);
        console.error(`[FOUNDRY] Response:`, responseData);
        return {
          success: false,
          error: responseData.error?.message || `HTTP ${response.status}: ${response.statusText}`,
          details: responseData
        };
      }

      console.log(`[FOUNDRY] Foundry Project '${projectName}' created successfully`);
      console.log(`[FOUNDRY] Response:`, responseData);

      // Poll for provisioning completion if needed
      const provisioningState = responseData.properties?.provisioningState;
      if (provisioningState === "Creating" || provisioningState === "Accepted") {
        console.log(`[FOUNDRY] Project provisioning in progress, waiting...`);
        await this.waitForProjectProvisioning(resourceGroup, hubName, projectName, token);
      }

      return {
        success: true,
        projectId: responseData.id,
        projectName: responseData.name,
        displayName: responseData.properties?.displayName,
        provisioningState: responseData.properties?.provisioningState || "Succeeded"
      };
    } catch (error: any) {
      console.error('[FOUNDRY] Error creating Foundry Project:', error.message);
      return {
        success: false,
        error: error.message,
        details: error.stack
      };
    }
  }

  /**
   * Wait for project provisioning to complete
   */
  private async waitForProjectProvisioning(
    resourceGroup: string, 
    hubName: string, 
    projectName: string, 
    token: string,
    maxAttempts: number = 30,
    intervalMs: number = 10000
  ): Promise<void> {
    const apiVersion = "2025-06-01";
    const url = `https://management.azure.com/subscriptions/${this.subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.CognitiveServices/accounts/${hubName}/projects/${projectName}?api-version=${apiVersion}`;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.sleep(intervalMs);
      
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        });

        if (response.ok) {
          const data = await response.json();
          const state = data.properties?.provisioningState;
          console.log(`[FOUNDRY] Project provisioning state (attempt ${attempt}/${maxAttempts}): ${state}`);
          
          if (state === "Succeeded") {
            return;
          } else if (state === "Failed") {
            throw new Error(`Project provisioning failed: ${JSON.stringify(data.properties)}`);
          }
        }
      } catch (error: any) {
        console.warn(`[FOUNDRY] Error checking project status: ${error.message}`);
      }
    }

    console.warn(`[FOUNDRY] Project provisioning did not complete within timeout`);
  }

  /**
   * Deploy a model to the Foundry Hub
   * Uses SDK: client.deployments.beginCreateOrUpdateAndWait
   */
  // Model version mapping for Azure OpenAI models
  private static readonly MODEL_VERSION_MAP: Record<string, string> = {
    "gpt-4o": "2024-08-06",
    "gpt-4o-mini": "2024-07-18",
    "gpt-4": "turbo-2024-04-09",
    "gpt-35-turbo": "0125",
    "gpt-3.5-turbo": "0125",
    "text-embedding-ada-002": "2",
    "text-embedding-3-small": "1",
    "text-embedding-3-large": "1",
    // GPT-4.1 models (April 2025)
    "gpt-4.1": "2025-04-14",
    "gpt-4.1-mini": "2025-04-14",
    "gpt-4.1-nano": "2025-04-14",
  };

  async deployModel(input: ModelDeploymentInput): Promise<ModelDeploymentResult> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Azure not configured. Please set ZAPPER_AZURE_SUBSCRIPTION_ID environment variable.'
      };
    }

    const {
      resourceGroup,
      hubName,
      deploymentName,
      modelName,
      modelFormat = "OpenAI",
      skuName = "GlobalStandard",
      skuCapacity = 10
    } = input;
    
    // Use provided version or look up from map, fallback to a reasonable default
    const modelVersion = input.modelVersion || 
      FoundryProvisioningService.MODEL_VERSION_MAP[modelName] || 
      "2024-08-06";

    try {
      console.log(`[FOUNDRY] Deploying model: ${modelName} (version: ${modelVersion}) as ${deploymentName}`);
      console.log(`[FOUNDRY] To Hub: ${hubName}, Resource Group: ${resourceGroup}, SKU: ${skuName}`);

      const client = this.getCognitiveClient();

      const deploymentParams: Deployment = {
        properties: {
          model: {
            format: modelFormat,
            name: modelName,
            version: modelVersion
          }
        },
        sku: {
          name: skuName,
          capacity: skuCapacity
        },
        tags: RESOURCE_TAGS
      };

      console.log(`[FOUNDRY] Initiating model deployment with SDK...`);
      const deploymentResult = await client.deployments.beginCreateOrUpdateAndWait(
        resourceGroup,
        hubName,
        deploymentName,
        deploymentParams
      );

      console.log(`[FOUNDRY] Model deployment '${deploymentName}' created successfully`);
      console.log(`[FOUNDRY] Deployment ID: ${deploymentResult.id}`);
      console.log(`[FOUNDRY] Provisioning State: ${deploymentResult.properties?.provisioningState}`);

      return {
        success: true,
        deploymentId: deploymentResult.id,
        deploymentName: deploymentResult.name,
        provisioningState: deploymentResult.properties?.provisioningState
      };
    } catch (error: any) {
      console.error('[FOUNDRY] Error deploying model:', error.message);
      return {
        success: false,
        error: error.message,
        details: error.details || error.stack
      };
    }
  }

  /**
   * Create a Foundry Agent using the Azure AI Agent Service REST API
   * Uses api-version=2025-05-01 (GA)
   * Endpoint: POST https://<hub>.services.ai.azure.com/api/projects/<project>/assistants
   */
  async createFoundryAgent(input: FoundryAgentInput): Promise<FoundryAgentResult> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Azure not configured. Please set ZAPPER_AZURE_SUBSCRIPTION_ID environment variable.'
      };
    }

    const { 
      hubName, 
      projectName, 
      agentName, 
      deploymentName,
      instructions = "You are a helpful assistant.",
      tools = [{ type: "code_interpreter" }],
      hubEndpoint,
      customSubdomain
    } = input;

    try {
      console.log(`[FOUNDRY] Creating Foundry Agent: ${agentName}`);
      console.log(`[FOUNDRY] Hub: ${hubName}, Project: ${projectName}`);
      console.log(`[FOUNDRY] Using deployment: ${deploymentName}`);
      console.log(`[FOUNDRY] Using Azure AI Agent Service REST API (api-version=2025-05-01)`);

      const token = await this.getAIAccessToken();
      
      // Build the Agent Service endpoint
      // Priority: hubEndpoint > customSubdomain > hubName
      const apiVersion = "2025-05-01";
      let baseEndpoint: string;
      if (hubEndpoint) {
        baseEndpoint = hubEndpoint.replace(/\/$/, ''); // Remove trailing slash if present
        console.log(`[FOUNDRY] Using provided hubEndpoint: ${baseEndpoint}`);
      } else if (customSubdomain) {
        baseEndpoint = `https://${customSubdomain.toLowerCase()}.services.ai.azure.com`;
        console.log(`[FOUNDRY] Using customSubdomain: ${customSubdomain}`);
      } else {
        baseEndpoint = this.getFoundryHost(hubName);
        console.log(`[FOUNDRY] Using hubName as subdomain (may not work if customSubdomain differs): ${hubName}`);
      }
      const url = `${baseEndpoint}/api/projects/${encodeURIComponent(projectName)}/assistants?api-version=${apiVersion}`;

      const requestBody = {
        name: agentName,
        model: deploymentName,
        instructions: instructions,
        tools: tools
      };

      console.log(`[FOUNDRY] POST ${url}`);
      console.log(`[FOUNDRY] Request body:`, JSON.stringify(requestBody, null, 2));

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      const responseText = await response.text();
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { rawResponse: responseText };
      }

      if (!response.ok) {
        console.error(`[FOUNDRY] Agent creation failed: ${response.status} ${response.statusText}`);
        console.error(`[FOUNDRY] Response:`, responseData);
        return {
          success: false,
          error: responseData.error?.message || `HTTP ${response.status}: ${response.statusText}`,
          details: responseData
        };
      }

      console.log(`[FOUNDRY] Foundry Agent '${agentName}' created successfully`);
      console.log(`[FOUNDRY] Agent ID: ${responseData.id}`);

      return {
        success: true,
        agentId: responseData.id,
        agentName: responseData.name,
        model: responseData.model,
        instructions: responseData.instructions,
        tools: responseData.tools
      };
    } catch (error: any) {
      console.error('[FOUNDRY] Error creating Foundry Agent:', error.message);
      return {
        success: false,
        error: error.message,
        details: error.stack
      };
    }
  }

  /**
   * List all Agents in a Foundry Project
   * @param hubName - The hub resource name
   * @param projectName - The project name
   * @param customSubdomain - Optional custom subdomain for the hub endpoint (uses hubName if not provided)
   */
  async listFoundryAgents(hubName: string, projectName: string, customSubdomain?: string): Promise<{ success: boolean; agents?: any[]; error?: string; details?: any }> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Azure not configured'
      };
    }

    try {
      // Use customSubdomain if provided, otherwise fall back to hubName
      const effectiveSubdomain = customSubdomain || hubName;
      console.log(`[FOUNDRY] Listing Agents in Project: ${projectName} using subdomain: ${effectiveSubdomain}`);
      
      const token = await this.getAIAccessToken();
      const apiVersion = "2025-05-01";
      // Build endpoint using the effective subdomain - must use services.ai.azure.com for runtime API
      const baseEndpoint = `https://${effectiveSubdomain.toLowerCase()}.services.ai.azure.com`;
      const url = `${baseEndpoint}/api/projects/${encodeURIComponent(projectName)}/assistants?api-version=${apiVersion}`;
      console.log(`[FOUNDRY] Agents list URL: ${url}`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error?.message || `HTTP ${response.status}`,
          details: errorData
        };
      }

      const data = await response.json();
      console.log(`[FOUNDRY] Found ${data.data?.length || 0} agents`);

      return {
        success: true,
        agents: data.data || []
      };
    } catch (error: any) {
      console.error('[FOUNDRY] Error listing agents:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get a specific Agent by ID
   */
  async getFoundryAgent(hubName: string, projectName: string, agentId: string): Promise<FoundryAgentResult> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Azure not configured'
      };
    }

    try {
      console.log(`[FOUNDRY] Getting Agent: ${agentId}`);
      
      const token = await this.getAIAccessToken();
      const apiVersion = "2025-05-01";
      const projectEndpoint = this.getProjectEndpoint(hubName, projectName);
      const url = `${projectEndpoint}/assistants/${agentId}?api-version=${apiVersion}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error?.message || `HTTP ${response.status}`,
          details: errorData
        };
      }

      const data = await response.json();
      return {
        success: true,
        agentId: data.id,
        agentName: data.name,
        model: data.model,
        instructions: data.instructions,
        tools: data.tools
      };
    } catch (error: any) {
      console.error('[FOUNDRY] Error getting agent:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete an Agent
   */
  async deleteFoundryAgent(hubName: string, projectName: string, agentId: string): Promise<{ success: boolean; error?: string; details?: any }> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Azure not configured'
      };
    }

    try {
      console.log(`[FOUNDRY] Deleting Agent: ${agentId}`);
      
      const token = await this.getAIAccessToken();
      const apiVersion = "2025-05-01";
      const projectEndpoint = this.getProjectEndpoint(hubName, projectName);
      const url = `${projectEndpoint}/assistants/${agentId}?api-version=${apiVersion}`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error?.message || `HTTP ${response.status}`,
          details: errorData
        };
      }

      console.log(`[FOUNDRY] Agent ${agentId} deleted successfully`);
      return { success: true };
    } catch (error: any) {
      console.error('[FOUNDRY] Error deleting agent:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * List all Foundry Hubs (AIServices accounts) in a resource group
   */
  async listFoundryHubs(resourceGroup: string): Promise<{ success: boolean; hubs?: any[]; error?: string }> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Azure not configured'
      };
    }

    try {
      console.log(`[FOUNDRY] Listing Foundry Hubs in: ${resourceGroup}`);
      const client = this.getCognitiveClient();
      
      const hubs: any[] = [];
      for await (const account of client.accounts.listByResourceGroup(resourceGroup)) {
        if (account.kind === 'AIServices') {
          hubs.push({
            id: account.id,
            name: account.name,
            location: account.location,
            endpoint: account.properties?.endpoint,
            provisioningState: account.properties?.provisioningState,
            tags: account.tags
          });
        }
      }

      console.log(`[FOUNDRY] Found ${hubs.length} Foundry Hubs`);
      return { success: true, hubs };
    } catch (error: any) {
      console.error('[FOUNDRY] Error listing Foundry Hubs:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * List all Projects under a Foundry Hub
   */
  async listFoundryProjects(resourceGroup: string, hubName: string): Promise<{ success: boolean; projects?: any[]; error?: string }> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Azure not configured'
      };
    }

    try {
      console.log(`[FOUNDRY] Listing Projects for Hub: ${hubName}`);
      const client = this.getCognitiveClient();
      
      const projects: any[] = [];
      for await (const project of client.projects.list(resourceGroup, hubName)) {
        projects.push({
          id: project.id,
          name: project.name,
          displayName: project.properties?.displayName,
          location: project.location,
          provisioningState: project.properties?.provisioningState,
          tags: project.tags
        });
      }

      console.log(`[FOUNDRY] Found ${projects.length} Projects`);
      return { success: true, projects };
    } catch (error: any) {
      console.error('[FOUNDRY] Error listing Projects:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * List all model deployments for a Foundry Hub
   */
  async listDeployments(resourceGroup: string, hubName: string): Promise<{ success: boolean; deployments?: any[]; error?: string }> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Azure not configured'
      };
    }

    try {
      console.log(`[FOUNDRY] Listing Deployments for Hub: ${hubName}`);
      const client = this.getCognitiveClient();
      
      const deployments: any[] = [];
      for await (const deployment of client.deployments.list(resourceGroup, hubName)) {
        deployments.push({
          id: deployment.id,
          name: deployment.name,
          model: deployment.properties?.model,
          provisioningState: deployment.properties?.provisioningState,
          sku: deployment.sku,
          tags: deployment.tags
        });
      }

      console.log(`[FOUNDRY] Found ${deployments.length} Deployments`);
      return { success: true, deployments };
    } catch (error: any) {
      console.error('[FOUNDRY] Error listing Deployments:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a Foundry Hub (Cognitive Services Account with kind: AIServices)
   * Uses REST API with DELETE method matching the creation pattern
   */
  async deleteFoundryHub(resourceGroup: string, hubName: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured) {
      return { success: false, error: 'Azure not configured' };
    }

    try {
      console.log(`[FOUNDRY] Deleting Foundry Hub: ${hubName}`);
      console.log(`[FOUNDRY] Using REST API DELETE for Cognitive Services account`);
      
      const token = await this.getAccessToken();
      const apiVersion = "2024-10-01";
      const url = `https://management.azure.com/subscriptions/${this.subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.CognitiveServices/accounts/${hubName}?api-version=${apiVersion}`;

      console.log(`[FOUNDRY] DELETE ${url}`);

      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (response.status === 202) {
        // Async deletion started - poll for completion
        console.log(`[FOUNDRY] Hub deletion initiated (async), waiting for completion...`);
        await this.waitForHubDeletion(resourceGroup, hubName, token);
        console.log(`[FOUNDRY] Foundry Hub '${hubName}' deleted successfully`);
        return { success: true };
      } else if (response.status === 204 || response.status === 200) {
        console.log(`[FOUNDRY] Foundry Hub '${hubName}' deleted successfully`);
        return { success: true };
      } else if (response.status === 404) {
        console.log(`[FOUNDRY] Hub '${hubName}' not found - already deleted`);
        return { success: true };
      } else {
        const responseText = await response.text();
        let errorData: any;
        try {
          errorData = JSON.parse(responseText);
        } catch {
          errorData = { rawResponse: responseText };
        }
        console.error(`[FOUNDRY] Hub deletion failed: ${response.status} ${response.statusText}`);
        console.error(`[FOUNDRY] Response:`, errorData);
        return { success: false, error: errorData.error?.message || `HTTP ${response.status}: ${response.statusText}` };
      }
    } catch (error: any) {
      console.error('[FOUNDRY] Error deleting Foundry Hub:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Wait for hub deletion to complete (polling)
   */
  private async waitForHubDeletion(
    resourceGroup: string,
    hubName: string,
    token: string,
    maxAttempts: number = 30,
    intervalMs: number = 5000
  ): Promise<void> {
    const apiVersion = "2024-10-01";
    const url = `https://management.azure.com/subscriptions/${this.subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.CognitiveServices/accounts/${hubName}?api-version=${apiVersion}`;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.sleep(intervalMs);
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (response.status === 404) {
        console.log(`[FOUNDRY] Hub deletion confirmed (404 - resource gone)`);
        return;
      }

      const data = await response.json();
      const provisioningState = data.properties?.provisioningState;
      console.log(`[FOUNDRY] Hub deletion poll attempt ${attempt}/${maxAttempts}, state: ${provisioningState || 'unknown'}`);

      if (provisioningState === "Deleting") {
        continue; // Still deleting
      }
    }
    console.warn(`[FOUNDRY] Hub deletion polling timeout - resource may still be deleting`);
  }

  /**
   * Delete a Foundry Project under a Hub
   * Uses REST API with DELETE method matching the creation pattern
   */
  async deleteFoundryProject(resourceGroup: string, hubName: string, projectName: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured) {
      return { success: false, error: 'Azure not configured' };
    }

    try {
      // Normalize project name - extract just the final segment if it contains "/"
      // Database may store "hubName/projectName" format, but API expects just "projectName"
      const normalizedProjectName = projectName.includes('/') 
        ? projectName.split('/').pop() || projectName 
        : projectName;
      
      console.log(`[FOUNDRY] Deleting Foundry Project: ${projectName}`);
      if (normalizedProjectName !== projectName) {
        console.log(`[FOUNDRY] Normalized project name: ${normalizedProjectName}`);
      }
      console.log(`[FOUNDRY] Under Hub: ${hubName}, Resource Group: ${resourceGroup}`);
      console.log(`[FOUNDRY] Using REST API DELETE for Cognitive Services project`);

      const token = await this.getAccessToken();
      const apiVersion = "2025-06-01";
      const url = `https://management.azure.com/subscriptions/${this.subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.CognitiveServices/accounts/${hubName}/projects/${normalizedProjectName}?api-version=${apiVersion}`;

      console.log(`[FOUNDRY] DELETE ${url}`);

      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (response.status === 202) {
        // Async deletion started - poll for completion
        console.log(`[FOUNDRY] Project deletion initiated (async), waiting for completion...`);
        await this.waitForProjectDeletion(resourceGroup, hubName, normalizedProjectName, token);
        console.log(`[FOUNDRY] Foundry Project '${normalizedProjectName}' deleted successfully`);
        return { success: true };
      } else if (response.status === 204 || response.status === 200) {
        // Synchronous deletion - still poll to confirm it's gone before returning
        console.log(`[FOUNDRY] Project deletion response: ${response.status}, polling to confirm...`);
        await this.waitForProjectDeletion(resourceGroup, hubName, normalizedProjectName, token);
        console.log(`[FOUNDRY] Foundry Project '${normalizedProjectName}' deleted successfully`);
        return { success: true };
      } else if (response.status === 404) {
        console.log(`[FOUNDRY] Project '${normalizedProjectName}' not found - already deleted`);
        return { success: true };
      } else {
        const responseText = await response.text();
        let errorData: any;
        try {
          errorData = JSON.parse(responseText);
        } catch {
          errorData = { rawResponse: responseText };
        }
        console.error(`[FOUNDRY] Project deletion failed: ${response.status} ${response.statusText}`);
        console.error(`[FOUNDRY] Response:`, errorData);
        return { success: false, error: errorData.error?.message || `HTTP ${response.status}: ${response.statusText}` };
      }
    } catch (error: any) {
      console.error('[FOUNDRY] Error deleting Foundry Project:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Wait for project deletion to complete (polling)
   * Waits until the project returns 404 (confirmed deleted)
   */
  private async waitForProjectDeletion(
    resourceGroup: string,
    hubName: string,
    projectName: string,
    token: string,
    maxAttempts: number = 60,
    intervalMs: number = 3000
  ): Promise<void> {
    const apiVersion = "2025-06-01";
    const url = `https://management.azure.com/subscriptions/${this.subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.CognitiveServices/accounts/${hubName}/projects/${projectName}?api-version=${apiVersion}`;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.sleep(intervalMs);
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (response.status === 404) {
        console.log(`[FOUNDRY] Project deletion confirmed (404 - resource gone)`);
        return;
      }

      const data = await response.json();
      const provisioningState = data.properties?.provisioningState;
      console.log(`[FOUNDRY] Project deletion poll attempt ${attempt}/${maxAttempts}, state: ${provisioningState || 'unknown'}`);

      if (provisioningState === "Deleting") {
        continue; // Still deleting
      }
    }
    console.warn(`[FOUNDRY] Project deletion polling timeout - resource may still be deleting`);
  }

  /**
   * Delete a model deployment
   */
  async deleteDeployment(resourceGroup: string, hubName: string, deploymentName: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured) {
      return { success: false, error: 'Azure not configured' };
    }

    try {
      console.log(`[FOUNDRY] Deleting Deployment: ${deploymentName}`);
      const client = this.getCognitiveClient();
      await client.deployments.beginDeleteAndWait(resourceGroup, hubName, deploymentName);
      console.log(`[FOUNDRY] Deployment '${deploymentName}' deleted successfully`);
      return { success: true };
    } catch (error: any) {
      console.error('[FOUNDRY] Error deleting Deployment:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Deploy Content Understanding required models (GPT-4.1, GPT-4.1-mini, text-embedding-3-large)
   * Only deploys models that don't already exist
   */
  async deployContentUnderstandingModels(
    resourceGroup: string,
    hubName: string,
    customDeploymentNames?: {
      "gpt-4.1"?: string;
      "gpt-4.1-mini"?: string;
      "text-embedding-3-large"?: string;
    }
  ): Promise<{
    success: boolean;
    deployments: Array<{
      modelName: string;
      deploymentName: string;
      status: "deployed" | "already_exists" | "failed";
      error?: string;
    }>;
    error?: string;
  }> {
    if (!this.isConfigured) {
      return {
        success: false,
        deployments: [],
        error: 'Azure not configured. Please set ZAPPER_AZURE_SUBSCRIPTION_ID environment variable.'
      };
    }

    console.log(`[FOUNDRY] Deploying Content Understanding models to Hub: ${hubName}`);

    // Define models to deploy with their deployment names
    const modelsToCheck = [
      { modelName: "gpt-4.1", deploymentName: customDeploymentNames?.["gpt-4.1"] || "gpt-4-1" },
      { modelName: "gpt-4.1-mini", deploymentName: customDeploymentNames?.["gpt-4.1-mini"] || "gpt-4-1-mini" },
      { modelName: "text-embedding-3-large", deploymentName: customDeploymentNames?.["text-embedding-3-large"] || "text-embedding-3-large" }
    ];

    // First, get existing deployments
    const existingResult = await this.listDeployments(resourceGroup, hubName);
    const existingDeploymentNames = new Set<string>();
    
    if (existingResult.success && existingResult.deployments) {
      for (const dep of existingResult.deployments) {
        existingDeploymentNames.add(dep.name);
      }
      console.log(`[FOUNDRY] Existing deployments: ${Array.from(existingDeploymentNames).join(", ") || "none"}`);
    }

    const results: Array<{
      modelName: string;
      deploymentName: string;
      status: "deployed" | "already_exists" | "failed";
      error?: string;
    }> = [];

    let hasFailure = false;

    for (const model of modelsToCheck) {
      // Check if deployment already exists
      if (existingDeploymentNames.has(model.deploymentName)) {
        console.log(`[FOUNDRY] Deployment '${model.deploymentName}' already exists, skipping`);
        results.push({
          modelName: model.modelName,
          deploymentName: model.deploymentName,
          status: "already_exists"
        });
        continue;
      }

      // Deploy the model
      console.log(`[FOUNDRY] Deploying ${model.modelName} as '${model.deploymentName}'...`);
      const deployResult = await this.deployModel({
        resourceGroup,
        hubName,
        deploymentName: model.deploymentName,
        modelName: model.modelName,
        skuName: "GlobalStandard",
        skuCapacity: 10
      });

      if (deployResult.success) {
        console.log(`[FOUNDRY] Successfully deployed ${model.modelName}`);
        results.push({
          modelName: model.modelName,
          deploymentName: model.deploymentName,
          status: "deployed"
        });
      } else {
        console.error(`[FOUNDRY] Failed to deploy ${model.modelName}: ${deployResult.error}`);
        results.push({
          modelName: model.modelName,
          deploymentName: model.deploymentName,
          status: "failed",
          error: deployResult.error
        });
        hasFailure = true;
      }
    }

    return {
      success: !hasFailure,
      deployments: results
    };
  }

  /**
   * Full provisioning workflow: Hub → Project → Model Deployment
   * This is the main orchestration method
   */
  async provisionFoundryResources(input: FoundryProvisioningInput): Promise<FoundryProvisioningResult> {
    if (!this.isConfigured) {
      console.log('[FOUNDRY] Provisioning skipped - Azure not configured');
      return {
        success: false,
        error: 'Azure not configured. Please set ZAPPER_AZURE_SUBSCRIPTION_ID environment variable.'
      };
    }

    const { 
      resourceName, 
      resourceGroup, 
      location, 
      projectName,
      deployModel: shouldDeployModel,
      modelName,
      modelVersion
    } = input;

    try {
      console.log(`[FOUNDRY] Starting full provisioning workflow`);
      console.log(`[FOUNDRY] Hub: ${resourceName}, Resource Group: ${resourceGroup}, Location: ${location}`);

      const hubResult = await this.createFoundryHub({
        resourceGroup,
        hubName: resourceName,
        location
      });

      if (!hubResult.success) {
        return {
          success: false,
          error: hubResult.error,
          details: hubResult.details
        };
      }

      console.log(`[FOUNDRY] Hub created, waiting for stabilization...`);
      await this.sleep(30000);

      const finalProjectName = projectName || `${resourceName}_project`;
      const projectResult = await this.createFoundryProject({
        resourceGroup,
        hubName: resourceName,
        projectName: finalProjectName,
        displayName: finalProjectName,
        location
      });

      if (!projectResult.success) {
        return {
          success: false,
          resourceId: hubResult.resourceId,
          error: `Hub created but project failed: ${projectResult.error}`,
          details: projectResult.details
        };
      }

      const projectEndpoint = this.getProjectEndpoint(resourceName, finalProjectName);

      let deploymentId: string | undefined;
      let deploymentName: string | undefined;

      if (shouldDeployModel && modelName) {
        console.log(`[FOUNDRY] Deploying model: ${modelName}`);
        const deployResult = await this.deployModel({
          resourceGroup,
          hubName: resourceName,
          deploymentName: `${modelName}-deployment`,
          modelName,
          modelVersion: modelVersion || "2024-05-13"
        });

        if (deployResult.success) {
          deploymentId = deployResult.deploymentId;
          deploymentName = deployResult.deploymentName;
        } else {
          console.warn(`[FOUNDRY] Model deployment failed (non-fatal): ${deployResult.error}`);
        }
      }

      return {
        success: true,
        resourceId: hubResult.resourceId,
        projectId: projectResult.projectId,
        projectName: projectResult.projectName,
        projectEndpoint,
        deploymentId,
        deploymentName
      };
    } catch (error: any) {
      console.error(`[FOUNDRY] Provisioning failed:`, error.message);
      return {
        success: false,
        error: error.message,
        details: error.details || error.stack
      };
    }
  }

  /**
   * Incremental provisioning workflow with step-by-step updates
   * This method calls onStepComplete after each Azure resource is created
   * so that the database can be updated immediately, preventing orphaned resources
   */
  async provisionFoundryResourcesIncremental(
    input: FoundryProvisioningInput,
    onStepComplete: (step: 'hub' | 'project' | 'agent' | 'vector_store', data: {
      status: 'hub_created' | 'project_created' | 'agent_created' | 'vector_store_created' | 'completed' | 'failed';
      resourceId?: string;
      projectId?: string;
      projectName?: string;
      projectEndpoint?: string;
      agentId?: string;
      agentName?: string;
      vectorStoreId?: string;
      error?: string;
    }) => Promise<void>
  ): Promise<FoundryProvisioningResult> {
    if (!this.isConfigured) {
      console.log('[FOUNDRY] Provisioning skipped - Azure not configured');
      return {
        success: false,
        error: 'Azure not configured. Please set ZAPPER_AZURE_SUBSCRIPTION_ID environment variable.'
      };
    }

    const { 
      resourceName, 
      resourceGroup, 
      location, 
      projectName,
      agentName,
      createVectorStore,
      deployModel: shouldDeployModel,
      modelName,
      modelVersion
    } = input;

    let hubResourceId: string | undefined;
    let projectId: string | undefined;
    let finalProjectName: string | undefined;
    let projectEndpoint: string | undefined;
    let agentId: string | undefined;
    let vectorStoreId: string | undefined;

    try {
      console.log(`[FOUNDRY] Starting incremental provisioning workflow`);
      console.log(`[FOUNDRY] Hub: ${resourceName}, Resource Group: ${resourceGroup}, Location: ${location}`);

      // Step 1: Create Hub
      console.log(`[FOUNDRY] Step 1: Creating Hub...`);
      const hubResult = await this.createFoundryHub({
        resourceGroup,
        hubName: resourceName,
        location
      });

      if (!hubResult.success) {
        await onStepComplete('hub', { 
          status: 'failed', 
          error: `Hub creation failed: ${hubResult.error}` 
        });
        return {
          success: false,
          error: hubResult.error,
          details: hubResult.details
        };
      }

      hubResourceId = hubResult.resourceId;
      
      // Report hub creation success
      await onStepComplete('hub', { 
        status: 'hub_created', 
        resourceId: hubResourceId 
      });

      console.log(`[FOUNDRY] Hub created, waiting for stabilization...`);
      await this.sleep(30000);

      // Step 2: Create Project
      console.log(`[FOUNDRY] Step 2: Creating Project...`);
      finalProjectName = projectName || `${resourceName}_project`;
      const projectResult = await this.createFoundryProject({
        resourceGroup,
        hubName: resourceName,
        projectName: finalProjectName,
        displayName: finalProjectName,
        location
      });

      if (!projectResult.success) {
        await onStepComplete('project', { 
          status: 'failed', 
          resourceId: hubResourceId,
          error: `Project creation failed: ${projectResult.error}` 
        });
        return {
          success: false,
          resourceId: hubResourceId,
          error: `Hub created but project failed: ${projectResult.error}`,
          details: projectResult.details
        };
      }

      projectId = projectResult.projectId;
      projectEndpoint = this.getProjectEndpoint(resourceName, finalProjectName);

      // Report project creation success
      await onStepComplete('project', { 
        status: 'project_created', 
        resourceId: hubResourceId,
        projectId,
        projectName: finalProjectName,
        projectEndpoint
      });

      // Step 3: Create Agent (if requested)
      if (agentName) {
        console.log(`[FOUNDRY] Step 3: Creating Agent...`);
        const deploymentName = modelName ? `${modelName}-deployment` : 'gpt-4o-deployment';
        
        // First deploy the model if requested
        if (shouldDeployModel && modelName) {
          console.log(`[FOUNDRY] Deploying model for agent: ${modelName}`);
          const deployResult = await this.deployModel({
            resourceGroup,
            hubName: resourceName,
            deploymentName,
            modelName,
            modelVersion: modelVersion || "2024-05-13"
          });
          
          if (!deployResult.success) {
            console.warn(`[FOUNDRY] Model deployment failed (continuing without): ${deployResult.error}`);
          }
        }

        // Create the agent
        const agentResult = await this.createFoundryAgent({
          hubName: resourceName,
          projectName: finalProjectName,
          agentName,
          deploymentName,
          customSubdomain: resourceName.toLowerCase(),
          instructions: `You are a helpful AI assistant named ${agentName}.`
        });

        if (!agentResult.success) {
          await onStepComplete('agent', { 
            status: 'failed', 
            resourceId: hubResourceId,
            projectId,
            projectName: finalProjectName,
            projectEndpoint,
            error: `Agent creation failed: ${agentResult.error}` 
          });
          return {
            success: false,
            resourceId: hubResourceId,
            projectId,
            projectName: finalProjectName,
            projectEndpoint,
            error: `Hub and project created but agent failed: ${agentResult.error}`,
            details: agentResult.details
          };
        }

        agentId = agentResult.agentId;

        // Report agent creation success
        await onStepComplete('agent', { 
          status: 'agent_created', 
          resourceId: hubResourceId,
          projectId,
          projectName: finalProjectName,
          projectEndpoint,
          agentId,
          agentName: agentResult.agentName
        });
      }

      // Step 4: Create Vector Store (if requested)
      if (createVectorStore && agentId) {
        console.log(`[FOUNDRY] Step 4: Creating Vector Store...`);
        const vectorStoreResult = await this.createVectorStore({
          projectName: finalProjectName,
          vectorStoreName: `${resourceName}_vectorstore`,
          customSubdomain: resourceName.toLowerCase()
        });

        if (!vectorStoreResult.success) {
          await onStepComplete('vector_store', { 
            status: 'failed', 
            resourceId: hubResourceId,
            projectId,
            projectName: finalProjectName,
            projectEndpoint,
            agentId,
            agentName,
            error: `Vector store creation failed: ${vectorStoreResult.error}` 
          });
          // Vector store failure is non-fatal - we still return success for the other resources
          console.warn(`[FOUNDRY] Vector store creation failed (non-fatal): ${vectorStoreResult.error}`);
        } else {
          vectorStoreId = vectorStoreResult.vectorStoreId;

          // Report vector store creation success
          await onStepComplete('vector_store', { 
            status: 'vector_store_created', 
            resourceId: hubResourceId,
            projectId,
            projectName: finalProjectName,
            projectEndpoint,
            agentId,
            agentName,
            vectorStoreId
          });
        }
      }

      // All steps completed - report final success
      await onStepComplete('vector_store', { 
        status: 'completed', 
        resourceId: hubResourceId,
        projectId,
        projectName: finalProjectName,
        projectEndpoint,
        agentId,
        agentName,
        vectorStoreId
      });

      return {
        success: true,
        resourceId: hubResourceId,
        projectId,
        projectName: finalProjectName,
        projectEndpoint,
        agentId,
        agentName,
        vectorStoreId
      };
    } catch (error: any) {
      console.error(`[FOUNDRY] Incremental provisioning failed:`, error.message);
      
      // Report the failure with whatever resources were created
      await onStepComplete('hub', { 
        status: 'failed',
        resourceId: hubResourceId,
        projectId,
        projectName: finalProjectName,
        projectEndpoint,
        agentId,
        agentName,
        vectorStoreId,
        error: error.message
      });

      return {
        success: false,
        resourceId: hubResourceId,
        projectId,
        projectName: finalProjectName,
        projectEndpoint,
        agentId,
        agentName,
        vectorStoreId,
        error: error.message,
        details: error.details || error.stack
      };
    }
  }

  /**
   * Delete partial/orphaned Foundry resources in reverse dependency order
   * Order: Agent → Vector Store → Project → Hub
   */
  async deletePartialFoundryResources(params: {
    resourceGroup: string;
    hubName: string;
    projectName?: string;
    agentId?: string;
    vectorStoreId?: string;
    customSubdomain?: string;
  }): Promise<{ success: boolean; deletedResources: string[]; errors: string[] }> {
    const { resourceGroup, hubName, projectName, agentId, vectorStoreId, customSubdomain } = params;
    const deletedResources: string[] = [];
    const errors: string[] = [];

    console.log(`[FOUNDRY] Starting cleanup of partial resources for hub: ${hubName}`);

    // Step 1: Delete Agent (if exists)
    if (agentId && projectName && customSubdomain) {
      try {
        console.log(`[FOUNDRY] Deleting agent: ${agentId}`);
        const result = await this.deleteFoundryAgent(customSubdomain, projectName, agentId);
        if (result.success) {
          deletedResources.push(`agent:${agentId}`);
        } else {
          errors.push(`Agent deletion failed: ${result.error}`);
        }
      } catch (error: any) {
        errors.push(`Agent deletion error: ${error.message}`);
      }
    }

    // Step 2: Delete Vector Store (if exists)
    if (vectorStoreId && projectName && customSubdomain) {
      try {
        console.log(`[FOUNDRY] Deleting vector store: ${vectorStoreId}`);
        const result = await this.deleteVectorStore({
          projectName,
          vectorStoreId,
          customSubdomain
        });
        if (result.success) {
          deletedResources.push(`vectorStore:${vectorStoreId}`);
        } else {
          errors.push(`Vector store deletion failed: ${result.error}`);
        }
      } catch (error: any) {
        errors.push(`Vector store deletion error: ${error.message}`);
      }
    }

    // Step 3: Delete Project (if exists)
    if (projectName) {
      try {
        console.log(`[FOUNDRY] Deleting project: ${projectName}`);
        const result = await this.deleteFoundryProject(resourceGroup, hubName, projectName);
        if (result.success) {
          deletedResources.push(`project:${projectName}`);
        } else {
          errors.push(`Project deletion failed: ${result.error}`);
        }
      } catch (error: any) {
        errors.push(`Project deletion error: ${error.message}`);
      }
    }

    // Step 4: Delete Hub
    try {
      console.log(`[FOUNDRY] Deleting hub: ${hubName}`);
      const result = await this.deleteFoundryHub(resourceGroup, hubName);
      if (result.success) {
        deletedResources.push(`hub:${hubName}`);
      } else {
        errors.push(`Hub deletion failed: ${result.error}`);
      }
    } catch (error: any) {
      errors.push(`Hub deletion error: ${error.message}`);
    }

    const success = errors.length === 0;
    console.log(`[FOUNDRY] Cleanup ${success ? 'completed successfully' : 'completed with errors'}`);
    console.log(`[FOUNDRY] Deleted: ${deletedResources.join(', ')}`);
    if (errors.length > 0) {
      console.log(`[FOUNDRY] Errors: ${errors.join(', ')}`);
    }

    return { success, deletedResources, errors };
  }

  /**
   * Update a Foundry Agent (e.g., attach vector store for file_search)
   */
  async updateFoundryAgent(input: {
    projectName: string;
    agentId: string;
    customSubdomain?: string;
    hubEndpoint?: string;
    name?: string;
    instructions?: string;
    tools?: Array<{ type: string; [key: string]: any }>;
    tool_resources?: {
      file_search?: {
        vector_store_ids?: string[];
      };
      code_interpreter?: {
        file_ids?: string[];
      };
    };
    metadata?: Record<string, string>;
  }): Promise<{
    success: boolean;
    agentId?: string;
    agentName?: string;
    model?: string;
    instructions?: string;
    tools?: any[];
    tool_resources?: any;
    error?: string;
    details?: any;
  }> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Azure not configured. Please set ZAPPER_AZURE_SUBSCRIPTION_ID environment variable.'
      };
    }

    const { 
      projectName, 
      agentId,
      customSubdomain, 
      hubEndpoint,
      name,
      instructions,
      tools,
      tool_resources,
      metadata
    } = input;

    try {
      console.log(`[FOUNDRY] Updating Foundry Agent: ${agentId}`);
      console.log(`[FOUNDRY] Project: ${projectName}`);
      console.log(`[FOUNDRY] Using Azure AI Agent Service REST API (api-version=2025-05-01)`);

      const token = await this.getAIAccessToken();
      
      const apiVersion = "2025-05-01";
      let baseEndpoint: string;
      if (hubEndpoint) {
        baseEndpoint = hubEndpoint.replace(/\/$/, '');
        console.log(`[FOUNDRY] Using provided hubEndpoint: ${baseEndpoint}`);
      } else if (customSubdomain) {
        baseEndpoint = `https://${customSubdomain.toLowerCase()}.services.ai.azure.com`;
        console.log(`[FOUNDRY] Using customSubdomain: ${customSubdomain}`);
      } else {
        return {
          success: false,
          error: 'Either hubEndpoint or customSubdomain is required'
        };
      }

      const url = `${baseEndpoint}/api/projects/${encodeURIComponent(projectName)}/assistants/${encodeURIComponent(agentId)}?api-version=${apiVersion}`;

      const requestBody: any = {};
      if (name !== undefined) requestBody.name = name;
      if (instructions !== undefined) requestBody.instructions = instructions;
      if (tools !== undefined) requestBody.tools = tools;
      if (tool_resources !== undefined) requestBody.tool_resources = tool_resources;
      if (metadata !== undefined) requestBody.metadata = metadata;

      console.log(`[FOUNDRY] POST ${url}`);
      console.log(`[FOUNDRY] Request body:`, JSON.stringify(requestBody, null, 2));

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      const responseText = await response.text();
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { rawResponse: responseText };
      }

      if (!response.ok) {
        console.error(`[FOUNDRY] Agent update failed: ${response.status} ${response.statusText}`);
        console.error(`[FOUNDRY] Response:`, responseData);
        return {
          success: false,
          error: responseData.error?.message || `HTTP ${response.status}: ${response.statusText}`,
          details: responseData
        };
      }

      console.log(`[FOUNDRY] Foundry Agent '${agentId}' updated successfully`);

      return {
        success: true,
        agentId: responseData.id,
        agentName: responseData.name,
        model: responseData.model,
        instructions: responseData.instructions,
        tools: responseData.tools,
        tool_resources: responseData.tool_resources
      };
    } catch (error: any) {
      console.error('[FOUNDRY] Error updating Foundry Agent:', error.message);
      return {
        success: false,
        error: error.message,
        details: error.stack
      };
    }
  }

  // ==================== VECTOR STORE OPERATIONS ====================

  /**
   * Create a Vector Store in a Foundry Project
   * Used for document embeddings with file_search tool
   */
  async createVectorStore(input: {
    projectName: string;
    vectorStoreName: string;
    customSubdomain?: string;
    hubEndpoint?: string;
    expiresAfterDays?: number;
    metadata?: Record<string, string>;
  }): Promise<{
    success: boolean;
    vectorStoreId?: string;
    vectorStoreName?: string;
    status?: string;
    fileCounts?: any;
    error?: string;
    details?: any;
  }> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Azure not configured. Please set ZAPPER_AZURE_SUBSCRIPTION_ID environment variable.'
      };
    }

    const { 
      projectName, 
      vectorStoreName, 
      customSubdomain, 
      hubEndpoint,
      expiresAfterDays,
      metadata 
    } = input;

    try {
      console.log(`[FOUNDRY] Creating Vector Store: ${vectorStoreName}`);
      console.log(`[FOUNDRY] Project: ${projectName}`);
      console.log(`[FOUNDRY] Using Azure AI Agent Service REST API (api-version=v1)`);

      const token = await this.getAIAccessToken();
      
      // Build the endpoint - Priority: hubEndpoint > customSubdomain
      const apiVersion = "v1";
      let baseEndpoint: string;
      if (hubEndpoint) {
        baseEndpoint = hubEndpoint.replace(/\/$/, '');
        console.log(`[FOUNDRY] Using provided hubEndpoint: ${baseEndpoint}`);
      } else if (customSubdomain) {
        baseEndpoint = `https://${customSubdomain.toLowerCase()}.services.ai.azure.com`;
        console.log(`[FOUNDRY] Using customSubdomain: ${customSubdomain}`);
      } else {
        return {
          success: false,
          error: 'Either hubEndpoint or customSubdomain is required'
        };
      }

      const url = `${baseEndpoint}/api/projects/${encodeURIComponent(projectName)}/vector_stores?api-version=${apiVersion}`;

      const requestBody: any = {
        name: vectorStoreName
      };

      if (expiresAfterDays) {
        requestBody.expires_after = {
          anchor: "last_active_at",
          days: expiresAfterDays
        };
      }

      if (metadata) {
        requestBody.metadata = metadata;
      }

      console.log(`[FOUNDRY] POST ${url}`);
      console.log(`[FOUNDRY] Request body:`, JSON.stringify(requestBody, null, 2));

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      const responseText = await response.text();
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { rawResponse: responseText };
      }

      if (!response.ok) {
        console.error(`[FOUNDRY] Vector Store creation failed: ${response.status} ${response.statusText}`);
        console.error(`[FOUNDRY] Response:`, responseData);
        return {
          success: false,
          error: responseData.error?.message || `HTTP ${response.status}: ${response.statusText}`,
          details: responseData
        };
      }

      console.log(`[FOUNDRY] Vector Store '${vectorStoreName}' created successfully`);
      console.log(`[FOUNDRY] Vector Store ID: ${responseData.id}`);

      return {
        success: true,
        vectorStoreId: responseData.id,
        vectorStoreName: responseData.name,
        status: responseData.status,
        fileCounts: responseData.file_counts
      };
    } catch (error: any) {
      console.error('[FOUNDRY] Error creating Vector Store:', error.message);
      return {
        success: false,
        error: error.message,
        details: error.stack
      };
    }
  }

  /**
   * Get a Vector Store by ID
   */
  async getVectorStore(input: {
    projectName: string;
    vectorStoreId: string;
    customSubdomain?: string;
    hubEndpoint?: string;
  }): Promise<{
    success: boolean;
    vectorStore?: any;
    error?: string;
    details?: any;
  }> {
    if (!this.isConfigured) {
      return { success: false, error: 'Azure not configured' };
    }

    const { projectName, vectorStoreId, customSubdomain, hubEndpoint } = input;

    try {
      console.log(`[FOUNDRY] Getting Vector Store: ${vectorStoreId}`);

      const token = await this.getAIAccessToken();
      const apiVersion = "v1";
      
      let baseEndpoint: string;
      if (hubEndpoint) {
        baseEndpoint = hubEndpoint.replace(/\/$/, '');
      } else if (customSubdomain) {
        baseEndpoint = `https://${customSubdomain.toLowerCase()}.services.ai.azure.com`;
      } else {
        return { success: false, error: 'Either hubEndpoint or customSubdomain is required' };
      }

      const url = `${baseEndpoint}/api/projects/${encodeURIComponent(projectName)}/vector_stores/${encodeURIComponent(vectorStoreId)}?api-version=${apiVersion}`;

      console.log(`[FOUNDRY] GET ${url}`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error?.message || `HTTP ${response.status}`,
          details: errorData
        };
      }

      const data = await response.json();
      console.log(`[FOUNDRY] Vector Store retrieved: ${data.name}`);

      return {
        success: true,
        vectorStore: data
      };
    } catch (error: any) {
      console.error('[FOUNDRY] Error getting Vector Store:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * List all Vector Stores in a Project
   */
  async listVectorStores(input: {
    projectName: string;
    customSubdomain?: string;
    hubEndpoint?: string;
  }): Promise<{
    success: boolean;
    vectorStores?: any[];
    error?: string;
    details?: any;
  }> {
    if (!this.isConfigured) {
      return { success: false, error: 'Azure not configured' };
    }

    const { projectName, customSubdomain, hubEndpoint } = input;

    try {
      console.log(`[FOUNDRY] Listing Vector Stores in Project: ${projectName}`);

      const token = await this.getAIAccessToken();
      const apiVersion = "v1";
      
      let baseEndpoint: string;
      if (hubEndpoint) {
        baseEndpoint = hubEndpoint.replace(/\/$/, '');
      } else if (customSubdomain) {
        baseEndpoint = `https://${customSubdomain.toLowerCase()}.services.ai.azure.com`;
      } else {
        return { success: false, error: 'Either hubEndpoint or customSubdomain is required' };
      }

      const url = `${baseEndpoint}/api/projects/${encodeURIComponent(projectName)}/vector_stores?api-version=${apiVersion}`;

      console.log(`[FOUNDRY] GET ${url}`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error?.message || `HTTP ${response.status}`,
          details: errorData
        };
      }

      const data = await response.json();
      console.log(`[FOUNDRY] Found ${data.data?.length || 0} vector stores`);

      return {
        success: true,
        vectorStores: data.data || []
      };
    } catch (error: any) {
      console.error('[FOUNDRY] Error listing Vector Stores:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a Vector Store
   */
  async deleteVectorStore(input: {
    projectName: string;
    vectorStoreId: string;
    customSubdomain?: string;
    hubEndpoint?: string;
  }): Promise<{
    success: boolean;
    deleted?: boolean;
    error?: string;
    details?: any;
  }> {
    if (!this.isConfigured) {
      return { success: false, error: 'Azure not configured' };
    }

    const { projectName, vectorStoreId, customSubdomain, hubEndpoint } = input;

    try {
      console.log(`[FOUNDRY] Deleting Vector Store: ${vectorStoreId}`);

      const token = await this.getAIAccessToken();
      const apiVersion = "v1";
      
      let baseEndpoint: string;
      if (hubEndpoint) {
        baseEndpoint = hubEndpoint.replace(/\/$/, '');
      } else if (customSubdomain) {
        baseEndpoint = `https://${customSubdomain.toLowerCase()}.services.ai.azure.com`;
      } else {
        return { success: false, error: 'Either hubEndpoint or customSubdomain is required' };
      }

      const url = `${baseEndpoint}/api/projects/${encodeURIComponent(projectName)}/vector_stores/${encodeURIComponent(vectorStoreId)}?api-version=${apiVersion}`;

      console.log(`[FOUNDRY] DELETE ${url}`);

      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error?.message || `HTTP ${response.status}`,
          details: errorData
        };
      }

      const data = await response.json();
      console.log(`[FOUNDRY] Vector Store deleted: ${vectorStoreId}`);

      return {
        success: true,
        deleted: data.deleted || true
      };
    } catch (error: any) {
      console.error('[FOUNDRY] Error deleting Vector Store:', error.message);
      return { success: false, error: error.message };
    }
  }
  // ==================== FILE OPERATIONS ====================

  /**
   * Import a file from a SAS URL into the project
   * This creates a file resource that can be attached to vector stores
   */
  async importFileFromUrl(input: {
    projectName: string;
    customSubdomain?: string;
    hubEndpoint?: string;
    contentUrl: string;
    filename: string;
    purpose?: string;
  }): Promise<{
    success: boolean;
    fileId?: string;
    filename?: string;
    status?: string;
    bytes?: number;
    error?: string;
    details?: any;
  }> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Azure not configured. Please set ZAPPER_AZURE_SUBSCRIPTION_ID environment variable.'
      };
    }

    const { 
      projectName, 
      customSubdomain, 
      hubEndpoint,
      contentUrl,
      filename,
      purpose = "agents"
    } = input;

    try {
      console.log(`[FOUNDRY] Importing file from URL: ${filename}`);
      console.log(`[FOUNDRY] Project: ${projectName}`);
      console.log(`[FOUNDRY] Using Azure AI Agent Service REST API (api-version=2025-05-01)`);

      const token = await this.getAIAccessToken();
      
      const apiVersion = "2025-05-01";
      let baseEndpoint: string;
      if (hubEndpoint) {
        baseEndpoint = hubEndpoint.replace(/\/$/, '');
      } else if (customSubdomain) {
        baseEndpoint = `https://${customSubdomain.toLowerCase()}.services.ai.azure.com`;
      } else {
        return {
          success: false,
          error: 'Either hubEndpoint or customSubdomain is required'
        };
      }

      const url = `${baseEndpoint}/api/projects/${encodeURIComponent(projectName)}/files/import?api-version=${apiVersion}`;

      // Azure AI Agent Service requires nested fileImport object with snake_case fields
      const requestBody = {
        fileImport: {
          content_url: contentUrl,
          filename: filename,
          purpose: purpose
        }
      };

      console.log(`[FOUNDRY] POST ${url}`);
      console.log(`[FOUNDRY] Filename: ${filename}, Purpose: ${purpose}`);
      console.log(`[FOUNDRY] Request body:`, JSON.stringify(requestBody, null, 2));

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      const responseText = await response.text();
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { rawResponse: responseText };
      }

      if (!response.ok) {
        console.error(`[FOUNDRY] File import failed: ${response.status} ${response.statusText}`);
        console.error(`[FOUNDRY] Response:`, responseData);
        return {
          success: false,
          error: responseData.error?.message || `HTTP ${response.status}: ${response.statusText}`,
          details: responseData
        };
      }

      console.log(`[FOUNDRY] File '${filename}' import initiated`);
      console.log(`[FOUNDRY] File ID: ${responseData.id}, Status: ${responseData.status}`);

      return {
        success: true,
        fileId: responseData.id,
        filename: responseData.filename,
        status: responseData.status,
        bytes: responseData.bytes
      };
    } catch (error: any) {
      console.error('[FOUNDRY] Error importing file:', error.message);
      return {
        success: false,
        error: error.message,
        details: error.stack
      };
    }
  }

  /**
   * Upload a file directly to the Foundry project using multipart form data
   * This is for chat playground file uploads
   */
  async uploadFileDirectly(input: {
    projectName: string;
    customSubdomain?: string;
    hubEndpoint?: string;
    fileBuffer: Buffer;
    filename: string;
    mimeType: string;
    purpose?: string;
  }): Promise<{
    success: boolean;
    fileId?: string;
    filename?: string;
    status?: string;
    bytes?: number;
    error?: string;
    details?: any;
  }> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Azure not configured. Please set ZAPPER_AZURE_SUBSCRIPTION_ID environment variable.'
      };
    }

    const { 
      projectName, 
      customSubdomain, 
      hubEndpoint,
      fileBuffer,
      filename,
      mimeType,
      purpose = "assistants"
    } = input;

    try {
      console.log(`[FOUNDRY] Uploading file directly: ${filename} (${fileBuffer.length} bytes)`);
      console.log(`[FOUNDRY] Project: ${projectName}`);
      console.log(`[FOUNDRY] Using Azure AI Agent Service REST API with multipart form-data`);

      const token = await this.getAIAccessToken();
      
      const apiVersion = "2025-05-01";
      let baseEndpoint: string;
      if (hubEndpoint) {
        baseEndpoint = hubEndpoint.replace(/\/$/, '');
      } else if (customSubdomain) {
        baseEndpoint = `https://${customSubdomain.toLowerCase()}.services.ai.azure.com`;
      } else {
        return {
          success: false,
          error: 'Either hubEndpoint or customSubdomain is required'
        };
      }

      const url = `${baseEndpoint}/api/projects/${encodeURIComponent(projectName)}/files?api-version=${apiVersion}`;

      // Create multipart form data manually
      const boundary = `----FormBoundary${Date.now()}`;
      const CRLF = '\r\n';
      
      // Build the multipart body
      const parts: Buffer[] = [];
      
      // Add purpose field
      parts.push(Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="purpose"${CRLF}${CRLF}` +
        `${purpose}${CRLF}`
      ));
      
      // Add file field
      parts.push(Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}` +
        `Content-Type: ${mimeType}${CRLF}${CRLF}`
      ));
      parts.push(fileBuffer);
      parts.push(Buffer.from(CRLF));
      
      // Add closing boundary
      parts.push(Buffer.from(`--${boundary}--${CRLF}`));
      
      const body = Buffer.concat(parts);

      console.log(`[FOUNDRY] POST ${url}`);
      console.log(`[FOUNDRY] Filename: ${filename}, Purpose: ${purpose}, Size: ${fileBuffer.length} bytes`);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`
        },
        body: body
      });

      const responseText = await response.text();
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { rawResponse: responseText };
      }

      if (!response.ok) {
        console.error(`[FOUNDRY] File upload failed: ${response.status} ${response.statusText}`);
        console.error(`[FOUNDRY] Response:`, responseData);
        return {
          success: false,
          error: responseData.error?.message || `HTTP ${response.status}: ${response.statusText}`,
          details: responseData
        };
      }

      console.log(`[FOUNDRY] File '${filename}' uploaded successfully`);
      console.log(`[FOUNDRY] File ID: ${responseData.id}, Status: ${responseData.status}`);

      return {
        success: true,
        fileId: responseData.id,
        filename: responseData.filename,
        status: responseData.status,
        bytes: responseData.bytes
      };
    } catch (error: any) {
      console.error('[FOUNDRY] Error uploading file:', error.message);
      return {
        success: false,
        error: error.message,
        details: error.stack
      };
    }
  }

  /**
   * Get file status/details
   */
  async getFile(input: {
    projectName: string;
    fileId: string;
    customSubdomain?: string;
    hubEndpoint?: string;
  }): Promise<{
    success: boolean;
    file?: any;
    error?: string;
    details?: any;
  }> {
    if (!this.isConfigured) {
      return { success: false, error: 'Azure not configured' };
    }

    const { projectName, fileId, customSubdomain, hubEndpoint } = input;

    try {
      console.log(`[FOUNDRY] Getting file status: ${fileId}`);

      const token = await this.getAIAccessToken();
      const apiVersion = "2025-05-01";
      
      let baseEndpoint: string;
      if (hubEndpoint) {
        baseEndpoint = hubEndpoint.replace(/\/$/, '');
      } else if (customSubdomain) {
        baseEndpoint = `https://${customSubdomain.toLowerCase()}.services.ai.azure.com`;
      } else {
        return { success: false, error: 'Either hubEndpoint or customSubdomain is required' };
      }

      const url = `${baseEndpoint}/api/projects/${encodeURIComponent(projectName)}/files/${encodeURIComponent(fileId)}?api-version=${apiVersion}`;

      console.log(`[FOUNDRY] GET ${url}`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error?.message || `HTTP ${response.status}`,
          details: errorData
        };
      }

      const data = await response.json();
      console.log(`[FOUNDRY] File status: ${data.status}`);

      return {
        success: true,
        file: data
      };
    } catch (error: any) {
      console.error('[FOUNDRY] Error getting file:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Attach a file to a vector store (triggers embedding/indexing)
   */
  async attachFileToVectorStore(input: {
    projectName: string;
    vectorStoreId: string;
    fileId: string;
    customSubdomain?: string;
    hubEndpoint?: string;
    chunkingStrategy?: {
      type: string;
      static?: {
        max_chunk_size_tokens?: number;
        chunk_overlap_tokens?: number;
      };
    };
  }): Promise<{
    success: boolean;
    vectorStoreFileId?: string;
    status?: string;
    error?: string;
    details?: any;
  }> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Azure not configured. Please set ZAPPER_AZURE_SUBSCRIPTION_ID environment variable.'
      };
    }

    const { 
      projectName, 
      vectorStoreId,
      fileId,
      customSubdomain, 
      hubEndpoint,
      chunkingStrategy
    } = input;

    try {
      console.log(`[FOUNDRY] Attaching file ${fileId} to vector store ${vectorStoreId}`);
      console.log(`[FOUNDRY] Project: ${projectName}`);

      const token = await this.getAIAccessToken();
      
      const apiVersion = "v1";
      let baseEndpoint: string;
      if (hubEndpoint) {
        baseEndpoint = hubEndpoint.replace(/\/$/, '');
      } else if (customSubdomain) {
        baseEndpoint = `https://${customSubdomain.toLowerCase()}.services.ai.azure.com`;
      } else {
        return {
          success: false,
          error: 'Either hubEndpoint or customSubdomain is required'
        };
      }

      const url = `${baseEndpoint}/api/projects/${encodeURIComponent(projectName)}/vector_stores/${encodeURIComponent(vectorStoreId)}/files?api-version=${apiVersion}`;

      const requestBody: any = {
        file_id: fileId
      };

      if (chunkingStrategy) {
        requestBody.chunking_strategy = chunkingStrategy;
      }

      console.log(`[FOUNDRY] POST ${url}`);
      console.log(`[FOUNDRY] Request body:`, JSON.stringify(requestBody, null, 2));

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      const responseText = await response.text();
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { rawResponse: responseText };
      }

      if (!response.ok) {
        console.error(`[FOUNDRY] File attachment failed: ${response.status} ${response.statusText}`);
        console.error(`[FOUNDRY] Response:`, responseData);
        return {
          success: false,
          error: responseData.error?.message || `HTTP ${response.status}: ${response.statusText}`,
          details: responseData
        };
      }

      console.log(`[FOUNDRY] File attached to vector store`);
      console.log(`[FOUNDRY] Status: ${responseData.status}`);

      return {
        success: true,
        vectorStoreFileId: responseData.id,
        status: responseData.status
      };
    } catch (error: any) {
      console.error('[FOUNDRY] Error attaching file to vector store:', error.message);
      return {
        success: false,
        error: error.message,
        details: error.stack
      };
    }
  }

  /**
   * Add file to vector store by streaming from URL (WORKING APPROACH)
   * Step 1: Download file from SAS URL
   * Step 2: Upload via multipart form-data to /files endpoint
   * Step 3: Attach file_id to vector store
   */
  async addFileToVectorStoreFromUrl(input: {
    projectName: string;
    vectorStoreId: string;
    contentUrl: string;
    filename: string;
    mimeType?: string;
    customSubdomain?: string;
    hubEndpoint?: string;
    chunkingStrategy?: {
      type: string;
      static?: {
        max_chunk_size_tokens?: number;
        chunk_overlap_tokens?: number;
      };
    };
  }): Promise<{
    success: boolean;
    fileId?: string;
    vectorStoreFileId?: string;
    status?: string;
    usageBytes?: number;
    error?: string;
    details?: any;
  }> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Azure not configured. Please set ZAPPER_AZURE_SUBSCRIPTION_ID environment variable.'
      };
    }

    const { 
      projectName, 
      vectorStoreId,
      contentUrl,
      filename,
      mimeType = 'application/pdf',
      customSubdomain, 
      hubEndpoint,
      chunkingStrategy
    } = input;

    try {
      console.log(`[FOUNDRY] Adding file from URL to vector store ${vectorStoreId}`);
      console.log(`[FOUNDRY] Project: ${projectName}`);
      console.log(`[FOUNDRY] Filename: ${filename}`);
      console.log(`[FOUNDRY] Content URL: ${contentUrl.substring(0, 100)}...`);

      const token = await this.getAIAccessToken();
      
      const apiVersion = "v1";
      let baseEndpoint: string;
      if (hubEndpoint) {
        baseEndpoint = hubEndpoint.replace(/\/$/, '');
      } else if (customSubdomain) {
        baseEndpoint = `https://${customSubdomain.toLowerCase()}.services.ai.azure.com`;
      } else {
        return {
          success: false,
          error: 'Either hubEndpoint or customSubdomain is required'
        };
      }

      // STEP 1: Download file from SAS URL into memory
      console.log(`[FOUNDRY] Step 1: Downloading file from SAS URL...`);
      const downloadResponse = await fetch(contentUrl);
      if (!downloadResponse.ok) {
        return {
          success: false,
          error: `Failed to download file from URL: ${downloadResponse.status} ${downloadResponse.statusText}`
        };
      }
      
      const fileBuffer = Buffer.from(await downloadResponse.arrayBuffer());
      console.log(`[FOUNDRY] Downloaded ${fileBuffer.length} bytes`);

      // STEP 2: Upload file via multipart form-data
      console.log(`[FOUNDRY] Step 2: Uploading file via multipart form-data...`);
      const uploadUrl = `${baseEndpoint}/api/projects/${encodeURIComponent(projectName)}/files?api-version=${apiVersion}`;
      
      // Create multipart form boundary
      const boundary = `----FormBoundary${Date.now()}`;
      
      // Build multipart form body manually (like curl -F)
      const formParts: Buffer[] = [];
      
      // Add 'purpose' field
      formParts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="purpose"\r\n\r\n` +
        `assistants\r\n`
      ));
      
      // Add 'file' field with binary content
      formParts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n`
      ));
      formParts.push(fileBuffer);
      formParts.push(Buffer.from('\r\n'));
      
      // End boundary
      formParts.push(Buffer.from(`--${boundary}--\r\n`));
      
      const formBody = Buffer.concat(formParts);
      
      console.log(`[FOUNDRY] POST ${uploadUrl}`);
      console.log(`[FOUNDRY] Form body size: ${formBody.length} bytes`);

      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`
        },
        body: formBody
      });

      const uploadText = await uploadResponse.text();
      let uploadData: any;
      try {
        uploadData = JSON.parse(uploadText);
      } catch {
        uploadData = { rawResponse: uploadText };
      }

      if (!uploadResponse.ok) {
        console.error(`[FOUNDRY] File upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
        console.error(`[FOUNDRY] Response:`, uploadData);
        return {
          success: false,
          error: uploadData.error?.message || `HTTP ${uploadResponse.status}: ${uploadResponse.statusText}`,
          details: uploadData
        };
      }

      const fileId = uploadData.id;
      console.log(`[FOUNDRY] File uploaded successfully! ID: ${fileId}`);

      // STEP 3: Attach file to vector store
      console.log(`[FOUNDRY] Step 3: Attaching file ${fileId} to vector store ${vectorStoreId}...`);
      const attachUrl = `${baseEndpoint}/api/projects/${encodeURIComponent(projectName)}/vector_stores/${encodeURIComponent(vectorStoreId)}/files?api-version=${apiVersion}`;
      
      const attachBody: any = { file_id: fileId };
      if (chunkingStrategy) {
        attachBody.chunking_strategy = chunkingStrategy;
      }

      console.log(`[FOUNDRY] POST ${attachUrl}`);
      console.log(`[FOUNDRY] Attach body:`, JSON.stringify(attachBody, null, 2));

      const attachResponse = await fetch(attachUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(attachBody)
      });

      const attachText = await attachResponse.text();
      let attachData: any;
      try {
        attachData = JSON.parse(attachText);
      } catch {
        attachData = { rawResponse: attachText };
      }

      if (!attachResponse.ok) {
        console.error(`[FOUNDRY] File attachment failed: ${attachResponse.status} ${attachResponse.statusText}`);
        console.error(`[FOUNDRY] Response:`, attachData);
        return {
          success: false,
          fileId: fileId,
          error: attachData.error?.message || `HTTP ${attachResponse.status}: ${attachResponse.statusText}`,
          details: attachData
        };
      }

      console.log(`[FOUNDRY] File attached to vector store successfully!`);
      console.log(`[FOUNDRY] Vector Store File ID: ${attachData.id}, Status: ${attachData.status}`);

      return {
        success: true,
        fileId: fileId,
        vectorStoreFileId: attachData.id,
        status: attachData.status,
        usageBytes: attachData.usage_bytes
      };
    } catch (error: any) {
      console.error('[FOUNDRY] Error adding file from URL to vector store:', error.message);
      return {
        success: false,
        error: error.message,
        details: error.stack
      };
    }
  }

  /**
   * Get vector store file status
   */
  async getVectorStoreFile(input: {
    projectName: string;
    vectorStoreId: string;
    fileId: string;
    customSubdomain?: string;
    hubEndpoint?: string;
  }): Promise<{
    success: boolean;
    vectorStoreFile?: any;
    error?: string;
    details?: any;
  }> {
    if (!this.isConfigured) {
      return { success: false, error: 'Azure not configured' };
    }

    const { projectName, vectorStoreId, fileId, customSubdomain, hubEndpoint } = input;

    try {
      console.log(`[FOUNDRY] Getting vector store file status: ${fileId}`);

      const token = await this.getAIAccessToken();
      const apiVersion = "v1";
      
      let baseEndpoint: string;
      if (hubEndpoint) {
        baseEndpoint = hubEndpoint.replace(/\/$/, '');
      } else if (customSubdomain) {
        baseEndpoint = `https://${customSubdomain.toLowerCase()}.services.ai.azure.com`;
      } else {
        return { success: false, error: 'Either hubEndpoint or customSubdomain is required' };
      }

      const url = `${baseEndpoint}/api/projects/${encodeURIComponent(projectName)}/vector_stores/${encodeURIComponent(vectorStoreId)}/files/${encodeURIComponent(fileId)}?api-version=${apiVersion}`;

      console.log(`[FOUNDRY] GET ${url}`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error?.message || `HTTP ${response.status}`,
          details: errorData
        };
      }

      const data = await response.json();
      console.log(`[FOUNDRY] Vector store file status: ${data.status}`);

      return {
        success: true,
        vectorStoreFile: data
      };
    } catch (error: any) {
      console.error('[FOUNDRY] Error getting vector store file:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * List files in a vector store
   */
  async listVectorStoreFiles(input: {
    projectName: string;
    vectorStoreId: string;
    customSubdomain?: string;
    hubEndpoint?: string;
  }): Promise<{
    success: boolean;
    files?: any[];
    error?: string;
    details?: any;
  }> {
    if (!this.isConfigured) {
      return { success: false, error: 'Azure not configured' };
    }

    const { projectName, vectorStoreId, customSubdomain, hubEndpoint } = input;

    try {
      console.log(`[FOUNDRY] Listing files in vector store: ${vectorStoreId}`);

      const token = await this.getAIAccessToken();
      const apiVersion = "v1";
      
      let baseEndpoint: string;
      if (hubEndpoint) {
        baseEndpoint = hubEndpoint.replace(/\/$/, '');
      } else if (customSubdomain) {
        baseEndpoint = `https://${customSubdomain.toLowerCase()}.services.ai.azure.com`;
      } else {
        return { success: false, error: 'Either hubEndpoint or customSubdomain is required' };
      }

      const url = `${baseEndpoint}/api/projects/${encodeURIComponent(projectName)}/vector_stores/${encodeURIComponent(vectorStoreId)}/files?api-version=${apiVersion}`;

      console.log(`[FOUNDRY] GET ${url}`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error?.message || `HTTP ${response.status}`,
          details: errorData
        };
      }

      const data = await response.json();
      console.log(`[FOUNDRY] Found ${data.data?.length || 0} files in vector store`);

      return {
        success: true,
        files: data.data || []
      };
    } catch (error: any) {
      console.error('[FOUNDRY] Error listing vector store files:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a file from a vector store
   */
  async deleteVectorStoreFile(input: {
    projectName: string;
    vectorStoreId: string;
    fileId: string;
    customSubdomain?: string;
    hubEndpoint?: string;
  }): Promise<{
    success: boolean;
    deleted?: boolean;
    error?: string;
    details?: any;
  }> {
    if (!this.isConfigured) {
      return { success: false, error: 'Azure not configured' };
    }

    const { projectName, vectorStoreId, fileId, customSubdomain, hubEndpoint } = input;

    try {
      console.log(`[FOUNDRY] Deleting file ${fileId} from vector store: ${vectorStoreId}`);

      const token = await this.getAIAccessToken();
      const apiVersion = "v1";
      
      let baseEndpoint: string;
      if (hubEndpoint) {
        baseEndpoint = hubEndpoint.replace(/\/$/, '');
      } else if (customSubdomain) {
        baseEndpoint = `https://${customSubdomain.toLowerCase()}.services.ai.azure.com`;
      } else {
        return { success: false, error: 'Either hubEndpoint or customSubdomain is required' };
      }

      const url = `${baseEndpoint}/api/projects/${encodeURIComponent(projectName)}/vector_stores/${encodeURIComponent(vectorStoreId)}/files/${encodeURIComponent(fileId)}?api-version=${apiVersion}`;

      console.log(`[FOUNDRY] DELETE ${url}`);

      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`[FOUNDRY] Delete failed: ${response.status} ${response.statusText}`);
        return {
          success: false,
          error: errorData.error?.message || `HTTP ${response.status}`,
          details: errorData
        };
      }

      const data = await response.json().catch(() => ({ deleted: true }));
      console.log(`[FOUNDRY] File deleted from vector store successfully`);

      return {
        success: true,
        deleted: data.deleted ?? true
      };
    } catch (error: any) {
      console.error('[FOUNDRY] Error deleting vector store file:', error.message);
      return { success: false, error: error.message };
    }
  }
}

export const foundryProvisioningService = new FoundryProvisioningService();
