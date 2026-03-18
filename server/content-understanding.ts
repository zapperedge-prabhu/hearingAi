/**
 * Phase 1 - Azure Content Understanding Integration
 * 
 * This module provides connectivity between Azure Content Understanding (CU) 
 * and Microsoft Foundry resources via REST APIs.
 * 
 * Key functionality:
 * - Derives CU endpoint from Foundry resource name
 * - Authenticates using Managed Identity (DefaultAzureCredential)
 * - Configures default model deployments for CU
 */

import { DefaultAzureCredential } from "@azure/identity";

// API version for Content Understanding
const CU_API_VERSION = "2025-11-01";

// Scope for Cognitive Services authentication
const COGNITIVE_SERVICES_SCOPE = "https://cognitiveservices.azure.com/.default";

// Configurable poll interval in milliseconds (default: 2000ms = 2 seconds)
const CU_POLL_INTERVAL_MS = parseInt(process.env.ZAPPER_CU_POLL_INTERVAL_MS || "2000", 10);

// Configurable poll timeout per content type in seconds (default: 120 seconds)
// Video content typically needs longer timeout, configurable via ZAPPER_CU_VIDEO_TIMEOUT_SEC
const CU_DEFAULT_TIMEOUT_SEC = parseInt(process.env.ZAPPER_CU_DEFAULT_TIMEOUT_SEC || "120", 10);
const CU_VIDEO_TIMEOUT_SEC = parseInt(process.env.ZAPPER_CU_VIDEO_TIMEOUT_SEC || "900", 10);
const CU_IMAGE_TIMEOUT_SEC = parseInt(process.env.ZAPPER_CU_IMAGE_TIMEOUT_SEC || String(CU_DEFAULT_TIMEOUT_SEC), 10);
const CU_DOCUMENT_TIMEOUT_SEC = parseInt(process.env.ZAPPER_CU_DOCUMENT_TIMEOUT_SEC || String(CU_DEFAULT_TIMEOUT_SEC), 10);
const CU_AUDIO_TIMEOUT_SEC = parseInt(process.env.ZAPPER_CU_AUDIO_TIMEOUT_SEC || String(CU_DEFAULT_TIMEOUT_SEC), 10);

/**
 * Get timeout in seconds for a specific content type
 */
function getTimeoutForContentType(contentType: string): number {
  switch (contentType.toLowerCase()) {
    case "video":
      return CU_VIDEO_TIMEOUT_SEC;
    case "image":
      return CU_IMAGE_TIMEOUT_SEC;
    case "document":
      return CU_DOCUMENT_TIMEOUT_SEC;
    case "audio":
      return CU_AUDIO_TIMEOUT_SEC;
    default:
      return CU_DEFAULT_TIMEOUT_SEC;
  }
}

// Default model mappings (model name -> deployment name)
export interface ModelDeploymentMapping {
  "gpt-4.1"?: string;
  "gpt-4.1-mini"?: string;
  "text-embedding-3-large"?: string;
}

export interface ContentUnderstandingConnectRequest {
  foundryResourceName: string;
  modelDeployments?: ModelDeploymentMapping;
}

export interface ContentUnderstandingConnectResult {
  success: boolean;
  cuEndpoint: string;
  defaultsConfigured: boolean;
  message: string;
  details?: {
    authenticationStatus: "success" | "failed";
    deploymentStatus: "configured" | "already_configured" | "failed";
    modelMappings?: Record<string, string>;
  };
  error?: string;
}

/**
 * Derives the Content Understanding endpoint from a Foundry resource name.
 * Returns the primary endpoint (services.ai.azure.com) which is recommended
 * for the GA API and can discover model deployments on newer Foundry resources.
 * 
 * @param foundryResourceName - The name of the Foundry resource
 * @returns The CU endpoint URL
 */
export function deriveCuEndpoint(foundryResourceName: string): string {
  const endpoint = `https://${foundryResourceName}.cognitiveservices.azure.com`;
  console.log(`[CU] Derived Content Understanding endpoint: ${endpoint}`);
  return endpoint;
}

/**
 * Returns the alternate CU endpoint using services.ai.azure.com domain.
 * Newer Foundry resources may require this domain to discover model deployments.
 */
export function deriveCuEndpointAlt(foundryResourceName: string): string {
  return `https://${foundryResourceName}.services.ai.azure.com`;
}

/**
 * Acquires a bearer token for Cognitive Services using Managed Identity.
 * Uses DefaultAzureCredential which supports managed identity, Azure CLI, and other auth methods.
 * 
 * @returns Bearer token for Cognitive Services
 * @throws Error if authentication fails
 */
async function acquireToken(): Promise<string> {
  console.log(`[CU] Acquiring token for scope: ${COGNITIVE_SERVICES_SCOPE}`);
  
  try {
    const credential = new DefaultAzureCredential();
    const tokenResponse = await credential.getToken(COGNITIVE_SERVICES_SCOPE);
    
    if (!tokenResponse || !tokenResponse.token) {
      throw new Error("Failed to acquire token: No token returned");
    }
    
    console.log(`[CU] Authentication successful. Token acquired.`);
    return tokenResponse.token;
  } catch (error: any) {
    console.error(`[CU] Authentication failed:`, error.message);
    throw new Error(`Failed to authenticate with Azure: ${error.message}. Ensure the managed identity has Cognitive Services User or Contributor role.`);
  }
}

/**
 * Configures default model deployments for Content Understanding.
 * This is idempotent - if defaults already exist, it logs and proceeds safely.
 * 
 * @param cuEndpoint - The Content Understanding endpoint
 * @param token - Bearer token for authentication
 * @param modelMappings - Optional custom model deployment mappings
 * @returns Status of the configuration
 */
