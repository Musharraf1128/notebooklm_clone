/**
 * Qdrant Cloud Vector Store Module
 * 
 * Manages vector storage and retrieval using Qdrant Cloud.
 * Handles collection creation, vector upsertion, and similarity search.
 * 
 * @module vectorStore
 */

import { QdrantClient } from "@qdrant/js-client-rest";

let _client = null;

/**
 * Get or create the Qdrant client singleton.
 */
function getClient() {
  if (!_client) {
    const config = {
      url: process.env.QUADRANT_CLUSTER_END_POINT,
    };
    if (process.env.QUADRANT_API_KEY) {
      config.apiKey = process.env.QUADRANT_API_KEY;
    }
    _client = new QdrantClient(config);
  }
  return _client;
}

/**
 * Create a new collection in Qdrant if it doesn't exist.
 * 
 * @param {string} collectionName - Name of the collection.
 * @param {number} [vectorSize=1536] - Dimension of embedding vectors.
 */
export async function createCollection(collectionName, vectorSize = 1536) {
  const client = getClient();

  try {
    const collections = await client.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === collectionName
    );

    if (!exists) {
      await client.createCollection(collectionName, {
        vectors: {
          size: vectorSize,
          distance: "Cosine",
        },
      });
    }
  } catch (error) {
    console.error("Error creating collection:", error);
    throw error;
  }
}

/**
 * Store document chunks with their embeddings in Qdrant.
 * 
 * @param {string} collectionName - Target collection name.
 * @param {number[][]} vectors - Array of embedding vectors.
 * @param {Array<{text: string, metadata: Object}>} chunks - Document chunks with metadata.
 */
export async function upsertVectors(collectionName, vectors, chunks) {
  const client = getClient();

  const points = vectors.map((vector, index) => ({
    id: index,
    vector,
    payload: {
      text: chunks[index].text,
      ...chunks[index].metadata,
    },
  }));

  // Upsert in batches of 100
  const BATCH_SIZE = 100;
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    await client.upsert(collectionName, { points: batch });
  }
}

/**
 * Search for the most similar chunks to a query vector.
 * 
 * @param {string} collectionName - Collection to search.
 * @param {number[]} queryVector - Query embedding vector.
 * @param {number} [topK=5] - Number of results to return.
 * @returns {Promise<Array<{text: string, score: number, metadata: Object}>>}
 */
export async function search(collectionName, queryVector, topK = 5) {
  const client = getClient();

  const results = await client.search(collectionName, {
    vector: queryVector,
    limit: topK,
    with_payload: true,
  });

  return results.map((result) => ({
    text: result.payload.text,
    score: result.score,
    metadata: {
      source: result.payload.source,
      chunkIndex: result.payload.chunkIndex,
      totalChunks: result.payload.totalChunks,
    },
  }));
}

/**
 * List all collections in Qdrant.
 * 
 * @returns {Promise<string[]>} Array of collection names.
 */
export async function listCollections() {
  const client = getClient();
  const response = await client.getCollections();
  return response.collections.map((c) => c.name);
}

/**
 * Delete a collection from Qdrant.
 * 
 * @param {string} collectionName - Collection to delete.
 */
export async function deleteCollection(collectionName) {
  const client = getClient();
  await client.deleteCollection(collectionName);
}

/**
 * Get info about a collection.
 * 
 * @param {string} collectionName - Collection name.
 * @returns {Promise<Object>} Collection info including point count.
 */
export async function getCollectionInfo(collectionName) {
  const client = getClient();
  try {
    const info = await client.getCollection(collectionName);
    return {
      name: collectionName,
      pointsCount: info.points_count,
      vectorSize: info.config.params.vectors.size,
    };
  } catch {
    return null;
  }
}
