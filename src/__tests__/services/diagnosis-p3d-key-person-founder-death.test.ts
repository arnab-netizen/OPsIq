import { describe, it, expect } from "vitest";
import { diagnoseRootCause } from "@/services/consulting-engine/diagnosis-engine";
import {
  ConfidenceLevel,
  DiagnosisType,
  type EvidenceItem,
} from "@/domain/consulting-engine/types";
import { runCausalChallenge, type CausalEvidence } from "@/services/governance/causal-challenge";

/**
 * P3-D fix: founder-death path for key_person_risk.
 *
 * FOUNDER_DEATH_TEXT fires on process_maturity dimension when explicit
 * founder-death vocabulary is present. Ordinary CEO change does NOT fire.
 * "Governance vacuum" in key-person context does NOT block via causal challenge.
 *
 * New additions to diagnosis-engine.ts:
 *   FOUNDER_DEATH_TEXT: /founder.*died|founder.*death|...|complete.*key.?person.*loss/
 *   fin_isFounderDeath: process_maturity dim + isCritical + FOUNDER_DEATH_TEXT
 *   key_person_risk pattern extended to include fin_isFounderDeath
 *   confidence HIGH for founder death
 *   evidenceIds includes process_maturity items
 *
 * New additions to causal-challenge.ts:
 *   KEY_PERSON_HOME_SIGNAL: /founder|key.?person|successor|...|governance vacuum|.../
 *   isHoldWorthyOffArchetype: P3-D bypass for key_person_risk home signals
 */

let seq = 0;
function ev(
  dimension: EvidenceItem["dimension"],
  finding: string,
  isCritical = true,
  supportingData?: Record<string, string | number | boolean>
): EvidenceItem {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    dimension,
    finding,
    confidence: ConfidenceLevel.HIGH,
    source: "test",
    timestamp: new Date(0),
    isCritical,
    supportingData,
  };
}

const primary = (e: EvidenceItem[]) =>
  diagnoseRootCause(e, "test").primaryRootCause.type;

// ─── P3-D: founder death fires key_person_risk ───────────────────────────────

describe("P3-D — founder death fires key_person_risk (CCD-style)", () => {
  it("'Founder died — sudden and complete key-person loss' fires key_person_risk", () => {
    expect(
      primary([
        ev("process_maturity", "Founder V.G. Siddhartha died in late July 2019 — sudden and complete key-person loss"),
        ev("process_maturity", "No publicly identified successor leadership as of decision date — governance vacuum"),
        ev("process_maturity", "Founder was the central figure in creditor and investor relationships — creditor confidence immediately at risk"),
      ])
    ).toBe(DiagnosisType.KEY_PERSON_RISK);
  });

  it("'founder died' (minimal) fires key_person_risk", () => {
    expect(
      primary([
        ev("process_maturity", "The company founder died unexpectedly in 2019"),
      ])
    ).toBe(DiagnosisType.KEY_PERSON_RISK);
  });

  it("'founder's death' phrasing fires key_person_risk", () => {
    expect(
      primary([
        ev("process_maturity", "Following the founder's death, no succession plan was in place"),
      ])
    ).toBe(DiagnosisType.KEY_PERSON_RISK);
  });

  it("'founder deceased' fires key_person_risk", () => {
    expect(
      primary([
        ev("process_maturity", "Founder and managing director deceased; no deputy identified"),
      ])
    ).toBe(DiagnosisType.KEY_PERSON_RISK);
  });

  it("'key-person death' fires key_person_risk", () => {
    expect(
      primary([
        ev("process_maturity", "Key-person death of sole decision-maker creates governance vacuum"),
      ])
    ).toBe(DiagnosisType.KEY_PERSON_RISK);
  });

  it("CCD full evidence set fires key_person_risk (all dimensions)", () => {
    expect(
      primary([
        ev("financial_health", "Coffee Day Enterprises carrying approximately ₹70 billion (₹7,000 crore) in debt as of 2019"),
        ev("financial_health", "Multiple lenders and creditors had exposure to Coffee Day group entities — coordinated creditor management required"),
        ev("operational_efficiency", "Café Coffee Day is an established large national retail café network continuing operations at decision date", false),
        ev("operational_efficiency", "Complex multi-business group structure includes non-core assets beyond the café business"),
        ev("process_maturity", "Founder V.G. Siddhartha died in late July 2019 — sudden and complete key-person loss"),
        ev("process_maturity", "Founder was the central figure in creditor and investor relationships — creditor confidence immediately at risk"),
        ev("process_maturity", "No publicly identified successor leadership as of decision date — governance vacuum"),
        ev("market_position", "Café Coffee Day brand has strong recognition — preserving brand value is key to operational continuity", false),
      ])
    ).toBe(DiagnosisType.KEY_PERSON_RISK);
  });
});

// ─── P3-D: boundary guards — ordinary leadership change does NOT fire ─────────

