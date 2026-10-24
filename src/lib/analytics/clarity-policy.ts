/**
 * Microsoft Clarity policy for OpsIQ's PUBLIC, logged-out pages only (pure; no DOM, no I/O).
 *
 * Three independent gates must ALL pass before anything is loaded; every gate fails closed:
 *   1. configuration  - a well-formed project id AND the Vercel production deployment;
 *   2. route          - the page is on the allowlist below (unknown route = DENY);
 *   3. consent        - the visitor explicitly chose "granted" (no choice, "denied" or garbage = no load).
 *
 * Privacy boundary: Clarity is a session recorder. It must never run on /login, /signup, the signed-in product,
 * admin, dashboard, API or any other route. Because App Router soft navigation keeps ONE document alive, a Clarity
 * runtime loaded on a public page would otherwise survive a client-side transition into a private page; and Clarity
 * has no supported way to stop. So the boundary is enforced by destroying the document: links from the public site
 * to any non-eligible target are full-document navigations (isDocumentNavigationRequired), and the loader reloads the
 * document if it ever finds itself on a non-eligible route (see ClarityConsent).
 *
 * This module does not call the Clarity Identify API, sets no custom tags or events, and never unmasks content.
 * Masking is configured in the Clarity dashboard (Strict) and is deliberately not duplicated or weakened in code.
 */

/** The only thing persisted client-side for analytics: a versioned choice. No identity, no business information. */
export const CLARITY_CONSENT_STORAGE_KEY = "opsiq_analytics_consent_v1";

export type AnalyticsConsent = "granted" | "denied";

/** Exactly "granted" or "denied"; anything else (missing, malformed, a different version's value) is no consent. */
export function parseAnalyticsConsent(raw: unknown): AnalyticsConsent | null {
  return raw === "granted" || raw === "denied" ? raw : null;
}

/** Clarity project ids are short lowercase-alphanumeric tokens. Anything else is rejected before it can reach a script URL. */
const PROJECT_ID_PATTERN = /^[a-z0-9]{6,16}$/;

export function normalizeClarityProjectId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return PROJECT_ID_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Server-side configuration gate: the project id is returned only for the Vercel PRODUCTION deployment, mirroring the
 * existing Vercel Web Analytics gate, so preview and local builds never record into the production project.
 */
export function resolveClarityProjectId(env: Record<string, string | undefined> = process.env): string | null {
  if (env.VERCEL_ENV !== "production") return null;
  return normalizeClarityProjectId(env.NEXT_PUBLIC_CLARITY_PROJECT_ID);
}

// ---------------------------------------------------------------------------------------------------------------
// Route allowlist
// ---------------------------------------------------------------------------------------------------------------

/** Exact pages that may run Clarity. */
const ELIGIBLE_EXACT_PATHS: ReadonlySet<string> = new Set(["/", "/about", "/beta", "/privacy", "/terms", "/resources"]);

/** Prefixes whose sub-pages may run Clarity (one or more further segments are required). */
const ELIGIBLE_PREFIXES: readonly string[] = ["/resources/", "/tools/"];

/**
 * Routes that must NEVER run Clarity. The allowlist alone decides eligibility; this list is a second, independent
 * barrier so that a future mistaken allowlist edit cannot expose an auth or private surface.
 */
export const CLARITY_FORBIDDEN_PREFIXES: readonly string[] = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/resend-verification",
  "/auth",
  "/owner",
  "/admin",
  "/dashboard",
  "/api",
  "/onboarding",
  "/quick-start",
  "/my-day",
  "/operator",
  "/clients",
  "/control",
  "/decisions",
  "/entity",
  "/calibration",
  "/value",
  "/_next",
];

