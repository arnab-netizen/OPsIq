import { z } from "zod";
import { AppError } from "@/infra/errors";

/**
 * Governed mapping of a thrown value to the public, enumeration-safe body of an
 * unauthenticated auth route (signup). Raw `Error` text (Prisma, stack, hostnames)
 * is never returned or logged from here; only validation-issue text and AppError
 * subclasses (safe-by-design messages, see infra/errors.ts) are exposed.
 */

export const PUBLIC_AUTH_GENERIC_FAILURE =
  "We couldn't create your account right now. Please try again.";

export interface PublicAuthError {
  status: number;
  body: { success: false; error: string };
}

/** Returns a public response for validation / AppError failures, or null for anything else. */
export function toPublicAuthError(thrown: unknown): PublicAuthError | null {
  if (thrown instanceof z.ZodError) {
    const detail = thrown.issues.map((issue) => issue.message).join(", ");
    return { status: 400, body: { success: false, error: `Validation error: ${detail}` } };
  }
  if (thrown instanceof AppError) {
    const publicText = String(thrown.message);
    return { status: thrown.statusCode, body: { success: false, error: publicText } };
  }
  return null;
}

/**
 * Operator-safe summary for server logs and the diagnostic-key-gated response.
 * Carries the safe public text when one exists, otherwise a fixed generic string;
 * never the raw internal error text.
 */
export function describeAuthFailureForOperator(thrown: unknown): string {
  const publicError = toPublicAuthError(thrown);
  return publicError ? publicError.body.error : "internal error (see error name and code)";
}