async function tryConfigureDefaultsAtEndpoint(
  endpointUrl: string,
  token: string,
  deployments: Record<string, string>
): Promise<{ status: "configured" | "already_configured" | "failed"; error?: string }> {
  const url = `${endpointUrl}/contentunderstanding/defaults?api-version=${CU_API_VERSION}`;
  console.log(`[CU] Trying to configure defaults at: ${url}`);
  
  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        modelDeployments: deployments
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`[CU] Default model deployments configured successfully at ${endpointUrl}:`, JSON.stringify(data, null, 2));
      return { status: "configured" };
    }
    
    if (response.status === 409) {
      console.log(`[CU] Default model deployments already configured at ${endpointUrl}.`);
      return { status: "already_configured" };
    }
    
    const errorText = await response.text();
    let errorMessage = `Status ${response.status}`;
    try {
      const errorData = JSON.parse(errorText);
      if (errorData.error?.innererror?.message) {
        errorMessage = errorData.error.innererror.message;
      } else if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      }
    } catch {
      errorMessage = errorText || errorMessage;
    }
    
    console.warn(`[CU] Failed at ${endpointUrl}: ${errorMessage}`);
    return { status: "failed", error: errorMessage };
  } catch (error: any) {
    console.warn(`[CU] Network error at ${endpointUrl}: ${error.message}`);
    return { status: "failed", error: error.message };
  }
}

async function configureDefaultDeployments(
  cuEndpoint: string,
  token: string,
  modelMappings?: ModelDeploymentMapping,
  foundryResourceName?: string
): Promise<{ status: "configured" | "already_configured" | "failed"; mappings?: Record<string, string>; error?: string }> {
  console.log(`[CU] Configuring default model deployments...`);
  
  const deployments: Record<string, string> = {};
  
  if (modelMappings) {
    if (modelMappings["gpt-4.1"]) {
      deployments["gpt-4.1"] = modelMappings["gpt-4.1"];
    }
    if (modelMappings["gpt-4.1-mini"]) {
      deployments["gpt-4.1-mini"] = modelMappings["gpt-4.1-mini"];
    }
    if (modelMappings["text-embedding-3-large"]) {
      deployments["text-embedding-3-large"] = modelMappings["text-embedding-3-large"];
    }
  } else {
    deployments["gpt-4.1"] = "gpt-4.1";
    deployments["gpt-4.1-mini"] = "gpt-4.1-mini";
    deployments["text-embedding-3-large"] = "text-embedding-3-large";
  }
  
  console.log(`[CU] Model deployment mappings:`, JSON.stringify(deployments, null, 2));
  
  // Try primary endpoint first (cognitiveservices.azure.com)
  const primaryResult = await tryConfigureDefaultsAtEndpoint(cuEndpoint, token, deployments);
  
  if (primaryResult.status !== "failed") {
    return { ...primaryResult, mappings: deployments };
  }
  
  // If primary fails with DeploymentIdNotFound, try alternate endpoint (services.ai.azure.com)
  // Newer Foundry resources may only expose deployments on the services.ai.azure.com domain
  if (foundryResourceName && primaryResult.error?.includes("does not exist")) {
    const altEndpoint = deriveCuEndpointAlt(foundryResourceName);
    console.log(`[CU] Primary endpoint failed with deployment not found. Trying alternate: ${altEndpoint}`);
    
    const altResult = await tryConfigureDefaultsAtEndpoint(altEndpoint, token, deployments);
    
    if (altResult.status !== "failed") {
      return { ...altResult, mappings: deployments };
    }
    
    return { status: "failed", error: `Both endpoints failed. Primary: ${primaryResult.error}. Alternate: ${altResult.error}` };
  }
  
  return { status: "failed", error: primaryResult.error };
}

/**
 * Connects Azure Content Understanding to a Foundry resource.
 * This is the main entry point for Phase 1 integration.
 * 
 * @param request - The connection request containing Foundry resource details
 * @returns Result of the connection attempt
 */
export async function connectContentUnderstanding(
  request: ContentUnderstandingConnectRequest
): Promise<ContentUnderstandingConnectResult> {
  console.log(`[CU] ========================================`);
  console.log(`[CU] Starting Content Understanding connection`);
  console.log(`[CU] Foundry Resource: ${request.foundryResourceName}`);
  console.log(`[CU] ========================================`);
  
  // Validate input
  if (!request.foundryResourceName || request.foundryResourceName.trim() === "") {
    console.error(`[CU] Error: Foundry resource name is required`);
    return {
      success: false,
      cuEndpoint: "",
      defaultsConfigured: false,
      message: "Foundry resource name is required",
      error: "Missing required parameter: foundryResourceName"
    };
  }
  
  // Step 1: Derive the CU endpoint
  const cuEndpoint = deriveCuEndpoint(request.foundryResourceName.trim());
  
  // Step 2: Authenticate using Managed Identity
  let token: string;
  try {
    token = await acquireToken();
  } catch (error: any) {
    return {
      success: false,
      cuEndpoint,
      defaultsConfigured: false,
      message: "Authentication failed",
      details: {
        authenticationStatus: "failed",
        deploymentStatus: "failed"
      },
      error: error.message
    };
  }
  
  // Step 3: Configure default model deployments
  const deploymentResult = await configureDefaultDeployments(
    cuEndpoint,
    token,
    request.modelDeployments,
    request.foundryResourceName.trim()
  );
  
  if (deploymentResult.status === "failed") {
    return {
      success: false,
      cuEndpoint,
      defaultsConfigured: false,
      message: "Failed to configure default model deployments",
      details: {
        authenticationStatus: "success",
        deploymentStatus: "failed"
      },
      error: deploymentResult.error
    };
  }
  
  // Success
  const statusMessage = deploymentResult.status === "already_configured"
    ? "Content Understanding connection established. Default deployments were already configured."
    : "Content Understanding connection established and default deployments configured successfully.";
  
  console.log(`[CU] ========================================`);
  console.log(`[CU] Connection completed successfully`);
  console.log(`[CU] Status: ${statusMessage}`);
  console.log(`[CU] ========================================`);
  
  return {
    success: true,
    cuEndpoint,
    defaultsConfigured: true,
    message: statusMessage,
    details: {
      authenticationStatus: "success",
      deploymentStatus: deploymentResult.status,
      modelMappings: deploymentResult.mappings
    }
  };
}

