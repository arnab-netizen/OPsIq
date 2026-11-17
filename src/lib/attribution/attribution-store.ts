/**
 * Consent-gated, site-wide UTM attribution: first-touch (never overwritten) and last-touch
 * (overwritten on every fresh campaign visit), carried through internal navigation to signup.
 *
 * This is deliberately SEPARATE from src/lib/attribution/acquisition-attribution.ts, which is the
 * already-shipped, per-tab sessionStorage capture feeding the "Request beta access" funnel
 * (POST /api/beta-requests). That capture is functional attribution for a specific conversion
 * action a visitor takes, scoped to one browser tab, and is unaffected by this module. This module
 * reuses its parsing/sanitizing primitives (deriveAttribution, sanitize) rather than duplicating
 * them, but adds its own storage (localStorage, so it survives across tabs/visits in the same
 * browser) and its own gate: the SAME analytics consent choice used for Microsoft Clarity (see
 * src/lib/analytics/clarity-policy.ts) must be "granted" before anything is written. No consent
 * (no choice yet, or "denied") means no read, no write, no value ever handed to a signup request —
 * this module fails closed, by construction, not by convention.
 *
 * Values are re-sanitized on every read (tampered/legacy storage can never inject anything this
 * module's own capture wouldn't have written) and are bounded the same way the beta-request funnel
 * bounds them (see ATTRIBUTION_LIMITS in acquisition-attribution.ts).
 */
import { deriveAttribution, sanitize, type AcquisitionAttribution } from "./acquisition-attribution";
import { CLARITY_CONSENT_STORAGE_KEY, parseAnalyticsConsent, type AnalyticsConsent } from "@/lib/analytics/clarity-policy";

export const FIRST_TOUCH_STORAGE_KEY = "opsiq.attribution.first-touch.v1";
export const LAST_TOUCH_STORAGE_KEY = "opsiq.attribution.last-touch.v1";

/** The five UTM tags only — the exact set the signup payload carries (see below). */
export interface UtmTags {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
}

const UTM_KEYS: readonly (keyof UtmTags)[] = ["utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm"];

function hasAnyUtm(a: AcquisitionAttribution): boolean {
  return UTM_KEYS.some((k) => Boolean(a[k]));
}

function pickUtm(a: AcquisitionAttribution): UtmTags {
  const out: UtmTags = {};
  for (const k of UTM_KEYS) if (a[k]) out[k] = a[k];
  return out;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AttributionWindowLike {
  location: { href: string };
  document: { referrer: string };
  localStorage: StorageLike;
}

function readConsent(storage: StorageLike): AnalyticsConsent | null {
  try {
    return parseAnalyticsConsent(storage.getItem(CLARITY_CONSENT_STORAGE_KEY));
  } catch {
    return null; // storage blocked/unavailable: treated as "no choice yet" — fail closed.
  }
}

/** Re-sanitizes whatever is stored (or returns null for anything missing/malformed/tampered). */
function readStoredTouch(storage: StorageLike, key: string): AcquisitionAttribution | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const clean = sanitize(parsed as Record<string, unknown>);
    return Object.keys(clean).length > 0 ? clean : null;
  } catch {
    return null;
  }
}

/**
 * Reads first- and last-touch attribution WITHOUT writing anything. Returns {firstTouch: null,
 * lastTouch: null} whenever consent is not currently "granted" — callers (e.g. the signup page)
 * never see a stored value unless the visitor has actively opted in.
 */
export function getAttributionSnapshot(win: Pick<AttributionWindowLike, "localStorage">): {
  firstTouch: UtmTags | null;
  lastTouch: UtmTags | null;
} {
  if (readConsent(win.localStorage) !== "granted") return { firstTouch: null, lastTouch: null };
  const firstTouch = readStoredTouch(win.localStorage, FIRST_TOUCH_STORAGE_KEY);
  const lastTouch = readStoredTouch(win.localStorage, LAST_TOUCH_STORAGE_KEY);
  return {
    firstTouch: firstTouch ? pickUtm(firstTouch) : null,
    lastTouch: lastTouch ? pickUtm(lastTouch) : null,
  };
}

/**
 * Captures this page view into first-touch (set once, never overwritten) and last-touch (replaced
 * every time the CURRENT url itself carries at least one utm_* tag — i.e. a fresh campaign visit;
 * internal navigation to a page with no campaign tags of its own leaves the last known campaign
 * alone). A strict no-op — reads and writes nothing — unless consent is currently "granted".
 *
 * Safe to call on every mount and on every client-side navigation: idempotent, never throws
 * (storage can be blocked, e.g. private browsing), and degrades to doing nothing rather than
 * guessing.
 */
export function captureAttributionOnConsent(win: AttributionWindowLike): void {
  if (readConsent(win.localStorage) !== "granted") return;
  const current = deriveAttribution({ href: win.location.href, referrer: win.document.referrer });

  try {
    if (!win.localStorage.getItem(FIRST_TOUCH_STORAGE_KEY)) {
      win.localStorage.setItem(FIRST_TOUCH_STORAGE_KEY, JSON.stringify(current));
    }
  } catch {
    // Storage unavailable: nothing persists, but this never throws into the caller.
  }

  if (hasAnyUtm(current)) {
    try {
      win.localStorage.setItem(LAST_TOUCH_STORAGE_KEY, JSON.stringify(current));
    } catch {
      // Same as above: best-effort only.
    }
  }
}

/** Withdrawal mirrors ClarityConsent's own cookie clearing on "denied": nothing attributable survives consent being revoked. */
export function clearStoredAttribution(win: Pick<AttributionWindowLike, "localStorage">): void {
  try {
    win.localStorage.removeItem(FIRST_TOUCH_STORAGE_KEY);
    win.localStorage.removeItem(LAST_TOUCH_STORAGE_KEY);
  } catch {
    // Nothing to do if storage itself is unavailable.
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Transport-time sanitization (defense in depth)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Stricter allowlist applied the moment a UTM value leaves the browser for POST /api/auth/signup.
 * UTM values are attacker-controlled query-string input (?utm_source=<script>...). deriveAttribution
 * already trims and length-caps them (ATTRIBUTION_LIMITS.utm = 200) for the beta-request funnel, but
 * places no restriction on which characters survive. For the NEW signup-attribution wire format this
 * module owns, every value is additionally required to match a closed, safe character set — letters,
 * digits, space, and a short list of punctuation common in real campaign tags — before it is sent.
 * A value that fails this check is dropped entirely (never partially stripped and forwarded), so a
 * payload built from this function can never carry markup, quotes, backslashes, or URL/scheme
 * characters that could be mistaken for executable content or a redirect target downstream.
 */
export const SAFE_UTM_VALUE_PATTERN = /^[A-Za-z0-9 ._,:+%-]{1,200}$/;

function sanitizeForTransport(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  return SAFE_UTM_VALUE_PATTERN.test(value) ? value : undefined;
}

/** Applies sanitizeForTransport to every field, dropping (never mangling) anything that fails. */
export function sanitizeUtmTagsForTransport(tags: UtmTags | null | undefined): UtmTags {
  if (!tags) return {};
  const out: UtmTags = {};
  for (const k of UTM_KEYS) {
    const safe = sanitizeForTransport(tags[k]);
    if (safe) out[k] = safe;
  }
  return out;
}
