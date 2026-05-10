/**
 * Document Processor Module
 * 
 * Handles parsing of uploaded documents (PDF and plain text).
 * Extracts text content and metadata from files.
 * 
 * @module documentProcessor
 */

/**
 * Parse a PDF file buffer and extract text content.
 * 
 * @param {Buffer} buffer - PDF file buffer.
 * @returns {Promise<{text: string, numPages: number, info: Object}>}
 */
export async function processPDF(buffer) {
  // Dynamic import to avoid bundling issues
  const pdfParse = (await import("pdf-parse")).default;

  const data = await pdfParse(buffer);

  return {
    text: data.text,
    numPages: data.numpages,
    info: {
      title: data.info?.Title || "Unknown",
      author: data.info?.Author || "Unknown",
    },
  };
}

/**
 * Process a plain text file.
 * 
 * @param {string} text - Plain text content.
 * @returns {{text: string, numPages: number, info: Object}}
 */
export function processTXT(text) {
  return {
    text,
    numPages: 1,
    info: {
      title: "Text Document",
      author: "Unknown",
    },
  };
}

/**
 * Process a file based on its type.
 * 
 * @param {Buffer} buffer - File buffer.
 * @param {string} fileType - MIME type or extension.
 * @returns {Promise<{text: string, numPages: number, info: Object}>}
 */
export async function processFile(buffer, fileType) {
  if (fileType === "application/pdf" || fileType === "pdf") {
    return processPDF(buffer);
  } else if (
    fileType === "text/plain" ||
    fileType === "txt" ||
    fileType.startsWith("text/")
  ) {
    const text = buffer.toString("utf-8");
    return processTXT(text);
  } else {
    throw new Error(`Unsupported file type: ${fileType}`);
  }
}
