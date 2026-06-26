"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import ChatInterface from "@/components/ChatInterface";
import DocumentUpload from "@/components/DocumentUpload";

export default function Home() {
  const [documents, setDocuments] = useState([]);
  const [activeDocument, setActiveDocument] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ragSettingsOpen, setRagSettingsOpen] = useState(false);

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
  };

  return (
    <div className="app-layout">
      {sidebarOpen && (
        <div
          className="sidebar-overlay active"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <Sidebar
          documents={documents}
          activeDocument={activeDocument}
          onSelectDocument={handleSelectDocument}
          onDeleteDocument={handleDeleteDocument}
          onUploadClick={() => {
            setShowUpload(true);
            setSidebarOpen(false);
          }}
        />
      </div>

      <main className="main-content">
        <header className="app-header">
          <div className="app-header-left">
            <button
              className="header-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{ display: "none" }}
              id="mobile-menu-btn"
            >
              ☰
            </button>
            <span className="app-header-title">
              {activeDocument ? "Chat" : "NotebookLM"}
            </span>
          </div>

          <div className="app-header-center">
            {activeDocument && (
              <span className="app-header-doc">{activeDocument.fileName}</span>
            )}
          </div>

          <div className="app-header-right">
            <button
              className={`header-btn ${ragSettingsOpen ? "active" : ""}`}
              onClick={() => setRagSettingsOpen(!ragSettingsOpen)}
            >
              RAG Settings
            </button>
            <button
              className="header-btn primary"
              onClick={() => setShowUpload(true)}
            >
              + Upload
            </button>
          </div>
        </header>

        {activeDocument ? (
          <ChatInterface
            activeDocument={activeDocument}
            ragSettingsOpen={ragSettingsOpen}
            onToggleRagSettings={() => setRagSettingsOpen(!ragSettingsOpen)}
          />
        ) : (
          <div className="welcome-screen">
            <div className="welcome-content">
              <div className="welcome-icon">📓</div>
              <h2>NotebookLM</h2>
              <p>
                Upload a PDF or text document and ask questions about it.
                Answers are grounded in your document&apos;s content — no hallucination.
              </p>
              <div className="welcome-actions">
                <button
                  className="header-btn primary"
                  onClick={() => setShowUpload(true)}
                >
                  + Upload a Document
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {showUpload && (
        <DocumentUpload
          onClose={() => setShowUpload(false)}
          onUploadComplete={handleUploadComplete}
        />
      )}
    </div>
  );
}
