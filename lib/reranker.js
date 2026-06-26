import OpenAI from "openai";

let _client = null;

function getClient() {
  if (!_client) {
    _client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    });
  }
  return _client;
}

const RERANKER_MODEL = (process.env.RAG_RERANKER_MODEL || "openai/gpt-4.1-mini").replace(/"/g, "").trim();

function buildRerankPrompt(query, chunks) {
  const contextText = chunks
    .map((c, i) => `[Chunk ${i}]:\n${c.text}`)
    .join("\n\n---\n\n");

  return `You are a re-ranking system for a RAG pipeline. Given a user query and a set of document chunks, re-score each chunk by relevance to the query.

For each chunk, assign a relevance score 0-10:
- 0-3: Not relevant
- 4-6: Partially relevant
- 7-8: Clearly relevant
- 9-10: Directly answers the query

Consider: does the chunk contain the specific information needed to answer the query?

Output ONLY a JSON array sorted by score descending, with no other text.

User Query: "${query}"

Chunks to re-rank:
${contextText}

Output format strictly: [{"index": 0, "score": 9, "reason": "contains specific information about X"}, ...]`;
}

export async function rerank(query, chunks, topK = 5) {
  if (!chunks || chunks.length === 0) return [];
  if (chunks.length <= topK) return chunks.map((c, i) => ({ ...c, rerankScore: chunks.length - i }));

  try {
    const response = await getClient().chat.completions.create({
      model: RERANKER_MODEL,
      messages: [
        { role: "user", content: buildRerankPrompt(query, chunks) }
      ],
      temperature: 0.1,
      max_tokens: 2048,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content.trim();
    const parsed = JSON.parse(content);
    const rankings = Array.isArray(parsed) ? parsed : (parsed.rankings || parsed.scores || []);

    const scored = rankings
      .filter(r => r.index !== undefined && r.score !== undefined)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored.map(r => ({
      ...chunks[r.index],
      score: r.score / 10,
      rerankScore: r.score,
      rerankReason: r.reason || "",
    }));
  } catch (error) {
    console.error("Re-ranking error, falling back to original order:", error);
    return chunks.slice(0, topK);
  }
}
