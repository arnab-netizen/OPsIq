/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows */
/**
 * DB-backed proof that BOTH first-run routes converge on the one canonical evidence -> diagnosis -> first read path, and that the
 * automatic first diagnosis is idempotent:
 *   manual  : owner snapshot            -> NEEDS_DIAGNOSIS -> runFinanceDiagnosis -> FIRST_RESULT -> first Money read
 *   QuickBooks: fake-Intuit sync (real parser/derivation/materialization) -> NEEDS_DIAGNOSIS -> the SAME runFinanceDiagnosis -> same read
 * No second diagnosis engine: the only diagnosis call is the repository's own runFinanceDiagnosis.
 *
 * Run: /var/tmp/dbenv.sh npx vitest run src/__tests__/first-login-to-first-advice/first-run-convergence.db.test.ts   (disposable loopback DB only)
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { connectQbo, envFor, makeFakeIntuit, monthKeys, seedQboTenant, type MonthBooks } from "@/__tests__/test-helpers/qbo-db-fixtures";
import { runQboSync } from "@/services/quickbooks/qbo-sync.service";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { createFirstBusiness, getFirstMoneyRead, getFirstRunContext } from "@/services/owner-first-run/first-run.service";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";

const books = (n: number): MonthBooks => ({ income: 20_000 + n, cogs: 9_000, bank: 15_000, arTotal: 8_000, arCurrent: 3_000, apTotal: 6_000, apCurrent: 1_000 });
const D = (k: string) => new Date(`${k}T00:00:00.000Z`);
const cycles = (ws: string, biz: string) => db.ownerFinanceCycle.count({ where: { workspaceId: ws, businessId: biz } });

async function manualTenant() {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  await db.user.create({ data: { id: userId, email: `${userId}@convergence.test`, emailVerifiedAt: new Date(Date.now() - 120_000), requiresEmailVerification: true, updatedAt: new Date() } });
  await db.workspace.create({ data: { id: workspaceId, name: "Convergence Cafe", slug: `ws-${workspaceId.slice(0, 8)}`, createdBy: userId } });
  return { workspaceId, userId };
}
const lastMonth = () => {
  const end = new Date();
  end.setUTCDate(0);
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] first login -> first advice: both routes converge", () => {
  it("[db] MANUAL: business -> source step (manual only, QuickBooks not offered) -> snapshot -> automatic diagnosis -> first read with a recommendation", async () => {
    const t = await manualTenant();
    expect((await getFirstRunContext(t.workspaceId)).state).toBe("NEEDS_BUSINESS");
    const { business } = await createFirstBusiness(t.workspaceId, t.userId, { businessType: "laundry_local_service", currency: "gbp" });

    const needsEvidence = await getFirstRunContext(t.workspaceId, business.id);
    expect(needsEvidence.state).toBe("NEEDS_EVIDENCE");
    // No QuickBooks configuration/offer in this environment: the step is manual-only and shows no connector.
    expect(needsEvidence.evidenceSources).toEqual({ quickBooks: "HIDDEN", manual: true, poll: false });

    const snap: any = await createFinancialSnapshot(business.id, { ...lastMonth(), currency: "GBP", revenue: 12000, fixedCosts: 7000, variableCosts: 4000, cashOnHand: 1500, evidenceQuality: "GOOD_ESTIMATE" } as any, t.userId, t.workspaceId);
    const needsDiagnosis = await getFirstRunContext(t.workspaceId, business.id);
    expect(needsDiagnosis.state).toBe("NEEDS_DIAGNOSIS");
    expect(needsDiagnosis.evidenceSources).toBeNull();
    expect(needsDiagnosis.currentSnapshotId).toBe(snap.id);
    expect(await cycles(t.workspaceId, business.id)).toBe(0); // evidence alone never decides

    await runFinanceDiagnosis(business.id, snap.id, t.userId, t.workspaceId, { firstDiagnosisOnly: true });
    expect((await getFirstRunContext(t.workspaceId, business.id)).state).toBe("FIRST_RESULT");
    const read = await getFirstMoneyRead(t.workspaceId, business.id);
    expect(read.read.recommendedAction).toBeTruthy();
    expect(await cycles(t.workspaceId, business.id)).toBe(1);
  });

  it("[db] QUICKBOOKS: connected+importing resumes as IN_PROGRESS; imported canonical evidence -> NEEDS_DIAGNOSIS -> the same diagnosis -> first read; sync alone never decides", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t, "production");

    // Connected, nothing imported yet: persisted state resumes the import view (regardless of the offer gate).
    const importing = await getFirstRunContext(t.ws, t.biz);
    expect(importing.state).toBe("NEEDS_EVIDENCE");
    expect(importing.evidenceSources).toMatchObject({ quickBooks: "IN_PROGRESS", poll: true });

    const f = makeFakeIntuit(Object.fromEntries(monthKeys(12).map((k, i) => [k, books(i)])));
    const sync = () => runQboSync({ workspaceId: t.ws, connectionId, trigger: "SCHEDULED" }, { env: envFor("production"), readClientFactory: () => f.reader });
    await sync();
    await sync(); // a repeated sync request must not change the outcome below
    expect(await cycles(t.ws, t.biz)).toBe(0);

    const ready = await getFirstRunContext(t.ws, t.biz);
    expect(ready.state).toBe("NEEDS_DIAGNOSIS");
    expect(ready.facts.firstReadSufficient).toBe(true);
    expect(ready.currentSnapshotId).toBeTruthy();

    const snap = await db.ownerFinancialSnapshot.findFirstOrThrow({ where: { id: ready.currentSnapshotId as string, workspaceId: t.ws } });
    expect(snap.businessId).toBe(t.biz);
    await runFinanceDiagnosis(t.biz, snap.id, t.actor, t.ws, { firstDiagnosisOnly: true });
    const done = await getFirstRunContext(t.ws, t.biz);
    expect(done.state).toBe("FIRST_RESULT");
    expect((await getFirstMoneyRead(t.ws, t.biz)).read.recommendedAction).toBeTruthy();
    expect(await cycles(t.ws, t.biz)).toBe(1);

    // More sync passes after the read exist change nothing by themselves (no second diagnosis).
    await sync();
    await sync();
    expect(await cycles(t.ws, t.biz)).toBe(1);
  });

  it("[db] IDEMPOTENT: concurrent / replayed automatic first diagnoses create exactly one cycle and return the same one", async () => {
    const t = await manualTenant();
    const { business } = await createFirstBusiness(t.workspaceId, t.userId, { businessType: "laundry_local_service", currency: "gbp" });
    const snap: any = await createFinancialSnapshot(business.id, { ...lastMonth(), currency: "GBP", revenue: 9000, fixedCosts: 5000, variableCosts: 3000, cashOnHand: 800, evidenceQuality: "ACTUAL" } as any, t.userId, t.workspaceId);

    const results = await Promise.all(Array.from({ length: 4 }, () => runFinanceDiagnosis(business.id, snap.id, t.userId, t.workspaceId, { firstDiagnosisOnly: true })));
    expect(new Set(results.map((r: any) => r.id)).size).toBe(1);
    expect(await cycles(t.workspaceId, business.id)).toBe(1);
    expect(await db.ownerFinanceAction.count({ where: { workspaceId: t.workspaceId, businessId: business.id } })).toBe(results[0].actions.length);
    // A later replay (response lost, page reloaded) is still the same cycle, with no second audit entry.
    const replay: any = await runFinanceDiagnosis(business.id, snap.id, t.userId, t.workspaceId, { firstDiagnosisOnly: true });
    expect(replay.id).toBe(results[0].id);
    expect(await db.auditEvent.count({ where: { entityId: replay.id, eventName: AUDIT_EVENTS.OWNER_FINANCE_DIAGNOSIS_RUN } })).toBe(1);
  });

  it("[db] OWNER RE-RUN is unchanged: without firstDiagnosisOnly a new cycle is created", async () => {
    const t = await manualTenant();
    const { business } = await createFirstBusiness(t.workspaceId, t.userId, { businessType: "laundry_local_service", currency: "gbp" });
    const snap: any = await createFinancialSnapshot(business.id, { ...lastMonth(), currency: "GBP", revenue: 9000, fixedCosts: 5000, variableCosts: 3000, cashOnHand: 800, evidenceQuality: "ACTUAL" } as any, t.userId, t.workspaceId);
    const a: any = await runFinanceDiagnosis(business.id, snap.id, t.userId, t.workspaceId, { firstDiagnosisOnly: true });
    const b: any = await runFinanceDiagnosis(business.id, snap.id, t.userId, t.workspaceId);
    expect(b.id).not.toBe(a.id);
    expect(b.sequenceNumber).toBe(2);
    // ...and a later "first only" request returns the LATEST existing cycle rather than creating a third.
    const c: any = await runFinanceDiagnosis(business.id, snap.id, t.userId, t.workspaceId, { firstDiagnosisOnly: true });
    expect(c.id).toBe(b.id);
    expect(await cycles(t.workspaceId, business.id)).toBe(2);
  });

  it("[db] OWNER-AUTHORED month is never overwritten by QuickBooks, and the first read still comes from canonical evidence", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t, "production");
    const latestKey = monthKeys(12)[0];
    const [y, m] = latestKey.split("-").map(Number);
    const periodEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const manual: any = await createFinancialSnapshot(t.biz, { periodStart: latestKey, periodEnd, currency: "USD", revenue: 777, fixedCosts: 100, variableCosts: 100, cashOnHand: 50, evidenceQuality: "ACTUAL" } as any, t.actor, t.ws);

    const f = makeFakeIntuit(Object.fromEntries(monthKeys(12).map((k, i) => [k, books(i)])));
    for (let i = 0; i < 3; i++) await runQboSync({ workspaceId: t.ws, connectionId, trigger: "SCHEDULED" }, { env: envFor("production"), readClientFactory: () => f.reader });

    const current = await db.ownerFinancialSnapshot.findMany({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(latestKey), supersededById: null } });
    expect(current).toHaveLength(1);
    expect(current[0].id).toBe(manual.id);
    expect(Number(current[0].revenue)).toBe(777);
  });

  it("[db] OFFER WIRING: QuickBooks is offered to a real business only with config + offer gate + (production) acceptance, and never across the sandbox/real isolation", async () => {
    const keys = ["QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET", "QUICKBOOKS_REDIRECT_URI", "QUICKBOOKS_ENVIRONMENT", "QUICKBOOKS_FIRST_RUN_OFFER_ENABLED", "QUICKBOOKS_PRODUCTION_ACCEPTANCE_CONFIRMED"];
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    const set = (env: Record<string, string>) => { for (const k of keys) delete process.env[k]; Object.assign(process.env, env); };
    const base = { QUICKBOOKS_CLIENT_ID: "cid", QUICKBOOKS_CLIENT_SECRET: "csecret-DO-NOT-LEAK", QUICKBOOKS_REDIRECT_URI: "https://app.example.com/cb" };
    try {
      const t = await manualTenant();
      const { business } = await createFirstBusiness(t.workspaceId, t.userId, { businessType: "laundry_local_service", currency: "gbp" });
      const role = async () => (await getFirstRunContext(t.workspaceId, business.id)).evidenceSources?.quickBooks;

      set({});                                                                                                  expect(await role()).toBe("HIDDEN");
      set({ ...base, QUICKBOOKS_ENVIRONMENT: "production" });                                                   expect(await role()).toBe("HIDDEN"); // configured, gate closed
      set({ ...base, QUICKBOOKS_ENVIRONMENT: "production", QUICKBOOKS_FIRST_RUN_OFFER_ENABLED: "true" });       expect(await role()).toBe("HIDDEN"); // production acceptance pending
      set({ ...base, QUICKBOOKS_ENVIRONMENT: "sandbox", QUICKBOOKS_FIRST_RUN_OFFER_ENABLED: "true" });          expect(await role()).toBe("HIDDEN"); // sandbox never takes a real business
      set({ ...base, QUICKBOOKS_ENVIRONMENT: "production", QUICKBOOKS_FIRST_RUN_OFFER_ENABLED: "true", QUICKBOOKS_PRODUCTION_ACCEPTANCE_CONFIRMED: "true" });
      expect(await role()).toBe("OFFER");
    } finally {
      for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    }
  });

  it("[db] TENANT ISOLATION: another workspace can neither read this business's first-run context nor diagnose its snapshot", async () => {
    const a = await manualTenant();
    const b = await manualTenant();
    const { business } = await createFirstBusiness(a.workspaceId, a.userId, { businessType: "laundry_local_service", currency: "gbp" });
    const snap: any = await createFinancialSnapshot(business.id, { ...lastMonth(), currency: "GBP", revenue: 9000, fixedCosts: 5000, variableCosts: 3000, cashOnHand: 800, evidenceQuality: "ACTUAL" } as any, a.userId, a.workspaceId);
    await expect(getFirstRunContext(b.workspaceId, business.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(runFinanceDiagnosis(business.id, snap.id, b.userId, b.workspaceId, { firstDiagnosisOnly: true })).rejects.toBeInstanceOf(NotFoundError);
    expect(await cycles(a.workspaceId, business.id)).toBe(0);
  });
});
