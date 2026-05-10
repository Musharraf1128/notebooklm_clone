"use client";

import { useState, useEffect, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import ChatInterface from "@/components/ChatInterface";
import DocumentUpload from "@/components/DocumentUpload";

export default function Home() {
  const [documents, setDocuments] = useState([]);
  const [activeDocument, setActiveDocument] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load documents on mount
  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/documents");
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error("Failed to fetch documents:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadComplete = (result) => {
    const newDoc = {
      collectionName: result.collectionName,
      fileName: result.fileName,
      chunkCount: result.chunkCount,
      uploadedAt: new Date().toISOString(),
    };

    setDocuments((prev) => [newDoc, ...prev]);
    setActiveDocument(newDoc);
    setShowUpload(false);
    setSidebarOpen(false);
  };

  const handleDeleteDocument = async (collectionName) => {
    try {
      const res = await fetch("/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionName }),
      });

      if (res.ok) {
        setDocuments((prev) =>
          prev.filter((d) => d.collectionName !== collectionName)
        );
        if (activeDocument?.collectionName === collectionName) {
          setActiveDocument(null);
        }
      }
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  };

  const handleSelectDocument = (doc) => {
    setActiveDocument(doc);
    setShowUpload(false);
    setSidebarOpen(false);
  };

  const handleUploadClick = () => {
    setShowUpload(true);
    setActiveDocument(null);
    setSidebarOpen(false);
  };

  return (
    <div className="app-layout">
      <Sidebar
        documents={documents}
        activeDocument={activeDocument}
        onSelectDocument={handleSelectDocument}
        onDeleteDocument={handleDeleteDocument}
        onUploadClick={handleUploadClick}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="main-content">
        {/* Header */}
        <header className="chat-header">
          <div className="chat-header-title">
            <button
              className="mobile-menu-btn"
              onClick={() => setSidebarOpen(true)}
              id="mobile-menu-btn"
            >
              ☰
            </button>
            <h2>
              {activeDocument
                ? "Chat"
                : showUpload
                ? "Upload Document"
                : "Welcome"}
            </h2>
            {activeDocument && (
              <span className="chat-header-doc">
                {activeDocument.fileName}
              </span>
            )}
          </div>
        </header>

        {/* Content area */}
        {activeDocument ? (
          <ChatInterface activeDocument={activeDocument} />
        ) : showUpload ? (
          <div className="welcome-screen">
            <div className="welcome-icon">📤</div>
            <h2>Upload a Document</h2>
            <p>
              Upload a PDF or text file to start asking questions.
              The document will be processed through our RAG pipeline.
            </p>
            <DocumentUpload onUploadComplete={handleUploadComplete} />
          </div>
        ) : (
          <div className="welcome-screen">
            <div className="welcome-icon">📓</div>
            <h2>NotebookLM Clone</h2>
            <p>
              Upload any document and have an AI-powered conversation with it.
              Your answers are grounded in the document&apos;s actual content — no
              hallucination.
            </p>
            <DocumentUpload onUploadComplete={handleUploadComplete} />
          </div>
        )}
      </main>
    </div>
  );
}
