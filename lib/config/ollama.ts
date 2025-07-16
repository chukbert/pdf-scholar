export const OLLAMA_CONFIG = {
  // Base URL for Ollama API
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  
  // Model to use
  model: process.env.OLLAMA_MODEL || 'qwen2.5vl:3b',
  
  // Timeout configurations - all set to 10 minutes
  timeouts: {
    // All timeouts set to 10 minutes (600000ms)
    connection: 600000,
    testGeneration: 600000,
    streaming: 600000,
    default: 600000
  },
  
  // Retry configuration
  retry: {
    enabled: process.env.OLLAMA_RETRY_ENABLED !== 'false',
    maxAttempts: parseInt(process.env.OLLAMA_RETRY_ATTEMPTS || '1'),
    initialDelay: parseInt(process.env.OLLAMA_RETRY_DELAY || '1000'),
    maxDelay: parseInt(process.env.OLLAMA_RETRY_MAX_DELAY || '1000')
  },
  
  // Model options - only keep context size and max output tokens
  modelOptions: {
    numContext: parseInt(process.env.OLLAMA_NUM_CONTEXT || '32768'),
    numPredict: parseInt(process.env.OLLAMA_NUM_PREDICT || '2000')
  }
};

export function getOllamaErrorMessage(error: any): string {
  if (error.name === 'AbortError' || error.name === 'TimeoutError') {
    return 'Request to Ollama timed out. The model might be loading. Please try again in a moment.';
  }
  
  if (error.message?.includes('fetch failed') || error.message?.includes('ECONNREFUSED')) {
    return `Cannot connect to Ollama. Please ensure Ollama is running with: ollama serve`;
  }
  
  if (error.message?.includes('model not found')) {
    return `Model not found. Please pull the model with: ollama pull ${OLLAMA_CONFIG.model}`;
  }
  
  return error.message || 'Unknown error occurred while communicating with Ollama';
}