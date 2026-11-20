/**
 * Duplicate-email race with a smuggled credential [db].
 *
 * signup-account-graph.db.test.ts already proves the general concurrent
 * double-submit case (two requests, same email, both otherwise valid — one
 * durable account graph). This file covers the edge case specific to email
 * ownership before credential trust: the SAME email is double-submitted
 * concurrently, but one caller also tries to smuggle a password and consent
 * flags into the body (the pre-fix signup accepted both).
 *
 * Signup's schema is { email, workspaceName } only and rejects unknown
 * fields during body validation, strictly before the account-graph
 * transaction / unique-email race even begins — so the smuggling caller must
 * be rejected with a validation error regardless of arrival order relative to
 * the clean caller, must never create a row, and no credential or consent may
 * ever be stored for the account the clean caller created.
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

// Admission precondition pinned for THIS file. The signup route's admission
// gate (mode pre-filter, then the authoritative re-check inside the
// account-graph transaction) reads the process-global `platform_settings`
// row id="global". That row is a singleton shared by every DB test file on
// the same database, and several of them (signup-admission-modes,
// customer-access, beta-resend-revoke-race, capacity-* ...) seed it to
// CLOSED / WAITLIST / INVITE_ONLY or a tiny capacity while running in other
// workers. Reading it here made this file's outcome depend on whichever file
// happened to be mid-test (observed: "expected 403 to be 400" in a parallel
// run). This file is about validation-before-transaction and the
// duplicate-email race, not admission (covered by
// signup-admission-modes.db.test.ts), so the admission state is fixed to
// OPEN_BETA with ample capacity — the only state in which the race under test
// can occur at all. Everything else (validation, the advisory-locked
// reservation, the account-graph transaction, the unique-email constraint)
// runs for real against Postgres. Same partial-mock pattern as
// signup-attribution.test.ts.
vi.mock("@/services/beta/platform-settings.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/beta/platform-settings.service")>()),
  readEffectiveSettings: vi.fn().mockResolvedValue({
    admissionMode: "OPEN_BETA",
    capacityLimit: Number.MAX_SAFE_INTEGER,
    source: "database",
  }),
}));

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] duplicate-email race with only one caller providing valid consent", () => {
  const createdEmails: string[] = [];

  afterEach(async () => {
    if (createdEmails.length === 0) return;
    const users = await db.user.findMany({ where: { email: { in: createdEmails } } });
    const userIds = users.map((u: { id: string }) => u.id);
    if (userIds.length > 0) {
      await db.session.deleteMany({ where: { userId: { in: userIds } } });
      await db.userRoleAssignment.deleteMany({ where: { userId: { in: userIds } } });
      const memberships = await db.workspaceMembership.findMany({ where: { userId: { in: userIds } } });
      const workspaceIds = memberships.map((m: { workspaceId: string }) => m.workspaceId);
      await db.workspaceMembership.deleteMany({ where: { userId: { in: userIds } } });
      await db.auditEvent.deleteMany({
        where: { OR: [{ actorId: { in: userIds } }, { workspaceId: { in: workspaceIds.length > 0 ? workspaceIds : [""] } }] },
      });
      if (workspaceIds.length > 0) await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
    createdEmails.length = 0;
  });

  function signupRequest(body: Record<string, unknown>): Request {
    return new Request("http://localhost/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function signup(body: Record<string, unknown>) {
    const { POST } = await import("@/app/api/auth/signup/route");
    return POST(signupRequest(body) as never);
  }

  it("[db] the clean caller wins and the credential-smuggling caller is rejected at validation, regardless of race outcome", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = `race-consent-${stamp}@example.com`;
    createdEmails.push(email);

    const validBody = { email, workspaceName: "Valid Consent Co" };
    // Tries to plant a password and consents — must be rejected outright, never stored.
    const invalidBody = {
      email,
      password: "password123",
      workspaceName: "Smuggled Credential Co",
      acceptTerms: true,
      acceptPrivacy: true,
      acceptBetaNotice: true,
    };

    const results = await Promise.allSettled([signup(validBody), signup(invalidBody)]);

    // Neither call may throw: every outcome is a classified HTTP response.
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    const [validResult, invalidResult] = results as PromiseFulfilledResult<Response>[];

    // The credential-smuggling caller is ALWAYS rejected at body validation
    // (400) — never 201, and never a 409 from losing the race, because it is
    // refused before the account-graph transaction begins, whichever caller
    // the runtime scheduled first.
    expect(invalidResult.value.status).toBe(400);
    // So the clean caller never has a competitor inside the transaction and
    // always wins with the generic pending response.
    expect(validResult.value.status).toBe(201);

    // Exactly one durable account graph exists for this email, and it was
    // produced by the VALID body.
    const users = await db.user.findMany({ where: { email } });
    expect(users).toHaveLength(1);

    const workspaces = await db.workspace.findMany({ where: { createdBy: users[0].id } });
    expect(workspaces).toHaveLength(1);
    // The workspace name proves which body actually created the graph — the
    // invalid-consent body's data must never have reached persistence.
    expect(workspaces[0].name).toBe("Valid Consent Co");

    // No credential and no consent exist before the mailbox is proven.
    expect(users[0].hashedPassword).toBeNull();
    const acceptances = await db.policyAcceptance.findMany({ where: { userId: users[0].id } });
    expect(acceptances).toHaveLength(0);
  });

  it("[db] a credential-smuggling request never creates a row even when it is the ONLY request (no race needed to prove the base rejection holds)", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = `solo-invalid-consent-${stamp}@example.com`;

    const res = await signup({
      email,
      password: "password123",
      workspaceName: "Solo Invalid Co",
    });
    expect(res.status).toBe(400);

    const users = await db.user.findMany({ where: { email } });
    expect(users).toHaveLength(0);
  });
});
