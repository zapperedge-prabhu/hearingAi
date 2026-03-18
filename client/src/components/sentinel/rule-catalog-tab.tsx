import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { RuleCard } from "./rule-card";

interface RuleParam {
  name: string;
  type: string;
  default: number;
  min?: number;
  max?: number;
  description: string;
}

interface CatalogRule {
  ruleId: string;
  displayName: string;
  description: string;
  severity: string;
  enabledByDefault: boolean;
  params: RuleParam[];
  defaults: Record<string, number>;
  tactics: string[];
}

interface CatalogResponse {
  ok: boolean;
  rules?: CatalogRule[];
  error?: string;
  errorCode?: string;
}

interface InstalledRule {
  name: string;
}

interface InstalledRulesResponse {
  ok: boolean;
  rules?: InstalledRule[];
}

interface RuleCatalogTabProps {
  onInstallSuccess: () => void;
  canInstall?: boolean;
}

export function RuleCatalogTab({ onInstallSuccess, canInstall = true }: RuleCatalogTabProps) {
  const { toast } = useToast();
  const [installingRuleId, setInstallingRuleId] = useState<string | null>(null);

  const catalogQuery = useQuery<CatalogResponse>({
    queryKey: ["/api/sentinel/rules/catalog"],
  });

  const installedQuery = useQuery<InstalledRulesResponse>({
    queryKey: ["/api/sentinel/rules/installed"],
  });

  const installMutation = useMutation({
    mutationFn: async ({ ruleId, params }: { ruleId: string; params: Record<string, number> }) => {
      return apiRequest("POST", "/api/sentinel/rules/install", { ruleId, params });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sentinel/rules/installed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sentinel/rules/catalog"] });
      toast({ title: "Rule installed", description: "The detection rule has been installed successfully." });
      setInstallingRuleId(null);
      onInstallSuccess();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to install rule", description: error.message, variant: "destructive" });
      setInstallingRuleId(null);
    },
  });

  const handleInstall = (ruleId: string, params: Record<string, number>) => {
    setInstallingRuleId(ruleId);
    installMutation.mutate({ ruleId, params });
  };

  const isLoading = catalogQuery.isLoading || installedQuery.isLoading;
  const error = catalogQuery.error || installedQuery.error;
  const catalogData = catalogQuery.data;
  const installedData = installedQuery.data;

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || (catalogData && !catalogData.ok)) {
    const errorMessage = catalogData?.error || (error as Error)?.message || "Unknown error";
    const isSentinelDisabled = catalogData?.errorCode === "SENTINEL_DISABLED";

    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">
          {isSentinelDisabled ? "Microsoft Sentinel is not enabled" : "Failed to load catalog"}
        </h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-md">
          {isSentinelDisabled
            ? "Contact your administrator to enable Sentinel integration."
            : errorMessage}
        </p>
        {!isSentinelDisabled && (
          <Button onClick={() => catalogQuery.refetch()} variant="outline" data-testid="button-retry-catalog">
            Retry
          </Button>
        )}
      </div>
    );
  }

  const catalogRules = catalogData?.rules || [];
  const installedRuleNames = new Set((installedData?.rules || []).map((r) => r.name));

  const mapRuleIdToResourceName = (ruleId: string): string => {
    return `zapper-${ruleId.replace(/_/g, "-")}`;
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {catalogRules.map((rule) => {
        const resourceName = mapRuleIdToResourceName(rule.ruleId);
        const isInstalled = installedRuleNames.has(resourceName);
        const isPending = installingRuleId === rule.ruleId && installMutation.isPending;

        return (
          <RuleCard
            key={rule.ruleId}
            rule={rule}
            isInstalled={isInstalled}
            onInstall={handleInstall}
            isPending={isPending}
            canInstall={canInstall}
          />
        );
      })}
    </div>
  );
}
