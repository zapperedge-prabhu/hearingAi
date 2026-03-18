import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/auth";
import { useRole } from "@/contexts/role-context";
import { useRolePermissions } from "@/hooks/use-role-permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { 
  ChevronDown, 
  ChevronRight, 
  Upload, 
  Download, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle, 
  RefreshCw,
  Files,
  User,
  Calendar,
  ArrowUpCircle,
  ArrowDownCircle,
  FileWarning,
  ChevronLeft
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface FileTransferReport {
  id: number;
  actionId: string;
  organizationId: number;
  userId: number;
  actionType: string;
  totalFiles: number;
  successCount: number;
  failureCount: number;
  status: string;
  reportBlobPath: string | null;
  storageAccountName: string | null;
  containerName: string | null;
  createdAt: string;
  completedAt: string | null;
  userName?: string;
  userEmail?: string;
}

interface FileTransferReportDetail {
  actionId: string;
  actionType: string;
  initiatedBy: {
    userId: number;
    email: string;
    name?: string;
  };
  startedAt: string;
  completedAt?: string;
  summary: {
    totalFiles: number;
    successful: number;
    failed: number;
  };
  files: Array<{
    fullPath: string;
    status: string;
    sizeBytes?: number;
    error?: string;
  }>;
}

interface ReportsResponse {
  reports: FileTransferReport[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "SUCCESS":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Success
        </Badge>
      );
    case "PARTIAL_SUCCESS":
      return (
        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Partial
        </Badge>
      );
    case "FAILED":
      return (
        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>
      );
    case "IN_PROGRESS":
      return (
        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0">
          <Clock className="w-3 h-3 mr-1 animate-pulse" />
          In Progress
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getActionBadge(actionType: string) {
  if (actionType === "UPLOAD") {
    return (
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/30">
          <ArrowUpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </div>
        <span className="font-medium text-blue-700 dark:text-blue-400">Upload</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <div className="p-1.5 rounded-md bg-green-100 dark:bg-green-900/30">
        <ArrowDownCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
      </div>
      <span className="font-medium text-green-700 dark:text-green-400">Download</span>
    </div>
  );
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function ReportRow({ report, canViewDetails }: { report: FileTransferReport; canViewDetails: boolean }) {
  const [isOpen, setIsOpen] = useState(false);

  const { data: details, isLoading: detailsLoading } = useQuery<FileTransferReportDetail>({
    queryKey: ["/api/reports/file-transfer/details", report.actionId],
    queryFn: async () => {
      const token = getAuthToken();
      const headers: HeadersInit = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch(`/api/reports/file-transfer/${report.actionId}`, {
        credentials: "include",
        headers,
      });
      if (!res.ok) throw new Error("Failed to fetch report details");
      return res.json();
    },
    enabled: isOpen && !!report.reportBlobPath,
  });

  return (
    <>
      <tr 
        className={`${canViewDetails ? 'cursor-pointer' : ''} hover:bg-muted/50 transition-colors group border-b`}
        onClick={() => canViewDetails && setIsOpen(!isOpen)}
        data-testid={`row-report-${report.actionId}`}
      >
        <td className="h-14 px-3 align-middle">
          {canViewDetails && (
            <div className="text-muted-foreground group-hover:text-foreground transition-colors">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          )}
        </td>
        <td className="h-14 px-3 align-middle">{getActionBadge(report.actionType)}</td>
        <td className="h-14 px-3 align-middle">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate">{report.userName || "Unknown User"}</span>
              <span className="text-xs text-muted-foreground truncate">{report.userEmail}</span>
            </div>
          </div>
        </td>
        <td className="h-14 px-3 align-middle">
          <div className="flex flex-col">
            <span className="text-sm">
              {report.createdAt ? format(new Date(report.createdAt), "MMM d, yyyy") : "-"}
            </span>
            <span className="text-xs text-muted-foreground">
              {report.createdAt ? format(new Date(report.createdAt), "h:mm a") : ""}
            </span>
          </div>
        </td>
        <td className="h-14 px-3 align-middle">
          <div className="flex items-center gap-1.5">
            <Files className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{report.totalFiles}</span>
          </div>
        </td>
        <td className="h-14 px-3 align-middle">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="font-medium text-emerald-600 dark:text-emerald-400">{report.successCount}</span>
            </div>
            <div className="flex items-center gap-1">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="font-medium text-red-600 dark:text-red-400">{report.failureCount}</span>
            </div>
          </div>
        </td>
        <td className="h-14 px-3 align-middle">{getStatusBadge(report.status)}</td>
      </tr>
      {isOpen && (
        <tr className="bg-muted/30 border-b">
          <td colSpan={7} className="p-0">
            <div className="p-5">
              {detailsLoading ? (
                <div className="space-y-3">
                  <div className="flex gap-8">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-5 w-48" />
                  </div>
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : details ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Started:</span>
                      <span className="font-medium">
                        {details.startedAt ? format(new Date(details.startedAt), "MMM d, yyyy 'at' h:mm:ss a") : "-"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Completed:</span>
                      <span className="font-medium">
                        {details.completedAt ? format(new Date(details.completedAt), "MMM d, yyyy 'at' h:mm:ss a") : "In Progress"}
                      </span>
                    </div>
                  </div>
                  
                  <div className="rounded-lg border overflow-hidden bg-background">
                    <div className="bg-muted/50 px-4 py-2.5 border-b">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Files className="h-4 w-4" />
                        File Details ({details.files.length} files)
                      </h4>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableHead className="font-semibold">File Path</TableHead>
                          <TableHead className="w-28 font-semibold">Size</TableHead>
                          <TableHead className="w-28 font-semibold">Status</TableHead>
                          <TableHead className="font-semibold">Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {details.files.map((file, idx) => (
                          <TableRow key={idx} data-testid={`row-file-${idx}`} className="hover:bg-muted/20">
                            <TableCell className="font-mono text-xs break-all py-3">
                              <div className="flex items-start gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                                <span>{file.fullPath}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatBytes(file.sizeBytes)}</TableCell>
                            <TableCell>
                              {file.status === "SUCCESS" ? (
                                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-xs">
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  OK
                                </Badge>
                              ) : file.status === "FAILED" ? (
                                <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 text-xs">
                                  <XCircle className="w-3 h-3 mr-1" />
                                  Failed
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">{file.status}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-red-600 dark:text-red-400">
                              {file.error || <span className="text-muted-foreground">-</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                        {details.files.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                              <Files className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              No file details available
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileWarning className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-muted-foreground">
                    {report.reportBlobPath 
                      ? "Unable to load file details. The report data may have been created before tracking was enabled."
                      : "Detailed report not available for this action."}
                  </p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function FileTransferReports() {
  const { selectedOrganizationId } = useRole();
  const [page, setPage] = useState(1);
  const [actionTypeFilter, setActionTypeFilter] = useState<string>("all");
  const { data: rolePermissions } = useRolePermissions();
  const pageSize = 20;

  useEffect(() => {
    setPage(1);
  }, [selectedOrganizationId]);

  const { data, isLoading, refetch, isFetching } = useQuery<ReportsResponse>({
    queryKey: ["/api/reports/file-transfer", { page, pageSize, organizationId: selectedOrganizationId, actionType: actionTypeFilter !== "all" ? actionTypeFilter : undefined }],
    queryFn: async () => {
      const token = getAuthToken();
      const headers: HeadersInit = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("pageSize", pageSize.toString());
      if (selectedOrganizationId) {
        params.set("organizationId", selectedOrganizationId.toString());
      }
      if (actionTypeFilter !== "all") {
        params.set("actionType", actionTypeFilter);
      }
      
      const res = await fetch(`/api/reports/file-transfer?${params.toString()}`, {
        credentials: "include",
        headers,
      });
      if (!res.ok) throw new Error("Failed to fetch reports");
      return res.json();
    },
    enabled: !!selectedOrganizationId,
  });

  const handleRefresh = () => {
    refetch();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl">Transfer Reports</CardTitle>
                <CardDescription className="mt-0.5">
                  Track all file uploads and downloads
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {(() => {
                const canViewDetails = rolePermissions?.transferReports?.viewDetails;
                const canDownload = rolePermissions?.transferReports?.download;
                const hasBothOptions = canViewDetails && canDownload;
                const hasAnyOption = canViewDetails || canDownload;
                return (
                  <Select value={actionTypeFilter} onValueChange={(value) => { setActionTypeFilter(value); setPage(1); }}>
                    <SelectTrigger className="w-[160px]" data-testid="select-action-type">
                      <SelectValue placeholder="All Actions" />
                    </SelectTrigger>
                    <SelectContent>
                      {hasBothOptions && (
                        <SelectItem value="all">
                          <div className="flex items-center gap-2">
                            <Files className="h-4 w-4" />
                            All Actions
                          </div>
                        </SelectItem>
                      )}
                      {canViewDetails && (
                        <SelectItem value="UPLOAD">
                          <div className="flex items-center gap-2">
                            <ArrowUpCircle className="h-4 w-4 text-blue-500" />
                            Uploads Only
                          </div>
                        </SelectItem>
                      )}
                      {canDownload && (
                        <SelectItem value="DOWNLOAD">
                          <div className="flex items-center gap-2">
                            <ArrowDownCircle className="h-4 w-4 text-green-500" />
                            Downloads Only
                          </div>
                        </SelectItem>
                      )}
                      {!hasAnyOption && (
                        <SelectItem value="all" disabled>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Files className="h-4 w-4" />
                            No permissions
                          </div>
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                );
              })()}
              <Button 
                variant="outline" 
                size="default" 
                onClick={handleRefresh} 
                disabled={isFetching} 
                data-testid="button-refresh"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <Separator />
        
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
          ) : data?.reports && data.reports.length > 0 ? (
            <>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full table-fixed">
                  <colgroup>
                    <col style={{ width: "48px" }} />
                    <col style={{ width: "100px" }} />
                    <col style={{ width: "200px" }} />
                    <col style={{ width: "120px" }} />
                    <col style={{ width: "70px" }} />
                    <col style={{ width: "100px" }} />
                    <col style={{ width: "100px" }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="h-10 px-3 text-left align-middle font-semibold text-muted-foreground text-sm"></th>
                      <th className="h-10 px-3 text-left align-middle font-semibold text-muted-foreground text-sm">Action</th>
                      <th className="h-10 px-3 text-left align-middle font-semibold text-muted-foreground text-sm">User</th>
                      <th className="h-10 px-3 text-left align-middle font-semibold text-muted-foreground text-sm">Date/Time</th>
                      <th className="h-10 px-3 text-left align-middle font-semibold text-muted-foreground text-sm">Files</th>
                      <th className="h-10 px-3 text-left align-middle font-semibold text-muted-foreground text-sm">Results</th>
                      <th className="h-10 px-3 text-left align-middle font-semibold text-muted-foreground text-sm">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.reports.map((report) => (
                      <ReportRow key={report.actionId} report={report} canViewDetails={!!rolePermissions?.transferReports?.viewDetails} />
                    ))}
                  </tbody>
                </table>
              </div>
              
              {data.totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t">
                  <span className="text-sm text-muted-foreground">
                    Showing page <span className="font-medium">{data.page}</span> of{" "}
                    <span className="font-medium">{data.totalPages}</span>
                    {" "}({data.total} total reports)
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="default"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <div className="flex items-center gap-1 px-2">
                      {Array.from({ length: Math.min(5, data.totalPages) }, (_, i) => {
                        let pageNum;
                        if (data.totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (page <= 3) {
                          pageNum = i + 1;
                        } else if (page >= data.totalPages - 2) {
                          pageNum = data.totalPages - 4 + i;
                        } else {
                          pageNum = page - 2 + i;
                        }
                        return (
                          <Button
                            key={pageNum}
                            variant={page === pageNum ? "default" : "ghost"}
                            size="sm"
                            className="w-9 h-9"
                            onClick={() => setPage(pageNum)}
                            data-testid={`button-page-${pageNum}`}
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="default"
                      onClick={() => setPage(p => p + 1)}
                      disabled={page >= data.totalPages}
                      data-testid="button-next-page"
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-1">No transfer reports found</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Upload or download files to see detailed transfer reports here. 
                Reports track success and failure status for each file.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
