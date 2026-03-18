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
import { useToast } from "@/hooks/use-toast";
import { useRolePermissions } from "@/hooks/use-role-permissions";
import { HardDrive, Plus, Trash2, ChevronUp, ChevronDown, Settings, Loader2, CheckCircle, AlertCircle, Search, X, Key, Shield, ShieldCheck, ShieldOff } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/api";

interface StorageAccount {
  id: number;
  name: string;
  location: string;
  container: string;
  resourceGroupName?: string;
  organizationId: number;
  organizationName?: string;
  createdAt: string;
}

interface ResourceGroup {
  name: string;
  location: string;
  isDefault: boolean;
}

interface SftpConfig {
  storageAccountName: string;
  isEnabled: boolean;
}

interface Organization {
  id: number;
  name: string;
  description?: string;
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

const storageSchema = z.object({
  name: z.string()
    .min(3, "Storage name must be at least 3 characters long")
    .max(24, "Storage name must be 24 characters or less")
    .regex(/^[a-z0-9]+$/, "Storage name can only contain lowercase letters and numbers"),
  location: z.string().min(1, "Location is required"),
  container: z.string().min(1, "Container is required"),
  resourceGroupName: z.string().min(1, "Resource group is required"),
  organizationId: z.number().min(1, "Organization is required"),
  useExisting: z.boolean().default(false),
  existingAccountId: z.number().optional(),
  createNewResourceGroup: z.boolean().default(false),
});

type StorageFormData = z.infer<typeof storageSchema>;

export default function Storage() {
  const { toast } = useToast();
  
  // Get current user's role permissions
  const { data: rolePermissions } = useRolePermissions();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteStorageId, setDeleteStorageId] = useState<number | null>(null);
  const [deleteConfirmDialogOpen, setDeleteConfirmDialogOpen] = useState(false);
  const [deleteStorageToConfirm, setDeleteStorageToConfirm] = useState<StorageAccount | null>(null);
  const [sftpDialogOpen, setSftpDialogOpen] = useState(false);
  const [selectedStorageAccount, setSelectedStorageAccount] = useState<StorageAccount | null>(null);
  
  // CMK state
  const [cmkDialogOpen, setCmkDialogOpen] = useState(false);
  const [cmkStorageAccount, setCmkStorageAccount] = useState<StorageAccount | null>(null);
  const [selectedKeyName, setSelectedKeyName] = useState<string>("");
  const [newKeyName, setNewKeyName] = useState<string>("");
  const [isCreatingKey, setIsCreatingKey] = useState(false);

