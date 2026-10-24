/**
 * [db] Revoke / resend race — the trust invariant, not the ordering. If a revoke commits after the resend claim but
 * before the provider send completes, the recipient may still receive the (token-less, plain /signup link) email, but
 * the CURRENT server state decides admission: a revoked request cannot sign up.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/admin/beta-resend-revoke-race.db.test.ts
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const providerMocks = vi.hoisted(() => ({ getEmailProvider: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/integrations/email-provider", () => ({ getEmailProvider: providerMocks.getEmailProvider }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({ set: vi.fn() }) }));

import { resendBetaInvitationEmail } from "@/services/admin/beta-invite-email.service";
import { revokeBetaRequestInvite } from "@/services/admin/admin-operability.service";

const ACTOR_ID = "55555555-5555-4555-8555-555555555555";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] revoke between resend claim and send cannot grant admission", () => {
  let email = "";
  let requestId = "";

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    await db.platformSetting.deleteMany({ where: { id: "global" } });
    await db.platformSetting.create({ data: { id: "global", admissionMode: "INVITE_ONLY", capacityLimit: 50, updatedBy: "seed" } });
    await db.user.upsert({
      where: { id: ACTOR_ID },
      update: {},
      create: { id: ACTOR_ID, email: `race-actor-${ACTOR_ID}@example.com`, updatedAt: new Date() },
    });
    requestId = randomUUID();
    email = `race-${requestId}@example.com`;
    await db.betaRequest.create({ data: { id: requestId, email, status: "INVITED", invitedAt: new Date(), invitedBy: ACTOR_ID } });
    providerMocks.getEmailProvider.mockReturnValue({ send: providerMocks.send });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    const users = await db.user.findMany({ where: { email } });
    for (const u of users as { id: string }[]) {
      const memberships = await db.workspaceMembership.findMany({ where: { userId: u.id } });
      const wsIds = memberships.map((m: { workspaceId: string }) => m.workspaceId);
      await db.userRoleAssignment.deleteMany({ where: { userId: u.id } });
      await db.workspaceMembership.deleteMany({ where: { userId: u.id } });
      await db.auditEvent.deleteMany({ where: { OR: [{ actorId: u.id }, { workspaceId: { in: wsIds.length ? wsIds : [""] } }] } });
      if (wsIds.length) await db.workspace.deleteMany({ where: { id: { in: wsIds } } });
      await db.user.delete({ where: { id: u.id } }).catch(() => undefined);
    }
    await db.auditEvent.deleteMany({ where: { entityId: requestId } }).catch(() => undefined);
    await db.betaRequest.deleteMany({ where: { id: requestId } }).catch(() => undefined);
    await db.platformSetting.deleteMany({ where: { id: "global" } });
    await db.auditEvent.deleteMany({ where: { actorId: ACTOR_ID } }).catch(() => undefined);
    await db.user.delete({ where: { id: ACTOR_ID } }).catch(() => undefined);
  });

  it("REVOKED_INVITE_CANNOT_GRANT_ADMISSION: the stale email is delivered after the revoke, but signup is refused by current state", async () => {
    let statusWhenEmailWasSent: string | null = null;
    providerMocks.send.mockImplementation(async () => {
      // The resend claim has already committed (the provider is only called after it). Now the revoke commits in the
      // window, and only then does the email "complete".
      await revokeBetaRequestInvite({ betaRequestId: requestId, actorId: ACTOR_ID, reason: "race" });
      statusWhenEmailWasSent = (await db.betaRequest.findUnique({ where: { id: requestId } })).status;
      return { accepted: true, id: "msg_race", httpStatus: 200 };
    });

    const result = await resendBetaInvitationEmail({ betaRequestId: requestId, actorId: ACTOR_ID });

    // The race happened: the request was already REVOKED when the email went out, and the email still reports SENT.
    expect(statusWhenEmailWasSent).toBe("REVOKED");
    expect(result.outcome).toBe("SENT");
    // The email carries only a plain signup link (no token) — verify that is all the provider was given.
    const sent = providerMocks.send.mock.calls[0][0];
    expect(sent.html).toMatch(/\/signup"/);
    expect(JSON.stringify(sent)).not.toMatch(/token=|invite=|code=/i);

    // The recipient follows the stale email and attempts signup: current server state rejects admission.
    const { POST } = await import("@/app/api/auth/signup/route");
    const res = await POST(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, workspaceName: "Stale Invite Co" }),
      }) as never
    );
    expect(res.status).toBe(403);
    expect(await db.user.findMany({ where: { email } })).toHaveLength(0);
    expect((await db.betaRequest.findUnique({ where: { id: requestId } })).status).toBe("REVOKED");
  });
});
