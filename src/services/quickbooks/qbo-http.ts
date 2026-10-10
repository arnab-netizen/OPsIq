/**
 * QuickBooks Online — shared, secret-safe HTTP primitive used by the OAuth provider functions and
 * the read-only API client. Native fetch only; the fetch implementation is injectable so tests never
 * touch the network.
 *
 * Guarantees: a hard per-request deadline; caller-abort support (e.g. a scheduler TaskContext.signal);
 * a response-body size cap; Intuit's `intuit_tid` captured from the response headers; raw bodies are
 * returned only to the caller that parses them — nothing here logs, and nothing here puts a body,
 * URL, header or token into an error message.
 */

import { QboProviderError } from "@/domain/quickbooks/qbo-errors";

export type QboFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface QboHttpResult {
  status: number;
  headers: Headers;
  bodyText: string;
  /** Intuit's per-request trace id, when present. A diagnostic, never an idempotency key. */
  intuitTid: string | null;
}

export interface QboHttpOptions {
  fetchImpl?: QboFetch;
  timeoutMs: number;
  signal?: AbortSignal;
  maxBodyBytes: number;
}

/** Intuit documents `intuit_tid` as the response header to record for support. */
export const INTUIT_TRACE_HEADER = "intuit_tid";

const TID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function readIntuitTid(headers: Headers): string | null {
  const v = headers.get(INTUIT_TRACE_HEADER);
  return v && TID_PATTERN.test(v) ? v : null;
}

/** Retry-After as milliseconds (delta-seconds or HTTP-date); null when absent or unusable. */
export function parseRetryAfterMs(headers: Headers, nowMs: number = Date.now()): number | null {
  const raw = headers.get("retry-after");
  if (!raw) return null;
  if (/^\d{1,6}$/.test(raw.trim())) return Number(raw.trim()) * 1000;
  const at = Date.parse(raw);
  return Number.isNaN(at) ? null : Math.max(0, at - nowMs);
}

export async function qboHttp(url: string, init: RequestInit, opts: QboHttpOptions): Promise<QboHttpResult> {
  if (opts.signal?.aborted) throw new QboProviderError({ kind: "CANCELLED" });
  const fetchImpl = opts.fetchImpl ?? (fetch as QboFetch);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs);
  const onCallerAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onCallerAbort, { once: true });

  try {
    let res: Response;
    try {
      // redirect:"error": a 3xx on a credentialed request (bearer / client secret) is a failure, never followed.
      res = await fetchImpl(url, { ...init, redirect: "error", signal: controller.signal });
    } catch {
      if (timedOut) throw new QboProviderError({ kind: "TIMEOUT" });
      if (opts.signal?.aborted) throw new QboProviderError({ kind: "CANCELLED" });
      throw new QboProviderError({ kind: "TRANSIENT_PROVIDER_FAILURE" });
    }

    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > opts.maxBodyBytes) {
      throw new QboProviderError({ kind: "MALFORMED_RESPONSE", httpStatus: res.status, intuitTid: readIntuitTid(res.headers) });
    }
    let bodyText: string;
    try {
      // Stream with a running BYTE count: a chunked/undeclared body can never be buffered past the cap.
      const reader = res.body?.getReader();
      if (!reader) bodyText = await res.text();
      else {
        const chunks: Uint8Array[] = [];
        let total = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > opts.maxBodyBytes) {
            await reader.cancel().catch(() => undefined);
            throw new QboProviderError({ kind: "MALFORMED_RESPONSE", httpStatus: res.status, intuitTid: readIntuitTid(res.headers) });
          }
          chunks.push(value);
        }
        const all = new Uint8Array(total);
        let at = 0;
        for (const c of chunks) { all.set(c, at); at += c.byteLength; }
        bodyText = new TextDecoder().decode(all);
      }
    } catch (e) {
      if (e instanceof QboProviderError) throw e;
      if (timedOut) throw new QboProviderError({ kind: "TIMEOUT" });
      if (opts.signal?.aborted) throw new QboProviderError({ kind: "CANCELLED" });
      throw new QboProviderError({ kind: "TRANSIENT_PROVIDER_FAILURE", httpStatus: res.status });
    }
    if (bodyText.length > opts.maxBodyBytes) {
      throw new QboProviderError({ kind: "MALFORMED_RESPONSE", httpStatus: res.status, intuitTid: readIntuitTid(res.headers) });
    }
    return { status: res.status, headers: res.headers, bodyText, intuitTid: readIntuitTid(res.headers) };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onCallerAbort);
  }
}

/** Parse a JSON object body; null when empty, unparsable, or not an object (never throws). */
export function parseJsonObjectLenient(bodyText: string): Record<string, unknown> | null {
  if (!bodyText) return null;
  try {
    const parsed: unknown = JSON.parse(bodyText);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
