/**
 * Destination guard for anything that carries the Production diagnostic key (x-opsiq-diagnostic-key) or
 * Production operator credentials from CI.
 *
 * Threat: a workflow_dispatch `base_url` (or an HTTP redirect) pointing at an attacker-controlled host would
 * receive the key in a request header. Controls:
 *   1. The destination origin must be EXACTLY one of an approved list of canonical https origins
 *      (no userinfo, port, path, query, fragment, trailing dot, IDN/punycode, IP literal or look-alike host).
 *   2. Every request path is relative to that origin and is re-validated against the approved origin after URL
 *      resolution (a path such as "//evil.example" or "@evil.example" cannot change the host).
 *   3. Redirects are NEVER followed (`redirect: "manual"`). A 3xx is returned to the caller as a non-success
 *      response; the Location is never requested, so the key is never sent to a redirect target.
 *   4. The key is sent only as a request header, never in a URL, and is never written to any log or error.
 *
 * The approved list is a constant. Tests may inject a different list for loopback servers; production scripts
 * never read the list from the environment or from workflow inputs.
 */

export const APPROVED_DIAGNOSTIC_ORIGINS: readonly string[] = Object.freeze([
  "https://o-ps-iq.vercel.app",
  "https://opsiq.solutions",
  "https://www.opsiq.solutions",
]);

export const DIAGNOSTIC_KEY_HEADER = "x-opsiq-diagnostic-key";

export class DiagnosticDestinationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "DiagnosticDestinationError";
    this.code = code;
  }
}

/** Returns the canonical origin of `raw` iff it is exactly an approved origin; otherwise throws. Never echoes secrets. */
export function assertApprovedDiagnosticOrigin(raw: string, allowed: readonly string[] = APPROVED_DIAGNOSTIC_ORIGINS): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 200) {
    throw new DiagnosticDestinationError("DESTINATION_INVALID", "destination is empty or too long");
  }
  if (/[\s\u0000-\u001f\\@]/.test(raw)) {
    throw new DiagnosticDestinationError("DESTINATION_INVALID", "destination contains forbidden characters");
  }
  const trimmed = raw.endsWith("/") ? raw.slice(0, -1) : raw;
  // The literal text must already equal an approved origin: no normalisation tricks are accepted.
  if (!allowed.includes(trimmed)) {
    throw new DiagnosticDestinationError("DESTINATION_NOT_APPROVED", "destination origin is not on the approved list");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new DiagnosticDestinationError("DESTINATION_INVALID", "destination is not a valid URL");
  }
  const loopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (parsed.protocol !== "https:" && !(loopback && parsed.protocol === "http:" && allowed !== APPROVED_DIAGNOSTIC_ORIGINS)) {
    throw new DiagnosticDestinationError("DESTINATION_NOT_HTTPS", "destination must use https");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname !== "/" && parsed.pathname !== "")) {
    throw new DiagnosticDestinationError("DESTINATION_INVALID", "destination must be a bare origin");
  }
  return parsed.origin;
}

export interface DiagnosticClient {
  readonly origin: string;
  /** Request `path` (must start with a single "/") on the approved origin. Never follows redirects. */
  fetch(path: string, init?: Omit<RequestInit, "redirect"> & { headers?: Record<string, string> }): Promise<Response>;
}

/**
 * Build a client bound to one approved origin. `key` (optional) is attached as a header on every request.
 * `fetchImpl` is injectable for tests.
 */
export function createDiagnosticClient(
  rawBaseUrl: string,
  key: string | undefined,
  options: { allowedOrigins?: readonly string[]; fetchImpl?: typeof fetch } = {},
): DiagnosticClient {
  const origin = assertApprovedDiagnosticOrigin(rawBaseUrl, options.allowedOrigins);
  const doFetch = options.fetchImpl ?? fetch;
  return {
    origin,
    async fetch(path, init = {}) {
      if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || /[\\@\s\u0000-\u001f]/.test(path)) {
        throw new DiagnosticDestinationError("PATH_INVALID", "path must be a single-slash relative path");
      }
      if (/[?&;]key=/i.test(path)) {
        throw new DiagnosticDestinationError("KEY_IN_URL_FORBIDDEN", "the diagnostic key may only be sent as a header");
      }
      const target = new URL(path, origin);
      if (target.origin !== origin) {
        throw new DiagnosticDestinationError("PATH_ESCAPES_ORIGIN", "resolved URL left the approved origin");
      }
      const headers: Record<string, string> = { ...(init.headers ?? {}) };
      for (const name of Object.keys(headers)) {
        if (name.toLowerCase() === DIAGNOSTIC_KEY_HEADER) delete headers[name];
      }
      if (key && key !== "not-set") headers[DIAGNOSTIC_KEY_HEADER] = key;
      return doFetch(target.toString(), { ...init, headers, redirect: "manual" });
    },
  };
}
