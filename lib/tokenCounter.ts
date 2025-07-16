// Alternative token counting implementation with multiple fallback strategies
// This provides a more robust solution for environments where tiktoken WASM might fail

import type { ChatMessage } from '@/types';

// Try to import tiktoken, but handle failures gracefully
let tiktokenAvailable = false;
let tiktokenModule: any = null;

// Attempt to load tiktoken dynamically
async function loadTiktoken() {
  if (tiktokenModule) return tiktokenModule;
  
  try {
    const { Tiktoken } = await import('tiktoken/lite');
    const cl100k_base = await import('tiktoken/encoders/cl100k_base.json');
    
    tiktokenModule = new Tiktoken(
      cl100k_base.default.bpe_ranks,
      cl100k_base.default.special_tokens,
      cl100k_base.default.pat_str
    );
    
    tiktokenAvailable = true;
    return tiktokenModule;
  } catch (error) {
    console.warn('Tiktoken not available, using fallback token counting:', error);
    return null;
  }
}

// Character-based token estimation
// Based on OpenAI's rough estimates: 1 token ≈ 4 characters for English
function estimateTokensByCharacters(text: string): number {
  // More accurate estimation based on content type
  const words = text.split(/\s+/).length;
  const characters = text.length;
  
  // Average: 1 token per word for common words, more for complex/technical terms
  // Also account for punctuation and special characters
  const wordBasedEstimate = words * 1.3;
  const charBasedEstimate = characters / 4;
  
  // Use the higher estimate to be conservative with token limits
  return Math.ceil(Math.max(wordBasedEstimate, charBasedEstimate));
}

// Simple word-based token estimation
function estimateTokensByWords(text: string): number {
  // Split by whitespace and punctuation
  const tokens = text.match(/\b\w+\b|[^\w\s]/g) || [];
  
  // Account for subword tokenization of longer words
  let tokenCount = 0;
  for (const token of tokens) {
    if (token.length > 10) {
      // Long words are often split into multiple tokens
      tokenCount += Math.ceil(token.length / 5);
    } else {
      tokenCount += 1;
    }
  }
  
  return tokenCount;
}

// Main token counting function with fallbacks
export async function countTokensRobust(text: string): Promise<number> {
  // Try tiktoken first
  try {
    const tiktoken = await loadTiktoken();
    if (tiktoken && tiktokenAvailable) {
      return tiktoken.encode(text).length;
    }
  } catch (error) {
    console.warn('Tiktoken encoding failed:', error);
  }
  
  // Fallback to estimation
  return estimateTokensByCharacters(text);
}

// Synchronous version using only estimation
export function countTokensSync(text: string): number {
  // Use character-based estimation for synchronous counting
  return estimateTokensByCharacters(text);
}

// Count tokens for a chat message
export function countMessageTokensRobust(message: ChatMessage): number {
  let tokens = countTokensSync(message.content);
  
  // Add estimated tokens for images
  if (message.images) {
    // Each image typically uses ~85-170 tokens depending on resolution
    tokens += message.images.length * 125; // Use average
  }
  
  // Add overhead for message metadata (role, etc.)
  tokens += 4;
  
  return tokens;
}

// Get total token count for all messages
export function getTotalTokenCountRobust(messages: ChatMessage[]): number {
  return messages.reduce((total, msg) => total + countMessageTokensRobust(msg), 0);
}

// Export a simple API that matches the existing interface
export const TokenCounter = {
  count: countTokensSync,
  countMessage: countMessageTokensRobust,
  countTotal: getTotalTokenCountRobust,
  // Async version for when precision is more important than speed
  countAsync: countTokensRobust
};