import { rewriteQuery } from "@/lib/queryRewriter";
import { judgeAnswerability, judgeFaithfulness, judgeRelevance } from "@/lib/llmJudge";

const RELEVANCE_THRESHOLD = 4;
const FAITHFULNESS_THRESHOLD = 6;

export async function evaluateRetrieval(query, chunks) {
  if (!chunks || chunks.length === 0) {
    return { needsCorrection: true, reason: "No chunks retrieved", avgRelevance: 0 };
  }

  try {
    const relevanceScores = await judgeRelevance(query, chunks);
    const avgRelevance = relevanceScores.reduce((sum, r) => sum + (r.score || 0), 0) / relevanceScores.length;

    if (avgRelevance < RELEVANCE_THRESHOLD) {
      return {
        needsCorrection: true,
        reason: `Low average relevance (${avgRelevance.toFixed(1)}/${RELEVANCE_THRESHOLD})`,
        avgRelevance,
        relevanceScores,
      };
    }

    const answerableCheck = await judgeAnswerability(query, chunks);
    if (!answerableCheck.answerable && answerableCheck.confidence > 6) {
      return {
        needsCorrection: true,
        reason: answerableCheck.missing_info || "Query deemed unanswerable from retrieved context",
        avgRelevance,
        relevanceScores,
        answerableCheck,
      };
    }

    return { needsCorrection: false, avgRelevance, relevanceScores, answerableCheck };
  } catch (error) {
    console.error("Retrieval evaluation error:", error);
    return { needsCorrection: false, avgRelevance: 5 };
  }
}

export async function evaluateGeneration(query, chunks, answer) {
  try {
    const faithfulness = await judgeFaithfulness(query, chunks, answer);

    if (faithfulness.faithfulness < FAITHFULNESS_THRESHOLD) {
      return {
        needsRegeneration: true,
        reason: `Low faithfulness score (${faithfulness.faithfulness}/10)`,
        details: faithfulness,
      };
    }

    return { needsRegeneration: false, details: faithfulness };
  } catch (error) {
    console.error("Generation evaluation error:", error);
    return { needsRegeneration: false, details: null };
  }
}

export async function correctQuery(query, chatHistory = []) {
  return rewriteQuery(query, chatHistory);
}
