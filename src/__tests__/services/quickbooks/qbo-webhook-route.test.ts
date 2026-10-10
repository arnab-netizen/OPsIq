/**
 * The public webhook route reads the body with a running byte cap BEFORE any signature, parse or database work.
 */
import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/integrations/quickbooks/webhook/route";
import { QBO_WEBHOOK_MAX_BODY_BYTES } from "@/domain/quickbooks/qbo-webhook";

describe("QuickBooks webhook route body cap", () => {
  it("413 on a declared Content-Length over the cap, without reading the body", async () => {
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(c) { pulls++; c.enqueue(new Uint8Array(1)); } });
    const req = new Request("http://t/api/integrations/quickbooks/webhook", {
      method: "POST", body: stream, headers: { "content-length": String(QBO_WEBHOOK_MAX_BODY_BYTES + 1) },
      // @ts-expect-error duplex is required by undici for streamed bodies
      duplex: "half",
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(pulls).toBeLessThanOrEqual(2); // at most the engine's own priming pull: the body is never drained
  });

  it("413 on an undeclared (chunked) body that exceeds the cap, and the stream is cancelled", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) { c.enqueue(new Uint8Array(256 * 1024)); },
      cancel() { cancelled = true; },
    });
    const req = new Request("http://t/api/integrations/quickbooks/webhook", {
      method: "POST", body: stream,
      // @ts-expect-error duplex is required by undici for streamed bodies
      duplex: "half",
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(cancelled).toBe(true);
  });
});
