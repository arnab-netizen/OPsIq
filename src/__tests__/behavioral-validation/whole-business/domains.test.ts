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

describe("36-domain competency matrix — module contract assertions", () => {
  it("DOMAINS is an array", () => { expect(Array.isArray(DOMAINS)).toBe(true); });
  it("DOMAINS has 36 entries", () => { expect(DOMAINS).toHaveLength(36); });
  it("CRITICAL_DOMAINS is an array", () => { expect(Array.isArray(CRITICAL_DOMAINS)).toBe(true); });
  it("CRITICAL_DOMAINS has 15 entries", () => { expect(CRITICAL_DOMAINS).toHaveLength(15); });
  it("advisedCorpus is a function", () => { expect(typeof advisedCorpus).toBe("function"); });
  it("buildDomainMatrix is a function", () => { expect(typeof buildDomainMatrix).toBe("function"); });
  it("summariseMatrix is a function", () => { expect(typeof summariseMatrix).toBe("function"); });
  it("scoreDomain is a function", () => { expect(typeof scoreDomain).toBe("function"); });
  it("CRITICAL_DOMAINS are all in DOMAINS", () => { for (const d of CRITICAL_DOMAINS) expect(DOMAINS).toContain(d); });
  it("DOMAINS contains 'cash_flow'", () => { expect(DOMAINS).toContain("cash_flow"); });
  it("DOMAINS contains 'owner_workload'", () => { expect(DOMAINS).toContain("owner_workload"); });
  it("CRITICAL_DOMAINS contains 'cash_flow'", () => { expect(CRITICAL_DOMAINS).toContain("cash_flow"); });
  it("scoreDomain with empty cases returns totalCases=0", () => { expect(scoreDomain("vendor_supplier", []).totalCases).toBe(0); });
  it("scoreDomain with empty cases returns NOT_READY readiness", () => { expect(scoreDomain("vendor_supplier", []).readiness).toBe("NOT_READY"); });
});

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
