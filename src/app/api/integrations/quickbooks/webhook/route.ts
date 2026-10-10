/**
 * POST /api/integrations/quickbooks/webhook — Intuit webhook receiver (event HINTS only).
 *
 * Not session-authenticated: Intuit calls it. Authentication is the HMAC-SHA256 `intuit-signature` over the RAW body with
 * the verifier token (QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN); an invalid or missing signature is 401 and nothing is parsed,
 * looked up or recorded. Fail-closed: without the verifier token or QuickBooks configuration the endpoint answers 503.
 * A verified payload never carries financial truth into OpsIQ: it is deduplicated and at most schedules a READ-ONLY sync.
 *
 * Intuit registration of this URL is a separate, explicitly authorized step and is NOT part of this code.
 */
import { NextResponse } from "next/server";
import { QBO_WEBHOOK_SIGNATURE_HEADER } from "@/domain/quickbooks/qbo-webhook";
import { handleQboWebhook } from "@/services/quickbooks/qbo-webhook.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const lengthHeader = request.headers.get("content-length");
  const declared = lengthHeader !== null && /^\d{1,12}$/.test(lengthHeader) ? Number(lengthHeader) : null;
  // Raw BYTES: the HMAC is computed over exactly what Intuit sent (no UTF-8 decode/BOM normalisation first).
  let rawBody: Uint8Array;
  try {
    rawBody = new Uint8Array(await request.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  const result = await handleQboWebhook(
    { rawBody, signature: request.headers.get(QBO_WEBHOOK_SIGNATURE_HEADER), declaredLength: declared },
    { env: process.env },
  );
  return NextResponse.json(result.body, { status: result.httpStatus, headers: { "cache-control": "no-store" } });
}
