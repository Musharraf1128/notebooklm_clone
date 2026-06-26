"use client";

import { useState } from "react";

export default function MessageBubble({ message }) {
  const [showSources, setShowSources] = useState(false);

  return (
    <div className={`message ${message.role}`}>
      <div className={`message-avatar ${message.role}`}>
        {message.role === "user" ? "U" : "A"}
      </div>
      <div className="message-body">
        <div className="message-role">
          {message.role === "user" ? "You" : "Assistant"}
        </div>
        <div
          className={`message-content ${
            message.streaming ? "streaming-cursor" : ""
          }`}
        >
          {message.content || (
            <span style={{ color: "var(--text-muted)" }}>Thinking...</span>
          )}
        </div>

        {message.sources && message.sources.length > 0 && !message.streaming && (
          <>
            <button
              className="sources-toggle"
              onClick={() => setShowSources(!showSources)}
            >
              {showSources ? "−" : "+"} Sources ({message.sources.length})
            </button>
            {showSources && (
              <div className="sources-list">
                {message.sources.map((source, i) => (
                  <div key={i} className="source-chip">
                    <div className="source-chip-header">
                      <span className="source-chip-label">Source {i + 1}</span>
                      <span className="source-chip-score">
                        {(source.score * 100).toFixed(0)}% match
                      </span>
                    </div>
                    {source.text}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