/**
 * Gets the current Content Understanding default model deployments.
 * 
 * @param foundryResourceName - The name of the Foundry resource
 * @returns Current default model deployments configuration
 */
export async function getContentUnderstandingStatus(
  foundryResourceName: string
): Promise<{
  success: boolean;
  cuEndpoint: string;
  defaults?: {
    modelDeployments?: Record<string, string>;
  };
  error?: string;
}> {
  console.log(`[CU] Getting status for Foundry resource: ${foundryResourceName}`);
  
  if (!foundryResourceName || foundryResourceName.trim() === "") {
    return {
      success: false,
      cuEndpoint: "",
      error: "Foundry resource name is required"
    };
  }
  
  const cuEndpoint = deriveCuEndpoint(foundryResourceName.trim());
  
  try {
    const token = await acquireToken();
    
    const url = `${cuEndpoint}/contentunderstanding/defaults?api-version=${CU_API_VERSION}`;
    console.log(`[CU] Fetching defaults from: ${url}`);
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`[CU] Current defaults:`, JSON.stringify(data, null, 2));
      return {
        success: true,
        cuEndpoint,
        defaults: data
      };
    }
    
    if (response.status === 404) {
      // No defaults configured yet
      return {
        success: true,
        cuEndpoint,
        defaults: { modelDeployments: {} }
      };
    }
    
    const errorText = await response.text();
    console.error(`[CU] Failed to get defaults. Status: ${response.status}, Error: ${errorText}`);
    
    let errorMessage = `Failed to get defaults: ${response.status}`;
    try {
      const errorData = JSON.parse(errorText);
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      }
    } catch {
      errorMessage = errorText || errorMessage;
    }
    
    return {
      success: false,
      cuEndpoint,
      error: errorMessage
    };
  } catch (error: any) {
    console.error(`[CU] Error getting status:`, error.message);
    return {
      success: false,
      cuEndpoint,
      error: error.message
    };
  }
}

/**
 * Development mode indicator - logs warning when Azure features are disabled
 */
export function logDevModeWarning(): void {
  if (process.env.NODE_ENV === "development") {
    console.log(`[CU] Content Understanding service running in development mode - Azure features may be limited`);
  }
}

// ========================================
// Phase 1: Document Analysis
// ========================================

export interface AnalyzeDocumentRequest {
  sasUrl: string;
  foundryResourceName: string;
  analyzerId?: string; // Optional: defaults to "prebuilt-layout"
  options?: {
    extractTables?: boolean;
    extractFigures?: boolean;
    outputFormat?: "markdown" | "json";
  };
}

export interface AnalyzeDocumentResult {
  success: boolean;
  operationId?: string;
  status?: "running" | "succeeded" | "failed" | "timeout" | "cancelled";
  result?: {
    // Document analysis fields
    content?: string;
    pages?: any[];
    tables?: any[];
    figures?: any[];
    sections?: any[];
    paragraphs?: any[];
    styles?: any[];
    // Image analysis fields
    caption?: {
      text?: string;
      confidence?: number;
    };
    denseCaptions?: any[];
    tags?: any[];
    objects?: any[];
    people?: any[];
    smartCrops?: any[];
    read?: any;
    // Audio/Video analysis fields
    transcription?: string;
    segments?: any[];
    speakers?: any[];
    // Raw result for any other fields
    [key: string]: any;
  };
  error?: string;
  details?: {
    analyzerId: string;
    cuEndpoint: string;
    contentType?: string;
    processingTimeMs?: number;
  };
}

/**
 * Detects content type from file extension in URL
 */
function detectContentType(url: string): "document" | "image" | "audio" | "video" | "unknown" {
  // Extract file extension from URL (before query params)
  const urlPath = url.split("?")[0].toLowerCase();
  const extension = urlPath.split(".").pop() || "";
  
  const documentExtensions = ["pdf", "docx", "doc", "xlsx", "xls", "pptx", "ppt", "txt", "rtf"];
  const imageExtensions = ["jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif", "webp"];
  const audioExtensions = ["mp3", "wav", "m4a", "flac", "aac", "ogg", "wma"];
  const videoExtensions = ["mp4", "mov", "avi", "mkv", "webm", "wmv", "flv"];
  
  if (documentExtensions.includes(extension)) return "document";
  if (imageExtensions.includes(extension)) return "image";
  if (audioExtensions.includes(extension)) return "audio";
  if (videoExtensions.includes(extension)) return "video";
  
  return "unknown";
}

