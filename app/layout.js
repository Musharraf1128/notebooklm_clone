import "./globals.css";

export const metadata = {
  title: "NotebookLM Clone — RAG-Powered Document Chat",
  description:
    "Upload any PDF or text document and have an AI-powered conversation with it. Built with RAG (Retrieval-Augmented Generation) for grounded, accurate answers.",
  keywords: ["NotebookLM", "RAG", "document chat", "AI", "PDF", "vector search"],
  openGraph: {
    title: "NotebookLM Clone — RAG-Powered Document Chat",
    description:
      "Upload documents and chat with them using AI. Powered by RAG pipeline.",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📓</text></svg>" />
      </head>
      <body>{children}</body>
    </html>
  );
}
