/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows */
/**
 * [db] OPERATOR_VISIBILITY and the setup/reset rate-limit buckets, against the real route handlers.
 *  - signup -> explicit verify -> password setup: the funnel shows signed up, verified, "Chose a password" (emitted once,
 *    workspace-scoped, no payload) and the "verified, no password" count goes 1 -> 0 at setup.
 *  - a forgot-password email that cannot be sent records the enum-only signal and the funnel failure count rises.
 *  - first-time setup requests use their own 30/hour bucket; a plain reset keeps 5/hour; neither starves the other.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { deletePgRateLimitBucket } from "@/infra/rate-limiter-pg";
import { getJourneyFunnel } from "@/services/admin/journey-funnel.service";
import { countVerifiedWithoutPassword } from "@/services/admin/limbo-accounts.service";

const hoisted = vi.hoisted(() => ({
  sent: [] as Array<{ to: string | string[]; text?: string }>,
  failSend: { value: false },
}));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({ set: vi.fn() }) }));
vi.mock("@/lib/integrations/email-provider", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/integrations/email-provider")>();
  return {
    ...original,
    getEmailProvider: () => ({
      send: async (message: { to: string | string[]; text?: string }) => {
        if (hoisted.failSend.value) throw new Error("provider down");
        hoisted.sent.push(message);
        return { accepted: true, id: "captured" };
      },
    }),
  };
});

let seq = 0;
const freshIp = () => { seq += 1; return `10.31.${Math.floor(seq / 250) % 250}.${(seq % 250) + 1}`; };
function post(url: string, body: Record<string, unknown>, ip: string = freshIp()): Request {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
}
const CONSENTS = { acceptTerms: true, acceptPrivacy: true, acceptBetaNotice: true };

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] operator visibility of the verified-but-no-password drop-off", () => {
  const emails: string[] = [];
  const buckets: string[] = [];
  const newEmail = () => { const e = `opvis-${randomUUID()}@example.com`; emails.push(e); return e; };
  const token = (email: string, path: string) => {
    const hits = hoisted.sent.filter((m) => String(m.to) === email).map((m) => new RegExp(`/${path}\\?token=([a-f0-9]+)`).exec(m.text ?? "")).filter(Boolean) as RegExpExecArray[];
    expect(hits.length).toBeGreaterThan(0);
    return hits[hits.length - 1][1];
  };

  beforeEach(async () => {
    hoisted.sent.length = 0;
    hoisted.failSend.value = false;
    await db.platformSetting.deleteMany({ where: { id: "global" } });
    const { countCapacityUsage } = await import("@/services/beta/platform-settings.service");
    const base = await countCapacityUsage();
    await db.platformSetting.create({ data: { id: "global", admissionMode: "OPEN_BETA", capacityLimit: base.consumed + 20, updatedBy: "test-seed" } });
  });

  afterEach(async () => {
    await db.platformSetting.deleteMany({ where: { id: "global" } });
    const users = await db.user.findMany({ where: { email: { in: emails } } });
    const userIds = users.map((u: { id: string }) => u.id);
    if (userIds.length > 0) {
      await db.session.deleteMany({ where: { userId: { in: userIds } } });
      await db.userRoleAssignment.deleteMany({ where: { userId: { in: userIds } } });
      const memberships = await db.workspaceMembership.findMany({ where: { userId: { in: userIds } } });
      const workspaceIds = memberships.map((m: { workspaceId: string }) => m.workspaceId);
      await db.workspaceMembership.deleteMany({ where: { userId: { in: userIds } } });
      await db.auditEvent.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { workspaceId: { in: workspaceIds.length > 0 ? workspaceIds : [randomUUID()] } }] } });
      if (workspaceIds.length > 0) await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
    for (const b of buckets) await deletePgRateLimitBucket(b);
    emails.length = 0;
    buckets.length = 0;
  });

  it("[db] OPERATOR_VISIBILITY: signup -> verify -> password setup moves the funnel and the limbo count 1 -> 0; password_set is emitted once, no PII", async () => {
    const stepCount = (f: Awaited<ReturnType<typeof getJourneyFunnel>>, key: string) => f.steps.find((s) => s.key === key)!.count;
    const before = await getJourneyFunnel(7);
    const limboBefore = await countVerifiedWithoutPassword();

    const email = newEmail();
    const { POST: signup } = await import("@/app/api/auth/signup/route");
    expect((await signup(post("http://localhost/api/auth/signup", { email, workspaceName: "Visible Co" }) as never)).status).toBe(201);
    const { POST: verify } = await import("@/app/api/auth/verify-email/route");
    const redeem = await verify(post("http://localhost/api/auth/verify-email", { token: token(email, "verify-email") }) as never);
    expect(redeem.status).toBe(200);
    const { setupToken } = await redeem.json();

    // verified, no password yet: visible as limbo, and "Chose a password" has not moved
    expect(await countVerifiedWithoutPassword()).toBe(limboBefore + 1);
    const mid = await getJourneyFunnel(7);
    expect(stepCount(mid, "signup_completed")).toBe(stepCount(before, "signup_completed") + 1);
    expect(stepCount(mid, "email_verified")).toBe(stepCount(before, "email_verified") + 1);
    expect(stepCount(mid, "password_set")).toBe(stepCount(before, "password_set"));

    const { POST: reset } = await import("@/app/api/auth/reset-password/route");
    const done = await reset(post("http://localhost/api/auth/reset-password", { token: setupToken, password: "Chosen-Password-1", ...CONSENTS }) as never);
    expect(done.status).toBe(200);
    // a replay does not emit a second event
    expect((await reset(post("http://localhost/api/auth/reset-password", { token: setupToken, password: "Chosen-Password-2", ...CONSENTS }) as never)).status).toBe(400);

    expect(await countVerifiedWithoutPassword()).toBe(limboBefore);
    const after = await getJourneyFunnel(7);
    expect(stepCount(after, "password_set")).toBe(stepCount(before, "password_set") + 1);
    const user: any = await db.user.findUnique({ where: { email } });
    const events = await db.auditEvent.findMany({ where: { actorId: user.id, eventName: "product.password_set" } });
    expect(events).toHaveLength(1);
    expect((events[0] as any).workspaceId).toBeTruthy();
    expect(JSON.stringify((events[0] as any).payload ?? {})).not.toMatch(/@|token|password/i);
    // an ordinary reset of an account that already has a password is not "chose a password" again
    const { POST: forgot } = await import("@/app/api/auth/forgot-password/route");
    expect((await forgot(post("http://localhost/api/auth/forgot-password", { email }) as never)).status).toBe(200);
    expect((await reset(post("http://localhost/api/auth/reset-password", { token: token(email, "reset-password"), password: "Another-Password-3" }) as never)).status).toBe(200);
    expect(await db.auditEvent.count({ where: { actorId: user.id, eventName: "product.password_set" } })).toBe(1);
  });

  it("[db] OPERATOR_VISIBILITY: a forgot-password setup/reset email that cannot be sent is recorded (enum reason, no address) and counted", async () => {
    const email = newEmail();
    const { POST: signup } = await import("@/app/api/auth/signup/route");
    await signup(post("http://localhost/api/auth/signup", { email, workspaceName: "Mail Co" }) as never);
    const { POST: verify } = await import("@/app/api/auth/verify-email/route");
    expect((await verify(post("http://localhost/api/auth/verify-email", { token: token(email, "verify-email") }) as never)).status).toBe(200);
    const failuresBefore = (await getJourneyFunnel(7)).failures.find((f) => f.key === "password_email_not_sent")!.count;

    hoisted.failSend.value = true;
    const { POST: forgot } = await import("@/app/api/auth/forgot-password/route");
    const res = await forgot(post("http://localhost/api/auth/forgot-password", { email }) as never);
    expect(res.status).toBe(200); // generic response unchanged (no enumeration oracle)
    const user: any = await db.user.findUnique({ where: { email } });
    const rows: any[] = await db.auditEvent.findMany({ where: { actorId: user.id, eventName: "user.password_email_not_sent" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toEqual({ reason: "SETUP_SEND_FAILED" });
    expect(JSON.stringify(rows[0].payload)).not.toContain(email);
    expect((await getJourneyFunnel(7)).failures.find((f) => f.key === "password_email_not_sent")!.count).toBe(failuresBefore + 1);
  });

  it("[db] first-time setup requests have their own 30/hour bucket; a plain reset keeps 5/hour; neither starves the other", async () => {
    const ip = freshIp();
    buckets.push(`password-setup-redeem:${ip}`, `password-reset-redeem:${ip}`);
    const { POST: reset } = await import("@/app/api/auth/reset-password/route");
    const setupShaped = () => reset(post("http://localhost/api/auth/reset-password", { token: "x".repeat(40), password: "Some-Password-1", ...CONSENTS }, ip) as never);
    const plain = () => reset(post("http://localhost/api/auth/reset-password", { token: "y".repeat(40), password: "Some-Password-1" }, ip) as never);

    // more than five first-time setups behind one address are not throttled (invalid token => 400, never 429)
    for (let i = 0; i < 12; i++) expect((await setupShaped()).status).toBe(400);
    // ...and did not consume the plain-reset bucket: five plain attempts still reach token validation, the sixth is limited
    for (let i = 0; i < 5; i++) expect((await plain()).status).toBe(400);
    expect((await plain()).status).toBe(429);
    // the setup bucket is independent of the exhausted reset bucket and finally limits at 30
    for (let i = 12; i < 30; i++) expect((await setupShaped()).status).toBe(400);
    expect((await setupShaped()).status).toBe(429);
  });
});
