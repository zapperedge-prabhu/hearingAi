import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRolePermissions } from "@/hooks/use-role-permissions";
import { useAuth } from "@/hooks/use-auth";
import { useRole } from "@/contexts/role-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MarkdownMessage } from "@/components/markdown-message";
import FileSelectorModal from "@/components/file-selector-modal";
import FilePreviewEmbed from "@/components/file-preview-embed";
import { PostCallAnalysis } from "@/components/post-call-analysis";
import { downloadPostCallPDF } from "@/lib/post-call-pdf";
import { 
  Scan, 
  FileText, 
  Music, 
  Video, 
  Image, 
  Loader2, 
  Lock, 
  FolderOpen, 
  ChevronRight, 
  ChevronDown,
  File,
  Folder,
  CheckCircle2,
  XCircle,
  Brain,
  ListChecks,
  AlertTriangle,
  MessageSquare,
  Hash,
  Tags,
  Save,
  History,
  Trash2,
  PhoneCall,
  Sparkles,
  Download
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
  contentUnderstandingEnabled?: boolean;
}

interface AnalysisResult {
  success: boolean;
  result?: {
    contents?: Array<{
      markdown?: string;
      text?: string;
      kind?: string;
      startTime?: string;
      endTime?: string;
      fields?: Record<string, any>;
    }>;
    metadata?: Record<string, any>;
    analyzerId?: string;
    summary?: string;
    topics?: string[];
    sentiment?: {
      overall?: string;
      score?: number;
      positive?: number;
      negative?: number;
      neutral?: number;
    };
    tables?: Array<{
      headers?: string[];
      rows?: string[][];
    }>;
    entities?: Array<{
      name: string;
      type?: string;
      confidence?: number;
    }>;
    keyPhrases?: string[];
    autoSaved?: boolean;
    resultPath?: string;
    message?: string;
  };
  error?: string;
}

interface SavedCuResult {
  blobPath: string;
  blobName: string;
  resultNumber: number;
  createdAt: string;
  size: number;
  metadata?: {
    analyzedby?: string;
    createdat?: string;
  };
}

function LoadingSpinner() {
  return <Loader2 className="h-8 w-8 animate-spin text-primary" />;
}

