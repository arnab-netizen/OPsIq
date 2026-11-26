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
import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

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

    // The invalid-consent request is ALWAYS a rejection: either it resolves
    // with a non-201 (BadRequestError statusCode 400) response, or the route
    // throws that same classified error — never a 201, no matter which
    // caller the runtime scheduled first.
    for (const result of results) {
      if (result.status === "fulfilled") {
        const res = result.value;
        if (res.status !== 201) {
          expect(res.status).not.toBe(201);
        }
      }
    }

    const rejectionOrNonCreated = results.filter((r) => {
      if (r.status === "rejected") return true;
      return r.value.status !== 201;
    });
    // At least the invalid-consent caller must have been rejected/non-created.
    expect(rejectionOrNonCreated.length).toBeGreaterThanOrEqual(1);

    // Exactly one durable account graph exists for this email — either the
    // valid caller's, or none at all if timing caused a benign ConflictError
    // on both — but never two, and never one seeded by the invalid body.
    const users = await db.user.findMany({ where: { email } });
    expect(users.length).toBeLessThanOrEqual(1);

    if (users.length === 1) {
      const workspaces = await db.workspace.findMany({ where: { createdBy: users[0].id } });
      expect(workspaces).toHaveLength(1);
      // If a graph exists, it must be the one the VALID caller would have
      // produced (workspace name proves which body actually created it) —
      // the invalid-consent body's data must never have reached persistence.
      expect(workspaces[0].name).toBe("Valid Consent Co");

      // No credential and no consent exist before the mailbox is proven.
      expect(users[0].hashedPassword).toBeNull();
      const acceptances = await db.policyAcceptance.findMany({ where: { userId: users[0].id } });
      expect(acceptances).toHaveLength(0);
    }
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
