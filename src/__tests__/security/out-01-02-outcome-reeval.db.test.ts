/**
 * OUT-01 / OUT-02 regression [db].
 *
 * OUT-01: recordOutcome now labels its model-derived accuracy honestly
 *   (measured=false, accuracyBasis="model_confidence_delta") so a fabricated score can
 *   never be presented to an owner as a measured business result.
 * OUT-02: a regressed (or low-accuracy) outcome now routes into governed re-evaluation
 *   via triggerReEvaluation({changeType:"failed_implementation"}). Previously recordOutcome
 *   computed the regression and did nothing — the loop was unwired.
 *
 * The two heavy compute services and the re-evaluation engine are mocked/ spied; the
 * outcome record + audit run against the real DB. Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const { triggerReEvaluation, computeDecisionConfidence, generateBusinessImpact } = vi.hoisted(() => ({
  triggerReEvaluation: vi.fn().mockResolvedValue({ auditEventId: "ae" }),
  computeDecisionConfidence: vi.fn(),
  generateBusinessImpact: vi.fn(),
}));
vi.mock("@/services/re-evaluation", () => ({ triggerReEvaluation }));
vi.mock("@/services/decision-confidence/decision-confidence.service", () => ({ computeDecisionConfidence }));
vi.mock("@/services/business-impact/business-impact.service", () => ({ generateBusinessImpact }));

import { recordOutcome } from "@/services/outcome/outcome.service";

const userId = randomUUID();
const ws = randomUUID();
const clientId = randomUUID();
const engagementId = randomUUID();
const NOW = new Date("2026-07-04T00:00:00Z");

async function seedAction(predictedLevel: string): Promise<string> {
  const actionId = randomUUID();
  await db.action.create({
    data: {
      id: actionId,
      engagementId,
      title: "t",
      status: "completed",
      completedAt: NOW,
      updatedAt: NOW,
      metadata: { outcomeSnapshot: { predictedImpactLevel: predictedLevel, predictedConfidence: 50 } },
    },
  });
  return actionId;
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] OUT-01/OUT-02 outcome honesty + reassessment wiring", () => {
  const actionIds: string[] = [];

  beforeAll(async () => {
    await db.user.upsert({ where: { id: userId }, update: {}, create: { id: userId, email: `out-${userId}@e.com`, name: "o", isActive: true, updatedAt: NOW } });
    await db.workspace.upsert({ where: { id: ws }, update: {}, create: { id: ws, name: "WS out", slug: `ws-${ws}`, createdBy: userId } });
    await db.clientAccount.create({ data: { id: clientId, name: "client", updatedAt: NOW } });
    await db.engagement.create({
      data: { id: engagementId, workspaceId: ws, code: `E-${engagementId.slice(0, 8)}`, title: "eng", clientId, serviceTier: "standard", engagementMode: "advisory", updatedAt: NOW },
    });
    computeDecisionConfidence.mockResolvedValue({ score: 50 });
  });

  beforeEach(() => triggerReEvaluation.mockClear());

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { workspaceId: ws } });
    if (actionIds.length) await db.action.deleteMany({ where: { id: { in: actionIds } } });
    await db.engagement.deleteMany({ where: { id: engagementId } });
    await db.clientAccount.deleteMany({ where: { id: clientId } });
    await db.workspace.deleteMany({ where: { id: ws } });
    await db.user.deleteMany({ where: { id: userId } });
    vi.restoreAllMocks();
  });

  it("OUT-01: labels the outcome as an unmeasured model estimate", async () => {
    generateBusinessImpact.mockResolvedValue({ impactLevel: "low" }); // improved (predicted low->low = no change)
    const actionId = await seedAction("low");
    actionIds.push(actionId);
    const result = await recordOutcome(actionId, userId, undefined, ws);
    expect(result.measured).toBe(false);
    expect(result.accuracyBasis).toBe("model_confidence_delta");
  });

  it("OUT-02: a regressed outcome triggers failed_implementation re-evaluation", async () => {
    generateBusinessImpact.mockResolvedValue({ impactLevel: "critical" }); // predicted low -> actual critical = regressed
    const actionId = await seedAction("low");
    actionIds.push(actionId);
    const result = await recordOutcome(actionId, userId, undefined, ws);
    expect(result.reassessmentTriggered).toBe(true);
    expect(triggerReEvaluation).toHaveBeenCalledTimes(1);
    expect(triggerReEvaluation.mock.calls[0][0]).toMatchObject({
      changeType: "failed_implementation",
      engagementId,
      workspaceId: ws,
    });
  });

  it("OUT-02: an improved/steady, high-accuracy outcome does NOT trigger re-evaluation", async () => {
    generateBusinessImpact.mockResolvedValue({ impactLevel: "low" }); // predicted high -> actual low = improved
    const actionId = await seedAction("high");
    actionIds.push(actionId);
    const result = await recordOutcome(actionId, userId, undefined, ws);
    expect(result.reassessmentTriggered).toBe(false);
    expect(triggerReEvaluation).not.toHaveBeenCalled();
  });
});
