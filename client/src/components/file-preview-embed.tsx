import { useState, useEffect, useRef } from "react";
import DOMPurify from 'dompurify';
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Play, Pause, Volume2, Maximize, Music, RotateCw } from "lucide-react";
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { getAuthToken } from '@/lib/auth';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface FilePreviewEmbedProps {
  fileUrl: string;
  fileName: string;
  fileExtension: string;
  onTimeUpdate?: (time: number) => void;
  currentTime?: number;
  className?: string;
}

export default function FilePreviewEmbed({
  fileUrl,
  fileName,
  fileExtension,
  onTimeUpdate,
  currentTime,
  className = "",
}: FilePreviewEmbedProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [textContent, setTextContent] = useState<string>("");
  const [docxHtml, setDocxHtml] = useState<string>("");
  const [xlsxData, setXlsxData] = useState<any[]>([]);
  const [xlsxSheets, setXlsxSheets] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<number>(0);
  const [pptxContent, setPptxContent] = useState<string>("");
  const [rtfHtml, setRtfHtml] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [mediaDuration, setMediaDuration] = useState<number>(0);
  const [mediaCurrentTime, setMediaCurrentTime] = useState<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const normalizedExtension = (fileExtension || "").toLowerCase().replace(/^\./, '');

  const isPDF = normalizedExtension === 'pdf';
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'tiff'].includes(normalizedExtension);
  const isText = ['txt', 'json', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'md', 'xml', 'csv', 'log'].includes(normalizedExtension);
  const isVideo = ['mp4', 'webm', 'ogg', 'avi', 'mov', 'mkv', 'wmv'].includes(normalizedExtension);
  const isAudio = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(normalizedExtension);
  const isDocx = normalizedExtension === 'docx' || normalizedExtension === 'doc';
  const isXlsx = ['xlsx', 'xls'].includes(normalizedExtension);
  const isPptx = ['pptx', 'ppt'].includes(normalizedExtension);
  const isRtf = normalizedExtension === 'rtf';

  useEffect(() => {
    if (isText && fileUrl) {
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
  }, [isText, fileUrl]);

  useEffect(() => {
    if (isDocx && fileUrl) {
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
  }, [isDocx, fileUrl]);

  useEffect(() => {
    if (isXlsx && fileUrl) {
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
  }, [isXlsx, fileUrl]);

  useEffect(() => {
    if (isPptx && fileUrl) {
      setLoading(true);
      const token = getAuthToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      fetch('/api/parse-pptx', {
        method: 'POST',
        headers,
        body: JSON.stringify({ fileUrl }),
        credentials: 'include',
      })
        .then(res => res.json())
        .then(data => {
          setPptxContent(data.content);
          setLoading(false);
        })
        .catch(err => {
          setError(`Failed to parse PowerPoint file: ${err.message}`);
          setLoading(false);
        });
    }
  }, [isPptx, fileUrl]);

  useEffect(() => {
    if (isRtf && fileUrl) {
      setLoading(true);
      const token = getAuthToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      fetch('/api/parse-rtf', {
        method: 'POST',
        headers,
        body: JSON.stringify({ fileUrl }),
        credentials: 'include',
      })
        .then(res => res.json())
        .then(data => {
          const sanitizedHtml = DOMPurify.sanitize(data.content);
          setRtfHtml(sanitizedHtml);
          setLoading(false);
        })
        .catch(err => {
          setError(`Failed to parse RTF file: ${err.message}`);
          setLoading(false);
        });
    }
  }, [isRtf, fileUrl]);

  useEffect(() => {
    if (isImage && fileUrl) {
      setLoading(false);
    }
  }, [isImage, fileUrl]);

  useEffect(() => {
    if (isPDF && fileUrl) {
      setLoading(false);
    }
  }, [isPDF, fileUrl]);

  useEffect(() => {
    const needsAsync = isText || isDocx || isXlsx || isPptx || isRtf;
    if (!needsAsync && !isPDF && !isImage && !isVideo && !isAudio) {
      setLoading(false);
    }
  }, [isPDF, isImage, isText, isDocx, isXlsx, isPptx, isRtf, isVideo, isAudio]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
  };

  const onDocumentLoadError = (error: Error) => {
    setError(`Failed to load PDF: ${error.message}`);
    setLoading(false);
  };

  const [rotation, setRotation] = useState<number>(0);

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.2, 3));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const handlePrevPage = () => setPageNumber(prev => Math.max(prev - 1, 1));
  const handleNextPage = () => setPageNumber(prev => Math.min(prev + 1, numPages));

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

  const togglePlayPause = () => {
    const media = videoRef.current || audioRef.current;
    if (media) {
      if (isPlaying) {
        media.pause();
      } else {
        media.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    const media = videoRef.current || audioRef.current;
    if (media) {
      setMediaCurrentTime(media.currentTime);
      onTimeUpdate?.(media.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    const media = videoRef.current || audioRef.current;
    if (media) {
      setMediaDuration(media.duration);
    }
    setLoading(false);
  };

  const handleSeek = (value: number[]) => {
    const media = videoRef.current || audioRef.current;
    if (media && value[0] !== undefined) {
      media.currentTime = value[0];
      setMediaCurrentTime(value[0]);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center h-full text-destructive ${className}`} data-testid="preview-error">
        <p className="text-lg font-semibold">Preview Error</p>
        <p className="text-sm mt-2">{error}</p>
      </div>
    );
  }

  // For video and audio, render immediately to allow streaming - don't block with loading state
  if (isVideo) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        <div className="flex-1 flex items-center justify-center bg-black relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
                <span className="text-sm text-white/80">Loading video...</span>
              </div>
            </div>
          )}
          <video
            ref={videoRef}
            src={fileUrl}
            className="max-w-full max-h-full"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onError={() => setError('Failed to load video')}
            preload="metadata"
            data-testid="video-player"
          />
        </div>
        <div className="p-3 border-t bg-muted/50 space-y-2">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={togglePlayPause} data-testid="button-play-pause">
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <span className="text-sm text-muted-foreground w-20">
              {formatTime(mediaCurrentTime)} / {formatTime(mediaDuration)}
            </span>
            <div className="flex-1">
              <Slider
                value={[mediaCurrentTime]}
                max={mediaDuration || 100}
                step={0.1}
                onValueChange={handleSeek}
                data-testid="slider-video-time"
              />
            </div>
            <Button variant="outline" size="icon" onClick={() => videoRef.current?.requestFullscreen()} data-testid="button-fullscreen">
              <Maximize className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isAudio) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        <div className="flex-1 flex items-center justify-center relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Loading audio...</span>
              </div>
            </div>
          )}
          <div className="flex flex-col items-center gap-4 p-8">
            <div className="w-32 h-32 rounded-full bg-muted flex items-center justify-center">
              <Music className="h-16 w-16 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium truncate max-w-[200px]">{fileName}</p>
          </div>
          <audio
            ref={audioRef}
            src={fileUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onError={() => setError('Failed to load audio')}
            preload="metadata"
            data-testid="audio-player"
          />
        </div>
        <div className="p-3 border-t bg-muted/50 space-y-2">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={togglePlayPause} data-testid="button-play-pause">
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <span className="text-sm text-muted-foreground w-20">
              {formatTime(mediaCurrentTime)} / {formatTime(mediaDuration)}
            </span>
            <div className="flex-1">
              <Slider
                value={[mediaCurrentTime]}
                max={mediaDuration || 100}
                step={0.1}
                onValueChange={handleSeek}
                data-testid="slider-audio-time"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // For PDF, render immediately with overlay loading indicator
  if (isPDF) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        <div className="flex items-center justify-between gap-2 p-2 border-b bg-muted/50">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrevPage} disabled={pageNumber <= 1} data-testid="button-prev-page">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">Page {pageNumber} of {numPages || '...'}</span>
            <Button variant="outline" size="icon" onClick={handleNextPage} disabled={pageNumber >= numPages} data-testid="button-next-page">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handleZoomOut} data-testid="button-zoom-out">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
            <Button variant="outline" size="icon" onClick={handleZoomIn} data-testid="button-zoom-in">
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={handleRotate} title="Rotate 90°" data-testid="button-rotate">
              <RotateCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="flex items-start justify-center p-4 relative">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Loading PDF...</span>
                </div>
              </div>
            )}
            <Document file={fileUrl} onLoadSuccess={onDocumentLoadSuccess} onLoadError={onDocumentLoadError}>
              <Page pageNumber={pageNumber} scale={scale} rotate={rotation} renderTextLayer={false} renderAnnotationLayer={false} />
            </Document>
          </div>
        </ScrollArea>
      </div>
    );
  }

  // For other file types that need full download first, show loading spinner
  if (loading) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading preview...</span>
        </div>
      </div>
    );
  }

  if (isImage) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        <div className="flex items-center justify-center gap-2 p-2 border-b bg-muted/50">
          <Button variant="outline" size="icon" onClick={handleZoomOut} data-testid="button-zoom-out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
          <Button variant="outline" size="icon" onClick={handleZoomIn} data-testid="button-zoom-in">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleRotate} title="Rotate 90°" data-testid="button-rotate">
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="flex items-center justify-center p-4" style={{ minHeight: rotation % 180 !== 0 ? '120%' : undefined }}>
            <img 
              src={fileUrl} 
              alt={fileName}
              style={{ transform: `scale(${scale}) rotate(${rotation}deg)`, transformOrigin: 'center' }}
              className="max-w-full max-h-full object-contain"
              onError={() => setError('Failed to load image')}
              data-testid="image-preview"
            />
          </div>
        </ScrollArea>
      </div>
    );
  }

  if (isText) {
    return (
      <ScrollArea className={`h-full ${className}`}>
        <div className="bg-muted/50 p-4 font-mono text-sm">
          <pre className="whitespace-pre-wrap break-words">{textContent}</pre>
        </div>
      </ScrollArea>
    );
  }

  if (isDocx) {
    return (
      <ScrollArea className={`h-full ${className}`}>
        <div className="bg-background p-6">
          <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: docxHtml }} data-testid="docx-content" />
        </div>
      </ScrollArea>
    );
  }

  if (isXlsx) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        {xlsxSheets.length > 1 && (
          <div className="flex items-center gap-2 p-2 border-b bg-muted/50 flex-wrap">
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
        <ScrollArea className="flex-1">
          <table className="w-full border-collapse text-sm" data-testid="xlsx-table">
            <tbody>
              {xlsxData.map((row: any[], rowIndex) => (
                <tr key={rowIndex} className={rowIndex === 0 ? 'bg-muted font-semibold' : ''}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="border border-border px-3 py-2 min-w-[100px]">
                      {cell !== null && cell !== undefined ? String(cell) : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </div>
    );
  }

  if (isPptx) {
    return (
      <ScrollArea className={`h-full ${className}`}>
        <div className="bg-background p-6">
          <div className="prose dark:prose-invert max-w-none" data-testid="pptx-content">
            <pre className="whitespace-pre-wrap break-words font-sans text-base">
              {pptxContent || 'No text content found in this presentation'}
            </pre>
          </div>
        </div>
      </ScrollArea>
    );
  }

  if (isRtf) {
    return (
      <ScrollArea className={`h-full ${className}`}>
        <div className="bg-background p-6">
          <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: rtfHtml }} data-testid="rtf-content" />
        </div>
      </ScrollArea>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center h-full text-muted-foreground ${className}`}>
      <p className="text-lg">Preview not available for this file type</p>
      <p className="text-sm mt-2">File: {fileName}</p>
    </div>
  );
}
