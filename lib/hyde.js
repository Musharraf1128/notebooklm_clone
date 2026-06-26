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

const HYDE_MODEL = (process.env.RAG_REWRITER_MODEL || "openai/gpt-4.1-mini").replace(/"/g, "").trim();

function buildHydePrompt(query) {
  return `You are a hypothetical document writer for a RAG system.

Given a user question, write a 1-2 paragraph hypothetical document passage that would perfectly answer the question. This passage should:

1. Be written in a factual, textbook style — as if it came from a real reference document.
2. Contain specific details, definitions, and explanations relevant to the question.
3. Use natural language that a real document would use.
4. Include key terminology and concepts related to the topic.

Do NOT mention that this is a hypothetical passage. Just write the passage as if it's real.

Question: ${query}

Hypothetical Passage:`;
}

export async function generateHypotheticalPassage(query) {
  try {
    const response = await getClient().chat.completions.create({
      model: HYDE_MODEL,
      messages: [
        { role: "user", content: buildHydePrompt(query) }
      ],
      temperature: 0.3,
      max_tokens: 512,
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error("HyDE generation error:", error);
    return null;
  }
}
