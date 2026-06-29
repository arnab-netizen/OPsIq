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

  it("critical domains are not averaged away — the floor surfaces owner_workload", () => {
    const summary = summariseMatrix(reports);
    const ownerWorkload = reports.find((r) => r.domain === "owner_workload")!;
    expect(ownerWorkload.critical).toBe(true);
    expect(ownerWorkload.score).toBeLessThan(90);
    expect(summary.criticalAllPass).toBe(false);
    expect(summary.criticalBelowThreshold.map((r) => r.domain)).toContain("owner_workload");
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

  it("a domain with insufficient case coverage is honestly NOT_READY (flagged for case expansion)", () => {
    const vendor = scoreDomain("vendor_supplier", pairs);
    expect(vendor.totalCases).toBeLessThan(5);
    expect(vendor.readiness).toBe("NOT_READY");
  });
});
