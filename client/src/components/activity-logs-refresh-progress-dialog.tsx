import { Dialog, DialogContent } from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/ui/spinner";
import { RefreshCw } from "lucide-react";

interface ActivityLogsRefreshProgressDialogProps {
  isOpen: boolean;
}

export function ActivityLogsRefreshProgressDialog({
  isOpen,
}: ActivityLogsRefreshProgressDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md border-0 bg-transparent shadow-none">
        <div className="flex flex-col items-center justify-center py-12 px-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-lg max-w-sm w-full">
            <div className="flex justify-center mb-6">
              <RefreshCw className="w-12 h-12 text-blue-600 animate-spin" />
            </div>
            
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 text-center mb-2">
              Refreshing Activity Logs
            </h2>
            
            <p className="text-gray-600 dark:text-gray-400 text-center text-sm mb-6">
              Fetching the latest activities...
            </p>
            
            <div className="flex justify-center">
              <LoadingSpinner size="sm" />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
