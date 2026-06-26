# NotebookLM Clone

A full-stack RAG (Retrieval-Augmented Generation) application inspired by Google NotebookLM. Upload any PDF or text document and have an AI-powered conversation with it — answers are grounded in the document's actual content, not hallucinated.

**Live Demo:** [notebooklm-clone-ten.vercel.app](https://notebooklm-clone-ten.vercel.app)  
**Repository:** [github.com/Musharraf1128/notebooklm_clone](https://github.com/Musharraf1128/notebooklm_clone)

---

## Features

- Upload **PDF** or **TXT** documents
- **4 chunking strategies**: Recursive Character, Fixed Size, Sentence-Based, Semantic
- Vector embeddings via OpenRouter (`text-embedding-3-small`)
- **Qdrant Cloud** vector database for persistent storage and retrieval
- LLM generation via **OpenRouter** (OpenAI-compatible API)
- Real-time **streaming responses**
- Strictly **grounded answers** — the LLM only answers from the document, not from its general knowledge
- **Advanced RAG techniques**: Query Rewriting, Query Expansion, Sub-Query Enhancement, HyDE, LLM Re-Ranking, Corrective RAG with LLM Judges
- Configurable RAG pipeline with on/off toggles per technique
- Responsive dark-themed UI

---

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────────┐
│   Frontend  │────> │  Next.js API │────> │  OpenRouter API │
│  (React UI) │<──── │   Routes     │<──── │  (Embeddings +  │
└─────────────┘      └──────┬───────┘      │   LLM Chat)     │
                            │              └─────────────────┘
                            │
                      ┌─────▼──────┐
                      │  Qdrant    │
                      │  Cloud     │
                      │  (Vectors) │
                      └────────────┘
```

---

## RAG Pipeline

The full pipeline runs end-to-end on every interaction:

### 1. Ingestion
The user uploads a PDF or TXT file through the web interface.

### 2. Parsing
- **PDF** — Text is extracted server-side using `pdf-parse`
- **TXT** — Read directly as UTF-8 text

### 3. Chunking Strategy

**Recursive Character Text Splitter** is used as the primary chunking strategy.

The algorithm splits text hierarchically using a cascade of separators, falling back to finer-grained splits only when necessary:

```
Separator Priority:  "\n\n"  →  "\n"  →  ". "  →  " "  →  ""
```

**How it works:**

1. Attempt to split by paragraph breaks (`\n\n`).
2. If any resulting chunk exceeds the maximum size, fall back to line breaks (`\n`).
3. Continue down to sentence boundaries (`. `), then word boundaries (` `).
4. As a last resort, split by individual characters.

**Configuration:**

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `chunkSize` | 1000 characters | Maximum length per chunk |
| `chunkOverlap` | 200 characters | Overlap between consecutive chunks |

**Why this strategy:**

- **Preserves semantic coherence** — paragraphs and logical units stay together when possible.
- **Handles varied structures** — works correctly with prose, code, lists, and tables.
- **Configurable** — chunk size and overlap can be tuned per use case.
- **Overlap prevents context loss** — important information at chunk boundaries is captured in adjacent chunks.

### 4. Embedding
Each chunk is converted to a 1536-dimensional vector using OpenRouter's `text-embedding-3-small` model.

### 5. Storage
Vectors and their associated text payloads are stored in **Qdrant Cloud** — a production-grade vector database with cosine similarity indexing.

### 6. Retrieval
When a user asks a question:
1. The query is embedded using the same embedding model.
2. Qdrant performs a cosine similarity search across the stored vectors.
3. The top 5 most relevant chunks are returned.

### 7. Generation
The retrieved chunks are injected into the LLM system prompt as context. The prompt strictly enforces:
- Answer only from the provided document context.
- If the answer is not in the document, state that clearly.
- Cite the relevant source sections where possible.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js (App Router) |
| Language | JavaScript |
| LLM Provider | OpenRouter (OpenAI-compatible) |
| Embeddings | `text-embedding-3-small` via OpenRouter |
| Vector Database | Qdrant Cloud (free tier) |
| PDF Parsing | `pdf-parse` |
| Styling | Vanilla CSS |
| Deployment | Vercel |

---

## Getting Started

### Prerequisites

- Node.js 18+
- [OpenRouter](https://openrouter.ai) API key
- [Qdrant Cloud](https://cloud.qdrant.io) account (free tier — no credit card required)

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

3. **Configure environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` with your credentials:
   ```
   QUADRANT_CLUSTER_END_POINT=https://your-cluster.cloud.qdrant.io
   QUADRANT_API_KEY=your_qdrant_api_key
   OPENROUTER_API_KEY=sk-or-v1-your_key
   OPENROUTER_MODEL=openai/gpt-4.1-mini
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Deploying to Vercel

1. Push the repository to GitHub.
2. Import the project at [vercel.com](https://vercel.com).
3. Add the four environment variables in the Vercel project settings.
4. Deploy.

---

## Project Structure

```
notebooklm_clone/
├── app/
│   ├── layout.js              # Root layout with meta tags
│   ├── page.js                # Main page component
│   ├── globals.css            # Design system and styles
│   └── api/
│       ├── upload/route.js    # File upload and RAG ingestion pipeline
│       ├── chat/route.js      # Query, retrieval, and generation
│       └── documents/route.js # List and delete document collections
├── components/
│   ├── Sidebar.jsx            # Document list panel
│   ├── DocumentUpload.jsx     # Drag-and-drop file upload
│   ├── ChatInterface.jsx      # Chat interface with streaming
│   └── MessageBubble.jsx      # Message rendering with source citations
├── lib/
│   ├── chunker.js             # Recursive Character Text Splitter
│   ├── embeddings.js          # OpenRouter embeddings client
│   ├── vectorStore.js         # Qdrant Cloud client wrapper
│   ├── openrouter.js          # LLM generation module
│   └── documentProcessor.js   # PDF and TXT parsing
├── .env.example               # Environment variable template
├── next.config.mjs            # Next.js configuration
└── README.md
```

---

## Advanced RAG Techniques

See **[ADVANCED_RAG_TECHNIQUES.md](./ADVANCED_RAG_TECHNIQUES.md)** for comprehensive documentation on all implemented advanced RAG techniques:

- What is RAG and why it exists
- RAG vs fine-tuning decision framework
- Vector databases comparison (Qdrant, Pinecone, Chroma)
- Embeddings & indexing explained
- 4 chunking strategies with tradeoffs
- Query rewriting using SLMs
- LLM-as-Judge for relevance & faithfulness
- Sub-query decomposition with RRF fusion
- Corrective RAG with self-evaluation loops
- HyDE (Hypothetical Document Embeddings)
- Cross-encoder style re-ranking
- Context window & token optimization
- Chunk size & overlap tradeoffs

## Assignment Checklist

| Requirement | Status |
|-------------|--------|
| Working web application | Done |
| Document upload (PDF and TXT) | Done |
| Full RAG pipeline (ingest, chunk, embed, store, retrieve, generate) | Done |
| Chunking strategy implemented and documented | Done — 4 strategies: recursive, fixed, sentence, semantic |
| Vector database used | Done — Qdrant Cloud |
| LLM uses retrieved context, not general knowledge | Done — strict system prompt |
| Handles unseen documents correctly | Done |
| Advanced RAG techniques implemented | Done — query rewrite, sub-query, HyDE, rerank, corrective, LLM judge |
| Public GitHub repository | Done |
| Live deployed link | Done — Vercel |

---

## Author

**Musharraf** — [GitHub](https://github.com/Musharraf1128)
