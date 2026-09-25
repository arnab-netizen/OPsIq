/**
 * QuickBooks Online change-notification webhook.
 * POST /api/webhooks/quickbooks
 *
 * Authorization is Intuit's `intuit-signature` header only:
 * base64(HMAC-SHA256(QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN, raw body)), compared in
 * constant time over the EXACT raw bytes (the body is read with
 * request.arrayBuffer() before any parsing). Fail-closed: when the verifier token is not configured
 * every delivery is rejected with 503.
 *
 * Notifications are treated as triggers only — no entity data from the payload
 * is persisted. Each notified realm is mapped to the connectors ALREADY bound
 * to it by a completed OAuth flow; each such connector gets its own
 * de-duplicated sync task (replayed deliveries collapse onto the same task),
 * which refetches canonical state via CDC with that workspace's own tokens.
 * An unknown realm is acknowledged without side effects or information leak.
 */
import { after } from "next/server";
import { NextResponse } from "next/server";
import { handleQuickBooksWebhook } from "@/services/quickbooks/qbo-webhook.service";
import { drainQuickBooksSyncTask } from "@/services/quickbooks/qbo-sync-dispatch.service";
import { logger } from "@/infra/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const RESPONSE_TEXT: Record<number, string> = {
  200: "ok",
  400: "malformed notification",
  401: "invalid signature",
  503: "webhook not configured",
};

export async function POST(request: Request): Promise<NextResponse> {
  // Exact received bytes: the HMAC is computed over these, never over a
  // decoded-and-re-encoded string.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signatureHeader = request.headers.get("intuit-signature");

  let result: Awaited<ReturnType<typeof handleQuickBooksWebhook>>;
  try {
    result = await handleQuickBooksWebhook({ rawBody, signatureHeader });
  } catch (err) {
    // Non-2xx makes Intuit retry the delivery; dedup keys make the retry safe.
    logger.error("QuickBooks webhook processing failed", err);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }

  if (result.status === 200 && result.dispatched.length > 0) {
    const taskIds = result.dispatched.map((d) => d.taskId);
    after(async () => {
      // One shared wall-clock budget across all dispatched tasks; whatever does
      // not fit stays pending for the next drain (cron / next notification).
      const deadline = Date.now() + 45_000;
      for (const taskId of taskIds) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        await drainQuickBooksSyncTask(taskId, remaining);
      }
    });
  }

  return NextResponse.json({ status: RESPONSE_TEXT[result.status] ?? "error" }, { status: result.status });
}
