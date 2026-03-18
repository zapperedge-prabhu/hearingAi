import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useRolePermissions } from "@/hooks/use-role-permissions";
import { apiRequest } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/spinner";
import { 
  Key, 
  Plus, 
  Trash2, 
  Search, 
  RefreshCw, 
  Lock, 
  Download,
  UserPlus,
  AlertTriangle,
  Copy,
  Check,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SftpLocalUser {
  id: number;
  organizationId: number;
  subscriptionId: string;
  resourceGroup: string;
  storageAccountName: string;
  localUsername: string;
  displayName: string | null;
  sshEnabled: boolean;
  passwordEnabled: boolean;
  sshKeyFingerprint: string | null;
  sshLastRotatedAt: Date | null;
  passwordLastRotatedAt: Date | null;
  isEnabled: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
  mappedUserId: number | null;
  scopes: SftpScope[];
}

interface SftpPermissions {
  read?: boolean;
  write?: boolean;
  list?: boolean;
  delete?: boolean;
  create?: boolean;
}

interface SftpScope {
  id: number;
  sftpLocalUserId: number;
  containerName: string;
  permissions: SftpPermissions | string;
  createdAt: Date | null;
}

function formatPermissions(perm: SftpPermissions | string): string {
  if (typeof perm === 'string') {
    const labels: Record<string, string> = {
      'r': 'R',
      'w': 'W',
      'l': 'L',
      'd': 'D',
      'c': 'C',
      'rw': 'RW',
      'rwl': 'RWL',
      'rwld': 'RWLD',
      'rwldc': 'RWLDC'
    };
    return labels[perm] || perm.toUpperCase();
  }
  
  const parts: string[] = [];
  if (perm.read) parts.push('R');
  if (perm.write) parts.push('W');
  if (perm.list) parts.push('L');
  if (perm.delete) parts.push('D');
  if (perm.create) parts.push('C');
  
  return parts.join('') || '-';
}

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
  resourceGroupName: string | null;
  organizationId: number | null;
  organizationName: string | null;
  createdAt: string;
  sftpEnabled: boolean;
}

interface OrganizationUser {
  id: number;
  name: string;
  email: string;
  organizationId?: number;
}

interface SecretDownload {
  secretToken: string;
  expiresAt: string;
}

function parseErrorMessage(error: Error): string {
  const message = error.message;
  const statusMatch = message.match(/^\d{3}:\s*/);
  if (statusMatch) {
    const withoutStatus = message.substring(statusMatch[0].length);
    try {
      const jsonMatch = withoutStatus.match(/\{.*\}/);
      if (jsonMatch) {
        const errorObj = JSON.parse(jsonMatch[0]);
        return errorObj.error || withoutStatus;
      }
    } catch {
      return withoutStatus;
    }
    return withoutStatus;
  }
  return message;
}

