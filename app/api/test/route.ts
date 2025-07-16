import { NextResponse } from 'next/server';
import { countTokens } from '@/lib/memory';

export async function GET() {
  try {
    // Test token counting
    const testText = "Hello, this is a test message to verify token counting is working properly.";
    const tokenCount = await countTokens(testText);
    
    // Test Ollama connection
    let ollamaStatus = 'unknown';
    try {
      const response = await fetch(`${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/api/tags`);
      ollamaStatus = response.ok ? 'connected' : 'error';
    } catch (e) {
      ollamaStatus = 'offline';
    }
    
    return NextResponse.json({
      status: 'ok',
      tokenCounting: {
        working: true,
        testText,
        tokenCount,
        method: tokenCount > 0 ? 'success' : 'fallback'
      },
      ollama: {
        status: ollamaStatus,
        url: process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
      },
      database: {
        configured: !!process.env.DATABASE_URL,
        status: 'Using in-memory storage (database not connected)'
      }
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}