  const [useExisting, setUseExisting] = useState(false);
  const [createNewRg, setCreateNewRg] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortField, setSortField] = useState<"name" | "location" | "created">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [creationStatus, setCreationStatus] = useState<{
    step: 'idle' | 'validating' | 'creating' | 'configuring' | 'finalizing' | 'success' | 'error';  
    message: string;
    progress: number;
  }>({
    step: 'idle',
    message: '',
    progress: 0
  });
  
  const [deletingStorageId, setDeletingStorageId] = useState<number | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<{
    step: 'idle' | 'confirming' | 'removing' | 'cleanup' | 'success' | 'error';
    message: string;
    progress: number;
  }>({
    step: 'idle',
    message: '',
    progress: 0
  });

  const form = useForm<StorageFormData>({
    resolver: zodResolver(storageSchema),
    defaultValues: {
      name: "",
      location: "",
      container: "",
      resourceGroupName: "",
      organizationId: 0,
      useExisting: false,
      existingAccountId: undefined,
      createNewResourceGroup: false,
    },
  });

  const { data: storageAccounts, isLoading } = useQuery<StorageAccount[]>({
    queryKey: ["/api/storage-accounts"],
  });

  const { data: organizations } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const { data: resourceGroups } = useQuery<ResourceGroup[]>({
    queryKey: ["/api/azure/resource-groups"],
  });

  // Filter organizations that don't already have a storage account association
  // RULE: One organization can only have ONE storage account + container association
  const availableOrganizations = useMemo(() => {
    if (!organizations || !storageAccounts) return [];
    
    // Get organization IDs that already have storage accounts
    const orgsWithStorage = new Set(
      storageAccounts
        .filter(acc => acc.organizationId)
        .map(acc => acc.organizationId)
    );
    
    // Return organizations that don't have storage accounts yet
    // NOTE: In edit mode (useExisting), we allow selecting the organization 
    // that is already associated with the container if needed, but for NEW associations, 
    // we filter them out.
    const selectedOrgId = form.getValues("organizationId");
    
    return organizations.filter(org => {
      // If it's the currently selected organization in the form, show it
      if (org.id === selectedOrgId) return true;
      // Otherwise, only show if it doesn't have storage
      return !orgsWithStorage.has(org.id);
    });
  }, [organizations, storageAccounts, form.watch("organizationId")]);

  // Fetch SFTP status for selected storage account
  const { data: sftpConfig, isLoading: sftpLoading } = useQuery<SftpConfig>({
    queryKey: [`/api/storage-accounts/${selectedStorageAccount?.name}/sftp`],
    enabled: !!selectedStorageAccount?.name,
  });

  // CMK queries
  const { data: keyVaultKeys, isLoading: keysLoading, refetch: refetchKeys } = useQuery<{ keyVaultUrl: string; keys: KeyVaultKey[] }>({
    queryKey: ["/api/keyvault/keys"],
    enabled: cmkDialogOpen,
  });

  const { data: cmkStatus, isLoading: cmkStatusLoading, refetch: refetchCmkStatus } = useQuery<CmkStatus>({
    queryKey: ["/api/storage-accounts", cmkStorageAccount?.name, "cmk"],
    queryFn: async () => {
      const response = await fetch(`/api/storage-accounts/${cmkStorageAccount?.name}/cmk`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch CMK status');
      return response.json();
    },
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
      queryClient.invalidateQueries({ queryKey: ["/api/storage-accounts"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/storage-accounts"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to disable CMK", variant: "destructive" });
    },
  });

  // CMK handlers
  const handleCmkConfig = (account: StorageAccount) => {
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

  // Deduplicate storage accounts by name
  const deduplicatedAccounts = storageAccounts ? (() => {
    const seen = new Set<string>();
    return storageAccounts.filter(account => {
      if (seen.has(account.name)) {
        return false;
      }
      seen.add(account.name);
      return true;
    });
  })() : [];

  // Filter by search query (name, location, container, organization)
  const filteredAccounts = searchQuery.trim() === '' 
    ? deduplicatedAccounts 
    : deduplicatedAccounts.filter(account => {
        const searchLower = searchQuery.toLowerCase();
        return (
          account.name.toLowerCase().includes(searchLower) ||
          account.location.toLowerCase().includes(searchLower) ||
          account.container.toLowerCase().includes(searchLower) ||
          (account.organizationName?.toLowerCase().includes(searchLower) ?? false) ||
          (account.resourceGroupName?.toLowerCase().includes(searchLower) ?? false)
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

  const createStorageMutation = useMutation({
    mutationFn: async (data: StorageFormData) => {
      // Step 1: Validating input
      setCreationStatus({
        step: 'validating',
        message: 'Validating storage configuration...',
        progress: 10
      });
      
      await new Promise(resolve => setTimeout(resolve, 500)); // Brief delay for UX
      
      // Step 2: Creating storage account/container
      setCreationStatus({
        step: 'creating', 
        message: useExisting ? 'Creating new container...' : 'Creating Azure storage account...',
        progress: 30
      });
      
      const response = await apiRequest("POST", "/api/storage-accounts", data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create storage account");
      }
      
      // Step 3: Configuring settings
      setCreationStatus({
        step: 'configuring',
        message: 'Configuring CORS and access policies...',
        progress: 70
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000)); // Allow time for server-side CORS config
      
      // Step 4: Finalizing
      setCreationStatus({
        step: 'finalizing',
        message: 'Finalizing setup...',
        progress: 90
      });
      
      const result = await response.json();
      
      // Step 5: Success
      setCreationStatus({
        step: 'success',
        message: useExisting ? 'Container created successfully!' : 'Storage account created successfully!',
        progress: 100
      });
      
      return result;
    },
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/storage-accounts"] });
        setCreateDialogOpen(false);
        setUseExisting(false);
        form.reset();
        setCreationStatus({ step: 'idle', message: '', progress: 0 });
        toast({
          title: "Success",
          description: useExisting ? "Container created successfully" : "Storage account created successfully",
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
    },
  });

  const deleteStorageMutation = useMutation({
    mutationFn: async (id: number) => {
      // Step 1: Confirming deletion
      setDeleteStatus({
        step: 'confirming',
        message: 'Confirming deletion request...',
        progress: 20
      });
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Step 2: Removing storage account
      setDeleteStatus({
        step: 'removing',
        message: 'Removing storage account and containers...',
        progress: 60
      });
      
      const response = await apiRequest("DELETE", `/api/storage-accounts/${id}`);
      if (!response.ok) {
        throw new Error("Failed to delete storage account");
      }
      
      // Step 3: Cleanup
      setDeleteStatus({
        step: 'cleanup',
        message: 'Cleaning up resources...',
        progress: 90
      });
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Step 4: Success
      setDeleteStatus({
        step: 'success',
        message: 'Storage account deleted successfully!',
        progress: 100
      });
    },
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/storage-accounts"] });
        setDeletingStorageId(null);
        setDeleteStatus({ step: 'idle', message: '', progress: 0 });
        toast({
          title: "Success",
          description: "Storage account deleted successfully",
        });
      }, 1200);
    },
    onError: () => {
      setDeleteStatus({
        step: 'error',
        message: 'Failed to delete storage account',
        progress: 0
      });
      setTimeout(() => {
        setDeletingStorageId(null);
        setDeleteStatus({ step: 'idle', message: '', progress: 0 });
      }, 3000);
      toast({
        title: "Error",
        description: "Failed to delete storage account",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: StorageFormData) => {
    createStorageMutation.mutate(data);
  };

  const handleDeleteStorage = (storage: StorageAccount) => {
    setDeleteStorageToConfirm(storage);
    setDeleteConfirmDialogOpen(true);
  };

  const confirmDeleteStorage = () => {
    if (deleteStorageToConfirm) {
      setDeleteConfirmDialogOpen(false);
      setDeletingStorageId(deleteStorageToConfirm.id);
      deleteStorageMutation.mutate(deleteStorageToConfirm.id);
    }
  };

  // SFTP toggle mutation
  const sftpToggleMutation = useMutation({
    mutationFn: async ({ storageAccountName, enable }: { storageAccountName: string, enable: boolean }) => {
      return apiRequest("PUT", `/api/storage-accounts/${storageAccountName}/sftp`, {
        enabled: enable
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/storage-accounts/${selectedStorageAccount?.name}/sftp`] });
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
    if (selectedStorageAccount) {
      sftpToggleMutation.mutate({
        storageAccountName: selectedStorageAccount.name,
        enable: !sftpConfig?.isEnabled
      });
    }
  };

  const handleSftpConfig = (storage: StorageAccount) => {
    setSelectedStorageAccount(storage);
    setSftpDialogOpen(true);
  };

  // Set document title
  useEffect(() => {
    document.title = "Storage Management - Enterprise Management System";
  }, []);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <HardDrive className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Storage Management</h1>
        </div>
        {/* Show Add Storage button if user has addStorageContainer OR addContainer permission */}
        {(rolePermissions?.storageMgmt?.addStorageContainer || rolePermissions?.storageMgmt?.addContainer) && (
          <Dialog open={createDialogOpen} onOpenChange={(open) => {
            // Prevent closing the dialog while storage is being created
            if (!open && createStorageMutation.isPending) {
              toast({
                title: "Creation in Progress",
                description: "Please wait for the storage account creation to complete before closing this window.",
                variant: "default",
              });
              return;
            }
            
            setCreateDialogOpen(open);
            if (!open) {
              // Reset form state when dialog closes
              setUseExisting(false);
              form.reset();
              setCreationStatus({ step: 'idle', message: '', progress: 0 });
            } else {
              // If user has only addContainer permission, force useExisting mode
              if (!rolePermissions?.storageMgmt?.addStorageContainer && rolePermissions?.storageMgmt?.addContainer) {
                setUseExisting(true);
                form.setValue("useExisting", true);
              }
            }
          }}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700" data-testid="button-add-storage">
                <Plus className="w-4 h-4 mr-2" />
                {rolePermissions?.storageMgmt?.addStorageContainer ? "Add Storage" : "Add Container"}
              </Button>
            </DialogTrigger>
          <DialogContent 
              className="sm:max-w-[500px]" 
              showClose={!createStorageMutation.isPending}
              onPointerDownOutside={(e) => {
                e.preventDefault();
                toast({
                  title: "Dialog Protection",
                  description: createStorageMutation.isPending
                    ? "Please wait for the storage account creation to complete. You cannot close this window during creation."
                    : "Please use the X button to close this dialog to avoid losing your work.",
                  variant: "default",
                });
              }}
              onEscapeKeyDown={(e) => {
                e.preventDefault();
                toast({
                  title: "Dialog Protection",
                  description: createStorageMutation.isPending
                    ? "Please wait for the storage account creation to complete. You cannot close this window during creation."
                    : "Please use the X button to close this dialog to avoid losing your work.",
                  variant: "default",
                });
              }}
            >
            <DialogHeader>
              <DialogTitle>
                {useExisting || !rolePermissions?.storageMgmt?.addStorageContainer ? "Add Container to Existing Storage Account" : "Create Storage Account"}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Only show checkbox if user has addStorageContainer permission */}
                {/* Users with only addContainer permission are forced to use existing accounts */}
                {rolePermissions?.storageMgmt?.addStorageContainer ? (
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="useExisting" 
                      checked={useExisting}
                      onCheckedChange={(checked) => {
                        setUseExisting(checked as boolean);
                        form.setValue("useExisting", checked as boolean);
                        if (checked) {
                          form.setValue("name", "");
                          form.setValue("location", "");
                        }
                      }}
                      data-testid="checkbox-use-existing-account"
                    />
                    <label htmlFor="useExisting" className="text-sm font-medium cursor-pointer">
                      Use existing storage account
                    </label>
                  </div>
                ) : (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      <strong>Note:</strong> You can only add containers to existing storage accounts with your current permissions.
                    </p>
                  </div>
                )}
                
                {useExisting ? (
                  <FormField
                    control={form.control}
                    name="existingAccountId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Select Existing Storage Account</FormLabel>
                        <Select onValueChange={(value) => {
                          const accountId = parseInt(value);
                          field.onChange(accountId);
                          const selectedAccount = storageAccounts?.find(acc => acc.id === accountId);
                          if (selectedAccount) {
                            form.setValue("name", selectedAccount.name);
                            form.setValue("location", selectedAccount.location);
                          }
                        }}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a storage account" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {storageAccounts?.filter((account, index, self) => 
                              self.findIndex(a => a.name === account.name) === index
                            ).map((account) => (
                              <SelectItem key={account.id} value={account.id.toString()}>
                                {account.name} ({account.location})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <>
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter storage name" {...field} />
                          </FormControl>
                          <p className="text-xs text-muted-foreground mt-1">
                            Must be 3 to 24 characters long, and can contain only lowercase letters and numbers.
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select Azure region" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="australiaeast">Australia East</SelectItem>
                              <SelectItem value="australiasoutheast">Australia Southeast</SelectItem>
                              <SelectItem value="brazilsouth">Brazil South</SelectItem>
                              <SelectItem value="canadacentral">Canada Central</SelectItem>
                              <SelectItem value="canadaeast">Canada East</SelectItem>
                              <SelectItem value="centralindia">Central India</SelectItem>
                              <SelectItem value="centralus">Central US</SelectItem>
                              <SelectItem value="eastasia">East Asia</SelectItem>
                              <SelectItem value="eastus">East US</SelectItem>
                              <SelectItem value="eastus2">East US 2</SelectItem>
                              <SelectItem value="francecentral">France Central</SelectItem>
                              <SelectItem value="germanywestcentral">Germany West Central</SelectItem>
                              <SelectItem value="japaneast">Japan East</SelectItem>
                              <SelectItem value="japanwest">Japan West</SelectItem>
                              <SelectItem value="koreacentral">Korea Central</SelectItem>
                              <SelectItem value="koreasouth">Korea South</SelectItem>
                              <SelectItem value="northcentralus">North Central US</SelectItem>
                              <SelectItem value="northeurope">North Europe</SelectItem>
                              <SelectItem value="norwayeast">Norway East</SelectItem>
                              <SelectItem value="southafricanorth">South Africa North</SelectItem>
                              <SelectItem value="southcentralus">South Central US</SelectItem>
                              <SelectItem value="southindia">South India</SelectItem>
                              <SelectItem value="southeastasia">Southeast Asia</SelectItem>
                              <SelectItem value="switzerlandnorth">Switzerland North</SelectItem>
                              <SelectItem value="uaenorth">UAE North</SelectItem>
                              <SelectItem value="uksouth">UK South</SelectItem>
                              <SelectItem value="ukwest">UK West</SelectItem>
                              <SelectItem value="westcentralus">West Central US</SelectItem>
                              <SelectItem value="westeurope">West Europe</SelectItem>
                              <SelectItem value="westindia">West India</SelectItem>
                              <SelectItem value="westus">West US</SelectItem>
                              <SelectItem value="westus2">West US 2</SelectItem>
                              <SelectItem value="westus3">West US 3</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
                <FormField
                  control={form.control}
                  name="organizationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Partner Organization</FormLabel>
                      <Select onValueChange={(value) => field.onChange(parseInt(value))}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a partner organization" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableOrganizations.length === 0 ? (
                            <div className="py-4 px-2 text-center text-sm text-muted-foreground">
                              All organizations already have storage accounts
                            </div>
                          ) : (
                            availableOrganizations.map((org) => (
                              <SelectItem key={org.id} value={org.id.toString()}>
                                {org.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      {availableOrganizations.length === 0 && (
                        <p className="text-xs text-amber-600 mt-1">
                          Each organization can only have one storage account. All organizations already have storage configured.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="container"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Container</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter container name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Progress Indicator */}
                {creationStatus.step !== 'idle' && creationStatus.step !== 'error' && (
                  <div className="space-y-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {creationStatus.step === 'success' ? (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        ) : (
                          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                        )}
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {creationStatus.message}
                        </span>
                      </div>
                      <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                        {creationStatus.progress}%
                      </span>
                    </div>
                    
                    <Progress 
                      value={creationStatus.progress} 
                      className="h-2"
                    />
                    
                    {/* Status Steps */}
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span className={creationStatus.step === 'validating' || creationStatus.progress >= 10 ? 'text-blue-600 font-medium' : ''}>
                        Validating
                      </span>
                      <span className={creationStatus.step === 'creating' || creationStatus.progress >= 30 ? 'text-blue-600 font-medium' : ''}>
                        Creating
                      </span>
                      <span className={creationStatus.step === 'configuring' || creationStatus.progress >= 70 ? 'text-blue-600 font-medium' : ''}>
                        Configuring
                      </span>
                      <span className={creationStatus.step === 'finalizing' || creationStatus.progress >= 90 ? 'text-blue-600 font-medium' : ''}>
                        Finalizing
                      </span>
                      <span className={creationStatus.step === 'success' ? 'text-green-600 font-medium' : ''}>
                        Complete
                      </span>
                    </div>
                  </div>
                )}

                {/* Error Display with Clickable Links */}
                {creationStatus.step === 'error' && (
                  <div className="space-y-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border-2 border-red-300 dark:border-red-700">
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

                <div className="flex justify-end space-x-2 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      // Prevent canceling while storage is being created
                      if (createStorageMutation.isPending) {
                        toast({
                          title: "Creation in Progress",
                          description: "Please wait for the storage account creation to complete. You cannot cancel during an active operation.",
                          variant: "default",
                        });
                        return;
                      }
                      
                      setCreateDialogOpen(false);
                      setUseExisting(false);
                      form.reset();
                      setCreationStatus({ step: 'idle', message: '', progress: 0 });
                    }}
                    disabled={createStorageMutation.isPending}
                    data-testid="button-cancel-create-storage"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createStorageMutation.isPending}
                    className={creationStatus.step === 'success' ? 'bg-green-600 hover:bg-green-700' : ''}
                  >
                    {creationStatus.step === 'success' ? (
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="w-4 h-4" />
                        <span>Success!</span>
                      </div>
                    ) : createStorageMutation.isPending ? (
                      <div className="flex items-center space-x-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Creating...</span>
                      </div>
                    ) : (
                      useExisting ? "Create Container" : "Create Storage"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
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
          data-testid="input-search-storage"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            title="Clear search"
            data-testid="button-clear-search-storage"
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

      {/* Storage Table */}
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
              <>
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <LoadingSpinner message="Loading storage accounts..." size="md" />
                  </TableCell>
                </TableRow>
                {Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i} className="opacity-50">
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
            ) : searchQuery && sortedAccounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <HardDrive className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No storage accounts match your search</p>
                </TableCell>
              </TableRow>
            ) : storageAccounts?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <HardDrive className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No storage accounts found</p>
                </TableCell>
              </TableRow>
            ) : (
              sortedAccounts.map((storage) => (
                <TableRow key={storage.id}>
                  <TableCell className="font-medium">{storage.name}</TableCell>
                  <TableCell>
                    <Badge className="bg-blue-100 text-blue-800">
                      {storage.location}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-600">{storage.container}</TableCell>
                  <TableCell>
                    <Badge className="bg-green-100 text-green-800">
                      {storage.organizationName || 'Unknown'}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-gray-600">
                    {new Date(storage.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-1">
                      {/* CMK Control button - show for users with storage management view permission */}
                      {rolePermissions?.storageMgmt?.view && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleCmkConfig(storage)}
                          className="text-amber-600 hover:text-amber-700"
                          title="Encryption (CMK)"
                          data-testid={`button-cmk-storage-${storage.id}`}
                        >
                          <Key className="w-4 h-4" />
                        </Button>
                      )}
                      {/* SFTP Control button - show for users with storage management view permission */}
                      {rolePermissions?.storageMgmt?.view && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleSftpConfig(storage)}
                          className="text-blue-600 hover:text-blue-700"
                          title="SFTP Configuration"
                        >
                          <Settings className="w-4 h-4" />
                        </Button>
                      )}
                      {/* Show delete button only if current user has delete permission in storage management */}
                      {rolePermissions?.storageMgmt?.delete && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleDeleteStorage(storage)}
                          disabled={deletingStorageId !== null}
                          className="text-red-600 hover:text-red-700"
                          title="Delete Storage Account"
                          data-testid={`button-delete-storage-${storage.id}`}
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
        </ScrollArea>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmDialogOpen} onOpenChange={(open) => {
        if (!open && deletingStorageId !== null) {
          toast({
            title: "Deletion in Progress",
            description: "Please wait for the storage account deletion to complete before closing this window.",
            variant: "default",
          });
          return;
        }
        setDeleteConfirmDialogOpen(open);
      }}>
        <DialogContent 
          className="sm:max-w-[400px]"
          showClose={deletingStorageId === null}
          onPointerDownOutside={(e) => {
            e.preventDefault();
            toast({
              title: "Dialog Protection",
              description: "Please use the button to confirm or cancel this action.",
              variant: "default",
            });
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            toast({
              title: "Dialog Protection",
              description: "Please use the button to confirm or cancel this action.",
              variant: "default",
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Delete Storage Account?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Are you sure you want to delete <span className="font-semibold text-gray-900 dark:text-gray-100">{deleteStorageToConfirm?.name}</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => setDeleteConfirmDialogOpen(false)}
                disabled={deletingStorageId !== null}
                data-testid="button-cancel-delete"
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={confirmDeleteStorage}
                disabled={deletingStorageId !== null}
                data-testid="button-confirm-delete"
              >
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Progress Dialog - Full Screen */}
      {deletingStorageId !== null && deleteStatus.step !== 'idle' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Deleting Storage Account
                </h3>
                {deleteStatus.step === 'success' && (
                  <CheckCircle className="w-6 h-6 text-green-600" />
                )}
                {deleteStatus.step === 'error' && (
                  <AlertCircle className="w-6 h-6 text-red-600" />
                )}
              </div>
              
              <div className="flex items-center space-x-3">
                {deleteStatus.step === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : deleteStatus.step === 'error' ? (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                ) : (
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                )}
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {deleteStatus.message}
                </span>
              </div>
              
              <Progress 
                value={deleteStatus.progress} 
                className="h-3"
              />
              
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span className={deleteStatus.step === 'confirming' || deleteStatus.progress >= 20 ? 'text-blue-600 font-medium' : ''}>
                  Confirming
                </span>
                <span className={deleteStatus.step === 'removing' || deleteStatus.progress >= 60 ? 'text-blue-600 font-medium' : ''}>
                  Removing
                </span>
                <span className={deleteStatus.step === 'cleanup' || deleteStatus.progress >= 90 ? 'text-blue-600 font-medium' : ''}>
                  Cleanup
                </span>
                <span className={deleteStatus.step === 'success' ? 'text-green-600 font-medium' : ''}>
                  Complete
                </span>
              </div>
              
              {deleteStatus.step === 'error' && (
                <div className="mt-4 flex justify-end">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setDeletingStorageId(null);
                      setDeleteStatus({ step: 'idle', message: '', progress: 0 });
                    }}
                  >
                    Close
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SFTP Configuration Dialog */}
      <Dialog open={sftpDialogOpen} onOpenChange={setSftpDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>SFTP Configuration</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {selectedStorageAccount && (
              <>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-700">Storage Account</h3>
                  <p className="text-lg font-semibold">{selectedStorageAccount.name}</p>
                  <Badge className="bg-blue-100 text-blue-800">
                    {selectedStorageAccount.location}
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
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h4 className="text-sm font-medium text-blue-900 mb-2">SFTP Connection Info</h4>
                    <div className="text-xs text-blue-700 space-y-1">
                      <p><strong>Hostname:</strong> {selectedStorageAccount.name}.blob.core.windows.net</p>
                      <p><strong>Port:</strong> 22</p>
                      <p><strong>Protocol:</strong> SFTP</p>
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
        <DialogContent className="max-w-lg">
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
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Storage Account</h3>
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