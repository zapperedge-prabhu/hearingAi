import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, AlertTriangle, Lock, ExternalLink, Search, X, ChevronRight, ChevronLeft, Clock, User, AlertCircle, Info, Shield } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useRolePermissions } from "@/hooks/use-role-permissions";
import { LoadingSpinner } from "@/components/ui/spinner";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";

interface SentinelIncident {
  id: string;
  incidentNumber: number;
  title: string;
  severity: string;
  status: string;
  owner: string | null;
  provider: string;
  product: string;
  createdTimeUtc: string;
  lastUpdatedTimeUtc: string;
  alertsCount: number;
  entitiesCount: number;
  portalUrl: string | null;
  defenderXdrUrl: string | null;
}

interface IncidentDetails extends SentinelIncident {
  description: string | null;
  classification: string | null;
  classificationReason: string | null;
  classificationComment: string | null;
  labels: string[];
  entities: any[];
  alerts: any[];
}

const RANGE_OPTIONS = [
  { value: "24h", label: "Last 24 hours" },
  { value: "48h", label: "Last 48 hours" },
  { value: "72h", label: "Last 72 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "14d", label: "Last 14 days" },
  { value: "30d", label: "Last 30 days" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "New", label: "New" },
  { value: "Active", label: "Active" },
  { value: "Closed", label: "Closed" },
];

const SEVERITY_OPTIONS = [
  { value: "all", label: "All Severities" },
  { value: "High", label: "High" },
  { value: "Medium", label: "Medium" },
  { value: "Low", label: "Low" },
  { value: "Informational", label: "Informational" },
];

function getSeverityVariant(severity: string): "destructive" | "default" | "secondary" | "outline" {
  switch (severity?.toLowerCase()) {
    case "high": return "destructive";
    case "medium": return "default";
    case "low": return "secondary";
    default: return "outline";
  }
}

function getStatusVariant(status: string): "destructive" | "default" | "secondary" | "outline" {
  switch (status?.toLowerCase()) {
    case "new": return "destructive";
    case "active": return "default";
    case "closed": return "secondary";
    default: return "outline";
  }
}

export default function SentinelIncidents() {
  const [selectedRange, setSelectedRange] = useState("24h");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedSeverity, setSelectedSeverity] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  
  const { data: rolePermissions, isLoading: permissionsLoading } = useRolePermissions();
  const canView = Boolean(rolePermissions?.siemMgmt?.incidentsView);

  const queryParams = new URLSearchParams({
    range: selectedRange,
    ...(selectedStatus !== "all" && { status: selectedStatus }),
    ...(selectedSeverity !== "all" && { severity: selectedSeverity }),
    ...(searchQuery && { search: searchQuery }),
  });

  const { data: incidentsData, isLoading: incidentsLoading, error: incidentsError } = useQuery({
    queryKey: ["/api/sentinel/incidents", queryParams.toString()],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/sentinel/incidents?${queryParams.toString()}`);
      return response.json();
    },
    enabled: canView,
    refetchInterval: 60000,
  });

  const { data: incidentDetailData, isLoading: detailLoading } = useQuery({
    queryKey: ["/api/sentinel/incidents", selectedIncidentId],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/sentinel/incidents/${selectedIncidentId}`);
      return response.json();
    },
    enabled: canView && !!selectedIncidentId,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/sentinel/incidents"] });
  };

  const handleClearFilters = () => {
    setSelectedRange("24h");
    setSelectedStatus("all");
    setSelectedSeverity("all");
    setSearchQuery("");
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
            <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-page-title">
              <AlertTriangle className="h-6 w-6" />
              SIEM Incidents
            </h1>
            <p className="text-sm text-muted-foreground">
              View Microsoft Sentinel security incidents
            </p>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
          <Lock className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">You do not have permission to view SIEM incidents.</p>
        </div>
      </div>
    );
  }

  const incidents: SentinelIncident[] = incidentsData?.items || [];
  const incidentDetail: IncidentDetails | null = incidentDetailData?.incident || null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 p-4 border-b flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-page-title">
            <AlertTriangle className="h-6 w-6" />
            SIEM Incidents
          </h1>
          <p className="text-sm text-muted-foreground">
            View Microsoft Sentinel security incidents
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} data-testid="button-refresh-incidents">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="flex items-center gap-3 p-4 border-b flex-wrap">
        <Select value={selectedRange} onValueChange={setSelectedRange}>
          <SelectTrigger className="w-[160px]" data-testid="select-range">
            <SelectValue placeholder="Time range" />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-[140px]" data-testid="select-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedSeverity} onValueChange={setSelectedSeverity}>
          <SelectTrigger className="w-[140px]" data-testid="select-severity">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            {SEVERITY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search incidents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>

        {(selectedStatus !== "all" || selectedSeverity !== "all" || searchQuery) && (
          <Button variant="ghost" size="sm" onClick={handleClearFilters} data-testid="button-clear-filters">
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className={cn(
          "flex-1 overflow-auto p-4",
          selectedIncidentId ? "w-1/2 border-r" : "w-full"
        )}>
          {incidentsLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : incidentsError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-destructive mb-4" />
              <h3 className="text-lg font-medium mb-2">Failed to Load Incidents</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {incidentsError instanceof Error ? incidentsError.message : "An error occurred"}
              </p>
              <Button variant="outline" onClick={handleRefresh}>
                Try Again
              </Button>
            </div>
          ) : incidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Shield className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Incidents Found</h3>
              <p className="text-sm text-muted-foreground">
                No security incidents match your current filters.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {incidents.map((incident) => (
                <Card
                  key={incident.id}
                  className={cn(
                    "cursor-pointer hover-elevate transition-colors",
                    selectedIncidentId === incident.id && "ring-2 ring-primary"
                  )}
                  onClick={() => setSelectedIncidentId(incident.id)}
                  data-testid={`card-incident-${incident.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant={getSeverityVariant(incident.severity)} className="text-xs">
                            {incident.severity}
                          </Badge>
                          <Badge variant={getStatusVariant(incident.status)} className="text-xs">
                            {incident.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            #{incident.incidentNumber}
                          </span>
                        </div>
                        <h4 className="font-medium truncate" title={incident.title}>
                          {incident.title}
                        </h4>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(incident.createdTimeUtc), { addSuffix: true })}
                          </span>
                          {incident.owner && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {incident.owner}
                            </span>
                          )}
                          <span>{incident.alertsCount} alert(s)</span>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {selectedIncidentId && (
          <div className="w-1/2 overflow-auto p-4 bg-muted/30">
            <div className="flex items-center justify-between mb-4 gap-2">
              <h3 className="text-lg font-semibold">Incident Details</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedIncidentId(null)}
                data-testid="button-close-detail"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {detailLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : incidentDetail ? (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={getSeverityVariant(incidentDetail.severity)}>
                        {incidentDetail.severity}
                      </Badge>
                      <Badge variant={getStatusVariant(incidentDetail.status)}>
                        {incidentDetail.status}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg mt-2">{incidentDetail.title}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Incident #{incidentDetail.incidentNumber}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {incidentDetail.description && (
                      <div>
                        <h4 className="text-sm font-medium mb-1">Description</h4>
                        <p className="text-sm text-muted-foreground">{incidentDetail.description}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Created</span>
                        <p>{format(new Date(incidentDetail.createdTimeUtc), "PPpp")}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Last Updated</span>
                        <p>{format(new Date(incidentDetail.lastUpdatedTimeUtc), "PPpp")}</p>
                      </div>
                      {incidentDetail.owner && (
                        <div>
                          <span className="text-muted-foreground">Owner</span>
                          <p>{incidentDetail.owner}</p>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">Product</span>
                        <p>{incidentDetail.product}</p>
                      </div>
                    </div>

                    {incidentDetail.classification && (
                      <div>
                        <h4 className="text-sm font-medium mb-1">Classification</h4>
                        <p className="text-sm">{incidentDetail.classification}</p>
                        {incidentDetail.classificationReason && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Reason: {incidentDetail.classificationReason}
                          </p>
                        )}
                      </div>
                    )}

                    {incidentDetail.labels.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-1">Labels</h4>
                        <div className="flex flex-wrap gap-1">
                          {incidentDetail.labels.map((label, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2 flex-wrap">
                      {incidentDetail.portalUrl && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={incidentDetail.portalUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Azure Portal
                          </a>
                        </Button>
                      )}
                      {incidentDetail.defenderXdrUrl && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={incidentDetail.defenderXdrUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Defender XDR
                          </a>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {incidentDetail.alerts.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Related Alerts ({incidentDetail.alerts.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {incidentDetail.alerts.map((alert: any, idx: number) => (
                          <div key={idx} className="text-sm p-2 bg-muted rounded-md">
                            <p className="font-medium">{alert.alertDisplayName || alert.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {alert.severity} - {alert.status}
                            </p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {incidentDetail.entities.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Related Entities ({incidentDetail.entities.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {incidentDetail.entities.map((entity: any, idx: number) => (
                          <div key={idx} className="text-sm p-2 bg-muted rounded-md">
                            <p className="font-medium">{entity.kind}</p>
                            <p className="text-xs text-muted-foreground">
                              {JSON.stringify(entity.properties).substring(0, 100)}...
                            </p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">Failed to load incident details</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
