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

const REWRITER_MODEL = (process.env.RAG_REWRITER_MODEL || "openai/gpt-4.1-mini").replace(/"/g, "").trim();

function buildRewritePrompt(query, chatHistory) {
  const history = chatHistory && chatHistory.length > 0
    ? chatHistory.map(m => `${m.role}: ${m.content}`).join("\n")
    : "No prior conversation.";

  return `You are a query rewriting assistant for a RAG document QA system.

Given the conversation history and the current user question, rewrite the query into a clear, standalone question optimized for vector search retrieval.

Rules:
1. Resolve pronouns and ambiguous references using the conversation history.
2. Preserve all key entities, technical terms, and intent.
3. Output ONLY the rewritten query — no explanations, no prefixes.
4. If the query is already clear and standalone, return it as-is.

Conversation History:
${history}

Current Question: ${query}

Rewritten Query:`;
}

function buildExpansionPrompt(query) {
  return `You are a query expansion assistant for a RAG system.

Given a user query, generate 3 alternative phrasings that capture the same information need. These will be used for multi-vector retrieval to improve recall.

Rules:
1. Keep the same core meaning and intent.
2. Use synonyms and varied phrasing.
3. Output ONLY a JSON array of strings — no other text.
4. Each variant should be a complete, searchable query.

Original Query: "${query}"

Output format: ["variant 1", "variant 2", "variant 3"]`;
}

export async function rewriteQuery(query, chatHistory = []) {
  try {
    const response = await getClient().chat.completions.create({
      model: REWRITER_MODEL,
      messages: [
        { role: "user", content: buildRewritePrompt(query, chatHistory) }
      ],
      temperature: 0.1,
      max_tokens: 256,
    });

    const rewritten = response.choices[0].message.content.trim();
    return rewritten || query;
  } catch (error) {
    console.error("Query rewriting error:", error);
    return query;
  }
}

export async function expandQuery(query) {
  try {
    const response = await getClient().chat.completions.create({
      model: REWRITER_MODEL,
      messages: [
        { role: "user", content: buildExpansionPrompt(query) }
      ],
      temperature: 0.3,
      max_tokens: 512,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content.trim();
    const parsed = JSON.parse(content);
    const variants = Array.isArray(parsed) ? parsed : (parsed.variants || parsed.queries || []);
    return [query, ...variants.filter(v => typeof v === "string")].slice(0, 4);
  } catch (error) {
    console.error("Query expansion error:", error);
    return [query];
  }
}
