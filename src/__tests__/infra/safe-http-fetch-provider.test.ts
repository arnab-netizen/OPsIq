/**
 * Unit tests for SafePublicHttpFetchProvider.
 * All tests use controlled fetch injection (vi.stubGlobal) — no real network.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { SafePublicHttpFetchProvider } from "@/infra/safe-http-fetch-provider";

// Helper: build a minimal fetch Response mock
function mockResponse(opts: {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  ok?: boolean;
}): Response {
  const status = opts.status ?? 200;
  const bodyText = opts.body ?? "";
  const headers = new Headers(opts.headers ?? { "content-type": "text/html; charset=utf-8" });
  const bodyBytes = new TextEncoder().encode(bodyText);
  const reader = {
    read: vi.fn().mockImplementationOnce(() =>
      Promise.resolve({ done: false, value: bodyBytes })
    ).mockImplementation(() => Promise.resolve({ done: true, value: undefined })),
    cancel: vi.fn().mockResolvedValue(undefined),
  };
  return {
    status,
    ok: opts.ok ?? (status >= 200 && status < 300),
    headers,
    body: { getReader: () => reader } as unknown as ReadableStream<Uint8Array>,
  } as unknown as Response;
}

function redirectResponse(location: string, status = 301): Response {
  return {
    status,
    ok: false,
    headers: new Headers({ location }),
    body: null,
  } as unknown as Response;
}

describe("SafePublicHttpFetchProvider", () => {
  let provider: SafePublicHttpFetchProvider;

  beforeEach(() => {
    provider = new SafePublicHttpFetchProvider();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // --- canHandle ---

  it("canHandle returns false for all domains", () => {
    expect(provider.canHandle("pricing_benchmarks")).toBe(false);
    expect(provider.canHandle("market_size")).toBe(false);
    expect(provider.canHandle("anything")).toBe(false);
  });

  // --- acquire ---

  it("acquire returns REQUIRES_OWNER for all domains", async () => {
    const result = await provider.acquire({ domain: "pricing_benchmarks", query: "q" });
    expect(result.status).toBe("REQUIRES_OWNER");
    expect(result.confidence).toBe(0);
    expect(result.extractedFacts).toHaveLength(0);
  });

  // --- capabilities ---

  it("capabilities includes PUBLIC_WEB_FETCH and OFFICIAL_SOURCE_FETCH", () => {
    const caps = provider.capabilities();
    expect(caps).toContain("PUBLIC_WEB_FETCH");
    expect(caps).toContain("OFFICIAL_SOURCE_FETCH");
  });

  // --- search ---

  it("search always returns empty array without hitting network", async () => {
    const results = await provider.search("query");
    expect(results).toEqual([]);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  // --- fetch: HTTPS enforcement ---

  it("fetch rejects http:// URLs with UNSAFE_PROTOCOL", async () => {
    await expect(provider.fetch("http://example.com/page")).rejects.toThrow("UNSAFE_PROTOCOL");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("fetch accepts https:// URLs", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({ body: "hello" }));
    const result = await provider.fetch("https://example.com/page");
    expect(result.body).toBe("hello");
  });

  // --- fetch: private/loopback rejection ---

  it("fetch rejects localhost", async () => {
    await expect(provider.fetch("https://localhost/api")).rejects.toThrow("PRIVATE_NETWORK_REJECTED");
  });

  it("fetch rejects 127.0.0.1", async () => {
    await expect(provider.fetch("https://127.0.0.1/api")).rejects.toThrow("PRIVATE_NETWORK_REJECTED");
  });

  it("fetch rejects RFC-1918 10.x.x.x address", async () => {
    await expect(provider.fetch("https://10.0.0.1/api")).rejects.toThrow("PRIVATE_NETWORK_REJECTED");
  });

  it("fetch rejects RFC-1918 192.168.x.x address", async () => {
    await expect(provider.fetch("https://192.168.1.1/")).rejects.toThrow("PRIVATE_NETWORK_REJECTED");
  });

  // --- fetch: duplicate URL detection ---

  it("fetch rejects the same canonical URL a second time", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({ body: "ok" }));
    await provider.fetch("https://example.com/page");
    await expect(provider.fetch("https://example.com/page")).rejects.toThrow("DUPLICATE_SOURCE");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("fetch treats URLs as equal after canonicalisation (sort query params)", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({ body: "ok" }));
    await provider.fetch("https://example.com/?b=2&a=1");
    await expect(provider.fetch("https://example.com/?a=1&b=2")).rejects.toThrow("DUPLICATE_SOURCE");
  });

  // --- fetch: content-type validation ---

  it("fetch rejects disallowed content-type (image/png)", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ headers: { "content-type": "image/png" } })
    );
    await expect(provider.fetch("https://example.com/img")).rejects.toThrow("DISALLOWED_CONTENT_TYPE");
  });

  it("fetch accepts application/json content-type", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ headers: { "content-type": "application/json" }, body: '{"ok":true}' })
    );
    const result = await provider.fetch("https://example.com/api");
    expect(result.contentType).toBe("application/json");
  });

  // --- fetch: 4xx non-retryable ---

  it("fetch throws immediately on HTTP 404 without retrying", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ status: 404, ok: false, headers: { "content-type": "text/html" } })
    );
    await expect(provider.fetch("https://example.com/missing")).rejects.toThrow("HTTP_404");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("fetch throws immediately on HTTP 401 without retrying", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ status: 401, ok: false, headers: { "content-type": "text/html" } })
    );
    await expect(provider.fetch("https://example.com/auth")).rejects.toThrow("HTTP_401");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  // --- fetch: redirect safety ---

  it("fetch rejects redirect to private host", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(redirectResponse("https://192.168.0.1/evil"))
      .mockResolvedValue(mockResponse({ body: "should not reach" }));
    await expect(provider.fetch("https://example.com/redir")).rejects.toThrow("UNSAFE_REDIRECT_DESTINATION");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("fetch rejects redirect exceeding MAX_REDIRECTS (3)", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(redirectResponse("https://example.com/r1"))
      .mockResolvedValueOnce(redirectResponse("https://example.com/r2"))
      .mockResolvedValueOnce(redirectResponse("https://example.com/r3"))
      .mockResolvedValueOnce(redirectResponse("https://example.com/r4"))
      .mockResolvedValue(mockResponse({ body: "ok" }));
    await expect(provider.fetch("https://example.com/start")).rejects.toThrow("REDIRECT_LIMIT_EXCEEDED");
  });

  // --- fetch: 512 KB cap ---

  it("fetch throws RESPONSE_TOO_LARGE when content-length header exceeds 512 KB", async () => {
    vi.mocked(fetch).mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({
        "content-type": "text/html",
        "content-length": String(512 * 1024 + 1),
      }),
      body: null,
    } as unknown as Response);
    await expect(provider.fetch("https://example.com/big")).rejects.toThrow("RESPONSE_TOO_LARGE");
  });

  // --- healthCheck ---

  it("healthCheck returns false when NODE_ENV=test", async () => {
    // vi runs with NODE_ENV=test by default
    const ok = await provider.healthCheck();
    expect(ok).toBe(false);
  });
});
