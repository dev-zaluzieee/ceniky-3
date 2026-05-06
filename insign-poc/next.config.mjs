/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
    outputFileTracingIncludes: {
      "/api/sessions/create": ["./lib/fonts/**/*.ttf"],
      "/api/preview-pdf": ["./lib/fonts/**/*.ttf"],
    },
  },
};

export default nextConfig;
