"use client";

import { useState, useRef, useEffect } from "react";
import MessageBubble from "./MessageBubble";

const RAG_SETTINGS_DEFAULT = {
  queryRewrite: true,
  queryExpansion: false,
  subQuery: false,
  hyde: false,
  rerank: true,
  corrective: true,
};

const RAG_SETTINGS_DEFINITIONS = [
  { key: "queryRewrite", label: "Query Rewriting", desc: "Rewrite ambiguous queries into standalone questions using SLM" },
  { key: "queryExpansion", label: "Query Expansion", desc: "Generate alternative phrasings for multi-vector retrieval" },
  { key: "subQuery", label: "Sub-Query Enhancement", desc: "Decompose complex queries, retrieve per sub-query, RRF merge" },
  { key: "hyde", label: "HyDE", desc: "Hypothetical Document Embeddings — generate ideal passage, embed that" },
  { key: "rerank", label: "Re-Ranking", desc: "LLM-based cross-encoder re-ranking of search results" },
  { key: "corrective", label: "Corrective RAG", desc: "Self-evaluate retrieval/generation quality, re-retrieve if poor" },
];

export default function ChatInterface({ activeDocument }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showRagSettings, setShowRagSettings] = useState(false);
  const [ragConfig, setRagConfig] = useState(RAG_SETTINGS_DEFAULT);
  const [pipelineLog, setPipelineLog] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (activeDocument) {
      inputRef.current?.focus();
      setMessages([]);
      setPipelineLog(null);
    }
  }, [activeDocument?.collectionName]);

  const toggleRagSetting = (key) => {
    setRagConfig((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSend = async () => {
    const query = input.trim();
    if (!query || isStreaming || !activeDocument) return;

    const userMessage = {
      id: Date.now(),
      role: "user",
      content: query,
    };

    const assistantMessage = {
      id: Date.now() + 1,
      role: "assistant",
      content: "",
      streaming: true,
      sources: [],
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setIsStreaming(true);

    try {
      const chatHistory = messages
        .filter((m) => !m.streaming)
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          collectionName: activeDocument.collectionName,
          chatHistory,
          ragConfig,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get response");
      }

      let sources = [];
      try {
        const sourcesHeader = response.headers.get("X-Sources");
        if (sourcesHeader) {
          sources = JSON.parse(sourcesHeader);
        }
      } catch (e) {}

      let log = null;
      try {
        const logHeader = response.headers.get("X-Pipeline-Log");
        if (logHeader) {
          log = JSON.parse(logHeader);
          setPipelineLog(log);
        }
      } catch (e) {}

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        fullContent += text;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? { ...msg, content: fullContent, sources }
              : msg
          )
        );
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessage.id
            ? { ...msg, streaming: false, sources, pipelineLog: log }
            : msg
        )
      );
    } catch (error) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessage.id
            ? {
                ...msg,
                content: `⚠️ Error: ${error.message}`,
                streaming: false,
              }
            : msg
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <div className="chat-messages">
        {messages.length === 0 && activeDocument && (
          <div className="welcome-screen" style={{ padding: "40px 20px" }}>
            <div className="welcome-icon" style={{ width: 56, height: 56, fontSize: 24, marginBottom: 16 }}>💬</div>
            <h2 style={{ fontSize: 22 }}>Start a Conversation</h2>
            <p style={{ fontSize: 14 }}>
              Ask any question about <strong>{activeDocument.fileName}</strong>.
              Answers will be grounded in the document&apos;s content.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <div className="rag-settings-bar">
          <button
            className="rag-toggle-btn"
            onClick={() => setShowRagSettings(!showRagSettings)}
            type="button"
          >
            <span>{showRagSettings ? "▼" : "▶"}</span>
            Advanced RAG Settings
            <span className="rag-active-count">
              {Object.values(ragConfig).filter(Boolean).length} active
            </span>
          </button>
        </div>

        {showRagSettings && (
          <div className="rag-settings-panel" style={{ maxWidth: 780, margin: "0 auto 12px" }}>
            {RAG_SETTINGS_DEFINITIONS.map((setting) => (
              <label key={setting.key} className="rag-setting-checkbox-row">
                <div className="rag-setting-checkbox-info">
                  <input
                    type="checkbox"
                    checked={ragConfig[setting.key]}
                    onChange={() => toggleRagSetting(setting.key)}
                  />
                  <span className="rag-setting-checkbox-label">{setting.label}</span>
                  <span className="rag-setting-checkbox-desc">{setting.desc}</span>
                </div>
              </label>
            ))}
          </div>
        )}

        {pipelineLog && (
          <div className="rag-pipeline-status" style={{ maxWidth: 780, margin: "0 auto 8px" }}>
            {pipelineLog.filter(e => e.step === "rewritten" || e.step === "reranked" || e.step === "retrieval_evaluation" || e.step === "generation_evaluation").map((e, i) => (
              <span key={i} className="rag-pipeline-chip">
                {e.step === "rewritten" && "✏️ Rewritten"}
                {e.step === "reranked" && "🔀 Re-ranked"}
                {e.step === "retrieval_evaluation" && `📊 Retrieval: ${e.avgRelevance?.toFixed(1) || "?"}/10`}
                {e.step === "generation_evaluation" && `✅ Faithfulness: ${e.details?.faithfulness || "?"}/10`}
              </span>
            ))}
          </div>
        )}

        <div className="chat-input-wrapper">
          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activeDocument
                ? `Ask about ${activeDocument.fileName}...`
                : "Select a document first..."
            }
            disabled={!activeDocument || isStreaming}
            rows={1}
            id="chat-input"
          />
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || !activeDocument}
            id="chat-send-btn"
          >
            ➤
          </button>
        </div>
      </div>
    </>
  );
}
