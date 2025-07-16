import type { ChatMessage } from '@/types';

// Token counting with multiple fallback strategies
let tiktoken: any = null;
let jsTiktoken: any = null;
let encodingMethod: 'tiktoken' | 'js-tiktoken' | 'fallback' = 'fallback';

// Initialize token counting on first use
async function initializeTokenCounter() {
  if (tiktoken || jsTiktoken) return;

  // Try tiktoken first (with WASM)
  try {
    const { Tiktoken } = await import('tiktoken/lite');
    const cl100k_base = await import('tiktoken/encoders/cl100k_base.json');
    
    tiktoken = new Tiktoken(
      cl100k_base.default.bpe_ranks,
      cl100k_base.default.special_tokens,
      cl100k_base.default.pat_str
    );
    encodingMethod = 'tiktoken';
    console.log('Using tiktoken for token counting');
    return;
  } catch (error) {
    console.warn('Tiktoken initialization failed, trying js-tiktoken:', error);
  }

  // Try js-tiktoken as fallback
  try {
    const { getEncoding } = await import('js-tiktoken');
    jsTiktoken = getEncoding('cl100k_base');
    encodingMethod = 'js-tiktoken';
    console.log('Using js-tiktoken for token counting');
    return;
  } catch (error) {
    console.warn('js-tiktoken initialization failed, using character-based estimation:', error);
    encodingMethod = 'fallback';
  }
}

// Synchronous token counting with fallback
export function countTokens(text: string): number {
  // Use tiktoken if available
  if (tiktoken) {
    try {
      return tiktoken.encode(text).length;
    } catch (error) {
      console.error('Tiktoken encoding error:', error);
    }
  }

  // Use js-tiktoken if available
  if (jsTiktoken) {
    try {
      return jsTiktoken.encode(text).length;
    } catch (error) {
      console.error('js-tiktoken encoding error:', error);
    }
  }

  // Fallback: estimate tokens based on characters and words
  const words = text.split(/\s+/).length;
  const characters = text.length;
  
  // More accurate estimation:
  // - Average English word: ~1.3 tokens
  // - Account for punctuation and special characters
  const wordBasedEstimate = words * 1.3;
  const charBasedEstimate = characters / 4;
  
  return Math.ceil(Math.max(wordBasedEstimate, charBasedEstimate));
}

// Initialize token counter on module load
initializeTokenCounter().catch(console.error);

export function countMessageTokens(message: ChatMessage): number {
  let tokens = countTokens(message.content);
  
  // Add estimated tokens for images (rough estimate)
  if (message.images) {
    tokens += message.images.length * 1000;
  }
  
  // Add overhead for message metadata
  tokens += 4; // role, etc.
  
  return tokens;
}

export function getTotalTokenCount(messages: ChatMessage[]): number {
  return messages.reduce((total, msg) => total + countMessageTokens(msg), 0);
}

export function summarizeOldMessages(messages: ChatMessage[]): string {
  // Take the first few messages to summarize
  const toSummarize = messages.slice(0, Math.min(3, messages.length));
  
  let summary = "Previous conversation summary:\n";
  
  toSummarize.forEach((msg, index) => {
    if (msg.role === 'user') {
      summary += `- User asked about: ${msg.content.slice(0, 100)}...\n`;
      if (msg.pageReferences) {
        summary += `  (Pages: ${msg.pageReferences.join(', ')})\n`;
      }
    } else if (msg.role === 'assistant') {
      // Extract key points from assistant response
      const keyPoints = extractKeyPoints(msg.content);
      summary += `- Assistant explained: ${keyPoints}\n`;
    }
  });
  
  return summary;
}

function extractKeyPoints(content: string): string {
  // Simple extraction - in production, use a more sophisticated approach
  const lines = content.split('\n').filter(line => line.trim());
  const headings = lines.filter(line => line.match(/^#+\s/));
  
  if (headings.length > 0) {
    return headings.slice(0, 3).map(h => h.replace(/^#+\s/, '')).join(', ');
  }
  
  // Fallback to first 150 chars
  return content.slice(0, 150) + '...';
}

export function truncateConversation(
  messages: ChatMessage[], 
  maxTokens: number,
  bufferThreshold: number
): { messages: ChatMessage[], wasTruncated: boolean } {
  const totalTokens = getTotalTokenCount(messages);
  
  if (totalTokens <= bufferThreshold) {
    return { messages, wasTruncated: false };
  }
  
  // Create summary of old messages
  const summary = summarizeOldMessages(messages);
  const summaryMessage: ChatMessage = {
    id: `summary-${Date.now()}`,
    role: 'system',
    content: summary,
    timestamp: new Date()
  };
  
  // Keep messages from newest to oldest until we hit the limit
  const truncatedMessages: ChatMessage[] = [summaryMessage];
  let currentTokens = countMessageTokens(summaryMessage);
  
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const messageTokens = countMessageTokens(message);
    
    if (currentTokens + messageTokens > maxTokens) {
      break;
    }
    
    truncatedMessages.unshift(message);
    currentTokens += messageTokens;
  }
  
  return { messages: truncatedMessages, wasTruncated: true };
}