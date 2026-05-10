/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack config (Next.js 16 default bundler)
  turbopack: {},

  // Mark server-only packages as external
  serverExternalPackages: ["pdf-parse"],

  // Increase API body size limit for file uploads
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
