import { useState, useEffect, useRef } from "react";
import DOMPurify from 'dompurify';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, X, Download, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { getAuthToken } from '@/lib/auth';

// Configure PDF.js worker - use local worker file instead of CDN
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface FilePreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  fileName: string;
  fileExtension: string;
  contentType: string;
  fileSize: number;
  userEmail: string;
  timestamp: string;
  onDownload?: () => void;
}

export default function FilePreviewDialog({
  isOpen,
  onClose,
  fileUrl,
  fileName,
  fileExtension,
  contentType,
  fileSize,
  userEmail,
  timestamp,
  onDownload,
}: FilePreviewDialogProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [textContent, setTextContent] = useState<string>("");
  const [docxHtml, setDocxHtml] = useState<string>("");
  const [xlsxData, setXlsxData] = useState<any[]>([]);
  const [xlsxSheets, setXlsxSheets] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<number>(0);
  const [pptxContent, setPptxContent] = useState<string>("");
  const [rtfHtml, setRtfHtml] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalize file extension to lowercase for consistent comparison
  const normalizedExtension = fileExtension.toLowerCase();

  // Determine file type category
  const isPDF = normalizedExtension === 'pdf';
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(normalizedExtension);
  const isText = ['txt', 'json', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'md', 'xml', 'csv', 'log'].includes(normalizedExtension);
  const isVideo = ['mp4', 'webm', 'ogg'].includes(normalizedExtension);
  const isAudio = ['mp3', 'wav', 'ogg', 'm4a'].includes(normalizedExtension);
  const isDocx = normalizedExtension === 'docx';
  const isXlsx = ['xlsx', 'xls'].includes(normalizedExtension);
  const isPptx = ['pptx', 'ppt'].includes(normalizedExtension);
  const isRtf = normalizedExtension === 'rtf';

  // Protection: Disable right-click and text selection
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Disable Ctrl+C, Ctrl+A, Ctrl+P, F12, etc.
      if (
        (e.ctrlKey && (e.key === 'c' || e.key === 'C' || e.key === 'a' || e.key === 'A' || e.key === 'p' || e.key === 'P')) ||
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && e.key === 'I')
      ) {
        e.preventDefault();
        return false;
      }
    };

    if (isOpen) {
      document.addEventListener('contextmenu', handleContextMenu);
      document.addEventListener('copy', handleCopy);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Load text content
  useEffect(() => {
    if (isText && fileUrl && isOpen) {
      setLoading(true);
      fetch(fileUrl)
        .then(res => res.text())
        .then(text => {
          setTextContent(text);
          setLoading(false);
        })
        .catch(err => {
          setError(`Failed to load text file: ${err.message}`);
          setLoading(false);
        });
    }
  }, [isText, fileUrl, isOpen]);

  // Load and convert DOCX to HTML
  useEffect(() => {
    if (isDocx && fileUrl && isOpen) {
      setLoading(true);
      fetch(fileUrl)
        .then(res => res.arrayBuffer())
        .then(arrayBuffer => mammoth.convertToHtml({ arrayBuffer }))
        .then(result => {
          const sanitizedHtml = DOMPurify.sanitize(result.value);
          setDocxHtml(sanitizedHtml);
          setLoading(false);
        })
        .catch(err => {
          setError(`Failed to load DOCX file: ${err.message}`);
          setLoading(false);
        });
    }
  }, [isDocx, fileUrl, isOpen]);

  // Load and parse XLSX to HTML table
  useEffect(() => {
    if (isXlsx && fileUrl && isOpen) {
      setLoading(true);
      fetch(fileUrl)
        .then(res => res.arrayBuffer())
        .then(arrayBuffer => {
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          const sheetNames = workbook.SheetNames;
          setXlsxSheets(sheetNames);
          
          const firstSheet = workbook.Sheets[sheetNames[0]];
          const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
          setXlsxData(data);
          setActiveSheet(0);
          setLoading(false);
        })
        .catch(err => {
          setError(`Failed to load XLSX file: ${err.message}`);
          setLoading(false);
        });
    }
  }, [isXlsx, fileUrl, isOpen]);

  // Load and parse PPTX to text via backend API
  useEffect(() => {
    if (isPptx && fileUrl && isOpen) {
      setLoading(true);
      
      // Get the JWT token using the same method as other API calls
      const token = getAuthToken();
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      fetch('/api/parse-pptx', {
        method: 'POST',
        headers,
        body: JSON.stringify({ fileUrl }),
        credentials: 'include', // Important for session-based auth
      })
        .then(res => {
          if (!res.ok) {
            throw new Error(`Server returned ${res.status}: ${res.statusText}`);
          }
          return res.json();
        })
        .then(data => {
          setPptxContent(data.content);
          setLoading(false);
        })
        .catch(err => {
          console.error('PPTX parsing error:', err);
          setError(`Failed to parse PowerPoint file: ${err.message}`);
          setLoading(false);
        });
    }
  }, [isPptx, fileUrl, isOpen]);

  // Load and parse RTF to HTML via backend API
  useEffect(() => {
    if (isRtf && fileUrl && isOpen) {
      setLoading(true);
      
      // Get the JWT token using the same method as other API calls
      const token = getAuthToken();
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      fetch('/api/parse-rtf', {
        method: 'POST',
        headers,
        body: JSON.stringify({ fileUrl }),
        credentials: 'include', // Important for session-based auth
      })
        .then(res => {
          if (!res.ok) {
            throw new Error(`Server returned ${res.status}: ${res.statusText}`);
          }
          return res.json();
        })
        .then(data => {
          const sanitizedHtml = DOMPurify.sanitize(data.content);
          setRtfHtml(sanitizedHtml);
          setLoading(false);
        })
        .catch(err => {
          console.error('RTF parsing error:', err);
          setError(`Failed to parse RTF file: ${err.message}`);
          setLoading(false);
        });
    }
  }, [isRtf, fileUrl, isOpen]);

  // Load and render image on canvas
  useEffect(() => {
    if (isImage && fileUrl && isOpen) {
      setLoading(true);
      setError('');
      const img = new Image();
      
      // Only set crossOrigin for non-Azure SAS URLs to avoid CORS issues
      if (!fileUrl.includes('.blob.core.windows.net') && !fileUrl.includes('.dfs.core.windows.net')) {
        img.crossOrigin = 'anonymous';
      }
      
      img.onload = () => {
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // Add watermark
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.font = '20px Arial';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.textAlign = 'center';
            ctx.fillText(userEmail, canvas.width / 2, canvas.height / 2);
            ctx.fillText(new Date(timestamp).toLocaleString(), canvas.width / 2, canvas.height / 2 + 30);
            ctx.restore();
          }
        }
        setImageLoaded(true);
        setLoading(false);
      };
      
      img.onerror = (e) => {
        console.error('Image load error:', e);
        console.error('Image URL:', fileUrl);
        setError('Failed to load image. The file may be corrupted or the URL has expired.');
        setLoading(false);
      };
      
      img.src = fileUrl;
    }
  }, [isImage, fileUrl, scale, isOpen, userEmail, timestamp]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
  };

  const onDocumentLoadError = (error: Error) => {
    setError(`Failed to load PDF: ${error.message}`);
    setLoading(false);
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.2, 3));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.2, 0.5));
  };

  const handlePrevPage = () => {
    setPageNumber(prev => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setPageNumber(prev => Math.min(prev + 1, numPages));
  };

  const handleSheetChange = (sheetIndex: number) => {
    setActiveSheet(sheetIndex);
    setLoading(true);
    fetch(fileUrl)
      .then(res => res.arrayBuffer())
      .then(arrayBuffer => {
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheet = workbook.Sheets[xlsxSheets[sheetIndex]];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        setXlsxData(data);
        setLoading(false);
      })
      .catch(err => {
        setError(`Failed to load sheet: ${err.message}`);
        setLoading(false);
      });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Set loading to false for non-async formats and unsupported types
  useEffect(() => {
    const isSupported = isPDF || isImage || isText || isVideo || isAudio || isDocx || isXlsx || isPptx || isRtf;
    const needsAsync = isPDF || isImage || isText || isDocx || isXlsx || isPptx || isRtf;
    
    // Reset error state when dialog opens
    if (isOpen) {
      setError('');
    }
    
    // For video, audio, and unsupported types, immediately set loading to false
    if (isOpen && !needsAsync) {
      setLoading(false);
    }
    
    // Reset loading when dialog opens
    if (isOpen && isSupported) {
      setLoading(true);
    }
    
    // Reset states when dialog closes
    if (!isOpen) {
      setLoading(true);
      setError('');
      setPageNumber(1);
      setScale(1.0);
      setXlsxData([]);
      setXlsxSheets([]);
      setActiveSheet(0);
      setPptxContent('');
      setRtfHtml('');
    }
  }, [isOpen, isPDF, isImage, isText, isVideo, isAudio, isDocx, isXlsx, isPptx, isRtf]);

  const renderPreview = () => {
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-96 text-red-600" data-testid="preview-error">
          <p className="text-lg font-semibold">Preview Error</p>
          <p className="text-sm mt-2">{error}</p>
          {onDownload && (
            <Button onClick={onDownload} className="mt-4" data-testid="button-download-error">
              <Download className="w-4 h-4 mr-2" />
              Download File Instead
            </Button>
          )}
        </div>
      );
    }

    // PDF Preview
    if (isPDF) {
      return (
        <div className="relative" style={{ userSelect: 'none' }}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-10">
              <div className="flex items-center space-x-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span>Loading PDF...</span>
              </div>
            </div>
          )}
          <Document
            file={fileUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              canvasRef={canvasRef}
            />
          </Document>
          {/* Watermark overlay for PDF */}
          <div 
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{
              background: 'transparent',
            }}
          >
            <div className="text-center opacity-30 select-none" style={{ userSelect: 'none' }}>
              <p className="text-2xl font-bold text-gray-800">{userEmail}</p>
              <p className="text-sm text-gray-600">{new Date(timestamp).toLocaleString()}</p>
            </div>
          </div>
        </div>
      );
    }

    // Image Preview (Canvas)
    if (isImage) {
      return (
        <div className="flex items-center justify-center relative" style={{ userSelect: 'none' }}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-10">
              <div className="flex items-center space-x-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span>Loading image...</span>
              </div>
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-[600px] border"
            data-testid="image-canvas"
          />
        </div>
      );
    }

    // Text Preview
    if (isText) {
      return (
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-10 rounded">
              <div className="flex items-center space-x-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span>Loading text...</span>
              </div>
            </div>
          )}
          <div
            className="bg-gray-50 dark:bg-gray-900 p-4 rounded border max-h-[600px] overflow-auto font-mono text-sm"
            style={{ userSelect: 'none' }}
          >
            <pre className="whitespace-pre-wrap break-words">{textContent}</pre>
          </div>
          {/* Watermark overlay for text */}
          <div 
            className="absolute top-4 right-4 opacity-20 select-none pointer-events-none"
            style={{ userSelect: 'none' }}
          >
            <p className="text-xs text-gray-600">{userEmail}</p>
            <p className="text-xs text-gray-600">{new Date(timestamp).toLocaleString()}</p>
          </div>
        </div>
      );
    }

    // DOCX Preview
    if (isDocx) {
      return (
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-10 rounded">
              <div className="flex items-center space-x-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span>Loading document...</span>
              </div>
            </div>
          )}
          <div
            className="bg-white dark:bg-gray-900 p-6 rounded border max-h-[600px] overflow-auto"
            style={{ userSelect: 'none' }}
          >
            <div 
              className="prose dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: docxHtml }}
              data-testid="docx-content"
            />
          </div>
          {/* Watermark overlay for DOCX */}
          <div 
            className="absolute top-6 right-6 opacity-20 select-none pointer-events-none"
            style={{ userSelect: 'none' }}
          >
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{userEmail}</p>
            <p className="text-xs text-gray-600 dark:text-gray-400">{new Date(timestamp).toLocaleString()}</p>
          </div>
        </div>
      );
    }

    // XLSX Preview
    if (isXlsx) {
      return (
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-10 rounded">
              <div className="flex items-center space-x-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span>Loading spreadsheet...</span>
              </div>
            </div>
          )}
          {xlsxSheets.length > 1 && (
            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">Sheets:</span>
              {xlsxSheets.map((sheetName, index) => (
                <Button
                  key={index}
                  variant={activeSheet === index ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSheetChange(index)}
                  data-testid={`button-sheet-${index}`}
                >
                  {sheetName}
                </Button>
              ))}
            </div>
          )}
          <div
            className="bg-white dark:bg-gray-900 rounded border max-h-[600px] overflow-auto"
            style={{ userSelect: 'none' }}
          >
            <table className="w-full border-collapse text-sm" data-testid="xlsx-table">
              <tbody>
                {xlsxData.map((row: any[], rowIndex) => (
                  <tr key={rowIndex} className={rowIndex === 0 ? 'bg-gray-100 dark:bg-gray-800 font-semibold' : ''}>
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className="border border-gray-300 dark:border-gray-700 px-3 py-2 min-w-[100px]"
                      >
                        {cell !== null && cell !== undefined ? String(cell) : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Watermark overlay for XLSX */}
          <div 
            className="absolute top-6 right-6 opacity-20 select-none pointer-events-none"
            style={{ userSelect: 'none' }}
          >
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{userEmail}</p>
            <p className="text-xs text-gray-600 dark:text-gray-400">{new Date(timestamp).toLocaleString()}</p>
          </div>
        </div>
      );
    }

    // PPTX Preview
    if (isPptx) {
      return (
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-10 rounded">
              <div className="flex items-center space-x-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span>Loading PowerPoint...</span>
              </div>
            </div>
          )}
          <div
            className="bg-white dark:bg-gray-900 p-6 rounded border max-h-[600px] overflow-auto"
            style={{ userSelect: 'none' }}
          >
            <div className="prose dark:prose-invert max-w-none" data-testid="pptx-content">
              <pre className="whitespace-pre-wrap break-words font-sans text-base">
                {pptxContent || 'No text content found in this presentation'}
              </pre>
            </div>
          </div>
          {/* Watermark overlay for PPTX */}
          <div 
            className="absolute top-6 right-6 opacity-20 select-none pointer-events-none"
            style={{ userSelect: 'none' }}
          >
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{userEmail}</p>
            <p className="text-xs text-gray-600 dark:text-gray-400">{new Date(timestamp).toLocaleString()}</p>
          </div>
        </div>
      );
    }

    // RTF Preview
    if (isRtf) {
      return (
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-10 rounded">
              <div className="flex items-center space-x-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span>Loading RTF document...</span>
              </div>
            </div>
          )}
          <div
            className="bg-white dark:bg-gray-900 p-6 rounded border max-h-[600px] overflow-auto"
            style={{ userSelect: 'none' }}
          >
            <div 
              className="prose dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: rtfHtml }}
              data-testid="rtf-content"
            />
          </div>
          {/* Watermark overlay for RTF */}
          <div 
            className="absolute top-6 right-6 opacity-20 select-none pointer-events-none"
            style={{ userSelect: 'none' }}
          >
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{userEmail}</p>
            <p className="text-xs text-gray-600 dark:text-gray-400">{new Date(timestamp).toLocaleString()}</p>
          </div>
        </div>
      );
    }

    // Video Preview
    if (isVideo) {
      return (
        <div className="flex items-center justify-center">
          <video
            src={fileUrl}
            controls
            controlsList="nodownload"
            className="max-w-full max-h-[600px]"
            data-testid="video-player"
          >
            Your browser does not support the video tag.
          </video>
        </div>
      );
    }

    // Audio Preview
    if (isAudio) {
      return (
        <div className="flex flex-col items-center justify-center h-96">
          <Eye className="w-16 h-16 text-gray-400 mb-4" />
          <audio
            src={fileUrl}
            controls
            controlsList="nodownload"
            className="w-full max-w-md"
            data-testid="audio-player"
          >
            Your browser does not support the audio element.
          </audio>
          <p className="text-sm text-gray-500 mt-4">{fileName}</p>
        </div>
      );
    }

    // Unsupported file type
    return (
      <div className="flex flex-col items-center justify-center h-96 text-gray-600" data-testid="preview-unsupported">
        <Eye className="w-16 h-16 text-gray-400 mb-4" />
        <p className="text-lg font-semibold">Preview Not Available</p>
        <p className="text-sm mt-2">This file type cannot be previewed in the browser</p>
        <p className="text-xs text-gray-500 mt-1">File type: {fileExtension.toUpperCase()}</p>
        {onDownload && (
          <Button onClick={onDownload} className="mt-4" data-testid="button-download-unsupported">
            <Download className="w-4 h-4 mr-2" />
            Download File
          </Button>
        )}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-6xl max-h-[90vh] overflow-auto"
        data-testid="dialog-file-preview"
        showClose={false}
      >
        <DialogHeader className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="absolute -right-2 -top-2 h-8 w-8 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100"
            data-testid="button-close-preview"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2 pr-8">
            <Eye className="w-5 h-5" />
            {fileName}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {formatFileSize(fileSize)} • {fileExtension.toUpperCase()}
          </p>
        </DialogHeader>

        <div 
          className="mt-4 min-h-[400px]" 
          ref={containerRef}
          style={{ userSelect: 'none' }}
          data-testid="preview-container"
        >
          {renderPreview()}
        </div>

        {/* Page navigation for PDFs */}
        {isPDF && numPages > 0 && (
          <div className="flex items-center justify-center gap-4 mt-4 pb-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={pageNumber <= 1}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            <span className="text-sm" data-testid="text-page-info">
              Page {pageNumber} of {numPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={pageNumber >= numPages}
              data-testid="button-next-page"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Security notice */}
        <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-sm">
          <p className="text-yellow-800 dark:text-yellow-200 font-medium">🔒 Read-Only Preview</p>
          <p className="text-yellow-700 dark:text-yellow-300 text-xs mt-1">
            This is a secure preview. Copy and paste is disabled. All views are logged for audit purposes.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
