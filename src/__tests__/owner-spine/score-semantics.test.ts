/**
 * Governance for the Owner score comparability contract (owner-spine/score-semantics.ts).
 * Pure/static: no DB. Asserts the registry covers every spine score field, never claims probabilistic or
 * universal-cardinal meaning, and that the canonical orderings and PR #575 survival/execution boundaries are unchanged.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXECUTION_DOMAINS,
  SURVIVAL_DOMAINS,
  buildBusinessConditionProfile,
  businessConditionProfileSchema,
  domainScoreSchema,
  ownerActionSchema,
  ownerFindingSchema,
  ownerVerificationSchema,
  rankOwnerActions,
  type DomainScore,
  type OwnerAction,
  type OwnerDomain,
} from "@/domain/owner-spine/contracts";
import { compareOwnerCandidatesWithFactor, type OwnerDecisionCandidate } from "@/domain/owner-spine/owner-decision";
import {
  BUSINESS_CONDITION_ROLLUP_AUDIT,
  SCORE_COMPARABILITY_CLASSES,
  SCORE_SEMANTICS,
  SCORE_SEMANTICS_NAMES,
  scoreSemanticsFor,
} from "@/domain/owner-spine/score-semantics";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules" || name === "generated") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.|\.db\.test\./.test(name)) out.push(full);
  }
  return out;
}

const SCORE_FIELD = /(Score|^confidence)$/;
function scoreFields(schema: { shape: Record<string, unknown> }): string[] {
  return Object.keys(schema.shape).filter((k) => SCORE_FIELD.test(k));
}

describe("1. every canonical Owner Spine score field has a declared semantic contract", () => {
  const schemas = {
    ownerFinding: ownerFindingSchema,
    ownerAction: ownerActionSchema,
    ownerVerification: ownerVerificationSchema,
    domainScore: domainScoreSchema,
    businessConditionProfile: businessConditionProfileSchema,
  };
  for (const [label, schema] of Object.entries(schemas)) {
    it(`${label}: every *Score / confidence field is registered`, () => {
      const fields = scoreFields(schema as never);
      expect(fields.length).toBeGreaterThan(0);
      for (const f of fields) expect(scoreSemanticsFor(f), `${label}.${f}`).toBeDefined();
    });
  }
  it("every registry entry is carried by a real schema field", () => {
    const all = new Set(Object.values(schemas).flatMap((s) => scoreFields(s as never)));
    for (const name of SCORE_SEMANTICS_NAMES) expect(all.has(name), name).toBe(true);
  });
});

describe("2. no entry claims probabilistic meaning", () => {
  it("probabilistic is false and no text asserts a chance or calibration", () => {
    for (const e of Object.values(SCORE_SEMANTICS)) {
      expect(e.probabilistic).toBe(false);
      expect(e.interpretation).toBe("heuristic_ordinal");
      const claim = `${e.meaning} ${e.canonicalUse}`;
      expect(claim, e.name).not.toMatch(/%\s*(chance|likely|likelihood)|is a probability|is calibrated|statistically calibrated/i);
    }
  });
});

describe("3. health / risk / opportunity are not declared universally cardinal across domains", () => {
  for (const name of ["healthScore", "riskScore", "opportunityScore"]) {
    it(name, () => {
      const e = scoreSemanticsFor(name)!;
      expect(e.crossDomainCardinal).toBe(false);
      expect(e.crossDomainRawSortLegal).toBe(false);
      expect(e.comparability).not.toBe("COMMON_RUBRIC");
    });
  }
  it("no score is declared a COMMON_RUBRIC and none is cross-domain cardinal or raw-sortable", () => {
    expect(SCORE_COMPARABILITY_CLASSES).toContain("COMMON_RUBRIC");
    for (const e of Object.values(SCORE_SEMANTICS)) {
      expect(e.comparability, e.name).not.toBe("COMMON_RUBRIC");
      expect(e.crossDomainCardinal, e.name).toBe(false);
      expect(e.crossDomainRawSortLegal, e.name).toBe(false);
    }
  });
  it("cross-domain aggregation is allowed only through a named defined rollup", () => {
    for (const e of Object.values(SCORE_SEMANTICS)) {
      const anyAgg = e.aggregation.average || e.aggregation.max || e.aggregation.min;
      if (anyAgg) expect(e.legalRollups.length, e.name).toBeGreaterThan(0);
    }
  });
});

describe("4. priorityScore cannot be declared universal cross-domain ranking", () => {
  it("is tie-break-only, never raw-sortable across domains, and says so", () => {
    const e = scoreSemanticsFor("priorityScore")!;
    expect(e.comparability).toBe("CANONICAL_TIE_BREAK_ONLY");
    expect(e.crossDomainRawSortLegal).toBe(false);
    expect(e.canonicalUse).toMatch(/prohibited/i);
    expect(e.prohibitedInferences.join(" ")).toMatch(/#1 action/);
  });
  it("effort direction is 'more effort', not 'better'", () => {
    expect(scoreSemanticsFor("effortScore")!.direction).toBe("higher_is_more_effort");
  });
});

function candidate(over: Partial<OwnerDecisionCandidate> & { candidateId: string }): OwnerDecisionCandidate {
  return {
    businessId: "b",
    workspaceId: "w",
    source: "finding",
    domain: "finance",
    sourceId: over.candidateId,
    priorityClass: "PROFIT_LOSS",
    findingCode: "F",
    findingId: null,
    title: "t",
    explanation: "e",
    severity: "high",
    priorityScore: 50,
    expectedImpactScore: 50,
    confidence: 0.5,
    effortScore: 50,
    status: "proposed",
    ownerActionRequired: true,
    blocking: false,
    evidence: [],
    missingData: [],
    verificationMetric: null,
    evidenceAsOf: null,
    stale: false,
    exclusion: null,
    targetRoute: "/owner",
    ...over,
  } as OwnerDecisionCandidate;
}

describe("5 + 9. Owner Decision is the canonical election and its comparator order is unchanged", () => {
  const hi = { priorityScore: 100, expectedImpactScore: 100, confidence: 1, effortScore: 0 };
  it("a better semantic class beats a far higher raw priority score from another domain", () => {
    const survival = candidate({ candidateId: "a", domain: "cashflow", priorityClass: "SURVIVAL_CASH", priorityScore: 10 });
    const growth = candidate({ candidateId: "b", domain: "sales", priorityClass: "PROFIT_LOSS", ...hi });
    const [ord, factor] = compareOwnerCandidatesWithFactor(survival, growth);
    expect(factor).toBe("class");
    expect(ord).toBeLessThan(0);
  });
  it("at equal class, severity beats raw priority", () => {
    const crit = candidate({ candidateId: "a", severity: "critical", priorityScore: 5 });
    const high = candidate({ candidateId: "b", severity: "high", ...hi });
    expect(compareOwnerCandidatesWithFactor(crit, high)).toEqual([expect.any(Number), "severity"]);
    expect(compareOwnerCandidatesWithFactor(crit, high)[0]).toBeLessThan(0);
  });
  it("the numeric factors decide only in the documented order: priority → impact → confidence → effort → identifier", () => {
    const base = { priorityScore: 60, expectedImpactScore: 60, confidence: 0.6, effortScore: 60 };
    const mk = (id: string, o: Partial<OwnerDecisionCandidate>) => candidate({ candidateId: id, findingCode: "F", ...base, ...o });
    expect(compareOwnerCandidatesWithFactor(mk("a", { priorityScore: 70 }), mk("b", { expectedImpactScore: 99, confidence: 1, effortScore: 0 }))[1]).toBe("priority");
    expect(compareOwnerCandidatesWithFactor(mk("a", { expectedImpactScore: 70 }), mk("b", { confidence: 1, effortScore: 0 }))[1]).toBe("impact");
    expect(compareOwnerCandidatesWithFactor(mk("a", { confidence: 0.7 }), mk("b", { effortScore: 0 }))[1]).toBe("confidence");
    expect(compareOwnerCandidatesWithFactor(mk("a", { effortScore: 10 }), mk("b", {}))[1]).toBe("effort");
    expect(compareOwnerCandidatesWithFactor(mk("a", {}), mk("b", {}))[1]).toBe("identifier");
  });
  it("the comparator source keeps the documented stage order", () => {
    const src = read("src/domain/owner-spine/owner-decision.ts");
    const body = src.slice(src.indexOf("export function compareOwnerCandidatesWithFactor"));
    const order = ["\"class\"", "\"recorded_block\"", "\"severity\"", "\"current_evidence\"", "\"priority\"", "\"impact\"", "\"confidence\"", "\"effort\"", "\"identifier\""];
    const idx = order.map((t) => body.indexOf(`, ${t}]`));
    expect(idx.every((i) => i > -1)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });
  it("the owner-decision header states raw priorityScore is not sufficient to elect the #1 action", () => {
    expect(read("src/domain/owner-spine/owner-decision.ts")).toMatch(/NOT sufficient to elect the owner-wide #1 action/);
  });
});

function action(domain: OwnerDomain, code: string, p: number): OwnerAction {
  return {
    domain, findingCode: code, title: code, description: "", ownerRole: "owner", priorityScore: p, effortScore: 10,
    expectedImpactScore: 10, urgencyScore: 0, confidence: 0.5, status: "proposed", verificationMetric: "m",
    verificationMethod: "m", expectedTimeframeDays: 1,
  } as OwnerAction;
}

describe("6. rankOwnerActions remains explicitly domain-local", () => {
  it("is documented as domain-local and never the overall #1", () => {
    const src = read("src/domain/owner-spine/contracts.ts");
    expect(src).toMatch(/DOMAIN-LOCAL ordering/);
    expect(src).toMatch(/Never use this to pick an overall "#1"/);
  });
  it("is only imported by per-domain action/dashboard modules, never by a cross-domain arbiter or rollup", () => {
    const importers = walk(join(ROOT, "src"))
      .filter((f) => /import[^;]*\brankOwnerActions\b[^;]*from/s.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(ROOT.length + 1));
    for (const f of importers) {
      expect(f, f).toMatch(/^src\/(domain\/owner-(finance|cashflow|sales|operations|marketing|sop|strategy)\/actions|services\/owner-(finance|cashflow|sales|operations|marketing|sop|strategy)\/dashboard\.service)\.ts$/);
    }
    expect(importers.length).toBeGreaterThan(0);
  });
  it("orders by the stored priority (domain-local) and does not mutate its input", () => {
    const input = [action("finance", "A", 40), action("finance", "B", 90)];
    const ranked = rankOwnerActions(input);
    expect(ranked.map((a) => a.findingCode)).toEqual(["B", "A"]);
    expect(input.map((a) => a.findingCode)).toEqual(["A", "B"]);
  });
});

function score(domain: OwnerDomain, risk: number): DomainScore {
  return { domain, healthScore: 50, riskScore: risk, opportunityScore: 10, dataConfidenceScore: 80, topFindingCodes: [], topActionCodes: [], generatedAt: new Date(0) };
}

describe("7 + 8. Business Condition survival/execution family boundaries and NOT MEASURED are unchanged (PR #575)", () => {
  it("family constants", () => {
    expect([...SURVIVAL_DOMAINS]).toEqual(["recovery", "finance", "cashflow"]);
    expect([...EXECUTION_DOMAINS]).toEqual(["operations", "sop"]);
  });
  const build = (...s: DomainScore[]) => buildBusinessConditionProfile({ domainScores: s, now: new Date(0) });
  it("no domains → both NOT MEASURED (null), not zero", () => {
    const p = build();
    expect(p.survivalRiskScore).toBeNull();
    expect(p.executionRiskScore).toBeNull();
  });
  it("a high-risk Sales/Marketing/Customer domain measures neither family", () => {
    const p = build(score("sales", 95), score("marketing", 90), score("customer", 90));
    expect(p.survivalRiskScore).toBeNull();
    expect(p.executionRiskScore).toBeNull();
  });
  it("survival uses only recovery/finance/cashflow; execution only operations/sop", () => {
    const p = build(score("finance", 30), score("cashflow", 70), score("sales", 99), score("operations", 20), score("sop", 55));
    expect(p.survivalRiskScore).toBe(70);
    expect(p.executionRiskScore).toBe(55);
  });
  it("a measured 0 is distinct from NOT MEASURED", () => {
    const p = build(score("finance", 0));
    expect(p.survivalRiskScore).toBe(0);
    expect(p.executionRiskScore).toBeNull();
  });
});

describe("Business Condition rollup audit", () => {
  it("classifies every rollup and keeps the weak ones from being called valid", () => {
    const verdicts = Object.fromEntries(Object.entries(BUSINESS_CONDITION_ROLLUP_AUDIT).map(([k, v]) => [k, v.verdict]));
    expect(verdicts).toEqual({
      overallHealthScore: "DISPLAY_HEURISTIC_ONLY",
      survivalRiskScore: "SEMANTICALLY_VALID",
      executionRiskScore: "SEMANTICALLY_VALID",
      growthOpportunityScore: "UNSAFE_CROSS_DOMAIN_COMPARISON",
      dataConfidenceScore: "DISPLAY_HEURISTIC_ONLY",
      lowestDataConfidenceScore: "SEMANTICALLY_VALID",
    });
  });
  it("every audited rollup is itself a registered score", () => {
    for (const k of Object.keys(BUSINESS_CONDITION_ROLLUP_AUDIT)) expect(scoreSemanticsFor(k), k).toBeDefined();
  });
});

describe("10. score-semantic metadata is deterministic and immutable", () => {
  it("is frozen, has unique names and stable serialization", () => {
    expect(Object.isFrozen(SCORE_SEMANTICS)).toBe(true);
    expect(new Set(SCORE_SEMANTICS_NAMES).size).toBe(SCORE_SEMANTICS_NAMES.length);
    expect(JSON.stringify(SCORE_SEMANTICS)).toBe(JSON.stringify(SCORE_SEMANTICS));
    for (const e of Object.values(SCORE_SEMANTICS)) expect(Object.isFrozen(e)).toBe(true);
    expect(scoreSemanticsFor("__proto__")).toBeUndefined();
    expect(scoreSemanticsFor("toString")).toBeUndefined();
  });
});

describe("repository scan: unsafe cross-domain / probabilistic patterns", () => {
  const files = walk(join(ROOT, "src")).map((f) => ({ path: f.slice(ROOT.length + 1), src: readFileSync(f, "utf8") }));

  it("no non-test code sorts DomainScore values by raw risk/health/opportunity across domains", () => {
    // Legitimate hits are domain-local or a different score family (objective portfolio health). Allow-list by file.
    const allowed = new Set(["src/services/owner-guidance/owner-now-view.service.ts"]);
    const offenders = files
      .filter((f) => !allowed.has(f.path))
      .filter((f) => /\.sort\([^)]*\.(riskScore|healthScore|opportunityScore)\b/.test(f.src))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("the Owner Decision / diagnostics / portfolio engine never elect via raw priorityScore sort", () => {
    for (const p of ["src/domain/owner-spine/owner-decision.ts", "src/domain/owner-portfolio/engine.ts", "src/domain/owner-home/summary.ts"]) {
      const src = files.find((f) => f.path === p)!.src;
      expect(src, p).not.toMatch(/\.sort\(\s*\(a,\s*b\)\s*=>\s*b\.priorityScore\s*-\s*a\.priorityScore/);
    }
  });

  it("owner-facing owner pages never render a heuristic confidence as 'N% confidence'", () => {
    const ownerUi = files.filter((f) => /^src\/(app\/\(authenticated\)\/owner\/|components\/owner\/)/.test(f.path));
    expect(ownerUi.length).toBeGreaterThan(5);
    const offenders = ownerUi
      .filter((f) => /confidence[^\n]*\*\s*100[^\n]*%|%\s*confidence/i.test(f.src))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("no score-semantics source claims a calibrated or probabilistic confidence", () => {
    const src = read("src/domain/owner-spine/score-semantics.ts");
    expect(src).not.toMatch(/probabilistic:\s*true/);
  });
});
