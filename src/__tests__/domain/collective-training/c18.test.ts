import { describe, it, expect } from "vitest";
import { runCollective, type CollectiveInput } from "@/domain/collective-training/collective-engine";
import { journalCollectiveDecision } from "@/domain/collective-training/collective-journal";
import { isCollectivePacketValid } from "@/domain/collective-training/decision-packet";
import type { DomainSignalInput } from "@/domain/collective-training/collective-types";
import { HarmType, type HarmEntry } from "@/domain/domain-training/harm-ledger";

const G = (d: string): DomainSignalInput => ({ domain: d as DomainSignalInput["domain"], status: "GREEN", severity: "LOW", confidence: "HIGH" });
const RC = (d: string): DomainSignalInput => ({ domain: d as DomainSignalInput["domain"], status: "RED", severity: "CRITICAL", confidence: "HIGH" });
const R = (d: string): DomainSignalInput => ({ domain: d as DomainSignalInput["domain"], status: "RED", severity: "HIGH", confidence: "HIGH" });

function packetOf(input: CollectiveInput) { return runCollective(input); }

describe("[C18] end-to-end collective owner decision flow", () => {
  it("happy path: green board → valid packet, valid journal record, no harm entries", () => {
    const input: CollectiveInput = { archetype: "universal", ownerGoal: "optimize", signals: [G("cash-survival"), G("quality"), G("capacity")] };
    const p = packetOf(input);
    expect(isCollectivePacketValid(p)).toBe(true);
    const j = journalCollectiveDecision("ws_1", "universal", input, p, 1000);
    expect(j.recordViolations).toEqual([]);
    expect(j.harmEntries).toEqual([]);
  });
  it("missing-data path → confidence BLOCKED, still a valid recordable packet", () => {
    const input: CollectiveInput = { archetype: "universal", ownerGoal: "act", signals: [G("quality")], missingCriticalProof: true };
    const p = packetOf(input);
    expect(p.confidence).toBe("BLOCKED");
    expect(journalCollectiveDecision("ws_1", "universal", input, p, 1).recordViolations).toEqual([]);
  });
  it("veto path → active vetoes block marketing/growth under cash red", () => {
    const input: CollectiveInput = { archetype: "universal", ownerGoal: "marketing", signals: [RC("cash-survival"), G("marketing")] };
    const p = packetOf(input);
    expect(p.activeVetoes.some((v) => v.domain === "cash-survival")).toBe(true);
    expect(p.activeVetoes.flatMap((v) => v.blockedActions)).toContain("paid_marketing");
  });
  it("contradiction path → contradictions recorded, confidence downgraded", () => {
    const input: CollectiveInput = { archetype: "universal", ownerGoal: "trust the report", signals: [G("cash-survival")], contradiction: { ownerClaim: { text: "fine", contradictedByEvidence: true } } };
    const p = packetOf(input);
    expect(p.contradictions.length).toBeGreaterThan(0);
    expect(p.confidence).toBe("LOW");
  });
  it("harm path → harm entries written, learning not promoted", () => {
    const harm: HarmEntry = { workspaceId: "x", harmType: HarmType.QUALITY_WORSENED, severity: "HIGH", note: "defects up" };
    const input: CollectiveInput = { archetype: "universal", ownerGoal: "log win", signals: [G("cash-survival")], verification: { harms: [harm], primaryImproved: true, baselinePresent: true, outcomeVerifiable: true, reviewWindow: "2w", proofOwner: "owner" }, learning: { learningRequested: true, outcomeVerified: true, harmChecked: true, harmful: true, crossDomainHarm: false, disputed: false, inconclusive: false, simulationTested: true } };
    const p = packetOf(input);
    expect(p.learningStatus).not.toBe("PROMOTED");
    const j = journalCollectiveDecision("ws_1", "universal", input, p, 1);
    expect(j.harmEntries.length).toBe(1);
    expect(j.harmEntries[0].workspaceId).toBe("ws_1");
    expect(j.harmViolations).toEqual([]);
  });
  it("unverified-learning path → learning blocked from promotion", () => {
    const input: CollectiveInput = { archetype: "universal", ownerGoal: "learn", signals: [G("cash-survival")], learning: { learningRequested: true, outcomeVerified: false, harmChecked: false, harmful: false, crossDomainHarm: false, disputed: false, inconclusive: false, simulationTested: false } };
    expect(packetOf(input).learningStatus).not.toBe("PROMOTED");
  });
  it("rollback path → lever-specific rollback condition present", () => {
    const input: CollectiveInput = { archetype: "universal", ownerGoal: "market", signals: [R("marketing"), G("cash-survival")] };
    expect(packetOf(input).stopRollbackRedesign.rollbackCondition.trim().length).toBeGreaterThan(0);
  });
  it("escalation path → compliance red escalates to legal expert", () => {
    const input: CollectiveInput = { archetype: "housekeeping", ownerGoal: "move fast", signals: [G("cash-survival"), R("risk-compliance")] };
    const p = packetOf(input);
    expect(p.confidence).toBe("ESCALATE");
    expect(p.whoShouldDoIt.who).toBe("legal");
  });
});
