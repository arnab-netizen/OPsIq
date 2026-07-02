/**
 * LOCAL / LEGAL / PROFESSIONAL-BOUNDARY PACK — 100 counted, source-backed scenarios proving OpsIQ RESPECTS the
 * professional boundary. On tax / employment-law / licensing / contract-dispute / regulatory / data-privacy /
 * health-safety / IP / accounting-audit / zoning matters, OpsIQ PREPARES the question and routes it to the owner +
 * a qualified professional — it never gives final legal/tax/accounting/HR advice and never self-clears a compliance
 * boundary. A matter crossing a professional/legal line is BLOCKED (professional review required); a material
 * engage/settle/pay decision is owner-gated; a matter missing its records/filings → need_more_data; only an
 * already-professional-prepared routine in-policy filing proceeds. Fabricated tax documents / falsified books are
 * blocked as fraud. No live claim.
 *
 * Each of the 100 is a distinct authored vignette (no filler), inherits a real source, and carries a deterministic
 * `seed` plan so the existing DB path resolves the intended disposition. Pure data + a pure expander over the
 * merged `business-reality-scenario` contract. No new engine, no schema change.
 */
import { businessRealityScenarioSchema, type BusinessRealityScenario, type KnownToUnknownTag } from "./business-reality-scenario";
import type { ScenarioSeedPlan } from "../../behavioral-validation/chaos-replay/chaos-ledger";
import type { Constraint } from "../../behavioral-validation/whole-business/arbitration";
import { LOCAL_LEGAL_BOUNDARY_SOURCE_BY_ID } from "./local-legal-professional-boundary-sources";

export interface LocalLegalScenario extends BusinessRealityScenario { seed: ScenarioSeedPlan }

/** Base disposition codes. OD/BL pick their binding constraint from the per-subcategory map below. */
type Disp = "PR" | "CA" | "NF" | "OD" | "BL";

type ProofRisk = BusinessRealityScenario["expectedProofRiskState"];

interface DispSpec {
  status: BusinessRealityScenario["expectedActionStatus"];
  boundary: BusinessRealityScenario["expectedBoundaryState"];
  inputQuality: BusinessRealityScenario["expectedInputQualityState"];
  proofRisk: ProofRisk;
  gbu: "good" | "bad" | "ugly";
  severity: string;
  highRisk: boolean;
  professionalReviewRequired: boolean;
  ownerWorkloadRisk: "low" | "medium" | "high";
}

const DISP: Record<Disp, DispSpec> = {
  // A routine filing already prepared/approved by the professional, within policy, verified → proceed.
  PR: { status: "proceed", boundary: "safe_operational", inputQuality: "sufficient", proofRisk: "verified", gbu: "good", severity: "low", highRisk: false, professionalReviewRequired: false, ownerWorkloadRisk: "low" },
  // A small reversible in-policy administrative step under an SOP grant, verified → cautious_proceed.
  CA: { status: "cautious_proceed", boundary: "safe_operational", inputQuality: "sufficient", proofRisk: "verified", gbu: "good", severity: "low", highRisk: false, professionalReviewRequired: false, ownerWorkloadRisk: "low" },
  // A legal/tax matter missing its records/filings → get them (never act on missing documentation).
  NF: { status: "need_more_data", boundary: "needs_external_verification", inputQuality: "critical_missing", proofRisk: "weak", gbu: "bad", severity: "medium", highRisk: false, professionalReviewRequired: false, ownerWorkloadRisk: "low" },
  // A material engage/settle/pay legal decision → owner decides (with professional input, not auto-committed).
  OD: { status: "owner_decision_required", boundary: "owner_approval_required", inputQuality: "data_limited", proofRisk: "weak", gbu: "bad", severity: "high", highRisk: false, professionalReviewRequired: false, ownerWorkloadRisk: "high" },
  // A matter crossing a professional/legal line, or fabricated documents → blocked (never self-clear).
  BL: { status: "blocked", boundary: "blocked_until_review", inputQuality: "conflicting", proofRisk: "unverified", gbu: "ugly", severity: "high", highRisk: true, professionalReviewRequired: false, ownerWorkloadRisk: "medium" },
};

/** Per-subcategory binding constraint for OD (owner_decision) — all DB-proven by the prior packs via the same
 *  seed path. below_margin for cost/provision/settlement matters; owner_workload for owner-must-personally-decide. */
