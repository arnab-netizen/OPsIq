/**
 * Canonical public site origin.
 *
 * Production serves https://opsiq.solutions; https://www.opsiq.solutions
 * 308-redirects to it. Every canonical URL, sitemap <loc>, and Open Graph URL
 * built for public, indexable surfaces must therefore use the bare (non-www)
 * HTTPS origin — never a Vercel preview hostname, localhost, or `www`.
 */
export const SITE_URL = "https://opsiq.solutions";

/** Absolute canonical URL for a root-relative public path (must start with "/"). */
export function absoluteUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`absoluteUrl expects a root-relative path, received "${path}"`);
  }
  return `${SITE_URL}${path}`;
}
