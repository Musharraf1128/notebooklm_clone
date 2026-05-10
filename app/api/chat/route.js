/**
 * Chat API Route
 * 
 * Handles user queries with full RAG retrieval + generation:
 * 1. Embed the user's query
 * 2. Search Qdrant for the most relevant chunks
 * 3. Generate a grounded answer using the LLM
 * 4. Stream the response back to the client
 */

import { embedQuery } from "@/lib/embeddings";
import { search } from "@/lib/vectorStore";
import { generateStreamingAnswer } from "@/lib/openrouter";

export async function POST(request) {
  try {
    const { query, collectionName, chatHistory } = await request.json();

    if (!query || !collectionName) {
      return new Response(
        JSON.stringify({ error: "Query and collectionName are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Step 1: Embed the user's query
    const queryVector = await embedQuery(query);

    // Step 2: Search Qdrant for relevant chunks (top 5)
    const relevantChunks = await search(collectionName, queryVector, 5);

    if (relevantChunks.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No relevant content found in the document",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Step 3: Generate streaming answer using retrieved context
    const stream = generateStreamingAnswer(
      query,
      relevantChunks,
      chatHistory || []
    );

    // Return as a streaming response
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Sources": JSON.stringify(
          relevantChunks.map((c) => ({
            text: c.text.slice(0, 200) + "...",
            score: c.score,
            chunkIndex: c.metadata.chunkIndex,
          }))
        ),
      },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate answer" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
