import { NextResponse } from "next/server";
import { processFile } from "@/lib/documentProcessor";
import { chunkDocument } from "@/lib/chunker";
import { embedTexts } from "@/lib/embeddings";
import { createCollection, upsertVectors } from "@/lib/vectorStore";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const VALID_STRATEGIES = ["recursive", "fixed", "sentence", "semantic"];

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const chunkingStrategy = formData.get("chunkingStrategy") || "recursive";
    const chunkSize = parseInt(formData.get("chunkSize") || "1000", 10);
    const chunkOverlap = parseInt(formData.get("chunkOverlap") || "200", 10);

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

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

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size exceeds 10MB limit" },
        { status: 400 }
      );
    }

    if (!VALID_STRATEGIES.includes(chunkingStrategy)) {
      return NextResponse.json(
        { error: `Invalid chunking strategy. Must be one of: ${VALID_STRATEGIES.join(", ")}` },
        { status: 400 }
      );
    }

    let parsedDoc;
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const fileType = file.type || fileExtension;
      parsedDoc = await processFile(buffer, fileType);
    } catch (parseErr) {
      console.error("Parse error:", parseErr);
      return NextResponse.json(
        { error: `Parse error: ${parseErr.message}` },
        { status: 500 }
      );
    }

    if (!parsedDoc.text || parsedDoc.text.trim().length === 0) {
      return NextResponse.json(
        { error: "Could not extract text from the document" },
        { status: 400 }
      );
    }

    let chunks;
    try {
      chunks = chunkDocument(parsedDoc.text, file.name, {
        strategy: chunkingStrategy,
        chunkSize,
        chunkOverlap,
      });

      if (chunks instanceof Promise) {
        chunks = await chunks;
      }
    } catch (chunkErr) {
      console.error("Chunk error:", chunkErr);
      return NextResponse.json(
        { error: `Chunk error: ${chunkErr.message}` },
        { status: 500 }
      );
    }

    if (!chunks || chunks.length === 0) {
      return NextResponse.json(
        { error: "Document produced no chunks after processing" },
        { status: 400 }
      );
    }

    let embeddings;
    try {
      const texts = chunks.map((chunk) => chunk.text);
      embeddings = await embedTexts(texts);
    } catch (embedErr) {
      console.error("Embedding error:", embedErr);
      return NextResponse.json(
        { error: `Embedding error: ${embedErr.message}` },
        { status: 500 }
      );
    }

    try {
      const sanitizedName = file.name
        .replace(/[^a-zA-Z0-9]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .toLowerCase()
        .slice(0, 40);

      const collectionName = `doc_${sanitizedName}_${Date.now()}`;

      await createCollection(collectionName, embeddings[0].length);
      await upsertVectors(collectionName, embeddings, chunks);
    } catch (storeErr) {
      console.error("Storage error:", storeErr);
      return NextResponse.json(
        { error: `Storage error: ${storeErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      collectionName,
      fileName: file.name,
      chunkCount: chunks.length,
      numPages: parsedDoc.numPages,
      info: parsedDoc.info,
      chunkingStrategy,
      chunkSize,
      chunkOverlap,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process document" },
      { status: 500 }
    );
  }
}
