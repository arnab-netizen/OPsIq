/**
 * POST /api/beta-requests
 *
 * Public, anonymous route backing the homepage's "Request beta access"
 * controlled-beta capture (replaces sending cold traffic straight to full
 * /signup — see src/components/landing/LandingPage.tsx). No session is
 * required or possible: a visitor requesting beta access does not have an
 * account yet.
 *
 * Enumeration-resistant and benign-on-repeat by the same pattern as
 * /api/privacy-requests: `email` carries a database-level UNIQUE constraint
 * (see the BetaRequest Prisma model), so a repeated submission of the same
 * normalized email never creates a second row and always returns the exact
 * same generic response — it never reveals whether a request already
 * exists. First-touch UTM attribution: because a duplicate never updates the
 * existing row, the UTM values recorded on the very first submission are the
 * ones that persist.
 *
 * Selected requesters are invited out-of-band (see
 * /api/admin/beta-requests) and receive the existing /signup flow directly —
 * this route never creates a User, Workspace, or session.
 */

import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { parseRequestBody, identityEmailSchema } from "@/lib/validation";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { requirePgRateLimit, RateLimitError, BETA_REQUEST_RATE_LIMIT } from "@/infra/rate-limit";
import { ValidationError } from "@/infra/errors";
import { getEmailProvider } from "@/lib/integrations/email-provider";
import { escapeHtml } from "@/lib/integrations/email-html";
import { z } from "zod/v4";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Bounds request-body/stored-row size for this anonymous, unauthenticated
// write surface — each field's max() below is the payload-size control for
// this route (see Phase 13 abuse review in the controlled-beta PR).
const UTM_MAX_LEN = 200;

const betaRequestSchema = z.object({
  email: identityEmailSchema,
  firstName: z.string().trim().max(100).optional(),
  utmSource: z.string().trim().max(UTM_MAX_LEN).optional(),
  utmMedium: z.string().trim().max(UTM_MAX_LEN).optional(),
  utmCampaign: z.string().trim().max(UTM_MAX_LEN).optional(),
  utmContent: z.string().trim().max(UTM_MAX_LEN).optional(),
});

/**
 * The exact response returned whether this is a brand-new request or a
 * repeat submission of an already-recorded email. Never branch this on
 * outcome (enumeration-resistance, mirrors privacy-requests'
 * GENERIC_RESPONSE rationale). Never claims a guaranteed slot, a guaranteed
 * reply time, or a guaranteed launch date — access opens gradually and is
 * not automatic.
 */
const GENERIC_RESPONSE = {
  success: true,
  message:
    "Your beta request has been received. We're opening access gradually, so immediate access isn't guaranteed — we'll follow up by email if you're selected.",
};

/**
 * True when `error` is a Prisma unique-constraint violation on
 * BetaRequest.email. Same driver-adapter-aware shape as the identical helper
 * in /api/auth/signup/route.ts (this repo's Prisma client uses
 * @prisma/adapter-pg, whose P2002 errors do not populate the classic
 * `meta.target` field) — see that file's comment for the full root-cause
 * history of why both shapes must be checked.
 */
function isEmailUniqueViolation(error: unknown): boolean {
  const prismaError = error as {
    code?: string;
    meta?: { target?: unknown; driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } } };
  } | null;
  if (!prismaError || prismaError.code !== "P2002") return false;
  const adapterFields = prismaError.meta?.driverAdapterError?.cause?.constraint?.fields;
  const target = prismaError.meta?.target;
  return JSON.stringify([adapterFields, target]).toLowerCase().includes("email");
}

/**
 * Best-effort operator notification for a genuinely new BetaRequest. Reuses
 * the same getEmailProvider()/RESEND_API_KEY plumbing as the applicant
 * confirmation email below — no new notification system. The recipient is
 * a single dedicated env var (BETA_REQUEST_NOTIFICATION_EMAIL): no existing
 * ADMIN_EMAIL/OWNER_EMAIL/SUPPORT_EMAIL config exists anywhere in this repo
 * to reuse instead (verified by repo-wide search before adding this). Unset
 * -> silently skipped, same as an unconfigured email provider. Never throws:
 * a notification failure must never affect the already-persisted request or
 * the response already returned to the visitor.
 *
 * Every field here (firstName, email, utmSource, utmCampaign) is
 * visitor-supplied and untrusted: each is escapeHtml()'d before it reaches
 * the HTML body, so a submitter cannot inject markup into the email an
 * operator opens. The plain-text body keeps the raw, human-readable values.
 */
