import { useState, useMemo } from "react";
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
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Archive,
  Plus,
  Edit,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  X,
} from "lucide-react";

type StorageAccount = {
  id: number;
  name: string;
  accountName?: string;
  container?: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  kind?: "blob" | "adls";
  organizationId?: number;
};

type Container = {
  name: string;
};

type LifecycleActionType = "tierToCool" | "tierToCold" | "tierToArchive" | "delete";

type LifecycleAction = {
  action: LifecycleActionType;
  days: number;
};

type LifecycleRule = {
  ruleName: string;
  containerName: string;
  transitionType: string;
  days: number;
  actions?: LifecycleAction[];
  enabled: boolean;
};

const ACTION_ORDER: LifecycleActionType[] = ["tierToCool", "tierToCold", "tierToArchive", "delete"];

const ACTION_LABELS: Record<LifecycleActionType, string> = {
  tierToCool: "Cool",
  tierToCold: "Cold",
  tierToArchive: "Archive",
  delete: "Delete",
};

const ACTION_DESCRIPTIONS: Record<LifecycleActionType, string> = {
  tierToCool: "Move to Cool tier (lower storage cost, higher access cost)",
  tierToCold: "Move to Cold tier (very low storage cost, high access cost)",
  tierToArchive: "Move to Archive tier (lowest storage cost, hours to rehydrate)",
  delete: "Permanently delete the blob",
};

function getAvailableActions(configuredActions: LifecycleAction[]): LifecycleActionType[] {
  if (configuredActions.length === 0) {
    return [...ACTION_ORDER];
  }

  const configuredSet = new Set(configuredActions.map(a => a.action));
  
  let lastConfiguredIndex = -1;
  for (const action of configuredActions) {
    const index = ACTION_ORDER.indexOf(action.action);
    if (index > lastConfiguredIndex) {
      lastConfiguredIndex = index;
    }
  }

  return ACTION_ORDER
    .slice(lastConfiguredIndex + 1)
    .filter(action => !configuredSet.has(action));
}

function getMinDaysForAction(configuredActions: LifecycleAction[]): number {
  if (configuredActions.length === 0) return 0;
  return Math.max(...configuredActions.map(a => a.days)) + 1;
}

