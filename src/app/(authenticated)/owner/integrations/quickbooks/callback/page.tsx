"use client";

/**
 * /owner/integrations/quickbooks/callback — the registered Intuit redirect URI (QUICKBOOKS_REDIRECT_URI).
 *
 * Intuit sends the signed-in owner's browser here with ?code&state&realmId (or ?error&state). The page forwards that query string,
 * unchanged, to the session-authenticated callback API (which consumes the one-time state, exchanges the code and finalizes the
 * connection) and then sends the owner on to My Business with ONE closed outcome token. It holds no rules: the outcome token is
 * derived by the domain from the API's closed response, never from provider text, and nothing from the query ends up in the
 * destination URL. The request is made at most once per page load (a second call would only report "already used").
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { qboOutcomeRedirectPath, qboOutcomeTokenFromCallbackResponse, type QboOutcomeToken } from "@/domain/quickbooks/qbo-connect-outcomes";

const API_PATH = "/api/owner/integrations/quickbooks/callback";
const started = new Set<string>(); // survives a dev-mode double effect for the same query string

export default function QuickBooksCallbackPage() {
  const router = useRouter();
  const [slow, setSlow] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    const search = window.location.search;
    if (ran.current || started.has(search)) return;
    ran.current = true;
    started.add(search);
    const slowTimer = setTimeout(() => setSlow(true), 8_000);
    const controller = new AbortController();
    const abort = setTimeout(() => controller.abort(), 45_000);
    void (async () => {
      let token: QboOutcomeToken = "unavailable";
      try {
        const res = await fetch(`${API_PATH}${search}`, { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal });
        const body: unknown = await res.json().catch(() => null);
        token = qboOutcomeTokenFromCallbackResponse(res.status, body);
      } catch {
        token = "unavailable";
      } finally {
        clearTimeout(slowTimer);
        clearTimeout(abort);
      }
      router.replace(qboOutcomeRedirectPath(token));
    })();
    return () => {
      clearTimeout(slowTimer);
    };
  }, [router]);

  return (
    <main className="mx-auto max-w-md p-6" aria-busy="true">
      <h1 className="text-xl font-semibold text-foreground">Finishing your QuickBooks connection…</h1>
      <p role="status" className="mt-2 text-sm text-muted-foreground">
        {slow ? "This is taking longer than usual. Please keep this page open." : "One moment — you will be taken back to My Business."}
      </p>
    </main>
  );
}
