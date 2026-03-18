/**
 * Folder Download Manager - Handles parallel downloads to user's filesystem
 * Uses File System Access API to write files directly to chosen folder
 * No ZIP creation - preserves folder structure natively
 */

export interface DownloadManifest {
  files: ManifestFile[];
  totalFiles: number;
  totalSize: number;
  totalSizeMB: string;
  expiresIn: number;
  expiresAt: string;
}

export interface ManifestFile {
  path: string;
  url: string;
  size: number;
  contentType: string;
}

export interface DownloadProgress {
  totalFiles: number;
  downloadedFiles: number;
  failedFiles: number;
  bytesDownloaded: number;
  totalBytes: number;
  currentFile: string;
  status: 'preparing' | 'downloading' | 'completed' | 'error' | 'cancelled';
  errors: DownloadError[];
}

export interface DownloadError {
  file: string;
  error: string;
  retryable: boolean;
}

export class FolderDownloadManager {
  private rootDirHandle: FileSystemDirectoryHandle | null = null;
  private concurrency: number;
  private onProgress: (progress: DownloadProgress) => void;
  private progress: DownloadProgress;
  private abortController: AbortController;
  private activeDownloads: Set<Promise<void>>;
  private isCancelled: boolean = false;

  constructor(
    concurrency: number = 16,
    onProgress: (progress: DownloadProgress) => void
  ) {
    this.concurrency = concurrency;
    this.onProgress = onProgress;
    this.abortController = new AbortController();
    this.activeDownloads = new Set();
    this.progress = {
      totalFiles: 0,
      downloadedFiles: 0,
      failedFiles: 0,
      bytesDownloaded: 0,
      totalBytes: 0,
      currentFile: '',
      status: 'preparing',
      errors: [],
    };
  }

  /**
   * Prompt user to select destination folder
   */
  async selectDestinationFolder(): Promise<boolean> {
    try {
      // @ts-ignore - File System Access API
      this.rootDirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
      });
      return true;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('User cancelled folder selection');
        return false;
      }
      throw new Error(`Failed to select folder: ${error.message}`);
    }
  }

  /**
   * Download all files from manifest to selected folder
   */
  async downloadManifest(manifest: DownloadManifest): Promise<void> {
    if (!this.rootDirHandle) {
      throw new Error('No destination folder selected');
    }

    // FIX: Reset AbortController to allow reuse after cancellation
    this.abortController = new AbortController();
    this.activeDownloads.clear();

    this.progress = {
      totalFiles: manifest.files.length,
      downloadedFiles: 0,
      failedFiles: 0,
      bytesDownloaded: 0,
      totalBytes: manifest.totalSize,
      currentFile: '',
      status: 'downloading',
      errors: [],
    };

    this.updateProgress();

    // Process files in batches with concurrency control
    const queue = [...manifest.files];
    const downloadPromises: Promise<void>[] = [];

    while (queue.length > 0 || this.activeDownloads.size > 0) {
      // Check if cancelled
      if (this.abortController.signal.aborted) {
        this.progress.status = 'cancelled';
        this.updateProgress();
        throw new Error('Download cancelled by user');
      }

      // Fill up to concurrency limit
      while (this.activeDownloads.size < this.concurrency && queue.length > 0) {
        const file = queue.shift()!;
        const downloadPromise = this.downloadFile(file);
        this.activeDownloads.add(downloadPromise);
        
        downloadPromise
          .catch(() => {}) // Errors handled in downloadFile
          .finally(() => {
            this.activeDownloads.delete(downloadPromise);
          });
      }

      // Wait for at least one download to complete
      if (this.activeDownloads.size > 0) {
        await Promise.race(this.activeDownloads);
      }
    }

    // All downloads complete
    this.progress.status = this.progress.failedFiles > 0 ? 'error' : 'completed';
    this.updateProgress();

    if (this.progress.failedFiles > 0) {
      throw new Error(
        `Download completed with ${this.progress.failedFiles} failed files`
      );
    }
  }

  /**
   * Download a single file and write to filesystem with retry logic
   */
  private async downloadFile(file: ManifestFile, maxRetries: number = 3): Promise<void> {
    this.progress.currentFile = file.path;
    this.updateProgress();

    let lastError: Error | null = null;

    // FIX: Retry with exponential backoff
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let attemptBytes = 0; // FIX: Track bytes for this attempt only

      try {
        // Check if cancelled before each attempt
        if (this.abortController.signal.aborted) {
          throw new Error('Download cancelled by user');
        }

        // Create nested folder structure if needed
        const pathParts = file.path.split('/');
        const fileName = pathParts.pop()!;
        let currentDir = this.rootDirHandle!;

        // Create intermediate directories
        for (const dirName of pathParts) {
          currentDir = await currentDir.getDirectoryHandle(dirName, { create: true });
        }

        // Download file
        const response = await fetch(file.url, {
          signal: this.abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Get writable stream for the file
        const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();

        // Stream the response directly to file
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          await writable.write(value);
          attemptBytes += value.length;
          this.progress.bytesDownloaded += value.length;
          
          // Update progress every 100KB
          if (attemptBytes % 102400 < value.length) {
            this.updateProgress();
          }
        }

        await writable.close();

        // Success!
        this.progress.downloadedFiles++;
        this.updateProgress();
        return; // Exit retry loop on success
      } catch (error: any) {
        lastError = error;

        // FIX: Subtract bytes from failed attempt to prevent double-counting
        this.progress.bytesDownloaded -= attemptBytes;

        // Don't retry if user cancelled
        if (this.abortController.signal.aborted || error.message?.includes('cancelled')) {
          break;
        }

        // If this isn't the last attempt, wait before retrying (exponential backoff)
        if (attempt < maxRetries) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt), 8000); // Max 8s delay
          console.warn(`Retry ${attempt + 1}/${maxRetries} for ${file.path} after ${delayMs}ms (rolled back ${attemptBytes} bytes)...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    // All retries exhausted - mark as failed
    this.progress.failedFiles++;
    this.progress.errors.push({
      file: file.path,
      error: lastError?.message || 'Unknown error',
      retryable: !this.abortController.signal.aborted,
    });
    this.updateProgress();
  }

  /**
   * Cancel ongoing downloads
   */
  cancel(): void {
    this.isCancelled = true;
    this.abortController.abort();
  }

  /**
   * Notify progress callback (only if not cancelled to prevent dialog resurrection)
   */
  private updateProgress(): void {
    // Prevent progress updates after cancel to avoid reopening the dialog
    if (!this.isCancelled) {
      this.onProgress({ ...this.progress });
    }
  }

  /**
   * Get current progress
   */
  getProgress(): DownloadProgress {
    return { ...this.progress };
  }
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format download speed
 */
export function formatSpeed(bytesPerSecond: number): string {
  return formatBytes(bytesPerSecond) + '/s';
}
