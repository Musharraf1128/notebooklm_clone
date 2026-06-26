import OpenAI from "openai";
import { search } from "@/lib/vectorStore";
import { embedQuery } from "@/lib/embeddings";

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

const SUBQUERY_MODEL = (process.env.RAG_REWRITER_MODEL || "openai/gpt-4.1-mini").replace(/"/g, "").trim();

function buildDecompositionPrompt(query) {
  return `Decompose the following complex question into 2-4 simpler sub-questions that each target a distinct aspect of the original question.

Rules:
1. Each sub-question must be independently searchable in a document.
2. Sub-questions should be non-overlapping — cover different facets.
3. Output ONLY a JSON array of strings — no other text.

Original Question: "${query}"

Output format: ["sub-question 1", "sub-question 2", ...]`;
}

export async function decomposeQuery(query) {
  try {
    const response = await getClient().chat.completions.create({
      model: SUBQUERY_MODEL,
      messages: [
        { role: "user", content: buildDecompositionPrompt(query) }
      ],
      temperature: 0.1,
      max_tokens: 512,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content.trim();
    const parsed = JSON.parse(content);
    const subQueries = Array.isArray(parsed) ? parsed : (parsed.sub_queries || parsed.questions || []);
    return [query, ...subQueries.filter(q => typeof q === "string")].slice(0, 5);
  } catch (error) {
    console.error("Query decomposition error:", error);
    return [query];
  }
}

export function reciprocalRankFusion(resultsList, k = 60) {
  const scoreMap = new Map();

  for (const results of resultsList) {
    for (let rank = 0; rank < results.length; rank++) {
      const doc = results[rank];
      const text = doc.text;
      const rrfScore = 1 / (k + rank);

      if (scoreMap.has(text)) {
        const existing = scoreMap.get(text);
        existing.score += rrfScore;
        existing.contributions.push({ rank, originalScore: doc.originalScore || doc.score });
      } else {
        scoreMap.set(text, {
          text: doc.text,
          metadata: doc.metadata,
          score: rrfScore,
          contributions: [{ rank, originalScore: doc.originalScore || doc.score }],
        });
      }
    }
  }

  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score);
}

export async function searchWithSubQueries(collectionName, subQueries, topK = 5) {
  const allResults = [];

  for (const sq of subQueries) {
    const vector = await embedQuery(sq);
    const results = await search(collectionName, vector, topK);
    allResults.push(results);
  }

  const fused = reciprocalRankFusion(allResults);
  return fused.slice(0, topK);
}