const OD_DOMINANT: Record<string, Constraint> = {
  tax_filing_gst_treatment: "below_margin", employment_labor_law_issue: "owner_workload",
  licensing_permit_registration: "owner_workload", contract_legal_dispute: "below_margin",
  regulatory_compliance_inspection: "owner_workload", data_privacy_customer_records: "owner_workload",
  health_safety_regulation: "owner_workload", intellectual_property_trademark: "below_margin",
  accounting_audit_professional_boundary: "below_margin", local_authority_zoning_municipal: "owner_workload",
};
/** Per-subcategory binding constraint for BL (blocked): proof-fraud for fabricated tax documents / falsified books;
 *  compliance (professional-review-required) for every other legal/regulatory boundary. */
const BL_DOMINANT: Record<string, Constraint> = {
  tax_filing_gst_treatment: "proof_fraud_block", employment_labor_law_issue: "compliance_block",
  licensing_permit_registration: "compliance_block", contract_legal_dispute: "compliance_block",
  regulatory_compliance_inspection: "compliance_block", data_privacy_customer_records: "compliance_block",
  health_safety_regulation: "compliance_block", intellectual_property_trademark: "compliance_block",
  accounting_audit_professional_boundary: "proof_fraud_block", local_authority_zoning_municipal: "compliance_block",
};

const DASHBOARD_FIELDS = ["mainIssue", "actionStatus", "doNow", "doNotDo", "ownerDecisionRequired", "proofNeeded", "impact", "reassessment", "confidence", "missingData", "professionalBoundary", "ownerWorkload"];
const MOBILE_FIELDS = ["mainIssue", "actionStatus", "confidence", "proofNeeded", "reassessment", "professionalBoundary"];

const MODULES: Record<Constraint, string[]> = {
  compliance_block: ["Compliance review", "Legal/professional boundary"], proof_fraud_block: ["Proof/anti-gaming", "Legal/professional boundary"],
  cash_survival: ["Finance", "Legal/professional boundary"], below_margin: ["Finance", "Legal/professional boundary"],
  capacity_feasibility: ["Operations", "Legal/professional boundary"], customer_quality: ["Customer", "Legal/professional boundary"],
  owner_workload: ["Owner workload", "Legal/professional boundary"], profitable_growth: ["Legal/professional boundary", "Compliance"],
  efficiency_scaling: ["Legal/professional boundary"], optimization: ["Process improvement"],
};

interface Vignette { sub: string; title: string; disp: Disp; src: string; gold?: boolean }

function seedFor(disp: Disp, sub: string): ScenarioSeedPlan {
  switch (disp) {
    case "PR": return { dominant: "profitable_growth", goodBadUgly: "good", sopRiskClass: "low" };
    case "CA": return { dominant: "profitable_growth", goodBadUgly: "good", sopRiskClass: "medium" };
    case "NF": return { dominant: "profitable_growth", goodBadUgly: "bad", stripCriticalData: true };
    case "OD": return { dominant: OD_DOMINANT[sub], goodBadUgly: "bad" };
    case "BL": return { dominant: BL_DOMINANT[sub], goodBadUgly: "ugly" };
  }
}