async function notifyOwnerOfNewBetaRequest(row: {
  id: string;
  email: string;
  firstName: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
}): Promise<void> {
  try {
    const recipient = process.env.BETA_REQUEST_NOTIFICATION_EMAIL;
    if (!recipient) return;
    const provider = getEmailProvider();
    if (!provider) return;

    const fields: Array<[string, string]> = [
      ...(row.firstName ? ([["Name", row.firstName]] as Array<[string, string]>) : []),
      ["Email", row.email],
      ["Request ID", row.id],
      ["Created", new Date().toISOString()],
      ...(row.utmSource ? ([["Source", row.utmSource]] as Array<[string, string]>) : []),
      ...(row.utmCampaign ? ([["Campaign", row.utmCampaign]] as Array<[string, string]>) : []),
    ];

    await provider.send({
      to: recipient,
      subject: "New OpsIQ beta request",
      html: `<p>A new beta access request was received.</p><ul>${fields
        .map(([label, value]) => `<li>${escapeHtml(label)}: ${escapeHtml(value)}</li>`)
        .join("")}</ul>`,
      text: fields.map(([label, value]) => `${label}: ${value}`).join("\n"),
    });
  } catch (notifyError) {
    console.error(
      "[BETA_REQUEST] Owner notification dispatch failed",
      notifyError instanceof Error ? notifyError.constructor.name : "UnknownError"
    );
  }
}

export const POST = async (request: NextRequest) => {
  try {
    const { email, firstName, utmSource, utmMedium, utmCampaign, utmContent } = await parseRequestBody(
      request,
      betaRequestSchema
    );

    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    await requirePgRateLimit(`beta-request:${ip}`, BETA_REQUEST_RATE_LIMIT);
    await requirePgRateLimit(`beta-request:${email}`, BETA_REQUEST_RATE_LIMIT);

    const id = randomUUID();
    let created = false;
    try {
      await db.betaRequest.create({
        data: {
          id,
          email,
          firstName: firstName || null,
          utmSource: utmSource || null,
          utmMedium: utmMedium || null,
          utmCampaign: utmCampaign || null,
          utmContent: utmContent || null,
        },
      });
      created = true;
    } catch (error) {
      if (!isEmailUniqueViolation(error)) throw error;
      // Benign repeat submission: the row already exists (first-touch UTM
      // attribution is preserved by never updating it here). The response
      // below is identical to the success path — never reveal this outcome.
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.BETA_REQUEST_DUPLICATE_SUBMITTED,
        entityType: "beta_request",
        visibility: "internal",
      });
    }

    if (created) {
      // emitAuditEvent fail-safe no-ops without a workspaceId (see
      // infra/audit.ts) — expected here: this route runs pre-account, with
      // no workspace context, exactly like /api/privacy-requests.
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.BETA_REQUEST_CREATED,
        entityType: "beta_request",
        entityId: id,
        payload: { hasUtm: !!(utmSource || utmMedium || utmCampaign || utmContent) },
        visibility: "internal",
      });

      // Best-effort, non-blocking owner notification — only for a genuine new
      // request (this whole block is skipped on a duplicate submission, same
      // guard as the confirmation email below), so a duplicate never
      // re-notifies the owner.
      await notifyOwnerOfNewBetaRequest({
        id,
        email,
        firstName: firstName || null,
        utmSource: utmSource || null,
        utmCampaign: utmCampaign || null,
      });

      // Best-effort, non-blocking confirmation — never gates the response
      // above, and only attempted for a genuine new request (not a repeat
      // submission, so a resubmission never re-sends an email). Mirrors the
      // exact optional-provider pattern in /api/auth/signup/route.ts. Never
      // promises access — only that the request was received.
      try {
        const provider = getEmailProvider();
        if (provider) {
          await provider.send({
            to: email,
            subject: "We received your OpsIQ beta request",
            html: `<p>Thanks for your interest in OpsIQ.</p><p>Your beta request has been received. We're opening access gradually, so we can't guarantee immediate access — we'll follow up by email if you're selected.</p>`,
            text: `Thanks for your interest in OpsIQ.\n\nYour beta request has been received. We're opening access gradually, so we can't guarantee immediate access — we'll follow up by email if you're selected.`,
          });
        }
      } catch (emailError) {
        console.error(
          "[BETA_REQUEST] Confirmation email dispatch failed",
          emailError instanceof Error ? emailError.constructor.name : "UnknownError"
        );
      }
    }

    return Response.json(GENERIC_RESPONSE);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json({ error: "Too many requests. Please wait and try again." }, { status: 429 });
    }
    if (error instanceof ValidationError) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }
    // Never leak internals to a public, unauthenticated caller.
    console.error("[BETA_REQUEST_FAILED]", error instanceof Error ? error.constructor.name : "UnknownError");
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
};
