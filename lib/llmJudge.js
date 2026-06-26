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

const JUDGE_MODEL = (process.env.RAG_JUDGE_MODEL || "openai/gpt-4.1-mini").replace(/"/g, "").trim();

function buildRelevancePrompt(query, chunks) {
  const contextText = chunks
    .map((c, i) => `[Chunk ${i}]:\n${c.text}`)
    .join("\n\n---\n\n");

  return `You are a relevance judge for a RAG system. Evaluate how relevant each document chunk is to the given user query.

For EACH chunk, assign a relevance score from 0-10 where:
- 0-2: Completely irrelevant
- 3-4: Tangentially related
- 5-6: Somewhat relevant
- 7-8: Clearly relevant
- 9-10: Directly answers or contains the exact information needed

Output ONLY a JSON array of objects with "index" and "score" fields, sorted by score descending.

User Query: "${query}"

Document Chunks:
${contextText}

Output format: [{"index": 0, "score": 8, "reason": "..."}, ...]`;
}

function buildFaithfulnessPrompt(query, chunks, answer) {
  const contextText = chunks
    .map((c, i) => `[Chunk ${i}]:\n${c.text}`)
    .join("\n\n---\n\n");

  return `You are a faithfulness judge for a RAG system. Evaluate whether the generated answer is fully grounded in the provided document context.

Score the answer on these axes (each 0-10):
1. Faithfulness: Is every claim in the answer supported by the context? Penalize hallucinations.
2. Completeness: Does the answer use all relevant information from the context?
3. Conciseness: Does the answer avoid unnecessary verbosity or repetition?

Output ONLY a JSON object with scores and a brief explanation.

User Query: "${query}"

Document Context:
${contextText}

Generated Answer: "${answer}"

Output format: {"faithfulness": 8, "completeness": 7, "conciseness": 9, "explanation": "...", "hallucinated_claims": ["..."]}`;
}

function buildAnswerabilityPrompt(query, chunks) {
  const contextText = chunks
    .map((c, i) => `[Chunk ${i}]:\n${c.text}`)
    .join("\n\n---\n\n");

  return `You are an answerability judge. Given a user query and retrieved document chunks, determine whether the information needed to answer the query is present in the chunks.

Output a JSON object:
- "answerable": boolean — whether the query can be answered from the given context
- "confidence": 0-10 — how confident you are in this assessment
- "missing_info": string — what information is missing, if not answerable
- "relevant_chunks": array of chunk indices that contain relevant information

User Query: "${query}"

Document Chunks:
${contextText}`;
}

export async function judgeRelevance(query, chunks) {
  if (!chunks || chunks.length === 0) return [];

  try {
    const response = await getClient().chat.completions.create({
      model: JUDGE_MODEL,
      messages: [
        { role: "user", content: buildRelevancePrompt(query, chunks) }
      ],
      temperature: 0.1,
      max_tokens: 1024,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content.trim();
    const parsed = JSON.parse(content);
    const scores = Array.isArray(parsed) ? parsed : (parsed.scores || parsed.evaluations || []);
    return scores;
  } catch (error) {
    console.error("Relevance judging error:", error);
    return chunks.map((_, i) => ({ index: i, score: 5, reason: "Judging failed, defaulting to neutral" }));
  }
}

export async function judgeFaithfulness(query, chunks, answer) {
  try {
    const response = await getClient().chat.completions.create({
      model: JUDGE_MODEL,
      messages: [
        { role: "user", content: buildFaithfulnessPrompt(query, chunks, answer) }
      ],
      temperature: 0.1,
      max_tokens: 1024,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content.trim();
    return JSON.parse(content);
  } catch (error) {
    console.error("Faithfulness judging error:", error);
    return { faithfulness: 5, completeness: 5, conciseness: 5, explanation: "Judging failed", hallucinated_claims: [] };
  }
}

export async function judgeAnswerability(query, chunks) {
  try {
    const response = await getClient().chat.completions.create({
      model: JUDGE_MODEL,
      messages: [
        { role: "user", content: buildAnswerabilityPrompt(query, chunks) }
      ],
      temperature: 0.1,
      max_tokens: 512,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content.trim();
    return JSON.parse(content);
  } catch (error) {
    console.error("Answerability judging error:", error);
    return { answerable: true, confidence: 5, missing_info: "", relevant_chunks: [] };
  }
}