/**
 * Gets the appropriate prebuilt analyzer ID based on content type.
 * Azure Content Understanding prebuilt analyzer names (2025-11-01 GA):
 * 
 * Documents:
 * - prebuilt-layout: Document layout extraction (tables, text, structure)
 * - prebuilt-read: OCR text extraction
 * - prebuilt-documentSearch: RAG-optimized document analysis
 * 
 * Images:
 * - prebuilt-image: Base image analyzer (requires custom analyzer with field schema)
 * - prebuilt-imageSearch: RAG-optimized image descriptions and insights
 * 
 * Audio:
 * - prebuilt-audio: Base audio analyzer (requires custom analyzer with field schema)
 * - prebuilt-audioSearch: Transcription with speaker diarization
 * 
 * Video:
 * - prebuilt-video: Base video analyzer (requires custom analyzer with field schema)
 * - prebuilt-videoSearch: Transcription, keyframes, segments
 */
function getPrebuiltAnalyzerId(contentType: string): string {
  switch (contentType) {
    case "document":
      return "prebuilt-layout";
    case "image":
      return "prebuilt-imageSearch";
    case "audio":
      return "prebuilt-audioSearch";
    case "video":
      return "prebuilt-videoSearch";
    default:
      return "prebuilt-layout"; // Default to document processing
  }
}

const BASE_ANALYZERS = new Set(["prebuilt-image", "prebuilt-audio", "prebuilt-video", "prebuilt-document"]);

function isBaseAnalyzer(analyzerId: string): boolean {
  return BASE_ANALYZERS.has(analyzerId);
}

function getCustomAnalyzerName(baseAnalyzerId: string): string {
  return `zapper_${baseAnalyzerId.replace(/-/g, '_')}`;
}

function getDefaultFieldSchema(baseAnalyzerId: string): Record<string, any> {
  switch (baseAnalyzerId) {
    case "prebuilt-image":
      return {
        name: "ZapperImageAnalysis",
        description: "Structured extraction from images",
        fields: {
          Caption: {
            type: "string",
            method: "generate",
            description: "A detailed descriptive caption for the image"
          },
          Tags: {
            type: "array",
            method: "generate",
            items: { type: "string" },
            description: "Relevant tags and keywords for the image"
          },
          Objects: {
            type: "array",
            method: "generate",
            description: "Objects detected in the image",
            items: {
              type: "object",
              properties: {
                Name: { type: "string", description: "Object name" },
                Confidence: { type: "string", description: "Detection confidence level" }
              }
            }
          },
          TextContent: {
            type: "string",
            method: "extract",
            description: "Any text visible in the image"
          },
          Category: {
            type: "string",
            method: "classify",
            enum: ["Photo", "Diagram", "Chart", "Screenshot", "Logo", "Drawing", "Other"],
            description: "Category of the image"
          }
        },
        definitions: {}
      };
    case "prebuilt-audio":
      return {
        name: "ZapperAudioAnalysis",
        description: "Structured extraction from audio content",
        fields: {
          Transcription: {
            type: "string",
            method: "extract",
            description: "Full transcription of the audio"
          },
          Summary: {
            type: "string",
            method: "generate",
            description: "A concise summary of the audio content"
          },
          Language: {
            type: "string",
            method: "classify",
            description: "Primary language spoken in the audio"
          },
          Topics: {
            type: "array",
            method: "generate",
            items: { type: "string" },
            description: "Key topics discussed"
          },
          SpeakerCount: {
            type: "string",
            method: "generate",
            description: "Estimated number of distinct speakers"
          }
        },
        definitions: {}
      };
    case "prebuilt-video":
      return {
        name: "ZapperVideoAnalysis",
        description: "Structured extraction from video content",
        fields: {
          Transcription: {
            type: "string",
            method: "extract",
            description: "Full transcription of spoken content"
          },
          Summary: {
            type: "string",
            method: "generate",
            description: "A concise summary of the video content"
          },
          Topics: {
            type: "array",
            method: "generate",
            items: { type: "string" },
            description: "Key topics covered in the video"
          },
          SceneDescriptions: {
            type: "array",
            method: "generate",
            description: "Descriptions of key scenes or segments",
            items: {
              type: "object",
              properties: {
                Description: { type: "string", description: "Scene description" },
                Timestamp: { type: "string", description: "Approximate timestamp" }
              }
            }
          }
        },
        definitions: {}
      };
    case "prebuilt-document":
      return {
        name: "ZapperDocumentAnalysis",
        description: "Structured extraction from documents",
        fields: {
          Title: {
            type: "string",
            method: "extract",
            description: "Document title"
          },
          Summary: {
            type: "string",
            method: "generate",
            description: "A concise summary of the document"
          },
          KeyEntities: {
            type: "array",
            method: "generate",
            items: { type: "string" },
            description: "Key entities mentioned (people, organizations, locations)"
          },
          DocumentType: {
            type: "string",
            method: "classify",
            enum: ["Report", "Invoice", "Contract", "Letter", "Form", "Manual", "Presentation", "Other"],
            description: "Type of document"
          }
        },
        definitions: {}
      };
    default:
      return {
        name: "ZapperGenericAnalysis",
        description: "Generic content extraction",
        fields: {
          Summary: {
            type: "string",
            method: "generate",
            description: "A summary of the content"
          }
        },
        definitions: {}
      };
  }
}

