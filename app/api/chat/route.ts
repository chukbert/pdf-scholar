import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateSession, saveMessage, savePageEmbedding, getRelevantPages } from '@/lib/db';
import { generateEmbedding } from '@/lib/embeddings';
import { countMessageTokens, truncateConversation, countTokens } from '@/lib/memory';
import { OLLAMA_CONFIG, getOllamaErrorMessage } from '@/lib/config/ollama';
import { withRetry, shouldRetry } from '@/lib/utils/retry';
import type { ChatMessage } from '@/types';
const MAX_TOKEN_MEMORY = parseInt(process.env.MAX_TOKEN_MEMORY || '32768');
const TOKEN_BUFFER_THRESHOLD = parseInt(process.env.TOKEN_BUFFER_THRESHOLD || '28672');

// Use database instead of in-memory storage
const USE_DB = process.env.DATABASE_URL ? true : false;

// Fallback in-memory storage if DB is not configured
const chatSessions = new Map<string, ChatMessage[]>();

function truncateMessages(messages: any[], maxTokens: number): any[] {
  let totalTokens = 0;
  const truncatedMessages = [];
  
  // Always keep system message if present
  const systemMessage = messages.find(m => m.role === 'system');
  if (systemMessage) {
    truncatedMessages.push(systemMessage);
    totalTokens += countTokens(systemMessage.content);
  }
  
  // Add messages from newest to oldest until we hit the limit
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === 'system') continue;
    
    const messageTokens = countTokens(message.content) + (message.images ? 1000 : 0); // Estimate for images
    if (totalTokens + messageTokens > maxTokens) break;
    
    truncatedMessages.unshift(message);
    totalTokens += messageTokens;
  }
  
  return truncatedMessages;
}

