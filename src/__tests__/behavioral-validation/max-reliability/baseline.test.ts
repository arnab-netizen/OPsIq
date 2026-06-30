/**
 * Maximum-reliability baseline assurance.
 *
 * The committed `OPSIQ_MAX_RELIABILITY_BASELINE.json` is the before-fix reliability snapshot. These tests
 * prove it (1) exists, (2) carries every required segment dimension + global metrics + corpus volumes,
 * and (3) CANNOT silently omit a weak or near-threshold segment — the recorded weak lists must be exactly
 * what the recorded segment scores imply (so an average can never hide a weak domain/category/stage/etc.).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const PATH = resolve(process.cwd(), "OPSIQ_MAX_RELIABILITY_BASELINE.json");

interface Baseline {
  capturedAt: string; stride: number;
  corpus: { total: number; real: number; variants: number; adversarial: number };
  global: { productionRuntimeScore: number; collectiveWholeBusinessScore: number; holdoutScore: number; adversarialUnsafe: number; regressionFailures: number; learningAppliedRate: number };
  segments: { byDomain: Record<string, number>; byCriticalDomain: Record<string, number>; byCategory: Record<string, number>; bySeverity: Record<string, number>; byStage: Record<string, number>; byLocation: Record<string, number>; byCollectiveType: Record<string, number> };
  weak: { domains: string[]; criticalDomains: string[]; categories: string[]; severities: string[]; stages: string[]; locations: string[]; collectiveTypes: string[] };
  nearThreshold: { domainsUnder95: Array<{ domain: string; score: number }>; domains90to92: string[] };
  coverage: { requiredDomains: number; domainsScored: number; collectiveTypesScored: number };
}

const load = (): Baseline => JSON.parse(readFileSync(PATH, "utf8")) as Baseline;
const below = (seg: Record<string, number>, floor: number) => Object.entries(seg).filter(([, v]) => v < floor).map(([k]) => k).sort();

describe("max-reliability baseline", () => {
  it("the baseline file exists", () => {
    expect(existsSync(PATH)).toBe(true);
  });

  it("carries global metrics + corpus volumes", () => {
    const b = load();
    for (const k of ["productionRuntimeScore", "collectiveWholeBusinessScore", "holdoutScore", "adversarialUnsafe", "regressionFailures"] as const) {
      expect(typeof b.global[k], k).toBe("number");
    }
    expect(b.corpus.total).toBeGreaterThanOrEqual(1500);
    expect(b.corpus.real).toBeGreaterThanOrEqual(400);
  });

  it("carries every required segment dimension, each non-empty", () => {
    const b = load();
    for (const dim of ["byDomain", "byCriticalDomain", "byCategory", "bySeverity", "byStage", "byLocation", "byCollectiveType"] as const) {
      expect(Object.keys(b.segments[dim]).length, dim).toBeGreaterThan(0);
    }
    expect(b.coverage.domainsScored).toBe(60);
  });

  // The anti-averaging guarantee: the recorded weak lists must be EXACTLY what the recorded scores imply.
  // A weak segment therefore cannot be omitted from the baseline without this test failing.
  it("cannot omit a weak segment — recorded weak lists match the recorded scores", () => {
    const b = load();
    expect([...b.weak.domains].sort()).toEqual(below(b.segments.byDomain, 90));
    expect([...b.weak.criticalDomains].sort()).toEqual(below(b.segments.byCriticalDomain, 90));
    expect([...b.weak.categories].sort()).toEqual(below(b.segments.byCategory, 85));
    expect([...b.weak.severities].sort()).toEqual(below(b.segments.bySeverity, 85));
    expect([...b.weak.stages].sort()).toEqual(below(b.segments.byStage, 85));
    expect([...b.weak.locations].sort()).toEqual(below(b.segments.byLocation, 85));
    expect([...b.weak.collectiveTypes].sort()).toEqual(below(b.segments.byCollectiveType, 90));
  });

  it("surfaces near-threshold (<95) domains explicitly", () => {
    const b = load();
    const under95 = Object.entries(b.segments.byDomain).filter(([, v]) => v < 95).map(([k]) => k).sort();
    expect(b.nearThreshold.domainsUnder95.map((d) => d.domain).sort()).toEqual(under95);
  });
});
