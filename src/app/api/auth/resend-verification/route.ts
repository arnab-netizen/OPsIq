import type { NextRequest } from "next/server";
import { randomBytes, createHash, randomUUID } from "crypto";
import { db } from "@/lib/db";
import { parseRequestBody, identityEmailSchema } from "@/lib/validation";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { requirePgRateLimit, RateLimitError, EMAIL_VERIFICATION_RATE_LIMIT } from "@/infra/rate-limit";
import { getEmailProvider } from "@/lib/integrations/email-provider";
import { getConfig } from "@/lib/config";
import { ValidationError } from "@/infra/errors";
import { z } from "zod/v4";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const resendVerificationSchema = z.object({
  email: identityEmailSchema,
});

/** Same 7-day window as the token issued at signup — a resend is not a shorter-lived grant. */
const EMAIL_VERIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The exact response returned whether or not the email corresponds to a real
 * account still awaiting verification. Never branch this string on lookup
 * outcome — mirrors forgot-password's GENERIC_RESPONSE / enumeration-resistance
 * rationale exactly.
 */
const GENERIC_RESPONSE = {
  success: true,
  message: "If an account is awaiting verification for that email, we've sent a new link.",
};

export const POST = async (request: NextRequest) => {
  try {
    const { email } = await parseRequestBody(request, resendVerificationSchema);

    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    await requirePgRateLimit(`verify-email-resend:${ip}`, EMAIL_VERIFICATION_RATE_LIMIT);
    await requirePgRateLimit(`verify-email-resend:${email}`, EMAIL_VERIFICATION_RATE_LIMIT);

    const user = await db.user.findUnique({ where: { email } });

    // Only an account that actually requires verification and has not yet
    // verified gets a new token + email. Every other case (no account,
    // already verified, or an account that never required verification)
    // silently no-ops and falls through to the same generic response.
    if (user && user.isActive && user.requiresEmailVerification && !user.emailVerifiedAt) {
      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");

      await db.emailVerificationToken.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
          ipAddress: ip !== "unknown" ? ip : null,
        },
      });

      const membership = await db.workspaceMembership.findFirst({
        where: { userId: user.id, isActive: true },
        orderBy: { addedAt: "asc" },
        select: { workspaceId: true },
      });

      await emitAuditEvent({
        eventName: AUDIT_EVENTS.EMAIL_VERIFICATION_RESENT,
        actorId: user.id,
        workspaceId: membership?.workspaceId,
        entityType: "user",
        entityId: user.id,
        visibility: "internal",
      });

      try {
        const provider = getEmailProvider();
        if (provider) {
          const verifyUrl = `${getConfig().NEXT_PUBLIC_APP_URL}/verify-email?token=${rawToken}`;
          await provider.send({
            to: user.email,
            subject: "Verify your OpsIQ account",
            html: `<p><a href="${verifyUrl}">Verify your email to activate your account</a></p><p>This link expires in 7 days. If you didn't request this, you can safely ignore this email.</p>`,
            text: `Verify your OpsIQ account: ${verifyUrl}\n\nThis link expires in 7 days. If you didn't request this, you can safely ignore this email.`,
          });
        } else {
          console.warn("[RESEND_VERIFICATION] No email provider configured — token created but not emailed", { userId: user.id });
        }
      } catch (emailError) {
        console.error("[RESEND_VERIFICATION] Email dispatch failed", { userId: user.id, errorType: emailError instanceof Error ? emailError.constructor.name : "UnknownError" });
      }
    }

    return Response.json(GENERIC_RESPONSE);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json({ error: "Too many verification requests. Please wait and try again." }, { status: 429 });
    }
    if (error instanceof ValidationError) {
      return Response.json({ error: "Invalid email address" }, { status: 400 });
    }
    console.error("[RESEND_VERIFICATION_FAILED]", error instanceof Error ? error.constructor.name : "UnknownError");
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
};
