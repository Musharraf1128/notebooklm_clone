"use client";

import { useState, useRef } from "react";

export default function Sidebar({
  documents,
  activeDocument,
  onSelectDocument,
  onDeleteDocument,
  onUploadClick,
  isOpen,
  onClose,
}) {
  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async (e, collectionName) => {
    e.stopPropagation();
    if (deletingId) return;

    setDeletingId(collectionName);
    await onDeleteDocument(collectionName);
    setDeletingId(null);
  };

  const formatDate = (dateStr) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${isOpen ? "active" : ""}`}
        onClick={onClose}
      />

      <aside className={`sidebar ${isOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">📓</div>
            <div>
              <h1>NotebookLM</h1>
              <span>RAG-Powered Chat</span>
            </div>
          </div>
        </div>

        <div className="sidebar-content">
          <button
            className="sidebar-upload-btn"
            onClick={onUploadClick}
            id="sidebar-upload-btn"
          >
            ＋ Upload Document
          </button>

          <p className="sidebar-section-title">Your Documents</p>

          {documents.length === 0 ? (
            <div className="empty-docs">
              <div className="empty-docs-icon">📄</div>
              <p>No documents yet. Upload a PDF or TXT file to get started.</p>
            </div>
          ) : (
            <ul className="doc-list">
              {documents.map((doc) => (
                <li
                  key={doc.collectionName}
                  className={`doc-item ${
                    activeDocument?.collectionName === doc.collectionName
                      ? "active"
                      : ""
                  }`}
                  onClick={() => onSelectDocument(doc)}
                  id={`doc-${doc.collectionName}`}
                >
                  <span className="doc-item-icon">
                    {doc.fileName.endsWith(".pdf") ? "📕" : "📝"}
                  </span>
                  <div className="doc-item-info">
                    <div className="doc-item-name" title={doc.fileName}>
                      {doc.fileName}
                    </div>
                    <div className="doc-item-meta">
                      {doc.chunkCount} chunks · {formatDate(doc.uploadedAt)}
                    </div>
                  </div>
                  <button
                    className="doc-item-delete"
                    onClick={(e) => handleDelete(e, doc.collectionName)}
                    disabled={deletingId === doc.collectionName}
                    title="Delete document"
                    id={`delete-${doc.collectionName}`}
                  >
                    {deletingId === doc.collectionName ? "⏳" : "🗑"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