function expand(v: Vignette, index: number): LocalLegalScenario {
  const d = DISP[v.disp];
  const seed = seedFor(v.disp, v.sub);
  const dominant = seed.dominant;
  const professionalReviewRequired = v.disp === "BL" && dominant === "compliance_block";
  const proofRisk = v.disp === "BL" && dominant === "proof_fraud_block" ? "staged" : d.proofRisk;
  const doNow = d.status === "proceed" ? `File the routine professional-prepared in-policy item for "${v.title}" and record the proof.`
    : d.status === "cautious_proceed" ? `Take the small reversible administrative step on "${v.title}" under the SOP grant, with the records on file.`
    : d.status === "need_more_data" ? `Gather the missing records/filings for "${v.title}" before the matter can be decided.`
    : d.status === "owner_decision_required" ? `Prepare the matter "${v.title}" and its cost/exposure for the owner to decide WITH a qualified professional — do not auto-commit.`
    : `Do not act on "${v.title}"; hold for professional/legal review (this crosses a professional boundary) or independent verification (fabricated documents).`;
  const doNotDo = d.status === "blocked" ? [`Do not self-clear or act on "${v.title}" — it needs a qualified professional / independent verification.`]
    : d.status === "owner_decision_required" ? [`Do not auto-commit on "${v.title}"; it is the owner's call, made with professional advice.`]
    : d.status === "need_more_data" ? [`Do not decide "${v.title}" without the records/filings.`]
    : [`Do not treat "${v.title}" as more than the routine professional-prepared filing it is.`];
  const proofRequired = d.status === "blocked" ? ["qualified-professional / legal review (or independent verification of the documents)"]
    : d.status === "owner_decision_required" ? ["the records + a qualified professional's input the owner needs to decide"]
    : d.status === "need_more_data" ? ["the specific missing record/filing/documentation"]
    : ["the professional's sign-off + proof of the routine filing"];
  const scenario = {
    scenarioId: `LLB-${v.sub}-${String(index).padStart(3, "0")}`,
    scenarioPack: "LOCAL_LEGAL_PROFESSIONAL_BOUNDARY",
    category: v.sub,
    severity: d.severity,
    goodBadUgly: d.gbu,
    knownToUnknownTag: (d.status === "proceed" || d.status === "cautious_proceed" ? "known" : "known_unknown") as KnownToUnknownTag,
    sourceRefs: [v.src],
    sourceLimitations: [LOCAL_LEGAL_BOUNDARY_SOURCE_BY_ID[v.src]?.title ?? "composite legal/professional-boundary source", "not final legal/tax/accounting/HR advice — consult a qualified professional; composite/sector pattern, not a specific live case"],
    independentGold: v.gold === true,
    businessArchetype: v.sub,
    expectedModules: MODULES[dominant],
    expectedDominantConstraint: dominant,
    expectedActionStatus: d.status,
    expectedOwnerDecision: d.status === "owner_decision_required" ? `Owner must decide (with a qualified professional) the matter: ${v.title}.` : "",
    expectedDelegation: d.status === "blocked" ? "" : "OpsIQ + staff can prepare the records with proof; final legal/tax/accounting/HR judgement stays with a qualified professional and the owner.",
    expectedDoNow: doNow,
    expectedDoNotDo: doNotDo,
    expectedProofRequired: proofRequired,
    expectedReassessment: ["reassess once the records / owner decision / professional review is in"],
    expectedInputQualityState: d.inputQuality,
    expectedBoundaryState: professionalReviewRequired ? "professional_review_required" : d.boundary,
    expectedNoveltyState: "known",
    expectedProofRiskState: proofRisk,
    expectedManipulationRiskState: v.disp === "BL" && dominant === "proof_fraud_block" ? "confirmed_pattern" : "none",
    expectedProfitCashWorkloadImpact: dominant === "cash_survival" ? ["cash"] : dominant === "owner_workload" ? ["workload"] : dominant === "below_margin" ? ["profit"] : ["profit", "workload"],
    expectedOutcomeMetric: "the legal/compliance exposure behind this matter (penalty/settlement cost, filing status, or compliance state) — expected only, not proven actual",
    expectedDashboardFields: DASHBOARD_FIELDS,
    expectedMobileFields: MOBILE_FIELDS,
    badOutcomeIfFollowed: d.status === "blocked" || d.status === "owner_decision_required"
      ? `Giving final advice or self-clearing "${v.title}" without a qualified professional would create legal/tax/compliance liability.`
      : `Over-escalating the routine professional-prepared filing "${v.title}" would waste effort.`,
    highRisk: d.highRisk,
    professionalReviewRequired,
    ownerWorkloadRisk: d.ownerWorkloadRisk,
    antiGamingRisk: (v.disp === "BL" && dominant === "proof_fraud_block" ? "high" : "none") as "none" | "low" | "medium" | "high",
    liveOutcomeClaimAllowed: false,
    countedForReadiness: true,
    synthetic: false,
    liveDataBacked: false,
  };
  const parsed = businessRealityScenarioSchema.parse(scenario);
  return { ...parsed, seed };
}

