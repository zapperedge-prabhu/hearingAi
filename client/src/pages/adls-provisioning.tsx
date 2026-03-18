import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useRolePermissions } from "@/hooks/use-role-permissions";
import { 
  Database, 
  Plus, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Lock,
  Trash2,
  Settings,
  Search,
  X,
  ChevronUp,
  ChevronDown,
  Key,
  Shield,
  ShieldCheck,
  ShieldOff
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

interface Organization {
  id: number;
  name: string;
  description?: string;
}

interface AdlsStorageAccount {
  id: number;
  name: string;
  location: string;
  container: string;
  resourceGroupName?: string;
  organizationId: number;
  organizationName?: string;
  kind?: 'blob' | 'adls';
  createdAt: string;
  sftpEnabled?: boolean;
}

interface ResourceGroup {
  name: string;
  location: string;
  isDefault: boolean;
}

interface KeyVaultKey {
  name: string;
  id: string;
  keyType: string;
  enabled: boolean;
  createdOn?: string;
  keyUri: string;
  keyUriWithVersion: string;
}

interface CmkStatus {
  storageAccountName: string;
  cmkEnabled: boolean;
  keySource: string;
  cmkDetails: {
    keyVaultUri: string;
    keyName: string;
    keyVersion: string;
  } | null;
  identity: string | null;
  identityPrincipalId: string | null;
}

const AZURE_REGIONS = [
  { value: "centralindia", label: "Central India" },
  { value: "eastus", label: "East US" },
  { value: "eastus2", label: "East US 2" },
  { value: "westus", label: "West US" },
  { value: "westus2", label: "West US 2" },
  { value: "westeurope", label: "West Europe" },
  { value: "northeurope", label: "North Europe" },
  { value: "southeastasia", label: "Southeast Asia" },
  { value: "eastasia", label: "East Asia" },
];

const adlsSchema = z.object({
  rgName: z.string()
    .min(2, "Resource group name must be at least 2 characters")
    .max(90, "Resource group name must be 90 characters or less")
    .regex(/^[a-zA-Z0-9._-]+$/, "Invalid resource group name"),
  storageAccountName: z.string()
    .min(3, "Storage account name must be at least 3 characters")
    .max(24, "Storage account name must be 24 characters or less")
    .regex(/^[a-z0-9]+$/, "Storage account name can only contain lowercase letters and numbers"),
  filesystemName: z.string()
    .min(3, "Filesystem name must be at least 3 characters")
    .max(63, "Filesystem name must be 63 characters or less")
    .regex(/^[a-z0-9-]+$/, "Filesystem name can only contain lowercase letters, numbers, and hyphens"),
  location: z.string().min(1, "Location is required"),
  organizationId: z.number().min(1, "Organization is required"),
  createNewResourceGroup: z.boolean().default(false),
  useExistingStorageAccount: z.boolean().default(false),
  existingStorageAccountId: z.number().optional(),
});

type AdlsFormData = z.infer<typeof adlsSchema>;

export default function AdlsProvisioning() {
  const { toast } = useToast();
  
  // Get current user's role permissions
  const { data: rolePermissions, isLoading: permissionsLoading } = useRolePermissions();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creationStatus, setCreationStatus] = useState<{
    step: 'idle' | 'validating' | 'resource-group' | 'storage-account' | 'filesystem' | 'cors' | 'database' | 'success' | 'error';
    message: string;
    progress: number;
  }>({
    step: 'idle',
    message: '',
    progress: 0
  });
  const [createNewRg, setCreateNewRg] = useState(false);
  const [useExistingAccount, setUseExistingAccount] = useState(false);
  const [sftpDialogOpen, setSftpDialogOpen] = useState(false);
  const [selectedAdlsAccount, setSelectedAdlsAccount] = useState<AdlsStorageAccount | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortField, setSortField] = useState<"name" | "location" | "created">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  
  // Delete state - track which specific account is being deleted
  const [deletingAccountId, setDeletingAccountId] = useState<number | null>(null);
  
  // CMK state
  const [cmkDialogOpen, setCmkDialogOpen] = useState(false);
  const [cmkStorageAccount, setCmkStorageAccount] = useState<AdlsStorageAccount | null>(null);
  const [selectedKeyName, setSelectedKeyName] = useState<string>("");
  const [newKeyName, setNewKeyName] = useState<string>("");
  const [isCreatingKey, setIsCreatingKey] = useState(false);

  const form = useForm<AdlsFormData>({
    resolver: zodResolver(adlsSchema),
    defaultValues: {
      rgName: "rg_zapper_adls",
      storageAccountName: "",
      filesystemName: "data",
      location: "centralindia",
      organizationId: 0,
      createNewResourceGroup: false,
      useExistingStorageAccount: false,
      existingStorageAccountId: undefined,
    },
  });

  const { data: adlsStorageAccounts, isLoading } = useQuery<AdlsStorageAccount[]>({
    queryKey: ["/api/adls-storage-accounts"],
  });

  const { data: organizations } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const { data: resourceGroups } = useQuery<ResourceGroup[]>({
    queryKey: ["/api/azure/resource-groups"],
  });

  // Fetch existing storage accounts (both blob and ADLS) that can be used for container creation
  const { data: existingStorageAccounts } = useQuery<AdlsStorageAccount[]>({
    queryKey: ["/api/storage-accounts/all"],
  });

  // Filter organizations that don't already have a storage account association
  // RULE: One organization can only have ONE storage account + container association
  const availableOrganizations = useMemo(() => {
    if (!organizations || !adlsStorageAccounts) return [];

    // Get organization IDs that already have storage accounts
    const orgsWithStorage = new Set(
      adlsStorageAccounts
        .filter(acc => acc.organizationId)
        .map(acc => acc.organizationId)
    );

    const selectedOrgId = form.getValues("organizationId");

    return organizations.filter(org => {
      // If it's the currently selected organization in the form, show it
      if (org.id === selectedOrgId) return true;
      // Otherwise, only show if it doesn't have storage
      return !orgsWithStorage.has(org.id);
    });
  }, [organizations, adlsStorageAccounts, form.watch("organizationId")]);

  const createAdlsMutation = useMutation({
    mutationFn: async (data: AdlsFormData) => {
      // Step 1: Validating input
      setCreationStatus({
        step: 'validating',
        message: 'Validating ADLS Gen2 configuration...',
        progress: 5
      });
      
      await new Promise(resolve => setTimeout(resolve, 600)); // Brief delay for UX
      
      // Step 2: Resource Group creation/verification
      setCreationStatus({
        step: 'resource-group', 
        message: data.createNewResourceGroup ? 'Creating resource group...' : 'Verifying resource group...',
        progress: 20
      });
      
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Step 3: Storage Account creation
      setCreationStatus({
        step: 'storage-account',
        message: data.useExistingStorageAccount ? 'Using existing storage account...' : 'Creating  storage account...',
        progress: 40
      });
      
      // Make the actual API call
      const response = await apiRequest("POST", `/api/organizations/${data.organizationId}/provision-adls`, data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create ADLS storage");
      }
      
      // Step 4: Filesystem creation
      setCreationStatus({
        step: 'filesystem',
        message: 'Creating filesystem container...',
        progress: 60
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Step 5: CORS configuration
      setCreationStatus({
        step: 'cors',
        message: 'Configuring CORS and access policies...',
        progress: 80
      });
      
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Step 6: Database storage
      setCreationStatus({
        step: 'database',
        message: 'Storing configuration in database...',
        progress: 95
      });
      
      const result = await response.json();
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Step 7: Success
      setCreationStatus({
        step: 'success',
        message: 'storage created successfully!',
        progress: 100
      });
      
      return result;
    },
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/adls-storage-accounts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/storage-accounts/all"] });
        setCreateDialogOpen(false);
        form.reset();
        setCreationStatus({ step: 'idle', message: '', progress: 0 });
        toast({
          title: "Success",
          description: "storage created successfully",
        });
      }, 1500); // Show success state briefly before closing
    },
    onError: (error: Error) => {
      setCreationStatus({
        step: 'error',
        message: error.message,
        progress: 0
      });
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      // Don't auto-reset error state - let user read the message and close manually
    },
  });

  const deleteAdlsMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/adls-storage-accounts/${id}`);
      if (!response.ok) {
        throw new Error("Failed to delete ADLS storage account");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/adls-storage-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/storage-accounts/all"] });
      toast({
        title: "Success",
        description: "ADLS storage account deleted successfully",
      });
      setDeletingAccountId(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete storage account",
        variant: "destructive",
      });
      setDeletingAccountId(null);
    },
  });

  const onSubmit = (data: AdlsFormData) => {
    createAdlsMutation.mutate(data);
  };

  const handleDeleteStorage = (id: number) => {
    if (window.confirm("Are you sure you want to delete this storage account? This action cannot be undone.")) {
      setDeletingAccountId(id);
      deleteAdlsMutation.mutate(id);
    }
  };

  const handleSftpConfig = (account: AdlsStorageAccount) => {
    setSelectedAdlsAccount(account);
    setSftpDialogOpen(true);
  };

  // Fetch SFTP config for selected storage account
  const { data: sftpConfig, isLoading: sftpLoading } = useQuery<{ isEnabled: boolean }>({
    queryKey: [`/api/adls-storage-accounts/${selectedAdlsAccount?.name}/sftp`],
    enabled: !!selectedAdlsAccount?.name,
  });

  // SFTP toggle mutation
  const sftpToggleMutation = useMutation({
    mutationFn: async ({ storageAccountName, enable }: { storageAccountName: string, enable: boolean }) => {
      return apiRequest("PUT", `/api/adls-storage-accounts/${storageAccountName}/sftp`, {
        enabled: enable
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/adls-storage-accounts/${selectedAdlsAccount?.name}/sftp`] });
      queryClient.invalidateQueries({ queryKey: ["/api/adls-storage-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-activities"] });
      toast({
        title: "Success",
        description: `SFTP ${sftpConfig?.isEnabled ? 'disabled' : 'enabled'} successfully`,
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

  const handleSftpToggle = () => {
    if (selectedAdlsAccount) {
      sftpToggleMutation.mutate({
        storageAccountName: selectedAdlsAccount.name,
        enable: !sftpConfig?.isEnabled
      });
    }
  };

  // CMK queries
  const { data: keyVaultKeys, isLoading: keysLoading, refetch: refetchKeys } = useQuery<{ keyVaultUrl: string; keys: KeyVaultKey[] }>({
    queryKey: ["/api/keyvault/keys"],
    enabled: cmkDialogOpen,
  });

  const { data: cmkStatus, isLoading: cmkStatusLoading, refetch: refetchCmkStatus } = useQuery<CmkStatus>({
    queryKey: [`/api/storage-accounts/${cmkStorageAccount?.name}/cmk`],
    enabled: !!cmkStorageAccount?.name && cmkDialogOpen,
  });

  // CMK mutations
  const createKeyMutation = useMutation({
    mutationFn: async (keyName: string) => {
      const response = await apiRequest("POST", "/api/keyvault/keys", { keyName, keySize: 2048 });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Encryption key created successfully" });
      refetchKeys();
      setNewKeyName("");
      setIsCreatingKey(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to create key", variant: "destructive" });
    },
  });

  const enableCmkMutation = useMutation({
    mutationFn: async ({ storageAccountName, keyName }: { storageAccountName: string; keyName: string }) => {
      const response = await apiRequest("POST", `/api/storage-accounts/${storageAccountName}/cmk/enable`, { keyName });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Customer-managed key encryption enabled" });
      refetchCmkStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/adls-storage-accounts"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to enable CMK", variant: "destructive" });
    },
  });

  const disableCmkMutation = useMutation({
    mutationFn: async (storageAccountName: string) => {
      const response = await apiRequest("POST", `/api/storage-accounts/${storageAccountName}/cmk/disable`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Switched to Microsoft-managed keys" });
      refetchCmkStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/adls-storage-accounts"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to disable CMK", variant: "destructive" });
    },
  });

  // CMK handlers
  const handleCmkConfig = (account: AdlsStorageAccount) => {
    setCmkStorageAccount(account);
    setSelectedKeyName("");
    setCmkDialogOpen(true);
  };

  const handleEnableCmk = () => {
    if (!cmkStorageAccount || !selectedKeyName) return;
    enableCmkMutation.mutate({ 
      storageAccountName: cmkStorageAccount.name, 
      keyName: selectedKeyName 
    });
  };

  const handleDisableCmk = () => {
    if (!cmkStorageAccount) return;
    disableCmkMutation.mutate(cmkStorageAccount.name);
  };

  const handleCreateKey = () => {
    if (!newKeyName.trim()) return;
    createKeyMutation.mutate(newKeyName.trim());
  };

  // Handle sorting
  const handleSort = (field: "name" | "location" | "created") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Filter by search query
  const filteredAccounts = searchQuery.trim() === ''
    ? (adlsStorageAccounts || [])
    : (adlsStorageAccounts || []).filter(account => {
        const searchLower = searchQuery.toLowerCase();
        return (
          account.name.toLowerCase().includes(searchLower) ||
          account.location.toLowerCase().includes(searchLower) ||
          account.container.toLowerCase().includes(searchLower) ||
          (account.resourceGroupName?.toLowerCase().includes(searchLower) ?? false) ||
          (account.organizationName?.toLowerCase().includes(searchLower) ?? false)
        );
      });

  // Sort filtered accounts
  const sortedAccounts = [...filteredAccounts].sort((a, b) => {
    let aValue: string, bValue: string;

    switch (sortField) {
      case "name":
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
        break;
      case "location":
        aValue = a.location.toLowerCase();
        bValue = b.location.toLowerCase();
        break;
      case "created":
        aValue = new Date(a.createdAt).getTime().toString();
        bValue = new Date(b.createdAt).getTime().toString();
        break;
      default:
        return 0;
    }

    if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
    if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const getStatusIcon = () => {
    switch (creationStatus.step) {
      case 'idle':
        return <Plus className="h-4 w-4" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      default:
        return <Loader2 className="h-4 w-4 animate-spin" />;
    }
  };

  // Check if user has ANY STORAGE_MANAGEMENT permission
  const hasStoragePermission = 
    rolePermissions?.storageMgmt?.view ||
    rolePermissions?.storageMgmt?.addStorageContainer ||
    rolePermissions?.storageMgmt?.addContainer ||
    rolePermissions?.storageMgmt?.delete;

  // Set document title
  useEffect(() => {
    document.title = "Storage Management";
  }, []);

  // Show loading while permissions are being fetched
  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Show access denied only after permissions are loaded
  if (!hasStoragePermission) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <Lock className="mx-auto h-12 w-12 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-bold">Access Denied</h1>
          <p className="mt-2 text-muted-foreground">
            You don't have permission to access Storage features.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-adls-provisioning">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Database className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-semibold text-gray-900" data-testid="text-page-title">
            Storage Management
          </h1>
        </div>
        {(rolePermissions?.storageMgmt?.addStorageContainer || rolePermissions?.storageMgmt?.addContainer) && (
          <Dialog open={createDialogOpen} onOpenChange={(open) => {
            // Prevent closing the dialog while storage is being created
            if (!open && createAdlsMutation.isPending) {
              toast({
                title: "Creation in Progress",
                description: "Please wait for the storage account creation to complete before closing this window.",
                variant: "default",
              });
              return;
            }
            
            setCreateDialogOpen(open);
            if (!open) {
              form.reset();
              setCreationStatus({ step: 'idle', message: '', progress: 0 });
            }
          }}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700" data-testid="button-open-create">
                <Plus className="w-4 h-4 mr-2" />
                {rolePermissions?.storageMgmt?.addStorageContainer ? "Add Storage" : "Add Container"}
              </Button>
            </DialogTrigger>
            <DialogContent 
              className="sm:max-w-[480px]"
              showClose={!createAdlsMutation.isPending}
              onPointerDownOutside={(e) => {
                e.preventDefault();
                toast({
                  title: "Dialog Protection",
                  description: createAdlsMutation.isPending
                    ? "Please wait for the storage account creation to complete. You cannot close this window during creation."
                    : "Please use the X button to close this dialog to avoid losing your work.",
                  variant: "default",
                });
              }}
              onEscapeKeyDown={(e) => {
                e.preventDefault();
                toast({
                  title: "Dialog Protection",
                  description: createAdlsMutation.isPending
                    ? "Please wait for the storage account creation to complete. You cannot close this window during creation."
                    : "Please use the X button to close this dialog to avoid losing your work.",
                  variant: "default",
                });
              }}
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {getStatusIcon()}
                  {creationStatus.step === 'idle' ? 'Create Storage' : 
                   creationStatus.step === 'success' ? 'Storage Created!' :
                   creationStatus.step === 'error' ? 'Creation Failed' :
                   'Creating Storage...'}
                </DialogTitle>
              </DialogHeader>

              {/* Progress Indicator */}
              {creationStatus.step !== 'idle' && creationStatus.step !== 'error' && (
                <div className="space-y-4 mb-6">
                  <div className="flex items-center space-x-3">
                    {creationStatus.step === 'success' ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                    )}
                    <span className="text-base font-medium text-gray-700 dark:text-gray-300">
                      {creationStatus.message}
                    </span>
                  </div>
                  
                  <Progress value={creationStatus.progress} className="h-2" />
                </div>
              )}

              {/* Error Display with Clickable Links */}
              {creationStatus.step === 'error' && (
                <div className="space-y-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border-2 border-red-300 dark:border-red-700 mb-6">
                  <div className="flex items-start space-x-2">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <p className="text-sm font-semibold text-red-900 dark:text-red-100">
                        Creation Failed
                      </p>
                      <div className="text-sm text-red-800 dark:text-red-200 space-y-2">
                        {creationStatus.message.split('\n\n').map((paragraph, idx) => {
                          // Check if paragraph contains URL
                          const urlMatch = paragraph.match(/(https?:\/\/[^\s]+)/);
                          if (urlMatch) {
                            const url = urlMatch[1];
                            const parts = paragraph.split(url);
                            return (
                              <p key={idx} className="leading-relaxed">
                                {parts[0]}
                                <a 
                                  href={url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline font-medium"
                                  data-testid={`link-error-documentation-${idx}`}
                                >
                                  {url}
                                </a>
                                {parts[1]}
                              </p>
                            );
                          }
                          return <p key={idx} className="leading-relaxed">{paragraph}</p>;
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Form */}
              {creationStatus.step === 'idle' && (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    {/* Use existing storage account option */}
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="useExistingAccount"
                        checked={useExistingAccount}
                        onCheckedChange={(checked) => {
                          setUseExistingAccount(checked as boolean);
                          form.setValue("useExistingStorageAccount", checked as boolean);
                          if (checked) {
                            // Clear storage account name when switching to existing
                            form.setValue("storageAccountName", "");
                            // Reset resource group selection when switching to existing
                            form.setValue("createNewResourceGroup", false);
                            setCreateNewRg(false);
                          }
                        }}
                        data-testid="checkbox-use-existing-account"
                      />
                      <label htmlFor="useExistingAccount" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Use existing storage account for container creation
                      </label>
                    </div>

                    {useExistingAccount ? (
                      /* Dropdown for existing storage accounts */
                      <FormField
                        control={form.control}
                        name="existingStorageAccountId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Existing Storage Account</FormLabel>
                            <Select
                              onValueChange={(value) => {
                                const accountId = parseInt(value);
                                field.onChange(accountId);
                                
                                // Find the selected storage account and populate its details
                                const selectedAccount = existingStorageAccounts?.find(acc => acc.id === accountId);
                                if (selectedAccount) {
                                  form.setValue("storageAccountName", selectedAccount.name);
                                  form.setValue("rgName", selectedAccount.resourceGroupName || "");
                                  form.setValue("location", selectedAccount.location || "centralindia");
                                }
                              }}
                              value={field.value?.toString() || ""}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-existing-account">
                                  <SelectValue placeholder="Select storage account" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {existingStorageAccounts?.filter((account, index, self) => 
                                  self.findIndex(a => a.name === account.name) === index
                                ).map((account) => (
                                  <SelectItem key={account.id} value={account.id.toString()}>
                                    {account.name} - {account.kind === 'adls' ? 'ADLS Gen2' : 'Blob Storage'} ({account.resourceGroupName || "No RG"})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Container will be created in the selected storage account's resource group
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : (
                      /* New storage account name input */
                      <FormField
                        control={form.control}
                        name="storageAccountName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Storage Account Name</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                data-testid="input-storage-account-name"
                                placeholder="adlsstorageacct123" 
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Must be globally unique, 3-24 lowercase letters/numbers
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name="filesystemName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Container Name</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              data-testid="input-filesystem-name"
                              placeholder="data" 
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            3-63 characters, lowercase letters/numbers/hyphens
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-4">
                      {!useExistingAccount && (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="createNewRg"
                            checked={createNewRg}
                            onCheckedChange={(checked) => {
                              setCreateNewRg(checked as boolean);
                              form.setValue("createNewResourceGroup", checked as boolean);
                            }}
                            data-testid="checkbox-create-new-rg"
                          />
                          <label htmlFor="createNewRg" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            Create new resource group
                          </label>
                        </div>
                      )}

                      <FormField
                        control={form.control}
                        name="rgName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Resource Group</FormLabel>
                            <FormControl>
                              {useExistingAccount ? (
                                <Input
                                  {...field}
                                  disabled={true}
                                  className="bg-gray-100 text-gray-600"
                                  placeholder="Automatically populated from selected storage account"
                                  data-testid="input-resource-group-readonly"
                                />
                              ) : createNewRg ? (
                                <Input
                                  placeholder="rg-zapper-adls"
                                  {...field}
                                  data-testid="input-resource-group-name"
                                />
                              ) : (
                                <Select 
                                  value={field.value} 
                                  onValueChange={field.onChange}
                                >
                                  <SelectTrigger data-testid="select-resource-group">
                                    <SelectValue placeholder="Select resource group" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {resourceGroups?.filter(rg => !rg.isDefault).map((rg) => (
                                      <SelectItem key={rg.name} value={rg.name}>
                                        {rg.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </FormControl>
                            {useExistingAccount && (
                              <p className="text-xs text-muted-foreground">
                                Using the resource group from the selected storage account
                              </p>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Azure Region</FormLabel>
                          {useExistingAccount ? (
                            <FormControl>
                              <Input
                                {...field}
                                disabled={true}
                                className="bg-gray-100 text-gray-600"
                                placeholder="Automatically populated from selected storage account"
                                data-testid="input-location-readonly"
                              />
                            </FormControl>
                          ) : (
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-location">
                                  <SelectValue placeholder="Select region" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {AZURE_REGIONS.map((region) => (
                                  <SelectItem key={region.value} value={region.value}>
                                    {region.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          {useExistingAccount && (
                            <p className="text-xs text-muted-foreground">
                              Using the location from the selected storage account
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="organizationId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Partner Organization</FormLabel>
                          <Select onValueChange={(value) => field.onChange(parseInt(value, 10))} value={field.value ? field.value.toString() : ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-organization">
                                <SelectValue placeholder="Select partner organization" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {availableOrganizations?.map((org) => (
                                <SelectItem key={org.id} value={org.id.toString()}>
                                  {org.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />


                    <div className="flex justify-end space-x-2 pt-4">
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => {
                          setCreateDialogOpen(false);
                          form.reset();
                          setCreationStatus({ step: 'idle', message: '', progress: 0 });
                        }}
                        data-testid="button-cancel"
                      >
                        Cancel
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={createAdlsMutation.isPending}
                        className={creationStatus.step === 'success' ? 'bg-green-600 hover:bg-green-700' : ''}
                        data-testid="button-submit-create"
                      >
                        {creationStatus.step === 'success' ? (
                          <div className="flex items-center space-x-2">
                            <CheckCircle className="w-4 h-4" />
                            <span>Success!</span>
                          </div>
                        ) : createAdlsMutation.isPending ? (
                          <div className="flex items-center space-x-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Creating...</span>
                          </div>
                        ) : (
                          "Create Storage"
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              )}

            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Search Box */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          placeholder="Search by name, location, container, or organization..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 pr-10"
          data-testid="input-search-adls"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            title="Clear search"
            data-testid="button-clear-search-adls"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Results count */}
      {searchQuery && (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {sortedAccounts.length === 0
            ? `No results for "${searchQuery}"`
            : `${sortedAccounts.length} result${sortedAccounts.length !== 1 ? 's' : ''} found`}
        </div>
      )}

      {/* ADLS Storage Accounts Table */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-700">
        <ScrollArea className="h-[calc(100vh-300px)] min-h-[400px]">
        <Table>
          <TableHeader>
            <TableRow>
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
              <TableHead
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => handleSort("location")}
              >
                <div className="flex items-center gap-1">
                  Location
                  {sortField === "location" && (
                    sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </TableHead>
              <TableHead>Container</TableHead>
              <TableHead>Resource Group</TableHead>
              <TableHead>SFTP</TableHead>
              <TableHead>Partner Organization</TableHead>
              <TableHead
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => handleSort("created")}
              >
                <div className="flex items-center gap-1">
                  Created
                  {sortField === "created" && (
                    sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  <p className="text-sm text-muted-foreground mt-2">Loading ADLS storage accounts...</p>
                </TableCell>
              </TableRow>
            ) : searchQuery && sortedAccounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12">
                  <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No matches found</p>
                  <p className="text-sm text-muted-foreground">No storage accounts match your search criteria.</p>
                </TableCell>
              </TableRow>
            ) : adlsStorageAccounts && adlsStorageAccounts.length > 0 ? (
              sortedAccounts.map((account) => (
                <TableRow key={account.id} data-testid={`row-adls-${account.id}`}>
                  <TableCell className="font-medium" data-testid={`text-name-${account.id}`}>{account.name}</TableCell>
                  <TableCell data-testid={`text-location-${account.id}`}>
                    <Badge variant="secondary">{account.location}</Badge>
                  </TableCell>
                  <TableCell data-testid={`text-filesystem-${account.id}`}>{account.container}</TableCell>
                  <TableCell data-testid={`text-resource-group-${account.id}`}>
                    <Badge variant="secondary">{account.resourceGroupName || 'N/A'}</Badge>
                  </TableCell>
                  <TableCell data-testid={`text-sftp-${account.id}`}>
                    <Badge 
                      variant="secondary"
                      className={account.sftpEnabled 
                        ? "bg-green-100 text-green-800" 
                        : "bg-red-100 text-red-800"
                      }
                    >
                      {account.sftpEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell data-testid={`text-organization-${account.id}`}>
                    <Badge variant="outline">{account.organizationName}</Badge>
                  </TableCell>
                  <TableCell data-testid={`text-created-${account.id}`}>
                    {new Date(account.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right" data-testid={`cell-actions-${account.id}`}>
                    <div className="flex justify-end space-x-1">
                      {/* CMK Control button */}
                      {rolePermissions?.storageMgmt?.view && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleCmkConfig(account)}
                          className="text-amber-600 hover:text-amber-700"
                          title="Encryption (CMK)"
                          data-testid={`button-cmk-${account.id}`}
                        >
                          <Key className="h-4 w-4" />
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSftpConfig(account)}
                        title="SFTP Configuration"
                        data-testid={`button-sftp-${account.id}`}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      {rolePermissions?.storageMgmt?.delete && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleDeleteStorage(account.id)}
                          disabled={deletingAccountId !== null}
                          title="Delete Storage Account"
                          data-testid={`button-delete-${account.id}`}
                        >
                          {deletingAccountId === account.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No Storage Accounts</p>
                  <p className="text-sm text-muted-foreground">
                    Create your first storage account to get started.
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </ScrollArea>
      </div>

      {/* SFTP Configuration Dialog */}
      <Dialog open={sftpDialogOpen} onOpenChange={setSftpDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>SFTP Configuration</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {selectedAdlsAccount && (
              <>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-700">ADLS Storage Account</h3>
                  <p className="text-lg font-semibold">{selectedAdlsAccount.name}</p>
                  <Badge className="bg-blue-100 text-blue-800">
                    {selectedAdlsAccount.location}
                  </Badge>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium">SFTP Status</h4>
                      <p className="text-xs text-gray-500">Enable or disable SFTP access</p>
                    </div>
                    {sftpLoading ? (
                      <div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
                    ) : (
                      <Badge 
                        className={sftpConfig?.isEnabled 
                          ? "bg-green-100 text-green-800" 
                          : "bg-red-100 text-red-800"
                        }
                      >
                        {sftpConfig?.isEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleSftpToggle}
                      disabled={sftpToggleMutation.isPending || sftpLoading}
                      className={sftpConfig?.isEnabled 
                        ? "bg-red-600 hover:bg-red-700" 
                        : "bg-green-600 hover:bg-green-700"
                      }
                    >
                      {sftpToggleMutation.isPending ? (
                        "Processing..."
                      ) : (
                        sftpConfig?.isEnabled ? "Disable SFTP" : "Enable SFTP"
                      )}
                    </Button>
                    <Button variant="outline" onClick={() => setSftpDialogOpen(false)}>
                      Close
                    </Button>
                  </div>
                </div>

                {sftpConfig?.isEnabled && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-yellow-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs">!</span>
                      </div>
                      <p className="text-sm text-yellow-700">
                        <strong>Cost Notice:</strong> SFTP access incurs additional Azure charges. Disable when not needed to save costs.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* CMK Configuration Dialog */}
      <Dialog open={cmkDialogOpen} onOpenChange={setCmkDialogOpen}>
        <DialogContent 
          className="max-w-lg"
          onInteractOutside={(e) => {
            if (enableCmkMutation.isPending || disableCmkMutation.isPending || createKeyMutation.isPending) {
              e.preventDefault();
            }
          }}
          onEscapeKeyDown={(e) => {
            if (enableCmkMutation.isPending || disableCmkMutation.isPending || createKeyMutation.isPending) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-600" />
              Encryption Settings
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {cmkStorageAccount && (
              <>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">ADLS Storage Account</h3>
                  <p className="text-lg font-semibold">{cmkStorageAccount.name}</p>
                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    {cmkStorageAccount.location}
                  </Badge>
                </div>

                {/* Current Encryption Status */}
                <div className="p-4 rounded-lg border dark:border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {cmkStatusLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                      ) : cmkStatus?.cmkEnabled ? (
                        <ShieldCheck className="w-5 h-5 text-green-600" />
                      ) : (
                        <Shield className="w-5 h-5 text-blue-600" />
                      )}
                      <h4 className="text-sm font-medium">Current Encryption</h4>
                    </div>
                    {!cmkStatusLoading && (
                      <Badge 
                        className={cmkStatus?.cmkEnabled 
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" 
                          : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                        }
                      >
                        {cmkStatus?.cmkEnabled ? "Customer-Managed Key" : "Microsoft-Managed Key"}
                      </Badge>
                    )}
                  </div>
                  
                  {cmkStatus?.cmkEnabled && cmkStatus.cmkDetails && (
                    <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1 mt-2 p-3 bg-green-50 dark:bg-green-900/20 rounded">
                      <p><strong>Key Name:</strong> {cmkStatus.cmkDetails.keyName}</p>
                      <p><strong>Key Version:</strong> {cmkStatus.cmkDetails.keyVersion}</p>
                    </div>
                  )}
                </div>

                {/* Enable/Disable CMK */}
                <div className="space-y-4">
                  {cmkStatus?.cmkEnabled ? (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Your data is encrypted with a customer-managed key stored in Azure Key Vault.
                      </p>
                      <Button
                        onClick={handleDisableCmk}
                        disabled={disableCmkMutation.isPending}
                        variant="outline"
                        className="w-full"
                        data-testid="button-disable-cmk"
                      >
                        {disableCmkMutation.isPending ? (
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Switching to Microsoft-Managed Keys...
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <ShieldOff className="w-4 h-4" />
                            Switch to Microsoft-Managed Keys
                          </div>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Enable customer-managed key encryption by selecting a key from your Key Vault.
                      </p>
                      
                      {/* Key Selection */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Select Encryption Key</label>
                        {keysLoading ? (
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading keys...
                          </div>
                        ) : keyVaultKeys?.keys && keyVaultKeys.keys.length > 0 ? (
                          <Select value={selectedKeyName} onValueChange={setSelectedKeyName}>
                            <SelectTrigger data-testid="select-cmk-key">
                              <SelectValue placeholder="Choose a key..." />
                            </SelectTrigger>
                            <SelectContent>
                              {keyVaultKeys.keys.filter(k => k.enabled).map((key) => (
                                <SelectItem key={key.name} value={key.name}>
                                  {key.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="text-sm text-amber-600 dark:text-amber-400">
                            No keys available in Key Vault. Create a new key below.
                          </p>
                        )}
                      </div>

                      {/* Create New Key */}
                      {isCreatingKey ? (
                        <div className="space-y-2 p-3 border rounded-lg dark:border-gray-700">
                          <label className="text-sm font-medium">New Key Name</label>
                          <div className="flex gap-2">
                            <Input
                              value={newKeyName}
                              onChange={(e) => setNewKeyName(e.target.value)}
                              placeholder="e.g., storage-cmk-key"
                              data-testid="input-new-key-name"
                            />
                            <Button
                              onClick={handleCreateKey}
                              disabled={!newKeyName.trim() || createKeyMutation.isPending}
                              size="sm"
                              data-testid="button-create-key-confirm"
                            >
                              {createKeyMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                "Create"
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setIsCreatingKey(false); setNewKeyName(""); }}
                            >
                              Cancel
                            </Button>
                          </div>
                          <p className="text-xs text-gray-500">
                            Use letters, numbers, and hyphens only
                          </p>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsCreatingKey(true)}
                          data-testid="button-create-new-key"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Create New Key
                        </Button>
                      )}

                      {/* Enable CMK Button */}
                      <Button
                        onClick={handleEnableCmk}
                        disabled={!selectedKeyName || enableCmkMutation.isPending}
                        className="w-full bg-amber-600 hover:bg-amber-700"
                        data-testid="button-enable-cmk"
                      >
                        {enableCmkMutation.isPending ? (
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Enabling Customer-Managed Key...
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4" />
                            Enable Customer-Managed Key
                          </div>
                        )}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Info Section */}
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs text-gray-600 dark:text-gray-400">
                  <p className="font-medium mb-1">About Customer-Managed Keys (CMK)</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>CMK gives you full control over your encryption keys</li>
                    <li>Keys are stored in Azure Key Vault</li>
                    <li>You can rotate keys at any time</li>
                    <li>Revoking key access makes data inaccessible</li>
                  </ul>
                </div>

                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => setCmkDialogOpen(false)}>
                    Close
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}