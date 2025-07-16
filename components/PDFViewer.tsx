'use client';

import React, { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Worker, Viewer, SpecialZoomLevel } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import { BookOpen, Zap, AlertCircle } from 'lucide-react';
import type { PDFViewerState, AnalyzedPage } from '@/types';
import { checkOllamaHealth, formatOllamaError } from '@/lib/ollama-client';

import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

interface PDFViewerProps {
  pdfUrl: string;
  onAnalyze: (pageNumbers: number[], images: string[]) => void;
  analyzedPages: AnalyzedPage[];
  onPageChange?: (page: number) => void;
  currentPage?: number;
}

export interface PDFViewerHandle {
  goToPage: (page: number) => void;
}

const PDFViewer = forwardRef<PDFViewerHandle, PDFViewerProps>(({ 
  pdfUrl, 
  onAnalyze, 
  analyzedPages, 
  onPageChange,
  currentPage = 1 
}, ref) => {
  const [viewerState, setViewerState] = useState<PDFViewerState>({
    currentPage: 1,
    totalPages: 0,
    scale: 1,
    analyzedPages: analyzedPages,
    viewMode: 'single'
  });
  
  const [isCapturing, setIsCapturing] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'ready' | 'error'>('checking');
  const [ollamaError, setOllamaError] = useState<string>('');
  const viewerRef = useRef<any>(null);
  const pdfDocRef = useRef<any>(null);
  const pluginInstance = useRef<any>(null);

  const defaultLayoutPluginInstance = defaultLayoutPlugin({
    sidebarTabs: (defaultTabs) => [
      defaultTabs[0], // Thumbnails
    ],
  });
  
  pluginInstance.current = defaultLayoutPluginInstance;

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    goToPage: (pageNumber: number) => {
      if (pluginInstance.current && pageNumber > 0 && pageNumber <= viewerState.totalPages) {
        const { jumpToPage } = pluginInstance.current;
        if (jumpToPage) {
          jumpToPage(pageNumber - 1); // PDF.js uses 0-based indexing
        }
      }
    }
  }), [viewerState.totalPages]);

  const handleDocumentLoad = useCallback((e: any) => {
    const { doc } = e;
    pdfDocRef.current = doc;
    setViewerState(prev => ({
      ...prev,
      totalPages: doc.numPages
    }));
  }, []);

  const handlePageChange = useCallback((e: any) => {
    const newPage = e.currentPage + 1;
    setViewerState(prev => ({
      ...prev,
      currentPage: newPage
    }));
    onPageChange?.(newPage);
  }, [onPageChange]);

  // Check Ollama status on mount and periodically
  useEffect(() => {
    const checkStatus = async () => {
      try {
        console.log('Checking Ollama health...');
        const health = await checkOllamaHealth();
        console.log('Health response:', health);
        
        if (health.checks.connection && health.checks.modelAvailable) {
          setOllamaStatus('ready');
          setOllamaError('');
          console.log('Ollama status: ready');
        } else {
          setOllamaStatus('error');
          setOllamaError(formatOllamaError(health));
          console.log('Ollama status: error', formatOllamaError(health));
        }
      } catch (err) {
        console.error('Health check failed:', err);
        setOllamaStatus('error');
        setOllamaError('Failed to check Ollama status');
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const captureCurrentPage = useCallback(async () => {
    console.log('Capture page called:', {
      hasPdfDoc: !!pdfDocRef.current,
      isCapturing,
      ollamaStatus
    });
    
    if (!pdfDocRef.current || isCapturing || ollamaStatus !== 'ready') {
      console.log('Capture blocked:', {
        noPdfDoc: !pdfDocRef.current,
        isCapturing,
        ollamaNotReady: ollamaStatus !== 'ready'
      });
      return;
    }
    
    setIsCapturing(true);
    
    try {
      const pageNumber = viewerState.currentPage;
      const page = await pdfDocRef.current.getPage(pageNumber);
      
      // Create canvas for rendering
      const viewport = page.getViewport({ scale: 2.0 * window.devicePixelRatio });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      // Render PDF page to canvas
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };
      
      await page.render(renderContext).promise;
      
      // Convert to blob
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => resolve(blob!), 'image/png', 1.0);
      });
      
      // Convert to base64
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      
      reader.onloadend = () => {
        const base64 = reader.result as string;
        onAnalyze([pageNumber], [base64]);
      };
      
    } catch (error) {
      console.error('Error capturing page:', error);
    } finally {
      setIsCapturing(false);
    }
  }, [viewerState.currentPage, onAnalyze, isCapturing, ollamaStatus]);

  // Keyboard shortcut for analyze
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'a' || e.key === 'A') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          captureCurrentPage();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [captureCurrentPage]);

  const isPageAnalyzed = (pageNum: number) => {
    return analyzedPages.some(p => p.pageNumber === pageNum);
  };

  return (
    <div className="relative h-full w-full flex flex-col bg-gray-50">
      <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
        {ollamaStatus === 'error' && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded-lg text-sm max-w-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Ollama Not Available</p>
                <p className="text-xs mt-1">{ollamaError}</p>
              </div>
            </div>
          </div>
        )}
        <button
          onClick={() => {
            console.log('Analyze button clicked');
            captureCurrentPage();
          }}
          disabled={isCapturing || ollamaStatus !== 'ready'}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg font-medium
            transition-all duration-200 shadow-lg
            ${isCapturing || ollamaStatus !== 'ready'
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
              : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
            }
          `}
          title={ollamaStatus === 'ready' ? "Analyze current page (Press 'A')" : ollamaError}
        >
          <Zap className={`w-5 h-5 ${isCapturing ? 'animate-pulse' : ''}`} />
          {isCapturing ? 'Analyzing...' : ollamaStatus === 'checking' ? 'Checking...' : 'Analyze'}
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        <Worker workerUrl="/pdf-worker/pdf.worker.min.js">
          <div ref={viewerRef} className="h-full">
            <Viewer
              fileUrl={pdfUrl}
              plugins={[defaultLayoutPluginInstance]}
              defaultScale={SpecialZoomLevel.PageFit}
              onDocumentLoad={handleDocumentLoad}
              onPageChange={handlePageChange}
              renderPage={(props) => (
                <>
                  {props.canvasLayer.children}
                  {props.textLayer.children}
                  {props.annotationLayer.children}
                  {isPageAnalyzed(props.pageIndex + 1) && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                      Analyzed
                    </div>
                  )}
                </>
              )}
            />
          </div>
        </Worker>
      </div>

      <div className="p-2 bg-white border-t flex items-center justify-between text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          <span>Page {viewerState.currentPage} of {viewerState.totalPages}</span>
        </div>
        <div className="text-xs">
          Press &apos;A&apos; to analyze current page
        </div>
      </div>
    </div>
  );
});

PDFViewer.displayName = 'PDFViewer';

export default PDFViewer;