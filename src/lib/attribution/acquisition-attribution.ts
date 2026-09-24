/**
 * Acquisition attribution for the public beta-request funnel.
 *
 * Captures, per browser tab session (sessionStorage — no cookies, no
 * cross-site identifiers, nothing sent anywhere until the visitor submits a
 * beta request):
 *   - the five standard utm_* campaign tags from the first page the visitor
 *     landed on in this tab (first touch),
 *   - that landing page's path (no query string or fragment),
 *   - the referring site's hostname only (never the full referrer URL), and
 *     only when it is an external site.
 * The path of the page the visitor actually submits from (`conversionPath`)
 * is read at submit time, so a request made from a resource article is
 * attributable to that article even if the visitor landed elsewhere.
 *
 * Every value is bounded and shaped to exactly what POST /api/beta-requests
 * accepts (see ATTRIBUTION_LIMITS), so attribution can never turn a genuine
 * request into a validation failure.
 */

export const ATTRIBUTION_LIMITS = {
  utm: 200,
  path: 300,
  host: 253,
} as const;

/** Root-relative URL path: percent-encoded ASCII only, no query/fragment. */
export const ATTRIBUTION_PATH_PATTERN = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/]*$/;
export const ATTRIBUTION_HOST_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;

/** Hostnames that are OpsIQ itself: never recorded as an external referrer. */
const OWN_HOSTS = new Set(["opsiq.solutions", "www.opsiq.solutions"]);

const STORAGE_KEY = "opsiq.acquisition-attribution.v1";

export interface AcquisitionAttribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  landingPath?: string;
  referrerHost?: string;
}

const UTM_PARAMS = [
  ["utm_source", "utmSource"],
  ["utm_medium", "utmMedium"],
  ["utm_campaign", "utmCampaign"],
  ["utm_content", "utmContent"],
  ["utm_term", "utmTerm"],
] as const;

function cleanUtm(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, ATTRIBUTION_LIMITS.utm).trim();
  return trimmed || undefined;
}

export function cleanPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.length > ATTRIBUTION_LIMITS.path || !ATTRIBUTION_PATH_PATTERN.test(value)) return undefined;
  return value;
}

function cleanHost(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const host = value.toLowerCase();
  if (host.length > ATTRIBUTION_LIMITS.host || !ATTRIBUTION_HOST_PATTERN.test(host)) return undefined;
  return host;
}

function sanitize(raw: Record<string, unknown>): AcquisitionAttribution {
  const out: AcquisitionAttribution = {};
  for (const [, key] of UTM_PARAMS) {
    const value = cleanUtm(raw[key]);
    if (value) out[key] = value;
  }
  const landingPath = cleanPath(raw.landingPath);
  if (landingPath) out.landingPath = landingPath;
  const referrerHost = cleanHost(raw.referrerHost);
  if (referrerHost) out.referrerHost = referrerHost;
  return out;
}

/** Pure derivation from the current page URL and document.referrer. */
export function deriveAttribution(input: { href: string; referrer: string }): AcquisitionAttribution {
  const url = new URL(input.href);
  const raw: Record<string, unknown> = {};
  for (const [param, key] of UTM_PARAMS) raw[key] = url.searchParams.get(param) ?? undefined;
  raw.landingPath = url.pathname;
  if (input.referrer) {
    try {
      const ref = new URL(input.referrer);
      const host = ref.hostname.toLowerCase();
      if ((ref.protocol === "https:" || ref.protocol === "http:") && host !== url.hostname.toLowerCase() && !OWN_HOSTS.has(host)) {
        raw.referrerHost = host;
      }
    } catch {
      // Unparseable referrer: record nothing rather than a guess.
    }
  }
  return sanitize(raw);
}

interface BrowserLike {
  location: { href: string };
  document: { referrer: string };
  sessionStorage: Pick<Storage, "getItem" | "setItem">;
}

/**
 * Returns this tab's first-touch attribution, recording it from the current
 * page if none exists yet. Storage failures (private mode, blocked storage)
 * degrade to current-page attribution; they never throw.
 */
export function captureFirstTouchAttribution(win: BrowserLike): AcquisitionAttribution {
  try {
    const stored = win.sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return sanitize(parsed as Record<string, unknown>);
      }
    }
  } catch {
    // Fall through to deriving from the current page.
  }
  const current = deriveAttribution({ href: win.location.href, referrer: win.document.referrer });
  try {
    win.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage unavailable: attribution still applies to this page view.
  }
  return current;
}

export const ACQUISITION_ATTRIBUTION_STORAGE_KEY = STORAGE_KEY;
