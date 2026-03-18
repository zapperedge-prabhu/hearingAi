import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { RefreshCw, Shield, Lock } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { InstalledRulesTab } from "@/components/sentinel/installed-rules-tab";
import { RuleCatalogTab } from "@/components/sentinel/rule-catalog-tab";
import { useRolePermissions } from "@/hooks/use-role-permissions";
import { LoadingSpinner } from "@/components/ui/spinner";

export default function SentinelRules() {
  const [activeTab, setActiveTab] = useState("installed");
  const { data: rolePermissions, isLoading: permissionsLoading } = useRolePermissions();

  const canView = Boolean(rolePermissions?.siemMgmt?.view);
  const canInstall = Boolean(rolePermissions?.siemMgmt?.install);
  const canDelete = Boolean(rolePermissions?.siemMgmt?.delete);
  const canEnableDisable = Boolean(rolePermissions?.siemMgmt?.enableDisable);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/sentinel/rules/installed"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sentinel/rules/catalog"] });
  };

  const handleGoToCatalog = () => {
    setActiveTab("catalog");
  };

  const handleInstallSuccess = () => {
    setActiveTab("installed");
  };

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between gap-4 p-4 border-b">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Shield className="h-6 w-6" />
              SIEM Rules
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage Microsoft Sentinel detection rules
            </p>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
          <Lock className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">You do not have permission to view SIEM rules.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 p-4 border-b">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            SIEM Rules
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage Microsoft Sentinel detection rules
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} data-testid="button-refresh-rules">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="installed" data-testid="tab-installed-rules">
              Installed Rules
            </TabsTrigger>
            <TabsTrigger value="catalog" data-testid="tab-rule-catalog">
              Rule Catalog
            </TabsTrigger>
          </TabsList>

          <TabsContent value="installed">
            <InstalledRulesTab 
              onGoToCatalog={handleGoToCatalog} 
              canDelete={canDelete}
              canEnableDisable={canEnableDisable}
            />
          </TabsContent>

          <TabsContent value="catalog">
            <RuleCatalogTab 
              onInstallSuccess={handleInstallSuccess} 
              canInstall={canInstall}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
