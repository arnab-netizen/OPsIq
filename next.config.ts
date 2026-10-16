import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Microsoft Clarity (consent-gated, public pages only): the two script origins it needs, nothing else.
// connect-src already permits https:, so Clarity's collection endpoint needs no additional allowance.
// These origins are added ONLY to the public-page CSP rule below, and ONLY when Clarity is configured for this
// production deployment; every other route (login, signup, the signed-in product, admin, API) keeps the base CSP.
const CLARITY_SCRIPT_ORIGINS = ["https://www.clarity.ms", "https://scripts.clarity.ms"];
const clarityConfigured =
  process.env.VERCEL_ENV === "production" && /^[a-z0-9]{6,16}$/.test((process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID ?? "").trim());

// CSP unsafe-inline is temporary until nonce-based enforcement is implemented.
// unsafe-eval is excluded in production (Next.js built bundles don't require it).
const buildCspDirectives = (extraScriptOrigins: readonly string[] = []) => [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${extraScriptOrigins.map((o) => ` ${o}`).join("")}${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const cspDirectives = buildCspDirectives();
const publicClarityCspDirectives = buildCspDirectives(CLARITY_SCRIPT_ORIGINS);

// Public pages that may run Clarity (superset of the exact app-level allowlist in clarity-policy.ts; the app decides
// eligibility, the CSP only has to permit the script on pages where it may legitimately load).
const clarityPublicCspSources = [
  "/",
  "/about",
  "/beta",
  "/privacy",
  "/terms",
  "/resources",
  "/resources/:path*",
  "/tools",
  "/tools/:path*",
] as const;

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
  async redirects() {
    return [
      // www.opsiq.solutions (any protocol) -> https://opsiq.solutions
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.opsiq.solutions" }],
        destination: "https://opsiq.solutions/:path*",
        permanent: true,
      },
      // http://opsiq.solutions (apex, insecure) -> https://opsiq.solutions
      {
        source: "/:path*",
        has: [
          { type: "host", value: "opsiq.solutions" },
          { type: "header", key: "x-forwarded-proto", value: "http" },
        ],
        destination: "https://opsiq.solutions/:path*",
        permanent: true,
      },
    ];
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
      // Later matching rules override earlier ones for the same header key (Next.js "Header Overriding Behavior"), so
      // these rules replace ONLY the Content-Security-Policy on the public pages, and only when Clarity is configured.
      // Everything else about the response headers stays as set above.
      ...(clarityConfigured
        ? clarityPublicCspSources.map((source) => ({
            source,
            headers: [{ key: "Content-Security-Policy", value: publicClarityCspDirectives }],
          }))
        : []),
    ];
  },
};

export default nextConfig;