export default function SftpUsers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: rolePermissions } = useRolePermissions();

  const [searchQuery, setSearchQuery] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [deleteUser, setDeleteUser] = useState<SftpLocalUser | null>(null);
  const [rotateAction, setRotateAction] = useState<{user: SftpLocalUser, type: 'ssh' | 'password'} | null>(null);
  const [secretDownload, setSecretDownload] = useState<{token: string, type: 'ssh' | 'password' | 'both', expiresAt: Date} | null>(null);
  const [downloadedCredentials, setDownloadedCredentials] = useState<{privateKey?: string, password?: string} | null>(null);
  const [copiedSshKey, setCopiedSshKey] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [sortField, setSortField] = useState<"username" | "organization">("username");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const [formData, setFormData] = useState({
    organizationId: "",
    localUsername: "",
    displayName: "",
    sshEnabled: true,
    passwordEnabled: false,
    mappedUserId: "",
    permissions: { read: true, write: false, list: true, delete: false, create: false }
  });

  const { data: sftpUsers, isLoading } = useQuery<SftpLocalUser[]>({
    queryKey: ["/api/sftp-local-users"],
  });

  const { data: organizations } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const { data: adlsStorageAccounts } = useQuery<AdlsStorageAccount[]>({
    queryKey: ["/api/adls-storage-accounts"],
  });

  const { data: orgUsers } = useQuery<OrganizationUser[]>({
    queryKey: ["/api/organization-users"],
  });

  // Get the ADLS storage account for the selected organization (1:1 mapping)
  const selectedOrgStorage = formData.organizationId 
    ? adlsStorageAccounts?.find(sa => sa.organizationId === parseInt(formData.organizationId))
    : undefined;

  // Filter users to only show those from the selected organization and not already mapped
  // Deduplicate users who may have multiple roles in same organization
  const availableMappedUsers = (() => {
    if (!formData.organizationId || !orgUsers) return [];
    const orgId = parseInt(formData.organizationId);
    
    // First filter to users in the selected organization
    const orgFilteredUsers = orgUsers.filter(user => user.organizationId === orgId);
    
    // Deduplicate by user ID (same user may appear multiple times with different roles)
    const uniqueUsersMap = new Map<number, OrganizationUser>();
    for (const user of orgFilteredUsers) {
      if (!uniqueUsersMap.has(user.id)) {
        uniqueUsersMap.set(user.id, user);
      }
    }
    const uniqueUsers = Array.from(uniqueUsersMap.values());
    
    // Filter out users already mapped to SFTP users in this org
    return uniqueUsers.filter(user => {
      const isAlreadyMapped = sftpUsers?.some(
        sftpUser => sftpUser.organizationId === orgId && sftpUser.mappedUserId === user.id
      );
      return !isAlreadyMapped;
    });
  })();

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!data.organizationId || !data.mappedUserId) {
        throw new Error("Organization and mapped user are required");
      }

      const response = await apiRequest("POST", "/api/sftp-local-users", {
        organizationId: parseInt(data.organizationId),
        localUsername: data.localUsername,
        displayName: data.displayName || null,
        sshEnabled: data.sshEnabled,
        passwordEnabled: data.passwordEnabled,
        mappedUserId: parseInt(data.mappedUserId),
        permissions: data.permissions
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to create SFTP user");
      }
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sftp-local-users"] });
      const hadSsh = formData.sshEnabled;
      const hadPassword = formData.passwordEnabled;
      setIsDrawerOpen(false);
      resetForm();
      if (result.secretToken) {
        let credType: 'ssh' | 'password' | 'both' = 'ssh';
        if (hadSsh && hadPassword) {
          credType = 'both';
        } else if (hadPassword) {
          credType = 'password';
        }
        setSecretDownload({
          token: result.secretToken,
          type: credType,
          expiresAt: result.expiresAt ? new Date(result.expiresAt) : new Date(Date.now() + 120000)
        });
      }
      toast({ title: "Success", description: "SFTP user created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    }
  });


  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/sftp-local-users/${id}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to delete SFTP user");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sftp-local-users"] });
      setDeleteUser(null);
      toast({ title: "Success", description: "SFTP user deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
      setDeleteUser(null);
    }
  });

  const rotateSshMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/sftp-local-users/${id}/rotate-ssh`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to rotate SSH key");
      }
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sftp-local-users"] });
      setRotateAction(null);
      if (result.secretToken) {
        setSecretDownload({
          token: result.secretToken,
          type: 'ssh',
          expiresAt: result.expiresAt ? new Date(result.expiresAt) : new Date(Date.now() + 120000)
        });
      }
      toast({ title: "Success", description: "SSH key rotated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
      setRotateAction(null);
    }
  });

  const rotatePasswordMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/sftp-local-users/${id}/rotate-password`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to rotate password");
      }
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sftp-local-users"] });
      setRotateAction(null);
      if (result.secretToken) {
        setSecretDownload({
          token: result.secretToken,
          type: 'password',
          expiresAt: result.expiresAt ? new Date(result.expiresAt) : new Date(Date.now() + 120000)
        });
      }
      toast({ title: "Success", description: "Password rotated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
      setRotateAction(null);
    }
  });

  const downloadSecretMutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await apiRequest("GET", `/api/sftp-local-users/download/${token}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to download secret");
      }
      return response.json();
    },
    onSuccess: (result) => {
      setDownloadedCredentials({ privateKey: result.privateKey, password: result.password });
      toast({ title: "Success", description: "Credentials retrieved - copy now, they cannot be retrieved again" });
    },
    onError: (error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
      setSecretDownload(null);
    }
  });

  const toggleEnableMutation = useMutation({
    mutationFn: async ({ id, enable }: { id: number; enable: boolean }) => {
      const endpoint = enable ? "enable" : "disable";
      const response = await apiRequest("POST", `/api/sftp-local-users/${id}/${endpoint}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to ${endpoint} SFTP user`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sftp-local-users"] });
    },
    onError: (error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    }
  });

  function resetForm() {
    setFormData({
      organizationId: "",
      localUsername: "",
      displayName: "",
      sshEnabled: true,
      passwordEnabled: false,
      mappedUserId: "",
      permissions: { read: true, write: false, list: true, delete: false, create: false }
    });
  }

  function openCreateDrawer() {
    resetForm();
    setIsDrawerOpen(true);
  }

  function handleSubmit() {
    if (!selectedOrgStorage) {
      toast({ title: "Error", description: "No ADLS storage account configured for this organization", variant: "destructive" });
      return;
    }
    if (!formData.mappedUserId) {
      toast({ title: "Error", description: "User mapping is required", variant: "destructive" });
      return;
    }
    createMutation.mutate(formData);
  }

  function copyToClipboard(text: string, type: 'ssh' | 'password') {
    navigator.clipboard.writeText(text);
    if (type === 'ssh') {
      setCopiedSshKey(true);
      setTimeout(() => setCopiedSshKey(false), 2000);
    } else {
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    }
  }

  const handleSort = (field: "username" | "organization") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const filteredUsers = sftpUsers?.filter(user => {
    const search = searchQuery.toLowerCase();
    return (
      user.localUsername.toLowerCase().includes(search) ||
      user.displayName?.toLowerCase().includes(search) ||
      user.storageAccountName.toLowerCase().includes(search)
    );
  }) || [];

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    let comparison = 0;
    if (sortField === "username") {
      comparison = a.localUsername.localeCompare(b.localUsername);
    } else if (sortField === "organization") {
      const orgA = organizations?.find(o => o.id === a.organizationId)?.name || "";
      const orgB = organizations?.find(o => o.id === b.organizationId)?.name || "";
      comparison = orgA.localeCompare(orgB);
    }
    return sortDirection === "asc" ? comparison : -comparison;
  });

  const canCreate = rolePermissions?.sftpMgmt?.create;
  const canUpdate = rolePermissions?.sftpMgmt?.update;
  const canDelete = rolePermissions?.sftpMgmt?.delete;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const isRotating = rotateSshMutation.isPending || rotatePasswordMutation.isPending;

  return (
    <div className="p-6 space-y-6">
      {isRotating && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 p-8 bg-card rounded-lg shadow-lg border">
            <LoadingSpinner size="lg" />
            <div className="text-center">
              <p className="font-medium">Rotating Credentials...</p>
              <p className="text-sm text-muted-foreground">Please wait while we generate new credentials</p>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Key className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">SFTP Local Users</h1>
            <p className="text-muted-foreground">Manage SFTP access credentials for Azure storage accounts</p>
          </div>
        </div>
        {canCreate && (
          <Button onClick={openCreateDrawer} data-testid="button-create-sftp-user">
            <Plus className="h-4 w-4 mr-2" />
            Create SFTP User
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-sftp"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead 
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => handleSort("username")}
                >
                  <div className="flex items-center gap-1">
                    Username
                    {sortField === "username" && (
                      sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => handleSort("organization")}
                >
                  <div className="flex items-center gap-1">
                    Organization
                    {sortField === "organization" && (
                      sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </TableHead>
                <TableHead>Connection String</TableHead>
                <TableHead>Auth Methods</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Mapped User</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No SFTP users found
                  </TableCell>
                </TableRow>
              ) : (
                sortedUsers.map((user) => {
                  const org = organizations?.find(o => o.id === user.organizationId);
                  return (
                  <TableRow key={user.id} data-testid={`row-sftp-user-${user.id}`}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{user.localUsername}</div>
                        {user.displayName && (
                          <div className="text-sm text-muted-foreground">{user.displayName}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{org?.name || `Org #${user.organizationId}`}</span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-mono">
                        {user.scopes?.[0]?.containerName ? (
                          <span className="break-all">
                            {user.storageAccountName}.{user.scopes[0].containerName}.{user.localUsername}@{user.storageAccountName}.blob.core.windows.net
                          </span>
                        ) : (
                          <span className="text-muted-foreground">No container configured</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {user.sshEnabled && <Badge variant="secondary">SSH</Badge>}
                        {user.passwordEnabled && <Badge variant="secondary">Password</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.scopes?.slice(0, 2).map((scope, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {scope.containerName}: {formatPermissions(scope.permissions)}
                          </Badge>
                        ))}
                        {user.scopes && user.scopes.length > 2 && (
                          <Badge variant="outline" className="text-xs">+{user.scopes.length - 2} more</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.mappedUserId ? (
                        <span className="text-sm">{orgUsers?.find(u => u.id === user.mappedUserId)?.name || `User #${user.mappedUserId}`}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {user.sshEnabled && canUpdate && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setRotateAction({ user, type: 'ssh' })}
                            title="Rotate SSH Key"
                            data-testid={`button-rotate-ssh-${user.id}`}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                        {user.passwordEnabled && canUpdate && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setRotateAction({ user, type: 'password' })}
                            title="Rotate Password"
                            data-testid={`button-rotate-password-${user.id}`}
                          >
                            <Lock className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteUser(user)}
                            data-testid={`button-delete-${user.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog 
        open={isDrawerOpen} 
        onOpenChange={(open) => {
          if (!createMutation.isPending && open === false) {
            setIsDrawerOpen(open);
          } else if (open === true) {
            setIsDrawerOpen(open);
          }
        }}
      >
        <DialogContent 
          className="sm:max-w-lg max-h-[80vh] overflow-y-auto"
          onInteractOutside={(e) => {
            e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (createMutation.isPending) {
              e.preventDefault();
            }
          }}
        >
          {createMutation.isPending && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center rounded-lg">
              <div className="flex flex-col items-center gap-4 p-8">
                <LoadingSpinner size="lg" />
                <div className="text-center">
                  <p className="font-medium">Creating SFTP User...</p>
                  <p className="text-sm text-muted-foreground">This may take a moment</p>
                </div>
              </div>
            </div>
          )}
          <DialogHeader>
            <DialogTitle>Create SFTP User</DialogTitle>
            <DialogDescription>
              Create a new SFTP local user for Azure storage access. To modify an existing user, delete and recreate with the correct settings.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <>
                <div className="space-y-2">
                  <Label htmlFor="organization">Organization *</Label>
                  <Select
                    value={formData.organizationId}
                    onValueChange={(value) => setFormData(prev => ({ 
                      ...prev, 
                      organizationId: value,
                      mappedUserId: "" 
                    }))}
                  >
                    <SelectTrigger data-testid="select-organization">
                      <SelectValue placeholder="Select organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations?.map(org => (
                        <SelectItem key={org.id} value={org.id.toString()}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.organizationId && selectedOrgStorage && (
                    <div className="text-xs text-muted-foreground space-y-1 p-2 bg-muted rounded">
                      <p><span className="font-medium">Storage:</span> {selectedOrgStorage.name}</p>
                      <p><span className="font-medium">Container:</span> {selectedOrgStorage.container}</p>
                    </div>
                  )}
                  {formData.organizationId && !selectedOrgStorage && (
                    <div className="text-xs text-destructive space-y-1 p-2 bg-destructive/10 rounded border border-destructive/20">
                      <p className="font-medium">No ADLS storage configured for this organization.</p>
                      <p>Please configure storage in Storage Management before creating SFTP users.</p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mappedUser">Map to User *</Label>
                  <Select
                    value={formData.mappedUserId}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, mappedUserId: value }))}
                    disabled={!formData.organizationId}
                  >
                    <SelectTrigger data-testid="select-mapped-user">
                      <SelectValue placeholder="Select user to map" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMappedUsers?.map(user => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.name} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Each user can only be mapped to one SFTP user per organization
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="localUsername">Local Username *</Label>
                  <Input
                    id="localUsername"
                    value={formData.localUsername}
                    onChange={(e) => setFormData(prev => ({ ...prev, localUsername: e.target.value }))}
                    placeholder="e.g., sftpuser1"
                    data-testid="input-local-username"
                  />
                </div>
              </>

            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={formData.displayName}
                onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                placeholder="Optional friendly name"
                data-testid="input-display-name"
              />
            </div>

            <div className="space-y-3">
              <Label>Authentication Methods</Label>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="sshEnabled"
                    checked={formData.sshEnabled}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, sshEnabled: !!checked }))}
                    data-testid="checkbox-ssh-enabled"
                  />
                  <Label htmlFor="sshEnabled" className="font-normal">SSH Key (RSA 4096)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="passwordEnabled"
                    checked={formData.passwordEnabled}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, passwordEnabled: !!checked }))}
                    data-testid="checkbox-password-enabled"
                  />
                  <Label htmlFor="passwordEnabled" className="font-normal">Password</Label>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Permissions</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="permRead"
                    checked={formData.permissions.read}
                    onCheckedChange={(checked) => setFormData(prev => ({ 
                      ...prev, 
                      permissions: { ...prev.permissions, read: !!checked }
                    }))}
                    data-testid="checkbox-perm-read"
                  />
                  <Label htmlFor="permRead" className="font-normal">Read</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="permWrite"
                    checked={formData.permissions.write}
                    onCheckedChange={(checked) => setFormData(prev => ({ 
                      ...prev, 
                      permissions: { ...prev.permissions, write: !!checked }
                    }))}
                    data-testid="checkbox-perm-write"
                  />
                  <Label htmlFor="permWrite" className="font-normal">Write</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="permList"
                    checked={formData.permissions.list}
                    onCheckedChange={(checked) => setFormData(prev => ({ 
                      ...prev, 
                      permissions: { ...prev.permissions, list: !!checked }
                    }))}
                    data-testid="checkbox-perm-list"
                  />
                  <Label htmlFor="permList" className="font-normal">List</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="permDelete"
                    checked={formData.permissions.delete}
                    onCheckedChange={(checked) => setFormData(prev => ({ 
                      ...prev, 
                      permissions: { ...prev.permissions, delete: !!checked }
                    }))}
                    data-testid="checkbox-perm-delete"
                  />
                  <Label htmlFor="permDelete" className="font-normal">Delete</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="permCreate"
                    checked={formData.permissions.create}
                    onCheckedChange={(checked) => setFormData(prev => ({ 
                      ...prev, 
                      permissions: { ...prev.permissions, create: !!checked }
                    }))}
                    data-testid="checkbox-perm-create"
                  />
                  <Label htmlFor="permCreate" className="font-normal">Create</Label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-4">
            <Button 
              variant="outline" 
              onClick={() => setIsDrawerOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={createMutation.isPending || (!!formData.organizationId && !selectedOrgStorage)}
              data-testid="button-submit-sftp-user"
            >
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteUser} onOpenChange={() => setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SFTP User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the SFTP user "{deleteUser?.localUsername}"? 
              This action cannot be undone and will remove all associated credentials from Azure.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteUser && deleteMutation.mutate(deleteUser.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? <LoadingSpinner size="sm" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!rotateAction} onOpenChange={() => setRotateAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Rotate {rotateAction?.type === 'ssh' ? 'SSH Key' : 'Password'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                <div>
                  This will generate a new {rotateAction?.type === 'ssh' ? 'SSH key pair' : 'password'} 
                  for "{rotateAction?.user.localUsername}". The previous credential will be invalidated immediately.
                  Make sure to download the new credential within 120 seconds.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!rotateAction) return;
                if (rotateAction.type === 'ssh') {
                  rotateSshMutation.mutate(rotateAction.user.id);
                } else {
                  rotatePasswordMutation.mutate(rotateAction.user.id);
                }
              }}
              data-testid="button-confirm-rotate"
            >
              {(rotateSshMutation.isPending || rotatePasswordMutation.isPending) ? (
                <LoadingSpinner size="sm" />
              ) : (
                "Rotate"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!secretDownload} onOpenChange={() => {
        setSecretDownload(null);
        setDownloadedCredentials(null);
        setCopiedSshKey(false);
        setCopiedPassword(false);
      }}>
        <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Download {secretDownload?.type === 'both' ? 'Credentials' : secretDownload?.type === 'ssh' ? 'Private Key' : 'Password'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 rounded-md border border-amber-500/20">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                  <div className="text-sm">
                    <strong>One-time download only.</strong> {secretDownload?.type === 'both' ? 'These credentials' : 'This credential'} will expire in 120 seconds 
                    and cannot be retrieved again after this dialog is closed.
                  </div>
                </div>

                {!downloadedCredentials ? (
                  <Button
                    onClick={() => secretDownload && downloadSecretMutation.mutate(secretDownload.token)}
                    disabled={downloadSecretMutation.isPending}
                    className="w-full"
                    data-testid="button-download-secret"
                  >
                    {downloadSecretMutation.isPending ? (
                      <LoadingSpinner size="sm" className="mr-2" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    Retrieve {secretDownload?.type === 'both' ? 'Credentials' : secretDownload?.type === 'ssh' ? 'Private Key' : 'Password'}
                  </Button>
                ) : (
                  <div className="space-y-4">
                    {downloadedCredentials.privateKey && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Key className="h-4 w-4" />
                          <span className="font-medium text-sm">SSH Private Key (RSA 4096)</span>
                        </div>
                        <div className="relative">
                          <pre className="p-3 bg-muted rounded-md text-xs overflow-x-auto max-h-48">
                            {downloadedCredentials.privateKey}
                          </pre>
                          <Button
                            variant="outline"
                            size="sm"
                            className="absolute top-2 right-2"
                            onClick={() => copyToClipboard(downloadedCredentials.privateKey!, 'ssh')}
                            data-testid="button-copy-ssh-key"
                          >
                            {copiedSshKey ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="default"
                            className="flex-1"
                            onClick={() => {
                              const blob = new Blob([downloadedCredentials.privateKey!], { type: 'text/plain' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = 'sftp_private_key.pem';
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                            }}
                            data-testid="button-download-ssh-file"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download Key
                          </Button>
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => copyToClipboard(downloadedCredentials.privateKey!, 'ssh')}
                            data-testid="button-copy-ssh-to-clipboard"
                          >
                            {copiedSshKey ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                            {copiedSshKey ? "Copied!" : "Copy Key"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {downloadedCredentials.password && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Lock className="h-4 w-4" />
                          <span className="font-medium text-sm">Password</span>
                        </div>
                        <div className="relative">
                          <pre className="p-3 bg-muted rounded-md text-sm overflow-x-auto font-mono">
                            {downloadedCredentials.password}
                          </pre>
                          <Button
                            variant="outline"
                            size="sm"
                            className="absolute top-2 right-2"
                            onClick={() => copyToClipboard(downloadedCredentials.password!, 'password')}
                            data-testid="button-copy-password"
                          >
                            {copiedPassword ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="default"
                            className="flex-1"
                            onClick={() => {
                              const blob = new Blob([downloadedCredentials.password!], { type: 'text/plain' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = 'sftp_password.txt';
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                            }}
                            data-testid="button-download-password-file"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download Password
                          </Button>
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => copyToClipboard(downloadedCredentials.password!, 'password')}
                            data-testid="button-copy-password-to-clipboard"
                          >
                            {copiedPassword ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                            {copiedPassword ? "Copied!" : "Copy Password"}
                          </Button>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground text-center">
                      Make sure to save {secretDownload?.type === 'both' ? 'both credentials' : 'this credential'} before closing this dialog
                    </p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction data-testid="button-close-secret-dialog">
              Done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
