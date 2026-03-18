import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";

interface AIAgentProgressDialogProps {
  isOpen: boolean;
  fileName: string;
  fileSize: number;
  agentName: string;
  status: string;
}

/**
 * Progress dialog for AI Agent file processing
 * Shows:
 * - File being processed (name and size)
 * - AI Agent being used
 * - Real-time status updates
 */
export default function AIAgentProgressDialog({
  isOpen,
  fileName,
  fileSize,
  agentName,
  status,
}: AIAgentProgressDialogProps) {
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent showClose={false} className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing File
          </DialogTitle>
          <DialogDescription>AI Agent is processing your file</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Information */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">File</div>
            <div className="flex flex-col gap-1">
              <div className="text-sm text-foreground truncate" data-testid="text-file-name">
                {fileName}
              </div>
              <div className="text-xs text-muted-foreground" data-testid="text-file-size">
                {formatBytes(fileSize)}
              </div>
            </div>
          </div>

          {/* Agent Information */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">AI Agent</div>
            <div className="text-sm text-foreground" data-testid="text-agent-name">
              {agentName}
            </div>
          </div>

          {/* Progress Indicator */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">Status</div>
            <Progress value={100} className="h-2" />
            <div className="text-sm text-muted-foreground" data-testid="text-status">
              {status}
            </div>
          </div>

          {/* Processing Notice */}
          <div className="rounded-md bg-muted p-3">
            <p className="text-xs text-muted-foreground">
              Processing in progress. Please wait while the AI Agent analyzes your file.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
