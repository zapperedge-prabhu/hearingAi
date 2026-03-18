import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Trash2, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DeleteRuleDialog } from "./delete-rule-dialog";

interface InstalledRule {
  id: string;
  name: string;
  displayName: string;
  description: string;
  enabled: boolean;
  severity: string;
  queryFrequency: string;
  queryPeriod: string;
}

interface InstalledRulesResponse {
  ok: boolean;
  rules?: InstalledRule[];
  error?: string;
  errorCode?: string;
}

function getSeverityVariant(severity: string): "destructive" | "secondary" | "outline" | "default" {
  switch (severity.toLowerCase()) {
    case "high":
      return "destructive";
    case "medium":
      return "default";
    case "low":
      return "secondary";
    default:
      return "outline";
  }
}

function formatDuration(iso: string): string {
  const match = iso.match(/PT(\d+)([MH])/);
  if (!match) return iso;
  const [, value, unit] = match;
  return `${value}${unit === 'M' ? 'm' : 'h'}`;
}

interface InstalledRulesTabProps {
  onGoToCatalog: () => void;
  canDelete?: boolean;
  canEnableDisable?: boolean;
}

export function InstalledRulesTab({ onGoToCatalog, canDelete = true, canEnableDisable = true }: InstalledRulesTabProps) {
  const { toast } = useToast();
  const [deleteRule, setDeleteRule] = useState<InstalledRule | null>(null);
  const [togglingRules, setTogglingRules] = useState<Set<string>>(new Set());

  const { data, isLoading, error, refetch } = useQuery<InstalledRulesResponse>({
    queryKey: ["/api/sentinel/rules/installed"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      return apiRequest("DELETE", `/api/sentinel/rules/${ruleId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sentinel/rules/installed"] });
      toast({ title: "Rule deleted", description: "The detection rule has been removed." });
      setDeleteRule(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete rule", description: error.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) => {
      const action = enabled ? "enable" : "disable";
      return apiRequest("PATCH", `/api/sentinel/rules/${ruleId}/${action}`);
    },
    onSuccess: (_, { ruleId, enabled }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sentinel/rules/installed"] });
      toast({
        title: enabled ? "Rule enabled" : "Rule disabled",
        description: `The detection rule has been ${enabled ? "enabled" : "disabled"}.`,
      });
      setTogglingRules((prev) => {
        const next = new Set(prev);
        next.delete(ruleId);
        return next;
      });
    },
    onError: (error: Error, { ruleId }) => {
      toast({ title: "Failed to update rule", description: error.message, variant: "destructive" });
      setTogglingRules((prev) => {
        const next = new Set(prev);
        next.delete(ruleId);
        return next;
      });
    },
  });

  const handleToggle = (rule: InstalledRule, enabled: boolean) => {
    setTogglingRules((prev) => new Set(prev).add(rule.name));
    toggleMutation.mutate({ ruleId: rule.name, enabled });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (error || (data && !data.ok)) {
    const errorMessage = data?.error || (error as Error)?.message || "Unknown error";
    const isSentinelDisabled = data?.errorCode === "SENTINEL_DISABLED";

    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">
          {isSentinelDisabled ? "Microsoft Sentinel is not enabled" : "Failed to load rules"}
        </h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-md">
          {isSentinelDisabled
            ? "Contact your administrator to enable Sentinel integration."
            : errorMessage}
        </p>
        {!isSentinelDisabled && (
          <Button onClick={() => refetch()} variant="outline" data-testid="button-retry">
            Retry
          </Button>
        )}
      </div>
    );
  }

  const rules = data?.rules || [];

  if (rules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Shield className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">No rules installed yet</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Browse the Rule Catalog to install detection rules
        </p>
        <Button onClick={onGoToCatalog} data-testid="button-go-to-catalog">
          Go to Rule Catalog
        </Button>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[35%]">Rule Name</TableHead>
            <TableHead className="w-[10%]">Severity</TableHead>
            <TableHead className="w-[10%]">Status</TableHead>
            <TableHead className="w-[15%]">Frequency</TableHead>
            <TableHead className="w-[15%]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((rule) => (
            <TableRow key={rule.name} data-testid={`row-rule-${rule.name}`}>
              <TableCell className="font-medium">{rule.displayName}</TableCell>
              <TableCell>
                <Badge variant={getSeverityVariant(rule.severity)}>{rule.severity}</Badge>
              </TableCell>
              <TableCell>
                {canEnableDisable ? (
                  togglingRules.has(rule.name) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={(checked) => handleToggle(rule, checked)}
                      data-testid={`switch-enable-${rule.name}`}
                    />
                  )
                ) : (
                  <Badge variant={rule.enabled ? "default" : "secondary"}>
                    {rule.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDuration(rule.queryFrequency)}
              </TableCell>
              <TableCell>
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteRule(rule)}
                    data-testid={`button-delete-${rule.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <DeleteRuleDialog
        open={!!deleteRule}
        onOpenChange={(open) => !open && setDeleteRule(null)}
        ruleName={deleteRule?.displayName || ""}
        onConfirm={() => deleteRule && deleteMutation.mutate(deleteRule.name)}
        isPending={deleteMutation.isPending}
      />
    </>
  );
}
