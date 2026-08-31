import type { NextRequest } from "next/server";
import { randomBytes, createHash } from "crypto";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { parseRequestBody } from "@/lib/validation";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { requireRateLimit, RateLimitError, PASSWORD_RESET_RATE_LIMIT } from "@/infra/rate-limit";
import { getEmailProvider } from "@/lib/integrations/email-provider";
import { getConfig } from "@/lib/config";
import { ValidationError } from "@/infra/errors";
import { z } from "zod/v4";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const forgotPasswordSchema = z.object({
  email: z.email(),
});

/** One hour — long enough for a real user to act on the email, short enough to bound the exposure window. */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * The exact response returned whether or not the email corresponds to a real, active,
 * password-based account. Never branch this string on lookup outcome — that branch is
 * the entire enumeration-resistance guarantee this endpoint makes.
 */
const GENERIC_RESPONSE = {
  success: true,
  message: "If an account exists for that email, we've sent a password reset link.",
};

export const POST = async (request: NextRequest) => {
  try {
    const { email } = await parseRequestBody(request, forgotPasswordSchema);

    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    requireRateLimit(`password-reset:${ip}`, PASSWORD_RESET_RATE_LIMIT);
    requireRateLimit(`password-reset:${email}`, PASSWORD_RESET_RATE_LIMIT);

    const user = await db.user.findUnique({ where: { email } });

    // Only a real, active, password-based account gets a token + email. Every other
    // case (no account, deactivated, or a passwordless/SSO-only account) silently
    // no-ops below and falls through to the same generic response — this is the
    // enumeration-resistance guarantee, mirrored from login's identical-message
    // pattern for "user not found" vs "wrong password".
    if (user && user.isActive && user.hashedPassword) {
      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");

      await db.passwordResetToken.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
          ipAddress: ip !== "unknown" ? ip : null,
        },
      });

      // emitAuditEvent silently no-ops without a workspaceId (fail-safe — see
      // infra/audit.ts), so a real scope must be resolved first, exactly as
      // login.ts does for its own post-auth audit events.
      const membership = await db.workspaceMembership.findFirst({
        where: { userId: user.id, isActive: true },
        orderBy: { addedAt: "asc" },
        select: { workspaceId: true },
      });

      await emitAuditEvent({
        eventName: AUDIT_EVENTS.PASSWORD_RESET_REQUESTED,
        actorId: user.id,
        workspaceId: membership?.workspaceId,
        entityType: "user",
        entityId: user.id,
        visibility: "internal",
      });

      // Best-effort delivery: the token is already durably stored above, so a
      // transient Resend failure (or no provider configured at all) must never
      // turn into a client-visible error — that would itself be an enumeration
      // signal (a real account's request failing differently from a fake one's).
      try {
        const provider = getEmailProvider();
        if (provider) {
          const resetUrl = `${getConfig().NEXT_PUBLIC_APP_URL}/reset-password?token=${rawToken}`;
          await provider.send({
            to: user.email,
            subject: "Reset your OpsIQ password",
            html: `<p>Someone requested a password reset for this OpsIQ account.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>`,
            text: `Reset your OpsIQ password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email.`,
          });
        } else {
          console.warn("[FORGOT_PASSWORD] No email provider configured — reset token created but not emailed", { userId: user.id });
        }
      } catch (emailError) {
        console.error("[FORGOT_PASSWORD] Email dispatch failed", { userId: user.id, errorType: emailError instanceof Error ? emailError.constructor.name : "UnknownError" });
      }
    }

    return Response.json(GENERIC_RESPONSE);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json({ error: "Too many password reset requests. Please wait and try again." }, { status: 429 });
    }
    if (error instanceof ValidationError) {
      return Response.json({ error: "Invalid email address" }, { status: 400 });
    }
    // Any error class thrown by parseRequestBody (ValidationError) or an
    // unexpected failure: still never reveal account existence, and never leak
    // internals to a public, unauthenticated caller.
    console.error("[FORGOT_PASSWORD_FAILED]", error instanceof Error ? error.constructor.name : "UnknownError");
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
};
