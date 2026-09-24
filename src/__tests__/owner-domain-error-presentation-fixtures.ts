/**
 * Shared fixtures for the Strategy/Recovery/Marketing/Cashflow page-level
 * owner-safe-error regression suites (see the sibling
 * `<domain>-page-owner-safe-errors.test.tsx` files). Kept to the handful of
 * primitives that are genuinely identical across all four pages: constants,
 * a `Response`-shaped JSON builder, and the leak-scanning assertion. Each
 * domain's dashboard/cycle shape differs enough (see
 * src/lib/owner-domain-error-presentation.ts's own header comment on the
 * Recovery-vs-others message divergence) that per-page fixtures are built
 * directly in each test file rather than forced through one shared factory.
 */
export const LEAKY_UUID = "123e4567-e89b-12d3-a456-426614174000";

export function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

/** Every string that must never appear anywhere in a rendered owner-safe error banner. */
export function assertNoLeak(text: string, extra: RegExp[] = []) {
  const FORBIDDEN: RegExp[] = [
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, // any UUID
    /not found:/i,
    /prisma/i,
    /invocation/i,
    /stack trace/i,
    /completionNotes|completionEvidence|actualOutcome/i,
    /TypeError/i,
    ...extra,
  ];
  for (const pattern of FORBIDDEN) {
    expect(text).not.toMatch(pattern);
  }
}
