import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Package,
  HardDrive,
  FileText,
  RefreshCw,
  Settings,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  BarChart3,
} from "lucide-react";

type StorageAccount = {
  id: number;
  name: string;
  accountName: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  kind?: "blob" | "adls";
  organizationId?: number;
};

type Container = {
  name: string;
};

type InventoryRule = {
  ruleName: string;
  enabled: boolean;
  containerName: string;
  destination: {
    accountName?: string;
    containerName: string;
    prefix?: string;
  };
  schedule: {
    frequency: string;
    startTime?: string;
  };
  fields: string[];
  format: string;
  objectType: string;
};

type InventorySummary = {
  containerName: string;
  reportPath: string;
  generatedAt: string;
  totalBlobs: number;
  totalSizeBytes: number;
  directoryCount?: number;
  fileCount?: number;
  objectCount?: number;
  lastModifiedRange?: { oldest: string; newest: string };
};

type AggregatedSummary = {
  accountName: string;
  containerSummaries: InventorySummary[];
  aggregate: {
    totalBlobs: number;
    totalSizeBytes: number;
    containerCount: number;
    blobsByTier?: Record<string, { count: number; sizeBytes: number }>;
  };
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(dateString: string): string {
  if (!dateString) return "N/A";
  try {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

export default function BlobInventory() {
  const { toast } = useToast();

  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [isConfigureDialogOpen, setIsConfigureDialogOpen] = useState(false);
  const [configureContainer, setConfigureContainer] = useState<string>("");
  const [configureEnabled, setConfigureEnabled] = useState(true);

  const { data: allAccounts = [], isLoading: accountsLoading } = useQuery<StorageAccount[]>({
    queryKey: ["/api/storage-accounts/all"],
  });

  const storageAccounts = useMemo(() => {
    const uniqueMap = new Map<string, StorageAccount>();
    allAccounts.forEach((account) => {
      const key = account.accountName || account.name;
      if (key && !uniqueMap.has(key)) {
        uniqueMap.set(key, account);
      }
    });
    return Array.from(uniqueMap.values());
  }, [allAccounts]);

  const selectedAccountDetails = useMemo(() => {
    return storageAccounts.find(a => (a.accountName || a.name) === selectedAccount);
  }, [storageAccounts, selectedAccount]);

  const { data: inventoryRulesData, isLoading: rulesLoading, refetch: refetchRules } = useQuery<{ rules: InventoryRule[] }>({
    queryKey: ["/api/inventory/rules", selectedAccount],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/inventory/rules?accountName=${selectedAccount}&resourceGroup=${selectedAccountDetails?.resourceGroup || ""}`);
      return res.json();
    },
    enabled: !!selectedAccount && !!selectedAccountDetails,
  });

  const { data: aggregateData, isLoading: aggregateLoading, refetch: refetchAggregate } = useQuery<AggregatedSummary>({
    queryKey: ["/api/inventory/summary-aggregate", selectedAccount],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/inventory/summary-aggregate?accountName=${selectedAccount}&resourceGroup=${selectedAccountDetails?.resourceGroup || ""}`);
      return res.json();
    },
    enabled: !!selectedAccount && !!selectedAccountDetails,
  });

  const { data: containersData, isLoading: containersLoading } = useQuery<{ containers: Container[] }>({
    queryKey: ["/api/inventory/containers", selectedAccount],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/inventory/containers?accountName=${selectedAccount}`);
      return res.json();
    },
    enabled: !!selectedAccount,
  });

  const configureMutation = useMutation({
    mutationFn: async (data: { accountName: string; containerName: string; enabled: boolean; resourceGroup?: string }) => {
      const res = await apiRequest("POST", "/api/inventory/configure", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: `Inventory ${configureEnabled ? "enabled" : "disabled"} successfully` });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/rules", selectedAccount] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/summary-aggregate", selectedAccount] });
      setIsConfigureDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to configure inventory", variant: "destructive" });
    },
  });

  const handleRefresh = () => {
    refetchRules();
    refetchAggregate();
    toast({ title: "Refreshing", description: "Fetching latest inventory data..." });
  };

  const handleConfigureInventory = (containerName: string, currentEnabled: boolean) => {
    setConfigureContainer(containerName);
    setConfigureEnabled(!currentEnabled);
    setIsConfigureDialogOpen(true);
  };

  const handleConfirmConfigure = () => {
    if (!selectedAccount || !configureContainer) return;
    configureMutation.mutate({
      accountName: selectedAccount,
      containerName: configureContainer,
      enabled: configureEnabled,
      resourceGroup: selectedAccountDetails?.resourceGroup,
    });
  };

  const inventoryRules = inventoryRulesData?.rules || [];
  const containers = containersData?.containers || [];

  const containerInventoryStatus = useMemo(() => {
    const statusMap = new Map<string, { enabled: boolean; ruleName?: string; format?: string }>();
    inventoryRules.forEach((rule) => {
      statusMap.set(rule.containerName, { enabled: rule.enabled, ruleName: rule.ruleName, format: rule.format });
    });
    return statusMap;
  }, [inventoryRules]);

  const hasNonCSVRules = useMemo(() => {
    return inventoryRules.some((rule) => rule.enabled && rule.format && rule.format.toUpperCase() !== "CSV");
  }, [inventoryRules]);

  const reconfigureCSVMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/inventory/reconfigure-csv", {
        accountName: selectedAccount,
        resourceGroup: selectedAccountDetails?.resourceGroup,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: data.success ? "Success" : "Error",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/rules", selectedAccount] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/summary-aggregate", selectedAccount] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to reconfigure format", variant: "destructive" });
    },
  });

  const isLoading = accountsLoading || (selectedAccount && (rulesLoading || aggregateLoading || containersLoading));

  return (
    <div className="container mx-auto p-6 space-y-6 relative">
      {selectedAccount && (rulesLoading || aggregateLoading || containersLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-sm">
          <Card className="p-6 flex flex-col items-center gap-4 shadow-lg border-primary/20">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="text-sm font-medium">Loading inventory data...</p>
          </Card>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6" />
            Blob Inventory
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and configure Azure Blob Storage inventory policies for your containers
          </p>
        </div>
        {selectedAccount && (
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isLoading as boolean}
            data-testid="button-refresh-inventory"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Select Storage Account</CardTitle>
          <CardDescription>Choose a storage account to view its inventory configuration</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedAccount} onValueChange={setSelectedAccount}>
            <SelectTrigger className="w-full max-w-md" data-testid="select-storage-account">
              <SelectValue placeholder="Select a storage account..." />
            </SelectTrigger>
            <SelectContent>
              {storageAccounts.map((account) => (
                <SelectItem
                  key={account.id}
                  value={account.accountName || account.name}
                  data-testid={`option-account-${account.accountName || account.name}`}
                >
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4" />
                    <span>{account.accountName || account.name}</span>
                    {account.kind && (
                      <Badge variant="secondary" className="text-xs">
                        {account.kind.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedAccount && (
        <>
          {aggregateLoading ? (
            <div className="grid gap-4 md:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-24" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : aggregateData?.aggregate ? (
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2">
                  <CardTitle className="text-sm font-medium">Total Blobs</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-blobs">
                    {aggregateData.containerSummaries?.reduce((acc, curr) => acc + (curr.objectCount ?? curr.totalBlobs ?? 0), 0).toLocaleString() ?? "0"}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2">
                  <CardTitle className="text-sm font-medium">Total Size</CardTitle>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-size">
                    {formatBytes(aggregateData.containerSummaries?.reduce((acc, curr) => acc + (curr.totalSizeBytes ?? 0), 0) ?? 0)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2">
                  <CardTitle className="text-sm font-medium">Containers</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-container-count">
                    {aggregateData.aggregate.containerCount}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2">
                  <CardTitle className="text-sm font-medium">Storage Tiers</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1" data-testid="container-tier-badges">
                    {Object.entries(aggregateData.aggregate.blobsByTier || {}).map(([tier, data]) => (
                      <Badge key={tier} variant="outline" className="text-xs">
                        {tier}: {data.count}
                      </Badge>
                    ))}
                    {Object.keys(aggregateData.aggregate.blobsByTier || {}).length === 0 && (
                      <span className="text-sm text-muted-foreground">No tier data</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Container Inventory Configuration
              </CardTitle>
              <CardDescription>
                Enable or disable inventory collection for each container
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasNonCSVRules && (
                <div className="flex items-center justify-between gap-4 p-3 mb-4 rounded-md border border-yellow-500/30 bg-yellow-500/5">
                  <div className="flex items-center gap-2 text-sm">
                    <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
                    <span>Some rules use Parquet format. Switch to CSV for easier readability when downloading reports.</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => reconfigureCSVMutation.mutate()}
                    disabled={reconfigureCSVMutation.isPending}
                    data-testid="button-switch-csv"
                  >
                    {reconfigureCSVMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    Switch All to CSV
                  </Button>
                </div>
              )}
              {containersLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : containers.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  No containers found in this storage account
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Container Name</TableHead>
                      <TableHead>Inventory Status</TableHead>
                      <TableHead>Format</TableHead>
                      <TableHead>Rule Name</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {containers.map((container) => {
                      const status = containerInventoryStatus.get(container.name);
                      const isEnabled = status?.enabled || false;
                      return (
                        <TableRow key={container.name} data-testid={`row-container-${container.name}`}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4 text-muted-foreground" />
                              {container.name}
                            </div>
                          </TableCell>
                          <TableCell>
                            {isEnabled ? (
                              <Badge variant="default" className="flex items-center gap-1 w-fit">
                                <CheckCircle2 className="h-3 w-3" />
                                Enabled
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                                <Clock className="h-3 w-3" />
                                Disabled
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {status?.format ? (
                              <Badge
                                variant={status.format.toUpperCase() === "CSV" ? "default" : "secondary"}
                                className="text-xs"
                              >
                                {status.format.toUpperCase()}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {status?.ruleName ? (
                              <code className="text-xs bg-muted px-2 py-1 rounded">
                                {status.ruleName}
                              </code>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant={isEnabled ? "outline" : "default"}
                              size="sm"
                              onClick={() => handleConfigureInventory(container.name, isEnabled)}
                              data-testid={`button-toggle-${container.name}`}
                            >
                              {isEnabled ? "Disable" : "Enable"} Inventory
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {aggregateData?.containerSummaries && aggregateData.containerSummaries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Container Inventory Summaries
                </CardTitle>
                <CardDescription>
                  Detailed inventory statistics for each container with inventory enabled
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {aggregateData.containerSummaries.map((summary) => (
                    <Card key={summary.containerName} className="bg-muted/50">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Package className="h-4 w-4" />
                            {summary.containerName}
                          </CardTitle>
                          <Badge variant="outline" className="text-xs">
                            <Clock className="h-3 w-3 mr-1" />
                            {formatDate(summary.generatedAt)}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-4 grid-cols-2 md:grid-cols-5 pt-2">
                          <div className="flex flex-col gap-1">
                            <Label className="text-[11px] text-muted-foreground">Total Objects</Label>
                            <p className="text-base font-bold" data-testid={`text-blobs-${summary.containerName}`}>
                              {(summary?.objectCount ?? summary?.totalBlobs ?? 0).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label className="text-[11px] text-muted-foreground">Directories</Label>
                            <p className="text-base font-bold" data-testid={`text-dirs-${summary.containerName}`}>
                              {(summary?.directoryCount ?? 0).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label className="text-[11px] text-muted-foreground">Files</Label>
                            <p className="text-base font-bold" data-testid={`text-files-${summary.containerName}`}>
                              {(summary?.fileCount ?? 0).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label className="text-[11px] text-muted-foreground">Total Size</Label>
                            <p className="text-base font-bold" data-testid={`text-size-${summary.containerName}`}>
                              {formatBytes(summary?.totalSizeBytes ?? 0)}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label className="text-[11px] text-muted-foreground">Raw Data</Label>
                            <div className="mt-0.5">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-[10px] px-2 gap-1.5 hover-elevate"
                                onClick={async () => {
                                  try {
                                    // SECURITY: Use POST to generate a temporary SAS URL instead of direct link
                                    const res = await apiRequest("POST", "/api/files/sas-url", {
                                      accountName: selectedAccount,
                                      containerName: "zapper-system",
                                      blobPath: summary.reportPath,
                                      organizationId: selectedAccountDetails?.organizationId
                                    });
                                    const data = await res.json();
                                    window.open(data.sasUrl || data.url, '_blank');
                                  } catch (error) {
                                    toast({ title: "Error", description: "Failed to generate download link", variant: "destructive" });
                                  }
                                }}
                              >
                                <FileText className="h-3 w-3" />
                                Download
                              </Button>
                            </div>
                          </div>
                        </div>
                        {summary.lastModifiedRange && (
                          <div className="mt-4 pt-3 border-t flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Content Range:</span>
                            <span className="font-medium text-muted-foreground">
                              {formatDate(summary.lastModifiedRange.oldest)} — {formatDate(summary.lastModifiedRange.newest)}
                            </span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={isConfigureDialogOpen} onOpenChange={setIsConfigureDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {configureEnabled ? "Enable" : "Disable"} Blob Inventory
            </DialogTitle>
            <DialogDescription>
              {configureEnabled
                ? `Enable inventory collection for container "${configureContainer}". This will create daily inventory reports in the zapper-system container.`
                : `Disable inventory collection for container "${configureContainer}". Existing reports will be preserved.`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-4">
              <Label>Container:</Label>
              <code className="bg-muted px-2 py-1 rounded text-sm">{configureContainer}</code>
            </div>
            <div className="flex items-center gap-4 mt-4">
              <Label htmlFor="inventory-toggle">Inventory Collection:</Label>
              <Switch
                id="inventory-toggle"
                checked={configureEnabled}
                onCheckedChange={setConfigureEnabled}
                data-testid="switch-inventory-toggle"
              />
              <span className={configureEnabled ? "text-green-600" : "text-muted-foreground"}>
                {configureEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfigureDialogOpen(false)} data-testid="button-cancel-configure">
              Cancel
            </Button>
            <Button onClick={handleConfirmConfigure} disabled={configureMutation.isPending} data-testid="button-confirm-configure">
              {configureMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {configureEnabled ? "Enable" : "Disable"} Inventory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
