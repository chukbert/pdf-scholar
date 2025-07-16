import { NextRequest, NextResponse } from 'next/server';

// Mock endpoint for testing without Ollama
export async function POST(request: NextRequest) {
  try {
    const { messages, images } = await request.json();
    
    // Simulate streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const mockResponse = `I'm a mock AI tutor response. In a real scenario with Ollama running, I would analyze the PDF page you shared and provide detailed explanations.

**What I would normally do:**
1. Examine the visual content of the page
2. Extract and explain key concepts
3. Break down complex ideas into simpler terms
4. Provide examples and analogies
5. Reference specific elements on the page

To enable real AI analysis:
\`\`\`bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama
ollama serve

# Pull the vision model
ollama pull qwen2.5vl:3b
\`\`\`

This is a mock response for testing the UI.`;

        // Simulate streaming by sending words one at a time
        const words = mockResponse.split(' ');
        for (const word of words) {
          const data = `data: ${JSON.stringify({ content: word + ' ' })}\n\n`;
          controller.enqueue(encoder.encode(data));
          await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay
        }
        
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    });
    
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Mock API error' },
      { status: 500 }
    );
  }
}