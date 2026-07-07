/**
 * Canonical long-running business timeline (PASS 47) — 8 simulated weeks for a
 * laundry/local-service business. This is the single executable source of the
 * timeline; docs/real-world-data/long-running-business-timeline/*.json mirror it.
 *
 * The narrative (baseline messy → complaints rise → cash pressure → owner-approved
 * correction → evidence-backed staff task → reassessment improves one area while
 * another worsens → a growth temptation blocked during instability → SOP/training
 * correction → owner-load delegation → cash data collected → recovery advances →
 * regression → loop-back correction → stabilization proven only after evidence →
 * thrive gate eligible only after stabilization proof) is expressed purely as data;
 * every decision is computed by the real engines in business-timeline-simulation.ts.
 *
 * No fabricated money/ROI/profit. Placeholders only (CUSTOMER_001, VENDOR_A, STAFF_A).
 */

import type { TimelineEvent } from "@/domain/execution/business-timeline-simulation";

const OPS_KEY = "survival:ops";
const MARKETING_KEY = "survival:marketing-push";
const TENDER_KEY = "survival:tender-bid";
const CUSTOMER_KEY = "survival:customer";
const CASH_MISSING = "verified cash position and runway";
const TENDER_MISSING = "tender eligibility documents, cost/margin fit, capacity, and EMD affordability";

