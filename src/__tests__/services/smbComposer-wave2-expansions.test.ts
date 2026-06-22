import { describe, it, expect } from "vitest";
import {
  detectSubMechanism,
  buildSubMechanismSentence,
  type SubMechanism,
} from "@tests/owner-mode/real-world-smb-cases/smbOutputComposer";
import {
  DiagnosisType,
  DiagnosisConfidence,
  ConfidenceLevel,
  type EvidenceItem,
} from "@/domain/consulting-engine/types";
import type { ComposerInput } from "@tests/owner-mode/real-world-smb-cases/smbOutputComposer";

// ── Minimal builder helpers ──────────────────────────────────────────────────

let seq = 0;
function ev(
  dimension: EvidenceItem["dimension"],
  finding: string,
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
    isCritical: true,
    supportingData,
  };
}

function sidecarItem(finding: string, isCritical = true) {
  return {
    finding,
    is_critical: isCritical,
    confidence: "HIGH" as const,
  };
}

function makeInput(
  type: DiagnosisType,
  evidenceItems: EvidenceItem[],
  sidecarFindings: string[],
  metricKeyMappings: Array<{ canonical_key: string; value_override: number }> = []
): ComposerInput {
  return {
    diagnosisResult: {
      primaryRootCause: {
        type,
        confidence: DiagnosisConfidence.HIGH,
        mechanismDescription: "",
        missingEvidenceFor: [],
      },
      confidence: DiagnosisConfidence.HIGH,
      alternativeRootCauses: [],
      warningFlags: [],
    },
    evidenceItems,
    sidecar: {
      case_id: "TEST",
      evidence_items: sidecarFindings.map(sidecarItem),
      metric_key_mappings: metricKeyMappings.map((m) => ({
        fixture_key: m.canonical_key,
        canonical_key: m.canonical_key,
        evidence_item_index: 0,
        value_override: m.value_override,
      })),
      clarification_requests: [],
      unsupported_expected_archetypes: [],
    },
    scenario: {
      missing_inputs_opsiq_should_request: [],
    },
  };
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function containsPhrase(haystack: string, phrase: string): boolean {
  const normHaystack = normalize(haystack);
  const normPhrase = normalize(phrase);
  const tokens = normPhrase.split(" ").filter((t) => t.length > 2);
  if (tokens.length === 0) return normHaystack.includes(normPhrase);
  if (tokens.length <= 3) return normHaystack.includes(normPhrase);
  const matchCount = tokens.filter((t) => normHaystack.includes(t)).length;
  return matchCount / tokens.length >= 0.7;
}

// ── 1. WC_SLOW_CLIENT_PAY detection and sentences ──────────────────────────

describe("Wave 2 — WC_SLOW_CLIENT_PAY detection", () => {
  it("detects WC_SLOW_CLIENT_PAY when sidecarText contains 'payroll'", () => {
    const input = makeInput(
      DiagnosisType.WORKING_CAPITAL_STRESS,
      [ev("financial_health", "payroll obligations fall due before clients pay", { receivablesAging: 60 })],
      ["owner drawing on personal credit line each time bi-weekly payroll obligations fall due"],
      [{ canonical_key: "receivablesAging", value_override: 60 }]
    );
    expect(detectSubMechanism(input, DiagnosisType.WORKING_CAPITAL_STRESS)).toBe("WC_SLOW_CLIENT_PAY");
  });

  it("WC_SLOW_CLIENT_PAY sentence contains 'slow paying clients'", () => {
    const input = makeInput(
      DiagnosisType.WORKING_CAPITAL_STRESS,
      [ev("financial_health", "test", { receivablesAging: 60 })],
      ["payroll timing issue"],
      [{ canonical_key: "receivablesAging", value_override: 60 }]
    );
    const sentence = buildSubMechanismSentence(input, "WC_SLOW_CLIENT_PAY");
    expect(containsPhrase(sentence, "slow-paying clients")).toBe(true);
  });

  it("WC_SLOW_CLIENT_PAY sentence contains 'billing cycle timing'", () => {
    const input = makeInput(
      DiagnosisType.WORKING_CAPITAL_STRESS,
      [ev("financial_health", "test", { receivablesAging: 60 })],
      ["payroll"],
      [{ canonical_key: "receivablesAging", value_override: 60 }]
    );
    const sentence = buildSubMechanismSentence(input, "WC_SLOW_CLIENT_PAY");
    expect(containsPhrase(sentence, "billing cycle timing")).toBe(true);
  });

  it("WC_SLOW_CLIENT_PAY sentence contains 'cash shortfall at payroll date'", () => {
    const input = makeInput(
      DiagnosisType.WORKING_CAPITAL_STRESS,
      [ev("financial_health", "test", { receivablesAging: 60 })],
      ["payroll"],
      [{ canonical_key: "receivablesAging", value_override: 60 }]
    );
    const sentence = buildSubMechanismSentence(input, "WC_SLOW_CLIENT_PAY");
    expect(containsPhrase(sentence, "cash shortfall at payroll date")).toBe(true);
  });

  it("WC_SLOW_CLIENT_PAY sentence contains 'collection lag'", () => {
    const input = makeInput(
      DiagnosisType.WORKING_CAPITAL_STRESS,
      [ev("financial_health", "test", { receivablesAging: 60 })],
      ["payroll"],
      [{ canonical_key: "receivablesAging", value_override: 60 }]
    );
    const sentence = buildSubMechanismSentence(input, "WC_SLOW_CLIENT_PAY");
    expect(containsPhrase(sentence, "collection lag")).toBe(true);
  });

  it("WC_SLOW_CLIENT_PAY sentence contains 'debtors aged by client'", () => {
    const input = makeInput(
      DiagnosisType.WORKING_CAPITAL_STRESS,
      [ev("financial_health", "test", { receivablesAging: 60 })],
      ["payroll"],
      [{ canonical_key: "receivablesAging", value_override: 60 }]
    );
    const sentence = buildSubMechanismSentence(input, "WC_SLOW_CLIENT_PAY");
    expect(containsPhrase(sentence, "debtors aged by client")).toBe(true);
  });

  it("WC_SLOW_CLIENT_PAY sentence contains 'no formal collections process'", () => {
    const input = makeInput(
      DiagnosisType.WORKING_CAPITAL_STRESS,
      [ev("financial_health", "test", { receivablesAging: 60 })],
      ["payroll"],
      [{ canonical_key: "receivablesAging", value_override: 60 }]
    );
    const sentence = buildSubMechanismSentence(input, "WC_SLOW_CLIENT_PAY");
    expect(containsPhrase(sentence, "no formal collections process")).toBe(true);
  });

  it("WC_SLOW_CLIENT_PAY sentence contains enterprise client payment delays vocabulary", () => {
    const input = makeInput(
      DiagnosisType.WORKING_CAPITAL_STRESS,
      [ev("financial_health", "test", { receivablesAging: 60 })],
      ["payroll"],
      [{ canonical_key: "receivablesAging", value_override: 60 }]
    );
    const sentence = buildSubMechanismSentence(input, "WC_SLOW_CLIENT_PAY");
    expect(containsPhrase(sentence, "enterprise client payment delays")).toBe(true);
  });
});

// ── 2. WC_PROJECT_BILLING detection and sentences ──────────────────────────

describe("Wave 2 — WC_PROJECT_BILLING detection", () => {
  it("detects WC_PROJECT_BILLING when sidecarText contains 'progress' and 'claim'", () => {
    const input = makeInput(
      DiagnosisType.WORKING_CAPITAL_STRESS,
      [ev("financial_health", "test", { receivablesAging: 180 })],
      ["no formal progress-claim schedule for active projects"],
      [{ canonical_key: "receivablesAging", value_override: 180 }]
    );
    expect(detectSubMechanism(input, DiagnosisType.WORKING_CAPITAL_STRESS)).toBe("WC_PROJECT_BILLING");
  });

  it("detects WC_PROJECT_BILLING when sidecarText contains 'milestone'", () => {
    const input = makeInput(
      DiagnosisType.WORKING_CAPITAL_STRESS,
      [ev("financial_health", "test", { receivablesAging: 90 })],
      ["milestone payments not tracked across active contracts"],
      [{ canonical_key: "receivablesAging", value_override: 90 }]
    );
    expect(detectSubMechanism(input, DiagnosisType.WORKING_CAPITAL_STRESS)).toBe("WC_PROJECT_BILLING");
  });

  it("WC_PROJECT_BILLING sentence contains 'project billing schedule'", () => {
    const input = makeInput(
      DiagnosisType.WORKING_CAPITAL_STRESS,
      [ev("financial_health", "test", { receivablesAging: 180 })],
      ["progress-claim schedule missing"],
      [{ canonical_key: "receivablesAging", value_override: 180 }]
    );
    const sentence = buildSubMechanismSentence(input, "WC_PROJECT_BILLING");
    expect(containsPhrase(sentence, "project billing schedule")).toBe(true);
  });

  it("WC_PROJECT_BILLING sentence contains 'milestone claims'", () => {
    const input = makeInput(
      DiagnosisType.WORKING_CAPITAL_STRESS,
      [ev("financial_health", "test", { receivablesAging: 180 })],
      ["progress-claim"],
      [{ canonical_key: "receivablesAging", value_override: 180 }]
    );
    const sentence = buildSubMechanismSentence(input, "WC_PROJECT_BILLING");
    expect(containsPhrase(sentence, "milestone claims")).toBe(true);
  });

  it("WC_PROJECT_BILLING sentence contains 'staged invoicing'", () => {
    const input = makeInput(
      DiagnosisType.WORKING_CAPITAL_STRESS,
      [ev("financial_health", "test", { receivablesAging: 180 })],
      ["progress-claim"],
      [{ canonical_key: "receivablesAging", value_override: 180 }]
    );
    const sentence = buildSubMechanismSentence(input, "WC_PROJECT_BILLING");
    expect(containsPhrase(sentence, "staged invoicing")).toBe(true);
  });

  it("WC_PROJECT_BILLING sentence contains 'retention balances'", () => {
    const input = makeInput(
      DiagnosisType.WORKING_CAPITAL_STRESS,
      [ev("financial_health", "test", { receivablesAging: 180 })],
      ["progress-claim"],
      [{ canonical_key: "receivablesAging", value_override: 180 }]
    );
    const sentence = buildSubMechanismSentence(input, "WC_PROJECT_BILLING");
    expect(containsPhrase(sentence, "retention balances")).toBe(true);
  });

  it("WC_PROJECT_BILLING sentence contains 'unbilled completed work'", () => {
    const input = makeInput(
      DiagnosisType.WORKING_CAPITAL_STRESS,
      [ev("financial_health", "test", { receivablesAging: 180 })],
      ["progress-claim"],
      [{ canonical_key: "receivablesAging", value_override: 180 }]
    );
    const sentence = buildSubMechanismSentence(input, "WC_PROJECT_BILLING");
    expect(containsPhrase(sentence, "unbilled completed work")).toBe(true);
  });

  it("WC_PROJECT_BILLING sentence contains secondary cause 'retention amounts not tracked or pursued'", () => {
    const input = makeInput(
      DiagnosisType.WORKING_CAPITAL_STRESS,
      [ev("financial_health", "test", { receivablesAging: 180 })],
      ["progress-claim"],
      [{ canonical_key: "receivablesAging", value_override: 180 }]
    );
    const sentence = buildSubMechanismSentence(input, "WC_PROJECT_BILLING");
    expect(containsPhrase(sentence, "retention amounts not tracked or pursued")).toBe(true);
  });

  it("WC_PROJECT_BILLING sentence contains secondary cause vocabulary for systemic misattribution", () => {
    const input = makeInput(
      DiagnosisType.WORKING_CAPITAL_STRESS,
      [ev("financial_health", "test", { receivablesAging: 180 })],
      ["progress-claim"],
      [{ canonical_key: "receivablesAging", value_override: 180 }]
    );
    const sentence = buildSubMechanismSentence(input, "WC_PROJECT_BILLING");
    expect(containsPhrase(sentence, "misattribution of a systemic problem to a single past event")).toBe(true);
  });

  it("WC_PROJECT_BILLING does NOT fire when sidecarText has only generic cash pressure", () => {
    const input = makeInput(
      DiagnosisType.WORKING_CAPITAL_STRESS,
      [ev("financial_health", "test", { receivablesAging: 90 })],
      ["cash is tight and clients are slow to pay outstanding invoices"],
      [{ canonical_key: "receivablesAging", value_override: 90 }]
    );
    expect(detectSubMechanism(input, DiagnosisType.WORKING_CAPITAL_STRESS)).not.toBe("WC_PROJECT_BILLING");
  });
});

// ── 3. DEMAND_STAGNATION_SUBSCRIBER_CHURN detection and sentences ───────────

describe("Wave 2 — DEMAND_STAGNATION_SUBSCRIBER_CHURN", () => {
  it("detects subscriber churn when sidecarText contains 'subscriber'", () => {
    const input = makeInput(
      DiagnosisType.DEMAND_GENERATION_FAILURE,
      [ev("market_position", "test", { newCustomerRate: 12 })],
      ["total subscriber count is not growing despite 12 new signups per month"]
    );
    expect(detectSubMechanism(input, DiagnosisType.DEMAND_GENERATION_FAILURE)).toBe("DEMAND_STAGNATION_SUBSCRIBER_CHURN");
  });

  it("subscriber churn sentence contains 'retention problem not acquisition problem'", () => {
    const input = makeInput(
      DiagnosisType.DEMAND_GENERATION_FAILURE,
      [ev("market_position", "test", { newCustomerRate: 12 })],
      ["subscriber count flat"]
    );
    const sentence = buildSubMechanismSentence(input, "DEMAND_STAGNATION_SUBSCRIBER_CHURN");
    expect(containsPhrase(sentence, "retention problem not acquisition problem")).toBe(true);
  });

  it("subscriber churn sentence contains 'net subscriber growth stall despite new signups'", () => {
    const input = makeInput(
      DiagnosisType.DEMAND_GENERATION_FAILURE,
      [ev("market_position", "test", { newCustomerRate: 12 })],
      ["subscriber count flat"]
    );
    const sentence = buildSubMechanismSentence(input, "DEMAND_STAGNATION_SUBSCRIBER_CHURN");
    expect(containsPhrase(sentence, "net subscriber growth stall despite new signups")).toBe(true);
  });

  it("subscriber churn sentence contains 'exit feedback indicating product or onboarding issues'", () => {
    const input = makeInput(
      DiagnosisType.DEMAND_GENERATION_FAILURE,
      [ev("market_position", "test", { newCustomerRate: 12 })],
      ["subscriber count flat"]
    );
    const sentence = buildSubMechanismSentence(input, "DEMAND_STAGNATION_SUBSCRIBER_CHURN");
    expect(containsPhrase(sentence, "exit feedback indicating product or onboarding issues")).toBe(true);
  });

  it("subscriber churn sentence contains 'churn calculation methodology'", () => {
    const input = makeInput(
      DiagnosisType.DEMAND_GENERATION_FAILURE,
      [ev("market_position", "test", { newCustomerRate: 12 })],
      ["subscriber count flat"]
    );
    const sentence = buildSubMechanismSentence(input, "DEMAND_STAGNATION_SUBSCRIBER_CHURN");
    expect(containsPhrase(sentence, "churn calculation methodology")).toBe(true);
  });

  it("subscriber churn sentence contains 'actual departure rate versus stated rate'", () => {
    const input = makeInput(
      DiagnosisType.DEMAND_GENERATION_FAILURE,
      [ev("market_position", "test", { newCustomerRate: 12 })],
      ["subscriber count flat"]
    );
    const sentence = buildSubMechanismSentence(input, "DEMAND_STAGNATION_SUBSCRIBER_CHURN");
    expect(containsPhrase(sentence, "actual departure rate versus stated rate")).toBe(true);
  });
});

// ── 4. DEMAND_STAGNATION_MEMBER_CHURN detection and sentences ───────────────

describe("Wave 2 — DEMAND_STAGNATION_MEMBER_CHURN", () => {
  it("detects member churn when sidecarText contains 'member' (and not 'subscriber')", () => {
    const input = makeInput(
      DiagnosisType.DEMAND_GENERATION_FAILURE,
      [ev("market_position", "test", { newCustomerRate: 18 })],
      ["total active member count has remained unchanged at 310 for two years"]
    );
    expect(detectSubMechanism(input, DiagnosisType.DEMAND_GENERATION_FAILURE)).toBe("DEMAND_STAGNATION_MEMBER_CHURN");
  });

  it("member churn sentence contains 'attrition rate offsetting new member intake'", () => {
    const input = makeInput(
      DiagnosisType.DEMAND_GENERATION_FAILURE,
      [ev("market_position", "test", { newCustomerRate: 18 })],
      ["member count flat"]
    );
    const sentence = buildSubMechanismSentence(input, "DEMAND_STAGNATION_MEMBER_CHURN");
    expect(containsPhrase(sentence, "attrition rate offsetting new member intake")).toBe(true);
  });

  it("member churn sentence contains 'net member growth calculation'", () => {
    const input = makeInput(
      DiagnosisType.DEMAND_GENERATION_FAILURE,
      [ev("market_position", "test", { newCustomerRate: 18 })],
      ["member count flat"]
    );
    const sentence = buildSubMechanismSentence(input, "DEMAND_STAGNATION_MEMBER_CHURN");
    expect(containsPhrase(sentence, "net member growth calculation")).toBe(true);
  });

  it("member churn sentence contains 'retention failure not acquisition failure'", () => {
    const input = makeInput(
      DiagnosisType.DEMAND_GENERATION_FAILURE,
      [ev("market_position", "test", { newCustomerRate: 18 })],
      ["member count flat"]
    );
    const sentence = buildSubMechanismSentence(input, "DEMAND_STAGNATION_MEMBER_CHURN");
    expect(containsPhrase(sentence, "retention failure not acquisition failure")).toBe(true);
  });

  it("member churn sentence contains 'departure pattern not tracked'", () => {
    const input = makeInput(
      DiagnosisType.DEMAND_GENERATION_FAILURE,
      [ev("market_position", "test", { newCustomerRate: 18 })],
      ["member count flat"]
    );
    const sentence = buildSubMechanismSentence(input, "DEMAND_STAGNATION_MEMBER_CHURN");
    expect(containsPhrase(sentence, "departure pattern not tracked")).toBe(true);
  });

  it("member churn sentence contains 'membership duration as an indicator of engagement depth'", () => {
    const input = makeInput(
      DiagnosisType.DEMAND_GENERATION_FAILURE,
      [ev("market_position", "test", { newCustomerRate: 18 })],
      ["member count flat"]
    );
    const sentence = buildSubMechanismSentence(input, "DEMAND_STAGNATION_MEMBER_CHURN");
    expect(containsPhrase(sentence, "membership duration as an indicator of engagement depth")).toBe(true);
  });

  it("member churn sentence contains secondary cause 'owner diagnosing acquisition problem when the root cause is retention'", () => {
    const input = makeInput(
      DiagnosisType.DEMAND_GENERATION_FAILURE,
      [ev("market_position", "test", { newCustomerRate: 18 })],
      ["member count flat"]
    );
    const sentence = buildSubMechanismSentence(input, "DEMAND_STAGNATION_MEMBER_CHURN");
    expect(containsPhrase(sentence, "owner diagnosing acquisition problem when the root cause is retention")).toBe(true);
  });
});

// ── 5. GTM_TARGETING_SCOPE_MISMATCH detection and sentences ─────────────────

describe("Wave 2 — GTM_TARGETING_SCOPE_MISMATCH", () => {
  it("detects targeting mismatch when sidecarText contains 'enquir'", () => {
    const input = makeInput(
      DiagnosisType.GTM_CHANNEL_MISMATCH,
      [ev("market_position", "test", { funnelConversionPct: 4, leadVolume: 200 })],
      ["over 200 monthly enquiries arriving but fewer than 4 percent convert"]
    );
    expect(detectSubMechanism(input, DiagnosisType.GTM_CHANNEL_MISMATCH)).toBe("GTM_TARGETING_SCOPE_MISMATCH");
  });

  it("GTM targeting sentence contains 'targeting mismatch generating out-of-scope enquiries'", () => {
    const input = makeInput(
      DiagnosisType.GTM_CHANNEL_MISMATCH,
      [ev("market_position", "test", { funnelConversionPct: 4, leadVolume: 200 })],
      ["enquiries from broadened targeting"]
    );
    const sentence = buildSubMechanismSentence(input, "GTM_TARGETING_SCOPE_MISMATCH");
    expect(containsPhrase(sentence, "targeting mismatch generating out-of-scope enquiries")).toBe(true);
  });

  it("GTM targeting sentence contains 'in-scope versus out-of-scope enquiry conversion gap'", () => {
    const input = makeInput(
      DiagnosisType.GTM_CHANNEL_MISMATCH,
      [ev("market_position", "test", { funnelConversionPct: 4, leadVolume: 200 })],
      ["enquiries"]
    );
    const sentence = buildSubMechanismSentence(input, "GTM_TARGETING_SCOPE_MISMATCH");
    expect(containsPhrase(sentence, "in-scope versus out-of-scope enquiry conversion gap")).toBe(true);
  });

  it("GTM targeting sentence contains 'intake capacity consumed by unqualifiable leads'", () => {
    const input = makeInput(
      DiagnosisType.GTM_CHANNEL_MISMATCH,
      [ev("market_position", "test", { funnelConversionPct: 4, leadVolume: 200 })],
      ["enquiries"]
    );
    const sentence = buildSubMechanismSentence(input, "GTM_TARGETING_SCOPE_MISMATCH");
    expect(containsPhrase(sentence, "intake capacity consumed by unqualifiable leads")).toBe(true);
  });

  it("GTM targeting sentence contains 'advertising configuration as the upstream cause'", () => {
    const input = makeInput(
      DiagnosisType.GTM_CHANNEL_MISMATCH,
      [ev("market_position", "test", { funnelConversionPct: 4, leadVolume: 200 })],
      ["enquiries"]
    );
    const sentence = buildSubMechanismSentence(input, "GTM_TARGETING_SCOPE_MISMATCH");
    expect(containsPhrase(sentence, "advertising configuration as the upstream cause")).toBe(true);
  });

  it("GTM targeting sentence contains 'matter type qualification rate'", () => {
    const input = makeInput(
      DiagnosisType.GTM_CHANNEL_MISMATCH,
      [ev("market_position", "test", { funnelConversionPct: 4, leadVolume: 200 })],
      ["enquiries"]
    );
    const sentence = buildSubMechanismSentence(input, "GTM_TARGETING_SCOPE_MISMATCH");
    expect(containsPhrase(sentence, "matter type qualification rate")).toBe(true);
  });

  it("GTM targeting sentence contains secondary cause 'advertising targeting not anchored to matter types handled'", () => {
    const input = makeInput(
      DiagnosisType.GTM_CHANNEL_MISMATCH,
      [ev("market_position", "test", { funnelConversionPct: 4, leadVolume: 200 })],
      ["enquiries"]
    );
    const sentence = buildSubMechanismSentence(input, "GTM_TARGETING_SCOPE_MISMATCH");
    expect(containsPhrase(sentence, "advertising targeting not anchored to matter types handled")).toBe(true);
  });

  it("Generic GTM case without enquiry vocabulary does NOT fire GTM_TARGETING_SCOPE_MISMATCH", () => {
    const input = makeInput(
      DiagnosisType.GTM_CHANNEL_MISMATCH,
      [ev("market_position", "test", { channelCac: 240, channelMix: 70 })],
      ["paid-search absorbs seventy percent of spend but converts poorly"]
    );
    expect(detectSubMechanism(input, DiagnosisType.GTM_CHANNEL_MISMATCH)).not.toBe("GTM_TARGETING_SCOPE_MISMATCH");
  });
});

// ── 6. MARGIN_DISCOUNT_DEPENDENCY detection and sentences ───────────────────

describe("Wave 2 — MARGIN_DISCOUNT_DEPENDENCY", () => {
  it("detects discount dependency when sidecarText contains 'promotional'", () => {
    const input = makeInput(
      DiagnosisType.MARGIN_EROSION,
      [ev("financial_health", "test", { marginPct: -15 })],
      ["promotional price reductions are required to clear unsold product each season"]
    );
    expect(detectSubMechanism(input, DiagnosisType.MARGIN_EROSION)).toBe("MARGIN_DISCOUNT_DEPENDENCY");
  });

  it("MARGIN_DISCOUNT_DEPENDENCY sentence contains 'discount dependency'", () => {
    const input = makeInput(
      DiagnosisType.MARGIN_EROSION,
      [ev("financial_health", "test", { marginPct: -15 })],
      ["promotional clearance events required each season"]
    );
    const sentence = buildSubMechanismSentence(input, "MARGIN_DISCOUNT_DEPENDENCY");
    expect(containsPhrase(sentence, "discount dependency")).toBe(true);
  });

  it("MARGIN_DISCOUNT_DEPENDENCY sentence contains 'slow-moving inventory'", () => {
    const input = makeInput(
      DiagnosisType.MARGIN_EROSION,
      [ev("financial_health", "test", { marginPct: -15 })],
      ["promotional clearance"]
    );
    const sentence = buildSubMechanismSentence(input, "MARGIN_DISCOUNT_DEPENDENCY");
    expect(containsPhrase(sentence, "slow-moving inventory")).toBe(true);
  });

  it("MARGIN_DISCOUNT_DEPENDENCY sentence contains 'full-price sell-through rate'", () => {
    const input = makeInput(
      DiagnosisType.MARGIN_EROSION,
      [ev("financial_health", "test", { marginPct: -15 })],
      ["promotional clearance"]
    );
    const sentence = buildSubMechanismSentence(input, "MARGIN_DISCOUNT_DEPENDENCY");
    expect(containsPhrase(sentence, "full-price sell-through rate")).toBe(true);
  });

  it("MARGIN_DISCOUNT_DEPENDENCY sentence contains 'product range overextension'", () => {
    const input = makeInput(
      DiagnosisType.MARGIN_EROSION,
      [ev("financial_health", "test", { marginPct: -15 })],
      ["promotional clearance"]
    );
    const sentence = buildSubMechanismSentence(input, "MARGIN_DISCOUNT_DEPENDENCY");
    expect(containsPhrase(sentence, "product range overextension")).toBe(true);
  });

  it("MARGIN_DISCOUNT_DEPENDENCY sentence contains 'buying decisions not anchored to margin analysis'", () => {
    const input = makeInput(
      DiagnosisType.MARGIN_EROSION,
      [ev("financial_health", "test", { marginPct: -15 })],
      ["promotional clearance"]
    );
    const sentence = buildSubMechanismSentence(input, "MARGIN_DISCOUNT_DEPENDENCY");
    expect(containsPhrase(sentence, "buying decisions not anchored to margin analysis")).toBe(true);
  });
});

// ── 7. MARGIN_FOOD_COST_ABSORPTION detection and sentences ──────────────────

describe("Wave 2 — MARGIN_FOOD_COST_ABSORPTION", () => {
  it("detects food cost absorption when sidecarText contains 'ingredient'", () => {
    const input = makeInput(
      DiagnosisType.MARGIN_EROSION,
      [ev("financial_health", "test", { marginPct: -18 })],
      ["ingredient and packaging costs have risen significantly over the past 24 months"]
    );
    expect(detectSubMechanism(input, DiagnosisType.MARGIN_EROSION)).toBe("MARGIN_FOOD_COST_ABSORPTION");
  });

  it("detects food cost absorption when sidecarText contains 'café'", () => {
    const input = makeInput(
      DiagnosisType.MARGIN_EROSION,
      [ev("financial_health", "test", { marginPct: -18 })],
      ["café selling prices have not been updated in three years"]
    );
    expect(detectSubMechanism(input, DiagnosisType.MARGIN_EROSION)).toBe("MARGIN_FOOD_COST_ABSORPTION");
  });

  it("MARGIN_FOOD_COST_ABSORPTION sentence contains 'food cost as proportion of revenue'", () => {
    const input = makeInput(
      DiagnosisType.MARGIN_EROSION,
      [ev("financial_health", "test", { marginPct: -18 })],
      ["ingredient costs rising"]
    );
    const sentence = buildSubMechanismSentence(input, "MARGIN_FOOD_COST_ABSORPTION");
    expect(containsPhrase(sentence, "food cost as proportion of revenue")).toBe(true);
  });

  it("MARGIN_FOOD_COST_ABSORPTION sentence contains 'menu pricing not reviewed'", () => {
    const input = makeInput(
      DiagnosisType.MARGIN_EROSION,
      [ev("financial_health", "test", { marginPct: -18 })],
      ["ingredient costs rising"]
    );
    const sentence = buildSubMechanismSentence(input, "MARGIN_FOOD_COST_ABSORPTION");
    expect(containsPhrase(sentence, "menu pricing not reviewed")).toBe(true);
  });

  it("MARGIN_FOOD_COST_ABSORPTION sentence contains 'cost absorption without recovery'", () => {
    const input = makeInput(
      DiagnosisType.MARGIN_EROSION,
      [ev("financial_health", "test", { marginPct: -18 })],
      ["ingredient costs rising"]
    );
    const sentence = buildSubMechanismSentence(input, "MARGIN_FOOD_COST_ABSORPTION");
    expect(containsPhrase(sentence, "cost absorption without recovery")).toBe(true);
  });

  it("MARGIN_FOOD_COST_ABSORPTION sentence contains 'direct costs rising against stable selling prices'", () => {
    const input = makeInput(
      DiagnosisType.MARGIN_EROSION,
      [ev("financial_health", "test", { marginPct: -18 })],
      ["ingredient costs rising"]
    );
    const sentence = buildSubMechanismSentence(input, "MARGIN_FOOD_COST_ABSORPTION");
    expect(containsPhrase(sentence, "direct costs rising against stable selling prices")).toBe(true);
  });

  it("MARGIN_FOOD_COST_ABSORPTION sentence contains 'margin erosion over time'", () => {
    const input = makeInput(
      DiagnosisType.MARGIN_EROSION,
      [ev("financial_health", "test", { marginPct: -18 })],
      ["ingredient costs rising"]
    );
    const sentence = buildSubMechanismSentence(input, "MARGIN_FOOD_COST_ABSORPTION");
    expect(containsPhrase(sentence, "margin erosion over time")).toBe(true);
  });

  it("MARGIN_FOOD_COST_ABSORPTION sentence contains secondary 'no regular menu and pricing review process'", () => {
    const input = makeInput(
      DiagnosisType.MARGIN_EROSION,
      [ev("financial_health", "test", { marginPct: -18 })],
      ["ingredient costs rising"]
    );
    const sentence = buildSubMechanismSentence(input, "MARGIN_FOOD_COST_ABSORPTION");
    expect(containsPhrase(sentence, "no regular menu and pricing review process")).toBe(true);
  });

  it("MARGIN_FOOD_COST_ABSORPTION sentence contains secondary 'catering softer bookings misidentified as primary cause'", () => {
    const input = makeInput(
      DiagnosisType.MARGIN_EROSION,
      [ev("financial_health", "test", { marginPct: -18 })],
      ["ingredient costs rising"]
    );
    const sentence = buildSubMechanismSentence(input, "MARGIN_FOOD_COST_ABSORPTION");
    expect(containsPhrase(sentence, "catering softer bookings misidentified as primary cause")).toBe(true);
  });

  it("MARGIN_FOOD_COST_ABSORPTION sentence contains secondary 'cost increases absorbed without margin impact assessment'", () => {
    const input = makeInput(
      DiagnosisType.MARGIN_EROSION,
      [ev("financial_health", "test", { marginPct: -18 })],
      ["ingredient costs rising"]
    );
    const sentence = buildSubMechanismSentence(input, "MARGIN_FOOD_COST_ABSORPTION");
    expect(containsPhrase(sentence, "cost increases absorbed without margin impact assessment")).toBe(true);
  });

  it("MARGIN_FOOD_COST_ABSORPTION fires BEFORE MARGIN_DISCOUNT_DEPENDENCY when both could match", () => {
    const input = makeInput(
      DiagnosisType.MARGIN_EROSION,
      [ev("financial_health", "test", { marginPct: -18 })],
      ["café using promotional events but ingredient costs are the main driver"]
    );
    expect(detectSubMechanism(input, DiagnosisType.MARGIN_EROSION)).toBe("MARGIN_FOOD_COST_ABSORPTION");
  });
});

// ── 8. Safety guards: existing sub-mechanisms not disturbed ──────────────────

describe("Wave 2 — existing sub-mechanism safety guards", () => {
  it("WC_CASH_CONVERSION_CYCLE still fires when cashConversionDays present", () => {
    const input = makeInput(
      DiagnosisType.WORKING_CAPITAL_STRESS,
      [ev("financial_health", "test", { cashConversionDays: 95 })],
      ["accounts receivable and payables timing gap"],
      [{ canonical_key: "cashConversionDays", value_override: 95 }]
    );
    expect(detectSubMechanism(input, DiagnosisType.WORKING_CAPITAL_STRESS)).toBe("WC_CASH_CONVERSION_CYCLE");
  });

  it("WC_BILLED_NOT_COLLECTED_GAP still fires with billing + aging signals", () => {
    const input = makeInput(
      DiagnosisType.WORKING_CAPITAL_STRESS,
      [ev("financial_health", "test", { receivablesAging: 75 })],
      ["invoice aging for enterprise clients is causing collection lag", "billed but overdue amounts accumulate"],
      [{ canonical_key: "receivablesAging", value_override: 75 }]
    );
    expect(detectSubMechanism(input, DiagnosisType.WORKING_CAPITAL_STRESS)).toBe("WC_BILLED_NOT_COLLECTED_GAP");
  });

  it("MARGIN_COMMODITY_PASS_THROUGH still fires on profitChangePercent", () => {
    const input = makeInput(
      DiagnosisType.MARGIN_EROSION,
      [ev("financial_health", "test", { profitChangePercent: -20 })],
      ["input costs rising and last price increase was two years ago", "pricing response overdue"]
    );
    expect(detectSubMechanism(input, DiagnosisType.MARGIN_EROSION)).toBe("MARGIN_COMMODITY_PASS_THROUGH");
  });

  it("DEMAND_GENERATION_FAILURE returns null when no subscriber or member signals", () => {
    const input = makeInput(
      DiagnosisType.DEMAND_GENERATION_FAILURE,
      [ev("market_position", "test", { newCustomerRate: 5, leadVolume: 50 })],
      ["lead volume has declined sharply and new customer acquisition has stalled"]
    );
    expect(detectSubMechanism(input, DiagnosisType.DEMAND_GENERATION_FAILURE)).toBeNull();
  });

  it("GTM_CHANNEL_MISMATCH returns null when no enquiry signals", () => {
    const input = makeInput(
      DiagnosisType.GTM_CHANNEL_MISMATCH,
      [ev("market_position", "test", { channelCac: 300, channelMix: 80 })],
      ["paid-search absorbs eighty percent of channel budget but conversion is low"]
    );
    expect(detectSubMechanism(input, DiagnosisType.GTM_CHANNEL_MISMATCH)).toBeNull();
  });
});
