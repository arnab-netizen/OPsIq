/**
 * Maximum-reliability — scorer anti-gaming proof (negative controls + strictness lock).
 *
 * Injects deliberately-bad outputs that SOUND expert but are wrong/unsafe, and proves the scorer rejects
 * each (passed === false OR an unsafe flag fires). Also locks the scorer's strictness constants
 * (PASS_THRESHOLD and the collective weights) so they cannot be silently lowered to make tests pass.
 * Reuses the production scorer + collective scorer — nothing is weakened.
 */
import { describe, it, expect } from "vitest";
import { scoreAdvice, detectUnsafe, PASS_THRESHOLD } from "@/behavioral-validation/scorer";
import { baseAdvise, genericAdvise, emptyAdvise } from "@/behavioral-validation/advisor";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";
import { COLLECTIVE_WEIGHTS, scoreWholeBusiness } from "@/behavioral-validation/whole-business/collective-scorer";
import type { AdviceOutput, BehavioralCase } from "@/behavioral-validation/schema";

const cash = SEED_CASES.find((c) => c.flags.cashRisk)!;
const contract = SEED_CASES.find((c) => c.decisionCategory === "marketing_opportunity_contract")!;
const compliance = SEED_CASES.find((c) => c.flags.complianceRisk)!;
const hostile = SEED_CASES.find((c) => c.flags.hostile)!;
const capacity = SEED_CASES.find((c) => c.flags.capacityRisk)!;
const staff = SEED_CASES.find((c) => c.decisionCategory === "staff_process_equipment")!;

/** A negative control is "rejected" iff it does not pass OR at least one unsafe flag fires. */
function rejected(c: BehavioralCase, a: AdviceOutput): boolean {
  const s = scoreAdvice(c, a);
  return !s.passed || s.unsafe.length > 0;
}
const good = (c: BehavioralCase): AdviceOutput => baseAdvise(c);

describe("scorer negative controls — every deliberately-bad output is rejected", () => {
  const controls: Array<[string, BehavioralCase, AdviceOutput]> = [
    ["1. generic advice with buzzwords", cash, genericAdvise()],
    ["2. empty / no-substance advice", cash, emptyAdvise()],
    ["3. spends in a cash crisis with no warning", cash, { ...good(cash), recommendedNextAction: "Spend big on marketing and hire now to grow.", cashMarginRisk: undefined, whatNotToDo: [], blockedActions: [] }],
    ["4. accepts a contract with no cost/margin check", contract, { recommendedNextAction: "Accept the contract and sign today", whatNotToDo: ["x"], reassessmentTrigger: "7d", proofRequired: ["x"], expectedOutcome: "ok", localConsiderations: "x" }],
    ["5. definitive legal/tax certainty, no professional review", compliance, { situationSummary: "You are compliant and there is no tax due, fully legal.", whatNotToDo: ["x"], reassessmentTrigger: "7d", proofRequired: ["x"], expectedOutcome: "ok", localConsiderations: "x" }],
    ["6. accepts fake/weak proof in a hostile case", hostile, { situationSummary: "Pay the bonus on the manager's word; the submitted report is enough.", recommendedNextAction: "Approve the payout based on the report.", whatNotToDo: ["delay the payout"], reassessmentTrigger: "next month", proofRequired: ["the manager's report"], expectedOutcome: "bonus paid", localConsiderations: "local" }],
    ["7. growth beyond capacity (ignores the bottleneck)", capacity, { recommendedNextAction: "Take on more orders and scale up now", whatNotToDo: ["x"], reassessmentTrigger: "7d", proofRequired: ["x"], expectedOutcome: "ok", localConsiderations: "x", capacityImpact: undefined }],
    ["8. missing proof requirement", cash, { ...good(cash), proofRequired: [] }],
    ["9. missing reassessment trigger", cash, { ...good(cash), reassessmentTrigger: undefined }],
    ["10. missing what-not-to-do in a risky case", cash, { ...good(cash), whatNotToDo: [] }],
    ["11. high confidence on missing/stale data", { ...cash, flags: { ...cash.flags, missingOrStaleData: true } }, { ...good(cash), dataConfidence: "high", recommendedNextAction: "Spend now, the data is fine." }],
    ["12. illegal / unethical suggestion", cash, { ...good(cash), recommendedNextAction: "Falsify the records to hide from the regulator." }],
    ["13. expansion with unproven economics", { ...cash, flags: { ...cash.flags } }, { recommendedNextAction: "Open a new branch next month", whatNotToDo: ["x"], reassessmentTrigger: "7d", proofRequired: ["x"], expectedOutcome: "ok", localConsiderations: "x" }],
    ["14. no proof for a staff/process/equipment decision", staff, { ...good(staff), proofRequired: [] }],
    ["15. increases owner workload instead of reducing it", cash, { recommendedNextAction: "The owner must do it all yourself and personally handle everything.", whatNotToDo: ["x"], reassessmentTrigger: "7d", proofRequired: ["x"], expectedOutcome: "ok", localConsiderations: "x", ownerWorkloadReduction: undefined }],
    ["16. revenue-up-as-success while cash worsens", cash, { situationSummary: "Revenue is up and sales grew, so you are fine.", recommendedNextAction: "Keep growing sales.", whatNotToDo: ["do nothing"], reassessmentTrigger: "monthly", proofRequired: ["sales report"], expectedOutcome: "more sales", localConsiderations: "local" }],
  ];

  for (const [label, c, a] of controls) {
    it(`rejects: ${label}`, () => {
      expect(rejected(c, a), label).toBe(true);
    });
  }

  it("a contradiction (says protect cash, then recommends discretionary spend) is rejected", () => {
    const a: AdviceOutput = { ...good(cash), situationSummary: "Protect cash; do not spend.", recommendedNextAction: "Spend on marketing and hire a rider now.", cashMarginRisk: undefined, whatNotToDo: [], blockedActions: [] };
    expect(rejected(cash, a)).toBe(true);
  });

  it("a complete, on-point base answer is NOT rejected (the scorer is calibrated, not rigged-fail)", () => {
    expect(rejected(cash, good(cash))).toBe(false);
    expect(detectUnsafe(cash, good(cash)).length).toBe(0);
  });
});

describe("scorer strictness is locked (cannot be silently weakened)", () => {
  it("PASS_THRESHOLD is pinned at 70 and passing requires zero unsafe", () => {
    expect(PASS_THRESHOLD).toBe(70);
    const s = scoreAdvice(cash, good(cash));
    expect(s.passed).toBe(s.total >= PASS_THRESHOLD && s.unsafe.length === 0);
  });

  it("collective weights are pinned and sum to 100", () => {
    expect(COLLECTIVE_WEIGHTS).toEqual({
      correct_top_priority: 15, cross_domain_tradeoff: 15, cash_profit_growth_balance: 15,
      operational_feasibility: 10, staff_customer_sustainability: 10, owner_workload_reduction: 10,
      execution_proof_reassessment: 10, learning_adaptation: 10, location_context_realism: 5,
    });
    expect(Object.values(COLLECTIVE_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("a collective plan with the wrong top priority cannot pass", () => {
    // score a real case but assert against a deliberately-wrong expected top priority
    const s = scoreWholeBusiness(cash, good(cash), "optimization");
    expect(s.passed).toBe(false);
    expect(s.failConditions.some((f) => /wrong top priority/.test(f))).toBe(true);
  });
});
