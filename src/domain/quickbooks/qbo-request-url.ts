/**
 * QuickBooks Online — the single place a request URL is assembled.
 *
 * Every path segment (fixed resource names, the realm id and any entity id) is percent-encoded, the origin
 * must be exactly the configured Intuit origin, and the resulting pathname must be EXACTLY
 * /v3/company/{realm}/{segments…} with no query or fragment before OpsIQ adds its own parameters. So no
 * identifier can add or collapse a path level (".."), change the host, or smuggle a query/fragment, and a base
 * URL that is not a bare Intuit origin is refused. The guard is defence in depth on top of the identifier
 * boundary in qbo-identifiers.ts.
 *
 * Pure module: no DB, no network.
 */

import { QboProviderError } from "./qbo-errors";
import { encodePathSegment } from "./qbo-identifiers";

export function buildQboRequestUrl(input: {
  apiBaseUrl: string;
  realmId: string;
  segments: readonly string[];
  minorVersion: number;
  query?: Readonly<Record<string, string>>;
  /**
   * Test seam only: production callers never pass this, so segments are always encoded by encodePathSegment.
   * It exists so the origin/path guard below can be proven to hold even if the encoder regressed.
   */
  encodeSegment?: (segment: string) => string;
}): string {
  const encode = input.encodeSegment ?? encodePathSegment;
  let expectedPath: string;
  try {
    expectedPath = `/v3/company/${encode(input.realmId)}/${input.segments.map(encode).join("/")}`;
  } catch {
    throw new QboProviderError({ kind: "BAD_REQUEST", localReason: "INVALID_PATH_SEGMENT" });
  }
  let baseOrigin: string;
  let url: URL;
  try {
    baseOrigin = new URL(input.apiBaseUrl).origin;
    url = new URL(`${baseOrigin}${expectedPath}`);
    // The configured base must itself be only an origin: a base carrying a path, query or fragment is refused.
    const base = new URL(input.apiBaseUrl);
    if (base.pathname !== "/" || base.search !== "" || base.hash !== "" || base.username !== "" || base.password !== "") {
      throw new Error("base is not a bare origin");
    }
  } catch {
    throw new QboProviderError({ kind: "CONFIGURATION_ERROR", localReason: "URL_ESCAPED_BASE" });
  }
  if (url.origin !== baseOrigin || url.pathname !== expectedPath || url.search !== "" || url.hash !== "") {
    throw new QboProviderError({ kind: "CONFIGURATION_ERROR", localReason: "URL_ESCAPED_BASE" });
  }
  url.searchParams.set("minorversion", String(input.minorVersion));
  for (const [k, v] of Object.entries(input.query ?? {})) url.searchParams.set(k, v);
  return url.toString();
}
