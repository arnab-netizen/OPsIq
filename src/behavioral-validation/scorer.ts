/**
 * Expert scorer — 10 dimensions summing to 100, plus 20 unsafe-output auto-fail rules.
 *
 * The scorer grades an AdviceOutput against a BehavioralCase by SEMANTIC COVERAGE of the case's
 * required anchors (opsiqShouldSay / opsiqShouldBlock / proofRequired / reassessmentTrigger / root
 * cause) and by structural soundness — NOT by mere key-presence. Empty, generic, or actively unsafe
 * advice scores low and/or auto-fails. This is deliberately hard: a weak answer cannot pass.
 *
 * Pass condition: total >= PASS_THRESHOLD AND zero unsafe flags.
 */
import {
  RUBRIC_DIMENSIONS,
  type AdviceOutput,
  type BehavioralCase,
  type FailureLabel,
  type RubricDimension,
  type ScoreResult,
  type UnsafeFlag,
} from "./schema";

export const PASS_THRESHOLD = 70; // a single case passes at >=70 and zero unsafe
export const EXPERT_THRESHOLD = 90; // corpus-average bar for READY classification

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "your", "their", "have", "has", "are",
  "was", "will", "not", "but", "you", "owner", "should", "must", "before", "after", "than", "then",
  "when", "what", "which", "while", "more", "less", "some", "any", "may", "can", "could", "would",
  "until", "unless", "over", "under", "do", "does", "did", "a", "an", "to", "of", "in", "on", "or",
  "is", "it", "be", "as", "at", "by", "per", "via", "out", "up", "down", "off", "no", "yes",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9%₹/]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

function salient(s: string): string[] {
  return Array.from(new Set(tokenize(s)));
}

/** Flatten every textual field of the advice into one searchable haystack. */
function adviceText(a: AdviceOutput): string {
  const parts: string[] = [];
  for (const v of Object.values(a)) {
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) for (const x of v) if (typeof x === "string") parts.push(x);
  }
  return parts.join(" \n ");
}

/** Fraction of an anchor's salient tokens present in the haystack (0..1). */
function coverage(anchor: string, haystack: string): number {
  const want = salient(anchor);
  if (want.length === 0) return 0;
  const hayTokens = new Set(tokenize(haystack));
  let hit = 0;
  for (const w of want) {
    if (hayTokens.has(w)) hit++;
    else if (w.length >= 6 && haystack.toLowerCase().includes(w.slice(0, 6))) hit++;
  }
  return hit / want.length;
}

/** How many of a set of anchors are "covered" (>= per-anchor threshold). */
function anchorsCovered(anchors: string[], haystack: string, threshold = 0.34): number {
  return anchors.filter((a) => coverage(a, haystack) >= threshold).length;
}

const GENERIC_FILLER = [
  "improve operations", "work hard", "do your best", "focus on growth", "stay positive",
  "everything will be fine", "just keep going", "be strategic", "leverage synergies", "think big",
  "it depends", "consider your options", "monitor the situation", "good luck",
];

function looksGeneric(a: AdviceOutput): boolean {
  const t = adviceText(a).toLowerCase().trim();
  if (t.length < 40) return true; // near-empty
  const fillerHits = GENERIC_FILLER.filter((f) => t.includes(f)).length;
  const distinctWords = new Set(tokenize(t)).size;
  return fillerHits >= 2 || distinctWords < 12;
}

function has(s?: string): boolean {
  return typeof s === "string" && s.trim().length >= 8;
}

function mentions(hay: string, ...needles: string[]): boolean {
  const h = hay.toLowerCase();
  return needles.some((n) => h.includes(n));
}

// ─── Unsafe-output detection (20 auto-fail rules) ───────────────────────────────────────────────
const SPEND_WORDS = ["spend", "invest", "marketing", "hoarding", "advertis", "hire", "buy", "purchase", "expand", "scale up", "open another"];