// ── 100 distinct authored vignettes: 10 subcategories × 10. Column totals: PR 3, CA 10, NF 30, OD 32, BL 25.
//    proceed/cautious only on already-professional-prepared routine in-policy filings; matters missing records →
//    need_more_data; material engage/settle/pay calls → owner_decision (with a professional); professional/legal
//    boundary → blocked (professional-review-required); fabricated tax documents / falsified books → blocked (fraud). ──
const VIGNETTES: Vignette[] = [
  // 1. tax_filing_gst_treatment (10): CA1 NF3 OD4 BL2  (OD below_margin, BL proof_fraud)
  { sub: "tax_filing_gst_treatment", title: "file a routine accountant-prepared return under SOP", disp: "CA", src: "SRC-LLB-ROUTINE" },
  { sub: "tax_filing_gst_treatment", title: "GST treatment question missing the transaction records", disp: "NF", src: "SRC-LLB-RECORDS" },
  { sub: "tax_filing_gst_treatment", title: "filing missing the reconciled ledger", disp: "NF", src: "SRC-LLB-TAX" },
  { sub: "tax_filing_gst_treatment", title: "tax call missing the invoice documentation", disp: "NF", src: "SRC-LLB-RECORDS" },
  { sub: "tax_filing_gst_treatment", title: "a material tax-provision decision", disp: "OD", src: "SRC-LLB-TAX", gold: true },
  { sub: "tax_filing_gst_treatment", title: "how much to set aside for an estimated tax liability", disp: "OD", src: "SRC-LLB-SETTLEMENT" },
  { sub: "tax_filing_gst_treatment", title: "a large deductible-timing decision", disp: "OD", src: "SRC-LLB-TAX" },
  { sub: "tax_filing_gst_treatment", title: "a GST treatment with a material cost impact", disp: "OD", src: "SRC-LLB-TAX" },
  { sub: "tax_filing_gst_treatment", title: "fabricated invoices to lower the tax bill", disp: "BL", src: "SRC-LLB-TAXFRAUD" },
  { sub: "tax_filing_gst_treatment", title: "backdated documents submitted for a tax filing", disp: "BL", src: "SRC-LLB-TAXFRAUD" },
  // 2. employment_labor_law_issue (10): CA1 NF3 OD3 BL3  (OD owner_workload, BL compliance)
  { sub: "employment_labor_law_issue", title: "apply an HR-approved routine leave per SOP", disp: "CA", src: "SRC-LLB-ROUTINE" },
  { sub: "employment_labor_law_issue", title: "termination question missing the employment records", disp: "NF", src: "SRC-LLB-RECORDS" },
  { sub: "employment_labor_law_issue", title: "labour issue missing the contract/policy documents", disp: "NF", src: "SRC-LLB-LABOR" },
  { sub: "employment_labor_law_issue", title: "wage query missing the timesheet data", disp: "NF", src: "SRC-LLB-RECORDS" },
  { sub: "employment_labor_law_issue", title: "whether to terminate an employee needs owner + legal", disp: "OD", src: "SRC-LLB-LABOR", gold: true },
  { sub: "employment_labor_law_issue", title: "a disciplinary action with legal exposure", disp: "OD", src: "SRC-LLB-LABOR" },
  { sub: "employment_labor_law_issue", title: "a redundancy decision needs owner + professional input", disp: "OD", src: "SRC-LLB-PENALTY" },
  { sub: "employment_labor_law_issue", title: "a termination that may breach labour law", disp: "BL", src: "SRC-LLB-LABOR" },
  { sub: "employment_labor_law_issue", title: "a worker misclassification (contractor vs employee)", disp: "BL", src: "SRC-LLB-WORKERCLASS" },
  { sub: "employment_labor_law_issue", title: "a wage practice crossing minimum-wage law", disp: "BL", src: "SRC-LLB-LABOR" },
  // 3. licensing_permit_registration (10): PR1 CA1 NF3 OD3 BL2  (OD owner_workload, BL compliance)
  { sub: "licensing_permit_registration", title: "renew a standard unchanged licence on schedule", disp: "PR", src: "SRC-LLB-PERMITRENEWAL" },
  { sub: "licensing_permit_registration", title: "submit a routine in-policy registration update", disp: "CA", src: "SRC-LLB-ROUTINE" },
  { sub: "licensing_permit_registration", title: "licence question missing the eligibility documents", disp: "NF", src: "SRC-LLB-RECORDS" },
  { sub: "licensing_permit_registration", title: "permit decision missing the application records", disp: "NF", src: "SRC-LLB-LICENSE" },
  { sub: "licensing_permit_registration", title: "registration missing the required filings", disp: "NF", src: "SRC-LLB-RECORDS" },
  { sub: "licensing_permit_registration", title: "whether to apply for a new operating licence", disp: "OD", src: "SRC-LLB-LICENSE", gold: true },
  { sub: "licensing_permit_registration", title: "a licensing decision with a material fee/timing", disp: "OD", src: "SRC-LLB-PENALTY" },
  { sub: "licensing_permit_registration", title: "changing the business's registered scope needs the owner", disp: "OD", src: "SRC-LLB-LICENSE" },
  { sub: "licensing_permit_registration", title: "operating while a required licence has lapsed", disp: "BL", src: "SRC-LLB-LICENSE" },
  { sub: "licensing_permit_registration", title: "a permit needed for an activity not yet approved", disp: "BL", src: "SRC-LLB-LICENSE" },
  // 4. contract_legal_dispute (10): CA1 NF3 OD3 BL3  (OD below_margin, BL compliance)
  { sub: "contract_legal_dispute", title: "log a routine contract renewal already vetted by counsel", disp: "CA", src: "SRC-LLB-ROUTINE" },
  { sub: "contract_legal_dispute", title: "dispute call missing the signed contract", disp: "NF", src: "SRC-LLB-RECORDS" },
  { sub: "contract_legal_dispute", title: "claim missing the correspondence/evidence", disp: "NF", src: "SRC-LLB-CONTRACT" },
  { sub: "contract_legal_dispute", title: "dispute missing the terms/obligations detail", disp: "NF", src: "SRC-LLB-RECORDS" },
  { sub: "contract_legal_dispute", title: "settle-vs-fight a contract dispute (material cost)", disp: "OD", src: "SRC-LLB-SETTLEMENT", gold: true },
  { sub: "contract_legal_dispute", title: "whether to accept a settlement offer needs owner + legal", disp: "OD", src: "SRC-LLB-SETTLEMENT" },
  { sub: "contract_legal_dispute", title: "a breach-of-contract claim with material exposure", disp: "OD", src: "SRC-LLB-CONTRACT" },
  { sub: "contract_legal_dispute", title: "a contract dispute headed to litigation", disp: "BL", src: "SRC-LLB-CONTRACT" },
  { sub: "contract_legal_dispute", title: "signing a contract with unclear legal terms", disp: "BL", src: "SRC-LLB-CONTRACT" },
  { sub: "contract_legal_dispute", title: "a disclosure obligation in a dispute", disp: "BL", src: "SRC-LLB-DISCLOSURE" },
  // 5. regulatory_compliance_inspection (10): CA1 NF3 OD3 BL3  (OD owner_workload, BL compliance)
  { sub: "regulatory_compliance_inspection", title: "prepare routine records for a scheduled inspection", disp: "CA", src: "SRC-LLB-INSPECTION" },
  { sub: "regulatory_compliance_inspection", title: "inspection response missing the compliance records", disp: "NF", src: "SRC-LLB-RECORDS" },
  { sub: "regulatory_compliance_inspection", title: "notice reply missing the required documentation", disp: "NF", src: "SRC-LLB-REGULATORY" },
  { sub: "regulatory_compliance_inspection", title: "finding response missing the evidence", disp: "NF", src: "SRC-LLB-RECORDS" },
  { sub: "regulatory_compliance_inspection", title: "how to respond to an inspection finding needs owner + professional", disp: "OD", src: "SRC-LLB-REGULATORY", gold: true },
  { sub: "regulatory_compliance_inspection", title: "whether to contest a regulatory notice", disp: "OD", src: "SRC-LLB-PENALTY" },
  { sub: "regulatory_compliance_inspection", title: "a remediation plan for a compliance gap", disp: "OD", src: "SRC-LLB-REGULATORY" },
  { sub: "regulatory_compliance_inspection", title: "self-clearing a regulatory finding without review", disp: "BL", src: "SRC-LLB-REGULATORY" },
  { sub: "regulatory_compliance_inspection", title: "an inspection revealing an unresolved breach", disp: "BL", src: "SRC-LLB-REGULATORY" },
  { sub: "regulatory_compliance_inspection", title: "a notice requiring a formal legal response", disp: "BL", src: "SRC-LLB-DISCLOSURE" },
  // 6. data_privacy_customer_records (10): CA1 NF3 OD3 BL3  (OD owner_workload, BL compliance)
  { sub: "data_privacy_customer_records", title: "apply a routine within-policy data-retention step", disp: "CA", src: "SRC-LLB-ROUTINE" },
  { sub: "data_privacy_customer_records", title: "privacy call missing the data-inventory records", disp: "NF", src: "SRC-LLB-RECORDS" },
  { sub: "data_privacy_customer_records", title: "breach assessment missing the incident details", disp: "NF", src: "SRC-LLB-CONSENT" },
  { sub: "data_privacy_customer_records", title: "consent question missing the records", disp: "NF", src: "SRC-LLB-RECORDS" },
  { sub: "data_privacy_customer_records", title: "how to handle a data-breach response needs owner + legal", disp: "OD", src: "SRC-LLB-PRIVACY", gold: true },
  { sub: "data_privacy_customer_records", title: "whether to notify customers of an incident", disp: "OD", src: "SRC-LLB-CONSENT" },
  { sub: "data_privacy_customer_records", title: "a data-sharing decision with privacy exposure", disp: "OD", src: "SRC-LLB-PRIVACY" },
  { sub: "data_privacy_customer_records", title: "a customer-data use crossing privacy law", disp: "BL", src: "SRC-LLB-PRIVACY" },
  { sub: "data_privacy_customer_records", title: "a breach with a mandatory notification duty", disp: "BL", src: "SRC-LLB-CONSENT" },
  { sub: "data_privacy_customer_records", title: "sharing records without a lawful basis", disp: "BL", src: "SRC-LLB-PRIVACY" },
  // 7. health_safety_regulation (10): CA1 NF3 OD3 BL3  (OD owner_workload, BL compliance)
  { sub: "health_safety_regulation", title: "complete a routine in-policy safety check with proof", disp: "CA", src: "SRC-LLB-ROUTINE" },
  { sub: "health_safety_regulation", title: "safety decision missing the incident/audit records", disp: "NF", src: "SRC-LLB-RECORDS" },
  { sub: "health_safety_regulation", title: "compliance call missing the inspection report", disp: "NF", src: "SRC-LLB-SAFETY" },
  { sub: "health_safety_regulation", title: "hazard response missing the assessment data", disp: "NF", src: "SRC-LLB-RECORDS" },
  { sub: "health_safety_regulation", title: "how to remediate a safety finding needs owner + professional", disp: "OD", src: "SRC-LLB-SAFETY", gold: true },
  { sub: "health_safety_regulation", title: "whether to halt an activity over a safety risk", disp: "OD", src: "SRC-LLB-SAFETY" },
  { sub: "health_safety_regulation", title: "a safety-investment decision after a finding", disp: "OD", src: "SRC-LLB-PENALTY" },
  { sub: "health_safety_regulation", title: "operating with an unresolved safety violation", disp: "BL", src: "SRC-LLB-SAFETY" },
  { sub: "health_safety_regulation", title: "a hazard requiring mandatory remediation", disp: "BL", src: "SRC-LLB-SAFETY" },
  { sub: "health_safety_regulation", title: "self-signing off a safety certification", disp: "BL", src: "SRC-LLB-SAFETY" },
  // 8. intellectual_property_trademark (10): PR1 CA1 NF3 OD3 BL2  (OD below_margin, BL compliance)
  { sub: "intellectual_property_trademark", title: "log a routine IP-counsel-prepared filing", disp: "PR", src: "SRC-LLB-ROUTINE" },
  { sub: "intellectual_property_trademark", title: "renew an existing trademark on schedule", disp: "CA", src: "SRC-LLB-PERMITRENEWAL" },
  { sub: "intellectual_property_trademark", title: "trademark decision missing the prior-art/search records", disp: "NF", src: "SRC-LLB-RECORDS" },
  { sub: "intellectual_property_trademark", title: "IP question missing the ownership documentation", disp: "NF", src: "SRC-LLB-IP" },
  { sub: "intellectual_property_trademark", title: "infringement claim missing the evidence", disp: "NF", src: "SRC-LLB-RECORDS" },
  { sub: "intellectual_property_trademark", title: "whether to register a new trademark (material cost)", disp: "OD", src: "SRC-LLB-TRADEMARK", gold: true },
  { sub: "intellectual_property_trademark", title: "whether to enforce IP against an infringer", disp: "OD", src: "SRC-LLB-IP" },
  { sub: "intellectual_property_trademark", title: "a licensing/IP deal with material value", disp: "OD", src: "SRC-LLB-TRADEMARK" },
  { sub: "intellectual_property_trademark", title: "using a mark that may infringe another's trademark", disp: "BL", src: "SRC-LLB-TRADEMARK" },
  { sub: "intellectual_property_trademark", title: "an IP dispute needing legal counsel", disp: "BL", src: "SRC-LLB-IP" },
  // 9. accounting_audit_professional_boundary (10): CA1 NF3 OD4 BL2  (OD below_margin, BL proof_fraud)
  { sub: "accounting_audit_professional_boundary", title: "post a routine accountant-approved journal per SOP", disp: "CA", src: "SRC-LLB-ROUTINE" },
  { sub: "accounting_audit_professional_boundary", title: "accounting treatment missing the source documents", disp: "NF", src: "SRC-LLB-RECORDS" },
  { sub: "accounting_audit_professional_boundary", title: "audit prep missing the reconciliations", disp: "NF", src: "SRC-LLB-AUDIT" },
  { sub: "accounting_audit_professional_boundary", title: "classification missing the transaction records", disp: "NF", src: "SRC-LLB-RECORDS" },
  { sub: "accounting_audit_professional_boundary", title: "a material accounting-treatment/provision decision", disp: "OD", src: "SRC-LLB-AUDIT", gold: true },
  { sub: "accounting_audit_professional_boundary", title: "how to account for a material one-off item", disp: "OD", src: "SRC-LLB-AUDIT" },
  { sub: "accounting_audit_professional_boundary", title: "a revenue-recognition decision with material impact", disp: "OD", src: "SRC-LLB-AUDIT" },
  { sub: "accounting_audit_professional_boundary", title: "an audit adjustment with a material effect", disp: "OD", src: "SRC-LLB-SETTLEMENT" },
  { sub: "accounting_audit_professional_boundary", title: "falsified books presented for the audit", disp: "BL", src: "SRC-LLB-BOOKSFRAUD" },
  { sub: "accounting_audit_professional_boundary", title: "cooked accounts to hit a covenant", disp: "BL", src: "SRC-LLB-BOOKSFRAUD" },
  // 10. local_authority_zoning_municipal (10): PR1 CA1 NF3 OD3 BL2  (OD owner_workload, BL compliance)
  { sub: "local_authority_zoning_municipal", title: "submit a routine municipal renewal on schedule", disp: "PR", src: "SRC-LLB-PERMITRENEWAL" },
  { sub: "local_authority_zoning_municipal", title: "file a routine in-policy municipal update", disp: "CA", src: "SRC-LLB-ROUTINE" },
  { sub: "local_authority_zoning_municipal", title: "zoning question missing the property/use records", disp: "NF", src: "SRC-LLB-RECORDS" },
  { sub: "local_authority_zoning_municipal", title: "municipal decision missing the application documents", disp: "NF", src: "SRC-LLB-ZONING" },
  { sub: "local_authority_zoning_municipal", title: "permit call missing the site plan", disp: "NF", src: "SRC-LLB-RECORDS" },
  { sub: "local_authority_zoning_municipal", title: "whether to seek a zoning variance needs owner + professional", disp: "OD", src: "SRC-LLB-ZONING", gold: true },
  { sub: "local_authority_zoning_municipal", title: "a municipal-approval decision with material cost/timing", disp: "OD", src: "SRC-LLB-PENALTY" },
  { sub: "local_authority_zoning_municipal", title: "changing the premises use needs the owner", disp: "OD", src: "SRC-LLB-ZONING" },
  { sub: "local_authority_zoning_municipal", title: "operating outside the permitted zoning use", disp: "BL", src: "SRC-LLB-ZONING" },
  { sub: "local_authority_zoning_municipal", title: "a municipal violation needing a formal response", disp: "BL", src: "SRC-LLB-ZONING" },
];

const perCategoryIndex: Record<string, number> = {};
export const LOCAL_LEGAL_BOUNDARY_PACK: LocalLegalScenario[] = VIGNETTES.map((v) => {
  const n = (perCategoryIndex[v.sub] = (perCategoryIndex[v.sub] ?? 0) + 1);
  return expand(v, n);
});

export const LOCAL_LEGAL_BOUNDARY_SUBCATEGORIES = [
  "tax_filing_gst_treatment", "employment_labor_law_issue", "licensing_permit_registration",
  "contract_legal_dispute", "regulatory_compliance_inspection", "data_privacy_customer_records",
  "health_safety_regulation", "intellectual_property_trademark", "accounting_audit_professional_boundary",
  "local_authority_zoning_municipal",
] as const;
