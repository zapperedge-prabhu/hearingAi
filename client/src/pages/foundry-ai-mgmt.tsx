import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useRolePermissions } from "@/hooks/use-role-permissions";
import { useAuth } from "@/hooks/use-auth";
import { useRole } from "@/contexts/role-context";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { 
  Plus, 
  RefreshCw, 
  Lock, 
  Cpu, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  Building,
  FolderOpen,
  Bot,
  Database,
  ArrowRight,
  ArrowLeft,
  Layers,
  Link2,
  Settings,
  List,
  Wand2,
  Files,
  File,
  Folder,
  Upload,
  Trash2,
  ChevronRight,
  ArrowUp,
  AlertTriangle,
  MessageSquare,
  Send,
  PlusCircle,
  User,
  Sparkles
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/spinner";
import { MarkdownMessage } from "@/components/markdown-message";

type FileItem = {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  lastModified?: string;
  metadata?: Record<string, string>;
};

type OrganizationStorageAccount = {
  id?: number;
  organizationId?: number;
  storageAccountName: string;
  containerName: string;
  accountType?: string;
};

type ResourceGroup = {
  name: string;
  location: string;
};

type Location = {
  name: string;
  displayName: string;
};

type FoundryConfig = {
  hubName: string;
  customSubdomain: string;
  resourceGroup: string;
  location: string;
  projectName: string;
  deploymentName: string;
  modelName: string;
  modelVersion: string;
  agentId: string;
  agentName: string;
  vectorStoreId: string;
  vectorStoreName: string;
  sharedAcrossOrgs: boolean;
};

const wizardSteps = [
  { id: 1, title: "Foundry Resource", icon: Cpu, description: "Create Azure AI Foundry Hub" },
  { id: 2, title: "Project", icon: FolderOpen, description: "Create Foundry project" },
  { id: 3, title: "Deployment", icon: Layers, description: "Deploy model with file search" },
  { id: 4, title: "Agent", icon: Bot, description: "Create AI agent" },
  { id: 5, title: "Vector Store", icon: Database, description: "Create vector store" },
  { id: 6, title: "Attach Tool", icon: Link2, description: "Attach file_search to agent" },
];

const hubSchema = z.object({
  hubName: z.string().min(1, "Hub name is required").max(64),
  customSubdomain: z.string().min(1, "Custom subdomain is required").max(64),
  resourceGroup: z.string().min(1, "Please select a resource group"),
  location: z.string().min(1, "Please select a location"),
});

const projectSchema = z.object({
  projectName: z.string().min(1, "Project name is required").max(64),
  displayName: z.string().min(1, "Display name is required").max(128),
});

const deploymentSchema = z.object({
  deploymentName: z.string().min(1, "Deployment name is required").max(64),
  modelName: z.string().min(1, "Please select a model"),
  modelVersion: z.string().min(1, "Please select a version"),
  skuName: z.string().default("GlobalStandard"),
  skuCapacity: z.number().default(10),
});

const agentSchema = z.object({
  agentName: z.string().min(1, "Agent name is required").max(64),
  instructions: z.string().min(1, "Instructions are required").max(1000),
});

const vectorStoreSchema = z.object({
  vectorStoreName: z.string().min(1, "Vector store name is required").max(64),
  expiresAfterDays: z.number().min(1).max(365).default(30),
});

export default function FoundryAiMgmt() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { selectedOrganizationId, selectedRole, availableRoles } = useRole();
  const [activeTab, setActiveTab] = useState("wizard");
  const [currentStep, setCurrentStep] = useState(1);
  const [config, setConfig] = useState<Partial<FoundryConfig>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [resourceFilters, setResourceFilters] = useState({
    resourceGroup: "",
    hubName: "",
    projectName: "",
    customSubdomain: "",
  });

  // Foundry Action tab state
  const [actionFilters, setActionFilters] = useState({
    resourceGroup: "",
    hubName: "",
    projectName: "",
    customSubdomain: "",
    agentId: "",
    vectorStoreId: "",
  });
  const [currentPath, setCurrentPath] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<"name" | "size" | "lastModified">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Chat Playground state
  type Citation = {
    index: number;
    marker: string;
    fileId?: string;
    filename?: string;
    quote?: string;
    sourceNumber?: string; // Extracted from marker like 【6:0†source】 -> "6"
  };

  type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: number;
    attachments?: { fileId: string; filename: string }[];
    citations?: Citation[];
  };

  type ChatFileAttachment = {
    fileId: string;
    filename: string;
    status: string;
    bytes?: number;
  };

  const [useOrgResourceSet, setUseOrgResourceSet] = useState(false);
  const [chatFilters, setChatFilters] = useState({
    resourceGroup: "",
    hubName: "",
    projectName: "",
    customSubdomain: "",
    agentId: "",
    vectorStoreId: "",
    deploymentName: "",
  });
  const [chatThreadId, setChatThreadId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatFileAttachments, setChatFileAttachments] = useState<ChatFileAttachment[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // Resource management dialogs state
  const [showAddDeploymentDialog, setShowAddDeploymentDialog] = useState(false);
  const [showAddVectorStoreDialog, setShowAddVectorStoreDialog] = useState(false);
  const [showAttachVectorStoreDialog, setShowAttachVectorStoreDialog] = useState(false);
  const [selectedAgentForAttach, setSelectedAgentForAttach] = useState<any>(null);
  const [newDeploymentName, setNewDeploymentName] = useState("");
  const [newDeploymentModel, setNewDeploymentModel] = useState("");
  const [newVectorStoreName, setNewVectorStoreName] = useState("");
  const [selectedVectorStoreForAttach, setSelectedVectorStoreForAttach] = useState("");
  
  // Delete resource state (type is defined later as FoundryResourceData)
  const [showDeleteResourceDialog, setShowDeleteResourceDialog] = useState(false);
  const [resourceToDelete, setResourceToDelete] = useState<any>(null);
  const [isDeletingResource, setIsDeletingResource] = useState(false);

  // Error dialog state - for displaying errors that require explicit user acknowledgment
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorDialogContent, setErrorDialogContent] = useState<{ title: string; message: string }>({ title: "", message: "" });

  // Content Understanding tab state
  const [contentUnderstandingConfig, setContentUnderstandingConfig] = useState({
    selectedResourceId: null as number | null,
    hubName: "",
    customSubdomain: "",
    resourceGroup: "",
    gpt41DeploymentName: "",
    gpt41MiniDeploymentName: "",
    embeddingDeploymentName: "",
    gpt41Deployed: false,
    gpt41MiniDeployed: false,
    embeddingDeployed: false,
  });
  const [isDeployingModels, setIsDeployingModels] = useState(false);
  const [deployingModelKey, setDeployingModelKey] = useState<'gpt41' | 'gpt41mini' | 'embedding' | null>(null);
  const [isCheckingDeployments, setIsCheckingDeployments] = useState(false);

  // Function to check existing deployments for a Foundry resource
  const checkExistingDeployments = async (resourceGroup: string, hubName: string) => {
    if (!resourceGroup || !hubName || !selectedOrganizationId) return;
    
    setIsCheckingDeployments(true);
    try {
      const response = await apiRequest("GET", `/api/foundry/deployments?organizationId=${selectedOrganizationId}&resourceGroup=${encodeURIComponent(resourceGroup)}&hubName=${encodeURIComponent(hubName)}`);
      const deployments = await response.json();
      
      if (Array.isArray(deployments)) {
        // Find deployments by model name
        const gpt41Deployment = deployments.find((d: any) => d.model?.name === "gpt-4.1");
        const gpt41MiniDeployment = deployments.find((d: any) => d.model?.name === "gpt-4.1-mini");
        const embeddingDeployment = deployments.find((d: any) => d.model?.name === "text-embedding-3-large");
        
        setContentUnderstandingConfig(prev => ({
          ...prev,
          gpt41Deployed: !!gpt41Deployment && gpt41Deployment.provisioningState === "Succeeded",
          gpt41MiniDeployed: !!gpt41MiniDeployment && gpt41MiniDeployment.provisioningState === "Succeeded",
          embeddingDeployed: !!embeddingDeployment && embeddingDeployment.provisioningState === "Succeeded",
          gpt41DeploymentName: gpt41Deployment?.name || prev.gpt41DeploymentName,
          gpt41MiniDeploymentName: gpt41MiniDeployment?.name || prev.gpt41MiniDeploymentName,
          embeddingDeploymentName: embeddingDeployment?.name || prev.embeddingDeploymentName,
        }));
        
        console.log("[CU Config] Existing deployments detected:", {
          gpt41: gpt41Deployment?.name,
          gpt41Mini: gpt41MiniDeployment?.name,
          embedding: embeddingDeployment?.name
        });
      }
    } catch (error) {
      console.error("[CU Config] Failed to check existing deployments:", error);
    } finally {
      setIsCheckingDeployments(false);
    }
  };

  // Resource Sets management state - now references foundry_resources
  type FoundryResourceSetData = {
    id: number;
    name: string;
    organizationId: number;
    foundryResourceId: number;
    defaultAgentId: string | null;
    defaultAgentName: string | null;
    defaultVectorStoreId: string | null;
    defaultVectorStoreName: string | null;
    status: string;
    notes: string | null;
    // Joined from foundry_resources table
    hubName?: string;
    projectName?: string;
    customSubdomain?: string;
    resourceName?: string;
    resourceGroup?: string;
    projectEndpoint?: string;
  };
  const [showResourceSetDialog, setShowResourceSetDialog] = useState(false);
  const [editingResourceSet, setEditingResourceSet] = useState<FoundryResourceSetData | null>(null);
  const [updatingResourceSharing, setUpdatingResourceSharing] = useState<Set<number>>(new Set());
  const [resourceSetFormData, setResourceSetFormData] = useState({
    name: "",
    organizationId: 0,
    foundryResourceId: 0,
    defaultAgentId: "",
    defaultVectorStoreId: "",
    notes: "",
  });

  const { data: rolePermissions, isLoading: permissionsLoading } = useRolePermissions();

  const canView = Boolean(rolePermissions?.foundryMgmt?.view);
  const canAdd = Boolean(rolePermissions?.foundryMgmt?.add);
  const canDelete = Boolean(rolePermissions?.foundryMgmt?.delete);
  
  // Tab visibility permissions
  const canViewWizardTab = Boolean(rolePermissions?.foundryMgmt?.tabWizard);
  const canViewResourcesTab = Boolean(rolePermissions?.foundryMgmt?.tabResources);
  const canViewFoundryActionTab = Boolean(rolePermissions?.foundryMgmt?.tabFoundryAction);
  const canViewChatPlaygroundTab = Boolean(rolePermissions?.foundryMgmt?.tabChatPlayground);
  const canViewResourceSetsTab = Boolean(rolePermissions?.foundryMgmt?.tabResourceSets);
  const canViewContentUnderstandingTab = Boolean(rolePermissions?.foundryMgmt?.tabContentUnderstanding);
  
  // Determine the first available tab for default selection
  const getFirstAvailableTab = useCallback(() => {
    if (canViewWizardTab) return "wizard";
    if (canViewResourcesTab) return "resources";
    if (canViewFoundryActionTab) return "action";
    if (canViewChatPlaygroundTab) return "chat";
    if (canViewResourceSetsTab) return "resourcesets";
    if (canViewContentUnderstandingTab) return "contentunderstanding";
    return "wizard"; // Fallback
  }, [canViewWizardTab, canViewResourcesTab, canViewFoundryActionTab, canViewChatPlaygroundTab, canViewResourceSetsTab, canViewContentUnderstandingTab]);

  // Set initial tab based on permissions when they load
  useEffect(() => {
    if (!permissionsLoading && rolePermissions) {
      const firstTab = getFirstAvailableTab();
      setActiveTab(firstTab);
    }
  }, [permissionsLoading, rolePermissions, getFirstAvailableTab]);

  // Extract unique organizations from user's available roles
  const userOrganizations = useMemo(() => {
    const orgMap = new Map<number, { id: number; name: string }>();
    availableRoles.forEach((role: { organizationId: number; organization?: { id: number; name: string } }) => {
      if (role.organization && !orgMap.has(role.organizationId)) {
        orgMap.set(role.organizationId, { id: role.organization.id, name: role.organization.name });
      }
    });
    return Array.from(orgMap.values());
  }, [availableRoles]);

  // Query for available foundry resources to select from when creating a resource set
  // Resources are org-scoped - each belongs to exactly one organization
  // Status progression: draft -> hub_created -> project_created -> agent_created -> vector_store_created -> completed | failed
  type FoundryResourceData = {
    id: number;
    resourceName: string;
    resourceGroup: string;
    location: string;
    hubName: string | null;
    customSubdomain: string | null;
    projectName: string | null;
    projectEndpoint: string | null;
    agentId: string | null;
    agentName: string | null;
    vectorStoreId: string | null;
    status: 'draft' | 'hub_created' | 'project_created' | 'agent_created' | 'vector_store_created' | 'completed' | 'failed' | string;
    currentStep: string | null;
    lastError: string | null;
    provisioningStartedAt: string | null;
    provisioningCompletedAt: string | null;
  };

  // Helper function to get status badge variant and label for granular status
  const getResourceStatusBadge = (resource: FoundryResourceData) => {
    const statusMap: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      'draft': { variant: 'secondary', label: 'Draft' },
      'hub_created': { variant: 'outline', label: 'Hub Created' },
      'project_created': { variant: 'outline', label: 'Project Created' },
      'agent_created': { variant: 'outline', label: 'Agent Created' },
      'vector_store_created': { variant: 'outline', label: 'Vector Store Created' },
      'completed': { variant: 'default', label: 'Active' },
      'failed': { variant: 'destructive', label: 'Failed' },
      'active': { variant: 'default', label: 'Active' }, // Legacy status
      'pending': { variant: 'secondary', label: 'Pending' }, // Legacy status
      'provisioning': { variant: 'secondary', label: 'Provisioning' }, // Legacy status
    };
    return statusMap[resource.status] || { variant: 'secondary' as const, label: resource.status };
  };

  // Check if a resource is partial (not completed) and can be deleted
  const isPartialResource = (resource: FoundryResourceData) => {
    return ['draft', 'hub_created', 'project_created', 'agent_created', 'vector_store_created', 'failed'].includes(resource.status);
  };
  const { data: availableFoundryResources = [], isLoading: foundryResourcesLoading, isFetching: foundryResourcesFetching, error: foundryResourcesError, refetch: refetchFoundryResources } = useQuery<FoundryResourceData[]>({
    queryKey: ["/api/foundry/resources"],
    queryFn: async () => {
      console.log("[FOUNDRY] Fetching resources from database...");
      const res = await apiRequest("GET", "/api/foundry/resources");
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: res.statusText }));
        console.error("[FOUNDRY] Failed to fetch resources:", res.status, errorData);
        throw new Error(errorData.error || `Failed to fetch resources: ${res.status}`);
      }
      const data = await res.json();
      console.log("[FOUNDRY] Fetched resources:", data.length, "items", data.map((r: any) => ({ id: r.id, name: r.resourceName, status: r.status })));
      return data;
    },
    enabled: showResourceSetDialog || activeTab === "resources",
  });
  
  // Use combined loading state to avoid race conditions
  const isResourcesLoading = foundryResourcesLoading || foundryResourcesFetching;

  // Get the selected foundry resource for agent/vector store queries
  const selectedFoundryResource = useMemo(() => {
    if (!resourceSetFormData.foundryResourceId) return null;
    return availableFoundryResources.find(r => r.id === resourceSetFormData.foundryResourceId) || null;
  }, [resourceSetFormData.foundryResourceId, availableFoundryResources]);

  // Query agents for resource set dialog based on selected foundry resource
  const { data: resourceSetAgentsList = [], isLoading: resourceSetAgentsLoading } = useQuery<any[]>({
    queryKey: ["/api/foundry/agents", selectedFoundryResource?.hubName, selectedFoundryResource?.projectName, selectedFoundryResource?.customSubdomain, "resourceset"],
    queryFn: async () => {
      if (!selectedFoundryResource?.hubName || !selectedFoundryResource?.projectName) return [];
      const projectNameOnly = selectedFoundryResource.projectName.includes("/") 
        ? selectedFoundryResource.projectName.split("/").pop() || selectedFoundryResource.projectName
        : selectedFoundryResource.projectName;
      const subdomain = selectedFoundryResource.customSubdomain || selectedFoundryResource.hubName;
      const res = await apiRequest("GET", `/api/foundry/agents?hubName=${encodeURIComponent(selectedFoundryResource.hubName)}&projectName=${encodeURIComponent(projectNameOnly)}&customSubdomain=${encodeURIComponent(subdomain)}`);
      return await res.json();
    },
    enabled: showResourceSetDialog && !!selectedFoundryResource?.hubName && !!selectedFoundryResource?.projectName,
  });

  // Query vector stores for resource set dialog based on selected foundry resource
  const { data: resourceSetVectorStoresList = [], isLoading: resourceSetVectorStoresLoading } = useQuery<any[]>({
    queryKey: ["/api/foundry/vector-stores", selectedFoundryResource?.hubName, selectedFoundryResource?.projectName, selectedFoundryResource?.customSubdomain, "resourceset"],
    queryFn: async () => {
      if (!selectedFoundryResource?.hubName || !selectedFoundryResource?.projectName) return [];
      const projectNameOnly = selectedFoundryResource.projectName.includes("/") 
        ? selectedFoundryResource.projectName.split("/").pop() || selectedFoundryResource.projectName
        : selectedFoundryResource.projectName;
      const subdomain = selectedFoundryResource.customSubdomain || selectedFoundryResource.hubName;
      const res = await apiRequest("GET", `/api/foundry/vector-stores?hubName=${encodeURIComponent(selectedFoundryResource.hubName)}&projectName=${encodeURIComponent(projectNameOnly)}&customSubdomain=${encodeURIComponent(subdomain)}`);
      return await res.json();
    },
    enabled: showResourceSetDialog && !!selectedFoundryResource?.hubName && !!selectedFoundryResource?.projectName,
  });

  const { data: resourceGroups = [], isLoading: rgLoading } = useQuery<ResourceGroup[]>({
    queryKey: ["/api/foundry/resource-groups"],
    enabled: canAdd,
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/foundry/locations"],
    enabled: canAdd,
  });

  const { data: hubsList = [], isLoading: hubsLoading, refetch: refetchHubs } = useQuery<any[]>({
    queryKey: ["/api/foundry/hubs", resourceFilters.resourceGroup],
    queryFn: async () => {
      if (!resourceFilters.resourceGroup) return [];
      const res = await apiRequest("GET", `/api/foundry/hubs?resourceGroup=${encodeURIComponent(resourceFilters.resourceGroup)}`);
      return await res.json();
    },
    enabled: canView && activeTab === "resources" && !!resourceFilters.resourceGroup,
  });

  const { data: projectsList = [], isLoading: projectsLoading, refetch: refetchProjects } = useQuery<any[]>({
    queryKey: ["/api/foundry/projects", resourceFilters.resourceGroup, resourceFilters.hubName],
    queryFn: async () => {
      if (!resourceFilters.resourceGroup || !resourceFilters.hubName) return [];
      const res = await apiRequest("GET", `/api/foundry/projects?resourceGroup=${encodeURIComponent(resourceFilters.resourceGroup)}&hubName=${encodeURIComponent(resourceFilters.hubName)}`);
      return await res.json();
    },
    enabled: canView && activeTab === "resources" && !!resourceFilters.resourceGroup && !!resourceFilters.hubName,
  });

  const { data: deploymentsList = [], isLoading: deploymentsLoading, refetch: refetchDeployments } = useQuery<any[]>({
    queryKey: ["/api/foundry/deployments", resourceFilters.resourceGroup, resourceFilters.hubName],
    queryFn: async () => {
      if (!resourceFilters.resourceGroup || !resourceFilters.hubName) return [];
      const res = await apiRequest("GET", `/api/foundry/deployments?resourceGroup=${encodeURIComponent(resourceFilters.resourceGroup)}&hubName=${encodeURIComponent(resourceFilters.hubName)}`);
      return await res.json();
    },
    enabled: canView && activeTab === "resources" && !!resourceFilters.resourceGroup && !!resourceFilters.hubName,
  });

  const { data: agentsList = [], isLoading: agentsLoading, refetch: refetchAgents } = useQuery<any[]>({
    queryKey: ["/api/foundry/agents", resourceFilters.hubName, resourceFilters.projectName, resourceFilters.customSubdomain],
    queryFn: async () => {
      if (!resourceFilters.hubName || !resourceFilters.projectName) return [];
      // Project name comes as "hubName/projectName", extract just the project part
      const projectNameOnly = resourceFilters.projectName.includes("/") 
        ? resourceFilters.projectName.split("/").pop() || resourceFilters.projectName
        : resourceFilters.projectName;
      // Use customSubdomain if available for correct endpoint
      const subdomain = resourceFilters.customSubdomain || resourceFilters.hubName;
      const res = await apiRequest("GET", `/api/foundry/agents?hubName=${encodeURIComponent(resourceFilters.hubName)}&projectName=${encodeURIComponent(projectNameOnly)}&customSubdomain=${encodeURIComponent(subdomain)}`);
      return await res.json();
    },
    enabled: canView && activeTab === "resources" && !!resourceFilters.hubName && !!resourceFilters.projectName,
  });

  const { data: vectorStoresList = [], isLoading: vectorStoresLoading, refetch: refetchVectorStores } = useQuery<any[]>({
    queryKey: ["/api/foundry/vector-stores", resourceFilters.hubName, resourceFilters.projectName, resourceFilters.customSubdomain],
    queryFn: async () => {
      if (!resourceFilters.hubName || !resourceFilters.projectName) return [];
      // Project name comes as "hubName/projectName", extract just the project part
      const projectNameOnly = resourceFilters.projectName.includes("/") 
        ? resourceFilters.projectName.split("/").pop() || resourceFilters.projectName
        : resourceFilters.projectName;
      // Use customSubdomain if available for correct endpoint
      const subdomain = resourceFilters.customSubdomain || resourceFilters.hubName;
      const res = await apiRequest("GET", `/api/foundry/vector-stores?hubName=${encodeURIComponent(resourceFilters.hubName)}&projectName=${encodeURIComponent(projectNameOnly)}&customSubdomain=${encodeURIComponent(subdomain)}`);
      return await res.json();
    },
    enabled: canView && activeTab === "resources" && !!resourceFilters.hubName && !!resourceFilters.projectName,
  });

  // ============ FOUNDRY ACTION TAB QUERIES ============

  // Org-linked resources: Resources linked to this organization via resource_sets
  // Used to filter what resources are shown in Chat Playground and Foundry Action tabs
  const { data: orgLinkedResources = [], isLoading: orgLinkedResourcesLoading } = useQuery<FoundryResourceData[]>({
    queryKey: ["/api/foundry/org-resources", selectedOrganizationId],
    queryFn: async () => {
      if (!selectedOrganizationId) return [];
      const res = await apiRequest("GET", `/api/foundry/org-resources?organizationId=${selectedOrganizationId}`);
      return await res.json();
    },
    enabled: !!selectedOrganizationId && (activeTab === "action" || activeTab === "chat" || activeTab === "contentunderstanding"),
  });

  // Derive unique resource groups from org-linked resources for filtering
  const orgResourceGroups = useMemo(() => {
    const groups = new Set(orgLinkedResources.map(r => r.resourceGroup));
    return Array.from(groups).map(name => ({ name }));
  }, [orgLinkedResources]);

  // Hub metadata map - derives resourceGroup and customSubdomain from hubName
  // Since hub names are globally unique, we can use this to get the associated metadata
  const hubMetadataByName = useMemo(() => {
    const map = new Map<string, { resourceGroup: string; customSubdomain: string }>();
    orgLinkedResources.forEach(r => {
      if (!map.has(r.resourceName)) {
        const subdomain = r.customSubdomain || 
          r.projectEndpoint?.replace("https://", "").replace(".cognitiveservices.azure.com/", "").replace(/\/$/, "") || 
          r.resourceName;
        map.set(r.resourceName, { 
          resourceGroup: r.resourceGroup, 
          customSubdomain: subdomain 
        });
      }
    });
    return map;
  }, [orgLinkedResources]);

  // Filter action/chat hubs/projects based on org-linked resources
  // Hub names are globally unique, so we don't need to filter by resourceGroup
  const getOrgLinkedHubs = () => {
    // Return unique hubs from org-linked resources
    const uniqueHubs = new Map<string, { name: string; resourceName: string; resourceGroup: string }>();
    orgLinkedResources.forEach(r => {
      if (!uniqueHubs.has(r.resourceName)) {
        uniqueHubs.set(r.resourceName, { name: r.resourceName, resourceName: r.resourceName, resourceGroup: r.resourceGroup });
      }
    });
    return Array.from(uniqueHubs.values());
  };

  // Get projects for a hub (hub names are globally unique)
  const getOrgLinkedProjects = (hubName: string) => {
    return orgLinkedResources
      .filter(r => r.resourceName === hubName && r.projectName)
      .map(r => ({ name: r.projectName, projectName: r.projectName }));
  };

  // Effect to synchronize resourceGroup and customSubdomain when chatFilters.hubName changes
  useEffect(() => {
    if (!chatFilters.hubName) {
      // If hub is cleared, clear resourceGroup and customSubdomain
      if (chatFilters.resourceGroup || chatFilters.customSubdomain) {
        setChatFilters(prev => ({
          ...prev,
          resourceGroup: "",
          customSubdomain: "",
        }));
      }
      return;
    }
    
    const metadata = hubMetadataByName.get(chatFilters.hubName);
    if (metadata) {
      // Only update if values differ to avoid infinite loops
      if (chatFilters.resourceGroup !== metadata.resourceGroup || 
          chatFilters.customSubdomain !== metadata.customSubdomain) {
        setChatFilters(prev => ({
          ...prev,
          resourceGroup: metadata.resourceGroup,
          customSubdomain: metadata.customSubdomain,
        }));
      }
    }
  }, [chatFilters.hubName, hubMetadataByName]);

  // Effect to synchronize resourceGroup and customSubdomain when actionFilters.hubName changes
  useEffect(() => {
    if (!actionFilters.hubName) {
      // If hub is cleared, clear resourceGroup and customSubdomain
      if (actionFilters.resourceGroup || actionFilters.customSubdomain) {
        setActionFilters(prev => ({
          ...prev,
          resourceGroup: "",
          customSubdomain: "",
        }));
      }
      return;
    }
    
    const metadata = hubMetadataByName.get(actionFilters.hubName);
    if (metadata) {
      // Only update if values differ to avoid infinite loops
      if (actionFilters.resourceGroup !== metadata.resourceGroup || 
          actionFilters.customSubdomain !== metadata.customSubdomain) {
        setActionFilters(prev => ({
          ...prev,
          resourceGroup: metadata.resourceGroup,
          customSubdomain: metadata.customSubdomain,
        }));
      }
    }
  }, [actionFilters.hubName, hubMetadataByName]);

  // Organization storage account for file browser
  const { data: orgStorageAccount, isLoading: storageLoading, error: storageError } = useQuery<OrganizationStorageAccount>({
    queryKey: [`/api/organizations/${selectedOrganizationId}/storage-account`],
    enabled: !!selectedOrganizationId && activeTab === "action",
    retry: false,
    refetchOnWindowFocus: false,
  });

  const hasStorageConfigured = !!orgStorageAccount && !storageError;
  const isStorageNotFound = storageError?.message?.includes('404') || storageError?.message?.includes('No storage account configured');

  // Note: Hub and Project lists for action tab now use local data from getOrgLinkedHubs() and getOrgLinkedProjects()
  // since hub names are globally unique, we don't need to query the API for these

  // Agents list for action tab
  const { data: actionAgentsList = [], isLoading: actionAgentsLoading } = useQuery<any[]>({
    queryKey: ["/api/foundry/agents", actionFilters.hubName, actionFilters.projectName, actionFilters.customSubdomain, "action"],
    queryFn: async () => {
      if (!actionFilters.hubName || !actionFilters.projectName) return [];
      const projectNameOnly = actionFilters.projectName.includes("/") 
        ? actionFilters.projectName.split("/").pop() || actionFilters.projectName
        : actionFilters.projectName;
      const subdomain = actionFilters.customSubdomain || actionFilters.hubName;
      const res = await apiRequest("GET", `/api/foundry/agents?hubName=${encodeURIComponent(actionFilters.hubName)}&projectName=${encodeURIComponent(projectNameOnly)}&customSubdomain=${encodeURIComponent(subdomain)}`);
      return await res.json();
    },
    enabled: canView && activeTab === "action" && !!actionFilters.hubName && !!actionFilters.projectName,
  });

  // Vector stores list for action tab
  const { data: actionVectorStoresList = [], isLoading: actionVectorStoresLoading } = useQuery<any[]>({
    queryKey: ["/api/foundry/vector-stores", actionFilters.hubName, actionFilters.projectName, actionFilters.customSubdomain, "action"],
    queryFn: async () => {
      if (!actionFilters.hubName || !actionFilters.projectName) return [];
      const projectNameOnly = actionFilters.projectName.includes("/") 
        ? actionFilters.projectName.split("/").pop() || actionFilters.projectName
        : actionFilters.projectName;
      const subdomain = actionFilters.customSubdomain || actionFilters.hubName;
      const res = await apiRequest("GET", `/api/foundry/vector-stores?hubName=${encodeURIComponent(actionFilters.hubName)}&projectName=${encodeURIComponent(projectNameOnly)}&customSubdomain=${encodeURIComponent(subdomain)}`);
      return await res.json();
    },
    enabled: canView && activeTab === "action" && !!actionFilters.hubName && !!actionFilters.projectName,
  });

  // ============ CHAT PLAYGROUND TAB QUERIES ============
  // Note: Hub and Project lists for chat tab now use local data from getOrgLinkedHubs() and getOrgLinkedProjects()
  // since hub names are globally unique, we don't need to query the API for these

  // Agents list for chat tab
  const { data: chatAgentsList = [], isLoading: chatAgentsLoading } = useQuery<any[]>({
    queryKey: ["/api/foundry/agents", chatFilters.hubName, chatFilters.projectName, chatFilters.customSubdomain, "chat"],
    queryFn: async () => {
      if (!chatFilters.hubName || !chatFilters.projectName) return [];
      const projectNameOnly = chatFilters.projectName.includes("/") 
        ? chatFilters.projectName.split("/").pop() || chatFilters.projectName
        : chatFilters.projectName;
      const subdomain = chatFilters.customSubdomain || chatFilters.hubName;
      const res = await apiRequest("GET", `/api/foundry/agents?hubName=${encodeURIComponent(chatFilters.hubName)}&projectName=${encodeURIComponent(projectNameOnly)}&customSubdomain=${encodeURIComponent(subdomain)}`);
      return await res.json();
    },
    enabled: canView && activeTab === "chat" && !!chatFilters.hubName && !!chatFilters.projectName,
  });

  // Vector stores list for chat tab
  const { data: chatVectorStoresList = [], isLoading: chatVectorStoresLoading } = useQuery<any[]>({
    queryKey: ["/api/foundry/vector-stores", chatFilters.hubName, chatFilters.projectName, chatFilters.customSubdomain, "chat"],
    queryFn: async () => {
      if (!chatFilters.hubName || !chatFilters.projectName) return [];
      const projectNameOnly = chatFilters.projectName.includes("/") 
        ? chatFilters.projectName.split("/").pop() || chatFilters.projectName
        : chatFilters.projectName;
      const subdomain = chatFilters.customSubdomain || chatFilters.hubName;
      const res = await apiRequest("GET", `/api/foundry/vector-stores?hubName=${encodeURIComponent(chatFilters.hubName)}&projectName=${encodeURIComponent(projectNameOnly)}&customSubdomain=${encodeURIComponent(subdomain)}`);
      return await res.json();
    },
    enabled: canView && activeTab === "chat" && !!chatFilters.hubName && !!chatFilters.projectName,
  });

  // Deployments list for chat tab (to select model)
  const { data: chatDeploymentsList = [], isLoading: chatDeploymentsLoading } = useQuery<any[]>({
    queryKey: ["/api/foundry/deployments", chatFilters.resourceGroup, chatFilters.hubName, "chat"],
    queryFn: async () => {
      if (!chatFilters.resourceGroup || !chatFilters.hubName) return [];
      const res = await apiRequest("GET", `/api/foundry/deployments?resourceGroup=${encodeURIComponent(chatFilters.resourceGroup)}&hubName=${encodeURIComponent(chatFilters.hubName)}`);
      return await res.json();
    },
    enabled: canView && activeTab === "chat" && !!chatFilters.resourceGroup && !!chatFilters.hubName,
  });

  // Build file API URL helper
  const buildFileApiUrl = (base: string, params: Record<string, any>) => {
    const url = new URL(base, window.location.origin);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });
    return url.pathname + url.search;
  };

  // Files list for action tab
  const { data: filesList = [], isLoading: filesLoading, refetch: refetchFiles, error: filesError } = useQuery<FileItem[]>({
    queryKey: [buildFileApiUrl('/api/files', { organizationId: selectedOrganizationId, path: currentPath })],
    enabled: hasStorageConfigured && !!selectedOrganizationId && activeTab === "action",
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Sort files
  const sortedFiles = useMemo(() => {
    if (!filesList || !Array.isArray(filesList)) return [];
    return [...filesList].sort((a, b) => {
      // Folders always come first
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      
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
    });
  }, [filesList, sortField, sortDirection]);

  // Add file to vector store mutation
  const addToVectorStoreMutation = useMutation({
    mutationFn: async ({ filePath, vectorStoreId }: { filePath: string; vectorStoreId: string }) => {
      const subdomain = actionFilters.customSubdomain || actionFilters.hubName;
      return await apiRequest("POST", "/api/foundry/vector-store-files", {
        organizationId: selectedOrganizationId,
        filePath,
        vectorStoreId,
        customSubdomain: subdomain,
        hubName: actionFilters.hubName,
        projectName: actionFilters.projectName,
        agentId: actionFilters.agentId,
      });
    },
    onSuccess: async () => {
      toast({ title: "Success", description: "File added to vector store successfully" });
      setSelectedFiles(new Set());
      await refetchFiles();
    },
    onError: (error: any) => {
      // Show error in modal dialog that requires explicit user acknowledgment
      setErrorDialogContent({
        title: "Failed to Add File to Vector Store",
        message: error.message || "An unexpected error occurred while adding the file to the vector store.",
      });
      setShowErrorDialog(true);
    },
  });

  // Remove file from vector store mutation
  const removeFromVectorStoreMutation = useMutation({
    mutationFn: async ({ filePath, vectorStoreId }: { filePath: string; vectorStoreId: string }) => {
      const subdomain = actionFilters.customSubdomain || actionFilters.hubName;
      return await apiRequest("DELETE", "/api/foundry/vector-store-files", {
        organizationId: selectedOrganizationId,
        filePath,
        vectorStoreId,
        customSubdomain: subdomain,
        hubName: actionFilters.hubName,
        projectName: actionFilters.projectName,
        agentId: actionFilters.agentId,
      });
    },
    onSuccess: async () => {
      toast({ title: "Success", description: "File removed from vector store successfully" });
      setSelectedFiles(new Set());
      await refetchFiles();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove file from vector store",
        variant: "destructive",
      });
    },
  });

  // Add deployment from Resources tab mutation
  const addDeploymentMutation = useMutation({
    mutationFn: async ({ deploymentName, modelName }: { deploymentName: string; modelName: string }) => {
      return await apiRequest("POST", "/api/foundry/deployments", {
        organizationId: selectedOrganizationId,
        resourceGroup: resourceFilters.resourceGroup,
        hubName: resourceFilters.hubName,
        deploymentName,
        modelName,
      });
    },
    onSuccess: async () => {
      toast({ title: "Success", description: "Deployment created successfully" });
      setShowAddDeploymentDialog(false);
      setNewDeploymentName("");
      setNewDeploymentModel("");
      await refetchDeployments();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create deployment",
        variant: "destructive",
      });
    },
  });

  // Add vector store from Resources tab mutation
  const addVectorStoreMutation = useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      const projectNameOnly = resourceFilters.projectName.includes("/") 
        ? resourceFilters.projectName.split("/").pop() || resourceFilters.projectName
        : resourceFilters.projectName;
      const subdomain = resourceFilters.customSubdomain || resourceFilters.hubName;
      return await apiRequest("POST", "/api/foundry/vector-stores", {
        hubName: resourceFilters.hubName,
        projectName: projectNameOnly,
        customSubdomain: subdomain,
        vectorStoreName: name,
      });
    },
    onSuccess: async () => {
      toast({ title: "Success", description: "Vector store created successfully" });
      setShowAddVectorStoreDialog(false);
      setNewVectorStoreName("");
      await refetchVectorStores();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create vector store",
        variant: "destructive",
      });
    },
  });

  // Attach vector store to agent mutation
  const attachVectorStoreToAgentMutation = useMutation({
    mutationFn: async ({ agentId, vectorStoreId }: { agentId: string; vectorStoreId: string }) => {
      const projectNameOnly = resourceFilters.projectName.includes("/") 
        ? resourceFilters.projectName.split("/").pop() || resourceFilters.projectName
        : resourceFilters.projectName;
      const subdomain = resourceFilters.customSubdomain || resourceFilters.hubName;
      return await apiRequest("POST", "/api/foundry/attach-tool", {
        hubName: resourceFilters.hubName,
        projectName: projectNameOnly,
        customSubdomain: subdomain,
        agentId,
        vectorStoreId,
      });
    },
    onSuccess: async () => {
      toast({ title: "Success", description: "Vector store attached to agent successfully" });
      setShowAttachVectorStoreDialog(false);
      setSelectedAgentForAttach(null);
      setSelectedVectorStoreForAttach("");
      await refetchAgents();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to attach vector store to agent",
        variant: "destructive",
      });
    },
  });

  // File browser helpers
  const handleNavigateToFolder = (path: string) => {
    setCurrentPath(path);
    setSelectedFiles(new Set());
  };

  const handleNavigateBack = () => {
    if (currentPath) {
      const parts = currentPath.split("/").filter(Boolean);
      parts.pop();
      setCurrentPath(parts.join("/"));
      setSelectedFiles(new Set());
    }
  };

  const handleSelectFile = (filePath: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(filePath)) {
        newSet.delete(filePath);
      } else {
        newSet.add(filePath);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedFiles.size === sortedFiles.filter(f => f.type === "file").length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(sortedFiles.filter(f => f.type === "file").map(f => f.path)));
    }
  };

  const handleSort = (field: "name" | "size" | "lastModified") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const formatFileSize = (bytes: number | undefined) => {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const breadcrumbParts = currentPath ? currentPath.split("/").filter(Boolean) : [];

  // Check if file is in current vector store based on metadata
  const isFileInVectorStore = (file: FileItem) => {
    if (!file.metadata || !actionFilters.vectorStoreId) return false;
    // Backend stores metadata key in lowercase: foundryvectorstores
    const vectorStores = file.metadata.foundryvectorstores;
    if (!vectorStores) return false;
    try {
      const stores = JSON.parse(vectorStores);
      return stores.some((s: any) => s.vectorStoreId === actionFilters.vectorStoreId);
    } catch {
      return false;
    }
  };

  // Compute bulk selection status: 'all-added', 'all-not-added', 'mixed', or 'none'
  const getSelectionStatus = (): 'all-added' | 'all-not-added' | 'mixed' | 'none' => {
    if (selectedFiles.size === 0) return 'none';
    
    const selectedFilesList = sortedFiles.filter(f => f.type === "file" && selectedFiles.has(f.path));
    if (selectedFilesList.length === 0) return 'none';
    
    let addedCount = 0;
    let notAddedCount = 0;
    
    for (const file of selectedFilesList) {
      if (isFileInVectorStore(file)) {
        addedCount++;
      } else {
        notAddedCount++;
      }
    }
    
    if (addedCount > 0 && notAddedCount > 0) return 'mixed';
    if (addedCount > 0) return 'all-added';
    return 'all-not-added';
  };

  const selectionStatus = getSelectionStatus();

  const hubForm = useForm<z.infer<typeof hubSchema>>({
    resolver: zodResolver(hubSchema),
    defaultValues: {
      hubName: "",
      customSubdomain: "",
      resourceGroup: "",
      location: "",
    },
  });

  const projectForm = useForm<z.infer<typeof projectSchema>>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      projectName: "",
      displayName: "",
    },
  });

  const deploymentForm = useForm<z.infer<typeof deploymentSchema>>({
    resolver: zodResolver(deploymentSchema),
    defaultValues: {
      deploymentName: "gpt4o-deployment",
      modelName: "gpt-4o",
      modelVersion: "2024-08-06",
      skuName: "GlobalStandard",
      skuCapacity: 10,
    },
  });

  const agentForm = useForm<z.infer<typeof agentSchema>>({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      agentName: "",
      instructions: "You are a helpful assistant that uses file search to answer questions.",
    },
  });

  const vectorStoreForm = useForm<z.infer<typeof vectorStoreSchema>>({
    resolver: zodResolver(vectorStoreSchema),
    defaultValues: {
      vectorStoreName: "",
      expiresAfterDays: 30,
    },
  });

  const createHubMutation = useMutation({
    mutationFn: async (data: z.infer<typeof hubSchema>) => {
      // Include organizationId to create a trackable database record
      return await apiRequest("POST", "/api/foundry/hubs", {
        resourceGroup: data.resourceGroup,
        hubName: data.hubName,
        location: data.location,
        customSubdomain: data.customSubdomain,
        organizationId: selectedOrganizationId,
      });
    },
    onSuccess: (_, variables) => {
      toast({ title: "Success", description: "Foundry Hub created successfully" });
      setConfig(prev => ({
        ...prev,
        hubName: variables.hubName,
        customSubdomain: variables.customSubdomain,
        resourceGroup: variables.resourceGroup,
        location: variables.location,
      }));
      // Refresh the resources list to show the new hub (now tracked in database)
      refetchFoundryResources();
      setCurrentStep(2);
    },
    onError: (error: any) => {
      // Refresh resources even on error - a draft record may have been created
      refetchFoundryResources();
      toast({
        title: "Error",
        description: error.message || "Failed to create Foundry Hub",
        variant: "destructive",
      });
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: z.infer<typeof projectSchema>) => {
      return await apiRequest("POST", "/api/foundry/projects", {
        resourceGroup: config.resourceGroup,
        hubName: config.hubName,
        projectName: data.projectName,
        displayName: data.displayName,
        location: config.location,
      });
    },
    onSuccess: (_, variables) => {
      toast({ title: "Success", description: "Project created successfully" });
      setConfig(prev => ({
        ...prev,
        projectName: variables.projectName,
      }));
      // Refresh the resources list to show the updated status
      refetchFoundryResources();
      setCurrentStep(3);
    },
    onError: (error: any) => {
      refetchFoundryResources();
      toast({
        title: "Error",
        description: error.message || "Failed to create project",
        variant: "destructive",
      });
    },
  });

  const createDeploymentMutation = useMutation({
    mutationFn: async (data: z.infer<typeof deploymentSchema>) => {
      return await apiRequest("POST", "/api/foundry/deployments", {
        organizationId: selectedOrganizationId,
        resourceGroup: config.resourceGroup,
        hubName: config.hubName,
        deploymentName: data.deploymentName,
        modelName: data.modelName,
        modelVersion: data.modelVersion,
        modelFormat: "OpenAI",
        skuName: data.skuName,
        skuCapacity: data.skuCapacity,
      });
    },
    onSuccess: (_, variables) => {
      toast({ title: "Success", description: "Model deployed successfully" });
      setConfig(prev => ({
        ...prev,
        deploymentName: variables.deploymentName,
        modelName: variables.modelName,
        modelVersion: variables.modelVersion,
      }));
      setCurrentStep(4);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to deploy model",
        variant: "destructive",
      });
    },
  });

  const createAgentMutation = useMutation({
    mutationFn: async (data: z.infer<typeof agentSchema>) => {
      const response = await apiRequest("POST", "/api/foundry/agents", {
        hubName: config.hubName,
        projectName: config.projectName,
        agentName: data.agentName,
        deploymentName: config.deploymentName,
        instructions: data.instructions,
        tools: [{ type: "code_interpreter" }],
        customSubdomain: config.customSubdomain,
      });
      return await response.json();
    },
    onSuccess: (data: any, variables) => {
      toast({ title: "Success", description: "Agent created successfully" });
      setConfig(prev => ({
        ...prev,
        agentId: data.agentId,
        agentName: variables.agentName,
      }));
      // Refresh the resources list to show the updated status
      refetchFoundryResources();
      setCurrentStep(5);
    },
    onError: (error: any) => {
      refetchFoundryResources();
      toast({
        title: "Error",
        description: error.message || "Failed to create agent",
        variant: "destructive",
      });
    },
  });

  const createVectorStoreMutation = useMutation({
    mutationFn: async (data: z.infer<typeof vectorStoreSchema>) => {
      const response = await apiRequest("POST", "/api/foundry/vector-stores", {
        projectName: config.projectName,
        vectorStoreName: data.vectorStoreName,
        customSubdomain: config.customSubdomain,
        expiresAfterDays: data.expiresAfterDays,
        metadata: { purpose: "file-search" },
        hubName: config.hubName, // Pass hubName to update database record
      });
      return await response.json();
    },
    onSuccess: (data: any, variables) => {
      toast({ title: "Success", description: "Vector store created successfully" });
      setConfig(prev => ({
        ...prev,
        vectorStoreId: data.vectorStoreId,
        vectorStoreName: variables.vectorStoreName,
      }));
      // Refresh the resources list to show the completed resource
      refetchFoundryResources();
      setCurrentStep(6);
    },
    onError: (error: any) => {
      refetchFoundryResources();
      toast({
        title: "Error",
        description: error.message || "Failed to create vector store",
        variant: "destructive",
      });
    },
  });

  const attachToolMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/foundry/agents/${config.agentId}`, {
        projectName: config.projectName,
        customSubdomain: config.customSubdomain,
        tools: [{ type: "file_search" }],
        tool_resources: {
          file_search: {
            vector_store_ids: [config.vectorStoreId],
          },
        },
      });
    },
    onSuccess: () => {
      toast({ 
        title: "Success", 
        description: "File search tool attached to agent successfully! Configuration complete." 
      });
      // Save the completed configuration to foundry_resources table
      saveFoundryResourceMutation.mutate();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to attach tool to agent",
        variant: "destructive",
      });
    },
  });

  // Mutation to save completed wizard configuration to foundry_resources table
  // Uses upsert pattern: checks for existing resource first, then updates or creates
  const saveFoundryResourceMutation = useMutation({
    mutationFn: async () => {
      console.log("[DEBUG saveFoundryResourceMutation] Config state:", JSON.stringify(config, null, 2));
      console.log("[DEBUG saveFoundryResourceMutation] selectedOrganizationId:", selectedOrganizationId);
      
      // Validate required fields before saving
      if (!config.resourceGroup || !config.location || !config.hubName || !config.projectName) {
        console.error("[DEBUG saveFoundryResourceMutation] Missing required fields:", {
          resourceGroup: config.resourceGroup,
          location: config.location,
          hubName: config.hubName,
          projectName: config.projectName,
        });
        throw new Error("Missing required configuration fields. Please complete all wizard steps.");
      }
      if (!selectedOrganizationId) {
        throw new Error("Please select an organization before saving the resource.");
      }
      
      const payload = {
        organizationId: selectedOrganizationId,
        resourceName: config.hubName,
        resourceGroup: config.resourceGroup,
        location: config.location,
        hubName: config.hubName,
        customSubdomain: config.customSubdomain,
        projectName: config.projectName,
        projectEndpoint: config.customSubdomain ? `https://${config.customSubdomain}.services.ai.azure.com` : null,
        agentId: config.agentId,
        agentName: config.agentName,
        vectorStoreId: config.vectorStoreId,
        sharedAcrossOrgs: config.sharedAcrossOrgs ?? false,
        status: "completed",
      };
      
      // First, check if a resource with this name already exists (created during wizard steps)
      // Fetch fresh resources list to ensure we have latest data (in case cache is stale)
      let existingResource = availableFoundryResources.find(
        r => r.resourceName === config.hubName || r.hubName === config.hubName
      );
      
      // If not found in cache, fetch fresh from API to be certain
      if (!existingResource) {
        try {
          const freshRes = await apiRequest("GET", "/api/foundry/resources");
          if (freshRes.ok) {
            const freshResources: FoundryResourceData[] = await freshRes.json();
            existingResource = freshResources.find(
              r => r.resourceName === config.hubName || r.hubName === config.hubName
            );
            console.log("[DEBUG saveFoundryResourceMutation] Fresh fetch found resource:", existingResource?.id);
          }
        } catch (e) {
          console.log("[DEBUG saveFoundryResourceMutation] Fresh fetch failed, proceeding with cache");
        }
      }
      
      if (existingResource) {
        // UPDATE existing resource instead of creating a new one
        console.log("[DEBUG saveFoundryResourceMutation] Found existing resource, updating ID:", existingResource.id);
        const updatePayload = {
          ...payload,
          // Don't send organizationId in update - backend prevents org changes
        };
        delete (updatePayload as any).organizationId;
        
        const response = await apiRequest("PUT", `/api/foundry/resources/${existingResource.id}`, updatePayload);
        const responseData = await response.json();
        console.log("[DEBUG saveFoundryResourceMutation] Update response:", JSON.stringify(responseData, null, 2));
        return responseData;
      } else {
        // CREATE new resource (fallback for edge cases)
        console.log("[DEBUG saveFoundryResourceMutation] No existing resource found, creating new...");
        const response = await apiRequest("POST", "/api/foundry/resources", payload);
        const responseData = await response.json();
        console.log("[DEBUG saveFoundryResourceMutation] Create response:", JSON.stringify(responseData, null, 2));
        return responseData;
      }
    },
    onSuccess: () => {
      toast({ 
        title: "Resource Saved", 
        description: "Your Foundry configuration has been saved and can now be linked to organizations via Resource Sets." 
      });
      // Invalidate the resources query so the updated resource shows up
      queryClient.invalidateQueries({ queryKey: ["/api/foundry/resources"] });
    },
    onError: (error: any) => {
      console.error("[DEBUG saveFoundryResourceMutation] Error object:", error);
      console.error("[DEBUG saveFoundryResourceMutation] Error message:", error?.message);
      console.error("[DEBUG saveFoundryResourceMutation] Error details:", error?.details);
      toast({
        title: "Warning",
        description: error.message || "Failed to save resource to database. You may need to add it manually.",
        variant: "destructive",
      });
    },
  });

  // Resource Sets management queries and mutations
  const { data: resourceSets = [], isLoading: resourceSetsLoading, refetch: refetchResourceSets } = useQuery<FoundryResourceSetData[]>({
    queryKey: ["/api/foundry/resource-sets", selectedOrganizationId],
    queryFn: async () => {
      if (!selectedOrganizationId) return [];
      const res = await apiRequest("GET", `/api/foundry/resource-sets?organizationId=${selectedOrganizationId}`);
      return await res.json();
    },
    enabled: canView && activeTab === "resourcesets" && !!selectedOrganizationId,
  });

  // Query ALL resource sets (across all orgs) to filter out already-linked resources in dropdown
  const { data: allResourceSets = [] } = useQuery<FoundryResourceSetData[]>({
    queryKey: ["/api/foundry/resource-sets", "all"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/foundry/resource-sets`);
      return await res.json();
    },
    enabled: showResourceSetDialog,
  });

  // Get set of foundry resource IDs that are already linked to an organization
  const linkedResourceIds = useMemo(() => {
    return new Set(allResourceSets.map(rs => rs.foundryResourceId));
  }, [allResourceSets]);

  const { data: orgResourceSet } = useQuery<FoundryResourceSetData | null>({
    queryKey: ["/api/foundry/resource-sets/org", selectedOrganizationId],
    queryFn: async () => {
      if (!selectedOrganizationId) return null;
      const res = await apiRequest("GET", `/api/foundry/resource-sets/org/${selectedOrganizationId}`);
      if (res.status === 404) return null;
      return await res.json();
    },
    enabled: canView && !!selectedOrganizationId,
  });

  const createResourceSetMutation = useMutation({
    mutationFn: async (data: typeof resourceSetFormData) => {
      const response = await apiRequest("POST", "/api/foundry/resource-sets", {
        ...data,
        organizationId: data.organizationId,
      });
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Resource set created successfully" });
      setShowResourceSetDialog(false);
      resetResourceSetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/foundry/resource-sets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/foundry/resource-sets/org"] });
      // Invalidate Content Understanding page's resource dropdown cache
      queryClient.invalidateQueries({ queryKey: ["/api/foundry/org-resources"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create resource set",
        variant: "destructive",
      });
    },
  });

  const updateResourceSetMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof resourceSetFormData }) => {
      const response = await apiRequest("PUT", `/api/foundry/resource-sets/${id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Resource set updated successfully" });
      setShowResourceSetDialog(false);
      setEditingResourceSet(null);
      resetResourceSetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/foundry/resource-sets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/foundry/resource-sets/org"] });
      // Invalidate Content Understanding page's resource dropdown cache
      queryClient.invalidateQueries({ queryKey: ["/api/foundry/org-resources"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update resource set",
        variant: "destructive",
      });
    },
  });

  const deleteResourceSetMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/foundry/resource-sets/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Resource set deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/foundry/resource-sets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/foundry/resource-sets/org"] });
      // Invalidate Content Understanding page's resource dropdown cache
      queryClient.invalidateQueries({ queryKey: ["/api/foundry/org-resources"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete resource set",
        variant: "destructive",
      });
    },
  });

  // Delete Foundry resource mutation - uses partial delete endpoint to cleanup Azure resources 
  // in reverse dependency order (Agent → Vector Store → Project → Hub) before deleting DB record
  const deleteFoundryResourceMutation = useMutation({
    mutationFn: async (id: number) => {
      // Use the partial delete endpoint which handles proper Azure resource cleanup
      const response = await apiRequest("DELETE", `/api/foundry/resources/${id}/partial`);
      return await response.json();
    },
    onSuccess: (data) => {
      if (data.azureCleanupErrors && data.azureCleanupErrors.length > 0) {
        toast({ 
          title: "Resource Deleted", 
          description: `Resource deleted from database. Some Azure cleanup errors: ${data.azureCleanupErrors.join(", ")}`,
        });
      } else {
        toast({ 
          title: "Success", 
          description: data.deletedAzureResources?.length > 0 
            ? `Resource deleted. Cleaned up: ${data.deletedAzureResources.join(", ")}`
            : data.message || "Resource deleted successfully" 
        });
      }
      setShowDeleteResourceDialog(false);
      setResourceToDelete(null);
      setIsDeletingResource(false);
      queryClient.invalidateQueries({ queryKey: ["/api/foundry/resources"] });
    },
    onError: (error: any) => {
      setIsDeletingResource(false);
      toast({
        title: "Error",
        description: error.message || "Failed to delete Foundry resource",
        variant: "destructive",
      });
    },
  });

  // Handle delete resource confirmation
  const handleDeleteResource = async () => {
    if (!resourceToDelete) return;
    setIsDeletingResource(true);
    deleteFoundryResourceMutation.mutate(resourceToDelete.id);
  };

  // Track which organization was last initialized and the resource set snapshot to detect changes
  const [lastInitializedOrgId, setLastInitializedOrgId] = useState<number | null>(null);
  const [lastResourceSetSnapshot, setLastResourceSetSnapshot] = useState<string | null>(null);
  
  // Sync useOrgResourceSet when orgResourceSet changes or when organization switches
  useEffect(() => {
    if (orgResourceSet === undefined) return; // Still loading
    
    // Create a snapshot of the current resource set to detect changes (include all fields that affect chat filters)
    const currentSnapshot = orgResourceSet 
      ? `${orgResourceSet.id}-${orgResourceSet.hubName}-${orgResourceSet.projectName}-${orgResourceSet.customSubdomain}-${orgResourceSet.defaultAgentId || ''}-${orgResourceSet.defaultVectorStoreId || ''}`
      : null;
    
    const orgChanged = selectedOrganizationId !== lastInitializedOrgId;
    const resourceSetChanged = currentSnapshot !== lastResourceSetSnapshot;
    
    // Re-sync if org changed or if resource set data changed
    if (orgChanged || resourceSetChanged) {
      if (orgResourceSet && orgResourceSet.defaultAgentId) {
        setUseOrgResourceSet(true);
        setChatFilters({
          resourceGroup: "",
          hubName: orgResourceSet.hubName || "",
          projectName: orgResourceSet.projectName || "",
          customSubdomain: orgResourceSet.customSubdomain || "",
          agentId: orgResourceSet.defaultAgentId || "",
          vectorStoreId: orgResourceSet.defaultVectorStoreId || "",
          deploymentName: "",
        });
      } else {
        setUseOrgResourceSet(false);
        setChatFilters({
          resourceGroup: "",
          hubName: "",
          projectName: "",
          customSubdomain: "",
          agentId: "",
          vectorStoreId: "",
          deploymentName: "",
        });
      }
      
      // Only clear chat thread when org changes, not when resource set is edited
      if (orgChanged) {
        setChatThreadId(null);
        setChatMessages([]);
      }
      
      setLastInitializedOrgId(selectedOrganizationId);
      setLastResourceSetSnapshot(currentSnapshot);
    }
  }, [orgResourceSet, selectedOrganizationId, lastInitializedOrgId, lastResourceSetSnapshot]);

  const resetResourceSetForm = () => {
    setResourceSetFormData({
      name: "",
      organizationId: selectedOrganizationId || 0,
      foundryResourceId: 0,
      defaultAgentId: "",
      defaultVectorStoreId: "",
      notes: "",
    });
  };

  const toggleResourceSharing = async (resource: FoundryResourceData) => {
    setUpdatingResourceSharing(prev => new Set(prev).add(resource.id));
    try {
      await apiRequest("PUT", `/api/foundry/resources/${resource.id}`, {
        sharedAcrossOrgs: !resource.sharedAcrossOrgs,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/foundry/resources"] });
      toast({
        title: "Sharing updated",
        description: `${resource.resourceName} is now ${!resource.sharedAcrossOrgs ? "shared across organizations" : "exclusive to its organization"}.`,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to update sharing", variant: "destructive" });
    } finally {
      setUpdatingResourceSharing(prev => { const n = new Set(prev); n.delete(resource.id); return n; });
    }
  };

  const openEditResourceSetDialog = (rs: FoundryResourceSetData) => {
    setEditingResourceSet(rs);
    setResourceSetFormData({
      name: rs.name,
      organizationId: rs.organizationId,
      foundryResourceId: rs.foundryResourceId,
      defaultAgentId: rs.defaultAgentId || "",
      defaultVectorStoreId: rs.defaultVectorStoreId || "",
      notes: rs.notes || "",
    });
    setShowResourceSetDialog(true);
  };

  const handleResourceSetSubmit = () => {
    if (editingResourceSet) {
      updateResourceSetMutation.mutate({ id: editingResourceSet.id, data: resourceSetFormData });
    } else {
      createResourceSetMutation.mutate(resourceSetFormData);
    }
  };

  const handleHubSubmit = (data: z.infer<typeof hubSchema>) => {
    createHubMutation.mutate(data);
  };

  const handleProjectSubmit = (data: z.infer<typeof projectSchema>) => {
    createProjectMutation.mutate(data);
  };

  const handleDeploymentSubmit = (data: z.infer<typeof deploymentSchema>) => {
    createDeploymentMutation.mutate(data);
  };

  const handleAgentSubmit = (data: z.infer<typeof agentSchema>) => {
    createAgentMutation.mutate(data);
  };

  const handleVectorStoreSubmit = (data: z.infer<typeof vectorStoreSchema>) => {
    createVectorStoreMutation.mutate(data);
  };

  const handleAttachTool = () => {
    attachToolMutation.mutate();
  };

  const goBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const resetWizard = () => {
    setCurrentStep(1);
    setConfig({});
    hubForm.reset();
    projectForm.reset();
    deploymentForm.reset();
    agentForm.reset();
    vectorStoreForm.reset();
  };

  // Content Understanding model deployment handlers
  const handleDeployModel = async (modelType: 'gpt41' | 'gpt41mini' | 'embedding') => {
    if (!contentUnderstandingConfig.selectedResourceId) {
      toast({
        title: "Error",
        description: "Please select a Foundry resource first",
        variant: "destructive",
      });
      return;
    }

    const modelConfig = {
      gpt41: {
        deploymentName: contentUnderstandingConfig.gpt41DeploymentName,
        modelName: "gpt-4.1",
        modelVersion: "2025-04-14",
      },
      gpt41mini: {
        deploymentName: contentUnderstandingConfig.gpt41MiniDeploymentName,
        modelName: "gpt-4.1-mini",
        modelVersion: "2025-04-14",
      },
      embedding: {
        deploymentName: contentUnderstandingConfig.embeddingDeploymentName,
        modelName: "text-embedding-3-large",
        modelVersion: "1",
      },
    };

    const config = modelConfig[modelType];
    if (!config.deploymentName) {
      toast({
        title: "Error",
        description: "Please enter a deployment name",
        variant: "destructive",
      });
      return;
    }

    setDeployingModelKey(modelType);
    setIsDeployingModels(true);
    try {
      const selectedResource = orgLinkedResources.find(r => r.id === contentUnderstandingConfig.selectedResourceId);
      if (!selectedResource) throw new Error("Resource not found");

      // apiRequest throws on non-OK responses, so if this succeeds the deployment started
      await apiRequest("POST", "/api/foundry/deployments", {
        organizationId: selectedOrganizationId,
        resourceGroup: selectedResource.resourceGroup,
        hubName: selectedResource.resourceName,
        deploymentName: config.deploymentName,
        modelName: config.modelName,
        modelVersion: config.modelVersion,
        skuName: "GlobalStandard",
        skuCapacity: 10,
      });

      // Update the deployed status - use proper key mapping for state variables
      const deployedKeyMap: Record<string, keyof typeof contentUnderstandingConfig> = {
        gpt41: 'gpt41Deployed',
        gpt41mini: 'gpt41MiniDeployed',
        embedding: 'embeddingDeployed',
      };
      const deployedKey = deployedKeyMap[modelType];
      setContentUnderstandingConfig(prev => ({
        ...prev,
        [deployedKey]: true,
      }));

      toast({
        title: "Model Deployed",
        description: `${config.modelName} deployment started. It may take a few minutes to become fully active.`,
      });
    } catch (error: any) {
      toast({
        title: "Deployment Failed",
        description: error.message || "Failed to deploy model",
        variant: "destructive",
      });
    } finally {
      setIsDeployingModels(false);
      setDeployingModelKey(null);
    }
  };

  // One-click CU model deployment - deploys all required models with standard names and configures CU defaults
  const handleDeployCuModels = async () => {
    if (!contentUnderstandingConfig.selectedResourceId) {
      toast({
        title: "Error",
        description: "Please select a Foundry resource first",
        variant: "destructive",
      });
      return;
    }

    const selectedResource = orgLinkedResources.find(r => r.id === contentUnderstandingConfig.selectedResourceId);
    if (!selectedResource) {
      toast({
        title: "Error",
        description: "Selected resource not found",
        variant: "destructive",
      });
      return;
    }

    // Only deploy models that are not yet deployed
    const skipGpt41 = contentUnderstandingConfig.gpt41Deployed;
    const skipGpt41Mini = contentUnderstandingConfig.gpt41MiniDeployed;
    const skipEmbedding = contentUnderstandingConfig.embeddingDeployed;

    setIsDeployingModels(true);
    try {
      const response = await apiRequest("POST", "/api/foundry/deploy-cu-models", {
        organizationId: selectedOrganizationId,
        resourceGroup: selectedResource.resourceGroup,
        hubName: selectedResource.resourceName,
        skipModels: [
          ...(skipGpt41 ? ["gpt-4.1"] : []),
          ...(skipGpt41Mini ? ["gpt-4.1-mini"] : []),
          ...(skipEmbedding ? ["text-embedding-3-large"] : []),
        ],
      });
      
      const result = await response.json();
      
      // Use deployment results from response — preserve pre-deployed models as still deployed
      const deployments = result.deployments || [];
      const gpt41Result = deployments.find((d: any) => d.deploymentName === "gpt-4-1");
      const gpt41MiniResult = deployments.find((d: any) => d.deploymentName === "gpt-4-1-mini");
      const embeddingResult = deployments.find((d: any) => d.deploymentName === "text-embedding-3-large");
      
      setContentUnderstandingConfig(prev => ({
        ...prev,
        gpt41Deployed: skipGpt41 ? true : !!gpt41Result?.success,
        gpt41MiniDeployed: skipGpt41Mini ? true : !!gpt41MiniResult?.success,
        embeddingDeployed: skipEmbedding ? true : !!embeddingResult?.success,
        gpt41DeploymentName: gpt41Result?.success ? gpt41Result.deploymentName : prev.gpt41DeploymentName,
        gpt41MiniDeploymentName: gpt41MiniResult?.success ? gpt41MiniResult.deploymentName : prev.gpt41MiniDeploymentName,
        embeddingDeploymentName: embeddingResult?.success ? embeddingResult.deploymentName : prev.embeddingDeploymentName,
      }));

      const newlyAttempted = deployments.length;
      const newlySucceeded = deployments.filter((d: any) => d.success).length;
      const failedDeployments = deployments.filter((d: any) => !d.success);

      if (failedDeployments.length === 0) {
        toast({
          title: "Models Deployed Successfully",
          description: "All required models have been deployed. Allow a few minutes for them to become fully active.",
        });
      } else {
        const errorMessages = failedDeployments.map((d: any) => `${d.model}: ${d.error || 'Unknown error'}`).join('; ');
        toast({
          title: "Partial Success",
          description: `${newlySucceeded}/${newlyAttempted} models deployed. Failed: ${errorMessages}. Use the Retry button next to each failed model to try again.`,
          variant: "default",
        });
      }
    } catch (error: any) {
      toast({
        title: "Deployment Failed",
        description: error.message || "Failed to deploy CU models",
        variant: "destructive",
      });
    } finally {
      setIsDeployingModels(false);
    }
  };

  const handleDeployAllModels = async () => {
    if (!contentUnderstandingConfig.selectedResourceId) {
      toast({
        title: "Error",
        description: "Please select a Foundry resource first",
        variant: "destructive",
      });
      return;
    }

    if (!contentUnderstandingConfig.gpt41DeploymentName || !contentUnderstandingConfig.gpt41MiniDeploymentName) {
      toast({
        title: "Error",
        description: "Please enter deployment names for all required models",
        variant: "destructive",
      });
      return;
    }

    const selectedResource = orgLinkedResources.find(r => r.id === contentUnderstandingConfig.selectedResourceId);
    if (!selectedResource) {
      toast({
        title: "Error",
        description: "Selected resource not found",
        variant: "destructive",
      });
      return;
    }

    const modelsToDeply = [
      { name: "gpt-4.1", deploymentName: contentUnderstandingConfig.gpt41DeploymentName, version: "2025-04-14", key: "gpt41Deployed" },
      { name: "gpt-4.1-mini", deploymentName: contentUnderstandingConfig.gpt41MiniDeploymentName, version: "2025-04-14", key: "gpt41MiniDeployed" },
    ];

    if (contentUnderstandingConfig.embeddingDeploymentName) {
      modelsToDeply.push({ name: "text-embedding-3-large", deploymentName: contentUnderstandingConfig.embeddingDeploymentName, version: "1", key: "embeddingDeployed" });
    }

    setIsDeployingModels(true);
    let deployedCount = 0;
    const errors: string[] = [];

    try {
      for (const model of modelsToDeply) {
        try {
          await apiRequest("POST", "/api/foundry/deployments", {
            organizationId: selectedOrganizationId,
            resourceGroup: selectedResource.resourceGroup,
            hubName: selectedResource.resourceName,
            deploymentName: model.deploymentName,
            modelName: model.name,
            modelVersion: model.version,
            skuName: "GlobalStandard",
            skuCapacity: 10,
          });
          
          // If apiRequest doesn't throw, the deployment succeeded
          setContentUnderstandingConfig(prev => ({
            ...prev,
            [model.key]: true,
          }));
          deployedCount++;
        } catch (error: any) {
          console.error(`Failed to deploy ${model.name}:`, error);
          errors.push(`${model.name}: ${error.message || "Unknown error"}`);
        }
      }

      if (deployedCount === modelsToDeply.length) {
        toast({
          title: "Success",
          description: "All models deployed successfully",
        });
      } else if (deployedCount > 0) {
        toast({
          title: "Partial Success",
          description: `${deployedCount} of ${modelsToDeply.length} models deployed`,
        });
      } else {
        toast({
          title: "Deployment Failed",
          description: errors.length > 0 ? errors[0] : "Failed to deploy models",
          variant: "destructive",
        });
      }
    } finally {
      setIsDeployingModels(false);
    }
  };

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner />
      </div>
    );
  }

  if (!canView && !canAdd) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between gap-4 p-4 border-b">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Settings className="h-6 w-6" />
              Foundry AI Config
            </h1>
            <p className="text-sm text-muted-foreground">
              Configure Azure AI Foundry resources step by step
            </p>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
          <Lock className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">You do not have permission to access Foundry AI Config.</p>
        </div>
      </div>
    );
  }

  const isPending = 
    createHubMutation.isPending || 
    createProjectMutation.isPending || 
    createDeploymentMutation.isPending || 
    createAgentMutation.isPending || 
    createVectorStoreMutation.isPending || 
    attachToolMutation.isPending;

  const refetchAllResources = () => {
    if (resourceFilters.resourceGroup) {
      refetchHubs();
      if (resourceFilters.hubName) {
        refetchProjects();
        refetchDeployments();
      }
    }
    if (resourceFilters.projectName && resourceFilters.customSubdomain) {
      refetchAgents();
      refetchVectorStores();
    }
  };

  // Chat Playground handlers
  const startNewChat = async () => {
    const canUseOrgConfig = useOrgResourceSet && orgResourceSet && selectedOrganizationId;
    
    if (!canUseOrgConfig && (!chatFilters.projectName || !chatFilters.customSubdomain)) {
      toast({
        title: "Configuration Required",
        description: "Please select a hub and project first",
        variant: "destructive",
      });
      return;
    }

    setIsChatLoading(true);
    try {
      const requestBody = canUseOrgConfig 
        ? { organizationId: selectedOrganizationId }
        : { projectName: chatFilters.projectName, customSubdomain: chatFilters.customSubdomain };
      
      const response = await apiRequest("POST", "/api/foundry/chat/threads", requestBody);

      const data = await response.json();
      if (data.success && data.threadId) {
        setChatThreadId(data.threadId);
        setChatMessages([]);
        setChatInput("");
        toast({
          title: "New Chat Started",
          description: "You can now ask questions about your documents",
        });
      } else {
        throw new Error(data.error || "Failed to create chat thread");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to start new chat",
        variant: "destructive",
      });
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleChatFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const canUseOrgConfig = useOrgResourceSet && orgResourceSet && selectedOrganizationId;

    if (!canUseOrgConfig && (!chatFilters.projectName || !chatFilters.customSubdomain)) {
      toast({
        title: "Error",
        description: "Please select a project first",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingFile(true);

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        
        if (canUseOrgConfig) {
          formData.append("organizationId", selectedOrganizationId.toString());
        } else {
          formData.append("projectName", chatFilters.projectName);
          formData.append("customSubdomain", chatFilters.customSubdomain);
        }

        const token = getAuthToken();
        const headers: HeadersInit = {};
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        
        const response = await fetch("/api/foundry/chat/files", {
          method: "POST",
          headers,
          body: formData,
          credentials: "include",
        });

        const data = await response.json();
        if (data.success && data.fileId) {
          setChatFileAttachments(prev => [...prev, {
            fileId: data.fileId,
            filename: data.filename || file.name,
            status: data.status || "uploaded",
            bytes: data.bytes,
          }]);
          toast({
            title: "File Uploaded",
            description: `${file.name} has been uploaded successfully`,
          });
        } else {
          throw new Error(data.error || "Failed to upload file");
        }
      }
    } catch (error: any) {
      setErrorDialogContent({
        title: "File Upload Error",
        message: error.message || "Failed to upload file",
      });
      setShowErrorDialog(true);
    } finally {
      setIsUploadingFile(false);
      event.target.value = "";
    }
  };

  const removeChatFileAttachment = (fileId: string) => {
    setChatFileAttachments(prev => prev.filter(f => f.fileId !== fileId));
  };

  const sendChatMessage = async () => {
    const canUseOrgConfig = useOrgResourceSet && orgResourceSet && selectedOrganizationId;
    const effectiveAgentId = canUseOrgConfig ? orgResourceSet.defaultAgentId : chatFilters.agentId;
    
    if (!chatInput.trim() || !chatThreadId || !effectiveAgentId || isChatLoading) {
      return;
    }

    const currentAttachments = chatFileAttachments.map(f => ({ fileId: f.fileId, filename: f.filename }));
    
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: chatInput.trim(),
      createdAt: Date.now(),
      attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
    };

    setChatMessages(prev => [...prev, userMessage]);
    setChatInput("");
    setChatFileAttachments([]);
    setIsChatLoading(true);

    try {
      const requestBody = canUseOrgConfig 
        ? { 
            organizationId: selectedOrganizationId,
            agentId: effectiveAgentId,
            content: userMessage.content,
            fileIds: currentAttachments.length > 0 ? currentAttachments.map(a => a.fileId) : undefined,
          }
        : {
            projectName: chatFilters.projectName,
            customSubdomain: chatFilters.customSubdomain,
            agentId: chatFilters.agentId,
            content: userMessage.content,
            deploymentName: chatFilters.deploymentName || undefined,
            fileIds: currentAttachments.length > 0 ? currentAttachments.map(a => a.fileId) : undefined,
            vectorStoreId: chatFilters.vectorStoreId || undefined,
          };
      
      const response = await apiRequest("POST", `/api/foundry/chat/threads/${chatThreadId}/messages`, requestBody);

      const data = await response.json();
      if (data.success && data.messages) {
        // Find the assistant's response (most recent assistant message)
        const assistantMessages = data.messages
          .filter((m: any) => m.role === "assistant")
          .sort((a: any, b: any) => b.created_at - a.created_at);

        if (assistantMessages.length > 0) {
          const latestAssistant = assistantMessages[0];
          const textContent = latestAssistant.content?.[0]?.text;
          let content = textContent?.value || textContent || "No response received";
          
          // Extract citations from annotations if available
          const annotations = textContent?.annotations || [];
          const citations: Citation[] = [];
          
          if (annotations.length > 0) {
            console.log("[Citations] Raw annotations:", JSON.stringify(annotations, null, 2));
            // Process annotations and extract citation info
            annotations.forEach((annotation: any, index: number) => {
              if (annotation.type === "file_citation") {
                const marker = annotation.text || `【${index}†source】`;
                const fileId = annotation.file_citation?.file_id;
                // Use resolved_filename from backend enrichment if available
                const resolvedFilename = annotation.file_citation?.resolved_filename;
                
                // Parse marker pattern with optional chunk index:
                // 【{sourceNumber}:{chunkIndex}†{filename}】 OR 【{sourceNumber}†{filename}】
                // Examples: 【4:2†Uploading the file via SAS URL.docx】, 【6:0†source】, 【6†source】
                const markerMatch = marker.match(/【(\d+)(?::\d+)?†(.+?)】/);
                const sourceNumber = markerMatch ? markerMatch[1] : undefined;
                // Extract filename from marker if it's not just "source"
                const markerFilename = markerMatch && markerMatch[2] !== 'source' ? markerMatch[2] : undefined;
                
                // Priority: backend resolved_filename > marker filename
                const filename = resolvedFilename || markerFilename;
                
                console.log(`[Citations] Annotation ${index}:`, { type: annotation.type, fileId, sourceNumber, markerFilename, resolvedFilename, fileCitation: annotation.file_citation });
                citations.push({
                  index: index + 1,
                  marker,
                  fileId,
                  filename, // Use backend resolved filename or marker filename
                  quote: annotation.file_citation?.quote,
                  sourceNumber,
                });
                // Replace citation marker with a cleaner numbered reference
                content = content.replace(marker, `[${index + 1}]`);
              }
            });
          }
          
          const messageId = latestAssistant.id || `msg-${Date.now()}-assistant`;
          const assistantMessage: ChatMessage = {
            id: messageId,
            role: "assistant",
            content: content,
            createdAt: latestAssistant.created_at * 1000 || Date.now(),
            citations: citations.length > 0 ? citations : undefined,
          };
          setChatMessages(prev => [...prev, assistantMessage]);
          
          // Resolve file IDs to filenames for citations that don't already have filenames
          // Note: Backend now enriches messages with resolved_filename, but we keep batch API as fallback
          // assistant-* IDs are internal vector store references and cannot be resolved via API
          if (citations.length > 0) {
            // Find citations that need filename resolution (no filename from backend and not assistant-* IDs)
            const resolvableIds = citations
              .filter(c => !c.filename && c.fileId && !c.fileId.startsWith('assistant-'))
              .map(c => c.fileId as string);
            
            // Log unresolvable assistant-* IDs
            const unresolvedAssistantIds = citations.filter(c => !c.filename && c.fileId?.startsWith('assistant-'));
            if (unresolvedAssistantIds.length > 0) {
              console.log(`[Citations] ${unresolvedAssistantIds.length} citation(s) have unresolvable assistant-* IDs (Azure limitation)`);
            }
            
            // Resolve regular file IDs via batch API
            if (resolvableIds.length > 0) {
              try {
                console.log(`[Citations] Resolving ${resolvableIds.length} file ID(s) via batch API`);
                const batchResponse = await apiRequest("POST", "/api/foundry/files/batch", {
                  fileIds: resolvableIds,
                  projectName: canUseOrgConfig ? undefined : chatFilters.projectName,
                  customSubdomain: canUseOrgConfig ? undefined : chatFilters.customSubdomain,
                  organizationId: canUseOrgConfig ? selectedOrganizationId : undefined,
                  vectorStoreId: canUseOrgConfig ? undefined : chatFilters.vectorStoreId,
                });
                const batchData = await batchResponse.json();
                console.log("[Citations] Batch response:", batchData);
                if (batchData.success && batchData.files) {
                  // Update the message with resolved filenames
                  setChatMessages(prev => prev.map(m => {
                    if (m.id === messageId && m.citations) {
                      return {
                        ...m,
                        citations: m.citations.map(c => ({
                          ...c,
                          filename: c.fileId && batchData.files[c.fileId]?.filename 
                            ? batchData.files[c.fileId].filename 
                            : c.filename,
                        })),
                      };
                    }
                    return m;
                  }));
                }
              } catch (e) {
                console.warn("[Citations] Failed to resolve filenames:", e);
              }
            }
          }
        }
      } else {
        throw new Error(data.error || "Failed to get response");
      }
    } catch (error: any) {
      setErrorDialogContent({
        title: "Chat Error",
        message: error.message || "Failed to send message",
      });
      setShowErrorDialog(true);
      // Remove the user message on error
      setChatMessages(prev => prev.filter(m => m.id !== userMessage.id));
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between gap-4 p-4 border-b flex-wrap shrink-0">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Foundry AI Config
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure Azure AI Foundry resources step by step
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="px-4 pt-4 border-b shrink-0">
          <TabsList>
            {canViewWizardTab && (
              <TabsTrigger value="wizard" data-testid="tab-wizard">
                <Wand2 className="h-4 w-4 mr-2" />
                Wizard
              </TabsTrigger>
            )}
            {canViewResourcesTab && (
              <TabsTrigger value="resources" data-testid="tab-resources">
                <List className="h-4 w-4 mr-2" />
                Resources
              </TabsTrigger>
            )}
            {canViewFoundryActionTab && (
              <TabsTrigger value="action" data-testid="tab-action">
                <Files className="h-4 w-4 mr-2" />
                Foundry Action
              </TabsTrigger>
            )}
            {canViewChatPlaygroundTab && (
              <TabsTrigger value="chat" data-testid="tab-chat">
                <MessageSquare className="h-4 w-4 mr-2" />
                Chat Playground
              </TabsTrigger>
            )}
            {canViewResourceSetsTab && (
              <TabsTrigger value="resourcesets" data-testid="tab-resourcesets">
                <Building className="h-4 w-4 mr-2" />
                Resource Sets
              </TabsTrigger>
            )}
            {canViewContentUnderstandingTab && (
              <TabsTrigger value="contentunderstanding" data-testid="tab-content-understanding">
                <Sparkles className="h-4 w-4 mr-2" />
                Content Understanding
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="wizard" className="flex-1 overflow-auto p-4 mt-0">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div></div>
              <Button variant="outline" size="sm" onClick={resetWizard} data-testid="button-reset-wizard">
                <RefreshCw className="h-4 w-4 mr-2" />
                Start Over
              </Button>
            </div>
            <div className="flex items-center justify-between mb-8 overflow-x-auto pb-4">
            {wizardSteps.map((step, index) => (
              <div key={step.id} className="flex items-center shrink-0">
                <div 
                  className={`flex flex-col items-center ${
                    step.id <= currentStep ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                    step.id < currentStep 
                      ? "bg-primary border-primary text-primary-foreground" 
                      : step.id === currentStep 
                        ? "border-primary text-primary" 
                        : "border-muted"
                  }`}>
                    {step.id < currentStep ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <step.icon className="h-5 w-5" />
                    )}
                  </div>
                  <span className="text-xs mt-1 whitespace-nowrap">{step.title}</span>
                </div>
                {index < wizardSteps.length - 1 && (
                  <div className={`w-8 md:w-16 h-0.5 mx-1 md:mx-2 ${
                    step.id < currentStep ? "bg-primary" : "bg-muted"
                  }`} />
                )}
              </div>
            ))}
          </div>

          {currentStep === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-5 w-5" />
                  Step 1: Create Foundry Resource (Hub)
                </CardTitle>
                <CardDescription>
                  Create an Azure AI Foundry Hub which is the top-level resource for your AI workloads.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...hubForm}>
                  <form onSubmit={hubForm.handleSubmit(handleHubSubmit)} className="space-y-4">
                    <FormField
                      control={hubForm.control}
                      name="hubName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Hub Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="my-foundry-hub" 
                              {...field} 
                              data-testid="input-hub-name"
                            />
                          </FormControl>
                          <FormDescription>
                            A unique name for your Azure AI Foundry Hub
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={hubForm.control}
                      name="customSubdomain"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Custom Subdomain</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="my-foundry-subdomain" 
                              {...field} 
                              data-testid="input-custom-subdomain"
                            />
                          </FormControl>
                          <FormDescription>
                            The subdomain for your Foundry endpoint (e.g., my-subdomain.services.ai.azure.com)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={hubForm.control}
                      name="resourceGroup"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Resource Group</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-resource-group">
                                <SelectValue placeholder="Select resource group" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {resourceGroups.map((rg) => (
                                <SelectItem key={rg.name} value={rg.name}>
                                  {rg.name} ({rg.location})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={hubForm.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-location">
                                <SelectValue placeholder="Select location" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {locations.map((loc) => (
                                <SelectItem key={loc.name} value={loc.name}>
                                  {loc.displayName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-end pt-4">
                      <Button type="submit" disabled={isPending} data-testid="button-create-hub">
                        {createHubMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Create Hub
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}

          {currentStep === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5" />
                  Step 2: Create Project
                </CardTitle>
                <CardDescription>
                  Create a project within your Foundry Hub: <Badge variant="secondary">{config.hubName}</Badge>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...projectForm}>
                  <form onSubmit={projectForm.handleSubmit(handleProjectSubmit)} className="space-y-4">
                    <FormField
                      control={projectForm.control}
                      name="projectName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Project Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="my-project" 
                              {...field} 
                              data-testid="input-project-name"
                            />
                          </FormControl>
                          <FormDescription>
                            A unique identifier for your project (no spaces)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={projectForm.control}
                      name="displayName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Display Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="My Project" 
                              {...field} 
                              data-testid="input-display-name"
                            />
                          </FormControl>
                          <FormDescription>
                            A friendly display name for your project
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-between pt-4">
                      <Button type="button" variant="outline" onClick={goBack} data-testid="button-back">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                      </Button>
                      <Button type="submit" disabled={isPending} data-testid="button-create-project">
                        {createProjectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Create Project
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}

          {currentStep === 3 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  Step 3: Deploy Model
                </CardTitle>
                <CardDescription>
                  Deploy a model with file search capability in project: <Badge variant="secondary">{config.projectName}</Badge>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...deploymentForm}>
                  <form onSubmit={deploymentForm.handleSubmit(handleDeploymentSubmit)} className="space-y-4">
                    <FormField
                      control={deploymentForm.control}
                      name="deploymentName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Deployment Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="gpt4o-deployment" 
                              {...field} 
                              data-testid="input-deployment-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={deploymentForm.control}
                      name="modelName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Model</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-model">
                                <SelectValue placeholder="Select model" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="gpt-4o">GPT-4o (Supports file search)</SelectItem>
                              <SelectItem value="gpt-4o-mini">GPT-4o Mini (Supports file search)</SelectItem>
                              <SelectItem value="gpt-4">GPT-4 (Supports file search)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Select a model that supports file search capability
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={deploymentForm.control}
                      name="modelVersion"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Model Version</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-model-version">
                                <SelectValue placeholder="Select version" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="2024-08-06">2024-08-06</SelectItem>
                              <SelectItem value="2024-05-13">2024-05-13</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-between pt-4">
                      <Button type="button" variant="outline" onClick={goBack} data-testid="button-back">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                      </Button>
                      <Button type="submit" disabled={isPending} data-testid="button-deploy-model">
                        {createDeploymentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Deploy Model
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}

          {currentStep === 4 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Step 4: Create Agent
                </CardTitle>
                <CardDescription>
                  Create an AI agent using deployment: <Badge variant="secondary">{config.deploymentName}</Badge>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...agentForm}>
                  <form onSubmit={agentForm.handleSubmit(handleAgentSubmit)} className="space-y-4">
                    <FormField
                      control={agentForm.control}
                      name="agentName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Agent Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="my-agent" 
                              {...field} 
                              data-testid="input-agent-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={agentForm.control}
                      name="instructions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Instructions</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="You are a helpful assistant..." 
                              {...field} 
                              data-testid="input-instructions"
                            />
                          </FormControl>
                          <FormDescription>
                            System instructions for the agent
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-between pt-4">
                      <Button type="button" variant="outline" onClick={goBack} data-testid="button-back">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                      </Button>
                      <Button type="submit" disabled={isPending} data-testid="button-create-agent">
                        {createAgentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Create Agent
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}

          {currentStep === 5 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Step 5: Create Vector Store
                </CardTitle>
                <CardDescription>
                  Create a vector store for file search in project: <Badge variant="secondary">{config.projectName}</Badge>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...vectorStoreForm}>
                  <form onSubmit={vectorStoreForm.handleSubmit(handleVectorStoreSubmit)} className="space-y-4">
                    <FormField
                      control={vectorStoreForm.control}
                      name="vectorStoreName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vector Store Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="my-knowledge-base" 
                              {...field} 
                              data-testid="input-vector-store-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={vectorStoreForm.control}
                      name="expiresAfterDays"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expires After (Days)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number"
                              min={1}
                              max={365}
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 30)}
                              data-testid="input-expires-days"
                            />
                          </FormControl>
                          <FormDescription>
                            Number of days until the vector store expires (1-365)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-between pt-4">
                      <Button type="button" variant="outline" onClick={goBack} data-testid="button-back">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                      </Button>
                      <Button type="submit" disabled={isPending} data-testid="button-create-vector-store">
                        {createVectorStoreMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Create Vector Store
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}

          {currentStep === 6 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link2 className="h-5 w-5" />
                  Step 6: Attach File Search Tool
                </CardTitle>
                <CardDescription>
                  Attach the file_search tool to your agent with the vector store
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-muted rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Hub:</span>
                      <Badge variant="secondary">{config.hubName}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Project:</span>
                      <Badge variant="secondary">{config.projectName}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Deployment:</span>
                      <Badge variant="secondary">{config.deploymentName}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Agent:</span>
                      <Badge variant="secondary">{config.agentName}</Badge>
                      <span className="text-xs text-muted-foreground">({config.agentId})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Vector Store:</span>
                      <Badge variant="secondary">{config.vectorStoreName}</Badge>
                      <span className="text-xs text-muted-foreground">({config.vectorStoreId})</span>
                    </div>
                  </div>

                  {/* Sharing configuration */}
                  <div className="rounded-lg border bg-card p-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <Label htmlFor="switch-shared-across-orgs" className="text-sm font-medium cursor-pointer">
                          Allow sharing across organizations
                        </Label>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          When enabled, this resource can be linked to multiple organizations. By default, a resource is exclusively tied to one organization.
                        </p>
                      </div>
                      <Switch
                        id="switch-shared-across-orgs"
                        checked={config.sharedAcrossOrgs ?? false}
                        onCheckedChange={(checked) => setConfig(prev => ({ ...prev, sharedAcrossOrgs: checked }))}
                        data-testid="switch-shared-across-orgs"
                      />
                    </div>
                    {config.sharedAcrossOrgs && (
                      <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md px-3 py-2">
                        <span>This resource will appear in the organization-linking dropdown for all organizations, not just the one it was created under.</span>
                      </div>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground">
                    This will update your agent to use the file_search tool with the vector store you created.
                    After this step, you can add files to the vector store from the Files tab.
                  </p>

                  <div className="flex justify-between pt-4">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={goBack} 
                      disabled={attachToolMutation.isSuccess}
                      data-testid="button-back"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <Button 
                      onClick={handleAttachTool} 
                      disabled={isPending || attachToolMutation.isSuccess}
                      data-testid="button-attach-tool"
                    >
                      {attachToolMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {attachToolMutation.isSuccess ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Configuration Complete
                        </>
                      ) : (
                        <>
                          <Link2 className="h-4 w-4 mr-2" />
                          Attach File Search Tool
                        </>
                      )}
                    </Button>
                  </div>

                  {attachToolMutation.isSuccess && (
                    <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="font-medium">Configuration Complete!</span>
                      </div>
                      <p className="text-sm text-green-600 dark:text-green-500 mt-2">
                        Your Foundry AI setup is complete. You can now add files to your vector store from the Files tab.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {config.hubName && currentStep > 1 && (
            <div className="mt-6 p-4 bg-muted rounded-lg">
              <h3 className="text-sm font-medium mb-2">Current Configuration</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                {config.hubName && (
                  <div>
                    <span className="text-muted-foreground">Hub:</span> {config.hubName}
                  </div>
                )}
                {config.projectName && (
                  <div>
                    <span className="text-muted-foreground">Project:</span> {config.projectName}
                  </div>
                )}
                {config.deploymentName && (
                  <div>
                    <span className="text-muted-foreground">Deployment:</span> {config.deploymentName}
                  </div>
                )}
                {config.agentName && (
                  <div>
                    <span className="text-muted-foreground">Agent:</span> {config.agentName}
                  </div>
                )}
                {config.vectorStoreName && (
                  <div>
                    <span className="text-muted-foreground">Vector Store:</span> {config.vectorStoreName}
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        </TabsContent>

        <TabsContent value="resources" className="flex-1 overflow-auto p-4 mt-0">
          <div className="max-w-6xl mx-auto space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Foundry Resources
                  </CardTitle>
                  <CardDescription>
                    Resources created via the Wizard. Deleting removes both the Azure resources and database entry.
                  </CardDescription>
                </div>
                <Button 
                  variant="outline" 
                  onClick={() => refetchFoundryResources()}
                  disabled={isResourcesLoading}
                  data-testid="button-refresh-db-resources"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isResourcesLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {isResourcesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : foundryResourcesError ? (
                  <div className="text-center py-8 text-destructive">
                    Failed to load resources. Please try again.
                  </div>
                ) : availableFoundryResources.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No Foundry resources found. Use the Wizard tab to create one.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Hub</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Resource Group</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[90px]">Shared</TableHead>
                        <TableHead className="w-[60px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {availableFoundryResources.map((resource) => (
                        <TableRow key={resource.id} data-testid={`row-resource-${resource.id}`}>
                          <TableCell className="font-medium">{resource.resourceName}</TableCell>
                          <TableCell>{resource.hubName || "-"}</TableCell>
                          <TableCell>{resource.projectName || "-"}</TableCell>
                          <TableCell>{resource.resourceGroup}</TableCell>
                          <TableCell>{resource.location}</TableCell>
                          <TableCell>
                            {(() => {
                              const { variant, label } = getResourceStatusBadge(resource);
                              return (
                                <div className="flex flex-col gap-1">
                                  <Badge variant={variant}>{label}</Badge>
                                  {isPartialResource(resource) && resource.lastError && (
                                    <span className="text-xs text-destructive truncate max-w-[200px]" title={resource.lastError}>
                                      {resource.lastError.substring(0, 50)}...
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            {canAdd && resource.status === "completed" ? (
                              <Switch
                                checked={resource.sharedAcrossOrgs ?? false}
                                onCheckedChange={() => toggleResourceSharing(resource)}
                                disabled={updatingResourceSharing.has(resource.id)}
                                title={resource.sharedAcrossOrgs ? "Click to disable sharing" : "Click to enable sharing across organizations"}
                                className="data-[state=checked]:bg-blue-500"
                                data-testid={`switch-resource-sharing-${resource.id}`}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">{resource.sharedAcrossOrgs ? "Yes" : "No"}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {canDelete && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setResourceToDelete(resource);
                                  setShowDeleteResourceDialog(true);
                                }}
                                title={isPartialResource(resource) ? "Delete partial resource and cleanup Azure resources" : "Delete resource"}
                                data-testid={`button-delete-resource-${resource.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Foundry Action Tab */}
        <TabsContent value="action" className="flex-1 overflow-auto p-4 mt-0">
          <div className="space-y-4">
            {/* Resource Selection Filters */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Select Foundry Resources</CardTitle>
                <CardDescription>
                  Choose the resource hierarchy to add or remove files from a vector store
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Hub - Hub names are globally unique, resourceGroup/customSubdomain are synced via useEffect */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Foundry Hub</label>
                    <Select
                      value={actionFilters.hubName}
                      onValueChange={(value) => {
                        // resourceGroup and customSubdomain are synced via useEffect based on hubName
                        setActionFilters(prev => ({
                          ...prev,
                          hubName: value,
                          projectName: "",
                          agentId: "",
                          vectorStoreId: "",
                        }));
                      }}
                    >
                      <SelectTrigger data-testid="action-select-hub">
                        <SelectValue placeholder="Select hub" />
                      </SelectTrigger>
                      <SelectContent>
                        {orgLinkedResourcesLoading ? (
                          <SelectItem value="_loading" disabled>Loading...</SelectItem>
                        ) : getOrgLinkedHubs().length === 0 ? (
                          <SelectItem value="_empty" disabled>No resources linked to this org</SelectItem>
                        ) : (
                          getOrgLinkedHubs().map((hub) => (
                            <SelectItem key={hub.name} value={hub.name}>
                              {hub.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Project */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Project</label>
                    <Select
                      value={actionFilters.projectName}
                      onValueChange={(value) => {
                        setActionFilters(prev => ({
                          ...prev,
                          projectName: value,
                          agentId: "",
                          vectorStoreId: "",
                        }));
                      }}
                      disabled={!actionFilters.hubName}
                    >
                      <SelectTrigger data-testid="action-select-project">
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        {getOrgLinkedProjects(actionFilters.hubName).map((project) => (
                          <SelectItem key={project.name} value={project.name || ""}>
                            {project.projectName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Agent */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Agent</label>
                    <Select
                      value={actionFilters.agentId}
                      onValueChange={(value) => {
                        setActionFilters(prev => ({
                          ...prev,
                          agentId: value,
                        }));
                      }}
                      disabled={!actionFilters.projectName}
                    >
                      <SelectTrigger data-testid="action-select-agent">
                        <SelectValue placeholder={actionAgentsLoading ? "Loading..." : "Select agent"} />
                      </SelectTrigger>
                      <SelectContent>
                        {actionAgentsList.map((agent: any) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Vector Store */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Vector Store</label>
                    <Select
                      value={actionFilters.vectorStoreId}
                      onValueChange={(value) => {
                        setActionFilters(prev => ({
                          ...prev,
                          vectorStoreId: value,
                        }));
                      }}
                      disabled={!actionFilters.projectName}
                    >
                      <SelectTrigger data-testid="action-select-vector-store">
                        <SelectValue placeholder={actionVectorStoresLoading ? "Loading..." : "Select vector store"} />
                      </SelectTrigger>
                      <SelectContent>
                        {actionVectorStoresList.map((vs: any) => (
                          <SelectItem key={vs.id} value={vs.id}>
                            {vs.name} ({vs.file_counts?.total || 0} files)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {actionFilters.vectorStoreId && (
                  <div className="mt-4 p-3 bg-muted rounded-md">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="font-medium">Ready to manage files</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Select files below to add or remove them from the vector store
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Storage Status / File Browser */}
            {storageLoading ? (
              <Card>
                <CardContent className="py-8">
                  <div className="flex items-center justify-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-muted-foreground">Checking storage configuration...</span>
                  </div>
                </CardContent>
              </Card>
            ) : isStorageNotFound ? (
              <Card>
                <CardContent className="py-8">
                  <div className="text-center max-w-md mx-auto">
                    <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                      <Settings className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">No Storage Account Configured</h3>
                    <p className="text-muted-foreground mb-4">
                      <strong>{selectedRole?.organization.name}</strong> doesn't have a storage account set up yet.
                      File management features are not available until storage is configured.
                    </p>
                    {rolePermissions?.storageMgmt?.view && (
                      <p className="text-sm text-primary">
                        You can configure storage accounts in the Storage Management section.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : hasStorageConfigured && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Files className="h-4 w-4" />
                      File Browser
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {selectedFiles.size > 0 && actionFilters.vectorStoreId && (
                        <>
                          {selectionStatus === 'mixed' && (
                            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-3 py-1.5 rounded-md border border-amber-200 dark:border-amber-800">
                              <AlertTriangle className="h-4 w-4" />
                              <span>Mixed selection: select only added or only not-added files</span>
                            </div>
                          )}
                          {selectionStatus === 'all-not-added' && (
                            <Button
                              size="sm"
                              onClick={() => {
                                selectedFiles.forEach(filePath => {
                                  addToVectorStoreMutation.mutate({
                                    filePath,
                                    vectorStoreId: actionFilters.vectorStoreId,
                                  });
                                });
                              }}
                              disabled={addToVectorStoreMutation.isPending}
                              data-testid="button-add-to-vector-store"
                            >
                              {addToVectorStoreMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Upload className="h-4 w-4 mr-2" />
                              )}
                              Add to Vector Store ({selectedFiles.size})
                            </Button>
                          )}
                          {selectionStatus === 'all-added' && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                selectedFiles.forEach(filePath => {
                                  removeFromVectorStoreMutation.mutate({
                                    filePath,
                                    vectorStoreId: actionFilters.vectorStoreId,
                                  });
                                });
                              }}
                              disabled={removeFromVectorStoreMutation.isPending}
                              data-testid="button-remove-from-vector-store"
                            >
                              {removeFromVectorStoreMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4 mr-2" />
                              )}
                              Remove from Vector Store ({selectedFiles.size})
                            </Button>
                          )}
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => refetchFiles()}
                        data-testid="button-refresh-files"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Breadcrumb Navigation */}
                  <div className="flex items-center gap-1 mb-4 flex-wrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCurrentPath("")}
                      className="text-sm"
                      data-testid="breadcrumb-root"
                    >
                      <Folder className="h-4 w-4 mr-1" />
                      Root
                    </Button>
                    {breadcrumbParts.map((part, index) => (
                      <div key={index} className="flex items-center">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const newPath = breadcrumbParts.slice(0, index + 1).join("/");
                            setCurrentPath(newPath);
                          }}
                          className="text-sm"
                          data-testid={`breadcrumb-${index}`}
                        >
                          {part}
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* File Table */}
                  {filesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : sortedFiles.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No files or folders found in this directory
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox
                              checked={selectedFiles.size === sortedFiles.filter(f => f.type === "file").length && sortedFiles.filter(f => f.type === "file").length > 0}
                              onCheckedChange={handleSelectAll}
                              data-testid="checkbox-select-all"
                            />
                          </TableHead>
                          <TableHead 
                            className="cursor-pointer"
                            onClick={() => handleSort("name")}
                          >
                            Name {sortField === "name" && (sortDirection === "asc" ? "↑" : "↓")}
                          </TableHead>
                          <TableHead 
                            className="cursor-pointer"
                            onClick={() => handleSort("size")}
                          >
                            Size {sortField === "size" && (sortDirection === "asc" ? "↑" : "↓")}
                          </TableHead>
                          <TableHead 
                            className="cursor-pointer"
                            onClick={() => handleSort("lastModified")}
                          >
                            Modified {sortField === "lastModified" && (sortDirection === "asc" ? "↑" : "↓")}
                          </TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentPath && (
                          <TableRow 
                            className="cursor-pointer hover-elevate"
                            onClick={handleNavigateBack}
                            data-testid="row-navigate-back"
                          >
                            <TableCell></TableCell>
                            <TableCell className="flex items-center gap-2">
                              <ArrowUp className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">..</span>
                            </TableCell>
                            <TableCell></TableCell>
                            <TableCell></TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        )}
                        {sortedFiles.map((item) => (
                          <TableRow 
                            key={item.path} 
                            className={item.type === "directory" ? "cursor-pointer hover-elevate" : ""}
                            onClick={() => item.type === "directory" && handleNavigateToFolder(item.path)}
                            data-testid={`row-file-${item.name}`}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {item.type === "file" && (
                                <Checkbox
                                  checked={selectedFiles.has(item.path)}
                                  onCheckedChange={() => handleSelectFile(item.path)}
                                  data-testid={`checkbox-file-${item.name}`}
                                />
                              )}
                            </TableCell>
                            <TableCell className="flex items-center gap-2">
                              {item.type === "directory" ? (
                                <Folder className="h-4 w-4 text-blue-500" />
                              ) : (
                                <File className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className={item.type === "directory" ? "font-medium" : ""}>
                                {item.name}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {item.type === "file" ? formatFileSize(item.size) : "-"}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {item.lastModified ? new Date(item.lastModified).toLocaleDateString() : "-"}
                            </TableCell>
                            <TableCell>
                              {item.type === "file" && actionFilters.vectorStoreId && (
                                isFileInVectorStore(item) ? (
                                  <Badge variant="default" className="text-xs">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    In Vector Store
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">
                                    Not Added
                                  </Badge>
                                )
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Chat Playground Tab */}
        <TabsContent value="chat" className="flex-1 overflow-hidden p-4 mt-0">
          <div className="h-full flex flex-col max-w-4xl mx-auto">
            {/* Chat Configuration */}
            <Card className="mb-4">
              <CardHeader className="py-3 flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Chat Configuration
                </CardTitle>
                {orgResourceSet && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="use-org-resource-set"
                      checked={useOrgResourceSet}
                      onCheckedChange={(checked) => {
                        setUseOrgResourceSet(checked === true);
                        if (checked && orgResourceSet) {
                          setChatFilters({
                            resourceGroup: "",
                            hubName: orgResourceSet.hubName || "",
                            projectName: orgResourceSet.projectName || "",
                            customSubdomain: orgResourceSet.customSubdomain || "",
                            agentId: orgResourceSet.defaultAgentId || "",
                            vectorStoreId: orgResourceSet.defaultVectorStoreId || "",
                            deploymentName: "",
                          });
                          setChatThreadId(null);
                          setChatMessages([]);
                        }
                      }}
                      data-testid="checkbox-use-org-resource-set"
                    />
                    <label 
                      htmlFor="use-org-resource-set" 
                      className="text-sm cursor-pointer"
                    >
                      Use organization config
                    </label>
                  </div>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                {useOrgResourceSet && orgResourceSet ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{orgResourceSet.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Hub: {orgResourceSet.hubName} | Project: {orgResourceSet.projectName}
                        </p>
                      </div>
                      <Badge variant="outline">Org Config</Badge>
                    </div>
                    {orgResourceSet.defaultAgentId && (
                      <div className="flex items-center gap-2 text-sm">
                        <Bot className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Agent:</span>
                        <code className="text-xs bg-muted px-2 py-0.5 rounded">{orgResourceSet.defaultAgentId}</code>
                      </div>
                    )}
                    {!orgResourceSet.defaultAgentId && (
                      <p className="text-sm text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="h-4 w-4" />
                        No default agent configured. Please configure an agent in Resource Sets.
                      </p>
                    )}
                  </div>
                ) : (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {/* Hub - Hub names are globally unique, resourceGroup/customSubdomain are synced via useEffect */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      Hub
                    </label>
                    <Select
                      value={chatFilters.hubName}
                      onValueChange={(value) => {
                        // resourceGroup and customSubdomain are synced via useEffect based on hubName
                        setChatFilters(prev => ({ 
                          ...prev, 
                          hubName: value,
                          projectName: "",
                          agentId: "",
                          vectorStoreId: "",
                          deploymentName: "",
                        }));
                        setChatThreadId(null);
                        setChatMessages([]);
                      }}
                    >
                      <SelectTrigger data-testid="select-chat-hub">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {orgLinkedResourcesLoading ? (
                          <SelectItem value="_loading" disabled>Loading...</SelectItem>
                        ) : getOrgLinkedHubs().length === 0 ? (
                          <SelectItem value="_empty" disabled>No resources linked</SelectItem>
                        ) : (
                          getOrgLinkedHubs().map((hub) => (
                            <SelectItem key={hub.name} value={hub.name}>{hub.name}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      Project
                    </label>
                    <Select
                      value={chatFilters.projectName}
                      onValueChange={(value) => {
                        setChatFilters(prev => ({ 
                          ...prev, 
                          projectName: value,
                          agentId: "",
                          vectorStoreId: "",
                        }));
                        setChatThreadId(null);
                        setChatMessages([]);
                      }}
                      disabled={!chatFilters.hubName}
                    >
                      <SelectTrigger data-testid="select-chat-project">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {getOrgLinkedProjects(chatFilters.hubName).map((project) => (
                          <SelectItem key={project.name} value={project.name || ""}>{project.projectName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      Agent
                      {chatAgentsLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                    </label>
                    <Select
                      value={chatFilters.agentId}
                      onValueChange={(value) => {
                        setChatFilters(prev => ({ ...prev, agentId: value }));
                      }}
                      disabled={!chatFilters.projectName || chatAgentsLoading}
                    >
                      <SelectTrigger data-testid="select-chat-agent">
                        <SelectValue placeholder={chatAgentsLoading ? "Loading..." : "Select..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {chatAgentsList.map((agent: any) => (
                          <SelectItem key={agent.id} value={agent.id}>{agent.name || agent.id}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      Vector Store {chatVectorStoresList.length > 0 && `(${chatVectorStoresList.length})`}
                      {chatVectorStoresLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                    </label>
                    <Select
                      value={chatFilters.vectorStoreId}
                      onValueChange={(value) => {
                        setChatFilters(prev => ({ ...prev, vectorStoreId: value }));
                      }}
                      disabled={!chatFilters.projectName || chatVectorStoresLoading}
                    >
                      <SelectTrigger data-testid="select-chat-vector-store">
                        <SelectValue placeholder={chatVectorStoresLoading ? "Loading..." : "Select..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {chatVectorStoresList.map((vs: any) => (
                          <SelectItem key={vs.id} value={vs.id}>{vs.name || vs.id}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      Model {chatDeploymentsList.length > 0 && `(${chatDeploymentsList.length})`}
                      {chatDeploymentsLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                    </label>
                    <Select
                      value={chatFilters.deploymentName}
                      onValueChange={(value) => {
                        setChatFilters(prev => ({ ...prev, deploymentName: value }));
                      }}
                      disabled={!chatFilters.hubName || chatDeploymentsLoading}
                    >
                      <SelectTrigger data-testid="select-chat-model">
                        <SelectValue placeholder={chatDeploymentsLoading ? "Loading..." : "Select model..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {chatDeploymentsList.map((deployment: any) => (
                          <SelectItem key={deployment.name} value={deployment.name}>
                            {deployment.name} {deployment.model?.name && `(${deployment.model.name})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                )}
              </CardContent>
            </Card>

            {/* Chat Interface */}
            <Card className="flex-1 flex flex-col overflow-hidden">
              <CardHeader className="py-3 border-b flex-shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    {chatThreadId ? "Chat Session" : "Start a Conversation"}
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={startNewChat}
                    disabled={isChatLoading || ((!useOrgResourceSet || !orgResourceSet) && (!chatFilters.projectName || !chatFilters.customSubdomain))}
                    data-testid="button-new-chat"
                  >
                    <PlusCircle className="h-4 w-4 mr-2" />
                    New Chat
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden flex flex-col p-0">
                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {isChatLoading && !chatThreadId ? (
                    <div className="h-full flex flex-col items-center justify-center text-center">
                      <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                      <h3 className="font-medium text-lg mb-2">Preparing New Chat</h3>
                      <p className="text-sm text-muted-foreground max-w-md">
                        Setting up your chat session, please wait...
                      </p>
                    </div>
                  ) : !chatThreadId ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
                      <Sparkles className="h-12 w-12 mb-4 opacity-50" />
                      <h3 className="font-medium text-lg mb-2">Welcome to Chat Playground</h3>
                      <p className="text-sm max-w-md">
                        Select a Hub, Project, and Agent above, then click "New Chat" to start asking questions about your documents.
                      </p>
                    </div>
                  ) : chatMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
                      <MessageSquare className="h-12 w-12 mb-4 opacity-50" />
                      <h3 className="font-medium text-lg mb-2">Chat Started</h3>
                      <p className="text-sm max-w-md">
                        Ask a question about the documents in your vector store.
                      </p>
                    </div>
                  ) : (
                    chatMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        {message.role === "assistant" && (
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Sparkles className="h-4 w-4 text-primary" />
                          </div>
                        )}
                        <div
                          className={`max-w-[80%] rounded-lg px-4 py-2 ${
                            message.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          {message.attachments && message.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {message.attachments.map((att) => (
                                <Badge 
                                  key={att.fileId} 
                                  variant="outline" 
                                  className="text-xs bg-background/20"
                                >
                                  <File className="h-3 w-3 mr-1" />
                                  {att.filename}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {message.role === "assistant" ? (
                            <MarkdownMessage 
                              content={message.content} 
                              className="text-sm"
                              data-testid={`text-chat-message-${message.id}`}
                            />
                          ) : (
                            <p className="whitespace-pre-wrap text-sm" data-testid={`text-chat-message-${message.id}`}>
                              {message.content}
                            </p>
                          )}
                          {message.citations && message.citations.length > 0 && (
                            <div className="mt-3 pt-2 border-t border-border/50">
                              <p className="text-xs font-medium text-muted-foreground mb-1">Sources:</p>
                              <div className="flex flex-wrap gap-1">
                                {/* Deduplicate citations by fileId (primary) or index (fallback) */}
                                {(() => {
                                  const seen = new Set<string>();
                                  return message.citations.filter(citation => {
                                    // Use fileId as unique key to properly deduplicate, fallback to index
                                    const key = citation.fileId || String(citation.index);
                                    if (seen.has(key)) return false;
                                    seen.add(key);
                                    return true;
                                  }).map((citation, displayIndex) => (
                                    <Badge 
                                      key={citation.fileId || citation.index} 
                                      variant="outline" 
                                      className="text-xs cursor-help max-w-[250px]"
                                      title={citation.quote ? `"${citation.quote}"` : (citation.filename || `Source ${displayIndex + 1}`)}
                                    >
                                      <File className="h-3 w-3 mr-1 flex-shrink-0" />
                                      <span className="truncate">
                                        {citation.filename || `Source ${displayIndex + 1}`}
                                      </span>
                                    </Badge>
                                  ));
                                })()}
                              </div>
                            </div>
                          )}
                        </div>
                        {message.role === "user" && (
                          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                            <User className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  {isChatLoading && chatThreadId && (
                    <div className="flex gap-3 justify-start">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                      <div className="bg-muted rounded-lg px-4 py-3">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Input Area */}
                <div className="border-t p-4 flex-shrink-0">
                  {chatFileAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {chatFileAttachments.map((file) => (
                        <Badge 
                          key={file.fileId} 
                          variant="secondary" 
                          className="flex items-center gap-1 pr-1"
                        >
                          <File className="h-3 w-3" />
                          <span className="max-w-[150px] truncate">{file.filename}</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-4 w-4 ml-1"
                            onClick={() => removeChatFileAttachment(file.fileId)}
                            data-testid={`button-remove-file-${file.fileId}`}
                          >
                            <XCircle className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="file"
                      id="chat-file-upload"
                      className="hidden"
                      onChange={handleChatFileUpload}
                      multiple
                      accept=".txt,.pdf,.doc,.docx,.json,.csv,.md,.xml,.html"
                      disabled={!chatFilters.projectName || !chatFilters.customSubdomain || isUploadingFile}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => document.getElementById("chat-file-upload")?.click()}
                      disabled={!chatFilters.projectName || !chatFilters.customSubdomain || isUploadingFile}
                      data-testid="button-attach-file"
                      title="Attach files"
                    >
                      {isUploadingFile ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                    </Button>
                    <Input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendChatMessage();
                        }
                      }}
                      placeholder={chatThreadId ? "Ask a question about your files..." : "Start a new chat first..."}
                      disabled={!chatThreadId || isChatLoading || ((!useOrgResourceSet || !orgResourceSet?.defaultAgentId) && !chatFilters.agentId)}
                      data-testid="input-chat-message"
                      className="flex-1"
                    />
                    <Button
                      onClick={sendChatMessage}
                      disabled={!chatThreadId || !chatInput.trim() || isChatLoading || ((!useOrgResourceSet || !orgResourceSet?.defaultAgentId) && !chatFilters.agentId)}
                      data-testid="button-send-message"
                    >
                      {isChatLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {!chatFilters.agentId && chatThreadId && (
                    <p className="text-xs text-destructive mt-2">Please select an agent to send messages</p>
                  )}
                  {chatFilters.projectName && chatFilters.customSubdomain && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Attach files to ask questions about their content
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="resourcesets" className="flex-1 overflow-auto p-4 mt-0">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building className="h-5 w-5" />
                    Foundry Resource Sets
                  </CardTitle>
                  <CardDescription>
                    Configure default Azure AI Foundry settings for your organization
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchResourceSets()}
                    data-testid="button-refresh-resource-sets"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                  {canAdd && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setEditingResourceSet(null);
                        resetResourceSetForm();
                        setShowResourceSetDialog(true);
                      }}
                      data-testid="button-add-resource-set"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Resource Set
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!selectedOrganizationId ? (
                  <div className="text-center py-8">
                    <Building className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Please select an organization to view resource sets</p>
                  </div>
                ) : resourceSetsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <LoadingSpinner />
                  </div>
                ) : resourceSets.length === 0 ? (
                  <div className="text-center py-8">
                    <Cpu className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">
                      No resource set configured for this organization
                    </p>
                    {canAdd && (
                      <Button
                        onClick={() => {
                          setEditingResourceSet(null);
                          resetResourceSetForm();
                          setShowResourceSetDialog(true);
                        }}
                        data-testid="button-add-first-resource-set"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Configure Resource Set
                      </Button>
                    )}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Organization</TableHead>
                        <TableHead>Linked Resource</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resourceSets.map((rs: any) => (
                        <TableRow key={rs.id} data-testid={`row-resource-set-${rs.id}`}>
                          <TableCell className="font-medium">{rs.name}</TableCell>
                          <TableCell>
                            <span className="text-sm">{rs.organizationName || `Org #${rs.organizationId}`}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">{rs.resourceName || `Resource #${rs.foundryResourceId}`}</span>
                              {rs.hubName && (
                                <span className="text-xs text-muted-foreground">
                                  Hub: {rs.hubName}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {(rs.effectiveAgentId || rs.defaultAgentId) ? (
                              <div className="flex flex-col">
                                <span className="truncate max-w-[150px] inline-block">
                                  {rs.effectiveAgentName || rs.effectiveAgentId || rs.defaultAgentId}
                                </span>
                                {!rs.defaultAgentId && rs.effectiveAgentId && (
                                  <span className="text-xs text-muted-foreground">(from resource)</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Not set</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={rs.status === "completed" ? "default" : "secondary"}>
                              {rs.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditResourceSetDialog(rs)}
                                data-testid={`button-edit-resource-set-${rs.id}`}
                              >
                                <Settings className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (confirm("Are you sure you want to delete this resource set?")) {
                                    deleteResourceSetMutation.mutate(rs.id);
                                  }
                                }}
                                disabled={deleteResourceSetMutation.isPending}
                                data-testid={`button-delete-resource-set-${rs.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Content Understanding Tab */}
        <TabsContent value="contentunderstanding" className="flex-1 min-h-0 overflow-auto p-4 mt-0">
          <div className="max-w-4xl mx-auto space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    Content Understanding Configuration
                </CardTitle>
                <CardDescription>
                  Connect your Foundry resources and deploy the required models for Content Understanding capabilities
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Resource Selection */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Select Foundry Resource</Label>
                    <p className="text-xs text-muted-foreground">
                      Choose an existing Foundry resource to enable Content Understanding. The required models will be deployed to this resource.
                    </p>
                    <Select
                      value={contentUnderstandingConfig.selectedResourceId?.toString() || ""}
                      onValueChange={(value) => {
                        const resourceId = parseInt(value);
                        const resource = orgLinkedResources.find(r => r.id === resourceId);
                        // Reset deployment state when switching resources
                        setContentUnderstandingConfig(prev => ({
                          ...prev,
                          selectedResourceId: resourceId,
                          hubName: resource?.resourceName || "",
                          customSubdomain: resource?.customSubdomain || resource?.resourceName || "",
                          resourceGroup: resource?.resourceGroup || "",
                          gpt41DeploymentName: "",
                          gpt41MiniDeploymentName: "",
                          embeddingDeploymentName: "",
                          gpt41Deployed: false,
                          gpt41MiniDeployed: false,
                          embeddingDeployed: false,
                        }));
                        // Check for existing deployments
                        if (resource?.resourceGroup && resource?.resourceName) {
                          checkExistingDeployments(resource.resourceGroup, resource.resourceName);
                        }
                      }}
                      disabled={isCheckingDeployments}
                    >
                      <SelectTrigger data-testid="select-cu-resource">
                        <SelectValue placeholder="Select a Foundry resource" />
                      </SelectTrigger>
                      <SelectContent>
                        {orgLinkedResourcesLoading ? (
                          <SelectItem value="_loading" disabled>Loading resources...</SelectItem>
                        ) : orgLinkedResources.length === 0 ? (
                          <SelectItem value="_empty" disabled>No resources linked to this organization</SelectItem>
                        ) : (
                          orgLinkedResources.map((resource) => (
                            <SelectItem key={resource.id} value={resource.id.toString()}>
                              {resource.resourceName} ({resource.status})
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {contentUnderstandingConfig.selectedResourceId && (
                    <div className="p-4 rounded-md border bg-muted/50 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Cpu className="h-4 w-4 text-primary" />
                          <span className="font-medium">Required Models</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const resource = orgLinkedResources.find(r => r.id === contentUnderstandingConfig.selectedResourceId);
                            if (resource) checkExistingDeployments(resource.resourceGroup, resource.resourceName);
                          }}
                          disabled={isCheckingDeployments}
                          data-testid="button-refresh-cu-status"
                          className="h-7 px-2 text-xs text-muted-foreground"
                        >
                          {isCheckingDeployments ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          <span className="ml-1">{isCheckingDeployments ? "Checking…" : "Refresh Status"}</span>
                        </Button>
                      </div>

                      {/* Per-Model Status Rows */}
                      {(() => {
                        const modelRows = [
                          {
                            key: 'gpt41' as const,
                            label: 'GPT-4.1',
                            description: 'Primary language model for analysis',
                            deployed: contentUnderstandingConfig.gpt41Deployed,
                            deploymentName: contentUnderstandingConfig.gpt41DeploymentName || 'gpt-4-1',
                          },
                          {
                            key: 'gpt41mini' as const,
                            label: 'GPT-4.1 Mini',
                            description: 'Lightweight model for fast extraction tasks',
                            deployed: contentUnderstandingConfig.gpt41MiniDeployed,
                            deploymentName: contentUnderstandingConfig.gpt41MiniDeploymentName || 'gpt-4-1-mini',
                          },
                          {
                            key: 'embedding' as const,
                            label: 'Text Embedding 3 Large',
                            description: 'Required for semantic search and vector indexing',
                            deployed: contentUnderstandingConfig.embeddingDeployed,
                            deploymentName: contentUnderstandingConfig.embeddingDeploymentName || 'text-embedding-3-large',
                          },
                        ];
                        return (
                          <div className="divide-y rounded-md border overflow-hidden">
                            {modelRows.map((model) => {
                              const isThisDeploying = deployingModelKey === model.key && isDeployingModels;
                              return (
                                <div
                                  key={model.key}
                                  className="flex items-center justify-between px-3 py-2.5 bg-background"
                                  data-testid={`model-row-${model.key}`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    {model.deployed ? (
                                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                    ) : isThisDeploying ? (
                                      <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                                    ) : (
                                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                                    )}
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium leading-none">{model.label}</p>
                                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{model.description}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 ml-3">
                                    {model.deployed ? (
                                      <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-xs">
                                        Deployed
                                      </Badge>
                                    ) : (
                                      <>
                                        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-xs">
                                          {isThisDeploying ? "Deploying…" : "Missing"}
                                        </Badge>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 px-2 text-xs"
                                          onClick={() => handleDeployModel(model.key)}
                                          disabled={isDeployingModels || isCheckingDeployments}
                                          data-testid={`button-retry-${model.key}`}
                                        >
                                          {isThisDeploying ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                          ) : (
                                            <RefreshCw className="h-3 w-3" />
                                          )}
                                          <span className="ml-1">{isThisDeploying ? "Deploying" : "Deploy"}</span>
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {/* Deploy Missing Models Button - only shown when at least one model is missing */}
                      {!(contentUnderstandingConfig.gpt41Deployed && contentUnderstandingConfig.gpt41MiniDeployed && contentUnderstandingConfig.embeddingDeployed) && (
                        <div className="pt-1">
                          <Button
                            onClick={handleDeployCuModels}
                            disabled={isDeployingModels || isCheckingDeployments}
                            className="w-full"
                            data-testid="button-deploy-cu-models"
                          >
                            {isDeployingModels && !deployingModelKey ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Deploying Missing Models…
                              </>
                            ) : (
                              <>
                                <Layers className="h-4 w-4 mr-2" />
                                {[contentUnderstandingConfig.gpt41Deployed, contentUnderstandingConfig.gpt41MiniDeployed, contentUnderstandingConfig.embeddingDeployed].some(Boolean)
                                  ? "Deploy Missing Models"
                                  : "Deploy All Required Models"}
                              </>
                            )}
                          </Button>
                          <p className="text-xs text-muted-foreground mt-1.5 text-center">
                            {[contentUnderstandingConfig.gpt41Deployed, contentUnderstandingConfig.gpt41MiniDeployed, contentUnderstandingConfig.embeddingDeployed].some(Boolean)
                              ? "Already deployed models will be skipped — only missing ones will be deployed"
                              : "Deploys all required models and configures Content Understanding automatically"}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Status Summary */}
                {contentUnderstandingConfig.selectedResourceId && (
                  <div className="p-4 rounded-md border">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Content Understanding Status</p>
                        <p className="text-sm text-muted-foreground">
                          {contentUnderstandingConfig.gpt41Deployed && contentUnderstandingConfig.gpt41MiniDeployed && contentUnderstandingConfig.embeddingDeployed
                            ? "All 3 required models are deployed. Content Understanding is ready to use."
                            : "One or more required models are missing. Deploy them above to enable Content Understanding."}
                        </p>
                      </div>
                      {contentUnderstandingConfig.gpt41Deployed && contentUnderstandingConfig.gpt41MiniDeployed && contentUnderstandingConfig.embeddingDeployed ? (
                        <Badge variant="default" className="bg-green-600">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Ready
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Incomplete
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Resource Set Dialog */}
      <Dialog open={showResourceSetDialog} onOpenChange={(open) => {
        setShowResourceSetDialog(open);
        if (!open) {
          setEditingResourceSet(null);
          resetResourceSetForm();
        }
      }}>
        <DialogContent 
          className="sm:max-w-[550px] max-h-[90vh] flex flex-col"
          onPointerDownOutside={(e) => {
            e.preventDefault();
            toast({
              title: "Dialog Protection",
              description: createResourceSetMutation.isPending || updateResourceSetMutation.isPending
                ? "Please wait for the operation to complete. You cannot close this window during save."
                : "Please use the X button to close this dialog to avoid losing your work.",
              variant: "default",
            });
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            toast({
              title: "Dialog Protection",
              description: createResourceSetMutation.isPending || updateResourceSetMutation.isPending
                ? "Please wait for the operation to complete. You cannot close this window during save."
                : "Please use the X button to close this dialog to avoid losing your work.",
              variant: "default",
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {editingResourceSet ? "Edit Resource Set" : "Create Resource Set"}
            </DialogTitle>
            <DialogDescription>
              Configure Azure AI Foundry connection settings for chat playground
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto pr-2 space-y-4 max-h-[60vh]">
            <div className="grid gap-2">
              <Label htmlFor="rs-organization">Organization</Label>
              {editingResourceSet ? (
                <div className="p-2 border rounded-md bg-muted text-sm">
                  {userOrganizations.find(o => o.id === resourceSetFormData.organizationId)?.name || 
                   `Organization ID: ${resourceSetFormData.organizationId}`}
                  <p className="text-xs text-muted-foreground mt-1">
                    Organization cannot be changed after creation
                  </p>
                </div>
              ) : (
                <Select
                  value={resourceSetFormData.organizationId ? resourceSetFormData.organizationId.toString() : ""}
                  onValueChange={(value) => setResourceSetFormData(prev => ({ 
                    ...prev, 
                    organizationId: parseInt(value)
                  }))}
                >
                  <SelectTrigger data-testid="select-resource-set-organization">
                    <SelectValue placeholder="Select an organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {userOrganizations.map((org) => (
                      <SelectItem key={org.id} value={org.id.toString()}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {!editingResourceSet && userOrganizations.length === 0 && (
                <p className="text-xs text-amber-600">
                  No organizations available. Contact your administrator.
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rs-name">Name</Label>
              <Input
                id="rs-name"
                value={resourceSetFormData.name}
                onChange={(e) => setResourceSetFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Production AI Config"
                data-testid="input-resource-set-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rs-resource">Foundry Resource</Label>
              {editingResourceSet ? (
                <div className="p-2 border rounded-md bg-muted text-sm">
                  {availableFoundryResources.find(r => r.id === resourceSetFormData.foundryResourceId)?.resourceName || 
                   `Resource ID: ${resourceSetFormData.foundryResourceId}`}
                  <p className="text-xs text-muted-foreground mt-1">
                    Resource cannot be changed after creation
                  </p>
                </div>
              ) : (
                <Select
                  value={resourceSetFormData.foundryResourceId ? resourceSetFormData.foundryResourceId.toString() : ""}
                  onValueChange={(value) => setResourceSetFormData(prev => ({ 
                    ...prev, 
                    foundryResourceId: parseInt(value),
                    defaultAgentId: "",
                    defaultVectorStoreId: ""
                  }))}
                  disabled={isResourcesLoading}
                >
                  <SelectTrigger data-testid="select-resource-set-resource">
                    {isResourcesLoading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading resources...</span>
                      </div>
                    ) : (
                      <SelectValue placeholder="Select a Foundry resource" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {availableFoundryResources
                      .filter(r => r.status === "completed" && (!linkedResourceIds.has(r.id) || r.sharedAcrossOrgs))
                      .map((resource) => (
                        <SelectItem key={resource.id} value={resource.id.toString()}>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span>{resource.resourceName}</span>
                              {resource.sharedAcrossOrgs && linkedResourceIds.has(resource.id) && (
                                <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">Shared</span>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {resource.projectName} - {resource.location}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
              {!editingResourceSet && foundryResourcesError && (
                <p className="text-xs text-red-600">
                  Error loading resources: {(foundryResourcesError as Error).message}
                </p>
              )}
              {!editingResourceSet && !foundryResourcesError && availableFoundryResources.filter(r => r.status === "completed" && (!linkedResourceIds.has(r.id) || r.sharedAcrossOrgs)).length === 0 && !isResourcesLoading && (
                <p className="text-xs text-amber-600">
                  {availableFoundryResources.filter(r => r.status === "completed").length > 0
                    ? "All active Foundry resources are already linked and none allow sharing. Create a new resource using the Wizard tab, or enable sharing on an existing resource."
                    : "No active Foundry resources found. Create one using the Wizard tab first."}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rs-agent">Default Agent (Optional)</Label>
              {!selectedFoundryResource ? (
                <p className="text-xs text-muted-foreground">Select a Foundry resource first to load available agents</p>
              ) : resourceSetAgentsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading agents...</span>
                </div>
              ) : (
                <Select
                  value={resourceSetFormData.defaultAgentId}
                  onValueChange={(value) => setResourceSetFormData(prev => ({ ...prev, defaultAgentId: value === "_none_" ? "" : value }))}
                >
                  <SelectTrigger data-testid="select-resource-set-agent">
                    <SelectValue placeholder="Select an agent (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none_">No agent selected</SelectItem>
                    {resourceSetAgentsList.map((agent: any) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name || agent.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedFoundryResource && !resourceSetAgentsLoading && resourceSetAgentsList.length === 0 && (
                <p className="text-xs text-amber-600">No agents found for this resource. Create an agent in Azure first.</p>
              )}
              <p className="text-xs text-muted-foreground">
                The agent to use for Chat Playground when using organization config
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rs-vectorstore">Default Vector Store (Optional)</Label>
              {!selectedFoundryResource ? (
                <p className="text-xs text-muted-foreground">Select a Foundry resource first to load available vector stores</p>
              ) : resourceSetVectorStoresLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading vector stores...</span>
                </div>
              ) : (
                <Select
                  value={resourceSetFormData.defaultVectorStoreId}
                  onValueChange={(value) => setResourceSetFormData(prev => ({ ...prev, defaultVectorStoreId: value === "_none_" ? "" : value }))}
                >
                  <SelectTrigger data-testid="select-resource-set-vectorstore">
                    <SelectValue placeholder="Select a vector store (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none_">No vector store selected</SelectItem>
                    {resourceSetVectorStoresList.map((vs: any) => (
                      <SelectItem key={vs.id} value={vs.id}>
                        {vs.name || vs.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedFoundryResource && !resourceSetVectorStoresLoading && resourceSetVectorStoresList.length === 0 && (
                <p className="text-xs text-amber-600">No vector stores found for this resource.</p>
              )}
              <p className="text-xs text-muted-foreground">
                The vector store to use for Chat Playground when using organization config
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rs-notes">Notes (Optional)</Label>
              <Input
                id="rs-notes"
                value={resourceSetFormData.notes}
                onChange={(e) => setResourceSetFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes..."
                data-testid="input-resource-set-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowResourceSetDialog(false);
                setEditingResourceSet(null);
                resetResourceSetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleResourceSetSubmit}
              disabled={
                !resourceSetFormData.organizationId ||
                !resourceSetFormData.name || 
                !resourceSetFormData.foundryResourceId ||
                createResourceSetMutation.isPending ||
                updateResourceSetMutation.isPending
              }
              data-testid="button-save-resource-set"
            >
              {(createResourceSetMutation.isPending || updateResourceSetMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingResourceSet ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Deployment Dialog */}
      <Dialog open={showAddDeploymentDialog} onOpenChange={setShowAddDeploymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Deployment</DialogTitle>
            <DialogDescription>
              Deploy a new model to {resourceFilters.hubName}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="deployment-name">Deployment Name</Label>
              <Input
                id="deployment-name"
                value={newDeploymentName}
                onChange={(e) => setNewDeploymentName(e.target.value)}
                placeholder="e.g., gpt-4o-deployment"
                data-testid="input-new-deployment-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="model-name">Model</Label>
              <Select
                value={newDeploymentModel}
                onValueChange={setNewDeploymentModel}
              >
                <SelectTrigger data-testid="select-new-deployment-model">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                  <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                  <SelectItem value="gpt-4">GPT-4</SelectItem>
                  <SelectItem value="gpt-35-turbo">GPT-3.5 Turbo</SelectItem>
                  <SelectItem value="text-embedding-ada-002">Text Embedding Ada 002</SelectItem>
                  <SelectItem value="text-embedding-3-small">Text Embedding 3 Small</SelectItem>
                  <SelectItem value="text-embedding-3-large">Text Embedding 3 Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddDeploymentDialog(false);
                setNewDeploymentName("");
                setNewDeploymentModel("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => addDeploymentMutation.mutate({ 
                deploymentName: newDeploymentName, 
                modelName: newDeploymentModel 
              })}
              disabled={!newDeploymentName || !newDeploymentModel || addDeploymentMutation.isPending}
              data-testid="button-confirm-add-deployment"
            >
              {addDeploymentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Deployment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Vector Store Dialog */}
      <Dialog open={showAddVectorStoreDialog} onOpenChange={setShowAddVectorStoreDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Vector Store</DialogTitle>
            <DialogDescription>
              Create a new vector store for project {resourceFilters.projectName?.split("/").pop()}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="vector-store-name">Vector Store Name</Label>
              <Input
                id="vector-store-name"
                value={newVectorStoreName}
                onChange={(e) => setNewVectorStoreName(e.target.value)}
                placeholder="e.g., my-vector-store"
                data-testid="input-new-vector-store-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddVectorStoreDialog(false);
                setNewVectorStoreName("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => addVectorStoreMutation.mutate({ name: newVectorStoreName })}
              disabled={!newVectorStoreName || addVectorStoreMutation.isPending}
              data-testid="button-confirm-add-vector-store"
            >
              {addVectorStoreMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Vector Store
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attach Vector Store to Agent Dialog */}
      <Dialog open={showAttachVectorStoreDialog} onOpenChange={setShowAttachVectorStoreDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach Vector Store to Agent</DialogTitle>
            <DialogDescription>
              Select a vector store to attach to agent: {selectedAgentForAttach?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="attach-vector-store">Vector Store</Label>
              <Select
                value={selectedVectorStoreForAttach}
                onValueChange={setSelectedVectorStoreForAttach}
              >
                <SelectTrigger data-testid="select-attach-vector-store">
                  <SelectValue placeholder="Select a vector store" />
                </SelectTrigger>
                <SelectContent>
                  {vectorStoresList.map((vs: any) => (
                    <SelectItem key={vs.id} value={vs.id}>
                      {vs.name || vs.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAttachVectorStoreDialog(false);
                setSelectedAgentForAttach(null);
                setSelectedVectorStoreForAttach("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedAgentForAttach && selectedVectorStoreForAttach) {
                  attachVectorStoreToAgentMutation.mutate({
                    agentId: selectedAgentForAttach.id,
                    vectorStoreId: selectedVectorStoreForAttach,
                  });
                }
              }}
              disabled={!selectedVectorStoreForAttach || attachVectorStoreToAgentMutation.isPending}
              data-testid="button-confirm-attach-vector-store"
            >
              {attachVectorStoreToAgentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Attach Vector Store
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Resource Confirmation Dialog */}
      <AlertDialog open={showDeleteResourceDialog} onOpenChange={(open) => {
        if (!open && !isDeletingResource) {
          setShowDeleteResourceDialog(false);
          setResourceToDelete(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Foundry Resource
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to delete <strong>{resourceToDelete?.resourceName}</strong>?
              </p>
              {resourceToDelete && isPartialResource(resourceToDelete) && (
                <div className="p-2 rounded-md bg-muted">
                  <p className="text-sm font-medium">
                    Status: {getResourceStatusBadge(resourceToDelete).label}
                  </p>
                  {resourceToDelete.lastError && (
                    <p className="text-xs text-destructive mt-1">
                      Last error: {resourceToDelete.lastError}
                    </p>
                  )}
                </div>
              )}
              <p className="text-sm">
                The following Azure resources will be cleaned up (in reverse dependency order):
              </p>
              <ul className="text-sm list-disc list-inside ml-2 space-y-1">
                {resourceToDelete?.agentId && (
                  <li>Agent: <strong>{resourceToDelete.agentName || resourceToDelete.agentId}</strong></li>
                )}
                {resourceToDelete?.vectorStoreId && (
                  <li>Vector Store: <strong>{resourceToDelete.vectorStoreId}</strong></li>
                )}
                {resourceToDelete?.projectName && (
                  <li>Project: <strong>{resourceToDelete.projectName}</strong></li>
                )}
                {resourceToDelete?.hubName && (
                  <li>Hub: <strong>{resourceToDelete.hubName}</strong></li>
                )}
                {(!resourceToDelete?.hubName && !resourceToDelete?.projectName && !resourceToDelete?.agentId && !resourceToDelete?.vectorStoreId) && (
                  <li className="text-muted-foreground">No Azure resources created yet (draft status)</li>
                )}
              </ul>
              <p className="text-sm text-destructive font-medium mt-2">
                This action cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingResource}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteResource();
              }}
              disabled={isDeletingResource}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-resource"
            >
              {isDeletingResource ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Resource
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Error Dialog - displays errors in the center of the page requiring explicit acknowledgment */}
      <AlertDialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {errorDialogContent.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left whitespace-pre-wrap">
              {errorDialogContent.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction 
              onClick={() => setShowErrorDialog(false)}
              data-testid="button-dismiss-error"
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
