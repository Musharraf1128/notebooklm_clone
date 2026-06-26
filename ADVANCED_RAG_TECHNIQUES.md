# Advanced RAG Techniques — Complete Reference

## Table of Contents

1. [What is RAG and Why It Exists](#1-what-is-rag-and-why-it-exists)
2. [RAG vs Fine-Tuning — Decision Framework](#2-rag-vs-fine-tuning--decision-framework)
3. [Vector Databases Overview](#3-vector-databases-overview)
4. [Embeddings & Indexing](#4-embeddings--indexing)
5. [Document Chunking Strategies](#5-document-chunking-strategies)
6. [Basic Retrieval + Generation Flow](#6-basic-retrieval--generation-flow)
7. [Bottlenecks in RAG](#7-bottlenecks-in-rag)
8. [Speed vs Accuracy Tradeoff](#8-speed-vs-accuracy-tradeoff)
9. [Query Rewriting Using SLMs (Query Translation)](#9-query-rewriting-using-slms-query-translation)
10. [LLM Judges](#10-llm-judges)
11. [Sub-Query Enhancement](#11-sub-query-enhancement)
12. [Corrective RAG & HyDE Principle](#12-corrective-rag--hyde-principle)
13. [Re-Ranking Strategies (Cross-Encoders)](#13-re-ranking-strategies-cross-encoders)
14. [Context Window & Token Bottlenecks](#14-context-window--token-bottlenecks)
15. [Chunk Size & Overlap Tradeoffs](#15-chunk-size--overlap-tradeoffs)
16. [Implementation in This Project](#16-implementation-in-this-project)

---

## 1. What is RAG and Why It Exists

**Retrieval-Augmented Generation (RAG)** is a technique that enhances LLM outputs by first retrieving relevant information from a knowledge base (vector database) and then feeding that context to the LLM before generation.

### The Problem RAG Solves

LLMs have two fundamental limitations:

- **Knowledge cutoff**: Training data has a fixed date. Anything after that is unknown.
- **Hallucination**: LLMs generate plausible-sounding but factually incorrect information.
- **Opacity**: It's impossible to know which sources the LLM used for its answer.

### How RAG Fixes This

```
User Query
    │
    ▼
┌─────────────┐     ┌──────────────────┐
│  Retrieve    │────>│  Context from    │
│  Relevant    │     │  Your Documents  │
│  Documents   │     │  (ground truth)  │
└─────────────┘     └────────┬─────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │  LLM Generates   │
                   │  Grounded Answer │
                   └──────────────────┘
```

By grounding the LLM's answer in retrieved context, RAG:
- Eliminates hallucinations about your specific documents
- Updates instantly (re-index new docs)
- Provides source traceability
- Reduces cost vs. continual fine-tuning

---

## 2. RAG vs Fine-Tuning — Decision Framework

| Criterion | RAG | Fine-Tuning |
|-----------|-----|-------------|
| **Knowledge freshness** | Update index, done | Re-train or LoRA update needed |
| **Cost** | Pay-per-token + storage | High upfront training cost |
| **Hallucination risk** | Low (external context grounds answer) | Higher (relies on parametric knowledge) |
| **Data privacy** | Docs stay in your vector DB | Training data enters model weights |
| **Latency** | Higher (retrieval step added) | Lower (single forward pass) |
| **Accuracy on rare facts** | High (if doc contains it) | Moderate (might not memorize) |
| **Custom behavior/format** | Prompt engineering | Very effective (behavior learned) |
| **Infrastructure complexity** | Simple (DB + API calls) | Complex (GPU training, data pipelines) |

### When to Use What

**Choose RAG when:**
- Your knowledge base changes frequently
- You need source citations and traceability
- You're working with private/dynamic documents
- Quick deployment is needed
- You can't afford fine-tuning costs

**Choose Fine-Tuning when:**
- You need to teach the model a specific behavior or format
- The knowledge is static and well-defined
- Latency is critical and you can't afford retrieval overhead
- You need the model to learn a task (e.g., summarization style, code generation patterns)

**Hybrid approach (often best):**
Fine-tune for behavior + RAG for knowledge. The fine-tuned model learns how to answer; RAG provides the facts.

---

## 3. Vector Databases Overview

Vector databases are specialized databases designed to store and search high-dimensional vector embeddings efficiently. They use Approximate Nearest Neighbor (ANN) algorithms to find similar vectors without exhaustive search.

### Comparison

| Feature | Qdrant (This Project) | Pinecone | Chroma |
|---------|----------------------|----------|--------|
| **Hosting** | Cloud + Self-hosted | Cloud-only | Embedded/self-hosted |
| **Free tier** | 1GB cluster (no CC) | Limited (needs CC) | Unlimited (local) |
| **ANN algorithm** | HNSW + custom | HNSW | HNSW |
| **Sparse vectors** | Native support | No | No |
| **Filtering** | Payload + geo | Metadata filter | Metadata filter |
| **Multi-tenancy** | Collections + payload | Indexes + namespaces | Collections |
| **Client** | REST + gRPC + JS client | REST + Python/JS | Python only |
| **Best for** | Production, flexible | Quick start, managed | Local dev, small scale |

### Why HNSW?

Hierarchical Navigable Small World (HNSW) is the standard ANN algorithm in modern vector DBs:
- Builds a multi-layer graph index
- Search is O(log n) instead of O(n)
- 95-99% recall at 10-100x speedup vs. brute force
- Tradeoff: index build time vs. search speed (configurable via `ef_construct` and `m` parameters)

### In This Project

We use **Qdrant Cloud** with Cosine distance and 1536-dimensional vectors. Each document gets its own collection (`doc_<name>_<timestamp>`). Payload stores the original text for retrieval.

---

## 4. Embeddings & Indexing

### What Are Embeddings?

Embeddings are dense vector representations of text in a high-dimensional semantic space. Semantically similar texts have vectors that are close together (high cosine similarity).

### Model: text-embedding-3-small

- **Dimensions**: 1536
- **Provider**: OpenRouter (OpenAI-compatible)
- **Characteristics**:
  - State-of-the-art quality for retrieval
  - 256x cheaper than text-embedding-3-large
  - Supports variable dimensions (can truncate to 256-1536)

### Embedding Pipeline

```javascript
// Document-side (ingestion)
"Deep learning is a subset of ML..."  →  [0.023, -0.456, ..., 0.789]  (1536-d)

// Query-side (retrieval)
"What is deep learning?"              →  [0.031, -0.421, ..., 0.812]  (1536-d)
```

### Why Cosine Similarity?

```javascript
cosine(A, B) = (A · B) / (||A|| × ||B||)
```

- Range: [-1, 1], higher = more similar
- **Magnitude-invariant**: focuses on direction, which captures semantics
- Preferred over Euclidean distance for text embeddings

### Indexing Strategy

Qdrant uses HNSW indexing:
- **m**: Number of bi-directional links per node (default 16)
- **ef_construct**: Search breadth during index construction (default 100)
- Higher values = better recall but slower indexing

---

## 5. Document Chunking Strategies

Chunking is the process of dividing documents into smaller pieces for retrieval. It's one of the most impactful decisions in RAG quality.

### Strategy Comparison

| Strategy | How It Works | Pros | Cons | Best For |
|----------|-------------|------|------|----------|
| **Fixed Size** | Split every N characters | Simple, fast, predictable | Ignores content boundaries | Simple text, logs |
| **Recursive Character** | Hierarchical split by separators (`\n\n` → `\n` → `. `) | Semantic-aware, robust | Fixed size limit | General purpose |
| **Sentence-Based** | Split at sentence boundaries | Natural breaks, grammatical units | Sentences can be long | Prose, articles |
| **Semantic** | Embed sentences, detect topic shifts via cosine drops | Topic-coherent chunks | Slow, expensive (API calls) | Long docs, research papers |

### In This Project

```javascript
// Strategy selection during upload
const chunks = chunkDocument(text, filename, {
  strategy: "semantic",   // "recursive" | "fixed" | "sentence" | "semantic"
  chunkSize: 1000,
  chunkOverlap: 200,
});
```

**Recursive Character** (default): Tries paragraph breaks first, falls back to sentences, then words, then characters. Best balance of quality and speed.

**Semantic Chunking**: Embeds sentence groups, detects topic boundaries where cosine similarity drops below a threshold (default 0.85). Produces more coherent chunks but requires API calls during upload.

### Chunk Metadata

Each chunk stores:
```
{
  text: "chunk content",
  metadata: {
    source: "document.pdf",
    chunkIndex: 3,
    totalChunks: 47,
    strategy: "semantic"
  }
}
```

---

## 6. Basic Retrieval + Generation Flow

The standard RAG flow implemented in all projects:

```
1. INGESTION
   Document → Parse → Chunk → Embed → Store Vectors

2. RETRIEVAL
   Query → Embed Query → Vector Search → Top-K Chunks

3. GENERATION
   System Prompt + Top-K Chunks + Query → LLM → Answer
```

### In This Project

The base pipeline lives in `app/api/chat/route.js` and `app/api/upload/route.js`. The advanced pipeline (below) wraps this with enhancements.

---

## 7. Bottlenecks in RAG

### 1. Retrieval Quality
- **Problem**: Irrelevant chunks retrieved → LLM hallucinates or misses info
- **Causes**: Poor chunking, bad embeddings, query-document vocabulary gap
- **Fixes**: Query rewriting, HyDE, re-ranking, hybrid search

### 2. Context Window Saturation
- **Problem**: Too many chunks → exceeds context window → truncated context or high cost
- **Causes**: Large top-K, verbose chunks
- **Fixes**: Re-ranking (keep only top-5), prompt compression, smaller chunks

### 3. Latency
- **Problem**: Slow responses from multi-step retrieval
- **Causes**: API calls per stage (embedding, re-ranking, LLM judges)
- **Fixes**: Caching, smaller models for sub-tasks, parallel execution

### 4. Query Ambiguity
- **Problem**: Vague queries → poor retrieval
- **Causes**: Multi-turn context loss, pronouns ("tell me more")
- **Fixes**: Query rewriting, sub-query decomposition

### 5. Hallucination
- **Problem**: LLM ignores context and uses parametric knowledge
- **Causes**: Weak system prompt, irrelevant context, high temperature
- **Fixes**: Strong grounding prompts, temperature 0.3, corrective RAG

---

## 8. Speed vs Accuracy Tradeoff

Every advanced technique adds latency in exchange for quality:

| Technique | Latency Added | Accuracy Gain | When to Use |
|-----------|--------------|---------------|-------------|
| Query Rewriting | ~500ms | Medium | Multi-turn conversations |
| Query Expansion | ~1s + N retrievals | Medium-High | Short/vague queries |
| Sub-Query | ~1s + N retrievals | High | Complex multi-facet queries |
| HyDE | ~1s | Medium | Vocabulary mismatch |
| Re-Ranking (LLM) | ~2-5s | High | Large top-K initial results |
| Re-Ranking (Cross-encoder) | ~100-500ms | High | Dedicated reranker API |
| Corrective RAG | ~2-5s per iteration | Very High | High-stakes accuracy needs |
| LLM Judge | ~1-2s | N/A (eval only) | Monitoring & debugging |

### Optimization Strategies

- **Enable techniques selectively** based on query complexity
- **Use smaller models** for sub-tasks (query rewrite, judge)
- **Cache** frequent queries and their results
- **Parallelize** independent stages (e.g., HyDE + standard search concurrently)

---

## 9. Query Rewriting Using SLMs (Query Translation)

### What It Is

Query rewriting uses a Small Language Model (SLM) to transform a user's query into a more searchable form before retrieval. This is especially critical for **multi-turn conversations** where users say things like "tell me more" or "what about the other approach?"

### How It Works

```javascript
Original: "What was that thing about transformers?"
    │
    ▼
SLM Rewriter (gpt-4.1-mini)
    │
    ▼
Rewritten: "What are the attention mechanisms and transformer architecture in deep learning?"
    │
    ▼
Embed → Search (much better results)
```

### Implementation

`lib/queryRewriter.js` provides two functions:

- **`rewriteQuery(query, chatHistory)`**: Resolves pronouns and references using conversation history. Returns a standalone, clear question.
- **`expandQuery(query)`**: Generates 3 alternative phrasings for multi-vector retrieval.

### Benefits

- +15-30% retrieval recall for multi-turn queries
- Resolves ambiguity without user intervention
- Completely transparent (rewritten query used internally)
- Uses cheap SLM (~500 tokens per rewrite)

---

## 10. LLM Judges

### What They Are

LLM-as-Judge is a technique where an LLM evaluates the quality of RAG pipeline stages. Instead of relying on static metrics, we use a language model to judge relevance, faithfulness, and answerability.

### Three Judge Functions

#### 1. Relevance Judge
Evaluates how relevant each retrieved chunk is to the query (0-10):

```javascript
{
  "index": 2,
  "score": 9,
  "reason": "Contains specific information about transformer attention mechanisms"
}
```

#### 2. Faithfulness Judge
Evaluates whether the generated answer is grounded in the context:

```javascript
{
  "faithfulness": 8,      // Are claims supported by context?
  "completeness": 7,      // Does answer use all relevant info?
  "conciseness": 9,       // Is answer free of verbosity?
  "hallucinated_claims": []  // Any claims NOT in the context
}
```

#### 3. Answerability Judge
Determines if the query can be answered from the retrieved chunks at all.

### Implementation

`lib/llmJudge.js` uses a separate system prompt optimized for evaluation (not generation). It uses `temperature: 0.1` for consistent scoring and `response_format: { type: "json_object" }` for structured output.

### Use Cases

- **Real-time**: Corrective RAG uses judges to decide if re-retrieval is needed
- **Offline**: RAG quality monitoring and A/B testing
- **Debugging**: Pipeline logs show judge scores for each query

---

## 11. Sub-Query Enhancement

### What It Is

Complex questions often have multiple facets. A single vector search might miss some facets. Sub-query enhancement decomposes the question into simpler sub-questions, retrieves for each, and merges results.

### How It Works

```
Original: "What are the causes and treatments of type 2 diabetes?"
    │
    ▼
Decomposition (LLM):
    ├── "What causes type 2 diabetes?"
    ├── "What treatments are available for type 2 diabetes?"
    └── "How does insulin resistance relate to type 2 diabetes?"
    │
    ▼
Retrieve for each → Merge via Reciprocal Rank Fusion (RRF)
    │
    ▼
Final: Top-K across all sub-queries
```

### Reciprocal Rank Fusion (RRF)

RRF merges multiple result sets by combining rank positions:

```javascript
RRF_score(d) = Σ 1 / (k + rank_i(d))

// where k = 60 (constant)
// rank_i(d) = position of document d in result set i
```

This gives higher weight to documents that rank well across multiple sub-queries.

### Implementation

`lib/subQueryEnhancer.js`:
- **`decomposeQuery(query)`**: LLM decomposes into 2-4 sub-queries
- **`reciprocalRankFusion(resultsList, k=60)`**: RRF merge algorithm
- **`searchWithSubQueries(collectionName, subQueries, topK)`**: Full pipeline

### Benefits

- Handles multi-facet queries naturally
- Recovers from missed retrieval on a single query
- RRF fusion smooths out individual retrieval failures

---

## 12. Corrective RAG & HyDE Principle

### Corrective RAG

Corrective RAG adds a feedback loop to the RAG pipeline. After retrieval and generation, the system evaluates its own output and corrects if needed.

#### Retrieval Correction

```javascript
1. Search → Get top-20 chunks
2. LLM Judge evaluates: "Is the query answerable from these chunks?"
3. If NOT (avg relevance < 4/10):
   a. Rewrite the query
   b. Re-retrieve with rewritten query
   c. Re-evaluate
4. Proceed to generation
```

Max 2 corrective iterations to prevent infinite loops.

#### Generation Correction

```javascript
1. Generate answer with top-5 chunks
2. LLM Judge evaluates faithfulness (0-10)
3. If faithfulness < 6/10:
   a. Flag for potential regeneration
   b. Log hallucinated claims for debugging
```

### Implementation

`lib/correctiveRAG.js`:
- **`evaluateRetrieval(query, chunks)`**: Relevance + answerability check
- **`evaluateGeneration(query, chunks, answer)`**: Faithfulness check
- **`correctQuery(query, chatHistory)`**: Trigger rewrite

Integrated in `lib/ragPipeline.js` as configurable stages.

---

### HyDE (Hypothetical Document Embeddings)

HyDE addresses the **vocabulary gap** between queries and documents. A user might ask "What's the impact of AI on jobs?" while the document says "Labor market automation effects."

#### How HyDE Works

```javascript
1. Query: "What's the impact of AI on jobs?"

2. LLM generates a hypothetical passage:
   "Artificial intelligence is transforming the labor market
    by automating routine tasks, creating new job categories,
    and requiring workforce reskilling. Studies show..."

3. Embed the hypothetical passage (not the query)

4. Search with this embedding

5. Because the hypothetical passage resembles real documents,
   vector search finds better matches
```

#### Why HyDE Works

- Embeddings of similar texts are close in vector space
- A well-written hypothetical passage is closer to real documents than a short query
- The LLM bridges the "query style" to "document style" gap

#### Implementation

`lib/hyde.js`: Single function `generateHypotheticalPassage(query)` that returns a 1-2 paragraph hypothetical document passage. The passage is then embedded and used for search in `lib/ragPipeline.js`.

---

## 13. Re-Ranking Strategies (Cross-Encoders)

### What It Is

Initial vector search (bi-encoder) is fast but approximate. Re-ranking uses a more expensive but more accurate model to score the top results.

### Bi-Encoder vs Cross-Encoder

| Aspect | Bi-Encoder (Initial Search) | Cross-Encoder (Re-Ranking) |
|--------|---------------------------|---------------------------|
| **Speed** | Fast (pre-computed vectors) | Slow (runs on each pair) |
| **Accuracy** | Good for broad retrieval | Excellent for precise ranking |
| **How** | Encodes query and doc separately | Encodes query+doc as a pair |
| **Scalability** | O(1) per query (ANN index) | O(K) for K candidates |

### Architecture

```
                    ┌──────────────┐
                    │  Vector DB   │
                    │  (Bi-encoder)│
                    └──────┬───────┘
                           │ Top 20
                           ▼
                    ┌──────────────┐
                    │  Re-Ranker   │
                    │ (Cross-encoder)│
                    └──────┬───────┘
                           │ Top 5
                           ▼
                    ┌──────────────┐
                    │  LLM         │
                    │  Generation  │
                    └──────────────┘
```

### Implementation

Since we can't run cross-encoders natively in JavaScript, `lib/reranker.js` implements an **LLM-based cross-encoder**:

1. Retrieve top-20 chunks from vector search
2. Ask the LLM to score each chunk's relevance to the query (0-10)
3. Sort by LLM score and return top-5

```javascript
export async function rerank(query, chunks, topK = 5) {
  // LLM prompt: "Score each chunk's relevance to the query 0-10"
  // Returns re-ordered top-5 with rerank scores
}
```

For production, consider:
- **Cohere Rerank API**: Dedicated cross-encoder API
- **BGE-Reranker**: Open-source cross-encoder (requires Python/hosting)
- **Jina Reranker**: Another API-based option

### Benefits

- +10-20% retrieval accuracy
- Filters out false positives from vector search
- More relevant context for the LLM → better answers

---

## 14. Context Window & Token Bottlenecks

### The Problem

LLM context windows (8K-200K tokens) are finite. Each chunk added to the prompt consumes tokens:

```
Top-5 chunks × 250 tokens each = 1,250 tokens
+ System prompt                    = ~300 tokens
+ Chat history (10 msgs)          = ~2,000 tokens
+ Query                            = ~50 tokens
────────────────────────────────────────────
Total                              = ~3,600 tokens

With GPT-4.1-mini (1M context): Still fine
But cost: $0.00015K input × 3.6K = $0.00054 per query
```

### Cost at Scale

| Scale | Chunks | Tokens/Query | Cost (gpt-4.1-mini) |
|-------|--------|-------------|---------------------|
| 1 query | 5 × 250 | ~3,600 | $0.0005 |
| 1K queries/day | 5 × 250 | ~3.6M | $0.54/day |
| 100K queries/day | 5 × 250 | ~360M | $54/day |
| With re-ranking | 20 × 250 + 5 × 250 | ~8,600 | $1.29/day |

### Strategies to Manage Context

1. **Re-ranking**: Keep only top-5 relevant chunks from top-20
2. **Smaller chunks**: 500 chars instead of 1000 (tighter context)
3. **Selective chat history**: Only include last 3-5 relevant exchanges
4. **Prompt compression**: LLMLingua-style compression of context
5. **Dynamic top-K**: Fewer chunks for simple queries, more for complex

---

## 15. Chunk Size & Overlap Tradeoffs

### Impact of Chunk Size

| Chunk Size | Pros | Cons | Best For |
|-----------|------|------|----------|
| **200-500 chars** | Precise retrieval, fits context | Missing context, fragmented | Specific facts, Q&A |
| **500-1000 chars** | Good balance (this project) | Moderate context | General purpose |
| **1000-2000 chars** | Rich context, coherent | Wastes tokens, lower precision | Summarization |
| **2000+ chars** | Maximum context | Bad retrieval, high cost | Long-form analysis |

### Impact of Chunk Overlap

| Overlap | Pros | Cons |
|---------|------|------|
| **0%** | Minimum storage, fast | Lost context at boundaries |
| **10-20%** (used: 20%) | Bridges boundaries well | Moderate duplication |
| **30-50%** | Very safe, minimal loss | High duplication, wasted space |

### The Tradeoff

```
Small chunks:  High precision    Low recall   ← Better for specific facts
Large chunks:  Low precision     High recall  ← Better for synthesis

High overlap:  Higher recall     More tokens  ← Safer but expensive
Low overlap:   Lower recall      Fewer tokens ← Riskier but efficient
```

### Recommendation

- **Start with**: 1000 chars, 200 overlap (20%), recursive character splitter
- **Tune based on**: Average chunk retrievability, answer completeness
- **For semantic chunking**: Automatically adapts boundaries by topic

---

## 16. Implementation in This Project

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                      RAG Pipeline Orchestrator                     │
│                    lib/ragPipeline.js                              │
│                                                                     │
│  Config: { queryRewrite, queryExpansion, subQuery, hyde,          │
│            rerank, corrective }                                     │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌─────────┐  ┌──────────┐          │
│  │ Query    │─>│ Sub-Query│─>│  HyDE   │─>│ Standard │          │
│  │ Rewrite  │  │ Decomp.  │  │         │  │ Search   │          │
│  └──────────┘  └──────────┘  └─────────┘  └────┬─────┘          │
│                                                  │                │
│  ┌──────────┐  ┌──────────┐  ┌─────────┐        │                │
│  │ Corrective│ │ Re-Ranker│  │ LLM     │<───────┘                │
│  │ RAG      │>│          │  │ Generate│                         │
│  └──────────┘  └──────────┘  └─────────┘                         │
└──────────────────────────────────────────────────────────────────┘
```

### Configuration

#### Environment Variables (`.env.local`)

```bash
# RAG Pipeline Controls (enable/disable stages)
RAG_ENABLE_QUERY_REWRITE=true
RAG_ENABLE_QUERY_EXPANSION=false
RAG_ENABLE_SUB_QUERY=false
RAG_ENABLE_HYDE=false
RAG_ENABLE_RERANK=true
RAG_ENABLE_CORRECTIVE=true

# Model Selection for Sub-Tasks
RAG_REWRITER_MODEL=openai/gpt-4.1-mini
RAG_JUDGE_MODEL=openai/gpt-4.1-mini
RAG_RERANKER_MODEL=openai/gpt-4.1-mini
```

#### Per-Request Override

```javascript
fetch("/api/chat", {
  body: JSON.stringify({
    query: "What causes diabetes?",
    collectionName: "doc_health_123456",
    ragConfig: {
      queryRewrite: true,
      hyde: true,
      rerank: true,
      corrective: false,  // Override per query
    }
  })
});
```

### File Reference

| Module | File | Purpose |
|--------|------|---------|
| Query Rewriter | `lib/queryRewriter.js` | SLM-based query rewriting + expansion |
| Sub-Query | `lib/subQueryEnhancer.js` | Query decomposition + RRF merging |
| HyDE | `lib/hyde.js` | Hypothetical document passage generation |
| LLM Judge | `lib/llmJudge.js` | Relevance, faithfulness, answerability evaluation |
| Re-Ranker | `lib/reranker.js` | LLM-based cross-encoder re-ranking |
| Corrective RAG | `lib/correctiveRAG.js` | Self-evaluation + re-retrieval loops |
| Pipeline | `lib/ragPipeline.js` | Orchestrator for all techniques |
| Chunker | `lib/chunker.js` | 4 chunking strategies (recursive, fixed, sentence, semantic) |
| Chat API | `app/api/chat/route.js` | Endpoint using the pipeline |
| Upload API | `app/api/upload/route.js` | Endpoint with strategy selection |
| Chat UI | `components/ChatInterface.jsx` | RAG settings panel with toggles |
| Upload UI | `components/DocumentUpload.jsx` | Chunking strategy selector |
| Styles | `app/globals.css` | Design system additions for RAG settings |

### Pipeline Log Metadata

Each query response includes `X-Pipeline-Log` header with detailed timings and scores:

```javascript
[
  { step: "config", stages: {...}, query: "..." },
  { step: "rewriting", originalQuery: "..." },
  { step: "rewritten", before: "...", after: "..." },
  { step: "vector_search", resultCount: 20 },
  { step: "retrieval_evaluation", avgRelevance: 7.2, needsCorrection: false },
  { step: "reranking", beforeCount: 20, afterCount: 5 },
  { step: "reranked", topScore: 9.5 },
  { step: "generating", chunkCount: 5 },
]
```

---

*This document is a living reference. As RAG techniques evolve, new strategies will be added. The modular architecture of this project is designed to make adding new techniques straightforward.*
