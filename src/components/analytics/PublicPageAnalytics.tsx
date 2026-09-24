"use client";

import { Analytics } from "@vercel/analytics/next";
import { filterPublicPageView } from "@/lib/analytics/public-page-analytics";

/**
 * Vercel Web Analytics page views for the public site only. The allowlist and
 * URL sanitization live in src/lib/analytics/public-page-analytics.ts; this
 * client wrapper exists because a `beforeSend` function cannot be passed from
 * the (server) root layout.
 */
export function PublicPageAnalytics() {
  return <Analytics beforeSend={filterPublicPageView} />;
}
