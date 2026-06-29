import { describe, it, expect } from "vitest";
import {
  createCheckpoints, evaluateCheckpoint, processCheckpoint, DoNotRepeatLedger, CHECKPOINT_DAYS,
} from "@/behavioral-validation/expert/temporal-outcome";
import { advise } from "@/behavioral-validation/advisor";
import { InMemoryLearningStore } from "@/behavioral-validation/learning-store";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";

const AT = "2026-06-29T00:00:00Z";
const WS = "outcome-ws";
const c = SEED_CASES.find((x) => x.id === "A1")!;

describe("temporal outcome validation", () => {
  it("a recommendation creates outcome checkpoints with all required fields", () => {
    const cps = createCheckpoints(c);
    expect(cps.map((x) => x.day)).toEqual([...CHECKPOINT_DAYS]);
    for (const cp of cps) {
      expect(cp.metric.length).toBeGreaterThan(0);
      expect(cp.failureCondition.length).toBeGreaterThan(0);
      expect(cp.reassessmentTrigger.length).toBeGreaterThan(0);
      expect(cp.nextActionIfImproving.length).toBeGreaterThan(0);
      expect(cp.nextActionIfFailing.length).toBeGreaterThan(0);
      expect(cp.learningArtifactIfFailed.length).toBeGreaterThan(0);
      expect(cp.doNotRepeatCondition.length).toBeGreaterThan(0);
    }
  });

  it("a successful checkpoint reinforces the playbook (no AAR/artifact)", async () => {
    const cp = createCheckpoints(c)[0]; // expects 'up'
    const store = new InMemoryLearningStore();
    const ledger = new DoNotRepeatLedger();
    const r = await processCheckpoint(c, cp, +20, "recover receivables", store, ledger, { workspaceId: WS, actor: "t", at: AT });
    expect(r.result.passed).toBe(true);
    expect(r.reinforcedPlaybook).toBe(true);
    expect(r.artifact).toBeNull();
    expect((await store.all()).length).toBe(0);
  });

  it("a failed checkpoint triggers reassessment, an AAR, and a learning artifact", async () => {
    const cp = createCheckpoints(c)[0];
    const store = new InMemoryLearningStore();
    const ledger = new DoNotRepeatLedger();
    const r = await processCheckpoint(c, cp, -3, "spend on marketing", store, ledger, { workspaceId: WS, actor: "t", at: AT });
    expect(r.result.passed).toBe(false);
    expect(r.aar).not.toBeNull();
    expect(r.artifact).not.toBeNull();
    expect(cp.reassessmentTrigger).toMatch(/reassess/i);
    expect((await store.all()).length).toBe(1);
  });

  it("a failed outcome changes the FUTURE recommendation (artifact is read by the advisor)", async () => {
    const store = new InMemoryLearningStore();
    const ledger = new DoNotRepeatLedger();
    const before = await advise(c, { store, workspaceId: WS });
    expect((before.learningNotesApplied ?? []).length).toBe(0);
    await processCheckpoint(c, createCheckpoints(c)[0], -10, "spend on marketing", store, ledger, { workspaceId: WS, actor: "t", at: AT });
    const after = await advise(c, { store, workspaceId: WS });
    expect((after.learningNotesApplied ?? []).length).toBeGreaterThan(0);
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));
  });

  it("a repeated failed action is suppressed (do-not-repeat memory)", async () => {
    const store = new InMemoryLearningStore();
    const ledger = new DoNotRepeatLedger();
    await processCheckpoint(c, createCheckpoints(c)[0], -8, "spend ₹75,000 on a hoarding", store, ledger, { workspaceId: WS, actor: "t", at: AT });
    expect(ledger.isSuppressed(WS, "Spend ₹75,000 on a hoarding")).toBe(true);
    expect(ledger.isSuppressed(WS, "recover receivables")).toBe(false);
    expect(ledger.isSuppressed("other-ws", "spend ₹75,000 on a hoarding")).toBe(false); // per-workspace
  });

  it("checkpoint evaluation respects the acceptable band", () => {
    const up = createCheckpoints(c)[0];
    expect(evaluateCheckpoint(up, +10).passed).toBe(true);
    expect(evaluateCheckpoint(up, 0).passed).toBe(false);
  });
});
