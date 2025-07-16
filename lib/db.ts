import { Pool } from 'pg';
import type { ChatMessage, ChatSession, AnalyzedPage } from '@/types';

// Create pool only if DATABASE_URL is provided
const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
}) : null;

// Flag to track if DB is available
let isDbAvailable = false;

// Test database connection on startup
if (pool) {
  pool.connect()
    .then(client => {
      client.release();
      isDbAvailable = true;
      console.log('Database connected successfully');
    })
    .catch(err => {
      console.warn('Database connection failed, using in-memory storage:', err.message);
      isDbAvailable = false;
    });
}

export async function getOrCreateSession(sessionId: string, pdfUrl?: string): Promise<ChatSession> {
  if (!pool || !isDbAvailable) {
    // Return a mock session when DB is not available
    return {
      id: sessionId,
      title: 'Local Session',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      tokenCount: 0,
      currentPdfUrl: pdfUrl
    };
  }
  
  const client = await pool.connect();
  
  try {
    // Try to get existing session
    let result = await client.query(
      'SELECT * FROM chat_sessions WHERE id = $1',
      [sessionId]
    );
    
    if (result.rows.length > 0) {
      const session = result.rows[0];
      const messages = await getSessionMessages(sessionId);
      return {
        id: session.id,
        title: session.title,
        messages,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        tokenCount: messages.reduce((sum, msg) => sum + (msg.tokenCount || 0), 0),
        currentPdfUrl: session.pdf_url
      };
    }
    
    // Create new session
    result = await client.query(
      `INSERT INTO chat_sessions (id, title, pdf_url) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [sessionId, 'New Study Session', pdfUrl]
    );
    
    return {
      id: result.rows[0].id,
      title: result.rows[0].title,
      messages: [],
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at,
      tokenCount: 0,
      currentPdfUrl: result.rows[0].pdf_url
    };
  } finally {
    client.release();
  }
}

export async function getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  if (!pool || !isDbAvailable) {
    return [];
  }
  
  const result = await pool.query(
    'SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC',
    [sessionId]
  );
  
  return result.rows.map(row => ({
    id: row.id,
    role: row.role,
    content: row.content,
    images: row.images,
    pageReferences: row.page_references,
    timestamp: row.created_at,
    tokenCount: row.token_count
  }));
}

export async function saveMessage(sessionId: string, message: ChatMessage & { tokenCount?: number }): Promise<void> {
  if (!pool || !isDbAvailable) {
    return;
  }
  
  await pool.query(
    `INSERT INTO messages (id, session_id, role, content, images, page_references, token_count, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      message.id,
      sessionId,
      message.role,
      message.content,
      message.images || null,
      message.pageReferences || null,
      message.tokenCount || 0,
      message.timestamp
    ]
  );
}

export async function savePageEmbedding(
  sessionId: string,
  pageNumber: number,
  extractedText: string,
  embedding: number[]
): Promise<void> {
  if (!pool || !isDbAvailable) {
    return;
  }
  
  await pool.query(
    `INSERT INTO page_embeddings (session_id, page_number, extracted_text, embedding)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (session_id, page_number) 
     DO UPDATE SET extracted_text = $3, embedding = $4`,
    [sessionId, pageNumber, extractedText, embedding]
  );
}

export async function getRelevantPages(
  sessionId: string,
  queryEmbedding: number[],
  limit: number = 5
): Promise<Array<{ pageNumber: number; extractedText: string; similarity: number }>> {
  if (!pool || !isDbAvailable) {
    return [];
  }
  
  const result = await pool.query(
    `SELECT page_number, extracted_text, 
            1 - (embedding <=> $2::vector) as similarity
     FROM page_embeddings
     WHERE session_id = $1
     ORDER BY embedding <=> $2::vector
     LIMIT $3`,
    [sessionId, queryEmbedding, limit]
  );
  
  return result.rows.map(row => ({
    pageNumber: row.page_number,
    extractedText: row.extracted_text,
    similarity: row.similarity
  }));
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  if (!pool || !isDbAvailable) {
    return;
  }
  
  await pool.query(
    'UPDATE chat_sessions SET title = $2 WHERE id = $1',
    [sessionId, title]
  );
}

export async function deleteOldMessages(sessionId: string, keepCount: number): Promise<void> {
  if (!pool || !isDbAvailable) {
    return;
  }
  
  await pool.query(
    `DELETE FROM messages 
     WHERE session_id = $1 
     AND id NOT IN (
       SELECT id FROM messages 
       WHERE session_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2
     )`,
    [sessionId, keepCount]
  );
}

// Clean up on exit
process.on('SIGINT', async () => {
  if (pool) {
    await pool.end();
  }
  process.exit(0);
});