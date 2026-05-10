"use client";

import { useState, useRef, useEffect } from "react";
import MessageBubble from "./MessageBubble";

export default function ChatInterface({ activeDocument }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when active document changes
  useEffect(() => {
    if (activeDocument) {
      inputRef.current?.focus();
      setMessages([]); // Reset chat when switching documents
    }
  }, [activeDocument?.collectionName]);

  const handleSend = async () => {
    const query = input.trim();
    if (!query || isStreaming || !activeDocument) return;

    // Add user message
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
      // Build chat history for context
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
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get response");
      }

      // Parse sources from header
      let sources = [];
      try {
        const sourcesHeader = response.headers.get("X-Sources");
        if (sourcesHeader) {
          sources = JSON.parse(sourcesHeader);
        }
      } catch (e) {
        // Sources header might not be available
      }

      // Stream the response
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

      // Mark as done streaming
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessage.id
            ? { ...msg, streaming: false, sources }
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
