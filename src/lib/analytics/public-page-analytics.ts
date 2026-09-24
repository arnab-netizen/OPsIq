/**
 * Page-view analytics policy (Vercel Web Analytics) for OpsIQ's public,
 * logged-out acquisition surface only.
 *
 * `filterPublicPageView` is the Analytics component's `beforeSend` hook: it
 * drops every event whose path is not an allowlisted public page (the whole
 * signed-in product, admin, auth, and API surfaces are never reported) and
 * strips every query parameter except utm_* campaign tags, plus any
 * fragment, before anything leaves the browser.
 *
 * No custom events are sent. Lead-level attribution remains the beta-request
 * record itself (src/lib/attribution/acquisition-attribution.ts).
 */

/** Exact public pages whose visits are counted. */
const PUBLIC_EXACT_PATHS = new Set(["/", "/about", "/beta", "/privacy", "/terms", "/resources"]);

/** Public path prefixes whose sub-pages are counted (resource articles). */
const PUBLIC_PATH_PREFIXES = ["/resources/"];

export function isPublicAnalyticsPath(pathname: string): boolean {
  const normalized = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return PUBLIC_EXACT_PATHS.has(normalized) || PUBLIC_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/**
 * Returns the URL to report for a page view, or null to send nothing.
 * Keeps origin + path + utm_* parameters only.
 */
export function sanitizePublicPageViewUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!isPublicAnalyticsPath(url.pathname)) return null;
  const kept = new URLSearchParams();
  url.searchParams.forEach((value, key) => {
    if (key.startsWith("utm_")) kept.append(key, value);
  });
  const query = kept.toString();
  return `${url.origin}${url.pathname}${query ? `?${query}` : ""}`;
}

export function filterPublicPageView<T extends { url: string }>(event: T): T | null {
  const url = sanitizePublicPageViewUrl(event.url);
  return url === null ? null : { ...event, url };
}

/**
 * Analytics is mounted only on the Vercel production deployment, and only
 * after Web Analytics has been enabled for the project (otherwise
 * /_vercel/insights/script.js is not served). Preview and local builds never
 * load the script, so they neither pollute production counts nor log a
 * failed script request.
 */
export function shouldMountPageAnalytics(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === "production";
}