export const LONG_RUNNING_TIMELINE: TimelineEvent[] = [
  // ── Week 1: baseline messy state ──────────────────────────────────────────
  {
    id: "e01", week: 1, kind: "baseline",
    label: "Baseline: messy operation — some complaints, moderate owner load, cash figure unknown",
    pressureChanges: { customer: "MEDIUM", quality: "MEDIUM", operational: "LOW", ownerWorkload: "MEDIUM" },
    addMissingData: [CASH_MISSING], flags: { complaintsRising: true },
  },
  {
    id: "e02", week: 1, kind: "complaint",
    label: "First customer complaints logged (CUSTOMER_001) — redacted, placeholder only",
  },

  // ── Week 2: complaints rise ───────────────────────────────────────────────
  { id: "e03", week: 2, kind: "complaint", label: "Complaints rising — customer pressure to HIGH", pressureChanges: { customer: "HIGH" } },
  { id: "e04", week: 2, kind: "quality_defect", label: "Repeated quality defect on the wash/press step", pressureChanges: { quality: "HIGH" } },
  { id: "e05", week: 2, kind: "complaint", label: "Another complaint — reputation pressure sustained" },

  // ── Week 3: cash pressure appears ─────────────────────────────────────────
  { id: "e06", week: 3, kind: "cash_pressure", label: "Cash pressure appears — cash to HIGH; top action shifts to cash protection", pressureChanges: { cash: "HIGH" } },
  {
    id: "e07", week: 3, kind: "cash_pressure",
    label: "Missing cash-runway data recurs (2nd time) — escalates to an owner data decision",
    addMissingData: [CASH_MISSING],
  },
  { id: "e08", week: 3, kind: "owner_reject", label: "Owner DECLINES an expensive marketing push (recorded in memory)", ownerRejectKey: MARKETING_KEY },

  // ── Week 4: owner approves correction; staff task completed with evidence ──
  { id: "e09", week: 4, kind: "owner_approve", label: "Owner APPROVES the stop-loss + quality correction" },
  {
    id: "e10", week: 4, kind: "staff_task_completed_with_evidence",
    label: "STAFF_A completes the stop-loss + quality correction WITH evidence; cash eases to MEDIUM, quality to MEDIUM",
    pressureChanges: { cash: "MEDIUM", quality: "MEDIUM" }, reassessment: true,
  },
  { id: "e11", week: 4, kind: "reassessment", label: "Reassessment cycle: customer pressure improving to MEDIUM", pressureChanges: { customer: "MEDIUM" }, reassessment: true },

  // ── Week 5: one area improves, another worsens; a correction fails ────────
  { id: "e12", week: 5, kind: "reassessment", label: "Reassessment confirms quality corrected (to LOW)", pressureChanges: { quality: "LOW" }, reassessment: true },
  { id: "e13", week: 5, kind: "area_worsens", label: "VENDOR_A machine breakdown — operational pressure worsens to HIGH (staff task opened)", pressureChanges: { operational: "HIGH" } },
  { id: "e14", week: 5, kind: "failed_correction", label: "First operational fix FAILS (recorded as a failed action)", failActionKey: OPS_KEY },
  {
    id: "e15", week: 5, kind: "repeat_failed_attempt",
    label: "OpsIQ REFUSES to repeat the failed ops fix without new evidence (memory blocks it)",
    probeKey: OPS_KEY,
  },

  // ── Week 6: growth temptation appears during instability ──────────────────
  {
    id: "e16", week: 6, kind: "opportunity_appears",
    label: "A tender opportunity appears (temptation) during instability",
    temptation: "TENDER", addMissingData: [TENDER_MISSING],
  },
  { id: "e17", week: 6, kind: "growth_block_check", label: "OpsIQ BLOCKS growth/scale until stabilization is proven" },
  { id: "e18", week: 6, kind: "owner_reject", label: "Owner DECLINES to bid the tender now (recorded); tender eligibility data recurs", ownerRejectKey: TENDER_KEY, addMissingData: [TENDER_MISSING] },

  // ── Week 7: SOP/training correction; delegation; cash data; recovery ──────
  { id: "e19", week: 7, kind: "sop_training_run", label: "SOP/training correction RUNS (staff coaching, never blame); staff capacity eases to LOW", pressureChanges: { staffCapacity: "LOW" } },
  {
    id: "e20", week: 7, kind: "cash_data_collected",
    label: "Owner collects the REAL cash/runway figure (never assumed); cash eases to LOW",
    constraints: { cashRunwayKnown: true }, flags: { cashDataCollected: true },
    pressureChanges: { cash: "LOW" }, clearMissingData: [CASH_MISSING], reassessment: true,
  },
  { id: "e21", week: 7, kind: "delegation", label: "Owner delegates recurring firefighting — owner workload eases to LOW", pressureChanges: { ownerWorkload: "LOW" }, flags: { delegationInPlace: true } },
  {
    id: "e22", week: 7, kind: "recovery_milestone",
    label: "Ops resolved WITH evidence — new evidence UNBLOCKS the previously-failed ops fix",
    pressureChanges: { operational: "LOW" }, evidenceForKey: OPS_KEY,
    probeKey: OPS_KEY, probeChangedContextReason: "VENDOR_A SLA fixed and the step was re-inspected with completion evidence",
  },
  { id: "e23", week: 7, kind: "reassessment", label: "Reassessment: recovery advancing — customer pressure to LOW", pressureChanges: { customer: "LOW" }, reassessment: true },

  // ── Week 8: regression → loop-back → stabilization proof → thrive gate ────
  { id: "e24", week: 8, kind: "regression", label: "REGRESSION: complaints spike again after apparent improvement", pressureChanges: { customer: "HIGH" }, flags: { complaintsRising: true } },
  { id: "e25", week: 8, kind: "weak_proof_submitted", label: "A WEAK proof is submitted — NOT accepted; stabilization stays unproven" },
  { id: "e26", week: 8, kind: "loop_back_correction", label: "OpsIQ LOOPS BACK to correction instead of declaring success", reassessment: true },
  {
    id: "e27", week: 8, kind: "staff_task_completed_with_evidence",
    label: "Re-correction completed WITH evidence; complaints stop rising, customer to LOW",
    pressureChanges: { customer: "LOW" }, flags: { complaintsRising: false }, evidenceForKey: CUSTOMER_KEY,
  },
  {
    id: "e28", week: 8, kind: "stabilization_proven",
    label: "Stabilization PROVEN only after evidence (cash measured, customer corrected, ops resolved)",
    constraints: { stabilizationProven: true }, temptation: "NONE",
    clearMissingData: [TENDER_MISSING], reassessment: true,
  },
  { id: "e29", week: 8, kind: "resuggest_rejected_attempt", label: "Owner-declined marketing is NOT re-suggested unchanged (memory blocks it)", probeKey: MARKETING_KEY },
  {
    id: "e30", week: 8, kind: "thrive_eligibility_check",
    label: "Thrive gate becomes eligible only AFTER stabilization proof AND the SOP/manager layer is proven working",
    flags: { sopCorrectionProven: true, revenueImproving: true },
  },
  { id: "e31", week: 8, kind: "owner_approve_growth_experiment", label: "Owner APPROVES a controlled growth experiment — still owner-gated, opportunity still validated", temptation: "GROWTH" },

  // ── Clean control: a separate business with no events fabricates nothing ──
  { id: "e32", week: 8, kind: "clean_control", label: "Clean control: a business with no events — no crisis, nothing fabricated" },
];

/** Timeline shape constants asserted by the tests and mirrored in the JSON fixtures. */
export const TIMELINE_SHAPE = {
  weeks: 8,
  totalEvents: LONG_RUNNING_TIMELINE.length,
  reassessmentCycles: LONG_RUNNING_TIMELINE.filter((e) => e.reassessment).length,
  keys: { OPS_KEY, MARKETING_KEY, TENDER_KEY, CUSTOMER_KEY },
  missing: { CASH_MISSING, TENDER_MISSING },
} as const;