export default function ContentDiscovery() {
  const { data: rolePermissions, isLoading: permissionsLoading } = useRolePermissions();
  const { user, isAuthenticated } = useAuth();
  const { selectedOrganizationId } = useRole();
  const { toast } = useToast();

  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [isFileSelectorOpen, setIsFileSelectorOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [resultTab, setResultTab] = useState("fields");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [mediaCurrentTime, setMediaCurrentTime] = useState<number>(0);

  const [summaryOpen, setSummaryOpen] = useState(true);
  const [entitiesOpen, setEntitiesOpen] = useState(true);
  const [inconsistenciesOpen, setInconsistenciesOpen] = useState(false);
  const [topicsOpen, setTopicsOpen] = useState(true);
  const [customOpen, setCustomOpen] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSavedResult, setIsLoadingSavedResult] = useState(false);
  const [savedResults, setSavedResults] = useState<SavedCuResult[]>([]);
  const [selectedSavedResult, setSelectedSavedResult] = useState<string | null>(null);
  const [savedResultsDropdownOpen, setSavedResultsDropdownOpen] = useState(false);
  const [maxResultsPerFile, setMaxResultsPerFile] = useState(0); // 0 = unlimited
  const [selectedModality, setSelectedModality] = useState<string>("Document");
  const [selectedCategory, setSelectedCategory] = useState<string>("Base & extraction");
  const [selectedAnalyzer, setSelectedAnalyzer] = useState<string>("prebuilt-document");

  const [postCallData, setPostCallData] = useState<any | null>(null);
  const [isRunningPostCall, setIsRunningPostCall] = useState(false);
  const [postCallError, setPostCallError] = useState<string | null>(null);
  const [postCallSavedAt, setPostCallSavedAt] = useState<string | null>(null);
  const [isLoadingPostCall, setIsLoadingPostCall] = useState(false);

  const [leftPanelPct, setLeftPanelPct] = useState(38);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartPct = useRef(0);

  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartPct.current = leftPanelPct;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [leftPanelPct]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !splitContainerRef.current) return;
      const containerWidth = splitContainerRef.current.getBoundingClientRect().width;
      const deltaX = e.clientX - dragStartX.current;
      const deltaPct = (deltaX / containerWidth) * 100;
      const newPct = Math.min(70, Math.max(15, dragStartPct.current + deltaPct));
      setLeftPanelPct(newPct);
    };
    const onMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const MODALITY_MAPPING: Record<string, any> = {
    "Document": {
      "Base & extraction": ["prebuilt-document", "prebuilt-read", "prebuilt-layout"],
      "RAG": ["prebuilt-documentSearch"],
      "Financial documents": ["prebuilt-invoice", "prebuilt-receipt", "prebuilt-receipt.generic", "prebuilt-receipt.hotel", "prebuilt-creditCard", "prebuilt-creditMemo", "prebuilt-check.us", "prebuilt-bankStatement.us"],
      "Identity documents": ["prebuilt-idDocument", "prebuilt-idDocument.generic", "prebuilt-idDocument.passport", "prebuilt-healthInsuranceCard.us"],
      "US income tax forms": ["prebuilt-tax.us", "prebuilt-tax.us.1040", "prebuilt-tax.us.1040Senior", "prebuilt-tax.us.1040Schedule1", "prebuilt-tax.us.1040Schedule2", "prebuilt-tax.us.1040Schedule3", "prebuilt-tax.us.1040Schedule8812", "prebuilt-tax.us.1040ScheduleA", "prebuilt-tax.us.1040ScheduleB", "prebuilt-tax.us.1040ScheduleC", "prebuilt-tax.us.1040ScheduleD", "prebuilt-tax.us.1040ScheduleE", "prebuilt-tax.us.1040ScheduleEIC", "prebuilt-tax.us.1040ScheduleF", "prebuilt-tax.us.1040ScheduleH"],
      "Form 1099 variants": ["prebuilt-tax.us.1099Combo", "prebuilt-tax.us.1099A", "prebuilt-tax.us.1099B", "prebuilt-tax.us.1099C", "prebuilt-tax.us.1099CAP", "prebuilt-tax.us.1099DA", "prebuilt-tax.us.1099DIV", "prebuilt-tax.us.1099G", "prebuilt-tax.us.1099H", "prebuilt-tax.us.1099INT", "prebuilt-tax.us.1099K", "prebuilt-tax.us.1099LS", "prebuilt-tax.us.1099LTC", "prebuilt-tax.us.1099MISC", "prebuilt-tax.us.1099NEC", "prebuilt-tax.us.1099OID", "prebuilt-tax.us.1099PATR", "prebuilt-tax.us.1099Q", "prebuilt-tax.us.1099QA"],
      "Form 1098 variants": ["prebuilt-tax.us.1098", "prebuilt-tax.us.1098E", "prebuilt-tax.us.1098T"],
      "Form 1095 variants": ["prebuilt-tax.us.1095A", "prebuilt-tax.us.1095C"],
      "Employment tax forms": ["prebuilt-tax.us.w2", "prebuilt-tax.us.w4"],
      "Mortgage documents (US)": ["prebuilt-mortgage.us", "prebuilt-mortgage.us.1003", "prebuilt-mortgage.us.1004", "prebuilt-mortgage.us.1005", "prebuilt-mortgage.us.1008", "prebuilt-mortgage.us.closingDisclosure"],
      "Legal & business documents": ["prebuilt-contract", "prebuilt-marriageCertificate.us"],
      "Procurement documents": ["prebuilt-procurement", "prebuilt-purchaseOrder"],
      "Other specialized": ["prebuilt-payStub.us", "prebuilt-utilityBill"],
      "Utility": ["prebuilt-documentFieldSchema", "prebuilt-documentFields"]
    },
    "Image": {
      "Base": ["prebuilt-image"],
      "RAG": ["prebuilt-imageSearch"]
    },
    "Audio": {
      "Base": ["prebuilt-audio"],
      "Post call analysis": ["prebuilt-callCenter"],
      "RAG": ["prebuilt-audioSearch"]
    },
    "Video": {
      "Base": ["prebuilt-video"],
      "RAG": ["prebuilt-videoSearch"]
    }
  };

  const getModalityFromExt = (ext: string): string => {
    if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(ext)) return "Audio";
    if (['mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv'].includes(ext)) return "Video";
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'webp'].includes(ext)) return "Image";
    return "Document";
  };

  // Async video analysis state
  const [videoJobId, setVideoJobId] = useState<string | null>(null);
  const [videoJobStatus, setVideoJobStatus] = useState<string | null>(null);
  const [videoJobPollCount, setVideoJobPollCount] = useState(0);

  const canAccess = rolePermissions?.foundryMgmt?.tabContentUnderstanding;
  const canRunAnalysis = rolePermissions?.contentUnderstanding?.runAnalysis ?? false;
  const canSaveAnalysis = rolePermissions?.contentUnderstanding?.saveAnalysis ?? false;
  const canDeleteAnalysis = rolePermissions?.contentUnderstanding?.deleteAnalysis ?? false;

  const { data: orgLinkedResources = [], isLoading: resourcesLoading } = useQuery<FoundryResourceData[]>({
    queryKey: ["/api/foundry/org-resources", selectedOrganizationId],
    queryFn: async () => {
      if (!selectedOrganizationId) return [];
      const res = await apiRequest("GET", `/api/foundry/org-resources?organizationId=${selectedOrganizationId}`);
      return await res.json();
    },
    enabled: !!selectedOrganizationId && canAccess,
  });

  const cuEnabledResources = useMemo(() => {
    return orgLinkedResources.filter(r => 
      r.status === 'completed' || r.status === 'active'
    );
  }, [orgLinkedResources]);

  const selectedResource = useMemo(() => {
    if (!selectedResourceId) return null;
    return cuEnabledResources.find(r => r.id === selectedResourceId) || null;
  }, [selectedResourceId, cuEnabledResources]);

  useEffect(() => {
    if (cuEnabledResources.length > 0 && !selectedResourceId) {
      setSelectedResourceId(cuEnabledResources[0].id);
    }
  }, [cuEnabledResources, selectedResourceId]);

  useEffect(() => {
    const fetchCuConfig = async () => {
      try {
        const res = await apiRequest("GET", "/api/cu/config");
        const data = await res.json();
        if (data.success && data.config?.maxResultsPerFile !== undefined) {
          setMaxResultsPerFile(data.config.maxResultsPerFile); // 0 = unlimited
        }
      } catch (error) {
        console.error("Failed to fetch CU config:", error);
      }
    };
    fetchCuConfig();
  }, []);

  useEffect(() => {
    const fetchFileUrl = async () => {
      if (!selectedFile || !selectedOrganizationId) {
        setFileUrl(null);
        return;
      }
      try {
        const sasResponse = await apiRequest(
          "GET", 
          `/api/content-understanding/generate-sas?organizationId=${selectedOrganizationId}&path=${encodeURIComponent(selectedFile.path)}`
        );
        const sasData = await sasResponse.json();
        if (sasData.success) {
          setFileUrl(sasData.url);
        }
      } catch (error) {
        console.error("Failed to get file URL:", error);
      }
    };
    fetchFileUrl();
  }, [selectedFile, selectedOrganizationId]);

  const refreshSavedResults = async () => {
    if (!selectedFile || !selectedOrganizationId) {
      setSavedResults([]);
      setSelectedSavedResult(null);
      return;
    }
    try {
      const res = await apiRequest(
        "GET",
        `/api/cu/results/list?organizationId=${selectedOrganizationId}&sourceFilePath=${encodeURIComponent(selectedFile.path)}`
      );
      const data = await res.json();
      if (data.success && data.results) {
        setSavedResults(data.results);
      } else {
        setSavedResults([]);
      }
    } catch (error) {
      console.error("Failed to fetch saved CU results:", error);
      setSavedResults([]);
    }
  };

  useEffect(() => {
    refreshSavedResults();
  }, [selectedFile, selectedOrganizationId]);

  // Auto-fetch saved post-call analysis when a transcript file is selected
  useEffect(() => {
    const fetchSavedPostCall = async () => {
      if (!selectedFile || !selectedOrganizationId) {
        setPostCallData(null);
        setPostCallSavedAt(null);
        return;
      }
      // Only fetch if the file looks like a transcript/audio/video
      const ext = selectedFile.name?.split('.').pop()?.toLowerCase() || '';
      const isAudioVideo = ['mp3', 'mp4', 'wav', 'ogg', 'webm', 'm4a', 'aac', 'flac', 'mov', 'avi', 'mkv'].includes(ext);
      if (!isAudioVideo) return;

      setIsLoadingPostCall(true);
      try {
        const res = await apiRequest(
          "GET",
          `/api/cu/post-call-analysis/get?organizationId=${selectedOrganizationId}&sourceFilePath=${encodeURIComponent(selectedFile.path)}`
        );
        const data = await res.json();
        if (data.success && data.data) {
          setPostCallData(data.data);
          setPostCallSavedAt(data.savedAt || null);
        } else {
          setPostCallData(null);
          setPostCallSavedAt(null);
        }
      } catch (error) {
        console.error("Failed to fetch saved post-call analysis:", error);
        setPostCallData(null);
        setPostCallSavedAt(null);
      } finally {
        setIsLoadingPostCall(false);
      }
    };
    fetchSavedPostCall();
  }, [selectedFile, selectedOrganizationId]);

  const saveAnalysisResult = async () => {
    if (!analysisResult?.success || !selectedFile || !selectedOrganizationId) return;

    setIsSaving(true);
    try {
      const res = await apiRequest("POST", "/api/cu/results/save", {
        organizationId: selectedOrganizationId,
        sourceFilePath: selectedFile.path,
        fileName: selectedFile.name,
        analysisResult: analysisResult.result
      });

      const data = await res.json();
      if (data.success) {
        toast({
          title: "Result Saved",
          description: `Analysis saved as result #${data.resultNumber}`,
        });
        const listRes = await apiRequest(
          "GET",
          `/api/cu/results/list?organizationId=${selectedOrganizationId}&sourceFilePath=${encodeURIComponent(selectedFile.path)}`
        );
        const listData = await listRes.json();
        if (listData.success) {
          setSavedResults(listData.results || []);
        }
      } else {
        toast({
          title: "Save Failed",
          description: data.error || "Failed to save analysis result",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Save error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save analysis result",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const isTranscript = useMemo(() => {
    if (!analysisResult?.success) return false;
    const contents = analysisResult?.result?.contents || [];
    // Explicit per-segment timestamps (video with Speaker diarization)
    const hasSegmentTimestamps = contents.some(
      (c: any) => c.startTime !== undefined || c.endTime !== undefined
    );
    if (hasSegmentTimestamps) return true;
    // VTT-style timestamps embedded in text/markdown (prebuilt-audio)
    const vttPattern = /\d{2}:\d{2}[.:]\d{3}\s*-->\s*\d{2}:\d{2}[.:]\d{3}/;
    const hasVttText = contents.some(
      (c: any) => vttPattern.test(c.text || "") || vttPattern.test(c.markdown || "")
    );
    if (hasVttText) return true;
    // Speaker tags in content (<v SpeakerName> format)
    const hasSpeakerTags = contents.some(
      (c: any) => /<v\s+\S/.test(c.text || "") || /<v\s+\S/.test(c.markdown || "")
    );
    if (hasSpeakerTags) return true;
    // Selected modality is Audio or Video
    if (selectedModality === "Audio" || selectedModality === "Video") return true;
    return false;
  }, [analysisResult, selectedModality]);

  const buildTranscriptText = (contents: any[]): string => {
    return contents
      .filter((c: any) => c.text || c.markdown)
      .map((c: any) => {
        const ts = c.startTime ? `[${c.startTime}]` : "";
        const text = c.text || c.markdown || "";
        return ts ? `${ts} ${text}` : text;
      })
      .join("\n");
  };

  const runPostCallAnalysis = async () => {
    if (!selectedOrganizationId || !analysisResult?.result?.contents) return;
    setIsRunningPostCall(true);
    setPostCallError(null);
    setPostCallData(null);
    setPostCallSavedAt(null);
    try {
      const transcriptText = buildTranscriptText(analysisResult.result.contents);
      const res = await apiRequest("POST", "/api/cu/post-call-analysis", {
        organizationId: selectedOrganizationId,
        transcriptText,
        sourceFilePath: selectedFile?.path || null,
        metadata: {
          callId: selectedFile?.name?.replace(/\.[^/.]+$/, "") || "Unknown",
          duration: analysisResult.result.contents.length > 0 ?
            (analysisResult.result.contents[analysisResult.result.contents.length - 1] as any)?.endTime || "Unknown" : "Unknown",
          agentId: "Unknown",
          callType: selectedAnalyzer,
          industry: "Unknown",
          date: new Date().toISOString().split("T")[0],
        }
      });
      const data = await res.json();
      if (data.success && data.analysis) {
        setPostCallData(data.analysis);
        setPostCallSavedAt(data.savedAt || null);
        setResultTab("postcall");
      } else {
        setPostCallError(data.error || "Analysis failed");
        toast({
          title: "Post-Call Analysis Failed",
          description: data.error || "Unable to complete analysis. Check that a Foundry AI agent is configured.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Post-call analysis error:", error);
      const msg = error.message || "Failed to run post-call analysis";
      setPostCallError(msg);
      toast({
        title: "Post-Call Analysis Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsRunningPostCall(false);
    }
  };

  const loadSavedResult = async (blobPath: string) => {
    if (!selectedOrganizationId) return;

    setIsLoadingSavedResult(true);
    setSelectedSavedResult(blobPath);
    try {
      const res = await apiRequest(
        "GET",
        `/api/cu/results/get?organizationId=${selectedOrganizationId}&blobPath=${encodeURIComponent(blobPath)}`
      );
      const data = await res.json();
      if (data.success && data.result) {
        const loadedResult = data.result.analysisResult || data.result;
        setAnalysisResult({
          success: true,
          result: { ...loadedResult, autoSaved: true }
        });
        toast({
          title: "Result Loaded",
          description: "Previously saved analysis result loaded",
        });
      } else {
        toast({
          title: "Load Failed",
          description: data.error || "Failed to load saved result",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Load error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load saved result",
        variant: "destructive",
      });
    } finally {
      setIsLoadingSavedResult(false);
    }
  };

  const deleteSavedResult = async (blobPath: string) => {
    if (!selectedOrganizationId) return;

    try {
      const res = await apiRequest("DELETE", "/api/cu/results/delete", {
        organizationId: selectedOrganizationId,
        blobPath
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: "Result Deleted",
          description: "Saved analysis result has been deleted",
        });
        setSavedResults(prev => prev.filter(r => r.blobPath !== blobPath));
        if (selectedSavedResult === blobPath) {
          setSelectedSavedResult(null);
        }
      } else {
        toast({
          title: "Delete Failed",
          description: data.error || "Failed to delete saved result",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Delete error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete saved result",
        variant: "destructive",
      });
    }
  };

  const getFileExtension = (file: FileItem): string => {
    if (file.extension) return file.extension.replace(/^\./, '').toLowerCase();
    const parts = file.name.split('.');
    if (parts.length > 1) return parts[parts.length - 1].toLowerCase();
    return '';
  };

  const isFileTranslatable = (file: FileItem | null): boolean => {
    return false;
  };

  const translateFile = async (languageCode: string) => {
    return;
  };

  const getFileIcon = (file: FileItem) => {
    const ext = getFileExtension(file);
    if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(ext)) return <Music className="h-4 w-4 text-purple-500" />;
    if (['mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv'].includes(ext)) return <Video className="h-4 w-4 text-red-500" />;
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'webp'].includes(ext)) return <Image className="h-4 w-4 text-green-500" />;
    return <FileText className="h-4 w-4 text-blue-500" />;
  };

  const handleFileSelect = (file: FileItem) => {
    setSelectedFile(file);
    setAnalysisResult(null);
    setFileUrl(null);
    setSelectedSavedResult(null);
    setPostCallData(null);
    setPostCallError(null);
    setResultTab("fields");
    
    // Auto-detect modality
    const ext = getFileExtension(file);
    const modality = getModalityFromExt(ext);
    setSelectedModality(modality);
    
    // Set default category and analyzer for the modality
    const categories = Object.keys(MODALITY_MAPPING[modality]);
    const firstCategory = categories[0];
    setSelectedCategory(firstCategory);
    setSelectedAnalyzer(MODALITY_MAPPING[modality][firstCategory][0]);
  };

  const isVideoFile = (file: FileItem): boolean => {
    const ext = getFileExtension(file);
    return ['mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv', 'flv'].includes(ext);
  };

  const isAudioFile = (file: FileItem): boolean => {
    const ext = getFileExtension(file);
    return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'].includes(ext);
  };

  const isDocumentFile = (file: FileItem): boolean => {
    const ext = getFileExtension(file);
    return ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'html', 'txt', 'csv', 'rtf'].includes(ext);
  };

  const needsAsyncAnalysis = (file: FileItem): boolean => {
    return isVideoFile(file) || isAudioFile(file) || isDocumentFile(file);
  };

  const getAsyncContentType = (file: FileItem): string => {
    if (isVideoFile(file)) return "video";
    if (isAudioFile(file)) return "audio";
    if (isDocumentFile(file)) return "document";
    return "image";
  };

  const { data: uploadConfig } = useQuery<{ videoMaxPolls?: number }>({
    queryKey: ["/api/config/upload"],
  });

  const pollCuJobStatus = async (jobId: string, contentType: string, pollInterval = 5000, maxPolls = 2880) => {
    const effectiveMaxPolls = uploadConfig?.videoMaxPolls || maxPolls;
    let pollCount = 0;
    const label = contentType.charAt(0).toUpperCase() + contentType.slice(1);
    
    const poll = async (): Promise<void> => {
      pollCount++;
      setVideoJobPollCount(pollCount);
      
      try {
        const response = await apiRequest("GET", `/api/cu/jobs/${encodeURIComponent(jobId)}/status`);
        const data = await response.json();
        
        if (data.status === "succeeded") {
          setVideoJobStatus("succeeded");
          if (data.result) {
            const resultWithAutoSaved = { ...data.result, autoSaved: true };
            setAnalysisResult({ success: true, result: resultWithAutoSaved });
            setIsAnalyzing(false);
            setVideoJobId(null);
            refreshSavedResults();
            toast({
              title: `${label} Analysis Complete`,
              description: `${label} has been analyzed successfully`,
            });
          } else {
            try {
              const listResp = await apiRequest("GET", `/api/cu/results/list?organizationId=${selectedOrganizationId}&sourceFilePath=${encodeURIComponent(selectedFile?.path || "")}`);
              const listData = await listResp.json();
              if (listData.success && listData.results && listData.results.length > 0) {
                const latestResult = listData.results[listData.results.length - 1];
                const getResp = await apiRequest("GET", `/api/cu/results/get?organizationId=${selectedOrganizationId}&blobPath=${encodeURIComponent(latestResult.blobPath)}`);
                const resultData = await getResp.json();
                if (resultData.success && resultData.result) {
                  const analysisData = resultData.result.analysisResult || resultData.result;
                  setAnalysisResult({ success: true, result: { ...analysisData, autoSaved: true } });
                  setIsAnalyzing(false);
                  setVideoJobId(null);
                  refreshSavedResults();
                  toast({
                    title: `${label} Analysis Complete`,
                    description: `${label} has been analyzed and results loaded from saved data`,
                  });
                  return;
                }
              }
            } catch (fetchSavedErr) {
              console.warn("[CU-DEBUG] Failed to fetch saved result:", fetchSavedErr);
            }
            setAnalysisResult({ success: true, result: { autoSaved: true, resultPath: data.resultPath, message: "Analysis completed and results have been auto-saved. You can view saved results from the file's CU results." } });
            setIsAnalyzing(false);
            setVideoJobId(null);
            refreshSavedResults();
            toast({
              title: `${label} Analysis Complete`,
              description: `${label} analysis completed. Results were auto-saved.`,
            });
          }
          return;
        }
        
        if (data.status === "failed" || data.status === "cancelled") {
          setVideoJobStatus(data.status);
          setAnalysisResult({ success: false, error: data.error || `Analysis ${data.status}` });
          setIsAnalyzing(false);
          setVideoJobId(null);
          toast({
            title: "Analysis Failed",
            description: data.error || `${label} analysis ${data.status}`,
            variant: "destructive",
          });
          return;
        }
        
        setVideoJobStatus(data.status || "running");
        
        if (pollCount < effectiveMaxPolls) {
          setTimeout(poll, pollInterval);
        } else {
          setVideoJobStatus("timeout");
          setAnalysisResult({ success: false, error: `${label} analysis is taking too long. It will continue in the background.` });
          setIsAnalyzing(false);
        }
      } catch (error: any) {
        console.error("Poll error:", error);
        if (pollCount < effectiveMaxPolls) {
          setTimeout(poll, pollInterval);
        }
      }
    };
    
    await poll();
  };

  const analyzeFile = async () => {
    if (!selectedFile || !selectedResource || !selectedOrganizationId) return;

    setIsAnalyzing(true);
    setAnalysisResult(null);
    setVideoJobId(null);
    setVideoJobStatus(null);
    setVideoJobPollCount(0);

    try {
      // Generate SAS URL first
      const sasResponse = await apiRequest(
        "GET", 
        `/api/content-understanding/generate-sas?organizationId=${selectedOrganizationId}&path=${encodeURIComponent(selectedFile.path)}`
      );

      const sasData = await sasResponse.json();
      console.log("[CU-DEBUG] sasData response:", JSON.stringify(sasData));
      if (!sasData.success) {
        throw new Error(sasData.error || "Failed to generate SAS URL");
      }
      const sasUrl = sasData.url;

      if (needsAsyncAnalysis(selectedFile)) {
        const asyncContentType = getAsyncContentType(selectedFile);
        const label = asyncContentType.charAt(0).toUpperCase() + asyncContentType.slice(1);
        console.log(`${label} file detected - using async analysis pattern`);
        
        if (!sasData.storageAccount || !sasData.container) {
          console.error("[CU-DEBUG] Missing storage info from API response");
          throw new Error("Storage account or container information missing from API response");
        }

        const submitResponse = await apiRequest("POST", "/api/cu/jobs/submit", {
          sasUrl,
          foundryResourceName: selectedResource.resourceName,
          organizationId: selectedOrganizationId,
          sourceFilePath: selectedFile.path,
          storageAccountName: sasData.storageAccount,
          containerName: sasData.container,
          analyzerId: selectedAnalyzer,
          contentType: asyncContentType,
        });

        const submitResult = await submitResponse.json();
        
        if (!submitResult.success) {
          throw new Error(submitResult.error || `Failed to submit ${asyncContentType} for analysis`);
        }

        setVideoJobId(submitResult.jobId);
        setVideoJobStatus("submitted");
        
        toast({
          title: `${label} Analysis Started`,
          description: `Analyzing ${asyncContentType} in background. This may take several minutes.`,
        });

        pollCuJobStatus(submitResult.jobId, asyncContentType, 5000, 2880);
        return;
      }

      // Non-video files - use sync analysis
      const analyzeResponse = await apiRequest("POST", "/api/content-understanding/analyze", {
        sasUrl,
        foundryResourceName: selectedResource.resourceName,
        organizationId: selectedOrganizationId,
        analyzerId: selectedAnalyzer,
      });

      const result = await analyzeResponse.json();
      console.log("[CU-DEBUG] Sync analysis response:", result);
      setAnalysisResult(result);
      setIsAnalyzing(false);

      if (result.success) {
        toast({
          title: "Analysis Complete",
          description: "File has been analyzed successfully",
        });
      } else {
        toast({
          title: "Analysis Failed",
          description: result.error || "Failed to analyze file",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Analysis error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to analyze file",
        variant: "destructive",
      });
      setAnalysisResult({ success: false, error: error.message });
      // Reset all state on error - including for video files
      setIsAnalyzing(false);
      setVideoJobId(null);
      setVideoJobStatus(null);
      setVideoJobPollCount(0);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const parts = timestamp.split(/[:\.]/).map(Number);
    const hours = parts[0] || 0;
    const minutes = parts[1] || 0;
    const seconds = parts[2] || 0;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const cleanupMarkdownContent = (markdown: string): string => {
    return markdown
      .replace(/<!--\s*PageHeader:.*?-->/gi, '')
      .replace(/<!--\s*PageNumber:.*?-->/gi, '')
      .replace(/<!--\s*PageFooter:.*?-->/gi, '')
      .replace(/!\[.*?\]\(figures\/\d+\.\d+\)/g, '')
      .replace(/!\[image\]\(pages\/\d+\)/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const renderFieldValue = (key: string, value: any): JSX.Element => {
    if (value?.valueString) {
      return <span className="text-sm">{value.valueString}</span>;
    }
    if (value?.valueNumber !== undefined) {
      return <span className="text-sm">{value.valueNumber}</span>;
    }
    if (value?.type === "array" && Array.isArray(value?.valueArray)) {
      const items = value.valueArray;
      if (items.length === 0) {
        return <span className="text-sm text-muted-foreground">None</span>;
      }
      const first = items[0];
      if (first?.type === "string") {
        return (
          <div className="flex flex-wrap gap-1.5">
            {items.map((item: any, i: number) => (
              <Badge key={i} variant="secondary">{item.valueString}</Badge>
            ))}
          </div>
        );
      }
      if (first?.type === "object" && first?.valueObject) {
        return (
          <div className="space-y-2">
            {items.map((item: any, i: number) => {
              const obj = item.valueObject;
              if (!obj) return null;
              return (
                <div key={i} className="flex items-center gap-2 flex-wrap">
                  {Object.entries(obj).map(([k, v]: [string, any]) => (
                    <span key={k} className="text-sm">
                      <span className="font-medium text-muted-foreground">{k}:</span>{" "}
                      {v?.valueString || v?.valueNumber || String(v || "")}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        );
      }
      return (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item: any, i: number) => (
            <Badge key={i} variant="secondary">{item.valueString || JSON.stringify(item)}</Badge>
          ))}
        </div>
      );
    }
    if (typeof value === "string") {
      return <span className="text-sm">{value}</span>;
    }
    if (typeof value === "number") {
      return <span className="text-sm">{value}</span>;
    }
    if (value && typeof value === "object") {
      if (value.valueObject) {
        return (
          <div className="flex items-center gap-2 flex-wrap">
            {Object.entries(value.valueObject).map(([k, v]: [string, any]) => (
              <span key={k} className="text-sm">
                <span className="font-medium text-muted-foreground">{k}:</span>{" "}
                {v?.valueString || v?.valueNumber || String(v || "")}
              </span>
            ))}
          </div>
        );
      }
      return <pre className="text-xs bg-muted p-2 rounded overflow-auto">{JSON.stringify(value, null, 2)}</pre>;
    }
    return <span className="text-sm">{String(value)}</span>;
  };

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between gap-4 p-4 border-b">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Scan className="h-6 w-6" />
              Content Understanding
            </h1>
            <p className="text-sm text-muted-foreground">
              Analyze files using Azure AI Content Understanding
            </p>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
          <Lock className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">You do not have permission to access Content Understanding.</p>
        </div>
      </div>
    );
  }

  const hasFile = !!selectedFile;
  const hasAnalysis = !!analysisResult;
  const showSplitView = hasFile;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 p-4 border-b sticky top-0 bg-background z-50">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Scan className="h-6 w-6" />
            Content Understanding
          </h1>
          <p className="text-sm text-muted-foreground">
            Analyze documents, images, audio, and video using Azure AI
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasFile && (
            <>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="h-9 px-3 flex gap-2 items-center">
                  {selectedModality === "Audio" && <Music className="h-3.5 w-3.5" />}
                  {selectedModality === "Video" && <Video className="h-3.5 w-3.5" />}
                  {selectedModality === "Image" && <Image className="h-3.5 w-3.5" />}
                  {selectedModality === "Document" && <FileText className="h-3.5 w-3.5" />}
                  <span className="font-medium">{selectedModality}</span>
                </Badge>
              </div>
              <div className="w-48">
                <Select
                  value={selectedCategory}
                  onValueChange={(val) => {
                    setSelectedCategory(val);
                    setSelectedAnalyzer(MODALITY_MAPPING[selectedModality][val][0]);
                  }}
                >
                  <SelectTrigger data-testid="select-analyzer-category">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(MODALITY_MAPPING[selectedModality]).map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-56">
                <Select
                  value={selectedAnalyzer}
                  onValueChange={setSelectedAnalyzer}
                >
                  <SelectTrigger data-testid="select-analyzer-id">
                    <SelectValue placeholder="Analyzer" />
                  </SelectTrigger>
                  <SelectContent>
                    {MODALITY_MAPPING[selectedModality][selectedCategory]?.map((analyzer: string) => (
                      <SelectItem key={analyzer} value={analyzer}>{analyzer}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div className="w-64">
            <Select
              value={selectedResourceId?.toString() || ""}
              onValueChange={(val) => setSelectedResourceId(parseInt(val))}
              disabled={resourcesLoading}
            >
              <SelectTrigger data-testid="select-foundry-resource">
                <SelectValue placeholder="Select Foundry resource..." />
              </SelectTrigger>
              <SelectContent>
                {cuEnabledResources.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">
                    No resources available
                  </div>
                ) : (
                  cuEnabledResources.map((resource) => (
                    <SelectItem key={resource.id} value={resource.id.toString()}>
                      {resource.resourceName}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={() => setIsFileSelectorOpen(true)}
            data-testid="button-select-file"
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            Files / Folders
          </Button>
          <Button
            className="flex-1"
            disabled={!selectedFile || !selectedResource || isAnalyzing || !canRunAnalysis}
            onClick={analyzeFile}
            data-testid="button-analyze"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Scan className="h-4 w-4 mr-2" />
                Analyze
              </>
            )}
          </Button>
        </div>
      </div>

      {!showSplitView ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <FolderOpen className="h-16 w-16 mb-4 opacity-50" />
          <h2 className="text-xl font-medium mb-2">No File Selected</h2>
          <p className="text-sm mb-4">Click "Files / Folders" to select a file for analysis</p>
          <Button variant="outline" onClick={() => setIsFileSelectorOpen(true)}>
            <FolderOpen className="h-4 w-4 mr-2" />
            Select File
          </Button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden">
          <div ref={splitContainerRef} className="flex flex-row h-full">
            <div className="flex flex-col h-full min-h-0 flex-shrink-0 overflow-hidden" style={{ width: `${leftPanelPct}%` }}>
              <div className="flex items-center gap-2 p-3 border-b bg-muted/30 flex-shrink-0">
                {selectedFile && getFileIcon(selectedFile)}
                <span className="font-medium truncate">{selectedFile?.name}</span>
                <Badge variant="secondary" className="ml-auto">Preview</Badge>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                {fileUrl ? (
                  <FilePreviewEmbed
                    fileUrl={fileUrl}
                    fileName={selectedFile?.name || ""}
                    fileExtension={getFileExtension(selectedFile!)}
                    onTimeUpdate={setMediaCurrentTime}
                    className="h-full"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                )}
              </div>
            </div>

            <div
              onMouseDown={onDividerMouseDown}
              className="flex-shrink-0 w-[5px] cursor-col-resize bg-border hover:bg-primary/40 active:bg-primary/60 transition-colors relative group z-10"
              title="Drag to resize"
            >
              <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-primary/10" />
            </div>

            <div className="flex flex-col h-full min-h-0 overflow-hidden flex-1">
              <div className="flex items-center gap-2 p-3 border-b bg-muted/30 flex-wrap flex-shrink-0">
                <Brain className="h-4 w-4" />
                <span className="font-medium">Analysis Results</span>
                {analysisResult?.success && (
                  <Badge variant="default" className="bg-green-600">Complete</Badge>
                )}
                {analysisResult && !analysisResult.success && (
                  <Badge variant="destructive">Failed</Badge>
                )}
                {!analysisResult && !isAnalyzing && (
                  <Badge variant="secondary">Pending</Badge>
                )}
                {isAnalyzing && (
                  <Badge variant="secondary">
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    {videoJobId ? `Processing (${videoJobPollCount * 5}s)` : "Analyzing"}
                  </Badge>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  {savedResults.length > 0 && (
                    <DropdownMenu open={savedResultsDropdownOpen} onOpenChange={setSavedResultsDropdownOpen}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" data-testid="button-saved-results">
                          <History className="h-4 w-4 mr-2" />
                          {isLoadingSavedResult ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            `${savedResults.length} saved`
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64">
                        {savedResults.map((result) => {
                          const savedDate = result.createdAt ? new Date(result.createdAt) : null;
                          const hasValidDate = savedDate && !isNaN(savedDate.getTime());
                          const formattedDate = hasValidDate
                            ? savedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                            : '';
                          const formattedTime = hasValidDate
                            ? savedDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                            : '';
                          const isAutoSaved = result.metadata?.analyzedby === 'system-background-worker';
                          const saveType = isAutoSaved ? 'Auto-saved' : 'Saved';
                          const primaryLabel = hasValidDate
                            ? `${saveType} - ${formattedDate}`
                            : `${saveType} #${result.resultNumber}`;
                          return (
                          <div key={result.blobPath}>
                            <DropdownMenuItem
                              className="flex items-center justify-between cursor-pointer"
                              onSelect={(e) => {
                                e.preventDefault();
                              }}
                            >
                              <span
                                className="flex-1 cursor-pointer"
                                onClick={() => {
                                  setSavedResultsDropdownOpen(false);
                                  loadSavedResult(result.blobPath);
                                }}
                                data-testid={`button-load-result-${result.resultNumber}`}
                              >
                                <span className="block text-sm">{primaryLabel}</span>
                                {formattedTime && <span className="block text-xs text-muted-foreground">{formattedTime}</span>}
                              </span>
                              {canDeleteAnalysis && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 ml-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteSavedResult(result.blobPath);
                                  }}
                                  data-testid={`button-delete-result-${result.resultNumber}`}
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              )}
                            </DropdownMenuItem>
                          </div>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {analysisResult?.success && canSaveAnalysis && !analysisResult?.result?.autoSaved && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={saveAnalysisResult}
                      disabled={isSaving || (maxResultsPerFile > 0 && savedResults.length >= maxResultsPerFile)}
                      data-testid="button-save-result"
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-1" />
                          Save
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {!analysisResult && !isAnalyzing ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-4">
                  <Scan className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-center">Click "Analyze" to process this file</p>
                </div>
              ) : isAnalyzing ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                  {videoJobId ? (
                    <>
                      <p className="text-muted-foreground">Analyzing file in background...</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Status: <span className="font-medium">{videoJobStatus || "Processing"}</span>
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Time elapsed: ~{Math.floor(videoJobPollCount * 5 / 60)} min {(videoJobPollCount * 5) % 60} sec
                      </p>
                      <p className="text-xs text-muted-foreground mt-3">
                        Large files may take several minutes. You can leave this page and check back later.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-muted-foreground">Analyzing file...</p>
                      <p className="text-sm text-muted-foreground mt-2">This may take a moment</p>
                    </>
                  )}
                </div>
              ) : !analysisResult?.success ? (
                <div className="flex-1 flex flex-col items-center justify-center p-4">
                  <XCircle className="h-12 w-12 text-destructive mb-4" />
                  <p className="font-medium">Analysis Failed</p>
                  <p className="text-sm text-muted-foreground text-center mt-2">{analysisResult?.error}</p>
                </div>
              ) : analysisResult?.result?.autoSaved && !analysisResult?.result?.contents && !analysisResult?.result?.tables && !analysisResult?.result?.entities && !analysisResult?.result?.keyPhrases && !analysisResult?.result?.summary ? (
                <div className="flex-1 flex flex-col items-center justify-center p-4">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                  <p className="font-medium">Analysis Complete</p>
                  <p className="text-sm text-muted-foreground text-center mt-2">
                    Results have been auto-saved successfully.
                  </p>
                  <p className="text-sm text-muted-foreground text-center mt-1">
                    View saved results from the file's Content Understanding results list.
                  </p>
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                  <Tabs value={resultTab} onValueChange={setResultTab} className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    <TabsList className={`grid w-full flex-shrink-0 m-2 ${isTranscript ? "grid-cols-3" : "grid-cols-2"}`}>
                      <TabsTrigger value="fields" data-testid="tab-fields">
                        <ListChecks className="h-4 w-4 mr-2" />
                        Fields
                      </TabsTrigger>
                      <TabsTrigger value="result" data-testid="tab-result">
                        <FileText className="h-4 w-4 mr-2" />
                        Result
                      </TabsTrigger>
                      {isTranscript && (
                        <TabsTrigger value="postcall" data-testid="tab-postcall" className="relative">
                          <PhoneCall className="h-4 w-4 mr-2" />
                          Post-Call
                          {postCallData && (
                            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500" />
                          )}
                        </TabsTrigger>
                      )}
                    </TabsList>
                    
                    <TabsContent value="fields" className="flex-1 min-h-0 overflow-hidden m-0 px-2">
                      <ScrollArea className="h-full w-full">
                        <div className="space-y-2 pb-4">
                          <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
                            <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 rounded-md hover-elevate bg-muted/50">
                              {summaryOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              <Brain className="h-4 w-4 text-primary" />
                              <span className="font-medium">Summary</span>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="p-3 pt-2">
                              {analysisResult.result?.summary ? (
                                <p className="text-sm">{analysisResult.result.summary}</p>
                              ) : analysisResult.result?.contents?.[0]?.fields?.Summary?.valueString ? (
                                <p className="text-sm">{analysisResult.result.contents[0].fields.Summary.valueString}</p>
                              ) : (
                                <p className="text-sm text-muted-foreground">No summary available</p>
                              )}
                            </CollapsibleContent>
                          </Collapsible>

                          <Collapsible open={entitiesOpen} onOpenChange={setEntitiesOpen}>
                            <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 rounded-md hover-elevate bg-muted/50">
                              {entitiesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              <Hash className="h-4 w-4 text-blue-500" />
                              <span className="font-medium">Entities / Fields</span>
                              {analysisResult.result?.entities && (
                                <Badge variant="secondary" className="ml-auto">{analysisResult.result.entities.length}</Badge>
                              )}
                            </CollapsibleTrigger>
                            <CollapsibleContent className="p-3 pt-2">
                              {analysisResult.result?.entities && analysisResult.result.entities.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {analysisResult.result.entities.map((entity, idx) => (
                                    <Badge key={idx} variant="outline">
                                      {entity.name}
                                      {entity.type && <span className="ml-1 text-muted-foreground">({entity.type})</span>}
                                    </Badge>
                                  ))}
                                </div>
                              ) : analysisResult.result?.contents?.[0]?.fields ? (
                                <div className="space-y-3">
                                  {Object.entries(analysisResult.result.contents[0].fields)
                                    .filter(([key]) => key !== 'Summary')
                                    .map(([key, value]: [string, any]) => (
                                      <div key={key} className="space-y-1">
                                        <span className="text-sm font-medium text-muted-foreground">{key}:</span>
                                        <div className="ml-1">{renderFieldValue(key, value)}</div>
                                      </div>
                                    ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">No entities or fields extracted</p>
                              )}
                            </CollapsibleContent>
                          </Collapsible>

                          <Collapsible open={topicsOpen} onOpenChange={setTopicsOpen}>
                            <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 rounded-md hover-elevate bg-muted/50">
                              {topicsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              <Tags className="h-4 w-4 text-green-500" />
                              <span className="font-medium">Topics / Sentiment</span>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="p-3 pt-2">
                              {analysisResult.result?.topics && analysisResult.result.topics.length > 0 ? (
                                <div className="space-y-3">
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Topics</Label>
                                    <div className="flex flex-wrap gap-2 mt-1">
                                      {analysisResult.result.topics.map((topic, idx) => (
                                        <Badge key={idx} variant="secondary">{topic}</Badge>
                                      ))}
                                    </div>
                                  </div>
                                  {analysisResult.result.sentiment && (
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Sentiment</Label>
                                      <div className="flex items-center gap-2 mt-1">
                                        <Badge variant={
                                          analysisResult.result.sentiment.overall === 'positive' ? 'default' :
                                          analysisResult.result.sentiment.overall === 'negative' ? 'destructive' :
                                          'secondary'
                                        }>
                                          {analysisResult.result.sentiment.overall || 'Neutral'}
                                        </Badge>
                                        {analysisResult.result.sentiment.score !== undefined && (
                                          <span className="text-sm text-muted-foreground">
                                            Score: {(analysisResult.result.sentiment.score * 100).toFixed(0)}%
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : analysisResult.result?.keyPhrases && analysisResult.result.keyPhrases.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {analysisResult.result.keyPhrases.map((phrase, idx) => (
                                    <Badge key={idx} variant="outline">{phrase}</Badge>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">No topics or sentiment data</p>
                              )}
                            </CollapsibleContent>
                          </Collapsible>

                          <Collapsible open={inconsistenciesOpen} onOpenChange={setInconsistenciesOpen}>
                            <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 rounded-md hover-elevate bg-muted/50">
                              {inconsistenciesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              <AlertTriangle className="h-4 w-4 text-yellow-500" />
                              <span className="font-medium">Inconsistencies</span>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="p-3 pt-2">
                              <p className="text-sm text-muted-foreground">No inconsistencies detected</p>
                            </CollapsibleContent>
                          </Collapsible>

                          <Collapsible open={customOpen} onOpenChange={setCustomOpen}>
                            <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 rounded-md hover-elevate bg-muted/50">
                              {customOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              <MessageSquare className="h-4 w-4 text-purple-500" />
                              <span className="font-medium">Custom Analyzer Output</span>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="p-3 pt-2">
                              {analysisResult.result?.analyzerId ? (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-muted-foreground">Analyzer:</span>
                                    <Badge variant="outline">{analysisResult.result.analyzerId}</Badge>
                                  </div>
                                  {analysisResult.result?.metadata && Object.keys(analysisResult.result.metadata).length > 0 && (
                                    <div className="mt-2">
                                      <Label className="text-xs text-muted-foreground">Metadata</Label>
                                      <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto">
                                        {JSON.stringify(analysisResult.result.metadata, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">No custom analyzer output</p>
                              )}
                            </CollapsibleContent>
                          </Collapsible>
                        </div>
                      </ScrollArea>
                    </TabsContent>
                    
                    <TabsContent value="result" className="flex-1 min-h-0 overflow-hidden m-0 px-2">
                      <ScrollArea className="h-full w-full">
                        <div className="space-y-4 pb-4">
                          {analysisResult.result?.contents?.map((content: any, index: number) => (
                            <div key={index} className="p-3 bg-muted/50 rounded-md">
                              {content.startTime && content.endTime && (
                                <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                                  <Badge variant="outline">
                                    {formatTimestamp(content.startTime)} - {formatTimestamp(content.endTime)}
                                  </Badge>
                                  {content.kind && <Badge variant="secondary">{content.kind}</Badge>}
                                </div>
                              )}
                              {content.markdown ? (
                                <MarkdownMessage 
                                  content={cleanupMarkdownContent(content.markdown)} 
                                  className="text-sm"
                                />
                              ) : content.text ? (
                                <p className="text-sm">{content.text}</p>
                              ) : content.fields?.Summary?.valueString ? (
                                <p className="text-sm">{content.fields.Summary.valueString}</p>
                              ) : (
                                <p className="text-sm text-muted-foreground">No content available</p>
                              )}
                            </div>
                          )) || (
                            <p className="text-muted-foreground text-center py-8">No content extracted</p>
                          )}

                          {analysisResult.result?.tables && analysisResult.result.tables.length > 0 && (
                            <div>
                              <Label className="text-sm font-medium mb-2 block">Extracted Tables</Label>
                              {analysisResult.result.tables.map((table, tableIndex) => (
                                <div key={tableIndex} className="mb-4 overflow-x-auto">
                                  <table className="w-full text-sm border-collapse border border-border">
                                    {table.headers && (
                                      <thead>
                                        <tr className="bg-muted">
                                          {table.headers.map((header, idx) => (
                                            <th key={idx} className="border border-border px-3 py-2 text-left font-medium">
                                              {header}
                                            </th>
                                          ))}
                                        </tr>
                                      </thead>
                                    )}
                                    <tbody>
                                      {table.rows?.map((row, rowIdx) => (
                                        <tr key={rowIdx}>
                                          {row.map((cell, cellIdx) => (
                                            <td key={cellIdx} className="border border-border px-3 py-2">
                                              {cell}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </TabsContent>

                    {isTranscript && (
                      <TabsContent value="postcall" className="flex-1 min-h-0 overflow-hidden m-0">
                        {isLoadingPostCall && (
                          <div className="flex flex-col items-center justify-center h-full gap-4">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="text-xs text-muted-foreground">Loading saved analysis…</p>
                          </div>
                        )}
                        {!postCallData && !isRunningPostCall && !isLoadingPostCall && (
                          <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
                            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                              <PhoneCall className="h-8 w-8 text-primary" />
                            </div>
                            <div>
                              <h3 className="text-sm font-semibold mb-1">Post-Call Intelligence Analysis</h3>
                              <p className="text-xs text-muted-foreground max-w-xs">
                                Send this transcript to your configured AI agent for deep conversational analysis — covering risk signals, agent performance, customer sentiment, QA scoring, and recommendations.
                              </p>
                            </div>
                            {postCallError && (
                              <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2 max-w-xs">
                                {postCallError}
                              </div>
                            )}
                            <Button
                              onClick={runPostCallAnalysis}
                              disabled={isRunningPostCall}
                              data-testid="button-run-postcall-analysis"
                            >
                              <Sparkles className="h-4 w-4 mr-2" />
                              Run Post-Call Analysis
                            </Button>
                            <p className="text-[10px] text-muted-foreground">Requires a Foundry AI agent configured for this organization</p>
                          </div>
                        )}
                        {isRunningPostCall && (
                          <div className="flex flex-col items-center justify-center h-full gap-4">
                            <Loader2 className="h-10 w-10 animate-spin text-primary" />
                            <div className="text-center">
                              <p className="text-sm font-medium">Analyzing call transcript…</p>
                              <p className="text-xs text-muted-foreground mt-1">The AI agent is processing the full conversation. This may take up to 2 minutes.</p>
                            </div>
                          </div>
                        )}
                        {postCallData && !isRunningPostCall && !isLoadingPostCall && (
                          <div className="flex flex-col h-full min-h-0">
                            <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/20 flex-shrink-0">
                              <Brain className="h-3.5 w-3.5 text-primary" />
                              {postCallSavedAt ? (
                                <>
                                  <span className="text-xs font-medium text-muted-foreground">Cached Result</span>
                                  <span className="text-[10px] text-muted-foreground/70">
                                    saved {new Date(postCallSavedAt).toLocaleString()}
                                  </span>
                                </>
                              ) : (
                                <span className="text-xs font-medium text-muted-foreground">AI Analysis Complete</span>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="ml-auto h-6 text-xs gap-1"
                                onClick={() => downloadPostCallPDF(postCallData, selectedFile?.name)}
                                data-testid="button-download-postcall-pdf"
                              >
                                <Download className="h-3 w-3" />
                                Download PDF
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() => { setPostCallData(null); setPostCallSavedAt(null); setPostCallError(null); }}
                                data-testid="button-reset-postcall"
                              >
                                Re-run
                              </Button>
                            </div>
                            <div className="flex-1 min-h-0 overflow-hidden">
                              <PostCallAnalysis data={postCallData} fileName={selectedFile?.name} />
                            </div>
                          </div>
                        )}
                      </TabsContent>
                    )}
                  </Tabs>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <FileSelectorModal
        isOpen={isFileSelectorOpen}
        onClose={() => setIsFileSelectorOpen(false)}
        onSelect={handleFileSelect}
      />
    </div>
  );
}
