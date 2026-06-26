# Viva Preparation: NotebookLM Clone — Generative AI Focus

## 1. Project Overview (GenAI Context)

This is a **full-stack RAG (Retrieval-Augmented Generation) application** inspired by Google's NotebookLM. It allows users to upload PDF/TXT documents and ask natural-language questions, receiving answers strictly grounded in the uploaded content. Built with Next.js (App Router), OpenRouter API, and Qdrant Cloud vector database.

**Core GenAI Pipeline (RAG):**
```
Upload → Parse → Chunk → Embed → Store (Qdrant)
                                      ↓
User Query → Embed Query → Vector Search → Retrieve Top-K → LLM Generation → Streamed Answer
```

**Key Tech Stack:**
| Component | Technology |
|---|---|
| Embedding Model | `openai/text-embedding-3-small` (1536-d) |
| LLM | `openai/gpt-4.1-mini` via OpenRouter |
| Vector DB | Qdrant Cloud (Cosine distance) |
| Chunking | Recursive Character Text Splitter |
| Streaming | ReadableStream + Server-Sent Events |

---

## 2. RAG — Retrieval-Augmented Generation

### What is RAG?

RAG is a technique that enhances LLM outputs by first retrieving relevant information from a knowledge base (vector database) and then feeding that context to the LLM before generation.

### Why RAG over Fine-tuning?

| Aspect | RAG | Fine-tuning |
|---|---|---|
| Knowledge updates | Instant (re-index documents) | Requires re-training |
| Cost per query | Pay per token + storage | High upfront training cost |
| Hallucination risk | Lower (grounded in retrieved context) | Higher (parametric knowledge) |
| Data privacy | Documents stay in your DB | Training data enters model |
| Use case | Open-book QA on dynamic docs | Fixed task/behavior learning |

### Our RAG Flow (File-by-File):

```
app/api/upload/route.js:   POST → parse → chunk → embed → upsert vectors
app/api/chat/route.js:     POST → embed query → search → generate → stream
```

**Key design choice: one Qdrant collection per document** (`doc_<name>_<timestamp>`). This means retrieval is scoped to a single document, not cross-document. User selects which document to chat with.

---

## 3. Document Parsing (`lib/documentProcessor.js`)

Supports two file types:
- **PDF**: Uses `pdf-parse` library to extract text + metadata (title, author, page count).
- **TXT**: Direct UTF-8 string read.

**Limitation / Discussion point:** PDF parsing is inherently lossy — tables, images, headers/footers, and complex layouts are not captured. For production, you'd use OCR (Tesseract, Azure Document Intelligence) or multimodal models.

---

## 4. Chunking Strategy (`lib/chunker.js`)

### Recursive Character Text Splitter

Separator hierarchy: `"\n\n"` → `"\n"` → `". "` → `" "` → `""` (character-level)

Parameters:
- **chunkSize = 1000** characters per chunk
- **chunkOverlap = 200** characters between consecutive chunks

### Why This Works

- **Semantic preservation**: Tries paragraph breaks first (most semantic), falls back to sentences, then words, then characters.
- **Overlap**: Prevents context loss at chunk boundaries — if a sentence spans across two chunks, the overlap ensures the start of the next chunk includes the tail of the previous one.
- **Robustness**: Handles varied document structures (prose, code, lists).

### Trade-offs & Alternatives

| Strategy | Pros | Cons |
|---|---|---|
| **Recursive Character** (used) | Semantic-aware, simple, no external deps | Fixed size, no semantics | (character-based) |
| **Semantic Chunking** | Splits at topic boundaries | Requires embedding model for each split (expensive) |
| **Late Chunking** | Better retrieval for long contexts | Complex implementation |
| **Agentic Chunking** | LLM decides boundaries | Slow, expensive |

**Viva Q:** Why 1000 characters with 200 overlap?
- 1000 chars ≈ 150–250 tokens — fits comfortably in most context windows.
- 200 chars ≈ 20% overlap — enough to bridge sentences without excessive duplication.

---

## 5. Embeddings (`lib/embeddings.js`)

### Model: `openai/text-embedding-3-small`

