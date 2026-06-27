/**
 * Manual / Import-Ready source confidence — pure unit proof.
 *
 * Proves the honest confidence rules: manual/import never exceeds PARTIAL; only
 * RECONCILED reaches VERIFIED; stale data is downgraded; missing/unknown source ⇒
 * data-insufficient; aggregate confidence is the weakest input.
 */
import { describe, it, expect } from "vitest";
import {
  classifySourceConfidence,
  aggregateSourceConfidence,
  isStaleSource,
} from "@/domain/owner-budget/import-source";

const ASOF = new Date("2026-06-27T00:00:00Z");
const daysBefore = (n: number) => new Date(ASOF.getTime() - n * 86_400_000).toISOString();

describe("classifySourceConfidence", () => {
  it("manual/import data is never better than PARTIAL", () => {
    expect(classifySourceConfidence({ sourceType: "MANUAL", lastVerifiedAt: daysBefore(1), asOf: ASOF }).confidence).toBe("PARTIAL");
    expect(classifySourceConfidence({ sourceType: "IMPORT", lastVerifiedAt: daysBefore(1), asOf: ASOF }).confidence).toBe("PARTIAL");
    expect(classifySourceConfidence({ sourceType: "UPLOAD", lastVerifiedAt: daysBefore(1), asOf: ASOF }).confidence).toBe("PARTIAL");
  });

  it("only RECONCILED reaches VERIFIED; SYSTEM is OPERATIONAL; ESTIMATED is UNVERIFIED", () => {
    expect(classifySourceConfidence({ sourceType: "RECONCILED", asOf: ASOF }).confidence).toBe("VERIFIED");
    expect(classifySourceConfidence({ sourceType: "SYSTEM", asOf: ASOF }).confidence).toBe("OPERATIONAL");
    expect(classifySourceConfidence({ sourceType: "ESTIMATED", lastVerifiedAt: daysBefore(1), asOf: ASOF }).confidence).toBe("UNVERIFIED");
  });

  it("manual is strictly lower confidence than reconciled (manual < verified)", () => {
    const manual = classifySourceConfidence({ sourceType: "MANUAL", lastVerifiedAt: daysBefore(1), asOf: ASOF }).confidence;
    const reconciled = classifySourceConfidence({ sourceType: "RECONCILED", asOf: ASOF }).confidence;
    const order = ["UNVERIFIED", "PARTIAL", "OPERATIONAL", "VERIFIED", "AUDITED"];
    expect(order.indexOf(manual)).toBeLessThan(order.indexOf(reconciled));
  });

  it("stale data is downgraded one level toward UNVERIFIED", () => {
    const fresh = classifySourceConfidence({ sourceType: "IMPORT", lastVerifiedAt: daysBefore(1), asOf: ASOF });
    const stale = classifySourceConfidence({ sourceType: "IMPORT", lastVerifiedAt: daysBefore(120), asOf: ASOF });
    expect(fresh.confidence).toBe("PARTIAL");
    expect(stale.stale).toBe(true);
    expect(stale.confidence).toBe("UNVERIFIED"); // PARTIAL → UNVERIFIED
  });

  it("missing source type ⇒ data-insufficient (UNVERIFIED)", () => {
    const r = classifySourceConfidence({ sourceType: null, asOf: ASOF });
    expect(r.dataInsufficient).toBe(true);
    expect(r.confidence).toBe("UNVERIFIED");
  });

  it("unknown/malformed source type ⇒ data-insufficient", () => {
    const r = classifySourceConfidence({ sourceType: "totally_made_up", lastVerifiedAt: daysBefore(1), asOf: ASOF });
    expect(r.dataInsufficient).toBe(true);
    expect(r.confidence).toBe("UNVERIFIED");
  });
});

describe("isStaleSource", () => {
  it("missing timestamp counts as stale", () => {
    expect(isStaleSource(null, ASOF)).toBe(true);
    expect(isStaleSource(undefined, ASOF)).toBe(true);
  });
  it("fresh within window is not stale; beyond window is stale", () => {
    expect(isStaleSource(daysBefore(10), ASOF, 45)).toBe(false);
    expect(isStaleSource(daysBefore(60), ASOF, 45)).toBe(true);
  });
});

describe("aggregateSourceConfidence", () => {
  it("returns the weakest confidence across sources", () => {
    const a = classifySourceConfidence({ sourceType: "RECONCILED", asOf: ASOF });
    const b = classifySourceConfidence({ sourceType: "MANUAL", lastVerifiedAt: daysBefore(1), asOf: ASOF });
    expect(aggregateSourceConfidence([a, b])).toBe("PARTIAL"); // weakest of VERIFIED + PARTIAL
  });
  it("empty ⇒ UNVERIFIED", () => {
    expect(aggregateSourceConfidence([])).toBe("UNVERIFIED");
  });
});
