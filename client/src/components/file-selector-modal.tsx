import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRole } from "@/contexts/role-context";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, 
  FolderOpen, 
  ChevronRight, 
  Folder, 
  FileText, 
  Music, 
  Video, 
  Image,
  ArrowLeft,
  RefreshCw,
  Check
} from "lucide-react";

interface FileItem {
  name: string;
  path: string;
  type: "file" | "folder" | "directory";
  size?: number;
  lastModified?: string;
  extension?: string;
}

interface FileSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (file: FileItem) => void;
  supportedExtensions?: string[];
}

const isFolder = (file: FileItem) => file.type === 'folder' || file.type === 'directory';

const DEFAULT_SUPPORTED = [
  'pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'txt', 'rtf', 'html', 'md',
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'webp',
  'mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac',
  'mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv'
];

export default function FileSelectorModal({
  isOpen,
  onClose,
  onSelect,
  supportedExtensions = DEFAULT_SUPPORTED,
}: FileSelectorModalProps) {
  const { selectedOrganizationId } = useRole();
  const { isAuthenticated } = useAuth();
  const [currentPath, setCurrentPath] = useState("");
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);

  const { data: files = [], isLoading, isFetching, refetch } = useQuery<FileItem[]>({
    queryKey: ['/api/files', selectedOrganizationId, currentPath],
    queryFn: async () => {
      if (!selectedOrganizationId) return [];
      const params = new URLSearchParams();
      params.append('organizationId', String(selectedOrganizationId));
      if (currentPath) {
        params.append('path', currentPath);
      }
      const res = await apiRequest("GET", `/api/files?${params.toString()}`);
      return await res.json();
    },
    enabled: isOpen && !!selectedOrganizationId && isAuthenticated,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const getFileExtension = (file: FileItem): string => {
    if (file.extension) return file.extension.replace(/^\./, '').toLowerCase();
    const parts = file.name.split('.');
    if (parts.length > 1) return parts[parts.length - 1].toLowerCase();
    return '';
  };

  const isFileSupported = (file: FileItem) => {
    if (isFolder(file)) return true;
    const ext = getFileExtension(file);
    if (!ext) return false;
    return supportedExtensions.includes(ext);
  };

  const getFileIcon = (file: FileItem) => {
    if (isFolder(file)) return <Folder className="h-4 w-4 text-yellow-500" />;
    const ext = getFileExtension(file);
    if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(ext)) return <Music className="h-4 w-4 text-purple-500" />;
    if (['mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv'].includes(ext)) return <Video className="h-4 w-4 text-red-500" />;
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'webp'].includes(ext)) return <Image className="h-4 w-4 text-green-500" />;
    return <FileText className="h-4 w-4 text-blue-500" />;
  };

  const goBack = () => {
    const parts = currentPath.split('/').filter(Boolean);
    if (parts.length > 0) {
      parts.pop();
      setCurrentPath(parts.join('/'));
      setSelectedFile(null);
    }
  };

  const navigateToFolder = (folder: FileItem) => {
    const newPath = currentPath ? `${currentPath}/${folder.name}` : folder.name;
    setCurrentPath(newPath);
    setSelectedFile(null);
  };

  const selectFile = (file: FileItem) => {
    if (file.type === 'file' && isFileSupported(file)) {
      setSelectedFile(file);
    }
  };

  const handleConfirm = () => {
    if (selectedFile) {
      onSelect(selectedFile);
      onClose();
      setSelectedFile(null);
      setCurrentPath("");
    }
  };

  const handleClose = () => {
    onClose();
    setSelectedFile(null);
    setCurrentPath("");
  };

  const pathParts = currentPath.split('/').filter(Boolean);

  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      if (isFolder(a) && !isFolder(b)) return -1;
      if (!isFolder(a) && isFolder(b)) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [files]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Select File
          </DialogTitle>
          <DialogDescription>
            Choose a file to analyze with Content Understanding
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={goBack}
            disabled={!currentPath}
            className="p-1"
            data-testid="button-go-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-muted-foreground">/</span>
          {pathParts.map((part, index) => (
            <span key={index} className="flex items-center gap-1">
              <span>{part}</span>
              {index < pathParts.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            </span>
          ))}
          {pathParts.length === 0 && <span className="text-muted-foreground">Root</span>}
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <ScrollArea className="border rounded-md h-[400px]">
          <div className="p-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No files found</p>
              </div>
            ) : (
              <div className="space-y-1">
                {sortedFiles.map((file) => (
                  <div
                    key={file.path}
                    className={`flex items-center gap-2 p-2 rounded-md cursor-pointer hover-elevate ${
                      selectedFile?.path === file.path ? 'bg-accent' : ''
                    } ${!isFolder(file) && !isFileSupported(file) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => isFolder(file) ? navigateToFolder(file) : selectFile(file)}
                    data-testid={`file-item-${file.name}`}
                  >
                    {getFileIcon(file)}
                    <span className="flex-1 truncate">{file.name}</span>
                    {selectedFile?.path === file.path && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                    {!isFolder(file) && !isFileSupported(file) && (
                      <Badge variant="secondary" className="text-xs">Unsupported</Badge>
                    )}
                    {isFolder(file) && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        {selectedFile && (
          <div className="flex items-center justify-between p-3 bg-accent/50 rounded-md">
            <div className="flex items-center gap-2">
              {getFileIcon(selectedFile)}
              <div>
                <p className="font-medium text-sm">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">{selectedFile.path}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel">
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedFile} data-testid="button-confirm-select">
            Select File
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
