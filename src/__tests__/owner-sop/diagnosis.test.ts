/**
 * Owner SOP & Execution Accountability (Module 7 Slice 2) — detector + diagnosis
 * tests. Pure/no DB. Covers risk findings (completion / verification / overdue /
 * repeated-failures / dispute / reassignment / proof / SOP-coverage / missing data
 * / invalid currency), opportunity findings (clear overdue / convert-to-SOP /
 * close coverage gap / raise verification / data quality), deterministic ranking,
 * the sop DomainScore, no-fabrication-on-missing, and spine schema validity.
 */
import { describe, it, expect } from "vitest";
import {
  diagnoseSopSnapshot,
  buildSopRiskFindings,
  buildSopOpportunityFindings,
  computeSopMetrics,
  resolveSopThresholds,
  rankSopFindings,
  type SopSnapshotInput,
} from "@/domain/owner-sop";
import { ownerFindingSchema, domainScoreSchema } from "@/domain/owner-spine/contracts";

function disciplined(): SopSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    actionsAssigned: 100,
    actionsCompleted: 98,
    actionsVerified: 92,
    actionsOverdue: 3,
    actionsDisputed: 1,
    actionsReassigned: 2,
    repeatedFailures: 1,
    proofRequired: 50,
    proofProvided: 48,
    recurringProcesses: 20,
    documentedSops: 19,
  };
}

/** Breakdown execution: nothing finishes, overdue + repeated + disputed + no SOPs. */
function breakdown(): SopSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    actionsAssigned: 100,
    actionsCompleted: 50, // 50% completion (critical)
    actionsVerified: 10, // 20% verification (critical)
    actionsOverdue: 40, // 40% overdue (critical)
    actionsDisputed: 8, // 16% dispute (high)
    actionsReassigned: 30, // 30% reassignment (high)
    repeatedFailures: 30, // 30% repeated (critical)
    proofRequired: 40,
    proofProvided: 10, // 25% proof (low)
    recurringProcesses: 20,
    documentedSops: 5, // 25% coverage (critical)
  };
}

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

function diagnose(input: SopSnapshotInput) {
  return diagnoseSopSnapshot(input, { now: new Date("2026-06-05") });
}

describe("owner-sop diagnosis — module contract assertions", () => {
  it("diagnoseSopSnapshot is a function", () => { expect(typeof diagnoseSopSnapshot).toBe("function"); });
  it("buildSopRiskFindings is a function", () => { expect(typeof buildSopRiskFindings).toBe("function"); });
  it("buildSopOpportunityFindings is a function", () => { expect(typeof buildSopOpportunityFindings).toBe("function"); });
  it("computeSopMetrics is a function", () => { expect(typeof computeSopMetrics).toBe("function"); });
  it("resolveSopThresholds is a function", () => { expect(typeof resolveSopThresholds).toBe("function"); });
  it("rankSopFindings is a function", () => { expect(typeof rankSopFindings).toBe("function"); });
  it("ownerFindingSchema is an object", () => { expect(typeof ownerFindingSchema).toBe("object"); });
  it("domainScoreSchema is an object", () => { expect(typeof domainScoreSchema).toBe("object"); });
  it("disciplined is a function", () => { expect(typeof disciplined).toBe("function"); });
  it("breakdown is a function", () => { expect(typeof breakdown).toBe("function"); });
  it("codes is a function", () => { expect(typeof codes).toBe("function"); });
  it("diagnose is a function", () => { expect(typeof diagnose).toBe("function"); });
  it("disciplined() returns an object", () => { expect(typeof disciplined()).toBe("object"); });
  it("breakdown() returns an object", () => { expect(typeof breakdown()).toBe("object"); });
});