async function ensureCustomAnalyzer(
  cuEndpoint: string,
  token: string,
  baseAnalyzerId: string
): Promise<{ success: boolean; analyzerName: string; error?: string }> {
  const analyzerName = getCustomAnalyzerName(baseAnalyzerId);
  const url = `${cuEndpoint}/contentunderstanding/analyzers/${analyzerName}?api-version=${CU_API_VERSION}`;

  console.log(`[CU] Base analyzer "${baseAnalyzerId}" requires custom analyzer with field schema`);
  console.log(`[CU] Checking/creating custom analyzer: ${analyzerName}`);

  const fieldSchema = getDefaultFieldSchema(baseAnalyzerId);

  const analyzerBody: Record<string, any> = {
    description: fieldSchema.description,
    baseAnalyzerId: baseAnalyzerId,
    fieldSchema: fieldSchema
  };

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(analyzerBody)
    });

    if (response.status === 200 || response.status === 201) {
      console.log(`[CU] Custom analyzer "${analyzerName}" created/updated successfully`);
      return { success: true, analyzerName };
    }

    const errorText = await response.text();
    console.error(`[CU] Failed to create custom analyzer. Status: ${response.status}`);
    console.error(`[CU] Error: ${errorText}`);

    let errorMessage = `Failed to create custom analyzer: ${response.status}`;
    try {
      const errorData = JSON.parse(errorText);
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      }
    } catch {}

    return { success: false, analyzerName, error: errorMessage };
  } catch (error: any) {
    console.error(`[CU] Error creating custom analyzer:`, error.message);
    return { success: false, analyzerName, error: error.message };
  }
}

async function resolveAnalyzerId(
  cuEndpoint: string,
  token: string,
  analyzerId: string,
  skipCustomAnalyzer: boolean = false
): Promise<{ analyzerId: string; error?: string }> {
  if (!isBaseAnalyzer(analyzerId)) {
    return { analyzerId };
  }

  if (skipCustomAnalyzer) {
    console.log(`[CU] Using base analyzer "${analyzerId}" directly (custom analyzer skipped)`);
    return { analyzerId };
  }

  const result = await ensureCustomAnalyzer(cuEndpoint, token, analyzerId);
  if (!result.success) {
    return { analyzerId, error: result.error };
  }

  console.log(`[CU] Resolved base analyzer "${analyzerId}" → custom analyzer "${result.analyzerName}"`);
  return { analyzerId: result.analyzerName };
}

/**
 * Submits a document for analysis and returns the operation location for polling
 */
async function submitDocumentForAnalysis(
  cuEndpoint: string,
  token: string,
  analyzerId: string,
  sasUrl: string
): Promise<{ success: boolean; operationLocation?: string; error?: string }> {
  const url = `${cuEndpoint}/contentunderstanding/analyzers/${analyzerId}:analyze?api-version=${CU_API_VERSION}`;
  console.log(`[CU] Submitting document for analysis: ${url}`);
  console.log(`[CU] Analyzer: ${analyzerId}`);
  console.log(`[CU] API Version: ${CU_API_VERSION}`);
  
  try {
    // Azure CU API format - GA version 2025-11-01 requires inputs array
    // See: https://learn.microsoft.com/en-us/rest/api/contentunderstanding/content-analyzers/analyze
    const requestBody = {
      inputs: [
        {
          url: sasUrl
        }
      ]
    };
    console.log(`[CU] Request body:`, JSON.stringify(requestBody, null, 2));
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });
    
    if (response.status === 202) {
      // Accepted - get operation location from headers
      const operationLocation = response.headers.get("operation-location");
      console.log(`[CU] Analysis submitted. Operation location: ${operationLocation}`);
      
      if (!operationLocation) {
        return { success: false, error: "No operation-location header in response" };
      }
      
      return { success: true, operationLocation };
    }
    
    const errorText = await response.text();
    console.error(`[CU] Failed to submit analysis. Status: ${response.status}`);
    console.error(`[CU] Response headers:`, Object.fromEntries(response.headers.entries()));
    console.error(`[CU] Error response body: ${errorText}`);
    
    let errorMessage = `Failed to submit analysis: ${response.status}`;
    try {
      const errorData = JSON.parse(errorText);
      console.error(`[CU] Parsed error data:`, JSON.stringify(errorData, null, 2));
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      } else if (typeof errorData.error === 'string') {
        errorMessage = errorData.error;
      }
    } catch {
      errorMessage = errorText || errorMessage;
    }
    
    return { success: false, error: errorMessage };
  } catch (error: any) {
    console.error(`[CU] Error submitting document:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Fetches the final analysis result from the resource location
 */
async function fetchAnalysisResult(
  resourceLocation: string,
  token: string
): Promise<{ success: boolean; result?: any; error?: string }> {
  console.log(`[CU] Fetching analysis result from: ${resourceLocation}`);
  
  try {
    const response = await fetch(resourceLocation, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[CU] Failed to fetch result. Status: ${response.status}, Error: ${errorText}`);
      return { success: false, error: `Failed to fetch result: ${response.status}` };
    }
    
    const result = await response.json();
    console.log(`[CU] Successfully fetched analysis result`);
    return { success: true, result };
    
  } catch (error: any) {
    console.error(`[CU] Error fetching result:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Polls for analysis result until complete or timeout
 * Azure CU returns {status, resourceLocation} - we need to fetch from resourceLocation when complete
 */
async function pollForResult(
  operationLocation: string,
  token: string,
  maxAttempts: number = 60,
  pollIntervalMs: number = 2000
): Promise<{ success: boolean; status: string; result?: any; error?: string }> {
  console.log(`[CU] Polling for result at: ${operationLocation}`);
  console.log(`[CU] Max attempts: ${maxAttempts}, Poll interval: ${pollIntervalMs}ms`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(operationLocation, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CU] Poll failed. Status: ${response.status}, Error: ${errorText}`);
        return { success: false, status: "failed", error: `Poll failed: ${response.status}` };
      }
      
      const data = await response.json();
      const status = data.status?.toLowerCase() || "unknown";
      
      console.log(`[CU] Poll attempt ${attempt}/${maxAttempts} - Status: ${status}`);
      
      if (status === "succeeded" || status === "completed") {
        console.log(`[CU] Analysis completed successfully`);
        
        // Azure CU returns resourceLocation - fetch the actual result from there
        if (data.resourceLocation) {
          console.log(`[CU] Fetching result from resourceLocation: ${data.resourceLocation}`);
          const resultFetch = await fetchAnalysisResult(data.resourceLocation, token);
          if (resultFetch.success) {
            return { success: true, status: "succeeded", result: resultFetch.result };
          } else {
            return { success: false, status: "failed", error: resultFetch.error };
          }
        }
        
        // Fallback: if result is directly in response (some API versions)
        if (data.result) {
          return { success: true, status: "succeeded", result: data.result };
        }
        
        // Return the entire data if no resourceLocation or result
        return { success: true, status: "succeeded", result: data };
      }
      
      if (status === "failed") {
        const errorMessage = data.error?.message || data.error?.code || "Analysis failed";
        const errorDetails = data.error?.innererror?.message || "";
        console.error(`[CU] Analysis failed: ${errorMessage} ${errorDetails}`);
        return { success: false, status: "failed", error: `${errorMessage}${errorDetails ? `: ${errorDetails}` : ""}` };
      }
      
      if (status === "canceled" || status === "cancelled") {
        return { success: false, status: "cancelled", error: "Analysis was cancelled" };
      }
      
      // Still running, wait and poll again
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      
    } catch (error: any) {
      console.error(`[CU] Error polling for result:`, error.message);
      return { success: false, status: "failed", error: error.message };
    }
  }
  
  return { success: false, status: "timeout", error: `Analysis timed out after ${maxAttempts * pollIntervalMs / 1000} seconds. The document may still be processing - try again later.` };
}

