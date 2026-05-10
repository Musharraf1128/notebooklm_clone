/**
 * Recursive Character Text Splitter
 * 
 * CHUNKING STRATEGY DOCUMENTATION:
 * ================================
 * This module implements a Recursive Character Text Splitter, which is one of the
 * most effective chunking strategies for RAG applications.
 * 
 * HOW IT WORKS:
 * 1. The text is first attempted to be split by the highest-level separator (paragraph breaks: "\n\n")
 * 2. If any resulting chunk exceeds the maximum chunk size, it falls back to the next separator ("\n")
 * 3. This continues recursively through the separator hierarchy: "\n\n" → "\n" → ". " → " " → ""
 * 4. This ensures chunks respect natural text boundaries (paragraphs > lines > sentences > words)
 * 
 * WHY THIS STRATEGY:
 * - Preserves semantic coherence within chunks (paragraphs stay together when possible)
 * - Handles varied document structures (code, prose, lists, etc.)
 * - Configurable chunk size and overlap for tuning retrieval quality
 * - Overlap ensures no context is lost at chunk boundaries
 * 
 * PARAMETERS:
 * - chunkSize (default: 1000): Maximum characters per chunk
 * - chunkOverlap (default: 200): Number of overlapping characters between consecutive chunks
 * - separators: Hierarchy of separators to try, from most to least preferred
 * 
 * @module chunker
 */

const DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", " ", ""];

/**
 * Split text into chunks using recursive character text splitting.
 * 
 * @param {string} text - The full text to split into chunks.
 * @param {Object} [options] - Configuration options.
 * @param {number} [options.chunkSize=1000] - Maximum characters per chunk.
 * @param {number} [options.chunkOverlap=200] - Overlap between consecutive chunks.
 * @param {string[]} [options.separators] - Separator hierarchy.
 * @returns {string[]} Array of text chunks.
 */
export function splitText(text, options = {}) {
  const {
    chunkSize = 1000,
    chunkOverlap = 200,
    separators = DEFAULT_SEPARATORS,
  } = options;

  return recursiveSplit(text, separators, chunkSize, chunkOverlap);
}

/**
 * Core recursive splitting logic.
 */
function recursiveSplit(text, separators, chunkSize, chunkOverlap) {
  if (text.length <= chunkSize) {
    return [text.trim()].filter(Boolean);
  }

  // Find the best separator for this text
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

  // Split on the chosen separator
  const splits = bestSeparator === ""
    ? text.split("")
    : text.split(bestSeparator);

  // Merge small splits into chunks of appropriate size
  const chunks = [];
  let currentChunk = "";

  for (const split of splits) {
    const piece = currentChunk
      ? currentChunk + bestSeparator + split
      : split;

    if (piece.length > chunkSize && currentChunk) {
      // Current chunk is full, save it
      chunks.push(currentChunk.trim());

      // Start new chunk with overlap from the end of current chunk
      const overlap = currentChunk.slice(-chunkOverlap);
      currentChunk = overlap + bestSeparator + split;

      // If this new chunk is still too long, recursively split it
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
          // Take all but last as finished chunks, last becomes currentChunk
          if (subChunks.length > 1) {
            chunks.push(...subChunks.slice(0, -1));
            currentChunk = subChunks[subChunks.length - 1];
          } else {
            currentChunk = subChunks[0] || "";
          }
        }
      }
    } else if (piece.length > chunkSize && !currentChunk) {
      // Single piece exceeds chunk size, try smaller separators
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
        // Last resort: hard-split by character count
        for (let i = 0; i < split.length; i += chunkSize - chunkOverlap) {
          chunks.push(split.slice(i, i + chunkSize).trim());
        }
      }
    } else {
      currentChunk = piece;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter(Boolean);
}

/**
 * Process a parsed document into structured chunks with metadata.
 * 
 * @param {string} text - The document text.
 * @param {string} source - The source filename.
 * @param {Object} [options] - Chunking options (chunkSize, chunkOverlap).
 * @returns {Array<{text: string, metadata: {source: string, chunkIndex: number, totalChunks: number}}>}
 */
export function chunkDocument(text, source, options = {}) {
  const chunks = splitText(text, options);

  return chunks.map((chunk, index) => ({
    text: chunk,
    metadata: {
      source,
      chunkIndex: index,
      totalChunks: chunks.length,
    },
  }));
}
