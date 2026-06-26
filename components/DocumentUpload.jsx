"use client";

import { useState, useRef } from "react";

const UPLOAD_STEPS = [
  { id: "parsing", label: "Parsing" },
  { id: "chunking", label: "Chunking" },
  { id: "embedding", label: "Embedding" },
  { id: "storing", label: "Storing" },
];

const CHUNK_STRATEGIES = [
  { value: "recursive", label: "Recursive Character", desc: "Hierarchical split by paragraphs → lines → sentences" },
  { value: "fixed", label: "Fixed Size", desc: "Simple character-count split with overlap" },
  { value: "sentence", label: "Sentence-Based", desc: "Split at sentence boundaries, slide by sentences" },
  { value: "semantic", label: "Semantic", desc: "Embedding-based topic boundary detection" },
];

export default function DocumentUpload({ onUploadComplete, inline = false }) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [chunkStrategy, setChunkStrategy] = useState("recursive");
  const [chunkSize, setChunkSize] = useState(1000);
  const [chunkOverlap, setChunkOverlap] = useState(200);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) handleFileUpload(file);
    e.target.value = "";
  };

  const handleFileUpload = async (file) => {
    const validTypes = ["application/pdf", "text/plain"];
    const validExts = ["pdf", "txt"];
    const ext = file.name.split(".").pop().toLowerCase();

    if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
      setError("Only PDF and TXT files are supported");
      setTimeout(() => setError(""), 4000);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("File size exceeds 10MB limit");
      setTimeout(() => setError(""), 4000);
      return;
    }

    setUploading(true);
    setFileName(file.name);
    setError("");

    const steps = ["parsing", "chunking", "embedding", "storing"];
    let progressValue = 0;

    const progressInterval = setInterval(() => {
      progressValue += 2;
      if (progressValue > 90) progressValue = 90;
      setProgress(progressValue);

      const stepIdx = Math.min(
        Math.floor(progressValue / 25),
        steps.length - 1
      );
      setCurrentStep(steps[stepIdx]);
    }, 200);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("chunkingStrategy", chunkStrategy);
      formData.append("chunkSize", String(chunkSize));
      formData.append("chunkOverlap", String(chunkOverlap));

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Upload failed");
      }

      const result = await response.json();

      setProgress(100);
      setCurrentStep("done");

      setTimeout(() => {
        setUploading(false);
        setProgress(0);
        setCurrentStep("");
        setFileName("");
        onUploadComplete(result);
      }, 800);
    } catch (err) {
      clearInterval(progressInterval);
      setError(err.message);
      setUploading(false);
      setProgress(0);
      setCurrentStep("");
      setTimeout(() => setError(""), 5000);
    }
  };

  return (
    <div className={`upload-zone ${inline ? "inline" : ""}`}>
      {error && <div className="error-toast">{error}</div>}

      <div
        className={`upload-dropzone ${isDragging ? "dragging" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        id="upload-dropzone"
      >
        <div className="upload-dropzone-content">
          <span className="upload-icon">📄</span>
          <p className="upload-text">
            <strong>Drop a file here</strong> or click to browse
          </p>
          <p className="upload-hint">Supports PDF and TXT files (max 10MB)</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          className="upload-input"
          accept=".pdf,.txt,application/pdf,text/plain"
          onChange={handleFileSelect}
          id="file-upload-input"
        />
      </div>

      <button
        className="rag-toggle-btn"
        onClick={() => setShowAdvanced(!showAdvanced)}
        type="button"
      >
        <span>{showAdvanced ? "▼" : "▶"}</span>
        Advanced Chunking Settings
      </button>

      {showAdvanced && (
        <div className="rag-settings-panel">
          <div className="rag-setting-row">
            <label className="rag-setting-label">Chunking Strategy</label>
            <select
              className="rag-setting-select"
              value={chunkStrategy}
              onChange={(e) => setChunkStrategy(e.target.value)}
            >
              {CHUNK_STRATEGIES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <p className="rag-setting-desc">
              {CHUNK_STRATEGIES.find(s => s.value === chunkStrategy)?.desc}
            </p>
          </div>

          <div className="rag-setting-row">
            <label className="rag-setting-label">
              Chunk Size: {chunkSize} chars
            </label>
            <input
              type="range"
              className="rag-setting-slider"
              min={200}
              max={2000}
              step={100}
              value={chunkSize}
              onChange={(e) => setChunkSize(Number(e.target.value))}
            />
          </div>

          <div className="rag-setting-row">
            <label className="rag-setting-label">
              Overlap: {chunkOverlap} chars
            </label>
            <input
              type="range"
              className="rag-setting-slider"
              min={0}
              max={500}
              step={50}
              value={chunkOverlap}
              onChange={(e) => setChunkOverlap(Number(e.target.value))}
            />
          </div>
        </div>
      )}

      {uploading && (
        <div className="upload-progress">
          <div className="upload-progress-header">
            <span className="upload-progress-filename">{fileName}</span>
            <span className="upload-progress-status">
              {currentStep === "done" ? "✓ Complete" : "Processing..."}
            </span>
          </div>
          <div className="upload-progress-bar">
            <div
              className="upload-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="upload-progress-steps">
            {UPLOAD_STEPS.map((step) => {
              const stepIdx = UPLOAD_STEPS.findIndex(
                (s) => s.id === step.id
              );
              const currentIdx = UPLOAD_STEPS.findIndex(
                (s) => s.id === currentStep
              );
              const isDone =
                currentStep === "done" || stepIdx < currentIdx;
              const isActive = step.id === currentStep;

              return (
                <span
                  key={step.id}
                  className={`upload-step ${isDone ? "done" : ""} ${
                    isActive ? "active" : ""
                  }`}
                >
                  {isDone ? "✓" : isActive ? "⟳" : "○"} {step.label}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