// ========================================
// Async Video Analysis Functions (Phase 2)
// ========================================

export interface SubmitVideoAnalysisRequest {
  sasUrl: string;
  foundryResourceName: string;
  analyzerId?: string;
}

export interface SubmitVideoAnalysisResult {
  success: boolean;
  operationLocation?: string;
  analyzerId?: string;
  cuEndpoint?: string;
  error?: string;
}

export interface CheckVideoStatusResult {
  success: boolean;
  status: "submitted" | "running" | "succeeded" | "failed" | "cancelled";
  resourceLocation?: string;
  result?: any;
  error?: string;
}

/**
 * Submits a video for async analysis and returns immediately with the operation location.
 * Does NOT wait for completion - the caller should poll for status separately.
 */
export async function submitVideoAnalysisAsync(
  request: SubmitVideoAnalysisRequest
): Promise<SubmitVideoAnalysisResult> {
  console.log(`[CU-ASYNC] ========================================`);
  console.log(`[CU-ASYNC] Submitting async video analysis`);
  console.log(`[CU-ASYNC] Foundry Resource: ${request.foundryResourceName}`);
  console.log(`[CU-ASYNC] SAS URL: ${request.sasUrl.substring(0, 80)}...`);
  console.log(`[CU-ASYNC] ========================================`);

  // Validate inputs
  if (!request.sasUrl || request.sasUrl.trim() === "") {
    return { success: false, error: "SAS URL is required" };
  }

  if (!request.foundryResourceName || request.foundryResourceName.trim() === "") {
    return { success: false, error: "Foundry resource name is required" };
  }

  // Verify content type is video
  const contentType = detectContentType(request.sasUrl);
  if (contentType !== "video") {
    return { success: false, error: `Async analysis only supports video content. Detected: ${contentType}` };
  }

  let analyzerId = request.analyzerId || getPrebuiltAnalyzerId("video");
  const cuEndpoint = deriveCuEndpoint(request.foundryResourceName.trim());

  // Authenticate
  let token: string;
  try {
    token = await acquireToken();
  } catch (error: any) {
    return { success: false, error: `Authentication failed: ${error.message}` };
  }

  // Configure default model deployments for video analysis (LLM required)
  console.log(`[CU-ASYNC] Configuring default model deployments for video...`);
  const modelMappings = {
    "gpt-4.1": "gpt-4-1",
    "gpt-4.1-mini": "gpt-4-1-mini",
    "text-embedding-3-large": "text-embedding-3-large"
  };

  const defaultsResult = await configureDefaultDeployments(cuEndpoint, token, modelMappings, request.foundryResourceName.trim());
  if (defaultsResult.status === "failed") {
    console.warn(`[CU-ASYNC] Warning: Could not configure default deployments: ${defaultsResult.error}`);
  } else {
    console.log(`[CU-ASYNC] Default deployments configured: ${defaultsResult.status}`);
  }

  const useBaseDirectly1 = analyzerId === "prebuilt-document";
  const resolved = await resolveAnalyzerId(cuEndpoint, token, analyzerId, useBaseDirectly1);
  if (resolved.error) {
    console.warn(`[CU-ASYNC] Warning: Could not create custom analyzer for ${analyzerId}: ${resolved.error}`);
  }
  analyzerId = resolved.analyzerId;

  // Submit video for analysis (returns immediately)
  const submitResult = await submitDocumentForAnalysis(cuEndpoint, token, analyzerId, request.sasUrl);

  if (!submitResult.success || !submitResult.operationLocation) {
    return { success: false, error: submitResult.error || "Failed to submit video for analysis" };
  }

  console.log(`[CU-ASYNC] Video analysis submitted successfully`);
  console.log(`[CU-ASYNC] Operation location: ${submitResult.operationLocation}`);

  return {
    success: true,
    operationLocation: submitResult.operationLocation,
    analyzerId,
    cuEndpoint
  };
}

// ========================================
// Generalized Async Analysis (All Content Types)
// ========================================

export interface SubmitCuAnalysisRequest {
  sasUrl: string;
  foundryResourceName: string;
  analyzerId?: string;
  contentType?: string;
}

