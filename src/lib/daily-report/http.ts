/**
 * Minimal, dependency-free HTTP helper shared by the fetch-based source modules in this package
 * (Vercel, Neon, Metricool). Mirrors the shape QBO's provider client uses elsewhere in this repo
 * (injectable fetch implementation, bounded timeout, no silent body-swallowing) without pulling in
 * that client's OAuth/rate-limiter machinery, which these read-only, single-GET integrations don't need.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface JsonFetchResult<T> {
  readonly ok: boolean;
  readonly status: number;
  readonly json: T | null;
  readonly rawText: string;
  /** Set when the body could not be parsed as JSON even though the HTTP call itself succeeded. */
  readonly parseError: string | null;
}

export interface FetchJsonOptions {
  readonly url: string;
  readonly init?: RequestInit;
  readonly fetchImpl?: FetchLike;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

/** Thrown only for network-level failures (DNS, connection refused, abort/timeout) -- never for HTTP error statuses. */
export class HttpTransportError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "HttpTransportError";
  }
}

/**
 * GETs (or otherwise requests) `url` and parses the body as JSON. HTTP error statuses (4xx/5xx) are
 * returned, not thrown -- callers decide how a 404/429/etc maps to UNAVAILABLE vs FAILED. Only a
 * transport-level failure (DNS/connect/timeout/abort) throws HttpTransportError.
 */
export async function fetchJson<T = unknown>(opts: FetchJsonOptions): Promise<JsonFetchResult<T>> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetchImpl(opts.url, { ...opts.init, signal: controller.signal });
  } catch (err) {
    const aborted = controller.signal.aborted;
    throw new HttpTransportError(aborted ? `request timed out or was aborted after ${timeoutMs}ms` : `network error: ${String((err as Error)?.message ?? err)}`, err);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }

  const rawText = await res.text();
  let json: T | null = null;
  let parseError: string | null = null;
  if (rawText.length > 0) {
    try {
      json = JSON.parse(rawText) as T;
    } catch (err) {
      parseError = `response body is not valid JSON: ${String((err as Error)?.message ?? err)}`;
    }
  }
  return { ok: res.ok, status: res.status, json, rawText, parseError };
}
