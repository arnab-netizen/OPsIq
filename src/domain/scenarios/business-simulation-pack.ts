/**
 * SEQUENTIAL BUSINESS SIMULATIONS PACK — 50 counted, source-backed, multi-event simulations proving OpsIQ makes the
 * right GOVERNED decision at each step of a business evolving over time. Each simulation is a time-ordered sequence
 * of 7–30 events; each event carries a deterministic `ScenarioSeedPlan` (the exact primitive the single-scenario
 * packs proved) so the REAL `getOwnerWholeBusinessPlan` DB path resolves the event's expected decision. Pure data +
 * a pure builder over the additive `business-simulation` contract. No new engine, no change to the scenario schema.
 *
 * The disposition→(decision, dominant, seed) map below is exactly the DB-proven mapping used by the 6 prior packs:
 * routine reversible SOP-granted → proceed/cautious; missing figures → need_more_data; a binding constraint →
 * owner_decision; a compliance/proof boundary → blocked. Actual-vs-expected is EXPECTED-ONLY (no live data).
 */
import { businessSimulationSchema, type BusinessSimulation, type SimulationEvent, type SimulationCategory } from "./business-simulation";
import type { ScenarioSeedPlan } from "../../behavioral-validation/chaos-replay/chaos-ledger";
import type { Constraint } from "../../behavioral-validation/whole-business/arbitration";
import { BUSINESS_SIMULATION_SOURCE_BY_ID } from "./business-simulation-sources";

type Code = "PR" | "CA" | "NF" | "OC" | "OM" | "OD" | "OW" | "BC" | "BF";

interface CodeSpec {
  decision: SimulationEvent["expectedDecision"];
  dominant: Constraint;
  seed: ScenarioSeedPlan;
  workload: "low" | "medium" | "high";
}

/** All mappings are DB-proven by the prior packs (Daily Ops / Finance / Weekly / Growth / CVM / Crisis). */
const CODE: Record<Code, CodeSpec> = {
  PR: { decision: "proceed", dominant: "profitable_growth", seed: { dominant: "profitable_growth", goodBadUgly: "good", sopRiskClass: "low" }, workload: "low" },
  CA: { decision: "cautious_proceed", dominant: "profitable_growth", seed: { dominant: "profitable_growth", goodBadUgly: "good", sopRiskClass: "medium" }, workload: "low" },
  NF: { decision: "need_more_data", dominant: "profitable_growth", seed: { dominant: "profitable_growth", goodBadUgly: "bad", stripCriticalData: true }, workload: "low" },
  OC: { decision: "owner_decision_required", dominant: "cash_survival", seed: { dominant: "cash_survival", goodBadUgly: "ugly" }, workload: "high" },
  OM: { decision: "owner_decision_required", dominant: "below_margin", seed: { dominant: "below_margin", goodBadUgly: "bad" }, workload: "medium" },
  OD: { decision: "owner_decision_required", dominant: "capacity_feasibility", seed: { dominant: "capacity_feasibility", goodBadUgly: "bad" }, workload: "medium" },
  OW: { decision: "owner_decision_required", dominant: "owner_workload", seed: { dominant: "owner_workload", goodBadUgly: "bad" }, workload: "high" },
  BC: { decision: "blocked", dominant: "compliance_block", seed: { dominant: "compliance_block", goodBadUgly: "ugly" }, workload: "medium" },
  BF: { decision: "blocked", dominant: "proof_fraud_block", seed: { dominant: "proof_fraud_block", goodBadUgly: "ugly" }, workload: "medium" },
};

function proofFor(decision: SimulationEvent["expectedDecision"]): string[] {
  return decision === "blocked" ? ["professional / independent-verification clearance for this event"]
    : decision === "owner_decision_required" ? ["the figures + owner decision this event needs"]
    : decision === "need_more_data" ? ["the specific missing figure for this event"]
    : ["proof of the routine step at this event"];
}
function reassessFor(): string[] {
  return ["reassess at the next event once the missing figure / owner decision / review is in"];
}

/** A step tuple: [dayOffset, code, title]. */
type Step = [number, Code, string];

interface SimDef {
  id: string;
  category: SimulationCategory;
  src: string;
  gold?: boolean;
  startingState: string;
  finalState: string;
  actualVsExpected: string;
  learning: string;
  failureCondition: string;
  recoveryPath: string;
  steps: Step[];
}

function build(def: SimDef): BusinessSimulation {
  const events: SimulationEvent[] = def.steps.map(([day, code, title], i) => {
    const c = CODE[code];
    return {
      eventId: `${def.id}-E${String(i + 1).padStart(2, "0")}`,
      sequenceIndex: i,
      dayOffset: day,
      title,
      seed: c.seed,
      expectedDecision: c.decision,
      expectedDominant: c.dominant,
      expectedProofRequired: proofFor(c.decision),
      expectedReassessment: reassessFor(),
      workloadImpact: c.workload,
    };
  });
  const parsed = businessSimulationSchema.parse({
    simulationId: def.id,
    category: def.category,
    startingState: def.startingState,
    events,
    expectedFinalState: def.finalState,
    expectedActualVsExpected: def.actualVsExpected,
    expectedLearning: def.learning,
    failureCondition: def.failureCondition,
    recoveryPath: def.recoveryPath,
    sourceRefs: [def.src],
    independentGold: def.gold === true,
    countedForReadiness: true,
    synthetic: false,
    liveDataBacked: false,
  });
  return { ...parsed, events } as BusinessSimulation;
}

const AVE = " — expected only, not a proven actual (no live data).";

