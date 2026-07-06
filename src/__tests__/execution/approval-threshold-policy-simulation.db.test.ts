/**
 * Approval Threshold / Auto-Action Policy — real-business DB simulation (laundry).
 *
 * Sparkle Laundry (workspace `wsL`): repeated quality complaints/rework + weak proof drive process findings
 * and routed corrections. getOwnerNowView must classify each proposed correction as an action candidate and
 * decide the required approval before OpsIQ may run it (approvalPolicy): safe reversible actions auto-allowed,
 * routine coaching/process tweaks manager-gated, material responses owner-gated — none auto-executed without
 * the right approval, no high-harm action ever arises from ordinary corrections, and no fabricated money or
 * disciplinary language appears. A clean workspace has nothing to govern. Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";

const owner = randomUUID();
const mgr = randomUUID();
const staff = randomUUID();
const wsL = randomUUID();
const wsClean = randomUUID();
const bizL = randomUUID();
const NOW = Date.now();
const H = 3_600_000;
const NO_FRAUD = /\b(fraud|theft|thief|negligent|negligence|lazy|dishonest)\b/i;
const NO_HR = /\b(fire|fired|firing|terminate|termination|payroll|salary|docking|discipline|disciplinary|punish)\b/i;

const DECISIONS = new Set([
  "AUTO_ALLOWED", "MANAGER_APPROVAL_REQUIRED", "OWNER_APPROVAL_REQUIRED", "NEVER_AUTO", "NEEDS_DATA",
]);
const LEVELS = new Set(["OWNER", "MANAGER", "STAFF", "NONE"]);

const acceptedProof = async (id: string, ago: number) => {
  await db.proof.create({ data: {
    id, workspaceId: wsL, businessId: bizL, taskId: randomUUID(), proofType: "wash", status: "ACCEPTED",
    submittedByUserId: staff, reviewedByUserId: mgr, reviewedAt: new Date(NOW - ago * H),
    submittedAt: new Date(NOW - (ago + 1) * H), createdAt: new Date(NOW - (ago + 2) * H), updatedAt: new Date(NOW - ago * H),
  } });
};
const opEvent = async (eventType: string, category: string, proofId: string, ago: number, severity = "MEDIUM") => {
  await db.operationalEvent.create({ data: {
    id: randomUUID(), workspaceId: wsL, businessId: bizL, eventType, category, severity, status: "OPEN",
    source: "customer_reported", description: `${category} ${eventType}`, relatedProofId: proofId,
    occurredAt: new Date(NOW - ago * H), createdAt: new Date(NOW - ago * H), updatedAt: new Date(NOW - ago * H),
  } });
};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Approval Threshold / Auto-Action Policy (laundry)", () => {
  const p1 = randomUUID(), p2 = randomUUID(), p3 = randomUUID();

  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [mgr, "Mgr"], [staff, "Staff"]] as const) {
      await db.user.create({ data: { id, email: `atp-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `atp-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });

    await acceptedProof(p1, 8);
    await acceptedProof(p2, 7);
    await acceptedProof(p3, 6);
    await opEvent("COMPLAINT", "quality", p1, 5, "HIGH");
    await opEvent("COMPLAINT", "quality", p2, 4);
    await opEvent("REWORK", "quality", p1, 5);
    await opEvent("REWORK", "quality", p2, 4);
    await opEvent("REWORK", "quality", p3, 3);
  });

  afterAll(async () => {
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.operationalEvent.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: wsL } });
    await db.proof.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.clientAccount.deleteMany({ where: { id: wsL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsClean] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, mgr, staff] } } });
  });

  it("classifies proposed corrections into governed approval decisions; nothing auto-executes without the right approval", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    const ap = out.approvalPolicy;
    expect(ap).not.toBeNull();
    expect(ap!.decisions.length).toBeGreaterThan(0);
    expect(ap!.topDecision).not.toBeNull();

    for (const d of ap!.decisions) {
      expect(DECISIONS.has(d.approvalDecision)).toBe(true);
      expect(LEVELS.has(d.requiredApprovalLevel)).toBe(true);
      expect(d.workspaceId).toBe(wsL);
      expect(d.rationale.length).toBeGreaterThan(10);
      expect(d.riskGuardrail.length).toBeGreaterThan(10);
      // autoExecutable is true only for an AUTO_ALLOWED decision — never for owner/manager/never/needs-data.
      expect(d.autoExecutable).toBe(d.approvalDecision === "AUTO_ALLOWED");
      // blocked is true only for a NEVER_AUTO decision.
      expect(d.blocked).toBe(d.approvalDecision === "NEVER_AUTO");
    }

    // Ordinary laundry corrections never produce a high-harm NEVER_AUTO action.
    expect(ap!.summary.neverAuto).toBe(0);
    // The summary counts sum to the number of decisions.
    const s = ap!.summary;
    expect(s.autoAllowed + s.managerRequired + s.ownerRequired + s.neverAuto + s.needsData).toBe(ap!.decisions.length);

    // No fraud/negligence/HR-discipline language, no fabricated money figure, no hidden score.
    const json = JSON.stringify(ap).toLowerCase();
    expect(json).not.toMatch(NO_FRAUD);
    expect(json).not.toMatch(NO_HR);
    expect(json).not.toMatch(/hidden\s*score/);
    expect(json).not.toMatch(/[$£€]\s?\d/);
  });

  it("a clean workspace has nothing to govern and leaks no evidence", async () => {
    const out = await getOwnerNowView(wsClean);
    const ap = out.approvalPolicy;
    if (ap) expect(ap.decisions).toHaveLength(0);
    expect(JSON.stringify(ap)).not.toContain(p1);
  });
});
