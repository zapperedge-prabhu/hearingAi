import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, BookOpen, AlertCircle, Loader2 } from "lucide-react";
import {
  getUserGuideChapters,
  getUserGuideChapter,
  getTroubleshootingChapters,
  getTroubleshootingChapter,
  type HelpChapter,
} from "@/lib/api/help";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

interface HelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpPanel({ isOpen, onClose }: HelpPanelProps) {
  const [activeTab, setActiveTab] = useState<"user-guide" | "troubleshooting">("user-guide");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  // Fetch accessible chapters based on user permissions
  const { data: accessibleData } = useQuery<{ accessibleChapters: string[] }>({
    queryKey: ["/api/help-center/accessible-chapters"],
    enabled: isOpen,
  });

  const accessibleChapters = accessibleData?.accessibleChapters || [];

  // Fetch user guide chapters list
  const { data: userGuideChapters, isLoading: isLoadingUserGuide, error: userGuideError, refetch: refetchUserGuide } = useQuery({
    queryKey: ["/api/help/user-guide"],
    queryFn: getUserGuideChapters,
    enabled: isOpen,
  });

  // Filter chapters based on permissions
  const filteredUserGuideChapters = userGuideChapters?.filter(chapter => 
    accessibleChapters.includes(chapter.id)
  ) || [];

  // Fetch troubleshooting chapters list
  const { data: troubleshootingChapters, isLoading: isLoadingTroubleshooting, error: troubleshootingError, refetch: refetchTroubleshooting } = useQuery({
    queryKey: ["/api/help/troubleshooting"],
    queryFn: getTroubleshootingChapters,
    enabled: isOpen,
  });

  // Fetch selected chapter content
  const { data: selectedChapter, isLoading: isLoadingChapter, error: chapterError, refetch: refetchChapter } = useQuery({
    queryKey: ["/api/help", activeTab, selectedSlug],
    queryFn: () => {
      if (!selectedSlug) return null;
      return activeTab === "user-guide"
        ? getUserGuideChapter(selectedSlug)
        : getTroubleshootingChapter(selectedSlug);
    },
    enabled: !!selectedSlug && isOpen,
  });

  // Auto-select first chapter when switching tabs
  const handleTabChange = (tab: string) => {
    const newTab = tab as "user-guide" | "troubleshooting";
    setActiveTab(newTab);
    
    // Auto-select first chapter in the new tab
    if (newTab === "user-guide" && filteredUserGuideChapters && filteredUserGuideChapters.length > 0) {
      setSelectedSlug(filteredUserGuideChapters[0].slug);
    } else if (newTab === "troubleshooting" && troubleshootingChapters && troubleshootingChapters.length > 0) {
      setSelectedSlug(troubleshootingChapters[0].slug);
    } else {
      setSelectedSlug(null);
    }
  };

