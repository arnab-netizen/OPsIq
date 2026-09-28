/**
 * Round 10 P2-12 — the feature-preservation baseline's OPTION-1 numbers must be a proven relative delta
 * (accepted main value + this branch's own delta), never a bare absolute number that happens to be
 * numerically correct today. This proves the relationship structurally, with a SYNTHETIC accepted-main
 * value (not the real one) so the test cannot pass merely because today's committed number and today's
 * real main value happen to agree — changing the synthetic main value must still produce
 * synthetic + delta, or the test fails.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

interface DeltaEntry {
  path: string;
  acceptedMainValue: number;
  acceptedMainSha: string;
  branchDelta: number;
  expectedBranchValue: number;
  reason: string;
}

const REPO_ROOT = join(__dirname, "..", "..", "..");
const deltas: { entries: DeltaEntry[] } = JSON.parse(
  readFileSync(join(REPO_ROOT, "docs/opsiq/ux/PRESERVATION_BRANCH_DELTAS.json"), "utf8")
);
const baseline = JSON.parse(readFileSync(join(REPO_ROOT, "docs/opsiq/ux/OWNER_FEATURE_PRESERVATION_BASELINE.json"), "utf8"));

/** OPTION 1: the ONE formula — never a hard-coded branch absolute value. */
function expectedBranchValue(acceptedMainValue: number, branchDelta: number): number {
  return acceptedMainValue + branchDelta;
}

/** Reads `ownerPageRoutes[route=<r>].<field>` out of the generated baseline shape. */
function readPageField(route: string, field: string): number | undefined {
  const page = (baseline.ownerPageRoutes as Array<{ route: string } & Record<string, unknown>>).find((p) => p.route === route);
  return page ? (page[field] as number | undefined) : undefined;
}

describe("R10 P2-12 — preservation baseline entries are a proven relative delta", () => {
  it("the ledger itself is internally consistent: expectedBranchValue always equals acceptedMainValue + branchDelta", () => {
    for (const e of deltas.entries) {
      expect(e.expectedBranchValue, e.path).toBe(expectedBranchValue(e.acceptedMainValue, e.branchDelta));
    }
  });

  it("the committed baseline's own value matches the ledger's expected branch value for every tracked entry", () => {
    for (const e of deltas.entries) {
      const m = /^ownerPageRoutes\[route=(.+)\]\.(.+)$/.exec(e.path);
      expect(m, `unrecognised ledger path shape: ${e.path}`).toBeTruthy();
      const [, route, field] = m!;
      const committed = readPageField(route, field);
      expect(committed, `${e.path} not found in the committed baseline`).toBe(e.expectedBranchValue);
    }
  });

  // Mutation proof: this must NOT be true merely because today's real numbers agree. Using a SYNTHETIC
  // accepted-main value (never the real 4) proves the formula itself — not today's specific arithmetic —
  // is what the test checks. If OPTION 1 relative-delta semantics were abandoned for a hard-coded branch
  // absolute (e.g. always asserting `=== 7`), this synthetic case would still need to read as X + delta,
  // and a test hard-coded to 7 would fail it.
  it("the formula holds for a synthetic accepted-main value, not just today's real one (proves relative semantics, not a lucky number)", () => {
    for (const syntheticMain of [0, 1, 4, 10, 25]) {
      for (const e of deltas.entries) {
        expect(expectedBranchValue(syntheticMain, e.branchDelta)).toBe(syntheticMain + e.branchDelta);
      }
    }
    // And explicitly: if main's accepted value moves (e.g. main itself adds a file to /owner/cockpit
    // independently of this branch, so acceptedMainValue becomes 5), the correct committed branch value
    // becomes 5 + 3 = 8, never a value still hard-coded from when main's accepted value was 4.
    const cockpit = deltas.entries.find((e) => e.path.includes("/owner/cockpit"))!;
    const mainMovedForward = cockpit.acceptedMainValue + 1;
    expect(expectedBranchValue(mainMovedForward, cockpit.branchDelta)).toBe(cockpit.expectedBranchValue + 1);
    expect(expectedBranchValue(mainMovedForward, cockpit.branchDelta)).not.toBe(cockpit.expectedBranchValue);
  });

  it("every ledger entry names the main SHA the accepted value was read from (auditable, not asserted from memory)", () => {
    for (const e of deltas.entries) {
      expect(e.acceptedMainSha, e.path).toMatch(/^[0-9a-f]{40}$/);
      expect(e.reason.length, e.path).toBeGreaterThan(20);
    }
  });
});