export interface SubmitCuAnalysisResult {
  success: boolean;
  operationLocation?: string;
  analyzerId?: string;
  cuEndpoint?: string;
  contentType?: string;
  error?: string;
}

export async function submitCuAnalysisAsync(
  request: SubmitCuAnalysisRequest
): Promise<SubmitCuAnalysisResult> {
  const contentType = request.contentType || detectContentType(request.sasUrl);

  console.log(`[CU-ASYNC] ========================================`);
  console.log(`[CU-ASYNC] Submitting async ${contentType} analysis`);
  console.log(`[CU-ASYNC] Foundry Resource: ${request.foundryResourceName}`);
  console.log(`[CU-ASYNC] SAS URL: ${request.sasUrl.substring(0, 80)}...`);
  console.log(`[CU-ASYNC] ========================================`);

  if (!request.sasUrl || request.sasUrl.trim() === "") {
    return { success: false, error: "SAS URL is required" };
  }

  if (!request.foundryResourceName || request.foundryResourceName.trim() === "") {
    return { success: false, error: "Foundry resource name is required" };
  }

  let analyzerId = request.analyzerId || getPrebuiltAnalyzerId(contentType);
  const cuEndpoint = deriveCuEndpoint(request.foundryResourceName.trim());

  let token: string;
  try {
    token = await acquireToken();
  } catch (error: any) {
    return { success: false, error: `Authentication failed: ${error.message}` };
  }

  console.log(`[CU-ASYNC] Configuring default model deployments for ${contentType}...`);
  const modelMappings = {
    "gpt-4.1": "gpt-4-1",
    "gpt-4.1-mini": "gpt-4-1-mini",
    "text-embedding-3-large": "text-embedding-3-large"
  };

  const defaultsResult = await configureDefaultDeployments(cuEndpoint, token, modelMappings, request.foundryResourceName.trim());
  if (defaultsResult.status === "failed") {
    console.warn(`[CU-ASYNC] Warning: Could not configure default deployments: ${defaultsResult.error}`);
  } else {
    console.log(`[CU-ASYNC] Default deployments configured: ${defaultsResult.status}`);
  }

  const useBaseDirectly2 = analyzerId === "prebuilt-document";
  const resolved2 = await resolveAnalyzerId(cuEndpoint, token, analyzerId, useBaseDirectly2);
  if (resolved2.error) {
    console.warn(`[CU-ASYNC] Warning: Could not create custom analyzer for ${analyzerId}: ${resolved2.error}`);
  }
  analyzerId = resolved2.analyzerId;

  const submitResult = await submitDocumentForAnalysis(cuEndpoint, token, analyzerId, request.sasUrl);

  if (!submitResult.success || !submitResult.operationLocation) {
    return { success: false, error: submitResult.error || `Failed to submit ${contentType} for analysis` };
  }

  console.log(`[CU-ASYNC] ${contentType} analysis submitted successfully`);
  console.log(`[CU-ASYNC] Operation location: ${submitResult.operationLocation}`);

  return {
    success: true,
    operationLocation: submitResult.operationLocation,
    analyzerId,
    cuEndpoint,
    contentType
  };
}

export type CheckCuStatusResult = CheckVideoStatusResult;

export async function checkCuAnalysisStatus(
  operationLocation: string
): Promise<CheckCuStatusResult> {
  return checkVideoAnalysisStatus(operationLocation);
}

/**
 * Checks the status of an async video analysis job (single check, no polling loop).
 * Returns the current status and result if completed.
 */
