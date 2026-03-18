import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useRolePermissions } from "@/hooks/use-role-permissions";
import { useRole } from "@/contexts/role-context";
import { apiRequest } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/spinner";
import { 
  Key, 
  RefreshCw, 
  Lock, 
  Download,
  AlertTriangle,
  Copy,
  Check,
  FolderOpen,
  Clock
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

interface SftpPermissions {
  read?: boolean;
  write?: boolean;
  list?: boolean;
  delete?: boolean;
}

interface MySftpAccess {
  id: number;
  organizationId: number;
  storageAccountName: string;
  resourceGroup: string;
  localUsername: string;
  displayName: string | null;
  sshEnabled: boolean;
  passwordEnabled: boolean;
  sshKeyFingerprint: string | null;
  sshLastRotatedAt: string | null;
  passwordLastRotatedAt: string | null;
  scopes: {
    containerName: string;
    permissions: SftpPermissions | string;
  }[];
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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getPermissionLabel(perm: SftpPermissions | string): string {
  if (typeof perm === 'string') {
    const labels: Record<string, string> = {
      'r': 'Read',
      'w': 'Write',
      'l': 'List',
      'd': 'Delete',
      'c': 'Create',
      'rw': 'Read + Write',
      'rwl': 'Read + Write + List',
      'rwld': 'Full Access'
    };
    return labels[perm] || perm.toUpperCase();
  }
  
  const parts: string[] = [];
  if (perm.read) parts.push('Read');
  if (perm.write) parts.push('Write');
  if (perm.list) parts.push('List');
  if (perm.delete) parts.push('Delete');
  
  if (parts.length === 4) return 'Full Access';
  if (parts.length === 0) return 'No Access';
  return parts.join(' + ');
}

export default function MySftpAccess() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: rolePermissions } = useRolePermissions();
  const { selectedOrganizationId, selectedRole } = useRole();

  const [rotateAction, setRotateAction] = useState<{id: number, type: 'ssh' | 'password', username: string} | null>(null);
  const [secretDownload, setSecretDownload] = useState<{token: string, type: 'ssh' | 'password', expiresAt: Date} | null>(null);
  const [downloadedSecret, setDownloadedSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Query SFTP access for the currently selected organization
  const { data: myAccessData, isLoading, error } = useQuery<MySftpAccess | null>({
    queryKey: ["/api/sftp-local-users/my-access", selectedOrganizationId],
    queryFn: async () => {
      const url = selectedOrganizationId 
        ? `/api/sftp-local-users/my-access?organizationId=${selectedOrganizationId}`
        : `/api/sftp-local-users/my-access`;
      const response = await apiRequest("GET", url);
      return response.json();
    },
    staleTime: 0, // Always refetch to prevent stale cache issues
    gcTime: 0, // Don't keep old data in cache
    enabled: !!selectedOrganizationId, // Only fetch when an org is selected
  });

  const myAccess = myAccessData ? [myAccessData] : [];
  const selectedOrgName = selectedRole?.organization?.name;

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
      queryClient.invalidateQueries({ queryKey: ["/api/sftp-local-users/my-access", selectedOrganizationId] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/sftp-local-users/my-access", selectedOrganizationId] });
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
      setDownloadedSecret(result.privateKey || result.password);
      toast({ title: "Success", description: "Secret retrieved - copy now, it cannot be retrieved again" });
    },
    onError: (error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
      setSecretDownload(null);
    }
  });

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  }

  const canRotateSsh = rolePermissions?.sftpMgmt?.rotateSshSelf;
  const canRotatePassword = rolePermissions?.sftpMgmt?.rotatePasswordSelf;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Error Loading Access</h2>
          <p className="text-muted-foreground">{parseErrorMessage(error as Error)}</p>
        </div>
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
      <div className="flex items-center gap-3">
        <Key className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">My SFTP Access</h1>
          <p className="text-muted-foreground">
            View and manage your SFTP credentials
            {selectedOrgName && (
              <span className="ml-1">
                for <span className="font-medium text-foreground">{selectedOrgName}</span>
              </span>
            )}
          </p>
        </div>
      </div>

      {!selectedOrganizationId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Key className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Select an Organization</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Please select an organization from the dropdown menu in the header to view your SFTP access for that organization.
            </p>
          </CardContent>
        </Card>
      ) : !myAccess || myAccess.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Key className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No SFTP Access Configured</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              You don't have any SFTP local users assigned to your account
              {selectedOrgName && <span> for <strong>{selectedOrgName}</strong></span>}.
              Contact your administrator to request SFTP access.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {myAccess.map((access) => (
            <Card key={access.id} data-testid={`card-sftp-access-${access.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {access.displayName || access.localUsername}
                      <Badge variant="outline" className="font-normal">
                        {access.localUsername}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="mt-1 space-y-1">
                      <div>Storage: {access.storageAccountName} / {access.resourceGroup}</div>
                      {access.scopes?.[0]?.containerName && (
                        <div className="font-mono text-xs break-all">
                          Connection: {access.storageAccountName}.{access.scopes[0].containerName}.{access.localUsername}@{access.storageAccountName}.blob.core.windows.net
                        </div>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    {access.sshEnabled && <Badge variant="secondary">SSH</Badge>}
                    {access.passwordEnabled && <Badge variant="secondary">Password</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  {access.sshEnabled && (
                    <div className="p-4 border rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium flex items-center gap-2">
                          <Key className="h-4 w-4" />
                          SSH Key Authentication
                        </h4>
                        {canRotateSsh && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setRotateAction({ id: access.id, type: 'ssh', username: access.localUsername })}
                            data-testid={`button-rotate-ssh-${access.id}`}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Rotate Key
                          </Button>
                        )}
                      </div>
                      <div className="text-sm space-y-1">
                        {access.sshKeyFingerprint && (
                          <p className="text-muted-foreground">
                            <span className="text-foreground font-medium">Fingerprint:</span>{" "}
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">
                              {access.sshKeyFingerprint.substring(0, 40)}...
                            </code>
                          </p>
                        )}
                        <p className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          Last rotated: {formatDate(access.sshLastRotatedAt)}
                        </p>
                      </div>
                    </div>
                  )}

                  {access.passwordEnabled && (
                    <div className="p-4 border rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium flex items-center gap-2">
                          <Lock className="h-4 w-4" />
                          Password Authentication
                        </h4>
                        {canRotatePassword && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setRotateAction({ id: access.id, type: 'password', username: access.localUsername })}
                            data-testid={`button-rotate-password-${access.id}`}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Rotate Password
                          </Button>
                        )}
                      </div>
                      <p className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Last rotated: {formatDate(access.passwordLastRotatedAt)}
                      </p>
                    </div>
                  )}
                </div>

                {access.scopes && access.scopes.length > 0 && (
                  <div className="pt-2">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <FolderOpen className="h-4 w-4" />
                      Container Permissions
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {access.scopes.map((scope, idx) => (
                        <Badge key={idx} variant="outline" className="text-sm">
                          <FolderOpen className="h-3 w-3 mr-1" />
                          {scope.containerName}: {getPermissionLabel(scope.permissions)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
                  for "{rotateAction?.username}". The previous credential will be invalidated immediately.
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
                  rotateSshMutation.mutate(rotateAction.id);
                } else {
                  rotatePasswordMutation.mutate(rotateAction.id);
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
        setDownloadedSecret(null);
      }}>
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Download {secretDownload?.type === 'ssh' ? 'Private Key' : 'Password'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 rounded-md border border-amber-500/20">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                  <div className="text-sm">
                    <strong>One-time download only.</strong> This credential will expire in 120 seconds 
                    and cannot be retrieved again after this dialog is closed.
                  </div>
                </div>

                {!downloadedSecret ? (
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
                    Retrieve {secretDownload?.type === 'ssh' ? 'Private Key' : 'Password'}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <pre className="p-3 bg-muted rounded-md text-xs overflow-x-auto max-h-64">
                        {downloadedSecret}
                      </pre>
                      <Button
                        variant="outline"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => copyToClipboard(downloadedSecret)}
                        data-testid="button-copy-secret"
                      >
                        {copiedSecret ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="default"
                        className="flex-1"
                        onClick={() => {
                          const filename = secretDownload?.type === 'ssh' 
                            ? 'sftp_private_key.pem' 
                            : 'sftp_password.txt';
                          const blob = new Blob([downloadedSecret], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = filename;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        }}
                        data-testid="button-download-file"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download as File
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => copyToClipboard(downloadedSecret)}
                        data-testid="button-copy-to-clipboard"
                      >
                        {copiedSecret ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                        {copiedSecret ? "Copied!" : "Copy"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      Click the copy button to copy to clipboard
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
