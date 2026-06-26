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
  { key: "queryRewrite", label: "Query Rewriting", desc: "Rewrite ambiguous queries using SLM" },
  { key: "queryExpansion", label: "Query Expansion", desc: "Generate alternative phrasings" },
  { key: "subQuery", label: "Sub-Query", desc: "Decompose and merge complex queries" },
  { key: "hyde", label: "HyDE", desc: "Hypothetical Document Embeddings" },
  { key: "rerank", label: "Re-Ranking", desc: "Cross-encoder re-ranking of results" },
  { key: "corrective", label: "Corrective RAG", desc: "Self-evaluate and re-retrieve" },
];

export default function ChatInterface({ activeDocument, ragSettingsOpen, onToggleRagSettings }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
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

    const userMessage = { id: Date.now(), role: "user", content: query };
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
        const h = response.headers.get("X-Sources");
        if (h) sources = JSON.parse(h);
      } catch (e) {}

      let log = null;
      try {
        const h = response.headers.get("X-Pipeline-Log");
        if (h) {
          log = JSON.parse(h);
          setPipelineLog(log);
        }
      } catch (e) {}

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullContent += decoder.decode(value, { stream: true });
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
            ? { ...msg, content: `Error: ${error.message}`, streaming: false }
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
        {messages.length === 0 && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            color: "var(--text-muted)",
            fontSize: 13.5,
            textAlign: "center",
            padding: 40,
          }}>
            Ask a question about <strong>&nbsp;{activeDocument?.fileName}</strong>
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        {ragSettingsOpen && (
          <div className="rag-settings-bar" style={{ marginBottom: 8 }}>
            <div className="rag-settings-panel">
              {RAG_SETTINGS_DEFINITIONS.map((setting) => (
                <label key={setting.key} className="rag-setting-row">
                  <input
                    type="checkbox"
                    checked={ragConfig[setting.key]}
                    onChange={() => toggleRagSetting(setting.key)}
                  />
                  <span className="rag-setting-label">{setting.label}</span>
                  <span className="rag-setting-desc">{setting.desc}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {pipelineLog && (
          <div className="rag-pipeline-status" style={{ marginBottom: 6 }}>
            {pipelineLog
              .filter((e) =>
                ["rewritten", "reranked", "retrieval_evaluation", "generation_evaluation"].includes(e.step)
              )
              .map((e, i) => (
                <span key={i} className="rag-pipeline-chip">
                  {e.step === "rewritten" && `Rewritten`}
                  {e.step === "reranked" && `Re-ranked (${e.topScore || "?"})`}
                  {e.step === "retrieval_evaluation" && `Relevance: ${e.avgRelevance?.toFixed(1) || "?"}`}
                  {e.step === "generation_evaluation" && `Faithfulness: ${e.details?.faithfulness || "?"}`}
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
          />
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || !activeDocument}
          >
            ➤
          </button>
        </div>
      </div>
    </>
  );
}
