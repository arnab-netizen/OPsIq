/**
 * A2 governance — Portfolio investment eligibility is a PROJECTION of the canonical owner decision, never a second policy.
 * Behavioural parity with ownerMaterialCommitmentGuard plus narrow structural checks on the sources.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { assessPortfolioInvestmentEligibility, PORTFOLIO_THRESHOLDS } from "@/domain/owner-portfolio";
import type { PortfolioBusinessInput } from "@/domain/owner-portfolio";
import { OWNER_ADVICE_MODES, ownerMaterialCommitmentGuard, resolveOwnerAdvicePolicy, type OwnerAdvicePolicy } from "@/domain/owner-spine/owner-advice-policy";
import type { BusinessConditionProfile, DomainScore } from "@/domain/owner-spine/contracts";
import type { CurrentOwnerDecision } from "@/domain/owner-spine/owner-decision";

const root = path.resolve(__dirname, "../..");
const src = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const NOW = new Date("2026-06-05T00:00:00.000Z");
const ds: DomainScore = { domain: "sales", healthScore: 70, riskScore: 20, opportunityScore: 90, dataConfidenceScore: 80, topFindingCodes: [], topActionCodes: [], generatedAt: NOW };
const profile = { overallHealthScore: 70, survivalRiskScore: 20, growthOpportunityScore: 90, executionRiskScore: 20, dataConfidenceScore: 80, domainScores: [ds], topFindings: [], topActions: [], missingCriticalData: [], generatedAt: NOW } as unknown as BusinessConditionProfile;

/** One representative real policy per advice mode. */
function policiesByMode(): OwnerAdvicePolicy[] {
  const base = {
    state: "TARGET" as const,
    primary: { source: "domain_action" as const, priorityClass: "GROWTH_OPPORTUNITY" as const, findingCode: "F", domain: "sales", missingData: [] as string[] },
    intent: "FIX" as never, primaryDomainLabel: "Sales",
    dataSufficiency: { status: "sufficient" as const, lowConfidenceDomains: [] as string[], missingCriticalData: [] as string[] },
    staleDomains: [] as string[], gateCashProvisional: false, gateCashConflicting: false, missingInformation: ["x"], reassessmentTrigger: "t",
  };
  return [
    resolveOwnerAdvicePolicy(base),
    resolveOwnerAdvicePolicy({ ...base, intent: "GROW" as never, dataSufficiency: { ...base.dataSufficiency, status: "caution" } }),
    resolveOwnerAdvicePolicy({ ...base, dataSufficiency: { status: "insufficient", lowConfidenceDomains: ["sales"], missingCriticalData: ["m"] } }),
    resolveOwnerAdvicePolicy({ ...base, primary: { ...base.primary, source: "evidence_refresh" } }),
    resolveOwnerAdvicePolicy({ ...base, primary: { ...base.primary, priorityClass: "MISSING_CRITICAL_EVIDENCE" } }),
    resolveOwnerAdvicePolicy({ ...base, primary: { ...base.primary, source: "compliance_item" } }),
    resolveOwnerAdvicePolicy({ ...base, primary: { ...base.primary, source: "safety_gate", findingCode: "GATE_CASH_UNSAFE", priorityClass: "SURVIVAL_CASH" }, gateCashConflicting: true }),
  ];
}

function input(p: OwnerAdvicePolicy): PortfolioBusinessInput {
  const d = { businessId: "A", state: "TARGET", primaryTarget: { priorityClass: "GROWTH_OPPORTUNITY", title: "t" }, advicePolicy: p } as unknown as CurrentOwnerDecision;
  return { businessId: "A", name: "A", profile, ownerDecision: d, staleDomains: [] };
}