- **Dimensions**: 1536 (default for text-embedding-3-small)
- **Provider**: OpenRouter (OpenAI-compatible endpoint)
- **Batch size**: 50 texts per API call
- **Separate functions**: `embedTexts` (batch) for ingestion, `embedQuery` (single) for retrieval

### Why text-embedding-3-small?

- Cheaper and faster than text-embedding-3-large (256x cheaper).
- Still 1536 dimensions — plenty of representational capacity for document retrieval.
- State-of-the-art embedding quality with MIRACL benchmarks.

### Embedding vs. Query Embedding

We use **symmetric embedding** — both documents and queries go through the same model. Some RAG systems use asymmetric (e.g., BAAI/bge-large-en-v1.5 with separate instruction prefixes for query vs. document). Symmetric is simpler and works well when queries are natural language questions rather than short keywords.

---

## 6. Vector Store (`lib/vectorStore.js`) — Qdrant Cloud

### Operations

| Function | Purpose |
|---|---|
| `createCollection` | Creates collection with 1536-d vectors, Cosine distance |
| `upsertVectors` | Batch insert points (batches of 100) with text payload + metadata |
| `search` | Cosine similarity search, top-K=5, returns text + score + metadata |
| `deleteCollection` | Clean up on document removal |

### Distance Metric: Cosine Similarity

\[
\text{cosine}(A, B) = \frac{A \cdot B}{\|A\| \|B\|}
\]

- Ranges [-1, 1], higher = more similar.
- Preferred over Euclidean for embeddings because it's **magnitude-invariant** — focuses on direction (which captures semantic similarity) rather than absolute position.
- Qdrant natively supports Cosine, Dot Product, and Euclidean.

### Why Qdrant?

- Fully managed cloud vector DB (zero ops).
- Built-in filtering, payload storage, and CRUD.
- Supports high-dimensional vectors efficiently with HNSW indexing.
- Alternatives: Pinecone (expensive), Weaviate (self-host option), pgvector (if already using Postgres).

### Payload Structure per Point

```json
{
  "id": "<index>",
  "vector": [1536 floats],
  "payload": {
    "text": "original chunk text",
    "source": "filename.pdf",
    "chunkIndex": 3,
    "totalChunks": 47
  }
}
```

This allows source citation in the UI — showing which chunk (and which part of the document) the answer came from.

---

## 7. Retrieval — Top-K Search

**Parameters:** `topK = 5`

- Query is embedded to a 1536-d vector.
- Qdrant searches its HNSW index for the 5 nearest neighbors by Cosine distance.
- Results include a `score` (cosine similarity, 0–1).
- If no results → return 404 with "No relevant content found".

### Why Top-5?

- Too few (1–2): Might miss relevant context, leading to hallucination or incomplete answers.
- Too many (10+): Context window gets polluted with irrelevant text, and cost increases.
- 5 is the sweet spot for most document QA use cases.

### Relevance Scoring

```js
`[Source ${i+1}] (Relevance: ${(chunk.score * 100).toFixed(1)}%)`
```

Score is displayed in the system prompt and in the UI — gives the LLM a sense of confidence for each source. The LLM can weigh sources accordingly.

---

## 8. LLM Generation (`lib/openrouter.js`)

### Model: `openai/gpt-4.1-mini`

- Configurable via `OPENROUTER_MODEL` env variable.
- Default: `openai/gpt-4.1-mini` — cost-effective, fast, good instruction following.

### System Prompt — RAG Grounding

```
STRICT RULES:
1. ONLY answer based on information found in the context below.
2. If the answer is not in the context, state:
   "I couldn't find information about that in the uploaded document."
3. Do NOT use your general knowledge or training data.
4. Cite source sections when possible.
5. If ambiguous, ask for clarification.
6. Use markdown formatting.
```

This is the **most critical prompt engineering decision** in the project. Without strict grounding rules, the LLM will fall back to its parametric knowledge, defeating the purpose of RAG.

### Temperature: 0.3

- Lower temperature (0.1–0.3) = more deterministic, factual responses. Good for RAG.
- Higher temperature (0.7+) = more creative, diverse. Bad for fact-based QA.

### Streaming Implementation

```js
// Server: ReadableStream wrapping OpenAI streaming
const stream = await client.chat.completions.create({
  model, messages, stream: true, temperature: 0.3
});

// Client: response.body.getReader() reads in real-time
for await (const chunk of stream) {
  controller.enqueue(encoder.encode(chunk.choices[0]?.delta?.content));
}
```

