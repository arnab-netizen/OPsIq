/**
 * Abstention profile diagnostic — run the full pipeline for all abstained cases
 * and emit a JSON dump of every gate input + which conditions fired.
 *
 * Run: npx tsx --tsconfig simulation_runner/tsconfig.json simulation_runner/diagnose-abstentions.ts
 */
import * as fs from "fs";
import * as path from "path";
import { v5 as uuidv5 } from "uuid";
import { runConsultingEngine } from "@/services/consulting-engine/orchestrator";
import { assessConsultingOutput, deriveSafetyGateInputs, DIAGNOSIS_CONFIDENCE_SCORE } from "@/services/governance/consulting-safety-adapter";
import {
  ConfidenceLevel,
  DiagnosisType,
  type ConsultingEngineInput,
  type EvidenceItem,
} from "@/domain/consulting-engine/types";
import { DiagnosisConfidence } from "@/domain/consulting-engine/types";
import type { CausalEvidence } from "@/services/governance/causal-challenge";
import type { OwnerConstraintProfileLike } from "@/services/governance/constraint-alignment";
import { mapDimension } from "./run-historical-validation";

const NS = "6f1b2c4e-0000-4000-8000-000000000001";
const repoRoot = path.resolve(__dirname, "..");
const casesDir = path.join(repoRoot, "simulation_runs", "historical_validation");

// The 34 abstained case IDs from the last harness run
const ABSTAINED = new Set([
  "RW_CANADA_BLACKBERRY_2012_SMARTPHONE_DISRUPTION",
  "RW_CHINA_EVERGRANDE_2021_DEBT_CRISIS",
  "RW_CHINA_LUCKIN_2020_ACCOUNTING_FRAUD",
  "RW_FINLAND_NOKIA_2010_SMARTPHONE_DISRUPTION",
  "RW_GLOBAL_FTX_2022_CRYPTO_EXCHANGE_COLLAPSE",
  "RW_INDIA_BYJUS_2024_INSOLVENCY",
  "RW_INDIA_CCD_2019_DEBT_TURNAROUND",
  "RW_INDIA_COX_KINGS_2019_DEBT_DEFAULT",
  "RW_INDIA_DHFL_2019_NBFC_INSOLVENCY",
  "RW_INDIA_FORTIS_2018_GOVERNANCE_CRISIS",
  "RW_INDIA_GITANJALI_2018_PNB_FRAUD",
  "RW_INDIA_GO_FIRST_2023_INSOLVENCY",
  "RW_INDIA_ILFS_2018_LIQUIDITY_DEFAULT",
  "RW_INDIA_JET_AIRWAYS_2019_INSOLVENCY",
  "RW_INDIA_KINGFISHER_2012_COLLAPSE",
  "RW_INDIA_LVB_2020_MORATORIUM",
  "RW_INDIA_PAYTM_2024_RBI_RESTRICTIONS",
  "RW_INDIA_RCOM_2017_2019_TELECOM_DEBT_COLLAPSE",
  "RW_INDIA_SATYAM_2009_ACCOUNTING_FRAUD",
  "RW_INDIA_SUPERTECH_2022_HOMEBUYER_INSOLVENCY",
  "RW_INDIA_SUZLON_2012_CDR",
  "RW_INDIA_VODAFONE_IDEA_2020_AGR_STRESS",
  "RW_INDIA_YES_BANK_2020_MORATORIUM",
  "RW_INDIA_ZEE_SONY_2024_MERGER_FAILURE",
  "RW_UAE_ABRAAJ_2018_PRIVATE_EQUITY_COLLAPSE",
  "RW_UAE_NMC_HEALTH_2020_ACCOUNTING_DEBT_CRISIS",
  "RW_UK_PATISSERIE_VALERIE_2018_ACCOUNTING_BLACK_HOLE",
  "RW_UK_THOMAS_COOK_2019_COLLAPSE",
  "RW_US_APPLE_1997_TURNAROUND",
  "RW_US_ENRON_2001_GOVERNANCE_FRAUD",
  "RW_US_IBM_1993_TURNAROUND",
  "RW_US_JCPENNEY_2012_PRICING_FAILURE",
  "RW_US_SEARS_2018_RETAIL_DECLINE",
  "RW_US_STARBUCKS_2008_TURNAROUND",
]);

interface RawEvidence {
  dimension: string;
  finding: string;
  confidence?: string;
  source?: string;
  isCritical?: boolean;
  supportingData?: Record<string, string | number | boolean>;
}

interface HistoricalInput {
  caseId: string;
  businessProblem: string;
  evidence: RawEvidence[];
  clientContext?: Record<string, unknown>;
  ownerConstraintProfile?: OwnerConstraintProfileLike;
}

