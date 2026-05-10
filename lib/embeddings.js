/**
 * OpenRouter Embeddings Module
 * 
 * Uses the OpenAI-compatible embeddings API via OpenRouter
 * to generate vector embeddings for text chunks and queries.
 * 
 * @module embeddings
 */

import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const BATCH_SIZE = 50; // Max texts per embedding request

/**
 * Generate embeddings for an array of texts.
 * Automatically batches requests for efficiency.
 * 
 * @param {string[]} texts - Array of text strings to embed.
 * @returns {Promise<number[][]>} Array of embedding vectors.
 */
export async function embedTexts(texts) {
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });

    // Sort by index to maintain order
    const sorted = response.data.sort((a, b) => a.index - b.index);
    allEmbeddings.push(...sorted.map((item) => item.embedding));
  }

  return allEmbeddings;
}

/**
 * Generate embedding for a single query string.
 * 
 * @param {string} query - The query text to embed.
 * @returns {Promise<number[]>} Embedding vector.
 */
export async function embedQuery(query) {
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: query,
  });

  return response.data[0].embedding;
}
