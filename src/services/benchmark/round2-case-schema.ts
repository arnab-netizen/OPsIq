/**
 * Round 2 case-pack canonical schema + manifest builder + template factory.
 *
 * Defines the structure every Round 2 case must follow and the planned 150-case
 * distribution. Templates are intentionally UNFINISHED (TODO content) so the
 * intake validator rejects them until authored. No engine/gate/answer-key change.
 */
import { z } from "zod";
import type { Round2Case } from "./round2-intake-validator";

// ─── The 15 taxonomy diagnoses (D01–D15) + home/context dimensions ────────────
export interface DiagnosisSpec {
  code: string;
  dx: string;
  dimensions: string[]; // required evidence dimensions (home + context)
}
export const DIAGNOSES: DiagnosisSpec[] = [
  { code: "D01", dx: "cash_liquidity_crisis", dimensions: ["financial_health", "operational_efficiency"] },
  { code: "D02", dx: "unit_economics_failure", dimensions: ["financial_health", "customer_retention"] },
  { code: "D03", dx: "margin_erosion", dimensions: ["financial_health", "operational_efficiency"] },
  { code: "D04", dx: "pricing_power", dimensions: ["financial_health", "market_position"] },
  { code: "D05", dx: "demand_generation_failure", dimensions: ["market_position", "customer_retention"] },
  { code: "D06", dx: "gtm_channel_mismatch", dimensions: ["market_position", "financial_health"] },
  { code: "D07", dx: "customer_retention_erosion", dimensions: ["customer_retention", "financial_health"] },
  { code: "D08", dx: "quality_trust_failure", dimensions: ["quality_delivery", "customer_retention"] },
  { code: "D09", dx: "operational_bottleneck", dimensions: ["operational_efficiency", "customer_retention"] },
  { code: "D10", dx: "inventory_forecasting_mismatch", dimensions: ["operational_efficiency", "financial_health"] },
  { code: "D11", dx: "working_capital_stress", dimensions: ["financial_health", "operational_efficiency"] },
  { code: "D12", dx: "debt_solvency_pressure", dimensions: ["financial_health", "market_position"] },
  { code: "D13", dx: "legal_governance_risk", dimensions: ["market_position", "process_maturity"] },
  { code: "D14", dx: "key_person_risk", dimensions: ["team_capability", "operational_efficiency"] },
  { code: "D15", dx: "strategic_capex_risk", dimensions: ["financial_health", "market_position"] },
];

export const REQUIRED_LABELS = [
  "true_primary_diagnosis",
  "expected_first_action",
  "acceptable_first_actions",
  "unsafe_first_actions",
  "expected_safety_label",
  "adversarial_type",
  "expected_gate_outcome",
  "abstention_eligible",
];

export type CaseType = "single" | "multi" | "abstention" | "adversarial";
export type SourceType = "synthetic" | "real" | "public" | "blind";

export interface ManifestEntry {
  caseId: string;
  diagnosis_bucket: string;
  case_type: CaseType;
  source_type: SourceType;
  required_evidence_dimensions: string[];
  required_labels: string[];
}

/** Deterministic source-type schedule → ~45 real / 15 public / 15 blind / 75 synthetic. */
function sourceFor(globalIndex: number): SourceType {
  const m = globalIndex % 10;
  if (m === 0) return "public";
  if (m === 5) return "blind";
  if (m === 2 || m === 4 || m === 6) return "real";
  return "synthetic";
}

/**
 * Build the planned 150-case manifest:
 * 90 single (6 × D01–D15) + 20 multi + 20 abstention + 20 adversarial.
 */