function startsWithSegment(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Strips a trailing query/fragment if a caller passed more than a pathname. */
function pathOnly(input: string): string {
  const cut = input.search(/[?#]/);
  return cut === -1 ? input : input.slice(0, cut);
}

/**
 * Whether Clarity may run on this pathname. Strict: an unusual or ambiguous path is not "probably fine", it is denied
 * (encoded separators/dots, dot segments, empty segments, backslashes, control characters, protocol-relative forms).
 */
export function isClarityEligiblePath(pathname: unknown): boolean {
  if (typeof pathname !== "string") return false;
  const path = pathOnly(pathname);
  if (path.length === 0 || path[0] !== "/") return false;
  if (/[\u0000-\u001f\u007f\\]/.test(path)) return false;
  if (/%(2e|2f|5c|00)/i.test(path)) return false; // encoded dot, slash, backslash, NUL
  if (path.startsWith("//")) return false;

  const normalized = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  const segments = normalized.split("/").slice(1);
  if (normalized !== "/" && segments.some((s) => s === "" || s === "." || s === "..")) return false;

  if (CLARITY_FORBIDDEN_PREFIXES.some((p) => startsWithSegment(normalized, p))) return false;

  if (ELIGIBLE_EXACT_PATHS.has(normalized)) return true;
  return ELIGIBLE_PREFIXES.some((prefix) => normalized.startsWith(prefix) && normalized.length > prefix.length);
}

/**
 * Public pages that are Clarity-eligible but whose server render can REDIRECT a signed-in visitor into the private app
 * ("/" sends a signed-in user to /owner/* or /dashboard). A client-side transition to one of these could therefore be
 * carried by the router, through that redirect, into a private route inside the same document and its Clarity runtime.
 * Links to them are full-document navigations too, so the redirect happens on a fresh document.
 */
export const SERVER_REDIRECTING_PUBLIC_PATHS: ReadonlySet<string> = new Set(["/"]);

/**
 * Whether following this link must be a FULL-DOCUMENT navigation, so a Clarity runtime in the current document is
 * destroyed. True for every internal target that is not itself Clarity-eligible, and for eligible pages that can redirect into the private app; relative or unparseable internal
 * targets are treated the same way (fail closed). External URLs, mailto/tel and same-page fragments open elsewhere or
 * stay on the same eligible page, so they are not affected.
 */
export function isDocumentNavigationRequired(href: unknown): boolean {
  if (typeof href !== "string") return true;
  const value = href.trim();
  if (value === "" || value.startsWith("#")) return false;
  if (/^(?:[a-z][a-z0-9+.-]*:)/i.test(value)) return false; // https:, mailto:, tel: ... never an in-app transition
  if (value.startsWith("//")) return false; // protocol-relative = external
  if (!value.startsWith("/")) return true; // relative path: cannot be proven eligible
  if (!isClarityEligiblePath(value)) return true;
  const cut = value.search(/[?#]/);
  const path = cut === -1 ? value : value.slice(0, cut);
  return SERVER_REDIRECTING_PUBLIC_PATHS.has(path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path);
}

// ---------------------------------------------------------------------------------------------------------------
// Loader contract (the parts that are data, so tests and the CSP can share them)
// ---------------------------------------------------------------------------------------------------------------

/** The Clarity tag is loaded from this exact origin and path prefix (Microsoft's published loader snippet). */
export const CLARITY_TAG_ORIGIN = "https://www.clarity.ms";
export const CLARITY_TAG_PATH = "/tag/";

/**
 * Consent API v2 payload, applied the moment the runtime exists. Analytics storage is what the visitor agreed to;
 * advertising storage is always denied: OpsIQ does not use Clarity for advertising and never grants it.
 */
export const CLARITY_CONSENT_V2 = { analytics_Storage: "granted", ad_Storage: "denied" } as const;

export function clarityTagUrl(projectId: string): string | null {
  const id = normalizeClarityProjectId(projectId);
  return id === null ? null : `${CLARITY_TAG_ORIGIN}${CLARITY_TAG_PATH}${id}`;
}

/** First-party cookies Clarity sets on the site's own domain; cleared best-effort when a visitor withdraws. */
export const CLARITY_FIRST_PARTY_COOKIES: readonly string[] = ["_clck", "_clsk"];