Streaming is essential for user experience — without it, users wait 5–15 seconds with no feedback.

### Chat History Window

```js
chatHistory.slice(-10) // Last 10 messages
```

Enables multi-turn conversation context. Limited to 10 to control token costs and prevent context window overflow.

---

## 9. Design Decisions & Trade-offs

### One Collection Per Document (vs. single collection with metadata filter)

**Pro:** Simpler code, complete isolation, easy deletion.
**Con:** No cross-document retrieval. User must select a document before chatting.

**Alternative:** Single collection with `source` metadata filter. Would enable cross-document search but requires filtering on every query.

### Client-side State Management (vs. database)

Document list and chat history are managed in React state (`page.js`). On refresh, everything resets. A production version would persist these in a database (Postgres, SQLite, Redis).

### File Size Limit: 10MB

- Prevents abuse and timeout issues.
- Vercel serverless functions have a 10s timeout and 50MB body limit.
- For larger documents, you'd need background job processing (e.g., Queue + Worker).

### Error Handling

Each stage (parse → chunk → embed → store → retrieve → generate) has its own error handling with meaningful messages returned to the client.

---

## 10. Advanced RAG Improvements

### Chunking Improvements

| Technique | Description |
|---|---|
| **Semantic Chunking** | Use embeddings to detect topic shifts and split at natural boundaries instead of fixed character counts. More coherent chunks. |
| **Late Chunking** | Compute full-document embedding, then chunk after embedding. Preserves cross-chunk contextual information in each vector. |
| **Sliding Window with Sentence Boundaries** | Instead of fixed 1000-char windows, split at sentence boundaries and slide by sentences. More natural breaks. |
| **Small-to-Big Retrieval** | Retrieve on small chunks (e.g., 200 chars) for precision, but pass the surrounding larger block (e.g., 1000 chars) to the LLM for context. |
| **Chunk Metadata Enrichment** | Add summaries, keywords, or titles to each chunk's payload for better retrieval. |

### Retrieval Improvements

| Technique | Description |
|---|---|
| **Hybrid Search** | Combine vector (semantic) + keyword (BM25/sparse) search. Catches exact matches vector search misses. Qdrant supports sparse vectors natively. |
| **Multi-Query Retrieval** | Generate 3–5 rephrased versions of the user's query, retrieve for each, merge results. Covers different phrasings. |
| **Query Expansion** | Expand the query with related terms before embedding (e.g., "car" → "car vehicle automobile"). |
| **Query Rewriting** | Use an LLM to rewrite ambiguous queries into clear, standalone questions before retrieval. Especially important for multi-turn conversations. |
| **HyDE (Hypothetical Document Embeddings)** | Generate a hypothetical ideal document from the query, embed that, and search. Bridges the query-document gap. |
| **Contextual Retrieval (Anthropic)** | Prepend chunk-specific context to each chunk before embedding ("This chunk is from section X of document Y about topic Z"). Dramatically improves retrieval. |
| **RAG-Fusion** | Retrieve multiple result sets using different strategies, merge with reciprocal rank fusion (RRF). |

### Generation Improvements

| Technique | Description |
|---|---|
| **Re-ranking** | After initial retrieval, use a cross-encoder (e.g., Cohere rerank, BGE reranker) to re-rank top-K results by deeper relevance. Typically adds 10–20% accuracy. |
| **Self-RAG / Corrective RAG** | After generation, have the LLM self-evaluate: "Is my answer well-grounded? Am I hallucinating?" If low confidence, re-retrieve. |
| **Structured Outputs** | Force the LLM to output JSON with citations: `{"answer": "...", "sources": [3, 5]}`. Parse on client for precise citation. |
| **Prompt Compression** | Compress retrieved context to fit more relevant chunks into the same context window. E.g., LLMLingua or Selective Context. |
| **Dynamic Top-K** | Adjust K based on query complexity or similarity scores. High-confidence queries need fewer docs; ambiguous ones need more. |
| **RAPTOR (Recursive Abstractive Processing)** | Build a hierarchical summary tree of chunks. Retrieve at the summary level first, then drill down. Great for long documents. |

### Evaluation & Monitoring

