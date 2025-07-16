const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const EMBEDDINGS_MODEL = process.env.EMBEDDINGS_MODEL || 'bge-large';

export interface EmbeddingResponse {
  embedding: number[];
}

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDINGS_MODEL,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embeddings API error: ${response.statusText}`);
    }

    const data: EmbeddingResponse = await response.json();
    return data.embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    // Return a zero vector as fallback
    return new Array(1024).fill(0);
  }
}

export async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
  // Process in parallel with rate limiting
  const batchSize = 5;
  const results: number[][] = [];
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchPromises = batch.map(text => generateEmbedding(text));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Small delay to avoid overwhelming the API
    if (i + batchSize < texts.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}

export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }
  
  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  return denominator === 0 ? 0 : dotProduct / denominator;
}