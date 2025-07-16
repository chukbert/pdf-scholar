# PDF Scholar

A privacy-first web application for learning from PDFs with a local AI tutor powered by Qwen 2.5-VL running in Ollama.

## Features

- **Privacy-First**: All processing happens locally on your machine
- **PDF Viewer**: Split-pane interface with PDF on the left and AI chat on the right
- **AI-Powered Analysis**: Click "Analyze" (or press 'A') to get explanations of the current PDF page
- **Streaming Responses**: Real-time streaming of AI responses via Server-Sent Events
- **Memory Management**: Maintains ~100K tokens of rolling context for continuous learning
- **Vector Search**: Stores page embeddings for contextual retrieval across sessions
- **Page Citations**: Click on page references in chat to navigate to specific pages
- **Markdown Support**: Full support for Markdown, LaTeX math, and code highlighting

## Prerequisites

### Windows 11 Setup

1. **Install Ollama**:
   ```bash
   winget install Ollama.Ollama
   ```

2. **Pull Required Models**:
   ```bash
   ollama pull qwen2.5vl:3b
   ollama pull bge-large
   ```

3. **Install Node.js 18+**:
   ```bash
   winget install OpenJS.NodeJS
   ```

4. **Install PostgreSQL 16** (optional, for vector storage):
   ```bash
   winget install PostgreSQL.PostgreSQL
   ```

### macOS/Linux Setup

1. **Install Ollama**:
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ```

2. **Pull Required Models**:
   ```bash
   ollama pull qwen2.5vl:3b
   ollama pull bge-large
   ```

3. **Install Node.js** and **PostgreSQL** using your package manager.

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd pdfscholar-app
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   Create a `.env.local` file:
   ```env
   # Ollama Configuration
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_MODEL=qwen2.5vl:3b
   OLLAMA_MAX_BATCH=256
   OLLAMA_CONTEXT_LENGTH=125000

   # Database Configuration (optional)
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pdfscholar

   # App Configuration
   MAX_TOKEN_MEMORY=100000
   TOKEN_BUFFER_THRESHOLD=90000
   EMBEDDINGS_MODEL=bge-large
   ```

4. **Set up database** (optional, for persistent storage):
   ```bash
   createdb pdfscholar
   psql -d pdfscholar -f db/schema.sql
   ```

## Running the Application

1. **Start Ollama** (if not already running):
   ```bash
   ollama serve
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```

3. **Open your browser** to [http://localhost:1](http://localhost:3001)

4. **Upload a PDF** and click "Analyze" to start learning!

## GPU Configuration

### CUDA (NVIDIA GPUs)
Ollama automatically detects CUDA-capable GPUs. Ensure you have the latest NVIDIA drivers installed.

### Vulkan (AMD/Intel GPUs)
For AMD or Intel GPUs, you may need to configure Vulkan support:
```bash
export OLLAMA_GPU_DRIVER=vulkan
ollama serve
```

## Architecture

```
pdfscholar-app/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   └── chat/         # Ollama chat endpoint
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Main page
├── components/            # React components
│   ├── AppLayout.tsx     # Main split-pane layout
│   ├── ChatInterface.tsx # AI chat UI
│   └── PDFViewer.tsx     # PDF viewer component
├── lib/                   # Utility functions
│   ├── db.ts             # Database operations
│   ├── embeddings.ts     # Vector embeddings
│   └── memory.ts         # Token management
├── types/                 # TypeScript types
└── public/               # Static assets
    └── pdf-worker/       # PDF.js worker
```

## API Endpoints

### `POST /api/chat`
Handles chat interactions with Ollama.

**Request Body**:
```json
{
  "chatId": "string",
  "images": ["base64..."],
  "userMessage": "string",
  "pageNumbers": [1, 2],
  "extractedText": ["text from page 1", "text from page 2"]
}
```

**Response**: Server-Sent Events stream

### `GET /api/chat`
Health check endpoint for Ollama status.

## Development

### Type Checking
```bash
npm run type-check
```

### Linting
```bash
npm run lint
```

### Building for Production
```bash
npm run build
npm start
```

## Testing

Run the test suite:
```bash
npm test
```

## Troubleshooting

### Ollama Connection Issues
- Ensure Ollama is running: `ollama list`
- Check if the model is downloaded: `ollama pull qwen2.5vl:3b`
- Verify the API is accessible: `curl http://localhost:11434/api/tags`

### PDF Loading Issues
- Ensure the PDF is not corrupted
- Check browser console for errors
- Try with a different PDF file

### Memory Issues
- Reduce `MAX_TOKEN_MEMORY` in `.env.local`
- Increase Node.js memory: `NODE_OPTIONS="--max-old-space-size=4096" npm run dev`

## License

This project is licensed under the MIT License. Third-party licenses:
- Qwen 2.5-VL: Apache-2.0
- PDF.js: Apache-2.0
- React-PDF-Viewer: MIT
- All other dependencies: See package.json

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Acknowledgments

- Qwen team for the vision-language model
- PDF.js team for the PDF rendering engine
- Ollama team for the local LLM infrastructure