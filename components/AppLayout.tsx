'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import PDFViewer, { PDFViewerHandle } from './PDFViewer';
import ChatInterface from './ChatInterface';
import type { ChatMessage, AnalyzedPage } from '@/types';

interface AppLayoutProps {
  pdfUrl: string;
}

export default function AppLayout({ pdfUrl }: AppLayoutProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [analyzedPages, setAnalyzedPages] = useState<AnalyzedPage[]>([]);
  const [currentChatId] = useState(() => `chat-${Date.now()}`);
  const [currentPage, setCurrentPage] = useState(1);
  const pdfViewerRef = useRef<PDFViewerHandle>(null);

  // Load panel sizes from localStorage
  const [panelSizes, setPanelSizes] = useState<number[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pdfscholar-panel-sizes');
      return saved ? JSON.parse(saved) : [50, 50];
    }
    return [50, 50];
  });

  // Save panel sizes to localStorage
  const handlePanelResize = useCallback((sizes: number[]) => {
    setPanelSizes(sizes);
    localStorage.setItem('pdfscholar-panel-sizes', JSON.stringify(sizes));
  }, []);

  const handleAnalyze = useCallback(async (pageNumbers: number[], images: string[]) => {
    // Rate limit check (1 request per second)
    const now = Date.now();
    const lastAnalyze = parseInt(localStorage.getItem('last-analyze') || '0');
    if (now - lastAnalyze < 1000) {
      console.log('Rate limited - please wait');
      return;
    }
    localStorage.setItem('last-analyze', now.toString());

    // Create user message
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: `Please analyze and explain page ${pageNumbers.join(', ')} of this document. Provide a clear, simple yet deep explanation that helps me understand the content better.`,
      images: images,
      pageReferences: pageNumbers,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsStreaming(true);
    setStreamingMessage('');

    // Mark pages as analyzed
    const newAnalyzedPages: AnalyzedPage[] = pageNumbers.map(num => ({
      pageNumber: num,
      analyzedAt: new Date()
    }));
    setAnalyzedPages(prev => [...prev, ...newAnalyzedPages]);

    try {
      // Always use the real chat endpoint
      const endpoint = '/api/chat';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId: currentChatId,
          images: images,
          userMessage: userMessage.content,
          pageNumbers: pageNumbers
        })
      });

      if (!response.ok) throw new Error('Failed to analyze');

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullMessage = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              if (line === 'data: [DONE]') continue;
              
              try {
                const data = JSON.parse(line.slice(6));
                if (data.error) {
                  // Handle error from API
                  console.error('API Error:', data);
                  throw new Error(data.error);
                }
                if (data.content) {
                  fullMessage += data.content;
                  setStreamingMessage(fullMessage);
                }
              } catch (e) {
                if (e instanceof Error && (e.message.includes('Ollama') || e.message.includes('Cannot connect'))) {
                  throw e; // Re-throw Ollama errors
                }
                // Skip parsing errors for [DONE] or malformed data
                if (line !== 'data: [DONE]') {
                  console.error('Error parsing SSE:', e, 'Line:', line);
                }
              }
            }
          }
        }
      }

      // Add assistant message
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}-response`,
        role: 'assistant',
        content: fullMessage,
        pageReferences: pageNumbers,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error analyzing page:', error);
      
      // Provide specific error message based on the error type
      let errorContent = 'Sorry, I encountered an error while analyzing the page.';
      
      if (error instanceof Error) {
        if (error.message.includes('Cannot connect to Ollama') || error.message.includes('Ollama is not running')) {
          errorContent = `⚠️ **Ollama Connection Failed**\n\nCannot connect to Ollama. Please ensure:\n\n1. **Ollama is installed**: \`curl -fsSL https://ollama.com/install.sh | sh\`\n2. **Ollama is running**: \`ollama serve\`\n3. **Model is pulled**: \`ollama pull qwen2.5vl:3b\`\n\nThe app is trying to connect to: \`${process.env.NEXT_PUBLIC_OLLAMA_BASE_URL || 'http://localhost:11434'}\`\n\nThen try analyzing again!`;
        } else if (error.message.includes('Model') && error.message.includes('not found')) {
          errorContent = `⚠️ **Model Not Found**\n\n${error.message}\n\nThe vision-language model is required for analyzing PDF pages with images.`;
        } else if (error.message.includes('timed out')) {
          errorContent = `⏱️ **Request Timed Out**\n\n${error.message}\n\nThis might happen when:\n- The model is being loaded for the first time\n- The server is under heavy load\n- Your system resources are limited\n\nPlease try again in a moment.`;
        } else if (error.message.includes('Failed to analyze')) {
          errorContent = `❌ **Analysis failed**\n\n${error.message}`;
        } else {
          errorContent = `❌ **Error**\n\n${error.message}`;
        }
      }
      
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: errorContent,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsStreaming(false);
      setStreamingMessage('');
    }
  }, [currentChatId]);

  const handlePageReference = useCallback((pageNumber: number) => {
    setCurrentPage(pageNumber);
    // Scroll PDF viewer to the specified page
    if (pdfViewerRef.current?.goToPage) {
      pdfViewerRef.current.goToPage(pageNumber);
    }
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-100">
      <PanelGroup 
        direction="horizontal" 
        onLayout={handlePanelResize}
        autoSaveId="pdfscholar-layout"
      >
        <Panel defaultSize={panelSizes[0]} minSize={30}>
          <PDFViewer
            ref={pdfViewerRef}
            pdfUrl={pdfUrl}
            onAnalyze={handleAnalyze}
            analyzedPages={analyzedPages}
            onPageChange={setCurrentPage}
            currentPage={currentPage}
          />
        </Panel>
        
        <PanelResizeHandle className="w-2 bg-gray-300 hover:bg-gray-400 transition-colors cursor-col-resize" />
        
        <Panel defaultSize={panelSizes[1]} minSize={30}>
          <ChatInterface
            messages={messages}
            isStreaming={isStreaming}
            streamingMessage={streamingMessage}
            onPageReference={handlePageReference}
          />
        </Panel>
      </PanelGroup>
    </div>
  );
}