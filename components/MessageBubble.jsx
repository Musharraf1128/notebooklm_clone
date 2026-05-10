"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function MessageBubble({ message }) {
  const [showSources, setShowSources] = useState(false);
  const isUser = message.role === "user";

  return (
    <div className="message" id={`message-${message.id}`}>
      <div className={`message-avatar ${isUser ? "user" : "assistant"}`}>
        {isUser ? "👤" : "🤖"}
      </div>
      <div className="message-body">
        <div className="message-role">{isUser ? "You" : "Assistant"}</div>
        <div
          className={`message-content ${
            message.streaming ? "streaming-cursor" : ""
          }`}
        >
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content || " "}
            </ReactMarkdown>
          )}
        </div>

        {/* Source citations */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <>
            <button
              className="sources-toggle"
              onClick={() => setShowSources(!showSources)}
              id={`sources-toggle-${message.id}`}
            >
              📎 {message.sources.length} sources{" "}
              {showSources ? "▲" : "▼"}
            </button>

            {showSources && (
              <div className="sources-list">
                {message.sources.map((source, idx) => (
                  <div key={idx} className="source-chip">
                    <div className="source-chip-header">
                      <span className="source-chip-label">
                        Chunk #{source.chunkIndex + 1}
                      </span>
                      <span className="source-chip-score">
                        {(source.score * 100).toFixed(1)}% match
                      </span>
                    </div>
                    <div>{source.text}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Typing indicator */}
        {message.streaming && !message.content && (
          <div className="typing-indicator">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        )}
      </div>
    </div>
  );
}
