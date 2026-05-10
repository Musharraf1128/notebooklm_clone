/**
 * Documents API Route
 * 
 * Manages document collections:
 * - GET: List all uploaded documents
 * - DELETE: Remove a document collection
 */

import { NextResponse } from "next/server";
import {
  listCollections,
  deleteCollection,
  getCollectionInfo,
} from "@/lib/vectorStore";

export async function GET() {
  try {
    const collections = await listCollections();

    // Get details for each collection
    const documents = await Promise.all(
      collections
        .filter((name) => name.startsWith("doc_"))
        .map(async (name) => {
          const info = await getCollectionInfo(name);
          // Parse filename and timestamp from collection name
          const parts = name.replace("doc_", "").split("_");
          const timestamp = parseInt(parts[parts.length - 1]) || Date.now();
          const fileName = parts.slice(0, -1).join("_");

          return {
            collectionName: name,
            fileName: fileName || name,
            chunkCount: info?.pointsCount || 0,
            uploadedAt: new Date(timestamp).toISOString(),
          };
        })
    );

    return NextResponse.json({ documents });
  } catch (error) {
    console.error("List documents error:", error);
    return NextResponse.json(
      { error: "Failed to list documents" },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { collectionName } = await request.json();

    if (!collectionName) {
      return NextResponse.json(
        { error: "collectionName is required" },
        { status: 400 }
      );
    }

    await deleteCollection(collectionName);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete document error:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}
