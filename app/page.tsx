'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Upload, FileText } from 'lucide-react';

// Dynamic import to avoid SSR issues with PDF viewer
const AppLayout = dynamic(() => import('@/components/AppLayout'), { 
  ssr: false,
  loading: () => (
    <div className="h-screen w-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading PDF Scholar...</p>
      </div>
    </div>
  )
});

export default function Home() {
  const [pdfFile, setPdfFile] = useState<string | null>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      const fileUrl = URL.createObjectURL(file);
      setPdfFile(fileUrl);
    }
  };

  if (!pdfFile) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <FileText className="w-16 h-16 text-blue-600 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-800 mb-2">PDF Scholar</h1>
            <p className="text-gray-600">
              Upload a PDF to start learning with your AI tutor
            </p>
          </div>
          
          <label 
            htmlFor="pdf-upload" 
            className="block cursor-pointer"
          >
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600 mb-2">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-gray-500">
                PDF files only
              </p>
            </div>
            <input
              id="pdf-upload"
              type="file"
              accept="application/pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          <div className="mt-6 text-center text-xs text-gray-500">
            <p>Powered by Qwen 2.5-VL running locally via Ollama</p>
            <p className="mt-1">All processing happens on your machine</p>
          </div>
        </div>
      </div>
    );
  }

  return <AppLayout pdfUrl={pdfFile} />;
}