export default function DataLifecycle() {
  const { toast } = useToast();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<(LifecycleRule & { accountName: string }) | null>(null);
  const [deletingRule, setDeletingRule] = useState<(LifecycleRule & { accountName: string }) | null>(null);

  const [formStorageAccount, setFormStorageAccount] = useState<string>("");
  const [formContainer, setFormContainer] = useState<string>("");
  const [formActions, setFormActions] = useState<LifecycleAction[]>([]);
  const [formEnabled, setFormEnabled] = useState(true);

  const [newActionType, setNewActionType] = useState<LifecycleActionType | "">("");
  const [newActionDays, setNewActionDays] = useState<number>(30);

  const { data: allAccounts = [], isLoading: accountsLoading } = useQuery<StorageAccount[]>({
    queryKey: ["/api/storage-accounts/all"],
  });

  const storageAccounts = useMemo(() => {
    const uniqueMap = new Map<string, StorageAccount>();
    allAccounts.forEach((account) => {
      if (!uniqueMap.has(account.name)) {
        uniqueMap.set(account.name, account);
      }
    });
    return Array.from(uniqueMap.values());
  }, [allAccounts]);

  // Derive org-registered containers from allAccounts for the selected storage account
  // This shows only containers that belong to an org in the storage_accounts table,
  // not all Azure containers (which includes system/unrelated containers).
  const formContainers = useMemo(() => {
    if (!formStorageAccount) return [];
    const seen = new Set<string>();
    return allAccounts
      .filter(a => a.name === formStorageAccount && a.container)
      .filter(a => {
        if (seen.has(a.container!)) return false;
        seen.add(a.container!);
        return true;
      })
      .map(a => ({ name: a.container! }));
  }, [allAccounts, formStorageAccount]);

  const { data: allRulesData, isLoading: rulesLoading } = useQuery<{ accountName: string; rules: LifecycleRule[] }[]>({
    queryKey: ["/api/data-lifecycle/all-rules"],
    queryFn: async () => {
      const results = await Promise.all(
        storageAccounts.map(async (account) => {
          try {
            const res = await apiRequest("GET", `/api/data-lifecycle/rules?accountName=${account.name}`);
            const data = await res.json();
            return { accountName: account.name, rules: data.rules || [] };
          } catch {
            return { accountName: account.name, rules: [] };
          }
        })
      );
      return results;
    },
    enabled: storageAccounts.length > 0,
  });

  const allLifecycleRules = (allRulesData || []).flatMap((item) =>
    item.rules.map((rule) => ({ ...rule, accountName: item.accountName }))
  );

  const createRuleMutation = useMutation({
    mutationFn: async (data: { accountName: string; containerName: string; actions: LifecycleAction[]; enabled: boolean }) => {
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, "0");
      const ruleName = `zappermftlmrule${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const res = await apiRequest("POST", "/api/data-lifecycle/configure", { ...data, ruleName });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Lifecycle rule created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/data-lifecycle/all-rules"] });
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create lifecycle rule", variant: "destructive" });
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: async (data: { accountName: string; containerName: string; ruleName: string; actions: LifecycleAction[]; enabled: boolean }) => {
      const res = await apiRequest("POST", "/api/data-lifecycle/configure", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Lifecycle rule updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/data-lifecycle/all-rules"] });
      setIsEditDialogOpen(false);
      setEditingRule(null);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update lifecycle rule", variant: "destructive" });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (data: { accountName: string; ruleName: string }) => {
      const res = await apiRequest("DELETE", "/api/data-lifecycle/rule", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Lifecycle rule deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/data-lifecycle/all-rules"] });
      setIsDeleteDialogOpen(false);
      setDeletingRule(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete lifecycle rule", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormStorageAccount("");
    setFormContainer("");
    setFormActions([]);
    setFormEnabled(true);
    setNewActionType("");
    setNewActionDays(30);
  };

  const handleAddRule = () => {
    resetForm();
    setIsAddDialogOpen(true);
  };

  const handleEditRule = (rule: LifecycleRule & { accountName: string }) => {
    setEditingRule(rule);
    setFormStorageAccount(rule.accountName);
    setFormContainer(rule.containerName);
    setFormActions(rule.actions || []);
    setFormEnabled(rule.enabled);
    setNewActionType("");
    setNewActionDays(30);
    setIsEditDialogOpen(true);
  };

  const handleDeleteRule = (rule: LifecycleRule & { accountName: string }) => {
    setDeletingRule(rule);
    setIsDeleteDialogOpen(true);
  };

  const handleAddAction = () => {
    if (!newActionType) {
      toast({ title: "Error", description: "Please select an action type", variant: "destructive" });
      return;
    }

    const minDays = getMinDaysForAction(formActions);
    if (newActionDays < minDays) {
      toast({ title: "Error", description: `Days must be at least ${minDays} (greater than previous action)`, variant: "destructive" });
      return;
    }

    setFormActions([...formActions, { action: newActionType, days: newActionDays }]);
    setNewActionType("");
    setNewActionDays(Math.max(newActionDays + 30, minDays + 30));
  };

  const handleRemoveAction = (index: number) => {
    const newActions = formActions.filter((_, i) => i !== index);
    setFormActions(newActions);
  };

  const handleCreateRule = () => {
    if (!formStorageAccount) {
      toast({ title: "Error", description: "Please select a storage account", variant: "destructive" });
      return;
    }
    if (!formContainer) {
      toast({ title: "Error", description: "Please select a container", variant: "destructive" });
      return;
    }
    if (formActions.length === 0) {
      toast({ title: "Error", description: "Please add at least one action", variant: "destructive" });
      return;
    }

    createRuleMutation.mutate({
      accountName: formStorageAccount,
      containerName: formContainer,
      actions: formActions,
      enabled: formEnabled,
    });
  };

  const handleUpdateRule = () => {
    if (!editingRule) return;
    if (formActions.length === 0) {
      toast({ title: "Error", description: "Please add at least one action", variant: "destructive" });
      return;
    }

    updateRuleMutation.mutate({
      accountName: formStorageAccount,
      containerName: formContainer,
      ruleName: editingRule.ruleName,
      actions: formActions,
      enabled: formEnabled,
    });
  };

  const handleConfirmDelete = () => {
    if (!deletingRule) return;
    deleteRuleMutation.mutate({
      accountName: deletingRule.accountName,
      ruleName: deletingRule.ruleName,
    });
  };

  const getActionsDisplay = (rule: LifecycleRule) => {
    const actions = rule.actions || [];
    if (actions.length === 0) {
      return <Badge variant="secondary">{rule.transitionType} ({rule.days}d)</Badge>;
    }

    const sortedActions = [...actions].sort((a, b) => a.days - b.days);
    return (
      <div className="flex items-center gap-1 flex-wrap">
        <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Hot</Badge>
        {sortedActions.map((action, index) => (
          <div key={index} className="flex items-center gap-1">
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
            <Badge 
              variant="secondary"
              className={
                action.action === "delete" 
                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" 
                  : action.action === "tierToArchive"
                  ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                  : action.action === "tierToCold"
                  ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300"
                  : "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
              }
            >
              {ACTION_LABELS[action.action]} ({action.days}d)
            </Badge>
          </div>
        ))}
      </div>
    );
  };

  const availableActions = getAvailableActions(formActions);
  const minDays = getMinDaysForAction(formActions);

  const renderActionBuilder = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Configured Actions</Label>
        {formActions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No actions configured yet. Add actions below.</p>
        ) : (
          <div className="space-y-2">
            {formActions.sort((a, b) => a.days - b.days).map((action, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-md">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{ACTION_LABELS[action.action]}</Badge>
                  <span className="text-sm">after {action.days} days</span>
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleRemoveAction(index)} data-testid={`button-remove-action-${index}`}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {availableActions.length > 0 && (
        <div className="space-y-3 p-4 border rounded-md bg-card">
          <Label>Add Action</Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="action-type" className="text-xs text-muted-foreground">Action Type</Label>
              <Select value={newActionType} onValueChange={(val) => setNewActionType(val as LifecycleActionType)}>
                <SelectTrigger id="action-type" data-testid="select-action-type">
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  {availableActions.map((action) => (
                    <SelectItem key={action} value={action}>
                      <div className="flex flex-col">
                        <span>{ACTION_LABELS[action]}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {newActionType && (
                <p className="text-xs text-muted-foreground">{ACTION_DESCRIPTIONS[newActionType]}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="action-days" className="text-xs text-muted-foreground">Days After Modification</Label>
              <Input
                id="action-days"
                data-testid="input-action-days"
                type="number"
                min={minDays}
                max={36500}
                value={newActionDays}
                onChange={(e) => setNewActionDays(Number(e.target.value))}
              />
              {minDays > 0 && (
                <p className="text-xs text-muted-foreground">Must be greater than {minDays - 1} days</p>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleAddAction} disabled={!newActionType} data-testid="button-add-action">
            <Plus className="w-4 h-4 mr-1" />
            Add Action
          </Button>
        </div>
      )}

      {availableActions.length === 0 && formActions.length > 0 && (
        <p className="text-sm text-muted-foreground">All available actions have been configured.</p>
      )}
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center space-x-3">
          <Archive className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold text-foreground" data-testid="text-page-title">
              Data Lifecycle Management
            </h1>
            <p className="text-muted-foreground">
              Configure automated tier transitions and deletion policies for your storage accounts
            </p>
          </div>
        </div>
        <Button onClick={handleAddRule} data-testid="button-add-rule">
          <Plus className="w-4 h-4 mr-2" />
          Add Lifecycle Rule
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lifecycle Rules</CardTitle>
          <CardDescription>
            All configured tier transition rules across storage accounts. Rules can include multiple actions (Cool, Cold, Archive, Delete).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Storage Account</TableHead>
                  <TableHead>Rule Name</TableHead>
                  <TableHead>Container</TableHead>
                  <TableHead>Lifecycle Actions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rulesLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      <p className="text-sm text-muted-foreground mt-2">Loading lifecycle rules...</p>
                    </TableCell>
                  </TableRow>
                ) : allLifecycleRules.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <Archive className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No lifecycle rules configured</p>
                      <Button variant="outline" size="sm" onClick={handleAddRule} className="mt-4">
                        <Plus className="w-4 h-4 mr-2" />
                        Create First Rule
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  allLifecycleRules.map((rule) => (
                    <TableRow key={`${rule.accountName}-${rule.ruleName}`} data-testid={`row-rule-${rule.ruleName}`}>
                      <TableCell className="font-medium" data-testid={`text-account-${rule.ruleName}`}>
                        {rule.accountName}
                      </TableCell>
                      <TableCell data-testid={`text-rule-name-${rule.ruleName}`}>
                        {rule.ruleName}
                      </TableCell>
                      <TableCell data-testid={`text-container-${rule.ruleName}`}>
                        <Badge variant="secondary">{rule.containerName}</Badge>
                      </TableCell>
                      <TableCell data-testid={`text-actions-${rule.ruleName}`}>
                        {getActionsDisplay(rule)}
                      </TableCell>
                      <TableCell data-testid={`text-status-${rule.ruleName}`}>
                        {rule.enabled ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" data-testid={`badge-enabled-${rule.ruleName}`}>
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Enabled
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300" data-testid={`badge-disabled-${rule.ruleName}`}>
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Disabled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEditRule(rule)} data-testid={`button-edit-${rule.ruleName}`}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteRule(rule)} data-testid={`button-delete-${rule.ruleName}`}>
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[600px]" data-testid="dialog-add-rule" showClose={!createRuleMutation.isPending}>
          <DialogHeader>
            <DialogTitle>Add Lifecycle Rule</DialogTitle>
            <DialogDescription>
              Configure a new lifecycle rule with one or more tier transitions and deletion policies.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label htmlFor="add-storage-account">Storage Account</Label>
              <Select value={formStorageAccount} onValueChange={(value) => { setFormStorageAccount(value); setFormContainer(""); }}>
                <SelectTrigger id="add-storage-account" data-testid="input-add-storage-account">
                  <SelectValue placeholder={accountsLoading ? "Loading..." : "Select a storage account"} />
                </SelectTrigger>
                <SelectContent>
                  {storageAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.name}>
                      {account.name} - {account.kind === "adls" ? "ADLS Gen2" : "Blob Storage"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-container">Container</Label>
              <Select value={formContainer} onValueChange={setFormContainer} disabled={!formStorageAccount}>
                <SelectTrigger id="add-container" data-testid="input-add-container">
                  <SelectValue placeholder={!formStorageAccount ? "Select a storage account first" : "Select a container"} />
                </SelectTrigger>
                <SelectContent>
                  {formContainers.map((container) => (
                    <SelectItem key={container.name} value={container.name}>{container.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {renderActionBuilder()}

            <div className="flex items-center space-x-2">
              <Switch id="add-enabled" data-testid="input-add-enabled" checked={formEnabled} onCheckedChange={setFormEnabled} />
              <Label htmlFor="add-enabled">Enable rule</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} disabled={createRuleMutation.isPending}>Cancel</Button>
            <Button onClick={handleCreateRule} disabled={createRuleMutation.isPending || !formStorageAccount || !formContainer || formActions.length === 0} data-testid="button-save-rule">
              {createRuleMutation.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</>) : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]" data-testid="dialog-edit-rule" showClose={!updateRuleMutation.isPending}>
          <DialogHeader>
            <DialogTitle>Edit Lifecycle Rule</DialogTitle>
            <DialogDescription>Modify the lifecycle rule configuration.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Storage Account</Label>
              <Input value={formStorageAccount} disabled data-testid="input-edit-storage-account" />
            </div>
            <div className="space-y-2">
              <Label>Container</Label>
              <Input value={formContainer} disabled data-testid="input-edit-container" />
            </div>

            {renderActionBuilder()}

            <div className="flex items-center space-x-2">
              <Switch id="edit-enabled" data-testid="input-edit-enabled" checked={formEnabled} onCheckedChange={setFormEnabled} />
              <Label htmlFor="edit-enabled">Enable rule</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={updateRuleMutation.isPending}>Cancel</Button>
            <Button onClick={handleUpdateRule} disabled={updateRuleMutation.isPending || formActions.length === 0} data-testid="button-update-rule">
              {updateRuleMutation.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</>) : "Update Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]" data-testid="dialog-delete-rule">
          <DialogHeader>
            <DialogTitle>Delete Lifecycle Rule</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the rule "{deletingRule?.ruleName}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={deleteRuleMutation.isPending}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleteRuleMutation.isPending} data-testid="button-confirm-delete">
              {deleteRuleMutation.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</>) : "Delete Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