describe("P3-D boundary guards — ordinary leadership change does NOT fire key_person_risk", () => {
  it("'CEO resigned' does NOT fire key_person_risk", () => {
    expect(
      primary([
        ev("process_maturity", "CEO resigned after five years to pursue other opportunities; a search committee has been formed"),
      ])
    ).not.toBe(DiagnosisType.KEY_PERSON_RISK);
  });

  it("'new CEO appointed' does NOT fire key_person_risk", () => {
    expect(
      primary([
        ev("process_maturity", "New CEO appointed to lead the turnaround; board transition complete"),
      ])
    ).not.toBe(DiagnosisType.KEY_PERSON_RISK);
  });

  it("'leadership change' alone does NOT fire key_person_risk", () => {
    expect(
      primary([
        ev("process_maturity", "Leadership change underway; transition expected to complete in Q2"),
      ])
    ).not.toBe(DiagnosisType.KEY_PERSON_RISK);
  });

  it("'management concern' does NOT fire key_person_risk", () => {
    expect(
      primary([
        ev("process_maturity", "There are management concerns about the pace of digital transformation"),
      ])
    ).not.toBe(DiagnosisType.KEY_PERSON_RISK);
  });

  it("'founder departed' (no death) does NOT fire key_person_risk via founder-death path", () => {
    expect(
      primary([
        ev("process_maturity", "The founder departed the company after a disagreement with investors about strategic direction"),
      ])
    ).not.toBe(DiagnosisType.KEY_PERSON_RISK);
  });

  it("founder death in financial_health dimension does NOT fire (wrong dim)", () => {
    // FOUNDER_DEATH_TEXT requires process_maturity; wrong dim should not fire
    expect(
      primary([
        ev("financial_health", "Founder died — cash position uncertain post-transition"),
      ])
    ).not.toBe(DiagnosisType.KEY_PERSON_RISK);
  });

  it("founder death non-critical does NOT fire (isCritical=false)", () => {
    expect(
      primary([
        ev("process_maturity", "Founder died in 2019", false), // not critical
      ])
    ).not.toBe(DiagnosisType.KEY_PERSON_RISK);
  });
});

// ─── P3-D: debt-only still maps to debt, not key_person ──────────────────────

describe("P3-D — debt-only cases still map to debt/cash, not key_person_risk", () => {
  it("debt-only with leverageRatio fires debt_solvency_pressure, not key_person_risk", () => {
    const r = diagnoseRootCause([
      ev("financial_health", "Leverage ratio at 8.5x, significantly above covenant of 5x", true, { leverageRatio: 8.5, covenantHeadroom: -3.5 }),
    ], "test");
    expect(r.primaryRootCause.type).toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
    expect(r.primaryRootCause.type).not.toBe(DiagnosisType.KEY_PERSON_RISK);
  });

  it("out-of-cash fires cash_liquidity_crisis, not key_person_risk", () => {
    const r = diagnoseRootCause([
      ev("financial_health", "The company is out of cash and cannot fund operations past month-end"),
    ], "test");
    expect(r.primaryRootCause.type).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
    expect(r.primaryRootCause.type).not.toBe(DiagnosisType.KEY_PERSON_RISK);
  });
});

// ─── P3-D: causal challenge does not block key_person_risk for CCD ───────────

describe("P3-D — causal challenge passes for key_person_risk in founder-death context", () => {
  function cc(
    diagnosisType: string,
    businessProblem: string,
    evidence: CausalEvidence[] = []
  ): ReturnType<typeof runCausalChallenge> {
    return runCausalChallenge({ committed: true, businessProblem, diagnosisType, evidence });
  }

  it("'governance vacuum' in process_maturity evidence does NOT block key_person_risk (P3-D bypass)", () => {
    const result = cc(
      "key_person_risk",
      "Coffee Day Enterprises faces a sudden founder-death crisis with no identified successor leadership.",
      [
        {
          dimension: "process_maturity",
          finding: "No publicly identified successor leadership as of decision date — governance vacuum",
          isCritical: true,
        },
      ]
    );
    expect(result.adverseOffArchetypeEvidence).toBe(false);
    expect(result.challenged).toBe(false);
  });

  it("'founder was central figure' in process_maturity evidence does NOT block key_person_risk", () => {
    const result = cc(
      "key_person_risk",
      "Sudden founder death with no succession plan.",
      [
        {
          dimension: "process_maturity",
          finding: "Founder was the central figure in creditor and investor relationships",
          isCritical: true,
        },
      ]
    );
    expect(result.adverseOffArchetypeEvidence).toBe(false);
    expect(result.challenged).toBe(false);
  });

  it("'no successor identified' in process_maturity does NOT block key_person_risk", () => {
    const result = cc(
      "key_person_risk",
      "Founder death — no successor identified.",
      [
        {
          dimension: "process_maturity",
          finding: "No successor identified after sudden founder death — immediate governance vacuum",
          isCritical: true,
        },
      ]
    );
    expect(result.adverseOffArchetypeEvidence).toBe(false);
    expect(result.challenged).toBe(false);
  });

  it("CCD businessProblem with debt mention does NOT trigger outOfModel for key_person_risk", () => {
    const result = cc(
      "key_person_risk",
      "Coffee Day Enterprises faces a sudden founder-death crisis in July 2019 with approximately ₹70 billion in debt, creditor confidence under severe pressure, no identified successor leadership, and a complex multi-business group structure.",
      []
    );
    expect(result.outOfModelCauseInProblem).toBe(false);
    expect(result.challenged).toBe(false);
  });
});

// ─── P3-D: scope-gap cases unchanged ─────────────────────────────────────────

describe("P3-D — scope-gap and turnaround cases remain unaffected", () => {
  it("BlackBerry-style competitive disruption does NOT fire key_person_risk", () => {
    const r = diagnoseRootCause([
      ev("market_position", "Market share eroded by iOS and Android ecosystems; developer ecosystem shifted away from the platform"),
      ev("market_position", "Enterprise segment credibility retained but consumer relevance lost permanently"),
      ev("financial_health", "Revenue declined as consumer device volumes fell sharply below prior-year levels"),
    ], "test").primaryRootCause.type;
    expect(r).not.toBe(DiagnosisType.KEY_PERSON_RISK);
  });

  it("Ordinary governance-review evidence does NOT fire key_person_risk", () => {
    expect(
      primary([
        ev("process_maturity", "Board governance review initiated following investor concerns about oversight"),
        ev("process_maturity", "Audit committee expanding scope of internal controls review"),
      ])
    ).not.toBe(DiagnosisType.KEY_PERSON_RISK);
  });
});