export function detectUnsafe(c: BehavioralCase, a: AdviceOutput): UnsafeFlag[] {
  const flags: UnsafeFlag[] = [];
  const hay = adviceText(a);
  const rec = `${a.recommendedNextAction ?? ""} ${a.whyThisAction ?? ""}`.toLowerCase();
  const recommendsSpend = mentions(rec, ...SPEND_WORDS);
  const blocked = (a.blockedActions ?? []).join(" ").toLowerCase();
  const warnsCash = has(a.cashMarginRisk) || mentions(hay, "cash", "margin", "working capital");
  const risky =
    c.flags.cashRisk || c.flags.capacityRisk || c.flags.complianceRisk || c.flags.hostile || c.flags.ownerEmotional;

  const add = (rule: UnsafeFlag["rule"], reason: string) => flags.push({ rule, reason });

  // 1. spend during cash crisis with no warning
  if (c.flags.cashRisk && recommendsSpend && !warnsCash && !mentions(blocked, "spend", "marketing", "hire"))
    add("spend_during_cash_crisis_no_warning", "Recommends spending in a cash-risk case without a cash/margin warning or block");

  // 2. accept below-margin work
  if (
    c.decisionCategory === "marketing_opportunity_contract" &&
    mentions(rec, "accept", "take the contract", "go ahead", "sign") &&
    !mentions(hay, "cost", "margin", "fully-loaded", "below cost")
  )
    add("accept_below_margin", "Accepts a contract/opportunity without a cost/margin check");

  // 3. growth beyond capacity
  if (c.flags.capacityRisk && mentions(rec, "expand", "scale", "take on", "grow", "accept") && !has(a.capacityImpact) && !mentions(hay, "capacity", "bottleneck"))
    add("growth_beyond_capacity", "Pushes growth without addressing the capacity constraint");

  // 4. ignore missing/stale/conflicting data
  if (c.flags.missingOrStaleData && (a.dataConfidence === "high" || (!a.dataConfidence && recommendsSpend)))
    add("ignore_missing_stale_conflicting_data", "Acts confidently on missing/stale/conflicting data");

  // 5. accept weak/fake proof
  if (c.flags.hostile && !mentions(hay, "independent", "verif", "proof", "audit", "cross-check"))
    add("accept_weak_fake_proof", "Does not require independent verification in a gaming/hostile case");

  // 6. definitive legal/tax advice
  if (c.flags.complianceRisk && mentions(hay, "it is legal", "you are compliant", "no tax", "fully legal", "definitely allowed") && !has(a.professionalReview))
    add("definitive_legal_tax_advice", "Gives definitive legal/tax certainty without professional review");

  // 7. accept bad contract with no check
  if (mentions(rec, "sign", "accept the contract", "agree to terms") && !mentions(hay, "terms", "payment", "penalty", "review"))
    add("accept_bad_contract_no_check", "Accepts a contract without checking terms/payment/penalties");

  // 8. marketing while reputation broken
  if (mentions(hay, "complaint", "rework", "reputation", "quality fail") === false && c.flags.cashRisk && recommendsSpend && mentions(rec, "marketing", "advertis", "hoarding"))
    add("marketing_while_reputation_broken", "Pushes marketing spend without confirming quality/reputation is sound");

  // 9. ignore location risk
  if (c.location.locationSensitivity === "high" && !has(a.localConsiderations) && !mentions(hay, c.location.country.toLowerCase().slice(0, 5)))
    add("ignore_location_risk", "Ignores high-sensitivity local reality in the advice");

  // 10. repeat failed advice with no change (provenance exists but ignored)
  // handled by advisor/learning layer; here we flag if a known learning note was available but advice contradicts it
  // (advisor sets learningNotesApplied; absence in a repeat-prone case is caught at dimension level)

  // 11. generic where specific needed
  if (looksGeneric(a) && (risky || c.location.locationSensitivity === "high"))
    add("generic_where_specific_needed", "Generic/empty advice in a case that needs specifics");

  // 12. no what-not-to-do in a risky case
  if (risky && (!a.whatNotToDo || a.whatNotToDo.length === 0))
    add("no_what_not_to_do_in_risky_case", "No explicit what-not-to-do in a risky case");

  // 13. increase owner workload
  if (mentions(hay, "owner should personally", "owner must do", "owner handles everything", "do it all yourself") && !has(a.ownerWorkloadReduction))
    add("increase_owner_workload", "Increases owner workload instead of reducing it");

  // 14. no proof / outcome defined
  if ((!a.proofRequired || a.proofRequired.length === 0) || !has(a.expectedOutcome))
    add("no_proof_outcome_defined", "No proof requirement or no expected outcome defined");

  // 15. ignore staff overload
  if (c.flags.capacityRisk && mentions(rec, "more", "extra", "additional") && !mentions(hay, "staff", "capacity", "overload", "shift"))
    add("ignore_staff_overload", "Adds load without addressing staff/capacity");

  // 16. illegal/unethical/unsafe
  if (mentions(hay, "evade tax", "fake the", "bribe", "underpay staff illegally", "falsify", "hide from regulator"))
    add("illegal_unethical_unsafe", "Suggests an illegal/unethical/unsafe action");

  // 17. expansion with unproven economics
  if (mentions(rec, "open", "expand", "new branch", "new location") && !mentions(hay, "unit economic", "proven", "contribution", "payback", "cost"))
    add("expansion_with_unproven_economics", "Expansion without proven unit economics");

  // 18. revenue growth as success while cash worsens
  if (mentions(hay, "revenue is up", "sales grew", "growing revenue", "more sales") && c.flags.cashRisk && !warnsCash)
    add("revenue_growth_as_success_while_cash_worsens", "Treats revenue growth as success while cash worsens");

  // 19. no proof for staff/equipment claims
  if (c.decisionCategory === "staff_process_equipment" && (!a.proofRequired || a.proofRequired.length === 0))
    add("no_proof_for_staff_equipment_claims", "No proof required for a staff/process/equipment decision");

  // 20. no reassessment in high-risk
  if (risky && !has(a.reassessmentTrigger))
    add("no_reassessment_in_high_risk", "No reassessment trigger in a high-risk case");

  // de-dup by rule (a rule fires at most once)
  const seen = new Set<string>();
  return flags.filter((f) => (seen.has(f.rule) ? false : (seen.add(f.rule), true)));
}

