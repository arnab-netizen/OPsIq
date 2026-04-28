import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    resolveAlias: {},
  },
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: /v8\/.*/,
    };
    return config;
  },
};

export default nextConfig;
