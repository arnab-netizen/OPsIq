/**
 * POST /api/privacy-requests
 *
 * Public route: a user filing an access/export, deletion, or correction
 * request may be locked out of their account (that's often *why* they're
 * filing), so this cannot require a session. Enumeration-resistant by the
 * same design as /api/auth/forgot-password and /api/auth/resend-verification:
 * a matching account's userId is recorded privately on the row, but the
 * response never reveals whether one was found, and rate limiting runs
 * per IP and per email before any lookup.
 *
 * There is no automated fulfillment here (nor should there be — see
 * docs/PRIVACY_REQUEST_RUNBOOK.md). This route's whole job is: validate,
 * rate-limit, record the request (with status/handledBy/handledAt left for
 * the manual runbook to fill in), and emit an audit event. Fulfillment is a
 * human, manual, out-of-band process.
 */

import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { parseRequestBody, identityEmailSchema } from "@/lib/validation";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { requirePgRateLimit, RateLimitError, PRIVACY_REQUEST_RATE_LIMIT } from "@/infra/rate-limit";
import { ValidationError } from "@/infra/errors";
import { z } from "zod/v4";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVACY_REQUEST_TYPES = ["ACCESS", "DELETION", "CORRECTION"] as const;

const privacyRequestSchema = z.object({
  requestType: z.enum(PRIVACY_REQUEST_TYPES),
  email: identityEmailSchema,
  detail: z.string().trim().max(5000).optional(),
});

/**
 * The exact response returned whether or not `email` corresponds to a real
 * account. Never branch this on lookup outcome — mirrors forgot-password's
 * GENERIC_RESPONSE / enumeration-resistance rationale exactly. Also never
 * claims deletion (or any fulfillment) is instant or automatic — see the
 * runbook for why fulfillment is manual.
 */
const GENERIC_RESPONSE = {
  success: true,
  message:
    "Your request has been recorded. Our team handles privacy requests manually and will follow up by email if we need to verify your identity or need more information.",
};

export const POST = async (request: NextRequest) => {
  try {
    const { requestType, email, detail } = await parseRequestBody(request, privacyRequestSchema);

    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    await requirePgRateLimit(`privacy-request:${ip}`, PRIVACY_REQUEST_RATE_LIMIT);
    await requirePgRateLimit(`privacy-request:${email}`, PRIVACY_REQUEST_RATE_LIMIT);

    // Looked up privately to attach userId when an account exists — a real
    // person filing a deletion/access/correction request may not remember
    // which email they used, or may be a former user whose account is
    // already gone, so a lookup miss still records the request (userId:
    // null) rather than being rejected. The outcome is NEVER reflected in
    // the response (enumeration-resistance guarantee) — only the row.
    const user = await db.user.findUnique({ where: { email }, select: { id: true } });

    const id = randomUUID();
    await db.privacyRequest.create({
      data: {
        id,
        requestType,
        userId: user?.id ?? null,
        email,
        detail: detail ?? null,
      },
    });

    // emitAuditEvent fail-safe no-ops without a workspaceId (see infra/audit.ts) —
    // expected here: this route runs before/without any session or workspace
    // context. actorId is still set when a matching account was found so the
    // event is attributable once a human picks up the request.
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.PRIVACY_REQUEST_CREATED,
      actorId: user?.id,
      entityType: "privacy_request",
      entityId: id,
      payload: { requestType },
      visibility: "internal",
    });

    return Response.json(GENERIC_RESPONSE);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json({ error: "Too many requests. Please wait and try again." }, { status: 429 });
    }
    if (error instanceof ValidationError) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }
    // Never leak internals to a public, unauthenticated caller, and never
    // reveal account existence through a differently-shaped error.
    console.error("[PRIVACY_REQUEST_FAILED]", error instanceof Error ? error.constructor.name : "UnknownError");
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
};