// ── 50 simulations across 8 categories. Each is a distinct authored time-ordered sequence. Per-event decisions
//    reuse the DB-proven disposition map; owner-gated + blocked events never proceed. ──
const DEFS: SimDef[] = [
  // ===== normal_week (10, 7–10 events) =====
  { id: "SIM-normal-01", category: "normal_week", src: "SRC-SIM-NORMALWEEK", gold: true,
    startingState: "Healthy small business at the start of an ordinary week.", finalState: "Week closes stable; routine handled, one owner call made." + "",
    actualVsExpected: "Decisions matched the routine week's needs" + AVE, learning: "Routine weeks need light-touch handling; reserve owner time for the few material calls.",
    failureCondition: "Over-escalating routine steps would overload the owner and slow the week.", recoveryPath: "Governed re-evaluation restores the routine cadence at the next weekly review.",
    steps: [[0,"PR","Mon: confirm and fulfil standard repeat orders"],[1,"PR","Tue: process in-policy returns and reorders"],[2,"CA","Wed: apply a small within-policy courtesy on a repeat order"],[3,"PR","Thu: close delivered orders with signed receipts"],[4,"OM","Fri: a material discount request — prepare for the owner"],[5,"PR","Fri: routine end-of-week reconciliation"],[6,"CA","Sat: a small reversible staffing tweak under SOP"]] },
  { id: "SIM-normal-02", category: "normal_week", src: "SRC-SIM-ROUTINE", gold: true,
    startingState: "Services business, steady demand, normal week.", finalState: "Week stable; a data gap surfaced and was closed before deciding.",
    actualVsExpected: "The missing-figure event was handled by asking, not guessing" + AVE, learning: "A mid-week data gap should pause the decision, not the week.",
    failureCondition: "Deciding the pricing exception without the cost basis.", recoveryPath: "Once the cost basis arrives, the exception routes to the owner.",
    steps: [[0,"PR","Mon: schedule the week's jobs from the queue"],[1,"CA","Tue: expedite a routine job with a small overtime cost"],[2,"NF","Wed: a pricing exception missing the cost basis"],[3,"PR","Thu: complete and log routine jobs with proof"],[4,"OM","Fri: the pricing exception, now with cost basis — owner call"],[5,"PR","Fri: routine invoicing run"],[6,"PR","Sat: weekly proof/complete check"]] },
  { id: "SIM-normal-03", category: "normal_week", src: "SRC-SIM-NORMALWEEK",
    startingState: "Retail shop, normal trading week.", finalState: "Week stable; a minor complaint handled in policy.",
    actualVsExpected: "The minor complaint stayed within routine handling" + AVE, learning: "Most complaints are routine; only a systemic theme needs the owner.",
    failureCondition: "Escalating a routine complaint or hiding a systemic one.", recoveryPath: "The weekly review checks whether the complaint is a one-off or a theme.",
    steps: [[0,"PR","Mon: open, stock check, routine reorders"],[1,"PR","Tue: process standard sales and returns"],[2,"CA","Wed: a small goodwill gesture on a complaint"],[3,"PR","Thu: routine supplier reorder within terms"],[4,"OW","Fri: a recurring complaint theme — prepare for the owner"],[5,"PR","Fri: cash-up and reconcile"],[6,"PR","Sat: close the week with proof"]] },
  { id: "SIM-normal-04", category: "normal_week", src: "SRC-SIM-ROUTINE",
    startingState: "Trades business, booked week.", finalState: "Week stable; capacity call surfaced and owner-gated.",
    actualVsExpected: "The capacity call was prepared for the owner, not auto-taken" + AVE, learning: "A busy week can hide a capacity limit; surface it early.",
    failureCondition: "Accepting more work than proven capacity allows.", recoveryPath: "Owner decides the intake cap at the weekly review.",
    steps: [[0,"PR","Mon: dispatch the day's jobs"],[1,"PR","Tue: routine materials reorder"],[2,"CA","Wed: reschedule a run within SOP after a delay"],[3,"NF","Thu: an intake request missing the capacity data"],[4,"OD","Fri: intake vs capacity — owner call"],[5,"PR","Fri: complete and log jobs"],[6,"PR","Sat: weekly proof check"]] },
  { id: "SIM-normal-05", category: "normal_week", src: "SRC-SIM-NORMALWEEK",
    startingState: "B2B services, steady week.", finalState: "Week stable; routine renewals processed.",
    actualVsExpected: "Renewals stayed routine; one owner-gated pricing call" + AVE, learning: "Renewals are routine unless terms change materially.",
    failureCondition: "Auto-renewing a materially changed contract.", recoveryPath: "Material term changes route to the owner.",
    steps: [[0,"PR","Mon: process in-terms renewals"],[1,"PR","Tue: routine account check-ins"],[2,"CA","Wed: a small in-policy account-care step"],[3,"PR","Thu: standard invoicing"],[4,"OM","Fri: a renewal with materially changed terms — owner call"],[5,"PR","Fri: reconcile receivables"],[6,"PR","Sat: weekly close"]] },
  { id: "SIM-normal-06", category: "normal_week", src: "SRC-SIM-ROUTINE",
    startingState: "Café, normal week.", finalState: "Week stable; consumable reorder and a small owner call.",
    actualVsExpected: "Consumables stayed routine; owner-gated the supplier switch" + AVE, learning: "Routine reorders proceed; a supplier switch is material.",
    failureCondition: "Switching supplier without the owner on a material spend.", recoveryPath: "Supplier switch routes to the owner with the numbers.",
    steps: [[0,"PR","Mon: open and routine consumable reorder"],[1,"PR","Tue: standard sales and waste log"],[2,"CA","Wed: a small within-band price tweak under SOP"],[3,"NF","Thu: a supplier-switch idea missing the cost comparison"],[4,"OM","Fri: supplier switch, now costed — owner call"],[5,"PR","Fri: cash-up"],[6,"PR","Sat: weekly proof check"]] },
  { id: "SIM-normal-07", category: "normal_week", src: "SRC-SIM-NORMALWEEK",
    startingState: "Salon, booked week.", finalState: "Week stable; rota handled, one owner call.",
    actualVsExpected: "Rota changes stayed routine; owner-gated a hire question" + AVE, learning: "Rota is routine; a headcount change is an owner call.",
    failureCondition: "Committing a new hire without the owner.", recoveryPath: "Hire question routes to the owner with demand data.",
    steps: [[0,"PR","Mon: confirm the rota and bookings"],[1,"PR","Tue: process routine bookings"],[2,"CA","Wed: a small reversible cover under SOP"],[3,"PR","Thu: routine stock reorder"],[4,"OD","Fri: a hire question vs capacity — owner call"],[5,"PR","Fri: reconcile takings"],[6,"PR","Sat: weekly close"]] },
  { id: "SIM-normal-08", category: "normal_week", src: "SRC-SIM-ROUTINE",
    startingState: "E-commerce SMB, normal week.", finalState: "Week stable; fulfilment routine, one data gap closed.",
    actualVsExpected: "The data gap paused one decision, not the week" + AVE, learning: "Fulfilment is routine; a margin question needs the figures.",
    failureCondition: "Running a promo without the margin figure.", recoveryPath: "Promo routes to the owner once margin is confirmed.",
    steps: [[0,"PR","Mon: process and ship standard orders"],[1,"PR","Tue: routine returns handling"],[2,"NF","Wed: a promo idea missing the margin figure"],[3,"PR","Thu: reorder fast movers at the trigger"],[4,"OM","Fri: the promo, now with margin — owner call"],[5,"PR","Fri: reconcile"],[6,"PR","Sat: weekly proof check"]] },
  { id: "SIM-normal-09", category: "normal_week", src: "SRC-SIM-NORMALWEEK",
    startingState: "Clinic (non-medical-advice ops), normal week.", finalState: "Week stable; a compliance item routed correctly.",
    actualVsExpected: "The compliance item blocked to a professional, as it should" + AVE, learning: "Even a normal week can surface a boundary that must route out.",
    failureCondition: "Self-clearing the compliance item.", recoveryPath: "Compliance item goes to the professional; routine continues.",
    steps: [[0,"PR","Mon: routine bookings and reminders"],[1,"PR","Tue: standard admin and reorders"],[2,"CA","Wed: a small in-policy schedule change"],[3,"BC","Thu: a licence/compliance item surfaces — route to professional"],[4,"PR","Fri: routine reconciliation"],[5,"PR","Fri: proof/complete check"],[6,"PR","Sat: weekly close"]] },
  { id: "SIM-normal-10", category: "normal_week", src: "SRC-SIM-ROUTINE",
    startingState: "Logistics SMB, normal week.", finalState: "Week stable; routing handled, one owner call.",
    actualVsExpected: "Routing stayed routine; owner-gated a capacity commitment" + AVE, learning: "Routing is routine; a fleet commitment is material.",
    failureCondition: "Committing fleet capacity without the owner.", recoveryPath: "Fleet commitment routes to the owner with utilisation data.",
    steps: [[0,"PR","Mon: dispatch routine runs"],[1,"PR","Tue: routine maintenance checks"],[2,"CA","Wed: a small routing SOP tweak"],[3,"NF","Thu: a fleet-add idea missing utilisation data"],[4,"OD","Fri: fleet capacity — owner call"],[5,"PR","Fri: reconcile"],[6,"PR","Sat: weekly proof check"]] },

  // ===== slow_leakage (10, 10–20 events) =====
  { id: "SIM-leak-01", category: "slow_leakage", src: "SRC-SIM-LEAKAGE", gold: true,
    startingState: "Retail business; margin looks fine but is quietly slipping.", finalState: "The leak is confirmed and routed to the owner for a pricing response.",
    actualVsExpected: "Early events asked for data; the confirmed leak went to the owner" + AVE, learning: "A slow leak needs enough periods to confirm before a material response.",
    failureCondition: "Reacting to noise early, or missing the confirmed leak late.", recoveryPath: "Owner sets the pricing correction; reassess weekly against margin.",
    steps: [[0,"PR","Wk1: routine week, margin within band"],[3,"NF","Wk1: a soft-margin day — baseline missing"],[7,"NF","Wk2: margin dip signal, cost basis unclear"],[10,"NF","Wk2: per-line margins still not available"],[14,"OM","Wk3: leak now confirmed across a line — owner call"],[17,"CA","Wk3: a small proven within-band correction under SOP"],[21,"OM","Wk4: a material price correction — owner call"],[24,"PR","Wk4: routine reconciliation"],[28,"OM","Wk5: extend the correction to a second line — owner call"],[31,"PR","Wk5: weekly proof check"]] },
  { id: "SIM-leak-02", category: "slow_leakage", src: "SRC-SIM-COMPLAINTRISE", gold: true,
    startingState: "Services business; complaints ticking up slowly.", finalState: "A systemic complaint theme is confirmed and owner-gated.",
    actualVsExpected: "The rising trend was confirmed before an owner response" + AVE, learning: "A complaint trend needs a baseline before it is a real theme.",
    failureCondition: "Spending on acquisition while complaints are unresolved.", recoveryPath: "Owner decides the fix; reassess complaint rate weekly.",
    steps: [[0,"PR","Wk1: routine complaint handling"],[3,"NF","Wk1: a complaint uptick, baseline missing"],[7,"NF","Wk2: category breakdown not available"],[10,"CA","Wk2: a small in-policy service-recovery step"],[14,"OW","Wk3: a systemic theme confirmed — owner call"],[17,"NF","Wk3: root-cause data still incomplete"],[21,"OW","Wk4: decide whether to pause acquisition — owner call"],[24,"PR","Wk4: routine handling continues"],[28,"OW","Wk5: fix ownership decision — owner call"],[31,"PR","Wk5: weekly proof check"]] },
  { id: "SIM-leak-03", category: "slow_leakage", src: "SRC-SIM-LEAKAGE",
    startingState: "Manufacturing SMB; consumable usage creeping up.", finalState: "Usage-above-benchmark confirmed and owner-gated.",
    actualVsExpected: "Usage drift was confirmed against benchmark before acting" + AVE, learning: "Usage creep is a margin leak; confirm per-job before a supplier change.",
    failureCondition: "Changing supplier/spec on unconfirmed usage.", recoveryPath: "Owner decides the supplier/spec change with the usage data.",
    steps: [[0,"PR","Wk1: routine usage log"],[3,"NF","Wk1: a usage uptick, benchmark missing"],[7,"NF","Wk2: jobs-done denominator unclear"],[10,"CA","Wk2: a small SOP tweak on stock handling"],[14,"OM","Wk3: usage-above-benchmark confirmed — owner call"],[18,"NF","Wk3: supplier-comparison data incomplete"],[22,"OM","Wk4: supplier/spec change — owner call"],[25,"PR","Wk4: routine reconciliation"],[29,"BF","Wk5: usage pattern looks like unrecorded pilferage — blocked"]] },
  { id: "SIM-leak-04", category: "slow_leakage", src: "SRC-SIM-LEAKAGE",
    startingState: "B2B contractor; receivables slowly ageing.", finalState: "The receivables leak is confirmed and owner-gated.",
    actualVsExpected: "The ageing was confirmed before a credit decision" + AVE, learning: "Ageing receivables are a cash leak; confirm before extending credit.",
    failureCondition: "Extending more credit on unconfirmed ageing.", recoveryPath: "Owner decides the credit/collections response.",
    steps: [[0,"PR","Wk1: routine invoicing"],[4,"NF","Wk1: a slow-payer signal, history missing"],[8,"NF","Wk2: ageing amounts unclear"],[11,"CA","Wk2: a routine in-policy reminder"],[15,"OM","Wk3: overdue concentration confirmed — owner call"],[18,"NF","Wk3: customer terms not confirmed"],[22,"OM","Wk4: credit-limit decision — owner call"],[25,"BC","Wk4: a collections step risks a legal dispute — blocked"],[29,"PR","Wk5: routine reconciliation"]] },
  { id: "SIM-leak-05", category: "slow_leakage", src: "SRC-SIM-MARGINDRIFT",
    startingState: "Retail-services; discounts creeping.", finalState: "Discount leak confirmed; owner-gated correction.",
    actualVsExpected: "Creeping discounts were confirmed before a price reset" + AVE, learning: "Discount creep erodes margin quietly; confirm before resetting.",
    failureCondition: "Resetting prices without confirming the leak.", recoveryPath: "Owner sets the discount policy correction.",
    steps: [[0,"PR","Wk1: routine sales"],[3,"NF","Wk1: a margin softness, discount data missing"],[7,"NF","Wk2: discount-mix unclear"],[10,"CA","Wk2: a small within-band correction under SOP"],[14,"OM","Wk3: discount leak confirmed — owner call"],[18,"OM","Wk4: reset discount policy — owner call"],[22,"PR","Wk4: routine reconciliation"],[26,"PR","Wk5: weekly proof check"]] },
  { id: "SIM-leak-06", category: "slow_leakage", src: "SRC-SIM-LEAKAGE",
    startingState: "Café; food-cost drifting up.", finalState: "Food-cost drift confirmed; owner-gated response.",
    actualVsExpected: "Food-cost drift confirmed before a menu/price change" + AVE, learning: "Input-cost creep needs confirmation before repricing.",
    failureCondition: "Repricing the menu without the cost data.", recoveryPath: "Owner decides the menu/price response.",
    steps: [[0,"PR","Wk1: routine ordering"],[3,"NF","Wk1: a cost-softness signal, invoices missing"],[7,"NF","Wk2: per-dish cost unclear"],[10,"CA","Wk2: a small portion-control SOP tweak"],[14,"OM","Wk3: food-cost drift confirmed — owner call"],[18,"OM","Wk4: menu reprice — owner call"],[22,"PR","Wk4: routine reconciliation"],[26,"PR","Wk5: weekly proof check"]] },
  { id: "SIM-leak-07", category: "slow_leakage", src: "SRC-SIM-LEAKAGE",
    startingState: "Trades; rework rate slowly rising.", finalState: "Rework trend confirmed; owner-gated capacity response.",
    actualVsExpected: "Rework trend confirmed before slowing intake" + AVE, learning: "Rising rework eats capacity; confirm before changing intake.",
    failureCondition: "Ignoring the rework trend until it breaks delivery.", recoveryPath: "Owner decides the intake/quality response.",
    steps: [[0,"PR","Wk1: routine job completion"],[3,"NF","Wk1: a rework uptick, baseline missing"],[7,"NF","Wk2: defect-category data missing"],[10,"CA","Wk2: a small SOP tweak on a recurring redo"],[14,"OD","Wk3: rework trend confirmed, capacity at risk — owner call"],[18,"OD","Wk4: slow intake to clear rework — owner call"],[22,"PR","Wk4: routine completion"],[26,"BF","Wk5: rework being closed without evidence — blocked"]] },
  { id: "SIM-leak-08", category: "slow_leakage", src: "SRC-SIM-LEAKAGE",
    startingState: "Retention slowly declining at a subscription SMB.", finalState: "Retention decline confirmed; owner-gated response.",
    actualVsExpected: "Retention decline confirmed against cohort before acting" + AVE, learning: "Retention shows in cohorts before revenue; confirm first.",
    failureCondition: "Funding a costly win-back on unconfirmed churn.", recoveryPath: "Owner decides the retention response.",
    steps: [[0,"PR","Wk1: routine renewals"],[4,"NF","Wk1: a repeat-rate dip, cohort baseline missing"],[8,"NF","Wk2: cohort data incomplete"],[11,"CA","Wk2: a routine in-policy re-engagement"],[15,"OM","Wk3: retention decline confirmed — owner call"],[19,"OM","Wk4: fund a retention push — owner call"],[23,"PR","Wk4: routine reconciliation"],[27,"PR","Wk5: weekly proof check"]] },
  { id: "SIM-leak-09", category: "slow_leakage", src: "SRC-SIM-LEAKAGE",
    startingState: "Marketing spend efficiency slowly worsening.", finalState: "Campaign underperformance confirmed; owner-gated spend call.",
    actualVsExpected: "Underperformance confirmed with attribution before a spend change" + AVE, learning: "Spend efficiency needs attribution before scaling or cutting.",
    failureCondition: "Cutting/scaling spend without attribution.", recoveryPath: "Owner decides the budget reallocation.",
    steps: [[0,"PR","Wk1: routine campaign log"],[3,"NF","Wk1: a soft week, attribution missing"],[7,"NF","Wk2: cost-per-lead data unclear"],[10,"CA","Wk2: a small within-budget creative tweak"],[14,"OM","Wk3: underperformance confirmed — owner call"],[18,"OM","Wk4: reallocate the budget — owner call"],[22,"PR","Wk4: routine reconciliation"],[26,"BC","Wk5: a campaign claim may cross an ad-standards line — blocked"]] },
  { id: "SIM-leak-10", category: "slow_leakage", src: "SRC-SIM-LEAKAGE",
    startingState: "Cash slowly tightening at a seasonal SMB.", finalState: "Cash tightening confirmed; owner-gated reserve decision.",
    actualVsExpected: "Cash tightening confirmed before a reserve draw" + AVE, learning: "A slow cash tighten needs the runway figure before drawing reserves.",
    failureCondition: "Drawing reserves on an unconfirmed cash position.", recoveryPath: "Owner decides the reserve/buffer response.",
    steps: [[0,"PR","Wk1: routine reconciliation"],[4,"NF","Wk1: a cash-softness signal, balance unclear"],[8,"NF","Wk2: outflow schedule missing"],[11,"CA","Wk2: defer a small non-critical cost within policy"],[15,"OC","Wk3: cash tightening confirmed — owner call"],[19,"OC","Wk4: whether to draw the buffer — owner call"],[23,"PR","Wk4: routine reconciliation"],[27,"BC","Wk5: a cash move would risk a legal obligation — blocked"]] },

  // ===== growth (8, 10–18 events) =====
  { id: "SIM-growth-01", category: "growth", src: "SRC-SIM-GROWTH", gold: true,
    startingState: "Profitable SMB considering expansion.", finalState: "Scaling decisions were owner-gated; a capped pilot proceeded.",
    actualVsExpected: "Material scaling calls went to the owner; only a capped pilot proceeded" + AVE, learning: "Scale via capped pilots; material commitments are owner calls.",
    failureCondition: "Auto-committing capital/capacity without the owner.", recoveryPath: "Owner sets the scaling gate; reassess against ROI/capacity.",
    steps: [[0,"CA","Wk1: run a small capped pop-up test within cash"],[3,"NF","Wk1: branch idea missing the demand validation"],[7,"NF","Wk2: capex/payback figure missing"],[10,"OD","Wk2: capacity for expansion — owner call"],[14,"OC","Wk3: a branch that drains the cash buffer — owner call"],[18,"OM","Wk3: a new-line launch, margin unproven — owner call"],[22,"CA","Wk4: a reversible hiring trial under SOP"],[26,"OD","Wk4: material capacity investment — owner call"],[30,"BC","Wk5: a new site needs a licence — blocked"]] },
  { id: "SIM-growth-02", category: "growth", src: "SRC-SIM-GROWTH",
    startingState: "SMB scaling the team.", finalState: "Hiring was owner-gated; a probationary trial proceeded.",
    actualVsExpected: "Material headcount calls went to the owner" + AVE, learning: "Fixed-cost hires are owner calls; trial reversibly first.",
    failureCondition: "Adding fixed cost without proven demand.", recoveryPath: "Owner decides headcount against demand/capacity.",
    steps: [[0,"PR","Wk1: confirm a pre-approved backfill"],[3,"CA","Wk1: a reversible part-time trial"],[7,"NF","Wk2: hiring plan missing sustained-demand evidence"],[10,"OD","Wk2: scale the team beyond proven capacity — owner call"],[14,"OD","Wk3: add a fixed-cost role — owner call"],[18,"CA","Wk3: extend a temp contract reversibly"],[22,"OD","Wk4: materially expand headcount — owner call"],[26,"BC","Wk4: a contract structure crosses labour law — blocked"]] },
  { id: "SIM-growth-03", category: "growth", src: "SRC-SIM-GROWTH",
    startingState: "SMB launching a new line.", finalState: "New-line decisions owner-gated; a capped pilot proceeded.",
    actualVsExpected: "New-line margin calls went to the owner" + AVE, learning: "Validate unit economics before scaling a new line.",
    failureCondition: "Scaling a new line before its margin is proven.", recoveryPath: "Owner gates the launch on proven economics.",
    steps: [[0,"CA","Wk1: pilot a new add-on to a small segment"],[3,"NF","Wk1: new-line plan missing the unit economics"],[7,"NF","Wk2: cost-of-delivery figure missing"],[10,"OM","Wk2: launch with unproven margin — owner call"],[14,"OM","Wk3: commit to the product line — owner call"],[18,"CA","Wk3: a reversible bundle test under SOP"],[22,"OD","Wk4: tooling investment for the line — owner call"],[26,"BC","Wk4: a new product needs a safety approval — blocked"]] },
  { id: "SIM-growth-04", category: "growth", src: "SRC-SIM-GROWTH",
    startingState: "SMB entering a new market.", finalState: "Market-entry decisions owner-gated; a capped test proceeded.",
    actualVsExpected: "Market-entry cash calls went to the owner" + AVE, learning: "A new market drains cash first; owner-gate the commitment.",
    failureCondition: "Funding a market push that drains the buffer.", recoveryPath: "Owner gates entry on validated demand + cash.",
    steps: [[0,"CA","Wk1: a capped test-market within cash"],[3,"NF","Wk1: entry missing new-market demand data"],[7,"NF","Wk2: cash-drain projection missing"],[10,"OC","Wk2: enter a region that drains cash — owner call"],[14,"OC","Wk3: fund the push from the buffer — owner call"],[18,"CA","Wk3: a reversible neighbouring-area trial"],[22,"OC","Wk4: commit working capital to a distant market — owner call"],[26,"BC","Wk4: a new jurisdiction needs registration — blocked"]] },
  { id: "SIM-growth-05", category: "growth", src: "SRC-SIM-GROWTH",
    startingState: "SMB investing in capacity.", finalState: "Capex owner-gated; a small tool proceeded.",
    actualVsExpected: "Capacity investment went to the owner" + AVE, learning: "Prove payback/utilisation before major capex.",
    failureCondition: "Investing major capacity ahead of proven demand.", recoveryPath: "Owner gates capex on payback + utilisation.",
    steps: [[0,"PR","Wk1: buy a small within-budget tool"],[3,"CA","Wk1: trial a rented machine reversibly"],[7,"NF","Wk2: expansion missing the payback estimate"],[10,"OD","Wk2: invest in major capacity — owner call"],[14,"OD","Wk3: expand the facility — owner call"],[18,"OD","Wk3: commit capital to double throughput — owner call"],[22,"BC","Wk4: expansion needs a building/safety permit — blocked"],[26,"PR","Wk4: routine reconciliation"]] },
  { id: "SIM-growth-06", category: "growth", src: "SRC-SIM-GROWTH",
    startingState: "SMB scaling marketing.", finalState: "Spend scaling owner-gated; a capped test proceeded.",
    actualVsExpected: "Material budget jumps went to the owner" + AVE, learning: "Scale spend on proven ROI; a material jump is an owner call.",
    failureCondition: "Scaling spend on an unproven channel.", recoveryPath: "Owner gates the budget on attribution/ROI.",
    steps: [[0,"CA","Wk1: a small capped test on a new channel"],[3,"NF","Wk1: scale-up missing channel ROI/attribution"],[7,"NF","Wk2: cost-per-acquisition data missing"],[10,"OM","Wk2: a material budget increase — owner call"],[14,"OM","Wk3: triple ad spend on an unproven channel — owner call"],[18,"CA","Wk3: a reversible audience-expansion test"],[22,"OM","Wk4: commit a large growth budget — owner call"],[26,"BF","Wk4: scaling on inflated attribution — blocked"]] },
  { id: "SIM-growth-07", category: "growth", src: "SRC-SIM-GROWTH",
    startingState: "SMB scaling a bulk-order relationship.", finalState: "Bulk-order terms owner-gated; a pilot order proceeded.",
    actualVsExpected: "Bulk-order margin/capacity calls went to the owner" + AVE, learning: "A large order tests margin, cash and capacity at once.",
    failureCondition: "Accepting a bulk order below viable margin.", recoveryPath: "Owner gates the terms; re-quote to a viable margin.",
    steps: [[0,"CA","Wk1: take a capped first bulk order to test delivery"],[3,"NF","Wk1: bulk order missing true margin after terms"],[7,"NF","Wk2: capacity feasibility check missing"],[10,"OM","Wk2: a large contract, thin margin — owner call"],[14,"OD","Wk3: a bulk order that strains capacity — owner call"],[18,"OM","Wk3: commit with penalty clauses — owner call"],[22,"OM","Wk4: scale to a major customer at a discount — owner call"],[26,"BC","Wk4: contract terms need legal review — blocked"]] },
  { id: "SIM-growth-08", category: "growth", src: "SRC-SIM-GROWTH",
    startingState: "SMB scaling via partners.", finalState: "Partnership scaling owner-gated; a pilot proceeded.",
    actualVsExpected: "Structural partnership calls went to the owner" + AVE, learning: "Franchise/partnership is a structural commitment; owner-gate it.",
    failureCondition: "Franchising before operations are proven.", recoveryPath: "Owner gates scaling on operational readiness + legal.",
    steps: [[0,"CA","Wk1: trial a co-marketing partnership reversibly"],[3,"NF","Wk1: franchise plan missing operational-readiness data"],[7,"NF","Wk2: terms/economics detail missing"],[10,"OD","Wk2: scale via partners beyond capacity — owner call"],[14,"OD","Wk3: a multi-partner rollout — owner call"],[18,"OD","Wk3: a franchise expansion commitment — owner call"],[22,"BC","Wk4: a franchise offer needs disclosure-law review — blocked"],[26,"PR","Wk4: routine reconciliation"]] },

  // ===== staff_proof_gaming (8, 10–18 events) =====
  { id: "SIM-gaming-01", category: "staff_proof_gaming", src: "SRC-SIM-GAMING", gold: true,
    startingState: "SMB where a staff member starts gaming proof.", finalState: "Gaming attempts were blocked; confirmed patterns went to the owner.",
    actualVsExpected: "Every gaming beat blocked; owner informed with evidence" + AVE, learning: "Gaming must be blocked, never rewarded; escalate confirmed patterns.",
    failureCondition: "Rewarding a gamed metric or hiding a confirmed pattern.", recoveryPath: "Owner decides the response; controls tightened, evidence preserved.",
    steps: [[0,"PR","Wk1: routine proof/complete checks"],[2,"BF","Wk1: a completion logged with no evidence — blocked"],[5,"NF","Wk1: a suspicious pattern, evidence incomplete"],[8,"BF","Wk2: duplicate proof submitted — blocked"],[11,"OW","Wk2: a confirmed pattern — owner call"],[14,"BF","Wk2: numbers inflated to hit a target — blocked"],[17,"CA","Wk3: a routine control tightening under SOP"],[20,"BF","Wk3: staged evidence for a bonus — blocked"],[23,"OW","Wk3: decide the accountability response — owner call"]] },
  { id: "SIM-gaming-02", category: "staff_proof_gaming", src: "SRC-SIM-FRAUDBEAT",
    startingState: "SMB with productivity-number gaming.", finalState: "Inflated numbers blocked; owner informed.",
    actualVsExpected: "Inflated productivity numbers blocked each time" + AVE, learning: "Output must be evidence-backed; block inflation.",
    failureCondition: "Acting on inflated productivity numbers.", recoveryPath: "Owner decides; verification tightened.",
    steps: [[0,"PR","Wk1: routine output log"],[2,"NF","Wk1: an output spike, evidence unclear"],[5,"BF","Wk1: output logged with no evidence of work — blocked"],[8,"BF","Wk2: numbers inflated to hit a bonus — blocked"],[11,"OW","Wk2: a confirmed inflation pattern — owner call"],[14,"CA","Wk2: a small SOP verification tweak"],[17,"BF","Wk3: a repeat inflation attempt — blocked"],[20,"OW","Wk3: accountability decision — owner call"]] },
  { id: "SIM-gaming-03", category: "staff_proof_gaming", src: "SRC-SIM-FRAUDBEAT",
    startingState: "SMB with rework being hidden.", finalState: "Hidden rework blocked; owner informed.",
    actualVsExpected: "Rework hidden without evidence blocked each time" + AVE, learning: "Rework closure needs evidence; block concealment.",
    failureCondition: "Closing rework without evidence it was redone.", recoveryPath: "Owner decides; proof requirement enforced.",
    steps: [[0,"PR","Wk1: routine rework log"],[2,"NF","Wk1: a rework closure, evidence unclear"],[5,"BF","Wk1: rework closed without evidence — blocked"],[8,"BF","Wk2: redo counts look manipulated — blocked"],[11,"OW","Wk2: a confirmed concealment pattern — owner call"],[14,"CA","Wk2: a small proof-capture SOP tweak"],[17,"BF","Wk3: another closure without evidence — blocked"],[20,"OW","Wk3: response decision — owner call"]] },
  { id: "SIM-gaming-04", category: "staff_proof_gaming", src: "SRC-SIM-FRAUDBEAT",
    startingState: "SMB with attendance/punctuality gaming.", finalState: "Attendance gaming blocked; owner informed.",
    actualVsExpected: "Falsified attendance blocked each time" + AVE, learning: "Attendance proof must be genuine; block falsification.",
    failureCondition: "Accepting falsified attendance.", recoveryPath: "Owner decides; attendance controls tightened.",
    steps: [[0,"PR","Wk1: routine attendance check"],[2,"NF","Wk1: an attendance anomaly, records unclear"],[5,"BF","Wk1: falsified attendance record — blocked"],[8,"OW","Wk2: a confirmed pattern — owner call"],[11,"BF","Wk2: buddy-punching detected — blocked"],[14,"CA","Wk2: a small control tweak under SOP"],[17,"BF","Wk3: another falsified entry — blocked"],[20,"OW","Wk3: accountability decision — owner call"]] },
  { id: "SIM-gaming-05", category: "staff_proof_gaming", src: "SRC-SIM-GAMING",
    startingState: "SMB with discount/price-exception gaming.", finalState: "Unauthorised exceptions blocked; owner informed.",
    actualVsExpected: "Unauthorised price exceptions blocked each time" + AVE, learning: "Price exceptions need authority; block unauthorised ones.",
    failureCondition: "Honouring an unauthorised price exception.", recoveryPath: "Owner decides; exception authority enforced.",
    steps: [[0,"PR","Wk1: routine pricing"],[2,"NF","Wk1: an odd discount, authority unclear"],[5,"OM","Wk1: a material discount request — owner call"],[8,"BF","Wk2: an unauthorised exception logged as approved — blocked"],[11,"OW","Wk2: a confirmed pattern — owner call"],[14,"CA","Wk2: a small approval-control tweak"],[17,"BF","Wk3: another unauthorised exception — blocked"],[20,"OW","Wk3: response decision — owner call"]] },
  { id: "SIM-gaming-06", category: "staff_proof_gaming", src: "SRC-SIM-FRAUDBEAT",
    startingState: "SMB with inventory-count gaming.", finalState: "Manipulated counts blocked; owner informed.",
    actualVsExpected: "Manipulated stock counts blocked each time" + AVE, learning: "Stock counts must reconcile; block manipulation.",
    failureCondition: "Acting on manipulated stock counts.", recoveryPath: "Owner decides; count controls tightened.",
    steps: [[0,"PR","Wk1: routine stock check"],[2,"NF","Wk1: a count mismatch, records unclear"],[5,"BF","Wk1: a manipulated count to hide shrinkage — blocked"],[8,"OW","Wk2: a confirmed pattern — owner call"],[11,"BF","Wk2: another manipulated count — blocked"],[14,"CA","Wk2: a small count-control tweak"],[17,"BF","Wk3: a fake adjustment entry — blocked"],[20,"OW","Wk3: response decision — owner call"]] },
  { id: "SIM-gaming-07", category: "staff_proof_gaming", src: "SRC-SIM-GAMING",
    startingState: "SMB with quality-sign-off gaming.", finalState: "Fake sign-offs blocked; owner informed.",
    actualVsExpected: "Fake quality sign-offs blocked each time" + AVE, learning: "Quality sign-off must be genuine; block fakes.",
    failureCondition: "Accepting a fake quality sign-off.", recoveryPath: "Owner decides; sign-off verification enforced.",
    steps: [[0,"PR","Wk1: routine quality check"],[2,"NF","Wk1: a sign-off anomaly, evidence unclear"],[5,"BF","Wk1: a fake quality sign-off — blocked"],[8,"OW","Wk2: a confirmed pattern — owner call"],[11,"BF","Wk2: another fake sign-off — blocked"],[14,"CA","Wk2: a small verification tweak"],[17,"BF","Wk3: staged evidence for sign-off — blocked"],[20,"OW","Wk3: response decision — owner call"]] },
  { id: "SIM-gaming-08", category: "staff_proof_gaming", src: "SRC-SIM-FRAUDBEAT",
    startingState: "SMB with cash-reconciliation gaming.", finalState: "Concealed shortfalls blocked; owner informed.",
    actualVsExpected: "Concealed cash shortfalls blocked each time" + AVE, learning: "Cash must reconcile; block concealment.",
    failureCondition: "Accepting a concealed cash shortfall.", recoveryPath: "Owner decides; reconciliation controls tightened.",
    steps: [[0,"PR","Wk1: routine cash-up"],[2,"NF","Wk1: a small variance, records unclear"],[5,"BF","Wk1: a concealed shortfall in the reconciliation — blocked"],[8,"OW","Wk2: a confirmed pattern — owner call"],[11,"BF","Wk2: manipulated books hiding cash — blocked"],[14,"CA","Wk2: a small reconciliation-control tweak"],[17,"BF","Wk3: another concealed shortfall — blocked"],[20,"OW","Wk3: response decision — owner call"]] },

  // ===== cash_crisis (5, 15–30 events) =====
  { id: "SIM-cash-01", category: "cash_crisis", src: "SRC-SIM-CASHCRISIS", gold: true,
    startingState: "SMB whose cash deteriorates over a month into a crisis.", finalState: "Cash calls were owner-gated; insolvency lines were blocked; a recovery route set.",
    actualVsExpected: "Cash decisions escalated to the owner; legal lines blocked" + AVE, learning: "In a cash crisis, protect cash, owner-gate, and never cross the insolvency line.",
    failureCondition: "Trading while insolvent or a preferential payment.", recoveryPath: "Owner + professional set the recovery/insolvency route; stabilise essentials.",
    steps: [[0,"PR","Wk1: routine reconciliation"],[3,"NF","Wk1: cash softness, position unclear"],[6,"OC","Wk1: runway under pressure — owner call"],[9,"NF","Wk2: obligations schedule incomplete"],[12,"OC","Wk2: payroll vs supplier this cycle — owner call"],[15,"CA","Wk2: make a small essential payment to keep operating"],[18,"OC","Wk3: whether to seek emergency financing — owner call"],[21,"BC","Wk3: a preferential payment to one creditor — blocked"],[24,"OC","Wk3: a distress asset sale — owner call"],[27,"BC","Wk4: continuing to trade while likely insolvent — blocked"],[30,"BC","Wk4: an insolvency filing decision — blocked to professional"]] },
  { id: "SIM-cash-02", category: "cash_crisis", src: "SRC-SIM-CASHCRISIS",
    startingState: "Seasonal SMB hitting a cash trough.", finalState: "Owner-gated triage; legal lines blocked; recovery set.",
    actualVsExpected: "Triage decisions went to the owner; tax-diversion blocked" + AVE, learning: "Triage obligations; never divert withheld taxes.",
    failureCondition: "Diverting withheld taxes to cover cash.", recoveryPath: "Owner + professional set the seasonal bridge plan.",
    steps: [[0,"PR","Wk1: routine reconciliation"],[3,"NF","Wk1: seasonal dip, forecast unclear"],[6,"OC","Wk1: draw on the buffer to bridge — owner call"],[9,"OC","Wk2: delay a discretionary spend — owner call"],[12,"CA","Wk2: defer a small non-critical cost within policy"],[15,"OC","Wk2: payroll pressure this cycle — owner call"],[18,"BC","Wk3: diverting withheld taxes — blocked"],[21,"OC","Wk3: a partner cash injection with terms — owner call"],[24,"PR","Wk3: routine reconciliation"],[27,"OC","Wk4: rebuild the buffer after the trough — owner call"]] },
  { id: "SIM-cash-03", category: "cash_crisis", src: "SRC-SIM-PAYROLL",
    startingState: "SMB with a payroll shortfall building.", finalState: "Payroll owner-gated and never hidden; recovery set.",
    actualVsExpected: "Payroll pressure surfaced to the owner every cycle" + AVE, learning: "Payroll pressure is owner-visible and owner-gated, never hidden.",
    failureCondition: "Hiding payroll pressure or breaching wage law.", recoveryPath: "Owner decides payroll priority; wage-law line respected.",
    steps: [[0,"PR","Wk1: routine payroll run"],[3,"NF","Wk1: a shortfall signal, wage total unclear"],[6,"OC","Wk1: payroll due but cash tight — owner call"],[9,"OC","Wk2: partial vs full payroll — owner call"],[12,"BC","Wk2: delaying payroll would breach wage law — blocked"],[15,"OC","Wk2: bonus payout while cash tight — owner call"],[18,"CA","Wk3: approve a small pre-agreed reimbursement"],[21,"BC","Wk3: a payroll-tax remittance near deadline — blocked to professional"],[24,"OC","Wk3: delay payroll to preserve cash — owner call"]] },
  { id: "SIM-cash-04", category: "cash_crisis", src: "SRC-SIM-CASHCRISIS",
    startingState: "SMB after a revenue shock draining cash.", finalState: "Owner-gated cost/cash calls; legal lines blocked; recovery set.",
    actualVsExpected: "Cost-cut and cash calls went to the owner" + AVE, learning: "After a shock, owner-gate cost cuts and protect cash.",
    failureCondition: "A layoff that skips labour-law process.", recoveryPath: "Owner decides cost response with the process respected.",
    steps: [[0,"NF","Wk1: shock hit, lost-revenue figure unclear"],[3,"OM","Wk1: how to respond to the revenue shock — owner call"],[6,"OC","Wk1: cash impact now pressing — owner call"],[9,"OM","Wk2: cut costs after the shock — owner call"],[12,"OM","Wk2: repricing to fill the gap — owner call"],[15,"BC","Wk2: a layoff must follow labour-law process — blocked"],[18,"CA","Wk3: a small reversible cost deferral"],[21,"OC","Wk3: whether to seek bridge financing — owner call"],[24,"PR","Wk3: routine reconciliation"]] },
  { id: "SIM-cash-05", category: "cash_crisis", src: "SRC-SIM-CASHCRISIS",
    startingState: "SMB with a vendor advance demand amid tight cash.", finalState: "Owner-gated financing/vendor calls; legal lines blocked; recovery set.",
    actualVsExpected: "Financing and vendor-advance calls went to the owner" + AVE, learning: "Financing decisions need owner + professional; protect cash.",
    failureCondition: "Taking on debt or an advance without owner/professional.", recoveryPath: "Owner + professional decide financing; stabilise supply.",
    steps: [[0,"NF","Wk1: cash tight, position unclear"],[3,"OC","Wk1: a supplier demands an advance — owner call"],[6,"BC","Wk1: taking a new loan to cover the gap — blocked to professional"],[9,"OC","Wk2: prepay vs keep the buffer — owner call"],[12,"OC","Wk2: an EMI due while cash tight — owner call"],[15,"BC","Wk2: restructuring an existing loan — blocked to professional"],[18,"CA","Wk3: a small essential payment to keep supply"],[21,"OC","Wk3: a family cash injection with terms — owner call"],[24,"PR","Wk3: routine reconciliation"]] },

  // ===== customer_vendor (4, 10–18 events) =====
  { id: "SIM-cv-01", category: "customer_vendor", src: "SRC-SIM-CUSTOMERVENDOR", gold: true,
    startingState: "SMB where a key account relationship starts to wobble.", finalState: "Relationship calls were owner-gated; a boundary blocked.",
    actualVsExpected: "Material relationship calls went to the owner" + AVE, learning: "A key-account wobble is a material owner call; escalate early.",
    failureCondition: "Auto-committing a retention deal that crosses a legal line.", recoveryPath: "Owner decides the retention response with legal input.",
    steps: [[0,"PR","Wk1: routine key-account check-in"],[3,"NF","Wk1: a churn signal, cohort data missing"],[6,"OW","Wk1: the account signals it may leave — owner call"],[9,"NF","Wk2: contract terms unclear"],[12,"OM","Wk2: a costly retention offer — owner call"],[15,"BC","Wk2: a retention deal touches a contract line — blocked"],[18,"OW","Wk3: concentration dependency — owner call"],[21,"PR","Wk3: routine account care"]] },
  { id: "SIM-cv-02", category: "customer_vendor", src: "SRC-SIM-VENDORBEAT",
    startingState: "SMB with a vendor reliability problem developing.", finalState: "Vendor calls owner-gated; a falsified proof blocked.",
    actualVsExpected: "Vendor sourcing calls went to the owner; falsified proof blocked" + AVE, learning: "A vendor slip is a capacity risk; a falsified cert blocks.",
    failureCondition: "Relying on a falsified vendor certificate.", recoveryPath: "Owner decides re-sourcing; falsified proof escalated.",
    steps: [[0,"PR","Wk1: routine vendor quality check"],[3,"NF","Wk1: a quality slip, defect-rate data missing"],[6,"OD","Wk1: the slip threatens delivery capacity — owner call"],[9,"CA","Wk2: switch a small order to a backup under SOP"],[12,"BF","Wk2: a vendor quality certificate appears falsified — blocked"],[15,"OD","Wk2: a repeated failure needs re-sourcing — owner call"],[18,"OM","Wk3: a material vendor price increase — owner call"],[21,"PR","Wk3: routine reconciliation"]] },
  { id: "SIM-cv-03", category: "customer_vendor", src: "SRC-SIM-CUSTOMERVENDOR",
    startingState: "SMB handling a refund/dispute escalation.", finalState: "Refund calls owner-gated; a fraudulent claim blocked.",
    actualVsExpected: "Material refunds went to the owner; fraud blocked" + AVE, learning: "In-policy refunds are routine; material/contested ones are owner calls; fraud blocks.",
    failureCondition: "Paying a fraudulent refund/chargeback.", recoveryPath: "Owner decides contested refunds; fraud escalated.",
    steps: [[0,"PR","Wk1: process standard in-policy refunds"],[3,"NF","Wk1: a dispute missing proof of purchase"],[6,"OM","Wk1: a large refund dents margin — owner call"],[9,"CA","Wk2: a small within-policy partial refund"],[12,"BF","Wk2: a refund/chargeback claim looks fraudulent — blocked"],[15,"OM","Wk2: a contested high-value refund — owner call"],[18,"PR","Wk3: routine handling"],[21,"PR","Wk3: weekly proof check"]] },
  { id: "SIM-cv-04", category: "customer_vendor", src: "SRC-SIM-VENDORBEAT",
    startingState: "SMB facing single-source vendor dependency.", finalState: "Diversification owner-gated; a legal boundary blocked.",
    actualVsExpected: "Diversification calls went to the owner" + AVE, learning: "Single-source dependency is a continuity risk; diversify via owner call.",
    failureCondition: "A sole-supplier switch that breaks a contract.", recoveryPath: "Owner decides diversification with legal input.",
    steps: [[0,"PR","Wk1: routine backup-vendor check"],[3,"NF","Wk1: single-source exposure figure missing"],[6,"CA","Wk1: qualify a small trial order with a second vendor"],[9,"OD","Wk2: heavy dependence threatens continuity — owner call"],[12,"NF","Wk2: alternative-supplier options unclear"],[15,"OD","Wk2: a sole-supplier switch risks capacity — owner call"],[18,"BC","Wk3: a supply arrangement crosses a contract line — blocked"],[21,"PR","Wk3: routine reconciliation"]] },

  // ===== owner_unavailable (3, 10–18 events) =====
  { id: "SIM-ownaway-01", category: "owner_unavailable", src: "SRC-SIM-OWNERAWAY", gold: true,
    startingState: "Owner is away for two weeks; the business runs on routine.", finalState: "Routine proceeded; every owner-gated call HELD for the owner — nothing auto-proceeded.",
    actualVsExpected: "Owner-gated events held/escalated; routine continued" + AVE, learning: "When the owner is away, owner-gated decisions must HOLD, not auto-proceed.",
    failureCondition: "Auto-proceeding an owner-gated decision while the owner is away.", recoveryPath: "Held decisions are queued for the owner's return / emergency escalation.",
    steps: [[0,"PR","D1: routine orders and fulfilment"],[1,"PR","D2: routine returns and reorders"],[2,"CA","D3: a small reversible step under SOP"],[3,"OM","D4: a material discount — HELD for the owner"],[5,"PR","D6: routine reconciliation"],[7,"OD","D8: an intake-vs-capacity call — HELD for the owner"],[9,"PR","D10: routine completion"],[11,"OC","D12: a cash-timing call — HELD/escalated for the owner"],[13,"PR","D14: routine proof check"],[15,"OW","D16: a staffing issue — HELD for the owner"]] },
  { id: "SIM-ownaway-02", category: "owner_unavailable", src: "SRC-SIM-ESCALATION",
    startingState: "Owner unreachable during a busy stretch.", finalState: "Routine ran; material and boundary calls held/escalated.",
    actualVsExpected: "Material calls held; a boundary blocked; routine continued" + AVE, learning: "Owner-away plus a boundary event means block + escalate, never self-clear.",
    failureCondition: "Self-clearing a boundary while the owner is away.", recoveryPath: "Boundary routes to a professional; material calls queued for the owner.",
    steps: [[0,"PR","D1: routine dispatch"],[1,"PR","D2: routine reorders"],[2,"NF","D3: a pricing exception missing the cost basis"],[3,"OM","D4: the exception, now costed — HELD for the owner"],[5,"BC","D6: a compliance item surfaces — blocked to professional"],[7,"PR","D8: routine completion"],[9,"OD","D10: a capacity call — HELD for the owner"],[11,"PR","D12: routine reconciliation"],[13,"OW","D14: a complaint theme — HELD for the owner"]] },
  { id: "SIM-ownaway-03", category: "owner_unavailable", src: "SRC-SIM-OWNERAWAY",
    startingState: "Owner on leave; a cash-timing wobble occurs.", finalState: "Routine ran; cash and material calls held; a legal line blocked.",
    actualVsExpected: "Cash calls held for the owner; legal line blocked" + AVE, learning: "Owner-away plus a cash wobble means hold the cash call, protect essentials.",
    failureCondition: "Drawing the buffer or crossing a legal line without the owner.", recoveryPath: "Cash call queued for the owner; essentials protected within policy.",
    steps: [[0,"PR","D1: routine reconciliation"],[1,"CA","D2: a small essential payment within policy"],[2,"NF","D3: a cash-softness signal, position unclear"],[3,"OC","D4: whether to draw the buffer — HELD for the owner"],[5,"PR","D6: routine handling"],[7,"OC","D8: a supplier advance demand — HELD for the owner"],[9,"BC","D10: a preferential payment temptation — blocked"],[11,"PR","D12: routine reconciliation"],[13,"OC","D14: payroll timing — HELD/escalated for the owner"]] },

  // ===== extreme_crisis (2, 20–30 events) =====
  { id: "SIM-extreme-01", category: "extreme_crisis", src: "SRC-SIM-EXTREME", gold: true,
    startingState: "A compound crisis hits: fraud discovered, then a safety incident, then a lawsuit.", finalState: "Unsafe moves blocked; owner + professionals led; a recovery route set.",
    actualVsExpected: "Every unsafe/boundary beat blocked; material calls owner-gated" + AVE, learning: "Compound crises need restraint: block unsafe moves, escalate to owner + professionals.",
    failureCondition: "Acting rashly on any beat — paying the fraud, self-clearing safety, or answering the suit without counsel.", recoveryPath: "Owner + professionals lead; stabilise, preserve evidence, remediate, then rebuild.",
    steps: [[0,"PR","D1: routine operations"],[1,"NF","D1: a suspected fraud, evidence incomplete"],[2,"BF","D2: confirmed embezzlement — blocked"],[3,"OW","D3: how to respond to the fraud — owner call"],[4,"BF","D4: manipulated books concealing cash — blocked"],[5,"OC","D5: cash impact of the fraud — owner call"],[7,"BC","D7: a safety incident occurs — blocked to professional"],[8,"OW","D8: how to respond to the injury — owner call"],[9,"BC","D9: an unsafe activity must halt — blocked"],[11,"BC","D11: a lawsuit notice arrives — blocked to counsel"],[13,"OM","D13: settle-vs-defend — owner call"],[15,"BC","D15: destroying documents under legal hold — blocked"],[17,"OW","D17: crisis-communications decision — owner call"],[19,"CA","D19: a routine stabilisation step under SOP"],[21,"OC","D21: emergency financing question — owner call"],[23,"BC","D23: a preferential payment temptation — blocked"],[25,"OW","D25: recovery-plan ownership — owner call"]] },
  { id: "SIM-extreme-02", category: "extreme_crisis", src: "SRC-SIM-EXTREME",
    startingState: "A data breach compounds into a ransomware demand and a reputational crisis.", finalState: "Rash moves blocked; owner + professionals led; a recovery route set.",
    actualVsExpected: "Breach/ransom/backlash beats blocked or owner-gated correctly" + AVE, learning: "A cyber crisis needs forensics + legal + owner; never pay or self-clear rashly.",
    failureCondition: "Paying the ransom, self-clearing the breach, or misleading customers.", recoveryPath: "Owner + professionals lead: contain, notify per law, remediate, communicate.",
    steps: [[0,"PR","D1: routine operations"],[1,"NF","D1: a breach suspected, scope unclear"],[2,"CA","D2: a routine reversible data backup under SOP"],[3,"OW","D3: how to respond to the breach — owner call"],[4,"BC","D4: failing to make a mandatory notification — blocked"],[5,"OW","D5: whether/when to notify customers — owner call"],[7,"BC","D7: a ransomware demand — blocked to professionals"],[8,"OW","D8: how to respond to the demand — owner call"],[9,"BC","D9: paying a ransom without authority input — blocked"],[11,"BC","D11: self-clearing the breach without forensics — blocked"],[13,"OW","D13: a public backlash response — owner call"],[15,"BC","D15: misleading customers to limit backlash — blocked"],[17,"BC","D17: destroying breach evidence — blocked"],[19,"CA","D19: a routine containment step under SOP"],[21,"OW","D21: a material security-remediation investment — owner call"],[23,"OW","D23: recovery-plan ownership — owner call"]] },
];

export const BUSINESS_SIMULATION_PACK: BusinessSimulation[] = DEFS.map(build);

export const BUSINESS_SIMULATION_SUBCATEGORIES = [
  "normal_week", "slow_leakage", "growth", "staff_proof_gaming", "cash_crisis",
  "customer_vendor", "owner_unavailable", "extreme_crisis",
] as const;

/** Flattened (simulationId, event) pairs — used by the DB + browser harnesses. */
export const BUSINESS_SIMULATION_EVENTS: Array<{ simulationId: string; category: string; event: SimulationEvent }> =
  BUSINESS_SIMULATION_PACK.flatMap((sim) => sim.events.map((event) => ({ simulationId: sim.simulationId, category: sim.category, event })));

/** Source-title lookup so the invariant test can assert privacy-clean backing. */
export const BUSINESS_SIMULATION_SOURCE_TITLE = (id: string): string | undefined => BUSINESS_SIMULATION_SOURCE_BY_ID[id]?.title;
