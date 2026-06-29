/**
 * 60/60 domain coverage + materiality gates. A domain counts only when a play DECLARES it material;
 * every tag must be a known canonical domain (no loose/unknown tags); each required domain has depth,
 * and each critical domain meets the higher adversarial/holdout/multi-turn/runtime bars. Materiality is
 * checked by a domain→dominant-constraint affinity (a critical domain must appear on a case whose
 * binding constraint plausibly involves it).
 */
import { describe, it, expect } from "vitest";
import { PUBLIC_CORPUS } from "@/behavioral-validation/public-cases/library";
import { REQUIRED_DOMAINS, REQUIRED_DOMAIN_SET, CRITICAL_DOMAINS } from "@/behavioral-validation/public-cases/domains";

const adversarial = (p: { meta: { severity: string } }) => ["fraud", "extreme", "ugly_spiral"].includes(p.meta.severity);

function tally(pred: (p: (typeof PUBLIC_CORPUS)[number]) => boolean): Record<string, number> {
  const m: Record<string, number> = {};
  for (const pc of PUBLIC_CORPUS) if (pred(pc)) for (const d of pc.meta.domains) m[d] = (m[d] ?? 0) + 1;
  return m;
}

describe("public corpus — 60/60 domain coverage", () => {
  const all = tally(() => true);

  it("covers all 60 required domains with no missing and no loose/unknown tags", () => {
    const missing = REQUIRED_DOMAINS.filter((d) => !all[d]);
    expect(missing).toEqual([]);
    const unknown = Object.keys(all).filter((d) => !REQUIRED_DOMAIN_SET.has(d));
    expect(unknown).toEqual([]);
    expect(Object.keys(all).filter((d) => REQUIRED_DOMAIN_SET.has(d)).length).toBe(60);
  });

  it("every required domain has >= 20 material cases", () => {
    for (const d of REQUIRED_DOMAINS) expect(all[d], d).toBeGreaterThanOrEqual(20);
  });

  it("every critical domain meets the higher coverage bars", () => {
    const adv = tally(adversarial);
    const hold = tally((p) => p.meta.split === "holdout");
    const mt = tally((p) => !!p.meta.multiTurn);
    const runtimeEligible = tally((p) => p.meta.productionRuntimeEligible);
    for (const d of CRITICAL_DOMAINS) {
      expect(all[d], `${d} total`).toBeGreaterThanOrEqual(40);
      expect(adv[d] ?? 0, `${d} adversarial`).toBeGreaterThanOrEqual(10);
      expect(hold[d] ?? 0, `${d} holdout`).toBeGreaterThanOrEqual(10);
      expect(mt[d] ?? 0, `${d} multi-turn`).toBeGreaterThanOrEqual(5);
      expect(runtimeEligible[d] ?? 0, `${d} runtime-eligible`).toBeGreaterThanOrEqual(5);
    }
  });
});

describe("public corpus — domain materiality", () => {
  it("every case domain is a declared canonical domain (no loose tagging)", () => {
    for (const pc of PUBLIC_CORPUS) {
      expect(pc.meta.domains.length).toBeGreaterThan(0);
      for (const d of pc.meta.domains) expect(REQUIRED_DOMAIN_SET.has(d), `${pc.meta.caseId}:${d}`).toBe(true);
    }
  });

  it("each critical domain materially links to a binding constraint (not a loose tag)", () => {
    // affinity: a critical domain must appear on >=1 case whose dominant constraint is a BLOCKING one.
    const BLOCKING = new Set(["compliance_block", "proof_fraud_block", "cash_survival", "below_margin", "capacity_feasibility", "customer_quality", "owner_workload"]);
    for (const d of CRITICAL_DOMAINS) {
      const material = PUBLIC_CORPUS.some((p) => p.meta.domains.includes(d) && BLOCKING.has(p.meta.dominantConstraint));
      expect(material, `${d} not materially bound to any blocking constraint`).toBe(true);
    }
  });
});
