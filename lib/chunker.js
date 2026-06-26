import { embedTexts } from "@/lib/embeddings";

const DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", " ", ""];

// ====== RECURSIVE CHARACTER SPLITTER (existing) ======

export function splitText(text, options = {}) {
  const {
    chunkSize = 1000,
    chunkOverlap = 200,
    separators = DEFAULT_SEPARATORS,
  } = options;

  return recursiveSplit(text, separators, chunkSize, chunkOverlap);
}

function recursiveSplit(text, separators, chunkSize, chunkOverlap) {
  if (text.length <= chunkSize) {
    return [text.trim()].filter(Boolean);
  }

  let bestSeparator = "";
  for (const sep of separators) {
    if (sep === "") {
      bestSeparator = sep;
      break;
    }
    if (text.includes(sep)) {
      bestSeparator = sep;
      break;
    }
  }

  const splits = bestSeparator === ""
    ? text.split("")
    : text.split(bestSeparator);

  const chunks = [];
  let currentChunk = "";

  for (const split of splits) {
    const piece = currentChunk
      ? currentChunk + bestSeparator + split
      : split;

    if (piece.length > chunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      const overlap = currentChunk.slice(-chunkOverlap);
      currentChunk = overlap + bestSeparator + split;

      if (currentChunk.length > chunkSize) {
        const remainingSeparators = separators.slice(
          separators.indexOf(bestSeparator) + 1
        );
        if (remainingSeparators.length > 0) {
          const subChunks = recursiveSplit(
            currentChunk,
            remainingSeparators,
            chunkSize,
            chunkOverlap
          );
          if (subChunks.length > 1) {
            chunks.push(...subChunks.slice(0, -1));
            currentChunk = subChunks[subChunks.length - 1];
          } else {
            currentChunk = subChunks[0] || "";
          }
        }
      }
    } else if (piece.length > chunkSize && !currentChunk) {
      const remainingSeparators = separators.slice(
        separators.indexOf(bestSeparator) + 1
      );
      if (remainingSeparators.length > 0) {
        const subChunks = recursiveSplit(
          split,
          remainingSeparators,
          chunkSize,
          chunkOverlap
        );
        chunks.push(...subChunks);
      } else {
        for (let i = 0; i < split.length; i += chunkSize - chunkOverlap) {
          chunks.push(split.slice(i, i + chunkSize).trim());
        }
      }
    } else {
      currentChunk = piece;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter(Boolean);
}

// ====== FIXED-SIZE CHUNKING ======

export function splitTextFixed(text, options = {}) {
  const { chunkSize = 1000, chunkOverlap = 200 } = options;

  if (text.length <= chunkSize) {
    return [text.trim()].filter(Boolean);
  }

  const chunks = [];
  const step = chunkSize - chunkOverlap;

  for (let i = 0; i < text.length; i += step) {
    const chunk = text.slice(i, i + chunkSize).trim();
    if (chunk) chunks.push(chunk);
  }

  return chunks;
}

// ====== SENTENCE-BASED CHUNKING ======

const SENTENCE_BOUNDARIES = /(?<=[.!?])\s+/;

export function splitTextBySentences(text, options = {}) {
  const { chunkSize = 1000, chunkOverlap = 200 } = options;

  const sentences = text.split(SENTENCE_BOUNDARIES).filter(s => s.trim());
  if (sentences.length === 0) return [];

  const chunks = [];
  let currentChunk = "";
  let currentLength = 0;

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if (currentLength + trimmed.length > chunkSize && currentChunk) {
      chunks.push(currentChunk.trim());

      // Start new chunk with overlap: keep sentences from end of current chunk
      const overlapSentences = [];
      let overlapLen = 0;
      const currentSentences = currentChunk.split(SENTENCE_BOUNDARIES);
      for (let i = currentSentences.length - 1; i >= 0; i--) {
        const s = currentSentences[i].trim();
        if (overlapLen + s.length > chunkOverlap) break;
        overlapSentences.unshift(s);
        overlapLen += s.length;
      }

      currentChunk = overlapSentences.join(" ") + " " + trimmed;
      currentLength = currentChunk.length;
    } else {
      if (currentChunk) currentChunk += " ";
      currentChunk += trimmed;
      currentLength = currentChunk.length;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// ====== SEMANTIC CHUNKING ======

export async function splitTextSemantic(text, options = {}) {
  const {
    chunkSize = 1000,
    chunkOverlap = 200,
    similarityThreshold = 0.85,
  } = options;

  const sentences = text.split(SENTENCE_BOUNDARIES).filter(s => s.trim());
  if (sentences.length === 0) return [];
  if (sentences.length <= 2) {
    return [text.trim()].filter(Boolean);
  }

  // Group sentences into windows of ~3-5 for efficient embedding
  const groups = [];
  const GROUP_SIZE = 5;
  for (let i = 0; i < sentences.length; i += GROUP_SIZE) {
    groups.push(sentences.slice(i, i + GROUP_SIZE).join(" ").trim());
  }

  let embeddings;
  try {
    embeddings = await embedTexts(groups);
  } catch (error) {
    console.error("Semantic chunking embedding error, falling back to recursive:", error);
    return splitText(text, { chunkSize, chunkOverlap });
  }

  // Detect topic boundaries where cosine similarity drops
  const boundaries = [0];
  for (let i = 1; i < embeddings.length; i++) {
    const sim = cosineSimilarity(embeddings[i - 1], embeddings[i]);
    if (sim < similarityThreshold) {
      boundaries.push(i * GROUP_SIZE);
    }
  }

  // Build chunks from sentence groups between boundaries
  const chunks = [];
  let startSentence = 0;

  for (const boundary of boundaries.slice(1)) {
    const segment = sentences.slice(startSentence, boundary).join(" ").trim();
    if (segment) {
      // If segment exceeds chunk size, sub-split using recursive
      if (segment.length > chunkSize) {
        const subChunks = splitText(segment, { chunkSize, chunkOverlap, separators: [". ", " ", ""] });
        chunks.push(...subChunks);
      } else {
        chunks.push(segment);
      }
    }
    startSentence = Math.max(0, boundary - Math.floor(chunkOverlap / 50));
  }

  // Last segment
  const finalSegment = sentences.slice(startSentence).join(" ").trim();
  if (finalSegment) chunks.push(finalSegment);

  return chunks.filter(Boolean);
}

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ====== STRATEGY FACTORY ======

const STRATEGIES = {
  recursive: splitText,
  fixed: splitTextFixed,
  sentence: splitTextBySentences,
  semantic: splitTextSemantic,
};

export function getChunker(strategy = "recursive") {
  const fn = STRATEGIES[strategy];
  if (!fn) {
    console.warn(`Unknown chunking strategy "${strategy}", falling back to recursive`);
    return STRATEGIES.recursive;
  }
  return fn;
}

// ====== DOCUMENT CHUNKING WRAPPER ======

export function chunkDocument(text, source, options = {}) {
  const { strategy = "recursive", chunkSize = 1000, chunkOverlap = 200 } = options;
  const chunker = getChunker(strategy);
  const isAsync = strategy === "semantic";

  if (isAsync) {
    return (async () => {
      const chunks = await chunker(text, { chunkSize, chunkOverlap });
      return chunks.map((chunk, index) => ({
        text: chunk,
        metadata: { source, chunkIndex: index, totalChunks: chunks.length, strategy },
      }));
    })();
  }

  const chunks = chunker(text, { chunkSize, chunkOverlap });
  return chunks.map((chunk, index) => ({
    text: chunk,
    metadata: {
      source,
      chunkIndex: index,
      totalChunks: chunks.length,
      strategy,
    },
  }));
}