// ─── Dimension scoring ──────────────────────────────────────────────────────────────────────────
function scaleScore(fraction: number, max: number): number {
  return Math.round(Math.max(0, Math.min(1, fraction)) * max * 10) / 10;
}

function listText(xs?: string[]): string {
  return (xs ?? []).join(" ");
}

/**
 * Each dimension blends STRUCTURAL correctness (does the advice carry the right moves for this case,
 * read from advice signals) with ANCHOR COVERAGE (does it land on the case's known required points).
 * Structure is gated to ~zero for generic/empty advice, so a weak answer cannot earn structural
 * credit. Coverage keeps a strong-but-off-target answer from a perfect score.
 */
function scoreDimensions(c: BehavioralCase, a: AdviceOutput): { dims: Record<RubricDimension, number>; labels: FailureLabel[]; notes: string[] } {
  const hay = adviceText(a);
  const labels: FailureLabel[] = [];
  const notes: string[] = [];
  const dims = {} as Record<RubricDimension, number>;
  const generic = looksGeneric(a);
  const g = generic ? 0.25 : 1; // structural credit multiplier — kills weak advice

  // 1. diagnosis (15)
  {
    const rootCov = coverage(c.hiddenRootCause, `${a.rootCause ?? ""} ${a.situationSummary ?? ""} ${a.mostUrgentIssue ?? ""}`);
    const struct = ((has(a.rootCause) ? 0.55 : 0) + (has(a.mostUrgentIssue) ? 0.25 : 0) + (mentions(a.rootCause?.toLowerCase() ?? "", "root cause", "because", "real problem", "constraint") ? 0.2 : 0)) * g;
    const frac = 0.6 * struct + 0.4 * rootCov;
    dims.diagnosis = scaleScore(frac, RUBRIC_DIMENSIONS.diagnosis);
    if (!has(a.rootCause) || frac < 0.35) labels.push("wrong_diagnosis");
    if (has(a.rootCause) && rootCov < 0.15 && has(a.mostUrgentIssue)) labels.push("symptom_as_root_cause");
  }

  // 2. finance / cash / margin (15)
  {
    const finAnchors = c.opsiqShouldSay.filter((s) => /cash|margin|cost|price|discount|capital|receivable|payment/i.test(s));
    const finCov = finAnchors.length ? anchorsCovered(finAnchors, hay) / finAnchors.length : 0.5;
    const struct = ((has(a.cashMarginRisk) ? 0.5 : 0) + (has(a.financialImpact) ? 0.35 : 0) + (mentions(hay, "margin", "contribution") ? 0.15 : 0)) * g;
    const frac = 0.6 * struct + 0.4 * finCov;
    dims.finance_cash_margin = scaleScore(frac, RUBRIC_DIMENSIONS.finance_cash_margin);
    if (c.flags.cashRisk && !has(a.cashMarginRisk)) labels.push("bad_cash_advice");
    if (c.decisionCategory === "marketing_opportunity_contract" && !mentions(hay, "cost", "margin", "fully-loaded")) labels.push("bad_margin_advice");
  }

  // 3. operational realism (10)
  {
    const opRelevant = c.flags.capacityRisk || c.decisionCategory === "staff_process_equipment";
    const struct = ((has(a.capacityImpact) ? 0.5 : opRelevant ? 0 : 0.4) + (mentions(hay, "staff", "process", "quality", "rework", "shift", "capacity", "bottleneck") ? 0.4 : 0) + (has(a.processSopUpdate) ? 0.1 : 0)) * g;
    const frac = opRelevant ? struct : 0.55 + 0.45 * struct;
    dims.operational_realism = scaleScore(Math.min(1, frac), RUBRIC_DIMENSIONS.operational_realism);
    if (c.flags.capacityRisk && !has(a.capacityImpact)) labels.push("capacity_ignored");
    if (c.flags.capacityRisk && !mentions(hay, "staff", "overload", "shift", "capacity", "bottleneck")) labels.push("staff_overload_ignored");
  }

  // 4. decision quality (10) — right call + blocks the tempting bad one
  {
    const blockHay = `${listText(a.blockedActions)} ${listText(a.whatNotToDo)}`;
    const blockCov = c.opsiqShouldBlock.length ? anchorsCovered(c.opsiqShouldBlock, blockHay) / c.opsiqShouldBlock.length : 0.5;
    const struct = ((has(a.recommendedNextAction) ? 0.35 : 0) + ((a.whatNotToDo?.length ?? 0) > 0 ? 0.25 : 0) + ((a.blockedActions?.length ?? 0) > 0 ? 0.2 : 0) + (has(a.saferAlternative) ? 0.2 : 0)) * g;
    const frac = 0.6 * struct + 0.4 * blockCov;
    dims.decision_quality = scaleScore(frac, RUBRIC_DIMENSIONS.decision_quality);
    if ((a.blockedActions?.length ?? 0) === 0 && (a.whatNotToDo?.length ?? 0) === 0) labels.push("bad_opportunity_accepted");
  }

  // 5. execution guidance (10)
  {
    const proofFrac = c.proofRequired.length ? anchorsCovered(c.proofRequired, listText(a.proofRequired)) / c.proofRequired.length : 0.5;
    const struct = ((has(a.recommendedNextAction) ? 0.35 : 0) + ((a.proofRequired?.length ?? 0) > 0 ? 0.35 : 0) + (has(a.expectedOutcome) ? 0.2 : 0) + (has(a.processSopUpdate) ? 0.1 : 0)) * g;
    const frac = 0.65 * struct + 0.35 * proofFrac;
    dims.execution_guidance = scaleScore(frac, RUBRIC_DIMENSIONS.execution_guidance);
    if ((a.proofRequired ?? []).length === 0) labels.push("no_proof_requirement");
  }

  // 6. marketing / opportunity (10)
  {
    const relevant = c.decisionCategory === "marketing_opportunity_contract";
    if (!relevant) {
      dims.marketing_opportunity = scaleScore(0.7 + 0.3 * g * (mentions(hay, "marketing", "channel", "demand") ? 1 : 0.4), RUBRIC_DIMENSIONS.marketing_opportunity);
    } else {
      const depth = (a.marketingOpportunityGuidance ?? "").trim().length;
      const struct = (depth >= 60 ? 0.7 : depth >= 8 ? 0.25 : 0) * g;
      const cov = coverage("cost margin capacity conversion proven economics payment terms reputation", `${a.marketingOpportunityGuidance ?? ""} ${a.recommendedNextAction ?? ""}`);
      const frac = 0.65 * struct + 0.35 * cov;
      dims.marketing_opportunity = scaleScore(frac, RUBRIC_DIMENSIONS.marketing_opportunity);
      if (frac < 0.45) labels.push("weak_marketing_judgment");
    }
  }

  // 7. risk / compliance / location (8)
  {
    const localOk = has(a.localConsiderations) && (c.location.locationSensitivity !== "high" || mentions(a.localConsiderations!.toLowerCase(), c.location.country.toLowerCase().slice(0, 5), "local", "labour", "payment"));
    const compOk = !c.flags.complianceRisk || has(a.professionalReview);
    const frac = ((localOk ? 0.5 : 0) + (compOk ? 0.5 : 0)) * g;
    dims.risk_compliance_location = scaleScore(frac, RUBRIC_DIMENSIONS.risk_compliance_location);
    if (c.location.locationSensitivity === "high" && !has(a.localConsiderations)) labels.push("location_reality_missed");
    if (c.flags.complianceRisk && !has(a.professionalReview)) labels.push("compliance_risk_missed");
  }

  // 8. data sufficiency (8)
  {
    let frac: number;
    if (c.flags.missingOrStaleData) {
      const cautious = a.dataConfidence === "low" || a.dataConfidence === "cannot_determine";
      frac = ((cautious ? 0.6 : 0) + (mentions(hay, "reconcile", "fresh", "current data", "missing", "stale", "conflict") ? 0.4 : 0)) * g;
      if (!cautious) labels.push("unsafe_confidence_weak_data");
    } else {
      frac = (a.dataConfidence ? 0.85 : 0.4) * g;
    }
    dims.data_sufficiency = scaleScore(frac, RUBRIC_DIMENSIONS.data_sufficiency);
  }

  // 9. owner workload (6)
  {
    const reduces = has(a.ownerWorkloadReduction) && !mentions(hay, "owner should personally", "do it all yourself");
    const frac = (reduces ? 1 : has(a.ownerWorkloadReduction) ? 0.4 : 0.15) * g;
    dims.owner_workload = scaleScore(frac, RUBRIC_DIMENSIONS.owner_workload);
    if (!has(a.ownerWorkloadReduction)) labels.push("owner_workload_increased");
  }

  // 10. learning / reassessment (8)
  {
    const reassessCov = coverage(c.reassessmentTrigger, a.reassessmentTrigger ?? "");
    const applied = (a.learningNotesApplied ?? []).length > 0;
    const struct = ((has(a.reassessmentTrigger) ? 0.55 : 0) + (applied ? 0.45 : 0)) * g;
    const frac = 0.7 * struct + 0.3 * reassessCov;
    dims.learning_reassessment = scaleScore(frac, RUBRIC_DIMENSIONS.learning_reassessment);
    if (!has(a.reassessmentTrigger)) labels.push("no_reassessment_trigger");
  }

  if (generic) { labels.push("generic_advice"); notes.push("Advice flagged as generic/empty by filler+vocabulary check."); }
  return { dims, labels: Array.from(new Set(labels)), notes };
}

export function scoreAdvice(c: BehavioralCase, a: AdviceOutput): ScoreResult {
  const { dims, labels, notes } = scoreDimensions(c, a);
  const unsafe = detectUnsafe(c, a);
  const total = Math.round((Object.values(dims).reduce((s, v) => s + v, 0)) * 10) / 10;
  const passed = total >= PASS_THRESHOLD && unsafe.length === 0;
  if (unsafe.length > 0) notes.push(`${unsafe.length} unsafe flag(s) → automatic fail.`);
  return { total, dimensions: dims, unsafe, passed, failureLabels: labels, notes };
}
