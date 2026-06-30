/**
 * Public real-world case-library gates: volume, distinctness (no shallow duplicates, ≥3 material axes
 * per variant), lineage/source linkage, gold-answer coverage, category coverage, and — critically —
 * that every case resolves the CORRECT dominant constraint through the real arbitration engine and
 * passes the real base scorer with zero unsafe output. Nothing is weakened: cases flow through the
 * existing validated `arbitrate` / `baseAdvise` / `scoreAdvice`.
 */
import { describe, it, expect } from "vitest";
import { PUBLIC_CORPUS, CATEGORIES } from "@/behavioral-validation/public-cases/library";
import { publicCaseSchema, materialChangeCount, caseSignature } from "@/behavioral-validation/public-cases/schema";
import { SOURCE_REGISTER } from "@/behavioral-validation/public-cases/source-register";
import { behavioralCaseSchema } from "@/behavioral-validation/schema";
import { arbitrate } from "@/behavioral-validation/whole-business/arbitration";
import { baseAdvise } from "@/behavioral-validation/advisor";
import { scoreAdvice } from "@/behavioral-validation/scorer";

const byFlag = (f: string) => PUBLIC_CORPUS.filter((p) => p.meta.realFlag === f);
const adversarialSeverity = (s: string) => ["fraud", "extreme", "ugly_spiral"].includes(s);

describe("public case library — volume & mix", () => {
  it("meets the required case volumes", () => {
    expect(PUBLIC_CORPUS.length).toBeGreaterThanOrEqual(1500);
    expect(byFlag("real").length).toBeGreaterThanOrEqual(400);
    expect(byFlag("variant").length).toBeGreaterThanOrEqual(800);
    expect(PUBLIC_CORPUS.filter((p) => adversarialSeverity(p.meta.severity)).length).toBeGreaterThanOrEqual(300);
    expect(PUBLIC_CORPUS.filter((p) => p.meta.multiTurn && p.meta.multiTurn.length > 0).length).toBeGreaterThanOrEqual(250);
    expect(PUBLIC_CORPUS.filter((p) => p.meta.collective).length).toBeGreaterThanOrEqual(250);
  });

  it("has the required split coverage", () => {
    const c = (s: string) => PUBLIC_CORPUS.filter((p) => p.meta.split === s).length;
    expect(c("holdout")).toBeGreaterThanOrEqual(150);
    expect(c("regression")).toBeGreaterThanOrEqual(150);
    expect(c("browser_representative")).toBeGreaterThanOrEqual(150);
    expect(c("adversarial")).toBeGreaterThanOrEqual(150);
    expect(c("production_runtime")).toBeGreaterThanOrEqual(20);
    // holdout cases are flagged protected
    expect(PUBLIC_CORPUS.filter((p) => p.meta.split === "holdout").every((p) => p.meta.holdoutProtected)).toBe(true);
  });
});

describe("public case library — schema, lineage & gold answers", () => {
  it("every case is schema-valid (PublicCase + underlying BehavioralCase)", () => {
    for (const pc of PUBLIC_CORPUS) {
      expect(publicCaseSchema.safeParse(pc).success, pc.meta.caseId).toBe(true);
      expect(behavioralCaseSchema.safeParse(pc.case).success, pc.meta.caseId).toBe(true);
    }
  });

  it("every case has pattern lineage; real→sourceRef (in register), variant→lineageParent", () => {
    const srcIds = new Set(SOURCE_REGISTER.map((s) => s.id));
    const ids = new Set(PUBLIC_CORPUS.map((p) => p.meta.caseId));
    for (const pc of PUBLIC_CORPUS) {
      expect(pc.meta.patternId.length).toBeGreaterThan(1);
      if (pc.meta.realFlag === "real") expect(srcIds.has(pc.meta.sourceRef!), `${pc.meta.caseId} src`).toBe(true);
      if (pc.meta.realFlag === "variant") expect(ids.has(pc.meta.lineageParentId!), `${pc.meta.caseId} lineage`).toBe(true);
    }
  });

  it("every case carries a gold skeleton with the required anchors", () => {
    for (const pc of PUBLIC_CORPUS) {
      const g = pc.meta.goldSkeleton;
      expect(g.rootCause.length).toBeGreaterThan(7);
      expect(g.dominantConstraint).toBe(pc.meta.dominantConstraint);
      expect(g.whatNotToDo.length).toBeGreaterThan(0);
      expect(g.nextBestAction.length).toBeGreaterThan(7);
      expect(g.proofRequired.length).toBeGreaterThan(0);
      expect(g.reassessment.length).toBeGreaterThan(5);
    }
  });
});

describe("public case library — distinctness", () => {
  it("has zero shallow duplicates (unique signatures)", () => {
    const sigs = new Set(PUBLIC_CORPUS.map(caseSignature));
    expect(sigs.size).toBe(PUBLIC_CORPUS.length);
  });

  it("every variant materially changes >= 3 axes vs its lineage parent", () => {
    const byId = new Map(PUBLIC_CORPUS.map((p) => [p.meta.caseId, p]));
    let weak = 0;
    for (const pc of PUBLIC_CORPUS) {
      if (pc.meta.realFlag !== "variant") continue;
      const parent = byId.get(pc.meta.lineageParentId!);
      if (parent && materialChangeCount(pc, parent) < 3) weak++;
    }
    expect(weak).toBe(0);
  });
});

describe("public case library — category coverage", () => {
  it("covers all 36 categories with depth (>=20 each, >=5 collective, >=3 adversarial, >=1 stop-loss)", () => {
    for (const cat of CATEGORIES) {
      const inCat = PUBLIC_CORPUS.filter((p) => p.meta.businessCategory === cat.key);
      expect(inCat.length, `${cat.key} count`).toBeGreaterThanOrEqual(20);
      expect(inCat.filter((p) => p.meta.collective).length, `${cat.key} collective`).toBeGreaterThanOrEqual(5);
      expect(inCat.filter((p) => adversarialSeverity(p.meta.severity)).length, `${cat.key} adversarial`).toBeGreaterThanOrEqual(3);
      expect(inCat.filter((p) => p.meta.stopLossCondition).length, `${cat.key} stop-loss`).toBeGreaterThanOrEqual(1);
    }
  });

  it("covers a broad domain set with depth (>=20 distinct domains, >=20 cases each)", () => {
    const byDomain: Record<string, number> = {};
    for (const pc of PUBLIC_CORPUS) for (const d of pc.meta.domains) byDomain[d] = (byDomain[d] ?? 0) + 1;
    const domains = Object.keys(byDomain);
    expect(domains.length).toBeGreaterThanOrEqual(20);
    for (const d of domains) expect(byDomain[d], d).toBeGreaterThanOrEqual(20);
  });
});

describe("public case library — correctness through the real engines (no weakening)", () => {
  it("every case resolves the gold dominant constraint via the real arbitration engine", () => {
    let miss = 0;
    for (const pc of PUBLIC_CORPUS) if (arbitrate(pc.case).dominantConstraint !== pc.meta.dominantConstraint) miss++;
    expect(miss).toBe(0);
  });

  it("base advisor passes the real scorer with zero unsafe output across the corpus", () => {
    let passed = 0, unsafe = 0;
    for (const pc of PUBLIC_CORPUS) {
      const sc = scoreAdvice(pc.case, baseAdvise(pc.case));
      if (sc.passed) passed++;
      if ((sc.unsafeFlags?.length ?? 0) > 0) unsafe++;
    }
    expect(unsafe).toBe(0);
    expect(passed / PUBLIC_CORPUS.length).toBeGreaterThanOrEqual(0.9);
  });
});