| Technique | Description |
|---|---|
| **RAGAS** | Framework for evaluating RAG: Faithfulness, Answer Relevance, Context Precision, Context Recall. |
| **TruLens** | RAG evaluation with feedback functions for groundedness, context relevance, and answer relevance. |
| **A/B Testing** | Compare different chunking/retrieval strategies on a held-out QA set. |

### Production Considerations

| Concern | Solution |
|---|---|
| **Latency** | Use streaming, async embedding, cache frequent queries |
| **Cost** | Batch embeddings, use smaller models for retrieval, cache results |
| **Security** | Validate file types, scan for malware, rate-limit API |
| **Persistence** | Add SQLite/Postgres for chat history, document metadata |
| **Scalability** | Background job queue for ingestion, read replicas for Qdrant |
| **Multi-user** | Add auth (NextAuth/Auth0), scope collections to user IDs |

---

## 11. Architecture Diagram (High-Level)

```
┌─────────────────────────────────────────────────────┐
│                   Next.js App Router                 │
│                                                      │
│  ┌─────────────────┐   ┌─────────────────────────┐  │
│  │  Upload Page     │   │  Chat Page              │  │
│  │  DocumentUpload  │   │  ChatInterface          │  │
│  │  Sidebar         │   │  MessageBubble          │  │
│  └────────┬────────┘   └───────────┬─────────────┘  │
│           │                        │                 │
│           ▼                        ▼                 │
│  ┌─────────────────┐   ┌─────────────────────────┐  │
│  │  /api/upload     │   │  /api/chat              │  │
│  └────────┬────────┘   └───────────┬─────────────┘  │
│           │                        │                 │
└───────────┼────────────────────────┼─────────────────┘
            │                        │
            ▼                        ▼
┌──────────────────────┐   ┌────────────────────────┐
│  Ingestion Pipeline  │   │  Retrieval Pipeline    │
│                      │   │                        │
│  parse ──► chunk ──► │   │  embed query ──►      │
│  embed ──► store     │   │  Qdrant search ──►     │
│        (Qdrant)      │   │  LLM generate ──►      │
│                      │   │  stream response       │
└──────────────────────┘   └────────────────────────┘
                              │
                              ▼
                    ┌────────────────────┐
                    │  OpenRouter API    │
                    │  ────────────────  │
                    │  Embeddings API    │
                    │  Chat Completions  │
                    └────────────────────┘
```

---

## 12. Potential Viva Questions

### Conceptual

1. **What is RAG and why use it instead of fine-tuning?**
   - RAG = retrieval + generation. Fine-tuning modifies model weights; RAG retrieves relevant context at inference time. RAG is better for dynamic knowledge, cheaper, and less prone to hallucination.

2. **Explain the full RAG pipeline in this project.**
   - Upload → PDF/TXT parsing → Recursive Character Text Splitting (1000 chars, 200 overlap) → Embedding (text-embedding-3-small, 1536-d) → Qdrant storage. Query → embed → cosine search → top-5 chunks → system prompt with context → GPT-4.1-mini streaming.

3. **Why chunk documents? What happens if chunks are too large/small?**
   - Too large: irrelevant context dilutes the signal, exceeds context window. Too small: missing context, fragmented answers. Overlap mitigates boundary loss.

4. **What is Cosine similarity and why use it for embeddings?**
   - Measures angle between vectors (direction similarity). Magnitude-invariant, so it captures semantic meaning regardless of text length.

5. **How do you prevent the LLM from hallucinating?**
   - Strict system prompt: "ONLY answer based on context. Do NOT use general knowledge." Temperature 0.3 for determinism. Source citation requirement.

6. **Explain the streaming implementation.**
   - Server: `ReadableStream` wrapping OpenAI's `stream: true` response. Each delta token is enqueued via `TextEncoder`. Client: `response.body.getReader()` reads chunks and updates UI in real-time.

### Advanced

7. **How would you handle multi-turn conversations where the user says "tell me more"?**
   - Pass `chatHistory` (last 10 messages) to the LLM. But the query itself may be ambiguous — need query rewriting: use LLM to expand "tell me more" into a standalone question before retrieval.

8. **How would you scale this to 10,000 documents?**
   - Switch from one-collection-per-doc to single collection with metadata (userId, docId). Add HNSW index tuning. Use background queues for ingestion. Add caching layer (Redis) for frequent queries.

