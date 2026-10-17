"use client";

/**
 * Consent-gated Microsoft Clarity for OpsIQ's PUBLIC pages (policy: src/lib/analytics/clarity-policy.ts).
 *
 * Nothing is requested from Microsoft until the visitor has explicitly chosen "Allow analytics" on an allowlisted
 * public page. No choice, "Decline", a malformed stored value, an unknown route or a missing project id all mean
 * the Clarity loader is never added to the document.
 *
 * Clarity has no supported "stop". The privacy boundary is therefore the DOCUMENT:
 *   - links from the public site to any non-eligible target are full-document navigations (PublicLink);
 *   - while the runtime is loaded, a capture-phase click guard turns any remaining in-app link to a non-eligible
 *     route into a full-document navigation before the router sees it;
 *   - as a last backstop, if a document that loaded Clarity ever finds itself on a non-eligible route, it reloads
 *     itself so the runtime is destroyed;
 *   - withdrawing consent persists "denied" and reloads the document.
 *
 * Only the choice ("granted" | "denied") is stored. No identity or business data, no Identify API, no custom tags,
 * no custom events, and nothing is ever unmasked.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/ui/primitives";
import {
  CLARITY_CONSENT_STORAGE_KEY,
  CLARITY_CONSENT_V2,
  CLARITY_FIRST_PARTY_COOKIES,
  clarityTagUrl,
  isClarityEligiblePath,
  isDocumentNavigationRequired,
  normalizeClarityProjectId,
  parseAnalyticsConsent,
  type AnalyticsConsent,
} from "@/lib/analytics/clarity-policy";
import { assignDocument, reloadDocument, replaceDocument } from "@/lib/analytics/document-navigation";

/** Dispatched by the "Analytics preferences" controls to reopen the choice. */
export const OPEN_ANALYTICS_PREFERENCES_EVENT = "opsiq:open-analytics-preferences";

const SCRIPT_ELEMENT_ID = "clarity-script";

interface ClarityFunction {
  (...args: unknown[]): void;
  q?: unknown[];
}
type ClarityWindow = Window & { clarity?: ClarityFunction };

/** True once THIS document has added the Clarity loader. Module scope: it lives and dies with the document. */
let clarityLoadedInThisDocument = false;

function readStoredConsent(): AnalyticsConsent | null {
  try {
    return parseAnalyticsConsent(window.localStorage.getItem(CLARITY_CONSENT_STORAGE_KEY));
  } catch {
    return null; // storage blocked or unavailable: behave as "no choice yet"
  }
}

/** A choice that could not be persisted (storage blocked) still applies to this page view. */
let memoryConsent: AnalyticsConsent | null = null;
const CONSENT_CHANGED_EVENT = "opsiq:analytics-consent-changed";

function persistConsent(value: AnalyticsConsent): void {
  memoryConsent = value;
  try {
    window.localStorage.setItem(CLARITY_CONSENT_STORAGE_KEY, value);
  } catch {
    // Not persisted: the in-memory choice above still applies to this page view.
  }
  window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));
}

// Consent is an external store (localStorage). useSyncExternalStore keeps SSR/hydration safe (the server snapshot is
// "not read yet" = undefined, so nothing is offered or loaded before the browser has read the choice) and also picks up
// a change made in another tab through the `storage` event.
function subscribeToConsent(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CONSENT_CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CONSENT_CHANGED_EVENT, onChange);
  };
}
const getConsentSnapshot = (): AnalyticsConsent | null => readStoredConsent() ?? memoryConsent;
const getServerConsentSnapshot = (): AnalyticsConsent | null | undefined => undefined;