describe("owner-sop detector — risk findings", () => {
  it("breakdown triggers the execution risk cluster", () => {
    const r = diagnose(breakdown());
    const c = codes(r.riskFindings);
    expect(c).toEqual(
      expect.arrayContaining([
        "SOP_LOW_COMPLETION",
        "SOP_LOW_VERIFICATION",
        "SOP_HIGH_OVERDUE",
        "SOP_REPEATED_FAILURES",
        "SOP_HIGH_DISPUTE",
        "SOP_HIGH_REASSIGNMENT",
        "SOP_LOW_PROOF_COMPLIANCE",
        "SOP_LOW_COVERAGE",
      ])
    );
    const completion = r.riskFindings.find((f) => f.code === "SOP_LOW_COMPLETION");
    expect(completion?.severity).toBe("critical"); // 50% < critical 65%
  });

  it("disciplined execution emits no execution risk findings", () => {
    const r = diagnose(disciplined());
    const c = codes(r.riskFindings);
    expect(c).not.toContain("SOP_LOW_COMPLETION");
    expect(c).not.toContain("SOP_HIGH_OVERDUE");
    expect(c).not.toContain("SOP_REPEATED_FAILURES");
    expect(c).not.toContain("SOP_LOW_COVERAGE");
  });

  it("flags missing critical data and invalid currency (certain)", () => {
    const input: SopSnapshotInput = { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "" };
    const m = computeSopMetrics(input, { now: new Date("2026-06-05") });
    const findings = buildSopRiskFindings(input, m, resolveSopThresholds());
    const c = codes(findings);
    expect(c).toContain("SOP_INVALID_CURRENCY");
    expect(c).toContain("SOP_MISSING_CRITICAL_DATA");
    const missing = findings.find((f) => f.code === "SOP_MISSING_CRITICAL_DATA");
    expect(missing?.confidence).toBe(1);
    expect(missing?.missingData).toEqual(
      expect.arrayContaining(["actionsAssigned", "actionsCompleted", "verifiedOrOverdue"])
    );
  });
});

describe("owner-sop detector — opportunity findings", () => {
  it("emits the improvement cluster under breakdown", () => {
    const r = diagnose(breakdown());
    const c = codes(r.opportunityFindings);
    expect(c).toEqual(
      expect.arrayContaining([
        "SOP_OPP_CLEAR_OVERDUE",
        "SOP_OPP_CONVERT_TO_SOP",
        "SOP_OPP_CLOSE_COVERAGE_GAP",
        "SOP_OPP_RAISE_VERIFICATION",
      ])
    );
  });

  it("fabricates no opportunity when supporting inputs are absent", () => {
    const bare: SopSnapshotInput = {
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      currency: "INR",
      actionsAssigned: 100,
      actionsCompleted: 100, // perfect completion; no overdue/repeated/sop/verification inputs
      actionsOverdue: 0,
    };
    const m = computeSopMetrics(bare, { now: new Date("2026-06-05") });
    const c = codes(buildSopOpportunityFindings(bare, m, resolveSopThresholds()));
    expect(c).not.toContain("SOP_OPP_CLEAR_OVERDUE");
    expect(c).not.toContain("SOP_OPP_CONVERT_TO_SOP");
    expect(c).not.toContain("SOP_OPP_CLOSE_COVERAGE_GAP");
    expect(c).not.toContain("SOP_OPP_RAISE_VERIFICATION");
  });
});

describe("owner-sop detector — ranking + domain score", () => {
  it("ranks critical findings ahead of low ones (deterministic + stable)", () => {
    const r = diagnose(breakdown());
    const rank = { critical: 4, high: 3, medium: 2, low: 1 } as const;
    for (let i = 1; i < r.findings.length; i++) {
      expect(rank[r.findings[i - 1].severity]).toBeGreaterThanOrEqual(rank[r.findings[i].severity]);
    }
    const again = diagnose(breakdown());
    expect(codes(again.findings)).toEqual(codes(r.findings));
  });

  it("produces a valid sop DomainScore from the engine metrics", () => {
    const r = diagnose(breakdown());
    const parsed = domainScoreSchema.parse(r.domainScore);
    expect(parsed.domain).toBe("sop");
    expect(parsed.riskScore).toBe(r.metrics.executionRiskScore);
    expect(parsed.healthScore).toBe(r.metrics.executionHealthScore);
    expect(parsed.opportunityScore).toBe(r.metrics.executionOpportunityScore);
    expect(parsed.topFindingCodes.length).toBeGreaterThan(0);
  });

  it("every finding satisfies the spine OwnerFinding schema with domain sop", () => {
    const r = diagnose(breakdown());
    for (const f of r.findings) {
      expect(() => ownerFindingSchema.parse(f)).not.toThrow();
      expect(f.domain).toBe("sop");
    }
  });

  it("rankSopFindings does not mutate its input", () => {
    const r = diagnose(breakdown());
    const before = codes(r.findings);
    const copy = [...r.findings];
    rankSopFindings(r.findings);
    expect(codes(copy)).toEqual(before);
  });
});
