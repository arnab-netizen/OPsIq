import type { NextRequest } from "next/server";
import { randomBytes, createHash } from "crypto";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { parseRequestBody, identityEmailSchema } from "@/lib/validation";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { requirePgRateLimit, RateLimitError, PASSWORD_RESET_RATE_LIMIT } from "@/infra/rate-limit";
import { getEmailProvider } from "@/lib/integrations/email-provider";
import { getConfig } from "@/lib/config";
import { ValidationError } from "@/infra/errors";
import { recordPasswordEmailNotSent, verificationBaseUrlProblem } from "@/services/auth/verification-email-signal";
import { isAwaitingEmailOwnership } from "@/services/auth/email-ownership.service";
import { z } from "zod/v4";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const forgotPasswordSchema = z.object({
  email: identityEmailSchema,
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
    await requirePgRateLimit(`password-reset:${ip}`, PASSWORD_RESET_RATE_LIMIT);
    await requirePgRateLimit(`password-reset:${email}`, PASSWORD_RESET_RATE_LIMIT);

    const user = await db.user.findUnique({ where: { email } });

    // Only a real, active account whose MAILBOX IS PROVEN gets a token + email:
    //  - a password-holding account -> an ordinary reset link;
    //  - a verified account that has no password yet (the owner proved the mailbox but lost the one-time setup link)
    //    -> a first-time password-setup link (the page is told with &setup=1; the server still decides from the
    //    account's real state and demands the policy consents).
    // An account still awaiting email verification never gets one (verification, not recovery, is its path), and
    // every other case (no account, deactivated, passwordless/unverified) silently no-ops and falls through to the
    // same generic response — this is the enumeration-resistance guarantee, mirrored from login's
    // identical-message pattern for "user not found" vs "wrong password".
    // Scoped to the open-beta signup population (requiresEmailVerification): other passwordless accounts
    // (e.g. admin-provisioned users) have no setup journey here and keep the silent no-op.
    const needsFirstSetup = !!user && !user.hashedPassword && user.requiresEmailVerification && !!user.emailVerifiedAt;
    if (user && user.isActive && !isAwaitingEmailOwnership(user) && (user.hashedPassword || needsFirstSetup)) {
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
      const kind = needsFirstSetup ? "SETUP" : "RESET";
      try {
        const provider = getEmailProvider();
        if (provider) {
          if (verificationBaseUrlProblem(getConfig().NEXT_PUBLIC_APP_URL)) {
            await recordPasswordEmailNotSent({ reason: `${kind}_BASE_URL_NOT_PUBLIC`, userId: user.id, workspaceId: membership?.workspaceId });
          }
          const resetUrl = `${getConfig().NEXT_PUBLIC_APP_URL}/reset-password?token=${rawToken}${needsFirstSetup ? "&setup=1" : ""}`;
          await provider.send({
            to: user.email,
            subject: needsFirstSetup ? "Choose your OpsIQ password" : "Reset your OpsIQ password",
            html: `<p>${needsFirstSetup ? "Someone asked for a link to choose the password for this OpsIQ account." : "Someone requested a password reset for this OpsIQ account."}</p><p><a href="${resetUrl}">${needsFirstSetup ? "Choose your password" : "Reset your password"}</a></p><p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>`,
            text: `${needsFirstSetup ? "Choose your OpsIQ password" : "Reset your OpsIQ password"}: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email.`,
          });
        } else {
          console.warn("[FORGOT_PASSWORD] No email provider configured — reset token created but not emailed", { userId: user.id });
          await recordPasswordEmailNotSent({ reason: `${kind}_NO_PROVIDER`, userId: user.id, workspaceId: membership?.workspaceId });
        }
      } catch (emailError) {
        await recordPasswordEmailNotSent({ reason: `${kind}_SEND_FAILED`, userId: user.id, workspaceId: membership?.workspaceId });
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
