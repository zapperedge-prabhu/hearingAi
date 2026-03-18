import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useRole } from "@/contexts/role-context";
import { useRolePermissions } from "@/hooks/use-role-permissions";
import { useAuth } from "@/hooks/use-auth";
import { useAIAgentProgress } from "@/hooks/use-ai-agent-progress";
import AIAgentProgressDialog from "@/components/ai-agent-progress-dialog";
import { 
  Files, 
  Plus, 
  Trash2, 
  Download, 
  Upload, 
  Folder, 
  FolderPlus,
  FolderOpen,
  File,
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  Settings,
  Play,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Loader2,
  Shield,
  Eye,
  Lock,
  KeyRound,
  Search,
  X,
  Pencil,
  Flame
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { buildFileApiUrl } from "@/lib/api";
import { BlockBlobClient, StorageRetryPolicyType } from "@azure/storage-blob";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { LoadingSpinner } from "@/components/ui/spinner";
import FilePreviewDialog from "@/components/file-preview-dialog";
import { detectBrowserCapabilities, getUnsupportedBrowserMessage, type BrowserCapabilities } from "@/lib/browserCapabilities";
import { FolderDownloadManager, type DownloadProgress, type DownloadManifest, formatBytes } from "@/lib/folderDownloadManager";
import * as openpgp from "openpgp";

interface OrganizationStorageAccount {
  id: number;
  name: string;
  location: string;
  containerName: string;
  organizationId: number;
  organizationName: string;
  createdAt: string;
  kind?: string; // 'blob' or 'adls'
}

interface FileItem {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  lastModified?: string;
  path: string;
  scanResult?: 'Clean' | 'Malicious' | 'Scanning' | 'NotScanned' | 'Unknown' | null;
  scanTime?: string | null;
  sensitiveDataType?: string | null;
  sensitiveDataConfidence?: string | null;
  isEncrypted?: boolean;
  encryptionKeyId?: string;
  encryptionKeyVersion?: number;
  encryptedAt?: string;
  accessTier?: string | null;
  archiveStatus?: string | null;
  rehydratePriority?: string | null;
}

interface AiAgent {
  id: number;
  name: string;
  apiEndpoint: string;
  organizationId: number;
  organizationName: string;
  createdAt: string;
}

interface UploadConfig {
  fileUploadMode: string;
  memoryUploadLimitMB: number;
  uploadDir: string;
  sasTimeoutMinutes: number;
  chunkSizeMB: number;
  uploadConcurrency: number;
  maxRetries: number;
  chunkSizeBytes: number;
  maxFilesCount: number;
  maxUploadSizeGB: number;
  maxUploadSizeBytes: number;
}

interface SearchResult {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  lastModified?: string;
  isEncrypted?: boolean;
}

interface SearchResponse {
  items: SearchResult[];
  resultCount: number;
  continuationToken?: string;
  searchMetadata: {
    query: string;
    matchMode: string;
    caseSensitive: boolean;
    scopePath: string | null;
    pageSize: number;
    durationMs: number;
    itemsScanned: number;
    timedOut: boolean;
  };
}

const createFolderSchema = z.object({
  folderName: z.string().min(1, "Folder name is required"),
});

type CreateFolderFormData = z.infer<typeof createFolderSchema>;

// Enhanced upload function with chunking, parallelism, and retries
async function uploadFileWithChunks(
  file: File, 
  sasUrl: string, 
  uploadConfig: any,
  onProgress?: (uploadedBytes: number, totalBytes: number) => void
): Promise<{ file: string; success: boolean; size: number }> {
  // Configuration for chunking and parallelism from server config
  const blockSize = uploadConfig?.chunkSizeBytes || (4 * 1024 * 1024); // Default 4MB chunks
  const concurrency = uploadConfig?.uploadConcurrency || 5; // Default 5 parallel uploads
  const maxRetries = uploadConfig?.maxRetries || 3; // Default 3 retry attempts per chunk
  
  // Azure SDK's maxTries = total attempts (initial + retries), so add 1 to maxRetries config
  const maxTries = Math.max(1, maxRetries + 1); // Ensure at least 1 attempt
  
  // Create BlockBlobClient with retry options for network resilience
  // SAS URLs include embedded credentials, so we pass undefined as credential and options as third param
  const blockBlobClient = new BlockBlobClient(sasUrl, undefined, {
    retryOptions: {
      maxTries: maxTries,
      retryDelayInMs: 2000,
      maxRetryDelayInMs: 60000,
      retryPolicyType: StorageRetryPolicyType.EXPONENTIAL,
      tryTimeoutInMs: 60000
    }
  });
  
  console.log(`📤 Starting chunked upload for ${file.name} (${Math.round(file.size / 1024 / 1024)}MB)`);
  console.log(`📊 Using ${Math.ceil(file.size / blockSize)} chunks with ${concurrency} parallel uploads`);
  console.log(`⚙️ Upload config: ${uploadConfig?.chunkSizeMB}MB chunks, ${concurrency} parallel, ${maxTries} total attempts (1 initial + ${maxRetries} retries) with exponential backoff`);
  console.log(`⏱️ Retry policy: 2-60s delay, 60s timeout per block attempt`);
  
  try {
    // Use Azure SDK's built-in parallel upload with chunking
    await blockBlobClient.uploadBrowserData(file, {
      blockSize: blockSize,
      concurrency: concurrency,
      maxSingleShotSize: blockSize, // Always use chunking for consistency
      onProgress: (progressEvent) => {
        const uploadedBytes = progressEvent.loadedBytes || 0;
        const totalBytes = file.size;
        const percent = Math.round((uploadedBytes / totalBytes) * 100);
        
        console.log(`📈 ${file.name}: ${percent}% (${Math.round(uploadedBytes / 1024 / 1024)}MB / ${Math.round(totalBytes / 1024 / 1024)}MB)`);
        
        if (onProgress) {
          onProgress(uploadedBytes, totalBytes);
        }
      }
    });
    
    console.log(`✅ ${file.name} uploaded successfully with chunking`);
    return { file: file.name, success: true, size: file.size };
    
  } catch (error: any) {
    console.error(`❌ Chunked upload failed for ${file.name}:`, error);
    
    // If Azure SDK chunked upload fails, fall back to simple PUT (for smaller files)
    if (file.size <= blockSize) {
      console.log(`🔄 Falling back to simple upload for ${file.name}`);
      return await uploadFileSimple(file, sasUrl);
    }
    
    throw error;
  }
}

// Fallback simple upload function (existing logic)
async function uploadFileSimple(
  file: File, 
  sasUrl: string
): Promise<{ file: string; success: boolean; size: number }> {
  console.log(`📤 Simple upload for ${file.name}...`);
  
  const response = await fetch(sasUrl, {
    method: "PUT",
    headers: {
      "x-ms-blob-type": "BlockBlob",
      "Content-Type": file.type || "application/octet-stream",
      "Content-Length": file.size.toString(),
    },
    body: file
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Simple upload failed for ${file.name}:`, errorText);
    throw new Error(`Failed to upload ${file.name}: ${response.status} - ${errorText}`);
  }
  
  console.log(`✅ ${file.name} uploaded successfully (simple)`);
  return { file: file.name, success: true, size: file.size };
}

// Helper function to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  const size = bytes / Math.pow(k, i);
  const formattedSize = size >= 10 ? Math.round(size) : size.toFixed(1);
  
  return `${formattedSize} ${sizes[i]}`;
};

export default function FileManagement() {
  const { toast } = useToast();
  const { selectedOrganizationId, selectedRole } = useRole();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  
  // Get current user's role permissions
  const { data: rolePermissions } = useRolePermissions();
  const [currentPath, setCurrentPath] = useState("");
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [pathHistory, setPathHistory] = useState<string[]>([]);
  const [sortField, setSortField] = useState<"name" | "size" | "lastModified">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<Array<{ name: string; size: number; progress: number; status: 'pending' | 'uploading' | 'completed' | 'error'; error?: string }>>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [fileCount, setFileCount] = useState<number>(0);
  const [emptyFolderSelected, setEmptyFolderSelected] = useState(false);
  const [selectedAiAgent, setSelectedAiAgent] = useState<string>("");
  const [runningAgentFiles, setRunningAgentFiles] = useState<Set<string>>(new Set());
  const [downloadingFiles, setDownloadingFiles] = useState<Set<string>>(new Set());
  const [downloadProgress, setDownloadProgress] = useState<{ [key: string]: number }>({});
  const [rehydratingFiles, setRehydratingFiles] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [uploadValidationError, setUploadValidationError] = useState<string | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [itemToRename, setItemToRename] = useState<FileItem | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [previewingFile, setPreviewingFile] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{
    url: string;
    fileName: string;
    fileExtension: string;
    contentType: string;
    fileSize: number;
    userEmail: string;
    timestamp: string;
  } | null>(null);
  const [corsErrorDialogOpen, setCorsErrorDialogOpen] = useState(false);
  const [corsErrorDetails, setCorsErrorDetails] = useState<{
    accountName: string;
    fileName: string;
  } | null>(null);
  const [azureRoleErrorDialogOpen, setAzureRoleErrorDialogOpen] = useState(false);
  const [azureRoleErrorDetails, setAzureRoleErrorDetails] = useState<{
    accountName: string;
    message: string;
    details: string;
    instructions: string[];
    azureRoleRequired: string;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Browser capability detection for No-ZIP folder downloads
  const [browserCapabilities, setBrowserCapabilities] = useState<BrowserCapabilities | null>(null);
  const [folderDownloadProgress, setFolderDownloadProgress] = useState<DownloadProgress | null>(null);
  const [folderDownloadManager, setFolderDownloadManager] = useState<FolderDownloadManager | null>(null);
  const [encryptUpload, setEncryptUpload] = useState(false);
  const [selectedEncryptionKeyId, setSelectedEncryptionKeyId] = useState<number | null>(null);

  // Decryption state
  const [decryptDialogOpen, setDecryptDialogOpen] = useState(false);
  const [fileToDecrypt, setFileToDecrypt] = useState<FileItem | null>(null);
  const [decryptingFiles, setDecryptingFiles] = useState<Set<string>>(new Set());
  const [selectedDecryptKeyId, setSelectedDecryptKeyId] = useState<number | null>(null);
  
  // Decryption error dialog state
  const [decryptErrorDialogOpen, setDecryptErrorDialogOpen] = useState(false);
  const [decryptError, setDecryptError] = useState<{
    type: string;
    message: string;
    details: string;
    suggestions: string[];
    fileName?: string;
    keyUsed?: string;
  } | null>(null);

  // File search state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchContinuationToken, setSearchContinuationToken] = useState<string | undefined>();
  const [searchMetadata, setSearchMetadata] = useState<SearchResponse['searchMetadata'] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchMatchMode, setSearchMatchMode] = useState<'substring' | 'exact'>('substring');
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);

  // Fetch available decryption keys (SELF keys with private key data)
  const { data: decryptKeysResponse, isLoading: decryptKeysLoading } = useQuery<{ 
    keys: Array<{ 
      id: number; 
      keyName: string;
      keyId: string; 
      createdAt: string;
    }>;
    count: number;
  }>({
    queryKey: [`/api/files/decrypt-keys?organizationId=${selectedOrganizationId}`],
    enabled: !!selectedOrganizationId && !!rolePermissions?.pgpKeyMgmt?.decrypt,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Available decryption keys
  const availableDecryptKeys = useMemo(() => {
    return decryptKeysResponse?.keys || [];
  }, [decryptKeysResponse]);

  // AI Agent progress dialog state
  const {
    isProcessing,
    fileName,
    fileSize,
    agentName,
    status,
    startProcessing,
    updateStatus,
    completeProcessing,
  } = useAIAgentProgress();

  // Refs for file input elements to enable clearing them
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<CreateFolderFormData>({
    resolver: zodResolver(createFolderSchema),
    defaultValues: {
      folderName: "",
    },
  });

  // Fetch organization storage account
  const { data: orgStorageAccount, isLoading: storageLoading, error: storageError } = useQuery<OrganizationStorageAccount>({
    queryKey: [`/api/organizations/${selectedOrganizationId}/storage-account`],
    enabled: !!selectedOrganizationId,
    retry: false, // Disable automatic retries to prevent infinite loops
    refetchOnWindowFocus: false, // Disable refetch on window focus
    refetchInterval: false, // Disable automatic refetching
  });

  // Check if storage is configured for this organization
  const hasStorageConfigured = !!orgStorageAccount && !storageError;
  const isStorageNotFound = storageError?.message?.includes('404') || storageError?.message?.includes('No storage account configured');

  // Fetch AI agents for the current organization
  const { data: aiAgents, isLoading: aiAgentsLoading } = useQuery<AiAgent[]>({
    queryKey: [`/api/ai-agents?organizationId=${selectedOrganizationId}`],
    enabled: !!selectedOrganizationId,
    retry: false, // Disable automatic retries
    refetchOnWindowFocus: false, // Disable refetch on window focus
  });

  // Fetch all PGP keys for the current organization (to enable encryption option with key selection)
  const { data: orgPgpKeysResponse, isLoading: pgpKeyLoading } = useQuery<{ 
    keys: Array<{ 
      id: number; 
      orgId: number; 
      keyName: string;
      publicKeyArmored: string; 
      keyId: string; 
      keyType: string;
      belongsTo: string;
      source: string; 
      createdAt: string;
      isActive: boolean;
    }>;
  }>({
    queryKey: [`/api/orgs/${selectedOrganizationId}/pgp-keys`],
    enabled: !!selectedOrganizationId,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Filter to only keys with public keys available for encryption (both OWN and PARTNER keys)
  const availableEncryptionKeys = useMemo(() => {
    const pgpKeys = orgPgpKeysResponse?.keys || [];
    return pgpKeys.filter(key => key?.publicKeyArmored && key?.isActive);
  }, [orgPgpKeysResponse]);

  // Check if PGP encryption is available for this organization
  const hasPgpKeyConfigured = availableEncryptionKeys.length > 0;
  
  // Get the currently selected encryption key (default to first available)
  const selectedEncryptionKey = useMemo(() => {
    if (!hasPgpKeyConfigured) return null;
    if (selectedEncryptionKeyId) {
      return availableEncryptionKeys.find(k => k.id === selectedEncryptionKeyId) || availableEncryptionKeys[0];
    }
    return availableEncryptionKeys[0];
  }, [availableEncryptionKeys, selectedEncryptionKeyId, hasPgpKeyConfigured]);

  // Fetch upload configuration from backend (reads environment variables)
  const { data: uploadConfig } = useQuery<UploadConfig>({
    queryKey: ['/api/config/upload'],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  // Fallback default upload configuration (if API call fails)
  const defaultUploadConfig: UploadConfig = {
    fileUploadMode: 'sas',
    memoryUploadLimitMB: 100,
    uploadDir: '/tmp/uploads',
    sasTimeoutMinutes: 60,
    chunkSizeMB: 4,
    uploadConcurrency: 5,
    maxRetries: 3,
    chunkSizeBytes: 4 * 1024 * 1024,
    maxFilesCount: 1000,
    maxUploadSizeGB: 15,
    maxUploadSizeBytes: 15 * 1024 * 1024 * 1024,
  };

  // Use fetched config or fallback to defaults
  const activeUploadConfig = uploadConfig || defaultUploadConfig;

  // Fetch files for organization - SECURE: Uses organizationId instead of storage details
  const { data: files, isLoading: filesLoading, error: filesError } = useQuery<FileItem[]>({
    queryKey: [buildFileApiUrl('/api/files', {
      organizationId: selectedOrganizationId,
      path: currentPath
    })],
    enabled: hasStorageConfigured && !!selectedOrganizationId && isAuthenticated,
    retry: false, // Disable automatic retries
    refetchOnWindowFocus: false, // Disable refetch on window focus
    staleTime: 30000, // Cache for 30 seconds
  });

  // Conditional security status loading logic
  const AUTO_FETCH_THRESHOLD = 100; // Auto-fetch security status for folders with ≤100 files
  const currentFolderFileCount = files?.length || 0;
  const shouldAutoFetchScanStatus = currentFolderFileCount <= AUTO_FETCH_THRESHOLD && currentFolderFileCount > 0;
  const [manualScanFetchTriggered, setManualScanFetchTriggered] = useState(false);

  // Reset manual trigger when path changes
  useEffect(() => {
    setManualScanFetchTriggered(false);
  }, [currentPath, selectedOrganizationId]);

  // Detect browser capabilities on mount
  useEffect(() => {
    const capabilities = detectBrowserCapabilities();
    setBrowserCapabilities(capabilities);
    console.log('🌐 Browser capabilities:', capabilities);
  }, []);

  // Fetch blob scan status (Microsoft Defender results) - conditionally enabled
  const { data: blobScanData, isLoading: scanStatusLoading } = useQuery<{ blobs: FileItem[] }>({
    queryKey: [buildFileApiUrl('/api/blobs/scan-status', {
      organizationId: selectedOrganizationId,
      path: currentPath
    })],
    enabled: hasStorageConfigured && 
             !!selectedOrganizationId && 
             isAuthenticated && 
             (shouldAutoFetchScanStatus || manualScanFetchTriggered),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 10000, // Cache for 10 seconds (scan status changes frequently)
  });

  // Merge files with scan status
  const filesWithScanStatus = useMemo(() => {
    if (!files) return [];
    if (!blobScanData?.blobs) {
      // No scan data available - return files without scan status
      return files;
    }

    // Create a map of blob paths to scan data for quick lookup
    const scanDataMap = new Map(
      blobScanData.blobs.map(blob => [blob.path, blob])
    );

    // Merge scan status into files
    return files.map(file => {
      const scanData = scanDataMap.get(file.path);
      if (scanData) {
        return {
          ...file,
          scanResult: scanData.scanResult,
          scanTime: scanData.scanTime,
          sensitiveDataType: scanData.sensitiveDataType,
          sensitiveDataConfidence: scanData.sensitiveDataConfidence,
          accessTier: (scanData as any).accessTier || file.accessTier,
          archiveStatus: (scanData as any).archiveStatus || file.archiveStatus,
          rehydratePriority: (scanData as any).rehydratePriority || file.rehydratePriority
        };
      }
      return file;
    });
  }, [files, blobScanData, orgStorageAccount]);

  // Handle files fetch errors with useEffect
  useEffect(() => {
    if (filesError) {
      console.error('Files fetch error:', filesError);
      const err = filesError as any;
      const errorMessage = err?.message || '';
      
      // Extract status code and data from HttpError (new structure)
      // HttpError has: err.status, err.data, err.response
      // Also check legacy locations for backward compatibility
      const statusCode = err?.status || err?.response?.status || err?.statusCode || 0;
      const errorData = err?.data || err?.response?.data || {};
      
      console.log('🔍 Error data structure:', { 
        statusCode, 
        errorData, 
        errorMessage,
        errorName: err?.name,
        topLevelCode: err?.code,
        topLevelDetails: err?.details
      });
      
      // PRIORITY 1: Check for Azure role assignment error
      // Detect "Azure Role Assignment Required" from backend's custom error response
      const hasAuthorizationMismatch = 
        // Backend custom error response (primary detection)
        errorData.error === 'Azure Role Assignment Required' ||
        // Raw Azure RestError (top-level error object)
        err?.code === 'AuthorizationPermissionMismatch' ||
        err?.details?.errorCode === 'AuthorizationPermissionMismatch' ||
        err?.details?.error?.code === 'AuthorizationPermissionMismatch' ||
        // Raw Azure error (in wrapped response data)
        errorData.code === 'AuthorizationPermissionMismatch' ||
        errorData.details?.errorCode === 'AuthorizationPermissionMismatch' ||
        errorData.details?.error?.code === 'AuthorizationPermissionMismatch' ||
        // Message-based fallback
        errorMessage.includes('AuthorizationPermissionMismatch') ||
        errorMessage.includes('Azure Role Assignment Required');
      
      // Show dialog if Azure role error is detected
      const isAzureRoleError = hasAuthorizationMismatch && (statusCode === 403 || statusCode === 0 || !statusCode);
      
      if (isAzureRoleError) {
        console.log('🔒 Azure role assignment error detected, showing dialog');
        console.log('📋 Error details:', { accountName: errorData.accountName, message: errorData.message });
        setAzureRoleErrorDetails({
          accountName: errorData.accountName || orgStorageAccount?.name || 'your storage account',
          message: errorData.message || 'The App Service managed identity does not have the required permissions to access files.',
          details: errorData.details?.message || errorData.details || 'Please assign the required Azure role to the App Service managed identity via Azure Portal.',
          instructions: errorData.instructions || [
            '1. Go to Azure Portal and navigate to your storage account',
            "2. Click 'Access Control (IAM)' in the left menu",
            "3. Click 'Add' → 'Add role assignment'",
            "4. Select 'Storage Blob Data Contributor' role",
            "5. Under 'Members', choose 'Managed Identity'",
            "6. Find and select your Zapper App Service managed identity",
            "7. Click 'Review + assign' to complete the setup"
          ],
          azureRoleRequired: errorData.azureRoleRequired || 'Storage Blob Data Contributor or Storage Blob Data Reader'
        });
        setAzureRoleErrorDialogOpen(true);
        return;
      }
      
      // PRIORITY 2: Handle other error types
      if (statusCode === 401 || errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        console.log('🔄 Authentication required for file access');
        toast({
          title: "Authentication Required",
          description: "Please log in to access files",
          variant: "destructive",
        });
      } else if (statusCode === 403 || errorMessage.includes('403') || errorMessage.includes('Access denied')) {
        // Only show generic 403 toast if it's NOT an Azure role error
        toast({
          title: "Access Denied",
          description: "You don't have permission to access files in this organization",
          variant: "destructive",
        });
      } else if (statusCode === 404 || errorMessage.includes('404')) {
        console.log('📁 No storage account configured for this organization');
      }
    }
  }, [filesError, toast, orgStorageAccount]);

  // Real-time validation: Check selected files against upload limits
  useEffect(() => {
    if (!selectedFiles || !activeUploadConfig) {
      setUploadValidationError(null);
      return;
    }

    const fileCount = selectedFiles.length;
    const totalSize = Array.from(selectedFiles).reduce((sum, file) => sum + file.size, 0);
    
    // Sanitize config values with proper NaN checks and fallbacks
    const maxFiles = Number.isFinite(activeUploadConfig.maxFilesCount) && activeUploadConfig.maxFilesCount > 0 
      ? activeUploadConfig.maxFilesCount 
      : 1000;
    
    const maxSizeGB = Number.isFinite(activeUploadConfig.maxUploadSizeGB) && activeUploadConfig.maxUploadSizeGB > 0
      ? activeUploadConfig.maxUploadSizeGB
      : 15;
    
    const maxSizeBytes = Number.isFinite(activeUploadConfig.maxUploadSizeBytes) && activeUploadConfig.maxUploadSizeBytes > 0
      ? activeUploadConfig.maxUploadSizeBytes
      : (15 * 1024 * 1024 * 1024);

    if (fileCount > maxFiles) {
      const suggestedBatches = Math.ceil(fileCount / maxFiles);
      const filesPerBatch = Math.ceil(fileCount / suggestedBatches);
      setUploadValidationError(
        `Too many files: ${fileCount.toLocaleString()} selected. Maximum is ${maxFiles.toLocaleString()} files per upload. Upload in ${suggestedBatches} batches of ~${filesPerBatch.toLocaleString()} files each.`
      );
      return;
    }

    if (totalSize > maxSizeBytes) {
      const totalSizeGB = (totalSize / (1024 * 1024 * 1024)).toFixed(2);
      const suggestedBatches = Math.ceil(totalSize / maxSizeBytes);
      setUploadValidationError(
        `Upload too large: ${totalSizeGB}GB total. Maximum is ${maxSizeGB}GB per upload. Upload in ${suggestedBatches} smaller batches or compress large files first.`
      );
      return;
    }

    // All validations passed
    setUploadValidationError(null);
  }, [selectedFiles, activeUploadConfig]);

  // Handle sorting
  const handleSort = (field: "name" | "size" | "lastModified") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Sort files based on current sort field and direction  
  const sortedFiles = filesWithScanStatus && Array.isArray(filesWithScanStatus) ? [...filesWithScanStatus].sort((a, b) => {
    let aValue: any, bValue: any;
    
    switch (sortField) {
      case "name":
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
        break;
      case "size":
        aValue = a.size || 0;
        bValue = b.size || 0;
        break;
      case "lastModified":
        aValue = a.lastModified ? new Date(a.lastModified).getTime() : 0;
        bValue = b.lastModified ? new Date(b.lastModified).getTime() : 0;
        break;
      default:
        return 0;
    }
    
    if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
    if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
  }) : [];

  // Create folder mutation - SECURE: Uses organizationId
  const createFolderMutation = useMutation({
    mutationFn: async (data: CreateFolderFormData) => {
      if (!selectedOrganizationId) throw new Error("No organization selected");
      
      return apiRequest("POST", "/api/files/create-directory", {
        organizationId: selectedOrganizationId,
        path: currentPath,
        directoryName: data.folderName,
      });
    },
    onSuccess: async () => {
      // Refetch file list to ensure data is fresh BEFORE showing toast
      await queryClient.refetchQueries({ 
        queryKey: [buildFileApiUrl('/api/files', {
          organizationId: selectedOrganizationId,
          path: currentPath
        })]
      });
      
      // Update UI state after data is refreshed
      setCreateFolderOpen(false);
      form.reset();
      
      // Show success message after refresh completes
      toast({
        title: "Success",
        description: "Folder created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Enhanced upload function that handles SAS mode automatically - SECURE: Uses organizationId
  const uploadFileMutation = useMutation({
    mutationFn: async ({ files, encrypt = false }: { files: FileList; encrypt?: boolean }) => {
      if (!selectedOrganizationId) throw new Error("No organization selected");
      
      setIsUploading(true);
      
      // Initialize progress tracking for all files
      const fileList = Array.from(files);
      setUploadingFiles(fileList.map(file => ({
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'pending'
      })));
      setUploadProgress({});
      
      const token = sessionStorage.getItem('azure_token');
      
      // Collect relative paths for folder structure preservation
      const relativePaths: string[] = [];
      
      Array.from(files).forEach((file) => {
        // Use webkitRelativePath if available (from folder drag/drop or folder input)
        if ((file as any).webkitRelativePath) {
          relativePaths.push((file as any).webkitRelativePath);
        } else {
          relativePaths.push(file.name);
        }
      });
      
      // Check upload mode - SAS mode is always used
      const isDirectSasMode = activeUploadConfig?.fileUploadMode === 'sas';
      
      if (isDirectSasMode) {
        console.log("📤 [SAS] SAS mode detected - uploading via Azure Storage");
        
        // If encryption is enabled, use selected PGP key and prepare encrypted files
        let encryptedFiles: { file: File; originalName: string; relativePath: string }[] = [];
        let pgpPublicKey: string | null = null;
        
        if (encrypt) {
          console.log("🔐 [ENCRYPTION] Using selected PGP public key for encryption");
          try {
            // Use the pre-selected encryption key from state
            if (!selectedEncryptionKey?.publicKeyArmored) {
              throw new Error("No PGP key selected for encryption");
            }
            
            pgpPublicKey = selectedEncryptionKey.publicKeyArmored;
            console.log(`🔐 [ENCRYPTION] PGP key loaded: "${selectedEncryptionKey.keyName}" (KeyID: ${selectedEncryptionKey.keyId}, Type: ${selectedEncryptionKey.belongsTo})`);
            
            // Encrypt each file
            console.log(`🔐 [ENCRYPTION] Encrypting ${files.length} file(s)...`);
            for (let i = 0; i < files.length; i++) {
              const file = files[i];
              const originalPath = relativePaths[i] || file.name;
              
              try {
                // Read file as Uint8Array
                const arrayBuffer = await file.arrayBuffer();
                const data = new Uint8Array(arrayBuffer);
                
                console.log(`🔐 [ENCRYPTION] Preparing to encrypt: ${file.name} (${file.size} bytes)`);
                console.log(`🔐 [ENCRYPTION] openpgp version: ${(openpgp as any).version || 'unknown'}`);
                console.log(`🔐 [ENCRYPTION] openpgp type check:`, typeof openpgp, Object.keys(openpgp).slice(0, 5));
                
                // Encrypt using openpgp v6 API
                try {
                  const publicKey = await openpgp.readKey({ armoredKey: pgpPublicKey! });
                  console.log(`🔐 [ENCRYPTION] Public key loaded successfully`);
                  
                  const message = await openpgp.createMessage({ binary: data });
                  console.log(`🔐 [ENCRYPTION] Message created successfully`);
                  
                  const encrypted = await openpgp.encrypt({
                    message,
                    encryptionKeys: publicKey,
                    format: 'binary'
                  });
                  console.log(`🔐 [ENCRYPTION] Encryption completed, result type:`, typeof encrypted);
                  
                  // Handle both direct Uint8Array and potential stream/wrapper
                  let encryptedData: Uint8Array = encrypted as Uint8Array;
                  if (encryptedData instanceof Uint8Array) {
                    console.log(`🔐 [ENCRYPTION] Result is Uint8Array (${encryptedData.byteLength} bytes)`);
                  } else if ((encrypted as any).buffer instanceof ArrayBuffer) {
                    encryptedData = new Uint8Array((encrypted as any).buffer);
                    console.log(`🔐 [ENCRYPTION] Converted buffer to Uint8Array`);
                  } else if (Symbol.asyncIterator in (encrypted as any)) {
                    console.log(`🔐 [ENCRYPTION] Result is async iterable, collecting chunks...`);
                    const chunks: Uint8Array[] = [];
                    for await (const chunk of (encrypted as any)) {
                      chunks.push(new Uint8Array(chunk));
                    }
                    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
                    encryptedData = new Uint8Array(totalLength);
                    let offset = 0;
                    for (const chunk of chunks) {
                      encryptedData.set(chunk, offset);
                      offset += chunk.length;
                    }
                  }
                  
                  // Create new File object from encrypted data using globalThis to avoid shadowing
                  console.log(`🔐 [ENCRYPTION] Creating File object...`);
                  const FileConstructor = globalThis.File;
                  const encryptedFile = new FileConstructor(
                    [encryptedData],
                    `${file.name}.pgp`,
                    { type: "application/pgp-encrypted" }
                  );
                  console.log(`🔐 [ENCRYPTION] File object created successfully`);
                  
                  encryptedFiles.push({
                    file: encryptedFile,
                    originalName: file.name,
                    relativePath: originalPath
                  });
                  
                  console.log(`🔐 [ENCRYPTION] Success: ${file.name} → ${encryptedFile.name} (${Math.round(encryptedFile.size / 1024)}KB)`);
                } catch (cryptoErr) {
                  console.error(`🔐 [ENCRYPTION] Crypto operation failed:`, cryptoErr);
                  console.error(`🔐 [ENCRYPTION] Error type:`, (cryptoErr as Error).constructor.name);
                  console.error(`🔐 [ENCRYPTION] Error message:`, (cryptoErr as Error).message);
                  throw cryptoErr;
                }
              } catch (fileErr) {
                console.error(`🔐 [ENCRYPTION] Failed for ${file.name}:`, fileErr);
                throw fileErr;
              }
            }
          } catch (err) {
            console.error("🔐 [ENCRYPTION] Failed to encrypt files:", err);
            throw new Error(`Encryption failed: ${(err as Error).message}`);
          }
        }
        
        // Prepare file metadata - keep same paths as normal uploads, just with .pgp extension if encrypted
        const fileMetadata = (encrypt && encryptedFiles.length > 0 ? encryptedFiles : Array.from(files).map((file, index) => ({
          file: file,
          originalName: file.name,
          relativePath: relativePaths[index] || file.name
        }))).map((item) => {
          const file = 'file' in item ? item.file : item;
          const originalName = item.originalName;
          const relativePath = item.relativePath;
          
          // Keep the same path structure - only add .pgp extension if encrypted
          let finalPath = relativePath;
          if (encrypt && relativePath.endsWith('.pgp')) {
            // Already has .pgp extension (from encrypted file), use as-is
            finalPath = relativePath;
          } else if (encrypt) {
            // Add .pgp extension but keep folder structure
            finalPath = `${relativePath}.pgp`;
          }
          
          return {
            name: finalPath,
            size: file.size,
            type: file.type,
            relativePath: finalPath
          };
        });
        
        console.log(`📝 [UPLOAD] File metadata prepared:`, fileMetadata.map(f => ({ name: f.name, size: f.size })));
        
        // Generate SAS URLs directly - SECURE: Uses organizationId
        const sasResponse = await fetch("/api/files/generate-sas", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({
            organizationId: selectedOrganizationId,
            path: currentPath,
            files: fileMetadata
          })
        });
        
        if (!sasResponse.ok) {
          const sasError = await sasResponse.json();
          if (sasError.code === 'GEO_RESTRICTED') {
            throw new Error("Data access from your current country is restricted for this organization.");
          }
          throw new Error(sasError.error || "Failed to generate SAS URLs");
        }
        
        const sasData = await sasResponse.json();
        console.log(`🔗 Generated ${sasData.uploads.length} SAS URLs`);
        
        // Use encrypted files if available, otherwise use original files
        const filesToUpload = encrypt && encryptedFiles.length > 0 ? encryptedFiles.map(ef => ef.file) : files;
        
        // Upload files directly to Azure using enhanced chunked uploads
        let corsErrorDetected = false;
        const uploadPromises = sasData.uploads.map(async (upload: any, index: number) => {
          const file = filesToUpload[index];
          const sasUrl = upload.url;
          
          try {
            // Mark file as uploading
            setUploadingFiles(prev => prev.map(f => 
              f.name === file.name ? { ...f, status: 'uploading' } : f
            ));
            
            // Use enhanced chunked upload with parallelism and retries
            const result = await uploadFileWithChunks(file, sasUrl, activeUploadConfig, (uploadedBytes, totalBytes) => {
              const progressPercent = Math.round((uploadedBytes / totalBytes) * 100);
              
              // Update progress tracking for UI
              setUploadProgress(prev => ({
                ...prev,
                [file.name]: progressPercent
              }));
              
              // Update uploading files array
              setUploadingFiles(prev => prev.map(f => 
                f.name === file.name 
                  ? { ...f, progress: progressPercent, status: progressPercent === 100 ? 'completed' : 'uploading' }
                  : f
              ));
            });
            
            // Mark as completed
            setUploadingFiles(prev => prev.map(f => 
              f.name === file.name ? { ...f, status: 'completed', progress: 100 } : f
            ));
            
            return result;
          } catch (error: any) {
            // Mark file as error
            setUploadingFiles(prev => prev.map(f => 
              f.name === file.name 
                ? { ...f, status: 'error', error: error.message || 'Upload failed' }
                : f
            ));
            
            // Check if this is a CORS error
            // CORS errors manifest as TypeError ("Failed to fetch"), network errors, or status code 0
            const isCorsError = 
              error.name === 'TypeError' ||
              error.message.includes('Failed to fetch') ||
              error.message.includes('CORS') || 
              error.message.includes('blocked') || 
              error.message.includes('NetworkError') ||
              error.statusCode === 0 ||
              (!error.response && error.message === ''); // Fallback for browsers that suppress messages
            
            if (isCorsError) {
              console.log(`🚨 CORS error detected for ${file.name} - need to configure Azure CORS`);
              
              // Mark that a CORS error occurred
              corsErrorDetected = true;
              
              // Close upload dialog and show CORS error dialog
              setUploadDialogOpen(false);
              setIsUploading(false);
              setUploadingFiles([]);
              setUploadProgress({});
              setCorsErrorDetails({
                accountName: orgStorageAccount?.name || 'Storage Account',
                fileName: file.name
              });
              setCorsErrorDialogOpen(true);
              
              throw new Error(`CORS configuration required on Azure Storage Account. Please configure CORS to allow uploads from this domain.`);
            }
            throw error;
          }
        });
        
        const uploadResults = await Promise.allSettled(uploadPromises);
        const successfulUploads = uploadResults.filter(r => r.status === 'fulfilled');
        console.log(`🎉 ${successfulUploads.length}/${uploadResults.length} files uploaded via SAS${encrypt ? ' (encrypted)' : ''}`);
        
        // If CORS error was detected, don't return success (dialog already shown)
        if (corsErrorDetected) {
          throw new Error('CORS configuration required');
        }
        
        // Log upload completion for activity logs
        if (successfulUploads.length > 0) {
          try {
            console.log(`📝 [FRONTEND] === CALLING UPLOAD LOGGING ENDPOINT (Direct SAS) ===`);
            console.log(`📝 [FRONTEND] Endpoint: /api/files/log-upload-completion`);
            console.log(`📝 [FRONTEND] Organization ID: ${selectedOrganizationId}`);
            console.log(`📝 [FRONTEND] Path: ${currentPath}`);
            console.log(`📝 [FRONTEND] Files to log: ${fileMetadata.length}`);
            console.log(`📝 [FRONTEND] File metadata:`, fileMetadata);
            
            // For encrypted uploads, log with modified paths
            const loggingMetadata = encrypt ? fileMetadata : Array.from(files).map((file, index) => ({
              name: relativePaths[index] || file.name,
              size: file.size,
              type: file.type
            }));
            
            const logResponse = await fetch("/api/files/log-upload-completion", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
              },
              body: JSON.stringify({
                organizationId: selectedOrganizationId,
                path: currentPath,
                files: loggingMetadata,
                encrypted: encrypt
              })
            });
            
            console.log(`📝 [FRONTEND] Response status: ${logResponse.status} ${logResponse.statusText}`);
            
            if (!logResponse.ok) {
              const logError = await logResponse.json();
              console.error(`❌ [FRONTEND] Logging endpoint returned error:`, logError);
              throw new Error(logError.error || "Failed to log upload activity");
            }
            
            const logResult = await logResponse.json();
            console.log(`✅ [FRONTEND] Logging successful! Response:`, logResult);
            console.log(`📝 [FRONTEND] === UPLOAD LOGGING COMPLETE ===`);
          } catch (logError) {
            // Don't fail the upload if logging fails, but log the error
            console.error("❌ [FRONTEND] === UPLOAD LOGGING FAILED ===");
            console.error("❌ [FRONTEND] Error type:", logError?.constructor?.name);
            console.error("❌ [FRONTEND] Error message:", (logError as Error)?.message);
            console.error("❌ [FRONTEND] Full error:", logError);
            console.error("❌ [FRONTEND] Stack trace:", (logError as Error)?.stack);
          }
        } else {
          console.log(`⚠️ [FRONTEND] No successful uploads to log (${successfulUploads.length} files)`);
        }
        
        // Clear upload progress
        setUploadProgress({});
        setIsUploading(false);
        setUploadingFiles([]);
        
        return { 
          success: true, 
          message: "Files uploaded successfully via direct SAS",
          mode: "sas",
          uploadResults 
        };
      }
      
      // FALLBACK: Try regular upload first for memory/disk modes - SECURE API endpoint
      // Also used for encrypted uploads (encryption requires server-side processing)
      if (encrypt) {
        console.log("🔐 [ENCRYPTED UPLOAD] Server-side encryption enabled");
        console.log("🔐 [ENCRYPTED UPLOAD] Encrypt parameter:", encrypt);
        console.log("🔐 [ENCRYPTED UPLOAD] Encryption will modify path to /encrypted/ folder");
      }
      
      const formData = new FormData();
      formData.append("path", currentPath);
      
      // Add encrypt flag to form data if encryption is enabled
      if (encrypt) {
        formData.append("encrypt", "true");
        console.log("🔐 [ENCRYPTED UPLOAD] Appended encrypt='true' to FormData");
      } else {
        console.log("📁 [PLAIN UPLOAD] Encryption disabled, uploading file as-is");
      }
      
      Array.from(files).forEach((file) => {
        formData.append("files", file);
      });
      
      // Send relative paths as JSON string for server-side folder structure creation
      formData.append("fileRelativePaths", JSON.stringify(relativePaths));

      const response = await fetch(`/api/files/upload-file?organizationId=${selectedOrganizationId}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
        body: formData,
      });
      
      // Check if we got a SAS redirect response
      if (!response.ok) {
        const errorData = await response.json();
        
        // If SAS mode is detected via fallback, switch to SAS-based upload
        if (errorData.error?.includes("SAS-based upload instead") && errorData.sasEndpoint) {
          console.log("🔄 SAS mode detected via fallback - switching to SAS-based upload");
          
          // Convert FileList to file metadata for SAS generation
          const fileMetadata = Array.from(files).map((file, index) => ({
            name: relativePaths[index] || file.name,
            size: file.size,
            type: file.type,
            relativePath: relativePaths[index] !== file.name ? relativePaths[index] : undefined
          }));
          
          // Generate SAS URLs - SECURE: Uses organizationId
          const sasResponse = await fetch("/api/files/generate-sas", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({
              organizationId: selectedOrganizationId,
              path: currentPath,
              files: fileMetadata
            })
          });
          
          if (!sasResponse.ok) {
            const sasError = await sasResponse.json();
            throw new Error(sasError.error || "Failed to generate SAS URLs");
          }
          
          const sasData = await sasResponse.json();
          console.log(`🔗 Generated ${sasData.uploads.length} SAS URLs`);
          
          // Upload files directly to Azure using enhanced chunked uploads
          let corsErrorDetected = false;
          const uploadPromises = sasData.uploads.map(async (upload: any, index: number) => {
            const file = files[index];
            const sasUrl = upload.url;
            
            try {
              // Mark file as uploading
              setUploadingFiles(prev => prev.map(f => 
                f.name === file.name ? { ...f, status: 'uploading' } : f
              ));
              
              // Use enhanced chunked upload with parallelism and retries
              const result = await uploadFileWithChunks(file, sasUrl, activeUploadConfig, (uploadedBytes, totalBytes) => {
                const progressPercent = Math.round((uploadedBytes / totalBytes) * 100);
                
                // Update progress tracking for UI
                setUploadProgress(prev => ({
                  ...prev,
                  [file.name]: progressPercent
                }));
                
                // Update uploading files array
                setUploadingFiles(prev => prev.map(f => 
                  f.name === file.name 
                    ? { ...f, progress: progressPercent, status: progressPercent === 100 ? 'completed' : 'uploading' }
                    : f
                ));
              });
              
              // Mark as completed
              setUploadingFiles(prev => prev.map(f => 
                f.name === file.name ? { ...f, status: 'completed', progress: 100 } : f
              ));
              
              return result;
            } catch (error: any) {
              // Mark file as error
              setUploadingFiles(prev => prev.map(f => 
                f.name === file.name 
                  ? { ...f, status: 'error', error: error.message || 'Upload failed' }
                  : f
              ));
              
              // Check if this is a CORS error
              // CORS errors manifest as TypeError ("Failed to fetch"), network errors, or status code 0
              const isCorsError = 
                error.name === 'TypeError' ||
                error.message.includes('Failed to fetch') ||
                error.message.includes('CORS') || 
                error.message.includes('blocked') || 
                error.message.includes('NetworkError') ||
                error.statusCode === 0 ||
                (!error.response && error.message === ''); // Fallback for browsers that suppress messages
              
              if (isCorsError) {
                console.log(`🚨 CORS error detected for ${file.name} - need to configure Azure CORS`);
                
                // Mark that a CORS error occurred
                corsErrorDetected = true;
                
                // Close upload dialog and show CORS error dialog
                setUploadDialogOpen(false);
                setIsUploading(false);
                setUploadingFiles([]);
                setUploadProgress({});
                setCorsErrorDetails({
                  accountName: orgStorageAccount?.name || 'Storage Account',
                  fileName: file.name
                });
                setCorsErrorDialogOpen(true);
                
                throw new Error(`CORS configuration required on Azure Storage Account. Please configure CORS to allow uploads from this domain.`);
              }
              throw error;
            }
          });
          
          const uploadResults = await Promise.allSettled(uploadPromises);
          const successfulUploads = uploadResults.filter(r => r.status === 'fulfilled');
          console.log(`🎉 ${successfulUploads.length}/${uploadResults.length} files uploaded via fallback SAS with chunking`);
          
          // If CORS error was detected, don't return success (dialog already shown)
          if (corsErrorDetected) {
            throw new Error('CORS configuration required');
          }
          
          // Log upload completion for activity logs
          if (successfulUploads.length > 0) {
            try {
              console.log(`📝 [FRONTEND] === CALLING UPLOAD LOGGING ENDPOINT ===`);
              console.log(`📝 [FRONTEND] Endpoint: /api/files/log-upload-completion`);
              console.log(`📝 [FRONTEND] Organization ID: ${selectedOrganizationId}`);
              console.log(`📝 [FRONTEND] Path: ${currentPath}`);
              console.log(`📝 [FRONTEND] Files to log: ${fileMetadata.length}`);
              console.log(`📝 [FRONTEND] File metadata:`, fileMetadata);
              
              const logResponse = await fetch("/api/files/log-upload-completion", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${token}`,
                },
                body: JSON.stringify({
                  organizationId: selectedOrganizationId,
                  path: currentPath,
                  files: fileMetadata
                })
              });
              
              console.log(`📝 [FRONTEND] Response status: ${logResponse.status} ${logResponse.statusText}`);
              
              if (!logResponse.ok) {
                const logError = await logResponse.json();
                console.error(`❌ [FRONTEND] Logging endpoint returned error:`, logError);
                throw new Error(logError.error || "Failed to log upload activity");
              }
              
              const logResult = await logResponse.json();
              console.log(`✅ [FRONTEND] Logging successful! Response:`, logResult);
              console.log(`📝 [FRONTEND] === UPLOAD LOGGING COMPLETE ===`);
            } catch (logError) {
              // Don't fail the upload if logging fails, but log the error
              console.error("❌ [FRONTEND] === UPLOAD LOGGING FAILED ===");
              console.error("❌ [FRONTEND] Error type:", logError?.constructor?.name);
              console.error("❌ [FRONTEND] Error message:", (logError as Error)?.message);
              console.error("❌ [FRONTEND] Full error:", logError);
              console.error("❌ [FRONTEND] Stack trace:", (logError as Error)?.stack);
            }
          } else {
            console.log(`⚠️ [FRONTEND] No successful uploads to log (${successfulUploads.length} files)`);
          }
          
          // Clear upload progress
          setUploadProgress({});
          setIsUploading(false);
          setUploadingFiles([]);
          
          return { 
            success: true, 
            message: "Files uploaded successfully via SAS",
            mode: "sas",
            uploadResults 
          };
        }
        
        // If not SAS mode, throw the original error
        throw new Error(errorData.error || "Failed to upload files");
      }
      
      // Regular upload succeeded
      return response.json();
    },
    onSuccess: async (data) => {
      // Refetch file list to ensure data is fresh BEFORE showing toast
      await queryClient.refetchQueries({ 
        queryKey: [buildFileApiUrl('/api/files', {
          organizationId: selectedOrganizationId,
          path: currentPath
        })] 
      });
      await queryClient.refetchQueries({ 
        queryKey: ["/api/user-activities"] 
      });
      
      // Clean up progress tracking after refresh completes
      setIsUploading(false);
      setUploadingFiles([]);
      setUploadProgress({});
      setUploadDialogOpen(false);
      setSelectedFiles(null);
      
      // Show success message after files are visible in the list
      const isSasMode = data?.mode === "sas";
      toast({
        title: "Success",
        description: isSasMode 
          ? `Files uploaded successfully (${data.uploadResults?.length || 0} files)`
          : "Files uploaded successfully",
      });
    },
    onError: (error: Error) => {
      console.error("Upload error:", error);
      
      // Clean up progress tracking on error
      setIsUploading(false);
      setUploadingFiles([]);
      setUploadProgress({});
      
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete file/folder mutation - SECURE: Uses organizationId
  const deleteMutation = useMutation({
    mutationFn: async ({ path, type }: { path: string; type: 'file' | 'directory' }) => {
      if (!selectedOrganizationId) throw new Error("No organization selected");
      
      const endpoint = type === 'file' 
        ? "/api/files/file" 
        : "/api/files/directory";
      
      return apiRequest("DELETE", endpoint, {
        organizationId: selectedOrganizationId,
        path: path,
      });
    },
    onSuccess: async () => {
      // Refetch file list to ensure data is fresh BEFORE showing toast
      await queryClient.refetchQueries({ 
        queryKey: [buildFileApiUrl('/api/files', {
          organizationId: selectedOrganizationId,
          path: currentPath
        })] 
      });
      
      // Show success message after item is removed from the list
      toast({
        title: "Success",
        description: "Item deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Rename file/folder mutation - SECURE: Uses organizationId
  const renameMutation = useMutation({
    mutationFn: async ({ path, newName, type }: { path: string; newName: string; type: 'file' | 'directory' }) => {
      if (!selectedOrganizationId) throw new Error("No organization selected");
      
      const endpoint = type === 'file' 
        ? "/api/files/rename" 
        : "/api/files/rename-directory";
      
      const response = await apiRequest("PATCH", endpoint, {
        organizationId: selectedOrganizationId,
        path: path,
        newName: newName,
      });
      return response.json();
    },
    onSuccess: async (data) => {
      // Close the dialog
      setRenameDialogOpen(false);
      setItemToRename(null);
      setNewItemName("");
      
      // Refetch file list to ensure data is fresh BEFORE showing toast
      await queryClient.refetchQueries({ 
        queryKey: [buildFileApiUrl('/api/files', {
          organizationId: selectedOrganizationId,
          path: currentPath
        })] 
      });
      
      // Show success message after item is renamed
      toast({
        title: "Success",
        description: data.message || "Item renamed successfully",
      });
    },
    onError: (error: any) => {
      // Parse error response if available
      let errorMessage = error.message || "Failed to rename item";
      if (error.code === 'TARGET_EXISTS') {
        errorMessage = error.error || "An item with this name already exists";
      }
      toast({
        title: "Rename Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Bulk delete mutation - Deletes multiple items sequentially
  const bulkDeleteMutation = useMutation({
    mutationFn: async (items: FileItem[]) => {
      if (!selectedOrganizationId) throw new Error("No organization selected");
      
      const results = [];
      for (const item of items) {
        const endpoint = item.type === 'file' 
          ? "/api/files/file" 
          : "/api/files/directory";
        
        try {
          await apiRequest("DELETE", endpoint, {
            organizationId: selectedOrganizationId,
            path: item.path,
          });
          results.push({ path: item.path, success: true });
        } catch (error: any) {
          results.push({ path: item.path, success: false, error: error.message });
        }
      }
      return results;
    },
    onSuccess: async (results) => {
      // Clear selection
      setSelectedItems(new Set());
      
      // Refetch file list to ensure data is fresh BEFORE showing toast
      await queryClient.refetchQueries({ 
        queryKey: [buildFileApiUrl('/api/files', {
          organizationId: selectedOrganizationId,
          path: currentPath
        })] 
      });
      
      // Show success message after items are removed from the list
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      if (failCount === 0) {
        toast({
          title: "Success",
          description: `${successCount} item(s) deleted successfully`,
        });
      } else {
        toast({
          title: "Partial Success",
          description: `${successCount} deleted, ${failCount} failed`,
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Bulk download mutation - Small files only (< 1GB), preserves folder structure
  const bulkDownloadMutation = useMutation({
    mutationFn: async (items: FileItem[]) => {
      if (!selectedOrganizationId) throw new Error("No organization selected");
      
      const response = await apiRequest("POST", "/api/files/bulk-download", {
        organizationId: selectedOrganizationId,
        items: items.map(item => ({
          path: item.path,
          type: item.type,
        })),
      });

      if (!response.ok) {
        const error = await response.json();
        
        // Special handling for geo-restriction errors
        if (error.code === 'GEO_RESTRICTED') {
          throw new Error("Data access from your current country is restricted for this organization.");
        }
        
        // Special handling for size limit errors (413)
        if (response.status === 413) {
          const sizeMsg = `Selected files: ${error.totalSizeMB} MB, Limit: ${error.limitMB} MB`;
          throw new Error(error.message + "\n\n" + sizeMsg + "\n\n" + error.suggestion);
        }
        
        throw new Error(error.error || "Failed to create bulk download");
      }

      const data = await response.json();
      
      // Download the ZIP file (preserves folder structure!)
      const link = document.createElement('a');
      link.href = data.zipUrl;
      link.download = data.zipFileName;
      link.setAttribute('data-testid', `link-bulk-download-zip`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      return data;
    },
    onSuccess: (data) => {
      setSelectedItems(new Set());
      
      const structureMsg = data.preservedStructure 
        ? " (folder structure preserved)" 
        : "";
      
      toast({
        title: "Download Started",
        description: `ZIP file with ${data.totalFiles} file(s) is downloading${structureMsg}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Download Size Limit",
        description: error.message,
        variant: "destructive",
        duration: 10000, // Show longer for size limit errors
      });
    },
  });

  // Run AI Agent on file mutation - backend auto-detects storage account from organization
  const runAiAgentMutation = useMutation({
    mutationFn: async ({ file, agentId }: { file: FileItem; agentId: string }) => {
      if (!selectedOrganizationId) throw new Error("No organization selected");
      
      // Get agent name
      const agent = aiAgents?.find(a => a.id.toString() === agentId);
      const agentDisplayName = agent?.name || "AI Agent";
      
      // Start the progress dialog
      startProcessing(file.name, file.size || 0, agentDisplayName);
      updateStatus("Preparing file for processing...");
      
      // Add file to running state
      setRunningAgentFiles(prev => new Set(prev).add(file.path));
      
      // Update status: Generating access
      updateStatus("Generating secure file access...");
      
      try {
        const response = await apiRequest("POST", "/api/ai-agents/run", {
          agentId: parseInt(agentId),
          filePath: file.path,
          fileName: file.name,
          organizationId: selectedOrganizationId, // Required by organizationAccessRequired middleware
        });
        
        // Update status: Processing
        updateStatus("AI Agent is analyzing your file...");
        
        return response;
      } catch (error) {
        completeProcessing();
        throw error;
      }
    },
    onSuccess: (data, { file }) => {
      // Remove file from running state
      setRunningAgentFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(file.path);
        return newSet;
      });
      
      // Update status: Completing
      updateStatus("Finalizing results...");
      
      // Wait a moment then complete
      setTimeout(() => {
        completeProcessing();
        toast({
          title: "Processing Complete",
          description: "AI agent has finished processing the file",
        });
      }, 1000);
    },
    onError: (error: Error, { file }) => {
      // Remove file from running state on error
      setRunningAgentFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(file.path);
        return newSet;
      });
      
      completeProcessing();
      
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleNavigateToFolder = (folderName: string) => {
    const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    setPathHistory([...pathHistory, currentPath]);
    setCurrentPath(newPath);
    setSelectedItems(new Set()); // Clear selection when navigating
  };

  const handleNavigateBack = () => {
    if (pathHistory.length > 0) {
      const previousPath = pathHistory[pathHistory.length - 1];
      setCurrentPath(previousPath);
      setPathHistory(pathHistory.slice(0, -1));
    } else {
      setCurrentPath("");
    }
    setSelectedItems(new Set()); // Clear selection when navigating back
  };

  const handleBreadcrumbClick = (index: number) => {
    const pathParts = currentPath.split('/').filter(Boolean);
    const newPath = pathParts.slice(0, index + 1).join('/');
    setCurrentPath(newPath);
    setPathHistory([]);
    setSelectedItems(new Set()); // Clear selection when using breadcrumbs
  };

  // Checkbox selection handlers
  const handleSelectItem = (itemPath: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemPath)) {
        newSet.delete(itemPath);
      } else {
        newSet.add(itemPath);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (!sortedFiles) return;
    
    if (selectedItems.size === sortedFiles.length) {
      // Deselect all
      setSelectedItems(new Set());
    } else {
      // Select all
      setSelectedItems(new Set(sortedFiles.map(item => item.path)));
    }
  };

  const handleDeleteSelected = () => {
    if (!sortedFiles || selectedItems.size === 0) return;
    
    // Get the selected file items
    const itemsToDelete = sortedFiles.filter(item => selectedItems.has(item.path));
    
    // Check permissions for each item
    const canDeleteAll = itemsToDelete.every(() => {
      return rolePermissions?.fileMgmt?.deleteFilesAndFolders;
    });
    
    if (!canDeleteAll) {
      toast({
        title: "Permission Denied",
        description: "You don't have permission to delete one or more selected items",
        variant: "destructive",
      });
      return;
    }
    
    // Perform bulk delete
    bulkDeleteMutation.mutate(itemsToDelete);
  };

  const handleDownloadSelected = () => {
    if (!sortedFiles || selectedItems.size === 0) return;
    
    // Get the selected file items
    const itemsToDownload = sortedFiles.filter(item => selectedItems.has(item.path));
    
    // Check permissions for each item based on type
    const hasFilesPermission = itemsToDownload.some(item => item.type === 'file') 
      ? rolePermissions?.fileMgmt?.downloadFile 
      : true;
    
    const hasFoldersPermission = itemsToDownload.some(item => item.type === 'directory') 
      ? rolePermissions?.fileMgmt?.downloadFolder 
      : true;
    
    if (!hasFilesPermission || !hasFoldersPermission) {
      toast({
        title: "Permission Denied",
        description: "You don't have permission to download one or more selected items",
        variant: "destructive",
      });
      return;
    }
    
    // Perform bulk download
    bulkDownloadMutation.mutate(itemsToDownload);
  };

  // NO-ZIP folder download (Chrome/Edge 86+ only)
  const handleDownloadToFolder = async () => {
    if (!sortedFiles || selectedItems.size === 0) return;
    if (!browserCapabilities?.isSupported) {
      toast({
        title: "Browser Not Supported",
        description: getUnsupportedBrowserMessage(browserCapabilities!),
        variant: "destructive",
        duration: 8000,
      });
      return;
    }
    
    // Get the selected file items
    const itemsToDownload = sortedFiles.filter(item => selectedItems.has(item.path));
    
    // Check permissions
    const hasFilesPermission = itemsToDownload.some(item => item.type === 'file') 
      ? rolePermissions?.fileMgmt?.downloadFile 
      : true;
    
    const hasFoldersPermission = itemsToDownload.some(item => item.type === 'directory') 
      ? rolePermissions?.fileMgmt?.downloadFolder 
      : true;
    
    if (!hasFilesPermission || !hasFoldersPermission) {
      toast({
        title: "Permission Denied",
        description: "You don't have permission to download one or more selected items",
        variant: "destructive",
      });
      return;
    }
    
    try {
      // Step 1: Ask user to select destination folder
      const manager = new FolderDownloadManager(16, (progress) => {
        setFolderDownloadProgress(progress);
      });
      
      const folderSelected = await manager.selectDestinationFolder();
      if (!folderSelected) {
        toast({
          title: "Download Cancelled",
          description: "No folder selected",
        });
        return;
      }
      
      setFolderDownloadManager(manager);
      
      // Show progress dialog immediately while preparing
      setFolderDownloadProgress({
        totalFiles: itemsToDownload.length,
        downloadedFiles: 0,
        failedFiles: 0,
        bytesDownloaded: 0,
        totalBytes: 0,
        currentFile: '',
        status: 'preparing',
        errors: [],
      });
      
      // Step 2: Get manifest from backend (may take time with many files)
      const response = await apiRequest("POST", "/api/files/bulk-manifest", {
        organizationId: selectedOrganizationId,
        items: itemsToDownload.map(item => ({
          path: item.path,
          type: item.type,
        })),
      });

      // FIX: apiRequest throws on error, so if we're here it's OK
      // Parse JSON once
      const manifest: DownloadManifest = await response.json();
      
      toast({
        title: "Download Started",
        description: `Downloading ${manifest.totalFiles} files (${manifest.totalSizeMB} MB) to your chosen folder...`,
      });

      // Step 3: Download files in parallel
      await manager.downloadManifest(manifest);
      
      // Success
      setSelectedItems(new Set());
      setFolderDownloadProgress(null);
      setFolderDownloadManager(null);
      
      toast({
        title: "Download Complete!",
        description: `Successfully downloaded ${manifest.totalFiles} files to your folder`,
      });
    } catch (error: any) {
      console.error("Folder download error:", error);
      setFolderDownloadProgress(null);
      setFolderDownloadManager(null);
      
      toast({
        title: "Download Failed",
        description: error.message || "Failed to download folder",
        variant: "destructive",
        duration: 8000,
      });
    }
  };

  const handleDownload = async (file: FileItem) => {
    if (!selectedOrganizationId) return;
    
    if (file.accessTier === 'Archive') {
      if (file.archiveStatus) {
        const targetTier = file.archiveStatus.includes('hot') ? 'Hot' : file.archiveStatus.includes('cool') ? 'Cool' : '';
        toast({
          title: "File is Rehydrating",
          description: `This file is currently being rehydrated to the ${targetTier} tier (${file.rehydratePriority || 'Standard'} priority). Please try again once rehydration is complete.`,
        });
      } else {
        toast({
          title: "File is Archived",
          description: "This file is in the Archive storage tier and cannot be downloaded directly. Please rehydrate the file to Hot or Cool tier in the Azure Portal first.",
          variant: "destructive",
        });
      }
      return;
    }
    
    // Add file to downloading state
    setDownloadingFiles(prev => new Set(prev).add(file.path));
    setDownloadProgress(prev => ({ ...prev, [file.path]: 10 }));
    
    try {
      const token = sessionStorage.getItem('azure_token');
      
      // Get SAS URL from backend (PHASE 1: SAS Token Download)
      const apiUrl = buildFileApiUrl('/api/files/download', {
        organizationId: selectedOrganizationId,
        path: file.path
      });
      
      setDownloadProgress(prev => ({ ...prev, [file.path]: 30 }));
      
      const response = await fetch(apiUrl, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.code === 'GEO_RESTRICTED') {
          throw new Error("Data access from your current country is restricted for this organization.");
        }
        throw new Error(errorData.message || "Failed to generate download URL");
      }
      
      const data = await response.json();
      
      setDownloadProgress(prev => ({ ...prev, [file.path]: 50 }));
      
      // Direct download from Azure SAS URL (10-100x faster!)
      const link = document.createElement('a');
      link.href = data.url;
      link.download = data.fileName || file.name;
      link.setAttribute('data-testid', `link-download-${file.name}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setDownloadProgress(prev => ({ ...prev, [file.path]: 100 }));
      
      toast({
        title: "Download Started",
        description: `${file.name} is downloading directly from Azure`,
      });
      
    } catch (error: any) {
      console.error("Download error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to download file",
        variant: "destructive",
      });
    } finally {
      // Remove file from downloading state after short delay
      setTimeout(() => {
        setDownloadingFiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(file.path);
          return newSet;
        });
        setDownloadProgress(prev => {
          const { [file.path]: _, ...rest } = prev;
          return rest;
        });
      }, 1000);
    }
  };

  const handlePreview = async (file: FileItem) => {
    if (!selectedOrganizationId) return;
    
    if (file.accessTier === 'Archive') {
      if (file.archiveStatus) {
        const targetTier = file.archiveStatus.includes('hot') ? 'Hot' : file.archiveStatus.includes('cool') ? 'Cool' : '';
        toast({
          title: "File is Rehydrating",
          description: `This file is currently being rehydrated to the ${targetTier} tier (${file.rehydratePriority || 'Standard'} priority). Please try again once rehydration is complete.`,
        });
      } else {
        toast({
          title: "File is Archived",
          description: "This file is in the Archive storage tier and cannot be previewed directly. Please rehydrate the file to Hot or Cool tier in the Azure Portal first.",
          variant: "destructive",
        });
      }
      return;
    }
    
    // Set loading state for this file
    setPreviewingFile(file.path);
    
    try {
      const token = sessionStorage.getItem('azure_token');
      
      const previewUrl = buildFileApiUrl('/api/files/preview', {
        organizationId: selectedOrganizationId,
        path: file.path
      });
      
      const response = await fetch(previewUrl, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.code === 'GEO_RESTRICTED') {
          throw new Error("Data access from your current country is restricted for this organization.");
        }
        throw new Error(errorData.message || "Failed to generate preview");
      }
      
      const data = await response.json();
      
      setPreviewData(data);
      setPreviewDialogOpen(true);
      
    } catch (error: any) {
      console.error("Preview error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to open file preview",
        variant: "destructive",
      });
    } finally {
      // Clear loading state
      setPreviewingFile(null);
    }
  };

  const handleRehydrate = async (file: FileItem) => {
    if (!selectedOrganizationId) return;
    
    setRehydratingFiles(prev => new Set(prev).add(file.path));
    
    try {
      const token = sessionStorage.getItem('azure_token');
      
      const response = await fetch('/api/files/rehydrate', {
        method: 'POST',
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: selectedOrganizationId,
          path: file.path,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to initiate rehydration");
      }
      
      toast({
        title: "Rehydration Started",
        description: `"${file.name}" is being rehydrated to Hot tier with High priority. This may take a few hours to complete.`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/files'] });
      queryClient.invalidateQueries({ queryKey: ['/api/files/scan-status'] });
      
    } catch (error: any) {
      console.error("Rehydrate error:", error);
      toast({
        title: "Rehydration Failed",
        description: error.message || "Failed to initiate file rehydration",
        variant: "destructive",
      });
    } finally {
      setRehydratingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(file.path);
        return newSet;
      });
    }
  };

  // Handle opening decrypt dialog
  const handleDecryptClick = (file: FileItem) => {
    setFileToDecrypt(file);
    setSelectedDecryptKeyId(null);
    
    // If only one key is available, use it directly without showing dialog
    if (availableDecryptKeys.length === 1) {
      handleDecryptFile(file, availableDecryptKeys[0].id);
    } else if (availableDecryptKeys.length > 1) {
      // Show key selection dialog
      setDecryptDialogOpen(true);
    } else {
      toast({
        title: "No Decryption Keys",
        description: "No decryption keys are available for this organization.",
        variant: "destructive",
      });
    }
  };

  // Handle file decryption to folder
  const handleDecryptFile = async (file: FileItem, keyId?: number) => {
    if (!selectedOrganizationId) return;
    
    // Close dialog if open
    setDecryptDialogOpen(false);
    
    // Add file to decrypting state
    setDecryptingFiles(prev => new Set(prev).add(file.path));
    
    try {
      const token = sessionStorage.getItem('azure_token');
      
      toast({
        title: "Decrypting File",
        description: `Decrypting ${file.name}...`,
      });

      const response = await fetch('/api/files/decrypt-to-folder', {
        method: 'POST',
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: selectedOrganizationId,
          path: file.path,
          keyId: keyId || selectedDecryptKeyId || (availableDecryptKeys[0]?.id),
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        
        // Check if we have detailed error information from backend
        if (errorData.decryptError) {
          // Find the key name that was used
          const keyUsedId = keyId || selectedDecryptKeyId || (availableDecryptKeys[0]?.id);
          const keyUsed = availableDecryptKeys.find(k => k.id === keyUsedId);
          
          setDecryptError({
            type: errorData.decryptError.type || "UNKNOWN_ERROR",
            message: errorData.decryptError.message || errorData.error || "Failed to decrypt file",
            details: errorData.decryptError.details || "",
            suggestions: errorData.decryptError.suggestions || [],
            fileName: file.name,
            keyUsed: keyUsed?.keyName || "Unknown Key",
          });
          setDecryptErrorDialogOpen(true);
          return; // Don't throw, we're showing the dialog
        }
        
        throw new Error(errorData.error || "Failed to decrypt file");
      }
      
      const result = await response.json();
      
      toast({
        title: "File Decrypted",
        description: `Successfully decrypted to: ${result.decryptedPath}`,
      });
      
      // Refresh file list to show the new decrypted file - use queryKey prefix matching
      // This invalidates all file queries for this organization to ensure the decrypted folder is visible
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes('/api/files') && key.includes(`organizationId=${selectedOrganizationId}`);
        }
      });
      
      // Clear state
      setFileToDecrypt(null);
      setSelectedDecryptKeyId(null);
      
    } catch (error: any) {
      console.error("Decrypt error:", error);
      
      // Show generic error in dialog if no detailed error was set
      if (!decryptErrorDialogOpen) {
        setDecryptError({
          type: "UNKNOWN_ERROR",
          message: error.message || "Failed to decrypt file",
          details: "An unexpected error occurred during decryption.",
          suggestions: [
            "Check that the file is a valid PGP encrypted file.",
            "Try using a different decryption key if available.",
            "Contact your administrator if the issue persists."
          ],
          fileName: file.name,
        });
        setDecryptErrorDialogOpen(true);
      }
    } finally {
      // Remove file from decrypting state
      setDecryptingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(file.path);
        return newSet;
      });
    }
  };

  // Handle confirm decrypt from dialog
  const handleConfirmDecrypt = () => {
    if (fileToDecrypt && selectedDecryptKeyId) {
      handleDecryptFile(fileToDecrypt, selectedDecryptKeyId);
    }
  };

  const handleDownloadDirectory = async (directory: FileItem) => {
    if (!selectedOrganizationId) return;
    
    // Add directory to downloading state
    setDownloadingFiles(prev => new Set(prev).add(directory.path));
    setDownloadProgress(prev => ({ ...prev, [directory.path]: 0 }));
    
    try {
      toast({
        title: "Preparing Download",
        description: "Creating zip file... This may take a while for large directories.",
      });

      const token = sessionStorage.getItem('azure_token');
      
      // Call the download-directory endpoint
      const directoryUrl = buildFileApiUrl('/api/files/download-directory', {
        organizationId: selectedOrganizationId,
        path: directory.path
      });
      
      const response = await fetch(directoryUrl, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.code === 'GEO_RESTRICTED') {
          throw new Error("Data access from your current country is restricted for this organization.");
        }
        throw new Error(errorData.message || "Failed to download directory");
      }

      // Check content type to determine response format
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        // ACA-based response (JSON with jobId/downloadUrl)
        const result = await response.json();
        
        if (result.strategy === 'aca') {
          if (result.status === 'completed' && result.downloadUrl) {
            // Direct download - zip is ready immediately
            console.log(`📁 [ACA] Zip ready for immediate download: ${result.downloadUrl}`);
            
            toast({
              title: "Download Ready",
              description: `Zip file created using ${result.strategy.toUpperCase()} strategy. Starting download...`,
            });

            // Trigger immediate download
            await triggerDirectDownload(result.downloadUrl, directory);
          } else if (result.jobId) {
            // Async job - start polling
            console.log(`📁 [ACA] Started async zip job: ${result.jobId}`);
            
            toast({
              title: "Processing Directory",
              description: "Large directory download in progress. Please wait while we prepare your zip file...",
            });

            // Start polling for job status
            await pollJobStatus(result.jobId, directory);
          } else {
            throw new Error("Unexpected ACA response format");
          }
        } else {
          throw new Error("Unexpected JSON response format");
        }
      } else {
        // Traditional streaming response (ZIP file)
        console.log(`📁 [TRADITIONAL] Processing streaming ZIP download`);
        await handleTraditionalDownload(response, directory);
      }

    } catch (error: any) {
      console.error("Directory download error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to download directory",
        variant: "destructive",
      });
      
      // Remove directory from downloading state on error
      setDownloadingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(directory.path);
        return newSet;
      });
      setDownloadProgress(prev => {
        const { [directory.path]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  // Trigger direct download from URL
  const triggerDirectDownload = async (downloadUrl: string, directory: FileItem) => {
    try {
      // Create a temporary anchor element and trigger download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${directory.name}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Download Started",
        description: `${directory.name}.zip download has started`,
      });

      console.log(`📁 [DIRECT] Triggered download for: ${directory.name}.zip`);

      // Remove from downloading state
      setDownloadingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(directory.path);
        return newSet;
      });
      setDownloadProgress(prev => {
        const { [directory.path]: _, ...rest } = prev;
        return rest;
      });
    } catch (error) {
      console.error("Direct download error:", error);
      throw error;
    }
  };

  // Handle traditional streaming download
  const handleTraditionalDownload = async (response: Response, directory: FileItem) => {
    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    
    if (!response.body) {
      throw new Error("Response body is null");
    }
    
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedLength = 0;
    
    // Read the response stream with progress tracking
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      chunks.push(value);
      receivedLength += value.length;
      
      // Update progress
      if (total > 0) {
        const progress = Math.round((receivedLength / total) * 100);
        setDownloadProgress(prev => ({ ...prev, [directory.path]: progress }));
      } else {
        // If we don't know the total size, show indeterminate progress
        const progress = Math.min(receivedLength / (1024 * 1024) * 10, 95);
        setDownloadProgress(prev => ({ ...prev, [directory.path]: progress }));
      }
    }
    
    // Combine chunks into blob and trigger download
    const blob = new Blob(chunks);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${directory.name}.zip`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    toast({
      title: "Success",
      description: "Directory downloaded successfully as zip file",
    });

    // Remove directory from downloading state
    setDownloadingFiles(prev => {
      const newSet = new Set(prev);
      newSet.delete(directory.path);
      return newSet;
    });
    setDownloadProgress(prev => {
      const { [directory.path]: _, ...rest } = prev;
      return rest;
    });
  };

  // Poll job status for ACI-based downloads
  const pollJobStatus = async (jobId: string, directory: FileItem) => {
    const token = sessionStorage.getItem('azure_token');
    const maxPollingTime = 30 * 60 * 1000; // 30 minutes max
    const pollingInterval = 5000; // 5 seconds
    const startTime = Date.now();

    const poll = async (): Promise<void> => {
      try {
        // Check if we've exceeded max polling time
        if (Date.now() - startTime > maxPollingTime) {
          throw new Error("Download timeout - please try again or contact support");
        }

        const statusUrl = buildFileApiUrl('/api/files/download-status', {
          jobId
        });
        
        const statusResponse = await fetch(statusUrl, {
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        });

        if (!statusResponse.ok) {
          throw new Error("Failed to check download status");
        }

        const status = await statusResponse.json();
        console.log(`📁 [ACI] Job ${jobId} status:`, status);

        if (status.ready && status.downloadUrl) {
          // Job completed successfully - download the file
          console.log(`📁 [ACI] Job completed, downloading from: ${status.downloadUrl}`);
          
          setDownloadProgress(prev => ({ ...prev, [directory.path]: 100 }));
          
          // Trigger download using the SAS URL
          const a = document.createElement('a');
          a.href = status.downloadUrl;
          a.download = `${directory.name}.zip`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          toast({
            title: "Success",
            description: "Large directory downloaded successfully as zip file",
          });

          // Remove directory from downloading state
          setDownloadingFiles(prev => {
            const newSet = new Set(prev);
            newSet.delete(directory.path);
            return newSet;
          });
          setDownloadProgress(prev => {
            const { [directory.path]: _, ...rest } = prev;
            return rest;
          });

        } else if (status.error || status.status === 'failed') {
          // Job failed
          throw new Error(status.error || "Download job failed");
        } else {
          // Job still in progress - continue polling
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          const statusMessage = status.status === 'running' ? 'Processing...' : 'Queued...';
          
          // Update progress indicator to show it's working
          const progressValue = Math.min(20 + (elapsed / 10), 90); // Gradually increase progress
          setDownloadProgress(prev => ({ ...prev, [directory.path]: progressValue }));

          console.log(`📁 [ACI] Job still in progress (${elapsed}s): ${statusMessage}`);
          
          // Continue polling after interval
          setTimeout(poll, pollingInterval);
        }

      } catch (error: any) {
        console.error("Status polling error:", error);
        toast({
          title: "Download Error", 
          description: error.message || "Failed to check download status",
          variant: "destructive",
        });

        // Remove directory from downloading state on error
        setDownloadingFiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(directory.path);
          return newSet;
        });
        setDownloadProgress(prev => {
          const { [directory.path]: _, ...rest } = prev;
          return rest;
        });
      }
    };

    // Start polling
    poll();
  };

  const handleDelete = (item: FileItem) => {
    if (window.confirm(`Are you sure you want to delete ${item.name}?`)) {
      deleteMutation.mutate({ path: item.path, type: item.type });
    }
  };

  const handleRenameClick = (item: FileItem) => {
    setItemToRename(item);
    setNewItemName(item.name);
    setRenameDialogOpen(true);
  };

  const handleRenameSubmit = () => {
    if (!itemToRename || !newItemName.trim()) return;
    
    // Check if name actually changed
    if (newItemName.trim() === itemToRename.name) {
      setRenameDialogOpen(false);
      setItemToRename(null);
      setNewItemName("");
      return;
    }
    
    renameMutation.mutate({
      path: itemToRename.path,
      newName: newItemName.trim(),
      type: itemToRename.type,
    });
  };

  const handleRunAiAgent = (file: FileItem) => {
    if (!selectedAiAgent || selectedAiAgent === "none") {
      toast({
        title: "No AI Agent Selected",
        description: "Please select an AI agent first",
        variant: "destructive",
      });
      return;
    }
    
    runAiAgentMutation.mutate({ file, agentId: selectedAiAgent });
  };

  const handleCreateFolder = (data: CreateFolderFormData) => {
    createFolderMutation.mutate(data);
  };

  const handleUpload = () => {
    // Validate that files are selected and not empty
    if (!selectedFiles || selectedFiles.length === 0) {
      toast({
        title: "No Files Selected",
        description: "Please select files before attempting to upload. Empty folders cannot be uploaded.",
        variant: "destructive",
      });
      return;
    }

    // Additional safety check for empty folder state
    if (emptyFolderSelected) {
      toast({
        title: "Empty Folder Selected",
        description: "Cannot upload an empty folder. Please select a folder with files or individual files.",
        variant: "destructive",
      });
      return;
    }

    // Check if there's a validation error (validated in real-time by useEffect)
    if (uploadValidationError) {
      toast({
        title: "Upload Validation Failed",
        description: uploadValidationError,
        variant: "destructive",
        duration: 8000,
      });
      return;
    }

    // Proceed with upload only if we have files and validation passed
    uploadFileMutation.mutate({ files: selectedFiles, encrypt: encryptUpload });
  };

  // Refresh function to invalidate all metadata and file data
  const handleRefresh = async () => {
    setIsRefreshing(true);
    
    try {
      // Parallelize invalidation calls for better performance
      const invalidationPromises = [
        // Invalidate storage account metadata
        queryClient.invalidateQueries({ 
          queryKey: [`/api/organizations/${selectedOrganizationId}/storage-account`]
        }),
        // Invalidate AI agents query
        queryClient.invalidateQueries({ 
          queryKey: [`/api/ai-agents?organizationId=${selectedOrganizationId}`]
        }),
      ];
      
      // Invalidate files and scan status if storage is configured
      if (hasStorageConfigured) {
        invalidationPromises.push(
          queryClient.invalidateQueries({ 
            queryKey: [buildFileApiUrl('/api/files', {
          organizationId: selectedOrganizationId,
          path: currentPath
        })]
          }),
          queryClient.invalidateQueries({ 
            queryKey: [buildFileApiUrl('/api/blobs/scan-status', {
              organizationId: selectedOrganizationId,
              path: currentPath
            })]
          })
        );
      }
      
      // Wait for all invalidations to complete in parallel
      await Promise.all(invalidationPromises);
      
      // Provide contextual feedback based on storage configuration
      const description = hasStorageConfigured 
        ? "Storage account, AI agents, file list, and scan status have been refreshed"
        : "Storage account and AI agents have been refreshed";
      
      toast({
        title: "Refreshed",
        description,
      });
    } catch (error) {
      console.error("Refresh error:", error);
      toast({
        title: "Refresh Failed",
        description: "An error occurred while refreshing data",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // File Search handlers
  const handleSearch = async (loadMore: boolean = false) => {
    if (!searchQuery.trim()) {
      toast({
        title: "Search query required",
        description: "Please enter a filename to search for",
        variant: "destructive",
      });
      return;
    }

    if (!selectedOrganizationId) {
      toast({
        title: "Organization required",
        description: "Please select an organization first",
        variant: "destructive",
      });
      return;
    }

    // Check if storage account is ADLS Gen2
    if (orgStorageAccount?.kind !== 'adls') {
      toast({
        title: "Search not supported",
        description: "File search is only available for ADLS Gen2 storage accounts",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    if (!loadMore) {
      setSearchResults([]);
      setSearchContinuationToken(undefined);
      setSearchMetadata(null);
    }

    try {
      const token = sessionStorage.getItem('azure_token');
      
      const params = new URLSearchParams({
        organizationId: selectedOrganizationId.toString(),
        q: searchQuery.trim(),
        match: searchMatchMode,
        caseSensitive: searchCaseSensitive.toString(),
        pageSize: '100',
      });

      // Add path prefix if we're in a subdirectory and want to scope the search
      if (currentPath) {
        params.set('pathPrefix', currentPath);
      }

      // Add continuation token if loading more
      if (loadMore && searchContinuationToken) {
        params.set('continuationToken', searchContinuationToken);
      }

      const response = await fetch(`/api/adls/search?${params.toString()}`, {
        method: 'GET',
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || 'Search failed');
      }

      const data: SearchResponse = await response.json();

      if (loadMore) {
        setSearchResults(prev => [...prev, ...data.items]);
      } else {
        setSearchResults(data.items);
      }

      setSearchContinuationToken(data.continuationToken);
      setSearchMetadata(data.searchMetadata);
      setIsSearchMode(true);

      if (!loadMore && data.items.length === 0) {
        toast({
          title: "No results found",
          description: `No files matching "${searchQuery}" were found${currentPath ? ` in "${currentPath}"` : ''}`,
        });
      }
    } catch (error: any) {
      console.error('Search error:', error);
      setSearchError(error.message || 'Search failed');
      toast({
        title: "Search Failed",
        description: error.message || 'An error occurred while searching',
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setIsSearchMode(false);
    setSearchResults([]);
    setSearchContinuationToken(undefined);
    setSearchMetadata(null);
    setSearchError(null);
    setSelectedItems(new Set());
    setSearchMatchMode('substring');
    setSearchCaseSensitive(false);
  };

  const handleNavigateToSearchResult = (result: SearchResult) => {
    // Navigate to the file's parent directory
    const pathParts = result.path.split('/');
    pathParts.pop(); // Remove the filename
    const parentPath = pathParts.join('/');
    
    // Clear search and navigate
    handleClearSearch();
    setCurrentPath(parentPath);
    setPathHistory([...pathHistory, currentPath]);
  };

  // Drag and Drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!rolePermissions?.fileMgmt?.uploadFile) {
      toast({
        title: "Permission Denied",
        description: "You don't have permission to upload files",
        variant: "destructive",
      });
      return;
    }

    const items = e.dataTransfer.items;
    const files: File[] = [];
    let hasDirectories = false;
    
    // Show processing indicator for large drag/drop operations
    setIsProcessingFiles(true);
    setFileCount(0);
    
    // Process dropped items (files and folders)
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          if (entry.isDirectory) {
            hasDirectories = true;
          }
          await processEntry(entry, files);
          // Update count as we process
          setFileCount(files.length);
        }
      }
    }

    setIsProcessingFiles(false);

    if (files.length > 0) {
      // Note: Validation is handled by useEffect when files are set
      // Just set the files and open the dialog - the button will be disabled if limits exceeded
      const fileList = createFileList(files);
      setSelectedFiles(fileList);
      setUploadDialogOpen(true); // Open the upload dialog
    } else if (hasDirectories) {
      // Show feedback for empty folders
      toast({
        title: "Empty Folder(s) Detected",
        description: "The folder(s) you dropped don't contain any files. Please select folders with files to upload.",
        variant: "default",
      });
    } else {
      // Show feedback for no valid items
      toast({
        title: "No Files Found",
        description: "Please drop files or folders containing files to upload.",
        variant: "default",
      });
    }
  };

  // Recursively process directory entries
  const processEntry = async (entry: any, files: File[]): Promise<void> => {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((file: File) => {
          // Preserve folder structure in file path
          const relativePath = entry.fullPath.substring(1); // Remove leading '/'
          Object.defineProperty(file, 'webkitRelativePath', {
            value: relativePath,
            writable: false
          });
          files.push(file);
          resolve();
        });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        reader.readEntries(async (entries: any[]) => {
          for (const childEntry of entries) {
            await processEntry(childEntry, files);
          }
          resolve();
        });
      }
    });
  };

  // Create FileList-like object from File array
  const createFileList = (files: File[]): FileList => {
    const fileList = {
      length: files.length,
      item: (index: number) => files[index] || null,
      [Symbol.iterator]: function* () {
        for (let i = 0; i < files.length; i++) {
          yield files[i];
        }
      }
    };
    
    // Add files as indexed properties
    files.forEach((file, index) => {
      (fileList as any)[index] = file;
    });
    
    return fileList as FileList;
  };

  // Process directory handle using File System Access API
  const processDirectoryHandle = async (directoryHandle: any, path: string, files: File[]): Promise<void> => {
    for await (const entry of directoryHandle.values()) {
      const entryPath = path ? `${path}/${entry.name}` : entry.name;
      
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        // Add webkitRelativePath property to preserve folder structure
        Object.defineProperty(file, 'webkitRelativePath', {
          value: entryPath,
          writable: false
        });
        files.push(file);
      } else if (entry.kind === 'directory') {
        await processDirectoryHandle(entry, entryPath, files);
      }
    }
  };

  // Set document title
  useEffect(() => {
    document.title = "File Management - Enterprise Management System";
  }, []);

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Files className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-semibold text-gray-900">File Management</h1>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg border">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <span className="text-gray-600">Checking authentication...</span>
          </div>
        </div>
      </div>
    );
  }

  // Show authentication required message if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Files className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-semibold text-gray-900">File Management</h1>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg border">
          <div className="text-center py-8">
            <div className="mx-auto max-w-md">
              <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Authentication Required
              </h3>
              <p className="text-gray-600 mb-4">
                You need to be logged in to access file management features. Please authenticate to continue.
              </p>
              <Button 
                onClick={() => window.location.href = '/login'}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Go to Login
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      {/* Full-page Delete Progress Overlay */}
      {(deleteMutation.isPending || bulkDeleteMutation.isPending) && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          data-testid="overlay-delete-progress"
        >
          <div className="bg-white rounded-lg shadow-xl p-8 flex flex-col items-center gap-4 max-w-sm mx-4">
            <Loader2 className="w-12 h-12 text-red-600 animate-spin" />
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Deleting...
              </h3>
              <p className="text-sm text-gray-600">
                {bulkDeleteMutation.isPending 
                  ? `Deleting ${selectedItems.size} item(s). Please wait...`
                  : "Deleting item. Please wait..."
                }
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Files className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-semibold text-gray-900">File Management</h1>
        </div>
      </div>

      {/* Organization Storage Status - only show when loading or not configured */}
      {(storageLoading || isStorageNotFound) && (
        <div className="bg-white p-6 rounded-lg border">
          {storageLoading ? (
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              <span className="text-gray-600">Checking storage configuration...</span>
            </div>
          ) : isStorageNotFound ? (
            <div className="text-center py-8">
              <div className="mx-auto max-w-md">
                <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <Settings className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No Storage Account Configured
                </h3>
                <p className="text-gray-600 mb-4">
                  <strong>{selectedRole?.organization.name}</strong> doesn't have a storage account set up yet. 
                  File management features are not available until storage is configured.
                </p>
                {rolePermissions?.storageMgmt?.view && (
                  <p className="text-sm text-blue-600">
                    You can configure storage accounts in the Storage Management section.
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* File Operations and Navigation */}
      {hasStorageConfigured && (
        <div 
          className={`bg-white rounded-lg border transition-all duration-200 ${
            isDragOver ? 'border-blue-500 border-2 bg-blue-50' : ''
          }`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Toolbar */}
          <div className="flex flex-col gap-3 p-4 border-b">
            {/* Top row: Navigation and Search */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center space-x-2 flex-shrink-0">
                {currentPath && !isSearchMode && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNavigateBack}
                    data-testid="button-navigate-back"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                )}
                {/* Breadcrumb Navigation - hidden in search mode */}
                {!isSearchMode && (
                  <div className="flex items-center space-x-1 text-sm">
                    {!currentPath ? (
                      <span className="text-gray-900 font-medium" data-testid="breadcrumb-root">
                        Root Directory
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          setCurrentPath("");
                          setPathHistory([]);
                        }}
                        className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                        data-testid="breadcrumb-root"
                      >
                        Root Directory
                      </button>
                    )}
                    {currentPath && currentPath.split('/').filter(Boolean).map((segment, index, array) => {
                      const isCurrentLocation = index === array.length - 1;
                      return (
                        <div key={index} className="flex items-center space-x-1">
                          <span className="text-gray-400">/</span>
                          {isCurrentLocation ? (
                            <span className="text-gray-900 font-medium" data-testid={`breadcrumb-${segment}`}>
                              {segment}
                            </span>
                          ) : (
                            <button
                              onClick={() => handleBreadcrumbClick(index)}
                              className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                              data-testid={`breadcrumb-${segment}`}
                            >
                              {segment}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Search mode indicator */}
                {isSearchMode && (
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                      <Search className="w-3 h-3 mr-1" />
                      Search Results
                    </Badge>
                    {searchMetadata && (
                      <span className="text-sm text-gray-500">
                        {searchResults.length} file{searchResults.length !== 1 ? 's' : ''} found
                        {searchMetadata.scopePath && ` in "${searchMetadata.scopePath}"`}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Search Input - only for ADLS Gen2 and requires searchFiles permission */}
              {orgStorageAccount?.kind === 'adls' && rolePermissions?.fileMgmt?.searchFiles && (
                <div className="flex items-center gap-2 flex-1 max-w-2xl">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type="text"
                      placeholder={currentPath ? `Search in "${currentPath}"...` : "Search files by name..."}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSearch();
                        }
                        if (e.key === 'Escape' && isSearchMode) {
                          handleClearSearch();
                        }
                      }}
                      className="pl-9 pr-8"
                      data-testid="input-file-search"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        data-testid="button-clear-search-input"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {/* Match Mode Selector */}
                  <Select
                    value={searchMatchMode}
                    onValueChange={(value: 'substring' | 'exact') => setSearchMatchMode(value)}
                  >
                    <SelectTrigger className="w-[120px]" data-testid="select-search-match-mode">
                      <SelectValue placeholder="Match mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="substring">Contains</SelectItem>
                      <SelectItem value="exact">Exact</SelectItem>
                    </SelectContent>
                  </Select>
                  {/* Case Sensitivity Toggle */}
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      id="case-sensitive"
                      checked={searchCaseSensitive}
                      onCheckedChange={(checked) => setSearchCaseSensitive(checked === true)}
                      data-testid="checkbox-case-sensitive"
                    />
                    <label
                      htmlFor="case-sensitive"
                      className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap cursor-pointer"
                    >
                      Case sensitive
                    </label>
                  </div>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleSearch()}
                    disabled={isSearching || !searchQuery.trim()}
                    data-testid="button-search-submit"
                  >
                    {isSearching ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </Button>
                  {isSearchMode && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearSearch}
                      data-testid="button-search-clear"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>
              )}
            </div>
            
            {/* Bottom row: Action buttons */}
            <div className="flex items-center justify-end gap-2 flex-wrap">
              {/* Refresh Button */}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
                title="Refresh storage account, AI agents, file list, and scan status"
                data-testid="button-refresh"
              >
                {isRefreshing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Refresh
              </Button>

              {/* Download to Folder Button - Modern browsers only (Chrome/Edge 86+) */}
              {selectedItems.size > 0 && browserCapabilities?.isSupported && (rolePermissions?.fileMgmt?.downloadFile || rolePermissions?.fileMgmt?.downloadFolder) && (
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={handleDownloadToFolder}
                  disabled={!!folderDownloadProgress || bulkDeleteMutation.isPending}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  title={`Download ${selectedItems.size} selected item(s) directly to folder (NO ZIP!)`}
                  data-testid="button-download-to-folder"
                >
                  <Folder className="w-4 h-4 mr-2" />
                  {folderDownloadProgress ? `Downloading ${folderDownloadProgress.downloadedFiles}/${folderDownloadProgress.totalFiles}...` : `Download to Folder (${selectedItems.size})`}
                </Button>
              )}

              {/* Delete Selected Button - Only show if user has delete permissions and items are selected */}
              {rolePermissions?.fileMgmt?.deleteFilesAndFolders && selectedItems.size > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleDeleteSelected}
                  disabled={bulkDeleteMutation.isPending || bulkDownloadMutation.isPending}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                  title={`Delete ${selectedItems.size} selected item(s)`}
                  data-testid="button-delete-selected"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {bulkDeleteMutation.isPending ? `Deleting...` : `Delete Selected (${selectedItems.size})`}
                </Button>
              )}
              
              {/* Create Folder Dialog - Only show if user has create_folder permission */}
              {rolePermissions?.fileMgmt?.createFolder && (
                <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <FolderPlus className="w-4 h-4 mr-2" />
                      New Folder
                    </Button>
                  </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Folder</DialogTitle>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleCreateFolder)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="folderName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Folder Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter folder name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end space-x-2">
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => setCreateFolderOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button 
                          type="submit" 
                          disabled={createFolderMutation.isPending}
                        >
                          {createFolderMutation.isPending ? "Creating..." : "Create"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
                </Dialog>
              )}

              {/* Upload File Dialog - Only show if user has upload_file permission */}
              {rolePermissions?.fileMgmt?.uploadFile && (
                <Dialog 
                  open={uploadDialogOpen} 
                  onOpenChange={(open) => {
                    // Prevent closing the dialog while files are uploading
                    if (!open && isUploading) {
                      toast({
                        title: "Upload in Progress",
                        description: "Please wait for the upload to complete before closing this window.",
                        variant: "default",
                      });
                      return;
                    }
                    
                    setUploadDialogOpen(open);
                    if (!open) {
                      // Reset states when dialog is closed
                      setEmptyFolderSelected(false);
                      setSelectedFiles(null);
                      setFileCount(0);
                      setIsProcessingFiles(false);
                      setUploadingFiles([]);
                      setUploadProgress({});
                      setIsUploading(false);
                      setEncryptUpload(false); // Reset encryption toggle
                      
                      // Clear file input values to ensure fresh state
                      if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                      }
                      if (folderInputRef.current) {
                        folderInputRef.current.value = '';
                      }
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Files/Folder
                    </Button>
                  </DialogTrigger>
                <DialogContent
                    showClose={!isUploading}
                    onPointerDownOutside={(e) => {
                      e.preventDefault();
                      toast({
                        title: "Dialog Protection",
                        description: isUploading 
                          ? "Please wait for the upload to complete. You cannot close this window during upload."
                          : "Please use the X button to close this dialog to avoid losing your work.",
                        variant: "default",
                      });
                    }}
                    onEscapeKeyDown={(e) => {
                      e.preventDefault();
                      toast({
                        title: "Dialog Protection",
                        description: isUploading 
                          ? "Please wait for the upload to complete. You cannot close this window during upload."
                          : "Please use the X button to close this dialog to avoid losing your work.",
                        variant: "default",
                      });
                    }}
                  >
                  <DialogHeader>
                    <DialogTitle>Upload Files/Folder</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Choose what to upload
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          {/* Select Files Button */}
                          <Button
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isProcessingFiles}
                            className="h-auto py-4 flex-col items-center justify-center space-y-2"
                          >
                            <Upload className="w-6 h-6 text-blue-600" />
                            <div className="text-sm font-medium">Select Files</div>
                            <div className="text-xs text-gray-500">Choose one or more files</div>
                          </Button>
                          
                          {/* Select Folder Button */}
                          <Button
                            variant="outline"
                            onClick={async () => {
                              try {
                                // Use modern File System Access API to bypass browser popup
                                if ('showDirectoryPicker' in window) {
                                  const directoryHandle = await (window as any).showDirectoryPicker();
                                  setIsProcessingFiles(true);
                                  setEmptyFolderSelected(false);
                                  
                                  const files: File[] = [];
                                  await processDirectoryHandle(directoryHandle, directoryHandle.name, files);
                                  
                                  if (files.length > 0) {
                                    setFileCount(files.length);
                                    const fileList = createFileList(files);
                                    setSelectedFiles(fileList);
                                    setIsProcessingFiles(false);
                                    setUploadDialogOpen(true); // Open the upload dialog
                                  } else {
                                    setFileCount(0);
                                    setSelectedFiles(null);
                                    setEmptyFolderSelected(true);
                                    setIsProcessingFiles(false);
                                    toast({
                                      title: "Empty Folder Selected",
                                      description: "The folder you selected doesn't contain any files. Please select a folder with files to upload.",
                                      variant: "default",
                                    });
                                  }
                                } else {
                                  // Fallback: trigger hidden input for browsers without File System Access API
                                  if (folderInputRef.current) {
                                    folderInputRef.current.click();
                                  }
                                }
                              } catch (error: any) {
                                // Handle user cancellation or other errors
                                if (error.name !== 'AbortError') {
                                  console.error('Error selecting folder:', error);
                                }
                                setIsProcessingFiles(false);
                              }
                            }}
                            disabled={isProcessingFiles}
                            className="h-auto py-4 flex-col items-center justify-center space-y-2"
                          >
                            {isProcessingFiles ? (
                              <>
                                <div className="w-6 h-6 border-2 border-gray-600 border-t-transparent rounded-full animate-spin"></div>
                                <div className="text-xs">Processing...</div>
                              </>
                            ) : (
                              <>
                                <FolderPlus className="w-6 h-6 text-green-600" />
                                <div className="text-sm font-medium">Select Folder</div>
                                <div className="text-xs text-gray-500">Choose entire folder</div>
                              </>
                            )}
                          </Button>
                        </div>
                        
                        {/* Hidden inputs */}
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          onChange={async (e) => {
                            const files = e.target.files;
                            if (files && files.length > 0) {
                              setIsProcessingFiles(true);
                              setFileCount(files.length);
                              setEmptyFolderSelected(false);
                              
                              await new Promise(resolve => setTimeout(resolve, 100));
                              
                              setSelectedFiles(files);
                              setIsProcessingFiles(false);
                            } else {
                              setSelectedFiles(null);
                              setFileCount(0);
                              setEmptyFolderSelected(false);
                            }
                          }}
                          disabled={isProcessingFiles}
                          style={{ display: 'none' }}
                        />
                        <input
                          ref={folderInputRef}
                          type="file"
                          {...({ webkitdirectory: "" } as any)}
                          multiple
                          onChange={async (e) => {
                            const files = e.target.files;
                            if (files && files.length > 0) {
                              setIsProcessingFiles(true);
                              setFileCount(files.length);
                              setEmptyFolderSelected(false);
                              
                              await new Promise(resolve => setTimeout(resolve, 100));
                              
                              setSelectedFiles(files);
                              setIsProcessingFiles(false);
                              setUploadDialogOpen(true);
                            } else {
                              const folderWasSelected = e.target.value !== '';
                              setSelectedFiles(null);
                              setFileCount(0);
                              
                              if (folderWasSelected) {
                                setEmptyFolderSelected(true);
                                toast({
                                  title: "Empty Folder Selected",
                                  description: "The folder you selected doesn't contain any files. Please select a folder with files to upload.",
                                  variant: "default",
                                });
                              } else {
                                setEmptyFolderSelected(false);
                              }
                            }
                          }}
                          style={{ display: 'none' }}
                          disabled={isProcessingFiles}
                        />
                      </div>
                      <div className="text-sm text-gray-500 text-center">
                        Or drag and drop files/folders anywhere in the file area
                      </div>
                    </div>
                    
                    {/* File Processing Indicator */}
                    {isProcessingFiles && (
                      <div className="flex items-center justify-center space-x-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <div className="text-sm text-blue-700 dark:text-blue-300">
                          Processing {fileCount.toLocaleString()} files... Please wait
                        </div>
                      </div>
                    )}
                    
                    {/* Empty Folder Warning */}
                    {emptyFolderSelected && !isProcessingFiles && (
                      <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border-2 border-red-300 dark:border-red-700 shadow-sm">
                        <div className="flex items-start space-x-3">
                          <div className="text-red-600 dark:text-red-400 text-xl flex-shrink-0 mt-0.5">
                            📁❌
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-red-800 dark:text-red-200">
                              Empty Folder Selected - Nothing to Upload
                            </div>
                            <div className="text-sm text-red-700 dark:text-red-300 mt-1">
                              <strong>This folder is completely empty!</strong> You cannot upload an empty folder because there are no files inside it.
                            </div>
                            <div className="text-xs text-red-600 dark:text-red-400 mt-2 font-medium bg-red-100 dark:bg-red-800/30 p-2 rounded">
                              🔍 Please choose a folder that contains files, or select individual files to upload
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* No Files Selected Warning */}
                    {!selectedFiles && !emptyFolderSelected && !isProcessingFiles && (
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                        <div className="flex items-center space-x-2">
                          <div className="text-blue-600 dark:text-blue-400">
                            ℹ️
                          </div>
                          <div className="text-sm text-blue-700 dark:text-blue-300">
                            Select files or a folder to enable the upload button
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* File Selection Summary */}
                    {selectedFiles && !isProcessingFiles && (
                      <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                        <div className="text-sm text-green-700 dark:text-green-300">
                          ✅ {selectedFiles.length.toLocaleString()} files selected
                          {selectedFiles.length > 0 && (
                            <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                              (Total size: {formatFileSize(Array.from(selectedFiles).reduce((acc, file) => acc + file.size, 0))})
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* PGP Encryption Option - Only show when files are selected and org has PGP key */}
                    {selectedFiles && !isProcessingFiles && hasPgpKeyConfigured && (
                      <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center space-x-2">
                            <Lock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            <div>
                              <div className="text-sm font-medium text-purple-800 dark:text-purple-200">
                                PGP Encryption
                              </div>
                              <div className="text-xs text-purple-600 dark:text-purple-400">
                                Encrypt files before upload for secure storage
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="encrypt-upload"
                              checked={encryptUpload}
                              onCheckedChange={(checked) => setEncryptUpload(checked === true)}
                              data-testid="checkbox-encrypt-upload"
                            />
                            <label 
                              htmlFor="encrypt-upload" 
                              className="text-sm font-medium text-purple-700 dark:text-purple-300 cursor-pointer"
                            >
                              Enable
                            </label>
                          </div>
                        </div>
                        {encryptUpload && (
                          <div className="mt-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <KeyRound className="w-3 h-3 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                              <span className="text-xs text-purple-600 dark:text-purple-400">Select encryption key:</span>
                            </div>
                            <Select
                              value={selectedEncryptionKey?.id?.toString() || ''}
                              onValueChange={(value) => setSelectedEncryptionKeyId(parseInt(value, 10))}
                            >
                              <SelectTrigger 
                                className="h-9 text-xs bg-purple-100 dark:bg-purple-800/30 border-purple-300 dark:border-purple-600"
                                data-testid="select-encryption-key"
                              >
                                <SelectValue placeholder="Select a key..." />
                              </SelectTrigger>
                              <SelectContent>
                                {availableEncryptionKeys.map((key) => (
                                  <SelectItem 
                                    key={key.id} 
                                    value={key.id.toString()}
                                    data-testid={`encryption-key-option-${key.id}`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <Badge 
                                        variant={key.belongsTo === 'SELF' ? 'default' : 'secondary'}
                                        className="text-[10px] px-1.5 py-0"
                                      >
                                        {key.belongsTo === 'SELF' ? 'OWN' : 'PARTNER'}
                                      </Badge>
                                      <span className="font-medium">{key.keyName}</span>
                                      <span className="text-muted-foreground">({key.keyId})</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {selectedEncryptionKey && (
                              <div className="text-[10px] text-purple-500 dark:text-purple-400 pl-5">
                                Files will be encrypted using: <strong>{selectedEncryptionKey.keyName}</strong> ({selectedEncryptionKey.keyId})
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* No PGP Key Info - Show when files are selected but no PGP key is configured */}
                    {selectedFiles && !isProcessingFiles && !hasPgpKeyConfigured && !pgpKeyLoading && (
                      <div className="p-3 bg-gray-50 dark:bg-gray-900/20 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center space-x-2">
                          <Lock className="w-4 h-4 text-gray-400" />
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            PGP encryption unavailable - no key configured for this organization
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Upload Validation Error */}
                    {uploadValidationError && (
                      <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800" data-testid="upload-validation-error">
                        <div className="flex items-start space-x-2">
                          <div className="text-red-600 dark:text-red-400 mt-0.5">
                            <AlertCircle className="w-4 h-4" />
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">
                              Upload Limit Exceeded
                            </div>
                            <div className="text-xs text-red-600 dark:text-red-400">
                              {uploadValidationError}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Enhanced Upload Progress Display */}
                    {isUploading && uploadingFiles.length > 0 && (
                      <div className="space-y-4 mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        {/* Overall Progress Summary */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                            <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                              Uploading {uploadingFiles.length} file{uploadingFiles.length > 1 ? 's' : ''}
                            </h3>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              {uploadingFiles.filter(f => f.status === 'completed').length} completed, 
                              {' '}{uploadingFiles.filter(f => f.status === 'uploading').length} uploading, 
                              {' '}{uploadingFiles.filter(f => f.status === 'pending').length} pending
                              {uploadingFiles.filter(f => f.status === 'error').length > 0 && 
                                `, ${uploadingFiles.filter(f => f.status === 'error').length} failed`
                              }
                            </div>
                            <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                              {Math.round((uploadingFiles.filter(f => f.status === 'completed').length / uploadingFiles.length) * 100)}% Complete
                            </div>
                          </div>
                        </div>

                        {/* Overall Progress Bar */}
                        <Progress 
                          value={(uploadingFiles.filter(f => f.status === 'completed').length / uploadingFiles.length) * 100} 
                          className="h-3 bg-blue-100 dark:bg-blue-900/40"
                        />

                        {/* Collapsible File List */}
                        <div className="space-y-2">
                          {/* Currently Uploading Files */}
                          {uploadingFiles.filter(f => f.status === 'uploading').length > 0 && (
                            <div className="space-y-2">
                              <h4 className="text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center">
                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-2"></div>
                                Currently Uploading ({uploadingFiles.filter(f => f.status === 'uploading').length})
                              </h4>
                              <div className="space-y-2 max-h-32 overflow-y-auto">
                                {uploadingFiles.filter(f => f.status === 'uploading').map((file) => (
                                  <div key={file.name} className="space-y-1 bg-white dark:bg-gray-800 p-2 rounded border">
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[200px]" title={file.name}>
                                        📁 {file.name}
                                      </span>
                                      <span className="text-blue-600 dark:text-blue-400 font-semibold">
                                        {file.progress}% ({Math.round(file.progress * file.size / 100 / 1024 / 1024)}MB / {Math.round(file.size / 1024 / 1024)}MB)
                                      </span>
                                    </div>
                                    <Progress 
                                      value={file.progress} 
                                      className="h-1.5 bg-blue-100 dark:bg-blue-900/40"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Completed Files - Collapsible */}
                          {uploadingFiles.filter(f => f.status === 'completed').length > 0 && (
                            <details className="group">
                              <summary className="cursor-pointer text-xs font-semibold text-green-700 dark:text-green-300 flex items-center hover:text-green-800 dark:hover:text-green-200">
                                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                                Completed Files ({uploadingFiles.filter(f => f.status === 'completed').length})
                                <ChevronDown className="w-3 h-3 ml-1 group-open:rotate-180 transition-transform" />
                              </summary>
                              <div className="mt-2 max-h-24 overflow-y-auto">
                                <div className="grid grid-cols-2 gap-1 text-xs">
                                  {uploadingFiles.filter(f => f.status === 'completed').map((file) => (
                                    <div key={file.name} className="flex items-center text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded truncate" title={file.name}>
                                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2 flex-shrink-0"></div>
                                      <span className="truncate">{file.name}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </details>
                          )}

                          {/* Pending Files - Collapsible */}
                          {uploadingFiles.filter(f => f.status === 'pending').length > 0 && (
                            <details className="group">
                              <summary className="cursor-pointer text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center hover:text-gray-800 dark:hover:text-gray-200">
                                <div className="w-2 h-2 bg-gray-400 rounded-full mr-2"></div>
                                Pending Files ({uploadingFiles.filter(f => f.status === 'pending').length})
                                <ChevronDown className="w-3 h-3 ml-1 group-open:rotate-180 transition-transform" />
                              </summary>
                              <div className="mt-2 max-h-24 overflow-y-auto">
                                <div className="grid grid-cols-2 gap-1 text-xs">
                                  {uploadingFiles.filter(f => f.status === 'pending').map((file) => (
                                    <div key={file.name} className="flex items-center text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded truncate" title={file.name}>
                                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full mr-2 flex-shrink-0"></div>
                                      <span className="truncate">{file.name}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </details>
                          )}

                          {/* Error Files - Always Visible */}
                          {uploadingFiles.filter(f => f.status === 'error').length > 0 && (
                            <div className="space-y-2">
                              <h4 className="text-xs font-semibold text-red-700 dark:text-red-300 flex items-center">
                                <AlertCircle className="w-3 h-3 mr-2" />
                                Failed Files ({uploadingFiles.filter(f => f.status === 'error').length})
                              </h4>
                              <div className="space-y-1 max-h-32 overflow-y-auto">
                                {uploadingFiles.filter(f => f.status === 'error').map((file) => (
                                  <div key={file.name} className="bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800">
                                    <div className="text-xs text-red-700 dark:text-red-300 font-medium truncate" title={file.name}>
                                      📁 {file.name}
                                    </div>
                                    {file.error && (
                                      <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                                        {file.error}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div className="flex justify-end space-x-2">
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => {
                          // Prevent canceling while files are uploading
                          if (isUploading) {
                            toast({
                              title: "Upload in Progress",
                              description: "Please wait for the upload to complete. You cannot cancel during an active upload.",
                              variant: "default",
                            });
                            return;
                          }
                          
                          // Manually reset all states first
                          setEmptyFolderSelected(false);
                          setSelectedFiles(null);
                          setFileCount(0);
                          setIsProcessingFiles(false);
                          setUploadingFiles([]);
                          setUploadProgress({});
                          setIsUploading(false);
                          setUploadValidationError(null); // Clear validation error
                          setEncryptUpload(false); // Reset encryption toggle
                          
                          // Clear file input values
                          if (fileInputRef.current) {
                            fileInputRef.current.value = '';
                          }
                          if (folderInputRef.current) {
                            folderInputRef.current.value = '';
                          }
                          
                          // Then close the dialog
                          setUploadDialogOpen(false);
                        }}
                        data-testid="button-upload-cancel"
                      >
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleUpload}
                        disabled={!selectedFiles || uploadFileMutation.isPending || isUploading || isProcessingFiles || emptyFolderSelected || !!uploadValidationError}
                        data-testid="button-upload-confirm"
                      >
                        {isProcessingFiles ? (
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                            <span>Processing Files...</span>
                          </div>
                        ) : isUploading ? (
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                            <span>Uploading...</span>
                          </div>
                        ) : "Upload"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          {/* AI Agent Selection */}
          {rolePermissions?.aiAgentMgmt?.view && (
            <div className="bg-gradient-to-r from-emerald-50 to-green-50 dark:from-gray-800 dark:to-gray-700 p-6 border-t border-emerald-100 dark:border-gray-600">
              <div className="flex items-center space-x-6">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                  <label className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    AI Agent for File Processing:
                  </label>
                </div>
                
                {aiAgentsLoading ? (
                  <div className="flex items-center space-x-2">
                    <LoadingSpinner size="sm" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Loading AI agents...</span>
                  </div>
                ) : aiAgents && aiAgents.length > 0 ? (
                  <>
                    <Select value={selectedAiAgent} onValueChange={setSelectedAiAgent}>
                      <SelectTrigger className="w-72 bg-white dark:bg-gray-800 border-emerald-200 dark:border-emerald-700 hover:border-emerald-400 focus:border-emerald-500 focus:ring-emerald-200 transition-colors duration-200 shadow-sm hover:shadow-md">
                        <SelectValue placeholder="🤖 Choose an AI agent..." />
                      </SelectTrigger>
                      <SelectContent className="border-emerald-200 dark:border-emerald-700">
                        <SelectItem value="none" className="text-gray-500">
                          <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                            <span>No AI Agent Selected</span>
                          </div>
                        </SelectItem>
                        {aiAgents.map((agent) => (
                          <SelectItem key={agent.id} value={agent.id.toString()} className="hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                              <span>{agent.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedAiAgent && selectedAiAgent !== "none" && (
                      <Badge variant="outline" className="ml-2 bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-600 shadow-sm">
                        <div className="flex items-center space-x-1">
                          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                          <span>{aiAgents.find(a => a.id.toString() === selectedAiAgent)?.name} Active</span>
                        </div>
                      </Badge>
                    )}
                  </>
                ) : (
                  <span className="text-sm text-gray-600 dark:text-gray-400">No AI agents available for this organization</span>
                )}
              </div>
            </div>
          )}

          {/* Security Status Loading Banner */}
          {currentFolderFileCount > AUTO_FETCH_THRESHOLD && !manualScanFetchTriggered && !scanStatusLoading && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4 mb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">
                      Security Status Not Loaded
                    </h3>
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                      This folder contains <strong>{currentFolderFileCount} files</strong>. 
                      Loading security scan results may take approximately <strong>{Math.ceil(currentFolderFileCount / 40)} seconds</strong>.
                    </p>
                  </div>
                </div>
                <Button 
                  onClick={() => setManualScanFetchTriggered(true)}
                  variant="outline"
                  size="sm"
                  className="bg-white dark:bg-gray-800 border-amber-300 dark:border-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/40 text-amber-900 dark:text-amber-200 flex-shrink-0"
                  data-testid="button-load-security-status"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Load Security Status
                </Button>
              </div>
            </div>
          )}

          {/* Security Status Loading Progress */}
          {scanStatusLoading && currentFolderFileCount > AUTO_FETCH_THRESHOLD && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <Loader2 className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-spin mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-1">
                    Loading Security Status
                  </h3>
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    Fetching scan results for {currentFolderFileCount} files... This may take approximately {Math.ceil(currentFolderFileCount / 40)} seconds.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Search Results Table */}
          {isSearchMode ? (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={searchResults.length > 0 && searchResults.every(r => selectedItems.has(r.path))}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedItems(new Set(searchResults.map(r => r.path)));
                          } else {
                            setSelectedItems(new Set());
                          }
                        }}
                        aria-label="Select all search results"
                        data-testid="checkbox-select-all-search"
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Modified</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isSearching && searchResults.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <LoadingSpinner message={`Searching for "${searchQuery}"...`} size="md" />
                      </TableCell>
                    </TableRow>
                  ) : searchResults.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12">
                        <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">No files found matching "{searchQuery}"</p>
                        {searchMetadata?.scopePath && (
                          <p className="text-sm text-gray-400 mt-2">Search was scoped to: {searchMetadata.scopePath}</p>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleClearSearch}
                          className="mt-4"
                          data-testid="button-back-to-folder"
                        >
                          <ArrowLeft className="w-4 h-4 mr-2" />
                          Back to Folder
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {searchResults.map((result) => {
                        const parentPath = result.path.split('/').slice(0, -1).join('/') || '/';
                        return (
                          <TableRow key={result.path} data-testid={`search-result-${result.name}`}>
                            <TableCell>
                              <Checkbox
                                checked={selectedItems.has(result.path)}
                                onCheckedChange={() => {
                                  const newSelected = new Set(selectedItems);
                                  if (newSelected.has(result.path)) {
                                    newSelected.delete(result.path);
                                  } else {
                                    newSelected.add(result.path);
                                  }
                                  setSelectedItems(newSelected);
                                }}
                                aria-label={`Select ${result.name}`}
                                data-testid={`checkbox-search-${result.name}`}
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center space-x-2">
                                {result.isDirectory ? (
                                  <Folder className="w-4 h-4 text-blue-600" />
                                ) : (
                                  <File className="w-4 h-4 text-gray-600" />
                                )}
                                <span>{result.name}</span>
                                {result.isEncrypted && (
                                  <Badge 
                                    variant="outline" 
                                    className="text-xs px-1.5 py-0 h-5 bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700"
                                  >
                                    <Lock className="w-3 h-3 mr-1" />
                                    Encrypted
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <button
                                onClick={() => handleNavigateToSearchResult(result)}
                                className="text-blue-600 hover:text-blue-800 hover:underline text-sm"
                                title={`Go to ${parentPath}`}
                                data-testid={`button-goto-${result.name}`}
                              >
                                {parentPath || 'Root'}
                              </button>
                            </TableCell>
                            <TableCell>
                              <Badge variant={result.isDirectory ? 'default' : 'secondary'}>
                                {result.isDirectory ? 'Folder' : 'File'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {result.size !== undefined ? formatBytes(result.size) : '-'}
                            </TableCell>
                            <TableCell>
                              {result.lastModified ? new Date(result.lastModified).toLocaleDateString() : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleNavigateToSearchResult(result)}
                                title="Go to file location"
                                data-testid={`button-navigate-${result.name}`}
                              >
                                <FolderOpen className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </>
                  )}
                </TableBody>
              </Table>
              
              {/* Load More / Search Metadata */}
              {searchMetadata && (
                <div className="flex items-center justify-between p-4 border-t bg-gray-50 dark:bg-gray-800">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Showing {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                    {searchMetadata.timedOut && (
                      <span className="text-amber-600 ml-2">(search timed out - results may be incomplete)</span>
                    )}
                    <span className="ml-2 text-gray-400">
                      ({searchMetadata.durationMs}ms, {searchMetadata.itemsScanned} items scanned)
                    </span>
                  </div>
                  {searchContinuationToken && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSearch(true)}
                      disabled={isSearching}
                      data-testid="button-load-more-results"
                    >
                      {isSearching ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <ChevronDown className="w-4 h-4 mr-2" />
                      )}
                      Load More Results
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : (
          /* Files Table */
          <div className="border rounded-lg overflow-x-auto">
            <Table>
                <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={sortedFiles && sortedFiles.length > 0 && selectedItems.size === sortedFiles.length}
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all"
                    data-testid="checkbox-select-all"
                  />
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" 
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center gap-1">
                    Name
                    {sortField === "name" && (
                      sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </TableHead>
                <TableHead>Type</TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" 
                  onClick={() => handleSort("size")}
                >
                  <div className="flex items-center gap-1">
                    Size
                    {sortField === "size" && (
                      sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" 
                  onClick={() => handleSort("lastModified")}
                >
                  <div className="flex items-center gap-1">
                    Modified
                    {sortField === "lastModified" && (
                      sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="text-center">Access Tier</TableHead>
                <TableHead>
                  <div className="flex items-center gap-1">
                    <Shield className="h-4 w-4" />
                    Security Status
                  </div>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filesLoading ? (
                <>
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <LoadingSpinner message="Loading files and directories..." size="md" />
                    </TableCell>
                  </TableRow>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="opacity-50">
                      <TableCell><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div></TableCell>
                      <TableCell><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div></TableCell>
                      <TableCell><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div></TableCell>
                      <TableCell><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div></TableCell>
                      <TableCell><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div></TableCell>
                      <TableCell><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div></TableCell>
                      <TableCell><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div></TableCell>
                      <TableCell><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div></TableCell>
                    </TableRow>
                  ))}
                </>
              ) : sortedFiles?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <Folder className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No files or folders found</p>
                  </TableCell>
                </TableRow>
              ) : (
                sortedFiles?.map((item) => (
                  <TableRow key={item.path}>
                    <TableCell>
                      <Checkbox
                        checked={selectedItems.has(item.path)}
                        onCheckedChange={() => handleSelectItem(item.path)}
                        aria-label={`Select ${item.name}`}
                        data-testid={`checkbox-${item.name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center space-x-2">
                        {item.type === 'directory' ? (
                          <Folder className="w-4 h-4 text-blue-600" />
                        ) : (
                          <File className="w-4 h-4 text-gray-600" />
                        )}
                        <span 
                          className={item.type === 'directory' ? "cursor-pointer text-blue-600 hover:underline" : ""}
                          onClick={() => item.type === 'directory' && handleNavigateToFolder(item.name)}
                        >
                          {item.name}
                        </span>
                        {item.isEncrypted && (
                          <Badge 
                            variant="outline" 
                            className="text-xs px-1.5 py-0 h-5 bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700"
                            title={`Encrypted with PGP key v${item.encryptionKeyVersion || 1}${item.encryptedAt ? ` at ${new Date(item.encryptedAt).toLocaleString()}` : ''}`}
                          >
                            <Lock className="w-3 h-3 mr-1" />
                            Encrypted
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.type === 'directory' ? (
                        <Badge variant="default">Folder</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">File</span>
                      )}
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {item.size ? `${(item.size / 1024).toFixed(1)} KB` : '-'}
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {item.lastModified ? new Date(item.lastModified).toLocaleString() : '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.type === 'file' && item.accessTier ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <Badge variant="outline" className={`text-xs w-auto inline-flex ${
                            item.accessTier === 'Hot' ? 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700' :
                            item.accessTier === 'Cool' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700' :
                            item.accessTier === 'Cold' ? 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-700' :
                            item.accessTier === 'Archive' ? 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/30 dark:text-gray-300 dark:border-gray-700' :
                            ''
                          }`} data-testid={`badge-tier-${item.name}`}>
                            {item.accessTier}
                          </Badge>
                          {item.archiveStatus && (
                            <span className="text-xs text-amber-600 dark:text-amber-400" data-testid={`text-rehydrate-status-${item.name}`}>
                              Rehydrating to {item.archiveStatus.includes('hot') ? 'Hot' : 'Cool'}
                            </span>
                          )}
                          {item.archiveStatus && item.rehydratePriority && (
                            <span className="text-xs text-muted-foreground" data-testid={`text-rehydrate-priority-${item.name}`}>
                              {item.rehydratePriority} priority
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.type === 'file' && item.scanResult ? (
                        <>
                          {item.scanResult === 'Clean' && (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                              <ShieldCheck className="w-3 h-3 mr-1" />
                              Clean
                            </Badge>
                          )}
                          {item.scanResult === 'Malicious' && (
                            <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
                              <ShieldAlert className="w-3 h-3 mr-1" />
                              Malicious
                            </Badge>
                          )}
                          {item.scanResult === 'Scanning' && (
                            <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300">
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Scanning
                            </Badge>
                          )}
                          {(item.scanResult === 'NotScanned' || item.scanResult === 'Unknown') && (
                            <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                              N/A
                            </Badge>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-1">
                        {/* Run AI Agent - Only for files when an AI agent is selected */}
                        {item.type === 'file' && selectedAiAgent && selectedAiAgent !== "none" && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleRunAiAgent(item)}
                            className="group relative text-emerald-600 hover:text-white hover:bg-gradient-to-r hover:from-emerald-500 hover:to-green-600 border border-emerald-200 hover:border-emerald-500 transition-all duration-300 ease-in-out hover:shadow-lg hover:shadow-emerald-200/50 hover:scale-105"
                            title={`Run ${aiAgents?.find(a => a.id.toString() === selectedAiAgent)?.name || 'AI Agent'} on this file`}
                            disabled={runningAgentFiles.has(item.path)}
                          >
                            {runningAgentFiles.has(item.path) ? (
                              <div className="w-4 h-4 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />
                            ) : (
                              <Play className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
                            )}
                          </Button>
                        )}
                        {/* Preview file - Read-only secure preview - Only visible with viewFiles permission */}
                        {item.type === 'file' && rolePermissions?.fileMgmt?.viewFiles && (
                          <span title={item.accessTier === 'Archive' ? (item.archiveStatus ? "Cannot preview — file is rehydrating. Please wait until rehydration completes." : "Cannot preview — file is archived. Rehydrate first.") : "Preview file (read-only)"}>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handlePreview(item)}
                              className={item.accessTier === 'Archive' ? "text-gray-400 pointer-events-none" : "text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20"}
                              data-testid={`button-preview-${item.name}`}
                              disabled={previewingFile === item.path || item.accessTier === 'Archive'}
                            >
                              {previewingFile === item.path ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </Button>
                          </span>
                        )}
                        {/* Download file - Only visible with downloadFile permission */}
                        {item.type === 'file' && rolePermissions?.fileMgmt?.downloadFile && (
                          <span title={item.accessTier === 'Archive' ? (item.archiveStatus ? "Cannot download — file is rehydrating. Please wait until rehydration completes." : "Cannot download — file is archived. Rehydrate first.") : downloadingFiles.has(item.path) ? `Downloading... ${downloadProgress[item.path] || 0}%` : "Download file"}>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleDownload(item)}
                              disabled={downloadingFiles.has(item.path) || item.accessTier === 'Archive'}
                              className={item.accessTier === 'Archive' ? "text-gray-400 pointer-events-none" : "relative"}
                            >
                            {downloadingFiles.has(item.path) ? (
                              <div className="flex items-center space-x-2">
                                <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                                {downloadProgress[item.path] !== undefined && (
                                  <span className="text-xs text-blue-600 font-medium">
                                    {downloadProgress[item.path]}%
                                  </span>
                                )}
                              </div>
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                          </Button>
                          </span>
                        )}
                        {/* Rehydrate archived file - Only visible for Archive tier files without active rehydration */}
                        {item.type === 'file' && item.accessTier === 'Archive' && !item.archiveStatus && rolePermissions?.fileMgmt?.rehydrate && (
                          <span title="Rehydrate file from Archive to Hot tier">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleRehydrate(item)}
                              className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                              data-testid={`button-rehydrate-${item.name}`}
                              disabled={rehydratingFiles.has(item.path)}
                            >
                              {rehydratingFiles.has(item.path) ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Flame className="w-4 h-4" />
                              )}
                            </Button>
                          </span>
                        )}
                        {/* Download directory - Only visible with downloadFolder permission */}
                        {item.type === 'directory' && rolePermissions?.fileMgmt?.downloadFolder && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDownloadDirectory(item)}
                            title={downloadingFiles.has(item.path) ? `Creating ZIP... ${downloadProgress[item.path] || 0}%` : "Download directory as ZIP"}
                            disabled={downloadingFiles.has(item.path)}
                            className="relative"
                          >
                            {downloadingFiles.has(item.path) ? (
                              <div className="flex items-center space-x-2">
                                <div className="w-4 h-4 border-2 border-green-300 border-t-green-600 rounded-full animate-spin" />
                                {downloadProgress[item.path] !== undefined && (
                                  <span className="text-xs text-green-600 font-medium">
                                    {downloadProgress[item.path]}%
                                  </span>
                                )}
                              </div>
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                        {/* Decrypt file - Only visible for encrypted files with decrypt permission */}
                        {item.type === 'file' && item.isEncrypted && rolePermissions?.pgpKeyMgmt?.decrypt && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDecryptClick(item)}
                            title={decryptingFiles.has(item.path) ? "Decrypting..." : "Decrypt file to folder"}
                            disabled={decryptingFiles.has(item.path)}
                            className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                            data-testid={`button-decrypt-${item.name}`}
                          >
                            {decryptingFiles.has(item.path) ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <KeyRound className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                        {/* Rename - Only show if user has renameFile permission */}
                        {rolePermissions?.fileMgmt?.renameFile && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleRenameClick(item)}
                            className="text-blue-600 hover:text-blue-700"
                            title={`Rename ${item.type === 'directory' ? 'folder' : 'file'}`}
                            data-testid={`button-rename-${item.name}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                        {/* Delete - Only show if user has delete files/folders permission */}
                        {rolePermissions?.fileMgmt?.deleteFilesAndFolders && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDelete(item)}
                            className="text-red-600 hover:text-red-700"
                            title={`Delete ${item.type === 'directory' ? 'folder' : 'file'}`}
                            data-testid={`button-delete-${item.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
          )}

          {/* Download Progress Indicators */}
          {downloadingFiles.size > 0 && (
            <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-700 rounded-lg border border-blue-200 dark:border-gray-600">
              <div className="flex items-center space-x-2 mb-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                  Download Progress ({downloadingFiles.size} active)
                </h3>
              </div>
              <div className="space-y-2">
                {Array.from(downloadingFiles).map((filePath) => {
                  const fileName = filePath.split('/').pop() || filePath;
                  const progress = downloadProgress[filePath] || 0;
                  const isDirectory = sortedFiles?.find(f => f.path === filePath)?.type === 'directory';
                  
                  return (
                    <div key={filePath} className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-blue-100 dark:border-gray-600">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          {isDirectory ? (
                            <Folder className="w-4 h-4 text-green-600" />
                          ) : (
                            <File className="w-4 h-4 text-blue-600" />
                          )}
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-xs">
                            {fileName}
                          </span>
                          {isDirectory && (
                            <Badge variant="outline" className="text-xs bg-green-100 text-green-800 border-green-300">
                              ZIP
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                            {progress}%
                          </span>
                          <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                        </div>
                      </div>
                      <Progress value={progress} className="h-2 bg-blue-100 dark:bg-gray-700" />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {isDirectory ? "Creating ZIP archive..." : "Downloading file..."}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Drag and Drop Overlay */}
      {isDragOver && (
        <div 
          className="fixed inset-0 bg-blue-500/20 backdrop-blur-sm z-50 flex items-center justify-center"
          onDragOver={handleDragOver}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Only dismiss when leaving the overlay entirely (not entering child elements)
            if (e.currentTarget === e.target) {
              setIsDragOver(false);
            }
          }}
          onDrop={handleDrop}
        >
          <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg border-2 border-blue-500 border-dashed text-center pointer-events-none">
            <Upload className="w-16 h-16 text-blue-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Drop files or folders here</h3>
            <p className="text-gray-600 dark:text-gray-400">Files and folders will be uploaded to the current directory</p>
          </div>
        </div>
      )}

      {/* File Preview Dialog */}
      {previewData && (
        <FilePreviewDialog
          isOpen={previewDialogOpen}
          onClose={() => {
            setPreviewDialogOpen(false);
            setPreviewData(null);
          }}
          fileUrl={previewData.url}
          fileName={previewData.fileName}
          fileExtension={previewData.fileExtension}
          contentType={previewData.contentType}
          fileSize={previewData.fileSize}
          userEmail={previewData.userEmail}
          timestamp={previewData.timestamp}
          onDownload={() => {
            const file = sortedFiles?.find(f => f.name === previewData.fileName);
            if (file) {
              handleDownload(file);
            }
          }}
        />
      )}

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setRenameDialogOpen(false);
          setItemToRename(null);
          setNewItemName("");
        }
      }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-rename">
          <DialogHeader>
            <DialogTitle>Rename {itemToRename?.type === 'directory' ? 'Folder' : 'File'}</DialogTitle>
            <DialogDescription>
              Enter a new name for "{itemToRename?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="newName" className="text-sm font-medium">
                New Name
              </label>
              <Input
                id="newName"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="Enter new name"
                data-testid="input-rename-name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newItemName.trim()) {
                    handleRenameSubmit();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setRenameDialogOpen(false);
                setItemToRename(null);
                setNewItemName("");
              }}
              data-testid="button-rename-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRenameSubmit}
              disabled={!newItemName.trim() || newItemName.trim() === itemToRename?.name || renameMutation.isPending}
              data-testid="button-rename-submit"
            >
              {renameMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Renaming...
                </>
              ) : (
                "Rename"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Folder Download Progress Overlay - NO ZIP! */}
      {folderDownloadProgress && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" data-testid="overlay-folder-download-progress">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-8 max-w-md w-full mx-4 border-2 border-green-500">
            <div className="flex flex-col items-center space-y-6">
              <div className="relative">
                <Loader2 className="w-20 h-20 text-green-600 animate-spin" />
                <Folder className="w-8 h-8 text-green-600 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {folderDownloadProgress.status === 'preparing' && 'Preparing Download'}
                  {folderDownloadProgress.status === 'downloading' && 'Downloading Files'}
                  {folderDownloadProgress.status === 'completed' && 'Download Complete!'}
                  {folderDownloadProgress.status === 'error' && 'Download Failed'}
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {formatBytes(folderDownloadProgress.bytesDownloaded)} of {formatBytes(folderDownloadProgress.totalBytes)} downloaded
                </p>
                <Progress 
                  value={(folderDownloadProgress.bytesDownloaded / folderDownloadProgress.totalBytes) * 100} 
                  className="h-2"
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>{folderDownloadProgress.downloadedFiles} of {folderDownloadProgress.totalFiles} files</span>
                  <span>{Math.round((folderDownloadProgress.bytesDownloaded / folderDownloadProgress.totalBytes) * 100)}%</span>
                </div>
                {folderDownloadProgress.currentFile && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-full">
                    Current: {folderDownloadProgress.currentFile}
                  </p>
                )}
                {folderDownloadProgress.failedFiles > 0 && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {folderDownloadProgress.failedFiles} files failed
                  </p>
                )}
                {folderDownloadProgress.status === 'downloading' && folderDownloadManager && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      folderDownloadManager.cancel();
                      setFolderDownloadProgress(null);
                      setFolderDownloadManager(null);
                    }}
                    className="mt-4"
                  >
                    Cancel Download
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Download Progress Overlay */}
      {bulkDownloadMutation.isPending && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" data-testid="overlay-bulk-download-progress">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-8 max-w-md w-full mx-4 border-2 border-blue-500">
            <div className="flex flex-col items-center space-y-6">
              <div className="relative">
                <Loader2 className="w-20 h-20 text-blue-600 animate-spin" />
                <Download className="w-8 h-8 text-blue-600 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  Preparing Download
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Creating ZIP archive with {selectedItems.size} selected {selectedItems.size === 1 ? 'item' : 'items'}...
                </p>
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                  Please wait, this may take a moment
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Decrypt Key Selection Dialog */}
      <Dialog open={decryptDialogOpen} onOpenChange={setDecryptDialogOpen}>
        <DialogContent className="sm:max-w-[450px]" data-testid="dialog-decrypt-key-selection">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-amber-600" />
              Select Decryption Key
            </DialogTitle>
            <DialogDescription>
              Choose which private key to use for decrypting this file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {fileToDecrypt && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-600 dark:text-gray-400">File to decrypt:</p>
                <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{fileToDecrypt.name}</p>
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Available Keys {!decryptKeysLoading && `(${availableDecryptKeys.length})`}
              </label>
              {decryptKeysLoading ? (
                <div className="flex items-center justify-center py-4" data-testid="loading-decrypt-keys">
                  <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
                  <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">Loading keys...</span>
                </div>
              ) : availableDecryptKeys.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center" data-testid="empty-decrypt-keys">
                  <KeyRound className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-2" />
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No private keys available</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    Please add a private key to your organization first.
                  </p>
                </div>
              ) : (
                <Select
                  value={selectedDecryptKeyId?.toString() || ""}
                  onValueChange={(value) => setSelectedDecryptKeyId(parseInt(value, 10))}
                >
                  <SelectTrigger className="w-full" data-testid="select-decrypt-key">
                    <SelectValue placeholder="Select a key..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDecryptKeys.map((key) => (
                      <SelectItem key={key.id} value={key.id.toString()} data-testid={`select-key-${key.id}`}>
                        <div className="flex items-center gap-2">
                          <KeyRound className="w-4 h-4 text-amber-500" />
                          <span>{key.keyName || `Key ${key.keyId}`}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-200 dark:border-amber-700">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                The decrypted file will be saved to the <strong>decrypted/</strong> folder, maintaining the original directory structure.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setDecryptDialogOpen(false);
                setFileToDecrypt(null);
                setSelectedDecryptKeyId(null);
              }}
              data-testid="button-cancel-decrypt"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDecrypt}
              disabled={!selectedDecryptKeyId || decryptKeysLoading || availableDecryptKeys.length === 0}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="button-confirm-decrypt"
            >
              <KeyRound className="w-4 h-4 mr-2" />
              Decrypt File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decryption Error Dialog */}
      <Dialog open={decryptErrorDialogOpen} onOpenChange={setDecryptErrorDialogOpen}>
        <DialogContent className="sm:max-w-[600px]" data-testid="dialog-decrypt-error">
          <DialogHeader>
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-1" />
              <div>
                <DialogTitle className="text-red-900 dark:text-red-100">
                  Decryption Failed
                </DialogTitle>
                <DialogDescription className="text-red-700 dark:text-red-300 mt-2">
                  {decryptError?.details || "Unable to decrypt the file with the selected key."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {decryptError && (
              <>
                <div className="bg-red-50 dark:bg-red-950/50 p-4 rounded-md border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-800 dark:text-red-200 font-medium mb-2">
                    Error Code: {decryptError.type}
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300 font-mono break-all">
                    {decryptError.message}
                  </p>
                </div>

                <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
                  {decryptError.fileName && (
                    <div>
                      <span className="font-medium">File:</span>{" "}
                      <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                        {decryptError.fileName}
                      </span>
                    </div>
                  )}
                  {decryptError.keyUsed && (
                    <div>
                      <span className="font-medium">Key Used:</span>{" "}
                      <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                        {decryptError.keyUsed}
                      </span>
                    </div>
                  )}
                </div>

                {decryptError.suggestions && decryptError.suggestions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      How to Resolve This:
                    </p>
                    <ul className="list-disc list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300">
                      {decryptError.suggestions.map((suggestion, index) => (
                        <li key={index}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {decryptError.type === "KEY_MISMATCH" && availableDecryptKeys.length > 1 && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
                    <p className="text-sm text-blue-900 dark:text-blue-100">
                      <strong>Tip:</strong> You have {availableDecryptKeys.length} decryption keys available. 
                      Try selecting a different key when attempting to decrypt this file again.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setDecryptErrorDialogOpen(false);
                setDecryptError(null);
              }}
              data-testid="button-close-decrypt-error"
            >
              Close
            </Button>
            {availableDecryptKeys.length > 1 && fileToDecrypt && (
              <Button
                onClick={() => {
                  setDecryptErrorDialogOpen(false);
                  setDecryptError(null);
                  setDecryptDialogOpen(true);
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white"
                data-testid="button-try-different-key"
              >
                <KeyRound className="w-4 h-4 mr-2" />
                Try Different Key
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* CORS Configuration Error Dialog */}
      <Dialog open={corsErrorDialogOpen} onOpenChange={setCorsErrorDialogOpen}>
        <DialogContent className="sm:max-w-[650px]" data-testid="dialog-cors-error">
          <DialogHeader>
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-1" />
              <div>
                <DialogTitle className="text-red-900 dark:text-red-100">
                  CORS Configuration Required
                </DialogTitle>
                <DialogDescription className="text-red-700 dark:text-red-300 mt-2">
                  Upload failed due to missing or incorrect CORS configuration on your Azure Storage Account.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg border-2 border-red-200 dark:border-red-700 p-4 space-y-3">
              <div className="text-sm text-red-900 dark:text-red-100 space-y-2">
                <p className="font-semibold">Error Details:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Storage Account: <span className="font-mono">{corsErrorDetails?.accountName}</span></li>
                  <li>Failed File: <span className="font-mono">{corsErrorDetails?.fileName}</span></li>
                  <li>Issue: CORS (Cross-Origin Resource Sharing) not configured</li>
                </ul>
              </div>
            </div>

            <div className="text-sm text-gray-800 dark:text-gray-200 space-y-3">
              <p className="font-semibold text-gray-900 dark:text-gray-100">How to Fix This:</p>
              <p className="leading-relaxed">
                Your Azure Storage Account needs to be configured to allow file uploads from this application's domain. 
                Follow these steps to configure CORS settings:
              </p>
              
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3 border border-gray-200 dark:border-gray-700">
                <p className="font-semibold text-gray-900 dark:text-gray-100">Option 1: Using Azure Portal</p>
                <ol className="list-decimal list-inside space-y-2 ml-2 text-sm">
                  <li>Go to your Azure Storage Account: <span className="font-mono bg-white dark:bg-gray-900 px-2 py-1 rounded">{corsErrorDetails?.accountName}</span></li>
                  <li>Navigate to <strong>Settings → Resource sharing (CORS)</strong></li>
                  <li>Select the <strong>Blob service</strong> tab</li>
                  <li>Click <strong>+ Add</strong> and configure:
                    <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
                      <li><strong>Allowed origins:</strong> {typeof window !== 'undefined' ? window.location.origin : '*'}</li>
                      <li><strong>Allowed methods:</strong> GET, PUT, POST, OPTIONS</li>
                      <li><strong>Allowed headers:</strong> *</li>
                      <li><strong>Exposed headers:</strong> *</li>
                      <li><strong>Max age:</strong> 3600</li>
                    </ul>
                  </li>
                  <li>Click <strong>Save</strong></li>
                </ol>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3 border border-gray-200 dark:border-gray-700">
                <p className="font-semibold text-gray-900 dark:text-gray-100">Option 2: Using Azure CLI</p>
                <div className="bg-gray-900 dark:bg-black rounded p-3 overflow-x-auto">
                  <code className="text-xs text-green-400 whitespace-pre">
{`az storage cors add \\
  --services b \\
  --methods GET PUT POST OPTIONS \\
  --origins "${typeof window !== 'undefined' ? window.location.origin : '*'}" \\
  --allowed-headers "*" \\
  --exposed-headers "*" \\
  --max-age 3600 \\
  --account-name ${corsErrorDetails?.accountName || 'YOUR_STORAGE_ACCOUNT'}`}
                  </code>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  <strong>Note:</strong> After configuring CORS, wait a few seconds for the changes to propagate, 
                  then try uploading your file again.
                </p>
              </div>

              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                For more information, visit the{' '}
                <a 
                  href="https://learn.microsoft.com/en-us/rest/api/storageservices/cross-origin-resource-sharing--cors--support-for-the-azure-storage-services" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline font-medium"
                  data-testid="link-cors-documentation"
                >
                  Azure Storage CORS documentation
                </a>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setCorsErrorDialogOpen(false);
                setCorsErrorDetails(null);
              }}
              className="w-full sm:w-auto"
              data-testid="button-close-cors-error"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Azure Role Assignment Error Dialog */}
      <Dialog open={azureRoleErrorDialogOpen} onOpenChange={setAzureRoleErrorDialogOpen}>
        <DialogContent className="sm:max-w-[700px]" data-testid="dialog-azure-role-error">
          <DialogHeader>
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-1" />
              <div>
                <DialogTitle className="text-red-900 dark:text-red-100">
                  Azure Role Assignment Required
                </DialogTitle>
                <DialogDescription className="text-red-700 dark:text-red-300 mt-2">
                  The App Service managed identity lacks permissions to access storage.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg border-2 border-red-200 dark:border-red-700 p-4 space-y-3">
              <div className="text-sm text-red-900 dark:text-red-100 space-y-2">
                <p className="font-semibold">Error Details:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Storage Account: <span className="font-mono">{azureRoleErrorDetails?.accountName}</span></li>
                  <li>Required Role: <span className="font-mono">{azureRoleErrorDetails?.azureRoleRequired}</span></li>
                  <li>Issue: Missing Azure RBAC role assignment</li>
                </ul>
              </div>
            </div>

            <div className="text-sm text-gray-800 dark:text-gray-200 space-y-3">
              <p className="font-semibold text-gray-900 dark:text-gray-100">{azureRoleErrorDetails?.message}</p>
              <p className="leading-relaxed text-gray-700 dark:text-gray-300">
                {azureRoleErrorDetails?.details}
              </p>
              
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3 border border-gray-200 dark:border-gray-700">
                <p className="font-semibold text-gray-900 dark:text-gray-100">Steps to Fix:</p>
                <ol className="list-decimal list-inside space-y-2 ml-2 text-sm">
                  {azureRoleErrorDetails?.instructions.map((instruction, index) => (
                    <li key={index} className="leading-relaxed">
                      {instruction.replace(/^\d+\.\s*/, '')}
                    </li>
                  ))}
                </ol>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  <strong>Note:</strong> After assigning the role, wait 1-2 minutes for Azure to propagate the permissions, 
                  then refresh this page to try again.
                </p>
              </div>

              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                For more information about Azure RBAC roles, visit the{' '}
                <a 
                  href="https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles#storage-blob-data-contributor" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline font-medium"
                  data-testid="link-azure-rbac-documentation"
                >
                  Azure RBAC documentation
                </a>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setAzureRoleErrorDialogOpen(false);
                setAzureRoleErrorDetails(null);
              }}
              className="w-full sm:w-auto"
              data-testid="button-close-azure-role-error"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Agent Progress Dialog */}
      <AIAgentProgressDialog
        isOpen={isProcessing}
        fileName={fileName}
        fileSize={fileSize}
        agentName={agentName}
        status={status}
      />
    </div>
  );
}