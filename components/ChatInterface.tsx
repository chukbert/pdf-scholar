'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { MessageSquare, Loader2, FileText } from 'lucide-react';
import type { ChatMessage } from '@/types';

import 'katex/dist/katex.min.css';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingMessage?: string;
  onPageReference?: (pageNumber: number) => void;
}

export default function ChatInterface({ 
  messages, 
  isStreaming, 
  streamingMessage,
  onPageReference 
}: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage, scrollToBottom]);

  const handlePageClick = (pageNum: number) => {
    onPageReference?.(pageNum);
  };

  const renderContent = (content: string) => {
    // Replace page references with clickable links
    const processedContent = content.replace(
      /\(page (\d+)\)/gi,
      '<page-ref data-page="$1">(page $1)</page-ref>'
    );

    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // @ts-expect-error - custom component
          'page-ref': ({ children, ...props }: any) => {
            const pageNum = parseInt(props['data-page'] as string);
            return (
              <button
                onClick={() => handlePageClick(pageNum)}
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 
                         hover:bg-blue-50 rounded px-1 transition-colors"
                title={`Go to page ${pageNum}`}
              >
                <FileText className="w-3 h-3" />
                {children}
              </button>
            );
          },
          code: ({ className, children, ...props }: any) => {
            const inline = props.inline;
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <div className="relative group">
                <div className="absolute top-2 right-2 text-xs text-gray-400">
                  {match[1]}
                </div>
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              </div>
            ) : (
              <code className="bg-gray-100 text-red-600 px-1 py-0.5 rounded text-sm" {...props}>
                {children}
              </code>
            );
          },
          p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
          h1: ({ children }) => <h1 className="text-2xl font-bold mb-4 mt-6">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xl font-semibold mb-3 mt-5">{children}</h2>,
          h3: ({ children }) => <h3 className="text-lg font-medium mb-2 mt-4">{children}</h3>,
          ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-1">{children}</ol>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-gray-300 pl-4 italic my-4 text-gray-700">
              {children}
            </blockquote>
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    );
  };

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-white">
      <div className="border-b px-4 py-3 flex items-center gap-2 bg-gray-50">
        <MessageSquare className="w-5 h-5 text-gray-600" />
        <h2 className="font-semibold text-gray-800">AI Tutor</h2>
        {messages.length > 0 && (
          <span className="text-sm text-gray-500 ml-auto">
            {messages.length} messages
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !isStreaming && (
          <div className="text-center text-gray-500 mt-8">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-lg font-medium">No messages yet</p>
            <p className="text-sm mt-1">Click &ldquo;Analyze&rdquo; on a PDF page to start learning</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`
                max-w-[85%] rounded-lg px-4 py-3
                ${message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-800'
                }
              `}
            >
              {message.role === 'user' ? (
                <div>
                  <p className="text-sm font-medium mb-1">You</p>
                  <p>{message.content}</p>
                  {message.images && message.images.length > 0 && (
                    <p className="text-xs mt-2 opacity-80">
                      📄 Analyzing {message.images.length} page{message.images.length > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium mb-2 text-gray-600">AI Tutor</p>
                  <div className="prose prose-sm max-w-none">
                    {renderContent(message.content)}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {isStreaming && streamingMessage && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg px-4 py-3 bg-gray-100 text-gray-800">
              <p className="text-sm font-medium mb-2 text-gray-600 flex items-center gap-2">
                AI Tutor <Loader2 className="w-3 h-3 animate-spin" />
              </p>
              <div className="prose prose-sm max-w-none">
                {renderContent(streamingMessage)}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}