  // Auto-select first chapter on initial load
  if (isOpen && !selectedSlug && filteredUserGuideChapters && filteredUserGuideChapters.length > 0 && activeTab === "user-guide") {
    setSelectedSlug(filteredUserGuideChapters[0].slug);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 dark:bg-black/70" onClick={onClose}>
      <ResizablePanelGroup
        direction="horizontal"
        className="fixed right-0 top-0 h-full min-w-[600px] max-w-[95vw] bg-white dark:bg-gray-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ResizablePanel defaultSize={100} minSize={40}>
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b dark:border-gray-800 px-6 py-4">
              <div className="flex items-center gap-2">
                <BookOpen className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Help Center</h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                data-testid="button-close-help"
                className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="w-full justify-start rounded-none border-b dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-6">
                <TabsTrigger value="user-guide" data-testid="tab-user-guide" className="gap-2">
                  <BookOpen className="h-4 w-4" />
                  User Guide
                </TabsTrigger>
                <TabsTrigger value="troubleshooting" data-testid="tab-troubleshooting" className="gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Troubleshooting
                </TabsTrigger>
              </TabsList>

              <ResizablePanelGroup direction="horizontal" className="flex-1">
                {/* Sidebar - Chapter List */}
                <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
                  <div className="h-full border-r dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
              <ScrollArea className="h-full">
                <TabsContent value="user-guide" className="m-0 p-4">
                  {isLoadingUserGuide ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                  ) : userGuideError ? (
                    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                      <AlertCircle className="h-8 w-8 text-red-500 dark:text-red-400 mb-3" />
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 font-medium">
                        Failed to load User Guide chapters
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
                        Please check your connection and try again
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const result = await refetchUserGuide();
                          if (result.data && result.data.length > 0 && !selectedSlug) {
                            setSelectedSlug(result.data[0].slug);
                          }
                        }}
                        data-testid="button-retry-user-guide"
                      >
                        Try Again
                      </Button>
                    </div>
                  ) : filteredUserGuideChapters && filteredUserGuideChapters.length > 0 ? (
                    <div className="space-y-1">
                      {filteredUserGuideChapters.map((chapter) => (
                        <button
                          key={chapter.id}
                          onClick={() => setSelectedSlug(chapter.slug)}
                          data-testid={`chapter-${chapter.slug}`}
                          className={cn(
                            "w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm",
                            selectedSlug === chapter.slug
                              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 font-medium"
                              : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                          )}
                        >
                          {chapter.title}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400">
                      <p className="text-sm">No chapters available</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="troubleshooting" className="m-0 p-4">
                  {isLoadingTroubleshooting ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                  ) : troubleshootingError ? (
                    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                      <AlertCircle className="h-8 w-8 text-red-500 dark:text-red-400 mb-3" />
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 font-medium">
                        Failed to load Troubleshooting chapters
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
                        Please check your connection and try again
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const result = await refetchTroubleshooting();
                          if (result.data && result.data.length > 0 && !selectedSlug) {
                            setSelectedSlug(result.data[0].slug);
                          }
                        }}
                        data-testid="button-retry-troubleshooting"
                      >
                        Try Again
                      </Button>
                    </div>
                  ) : troubleshootingChapters && troubleshootingChapters.length > 0 ? (
                    <div className="space-y-1">
                      {troubleshootingChapters.map((chapter) => (
                        <button
                          key={chapter.id}
                          onClick={() => setSelectedSlug(chapter.slug)}
                          data-testid={`chapter-${chapter.slug}`}
                          className={cn(
                            "w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm",
                            selectedSlug === chapter.slug
                              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 font-medium"
                              : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                          )}
                        >
                          {chapter.title}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400">
                      <p className="text-sm">No chapters available</p>
                    </div>
                  )}
                </TabsContent>
                    </ScrollArea>
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Main Content Area */}
                <ResizablePanel defaultSize={75} minSize={50}>
                  <div className="h-full overflow-hidden">
                    <ScrollArea className="h-full">
                      <div className="p-8">
                        {isLoadingChapter ? (
                          <div className="flex flex-col items-center justify-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400 mb-4" />
                            <p className="text-gray-600 dark:text-gray-400">Loading chapter...</p>
                          </div>
                        ) : chapterError ? (
                          <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
                            <AlertCircle className="h-12 w-12 text-red-500 dark:text-red-400 mb-4" />
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                              Failed to Load Chapter
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 max-w-md">
                              Unable to load this chapter. Please check your connection and try again.
                            </p>
                            <Button
                              variant="default"
                              onClick={() => refetchChapter()}
                              data-testid="button-retry-chapter"
                            >
                              Retry Loading Chapter
                            </Button>
                          </div>
                        ) : selectedChapter && selectedChapter.html ? (
                          <div
                            className="prose prose-blue dark:prose-invert max-w-none break-words
                              prose-headings:font-bold
                              prose-h1:text-3xl prose-h1:mb-4 prose-h1:text-gray-900 dark:prose-h1:text-white
                              prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-3 prose-h2:text-gray-900 dark:prose-h2:text-white
                              prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-2 prose-h3:text-gray-900 dark:prose-h3:text-white
                              prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-p:leading-relaxed
                              prose-ul:text-gray-700 dark:prose-ul:text-gray-300
                              prose-ol:text-gray-700 dark:prose-ol:text-gray-300
                              prose-li:marker:text-blue-600 dark:prose-li:marker:text-blue-400
                              prose-strong:text-gray-900 dark:prose-strong:text-white
                              prose-code:text-blue-600 dark:prose-code:text-blue-400 prose-code:bg-blue-50 dark:prose-code:bg-blue-900/20 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:break-all
                              prose-pre:bg-gray-100 dark:prose-pre:bg-gray-900 prose-pre:text-gray-900 dark:prose-pre:text-gray-100 prose-pre:overflow-x-auto prose-pre:whitespace-pre-wrap prose-pre:break-words
                              prose-img:rounded-lg prose-img:shadow-lg prose-img:my-4
                              [&_a]:break-all [&_code]:break-all"
                            dangerouslySetInnerHTML={{ __html: selectedChapter.html }}
                            data-testid="help-content"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-400">
                            <BookOpen className="h-16 w-16 mb-4 text-gray-300 dark:text-gray-600" />
                            <p className="text-lg">Select a chapter to view its content</p>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </Tabs>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
