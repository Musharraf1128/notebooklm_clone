# NotebookLM Clone — RAG-Powered Document Chat

A full-stack RAG (Retrieval-Augmented Generation) application inspired by Google NotebookLM. Upload any PDF or text document and have an AI-powered conversation with it — answers are grounded in the document's actual content, not hallucinated.

**🔗 Live Demo:** [Deployed on Vercel](https://notebooklm-clone.vercel.app)  
**📂 Repository:** [GitHub](https://github.com/Musharraf1128/notebooklm_clone)

---

## ✨ Features

- 📄 **Upload PDF or TXT** documents
- 🧩 **Intelligent Chunking** using Recursive Character Text Splitter
- 🔢 **Vector Embeddings** via OpenRouter (text-embedding-3-small)
- 🗄️ **Qdrant Cloud** vector database for storage & retrieval
- 🤖 **LLM Generation** via OpenRouter (OpenAI-compatible)
- 📡 **Streaming Responses** in real-time
- 🎯 **Grounded Answers** — strictly from the document, not from LLM's general knowledge
- 🌙 **Premium Dark UI** with glassmorphism and micro-animations
- 📱 **Responsive** — works on desktop and mobile

---

## 🏗️ Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Frontend   │────▶│  Next.js API  │────▶│  OpenRouter API  │
│  (React UI)  │◀────│   Routes      │◀────│  (Embeddings +   │
└─────────────┘     └──────┬───────┘     │   LLM Chat)      │
                           │              └─────────────────┘
                           │
                     ┌─────▼──────┐
                     │ Qdrant     │
                     │ Cloud      │
                     │ (Vectors)  │
                     └────────────┘
```

---

## 🔄 RAG Pipeline

The complete pipeline that runs end-to-end:

### 1. Ingestion
User uploads a PDF or TXT file through the web UI.

### 2. Parsing
- **PDF**: Parsed using `pdf-parse` to extract raw text
- **TXT**: Read directly as UTF-8 text

### 3. Chunking Strategy ⭐

> **Recursive Character Text Splitter** — the primary chunking strategy.

This strategy splits text hierarchically using a cascade of separators:

```
Separator Priority: "\n\n" → "\n" → ". " → " " → ""
```

**How it works:**
1. First, try to split by paragraph breaks (`\n\n`)
2. If any chunk is still too large, fall back to line breaks (`\n`)
3. Continue down to sentence boundaries (`. `), then words (` `)
4. Last resort: split by individual characters

**Parameters:**
- `chunkSize`: 1000 characters (max per chunk)
- `chunkOverlap`: 200 characters (overlap between consecutive chunks)

**Why this strategy:**
- **Preserves semantic coherence** — paragraphs stay together when possible
- **Handles varied document structures** — works with code, prose, lists, tables
- **Configurable** — chunk size and overlap can be tuned for different use cases
- **Overlap prevents context loss** — important information at chunk boundaries is captured in adjacent chunks

### 4. Embedding
Each chunk is converted to a 1536-dimensional vector using OpenRouter's `text-embedding-3-small` model.

### 5. Storage
Vectors and their associated text are stored in **Qdrant Cloud** (free tier) — a production-grade vector database with cosine similarity indexing.

### 6. Retrieval
When a user asks a question:
1. The query is embedded using the same model
2. Qdrant performs cosine similarity search
3. Top 5 most relevant chunks are retrieved

### 7. Generation
The retrieved chunks are injected into the LLM prompt as context. The system prompt enforces:
- Only answer from the provided context
- If the answer isn't in the document, say so
- Cite source sections when possible

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | JavaScript |
| LLM Provider | OpenRouter (OpenAI-compatible) |
| Embeddings | text-embedding-3-small via OpenRouter |
| Vector DB | Qdrant Cloud (free tier) |
| PDF Parsing | pdf-parse |
| Styling | Vanilla CSS (dark theme) |
| Deployment | Vercel |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- OpenRouter API key ([get one here](https://openrouter.ai))
- Qdrant Cloud account ([free signup](https://cloud.qdrant.io))

### Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Musharraf1128/notebooklm_clone.git
   cd notebooklm_clone
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   Fill in your API keys in `.env.local`:
   ```
   QUADRANT_CLUSTER_END_POINT=https://your-cluster.cloud.qdrant.io
   QUADRANT_API_KEY=your_qdrant_api_key
   OPENROUTER_API_KEY=sk-or-v1-your_key
   OPENROUTER_MODEL=openai/gpt-4.1-mini
   ```

4. **Run the dev server:**
   ```bash
   npm run dev
   ```

5. **Open** [http://localhost:3000](http://localhost:3000)

### Deploy to Vercel

1. Push your code to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Add the environment variables in the Vercel dashboard
4. Deploy!

---

## 📁 Project Structure

```
notebooklm_clone/
├── app/
│   ├── layout.js              # Root layout with meta tags
│   ├── page.js                # Main page component
│   ├── globals.css            # Design system & styles
│   └── api/
│       ├── upload/route.js    # File upload + RAG ingestion
│       ├── chat/route.js      # Query + retrieval + generation
│       └── documents/route.js # List & delete documents
├── components/
│   ├── Sidebar.jsx            # Document list panel
│   ├── DocumentUpload.jsx     # Drag-and-drop upload
│   ├── ChatInterface.jsx      # Chat with streaming
│   └── MessageBubble.jsx      # Message rendering + sources
├── lib/
│   ├── chunker.js             # Recursive text splitter
│   ├── embeddings.js          # OpenRouter embeddings
│   ├── vectorStore.js         # Qdrant Cloud client
│   ├── openrouter.js          # LLM generation
│   └── documentProcessor.js   # PDF/TXT parsing
├── .env.example               # Environment template
├── next.config.mjs            # Next.js configuration
└── README.md                  # This file
```

---

## 📋 Assignment Checklist

| Requirement | Status |
|-------------|--------|
| Working web application | ✅ |
| Document upload (PDF & TXT) | ✅ |
| Full RAG pipeline (ingest → chunk → embed → store → retrieve → generate) | ✅ |
| Chunking strategy documented | ✅ Recursive Character Text Splitter |
| Vector database used | ✅ Qdrant Cloud |
| LLM uses retrieved context (not memory) | ✅ Strict system prompt |
| Handles unseen documents | ✅ |
| GitHub repository (public) | ✅ |
| Live deployed link | ✅ Vercel |

---

## 👤 Author

**Musharraf** — [GitHub](https://github.com/Musharraf1128)
