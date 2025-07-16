// Ollama client utilities

export interface OllamaHealth {
  ollama: {
    url: string;
    model: string;
    status: string;
    error: string | null;
    models: string[];
  };
  checks: {
    connection: boolean;
    modelAvailable: boolean;
    testGeneration: boolean;
  };
  timestamp: string;
}

export async function checkOllamaHealth(): Promise<OllamaHealth> {
  const response = await fetch('/api/ollama/health');
  return response.json();
}

export async function isOllamaReady(): Promise<boolean> {
  try {
    const health = await checkOllamaHealth();
    return health.checks.connection && health.checks.modelAvailable;
  } catch {
    return false;
  }
}

export function formatOllamaError(health: OllamaHealth): string {
  if (!health.checks.connection) {
    return `Cannot connect to Ollama at ${health.ollama.url}. Please ensure Ollama is running with: ollama serve`;
  }
  
  if (!health.checks.modelAvailable) {
    return `Model ${health.ollama.model} not found. Please pull it with: ollama pull ${health.ollama.model}`;
  }
  
  if (health.ollama.error) {
    return health.ollama.error;
  }
  
  return 'Ollama is not properly configured';
}