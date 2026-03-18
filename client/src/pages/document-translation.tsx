import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRolePermissions } from "@/hooks/use-role-permissions";
import { useAuth } from "@/hooks/use-auth";
import { useRole } from "@/contexts/role-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import FileSelectorModal from "@/components/file-selector-modal";
import FilePreviewEmbed from "@/components/file-preview-embed";
import { LanguageCombobox } from "@/components/language-combobox";
import { getLanguageName } from "@shared/supported-languages";
import { 
  Languages, 
  FileText, 
  Loader2, 
  Lock, 
  FolderOpen, 
  Trash2,
  Eye,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight
} from "lucide-react";

interface FileItem {
  name: string;
  path: string;
  type: "file" | "folder" | "directory";
  size?: number;
  lastModified?: string;
  extension?: string;
}

interface FoundryResourceData {
  id: number;
  resourceName: string;
  resourceGroup: string;
  location: string;
  projectName: string;
  customSubdomain: string | null;
  projectEndpoint: string | null;
  status: string;
}

interface TranslationInfo {
  blobPath: string;
  translatedAt: string;
  originalFilename: string;
}

interface TranslationMetadata {
  success: boolean;
  filePath: string;
  translatedLanguages: string[];
  translations: {
    [languageCode: string]: TranslationInfo;
  };
}


const translatableExtensions = ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'txt', 'html', 'htm', 'rtf', 'odt', 'odp', 'ods'];

function LoadingSpinner() {
  return <Loader2 className="h-8 w-8 animate-spin text-primary" />;
}

