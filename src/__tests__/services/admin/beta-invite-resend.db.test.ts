/**
 * [db] Beta invitation email resend — the invite STATE and the invitation EMAIL are separate. Real Postgres, mocked
 * provider. Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/admin/beta-invite-resend.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const providerMocks = vi.hoisted(() => ({ getEmailProvider: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/integrations/email-provider", () => ({ getEmailProvider: providerMocks.getEmailProvider }));

import { markBetaRequestInvited } from "@/services/admin/admin-operability.service";
import { resendBetaInvitationEmail, RESEND_MAX_PER_HOUR } from "@/services/admin/beta-invite-email.service";

const ACTOR_ID = "44444444-4444-4444-8444-444444444444";

async function seed(overrides: Partial<Record<string, unknown>> = {}): Promise<{ id: string; email: string; invitedAt: Date | null }> {
  const id = randomUUID();
  const email = `resend-${id}@example.com`;
  const row = await db.betaRequest.create({ data: { id, email, status: "REQUESTED", ...overrides } });
  return { id, email, invitedAt: row.invitedAt };
}

async function eventNames(id: string): Promise<string[]> {
  const rows = await db.auditEvent.findMany({ where: { entityId: id }, orderBy: { occurredAt: "asc" } });
  return rows.map((r: { eventName: string }) => r.eventName);
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] beta invitation email — resend", () => {
  const seeded: string[] = [];

  beforeAll(async () => {
    await db.user.upsert({
      where: { id: ACTOR_ID },
      update: {},
      create: { id: ACTOR_ID, email: `resend-actor-${ACTOR_ID}@example.com`, updatedAt: new Date() },
    });
  });
  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId: ACTOR_ID } }).catch(() => undefined);
    await db.user.delete({ where: { id: ACTOR_ID } }).catch(() => undefined);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    providerMocks.getEmailProvider.mockReturnValue({ send: providerMocks.send });
    providerMocks.send.mockResolvedValue({ accepted: true, id: "msg_abc", httpStatus: 200 });
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    if (seeded.length) {
      await db.auditEvent.deleteMany({ where: { entityId: { in: seeded } } }).catch(() => undefined);
      await db.betaRequest.deleteMany({ where: { id: { in: seeded } } }).catch(() => undefined);
      seeded.length = 0;
    }
  });

  it("A/I: REQUESTED -> Invite sends once, returns an explicit outcome, records acceptance (not delivery) and keeps the message id internally", async () => {
    const { id } = await seed();
    seeded.push(id);
    const result = await markBetaRequestInvited({ betaRequestId: id, actorId: ACTOR_ID });
    expect(result.status).toBe("INVITED");
    expect(result.emailDelivery).toBe("SENT");
    expect(providerMocks.send).toHaveBeenCalledTimes(1);
    expect(await eventNames(id)).toEqual([
      "beta_request.marked_invited",
      "beta_request.invite_email_attempted",
      "beta_request.invite_email_accepted_by_provider",
    ]);
    const accepted = await db.auditEvent.findFirst({ where: { entityId: id, eventName: "beta_request.invite_email_accepted_by_provider" } });
    expect(accepted.payload.providerMessageId).toBe("msg_abc");
  });

  it("B: a failed first send leaves the request INVITED with outcome FAILED, and Resend works immediately", async () => {
    const { id } = await seed();
    seeded.push(id);
    providerMocks.send.mockRejectedValueOnce(Object.assign(new Error("Resend API error 403: nope"), { status: 403 }));
    const first = await markBetaRequestInvited({ betaRequestId: id, actorId: ACTOR_ID });
    expect(first.status).toBe("INVITED");
    expect(first.emailDelivery).toBe("FAILED");
    expect(first.emailDeliveryReason).toMatch(/HTTP 403/);

    const resend = await resendBetaInvitationEmail({ betaRequestId: id, actorId: ACTOR_ID });
    expect(resend.outcome).toBe("SENT");
    expect(providerMocks.send).toHaveBeenCalledTimes(2);
  });

  it("C: resend on an active INVITED request sends once and does not mutate status, invitedAt, invitedBy or create requests", async () => {
    const invitedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const { id } = await seed({ status: "INVITED", invitedAt, invitedBy: ACTOR_ID });
    seeded.push(id);
    const before = await db.betaRequest.count();

    const result = await resendBetaInvitationEmail({ betaRequestId: id, actorId: ACTOR_ID });

    expect(result.outcome).toBe("SENT");
    expect(result.status).toBe("INVITED");
    expect(providerMocks.send).toHaveBeenCalledTimes(1);
    const after = await db.betaRequest.findUnique({ where: { id } });
    expect(after.status).toBe("INVITED");
    expect(after.invitedAt.toISOString()).toBe(invitedAt.toISOString());
    expect(after.invitedBy).toBe(ACTOR_ID);
    expect(await db.betaRequest.count()).toBe(before);
    expect(await eventNames(id)).toEqual([
      "beta_request.invite_email_attempted",
      "beta_request.invite_email_accepted_by_provider",
      "beta_request.invite_email_resent",
    ]);
  });

  it("D: the state-changing Invite on an active INVITED request is NOT_ATTEMPTED with a reason, sends nothing and writes no email audit events", async () => {
    const { id } = await seed({ status: "INVITED", invitedAt: new Date(), invitedBy: ACTOR_ID });
    seeded.push(id);
    const result = await markBetaRequestInvited({ betaRequestId: id, actorId: ACTOR_ID });
    expect(result.emailDelivery).toBe("NOT_ATTEMPTED");
    expect(result.emailDeliveryReason).toMatch(/Resend invitation email/);
    expect(providerMocks.send).not.toHaveBeenCalled();
    expect(await eventNames(id)).toEqual([]);
  });

  it("E: concurrent resends send exactly one email", async () => {
    const { id } = await seed({ status: "INVITED", invitedAt: new Date(), invitedBy: ACTOR_ID });
    seeded.push(id);
    const [a, b, c] = await Promise.all([
      resendBetaInvitationEmail({ betaRequestId: id, actorId: ACTOR_ID }),
      resendBetaInvitationEmail({ betaRequestId: id, actorId: ACTOR_ID }),
      resendBetaInvitationEmail({ betaRequestId: id, actorId: ACTOR_ID }),
    ]);
    expect(providerMocks.send).toHaveBeenCalledTimes(1);
    expect([a, b, c].filter((r) => r.outcome === "SENT")).toHaveLength(1);
    const refused = [a, b, c].filter((r) => r.outcome === "NOT_ATTEMPTED");
    expect(refused).toHaveLength(2);
    expect(refused[0].reason).toMatch(/wait \d+ seconds/);
  });

  it("F: a second resend inside the cooldown is refused; after the cooldown it works; the hourly cap bounds repeated resends", async () => {
    const { id } = await seed({ status: "INVITED", invitedAt: new Date(), invitedBy: ACTOR_ID });
    seeded.push(id);
    expect((await resendBetaInvitationEmail({ betaRequestId: id, actorId: ACTOR_ID })).outcome).toBe("SENT");
    const cooled = await resendBetaInvitationEmail({ betaRequestId: id, actorId: ACTOR_ID });
    expect(cooled.outcome).toBe("NOT_ATTEMPTED");

    // Move the attempts out of the cooldown window (test database only) and fill the hourly allowance.
    const backdate = async () =>
      db.$executeRaw`UPDATE audit_events SET occurred_at = occurred_at - interval '2 minutes' WHERE entity_id = ${id}`;
    for (let i = 1; i < RESEND_MAX_PER_HOUR; i++) {
      await backdate();
      expect((await resendBetaInvitationEmail({ betaRequestId: id, actorId: ACTOR_ID })).outcome).toBe("SENT");
    }
    await backdate();
    const capped = await resendBetaInvitationEmail({ betaRequestId: id, actorId: ACTOR_ID });
    expect(capped.outcome).toBe("NOT_ATTEMPTED");
    expect(capped.reason).toMatch(/hourly limit/);
    expect(providerMocks.send).toHaveBeenCalledTimes(RESEND_MAX_PER_HOUR);
  });

  it("G: NO_PROVIDER is explicit and audited", async () => {
    providerMocks.getEmailProvider.mockReturnValue(null);
    const { id } = await seed({ status: "INVITED", invitedAt: new Date(), invitedBy: ACTOR_ID });
    seeded.push(id);
    const result = await resendBetaInvitationEmail({ betaRequestId: id, actorId: ACTOR_ID });
    expect(result.outcome).toBe("NO_PROVIDER");
    expect(await eventNames(id)).toContain("beta_request.invite_email_no_provider");
    expect(await eventNames(id)).not.toContain("beta_request.invite_email_resent");
  });

  it("H: a provider rejection is FAILED with a safe reason; no 'accepted' or 'resent' audit event; state untouched", async () => {
    const { id } = await seed({ status: "INVITED", invitedAt: new Date(), invitedBy: ACTOR_ID });
    seeded.push(id);
    providerMocks.send.mockRejectedValueOnce(Object.assign(new Error("Resend API error 403: domain not verified"), { status: 403 }));
    const result = await resendBetaInvitationEmail({ betaRequestId: id, actorId: ACTOR_ID });
    expect(result.outcome).toBe("FAILED");
    expect(result.reason).toMatch(/HTTP 403/);
    expect(result.reason).not.toMatch(/domain not verified/);
    const names = await eventNames(id);
    expect(names).toContain("beta_request.invite_email_failed");
    expect(names).not.toContain("beta_request.invite_email_accepted_by_provider");
    expect(names).not.toContain("beta_request.invite_email_resent");
    expect((await db.betaRequest.findUnique({ where: { id } })).status).toBe("INVITED");
  });

  it("refuses with a reason, without sending, when the request is not INVITED or the invitation has expired; unknown id is NotFound", async () => {
    const revoked = await seed({ status: "REVOKED" });
    const expired = await seed({ status: "INVITED", invitedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000), invitedBy: ACTOR_ID });
    seeded.push(revoked.id, expired.id);
    const r1 = await resendBetaInvitationEmail({ betaRequestId: revoked.id, actorId: ACTOR_ID });
    expect(r1.outcome).toBe("NOT_ATTEMPTED");
    expect(r1.reason).toMatch(/not INVITED/);
    const r2 = await resendBetaInvitationEmail({ betaRequestId: expired.id, actorId: ACTOR_ID });
    expect(r2.outcome).toBe("NOT_ATTEMPTED");
    expect(r2.reason).toMatch(/expired/);
    expect(providerMocks.send).not.toHaveBeenCalled();
    await expect(resendBetaInvitationEmail({ betaRequestId: randomUUID(), actorId: ACTOR_ID })).rejects.toThrow();
  });
});