export async function checkVideoAnalysisStatus(
  operationLocation: string
): Promise<CheckVideoStatusResult> {
  console.log(`[CU-ASYNC] Checking status at: ${operationLocation}`);

  let token: string;
  try {
    token = await acquireToken();
  } catch (error: any) {
    return { success: false, status: "failed", error: `Authentication failed: ${error.message}` };
  }

  try {
    const response = await fetch(operationLocation, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[CU-ASYNC] Status check failed. Status: ${response.status}, Error: ${errorText}`);
      return { success: false, status: "failed", error: `Status check failed: ${response.status}` };
    }

    const data = await response.json();
    const rawStatus = data.status?.toLowerCase() || "unknown";

    console.log(`[CU-ASYNC] Current status: ${rawStatus}`);

    // Map Azure status to our status
    let status: CheckVideoStatusResult["status"];
    if (rawStatus === "succeeded" || rawStatus === "completed") {
      status = "succeeded";
    } else if (rawStatus === "failed") {
      status = "failed";
    } else if (rawStatus === "canceled" || rawStatus === "cancelled") {
      status = "cancelled";
    } else if (rawStatus === "running" || rawStatus === "inprogress" || rawStatus === "notstarted") {
      status = "running";
    } else {
      status = "running"; // Default to running for unknown states
    }

    // If succeeded, get the result
    if (status === "succeeded") {
      // Check if result is directly in the response (some Azure API versions)
      if (data.result || data.analyzeResult) {
        console.log(`[CU-ASYNC] Analysis completed. Result found directly in response.`);
        return { 
          success: true, 
          status: "succeeded", 
          result: data.result || data.analyzeResult, 
          resourceLocation: data.resourceLocation 
        };
      }
      
      // Otherwise fetch from resourceLocation if available
      if (data.resourceLocation) {
        console.log(`[CU-ASYNC] Analysis completed. Fetching result from: ${data.resourceLocation}`);
        const resultFetch = await fetchAnalysisResult(data.resourceLocation, token);
        if (resultFetch.success) {
          return { success: true, status: "succeeded", result: resultFetch.result, resourceLocation: data.resourceLocation };
        } else {
          return { success: false, status: "failed", error: resultFetch.error };
        }
      }
      
      // If succeeded but no result available, return the whole response as result
      console.log(`[CU-ASYNC] Analysis completed but no resourceLocation. Using response data as result.`);
      return { 
        success: true, 
        status: "succeeded", 
        result: data, 
        resourceLocation: data.resourceLocation 
      };
    }

    // If failed, extract error message
    if (status === "failed") {
      const errorMessage = data.error?.message || data.error?.code || "Analysis failed";
      return { success: false, status: "failed", error: errorMessage };
    }

    // Still running
    return { success: true, status, resourceLocation: data.resourceLocation };

  } catch (error: any) {
    console.error(`[CU-ASYNC] Error checking status:`, error.message);
    return { success: false, status: "failed", error: error.message };
  }
}

/**
 * Expose detectContentType for external use
 */
export { detectContentType };

/**
 * Analyzes a document using Azure Content Understanding.
 * 
 * @param request - The analysis request containing SAS URL and options
 * @returns Analysis result with extracted content
 */
export async function analyzeDocument(
  request: AnalyzeDocumentRequest
): Promise<AnalyzeDocumentResult> {
  const startTime = Date.now();
  
  console.log(`[CU] ========================================`);
  console.log(`[CU] Starting document analysis`);
  console.log(`[CU] Foundry Resource: ${request.foundryResourceName}`);
  console.log(`[CU] SAS URL: ${request.sasUrl.substring(0, 80)}...`);
  console.log(`[CU] ========================================`);
  
  // Validate inputs
  if (!request.sasUrl || request.sasUrl.trim() === "") {
    return {
      success: false,
      error: "SAS URL is required"
    };
  }
  
  if (!request.foundryResourceName || request.foundryResourceName.trim() === "") {
    return {
      success: false,
      error: "Foundry resource name is required"
    };
  }
  
  // Detect content type and get appropriate analyzer
  const contentType = detectContentType(request.sasUrl);
  let analyzerId = request.analyzerId || getPrebuiltAnalyzerId(contentType);
  
  console.log(`[CU] Detected content type: ${contentType}`);
  console.log(`[CU] Using analyzer: ${analyzerId}`);
  
  // Derive CU endpoint
  const cuEndpoint = deriveCuEndpoint(request.foundryResourceName.trim());
  
  // Authenticate
  let token: string;
  try {
    token = await acquireToken();
  } catch (error: any) {
    return {
      success: false,
      error: `Authentication failed: ${error.message}`,
      details: {
        analyzerId,
        cuEndpoint,
        contentType
      }
    };
  }
  
  // Always ensure defaults are configured before any analysis.
  // Azure CU requires PATCH /contentunderstanding/defaults to be called at least once
  // before any analyzer can run - even for document/prebuilt analyzers on fresh deployments.
  console.log(`[CU] Ensuring default model deployments are configured...`);
  
  // Use Azure-compliant deployment names (periods replaced with dashes)
  // These match the actual deployment names created by /api/foundry/deploy-cu-models
  const modelMappings = {
    "gpt-4.1": "gpt-4-1",
    "gpt-4.1-mini": "gpt-4-1-mini",
    "text-embedding-3-large": "text-embedding-3-large"
  };
  
  const defaultsResult = await configureDefaultDeployments(cuEndpoint, token, modelMappings, request.foundryResourceName.trim());
  
  if (defaultsResult.status === "failed") {
    console.warn(`[CU] Warning: Could not configure default deployments: ${defaultsResult.error}`);
    console.warn(`[CU] Proceeding with analysis - defaults may already be configured`);
  } else {
    console.log(`[CU] Default deployments configured: ${defaultsResult.status}`);
  }
  
  const useBaseDirectly = analyzerId === "prebuilt-document";
  const resolved = await resolveAnalyzerId(cuEndpoint, token, analyzerId, useBaseDirectly);
  if (resolved.error) {
    console.warn(`[CU] Warning: Could not create custom analyzer for ${analyzerId}: ${resolved.error}`);
    console.warn(`[CU] Proceeding with original analyzer - it may fail if field schema is required`);
  }
  analyzerId = resolved.analyzerId;
  
  // Submit content for analysis
  const submitResult = await submitDocumentForAnalysis(cuEndpoint, token, analyzerId, request.sasUrl);
  
  if (!submitResult.success || !submitResult.operationLocation) {
    return {
      success: false,
      error: submitResult.error || "Failed to submit content for analysis",
      details: {
        analyzerId,
        cuEndpoint,
        contentType
      }
    };
  }
  
  // Poll for result - timeout is configurable per content type via environment variables
  const timeoutSec = getTimeoutForContentType(contentType);
  const maxAttempts = Math.ceil((timeoutSec * 1000) / CU_POLL_INTERVAL_MS);
  console.log(`[CU] Using timeout: ${timeoutSec}s (${maxAttempts} attempts at ${CU_POLL_INTERVAL_MS}ms interval) for content type: ${contentType}`);
  const pollResult = await pollForResult(submitResult.operationLocation, token, maxAttempts, CU_POLL_INTERVAL_MS);
  
  const processingTimeMs = Date.now() - startTime;
  
  if (!pollResult.success) {
    return {
      success: false,
      status: pollResult.status as any,
      error: pollResult.error,
      details: {
        analyzerId,
        cuEndpoint,
        contentType,
        processingTimeMs
      }
    };
  }
  
  console.log(`[CU] ========================================`);
  console.log(`[CU] ${contentType.toUpperCase()} analysis completed in ${processingTimeMs}ms`);
  console.log(`[CU] ========================================`);
  
  return {
    success: true,
    status: "succeeded",
    result: pollResult.result,
    details: {
      analyzerId,
      cuEndpoint,
      contentType,
      processingTimeMs
    }
  };
}
