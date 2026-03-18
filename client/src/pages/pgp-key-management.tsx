import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { LoadingSpinner } from "@/components/ui/spinner";
import { useRole } from "@/contexts/role-context";
import { useRolePermissions } from "@/hooks/use-role-permissions";
import { Plus, Download, AlertCircle, Check, KeyRound, Upload, Copy, Trash, ShieldX, Building2, Users, Eye, EyeOff, FileUp } from "lucide-react";
import { z } from "zod";

interface PgpKey {
  id: number;
  orgId: number;
  keyName: string;
  publicKeyArmored: string;
  keyId: string;
  keyType: "OWN" | "PARTNER";
  belongsTo: "SELF" | "PARTNER";
  source: "GENERATED" | "IMPORTED";
  isActive: boolean;
  hasPrivateKey?: boolean;
  createdAt: string;
}

interface PgpKeysResponse {
  keys: PgpKey[];
  count: number;
}

interface KeyVaultError {
  type: 'KEY_VAULT_PERMISSION_ERROR';
  code: string;
  message: string;
  keyVaultUrl: string;
  details: string;
  instructions: string[];
}

const generateKeySchema = z.object({
  keyName: z.string().min(3, "Key name must be at least 3 characters").max(64, "Key name must not exceed 64 characters"),
  confirmGenerate: z.boolean().refine(val => val === true, {
    message: "You must confirm to generate a new key",
  }),
});

const importOwnKeySchema = z.object({
  keyName: z.string().min(3, "Key name must be at least 3 characters").max(64, "Key name must not exceed 64 characters"),
  privateKeyArmored: z.string()
    .min(1, "Private key is required")
    .refine(val => val.includes("BEGIN PGP PRIVATE KEY BLOCK"), "Invalid PGP private key format"),
  publicKeyArmored: z.string()
    .min(1, "Public key is required")
    .refine(val => val.includes("BEGIN PGP PUBLIC KEY BLOCK"), "Invalid PGP public key format"),
  passphrase: z.string().optional(),
});

const importPartnerKeySchema = z.object({
  keyName: z.string().min(3, "Key name must be at least 3 characters").max(64, "Key name must not exceed 64 characters"),
  publicKeyArmored: z.string()
    .min(1, "Public key is required")
    .refine(val => val.includes("BEGIN PGP PUBLIC KEY BLOCK"), "Invalid PGP public key format"),
});

type GenerateKeyForm = z.infer<typeof generateKeySchema>;
type ImportOwnKeyForm = z.infer<typeof importOwnKeySchema>;
type ImportPartnerKeyForm = z.infer<typeof importPartnerKeySchema>;

