import { generateStreamingAnswer } from "@/lib/openrouter";
import { runRetrievalPipeline } from "@/lib/ragPipeline";

export async function POST(request) {
  try {
    const { query, collectionName, chatHistory, ragConfig } = await request.json();

    if (!query || !collectionName) {
      return new Response(
        JSON.stringify({ error: "Query and collectionName are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Run the retrieval pipeline (query rewrite, sub-query, hyde, rerank, corrective)
    const { chunks, pipelineLog, refinedQuery } = await runRetrievalPipeline({
      query,
      collectionName,
      chatHistory: chatHistory || [],
      config: ragConfig || {},
    });

    if (chunks.length === 0) {
      return new Response(
        JSON.stringify({ error: "No relevant content found in the document" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Generate streaming answer using retrieved chunks
    const stream = generateStreamingAnswer(
      refinedQuery || query,
      chunks,
      chatHistory || []
    );

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Sources": JSON.stringify(
          chunks.map((c) => ({
            text: (c.text || "").slice(0, 200) + "...",
            score: c.score || c.rerankScore / 10 || 0,
            chunkIndex: c.metadata?.chunkIndex ?? 0,
          }))
        ),
        "X-Pipeline-Log": JSON.stringify(
          pipelineLog.map((e) => ({ step: e.step, ...e }))
        ),
        "X-Refined-Query": encodeURIComponent(refinedQuery || query),
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
