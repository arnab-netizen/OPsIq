import { describe, expect, it } from "vitest";
import { fetchJson, HttpTransportError } from "@/lib/daily-report/http";

function fakeResponse(status: number, body: string, ok?: boolean): Response {
  return { ok: ok ?? (status >= 200 && status < 300), status, text: async () => body } as unknown as Response;
}

describe("fetchJson", () => {
  it("parses a successful JSON body", async () => {
    const res = await fetchJson<{ a: number }>({ url: "https://example.test/x", fetchImpl: async () => fakeResponse(200, '{"a":1}') });
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ a: 1 });
    expect(res.parseError).toBeNull();
  });

  it("returns ok:false for an HTTP error status without throwing", async () => {
    const res = await fetchJson({ url: "https://example.test/x", fetchImpl: async () => fakeResponse(404, '{"error":"not found"}') });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
    expect(res.json).toEqual({ error: "not found" });
  });

  it("reports a parse error for a malformed body without throwing", async () => {
    const res = await fetchJson({ url: "https://example.test/x", fetchImpl: async () => fakeResponse(200, "not json") });
    expect(res.ok).toBe(true);
    expect(res.json).toBeNull();
    expect(res.parseError).toMatch(/not valid JSON/);
  });

  it("treats an empty body as no JSON, not a parse error", async () => {
    const res = await fetchJson({ url: "https://example.test/x", fetchImpl: async () => fakeResponse(204, "") });
    expect(res.json).toBeNull();
    expect(res.parseError).toBeNull();
  });

  it("throws HttpTransportError for a network failure", async () => {
    await expect(
      fetchJson({
        url: "https://example.test/x",
        fetchImpl: async () => {
          throw new Error("ECONNREFUSED");
        },
      }),
    ).rejects.toThrow(HttpTransportError);
  });

  it("throws HttpTransportError on timeout", async () => {
    await expect(
      fetchJson({
        url: "https://example.test/x",
        timeoutMs: 5,
        fetchImpl: (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      }),
    ).rejects.toThrow(/timed out|aborted/);
  });
});