9. **What if two documents contradict each other?**
   - Current design (single doc scope) avoids this. For cross-doc: retrieve from both, present conflicting evidence in prompt, have LLM synthesize with caveats.

10. **How would you evaluate RAG quality?**
    - Use RAGAS framework: Faithfulness (is answer in context?), Answer Relevance (does answer match question?), Context Precision (are all retrieved chunks relevant?), Context Recall (were all relevant chunks retrieved?).

11. **Describe a chunking strategy improvement you'd make.**
    - Semantic chunking: embed sentences incrementally and detect cosine similarity drops to find topic boundaries. Or Small-to-Big: retrieve on small chunks (200 chars) for precision, feed larger context blocks (1000 chars) to the LLM.

12. **What is Hybrid Search and how would you implement it?**
    - Combine dense vector search (semantic) with sparse keyword search (BM25). Qdrant supports this via sparse vectors. Weighted combination: `final_score = α * cosine + (1-α) * BM25`. Catches exact matches that vector search misses.

13. **How does the prompt prevent hallucination in the current system?**
    - The system prompt explicitly forbids using general knowledge, requires source citation, and instructs the model to say "I don't know" when information is absent from context. The retrieved context is formatted with relevance scores to give the model awareness of confidence.

14. **What are the failure modes of this RAG system?**
    - Topic drift in multi-turn (invalidates previous retrieval). Chunk boundary cuts off critical info. PDF parsing fails on scanned documents/tables. Queries requiring synthesis across non-adjacent chunks. User asks about document not yet uploaded.

15. **How would you add multi-document QA?**
    - Switch to single Qdrant collection with `docId` payload field. On query, either search all docs or let user select multiple. In prompt, prefix each source with its document name. Modify system prompt to handle cross-document synthesis.

---

## 13. Key Code Reference Index

| Component | File | Key Function |
|---|---|---|
| Document Parsing | `lib/documentProcessor.js` | `processFile()` |
| Chunking | `lib/chunker.js` | `splitText()`, `chunkDocument()` |
| Embeddings | `lib/embeddings.js` | `embedTexts()`, `embedQuery()` |
| Vector Store | `lib/vectorStore.js` | `createCollection()`, `upsertVectors()`, `search()` |
| LLM Generation | `lib/openrouter.js` | `generateStreamingAnswer()`, `buildSystemPrompt()` |
| Upload Pipeline | `app/api/upload/route.js` | `POST()` — orchestrates ingest |
| Chat Pipeline | `app/api/chat/route.js` | `POST()` — orchestrates retrieve + generate |
| Upload UI | `components/DocumentUpload.jsx` | Drag-drop with progress steps |
| Chat UI | `components/ChatInterface.jsx` | Streaming consumption |
| Source Display | `components/MessageBubble.jsx` | Citation toggle |
| Document List | `components/Sidebar.jsx` | Doc CRUD |
| Root State | `app/page.js` | Document + chat state management |

---

## 14. Glossary

| Term | Definition |
|---|---|
| **RAG** | Retrieval-Augmented Generation — retrieve relevant context, then generate |
| **Chunk** | A segment of text from a document used as a retrieval unit |
| **Embedding** | Dense vector representation of text in a high-dimensional space |
| **Cosine Similarity** | Measure of angle between two vectors (semantic similarity) |
| **Vector Database** | DB optimized for vector similarity search (Qdrant, Pinecone, Weaviate) |
| **Top-K** | Number of most similar items retrieved from vector search |
| **HNSW** | Hierarchical Navigable Small World — graph-based ANN algorithm Qdrant uses |
| **Temperature** | LLM parameter controlling randomness (lower = more deterministic) |
| **System Prompt** | Initial instruction to the LLM setting behavior and constraints |
| **Streaming** | Sending LLM output token-by-token as it's generated |
| **OpenRouter** | API gateway providing unified access to multiple LLM providers |
| **Chunk Overlap** | Overlapping text between consecutive chunks to prevent boundary loss |
| **Hybrid Search** | Combining dense (vector) and sparse (keyword) search |
| **Re-ranking** | Secondary deeper scoring of initial retrieval results using cross-encoder |
