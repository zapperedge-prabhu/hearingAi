import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRolePermissions } from "@/hooks/use-role-permissions";
import { useAuth } from "@/hooks/use-auth";
import { useRole } from "@/contexts/role-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import FileSelectorModal from "@/components/file-selector-modal";
import FilePreviewEmbed from "@/components/file-preview-embed";
import { buildFileApiUrl } from "@/lib/api";
import {
  ClipboardCheck, FileText, Loader2, CheckCircle2, XCircle, AlertTriangle,
  FolderOpen, Lock, Play, Eye, Edit3, CheckSquare, RefreshCw, History,
  BookOpen, ClipboardList, ExternalLink, Download, X, Folder, ChevronRight,
  ArrowLeft, Users, ArrowRight, CheckCheck, Sparkles, GraduationCap,
  BarChart3, Clock, AlertCircle, ChevronDown, ChevronUp, Search, Circle,
  TrendingUp, TrendingDown, Lightbulb, ShieldAlert, ListChecks, Star,
  Target, BookMarked, RotateCcw,
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

interface EvalJob {
  id: number;
  jobId: string;
  batchId?: string;
  organizationId: number;
  foundryResourceId: number;
  foundryResourceName?: string;
  answerSheetPath: string;
  questionPaperPath?: string;
  questionPaperText?: string;
  standardAnswerPath?: string;
  standardAnswerText?: string;
  status: string;
  reviewStatus?: string;
  progress?: number;
  error?: string | null;
  createdAt: string;
  startedAt?: string;
  updatedAt?: string;
  completedAt?: string;
  reviewedAt?: string;
  reviewedByUserId?: number;
  reviewedQuestions?: Record<string, boolean>;
  mergedResult?: any;
  resultJson?: any;
  reviewedResultJson?: any;
}

interface EvalBatch {
  batchId: string;
  jobs: EvalJob[];
  createdAt: string;
  questionPaperPath?: string;
  questionPaperText?: string;
}

function extractStudentName(path: string | undefined | null): string {
  if (!path) return "Unknown Student";
  const filename = path.split("/").pop() || path;
  const noExt = filename.replace(/\.[^/.]+$/, "");
  const parts = noExt.split(/[_\-\s]+/);
  const nameParts = parts.filter(
    (p) =>
      p && p.length > 2 &&
      !/^\d+$/.test(p) &&
      !["sheet", "exam", "answer", "ans"].includes(p.toLowerCase())
  );
  if (nameParts.length >= 2) {
    return nameParts.slice(0, 3).map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
  }
  return noExt || "Unknown Student";
}

function getJobScore(job: EvalJob): { awarded: number; max: number; pct: number } | null {
  const result = job.reviewedResultJson || job.resultJson;
  if (!result || result.blobPath) return null;
  const questions = result.questions || [];
  // Always recompute from individual questions — AI-provided totals can be arithmetically wrong
  const awarded = questions.reduce((a: number, q: any) => a + (Number(q.marksAwarded) || 0), 0);
  const max = questions.reduce((a: number, q: any) => a + (Number(q.maxMarks) || 0), 0);
  const pct = max > 0 ? (awarded / max) * 100 : 0;
  return { awarded, max, pct };
}

const EVAL_SUPPORTED_EXTENSIONS = ["pdf","docx","doc","xlsx","xls","pptx","ppt","txt","rtf","png","jpg","jpeg","gif","bmp","tiff","webp"];
const isFolder = (file: FileItem) => file.type === "folder" || file.type === "directory";

function getFileExtension(file: FileItem): string {
  if (file.extension) return file.extension.replace(/^\./, "").toLowerCase();
  const parts = file.name.split(".");
  if (parts.length > 1) return parts[parts.length - 1].toLowerCase();
  return "";
}

function isEvalSupported(file: FileItem): boolean {
  if (isFolder(file)) return true;
  const ext = getFileExtension(file);
  return ext ? EVAL_SUPPORTED_EXTENSIONS.includes(ext) : false;
}

function ScorePill({ awarded, max, pct }: { awarded: number; max: number; pct: number }) {
  const color = pct >= 75 ? "text-green-700 bg-green-50 dark:text-green-300 dark:bg-green-900/30"
    : pct >= 50 ? "text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/30"
    : "text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-900/30";
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>
        {pct.toFixed(0)}%
      </span>
      <span className="text-xs text-muted-foreground">{awarded}/{max}</span>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: any }> = {
    queued: { label: "Queued", cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300", icon: Clock },
    running: { label: "Grading…", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300", icon: Loader2 },
    completed: { label: "Done", cls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300", icon: CheckCircle2 },
    failed: { label: "Failed", cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300", icon: XCircle },
  };
  const cfg = map[status] || { label: status, cls: "bg-muted text-muted-foreground", icon: AlertCircle };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.cls}`}>
      <Icon className={`h-3 w-3 ${status === "running" ? "animate-spin" : ""}`} />
      {cfg.label}
    </span>
  );
}

function ReviewChip({ reviewStatus }: { reviewStatus?: string }) {
  if (!reviewStatus || reviewStatus === "not_started") {
    return <span className="text-xs text-muted-foreground">Not reviewed</span>;
  }
  if (reviewStatus === "finalized") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
        <CheckCheck className="h-3 w-3" /> Finalized
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
      <Edit3 className="h-3 w-3" /> In Review
    </span>
  );
}

export default function Eval() {
  const { data: rolePermissions, isLoading: permissionsLoading } = useRolePermissions();
  const { user, isAuthenticated } = useAuth();
  const { selectedOrganizationId } = useRole();
  const { toast } = useToast();

  const canView = rolePermissions?.eval?.view ?? false;
  const canRun = rolePermissions?.eval?.run ?? false;
  const canReview = rolePermissions?.eval?.review ?? false;
  const canFinalize = rolePermissions?.eval?.finalize ?? false;
  const canAccess = canView || canRun || canReview || canFinalize;

  const [activeTab, setActiveTab] = useState<"setup" | "results">(canRun ? "setup" : "results");

  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(null);
  const [questionPaperFile, setQuestionPaperFile] = useState<FileItem | null>(null);
  const [questionPaperText, setQuestionPaperText] = useState("");
  const [standardAnswerFile, setStandardAnswerFile] = useState<FileItem | null>(null);
  const [standardAnswerText, setStandardAnswerText] = useState("");
  const [isFileSelectorOpen, setIsFileSelectorOpen] = useState(false);
  const [fileSelectorTarget, setFileSelectorTarget] = useState<"question" | "standard">("question");
  const [answerSheetBrowserPath, setAnswerSheetBrowserPath] = useState("");
  const [selectedAnswerSheets, setSelectedAnswerSheets] = useState<Set<string>>(new Set());
  const [isStarting, setIsStarting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [reviewJobId, setReviewJobId] = useState<string | null>(null);
  const [overrideMarks, setOverrideMarks] = useState<Record<string, string>>({});
  const [overrideComments, setOverrideComments] = useState<Record<string, string>>({});
  const [overrideStatuses, setOverrideStatuses] = useState<Record<string, string>>({});
  const [savingQuestion, setSavingQuestion] = useState<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isBulkAccepting, setIsBulkAccepting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [docPreviewUrls, setDocPreviewUrls] = useState<{ answerSheet?: string; questionPaper?: string }>({});
  const [docPreviewLoading, setDocPreviewLoading] = useState<{ answerSheet?: boolean; questionPaper?: boolean }>({});
  const [activeDocTab, setActiveDocTab] = useState<"answer" | "question">("answer");
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());

  // Per-question review tracking
  const [questionFilter, setQuestionFilter] = useState<"all" | "pending" | "reviewed">("all");
  const [selectedQs, setSelectedQs] = useState<Set<string>>(new Set());
  const [qReviewed, setQReviewed] = useState<Record<string, boolean>>({});
  const [savingReview, setSavingReview] = useState(false);

  // Batch SWOT Analysis
  const [swotOpen, setSwotOpen] = useState(false);
  const [swotBatchId, setSwotBatchId] = useState<string | null>(null);
  const [swotAnalysis, setSwotAnalysis] = useState<any | null>(null);
  const [swotLoading, setSwotLoading] = useState(false);
  const [swotGenerating, setSwotGenerating] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const swotPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Draggable review pane widths (as % of container, two dividers: AB between answer/question, BC between question/results)
  const [div1Pct, setDiv1Pct] = useState(33.33); // divider between answer sheet and question paper
  const [div2Pct, setDiv2Pct] = useState(66.67); // divider between question paper and results
  const reviewContainerRef = useRef<HTMLDivElement>(null);
  const reviewDragging = useRef<{ divider: "AB" | "BC"; startX: number; startD1: number; startD2: number } | null>(null);

  const startReviewDrag = useCallback((divider: "AB" | "BC") => (e: React.MouseEvent) => {
    e.preventDefault();
    reviewDragging.current = { divider, startX: e.clientX, startD1: div1Pct, startD2: div2Pct };
    const onMove = (ev: MouseEvent) => {
      if (!reviewDragging.current || !reviewContainerRef.current) return;
      const containerW = reviewContainerRef.current.offsetWidth;
      const dPct = ((ev.clientX - reviewDragging.current.startX) / containerW) * 100;
      if (reviewDragging.current.divider === "AB") {
        const newD1 = Math.max(10, Math.min(reviewDragging.current.startD1 + dPct, reviewDragging.current.startD2 - 10));
        setDiv1Pct(newD1);
      } else {
        const newD2 = Math.max(reviewDragging.current.startD1 + 10, Math.min(reviewDragging.current.startD2 + dPct, 90));
        setDiv2Pct(newD2);
      }
    };
    const onUp = () => {
      reviewDragging.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [div1Pct, div2Pct]);

  const { data: orgLinkedResources = [], isLoading: resourcesLoading } = useQuery<FoundryResourceData[]>({
    queryKey: ["/api/foundry/org-resources", selectedOrganizationId],
    queryFn: async () => {
      if (!selectedOrganizationId) return [];
      const res = await apiRequest("GET", `/api/foundry/org-resources?organizationId=${selectedOrganizationId}`);
      return await res.json();
    },
    enabled: !!selectedOrganizationId && canAccess,
  });

  const activeResources = useMemo(() => orgLinkedResources.filter((r) => r.status === "completed" || r.status === "active"), [orgLinkedResources]);

  useEffect(() => {
    if (activeResources.length > 0 && !selectedResourceId) {
      setSelectedResourceId(activeResources[0].id);
    }
  }, [activeResources, selectedResourceId]);

  const { data: answerSheetFiles = [], isLoading: answerFilesLoading, isFetching: answerFilesFetching } = useQuery<FileItem[]>({
    queryKey: ["/api/files", selectedOrganizationId, answerSheetBrowserPath],
    queryFn: async () => {
      if (!selectedOrganizationId) return [];
      const params = new URLSearchParams({ organizationId: String(selectedOrganizationId) });
      if (answerSheetBrowserPath) params.append("path", answerSheetBrowserPath);
      const res = await apiRequest("GET", `/api/files?${params.toString()}`);
      return await res.json();
    },
    enabled: !!selectedOrganizationId && isAuthenticated && canRun && activeTab === "setup",
    staleTime: 0,
  });

  const sortedAnswerFiles = useMemo(() => {
    return [...answerSheetFiles].sort((a, b) => {
      if (isFolder(a) && !isFolder(b)) return -1;
      if (!isFolder(a) && isFolder(b)) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [answerSheetFiles]);

  const selectableFiles = useMemo(() => sortedAnswerFiles.filter((f) => !isFolder(f) && isEvalSupported(f)), [sortedAnswerFiles]);

  const { data: evalJobs = [], isLoading: jobsLoading } = useQuery<EvalJob[]>({
    queryKey: ["/api/eval/jobs", selectedOrganizationId],
    queryFn: async () => {
      if (!selectedOrganizationId) return [];
      const res = await apiRequest("GET", `/api/eval/jobs?organizationId=${selectedOrganizationId}`);
      return await res.json();
    },
    enabled: !!selectedOrganizationId && canAccess,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.some((j: EvalJob) => j.status === "queued" || j.status === "running") ? 3000 : false;
    },
  });

  const filteredJobs = useMemo(() => {
    if (!searchQuery.trim()) return evalJobs;
    const q = searchQuery.toLowerCase();
    return evalJobs.filter((job) => {
      const name = extractStudentName(job.answerSheetPath).toLowerCase();
      const file = (job.answerSheetPath?.split("/").pop() || "").toLowerCase();
      return name.includes(q) || file.includes(q);
    });
  }, [evalJobs, searchQuery]);

  const groupedBatches = useMemo((): EvalBatch[] => {
    const map = new Map<string, EvalBatch>();
    for (const job of filteredJobs) {
      const key = job.batchId || job.jobId;
      if (!map.has(key)) {
        map.set(key, {
          batchId: key,
          jobs: [],
          createdAt: job.createdAt,
          questionPaperPath: job.questionPaperPath,
          questionPaperText: job.questionPaperText,
        });
      }
      map.get(key)!.jobs.push(job);
    }
    return Array.from(map.values());
  }, [filteredJobs]);

  const toggleBatch = (batchId: string) => {
    setExpandedBatches((prev) => {
      const n = new Set(prev);
      if (n.has(batchId)) n.delete(batchId);
      else n.add(batchId);
      return n;
    });
  };

  const { data: reviewJobData, isLoading: reviewJobLoading } = useQuery<EvalJob>({
    queryKey: ["/api/eval/job", reviewJobId, selectedOrganizationId],
    queryFn: async () => {
      if (!reviewJobId || !selectedOrganizationId) throw new Error("Missing params");
      const res = await apiRequest("GET", `/api/eval/job/${reviewJobId}?organizationId=${selectedOrganizationId}`);
      return await res.json();
    },
    enabled: !!reviewJobId && !!selectedOrganizationId,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "running" || data?.status === "queued" ? 3000 : false;
    },
  });

  const { data: reviewHistory = [] } = useQuery({
    queryKey: ["/api/eval/review-history", reviewJobId, selectedOrganizationId],
    queryFn: async () => {
      if (!reviewJobId || !selectedOrganizationId) return [];
      const res = await apiRequest("GET", `/api/eval/review-history/${reviewJobId}?organizationId=${selectedOrganizationId}`);
      return await res.json();
    },
    enabled: !!reviewJobId && !!selectedOrganizationId && showHistory,
  });

  const fetchPreviewUrl = useCallback(async (path: string, key: "answerSheet" | "questionPaper") => {
    if (!selectedOrganizationId || !path) return;
    setDocPreviewLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const token = sessionStorage.getItem("azure_token");
      const url = buildFileApiUrl("/api/files/preview", { organizationId: selectedOrganizationId, path });
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setDocPreviewUrls((prev) => ({ ...prev, [key]: data.url || data.previewUrl || data.sasUrl }));
      }
    } catch {}
    finally {
      setDocPreviewLoading((prev) => ({ ...prev, [key]: false }));
    }
  }, [selectedOrganizationId]);

  useEffect(() => {
    if (!reviewJobData || reviewJobData.status !== "completed") {
      setDocPreviewUrls({});
      return;
    }
    if (reviewJobData.answerSheetPath) fetchPreviewUrl(reviewJobData.answerSheetPath, "answerSheet");
    if (reviewJobData.questionPaperPath) fetchPreviewUrl(reviewJobData.questionPaperPath, "questionPaper");
  }, [reviewJobData?.jobId, reviewJobData?.status, fetchPreviewUrl]);

  useEffect(() => {
    const stored = (reviewJobData as any)?.reviewedQuestions as Record<string, boolean> | null;
    setQReviewed(stored || {});
    setSelectedQs(new Set());
    setQuestionFilter("all");
  }, [reviewJobData?.jobId]);

  const jobResults = useMemo(() => {
    const res = reviewJobData?.mergedResult as any;
    return res?.questions || [];
  }, [reviewJobData]);

  const { overallMarks, overallMaxMarks, overallPercentage, overallFeedback } = useMemo(() => {
    const res = reviewJobData?.mergedResult as any;
    const q = res?.questions || [];
    // Always recompute from individual questions — AI-provided totals can be arithmetically wrong
    const max = q.reduce((a: number, x: any) => a + (Number(x.maxMarks) || 0), 0);
    const awarded = q.reduce((a: number, x: any) => a + (Number(x.marksAwarded) || 0), 0);
    const pct = max > 0 ? (awarded / max) * 100 : 0;
    return { overallMarks: awarded, overallMaxMarks: max, overallPercentage: pct, overallFeedback: res?.overallFeedback };
  }, [reviewJobData]);

  const totalQuestions = jobResults.length;
  const reviewedCount = useMemo(() => jobResults.filter((r: any) => r.overridden).length, [jobResults]);

  const qReviewedCount = useMemo(
    () => jobResults.filter((q: any) => !!qReviewed[String(q.questionNumber || q.questionNum)]).length,
    [jobResults, qReviewed]
  );

  const filteredJobResults = useMemo(() => {
    if (questionFilter === "pending") return jobResults.filter((q: any) => !qReviewed[String(q.questionNumber || q.questionNum)]);
    if (questionFilter === "reviewed") return jobResults.filter((q: any) => !!qReviewed[String(q.questionNumber || q.questionNum)]);
    return jobResults;
  }, [jobResults, questionFilter, qReviewed]);

  const saveQuestionReview = useCallback(async (qNums: string[], reviewed: boolean) => {
    if (!reviewJobId || !selectedOrganizationId) return;
    setSavingReview(true);
    try {
      await apiRequest("PATCH", `/api/eval/job/${reviewJobId}/question-reviews`, {
        organizationId: selectedOrganizationId,
        questionNums: qNums,
        reviewed,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/eval/job", reviewJobId, selectedOrganizationId] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to save review status", variant: "destructive" });
    } finally {
      setSavingReview(false);
    }
  }, [reviewJobId, selectedOrganizationId, toast]);

  const toggleQuestionReview = useCallback((qKey: string) => {
    const newVal = !qReviewed[qKey];
    setQReviewed(prev => ({ ...prev, [qKey]: newVal }));
    saveQuestionReview([qKey], newVal);
  }, [qReviewed, saveQuestionReview]);

  const bulkMarkReview = useCallback((reviewed: boolean) => {
    const qNums = Array.from(selectedQs);
    setQReviewed(prev => {
      const next = { ...prev };
      qNums.forEach(q => { if (reviewed) next[q] = true; else delete next[q]; });
      return next;
    });
    saveQuestionReview(qNums, reviewed);
    setSelectedQs(new Set());
  }, [selectedQs, saveQuestionReview]);

  const openFileSelector = (target: "question" | "standard") => {
    setFileSelectorTarget(target);
    setIsFileSelectorOpen(true);
  };

  const handleFileSelect = (file: FileItem) => {
    if (fileSelectorTarget === "question") {
      setQuestionPaperFile(file);
      setQuestionPaperText("");
    } else {
      setStandardAnswerFile(file);
      setStandardAnswerText("");
    }
    setIsFileSelectorOpen(false);
  };

  const toggleAnswerSheet = (path: string) => {
    setSelectedAnswerSheets((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleSelectAll = () => {
    const allSelected = selectableFiles.every((f) => selectedAnswerSheets.has(f.path));
    setSelectedAnswerSheets((prev) => {
      const next = new Set(prev);
      if (allSelected) selectableFiles.forEach((f) => next.delete(f.path));
      else selectableFiles.forEach((f) => next.add(f.path));
      return next;
    });
  };

  const navigateToFolder = (folder: FileItem) => {
    setAnswerSheetBrowserPath(answerSheetBrowserPath ? `${answerSheetBrowserPath}/${folder.name}` : folder.name);
  };

  const goBackFolder = () => {
    const parts = answerSheetBrowserPath.split("/").filter(Boolean);
    parts.pop();
    setAnswerSheetBrowserPath(parts.join("/"));
  };

  const startBatchEvaluation = async () => {
    if (!selectedOrganizationId || !selectedResourceId || selectedAnswerSheets.size === 0) return;
    setIsStarting(true);
    try {
      const body: any = {
        organizationId: selectedOrganizationId,
        foundryResourceId: selectedResourceId,
        answerSheetPaths: Array.from(selectedAnswerSheets),
      };
      if (questionPaperFile) body.questionPaperPath = questionPaperFile.path;
      if (questionPaperText.trim()) body.questionPaperText = questionPaperText.trim();
      if (standardAnswerFile) body.standardAnswerPath = standardAnswerFile.path;
      if (standardAnswerText.trim()) body.standardAnswerText = standardAnswerText.trim();

      const res = await apiRequest("POST", "/api/eval/batch-start", body);
      const data = await res.json();
      toast({ title: "Evaluation Started", description: `${data.count} job${data.count > 1 ? "s" : ""} queued.` });
      queryClient.invalidateQueries({ queryKey: ["/api/eval/jobs", selectedOrganizationId] });
      setSelectedAnswerSheets(new Set());
      setActiveTab("results");
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to start evaluation", variant: "destructive" });
    } finally {
      setIsStarting(false);
    }
  };

  const saveOverride = async (qKey: string, questionNum: string | number, maxMarks?: number) => {
    if (!reviewJobId || !selectedOrganizationId) return;
    const newMarks = overrideMarks[qKey];
    if (newMarks === undefined || newMarks === "") return;
    if (maxMarks !== undefined) {
      const parsed = parseFloat(newMarks);
      if (!isNaN(parsed) && parsed > maxMarks) {
        toast({ title: "Invalid marks", description: `Cannot award more than ${maxMarks} marks for this question.`, variant: "destructive" });
        return;
      }
      if (!isNaN(parsed) && parsed < 0) {
        toast({ title: "Invalid marks", description: "Marks cannot be negative.", variant: "destructive" });
        return;
      }
    }
    setSavingQuestion(qKey);
    try {
      const body: any = {
        organizationId: selectedOrganizationId,
        questionNum,
        newMarksAwarded: parseFloat(newMarks),
      };
      const comment = overrideComments[qKey];
      if (comment?.trim()) body.comment = comment.trim();
      if (overrideStatuses[qKey]) body.newStatus = overrideStatuses[qKey];

      await apiRequest("PATCH", `/api/eval/review/${reviewJobId}`, body);
      toast({ title: "Saved", description: `Q${questionNum} marks updated.` });
      queryClient.invalidateQueries({ queryKey: ["/api/eval/job", reviewJobId, selectedOrganizationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/eval/jobs", selectedOrganizationId] });
      setOverrideMarks((prev) => { const n = { ...prev }; delete n[qKey]; return n; });
      setOverrideComments((prev) => { const n = { ...prev }; delete n[qKey]; return n; });
      setOverrideStatuses((prev) => { const n = { ...prev }; delete n[qKey]; return n; });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save", variant: "destructive" });
    } finally {
      setSavingQuestion(null);
    }
  };

  const bulkAcceptAll = async () => {
    if (!jobResults.length || !reviewJobId || !selectedOrganizationId) return;
    setIsBulkAccepting(true);
    try {
      for (const q of jobResults) {
        if (!q.overridden) {
          await apiRequest("PATCH", `/api/eval/review/${reviewJobId}`, {
            organizationId: selectedOrganizationId,
            questionNum: q.questionNumber || q.questionNum,
            newMarksAwarded: q.marksAwarded,
            comment: "Bulk accepted AI marks",
          });
        }
      }
      toast({ title: "All Accepted", description: "All AI marks have been accepted." });
      queryClient.invalidateQueries({ queryKey: ["/api/eval/job", reviewJobId, selectedOrganizationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/eval/jobs", selectedOrganizationId] });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed", variant: "destructive" });
    } finally {
      setIsBulkAccepting(false);
    }
  };

  const finalizeReview = async () => {
    if (!reviewJobId || !selectedOrganizationId) return;
    setIsFinalizing(true);
    try {
      await apiRequest("POST", `/api/eval/finalize/${reviewJobId}`, { organizationId: selectedOrganizationId });
      toast({ title: "Finalized", description: "Review has been finalized." });
      queryClient.invalidateQueries({ queryKey: ["/api/eval/job", reviewJobId, selectedOrganizationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/eval/jobs", selectedOrganizationId] });
      setReviewJobId(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed", variant: "destructive" });
    } finally {
      setIsFinalizing(false);
    }
  };

  const exportCsv = () => {
    if (!reviewJobData || !jobResults.length) return;
    const student = extractStudentName(reviewJobData.answerSheetPath);
    const rows = [
      ["Student", "Question", "Status", "Marks Awarded", "Max Marks", "Feedback"],
      ...jobResults.map((q: any) => [student, `Q${q.questionNumber || q.questionNum}`, q.status, q.marksAwarded ?? 0, q.maxMarks ?? 0, (q.feedback || "").replace(/,/g, ";")]),
      ["", "TOTAL", "", overallMarks, overallMaxMarks, `${Number(overallPercentage).toFixed(1)}%`],
    ];
    const csv = rows.map((r) => r.map(String).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eval_${student.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleQuestion = (key: string) => {
    setExpandedQuestions((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  if (permissionsLoading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4 text-muted-foreground">
        <Lock className="h-16 w-16 opacity-50" />
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p>You don't have permission to access Answer Sheet Evaluation.</p>
        </div>
      </div>
    );
  }

  const answerBrowserPathParts = answerSheetBrowserPath.split("/").filter(Boolean);

  const openSwotDialog = async (batchId: string) => {
    setSwotBatchId(batchId);
    setSwotAnalysis(null);
    setSwotOpen(true);
    setSwotLoading(true);
    setSwotGenerating(false);
    if (swotPollRef.current) clearInterval(swotPollRef.current);
    try {
      const res = await apiRequest("GET", `/api/eval/batch-analysis/${batchId}?organizationId=${selectedOrganizationId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === "generating") {
          setSwotGenerating(true);
          startSwotPolling(batchId);
        } else {
          setSwotAnalysis(data);
        }
      } else {
        setSwotAnalysis(null);
      }
    } catch { setSwotAnalysis(null); }
    finally { setSwotLoading(false); }
  };

  const startSwotPolling = (batchId: string) => {
    if (swotPollRef.current) clearInterval(swotPollRef.current);
    swotPollRef.current = setInterval(async () => {
      try {
        const res = await apiRequest("GET", `/api/eval/batch-analysis/${batchId}?organizationId=${selectedOrganizationId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status !== "generating") {
            clearInterval(swotPollRef.current!);
            setSwotGenerating(false);
            setSwotAnalysis(data);
          }
        }
      } catch { /* keep polling */ }
    }, 4000);
  };

  const downloadSwotAsPdf = async () => {
    if (!swotAnalysis?.analysisJson) return;
    setPdfDownloading(true);
    try {
    const { jsPDF } = await import("jspdf");
    const a = swotAnalysis.analysisJson as any;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = 210; const margin = 14; const contentW = W - margin * 2;
    let y = margin;

    const addPage = () => { doc.addPage(); y = margin; };
    const checkY = (needed: number) => { if (y + needed > 282) addPage(); };

    const rgb = (hex: string): [number, number, number] => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return [r, g, b];
    };

    // ── Header band ──────────────────────────────────────────────────────────
    doc.setFillColor(245, 243, 255);
    doc.rect(0, 0, W, 28, "F");
    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(55, 48, 163);
    doc.text("Batch Insight Analysis", margin, 11);
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(107, 114, 128);
    const batchInfo = `${swotAnalysis.completedCount} of ${swotAnalysis.batchSize} students  ·  Generated ${swotAnalysis.updatedAt ? new Date(swotAnalysis.updatedAt).toLocaleDateString(undefined, { dateStyle: "medium" }) : ""}`;
    doc.text(batchInfo, margin, 17);

    if (swotAnalysis.averageScore !== null && swotAnalysis.averageScore !== undefined) {
      doc.setFontSize(20); doc.setFont("helvetica", "bold"); doc.setTextColor(31, 41, 55);
      doc.text(`${swotAnalysis.averageScore}%`, W - margin, 11, { align: "right" });
      doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(107, 114, 128);
      doc.text("CLASS AVERAGE", W - margin, 16, { align: "right" });
    }

    const readinessLabel = a.readinessLevel === "ready" ? "Ready for Advanced Topics" : a.readinessLevel === "partial" ? "Needs Reinforcement" : "Not Ready";
    const readinessHex = a.readinessLevel === "ready" ? "#16a34a" : a.readinessLevel === "partial" ? "#d97706" : "#dc2626";
    doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...rgb(readinessHex));
    doc.text(readinessLabel, W - margin, 22, { align: "right" });
    y = 34;

    // ── Summary ──────────────────────────────────────────────────────────────
    if (a.overallSummary) {
      doc.setFillColor(249, 250, 251); doc.setDrawColor(139, 92, 246);
      doc.setLineWidth(0.8);
      const summLines = doc.setFontSize(9).splitTextToSize(a.overallSummary, contentW - 6);
      const summH = summLines.length * 4.2 + 6;
      doc.rect(margin, y, contentW, summH, "F");
      doc.line(margin, y, margin, y + summH);
      doc.setTextColor(55, 65, 81); doc.text(summLines, margin + 4, y + 4.5);
      y += summH + 5;
    }

    // ── SWOT sections helper ─────────────────────────────────────────────────
    const swotBlock = (title: string, items: any[], bgHex: string, borderHex: string, titleHex: string, x: number, blockW: number) => {
      const startY = y;
      const itemLines: string[][] = items.map(it => {
        const tl = doc.setFontSize(8).splitTextToSize(it.title || "", blockW - 8);
        const dl = doc.setFontSize(7.5).splitTextToSize(it.detail || "", blockW - 8);
        return [...tl, ...dl, it.avgScorePct !== undefined ? `${it.avgScorePct}% avg` : ""].filter(Boolean);
      });
      const contentH = 6 + itemLines.reduce((s, ls) => s + ls.length * 3.8 + 4, 0);
      doc.setFillColor(...rgb(bgHex)); doc.setDrawColor(...rgb(borderHex)); doc.setLineWidth(0.4);
      doc.roundedRect(x, y, blockW, contentH, 2, 2, "FD");
      doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...rgb(titleHex));
      doc.text(title, x + 4, y + 5.5);
      let iy = y + 10;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const tl = doc.setFontSize(8).setFont("helvetica", "bold").splitTextToSize(it.title || "", blockW - 8);
        doc.setTextColor(31, 41, 55); doc.text(tl, x + 4, iy); iy += tl.length * 3.6;
        const dl = doc.setFontSize(7.5).setFont("helvetica", "normal").splitTextToSize(it.detail || "", blockW - 8);
        doc.setTextColor(75, 85, 99); doc.text(dl, x + 4, iy); iy += dl.length * 3.5;
        if (it.avgScorePct !== undefined) {
          doc.setFontSize(7); doc.setTextColor(...rgb(titleHex));
          doc.text(`${it.avgScorePct}% avg`, x + 4, iy); iy += 4;
        }
        iy += 2;
      }
      return Math.max(contentH, iy - startY);
    };

    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(31, 41, 55);
    doc.text("SWOT Analysis", margin, y); y += 5;
    checkY(40);
    const half = (contentW - 3) / 2;
    const lh = swotBlock("▲  Strengths", a.strengths || [], "#f0fdf4", "#86efac", "#15803d", margin, half);
    const rh = swotBlock("▼  Weaknesses", a.weaknesses || [], "#fef2f2", "#fca5a5", "#b91c1c", margin + half + 3, half);
    y += Math.max(lh, rh) + 3;
    checkY(30);
    const lh2 = swotBlock("●  Opportunities", a.opportunities || [], "#eff6ff", "#93c5fd", "#1d4ed8", margin, half);
    const rh2 = swotBlock("⚠  Threats / Risks", a.threats || [], "#fffbeb", "#fcd34d", "#b45309", margin + half + 3, half);
    y += Math.max(lh2, rh2) + 6;

    // ── Question breakdown table ─────────────────────────────────────────────
    if (a.questionBreakdown?.length) {
      checkY(16);
      doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(31, 41, 55);
      doc.text("Question-by-Question Breakdown", margin, y); y += 4;
      const cols = [12, 40, 24, 24, contentW - 100];
      const headers = ["Q#", "Topic", "Avg Score", "Pass Rate", "Pattern"];
      doc.setFillColor(243, 244, 246); doc.rect(margin, y, contentW, 6, "F");
      doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(107, 114, 128);
      let cx = margin + 1.5;
      headers.forEach((h, i) => { doc.text(h, cx, y + 4.2); cx += cols[i]; });
      y += 6;
      a.questionBreakdown.forEach((q: any, idx: number) => {
        const patLines = doc.setFontSize(7).splitTextToSize(q.pattern || "—", cols[4] - 2);
        const rowH = Math.max(5.5, patLines.length * 3.3 + 2);
        checkY(rowH);
        if (idx % 2 === 1) { doc.setFillColor(249, 250, 251); doc.rect(margin, y, contentW, rowH, "F"); }
        doc.setFont("helvetica", "normal");
        const row = [`Q${q.questionNum}`, q.topic || "—", `${q.avgScorePct ?? "—"}%`, `${q.passRate ?? "—"}%`];
        cx = margin + 1.5;
        row.forEach((val, i) => {
          if (i === 2) doc.setTextColor(...rgb((q.avgScorePct ?? 0) >= 60 ? "#16a34a" : "#dc2626"));
          else if (i === 3) doc.setTextColor(...rgb((q.passRate ?? 0) >= 60 ? "#16a34a" : "#dc2626"));
          else doc.setTextColor(31, 41, 55);
          doc.setFontSize(7.5); doc.setFont("helvetica", i === 0 ? "bold" : "normal");
          doc.text(String(val), cx, y + 4);
          cx += cols[i];
        });
        doc.setTextColor(75, 85, 99); doc.setFontSize(7); doc.setFont("helvetica", "normal");
        doc.text(patLines, cx, y + 4);
        doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.2);
        doc.line(margin, y + rowH, margin + contentW, y + rowH);
        y += rowH;
      });
      y += 5;
    }

    // ── Recommendations ──────────────────────────────────────────────────────
    if (a.recommendations?.length) {
      checkY(12);
      doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(31, 41, 55);
      doc.text("Recommendations", margin, y); y += 4;
      a.recommendations.forEach((r: string, i: number) => {
        const lines = doc.setFontSize(8).setFont("helvetica", "normal").splitTextToSize(`${i + 1}.  ${r}`, contentW - 4);
        checkY(lines.length * 3.8 + 2);
        doc.setTextColor(75, 85, 99); doc.text(lines, margin + 2, y + 3.5);
        y += lines.length * 3.8 + 2.5;
      });
      y += 3;
    }

    // ── Readiness ────────────────────────────────────────────────────────────
    if (a.readinessDetail) {
      checkY(12);
      doc.setFillColor(245, 243, 255); doc.setDrawColor(139, 92, 246); doc.setLineWidth(0.8);
      const rdLines = doc.setFontSize(8).splitTextToSize(a.readinessDetail, contentW - 6);
      const rdH = rdLines.length * 3.8 + 6;
      doc.rect(margin, y, contentW, rdH, "F");
      doc.line(margin, y, margin, y + rdH);
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(109, 40, 217);
      doc.text("Readiness: ", margin + 4, y + 4.5);
      const labelW = doc.getTextWidth("Readiness: ");
      doc.setFont("helvetica", "normal"); doc.setTextColor(75, 85, 99);
      doc.text(rdLines, margin + 4 + labelW, y + 4.5);
      y += rdH + 5;
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
      doc.line(margin, 288, W - margin, 288);
      doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(156, 163, 175);
      doc.text(`Page ${p} of ${totalPages}`, margin, 293);
      doc.setFont("helvetica", "bold"); doc.setTextColor(109, 40, 217);
      doc.text("Powered by Zapper Edge", W - margin, 293, { align: "right" });
    }

    doc.save(`batch-insight-analysis-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setPdfDownloading(false);
    }
  };

  const generateSwotAnalysis = async (batchId: string) => {
    setSwotGenerating(true);
    setSwotAnalysis(null);
    try {
      const res = await apiRequest("POST", "/api/eval/batch-analysis", { batchId, organizationId: selectedOrganizationId });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Analysis failed", description: err.error || "Unknown error", variant: "destructive" });
        setSwotGenerating(false);
        return;
      }
      startSwotPolling(batchId);
    } catch (e: any) {
      toast({ title: "Analysis failed", description: e.message, variant: "destructive" });
      setSwotGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-0 h-full">
      <FileSelectorModal isOpen={isFileSelectorOpen} onClose={() => setIsFileSelectorOpen(false)} onSelect={handleFileSelect} />

      <div className="flex items-center gap-3 px-1 pb-5">
        <GraduationCap className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold leading-tight">Answer Sheet Evaluation</h1>
          <p className="text-xs text-muted-foreground">AI-powered grading for student answer sheets</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {evalJobs.some((j) => j.status === "queued" || j.status === "running") && (
            <span className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full">
              <Loader2 className="h-3 w-3 animate-spin" />
              Grading in progress…
            </span>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col">
        <TabsList className="w-fit mb-5">
          {canRun && (
            <TabsTrigger value="setup" data-testid="tab-setup">
              <Play className="h-4 w-4 mr-1.5" />
              New Evaluation
            </TabsTrigger>
          )}
          <TabsTrigger value="results" data-testid="tab-results">
            <BarChart3 className="h-4 w-4 mr-1.5" />
            Results
            {evalJobs.length > 0 && (
              <span className="ml-1.5 bg-primary/15 text-primary text-xs font-semibold px-1.5 py-0.5 rounded-full">
                {evalJobs.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {canRun && (
          <TabsContent value="setup" className="flex-1 flex flex-col gap-5 mt-0">
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
              <div className="xl:col-span-2 flex flex-col gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                      Exam Configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">AI Resource</label>
                      <Select value={selectedResourceId?.toString() || ""} onValueChange={(v) => setSelectedResourceId(parseInt(v))}>
                        <SelectTrigger data-testid="select-foundry-resource" className="h-9">
                          <SelectValue placeholder={resourcesLoading ? "Loading…" : "Select AI Resource"} />
                        </SelectTrigger>
                        <SelectContent>
                          {activeResources.length === 0 ? (
                            <div className="p-2 text-sm text-muted-foreground">No resources available</div>
                          ) : (
                            activeResources.map((r) => (
                              <SelectItem key={r.id} value={r.id.toString()}>{r.resourceName}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator />

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Question Paper</label>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => openFileSelector("question")} className="h-8 text-xs" data-testid="button-select-question-paper">
                          <FolderOpen className="h-3.5 w-3.5 mr-1" />
                          {questionPaperFile ? "Change file" : "Pick file"}
                        </Button>
                        {questionPaperFile && (
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="text-xs truncate">{questionPaperFile.name}</span>
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0 ml-auto shrink-0" onClick={() => setQuestionPaperFile(null)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                      {!questionPaperFile && (
                        <Textarea placeholder="Or paste question paper text here…" value={questionPaperText} onChange={(e) => setQuestionPaperText(e.target.value)} className="min-h-[70px] text-xs" data-testid="textarea-question-paper" />
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Answer Key <span className="text-muted-foreground font-normal">(optional)</span></label>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => openFileSelector("standard")} className="h-8 text-xs" data-testid="button-select-standard-answer">
                          <FolderOpen className="h-3.5 w-3.5 mr-1" />
                          {standardAnswerFile ? "Change file" : "Pick file"}
                        </Button>
                        {standardAnswerFile && (
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="text-xs truncate">{standardAnswerFile.name}</span>
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0 ml-auto shrink-0" onClick={() => setStandardAnswerFile(null)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                      {!standardAnswerFile && (
                        <Textarea placeholder="Or paste answer key text here…" value={standardAnswerText} onChange={(e) => setStandardAnswerText(e.target.value)} className="min-h-[60px] text-xs" data-testid="textarea-standard-answer" />
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className={selectedAnswerSheets.size > 0 ? "border-primary" : ""}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                        <span className="text-sm font-semibold">Run Evaluation</span>
                      </div>
                    </div>
                    {selectedAnswerSheets.size === 0 ? (
                      <p className="text-xs text-muted-foreground">Select student answer sheets from the file browser →</p>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-1">
                          {Array.from(selectedAnswerSheets).slice(0, 6).map((path) => (
                            <Badge key={path} variant="secondary" className="text-xs max-w-[160px] truncate pr-1">
                              {path.split("/").pop()}
                              <button onClick={() => toggleAnswerSheet(path)} className="ml-1 opacity-60 hover:opacity-100"><X className="h-2.5 w-2.5" /></button>
                            </Badge>
                          ))}
                          {selectedAnswerSheets.size > 6 && (
                            <Badge variant="outline" className="text-xs">+{selectedAnswerSheets.size - 6} more</Badge>
                          )}
                        </div>
                        {selectedAnswerSheets.size > 50 && (
                          <p className="text-xs text-destructive">Max 50 sheets per batch</p>
                        )}
                        <Button onClick={startBatchEvaluation} disabled={isStarting || selectedAnswerSheets.size === 0 || selectedAnswerSheets.size > 50 || !selectedResourceId} className="w-full" data-testid="button-run-evaluation">
                          {isStarting ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Starting…</>
                          ) : (
                            <><Sparkles className="h-4 w-4 mr-2" />Grade {selectedAnswerSheets.size} Sheet{selectedAnswerSheets.size !== 1 ? "s" : ""}</>
                          )}
                        </Button>
                        <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-muted-foreground" onClick={() => setSelectedAnswerSheets(new Set())} data-testid="button-clear-selection">
                          Clear selection
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="xl:col-span-3">
                <Card className="h-full flex flex-col">
                  <CardHeader className="pb-0 pt-4 px-4 flex-none">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                        <span className="text-sm font-semibold">Student Answer Sheets</span>
                        {selectedAnswerSheets.size > 0 && (
                          <Badge className="text-xs">{selectedAnswerSheets.size} selected</Badge>
                        )}
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/files", selectedOrganizationId, answerSheetBrowserPath] })} disabled={answerFilesFetching} data-testid="button-refresh-browser">
                        <RefreshCw className={`h-3.5 w-3.5 ${answerFilesFetching ? "animate-spin" : ""}`} />
                      </Button>
                    </div>
                    <div className="flex items-center gap-1 text-xs bg-muted/40 rounded-md px-2 py-1.5 mb-3">
                      <Button variant="ghost" size="sm" onClick={goBackFolder} disabled={!answerSheetBrowserPath} className="h-5 w-5 p-0 mr-0.5" data-testid="button-browser-back">
                        <ArrowLeft className="h-3 w-3" />
                      </Button>
                      <button className="text-muted-foreground hover:text-foreground" onClick={() => setAnswerSheetBrowserPath("")} data-testid="breadcrumb-root">Root</button>
                      {answerBrowserPathParts.map((part, index) => (
                        <span key={index} className="flex items-center gap-1">
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          <button className="hover:text-foreground text-muted-foreground hover:underline" onClick={() => setAnswerSheetBrowserPath(answerBrowserPathParts.slice(0, index + 1).join("/"))} data-testid={`breadcrumb-${index}`}>{part}</button>
                        </span>
                      ))}
                    </div>
                    {selectableFiles.length > 0 && (
                      <div className="flex items-center gap-2 pb-2 border-b text-xs text-muted-foreground">
                        <Checkbox checked={selectableFiles.every((f) => selectedAnswerSheets.has(f.path))} onCheckedChange={handleSelectAll} data-testid="checkbox-select-all" />
                        <span>Select all files in this folder</span>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="flex-1 p-0 overflow-hidden">
                    <ScrollArea className="h-[400px]">
                      {answerFilesLoading ? (
                        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
                      ) : sortedAnswerFiles.length === 0 ? (
                        <div className="text-center py-16 text-muted-foreground">
                          <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
                          <p className="text-sm">No files found</p>
                        </div>
                      ) : (
                        <div className="divide-y">
                          {sortedAnswerFiles.map((file) => {
                            const fileIsFolder = isFolder(file);
                            const supported = isEvalSupported(file);
                            const isSelected = selectedAnswerSheets.has(file.path);
                            const ext = getFileExtension(file);
                            return (
                              <div
                                key={file.path}
                                className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${fileIsFolder ? "cursor-pointer hover:bg-muted/50" : supported ? `cursor-pointer hover:bg-muted/50 ${isSelected ? "bg-primary/5" : ""}` : "opacity-40"}`}
                                onClick={() => { if (fileIsFolder) navigateToFolder(file); else if (supported) toggleAnswerSheet(file.path); }}
                                data-testid={`row-file-${file.name}`}
                              >
                                {!fileIsFolder && supported ? (
                                  <Checkbox checked={isSelected} onCheckedChange={() => toggleAnswerSheet(file.path)} onClick={(e) => e.stopPropagation()} data-testid={`checkbox-file-${file.name}`} />
                                ) : (
                                  <div className="w-4" />
                                )}
                                {fileIsFolder ? (
                                  <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                                ) : (
                                  <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                                )}
                                <span className="text-sm flex-1 truncate">{file.name}</span>
                                {!fileIsFolder && ext && (
                                  <span className="text-xs text-muted-foreground uppercase bg-muted px-1.5 py-0.5 rounded">{ext}</span>
                                )}
                                {fileIsFolder && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        )}

        <TabsContent value="results" className="flex-1 mt-0">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by student name or file…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                  data-testid="input-search-jobs"
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/eval/jobs", selectedOrganizationId] })} data-testid="button-refresh-jobs">
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Refresh
              </Button>
            </div>

            {jobsLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : evalJobs.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <ClipboardCheck className="h-14 w-14 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">No evaluations yet</p>
                {canRun && <p className="text-sm mt-1">Go to the <button onClick={() => setActiveTab("setup")} className="text-primary underline">New Evaluation</button> tab to grade answer sheets.</p>}
              </div>
            ) : groupedBatches.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No results match your search</p>
                <p className="text-xs mt-1">Try a different name or filename</p>
              </div>
            ) : (
              <div className="space-y-2">
                {groupedBatches.map((batch) => {
                  const isExpanded = expandedBatches.has(batch.batchId);
                  const completedCount = batch.jobs.filter((j) => j.status === "completed").length;
                  const runningCount = batch.jobs.filter((j) => j.status === "running" || j.status === "queued").length;
                  const failedCount = batch.jobs.filter((j) => j.status === "failed").length;
                  const finalizedCount = batch.jobs.filter((j) => j.reviewStatus === "finalized").length;
                  const qpName = batch.questionPaperPath?.split("/").pop() || (batch.questionPaperText ? "Typed text" : null);
                  const batchDate = new Date(batch.createdAt);
                  const batchLabel = batchDate.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

                  const batchScores = batch.jobs
                    .filter((j) => j.status === "completed")
                    .map((j) => getJobScore(j))
                    .filter(Boolean) as { awarded: number; max: number; pct: number }[];
                  const avgPct = batchScores.length > 0
                    ? batchScores.reduce((s, x) => s + x.pct, 0) / batchScores.length
                    : null;

                  return (
                    <div key={batch.batchId} className="rounded-lg border border-border bg-card overflow-hidden" data-testid={`batch-${batch.batchId}`}>
                      {/* Batch header — always visible */}
                      <button
                        className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
                        onClick={() => toggleBatch(batch.batchId)}
                        data-testid={`button-batch-toggle-${batch.batchId}`}
                      >
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        }

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-foreground">
                              {batch.jobs.length} answer sheet{batch.jobs.length !== 1 ? "s" : ""}
                            </span>
                            {qpName && (
                              <span className="text-xs text-muted-foreground truncate max-w-[220px]">
                                · {qpName}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{batchLabel}</p>
                        </div>

                        {/* Status summary pills */}
                        <div className="flex items-center gap-2 shrink-0">
                          {runningCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                              <Loader2 className="h-3 w-3 animate-spin" /> {runningCount} grading
                            </span>
                          )}
                          {completedCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                              <CheckCircle2 className="h-3 w-3" /> {completedCount} done
                            </span>
                          )}
                          {failedCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                              <XCircle className="h-3 w-3" /> {failedCount} failed
                            </span>
                          )}
                          {finalizedCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                              <CheckCheck className="h-3 w-3" /> {finalizedCount} finalized
                            </span>
                          )}
                          {avgPct !== null && (
                            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${avgPct >= 60 ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"}`}>
                              avg {avgPct.toFixed(0)}%
                            </span>
                          )}
                          {completedCount >= 2 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs gap-1 border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-900/20 shrink-0"
                              onClick={(e) => { e.stopPropagation(); openSwotDialog(batch.batchId); }}
                              data-testid={`button-swot-${batch.batchId}`}
                            >
                              <Sparkles className="h-3 w-3" /> Batch Insight
                            </Button>
                          )}
                        </div>
                      </button>

                      {/* Individual job rows — only shown when expanded */}
                      {isExpanded && (
                        <div className="border-t divide-y divide-border bg-muted/20">
                          {batch.jobs.map((job) => {
                            const score = job.status === "completed" ? getJobScore(job) : null;
                            const studentName = extractStudentName(job.answerSheetPath);
                            const filename = job.answerSheetPath?.split("/").pop() || "";

                            return (
                              <div
                                key={job.jobId}
                                className="flex items-center gap-3 px-6 py-2.5 hover:bg-muted/30 transition-colors"
                                data-testid={`row-job-${job.jobId}`}
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate" data-testid={`text-student-${job.jobId}`}>{studentName}</p>
                                  <p className="text-xs text-muted-foreground truncate">{filename}</p>
                                  {job.status === "failed" && job.error && (
                                    <p className="text-xs text-destructive truncate mt-0.5" title={job.error} data-testid={`text-error-${job.jobId}`}>{job.error}</p>
                                  )}
                                </div>
                                <div className="shrink-0">
                                  {score ? (
                                    <ScorePill awarded={score.awarded} max={score.max} pct={score.pct} />
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </div>
                                <div className="shrink-0 w-24 text-center">
                                  <StatusChip status={job.status} />
                                </div>
                                <div className="shrink-0 w-28 text-center">
                                  <ReviewChip reviewStatus={job.reviewStatus} />
                                </div>
                                <div className="shrink-0">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setReviewJobId(job.jobId)}
                                    disabled={job.status !== "completed"}
                                    data-testid={`button-review-${job.jobId}`}
                                    className="h-7 text-xs"
                                  >
                                    <Eye className="h-3.5 w-3.5 mr-1" /> Review
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!reviewJobId} onOpenChange={(open) => { if (!open) setReviewJobId(null); }}>
        <DialogContent
          className="max-w-[96vw] w-[96vw] h-[92vh] p-0 flex flex-col gap-0 overflow-hidden rounded-xl"
          data-testid="dialog-review"
        >
          <DialogTitle className="sr-only">
            {reviewJobData ? `Review — ${extractStudentName(reviewJobData.answerSheetPath)}` : "Review"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Evaluation review panel showing answer sheet, question paper, and grading results.
          </DialogDescription>

          {reviewJobLoading && (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {reviewJobData && reviewJobData.status !== "completed" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              {reviewJobData.status === "running" || reviewJobData.status === "queued" ? (
                <><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="font-medium">Grading in progress…</p></>
              ) : (
                <>
                  <XCircle className="h-10 w-10 text-destructive" />
                  <p className="font-medium text-destructive">Evaluation failed</p>
                  {reviewJobData.error && (
                    <div className="max-w-lg mx-auto px-4">
                      <p className="text-xs text-center text-muted-foreground bg-muted rounded-md px-4 py-2.5 border border-border break-words">
                        {reviewJobData.error}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {reviewJobData && reviewJobData.status === "completed" && (
            <>
              {/* ── Header ── */}
              <div className="flex items-center gap-4 px-6 py-3.5 border-b flex-none bg-card">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-semibold leading-tight truncate">
                      {extractStudentName(reviewJobData.answerSheetPath)}
                    </h2>
                    {reviewJobData.reviewStatus === "finalized" && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 shrink-0">
                        <CheckCheck className="h-3 w-3" /> Finalized
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {reviewJobData.answerSheetPath?.split("/").pop()}
                  </p>
                </div>

                {/* Score block */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className={`text-center px-4 py-1.5 rounded-lg ${overallPercentage >= 60 ? "bg-green-50 dark:bg-green-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
                    <div className="text-2xl font-bold leading-none text-foreground">
                      {overallMarks}<span className="text-base font-normal text-muted-foreground">/{overallMaxMarks}</span>
                    </div>
                    <div className={`text-xs font-semibold mt-0.5 ${overallPercentage >= 60 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                      {Number(overallPercentage).toFixed(1)}%
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={exportCsv} data-testid="button-export-csv">
                      <Download className="h-3.5 w-3.5" /> Export
                    </Button>
                    {canReview && reviewJobData.reviewStatus !== "finalized" && (
                      <>
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={bulkAcceptAll} disabled={isBulkAccepting} data-testid="button-accept-all">
                          {isBulkAccepting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                          Accept All
                        </Button>
                        {canFinalize && (
                          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={finalizeReview} disabled={isFinalizing} data-testid="button-finalize">
                            {isFinalizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Finalize
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Score progress bar */}
              <Progress value={overallPercentage} className="h-0.5 flex-none rounded-none" />

              {/* ── Three-pane body — draggable dividers ── */}
              <div ref={reviewContainerRef} className="flex-1 flex overflow-hidden min-h-0 select-none">

                {/* Pane 1 — Answer Sheet */}
                {docPreviewUrls.answerSheet && (
                  <>
                    <div
                      className="flex flex-col min-w-0 overflow-hidden"
                      style={{ width: `${docPreviewUrls.questionPaper ? div1Pct : div2Pct}%` }}
                    >
                      <div className="px-4 py-2 bg-muted/40 border-b flex-none flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Answer Sheet</span>
                        {docPreviewLoading.answerSheet && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <FilePreviewEmbed
                          fileUrl={docPreviewUrls.answerSheet}
                          fileName={reviewJobData.answerSheetPath?.split("/").pop() || "answer-sheet"}
                          fileExtension={reviewJobData.answerSheetPath?.split(".").pop() || "pdf"}
                          className="h-full"
                        />
                      </div>
                    </div>

                    {/* Divider AB — between answer sheet and question paper (only when both present) */}
                    {docPreviewUrls.questionPaper && (
                      <div
                        className="w-1 bg-border hover:bg-primary/40 active:bg-primary/60 cursor-col-resize flex-none relative transition-colors"
                        onMouseDown={startReviewDrag("AB")}
                        data-testid="divider-ab"
                      >
                        <div className="absolute inset-y-0 -left-1 -right-1" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-0.5">
                          <div className="w-0.5 h-4 bg-muted-foreground/40 rounded-full" />
                        </div>
                      </div>
                    )}

                    {/* Divider BC — between answer sheet and results (only when no question paper) */}
                    {!docPreviewUrls.questionPaper && (
                      <div
                        className="w-1 bg-border hover:bg-primary/40 active:bg-primary/60 cursor-col-resize flex-none relative transition-colors"
                        onMouseDown={startReviewDrag("BC")}
                        data-testid="divider-bc-simple"
                      >
                        <div className="absolute inset-y-0 -left-1 -right-1" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-0.5">
                          <div className="w-0.5 h-4 bg-muted-foreground/40 rounded-full" />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Pane 2 — Question Paper */}
                {docPreviewUrls.questionPaper && (
                  <>
                    <div
                      className="flex flex-col min-w-0 overflow-hidden"
                      style={{ width: `${div2Pct - (docPreviewUrls.answerSheet ? div1Pct : 0)}%` }}
                    >
                      <div className="px-4 py-2 bg-muted/40 border-b flex-none flex items-center gap-2">
                        <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Question Paper</span>
                        {docPreviewLoading.questionPaper && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <FilePreviewEmbed
                          fileUrl={docPreviewUrls.questionPaper}
                          fileName={reviewJobData.questionPaperPath?.split("/").pop() || "question-paper"}
                          fileExtension={reviewJobData.questionPaperPath?.split(".").pop() || "pdf"}
                          className="h-full"
                        />
                      </div>
                    </div>

                    {/* Divider BC — between question paper and results */}
                    <div
                      className="w-1 bg-border hover:bg-primary/40 active:bg-primary/60 cursor-col-resize flex-none relative transition-colors"
                      onMouseDown={startReviewDrag("BC")}
                      data-testid="divider-bc"
                    >
                      <div className="absolute inset-y-0 -left-1 -right-1" />
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-0.5">
                        <div className="w-0.5 h-4 bg-muted-foreground/40 rounded-full" />
                      </div>
                    </div>
                  </>
                )}

                {/* Pane 3 — Results */}
                <div
                  className="flex flex-col overflow-hidden bg-muted/20"
                  style={{ width: `${100 - div2Pct}%` }}
                >
                  <div className="flex-none border-b">
                    <div className="px-4 py-2 bg-muted/40 flex items-center gap-2">
                      <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Results</span>
                      <div className="ml-auto flex items-center gap-2">
                        {jobResults.length > 0 && (
                          <span className={`text-xs font-medium ${qReviewedCount === jobResults.length ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                            {qReviewedCount}/{jobResults.length} reviewed
                          </span>
                        )}
                      </div>
                    </div>
                    {jobResults.length > 0 && (
                      <div className="h-0.5 bg-muted">
                        <div
                          className="h-full bg-green-500 transition-all duration-500"
                          style={{ width: `${jobResults.length > 0 ? (qReviewedCount / jobResults.length) * 100 : 0}%` }}
                        />
                      </div>
                    )}
                    {jobResults.length > 0 && (
                      <div className="px-3 py-1.5 bg-muted/10 flex items-center gap-1 border-t">
                        {(["all", "pending", "reviewed"] as const).map(f => {
                          const count = f === "all" ? jobResults.length : f === "pending" ? jobResults.length - qReviewedCount : qReviewedCount;
                          return (
                            <button
                              key={f}
                              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${questionFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                              onClick={() => { setQuestionFilter(f); setSelectedQs(new Set()); }}
                              data-testid={`button-filter-${f}`}
                            >
                              {f === "all" ? `All (${count})` : f === "pending" ? `Pending (${count})` : `Reviewed (${count})`}
                            </button>
                          );
                        })}
                        {canReview && reviewJobData.reviewStatus !== "finalized" && jobResults.length > 0 && (
                          <button
                            className="ml-auto text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors px-1"
                            onClick={() => {
                              if (selectedQs.size > 0) {
                                setSelectedQs(new Set());
                              } else {
                                setSelectedQs(new Set(jobResults.map((q: any) => String(q.questionNumber || q.questionNum))));
                              }
                            }}
                            data-testid="button-select-all"
                          >
                            {selectedQs.size > 0 ? "Deselect all" : "Select all"}
                          </button>
                        )}
                      </div>
                    )}
                    {selectedQs.size > 0 && canReview && reviewJobData.reviewStatus !== "finalized" && (
                      <div className="px-3 py-2 bg-primary/5 border-t flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-foreground">{selectedQs.size} selected</span>
                        <Button
                          size="sm"
                          className="h-6 text-[11px] px-2.5 ml-auto gap-1"
                          onClick={() => bulkMarkReview(true)}
                          disabled={savingReview}
                          data-testid="button-bulk-mark-reviewed"
                        >
                          <CheckCircle2 className="h-3 w-3" /> Mark Reviewed
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[11px] px-2.5 gap-1"
                          onClick={() => bulkMarkReview(false)}
                          disabled={savingReview}
                          data-testid="button-bulk-mark-pending"
                        >
                          <Circle className="h-3 w-3" /> Mark Pending
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[11px] px-2 text-muted-foreground"
                          onClick={() => setSelectedQs(new Set())}
                          data-testid="button-deselect-all"
                        >
                          Clear
                        </Button>
                      </div>
                    )}
                  </div>

                  <ScrollArea className="flex-1">
                    <div className="p-3 space-y-2">
                      {/* Overall feedback */}
                      {overallFeedback && (
                        <div className="p-3 rounded-lg bg-card border text-xs text-muted-foreground mb-3">
                          <p className="font-semibold text-foreground text-xs mb-1 flex items-center gap-1.5">
                            <Sparkles className="h-3 w-3 text-primary" /> Overall Feedback
                          </p>
                          <p className="leading-relaxed">{overallFeedback}</p>
                        </div>
                      )}

                      {/* Per-question list */}
                      {jobResults.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground text-sm">No question results available.</div>
                      ) : filteredJobResults.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground text-sm">
                          No {questionFilter === "pending" ? "pending" : "reviewed"} questions.
                        </div>
                      ) : (
                        filteredJobResults.map((q: any) => {
                          const qNum = q.questionNumber || q.questionNum;
                          const qKey = String(qNum);
                          const isExpanded = expandedQuestions.has(qKey);
                          const maxM = Number(q.maxMarks) || 0;
                          const awardedM = Number(q.marksAwarded) || 0;
                          const qPct = maxM > 0 ? (awardedM / maxM) * 100 : 0;
                          const isSaving = savingQuestion === qKey;
                          const hasEdits = overrideMarks[qKey] !== undefined || overrideComments[qKey] !== undefined;
                          const _rawOv = overrideMarks[qKey] ?? "";
                          const _parsedOv = _rawOv !== "" ? parseFloat(_rawOv) : NaN;
                          const overrideHasError = (!isNaN(_parsedOv) && _parsedOv > maxM) || (!isNaN(_parsedOv) && _parsedOv < 0);
                          const isQReviewed = !!qReviewed[qKey];
                          const isSelected = selectedQs.has(qKey);
                          const scoreColor = qPct >= 80 ? "text-green-600 dark:text-green-400"
                            : qPct > 0 ? "text-amber-600 dark:text-amber-400"
                            : "text-red-500 dark:text-red-400";
                          const scoreBg = qPct >= 80 ? "bg-green-50 dark:bg-green-900/20"
                            : qPct > 0 ? "bg-amber-50 dark:bg-amber-900/20"
                            : "bg-red-50 dark:bg-red-900/20";

                          return (
                            <div
                              key={qKey}
                              className={`group rounded-lg border bg-card overflow-hidden transition-colors ${isSelected ? "border-primary/50 bg-primary/5" : q.overridden ? "border-blue-200 dark:border-blue-800" : "border-border"}`}
                              data-testid={`card-question-${qKey}`}
                            >
                              <div className="flex items-stretch">
                                {/* Multi-select checkbox */}
                                {canReview && reviewJobData.reviewStatus !== "finalized" && (
                                  <div
                                    className="flex items-center pl-2.5 pr-1 cursor-pointer hover:bg-muted/40 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedQs(prev => { const n = new Set(prev); if (n.has(qKey)) n.delete(qKey); else n.add(qKey); return n; });
                                    }}
                                  >
                                    <Checkbox
                                      checked={isSelected}
                                      className={`h-3.5 w-3.5 transition-opacity duration-150 ${selectedQs.size > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-60"}`}
                                      onCheckedChange={() => setSelectedQs(prev => { const n = new Set(prev); if (n.has(qKey)) n.delete(qKey); else n.add(qKey); return n; })}
                                      data-testid={`checkbox-question-${qKey}`}
                                    />
                                  </div>
                                )}

                                {/* Expand button */}
                                <button
                                  className="flex-1 flex items-center gap-2 px-2 py-2.5 text-left hover:bg-muted/40 transition-colors min-w-0"
                                  onClick={() => toggleQuestion(qKey)}
                                >
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold shrink-0 text-foreground">
                                    {qNum}
                                  </span>
                                  <span className="flex-1 text-xs truncate text-muted-foreground leading-tight">
                                    {q.questionText ? q.questionText.slice(0, 50) + (q.questionText.length > 50 ? "…" : "") : `Question ${qNum}`}
                                  </span>
                                  {q.overridden && (
                                    <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 shrink-0">Edited</span>
                                  )}
                                  <span className={`text-xs font-bold shrink-0 px-1.5 py-0.5 rounded ${scoreBg} ${scoreColor}`}>
                                    {awardedM}/{maxM}
                                  </span>
                                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                                </button>

                                {/* Review status toggle */}
                                {canReview && reviewJobData.reviewStatus !== "finalized" ? (
                                  <button
                                    className="flex items-center px-2.5 hover:bg-muted/40 transition-colors border-l border-border/40"
                                    onClick={(e) => { e.stopPropagation(); toggleQuestionReview(qKey); }}
                                    title={isQReviewed ? "Mark as Pending" : "Mark as Reviewed"}
                                    data-testid={`button-review-toggle-${qKey}`}
                                  >
                                    {isQReviewed
                                      ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                                      : <Circle className="h-4 w-4 text-muted-foreground/25 group-hover:text-muted-foreground/60 transition-colors" />
                                    }
                                  </button>
                                ) : isQReviewed ? (
                                  <div className="flex items-center px-2.5 border-l border-border/40">
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                  </div>
                                ) : null}
                              </div>

                              {isExpanded && (
                                <div className="px-3 pb-3 border-t bg-muted/20 space-y-2.5 pt-2.5">
                                  {q.questionText && (
                                    <div>
                                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Question</p>
                                      <p className="text-xs leading-relaxed">{q.questionText}</p>
                                    </div>
                                  )}
                                  {q.studentAnswer && (
                                    <div>
                                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Student Answer</p>
                                      <p className="text-xs leading-relaxed bg-background rounded p-2 border">{q.studentAnswer}</p>
                                    </div>
                                  )}
                                  {q.feedback && (
                                    <div>
                                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">AI Feedback</p>
                                      <p className="text-xs leading-relaxed text-muted-foreground">{q.feedback}</p>
                                    </div>
                                  )}
                                  {canReview && reviewJobData.reviewStatus !== "finalized" && (
                                    <div className="pt-2 border-t space-y-2">
                                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Override Marks</p>
                                      <div className="flex items-center gap-2">
                                        <Input
                                          type="number"
                                          min={0}
                                          max={maxM}
                                          step={0.5}
                                          placeholder={String(awardedM)}
                                          value={overrideMarks[qKey] ?? ""}
                                          onChange={(e) => setOverrideMarks((prev) => ({ ...prev, [qKey]: e.target.value }))}
                                          className={`w-20 h-7 text-xs${overrideHasError ? " border-destructive focus-visible:ring-destructive" : ""}`}
                                          data-testid={`input-marks-${qKey}`}
                                        />
                                        <span className="text-xs text-muted-foreground">/ {maxM}</span>
                                      </div>
                                      {!isNaN(_parsedOv) && _parsedOv > maxM && (
                                        <p className="text-[10px] text-destructive">Max allowed is {maxM}</p>
                                      )}
                                      {!isNaN(_parsedOv) && _parsedOv < 0 && (
                                        <p className="text-[10px] text-destructive">Marks cannot be negative</p>
                                      )}
                                      <Textarea
                                        placeholder="Comment (optional)…"
                                        value={overrideComments[qKey] ?? ""}
                                        onChange={(e) => setOverrideComments((prev) => ({ ...prev, [qKey]: e.target.value }))}
                                        className="min-h-[44px] text-xs resize-none"
                                        data-testid={`textarea-comment-${qKey}`}
                                      />
                                      <div className="flex gap-1.5">
                                        <Button
                                          size="sm"
                                          className="h-7 text-xs px-3"
                                          onClick={() => saveOverride(qKey, qNum, maxM)}
                                          disabled={isSaving || !hasEdits || overrideHasError}
                                          data-testid={`button-save-override-${qKey}`}
                                        >
                                          {isSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                                          Save
                                        </Button>
                                        {hasEdits && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-xs px-3 text-muted-foreground"
                                            onClick={() => {
                                              setOverrideMarks((p) => { const n = { ...p }; delete n[qKey]; return n; });
                                              setOverrideComments((p) => { const n = { ...p }; delete n[qKey]; return n; });
                                            }}
                                          >
                                            Discard
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </ScrollArea>
                </div>

              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Batch SWOT Analysis Dialog ─────────────────────────────────────── */}
      <Dialog open={swotOpen} onOpenChange={(open) => { setSwotOpen(open); if (!open && swotPollRef.current) clearInterval(swotPollRef.current); }}>
        <DialogContent className="max-w-4xl w-full max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogTitle className="sr-only">Batch Insight Analysis</DialogTitle>
          <DialogDescription className="sr-only">SWOT analysis for the selected batch</DialogDescription>

          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 rounded-t-lg">
            <div className="flex items-center gap-2 flex-1">
              <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              <div>
                <h2 className="text-base font-semibold text-foreground">Batch Insight Analysis</h2>
                <p className="text-xs text-muted-foreground">AI-powered SWOT analysis of class performance patterns</p>
              </div>
            </div>
            {swotAnalysis?.status === "completed" && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={downloadSwotAsPdf} data-testid="button-swot-download">
                  <Download className="h-3 w-3" /> Download PDF
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => generateSwotAnalysis(swotBatchId!)} disabled={swotGenerating}>
                  <RotateCcw className="h-3 w-3" /> Regenerate
                </Button>
              </div>
            )}
          </div>

          <ScrollArea className="flex-1 overflow-auto">
            <div className="p-6 space-y-6">

              {/* Loading/Generating states */}
              {(swotLoading || swotGenerating) && (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                      <Sparkles className="h-8 w-8 text-violet-500 animate-pulse" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-sm">{swotLoading ? "Loading analysis…" : "Generating insights…"}</p>
                    <p className="text-xs text-muted-foreground mt-1">{swotGenerating ? "Analysing all student answer sheets with AI. This takes 20–60 seconds." : ""}</p>
                  </div>
                  <Progress value={undefined} className="w-48 h-1.5 animate-pulse bg-violet-100" />
                </div>
              )}

              {/* Error state */}
              {!swotLoading && !swotGenerating && swotAnalysis?.status === "failed" && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-destructive">
                  <XCircle className="h-10 w-10 opacity-60" />
                  <p className="font-medium text-sm">Analysis failed</p>
                  <p className="text-xs text-muted-foreground">{swotAnalysis?.error || "Unknown error"}</p>
                  <Button size="sm" variant="outline" onClick={() => generateSwotAnalysis(swotBatchId!)} className="mt-2 gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" /> Try Again
                  </Button>
                </div>
              )}

              {/* No analysis yet */}
              {!swotLoading && !swotGenerating && !swotAnalysis && (
                <div className="flex flex-col items-center justify-center py-14 gap-4">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <BarChart3 className="h-8 w-8 text-muted-foreground opacity-60" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-sm">No analysis yet</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[300px]">
                      Generate a SWOT analysis to identify strengths, weaknesses, opportunities and risks across your entire class batch.
                    </p>
                  </div>
                  <Button onClick={() => generateSwotAnalysis(swotBatchId!)} className="gap-2 bg-violet-600 hover:bg-violet-700 text-white" data-testid="button-generate-swot">
                    <Sparkles className="h-4 w-4" /> Generate Batch Insight
                  </Button>
                </div>
              )}

              {/* Analysis result */}
              {!swotLoading && !swotGenerating && swotAnalysis?.status === "completed" && swotAnalysis.analysisJson && (() => {
                const a = swotAnalysis.analysisJson as any;
                const readinessColor = a.readinessLevel === "ready" ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : a.readinessLevel === "partial" ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800" : "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800";
                const readinessLabel = a.readinessLevel === "ready" ? "Ready for Advanced" : a.readinessLevel === "partial" ? "Needs Reinforcement" : "Not Ready";
                return (
                  <div className="space-y-5">

                    {/* Summary bar */}
                    <div className="rounded-lg border bg-muted/30 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1">
                        <p className="text-sm leading-relaxed text-foreground">{a.overallSummary}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {swotAnalysis.averageScore !== null && (
                          <div className="text-center">
                            <p className="text-2xl font-bold text-foreground">{swotAnalysis.averageScore}%</p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Class Avg</p>
                          </div>
                        )}
                        <div className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${readinessColor}`}>
                          {readinessLabel}
                        </div>
                      </div>
                    </div>

                    {/* SWOT Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Strengths */}
                      <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-md bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                            <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                          </div>
                          <h3 className="text-sm font-semibold text-green-800 dark:text-green-300">Strengths</h3>
                        </div>
                        <ul className="space-y-2">
                          {(a.strengths || []).map((s: any, i: number) => (
                            <li key={i} className="space-y-0.5">
                              <p className="text-xs font-semibold text-green-900 dark:text-green-200">{s.title}</p>
                              <p className="text-xs text-green-700 dark:text-green-400 leading-relaxed">{s.detail}</p>
                              {s.avgScorePct !== undefined && (
                                <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 font-medium">{s.avgScorePct}% avg</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Weaknesses */}
                      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-md bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                            <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                          </div>
                          <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">Weaknesses</h3>
                        </div>
                        <ul className="space-y-2">
                          {(a.weaknesses || []).map((s: any, i: number) => (
                            <li key={i} className="space-y-0.5">
                              <p className="text-xs font-semibold text-red-900 dark:text-red-200">{s.title}</p>
                              <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">{s.detail}</p>
                              {s.avgScorePct !== undefined && (
                                <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 font-medium">{s.avgScorePct}% avg</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Opportunities */}
                      <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-md bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                            <Lightbulb className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300">Opportunities</h3>
                        </div>
                        <ul className="space-y-2">
                          {(a.opportunities || []).map((s: any, i: number) => (
                            <li key={i} className="space-y-0.5">
                              <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">{s.title}</p>
                              <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">{s.detail}</p>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Threats */}
                      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-md bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                            <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          </div>
                          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">Threats / Risks</h3>
                        </div>
                        <ul className="space-y-2">
                          {(a.threats || []).map((s: any, i: number) => (
                            <li key={i} className="space-y-0.5">
                              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">{s.title}</p>
                              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">{s.detail}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Per-question breakdown */}
                    {a.questionBreakdown && a.questionBreakdown.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <ListChecks className="h-4 w-4 text-muted-foreground" />
                          Question-by-Question Breakdown
                        </h3>
                        <div className="rounded-lg border overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/60">
                              <tr>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Q#</th>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Topic</th>
                                <th className="text-center px-3 py-2 font-medium text-muted-foreground">Avg Score</th>
                                <th className="text-center px-3 py-2 font-medium text-muted-foreground">Pass Rate</th>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">Pattern</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {a.questionBreakdown.map((q: any, i: number) => {
                                const pct = q.avgScorePct ?? 0;
                                const barColor = pct >= 70 ? "bg-green-400" : pct >= 50 ? "bg-amber-400" : "bg-red-400";
                                return (
                                  <tr key={i} className="hover:bg-muted/30 transition-colors">
                                    <td className="px-3 py-2 font-medium">Q{q.questionNum}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{q.topic || "—"}</td>
                                    <td className="px-3 py-2">
                                      <div className="flex items-center gap-2 justify-center">
                                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                                        </div>
                                        <span className="font-medium tabular-nums">{pct}%</span>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <span className={`font-medium ${(q.passRate ?? 0) >= 60 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>{q.passRate ?? "—"}%</span>
                                    </td>
                                    <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">{q.pattern || "—"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Recommendations + Readiness */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {a.recommendations && a.recommendations.length > 0 && (
                        <div className="rounded-lg border p-4 space-y-3">
                          <h3 className="text-sm font-semibold flex items-center gap-2">
                            <Target className="h-4 w-4 text-violet-500" />
                            Recommendations
                          </h3>
                          <ul className="space-y-2">
                            {a.recommendations.map((r: string, i: number) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                                <span className="w-4 h-4 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{i + 1}</span>
                                {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {a.readinessDetail && (
                        <div className="rounded-lg border p-4 space-y-3">
                          <h3 className="text-sm font-semibold flex items-center gap-2">
                            <GraduationCap className="h-4 w-4 text-violet-500" />
                            Readiness Assessment
                          </h3>
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${readinessColor}`}>
                            {a.readinessLevel === "ready" ? <CheckCircle2 className="h-3.5 w-3.5" /> : a.readinessLevel === "partial" ? <AlertCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                            {readinessLabel}
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{a.readinessDetail}</p>
                        </div>
                      )}
                    </div>

                    <p className="text-[10px] text-muted-foreground text-right">
                      Generated {swotAnalysis.updatedAt ? new Date(swotAnalysis.updatedAt).toLocaleString() : ""}
                      {" · "}{swotAnalysis.completedCount} of {swotAnalysis.batchSize} sheets analysed
                    </p>
                  </div>
                );
              })()}

            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {pdfDownloading && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm" data-testid="overlay-pdf-downloading">
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-white dark:bg-zinc-900 px-10 py-8 shadow-2xl">
            <div className="relative h-14 w-14">
              <div className="absolute inset-0 rounded-full border-4 border-violet-100 dark:border-violet-900" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-violet-600 animate-spin" />
              <Download className="absolute inset-0 m-auto h-5 w-5 text-violet-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">Generating PDF…</p>
              <p className="mt-1 text-xs text-muted-foreground">Building your report, just a moment</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
