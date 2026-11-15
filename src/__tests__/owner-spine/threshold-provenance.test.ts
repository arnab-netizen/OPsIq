/**
 * Governance for the Owner threshold provenance registry (owner-spine/threshold-provenance.ts).
 * Static/pure: no DB. The registry RECORDS production thresholds; these tests compare it with the real production
 * exports, so a threshold value cannot change (or a new one appear) without a deliberate, reviewed registry change.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXTERNAL_SUPPORT_LEVELS,
  INDUSTRY_VALUE_SUPPORT,
  PROVENANCE_CONFIDENCES,
  THRESHOLD_COMPARISONS,
  THRESHOLD_FAMILIES,
  THRESHOLD_PROVENANCE_CLASSES,
  THRESHOLD_REGISTRY,
  THRESHOLD_REVIEW_STATUSES,
  THRESHOLD_UNITS,
  UNVERIFIED_EXTERNAL_LEADS,
  provenanceCounts,
  thresholdById,
} from "@/domain/owner-spine/threshold-provenance";
import { DATA_CONFIDENCE_CAUTION, DATA_CONFIDENCE_INSUFFICIENT } from "@/domain/owner-spine/contracts";
import { SCORE_SEMANTICS_NAMES } from "@/domain/owner-spine/score-semantics";
import { dangerLevel } from "@/domain/owner-home/summary";
import { OWNER_DECISION_STALE_EVIDENCE_DAYS } from "@/services/owner-home/owner-decision-candidates";
import { OWNER_WHAT_CHANGED_WINDOW_DAYS } from "@/domain/owner-spine/owner-decision";
import { CAPACITY_RECORD_FRESH_DAYS, OUT_OF_DATE_EVIDENCE_CONFIDENCE } from "@/domain/owner-mode/owner-action-gate-policy";
import { DEFAULT_MARGIN_FLOOR_PCT } from "@/domain/owner-finance/margin-safety-gate";
import { CAUTION_UTILIZATION, HIGH_UTILIZATION } from "@/domain/owner-mode/equipment-capacity";
import { UNVERIFIED_GATE_CONFIDENCE } from "@/services/owner-spine/current-cash-finance-reading";
import { PORTFOLIO_THRESHOLDS } from "@/domain/owner-portfolio/thresholds";
import { GENERIC_FINANCE_THRESHOLDS, INDUSTRY_FINANCE_THRESHOLDS } from "@/domain/owner-finance/thresholds";
import { GENERIC_CASHFLOW_THRESHOLDS, INDUSTRY_CASHFLOW_THRESHOLDS } from "@/domain/owner-cashflow/thresholds";
import { GENERIC_SALES_THRESHOLDS, INDUSTRY_SALES_THRESHOLDS } from "@/domain/owner-sales/thresholds";
import { GENERIC_OPERATIONS_THRESHOLDS, INDUSTRY_OPERATIONS_THRESHOLDS } from "@/domain/owner-operations/thresholds";
import { GENERIC_MARKETING_THRESHOLDS, INDUSTRY_MARKETING_THRESHOLDS } from "@/domain/owner-marketing/thresholds";
import { GENERIC_SOP_THRESHOLDS, INDUSTRY_SOP_THRESHOLDS } from "@/domain/owner-sop/thresholds";
import { GENERIC_STRATEGY_THRESHOLDS, INDUSTRY_STRATEGY_THRESHOLDS } from "@/domain/owner-strategy/thresholds";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const byId = (id: string) => {
  const r = thresholdById(id);
  expect(r, id).toBeDefined();
  return r!;
};

const DOMAIN_SETS: Array<[string, Record<string, number>, Record<string, Partial<Record<string, number>>>]> = [
  ["FIN", GENERIC_FINANCE_THRESHOLDS as never, INDUSTRY_FINANCE_THRESHOLDS as never],
  ["CASH", GENERIC_CASHFLOW_THRESHOLDS as never, INDUSTRY_CASHFLOW_THRESHOLDS as never],
  ["SALES", GENERIC_SALES_THRESHOLDS as never, INDUSTRY_SALES_THRESHOLDS as never],
  ["OPS", GENERIC_OPERATIONS_THRESHOLDS as never, INDUSTRY_OPERATIONS_THRESHOLDS as never],
  ["MKT", GENERIC_MARKETING_THRESHOLDS as never, INDUSTRY_MARKETING_THRESHOLDS as never],
  ["SOP", GENERIC_SOP_THRESHOLDS as never, INDUSTRY_SOP_THRESHOLDS as never],
  ["STRAT", GENERIC_STRATEGY_THRESHOLDS as never, INDUSTRY_STRATEGY_THRESHOLDS as never],
];

describe("1. every declared high-impact threshold has a registry entry with the production value", () => {
  for (const [pre, generic] of DOMAIN_SETS) {
    it(`${pre}: every generic default is registered with its exact current value`, () => {
      for (const [field, value] of Object.entries(generic)) {
        expect(byId(`${pre}.${field}`).value, `${pre}.${field}`).toBe(value);
      }
    });
    it(`${pre}: the registry holds no generic-default record that production no longer has`, () => {
      const registered = THRESHOLD_REGISTRY.filter((r) => r.id.startsWith(`${pre}.`) && !r.industryTemplate && r.productionSource.includes("#GENERIC_"));
      for (const r of registered) expect(Object.keys(generic), r.id).toContain(r.id.split(".")[1]);
    });
  }
  it("PORTFOLIO thresholds are registered with their exact values", () => {
    for (const [field, value] of Object.entries(PORTFOLIO_THRESHOLDS)) expect(byId(`PORT.${field}`).value).toBe(value);
  });
});

describe("11. industry-template threshold sets are inventoried (value and what they override)", () => {
  for (const [pre, generic, industry] of DOMAIN_SETS) {
    it(`${pre}: every template override is registered, classified INDUSTRY_TEMPLATE and not claimed as supported`, () => {
      for (const [template, overrides] of Object.entries(industry)) {
        for (const [field, value] of Object.entries(overrides as Record<string, number>)) {
          const r = byId(`${pre}.${template}.${field}`);
          expect(r.value).toBe(value);
          expect(r.provenance).toBe("INDUSTRY_TEMPLATE");
          expect(r.industryTemplate).toBe(template);
          expect(r.overridesId).toBe(`${pre}.${field}`);
          expect(Object.keys(generic)).toContain(field);
          expect(r.industryValueSupport).toBe("INTERNAL_HEURISTIC");
          expect(r.externalSources).toEqual([]);
        }
      }
    });
    it(`${pre}: no template record exists that production no longer defines`, () => {
      const records = THRESHOLD_REGISTRY.filter((r) => r.id.startsWith(`${pre}.`) && r.industryTemplate);
      for (const r of records) {
        const overrides = industry[r.industryTemplate!] as Record<string, number> | undefined;
        expect(overrides, r.id).toBeDefined();
        expect(overrides![r.metric], r.id).toBe(r.value);
      }
    });
  }
});

describe("2/3. ids are unique and the vocabulary is closed", () => {
  it("registry ids are unique", () => {
    const ids = THRESHOLD_REGISTRY.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("every record uses the approved vocabularies", () => {
    for (const r of THRESHOLD_REGISTRY) {
      expect(THRESHOLD_PROVENANCE_CLASSES, r.id).toContain(r.provenance);
      expect(THRESHOLD_FAMILIES, r.id).toContain(r.family);
      expect(THRESHOLD_COMPARISONS, r.id).toContain(r.comparison);
      expect(THRESHOLD_UNITS, r.id).toContain(r.unit);
      expect(PROVENANCE_CONFIDENCES, r.id).toContain(r.provenanceConfidence);
      expect(THRESHOLD_REVIEW_STATUSES, r.id).toContain(r.reviewStatus);
      if (r.industryValueSupport) expect(INDUSTRY_VALUE_SUPPORT, r.id).toContain(r.industryValueSupport);
      expect(r.effect.length, r.id).toBeGreaterThan(10);
      expect(r.repoEvidence.length, r.id).toBeGreaterThan(10);
    }
  });
  it("every classification is used at most as honestly as its evidence: derived records name an existing parent", () => {
    for (const r of THRESHOLD_REGISTRY.filter((x) => x.provenance === "DERIVED_FROM_OTHER_RULE")) {
      expect(r.parentId, r.id).toBeDefined();
      expect(thresholdById(r.parentId!), `${r.id} parent`).toBeDefined();
      expect(r.parentId).not.toBe(r.id);
    }
    for (const r of THRESHOLD_REGISTRY.filter((x) => x.provenance !== "DERIVED_FROM_OTHER_RULE")) expect(r.parentId, r.id).toBeUndefined();
  });
});

describe("4/5/6. external evidence is never claimed without a verifiable source", () => {
  const noteComplete = (n: (typeof UNVERIFIED_EXTERNAL_LEADS)[number]) => {
    expect(n.source.length).toBeGreaterThan(3);
    expect(n.url).toMatch(/^https:\/\//);
    expect(n.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(n.claim.length).toBeGreaterThan(20);
    expect(n.population.length).toBeGreaterThan(3);
    expect(EXTERNAL_SUPPORT_LEVELS).toContain(n.support);
  };
  it("no EXTERNAL_STANDARD_VERIFIED / EXTERNAL_GUIDANCE_ADAPTED record lacks a verified, complete source", () => {
    for (const r of THRESHOLD_REGISTRY.filter((x) => x.provenance === "EXTERNAL_STANDARD_VERIFIED" || x.provenance === "EXTERNAL_GUIDANCE_ADAPTED")) {
      expect(r.externalSources.length, r.id).toBeGreaterThan(0);
      for (const n of r.externalSources) {
        noteComplete(n);
        expect(n.verified, `${r.id} source must be verified`).toBe(true);
      }
      if (r.provenance === "EXTERNAL_STANDARD_VERIFIED") expect(r.externalSources.some((n) => n.support === "EXACT"), r.id).toBe(true);
    }
  });
  it("LEGACY_OR_UNKNOWN records claim no evidence and no confidence", () => {
    for (const r of THRESHOLD_REGISTRY.filter((x) => x.provenance === "LEGACY_OR_UNKNOWN")) {
      expect(r.externalSources, r.id).toEqual([]);
      expect(r.provenanceConfidence, r.id).toBe("none");
    }
  });
  it("any attached external source has complete metadata; unverified leads are never counted as classification evidence", () => {
    for (const r of THRESHOLD_REGISTRY) for (const n of r.externalSources) noteComplete(n);
    for (const n of UNVERIFIED_EXTERNAL_LEADS) {
      noteComplete(n);
      expect(n.verified).toBe(false);
    }
  });
  it("today the registry claims no external verification at all (research found no verified exact-number source)", () => {
    const c = provenanceCounts();
    expect(c.EXTERNAL_STANDARD_VERIFIED).toBe(0);
    expect(c.EXTERNAL_GUIDANCE_ADAPTED).toBe(0);
  });
  it("no record describes a value as an industry standard or benchmark", () => {
    for (const r of THRESHOLD_REGISTRY) {
      // A negation ("is not evidence of an industry standard") is the honest wording, so it is excluded from the scan.
      const text = `${r.effect} ${r.repoEvidence} ${r.ownerConsequence}`.replace(/not evidence of an industry standard/gi, "");
      expect(text, r.id).not.toMatch(/industry[- ]standard|best practice|externally validated|calibrated against/i);
    }
  });
});

describe("7/9. danger bands are registered and unchanged", () => {
  it("is registered, unknown-origin and flagged for a product decision", () => {
    const r = byId("GLOBAL.DANGER_BANDS_20_40_60_80");
    expect(r.provenance).toBe("LEGACY_OR_UNKNOWN");
    expect(r.reviewStatus).toBe("NEEDS_PRODUCT_DECISION");
    expect(r.family).toBe("DISPLAY_BAND");
  });
  it("dangerLevel boundaries are exactly <20 / <40 / <60 / <80 / >=80", () => {
    const cases: Array<[number | null, string]> = [
      [null, "unknown"], [0, "none"], [19, "none"], [20, "low"], [39, "low"], [40, "elevated"],
      [59, "elevated"], [60, "high"], [79, "high"], [80, "critical"], [100, "critical"],
    ];
    for (const [score, level] of cases) expect(dangerLevel(score), String(score)).toBe(level);
  });
});

describe("8/10. data-confidence 70/40 are registered and unchanged", () => {
  it("production constants", () => {
    expect(DATA_CONFIDENCE_CAUTION).toBe(70);
    expect(DATA_CONFIDENCE_INSUFFICIENT).toBe(40);
  });
  it("registry records match and are policy (not external) classified", () => {
    expect(byId("GLOBAL.DATA_CONFIDENCE_CAUTION_70").value).toBe(DATA_CONFIDENCE_CAUTION);
    expect(byId("GLOBAL.DATA_CONFIDENCE_INSUFFICIENT_40").value).toBe(DATA_CONFIDENCE_INSUFFICIENT);
    expect(byId("GLOBAL.DATA_CONFIDENCE_CAUTION_70").provenance).toBe("INTERNAL_PRODUCT_POLICY");
    expect(byId("GLOBAL.DATA_CONFIDENCE_INSUFFICIENT_40").provenance).toBe("INTERNAL_PRODUCT_POLICY");
  });
  it("the hard-coded decision caps equal the sufficiency boundaries and are registered as derived", () => {
    const src = read("src/domain/owner-spine/owner-decision.ts");
    expect(src).toMatch(/if \(score > 40\) \{ score = 40; capped = true; \}/);
    expect(src).toMatch(/if \(score > 70\) \{ score = 70; capped = true; \}/);
    expect(byId("GLOBAL.OD_CONFIDENCE_CAP_CAUTION_70").parentId).toBe("GLOBAL.DATA_CONFIDENCE_CAUTION_70");
    expect(byId("GLOBAL.OD_CONFIDENCE_CAP_INSUFFICIENT_40").parentId).toBe("GLOBAL.DATA_CONFIDENCE_INSUFFICIENT_40");
  });
  it("the decision confidence level bands are unchanged", () => {
    const src = read("src/domain/owner-spine/owner-decision.ts");
    expect(src).toMatch(/score >= 75 \? "high" : score >= 50 \? "moderate" : score >= 25 \? "low" : "insufficient"|score >= 75[\s\S]{0,80}score >= 50[\s\S]{0,80}score >= 25/);
  });
});

describe("12. stale/freshness windows are inventoried with exact values", () => {
  it("per-domain staleSnapshotDays", () => {
    const expected: Record<string, number> = { FIN: 45, CASH: 30, SALES: 45, OPS: 45, MKT: 45, SOP: 45, STRAT: 60 };
    for (const [pre, days] of Object.entries(expected)) {
      const r = byId(`${pre}.staleSnapshotDays`);
      expect(r.value).toBe(days);
      expect(r.family).toBe("FRESHNESS");
      expect(r.unit).toBe("days");
    }
  });
  it("owner-decision, gate and what-changed windows", () => {
    expect(byId("GLOBAL.STALE_EVIDENCE_DAYS_45").value).toBe(OWNER_DECISION_STALE_EVIDENCE_DAYS);
    expect(byId("GLOBAL.CAPACITY_RECORD_FRESH_DAYS_45").value).toBe(CAPACITY_RECORD_FRESH_DAYS);
    expect(byId("GLOBAL.WHAT_CHANGED_WINDOW_DAYS_14").value).toBe(OWNER_WHAT_CHANGED_WINDOW_DAYS);
    expect(byId("GLOBAL.OUT_OF_DATE_EVIDENCE_CONFIDENCE_0_4").value).toBe(OUT_OF_DATE_EVIDENCE_CONFIDENCE);
    expect(byId("GLOBAL.UNVERIFIED_GATE_CONFIDENCE_0_4").value).toBe(UNVERIFIED_GATE_CONFIDENCE);
  });
  it("gate, equipment and margin values", () => {
    expect(byId("GATE.MARGIN_FLOOR_15").value).toBe(DEFAULT_MARGIN_FLOOR_PCT);
    expect(HIGH_UTILIZATION).toBe(0.95);
    expect(CAUTION_UTILIZATION).toBe(0.85);
    expect(byId("GATE.EQUIPMENT_UTILIZATION_0_85_0_95").value).toContain("0.95");
  });
  it("non-exported constants keep their recorded values in source", () => {
    expect(read("src/domain/owner-spine/owner-decision.ts")).toMatch(/const REFRESH_CONFIDENCE_CAP = 0\.4;/);
    expect(read("src/domain/owner-spine/owner-decision.ts")).toMatch(/const UNKNOWN_BLOCKER_CONFIDENCE = 0\.4;/);
    expect(read("src/services/owner-home/owner-decision-candidates.ts")).toMatch(/OWNER_RECORDED_RISK_CONFIDENCE = 0\.6/);
    expect(read("src/services/owner-home/owner-decision-candidates.ts")).toMatch(/CRITICAL_RISK_SEVERITY = 75/);
    expect(read("src/services/owner-home/owner-decision-candidates.ts")).toMatch(/RECOVERY_PRIORITY_SCORE[^=]*=\s*\{ critical: 90, high: 70, medium: 45, low: 20 \}/);
    expect(read("src/domain/owner-spine/contracts.ts")).toMatch(/low: 0,\s*medium: 0\.1,\s*high: 0\.25,\s*critical: 0\.5/);
    expect(read("src/domain/owner-finance/recommendations.ts")).toMatch(/SURVIVAL_STATE_CONFIDENCE_GATE = 70/);
    expect(read("src/domain/owner-finance/risk-rules.ts")).toMatch(/low: 20,\s*medium: 45,\s*high: 70,\s*critical: 90/);
    expect(read("src/services/owner-condition/business-condition.service.ts")).toMatch(/critical: 85, at_risk: 55, healthy: 20/);
  });
  it("registered record fields point at a real production file and symbol", () => {
    for (const r of THRESHOLD_REGISTRY) {
      const [file, symbol] = r.productionSource.split("#");
      expect(existsSync(join(ROOT, file)), `${r.id}: ${file}`).toBe(true);
      const token = symbol.split(".")[0];
      expect(read(file), `${r.id}: ${token} in ${file}`).toContain(token);
    }
  });
});

describe("13. registry metadata is deterministic and immutable", () => {
  it("is frozen and serializes identically", () => {
    expect(Object.isFrozen(THRESHOLD_REGISTRY)).toBe(true);
    for (const r of THRESHOLD_REGISTRY) expect(Object.isFrozen(r), r.id).toBe(true);
    expect(JSON.stringify(THRESHOLD_REGISTRY)).toBe(JSON.stringify(THRESHOLD_REGISTRY));
    expect(thresholdById("__proto__")).toBeUndefined();
  });
  it("counts every class", () => {
    const c = provenanceCounts();
    expect(Object.keys(c).sort()).toEqual([...THRESHOLD_PROVENANCE_CLASSES].sort());
    expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(THRESHOLD_REGISTRY.length);
  });
  it("records the unreferenced thresholds honestly", () => {
    const f = byId("FIN.highOwnerWithdrawalPressurePct");
    expect(f.reviewStatus).toBe("DEFINED_BUT_UNREFERENCED");
    expect(f.provenance).toBe("LEGACY_OR_UNKNOWN");
    expect(f.changeChangesNumericOutput).toBe(false);
    expect(read("src/domain/owner-finance/risk-rules.ts")).not.toContain("highOwnerWithdrawalPressurePct");
    expect(read("src/domain/owner-finance/metrics.ts")).not.toContain("highOwnerWithdrawalPressurePct");
    expect(byId("GATE.CASH_RUNWAY_30_60_90_UNREFERENCED").reviewStatus).toBe("DEFINED_BUT_UNREFERENCED");
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules" || name === "generated") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

describe("14. the registry is documentation only — never a runtime source for production calculations", () => {
  it("no production module imports threshold-provenance", () => {
    const importers = walk(join(ROOT, "src"))
      .filter((f) => !f.endsWith("owner-spine/threshold-provenance.ts"))
      .filter((f) => /from\s+["'][^"']*threshold-provenance["']/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(ROOT.length + 1));
    expect(importers).toEqual([]);
  });
  it("the registry module itself imports nothing", () => {
    expect(read("src/domain/owner-spine/threshold-provenance.ts")).not.toMatch(/^import\s/m);
  });
});

describe("15. PR #582 score-comparability contracts remain intact", () => {
  it("the score registry is unchanged in shape", () => {
    expect([...SCORE_SEMANTICS_NAMES].sort()).toEqual(
      [
        "confidence", "dataConfidenceScore", "effortScore", "executionRiskScore", "expectedImpactScore",
        "growthOpportunityScore", "healthScore", "impactScore", "lowestDataConfidenceScore", "opportunityScore",
        "overallHealthScore", "priorityScore", "riskScore", "survivalRiskScore", "urgencyScore",
      ].sort()
    );
  });
});
