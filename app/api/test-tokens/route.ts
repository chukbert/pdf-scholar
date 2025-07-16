import { NextRequest, NextResponse } from 'next/server';
import { countTokens } from '@/lib/memory';

export async function GET(request: NextRequest) {
  try {
    const testText = request.nextUrl.searchParams.get('text') || 'Hello, world!';
    
    const tokenCount = countTokens(testText);
    
    return NextResponse.json({
      success: true,
      text: testText,
      tokenCount,
      characterCount: testText.length,
      ratio: (testText.length / tokenCount).toFixed(2),
      method: 'See console for which method was used'
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      fallback: 'Token counting failed, but the app should still work with fallback estimation'
    }, { status: 500 });
  }
}