/**
 * Resend webhook receiver — delivery status reconciliation.
 *
 * Receives Resend webhook events (email.delivered, email.bounced, email.complained,
 * email.delivery_delayed) and reconciles the Alert.emailDeliveryStatus field.
 *
 * Authentication: HMAC-SHA256 signature from Resend using RESEND_WEBHOOK_SECRET.
 * Fail-closed: missing secret or invalid signature → 401.
 *
 * Events handled:
 *   email.delivered        → find alert by resendMessageId, set SENT if CLAIMED/PENDING
 *   email.bounced          → set PERMANENTLY_FAILED + suppress further retries
 *   email.complained       → set PERMANENTLY_FAILED (spam complaint)
 *   email.delivery_delayed → log only (transient; retry cron handles recovery)
 *
 * All other event types are acknowledged (200) without action to avoid Resend retries.
 *
 * Security:
 *  - Signature checked before body is read into business logic
 *  - resendMessageId lookup never exposes workspace data to the caller
 *  - No PII logged
 */

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { captureError } from "@/infra/observability";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

const RESEND_SIGNATURE_HEADER = "svix-signature";
const RESEND_TIMESTAMP_HEADER = "svix-timestamp";
const RESEND_ID_HEADER = "svix-id";
const TOLERANCE_SECONDS = 300; // 5 minutes

function getWebhookSecret(): string | null {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  return secret && secret.trim().length > 0 ? secret.trim() : null;
}

function verifySignature(
  rawBody: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string
): boolean {
  const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const computed = createHmac("sha256", secretBytes).update(toSign).digest("base64");

  // svix-signature can be a comma-separated list of "v1,<b64>" pairs
  for (const part of svixSignature.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    try {
      const a = Buffer.from(computed);
      const b = Buffer.from(sig);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      continue;
    }
  }
  return false;
}

function checkTimestamp(svixTimestamp: string): boolean {
  const ts = parseInt(svixTimestamp, 10);
  if (isNaN(ts)) return false;
  const delta = Math.abs(Date.now() / 1000 - ts);
  return delta <= TOLERANCE_SECONDS;
}

export async function POST(request: Request): Promise<NextResponse> {
  const secret = getWebhookSecret();
  if (!secret) {
    logger.warn("Resend webhook: RESEND_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const svixId = request.headers.get(RESEND_ID_HEADER) ?? "";
  const svixTimestamp = request.headers.get(RESEND_TIMESTAMP_HEADER) ?? "";
  const svixSignature = request.headers.get(RESEND_SIGNATURE_HEADER) ?? "";

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing webhook headers" }, { status: 400 });
  }

  if (!checkTimestamp(svixTimestamp)) {
    return NextResponse.json({ error: "Timestamp out of tolerance" }, { status: 401 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Failed to read body" }, { status: 400 });
  }

  if (!verifySignature(rawBody, svixId, svixTimestamp, svixSignature, secret)) {
    logger.warn("Resend webhook: invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eventType = event.type ?? "";
  const resendMessageId = event.data?.email_id ?? "";

  logger.info("Resend webhook received", { eventType, resendMessageId: resendMessageId.slice(0, 12) });

  if (!resendMessageId) {
    return NextResponse.json({ ok: true, action: "no_message_id" });
  }

  try {
    if (eventType === "email.delivered") {
      await db.alert.updateMany({
        where: {
          resendMessageId,
          emailDeliveryStatus: { in: ["CLAIMED", "PENDING"] },
        },
        data: { emailDeliveryStatus: "SENT", emailError: null },
      });
    } else if (eventType === "email.bounced" || eventType === "email.complained") {
      const reason = eventType === "email.bounced" ? "bounce" : "spam_complaint";
      const updated = await db.alert.updateMany({
        where: {
          resendMessageId,
          emailDeliveryStatus: { notIn: ["SENT", "PERMANENTLY_FAILED"] },
        },
        data: {
          emailDeliveryStatus: "PERMANENTLY_FAILED",
          emailError: reason,
        },
      });

      if (updated.count > 0) {
        // Emit audit for each affected alert
        const alerts = await db.alert.findMany({
          where: { resendMessageId },
          select: { id: true, workspaceId: true },
        });
        for (const alert of alerts) {
          await emitAuditEvent({
            eventName: AUDIT_EVENTS.ALERT_EMAIL_PERMANENTLY_FAILED,
            actorId: "system",
            entityType: "alert",
            entityId: alert.id,
            workspaceId: alert.workspaceId,
            payload: { reason, via: "resend_webhook" },
            visibility: "internal",
          }).catch(() => {});
        }
      }
    } else if (eventType === "email.delivery_delayed") {
      logger.info("Resend webhook: delivery delayed (transient)", {
        resendMessageId: resendMessageId.slice(0, 12),
      });
    }
  } catch (err) {
    captureError(err, { category: "DATABASE_ERROR", route: "/api/webhooks/resend" });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, eventType });
}
