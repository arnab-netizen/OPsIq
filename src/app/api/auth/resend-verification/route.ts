import type { NextRequest } from "next/server";
import { parseRequestBody, identityEmailSchema } from "@/lib/validation";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { requirePgRateLimit, RateLimitError, EMAIL_VERIFICATION_RATE_LIMIT } from "@/infra/rate-limit";
import { ValidationError } from "@/infra/errors";
import { z } from "zod/v4";
import { resendVerificationEmailIfEligible } from "@/services/auth/resend-verification.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const resendVerificationSchema = z.object({
  email: identityEmailSchema,
});

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

    await resendVerificationEmailIfEligible(email, { ip, auditEventName: AUDIT_EVENTS.EMAIL_VERIFICATION_RESENT });

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