describe("A2 governance — canonical projection, no second policy", () => {
  it("the representative policies cover every advice mode", () => {
    expect(new Set(policiesByMode().map((p) => p.mode))).toEqual(new Set(OWNER_ADVICE_MODES));
  });

  it("for a growth-class, fresh, quantitatively-qualifying business, eligibility equals ownerMaterialCommitmentGuard === null (every mode; a hold is the guard, not the commitment flag)", () => {
    for (const p of policiesByMode()) {
      const r = assessPortfolioInvestmentEligibility(input(p), PORTFOLIO_THRESHOLDS);
      expect(r.eligible, `mode ${p.mode}`).toBe(ownerMaterialCommitmentGuard(p) === null);
    }
  });

  it("recommendation copy never claims the decision/policy 'permits a commitment' (guard null is not canMakeMaterialCommitment)", () => {
    const e = src("domain/owner-portfolio/engine.ts");
    expect(e).not.toMatch(/permits? a commitment/i);
    expect(src("domain/owner-portfolio/types.ts")).toMatch(/does NOT imply `advicePolicy\.canMakeMaterialCommitment === true`/);
  });

  it("a held explanation reuses the policy's own statement and next action", () => {
    for (const p of policiesByMode()) {
      const r = assessPortfolioInvestmentEligibility(input(p), PORTFOLIO_THRESHOLDS);
      if (!r.eligible) {
        expect(r.ownerStatement).toBe(p.ownerStatement);
        expect(r.nextStep).toBe(p.nextEvidenceAction || ownerMaterialCommitmentGuard(p)!.prohibition);
      }
    }
  });

  it("the eligibility helper reads the canonical guard and decision, and carries no advice-mode switch", () => {
    const s = src("domain/owner-portfolio/investment-eligibility.ts");
    expect(s).toMatch(/ownerMaterialCommitmentGuard\(\s*d\.advicePolicy\s*\)/);
    expect(s).toContain('from "@/domain/owner-spine/owner-advice-policy"');
    for (const mode of OWNER_ADVICE_MODES) expect(s, `mode literal ${mode}`).not.toContain(`"${mode}"`);
    expect(s).not.toMatch(/\.mode\b/);
    expect(s).not.toMatch(/canMakeMaterialCommitment/);
  });

  it("Portfolio defines no freshness rule: no stale-days constant, no day arithmetic, no generatedAt inference", () => {
    for (const f of ["domain/owner-portfolio/investment-eligibility.ts", "domain/owner-portfolio/engine.ts", "services/owner-portfolio/portfolio.service.ts"]) {
      const s = src(f);
      expect(s, f).not.toMatch(/STALE_EVIDENCE_DAYS|86_?400|\bDAYS\b/);
      expect(s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""), f).not.toMatch(/\.generatedAt\b.*(<|>|getTime)/);
    }
    expect(src("domain/owner-portfolio/thresholds.ts")).not.toMatch(/stale|days/i);
  });

  it("the service takes staleDomains from the canonical owner-home resolution, not its own calculation", () => {
    const s = src("services/owner-portfolio/portfolio.service.ts");
    expect(s).toMatch(/resolveOwnerHome\(/);
    expect(s).toMatch(/staleDomains:\s*resolved\.staleDomains/);
    const h = src("services/owner-home/home.service.ts");
    expect(h).toMatch(/\n\s+staleDomains,\n\s+\};\n\}/); // returned beside `home` and `gate`
    // The public Home payload type does not carry it.
    expect(h.slice(h.indexOf("export interface OwnerHomeResult"), h.indexOf("export async function getOwnerHome"))).not.toContain("staleDomains");
  });

  it("the engine does not derive a recommendation from survival/growth thresholds alone", () => {
    const s = src("domain/owner-portfolio/engine.ts");
    expect(s).toContain("assessPortfolioInvestmentEligibility(");
    // The recommendation is built only from the eligible set.
    expect(s).toMatch(/maxByBusiness\(eligibleRows/);
    expect(s).not.toMatch(/minInvestmentOpportunityScore/); // the quantitative bar lives in the helper only
  });

  it("A2 does not solve score comparability (P2): the boundary is documented in the helper", () => {
    expect(src("domain/owner-portfolio/investment-eligibility.ts")).toMatch(/does NOT make growth scores comparable/);
  });

  it("the ranking output keeps its original definition (survival measured below the bar, max growth)", () => {
    const s = src("domain/owner-portfolio/engine.ts");
    expect(s).toMatch(/bestGrowthCandidateBusinessId:\s*maxByBusiness\(/);
    expect(s).toMatch(/survivalRiskScore !== null && s\.survivalRiskScore < t\.safeInvestmentSurvivalRiskBar/);
  });
});
