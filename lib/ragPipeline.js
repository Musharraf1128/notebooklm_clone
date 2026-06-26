import { embedQuery } from "@/lib/embeddings";
import { search } from "@/lib/vectorStore";
import { rewriteQuery, expandQuery } from "@/lib/queryRewriter";
import { decomposeQuery, searchWithSubQueries } from "@/lib/subQueryEnhancer";
import { generateHypotheticalPassage } from "@/lib/hyde";
import { rerank } from "@/lib/reranker";
import { evaluateRetrieval, correctQuery } from "@/lib/correctiveRAG";

const MAX_CORRECTIVE_ITERATIONS = 2;

function isEnabled(config, key) {
  if (config && typeof config[key] === "boolean") return config[key];
  const envKey = `RAG_ENABLE_${key.toUpperCase()}`;
  const envVal = process.env[envKey];
  if (envVal === undefined) return false;
  return envVal === "true" || envVal === "1";
}

function deduplicateResults(results) {
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.text)) return false;
    seen.add(r.text);
    return true;
  });
}

export async function runRetrievalPipeline({
  query,
  collectionName,
  chatHistory = [],
  config = {},
}) {
  const pipelineLog = [];
  let currentQuery = query;
  let currentChunks = [];

  const log = (step, data) => {
    const entry = { step, ...data };
    pipelineLog.push(entry);
    return entry;
  };

  const stages = {
    queryRewrite: isEnabled(config, "queryRewrite"),
    queryExpansion: isEnabled(config, "queryExpansion"),
    subQuery: isEnabled(config, "subQuery"),
    hyde: isEnabled(config, "hyde"),
    rerank: isEnabled(config, "rerank"),
    corrective: isEnabled(config, "corrective"),
  };

  log("config", { stages, query, collectionName });

  // Stage 1: Query Rewriting
  if (stages.queryRewrite) {
    log("rewriting", { originalQuery: currentQuery });
    const rewritten = await rewriteQuery(currentQuery, chatHistory);
    if (rewritten && rewritten !== currentQuery) {
      log("rewritten", { before: currentQuery, after: rewritten });
      currentQuery = rewritten;
    }
  }

  // Stage 2: Query Expansion
  let expandedQueries = [currentQuery];
  if (stages.queryExpansion) {
    log("expanding", { query: currentQuery });
    expandedQueries = await expandQuery(currentQuery);
    log("expanded", { variants: expandedQueries });
  }

  // Stage 3: Sub-query Decomposition
  if (stages.subQuery) {
    log("decomposing", { query: currentQuery });
    const subQueries = await decomposeQuery(currentQuery);
    log("decomposed", { subQueries });
    currentChunks = await searchWithSubQueries(collectionName, subQueries, 20);
  }

  // Stage 4: HyDE
  if (stages.hyde) {
    log("hyde", { query: currentQuery });
    const hypotheticalPassage = await generateHypotheticalPassage(currentQuery);
    if (hypotheticalPassage) {
      const hydeVector = await embedQuery(hypotheticalPassage);
      const hydeResults = await search(collectionName, hydeVector, 20);
      currentChunks = deduplicateResults([...currentChunks, ...hydeResults]);
    }
  }

  // Stage 5: Standard search (fallback)
  if (currentChunks.length === 0) {
    if (expandedQueries.length > 1) {
      const allResults = [];
      for (const eq of expandedQueries) {
        const vector = await embedQuery(eq);
        const results = await search(collectionName, vector, 10);
        allResults.push(...results);
      }
      currentChunks = deduplicateResults(allResults);
    } else {
      const queryVector = await embedQuery(currentQuery);
      currentChunks = await search(collectionName, queryVector, 20);
    }
  }

  if (currentChunks.length === 0) {
    log("no_results", {});
    return { chunks: [], pipelineLog, refinedQuery: currentQuery };
  }

  // Stage 6: Corrective RAG — Retrieval Evaluation
  let correctiveIterations = 0;
  if (stages.corrective) {
    let evalResult = await evaluateRetrieval(currentQuery, currentChunks);
    log("retrieval_evaluation", evalResult);

    while (evalResult.needsCorrection && correctiveIterations < MAX_CORRECTIVE_ITERATIONS) {
      correctiveIterations++;
      currentQuery = await correctQuery(currentQuery, chatHistory);
      log("corrective_retry", { iteration: correctiveIterations, newQuery: currentQuery });

      if (stages.hyde) {
        const hypo = await generateHypotheticalPassage(currentQuery);
        if (hypo) {
          const hv = await embedQuery(hypo);
          currentChunks = await search(collectionName, hv, 20);
        }
      } else {
        const v = await embedQuery(currentQuery);
        currentChunks = await search(collectionName, v, 20);
      }

      evalResult = await evaluateRetrieval(currentQuery, currentChunks);
      log("retrieval_evaluation_after", evalResult);
    }
  }

  // Stage 7: Re-ranking
  if (stages.rerank && currentChunks.length > 5) {
    log("reranking", { beforeCount: currentChunks.length });
    currentChunks = await rerank(currentQuery, currentChunks, 5);
    log("reranked", { afterCount: currentChunks.length });
  }

  const finalChunks = currentChunks.slice(0, 5);
  log("retrieval_complete", { chunkCount: finalChunks.length });

  return {
    chunks: finalChunks,
    pipelineLog,
    refinedQuery: currentQuery,
  };
}
