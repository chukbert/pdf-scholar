export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[]; // base64 encoded images
  pageReferences?: number[]; // pages referenced in this message
  timestamp: Date;
  tokenCount?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  tokenCount: number;
  currentPdfUrl?: string;
}

export interface AnalyzedPage {
  pageNumber: number;
  analyzedAt: Date;
  extractedText?: string;
  embeddingId?: string;
}

export interface PDFViewerState {
  currentPage: number;
  totalPages: number;
  scale: number;
  analyzedPages: AnalyzedPage[];
  viewMode: 'single' | 'continuous';
}

export interface StreamResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

export interface OllamaOptions {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  num_ctx?: number;
}

export interface PageCapture {
  pageNumber: number;
  imageData: string; // base64
  extractedText?: string;
}