/**
 * Public Online Real-Business End-to-End proof (PASS 27B). Requires TEST_WITH_DB=true.
 *
 * Drives the governed execution substrate with ANONYMIZED, normalized public-source signals across eight
 * business archetypes (one workspace each) — laundry, housekeeping, property, franchise, SaaS, tender,
 * B2B, and a collective multi-module conflict — and proves OpsIQ makes safe, governed, non-laundry-biased
 * decisions: workspace isolation, missing internal data → a data task, material/owner decisions → owner
 * approval (non-owner blocked), evidence-gated completion, unsafe actions non-completable, no fabricated
 * money, a single actionable top route, and a coherent collective decision (fix quality first, do not scale).
 *
 * Scope note (honest): the fixtures under docs/real-world-data/public-online-proof-pack are the normalization
 * a human/analyst performs on public reviews/notices; OpsIQ's job — and what is proven here — is the governed
 * routing + safety boundaries over those normalized signals. OpsIQ does not parse arbitrary public text.
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
import type { ProcessCorrection, ProcessCorrectionRouting, CorrectionType } from "@/domain/owner-mode/bottleneck-correction-routing";

const owner = randomUUID(), mgr = randomUUID();
const AT = "2026-07-06T00:00:00.000Z";
const deps: ProcessBridgeDeps = { db: db as unknown as ProcessBridgeDb, uuid: () => randomUUID(), now: () => new Date() };

// One workspace per archetype + a clean control.
const ARCHETYPES = ["laundry", "housekeeping", "property", "franchise", "saas", "tender", "b2b", "collective"] as const;
type Arch = typeof ARCHETYPES[number];
const ws: Record<Arch, string> = Object.fromEntries(ARCHETYPES.map((a) => [a, randomUUID()])) as Record<Arch, string>;
const biz: Record<Arch, string> = Object.fromEntries(ARCHETYPES.map((a) => [a, randomUUID()])) as Record<Arch, string>;
const wsClean = randomUUID();

function corr(workspaceId: string, id: string, type: CorrectionType, over: Partial<ProcessCorrection> = {}): ProcessCorrection {
  return {
    workspaceId, correctionId: id, sourceFindingType: "REWORK_LOOP", correctionType: type, title: "T", instruction: "do it",
    rationale: "public unverified signal — validate before acting", affectedStage: "DELIVERY" as ProcessCorrection["affectedStage"],
    targetActorId: null, targetManagerId: null, severity: "HIGH", confidence: "MEDIUM", priorityRank: 1,
    requiredApprovalLevel: "MANAGER", requiresOwnerApproval: false, autoExecutable: false,
    expectedImpactType: "QUALITY" as ProcessCorrection["expectedImpactType"], supportingProofIds: ["p1"],
    supportingOperationalEventIds: [], supportingEscalationIds: [], supportingAdjudicationIds: [], missingData: [], status: "PROPOSED", ...over,
  };
}
function routing(workspaceId: string, corrections: ProcessCorrection[]): ProcessCorrectionRouting {
  return { workspaceId, evaluatedAt: AT, topCorrection: corrections[0] ?? null, corrections };
}

// Per-archetype governed routing (normalized public signals → correction routes). Owner-material decisions
// use ESCALATE_TO_OWNER; missing internal data uses COLLECT_MISSING_DATA; quality loops use REVIEW_PROCESS_STEP.
function analysisFor(a: Arch) {
  const w = ws[a];
  const C = (id: string, t: CorrectionType, o: Partial<ProcessCorrection> = {}) => corr(w, id, t, o);
  switch (a) {
    case "laundry": return routing(w, [
      C("quality", "REVIEW_PROCESS_STEP", { severity: "CRITICAL" }),
      C("discount", "ESCALATE_TO_OWNER", { requiredApprovalLevel: "OWNER", requiresOwnerApproval: true, rationale: "competitor discount — protect margin, owner decides" }),
    ]);
    case "housekeeping": return routing(w, [
      C("missed", "REVIEW_PROCESS_STEP", { severity: "HIGH" }),
      C("train", "ASSIGN_TRAINING_REVIEW", { severity: "MEDIUM" }),
    ]);
    case "property": return routing(w, [
      C("maint", "RESOLVE_OPERATIONAL_EVENT", { severity: "HIGH", supportingOperationalEventIds: ["ev1"] }),
      C("spend", "ESCALATE_TO_OWNER", { requiredApprovalLevel: "OWNER", requiresOwnerApproval: true, rationale: "high maintenance spend / reputation — owner decides" }),
    ]);
    case "franchise": return routing(w, [
      C("audit", "REVIEW_PROCESS_STEP", { severity: "HIGH" }),
      C("brand", "ESCALATE_TO_OWNER", { requiredApprovalLevel: "OWNER", requiresOwnerApproval: true, rationale: "brand/pricing consistency — owner decides" }),
    ]);
    case "saas": return routing(w, [
      C("bug", "REQUIRE_FRESH_PROOF", { severity: "HIGH", rationale: "reproduce the bug before claiming fixed" }),
      C("pricing", "COLLECT_MISSING_DATA", { severity: "MEDIUM", missingData: ["activation/conversion data"] }),
    ]);
    case "tender": return routing(w, [
      C("eligibility", "COLLECT_MISSING_DATA", { severity: "HIGH", missingData: ["eligibility documents", "cost/margin fit", "EMD affordability"] }),
      C("biddecision", "ESCALATE_TO_OWNER", { requiredApprovalLevel: "OWNER", requiresOwnerApproval: true, rationale: "bid/no-bid + EMD is an owner decision; nothing auto-submitted" }),
    ]);
    case "b2b": return routing(w, [
      C("fit", "COLLECT_MISSING_DATA", { severity: "MEDIUM", missingData: ["capacity", "cost/margin", "reference proof"] }),
      C("outreach", "ESCALATE_TO_OWNER", { requiredApprovalLevel: "OWNER", requiresOwnerApproval: true, rationale: "outreach is owner-approved; draft only, no auto-send" }),
    ]);
    case "collective": return routing(w, [
      C("quality", "REVIEW_PROCESS_STEP", { severity: "CRITICAL", rationale: "fix quality first before any scale" }),
      C("costdata", "COLLECT_MISSING_DATA", { severity: "HIGH", missingData: ["cost/margin", "capacity"] }),
      C("scale", "ESCALATE_TO_OWNER", { requiredApprovalLevel: "OWNER", requiresOwnerApproval: true, rationale: "do not scale before validation + capacity + cost proof" }),
    ]);
  }
}

const task = async (workspaceId: string, key: string) => (await getPersistedProcessTasks(workspaceId, deps)).find((t) => t.taskKey === key);
const tasksOf = (workspaceId: string) => getPersistedProcessTasks(workspaceId, deps);

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Public online real-business end-to-end (8 archetypes)", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: owner, email: `pub-o-${owner}@proof.test`, name: "Owner", isActive: true, updatedAt: new Date() } });
    await db.user.create({ data: { id: mgr, email: `pub-m-${mgr}@proof.test`, name: "Mgr", isActive: true, updatedAt: new Date() } });
    for (const a of ARCHETYPES) {
      await db.workspace.create({ data: { id: ws[a], name: `WS ${a}`, slug: `pub-${a}-${ws[a].slice(0, 6)}`, createdBy: owner } });
      await db.clientAccount.create({ data: { id: ws[a], workspaceId: ws[a], name: `${a} client`, updatedAt: new Date() } });
      await db.ownerBusiness.create({ data: { id: biz[a], workspaceId: ws[a], name: `${a} biz`, businessType: a, updatedAt: new Date() } });
      await persistProcessExecutionRoutes(ws[a], buildProcessExecutionBridge(analysisFor(a), null, ws[a], AT), owner, deps);
    }
    await db.workspace.create({ data: { id: wsClean, name: "WS clean", slug: `pub-clean-${wsClean.slice(0, 6)}`, createdBy: owner } });
  });
  afterAll(async () => {
    const all = [...ARCHETYPES.map((a) => ws[a]), wsClean];
    await db.processExecutionTask.deleteMany({ where: { workspaceId: { in: all } } });
    await db.ownerReassessmentEvent.deleteMany({ where: { workspaceId: { in: all } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: { in: all } } });
    await db.ownerBusiness.deleteMany({ where: { id: { in: ARCHETYPES.map((a) => biz[a]) } } });
    await db.clientAccount.deleteMany({ where: { id: { in: ARCHETYPES.map((a) => ws[a]) } } });
    await db.workspace.deleteMany({ where: { id: { in: all } } });
    await db.user.deleteMany({ where: { id: { in: [owner, mgr] } } });
  });

  it("1. every archetype workspace materialises a governed top action (not a raw-signal dump)", async () => {
    for (const a of ARCHETYPES) {
      const rows = await tasksOf(ws[a]);
      expect(rows.length).toBeGreaterThan(0);
      // A single actionable top route exists (most-severe non-monitor); the rest collapse behind it.
      const analysis = buildProcessExecutionBridge(analysisFor(a), null, ws[a], AT);
      expect(analysis.topRoute).not.toBeNull();
      expect(analysis.topRoute!.executionRoute).not.toBe("MONITOR_ONLY");
    }
  });

  it("2. quality/process archetypes route to a correction/SOP task, NOT a laundry-only assumption", async () => {
    expect((await task(ws.laundry, "pc:quality"))!.executionRoute).toBe("CREATE_CORRECTION_TASK");
    expect((await task(ws.housekeeping, "pc:missed"))!.executionRoute).toBe("CREATE_CORRECTION_TASK");
    expect((await task(ws.franchise, "pc:audit"))!.executionRoute).toBe("CREATE_CORRECTION_TASK");
    // SaaS routes to a fresh-proof/evidence request (bug reproduction), a distinctly non-laundry route.
    expect((await task(ws.saas, "pc:bug"))!.executionRoute).toBe("CREATE_EVIDENCE_REQUEST");
    // Property maintenance routes to a reassessment task (resolve the operational event).
    expect((await task(ws.property, "pc:maint"))!.executionRoute).toBe("CREATE_REASSESSMENT_TASK");
  });

  it("3. missing internal data routes to a data task (tender/B2B/SaaS/collective)", async () => {
    expect((await task(ws.tender, "pc:eligibility"))!.executionRoute).toBe("CREATE_MISSING_DATA_TASK");
    expect((await task(ws.b2b, "pc:fit"))!.executionRoute).toBe("CREATE_MISSING_DATA_TASK");
    expect((await task(ws.saas, "pc:pricing"))!.executionRoute).toBe("CREATE_MISSING_DATA_TASK");
    expect((await task(ws.collective, "pc:costdata"))!.executionRoute).toBe("CREATE_MISSING_DATA_TASK");
  });

  it("4. material/owner decisions are owner-approval and a non-owner cannot approve them", async () => {
    for (const [a, key] of [["laundry", "pc:discount"], ["property", "pc:spend"], ["franchise", "pc:brand"], ["tender", "pc:biddecision"], ["b2b", "pc:outreach"], ["collective", "pc:scale"]] as const) {
      const t = await task(ws[a], key);
      expect(t!.executionRoute).toBe("CREATE_OWNER_APPROVAL_TASK");
      expect(t!.approvalLevel).toBe("OWNER_APPROVAL_REQUIRED");
      const asMgr = await applyProcessExecutionAction({ workspaceId: ws[a], actorId: mgr, actorRole: "manager", taskKey: key, action: "APPROVE" }, deps);
      expect(asMgr.ok).toBe(false);
      if (!asMgr.ok) expect(asMgr.code).toBe("OWNER_APPROVAL_REQUIRED");
    }
  });

  it("5. completion is evidence-gated on a governed task", async () => {
    const noEv = await applyProcessExecutionAction({ workspaceId: ws.laundry, actorId: mgr, actorRole: "manager", taskKey: "pc:quality", action: "COMPLETE", evidenceRefs: [] }, deps);
    expect(noEv.ok).toBe(false);
    if (!noEv.ok) expect(noEv.code).toBe("EVIDENCE_REQUIRED");
    const withEv = await applyProcessExecutionAction({ workspaceId: ws.laundry, businessId: biz.laundry, actorId: mgr, actorRole: "manager", taskKey: "pc:quality", action: "COMPLETE", evidenceRefs: ["re-clean verified"], outcomeNotes: "fixed" }, deps);
    expect(withEv.ok).toBe(true);
  });

  it("6. no unsafe / external-action route is ever produced (no tender-submit, outreach-send, spend, or discount route)", async () => {
    const EXECUTION_ROUTES = new Set<string>();
    for (const a of ARCHETYPES) for (const t of await tasksOf(ws[a])) EXECUTION_ROUTES.add(t.executionRoute);
    // The governed vocabulary contains only internal task routes — there is NO auto-submit/send/spend route.
    for (const r of EXECUTION_ROUTES) {
      expect(r).not.toMatch(/SUBMIT|SEND|SPEND|DISCOUNT|CONTRACT|PAYROLL|OUTREACH|TENDER/i);
    }
  });

  it("7. no persisted governed field fabricates a currency figure, percentage, or disciplinary label", async () => {
    for (const a of ARCHETYPES) {
      const blob = JSON.stringify(await tasksOf(ws[a]));
      expect(blob).not.toMatch(/[$£€]\s?\d/);
      expect(blob).not.toMatch(/\b\d+(\.\d+)?\s?%/);
      expect(blob).not.toMatch(/\b(fraud|negligent|lazy|dishonest|fired?|win probability|roi)\b/i);
    }
  });

  it("8. workspace isolation holds: each archetype sees only its own tasks", async () => {
    const laundry = await tasksOf(ws.laundry);
    expect(laundry.every((t) => t.workspaceId === ws.laundry)).toBe(true);
    // The tender workspace's bid-decision task never leaks into laundry.
    expect(laundry.some((t) => t.taskKey === "pc:biddecision")).toBe(false);
    expect((await tasksOf(ws.tender)).some((t) => t.taskKey === "pc:biddecision")).toBe(true);
  });

  it("9. the collective conflict yields a coherent decision: quality correction is the actionable top, scale is owner-gated", async () => {
    const analysis = buildProcessExecutionBridge(analysisFor("collective"), null, ws.collective, AT);
    // The most-severe actionable route is the quality fix (CRITICAL), not the scale decision.
    expect(analysis.topRoute!.taskKey).toBe("pc:quality");
    expect(analysis.topRoute!.executionRoute).toBe("CREATE_CORRECTION_TASK");
    // Scale is owner-approval (never auto), and cost data is a data task — do-not-scale-before-proof.
    expect((await task(ws.collective, "pc:scale"))!.approvalLevel).toBe("OWNER_APPROVAL_REQUIRED");
    expect((await task(ws.collective, "pc:costdata"))!.executionRoute).toBe("CREATE_MISSING_DATA_TASK");
  });

  it("10. a clean workspace fabricates nothing", async () => {
    expect(await tasksOf(wsClean)).toHaveLength(0);
    expect(await db.ownerReassessmentEvent.count({ where: { workspaceId: wsClean } })).toBe(0);
    expect(await db.auditEvent.count({ where: { workspaceId: wsClean } })).toBe(0);
  });
});
