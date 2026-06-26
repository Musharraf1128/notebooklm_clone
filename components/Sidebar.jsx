"use client";

import { useState, useMemo } from "react";

export default function Sidebar({
  documents,
  activeDocument,
  onSelectDocument,
  onDeleteDocument,
  onUploadClick,
}) {
  const [search, setSearch] = useState("");

  const filteredDocs = useMemo(() => {
    if (!search.trim()) return documents;
    const q = search.toLowerCase();
    return documents.filter((d) =>
      d.fileName?.toLowerCase().includes(q)
    );
  }, [documents, search]);

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">N</div>
          NotebookLM
        </div>
      </div>

      <button className="sidebar-upload-btn" onClick={onUploadClick}>
        + Upload Document
      </button>

      <input
        className="doc-search"
        placeholder="Search documents..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="sidebar-section-title">Documents</div>

      <div className="sidebar-content">
        {filteredDocs.length === 0 ? (
          <div className="empty-docs">
            {search ? "No matching documents" : "No documents yet"}
          </div>
        ) : (
          <ul className="doc-list">
            {filteredDocs.map((doc) => (
              <li
                key={doc.collectionName}
                className={`doc-item ${
                  activeDocument?.collectionName === doc.collectionName
                    ? "active"
                    : ""
                }`}
                onClick={() => onSelectDocument(doc)}
              >
                <span className="doc-item-icon">
                  {doc.fileName?.endsWith(".pdf") ? "📕" : "📄"}
                </span>
                <div className="doc-item-info">
                  <div className="doc-item-name">{doc.fileName}</div>
                  <div className="doc-item-meta">
                    {doc.chunkCount || "?"} chunks
                    {doc.uploadedAt
                      ? ` · ${new Date(doc.uploadedAt).toLocaleDateString()}`
                      : ""}
                  </div>
                </div>
                <button
                  className="doc-item-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteDocument(doc.collectionName);
                  }}
                  title="Delete"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
