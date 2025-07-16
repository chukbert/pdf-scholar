interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  onRetry?: (attempt: number, error: any) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    onRetry
  } = options;
  
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts) {
        throw error;
      }
      
      // Calculate exponential backoff delay
      const delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);
      
      if (onRetry) {
        onRetry(attempt, error);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

export function shouldRetry(error: any): boolean {
  // Retry on timeout errors
  if (error.name === 'AbortError' || error.name === 'TimeoutError') {
    return true;
  }
  
  // Retry on network errors
  if (error.message?.includes('fetch failed') || error.message?.includes('ECONNREFUSED')) {
    return true;
  }
  
  // Retry on 503 Service Unavailable (Ollama might be starting up)
  if (error.status === 503) {
    return true;
  }
  
  // Don't retry on client errors (400-499) except 429 (rate limit)
  if (error.status >= 400 && error.status < 500 && error.status !== 429) {
    return false;
  }
  
  // Retry on server errors (500+)
  if (error.status >= 500) {
    return true;
  }
  
  return false;
}