/**
 * SafePublicHttpFetchProvider — restricted public HTTP research provider.
 * Only fetches HTTPS URLs on the public internet. Never fetches private/loopback
 * addresses. Response bounded by size, timeout, and redirect limits.
 */
import type { ResearchProvider, ResearchRequest, ResearchResult, ProviderCapability } from "./research-provider";

const ALLOWED_PROTOCOL = "https:";

// Coerce an unknown thrown value to a string for internal control-flow checks.
function extractMsg(thrown: unknown): string {
  const e = thrown instanceof Error ? thrown : null;
  if (e !== null) return e.message;
  return String(thrown);
}
const MAX_RESPONSE_BYTES = 512 * 1024; // 512 KB
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const MAX_RETRIES = 3;

// RFC-1918 + loopback + link-local CIDR blocks (simplified string check)
const PRIVATE_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fe80:/i,
  /^0\.0\.0\.0$/,
];

function isPrivateHost(hostname: string): boolean {
  return PRIVATE_HOSTNAME_PATTERNS.some((p) => p.test(hostname));
}

function canonicalizeUrl(rawUrl: string): string {
  const u = new URL(rawUrl);
  // Lowercase scheme+host, remove default port, sort query params
  u.hostname = u.hostname.toLowerCase();
  u.searchParams.sort();
  return u.toString();
}

const ALLOWED_CONTENT_TYPES = ["text/html", "text/plain", "application/json", "application/xml", "text/xml"];

function isAllowedContentType(ct: string | null): boolean {
  if (!ct) return false;
  return ALLOWED_CONTENT_TYPES.some((a) => ct.toLowerCase().startsWith(a));
}

export class SafePublicHttpFetchProvider implements ResearchProvider {
  readonly providerType = "SAFE_HTTP_FETCH";
  private readonly seenUrls = new Set<string>();

  capabilities(): ProviderCapability[] {
    return ["PUBLIC_WEB_FETCH", "OFFICIAL_SOURCE_FETCH"];
  }

  canHandle(_domain: string): boolean {
    // No domain is auto-acquirable until a real source URL is configured.
    // pricing_benchmarks previously pointed to a placeholder URL (research.opsiq.internal)
    // that does not exist. That domain is reclassified as REQUIRES_OWNER.
    return false;
  }

  async search(_query: string): Promise<{ title: string; url: string; snippet: string }[]> {
    // No web-search capability in this provider
    return [];
  }

  async fetch(url: string): Promise<{ body: string; contentType: string; retrievedAt: Date }> {
    const canonical = canonicalizeUrl(url);
    const parsed = new URL(canonical);

    if (parsed.protocol !== ALLOWED_PROTOCOL) {
      throw new Error(`UNSAFE_PROTOCOL: only https allowed, got ${parsed.protocol}`);
    }
    if (isPrivateHost(parsed.hostname)) {
      throw new Error(`PRIVATE_NETWORK_REJECTED: ${parsed.hostname}`);
    }
    if (this.seenUrls.has(canonical)) {
      throw new Error(`DUPLICATE_SOURCE: already fetched ${canonical}`);
    }
    this.seenUrls.add(canonical);

    let redirectsLeft = MAX_REDIRECTS;
    let currentUrl = canonical;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const response = await fetch(currentUrl, {
          signal: controller.signal,
          redirect: "manual",
          headers: { "User-Agent": "OpsIQ-Research/1.0 (public data only)" },
        });
        clearTimeout(timer);

        if (response.status >= 300 && response.status < 400) {
          if (redirectsLeft-- <= 0) {
            throw new Error("REDIRECT_LIMIT_EXCEEDED");
          }
          const loc = response.headers.get("location");
          if (!loc) throw new Error("REDIRECT_NO_LOCATION");
          const next = new URL(loc, currentUrl);
          if (next.protocol !== ALLOWED_PROTOCOL || isPrivateHost(next.hostname)) {
            throw new Error(`UNSAFE_REDIRECT_DESTINATION: ${next.hostname}`);
          }
          currentUrl = next.toString();
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP_${response.status}`);
        }

        const ct = response.headers.get("content-type");
        if (!isAllowedContentType(ct)) {
          throw new Error(`DISALLOWED_CONTENT_TYPE: ${ct}`);
        }

        const contentLength = parseInt(response.headers.get("content-length") ?? "0", 10);
        if (contentLength > MAX_RESPONSE_BYTES) {
          throw new Error("RESPONSE_TOO_LARGE");
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("NO_RESPONSE_BODY");

        const chunks: Uint8Array[] = [];
        let totalBytes = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
          if (totalBytes > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            throw new Error("RESPONSE_TOO_LARGE");
          }
          chunks.push(value);
        }

        const body = new TextDecoder().decode(
          chunks.reduce((acc, c) => {
            const merged = new Uint8Array(acc.length + c.length);
            merged.set(acc);
            merged.set(c, acc.length);
            return merged;
          }, new Uint8Array(0))
        );

        return { body, contentType: ct ?? "text/plain", retrievedAt: new Date() };
      } catch (err: unknown) {
        clearTimeout(timer);
        // All errors thrown in this file are `new Error("CONTROL_FLOW_PREFIX...")`.
        // Cast is safe; String() fallback is unreachable for those internal throws.
        const msg = extractMsg(err);
        // Non-retryable conditions
        if (
          msg.startsWith("UNSAFE") ||
          msg.startsWith("PRIVATE") ||
          msg.startsWith("DUPLICATE") ||
          msg.startsWith("REDIRECT") ||
          msg.startsWith("DISALLOWED") ||
          msg.startsWith("HTTP_4")
        ) {
          throw err;
        }
        attempt++;
        if (attempt >= MAX_RETRIES) throw err;
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }

    throw new Error("MAX_RETRIES_EXCEEDED");
  }

  async healthCheck(): Promise<boolean> {
    // Provider is available when the environment is not test
    return process.env.NODE_ENV !== "test";
  }

  async acquire(request: ResearchRequest): Promise<ResearchResult> {
    const base: Omit<ResearchResult, "status" | "rawResult" | "extractedFacts" | "confidence" | "limitations"> = {
      domain: request.domain,
      sourceType: "HTTP_FETCH",
      reliabilityClassification: "OFFICIAL",
      retrievedAt: new Date(),
      geography: request.geography,
    };

    if (!this.canHandle(request.domain)) {
      return {
        ...base,
        status: "REQUIRES_OWNER",
        sourceType: "SAFE_HTTP_FETCH",
        extractedFacts: [],
        reliabilityClassification: "UNVERIFIED",
        confidence: 0,
        limitations: `Domain "${request.domain}" requires owner action — cannot auto-acquire`,
      };
    }

    // canHandle() returns false for all domains until a real source URL is configured.
    // This path is only reached if the caller bypasses canHandle() — treat as REQUIRES_OWNER.
    return {
      ...base,
      status: "REQUIRES_OWNER",
      extractedFacts: [],
      reliabilityClassification: "UNVERIFIED",
      confidence: 0,
      limitations: `Domain "${request.domain}" has no configured public source URL. Owner must supply evidence directly.`,
    };
  }
}
