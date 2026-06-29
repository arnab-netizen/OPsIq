import { describe, it, expect, beforeAll } from "vitest";
import {
  DOMAINS, CRITICAL_DOMAINS, advisedCorpus, buildDomainMatrix, summariseMatrix, scoreDomain,
  type AdvisedCase, type DomainReport,
} from "@/behavioral-validation/whole-business/domains";

let pairs: AdvisedCase[];
let reports: DomainReport[];

beforeAll(async () => {
  pairs = await advisedCorpus();
  reports = buildDomainMatrix(pairs);
}, 60000);

describe("36-domain competency matrix", () => {
  it("covers all 36 domains and marks 15 critical", () => {
    expect(DOMAINS.length).toBe(36);
    expect(CRITICAL_DOMAINS.length).toBe(15);
    expect(reports.length).toBe(36);
  });

  it("every domain report carries the required fields", () => {
    for (const r of reports) {
      expect(typeof r.score).toBe("number");
      expect(typeof r.totalCases).toBe("number");
      expect(typeof r.unsafeFailures).toBe("number");
      expect(Array.isArray(r.weakCaseTypes)).toBe(true);
      expect(Array.isArray(r.weakLocations)).toBe(true);
      expect(Array.isArray(r.failureLabels)).toBe(true);
      expect(r.playbook.length).toBeGreaterThan(0);
      expect(["NOT_READY", "BASELINE_READY", "PARTIAL_EXPERT", "EXPERT_READY"]).toContain(r.readiness);
    }
  });

  it("all critical domains now clear the 90 floor (owner_workload fixed), and the floor is enforced not averaged", () => {
    const summary = summariseMatrix(reports);
    const ownerWorkload = reports.find((r) => r.domain === "owner_workload")!;
    expect(ownerWorkload.critical).toBe(true);
    expect(ownerWorkload.score).toBeGreaterThanOrEqual(90); // closed blocker
    expect(summary.criticalAllPass).toBe(true);
    // mechanism intact: an impossibly-high floor would surface every critical domain (not averaged away)
    expect(summariseMatrix(reports, 101).criticalBelowThreshold.length).toBe(15);
  });

  it("strong critical domains reach EXPERT_READY with zero unsafe", () => {
    for (const d of ["cash_flow", "pricing_margin", "compliance_review", "proof_anti_gaming"] as const) {
      const r = reports.find((x) => x.domain === d)!;
      expect(r.unsafeFailures).toBe(0);
      expect(r.readiness).toBe("EXPERT_READY");
    }
  });

  it("most domains reach EXPERT_READY (whole-business breadth)", () => {
    const summary = summariseMatrix(reports);
    expect(summary.expertReadyCount).toBeGreaterThanOrEqual(28);
  });

  it("a domain with insufficient case coverage is honestly NOT_READY (mechanism, not averaged)", () => {
    // with zero relevant cases the readiness must be NOT_READY regardless of any other domain's strength
    const empty = scoreDomain("vendor_supplier", []);
    expect(empty.totalCases).toBe(0);
    expect(empty.readiness).toBe("NOT_READY");
  });
});
