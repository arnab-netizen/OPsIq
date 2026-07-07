/**
 * Owner Cockpit Decision Coherence — End-to-End proof (PASS 31). Requires TEST_WITH_DB=true.
 *
 * Drives PASS 30 prioritisation → owner-facing explanation (explainOwnerCockpitDecision) → ONE governed
 * ProcessCorrection per actionable cluster → the ALREADY-PROVEN execution bridge, across the PASS 30 stress
 * archetypes + a clean control. Proves the owner sees a coherent, evidence-linked explanation for the top
 * action (why it is top, verified vs unverified, missing data, why not growth, owner-approval reason, evidence
 * + reassessment, blocked actions, grouped secondaries, monitor-only) — with no raw-signal/PII/injection dump,
 * no fabricated money, one top explanation per workspace, workspace isolation, and a clean workspace fabricating
 * nothing. Controlled fixtures only.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { buildProcessExecutionBridge } from "@/domain/owner-mode/process-execution-bridge";
import {
  persistProcessExecutionRoutes, getPersistedProcessTasks,
  type ProcessBridgeDb, type ProcessBridgeDeps,
} from "@/services/owner-mode/process-execution-bridge.service";
import { interpretRawPublicSignal, type PublicArchetype, type PublicSourceType } from "@/domain/owner-mode/public-signal-interpretation";
import type { ConflictSignalInput, Recency } from "@/domain/owner-mode/public-signal-conflict-resolution";
import { prioritisePublicSignals, prioritisationToProcessCorrections } from "@/domain/owner-mode/public-signal-prioritisation";
import { explainOwnerCockpitDecision, explainAndValidateOwnerCockpit } from "@/domain/owner-mode/owner-cockpit-decision-explanation";
import type { ProcessCorrectionRouting } from "@/domain/owner-mode/bottleneck-correction-routing";

const owner = randomUUID();
const AT = "2026-07-07T00:00:00.000Z";
const deps: ProcessBridgeDeps = { db: db as unknown as ProcessBridgeDb, uuid: () => randomUUID(), now: () => new Date() };

const CASES = ["laundry", "housekeeping", "property", "franchise", "saas", "tender", "b2b", "collective", "monitor"] as const;
type Case = typeof CASES[number];
const ws: Record<Case, string> = Object.fromEntries(CASES.map((a) => [a, randomUUID()])) as Record<Case, string>;
const biz: Record<Case, string> = Object.fromEntries(CASES.map((a) => [a, randomUUID()])) as Record<Case, string>;
const wsClean = randomUUID();

interface RawSig { rawText: string; archetype: PublicArchetype; sourceType: PublicSourceType; recency?: Recency; officialSource?: boolean }
const S = (rawText: string, archetype: PublicArchetype, sourceType: PublicSourceType, recency: Recency = "UNKNOWN", officialSource = false): RawSig =>
  ({ rawText, archetype, sourceType, recency, officialSource });
const many = (n: number, s: RawSig): RawSig[] => Array.from({ length: n }, () => s);

const PACKS: Record<Case, { archetype: PublicArchetype; signals: RawSig[] }> = {
  laundry: { archetype: "laundry_local_service", signals: [
    ...many(6, S("Garments repeatedly came back stained and orders consistently late.", "laundry_local_service", "public_review")),
    S("A local office asked about a bulk B2B laundry contract.", "laundry_local_service", "public_b2b_opportunity"),
    S("Should we expand now and open a new branch across town?", "laundry_local_service", "public_service_page"),
  ] },
  housekeeping: { archetype: "housekeeping_facility", signals: [
    ...many(6, S("Rooms repeatedly left with missed areas and dust after the clean.", "housekeeping_facility", "public_complaint")),
    S("A commercial client asked about a larger facilities contract.", "housekeeping_facility", "public_b2b_opportunity"),
  ] },
  property: { archetype: "property_management", signals: [
    ...many(5, S("Urgent maintenance repeatedly ignored and calls never returned.", "property_management", "public_complaint")),
    S("A tenant mentions a deposit dispute and possible legal action.", "property_management", "public_complaint"),
    S("A public listing shows a vacant unit being marketed.", "property_management", "public_property_listing"),
  ] },
  franchise: { archetype: "franchise_operations", signals: [
    ...many(5, S("One branch is consistently worse with repeated quality problems.", "franchise_operations", "public_complaint")),
    S("A branch runs an unauthorized discount promo, should we change brand pricing?", "franchise_operations", "public_service_page"),
  ] },
  saas: { archetype: "saas", signals: [
    ...many(6, S("The app repeatedly crashes during onboarding, a bug clearly persists.", "saas", "public_saas_review")),
    S("Should we scale now and launch a big marketing push?", "saas", "public_service_page"),
  ] },
  tender: { archetype: "tender_procurement", signals: [
    ...many(4, S("Public tender notice, EMD required, eligibility documents and a deadline listed.", "tender_procurement", "public_tender_notice", "RECENT", true)),
    S("Deadline close — submit the tender now automatically.", "tender_procurement", "public_tender_notice", "RECENT", true),
  ] },
  b2b: { archetype: "b2b_service", signals: [
    ...many(4, S("A public RFP seeks a vendor with capacity, references and clear pricing.", "b2b_service", "public_rfq")),
    S("Our cost and margin for this kind of contract are not clear internally.", "b2b_service", "public_b2b_opportunity"),
  ] },
  collective: { archetype: "collective_conflict", signals: [
    ...many(8, S("Complaints about quality repeatedly recur and are still unresolved.", "collective_conflict", "public_complaint")),
    ...many(4, S("We don't really know our cost, margin or capacity right now.", "collective_conflict", "public_service_page")),
    ...many(4, S("Demand is rising — should we expand now and open a new branch?", "collective_conflict", "public_service_page")),
  ] },
  // Monitor-only positive workspace (no unresolved negative) — explanation should be null (nothing to act on).
  monitor: { archetype: "laundry_local_service", signals: [
    ...many(4, S("Service has really improved and is much better now.", "laundry_local_service", "public_review")),
  ] },
};

const inputFor = (a: Case) => ({
  workspaceArchetype: PACKS[a].archetype,
  signals: PACKS[a].signals.map((s) => ({ signal: interpretRawPublicSignal({ rawText: s.rawText, sourceType: s.sourceType, archetype: s.archetype, officialSource: s.officialSource ?? false }), recency: s.recency ?? "UNKNOWN" })) as ConflictSignalInput[],
});
const prioFor = (a: Case) => prioritisePublicSignals(inputFor(a));
const explainFor = (a: Case) => explainOwnerCockpitDecision(prioFor(a));
const routing = (a: Case): ProcessCorrectionRouting => {
  const corrections = prioritisationToProcessCorrections(inputFor(a), ws[a]);
  return { workspaceId: ws[a], evaluatedAt: AT, topCorrection: corrections[0] ?? null, corrections };
};
const tasksOf = (workspaceId: string) => getPersistedProcessTasks(workspaceId, deps);

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Owner cockpit decision coherence & explainability", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: owner, email: `ck-o-${owner}@proof.test`, name: "Owner", isActive: true, updatedAt: new Date() } });
    for (const a of CASES) {
      await db.workspace.create({ data: { id: ws[a], name: `WS ${a}`, slug: `ck-${a}-${ws[a].slice(0, 6)}`, createdBy: owner } });
      await db.clientAccount.create({ data: { id: ws[a], workspaceId: ws[a], name: `${a} client`, updatedAt: new Date() } });
      await db.ownerBusiness.create({ data: { id: biz[a], workspaceId: ws[a], name: `${a} biz`, businessType: a, updatedAt: new Date() } });
      await persistProcessExecutionRoutes(ws[a], buildProcessExecutionBridge(routing(a), null, ws[a], AT), owner, deps);
    }
    await db.workspace.create({ data: { id: wsClean, name: "WS clean", slug: `ck-clean-${wsClean.slice(0, 6)}`, createdBy: owner } });
  });
  afterAll(async () => {
    const all = [...CASES.map((a) => ws[a]), wsClean];
    await db.processExecutionTask.deleteMany({ where: { workspaceId: { in: all } } });
    await db.ownerReassessmentEvent.deleteMany({ where: { workspaceId: { in: all } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: { in: all } } });
    await db.ownerBusiness.deleteMany({ where: { id: { in: CASES.map((a) => biz[a]) } } });
    await db.clientAccount.deleteMany({ where: { id: { in: CASES.map((a) => ws[a]) } } });
    await db.workspace.deleteMany({ where: { id: { in: all } } });
    await db.user.deleteMany({ where: { id: { in: [owner] } } });
  });

  const ACTIONABLE = CASES.filter((a) => a !== "monitor");

  it("1+2. prioritised output creates a top action and an explanation is generated + schema-valid", () => {
    for (const a of ACTIONABLE) {
      const r = explainAndValidateOwnerCockpit(prioFor(a));
      expect(r.ok, a).toBe(true);
      if (r.ok) expect(r.explanation).not.toBeNull();
    }
  });

  it("3. the explanation references the correct supporting clusters/signals", () => {
    const e = explainFor("laundry")!;
    expect(e.topAction.topic).toBe("quality");
    expect(e.supportingSignalCount).toBeGreaterThan(0);
    expect(e.supportingClusters.some((c) => c.topic === "quality")).toBe(true);
  });

  it("4. the explanation states verified / unverified / missing data", () => {
    const e = explainFor("collective")!;
    expect(Array.isArray(e.verifiedFacts)).toBe(true);
    expect(e.unverifiedSignals.join(" ")).toMatch(/unverified|not proof/i);
    expect(e.missingData.length).toBeGreaterThan(0);
  });

  it("5. the explanation states why the top action outranks secondaries (incl. growth)", () => {
    const e = explainFor("collective")!;
    expect(e.whyThisIsTopPriority.join(" ")).toMatch(/tier|outranks/i);
    expect(e.whyNotGrowthYet).not.toBeNull();
  });

  it("6. an owner-approval reason is present where the top action is owner-gated", () => {
    for (const a of ACTIONABLE) {
      const e = explainFor(a)!;
      if (e.topAction.ownerApprovalRequired) expect(e.ownerApprovalReason, a).not.toBeNull();
    }
  });

  it("7. an evidence requirement is present before completion", () => {
    for (const a of ACTIONABLE) expect(explainFor(a)!.requiredEvidenceBeforeCompletion.length, a).toBeGreaterThan(0);
  });

  it("8. the reassessment path is visible", () => {
    for (const a of ACTIONABLE) expect(explainFor(a)!.reassessmentAfterCompletion.length).toBeGreaterThan(3);
  });

  it("9. blocked unsafe actions are visible; tender submit blocked", () => {
    for (const a of ACTIONABLE) expect(explainFor(a)!.blockedUnsafeActions.length).toBeGreaterThan(0);
    expect(explainFor("tender")!.blockedUnsafeActions).toContain("tender auto-submit");
  });

  it("10+11. one top explanation per workspace with grouped (bounded) secondaries", () => {
    for (const a of ACTIONABLE) {
      const e = explainFor(a)!;
      expect(e.topAction).toBeDefined();
      expect(e.secondaryActionGroups.length).toBeLessThanOrEqual(prioFor(a)!.clusterCount);
    }
  });

  it("12+13. no raw-signal / PII / prompt-injection text in the explanation or the persisted tasks", async () => {
    for (const a of ACTIONABLE) {
      const blob = JSON.stringify(explainFor(a)) + JSON.stringify(await tasksOf(ws[a]));
      expect(blob).not.toMatch(/Ignore previous instructions/i);
      expect(blob).not.toMatch(/Submit the tender now/i);
      expect(blob).not.toMatch(/john\.doe@example\.com/);
    }
  });

  it("14. no fabricated money/ROI/win-probability in any owner-facing field", () => {
    for (const a of ACTIONABLE) {
      const e = explainFor(a)!;
      const facing = [e.explanationSummary, e.safeCopy, e.riskIfIgnored, e.ownerNextAction, ...e.whyThisIsTopPriority].join(" ");
      expect(facing).not.toMatch(/[$£€]\s?\d/);
      expect(facing).not.toMatch(/\b\d+(\.\d+)?\s?%|win probability|\bmrr\b|\broi\b/i);
    }
  });

  it("15. workspace isolation holds (each workspace's clustered tasks are its own)", async () => {
    const laundry = await tasksOf(ws.laundry);
    expect(laundry.every((t) => t.workspaceId === ws.laundry)).toBe(true);
    expect(laundry.some((t) => t.taskKey === "pc:cl-tender")).toBe(false);
  });

  it("16. a monitor-only-positive workspace and a clean workspace fabricate no explanation", async () => {
    expect(explainFor("monitor")).toBeNull();
    expect(explainOwnerCockpitDecision(prioritisePublicSignals({ workspaceArchetype: "laundry_local_service", signals: [] }))).toBeNull();
    expect(await tasksOf(wsClean)).toHaveLength(0);
  });
});