export async function POST(request: NextRequest) {
  try {
    const { chatId, images, userMessage, pageNumbers, extractedText } = await request.json();
    
    let messages: ChatMessage[];
    let session;
    
    if (USE_DB) {
      // Get or create session in database
      session = await getOrCreateSession(chatId);
      messages = session.messages;
    } else {
      // Use in-memory storage
      messages = chatSessions.get(chatId) || [];
    }
    
    // Create user message
    const newUserMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userMessage,
      images: images,
      pageReferences: pageNumbers,
      timestamp: new Date()
    };
    
    const userTokenCount = countMessageTokens(newUserMessage);
    
    // Save user message to DB if available
    if (USE_DB) {
      await saveMessage(chatId, { ...newUserMessage, tokenCount: userTokenCount });
    }
    
    messages.push(newUserMessage);
    
    // Check token count and truncate if necessary
    const truncationResult = truncateConversation(messages, MAX_TOKEN_MEMORY, TOKEN_BUFFER_THRESHOLD);
    
    if (truncationResult.wasTruncated) {
      messages = truncationResult.messages;
    }
    
    // Note: We still save embeddings if database is configured, but don't use them for context
    if (USE_DB && extractedText && pageNumbers?.length > 0) {
      for (let i = 0; i < pageNumbers.length; i++) {
        const pageText = extractedText[i] || '';
        if (pageText) {
          const embedding = await generateEmbedding(pageText);
          await savePageEmbedding(chatId, pageNumbers[i], pageText, embedding);
        }
      }
    }
    
    // Prepare Ollama request - only send current message with images
    const ollamaMessages = [
      {
        role: 'system',
        content: `You are an expert AI tutor helping students understand documents through visual analysis. 
Your task is to analyze the provided page image and explain its content clearly.

Your explanations should be:
1. Simple yet comprehensive - break down complex concepts into understandable parts
2. Clear and structured - use headings, bullet points, and examples
3. Focus on the visual content - describe what you see in the image
4. Reference specific elements visible in the page
5. Provide educational value - help the student understand the material

Analyze the page image provided by the student.`
      },
      {
        role: 'user',
        content: userMessage,
        ...(images && { images: images.map((img: string) => img.split(',')[1]) }) // Remove data:image/png;base64, prefix
      }
    ];
    
    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // First check if Ollama is running
          const testResponse = await withRetry(
            () => fetch(`${OLLAMA_CONFIG.baseUrl}/api/tags`, {
              method: 'GET',
              signal: AbortSignal.timeout(OLLAMA_CONFIG.timeouts.connection)
            }),
            {
              maxAttempts: 2,
              initialDelay: 500,
              onRetry: (attempt, error) => {
                console.log(`Retrying Ollama connection (attempt ${attempt}):`, error.message);
              }
            }
          ).catch(err => {
            console.error('Ollama connection test failed:', err);
            throw new Error(getOllamaErrorMessage(err));
          });

          if (!testResponse.ok) {
            throw new Error(`Ollama responded with ${testResponse.status}: ${testResponse.statusText}`);
          }

          // Check if the model is available
          const models = await testResponse.json();
          const modelExists = models.models?.some((m: any) => m.name === OLLAMA_CONFIG.model);
          if (!modelExists) {
            throw new Error(`Model ${OLLAMA_CONFIG.model} not found. Please pull it with: ollama pull ${OLLAMA_CONFIG.model}`);
          }

          // Make the actual chat request
          const response = await withRetry(
            () => fetch(`${OLLAMA_CONFIG.baseUrl}/api/chat`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: OLLAMA_CONFIG.model,
                messages: ollamaMessages,
                stream: false,
                options: {
                  num_ctx: OLLAMA_CONFIG.modelOptions.numContext,
                  num_predict: OLLAMA_CONFIG.modelOptions.numPredict
                }
              }),
              signal: AbortSignal.timeout(OLLAMA_CONFIG.timeouts.streaming)
            }),
            {
              maxAttempts: OLLAMA_CONFIG.retry.maxAttempts,
              initialDelay: OLLAMA_CONFIG.retry.initialDelay,
              onRetry: (attempt, error) => {
                console.log(`Retrying chat request (attempt ${attempt}):`, error.message);
                // Only retry if it's a retryable error
                if (!shouldRetry(error)) {
                  throw error;
                }
              }
            }
          ).catch(err => {
            console.error('Ollama chat request failed:', err);
            throw new Error(getOllamaErrorMessage(err));
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error('Ollama error response:', errorText);
            throw new Error(`Ollama error (${response.status}): ${errorText || response.statusText}`);
          }
          
          // Parse non-streaming response
          const responseData = await response.json();
          
          if (responseData.error) {
            throw new Error(`Ollama error: ${responseData.error}`);
          }
          
          const assistantMessage = responseData.message?.content || '';
          
          // Send the complete response at once
          const responsePayload = {
            content: assistantMessage,
            done: true
          };
          
          const sseData = `data: ${JSON.stringify(responsePayload)}\n\n`;
          controller.enqueue(encoder.encode(sseData));
          
          // Create assistant message
          const assistantMsg: ChatMessage = {
            id: `msg-${Date.now()}-assistant`,
            role: 'assistant',
            content: assistantMessage,
            pageReferences: pageNumbers,
            timestamp: new Date()
          };
          
          const assistantTokenCount = countMessageTokens(assistantMsg);
          
          // Save to database if available
          if (USE_DB) {
            await saveMessage(chatId, { ...assistantMsg, tokenCount: assistantTokenCount });
          } else {
            // Save to in-memory storage
            messages.push(assistantMsg);
            chatSessions.set(chatId, messages);
          }
          
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          const errorMessage = error instanceof Error ? error.message : 'Streaming failed';
          
          // Send error message to client
          const errorData = `data: ${JSON.stringify({ 
            error: errorMessage,
            type: 'ollama_error',
            details: {
              url: OLLAMA_CONFIG.baseUrl,
              model: OLLAMA_CONFIG.model
            }
          })}\n\n`;
          controller.enqueue(encoder.encode(errorData));
          
          // Send done signal
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
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
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Health check endpoint
  try {
    const response = await fetch(`${OLLAMA_CONFIG.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(OLLAMA_CONFIG.timeouts.connection)
    });
    const data = await response.json();
    
    const modelInfo = data.models?.find((m: any) => m.name === OLLAMA_CONFIG.model);
    
    return NextResponse.json({
      status: 'ok',
      model: OLLAMA_CONFIG.model,
      contextLength: OLLAMA_CONFIG.modelOptions.numContext,
      available: !!modelInfo,
      timestamp: new Date().toISOString(),
      config: {
        timeouts: OLLAMA_CONFIG.timeouts,
        retry: OLLAMA_CONFIG.retry
      }
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: 'Failed to connect to Ollama',
      timestamp: new Date().toISOString()
    }, { status: 503 });
  }
}