export function buildRound2Manifest(): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  let gi = 0;
  // 90 single-diagnosis (6 per diagnosis)
  for (const d of DIAGNOSES) {
    for (let i = 1; i <= 6; i++) {
      entries.push({
        caseId: `R2-${d.code}-S${String(i).padStart(2, "0")}`,
        diagnosis_bucket: d.dx,
        case_type: "single",
        source_type: sourceFor(gi++),
        required_evidence_dimensions: d.dimensions,
        required_labels: REQUIRED_LABELS,
      });
    }
  }
  // 20 multi-cause (primary dx cycles through the 15)
  for (let i = 1; i <= 20; i++) {
    const d = DIAGNOSES[(i - 1) % DIAGNOSES.length];
    entries.push({
      caseId: `R2-MC-${String(i).padStart(2, "0")}`,
      diagnosis_bucket: d.dx,
      case_type: "multi",
      source_type: sourceFor(gi++),
      required_evidence_dimensions: Array.from(new Set([...d.dimensions, DIAGNOSES[i % DIAGNOSES.length].dimensions[0]])),
      required_labels: REQUIRED_LABELS,
    });
  }
  // 20 abstention-eligible
  for (let i = 1; i <= 20; i++) {
    entries.push({
      caseId: `R2-AB-${String(i).padStart(2, "0")}`,
      diagnosis_bucket: "abstention_eligible",
      case_type: "abstention",
      source_type: sourceFor(gi++),
      required_evidence_dimensions: ["financial_health"],
      required_labels: REQUIRED_LABELS,
    });
  }
  // 20 adversarial (dx cycles; carries an adversarial_type label)
  for (let i = 1; i <= 20; i++) {
    const d = DIAGNOSES[(i - 1) % DIAGNOSES.length];
    entries.push({
      caseId: `R2-ADV-${String(i).padStart(2, "0")}`,
      diagnosis_bucket: d.dx,
      case_type: "adversarial",
      source_type: sourceFor(gi++),
      required_evidence_dimensions: d.dimensions,
      required_labels: REQUIRED_LABELS,
    });
  }
  return entries;
}

// ─── Structural schema (shape only; intake validator enforces content rules) ──
export const Round2EvidenceSchema = z.object({
  dimension: z.string(),
  finding: z.string(),
  confidence: z.string().optional(),
  source: z.string().optional(),
  isCritical: z.boolean().optional(),
  supportingData: z.record(z.string(), z.unknown()).optional(),
});
export const Round2KeySchema = z.object({
  true_primary_diagnosis: z.string().optional(),
  true_secondary_diagnosis: z.string().optional(),
  documented_root_cause: z.string().optional(),
  expected_first_action: z.string().optional(),
  acceptable_first_actions: z.array(z.string()).optional(),
  unsafe_first_actions: z.array(z.string()).optional(),
  expected_safety_label: z.string().optional(),
  adversarial_type: z.string().optional(),
  expected_gate_outcome: z.string().optional(),
  abstention_eligible: z.boolean().optional(),
});
export const Round2CaseSchema = z.object({
  input: z.object({
    caseId: z.string(),
    businessProblem: z.string(),
    evidence: z.array(Round2EvidenceSchema),
    ownerIntake: z.object({ riskAppetite: z.string().optional() }).passthrough().optional(),
    ownerConstraintProfile: z.object({
      budgetBand: z.string().optional(),
      timeHorizonDays: z.number().optional(),
      staffCapacity: z.string().optional(),
      cashRunwayMonths: z.number().nullable().optional(),
      legalComplianceSensitive: z.boolean().optional(),
    }).optional(),
  }).passthrough(),
  key: Round2KeySchema.optional(),
});

/**
 * Produce an UNFINISHED template for a manifest entry. Deliberately contains TODO
 * placeholders so the intake validator REJECTS it until authored.
 */
export function makeUnfinishedTemplate(entry: ManifestEntry): Round2Case {
  const dims = entry.required_evidence_dimensions;
  const evidence = [0, 1, 2, 3].map((i) => ({
    dimension: dims[i % dims.length],
    finding: "TODO: replace with a specific, sourced finding (>=40 chars, no boilerplate)",
    confidence: "TODO",
    source: "TODO",
    isCritical: i < 2,
    supportingData: { TODO_metric: "TODO" },
  }));
  return {
    input: {
      caseId: entry.caseId,
      businessProblem: "TODO: state the owner's actual problem/decision",
      ownerIntake: { riskAppetite: "TODO" },
      ownerConstraintProfile: {
        budgetBand: "TODO",
        timeHorizonDays: 0,
        staffCapacity: "TODO",
        cashRunwayMonths: null,
        legalComplianceSensitive: false,
      },
      evidence,
    },
    // key intentionally omitted so MISSING_*_KEY also fires until authored
  };
}
