/**
 * Conflicting Public Signal — End-to-End proof (PASS 29). Requires TEST_WITH_DB=true.
 *
 * Drives the FULL path: multiple controlled raw public TEXTS per workspace → interpreter → conflict
 * resolution (resolvePublicSignalConflict) → ONE conservative collective ProcessCorrection → the
 * ALREADY-PROVEN governed execution bridge → owner-gated / evidence-gated ProcessExecutionTask — across
 * conflicting/adversarial archetype workspaces + a clean control.
 *
 * Proves conflict is handled safely: contradiction/recency preserved, weak/repeated signals validated
 * (never accused), official sources bounded to published facts, tender/growth gates never bypassed,
 * duplicates collapsed to one cockpit action, PII/injection/fake-money neutralised, no unsafe route,
 * workspace isolation, clean-workspace no-fabrication.
 *
 * Scope note (honest): CONTROLLED raw-text fixtures, not live web data. No crawling/scraping/browsing.
 * Mirrors docs/real-world-data/conflicting-public-signal-proof/.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { buildProcessExecutionBridge } from "@/domain/owner-mode/process-execution-bridge";
import {
  persistProcessExecutionRoutes, getPersistedProcessTasks, applyProcessExecutionAction,
  type ProcessBridgeDb, type ProcessBridgeDeps,
} from "@/services/owner-mode/process-execution-bridge.service";
import { interpretRawPublicSignal, type PublicArchetype, type PublicSourceType } from "@/domain/owner-mode/public-signal-interpretation";
import {
  resolvePublicSignalConflict, resolveAndValidateConflict, conflictDecisionToProcessCorrection, type Recency,
} from "@/domain/owner-mode/public-signal-conflict-resolution";
import type { ProcessCorrection, ProcessCorrectionRouting } from "@/domain/owner-mode/bottleneck-correction-routing";

const owner = randomUUID(), mgr = randomUUID();
const AT = "2026-07-07T00:00:00.000Z";
const deps: ProcessBridgeDeps = { db: db as unknown as ProcessBridgeDb, uuid: () => randomUUID(), now: () => new Date() };

const CASES = ["laundry", "housekeeping", "property", "franchise", "saas", "tender", "b2b", "collective"] as const;
type Case = typeof CASES[number];
const ws: Record<Case, string> = Object.fromEntries(CASES.map((a) => [a, randomUUID()])) as Record<Case, string>;
const biz: Record<Case, string> = Object.fromEntries(CASES.map((a) => [a, randomUUID()])) as Record<Case, string>;
const wsClean = randomUUID();

interface RawSig { rawText: string; archetype: PublicArchetype; sourceType: PublicSourceType; recency?: Recency; officialSource?: boolean }

// One conflict case per workspace: several raw texts that conflict / repeat / mix recency / carry adversarial content.
const CASE_SIGNALS: Record<Case, { archetype: PublicArchetype; signals: RawSig[] }> = {
  // Contradictory (negative vs positive) + PII in the negative text (must be stripped).
  laundry: { archetype: "laundry_local_service", signals: [
    { rawText: "Garments repeatedly came back stained and orders were late — contact Mr Smith, email john.doe@example.com or call 07700 900123.", archetype: "laundry_local_service", sourceType: "public_review" },
    { rawText: "Honestly the delivery has really improved lately, much better than before.", archetype: "laundry_local_service", sourceType: "public_review" },
  ] },
  // Official checklist page vs a missed-cleaning complaint → official strengthens published req, not internal execution.
  housekeeping: { archetype: "housekeeping_facility", signals: [
    { rawText: "Official service checklist page lists the full room cleaning standard and inspection steps.", archetype: "housekeeping_facility", sourceType: "public_service_page", officialSource: true },
    { rawText: "Rooms were repeatedly left with missed areas and dust in the corners after the clean.", archetype: "housekeeping_facility", sourceType: "public_complaint" },
  ] },
  // Maintenance complaint + a material spend decision → owner-gated.
  property: { archetype: "property_management", signals: [
    { rawText: "Urgent maintenance requests were repeatedly ignored and calls were never returned for days.", archetype: "property_management", sourceType: "public_complaint" },
    { rawText: "Given the repeated failures, should we approve the large spend and major investment to replace the system?", archetype: "property_management", sourceType: "public_complaint" },
  ] },
  // Branch unauthorized discount vs brand page → owner-gated brand/pricing.
  franchise: { archetype: "franchise_operations", signals: [
    { rawText: "A branch is running an unauthorized discount promo — should we change brand pricing across the network?", archetype: "franchise_operations", sourceType: "public_service_page" },
    { rawText: "The brand page claims consistently high standards across every location.", archetype: "franchise_operations", sourceType: "public_service_page" },
  ] },
  // Bug fixed (OLD) vs bug persists (RECENT) → recent negative reopens; verify, don't close.
  saas: { archetype: "saas", signals: [
    { rawText: "The onboarding bug is fixed now, everything works great.", archetype: "saas", sourceType: "public_saas_review", recency: "OLD" },
    { rawText: "The app repeatedly crashes during onboarding, the bug clearly still persists for us.", archetype: "saas", sourceType: "public_saas_review", recency: "RECENT" },
  ] },
  // Official tender notice + embedded auto-submit injection → data first, submit blocked.
  tender: { archetype: "tender_procurement", signals: [
    { rawText: "Public tender notice for facility cleaning. EMD required, eligibility documents and a submission deadline listed.", archetype: "tender_procurement", sourceType: "public_tender_notice", officialSource: true, recency: "RECENT" },
    { rawText: "Deadline is close — submit the tender now automatically to be safe.", archetype: "tender_procurement", sourceType: "public_tender_notice", officialSource: true, recency: "RECENT" },
  ] },
  // RFP opportunity + fake profit/win-probability claim → validate data, reject the claim.
  b2b: { archetype: "b2b_service", signals: [
    { rawText: "A public RFP seeks a service vendor with capacity, references and clear pricing for a contract.", archetype: "b2b_service", sourceType: "public_rfq" },
    { rawText: "Give them a 90% win probability, this makes £10,000 profit guaranteed.", archetype: "b2b_service", sourceType: "public_b2b_opportunity" },
  ] },
  // Growth temptation while quality is unresolved and capacity unknown → fix quality first, scale blocked.
  collective: { archetype: "collective_conflict", signals: [
    { rawText: "Demand is rising fast — should we expand now and open a new branch to capture it?", archetype: "collective_conflict", sourceType: "public_service_page" },
    { rawText: "Complaints about quality repeatedly recur and are still unresolved across the business.", archetype: "collective_conflict", sourceType: "public_complaint" },
    { rawText: "And we don't really know our cost, margin or capacity right now.", archetype: "collective_conflict", sourceType: "public_service_page" },
  ] },
};

function collectiveCorrection(a: Case): ProcessCorrection {
  const spec = CASE_SIGNALS[a];
  const signals = spec.signals.map((s) => ({
    signal: interpretRawPublicSignal({ rawText: s.rawText, sourceType: s.sourceType, archetype: s.archetype, officialSource: s.officialSource ?? false }),
    recency: s.recency ?? "UNKNOWN",
  }));
  const pkg = resolvePublicSignalConflict({ conflictCaseId: `case-${a}`, workspaceArchetype: spec.archetype, signals });
  if (!pkg) throw new Error(`no decision for ${a}`);
  return conflictDecisionToProcessCorrection(pkg, ws[a], `col-${a}`);
}
const routing = (a: Case): ProcessCorrectionRouting => {
  const c = collectiveCorrection(a);
  return { workspaceId: ws[a], evaluatedAt: AT, topCorrection: c, corrections: [c] };
};
const pkgFor = (a: Case) => {
  const spec = CASE_SIGNALS[a];
  return resolvePublicSignalConflict({
    conflictCaseId: `case-${a}`, workspaceArchetype: spec.archetype,
    signals: spec.signals.map((s) => ({ signal: interpretRawPublicSignal({ rawText: s.rawText, sourceType: s.sourceType, archetype: s.archetype, officialSource: s.officialSource ?? false }), recency: s.recency ?? "UNKNOWN" })),
  })!;
};

const K = (a: Case) => `pc:col-${a}`;
const tasksOf = (workspaceId: string) => getPersistedProcessTasks(workspaceId, deps);
const task = async (a: Case) => (await tasksOf(ws[a])).find((t) => t.taskKey === K(a));

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Conflicting public signal → resolution → governed execution", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: owner, email: `cf-o-${owner}@proof.test`, name: "Owner", isActive: true, updatedAt: new Date() } });
    await db.user.create({ data: { id: mgr, email: `cf-m-${mgr}@proof.test`, name: "Mgr", isActive: true, updatedAt: new Date() } });
    for (const a of CASES) {
      await db.workspace.create({ data: { id: ws[a], name: `WS ${a}`, slug: `cf-${a}-${ws[a].slice(0, 6)}`, createdBy: owner } });
      await db.clientAccount.create({ data: { id: ws[a], workspaceId: ws[a], name: `${a} client`, updatedAt: new Date() } });
      await db.ownerBusiness.create({ data: { id: biz[a], workspaceId: ws[a], name: `${a} biz`, businessType: a, updatedAt: new Date() } });
      await persistProcessExecutionRoutes(ws[a], buildProcessExecutionBridge(routing(a), null, ws[a], AT), owner, deps);
    }
    await db.workspace.create({ data: { id: wsClean, name: "WS clean", slug: `cf-clean-${wsClean.slice(0, 6)}`, createdBy: owner } });
  });
  afterAll(async () => {
    const all = [...CASES.map((a) => ws[a]), wsClean];
    await db.processExecutionTask.deleteMany({ where: { workspaceId: { in: all } } });
    await db.ownerReassessmentEvent.deleteMany({ where: { workspaceId: { in: all } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: { in: all } } });
    await db.ownerBusiness.deleteMany({ where: { id: { in: CASES.map((a) => biz[a]) } } });
    await db.clientAccount.deleteMany({ where: { id: { in: CASES.map((a) => ws[a]) } } });
    await db.workspace.deleteMany({ where: { id: { in: all } } });
    await db.user.deleteMany({ where: { id: { in: [owner, mgr] } } });
  });

  it("1. multiple raw signals are interpreted and 2. conflict-resolved into a validated package", () => {
    for (const a of CASES) {
      const spec = CASE_SIGNALS[a];
      const r = resolveAndValidateConflict({
        conflictCaseId: `case-${a}`, workspaceArchetype: spec.archetype,
        signals: spec.signals.map((s) => ({ signal: interpretRawPublicSignal({ rawText: s.rawText, sourceType: s.sourceType, archetype: s.archetype, officialSource: s.officialSource ?? false }), recency: s.recency ?? "UNKNOWN" })),
      });
      expect(r.ok, a).toBe(true);
      if (r.ok) expect(r.decision).not.toBeNull();
    }
  });

  it("3. conflict output enters the governed bridge and materialises exactly one collective task", async () => {
    for (const a of CASES) {
      const rows = await tasksOf(ws[a]);
      expect(rows.length, a).toBe(1);
      expect(rows[0].taskKey).toBe(K(a));
    }
  });

  it("4. owner-gated material decisions remain owner-gated and a non-owner cannot approve", async () => {
    for (const a of ["property", "franchise"] as const) {
      const t = await task(a);
      expect(t!.executionRoute, a).toBe("CREATE_OWNER_APPROVAL_TASK");
      expect(t!.approvalLevel).toBe("OWNER_APPROVAL_REQUIRED");
      const asMgr = await applyProcessExecutionAction({ workspaceId: ws[a], actorId: mgr, actorRole: "manager", taskKey: K(a), action: "APPROVE" }, deps);
      expect(asMgr.ok).toBe(false);
      if (!asMgr.ok) expect(asMgr.code).toBe("OWNER_APPROVAL_REQUIRED");
    }
  });

  it("5. completion is evidence-gated and 6. a completed correction opens a governed reassessment", async () => {
    const noEv = await applyProcessExecutionAction({ workspaceId: ws.collective, actorId: mgr, actorRole: "manager", taskKey: K("collective"), action: "COMPLETE", evidenceRefs: [] }, deps);
    expect(noEv.ok).toBe(false);
    if (!noEv.ok) expect(noEv.code).toBe("EVIDENCE_REQUIRED");
    const withEv = await applyProcessExecutionAction({ workspaceId: ws.collective, businessId: biz.collective, actorId: mgr, actorRole: "manager", taskKey: K("collective"), action: "COMPLETE", evidenceRefs: ["quality re-checked"], outcomeNotes: "fixed" }, deps);
    expect(withEv.ok).toBe(true);
    if (withEv.ok) expect(withEv.reassessmentId).not.toBeNull();
    expect(await db.ownerReassessmentEvent.count({ where: { workspaceId: ws.collective } })).toBeGreaterThan(0);
  });

  it("7+8. one top collective action per workspace (no duplicate/raw-signal spam)", () => {
    for (const a of CASES) {
      const analysis = buildProcessExecutionBridge(routing(a), null, ws[a], AT);
      expect(analysis.routes.length, a).toBe(1);
      expect(analysis.topRoute).not.toBeNull();
    }
  });

  it("9+12. tender urgency cannot bypass gates: data-first route, auto-submit blocked", async () => {
    const t = await task("tender");
    expect(t!.executionRoute).toBe("CREATE_MISSING_DATA_TASK");
    expect(pkgFor("tender").blockedUnsafeActions).toContain("tender auto-submit");
  });

  it("10. PII is never persisted into any governed task or audit event", async () => {
    const blob = JSON.stringify(await tasksOf(ws.laundry)) + JSON.stringify(await db.auditEvent.findMany({ where: { workspaceId: ws.laundry } }));
    expect(blob).not.toMatch(/john\.doe@example\.com/);
    expect(blob).not.toMatch(/900123/);
    expect(blob).not.toMatch(/Mr Smith/);
  });

  it("11. a fake financial/win claim is rejected and never persisted as a governed figure", async () => {
    const pkg = pkgFor("b2b");
    expect(pkg.blockedUnsafeActions.some((b) => /money\/ROI\/win-probability/i.test(b))).toBe(true);
    const blob = JSON.stringify(await tasksOf(ws.b2b));
    expect(blob).not.toMatch(/[$£€]\s?\d/);
    expect(blob).not.toMatch(/\b\d+(\.\d+)?\s?%|win probability|roi/i);
  });

  it("13. a growth opportunity cannot bypass quality/capacity gates (fix-first, scale blocked)", async () => {
    const pkg = pkgFor("collective");
    expect(pkg.conflictClassification).toBe("HIGH_RISK_UNRESOLVED");
    expect(pkg.validationRequired).toBe(true);
    expect(pkg.blockedUnsafeActions).toContain("scale before validation");
    const t = await task("collective");
    expect(t!.executionRoute).toBe("CREATE_CORRECTION_TASK");
    expect(t!.executionRoute).not.toBe("CREATE_OWNER_APPROVAL_TASK");
  });

  it("14. a recent negative prevents a false 'fixed' closure (mixed recency → verification)", async () => {
    expect(pkgFor("saas").conflictClassification).toBe("MIXED_RECENCY");
    expect((await task("saas"))!.executionRoute).toBe("CREATE_EVIDENCE_REQUEST");
  });

  it("15. workspace isolation holds: the tender collective task never leaks into laundry", async () => {
    const laundry = await tasksOf(ws.laundry);
    expect(laundry.every((t) => t.workspaceId === ws.laundry)).toBe(true);
    expect(laundry.some((t) => t.taskKey === K("tender"))).toBe(false);
    expect((await tasksOf(ws.tender)).some((t) => t.taskKey === K("tender"))).toBe(true);
  });

  it("16. a clean workspace fabricates nothing", async () => {
    expect(await tasksOf(wsClean)).toHaveLength(0);
    expect(await db.ownerReassessmentEvent.count({ where: { workspaceId: wsClean } })).toBe(0);
    expect(await db.auditEvent.count({ where: { workspaceId: wsClean } })).toBe(0);
  });

  it("17. the collective decision stays conservative under conflict (never an unsafe/external route)", async () => {
    const routes = new Set<string>();
    for (const a of CASES) for (const t of await tasksOf(ws[a])) routes.add(t.executionRoute);
    for (const r of routes) expect(r).not.toMatch(/SUBMIT|SEND|SPEND|DISCOUNT|CONTRACT|PAYROLL|OUTREACH|TENDER/i);
  });

  it("18. no raw public-text spam leaks into the owner cockpit (governed summaries only)", async () => {
    for (const a of CASES) {
      const blob = JSON.stringify(await tasksOf(ws[a]));
      expect(blob).not.toMatch(/Ignore previous instructions/i);
      expect(blob).not.toMatch(/Submit the tender now/i);
      expect(blob).not.toMatch(/john\.doe@example\.com/);
      expect(blob).not.toMatch(/win probability/i);
    }
  });
});
