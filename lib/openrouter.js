/**
 * OpenRouter LLM Generation Module
 * 
 * Handles RAG-powered answer generation using OpenRouter's
 * OpenAI-compatible chat completions API. Generates answers
 * that are strictly grounded in the provided document context.
 * 
 * @module openrouter
 */

import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

/**
 * Build the system prompt for RAG generation.
 * Enforces document-grounded answers only.
 */
function buildSystemPrompt(contextChunks) {
  const contextText = contextChunks
    .map(
      (chunk, i) =>
        `[Source ${i + 1}] (Relevance: ${(chunk.score * 100).toFixed(1)}%)\n${chunk.text}`
    )
    .join("\n\n---\n\n");

  return `You are an intelligent document assistant. Your role is to answer user questions based EXCLUSIVELY on the provided document context.

STRICT RULES:
1. ONLY answer based on the information found in the context below.
2. If the answer is not in the context, clearly state: "I couldn't find information about that in the uploaded document."
3. Do NOT use your general knowledge or training data to answer.
4. Cite which source sections your answer comes from when possible.
5. If the question is ambiguous, ask for clarification.
6. Provide clear, well-structured answers using markdown formatting.

DOCUMENT CONTEXT:
${contextText}`;
}

/**
 * Generate a streaming response using RAG context.
 * 
 * @param {string} query - User's question.
 * @param {Array<{text: string, score: number, metadata: Object}>} contextChunks - Retrieved chunks.
 * @param {Array<{role: string, content: string}>} [chatHistory=[]] - Previous messages.
 * @returns {ReadableStream} Streaming response.
 */
export function generateStreamingAnswer(query, contextChunks, chatHistory = []) {
  const model = (process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini").replace(/"/g, "").trim();

  const messages = [
    { role: "system", content: buildSystemPrompt(contextChunks) },
    ...chatHistory.slice(-10), // Keep last 10 messages for context
    { role: "user", content: query },
  ];

  // Return a ReadableStream for streaming
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const stream = await client.chat.completions.create({
          model,
          messages,
          stream: true,
          temperature: 0.3, // Lower temperature for more factual responses
        });

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            controller.enqueue(encoder.encode(content));
          }
        }

        controller.close();
      } catch (error) {
        console.error("LLM Generation error:", error);
        controller.enqueue(
          encoder.encode(
            "\n\n*Error generating response. Please try again.*"
          )
        );
        controller.close();
      }
    },
  });
}

/**
 * Generate a non-streaming response (for simpler use cases).
 * 
 * @param {string} query - User's question.
 * @param {Array<{text: string, score: number}>} contextChunks - Retrieved chunks.
 * @returns {Promise<string>} Generated answer.
 */
export async function generateAnswer(query, contextChunks) {
  const model = (process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini").replace(/"/g, "").trim();

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: buildSystemPrompt(contextChunks) },
      { role: "user", content: query },
    ],
    temperature: 0.3,
  });

  return response.choices[0].message.content;
}
