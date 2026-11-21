import type { NextConfig } from "next";

// Yerelde Python API'si (uvicorn, 8765) ayrı çalışır; Vercel'de /api istekleri vercel.json ile Python fonksiyonuna gider.
const nextConfig: NextConfig = {
  async rewrites() {
    return process.env.NODE_ENV === "development"
      ? [{ source: "/api/:path*", destination: "http://127.0.0.1:8765/api/:path*" }]
      : [];
  },
};

export default nextConfig;
