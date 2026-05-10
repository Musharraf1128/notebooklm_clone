/**
 * Upload API Route
 * 
 * Handles document upload and full RAG ingestion pipeline:
 * 1. Parse the uploaded file (PDF or TXT)
 * 2. Chunk the text using Recursive Character Text Splitter
 * 3. Generate embeddings via OpenRouter
 * 4. Store vectors in Qdrant Cloud
 */

import { NextResponse } from "next/server";
import { processFile } from "@/lib/documentProcessor";
import { chunkDocument } from "@/lib/chunker";
import { embedTexts } from "@/lib/embeddings";
import { createCollection, upsertVectors } from "@/lib/vectorStore";

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ["application/pdf", "text/plain"];
    const fileExtension = file.name.split(".").pop().toLowerCase();
    const isAllowed =
      allowedTypes.includes(file.type) ||
      ["pdf", "txt"].includes(fileExtension);

    if (!isAllowed) {
      return NextResponse.json(
        { error: "Only PDF and TXT files are supported" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size exceeds 10MB limit" },
        { status: 400 }
      );
    }

    // Step 1: Parse the document
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileType = file.type || fileExtension;
    const parsedDoc = await processFile(buffer, fileType);

    if (!parsedDoc.text || parsedDoc.text.trim().length === 0) {
      return NextResponse.json(
        { error: "Could not extract text from the document" },
        { status: 400 }
      );
    }

    // Step 2: Chunk the document
    const chunks = chunkDocument(parsedDoc.text, file.name, {
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "Document produced no chunks after processing" },
        { status: 400 }
      );
    }

    // Step 3: Generate embeddings
    const texts = chunks.map((chunk) => chunk.text);
    const embeddings = await embedTexts(texts);

    // Step 4: Store in Qdrant
    // Create a unique collection name from the filename
    const sanitizedName = file.name
      .replace(/[^a-zA-Z0-9]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .toLowerCase()
      .slice(0, 40);

    const collectionName = `doc_${sanitizedName}_${Date.now()}`;

    await createCollection(collectionName, embeddings[0].length);
    await upsertVectors(collectionName, embeddings, chunks);

    return NextResponse.json({
      success: true,
      collectionName,
      fileName: file.name,
      chunkCount: chunks.length,
      numPages: parsedDoc.numPages,
      info: parsedDoc.info,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process document" },
      { status: 500 }
    );
  }
}
