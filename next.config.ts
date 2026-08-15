import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// CSP unsafe-inline is temporary until nonce-based enforcement is implemented.
// unsafe-eval is excluded in production (Next.js built bundles don't require it).
const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Bundle prisma/migrations so the startup migration-readiness check can
  // read committed migration directories from the filesystem at runtime in
  // Vercel serverless functions (which only include traced files by default).
  outputFileTracingIncludes: {
    "/api/startup": ["./prisma/migrations/**"],
    "/api/readiness": ["./prisma/migrations/**"],
  },
  poweredByHeader: false,
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
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: cspDirectives },
          // HSTS applied in production only (HTTP-to-HTTPS enforcement).
          ...(isProd
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
