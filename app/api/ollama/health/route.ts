import { NextResponse } from 'next/server';
import { OLLAMA_CONFIG, getOllamaErrorMessage } from '@/lib/config/ollama';
import { withRetry, shouldRetry } from '@/lib/utils/retry';

export async function GET() {
  const results = {
    ollama: {
      url: OLLAMA_CONFIG.baseUrl,
      model: OLLAMA_CONFIG.model,
      status: 'unknown',
      error: null as string | null,
      models: [] as string[],
      contextSize: OLLAMA_CONFIG.modelOptions.numContext
    },
    checks: {
      connection: false,
      modelAvailable: false,
      testGeneration: false
    },
    timestamp: new Date().toISOString()
  };

  try {
    // Test 1: Basic connection
    const tagsResponse = await withRetry(
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
    );

    if (!tagsResponse.ok) {
      throw new Error(`Ollama responded with ${tagsResponse.status}: ${tagsResponse.statusText}`);
    }

    results.checks.connection = true;
    results.ollama.status = 'connected';

    // Test 2: Check available models
    const modelsData = await tagsResponse.json();
    results.ollama.models = modelsData.models?.map((m: any) => m.name) || [];
    
    results.checks.modelAvailable = results.ollama.models.includes(OLLAMA_CONFIG.model);

    if (!results.checks.modelAvailable) {
      results.ollama.error = `Model ${OLLAMA_CONFIG.model} not found. Available models: ${results.ollama.models.join(', ')}`;
    }

    // Test 3: Try a simple generation (non-streaming)
    if (results.checks.modelAvailable) {
      try {
        const testResponse = await withRetry(
          () => fetch(`${OLLAMA_CONFIG.baseUrl}/api/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: OLLAMA_CONFIG.model,
              prompt: 'Say "test successful" and nothing else.',
              stream: false,
              options: {
                temperature: 0,
                num_ctx: OLLAMA_CONFIG.modelOptions.numContext,
                num_predict: 50  // Small output for health check
              }
            }),
            signal: AbortSignal.timeout(OLLAMA_CONFIG.timeouts.testGeneration)
          }),
          {
            maxAttempts: OLLAMA_CONFIG.retry.maxAttempts,
            initialDelay: OLLAMA_CONFIG.retry.initialDelay,
            onRetry: (attempt, error) => {
              console.log(`Retrying test generation (attempt ${attempt}):`, error.message);
            }
          }
        );

        if (testResponse.ok) {
          const testData = await testResponse.json();
          if (testData.response) {
            results.checks.testGeneration = true;
          }
        }
      } catch (testErr) {
        console.error('Test generation failed:', testErr);
        // Not critical if test generation fails
      }
    }

  } catch (error) {
    results.ollama.status = 'error';
    results.ollama.error = getOllamaErrorMessage(error);
  }

  // Determine overall health
  const isHealthy = results.checks.connection && results.checks.modelAvailable;

  return NextResponse.json(results, {
    status: isHealthy ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store'
    }
  });
}