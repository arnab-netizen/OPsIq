/**
 * OWNER-ON-SHIP SHADOW PILOT — a thin, PURE derivation over the EXISTING owner runtime (whole-business plan
 * + ingestion confidence + input guidance + supervisor summary + readiness). It does NOT introduce a new
 * engine, service, or model. It reframes what the runtime already produced for an owner who has only PARTIAL
 * real data and is briefly "on ship" (unavailable): it separates verified facts from assumptions, lists the
 * safe prep work that can proceed now vs what must wait for the owner, produces an intake checklist and a
 * first-7-day return plan, estimates owner workload, and REFUSES any live-outcome claim.
 *
 * Pure: no DB, no Date.now, no model. The caller maps a real `getOwnerWholeBusinessPlan` view into the input.
 */
import { highestSupportedState, type ReadinessState } from "./pilot-readiness-policy";

export type OwnerActionStatus = "blocked" | "need_more_data" | "owner_decision_required" | "cautious_proceed" | "proceed";

/** The minimal slice of the existing runtime output a shadow pilot needs. All fields come from the runtime. */
export interface ShadowPilotInput {
  businessName: string;
  /** Domains backed by REAL persisted data (verified facts). */
  realProviderDomains: string[];
  /** Critical domains with NO real data yet (assumptions / must-capture). */
  missingCriticalDomains: string[];
  overallConfidence: "none" | "low" | "medium" | "high";
  criticalDomainsAllReal: boolean;
  supervisor: {
    actionStatus: OwnerActionStatus;
    doNow: string;
    doNotDo: string[];
    proofNeeded: string[];
    ownerDecisionRequired: string | null;
    delegateToStaff: string[];
    opsiqPreparedWork: string[];
  };
  /** Ranked next-best data requests already produced by input-guidance (highest-value first). */
  rankedDataRequests: string[];
  /** Owner-workload signal already computed by the runtime (e.g. daily load %, band). */
  ownerWorkloadNote: string;
}

export interface ShadowPilotReport {
  mode: "shadow_pilot";
  businessName: string;
  /** Domains with REAL data — stated as facts. */
  verifiedFacts: string[];
  /** Domains without real data — stated explicitly as assumptions, never as facts. */
  assumptions: string[];
  missingCriticalData: string[];
  /** Top data to capture, ranked, with who should provide it. */
  dataRequests: Array<{ request: string; provider: "owner" | "staff" | "opsiq" }>;
  /** Safe work OpsIQ + staff can carry now (never a blocked/owner-gated action). */
  prepNow: string[];
  /** Items that must WAIT for the owner's return / decision. */
  waitForOwner: string[];
  intakeChecklist: string[];
  first7DayPlan: string;
  ownerWorkloadEstimate: string;
  /** Runtime confidence, passed through — partial data never inflates it. */
  confidence: ShadowPilotInput["overallConfidence"];
  /** HARD: a shadow pilot can never claim a live outcome. */
  liveOutcomeClaim: false;
  /** The honest system readiness state for a shadow pilot with real intake but no live outcome. */
  honestReadinessState: ReadinessState;
}

const DOMAIN_LABEL: Record<string, string> = {
  finance_cash: "cash & finance", margin_pricing: "margin & pricing", working_capital: "working capital",
  equipment_capacity: "capacity", compliance_proof: "compliance & proof", owner_workload_memory: "owner workload",
  opportunity_contract: "opportunities/contracts", customer_reputation: "customer & reputation",
};
const label = (d: string) => DOMAIN_LABEL[d] ?? d.replace(/_/g, " ");

/** Who should provide a given data request (owner for finance/compliance/contract; staff for ops; else opsiq). */
function providerFor(request: string): "owner" | "staff" | "opsiq" {
  const r = request.toLowerCase();
  if (/financ|cash|margin|pricing|contract|complian|licen|tax|working capital/.test(r)) return "owner";
  if (/staff|capacity|equipment|operation|delivery|process|complaint|rework|quality/.test(r)) return "staff";
  return "opsiq";
}

/**
 * Build the shadow-pilot report from EXISTING runtime output. Deterministic; partial data never becomes fake
 * certainty; blocked / owner-decision items always route to `waitForOwner`; no live-outcome claim is made.
 */
export function buildShadowPilotReport(input: ShadowPilotInput): ShadowPilotReport {
  const verifiedFacts = input.realProviderDomains.map((d) => `Verified: ${label(d)} is backed by real records.`);
  const assumptions = input.missingCriticalDomains.map((d) => `Assumption (unverified): ${label(d)} — no real records yet; treat as a gap, not a fact.`);

  const dataRequests = input.rankedDataRequests.slice(0, 3).map((request) => ({ request, provider: providerFor(request) }));

  // Safe prep = the work OpsIQ/staff can prepare now, ONLY when the action is not blocked/owner-gated.
  const gated = input.supervisor.actionStatus === "blocked" || input.supervisor.actionStatus === "owner_decision_required";
  const prepNow: string[] = [];
  if (!gated && input.supervisor.actionStatus !== "need_more_data") prepNow.push(input.supervisor.doNow);
  prepNow.push(...input.supervisor.opsiqPreparedWork);
  prepNow.push(...input.supervisor.delegateToStaff.map((s) => `Delegate (with proof): ${s}`));

  // Wait-for-owner = anything gated on the owner's decision or blocked pending review, plus do-not-do fences.
  const waitForOwner: string[] = [];
  if (input.supervisor.ownerDecisionRequired) waitForOwner.push(`Owner decision required: ${input.supervisor.ownerDecisionRequired}`);
  if (input.supervisor.actionStatus === "blocked") waitForOwner.push("Blocked pending review — do not proceed until the owner/professional review clears it.");
  waitForOwner.push(...input.supervisor.doNotDo.map((d) => `Hold: ${d}`));

  const intakeChecklist = [
    ...input.missingCriticalDomains.map((d) => `Capture real ${label(d)} records.`),
    ...input.supervisor.proofNeeded.map((p) => `Set up proof: ${p}`),
  ];

  const first7DayPlan = gated || !input.criticalDomainsAllReal
    ? "Days 1–7: capture the missing critical records and prepare (do not act on gated items); the owner reviews owner-decision items on return."
    : "Days 1–7: run the safe prepared step with proof, then reassess against the stated trigger.";

  return {
    mode: "shadow_pilot",
    businessName: input.businessName,
    verifiedFacts,
    assumptions,
    missingCriticalData: input.missingCriticalDomains.map(label),
    dataRequests,
    prepNow: prepNow.filter(Boolean),
    waitForOwner: waitForOwner.filter(Boolean),
    intakeChecklist,
    first7DayPlan,
    ownerWorkloadEstimate: input.ownerWorkloadNote,
    confidence: input.overallConfidence,
    liveOutcomeClaim: false,
    // Shadow pilot with real partial intake + DB/browser proof ⇒ SHADOW_PILOT_READY; never a live outcome.
    honestReadinessState: highestSupportedState({
      hasSimulationProof: true, hasDbBrowserProof: true, hasFullMobileProof: false,
      hasShadowPilotIntake: input.realProviderDomains.length > 0,
      hasLiveBusinessData: false, hasRealDates: false, hasBeforeAfterMetrics: false, ownerWaiver: false, publicSaasApproved: false,
    }),
  };
}
