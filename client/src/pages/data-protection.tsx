import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Shield,
  Edit,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

type ProtectionStatus = {
  accountId: number;
  accountName: string;
  resourceGroup: string;
  kind: "blob" | "adls";
  blobSoftDelete: {
    enabled: boolean;
    days: number | null;
  };
  containerSoftDelete: {
    enabled: boolean;
    days: number | null;
  };
  malwareScanning: {
    enabled: boolean;
  };
  sensitiveData: {
    enabled: boolean;
  };
  error?: string;
};

export default function DataProtection() {
  const { toast } = useToast();

  // State
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ProtectionStatus | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [isErrorDialogOpen, setIsErrorDialogOpen] = useState(false);

  // Form state
  const [formBlobEnabled, setFormBlobEnabled] = useState(false);
  const [formBlobDays, setFormBlobDays] = useState<number>(7);
  const [formContainerEnabled, setFormContainerEnabled] = useState(false);
  const [formContainerDays, setFormContainerDays] = useState<number>(7);
  const [formMalwareEnabled, setFormMalwareEnabled] = useState(false);

  // Fetch all protection statuses
  const {
    data: statusData,
    isLoading: statusLoading,
    refetch: refetchStatuses,
  } = useQuery<{ accounts: ProtectionStatus[] }>({
    queryKey: ["/api/data-protection/status/all"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/data-protection/status/all");
      return res.json();
    },
  });

  const protectionStatuses = statusData?.accounts || [];

  // Mutation for updating protection settings
  const updateProtectionMutation = useMutation({
    mutationFn: async (data: {
      accountName: string;
      enableBlobSoftDelete: boolean;
      blobRetentionDays?: number;
      enableContainerSoftDelete: boolean;
      containerRetentionDays?: number;
      enableMalwareScanning?: boolean;
      enableSensitiveData?: boolean;
    }) => {
      const res = await apiRequest("POST", "/api/data-protection/configure", {
        scope: "single",
        ...data,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Data protection settings updated successfully",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/data-protection/status/all"],
      });
      setConfigError(null);
      setIsEditDialogOpen(false);
      setEditingAccount(null);
      setIsErrorDialogOpen(false);
    },
    onError: (error: any) => {
      setConfigError(error.message || "Failed to update protection settings");
      setIsEditDialogOpen(false);
      setIsErrorDialogOpen(true);
    },
  });

  // Handlers
  const handleEditAccount = (account: ProtectionStatus) => {
    setEditingAccount(account);
    setFormBlobEnabled(account.blobSoftDelete.enabled);
    setFormBlobDays(account.blobSoftDelete.days ?? 7);
    setFormContainerEnabled(account.containerSoftDelete.enabled);
    setFormContainerDays(account.containerSoftDelete.days ?? 7);
    setFormMalwareEnabled(account.malwareScanning?.enabled ?? false);
    setConfigError(null);
    setIsErrorDialogOpen(false);
    setIsEditDialogOpen(true);
  };

  const handleUpdateProtection = () => {
    if (!editingAccount) return;

    updateProtectionMutation.mutate({
      accountName: editingAccount.accountName,
      enableBlobSoftDelete: formBlobEnabled,
      blobRetentionDays: formBlobEnabled ? formBlobDays : undefined,
      enableContainerSoftDelete: formContainerEnabled,
      containerRetentionDays: formContainerEnabled ? formContainerDays : undefined,
      enableMalwareScanning: formMalwareEnabled,
      enableSensitiveData: false, // Always disabled - hidden from UI
    });
  };

  const handleRefresh = () => {
    refetchStatuses();
    toast({
      title: "Refreshing",
      description: "Fetching latest protection statuses...",
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Shield className="w-8 h-8 text-primary" />
          <div>
            <h1
              className="text-3xl font-bold text-foreground"
              data-testid="text-page-title"
            >
              Data Protection
            </h1>
            <p className="text-muted-foreground">
              Configure soft delete policies for Azure Storage accounts
            </p>
          </div>
        </div>
        <Button
          onClick={handleRefresh}
          variant="outline"
          disabled={statusLoading}
          data-testid="button-refresh-all"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${statusLoading ? 'animate-spin' : ''}`} />
          Refresh All
        </Button>
      </div>

      {/* Protection Policies Table */}
      <Card>
        <CardHeader>
          <CardTitle>Protection Policies</CardTitle>
          <CardDescription>
            Soft delete and Malware scanning configuration for all storage accounts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-white rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Storage Account</TableHead>
                  <TableHead>Blob Soft Delete</TableHead>
                  <TableHead>Container Soft Delete</TableHead>
                  <TableHead>Malware Scanning</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statusLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      <p className="text-sm text-muted-foreground mt-2">
                        Loading protection statuses...
                      </p>
                    </TableCell>
                  </TableRow>
                ) : protectionStatuses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">
                        No storage accounts configured
                      </p>
                      <p className="text-sm text-gray-400 mt-2">
                        Add storage accounts to configure protection policies
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  protectionStatuses.map((status) => (
                    <TableRow
                      key={status.accountId}
                      data-testid={`row-account-${status.accountName}`}
                    >
                      <TableCell 
                        className="font-medium"
                        data-testid={`text-account-name-${status.accountName}`}
                      >
                        {status.accountName}
                      </TableCell>
                      <TableCell data-testid={`text-blob-status-${status.accountName}`}>
                        {status.error ? (
                          <Badge
                            className="bg-red-100 text-red-800"
                            data-testid={`badge-error-${status.accountName}`}
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Error
                          </Badge>
                        ) : status.blobSoftDelete.enabled ? (
                          <Badge
                            className="bg-green-100 text-green-800"
                            data-testid={`badge-blob-enabled-${status.accountName}`}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Enabled ({status.blobSoftDelete.days} days)
                          </Badge>
                        ) : (
                          <Badge
                            className="bg-gray-100 text-gray-800"
                            data-testid={`badge-blob-disabled-${status.accountName}`}
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Disabled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell data-testid={`text-container-status-${status.accountName}`}>
                        {status.error ? (
                          <Badge
                            className="bg-red-100 text-red-800"
                            data-testid={`badge-error-container-${status.accountName}`}
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Error
                          </Badge>
                        ) : status.containerSoftDelete.enabled ? (
                          <Badge
                            className="bg-green-100 text-green-800"
                            data-testid={`badge-container-enabled-${status.accountName}`}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Enabled ({status.containerSoftDelete.days} days)
                          </Badge>
                        ) : (
                          <Badge
                            className="bg-gray-100 text-gray-800"
                            data-testid={`badge-container-disabled-${status.accountName}`}
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Disabled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell data-testid={`text-malware-status-${status.accountName}`}>
                        {status.error ? (
                          <Badge
                            className="bg-red-100 text-red-800"
                            data-testid={`badge-error-malware-${status.accountName}`}
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Error
                          </Badge>
                        ) : status.malwareScanning?.enabled ? (
                          <Badge
                            className="bg-green-100 text-green-800"
                            data-testid={`badge-malware-enabled-${status.accountName}`}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Enabled
                          </Badge>
                        ) : (
                          <Badge
                            className="bg-gray-100 text-gray-800"
                            data-testid={`badge-malware-disabled-${status.accountName}`}
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Disabled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditAccount(status)}
                          data-testid={`button-edit-${status.accountName}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Protection Settings Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
        // Prevent closing the dialog while protection settings are being updated
        if (!open && updateProtectionMutation.isPending) {
          toast({
            title: "Update in Progress",
            description: "Please wait for the data protection settings to be saved before closing this window.",
            variant: "default",
          });
          return;
        }
        setIsEditDialogOpen(open);
      }}>
        <DialogContent 
            className="sm:max-w-[550px] max-h-[90vh] flex flex-col" 
            data-testid="dialog-edit-protection"
            showClose={!updateProtectionMutation.isPending}
            onPointerDownOutside={(e) => {
              e.preventDefault();
              toast({
                title: "Dialog Protection",
                description: updateProtectionMutation.isPending
                  ? "Please wait for the data protection settings to be saved. You cannot close this window during update."
                  : "Please use the X button to close this dialog to avoid losing your work.",
                variant: "default",
              });
            }}
            onEscapeKeyDown={(e) => {
              e.preventDefault();
              toast({
                title: "Dialog Protection",
                description: updateProtectionMutation.isPending
                  ? "Please wait for the data protection settings to be saved. You cannot close this window during update."
                  : "Please use the X button to close this dialog to avoid losing your work.",
                variant: "default",
              });
            }}
          >
          <DialogHeader>
            <DialogTitle>Edit Protection Settings</DialogTitle>
            <DialogDescription>
              Configure soft delete policies for {editingAccount?.accountName}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2 min-h-0">
            <div className="space-y-6 py-4">
            {/* Storage Account Info */}
            <div className="space-y-2">
              <Label>Storage Account (Read-only)</Label>
              <Input
                value={editingAccount?.accountName || ""}
                disabled
                className="bg-muted"
                data-testid="input-edit-account-name"
              />
            </div>

            {/* Blob Soft Delete Section */}
            <div className="space-y-4 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="edit-blob-enabled" className="text-base font-semibold">
                    Blob Soft Delete
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Protect blobs from accidental deletion
                  </p>
                </div>
                <Switch
                  id="edit-blob-enabled"
                  data-testid="input-edit-blob-enabled"
                  checked={formBlobEnabled}
                  onCheckedChange={setFormBlobEnabled}
                />
              </div>
              {formBlobEnabled && (
                <div className="space-y-2 pl-4">
                  <Label htmlFor="edit-blob-days">Retention Days (1-365)</Label>
                  <Input
                    id="edit-blob-days"
                    data-testid="input-edit-blob-days"
                    type="number"
                    min="1"
                    max="365"
                    value={formBlobDays}
                    onChange={(e) => setFormBlobDays(Number(e.target.value))}
                    placeholder="7"
                  />
                  <p className="text-xs text-muted-foreground">
                    Deleted blobs will be retained for this many days before permanent deletion
                  </p>
                </div>
              )}
            </div>

            {/* Container Soft Delete Section */}
            <div className="space-y-4 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="edit-container-enabled" className="text-base font-semibold">
                    Container Soft Delete
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Protect containers from accidental deletion
                  </p>
                </div>
                <Switch
                  id="edit-container-enabled"
                  data-testid="input-edit-container-enabled"
                  checked={formContainerEnabled}
                  onCheckedChange={setFormContainerEnabled}
                />
              </div>
              {formContainerEnabled && (
                <div className="space-y-2 pl-4">
                  <Label htmlFor="edit-container-days">Retention Days (1-365)</Label>
                  <Input
                    id="edit-container-days"
                    data-testid="input-edit-container-days"
                    type="number"
                    min="1"
                    max="365"
                    value={formContainerDays}
                    onChange={(e) => setFormContainerDays(Number(e.target.value))}
                    placeholder="7"
                  />
                  <p className="text-xs text-muted-foreground">
                    Deleted containers will be retained for this many days before permanent deletion
                  </p>
                </div>
              )}
            </div>

            {/* Malware Scanning Section */}
            <div className="space-y-4 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="edit-malware-enabled" className="text-base font-semibold">
                    Malware Scanning
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Scan newly uploaded blobs for malware threats
                  </p>
                </div>
                <Switch
                  id="edit-malware-enabled"
                  data-testid="input-edit-malware-enabled"
                  checked={formMalwareEnabled}
                  onCheckedChange={setFormMalwareEnabled}
                />
              </div>
            </div>
            </div>
          </div>
          <DialogFooter className="pt-4 border-t mt-4">
            <Button
              variant="outline"
              onClick={() => {
                // Prevent canceling while protection settings are being updated
                if (updateProtectionMutation.isPending) {
                  toast({
                    title: "Update in Progress",
                    description: "Please wait for the data protection settings to be saved. You cannot cancel during an active operation.",
                    variant: "default",
                  });
                  return;
                }
                setIsEditDialogOpen(false);
              }}
              disabled={updateProtectionMutation.isPending}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateProtection}
              disabled={updateProtectionMutation.isPending}
              data-testid="button-save-protection"
            >
              {updateProtectionMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Separate Error Dialog */}
      <Dialog open={isErrorDialogOpen} onOpenChange={setIsErrorDialogOpen}>
        <DialogContent className="sm:max-w-[550px]" data-testid="dialog-configuration-error">
          <DialogHeader>
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-1" />
              <div>
                <DialogTitle className="text-red-900 dark:text-red-100">
                  Configuration Failed
                </DialogTitle>
                <DialogDescription className="text-red-700 dark:text-red-300 mt-2">
                  Failed to update data protection settings for {editingAccount?.accountName}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="text-sm text-gray-800 dark:text-gray-200 space-y-3">
              {configError?.split('\n\n').map((paragraph, idx) => {
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
          <DialogFooter>
            <Button
              onClick={() => {
                setIsErrorDialogOpen(false);
                setConfigError(null);
              }}
              className="w-full sm:w-auto"
              data-testid="button-close-error"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
