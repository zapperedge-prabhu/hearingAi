import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  Upload, FileText, CheckCircle2, XCircle, AlertTriangle, 
  Download, ArrowRight, ArrowLeft, RefreshCw, Users, Building2,
  HardDrive, Key, Loader2, Info, FileSpreadsheet, RotateCcw, Shield
} from "lucide-react";

interface ValidationError {
  row: number;
  column: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

interface AggregatedCounts {
  uniqueOrganizations: number;
  uniqueUsers: number;
  uniqueStorageMappings: number;
  totalRoleAssignments: number;
  totalSftpUsers: number;
}

interface UploadResult {
  jobId: number;
  status: string;
  totalRows: number;
  preview: any[];
  columnMapping: {
    detected: string[];
    required: string[];
    optional: string[];
    missing: string[];
    unknown: string[];
    isValid: boolean;
  };
  validationResult: {
    isValid: boolean;
    totalRows: number;
    validRows: number;
    errorRows: number;
    warningRows: number;
    errors: ValidationError[];
    warnings: ValidationError[];
  };
  aggregatedCounts: AggregatedCounts;
}

interface CommitResult {
  jobId: number;
  status: string;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  summary: {
    organizationsCreated: number;
    usersCreated: number;
    rolesAssigned: number;
    storageAccountsMapped: number;
    sftpUsersCreated: number;
  };
  skipped?: {
    organizations: Array<{ row: number; name: string; reason: string }>;
    users: Array<{ row: number; name: string; reason: string }>;
    roles: Array<{ row: number; name: string; reason: string }>;
    storage: Array<{ row: number; name: string; reason: string }>;
    sftp: Array<{ row: number; name: string; reason: string }>;
  };
  errors: Array<{ row: number; code: string; message: string }>;
}

type WizardStep = 'upload' | 'preview' | 'validation' | 'confirm' | 'result';

const STEPS: { id: WizardStep; label: string; icon: any }[] = [
  { id: 'upload', label: 'Upload CSV', icon: Upload },
  { id: 'preview', label: 'Preview Data', icon: FileSpreadsheet },
  { id: 'validation', label: 'Validation', icon: CheckCircle2 },
  { id: 'confirm', label: 'Confirm', icon: Info },
  { id: 'result', label: 'Result', icon: CheckCircle2 },
];

interface ProgressData {
  jobId: number;
  status: string;
  totalRows: number;
  processedRows: number;
  successCount: number;
  errorCount: number;
  isComplete: boolean;
}

export default function CustomerOnboarding() {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<WizardStep>('upload');
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState<ProgressData | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const headers: HeadersInit = {};
      const token = getAuthToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch('/api/onboarding/upload', {
        method: 'POST',
        body: formData,
        headers,
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }
      return response.json();
    },
    onSuccess: (data: UploadResult) => {
      setUploadResult(data);
      setCurrentStep('preview');
      toast({
        title: "File uploaded successfully",
        description: `${data.totalRows} rows detected`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Poll for progress
  const startPolling = useCallback((jobId: number) => {
    setIsPolling(true);
    setImportProgress({
      jobId,
      status: 'processing',
      totalRows: uploadResult?.totalRows || 0,
      processedRows: 0,
      successCount: 0,
      errorCount: 0,
      isComplete: false,
    });

    const poll = async () => {
      try {
        const response = await apiRequest('GET', `/api/onboarding/jobs/${jobId}/progress`);
        const progress: ProgressData = await response.json();
        setImportProgress(progress);

        if (progress.isComplete) {
          stopPolling();
        }
      } catch (error) {
        console.error('Progress polling error:', error);
      }
    };

    // Poll immediately and then every 500ms
    poll();
    pollingIntervalRef.current = setInterval(poll, 500);
  }, [uploadResult?.totalRows]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  // Commit mutation
  const commitMutation = useMutation({
    mutationFn: async (jobId: number) => {
      // Start polling before the commit
      startPolling(jobId);
      const response = await apiRequest('POST', `/api/onboarding/jobs/${jobId}/commit`);
      return response.json();
    },
    onSuccess: (data: CommitResult) => {
      stopPolling();
      setImportProgress(null);
      setCommitResult(data);
      setCurrentStep('result');
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/storage'] });
    },
    onError: (error: Error) => {
      stopPolling();
      setImportProgress(null);
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Retry mutation
  const retryMutation = useMutation({
    mutationFn: async (jobId: number) => {
      const response = await apiRequest('POST', `/api/onboarding/jobs/${jobId}/retry`);
      return response.json();
    },
    onSuccess: (data: CommitResult) => {
      setCommitResult(data);
      toast({
        title: "Retry completed",
        description: `${data.successCount} rows processed successfully`,
      });
    },
  });

  // File dropzone
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await apiRequest('GET', '/api/onboarding/template');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'onboarding-template.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Could not download template",
        variant: "destructive",
      });
    }
  };

  const handleStartOver = () => {
    setCurrentStep('upload');
    setUploadResult(null);
    setCommitResult(null);
    setSelectedFile(null);
  };

  const getStepIndex = (step: WizardStep) => STEPS.findIndex(s => s.id === step);
  const currentStepIndex = getStepIndex(currentStep);

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Customer Onboarding</h1>
        <p className="text-muted-foreground">
          Bulk import customers, users, and storage configurations from a CSV file
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => {
            const StepIcon = step.icon;
            const isActive = index === currentStepIndex;
            const isCompleted = index < currentStepIndex;
            const isDisabled = index > currentStepIndex;

            return (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors ${
                      isActive
                        ? 'border-primary bg-primary text-primary-foreground'
                        : isCompleted
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-muted bg-muted text-muted-foreground'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-6 h-6" />
                    ) : (
                      <StepIcon className="w-6 h-6" />
                    )}
                  </div>
                  <span
                    className={`mt-2 text-sm font-medium ${
                      isActive ? 'text-primary' : isCompleted ? 'text-green-500' : 'text-muted-foreground'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-1 mx-4 rounded ${
                      index < currentStepIndex ? 'bg-green-500' : 'bg-muted'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          {/* Upload Step */}
          {currentStep === 'upload' && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold mb-2">Upload Your CSV File</h2>
                <p className="text-muted-foreground">
                  Upload a CSV file containing customer, user, and storage configuration data
                </p>
              </div>

              <div
                {...getRootProps()}
                data-testid="dropzone-upload"
                className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-primary bg-primary/5'
                    : selectedFile
                    ? 'border-green-500 bg-green-50 dark:bg-green-950'
                    : 'border-muted hover:border-primary/50'
                }`}
              >
                <input {...getInputProps()} data-testid="input-file" />
                {selectedFile ? (
                  <div className="space-y-2">
                    <FileText className="w-16 h-16 mx-auto text-green-500" />
                    <p className="text-lg font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                    <p className="text-sm text-green-600">Ready to upload</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-16 h-16 mx-auto text-muted-foreground" />
                    <p className="text-lg font-medium">
                      {isDragActive ? 'Drop your file here' : 'Drag and drop your CSV file'}
                    </p>
                    <p className="text-sm text-muted-foreground">or click to browse</p>
                    <p className="text-xs text-muted-foreground">Maximum file size: 10MB</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={handleDownloadTemplate} data-testid="button-download-template">
                  <Download className="w-4 h-4 mr-2" />
                  Download Template
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={!selectedFile || uploadMutation.isPending}
                  data-testid="button-upload"
                >
                  {uploadMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading and Validating...
                    </>
                  ) : (
                    <>
                      Upload and Validate
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
                
                {uploadMutation.isPending && (
                  <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                      <div>
                        <p className="font-medium text-blue-900 dark:text-blue-100">
                          Processing your CSV file...
                        </p>
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          Validating all entries. This may take a moment for large files.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* CSV Format Guide */}
              <Card className="bg-muted/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Required CSV Columns</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <Badge variant="outline">OrgName</Badge>
                    <Badge variant="outline">StorageAccount</Badge>
                    <Badge variant="outline">Container</Badge>
                    <Badge variant="outline">LoginName</Badge>
                    <Badge variant="outline">Email</Badge>
                    <Badge variant="outline">Role</Badge>
                    <Badge variant="outline">SFTPUser</Badge>
                    <Badge variant="secondary">ResourceGroup (optional)</Badge>
                    <Badge variant="secondary">Location (optional)</Badge>
                    <Badge variant="secondary">AuthPasswordFlag (optional)</Badge>
                    <Badge variant="secondary">AuthSSHKeyFlag (optional)</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Preview Step */}
          {currentStep === 'preview' && uploadResult && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold mb-2">Preview Your Data</h2>
                <p className="text-muted-foreground">
                  Review the data before proceeding to validation
                </p>
              </div>

              {/* Column Mapping */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-green-600 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Detected Columns
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1">
                      {uploadResult.columnMapping.detected.map(col => (
                        <Badge key={col} variant="outline" className="text-xs">{col}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {uploadResult.columnMapping.missing.length > 0 && (
                  <Card className="border-destructive">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-destructive flex items-center gap-2">
                        <XCircle className="w-4 h-4" />
                        Missing Required
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1">
                        {uploadResult.columnMapping.missing.map(col => (
                          <Badge key={col} variant="destructive" className="text-xs">{col}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {uploadResult.columnMapping.unknown.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-yellow-600 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        Unknown Columns
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1">
                        {uploadResult.columnMapping.unknown.map(col => (
                          <Badge key={col} variant="secondary" className="text-xs">{col}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Data Preview Table */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Data Preview ({uploadResult.preview.length === uploadResult.totalRows 
                      ? `all ${uploadResult.totalRows} rows` 
                      : `first ${uploadResult.preview.length} of ${uploadResult.totalRows} rows`})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-md overflow-x-auto">
                    <div className="h-[400px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12 whitespace-nowrap sticky left-0 top-0 z-20 bg-muted">#</TableHead>
                            {uploadResult.columnMapping.detected.map((col) => (
                              <TableHead key={col} className="whitespace-nowrap min-w-[120px] sticky top-0 z-10 bg-muted">{col}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {uploadResult.preview.map((row, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-mono text-xs whitespace-nowrap sticky left-0 bg-background z-10">{idx + 1}</TableCell>
                              {uploadResult.columnMapping.detected.map((col) => (
                                <TableCell key={col} className="whitespace-nowrap text-sm">
                                  {col === 'Role' ? (
                                    <Badge variant="outline">{row[col] || '-'}</Badge>
                                  ) : (
                                    <span className={col.includes('Flag') || col.startsWith('Sftp') ? 'font-mono text-xs' : ''}>
                                      {row[col] !== undefined && row[col] !== '' ? String(row[col]) : '-'}
                                    </span>
                                  )}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={handleStartOver} data-testid="button-back-upload">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Start Over
                </Button>
                <Button onClick={() => setCurrentStep('validation')} data-testid="button-continue-validation">
                  Continue to Validation
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Validation Step */}
          {currentStep === 'validation' && uploadResult && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold mb-2">Validation Results</h2>
                <p className="text-muted-foreground">
                  Review any issues found in your data
                </p>
              </div>

              {/* Validation Summary */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold">{uploadResult.totalRows}</div>
                      <div className="text-sm text-muted-foreground">Total Rows</div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-green-500">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-600">
                        {uploadResult.validationResult.validRows}
                      </div>
                      <div className="text-sm text-muted-foreground">Valid Rows</div>
                    </div>
                  </CardContent>
                </Card>
                <Card className={uploadResult.validationResult.errorRows > 0 ? "border-destructive" : ""}>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className={`text-3xl font-bold ${uploadResult.validationResult.errorRows > 0 ? 'text-destructive' : ''}`}>
                        {uploadResult.validationResult.errorRows}
                      </div>
                      <div className="text-sm text-muted-foreground">Errors</div>
                    </div>
                  </CardContent>
                </Card>
                <Card className={uploadResult.validationResult.warningRows > 0 ? "border-yellow-500" : ""}>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className={`text-3xl font-bold ${uploadResult.validationResult.warningRows > 0 ? 'text-yellow-600' : ''}`}>
                        {uploadResult.validationResult.warningRows}
                      </div>
                      <div className="text-sm text-muted-foreground">Warnings</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Errors and Warnings */}
              {(uploadResult.validationResult.errors.length > 0 || uploadResult.validationResult.warnings.length > 0) && (
                <Tabs defaultValue="errors" className="w-full">
                  <TabsList>
                    <TabsTrigger value="errors" className="gap-2">
                      <XCircle className="w-4 h-4 text-destructive" />
                      Errors ({uploadResult.validationResult.errors.length})
                    </TabsTrigger>
                    <TabsTrigger value="warnings" className="gap-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-600" />
                      Warnings ({uploadResult.validationResult.warnings.length})
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="errors">
                    <ScrollArea className="h-[250px]">
                      {uploadResult.validationResult.errors.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-500" />
                          <p>No errors found!</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {uploadResult.validationResult.errors.map((error, idx) => (
                            <Alert key={idx} variant="destructive">
                              <XCircle className="h-4 w-4" />
                              <AlertTitle className="text-sm">
                                Row {error.row} - {error.column}
                              </AlertTitle>
                              <AlertDescription className="text-xs">
                                {error.message}
                              </AlertDescription>
                            </Alert>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>
                  <TabsContent value="warnings">
                    <ScrollArea className="h-[250px]">
                      {uploadResult.validationResult.warnings.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-500" />
                          <p>No warnings!</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {uploadResult.validationResult.warnings.map((warning, idx) => (
                            <Alert key={idx}>
                              <AlertTriangle className="h-4 w-4 text-yellow-600" />
                              <AlertTitle className="text-sm">
                                Row {warning.row} - {warning.column}
                              </AlertTitle>
                              <AlertDescription className="text-xs">
                                {warning.message}
                              </AlertDescription>
                            </Alert>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              )}

              {uploadResult.validationResult.errors.length === 0 && (
                <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertTitle>Validation Passed</AlertTitle>
                  <AlertDescription>
                    All {uploadResult.totalRows} rows are valid and ready for import.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={() => setCurrentStep('preview')} data-testid="button-back-preview">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Preview
                </Button>
                <Button
                  onClick={() => setCurrentStep('confirm')}
                  disabled={!uploadResult.validationResult.isValid}
                  data-testid="button-continue-confirm"
                >
                  {uploadResult.validationResult.isValid ? (
                    <>
                      Proceed to Import
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  ) : (
                    <>
                      Fix Errors to Continue
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Confirm Step */}
          {currentStep === 'confirm' && uploadResult && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold mb-2">Confirm Import</h2>
                <p className="text-muted-foreground">
                  Review what will be created and confirm the import
                </p>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center">
                      <Building2 className="w-8 h-8 mb-2 text-primary" />
                      <div className="text-2xl font-bold">
                        {uploadResult.aggregatedCounts.uniqueOrganizations}
                      </div>
                      <div className="text-xs text-muted-foreground text-center">Organizations</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center">
                      <Users className="w-8 h-8 mb-2 text-primary" />
                      <div className="text-2xl font-bold">
                        {uploadResult.aggregatedCounts.uniqueUsers}
                      </div>
                      <div className="text-xs text-muted-foreground text-center">Users</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center">
                      <Badge className="w-8 h-8 mb-2 p-0 flex items-center justify-center text-primary" variant="outline">R</Badge>
                      <div className="text-2xl font-bold">{uploadResult.aggregatedCounts.totalRoleAssignments}</div>
                      <div className="text-xs text-muted-foreground text-center">Role Assignments</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center">
                      <HardDrive className="w-8 h-8 mb-2 text-primary" />
                      <div className="text-2xl font-bold">
                        {uploadResult.aggregatedCounts.uniqueStorageMappings}
                      </div>
                      <div className="text-xs text-muted-foreground text-center">Storage Mappings</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center">
                      <Key className="w-8 h-8 mb-2 text-primary" />
                      <div className="text-2xl font-bold">{uploadResult.aggregatedCounts.totalSftpUsers}</div>
                      <div className="text-xs text-muted-foreground text-center">SFTP Users</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Important</AlertTitle>
                <AlertDescription>
                  This action will create new organizations, users, and storage configurations. 
                  Existing users will have roles assigned to them in the specified organizations.
                </AlertDescription>
              </Alert>

              {/* Progress indicator during import */}
              {commitMutation.isPending && importProgress && (
                <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                        <div className="flex-1">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-medium text-blue-900 dark:text-blue-100">
                              Importing data...
                            </span>
                            <span className="text-sm text-blue-700 dark:text-blue-300">
                              {importProgress.processedRows} of {importProgress.totalRows} rows
                            </span>
                          </div>
                          <Progress 
                            value={importProgress.totalRows > 0 
                              ? (importProgress.processedRows / importProgress.totalRows) * 100 
                              : 0
                            } 
                            className="h-3"
                          />
                        </div>
                      </div>
                      <div className="flex gap-6 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          <span className="text-green-700 dark:text-green-400">
                            {importProgress.successCount} successful
                          </span>
                        </div>
                        {importProgress.errorCount > 0 && (
                          <div className="flex items-center gap-2">
                            <XCircle className="w-4 h-4 text-red-600" />
                            <span className="text-red-700 dark:text-red-400">
                              {importProgress.errorCount} failed
                            </span>
                          </div>
                        )}
                        <div className="text-gray-600 dark:text-gray-400">
                          {importProgress.totalRows - importProgress.processedRows} remaining
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex items-center justify-between">
                <Button 
                  variant="outline" 
                  onClick={() => setCurrentStep('validation')} 
                  disabled={commitMutation.isPending}
                  data-testid="button-back-validation"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Validation
                </Button>
                <Button
                  onClick={() => commitMutation.mutate(uploadResult.jobId)}
                  disabled={commitMutation.isPending}
                  data-testid="button-confirm-import"
                >
                  {commitMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Confirm and Import
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Result Step */}
          {currentStep === 'result' && commitResult && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                {commitResult.status === 'completed' ? (
                  <>
                    <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-500" />
                    <h2 className="text-xl font-semibold mb-2">Import Completed Successfully!</h2>
                    <p className="text-muted-foreground">
                      All {commitResult.successCount} rows have been processed
                    </p>
                  </>
                ) : commitResult.status === 'partial_success' ? (
                  <>
                    <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-yellow-500" />
                    <h2 className="text-xl font-semibold mb-2">Import Partially Completed</h2>
                    <p className="text-muted-foreground">
                      {commitResult.successCount} rows succeeded, {commitResult.errorCount} failed
                    </p>
                  </>
                ) : (
                  <>
                    <XCircle className="w-16 h-16 mx-auto mb-4 text-destructive" />
                    <h2 className="text-xl font-semibold mb-2">Import Failed</h2>
                    <p className="text-muted-foreground">
                      {commitResult.errorCount} rows failed to process
                    </p>
                  </>
                )}
              </div>

              {/* Results Summary */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card className="border-green-500">
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center">
                      <Building2 className="w-8 h-8 mb-2 text-green-500" />
                      <div className="text-2xl font-bold text-green-600">
                        {commitResult.summary.organizationsCreated}
                      </div>
                      <div className="text-xs text-muted-foreground text-center">Orgs Created</div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-green-500">
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center">
                      <Users className="w-8 h-8 mb-2 text-green-500" />
                      <div className="text-2xl font-bold text-green-600">
                        {commitResult.summary.usersCreated}
                      </div>
                      <div className="text-xs text-muted-foreground text-center">Users Created</div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-green-500">
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center">
                      <Badge className="w-8 h-8 mb-2 p-0 flex items-center justify-center text-green-500" variant="outline">R</Badge>
                      <div className="text-2xl font-bold text-green-600">
                        {commitResult.summary.rolesAssigned}
                      </div>
                      <div className="text-xs text-muted-foreground text-center">Roles Assigned</div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-green-500">
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center">
                      <HardDrive className="w-8 h-8 mb-2 text-green-500" />
                      <div className="text-2xl font-bold text-green-600">
                        {commitResult.summary.storageAccountsMapped}
                      </div>
                      <div className="text-xs text-muted-foreground text-center">Storage Mapped</div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-green-500">
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center">
                      <Key className="w-8 h-8 mb-2 text-green-500" />
                      <div className="text-2xl font-bold text-green-600">
                        {commitResult.summary.sftpUsersCreated}
                      </div>
                      <div className="text-xs text-muted-foreground text-center">SFTP Created</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Skipped Entries */}
              {commitResult.skipped && commitResult.skippedCount > 0 && (
                <Card className="border-yellow-500">
                  <CardHeader>
                    <CardTitle className="text-yellow-600 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      Skipped Entries ({commitResult.skippedCount}) - Already Exist
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      The following entries were not created because they already exist in the system
                    </p>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[300px]">
                      <div className="space-y-4">
                        {commitResult.skipped.organizations.length > 0 && (
                          <div>
                            <h4 className="font-medium mb-2 flex items-center gap-2">
                              <Building2 className="w-4 h-4" />
                              Organizations ({commitResult.skipped.organizations.length})
                            </h4>
                            <div className="space-y-1 pl-6">
                              {commitResult.skipped.organizations.map((entry, idx) => (
                                <div key={idx} className="text-sm text-muted-foreground">
                                  Row {entry.row}: <span className="font-medium">{entry.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {commitResult.skipped.users.length > 0 && (
                          <div>
                            <h4 className="font-medium mb-2 flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              Users ({commitResult.skipped.users.length})
                            </h4>
                            <div className="space-y-1 pl-6">
                              {commitResult.skipped.users.map((entry, idx) => (
                                <div key={idx} className="text-sm text-muted-foreground">
                                  Row {entry.row}: <span className="font-medium">{entry.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {commitResult.skipped.roles.length > 0 && (
                          <div>
                            <h4 className="font-medium mb-2 flex items-center gap-2">
                              <Shield className="w-4 h-4" />
                              Role Assignments ({commitResult.skipped.roles.length})
                            </h4>
                            <div className="space-y-1 pl-6">
                              {commitResult.skipped.roles.map((entry, idx) => (
                                <div key={idx} className="text-sm text-muted-foreground">
                                  Row {entry.row}: <span className="font-medium">{entry.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {commitResult.skipped.storage.length > 0 && (
                          <div>
                            <h4 className="font-medium mb-2 flex items-center gap-2">
                              <HardDrive className="w-4 h-4" />
                              Storage Accounts ({commitResult.skipped.storage.length})
                            </h4>
                            <div className="space-y-1 pl-6">
                              {commitResult.skipped.storage.map((entry, idx) => (
                                <div key={idx} className="text-sm text-muted-foreground">
                                  Row {entry.row}: <span className="font-medium">{entry.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {commitResult.skipped.sftp.length > 0 && (
                          <div>
                            <h4 className="font-medium mb-2 flex items-center gap-2">
                              <Key className="w-4 h-4" />
                              SFTP Users ({commitResult.skipped.sftp.length})
                            </h4>
                            <div className="space-y-1 pl-6">
                              {commitResult.skipped.sftp.map((entry, idx) => (
                                <div key={idx} className="text-sm text-muted-foreground">
                                  Row {entry.row}: <span className="font-medium">{entry.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* Errors if any */}
              {commitResult.errors.length > 0 && (
                <Card className="border-destructive">
                  <CardHeader>
                    <CardTitle className="text-destructive flex items-center gap-2">
                      <XCircle className="w-5 h-5" />
                      Failed Rows ({commitResult.errors.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[200px]">
                      <div className="space-y-2">
                        {commitResult.errors.map((error, idx) => (
                          <Alert key={idx} variant="destructive">
                            <AlertTitle className="text-sm">Row {error.row}</AlertTitle>
                            <AlertDescription className="text-xs">{error.message}</AlertDescription>
                          </Alert>
                        ))}
                      </div>
                    </ScrollArea>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => retryMutation.mutate(commitResult.jobId)}
                      disabled={retryMutation.isPending}
                      data-testid="button-retry-failed"
                    >
                      {retryMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Retrying...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Retry Failed Rows
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )}

              <div className="flex items-center justify-center">
                <Button onClick={handleStartOver} data-testid="button-new-import">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Start New Import
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
