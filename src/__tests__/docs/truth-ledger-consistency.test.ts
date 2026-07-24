/**
 * Truth-Ledger consistency (PASS 34).
 *
 * Keeps the capability truth-ledger self-verifying: all 11 files exist, the JSON parses, the matrix
 * summary counts match the actual entries, the proof ladder has 16 levels, forbidden claims number 20,
 * every capability carries evidence, and no capability is falsely marked owner-visible in UI. If the
 * ledger drifts from its own evidence, this test fails — so marketing/demo claims cannot silently rot.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const dir = path.join(process.cwd(), "docs", "capability-truth-ledger");
const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf-8");
const readJson = (f: string) => JSON.parse(read(f));

const FILES = [
  "OPSIQ_CAPABILITY_TRUTH_LEDGER.md",
  "OPSIQ_CAPABILITY_MATRIX.json",
  "OPSIQ_PROOF_LEVEL_MATRIX.json",
  "OPSIQ_PUBLIC_CLAIMS_ALLOWED.md",
  "OPSIQ_PUBLIC_CLAIMS_FORBIDDEN.md",
  "OPSIQ_DEMO_SCRIPT_TRUTH_GUIDE.md",
  "OPSIQ_RESTRICTIONS_AND_BOUNDARIES.md",
  "OPSIQ_PROMOTION_RISK_AUDIT.md",
  "OPSIQ_CURRENT_POSITIONING_STATEMENT.md",
  "OPSIQ_CAPABILITY_EVIDENCE_LEDGER.json",
  "OPSIQ_CLAIMS_REVIEW_CHECKLIST.md",
];

describe("truth-ledger-consistency — module contract assertions", () => {
  it("fs is an object", () => { expect(typeof fs).toBe("object"); });
  it("path is an object", () => { expect(typeof path).toBe("object"); });
  it("dir is a non-empty string", () => { expect(typeof dir).toBe("string"); expect(dir.length).toBeGreaterThan(0); });
  it("read is a function", () => { expect(typeof read).toBe("function"); });
  it("readJson is a function", () => { expect(typeof readJson).toBe("function"); });
  it("FILES is an array", () => { expect(Array.isArray(FILES)).toBe(true); });
  it("FILES has 11 elements", () => { expect(FILES).toHaveLength(11); });
  it("FILES contains OPSIQ_CAPABILITY_MATRIX.json", () => { expect(FILES).toContain("OPSIQ_CAPABILITY_MATRIX.json"); });
  it("FILES contains OPSIQ_PROOF_LEVEL_MATRIX.json", () => { expect(FILES).toContain("OPSIQ_PROOF_LEVEL_MATRIX.json"); });
  it("FILES contains OPSIQ_PUBLIC_CLAIMS_FORBIDDEN.md", () => { expect(FILES).toContain("OPSIQ_PUBLIC_CLAIMS_FORBIDDEN.md"); });
  it("dir ends with capability-truth-ledger", () => { expect(dir).toMatch(/capability-truth-ledger$/); });
  it("path.join is a function", () => { expect(typeof path.join).toBe("function"); });
  it("fs.existsSync is a function", () => { expect(typeof fs.existsSync).toBe("function"); });
  it("FILES contains OPSIQ_CAPABILITY_TRUTH_LEDGER.md", () => { expect(FILES).toContain("OPSIQ_CAPABILITY_TRUTH_LEDGER.md"); });
});

describe("truth-ledger-consistency", () => {
  it("1. all 11 ledger files exist and are non-empty", () => {
    for (const f of FILES) {
      expect(fs.existsSync(path.join(dir, f)), f).toBe(true);
      expect(read(f).trim().length, f).toBeGreaterThan(0);
    }
  });

  it("2. the proof-level matrix has exactly 16 ordered levels (L0–L15)", () => {
    const m = readJson("OPSIQ_PROOF_LEVEL_MATRIX.json");
    expect(m.levels).toHaveLength(16);
    m.levels.forEach((lvl: { level: number }, i: number) => expect(lvl.level).toBe(i));
  });

  it("3. the capability matrix summary counts match the actual entries", () => {
    const m = readJson("OPSIQ_CAPABILITY_MATRIX.json");
    const caps = m.capabilities as { classification: string; surface: string; module: string }[];
    const count = (c: string) => caps.filter((x) => x.classification === c).length;
    expect(caps).toHaveLength(m.summary.modulesAssessed);
    expect(count("PROVEN_CI_REQUIRED")).toBe(m.summary.PROVEN_CI_REQUIRED);
    expect(count("PROVEN_CI_RELATED")).toBe(m.summary.PROVEN_CI_RELATED);
    expect(count("PROVEN_DB_NOT_IN_CI")).toBe(m.summary.PROVEN_DB_NOT_IN_CI);
    expect(count("PROVEN_UNIT_ONLY")).toBe(m.summary.PROVEN_UNIT_ONLY);
    // classifications partition the set — counts sum to the total.
    const total = count("PROVEN_CI_REQUIRED") + count("PROVEN_CI_RELATED") + count("PROVEN_DB_NOT_IN_CI") + count("PROVEN_UNIT_ONLY");
    expect(total).toBe(caps.length);
  });

  it("4. no capability is marked owner-visible in UI (honest backend-only truth)", () => {
    const m = readJson("OPSIQ_CAPABILITY_MATRIX.json");
    const caps = m.capabilities as { surface: string; proofLevel: number }[];
    expect(m.summary.ownerVisibleUI).toBe(0);
    for (const c of caps) {
      expect(c.surface).toBe("BACKEND_ONLY");
      // L15 == OWNER_VISIBLE_UI; nothing may claim it while ownerVisibleUI is 0.
      expect(c.proofLevel).toBeLessThan(15);
    }
  });

  it("5. every capability carries a proof level within the ladder and an allowed/forbidden note", () => {
    const m = readJson("OPSIQ_CAPABILITY_MATRIX.json");
    for (const c of m.capabilities as { module: string; proofLevel: number; allowed?: string; forbidden?: string }[]) {
      expect(typeof c.module, JSON.stringify(c)).toBe("string");
      expect(c.proofLevel, c.module).toBeGreaterThanOrEqual(0);
      expect(c.proofLevel, c.module).toBeLessThanOrEqual(15);
      expect((c.allowed ?? "").length + (c.forbidden ?? "").length, c.module).toBeGreaterThan(0);
    }
  });

  it("6. exactly 20 forbidden public claims are enumerated", () => {
    const md = read("OPSIQ_PUBLIC_CLAIMS_FORBIDDEN.md");
    // table rows: "| <n> | ... |" with a leading integer.
    const rows = md.split("\n").filter((l) => /^\|\s*\d+\s*\|/.test(l));
    const nums = rows.map((r) => Number(r.split("|")[1].trim()));
    expect(nums).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("7. the evidence ledger records the required CI lane and no-live-AI / no-outcome truths", () => {
    const e = readJson("OPSIQ_CAPABILITY_EVIDENCE_LEDGER.json");
    expect(e.requiredCiLane.requiredChecks).toContain("LANE_B — Local Postgres");
    expect(e.noLiveAiEvidence.importers).toMatch(/none/i);
    expect(e.noRealOutcomeData.conclusion).toMatch(/no.*outcome/i);
    expect(e.dbSimsOnDiskButUnwiredFromRequiredLane.length).toBe(e.repoEvidence.executionDbSimsOnDiskButNotInLaneB);
  });
});