export default function DocumentTranslation() {
  const { data: rolePermissions, isLoading: permissionsLoading } = useRolePermissions();
  const { user, isAuthenticated } = useAuth();
  const { selectedOrganizationId } = useRole();
  const { toast } = useToast();

  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [isFileSelectorOpen, setIsFileSelectorOpen] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showSplitView, setShowSplitView] = useState(false);
  const [selectedTranslatedLanguage, setSelectedTranslatedLanguage] = useState<string | null>(null);
  const [selectedTargetLanguage, setSelectedTargetLanguage] = useState<string>("");
  const [isDeletingTranslation, setIsDeletingTranslation] = useState(false);
  const [translationMessage, setTranslationMessage] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [translatedFileUrl, setTranslatedFileUrl] = useState<string | null>(null);
  const [isLoadingFileUrl, setIsLoadingFileUrl] = useState(false);
  const [fileUrlError, setFileUrlError] = useState<string | null>(null);

  const canViewTranslation = rolePermissions?.documentTranslation?.view ?? false;
  const canRunTranslation = rolePermissions?.documentTranslation?.runTranslation ?? false;
  const canDeleteTranslation = rolePermissions?.documentTranslation?.deleteTranslation ?? false;
  const canAccess = canViewTranslation || canRunTranslation || canDeleteTranslation;

  const { data: orgLinkedResources = [], isLoading: resourcesLoading } = useQuery<FoundryResourceData[]>({
    queryKey: ["/api/foundry/org-resources", selectedOrganizationId],
    queryFn: async () => {
      if (!selectedOrganizationId) return [];
      const res = await apiRequest("GET", `/api/foundry/org-resources?organizationId=${selectedOrganizationId}`);
      return await res.json();
    },
    enabled: !!selectedOrganizationId && canAccess,
  });

  const activeResources = useMemo(() => {
    return orgLinkedResources.filter(r => 
      r.status === 'completed' || r.status === 'active'
    );
  }, [orgLinkedResources]);

  const selectedResource = useMemo(() => {
    if (!selectedResourceId) return null;
    return activeResources.find(r => r.id === selectedResourceId) || null;
  }, [selectedResourceId, activeResources]);

  const { data: translationMetadata, isLoading: metadataLoading, refetch: refetchMetadata } = useQuery<TranslationMetadata>({
    queryKey: ['/api/translate/metadata', selectedOrganizationId, selectedFile?.path],
    queryFn: async () => {
      if (!selectedOrganizationId || !selectedFile?.path) {
        throw new Error('Missing required parameters');
      }
      const params = new URLSearchParams({
        organizationId: selectedOrganizationId.toString(),
        filePath: selectedFile.path,
      });
      console.log('[DOC-TRANSLATE-UI] Fetching metadata for:', selectedFile.path);
      const response = await apiRequest("GET", `/api/translate/metadata?${params}`);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[DOC-TRANSLATE-UI] Metadata fetch failed:', response.status, errorText);
        throw new Error('Failed to fetch translation metadata');
      }
      const data = await response.json();
      console.log('[DOC-TRANSLATE-UI] Received metadata:', JSON.stringify(data, null, 2));
      return data;
    },
    enabled: !!selectedOrganizationId && !!selectedFile?.path && isFileTranslatable(selectedFile),
  });

  useEffect(() => {
    if (activeResources.length > 0 && !selectedResourceId) {
      setSelectedResourceId(activeResources[0].id);
    }
  }, [activeResources, selectedResourceId]);

  useEffect(() => {
    setSelectedTranslatedLanguage(null);
    setSelectedTargetLanguage("");
    setTranslationMessage(null);
    setFileUrl(null);
    setTranslatedFileUrl(null);
    setFileUrlError(null);
  }, [selectedFile]);

  useEffect(() => {
    const fetchFileUrl = async () => {
      if (!selectedFile || !selectedOrganizationId) {
        setFileUrl(null);
        setIsLoadingFileUrl(false);
        return;
      }
      setIsLoadingFileUrl(true);
      setFileUrlError(null);
      try {
        const sasResponse = await apiRequest(
          "GET", 
          `/api/content-understanding/generate-sas?organizationId=${selectedOrganizationId}&path=${encodeURIComponent(selectedFile.path)}`
        );
        const sasData = await sasResponse.json();
        if (sasData.success && sasData.url) {
          setFileUrl(sasData.url);
        } else {
          setFileUrlError(sasData.error || "Failed to generate preview URL");
          toast({
            title: "Preview Error",
            description: "Unable to load document preview. You can still translate the document.",
            variant: "destructive",
          });
        }
        setShowSplitView(true);
      } catch (error) {
        console.error("Failed to get file URL:", error);
        setFileUrlError("Failed to load document preview");
        setShowSplitView(true);
        toast({
          title: "Preview Error",
          description: "Unable to load document preview. You can still translate the document.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingFileUrl(false);
      }
    };
    fetchFileUrl();
  }, [selectedFile, selectedOrganizationId, toast]);

  useEffect(() => {
    const fetchTranslatedFileUrl = async () => {
      if (!selectedTranslatedLanguage || !selectedOrganizationId || !translationMetadata?.translations[selectedTranslatedLanguage]) {
        setTranslatedFileUrl(null);
        return;
      }
      try {
        // Decode first since the path might already be URL-encoded in metadata, then encode for query string
        const translatedPath = translationMetadata.translations[selectedTranslatedLanguage].blobPath;
        const decodedPath = decodeURIComponent(translatedPath);
        const sasResponse = await apiRequest(
          "GET", 
          `/api/content-understanding/generate-sas?organizationId=${selectedOrganizationId}&path=${encodeURIComponent(decodedPath)}`
        );
        const sasData = await sasResponse.json();
        if (sasData.success) {
          setTranslatedFileUrl(sasData.url);
        }
      } catch (error) {
        console.error("Failed to get translated file URL:", error);
      }
    };
    fetchTranslatedFileUrl();
  }, [selectedTranslatedLanguage, selectedOrganizationId, translationMetadata]);

  function getFileExtension(file: FileItem): string {
    if (file.extension) return file.extension.replace(/^\./, '').toLowerCase();
    const parts = file.name.split('.');
    if (parts.length > 1) return parts[parts.length - 1].toLowerCase();
    return '';
  }

  function isFileTranslatable(file: FileItem | null): boolean {
    if (!file) return false;
    const ext = getFileExtension(file);
    return translatableExtensions.includes(ext);
  }

  async function translateFile(languageCode: string) {
    if (!selectedFile || !selectedResource || !selectedOrganizationId) return;
    if (isTranslating) return;

    setIsTranslating(true);
    setTranslationMessage("Translation in progress. Once completed, the translated document will be available in the translated documents folder.");

    try {
      const response = await apiRequest("POST", "/api/translate/document-from-path", {
        organizationId: selectedOrganizationId,
        filePath: selectedFile.path,
        targetLanguage: languageCode,
        foundryResourceName: selectedResource.resourceName,
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Translation Complete",
          description: `Document translated to ${getLanguageName(languageCode)}`,
        });
        setTranslationMessage(null);
        setSelectedTargetLanguage("");
        refetchMetadata();
        queryClient.invalidateQueries({ queryKey: ['/api/translate/metadata'] });
      } else {
        toast({
          title: "Translation Failed",
          description: result.error || "Failed to translate document",
          variant: "destructive",
        });
        setTranslationMessage(null);
      }
    } catch (error: any) {
      console.error("Translation error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to translate document",
        variant: "destructive",
      });
      setTranslationMessage(null);
    } finally {
      setIsTranslating(false);
    }
  }

  async function deleteTranslatedDocument(languageCode: string) {
    if (!selectedFile || !selectedOrganizationId || !translationMetadata?.translations[languageCode]) return;
    
    setIsDeletingTranslation(true);
    
    try {
      const translationInfo = translationMetadata.translations[languageCode];
      
      const response = await apiRequest("DELETE", "/api/translate/translated-document", {
        organizationId: selectedOrganizationId,
        sourceBlobPath: selectedFile.path,
        translatedBlobPath: translationInfo.blobPath,
        languageCode: languageCode,
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Translation Deleted",
          description: `${getLanguageName(languageCode)} translation has been removed`,
        });
        if (selectedTranslatedLanguage === languageCode) {
          setSelectedTranslatedLanguage(null);
        }
        refetchMetadata();
        queryClient.invalidateQueries({ queryKey: ['/api/translate/metadata'] });
      } else {
        toast({
          title: "Delete Failed",
          description: result.error || "Failed to delete translated document",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Delete translation error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete translated document",
        variant: "destructive",
      });
    } finally {
      setIsDeletingTranslation(false);
    }
  }

  function handleFileSelect(file: FileItem) {
    setSelectedFile(file);
    setIsFileSelectorOpen(false);
  }

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4 text-muted-foreground">
        <Lock className="h-16 w-16 opacity-50" />
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
          <p>You don't have permission to access Document Translation.</p>
          <p className="text-sm">Contact your administrator to request access.</p>
        </div>
      </div>
    );
  }

  const hasTranslations = translationMetadata && translationMetadata.translatedLanguages && translationMetadata.translatedLanguages.length > 0;

  return (
    <div className="flex flex-col h-full">
      <FileSelectorModal
        isOpen={isFileSelectorOpen}
        onClose={() => setIsFileSelectorOpen(false)}
        onSelect={handleFileSelect}
        supportedExtensions={translatableExtensions}
      />

      <div className="p-4 border-b flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Languages className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Document Translation</h1>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Select
            value={selectedResourceId?.toString() || ""}
            onValueChange={(value) => setSelectedResourceId(parseInt(value))}
          >
            <SelectTrigger className="w-[240px]" data-testid="select-foundry-resource">
              <SelectValue placeholder="Select AI Resource" />
            </SelectTrigger>
            <SelectContent>
              {activeResources.length === 0 ? (
                <div className="p-2 text-sm text-muted-foreground">
                  No resources available
                </div>
              ) : (
                activeResources.map((resource) => (
                  <SelectItem key={resource.id} value={resource.id.toString()}>
                    {resource.resourceName}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            onClick={() => setIsFileSelectorOpen(true)}
            disabled={!selectedResource}
            data-testid="button-select-file"
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            Select Document
          </Button>

          <div className="flex items-center gap-2">
            <LanguageCombobox
              value={selectedTargetLanguage}
              onValueChange={setSelectedTargetLanguage}
              translatedLanguages={translationMetadata?.translatedLanguages || []}
              placeholder="Select target language..."
              disabled={!selectedFile || !selectedResource || isTranslating || !canRunTranslation || !isFileTranslatable(selectedFile)}
              className="w-[220px]"
            />
            <Button
              disabled={!selectedFile || !selectedResource || isTranslating || !canRunTranslation || !isFileTranslatable(selectedFile) || !selectedTargetLanguage}
              title={
                !canRunTranslation 
                  ? "You don't have permission to translate" 
                  : !isFileTranslatable(selectedFile)
                  ? "This file format is not supported for translation"
                  : !selectedTargetLanguage
                  ? "Please select a target language"
                  : undefined
              }
              onClick={() => {
                if (selectedTargetLanguage) {
                  translateFile(selectedTargetLanguage);
                }
              }}
              data-testid="button-translate"
            >
              {isTranslating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Translating...
                </>
              ) : (
                <>
                  <Languages className="h-4 w-4 mr-2" />
                  Translate
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {!showSplitView ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <FolderOpen className="h-16 w-16 mb-4 opacity-50" />
          <h2 className="text-xl font-semibold mb-2">Select a Document</h2>
          <p className="text-center max-w-md">
            Choose a document to translate. The translated version will preserve the original layout and formatting.
          </p>
          <Button 
            className="mt-4" 
            variant="outline" 
            onClick={() => setIsFileSelectorOpen(true)}
            disabled={!selectedResource}
            data-testid="button-select-file-empty"
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            Select Document
          </Button>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Original Document - Full width when no translation selected, half when selected */}
          <div className={`${selectedTranslatedLanguage ? 'w-1/2' : 'w-full'} flex flex-col border-r`}>
            <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="font-medium">Original Document</span>
                {selectedFile && (
                  <Badge variant="secondary">{selectedFile.name}</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Translation in progress message */}
                {translationMessage && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
                    <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                    <span className="text-xs text-blue-700 dark:text-blue-300">Translating...</span>
                  </div>
                )}
                
                {/* Translations dropdown - similar to Content Discovery saved results */}
                {hasTranslations && (
                  <div className="flex items-center gap-1">
                    <Select
                      value={selectedTranslatedLanguage || ""}
                      onValueChange={(value) => setSelectedTranslatedLanguage(value || null)}
                    >
                      <SelectTrigger className="w-[180px]" data-testid="select-translation">
                        <SelectValue placeholder="View translation..." />
                      </SelectTrigger>
                      <SelectContent>
                        {translationMetadata.translatedLanguages.map((langCode) => {
                          const translation = translationMetadata.translations[langCode];
                          return (
                            <SelectItem key={langCode} value={langCode}>
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                                <span>{getLanguageName(langCode)}</span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    
                    {/* Delete button for selected translation */}
                    {selectedTranslatedLanguage && canDeleteTranslation && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            disabled={isDeletingTranslation}
                            title="Delete translation"
                            data-testid={`delete-translation-${selectedTranslatedLanguage}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Translation</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete the {getLanguageName(selectedTranslatedLanguage)} translation? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteTranslatedDocument(selectedTranslatedLanguage)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                )}
                
                {!hasTranslations && isFileTranslatable(selectedFile) && !metadataLoading && (
                  <span className="text-xs text-muted-foreground">No translations yet</span>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {selectedFile && fileUrl ? (
                <FilePreviewEmbed
                  fileUrl={fileUrl}
                  fileName={selectedFile.name}
                  fileExtension={getFileExtension(selectedFile)}
                  className="h-full"
                />
              ) : selectedFile && isLoadingFileUrl ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : selectedFile && fileUrlError ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                  <AlertCircle className="h-12 w-12" />
                  <p className="text-sm">Preview not available</p>
                  <p className="text-xs">{fileUrlError}</p>
                  <p className="text-xs">You can still translate this document using the Translate button above.</p>
                </div>
              ) : null}
            </div>
          </div>

          {/* Translated Document - Side by side when translation is selected */}
          {selectedTranslatedLanguage && translationMetadata?.translations[selectedTranslatedLanguage] && (
            <div className="w-1/2 flex flex-col">
              <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Languages className="h-4 w-4 text-primary" />
                  <span className="font-medium">{getLanguageName(selectedTranslatedLanguage)} Translation</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedTranslatedLanguage(null)}
                  data-testid="button-close-translation"
                >
                  Close
                </Button>
              </div>
              <div className="flex-1 overflow-hidden">
                {translatedFileUrl ? (
                  <FilePreviewEmbed
                    fileUrl={translatedFileUrl}
                    fileName={`${selectedFile?.name}_${selectedTranslatedLanguage}`}
                    fileExtension={selectedFile ? getFileExtension(selectedFile) : 'pdf'}
                    className="h-full"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