/** Best-effort removal of the first-party cookies Clarity may have set on this site (host and parent domain). */
function clearClarityCookies(): void {
  const host = window.location.hostname;
  const parts = host.split(".");
  const domains = new Set<string | null>([null, host]);
  if (parts.length >= 2) domains.add(`.${parts.slice(-2).join(".")}`);
  for (const name of CLARITY_FIRST_PARTY_COOKIES) {
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ""}`;
    }
  }
}

function loadClarity(projectId: string): void {
  const src = clarityTagUrl(projectId);
  if (src === null || clarityLoadedInThisDocument || document.getElementById(SCRIPT_ELEMENT_ID)) return;
  const w = window as ClarityWindow;
  // Microsoft's published loader stub: commands are queued on `clarity.q` until the runtime arrives. Clarity reads the
  // queued entries as `arguments` objects, hence a classic function.
  if (!w.clarity) {
    // eslint-disable-next-line prefer-rest-params
    const stub: ClarityFunction = function () { (stub.q = stub.q || []).push(arguments); };
    w.clarity = stub;
  }
  // The consent signal is the FIRST command in the queue, before the runtime exists: analytics storage granted
  // (what the visitor chose), advertising storage denied (never granted).
  w.clarity("consentv2", { ...CLARITY_CONSENT_V2 });
  const script = document.createElement("script");
  script.async = true;
  script.id = SCRIPT_ELEMENT_ID;
  script.src = src;
  document.head.appendChild(script);
  clarityLoadedInThisDocument = true;
}

export function ClarityConsent({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const validProjectId = normalizeClarityProjectId(projectId);
  const eligible = validProjectId !== null && isClarityEligiblePath(pathname);

  const stored = useSyncExternalStore(subscribeToConsent, getConsentSnapshot, getServerConsentSnapshot);
  const ready = stored !== undefined;
  const consent: AnalyticsConsent | null = stored ?? null;
  const [panelOpen, setPanelOpen] = useState(false);

  // Withdrawal (here or in another tab) while this document is running Clarity: there is no supported way to stop it,
  // so the document is reloaded, which destroys the runtime. Nothing is loaded on the fresh document.
  useEffect(() => {
    if (ready && consent !== "granted" && clarityLoadedInThisDocument) reloadDocument();
  }, [ready, consent]);

  useEffect(() => {
    const open = () => setPanelOpen(true);
    window.addEventListener(OPEN_ANALYTICS_PREFERENCES_EVENT, open);
    return () => window.removeEventListener(OPEN_ANALYTICS_PREFERENCES_EVENT, open);
  }, []);

  // Load: all three gates (configuration, route, explicit consent).
  useEffect(() => {
    if (ready && eligible && consent === "granted" && validProjectId !== null) loadClarity(validProjectId);
  }, [ready, eligible, consent, validProjectId]);

  // Backstop: a document that loaded Clarity must not outlive the public allowlist.
  useEffect(() => {
    if (!eligible && clarityLoadedInThisDocument) replaceDocument(window.location.href);
  }, [eligible]);

  // While the runtime is loaded, in-app links to non-eligible routes become full-document navigations before the
  // router can soft-navigate (capture phase, ahead of React's handlers).
  useEffect(() => {
    if (!(ready && consent === "granted" && eligible)) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin || !isDocumentNavigationRequired(`${url.pathname}${url.search}`)) return;
      event.preventDefault();
      event.stopPropagation();
      assignDocument(url.href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [ready, consent, eligible]);

  const choose = useCallback((value: AnalyticsConsent) => {
    if (value === "denied") clearClarityCookies();
    persistConsent(value); // an already-running Clarity is destroyed by the withdrawal effect above
    setPanelOpen(false);
  }, []);

  if (!ready || !eligible) return null;
  if (consent !== null && !panelOpen) {
    // Once a choice exists, a small persistent control on EVERY eligible page lets the visitor change it later. It lives
    // here (not in per-page footers, which not every public page has) so no current or future eligible page can lack it.
    return (
      <button
        type="button"
        data-testid="analytics-preferences-floating"
        onClick={() => setPanelOpen(true)}
        className="fixed bottom-2 left-2 z-40 inline-flex min-h-11 items-center rounded-md border border-border bg-background px-3 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Analytics preferences
      </button>
    );
  }

  return (
    <section
      aria-labelledby="analytics-consent-title"
      data-testid="analytics-consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background px-4 py-4 shadow-lg sm:px-6"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-foreground">
          <h2 id="analytics-consent-title" className="font-semibold">
            Help us improve the OpsIQ website?
          </h2>
          <p className="mt-1 text-muted-foreground">
            Optional. If you allow it, Microsoft Clarity records how you click, scroll and move between our public pages, with
            text and form input masked. It never runs once you sign in. Declining changes nothing about how you use OpsIQ.{" "}
            <a href="/privacy#analytics" className="text-[var(--primary-text)] underline">
              Details
            </a>
            .
          </p>
          {consent !== null && (
            <p className="mt-1" data-testid="analytics-consent-current">
              Current choice: {consent === "granted" ? "analytics allowed" : "analytics declined"}.
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-3">
          {/* Equal weight on purpose: same variant, size and order-neutral labels. */}
          <Button variant="outline" onClick={() => choose("granted")} data-testid="analytics-allow">
            Allow analytics
          </Button>
          <Button variant="outline" onClick={() => choose("denied")} data-testid="analytics-decline">
            Decline
          </Button>
        </div>
      </div>
    </section>
  );
}
