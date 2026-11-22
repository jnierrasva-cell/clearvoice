import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  headers: async () => [
    {
      source: "/df_bg.wasm",
      headers: [
        { key: "Content-Type", value: "application/wasm" },
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
    {
      source: "/worklet.js",
      headers: [
        { key: "Content-Type", value: "application/javascript" },
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
  ],
};

export default nextConfig;
