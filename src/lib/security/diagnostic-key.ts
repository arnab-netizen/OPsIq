/**
 * DIAGNOSTIC KEY VALIDATION
 *
 * Timing-safe validation of OPSIQ_DIAGNOSTIC_KEY.
 * Prevents timing-attack brute-force of diagnostic endpoints.
 *
 * Usage:
 *   const isValid = verifyDiagnosticKey(providedKey);
 *   if (!isValid) return NextResponse.json({ error: "Unauthorized" }, { status: 404 });
 */

import { timingSafeEqual } from "crypto";

/**
 * Verify diagnostic key using timing-safe comparison.
 *
 * Rules:
 * - Returns false if expected key is not configured in environment
 * - Returns false if provided key is missing/empty
 * - Uses timing-safe comparison to prevent brute-force attacks
 * - Handles different lengths safely without timing leakage
 *
 * @param providedKey - Key from request header or query param
 * @returns true if key matches expected, false otherwise
 */
export function verifyDiagnosticKey(providedKey: string | null | undefined): boolean {
  const expectedKey = process.env.OPSIQ_DIAGNOSTIC_KEY;

  // Fail closed: if key not configured or not provided, reject
  if (!expectedKey || !providedKey) {
    return false;
  }

  // Trim provided key (allow whitespace in submission, but not in key itself)
  const trimmedProvidedKey = providedKey.trim();
  if (!trimmedProvidedKey) {
    return false;
  }

  // Handle length mismatch safely without timing leak:
  // timingSafeEqual requires equal-length buffers, so we:
  // 1. Convert both to buffers (same encoding)
  // 2. If lengths differ, use a fixed-length comparison with padded buffer
  try {
    const expectedBuffer = Buffer.from(expectedKey);
    const providedBuffer = Buffer.from(trimmedProvidedKey);

    // If lengths differ, pad the shorter one with zeros to prevent timing leak
    if (expectedBuffer.length !== providedBuffer.length) {
      const maxLength = Math.max(expectedBuffer.length, providedBuffer.length);
      const paddedExpected = Buffer.alloc(maxLength);
      const paddedProvided = Buffer.alloc(maxLength);

      expectedBuffer.copy(paddedExpected);
      providedBuffer.copy(paddedProvided);

      // Perform timing-safe comparison on padded buffers
      // This will return false (buffers won't be equal), but timing is consistent
      try {
        timingSafeEqual(paddedExpected, paddedProvided);
        return false; // If we got here, buffers were equal (shouldn't happen with different lengths)
      } catch {
        return false; // Buffers not equal (expected for different lengths)
      }
    }

    // Same length: use standard timing-safe comparison and HONOR its result.
    // timingSafeEqual returns true only when the buffers are byte-equal; it does
    // not throw for equal-length inputs. (Previously this branch ignored the
    // return value and always returned true, accepting any same-length key.)
    return timingSafeEqual(expectedBuffer, providedBuffer);
  } catch {
    // If buffer operations fail, fail closed
    return false;
  }
}

/**
 * Verify diagnostic key from NextRequest.
 * Accepts key from x-opsiq-diagnostic-key header only — query param is excluded
 * to prevent key leakage in server logs and browser history.
 *
 * @param request - NextRequest object
 * @returns true if key is valid, false otherwise
 */
export function verifyDiagnosticKeyFromRequest(request: {
  headers: { get(name: string): string | null };
}): boolean {
  const headerValue = request.headers.get("x-opsiq-diagnostic-key");
  return verifyDiagnosticKey(headerValue);
}

/**
 * True only outside a production Vercel deployment (development or test).
 *
 * Open-beta hardening audit (2026-09): several `/api/internal/*` diagnostic
 * routes MUTATE the database (create/relink demo engagements, grant
 * UserRoleAssignment rows) and were gated ONLY by OPSIQ_DIAGNOSTIC_KEY, a
 * single secret shared across a dozen endpoints, with no environment
 * restriction — unlike /api/internal/smoke-cleanup, which already
 * double-gates on both this environment check AND the diagnostic key. Every
 * DB-mutating diagnostic route now uses this same shared check so a
 * diagnostic-key leak alone can never grant a production database write or a
 * production role assignment; only a genuinely non-production deployment
 * (Vercel preview/dev, or a local/test run) can reach the mutating branch at
 * all, and the key is still required on top of that.
 */
export function isNonProductionEnvironment(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  const env = process.env.NODE_ENV;
  return env === "development" || env === "test";
}