function toEvidenceItems(caseId: string, raw: RawEvidence[]): EvidenceItem[] {
  return raw.map((e, i) => ({
    id: uuidv5(`${caseId}#evidence#${i}`, NS),
    dimension: mapDimension(e.dimension, caseId),
    finding: e.finding,
    confidence: (ConfidenceLevel as Record<string, ConfidenceLevel>)[e.confidence ?? "MEDIUM"] ?? ConfidenceLevel.MEDIUM,
    source: e.source ?? "historical-case",
    timestamp: new Date(0),
    isCritical: !!e.isCritical,
    supportingData: e.supportingData,
  }));
}

async function main(): Promise<void> {
  const dirs = fs.readdirSync(casesDir).filter((d) => d.startsWith("case_")).sort();
  const report: Record<string, unknown>[] = [];

  for (const dir of dirs) {
    const inputPath = path.join(casesDir, dir, "01_case_input.json");
    const outcomePath = path.join(casesDir, dir, "outcome.json");
    if (!fs.existsSync(inputPath) || !fs.existsSync(outcomePath)) continue;

    const inp = JSON.parse(fs.readFileSync(inputPath, "utf-8")) as HistoricalInput;
    if (!ABSTAINED.has(inp.caseId)) continue;

    const outcomeParsed = JSON.parse(fs.readFileSync(outcomePath, "utf-8"));
    if (outcomeParsed.grounding_class !== "REAL_SOURCE_BACKED") continue;

    const cc = inp.clientContext ?? {};
    const evidence = toEvidenceItems(inp.caseId, inp.evidence);
    const engineInput: ConsultingEngineInput = {
      engagementId: uuidv5(`${inp.caseId}#engagement`, NS),
      businessProblem: inp.businessProblem,
      evidence,
      clientContext: {
        industry: String(cc.industry ?? "general"),
        size: String(cc.size ?? "small"),
        revenueImpactUrgency: (cc.revenueImpactUrgency as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") ?? "MEDIUM",
      },
    };

    const output = await runConsultingEngine(engineInput);
    const memo = output.decisionMemo;
    const ocp = inp.ownerConstraintProfile;
    const safetyOpts = {
      totalEvidenceCount: evidence.length,
      evidence: (inp.evidence as CausalEvidence[]) ?? [],
      ownerConstraintProfile: ocp,
    };

    const gateInputs = deriveSafetyGateInputs(output, safetyOpts);
    const safety = assessConsultingOutput(output, uuidv5(`${inp.caseId}#rec`, NS), "historical-validation", safetyOpts);

    const committed = output.status !== "INSUFFICIENT_EVIDENCE" && memo.rootCauseDiagnosis.type !== DiagnosisType.UNKNOWN;

    // Evidence dimension distribution
    const dimCounts: Record<string, number> = {};
    for (const e of evidence) {
      dimCounts[e.dimension] = (dimCounts[e.dimension] ?? 0) + 1;
    }

    // Which evidenceIds were used by the diagnosis
    const usedIds = memo.rootCauseDiagnosis.evidenceIds ?? [];

    // Which gates fired
    const firedGates = safety.assessment.unsafe_conditions
      .filter((c) => c.blocking)
      .map((c) => ({ type: c.condition_type, severity: c.severity, description: c.description }));

    report.push({
      caseId: inp.caseId,
      evidenceCount: evidence.length,
      dimCounts,
      rawDimensions: inp.evidence.map((e) => e.dimension),
      engineStatus: output.status,
      diagnosisType: memo.rootCauseDiagnosis.type,
      diagnosisConfidence: memo.diagnosisConfidence,
      evidenceIdsUsed: usedIds.length,
      missingEvidenceFor: memo.rootCauseDiagnosis.missingEvidenceFor ?? [],
      committed_harness: committed,
      gateInputs: {
        confidence_score: gateInputs.confidence_score,
        has_evidence: gateInputs.has_evidence,
        preconditions_met: gateInputs.preconditions_met,
        evidence_support: gateInputs.evidence_support,
      },
      causalChallenge: safety.causal_challenge,
      constraintAlignment: safety.constraint_alignment,
      ownerActionDanger: safety.owner_action_danger,
      gateAbstain: safety.assessment.abstain,
      firedGates,
      ownerConstraintProfile: ocp ?? null,
    });
  }

  const outPath = path.join(repoRoot, "simulation_runner", "_ABSTENTION_DIAGNOSTIC.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf-8");
  console.log(`Wrote diagnostic for ${report.length} cases to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