export default function PgpKeyManagement() {
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [isImportOwnModalOpen, setIsImportOwnModalOpen] = useState(false);
  const [isImportPartnerModalOpen, setIsImportPartnerModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<PgpKey | null>(null);
  const [isViewKeyModalOpen, setIsViewKeyModalOpen] = useState(false);
  const [keyVaultError, setKeyVaultError] = useState<KeyVaultError | null>(null);
  const [isKeyVaultErrorDialogOpen, setIsKeyVaultErrorDialogOpen] = useState(false);
  
  const privateKeyFileRef = useRef<HTMLInputElement>(null);
  const ownPublicKeyFileRef = useRef<HTMLInputElement>(null);
  const publicKeyFileRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const { selectedOrganizationId } = useRole();
  const { data: rolePermissions, isLoading: permissionsLoading } = useRolePermissions();
  
  const canView = rolePermissions?.pgpKeyMgmt?.view ?? false;
  const canGenerate = rolePermissions?.pgpKeyMgmt?.generate ?? false;
  const canDelete = rolePermissions?.pgpKeyMgmt?.delete ?? false;
  const canCopy = rolePermissions?.pgpKeyMgmt?.copy ?? false;

  // Fetch all PGP keys for selected org
  const { data: pgpKeysData, isLoading: keysLoading, refetch: refetchKeys } = useQuery<PgpKeysResponse>({
    queryKey: ["/api/orgs", selectedOrganizationId, "pgp-keys"],
    queryFn: async () => {
      if (!selectedOrganizationId) return { keys: [], count: 0 };
      try {
        const response = await apiRequest("GET", `/api/orgs/${selectedOrganizationId}/pgp-keys`);
        return response.json();
      } catch {
        return { keys: [], count: 0 };
      }
    },
    enabled: !!selectedOrganizationId,
  });

  const pgpKeys = pgpKeysData?.keys || [];
  const selfKeys = pgpKeys.filter(k => k.belongsTo === 'SELF');
  const partnerKeys = pgpKeys.filter(k => k.belongsTo === 'PARTNER');

  // Generate key mutation
  const generateKeyMutation = useMutation({
    mutationFn: async (data: { keyName: string }) => {
      try {
        const response = await apiRequest("POST", `/api/orgs/${selectedOrganizationId}/pgp-key/generate`, {
          keyName: data.keyName,
        });
        return response.json();
      } catch (error: any) {
        if (error.data?.keyVaultError) {
          const err: any = new Error(error.data.error || "Failed to generate PGP key");
          err.keyVaultError = error.data.keyVaultError;
          throw err;
        }
        throw error;
      }
    },
    onSuccess: async () => {
      setIsGenerateModalOpen(false);
      generateForm.reset();
      await refetchKeys();
      toast({
        title: "Success",
        description: "PGP key generated successfully",
      });
    },
    onError: (error: any) => {
      setIsGenerateModalOpen(false);
      if (error.keyVaultError) {
        setKeyVaultError(error.keyVaultError);
        setIsKeyVaultErrorDialogOpen(true);
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to generate PGP key",
          variant: "destructive",
        });
      }
    },
  });

  // Import OWN key mutation
  const importOwnKeyMutation = useMutation({
    mutationFn: async (data: ImportOwnKeyForm) => {
      try {
        const response = await apiRequest("POST", `/api/orgs/${selectedOrganizationId}/pgp-key/import`, {
          keyName: data.keyName,
          privateKeyArmored: data.privateKeyArmored,
          publicKeyArmored: data.publicKeyArmored,
          passphrase: data.passphrase || undefined,
        });
        return response.json();
      } catch (error: any) {
        if (error.data?.keyVaultError) {
          const err: any = new Error(error.data.error || "Failed to import PGP key");
          err.keyVaultError = error.data.keyVaultError;
          throw err;
        }
        throw error;
      }
    },
    onSuccess: async () => {
      setIsImportOwnModalOpen(false);
      importOwnForm.reset();
      await refetchKeys();
      toast({
        title: "Success",
        description: "Own PGP key imported successfully",
      });
    },
    onError: (error: any) => {
      setIsImportOwnModalOpen(false);
      if (error.keyVaultError) {
        setKeyVaultError(error.keyVaultError);
        setIsKeyVaultErrorDialogOpen(true);
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to import PGP key",
          variant: "destructive",
        });
      }
    },
  });

  // Import PARTNER key mutation
  const importPartnerKeyMutation = useMutation({
    mutationFn: async (data: ImportPartnerKeyForm) => {
      const response = await apiRequest("POST", `/api/orgs/${selectedOrganizationId}/pgp-key/import-partner`, {
        keyName: data.keyName,
        publicKeyArmored: data.publicKeyArmored,
      });
      return response.json();
    },
    onSuccess: async () => {
      setIsImportPartnerModalOpen(false);
      importPartnerForm.reset();
      await refetchKeys();
      toast({
        title: "Success",
        description: "Partner PGP key imported successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to import partner PGP key",
        variant: "destructive",
      });
    },
  });

  // Delete key mutation
  const deleteKeyMutation = useMutation({
    mutationFn: async (keyId: number) => {
      const response = await apiRequest("DELETE", `/api/orgs/${selectedOrganizationId}/pgp-key/${keyId}`, {});
      return response.json();
    },
    onSuccess: async () => {
      await refetchKeys();
      toast({
        title: "Success",
        description: "PGP key deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete PGP key",
        variant: "destructive",
      });
    },
  });

  const generateForm = useForm<GenerateKeyForm>({
    resolver: zodResolver(generateKeySchema),
    defaultValues: {
      keyName: "",
      confirmGenerate: false,
    },
  });

  const importOwnForm = useForm<ImportOwnKeyForm>({
    resolver: zodResolver(importOwnKeySchema),
    defaultValues: {
      keyName: "",
      privateKeyArmored: "",
      publicKeyArmored: "",
      passphrase: "",
    },
  });

  const importPartnerForm = useForm<ImportPartnerKeyForm>({
    resolver: zodResolver(importPartnerKeySchema),
    defaultValues: {
      keyName: "",
      publicKeyArmored: "",
    },
  });

  const handleDownloadPublicKey = (key: PgpKey) => {
    const element = document.createElement("a");
    const file = new Blob([key.publicKeyArmored], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `${key.keyName.replace(/\s+/g, '-')}-${key.keyId}.asc`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    toast({
      title: "Downloaded",
      description: "Public key downloaded successfully",
    });
  };

  const handleCopyPublicKey = (key: PgpKey) => {
    navigator.clipboard.writeText(key.publicKeyArmored).then(() => {
      toast({
        title: "Copied",
        description: "Public key copied to clipboard",
      });
    }).catch(() => {
      toast({
        title: "Error",
        description: "Failed to copy public key",
        variant: "destructive",
      });
    });
  };

  const onGenerateSubmit = async (data: GenerateKeyForm) => {
    setIsLoading(true);
    try {
      await generateKeyMutation.mutateAsync({ keyName: data.keyName });
    } finally {
      setIsLoading(false);
    }
  };

  const onImportOwnSubmit = async (data: ImportOwnKeyForm) => {
    setIsLoading(true);
    try {
      await importOwnKeyMutation.mutateAsync(data);
    } finally {
      setIsLoading(false);
    }
  };

  const onImportPartnerSubmit = async (data: ImportPartnerKeyForm) => {
    setIsLoading(true);
    try {
      await importPartnerKeyMutation.mutateAsync(data);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrivateKeyFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (file.size > 102400) {
      toast({
        title: "File too large",
        description: "PGP key file must be smaller than 100KB",
        variant: "destructive",
      });
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        importOwnForm.setValue("privateKeyArmored", content, { shouldValidate: true });
        toast({
          title: "File loaded",
          description: `Private key loaded from ${file.name}`,
        });
      }
    };
    reader.onerror = () => {
      toast({
        title: "Error",
        description: "Failed to read file",
        variant: "destructive",
      });
    };
    reader.readAsText(file);
    
    if (privateKeyFileRef.current) {
      privateKeyFileRef.current.value = "";
    }
  };

  const handleOwnPublicKeyFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (file.size > 102400) {
      toast({
        title: "File too large",
        description: "PGP key file must be smaller than 100KB",
        variant: "destructive",
      });
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        importOwnForm.setValue("publicKeyArmored", content, { shouldValidate: true });
        toast({
          title: "File loaded",
          description: `Public key loaded from ${file.name}`,
        });
      }
    };
    reader.onerror = () => {
      toast({
        title: "Error",
        description: "Failed to read file",
        variant: "destructive",
      });
    };
    reader.readAsText(file);
    
    if (ownPublicKeyFileRef.current) {
      ownPublicKeyFileRef.current.value = "";
    }
  };

  const handlePublicKeyFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (file.size > 102400) {
      toast({
        title: "File too large",
        description: "PGP key file must be smaller than 100KB",
        variant: "destructive",
      });
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        importPartnerForm.setValue("publicKeyArmored", content, { shouldValidate: true });
        toast({
          title: "File loaded",
          description: `Public key loaded from ${file.name}`,
        });
      }
    };
    reader.onerror = () => {
      toast({
        title: "Error",
        description: "Failed to read file",
        variant: "destructive",
      });
    };
    reader.readAsText(file);
    
    if (publicKeyFileRef.current) {
      publicKeyFileRef.current.value = "";
    }
  };

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <ShieldX className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">
          You don't have permission to view PGP Key Management. Please contact your administrator.
        </p>
      </div>
    );
  }

  const renderKeyTable = (keys: PgpKey[], keyType: 'SELF' | 'PARTNER') => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Key Name</TableHead>
          <TableHead>Key ID</TableHead>
          <TableHead>Ownership</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
              No {keyType === 'SELF' ? 'own' : 'partner'} keys configured yet
            </TableCell>
          </TableRow>
        ) : (
          keys.map((key) => (
            <TableRow key={key.id} data-testid={`row-key-${key.id}`}>
              <TableCell className="font-medium">{key.keyName}</TableCell>
              <TableCell className="font-mono text-sm">{key.keyId}</TableCell>
              <TableCell>
                <Badge 
                  variant={key.belongsTo === 'SELF' ? 'default' : 'secondary'}
                  className="gap-1"
                >
                  {key.belongsTo === 'SELF' ? (
                    <>
                      <Building2 className="w-3 h-3" />
                      SELF
                    </>
                  ) : (
                    <>
                      <Users className="w-3 h-3" />
                      PARTNER
                    </>
                  )}
                </Badge>
                {key.hasPrivateKey && (
                  <Badge variant="outline" className="ml-2 gap-1">
                    <KeyRound className="w-3 h-3" />
                    Private Key in Vault
                  </Badge>
                )}
              </TableCell>
              <TableCell>{key.source}</TableCell>
              <TableCell>{new Date(key.createdAt).toLocaleDateString()}</TableCell>
              <TableCell className="text-right">
                <div className="flex gap-1 justify-end flex-wrap">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSelectedKey(key);
                      setIsViewKeyModalOpen(true);
                    }}
                    data-testid={`button-view-key-${key.id}`}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  {canCopy && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopyPublicKey(key)}
                      data-testid={`button-copy-key-${key.id}`}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDownloadPublicKey(key)}
                    data-testid={`button-download-key-${key.id}`}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  {canDelete && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to delete "${key.keyName}"? This action cannot be undone.`)) {
                          deleteKeyMutation.mutate(key.id);
                        }
                      }}
                      data-testid={`button-delete-key-${key.id}`}
                      disabled={deleteKeyMutation.isPending}
                    >
                      <Trash className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <KeyRound className="w-6 h-6" />
            PGP Key Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage encryption keys for secure file transfers
          </p>
        </div>
        {canGenerate && (
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => setIsGenerateModalOpen(true)} data-testid="button-generate-key">
              <Plus className="w-4 h-4 mr-2" />
              Generate Own Key
            </Button>
            <Button variant="outline" onClick={() => setIsImportOwnModalOpen(true)} data-testid="button-import-own-key">
              <Upload className="w-4 h-4 mr-2" />
              Import Own Key
            </Button>
            <Button variant="outline" onClick={() => setIsImportPartnerModalOpen(true)} data-testid="button-import-partner-key">
              <Users className="w-4 h-4 mr-2" />
              Import Partner Key
            </Button>
          </div>
        )}
      </div>

      {/* Key Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <KeyRound className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pgpKeys.length}</p>
                <p className="text-sm text-muted-foreground">Total Keys</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-500/10">
                <Building2 className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{selfKeys.length}</p>
                <p className="text-sm text-muted-foreground">Own Keys (SELF)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-orange-500/10">
                <Users className="w-6 h-6 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{partnerKeys.length}</p>
                <p className="text-sm text-muted-foreground">Partner Keys</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Keys Table with Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>PGP Keys</CardTitle>
          <CardDescription>
            Own keys are used to encrypt files for yourself and decrypt incoming files. Partner keys are used to encrypt files for external partners.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {keysLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : (
            <Tabs defaultValue="self" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="self" className="gap-2">
                  <Building2 className="w-4 h-4" />
                  Own Keys ({selfKeys.length})
                </TabsTrigger>
                <TabsTrigger value="partner" className="gap-2">
                  <Users className="w-4 h-4" />
                  Partner Keys ({partnerKeys.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="self">
                {renderKeyTable(selfKeys, 'SELF')}
              </TabsContent>
              <TabsContent value="partner">
                {renderKeyTable(partnerKeys, 'PARTNER')}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* View Key Modal */}
      <Dialog open={isViewKeyModalOpen} onOpenChange={setIsViewKeyModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Public Key: {selectedKey?.keyName}</DialogTitle>
            <DialogDescription>
              Key ID: {selectedKey?.keyId} | Type: {selectedKey?.belongsTo}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-md max-h-96 overflow-y-auto border border-border">
              <pre className="text-xs font-mono whitespace-pre-wrap break-words text-muted-foreground">
                {selectedKey?.publicKeyArmored}
              </pre>
            </div>
            <div className="flex gap-2 justify-end">
              {canCopy && selectedKey && (
                <Button
                  variant="outline"
                  onClick={() => handleCopyPublicKey(selectedKey)}
                  data-testid="button-modal-copy-key"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Key
                </Button>
              )}
              {selectedKey && (
                <Button
                  variant="outline"
                  onClick={() => handleDownloadPublicKey(selectedKey)}
                  data-testid="button-modal-download-key"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Generate Key Dialog */}
      <Dialog 
        open={isGenerateModalOpen} 
        onOpenChange={(open) => {
          if (!generateKeyMutation.isPending) {
            setIsGenerateModalOpen(open);
            if (!open) generateForm.reset();
          }
        }}
      >
        <DialogContent
          showClose={!generateKeyMutation.isPending}
          onPointerDownOutside={(e) => {
            e.preventDefault();
            toast({
              title: "Dialog Protection",
              description: generateKeyMutation.isPending
                ? "Please wait for the key generation to complete. You cannot close this window during generation."
                : "Please use the X button or Cancel to close this dialog to avoid losing your work.",
              variant: "default",
            });
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            toast({
              title: "Dialog Protection",
              description: generateKeyMutation.isPending
                ? "Please wait for the key generation to complete. You cannot close this window during generation."
                : "Please use the X button or Cancel to close this dialog to avoid losing your work.",
              variant: "default",
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Generate New Own Key</DialogTitle>
            <DialogDescription>
              Generate a new PGP key pair. The private key will be securely stored in Azure Key Vault.
            </DialogDescription>
          </DialogHeader>
          <Form {...generateForm}>
            <form onSubmit={generateForm.handleSubmit(onGenerateSubmit)} className="space-y-4">
              <FormField
                control={generateForm.control}
                name="keyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Key Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Production Key, Backup Key"
                        {...field}
                        maxLength={64}
                        data-testid="input-generate-key-name"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {field.value?.length || 0}/64 characters (minimum 3)
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  A new PGP key pair will be generated. The private key will be stored securely in Azure Key Vault and will never be exposed.
                </AlertDescription>
              </Alert>

              <FormField
                control={generateForm.control}
                name="confirmGenerate"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={field.onChange}
                        data-testid="checkbox-confirm-generate"
                        className="rounded border-gray-300"
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormLabel className="cursor-pointer">
                      I confirm to generate a new PGP key for this organization
                    </FormLabel>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-3 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsGenerateModalOpen(false)}
                  data-testid="button-cancel-generate"
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading || !generateForm.formState.isValid}
                  data-testid="button-confirm-generate"
                >
                  {isLoading ? "Generating..." : "Generate Key"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Import Own Key Dialog */}
      <Dialog 
        open={isImportOwnModalOpen} 
        onOpenChange={(open) => {
          if (!importOwnKeyMutation.isPending) {
            setIsImportOwnModalOpen(open);
            if (!open) importOwnForm.reset();
          }
        }}
      >
        <DialogContent 
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          showClose={!importOwnKeyMutation.isPending}
          onPointerDownOutside={(e) => {
            e.preventDefault();
            toast({
              title: "Dialog Protection",
              description: importOwnKeyMutation.isPending
                ? "Please wait for the key import to complete. You cannot close this window during import."
                : "Please use the X button or Cancel to close this dialog to avoid losing your work.",
              variant: "default",
            });
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            toast({
              title: "Dialog Protection",
              description: importOwnKeyMutation.isPending
                ? "Please wait for the key import to complete. You cannot close this window during import."
                : "Please use the X button or Cancel to close this dialog to avoid losing your work.",
              variant: "default",
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Import Own PGP Key Pair</DialogTitle>
            <DialogDescription>
              Import your existing PGP key pair (both private and public keys). The private key will be securely stored based on your environment configuration.
            </DialogDescription>
          </DialogHeader>
          <Form {...importOwnForm}>
            <form onSubmit={importOwnForm.handleSubmit(onImportOwnSubmit)} className="space-y-4">
              <FormField
                control={importOwnForm.control}
                name="keyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Key Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Legacy Key, Migration Key"
                        {...field}
                        maxLength={64}
                        data-testid="input-import-own-key-name"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {field.value?.length || 0}/64 characters (minimum 3)
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={importOwnForm.control}
                name="privateKeyArmored"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between gap-2">
                      <FormLabel>Private Key (Armored)</FormLabel>
                      <div>
                        <input
                          type="file"
                          ref={privateKeyFileRef}
                          onChange={handlePrivateKeyFileChange}
                          accept=".asc,.pgp,.gpg,.txt,.key"
                          className="hidden"
                          data-testid="input-private-key-file"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => privateKeyFileRef.current?.click()}
                          data-testid="button-upload-private-key-file"
                          disabled={isLoading}
                        >
                          <FileUp className="w-4 h-4 mr-2" />
                          Upload File
                        </Button>
                      </div>
                    </div>
                    <FormControl>
                      <Textarea
                        placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----&#10;...&#10;-----END PGP PRIVATE KEY BLOCK-----"
                        {...field}
                        rows={6}
                        data-testid="textarea-import-private-key"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={importOwnForm.control}
                name="publicKeyArmored"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between gap-2">
                      <FormLabel>Public Key (Armored)</FormLabel>
                      <div>
                        <input
                          type="file"
                          ref={ownPublicKeyFileRef}
                          onChange={handleOwnPublicKeyFileChange}
                          accept=".asc,.pgp,.gpg,.txt,.key,.pub"
                          className="hidden"
                          data-testid="input-own-public-key-file"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => ownPublicKeyFileRef.current?.click()}
                          data-testid="button-upload-own-public-key-file"
                          disabled={isLoading}
                        >
                          <FileUp className="w-4 h-4 mr-2" />
                          Upload File
                        </Button>
                      </div>
                    </div>
                    <FormControl>
                      <Textarea
                        placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----&#10;...&#10;-----END PGP PUBLIC KEY BLOCK-----"
                        {...field}
                        rows={6}
                        data-testid="textarea-import-own-public-key"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      The public key must match the private key above
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={importOwnForm.control}
                name="passphrase"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Passphrase (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Enter passphrase if private key is encrypted"
                        {...field}
                        data-testid="input-import-passphrase"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-3 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsImportOwnModalOpen(false)}
                  data-testid="button-cancel-import-own"
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading || !importOwnForm.formState.isValid}
                  data-testid="button-confirm-import-own"
                >
                  {isLoading ? "Importing..." : "Import Key Pair"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Import Partner Key Dialog */}
      <Dialog 
        open={isImportPartnerModalOpen} 
        onOpenChange={(open) => {
          if (!importPartnerKeyMutation.isPending) {
            setIsImportPartnerModalOpen(open);
            if (!open) importPartnerForm.reset();
          }
        }}
      >
        <DialogContent
          showClose={!importPartnerKeyMutation.isPending}
          onPointerDownOutside={(e) => {
            e.preventDefault();
            toast({
              title: "Dialog Protection",
              description: importPartnerKeyMutation.isPending
                ? "Please wait for the key import to complete. You cannot close this window during import."
                : "Please use the X button or Cancel to close this dialog to avoid losing your work.",
              variant: "default",
            });
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            toast({
              title: "Dialog Protection",
              description: importPartnerKeyMutation.isPending
                ? "Please wait for the key import to complete. You cannot close this window during import."
                : "Please use the X button or Cancel to close this dialog to avoid losing your work.",
              variant: "default",
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Import Partner Public Key</DialogTitle>
            <DialogDescription>
              Import a partner's public key to encrypt files for them. Only the public key is stored.
            </DialogDescription>
          </DialogHeader>
          <Form {...importPartnerForm}>
            <form onSubmit={importPartnerForm.handleSubmit(onImportPartnerSubmit)} className="space-y-4">
              <FormField
                control={importPartnerForm.control}
                name="keyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Partner Name / Key Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Acme Corp, Partner XYZ"
                        {...field}
                        maxLength={64}
                        data-testid="input-import-partner-key-name"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {field.value?.length || 0}/64 characters (minimum 3)
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={importPartnerForm.control}
                name="publicKeyArmored"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between gap-2">
                      <FormLabel>Public Key (Armored)</FormLabel>
                      <div>
                        <input
                          type="file"
                          ref={publicKeyFileRef}
                          onChange={handlePublicKeyFileChange}
                          accept=".asc,.pgp,.gpg,.txt,.key,.pub"
                          className="hidden"
                          data-testid="input-public-key-file"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => publicKeyFileRef.current?.click()}
                          data-testid="button-upload-public-key-file"
                          disabled={isLoading}
                        >
                          <FileUp className="w-4 h-4 mr-2" />
                          Upload File
                        </Button>
                      </div>
                    </div>
                    <FormControl>
                      <Textarea
                        placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----&#10;...&#10;-----END PGP PUBLIC KEY BLOCK-----"
                        {...field}
                        rows={8}
                        data-testid="textarea-import-partner-public-key"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Partner keys only store the public key. You can use this key to encrypt files that only the partner can decrypt.
                </AlertDescription>
              </Alert>

              <div className="flex gap-3 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsImportPartnerModalOpen(false)}
                  data-testid="button-cancel-import-partner"
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading || !importPartnerForm.formState.isValid}
                  data-testid="button-confirm-import-partner"
                >
                  {isLoading ? "Importing..." : "Import Partner Key"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Key Vault Error Dialog */}
      <Dialog open={isKeyVaultErrorDialogOpen} onOpenChange={setIsKeyVaultErrorDialogOpen}>
        <DialogContent className="sm:max-w-[600px]" data-testid="dialog-keyvault-error">
          <DialogHeader>
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-1" />
              <div>
                <DialogTitle className="text-red-900 dark:text-red-100">
                  Azure Key Vault Error
                </DialogTitle>
                <DialogDescription className="text-red-700 dark:text-red-300 mt-2">
                  {keyVaultError?.message || "Failed to store private key in Azure Key Vault"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {keyVaultError && (
              <>
                <div className="bg-red-50 dark:bg-red-950/50 p-4 rounded-md border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-800 dark:text-red-200 font-medium mb-2">
                    Error Code: {keyVaultError.code}
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {keyVaultError.details}
                  </p>
                </div>

                {keyVaultError.keyVaultUrl && keyVaultError.keyVaultUrl !== "Not Set" && (
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-medium">Key Vault:</span>{" "}
                    <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                      {keyVaultError.keyVaultUrl}
                    </span>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    To resolve this issue:
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300">
                    {keyVaultError.instructions.map((instruction, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {instruction.includes("https://") ? (
                          <>
                            {instruction.split("https://")[0]}
                            <a
                              href={`https://${instruction.split("https://")[1]}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              https://{instruction.split("https://")[1]}
                            </a>
                          </>
                        ) : (
                          instruction
                        )}
                      </li>
                    ))}
                  </ol>
                </div>

                <Alert className="bg-yellow-50 dark:bg-yellow-950/50 border-yellow-200 dark:border-yellow-800">
                  <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                  <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                    <strong>Important:</strong> No data has been stored. The operation was cancelled atomically 
                    to prevent partial state - both the private key and public key were not saved.
                  </AlertDescription>
                </Alert>
              </>
            )}
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setIsKeyVaultErrorDialogOpen(false);
                setKeyVaultError(null);
              }}
              data-testid="button-close-keyvault-error"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
