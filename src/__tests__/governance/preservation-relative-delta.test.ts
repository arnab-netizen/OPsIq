/**
 * Round 10 P2-12 — the feature-preservation baseline's OPTION-1 numbers must be a proven relative delta
 * (accepted main value + this branch's own delta), never a bare absolute number that happens to be
 * numerically correct today. This proves the relationship structurally, with a SYNTHETIC accepted-main
 * value (not the real one) so the test cannot pass merely because today's committed number and today's
 * real main value happen to agree — changing the synthetic main value must still produce
 * synthetic + delta, or the test fails.
 *
 * The ledger (docs/opsiq/ux/PRESERVATION_BRANCH_DELTAS.json) lists only genuine non-zero BRANCH-owned deltas. Once a
 * branch merges and the baseline is re-anchored to main, its entries are retired, so an EMPTY ledger is a valid
 * governed state: every invariant below is generic over zero, one or many entries and none requires a particular path.
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

/** Reads `cockpitExternalFeeds[key=<METHOD ENDPOINT>].<field>` (undefined when no matching feed exists at all). */
function readCockpitFeedField(methodAndEndpoint: string, field: string): number | undefined {
  const [method, endpoint] = [methodAndEndpoint.slice(0, methodAndEndpoint.indexOf(" ")), methodAndEndpoint.slice(methodAndEndpoint.indexOf(" ") + 1)];
  const feed = (baseline.cockpitExternalFeeds as Array<{ method: string; endpoint: string } & Record<string, unknown>>).find(
    (f) => f.method === method && f.endpoint === endpoint
  );
  return feed ? (feed[field] as number | undefined) : undefined;
}

/** Reads a top-level `businessContextClassificationCounts.<KEY>` value. */
function readClassificationCount(keyName: string): number | undefined {
  return (baseline.businessContextClassificationCounts as Record<string, number>)[keyName];
}

/** Resolves any of the three recognised ledger path shapes to the committed baseline's current value. */
function readCommittedValue(path: string): number | undefined {
  let m = /^ownerPageRoutes\[route=(.+)\]\.(.+)$/.exec(path);
  if (m) return readPageField(m[1], m[2]);
  m = /^cockpitExternalFeeds\[key=(.+)\]\.(.+)$/.exec(path);
  if (m) return readCockpitFeedField(m[1], m[2]);
  m = /^businessContextClassificationCounts\.(.+)$/.exec(path);
  if (m) return readClassificationCount(m[1]);
  return undefined;
}

describe("R10 P2-12 — preservation baseline entries are a proven relative delta", () => {
  it("the ledger itself is internally consistent: expectedBranchValue always equals acceptedMainValue + branchDelta", () => {
    for (const e of deltas.entries) {
      expect(e.expectedBranchValue, e.path).toBe(expectedBranchValue(e.acceptedMainValue, e.branchDelta));
    }
  });

  it("the committed baseline's own value matches the ledger's expected branch value for every tracked entry", () => {
    for (const e of deltas.entries) {
      const isRecognised = /^ownerPageRoutes\[route=/.test(e.path) || /^cockpitExternalFeeds\[key=/.test(e.path) || /^businessContextClassificationCounts\./.test(e.path);
      expect(isRecognised, `unrecognised ledger path shape: ${e.path}`).toBe(true);
      const committed = readCommittedValue(e.path);
      expect(committed, `${e.path} not found in the committed baseline`).toBe(e.expectedBranchValue);
    }
  });

  it("every entry's branchDelta is non-zero — a field main alone moved (unrelated main drift) never belongs in this ledger", () => {
    for (const e of deltas.entries) {
      expect(e.branchDelta, e.path).not.toBe(0);
    }
  });

  it("no ledger path is duplicated (one entry per tracked field)", () => {
    const paths = deltas.entries.map((e) => e.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  // Mutation proof: this must NOT be true merely because today's real numbers agree. Synthetic accepted-main values
  // (never the real ones) prove the formula itself -- not a lucky number -- is what the ledger is checked against.
  it("the formula holds for synthetic accepted-main values and deltas, independent of any real ledger entry", () => {
    for (const syntheticMain of [0, 1, 4, 10, 25]) {
      for (const delta of [-2, -1, 1, 3]) {
        expect(expectedBranchValue(syntheticMain, delta)).toBe(syntheticMain + delta);
      }
      // If main's accepted value moves forward independently, the branch value moves with it (relative, not absolute).
      expect(expectedBranchValue(syntheticMain + 1, 3)).toBe(expectedBranchValue(syntheticMain, 3) + 1);
    }
  });

  // The invariants as a pure function, so they are proven on synthetic ledgers of ANY size (zero, one, many) and
  // proven to REJECT bad ones -- an empty ledger being valid must never mean the checks are vacuous.
  function ledgerProblems(entries: DeltaEntry[]): string[] {
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const e of entries) {
      if (e.expectedBranchValue !== expectedBranchValue(e.acceptedMainValue, e.branchDelta)) problems.push(`${e.path}: arithmetic`);
      if (e.branchDelta === 0) problems.push(`${e.path}: zero delta`);
      if (seen.has(e.path)) problems.push(`${e.path}: duplicate`);
      seen.add(e.path);
    }
    return problems;
  }
  const entry = (path: string, main: number, delta: number, expected = main + delta): DeltaEntry => ({
    path, acceptedMainValue: main, acceptedMainSha: "a".repeat(40), branchDelta: delta, expectedBranchValue: expected,
    reason: "synthetic branch-owned delta used to prove the ledger invariants",
  });

  it("the real ledger satisfies the generic invariants (zero, one or many entries are all valid)", () => {
    expect(ledgerProblems(deltas.entries)).toEqual([]);
  });

  it("an empty ledger is a valid governed state; one and many valid entries are valid", () => {
    expect(ledgerProblems([])).toEqual([]);
    expect(ledgerProblems([entry("ownerPageRoutes[route=/x].componentTreeFileCount", 3, 2)])).toEqual([]);
    expect(
      ledgerProblems([
        entry("ownerPageRoutes[route=/x].componentTreeFileCount", 3, 2),
        entry("businessContextClassificationCounts.WORKSPACE_ONLY", 3, -2),
        entry("cockpitExternalFeeds[key=GET /api/y].callSiteCount", 0, 1),
      ]),
    ).toEqual([]);
  });

  it("still REJECTS a zero-delta entry, wrong arithmetic and a duplicated path", () => {
    expect(ledgerProblems([entry("ownerPageRoutes[route=/x].componentTreeFileCount", 3, 0)])).toEqual([
      "ownerPageRoutes[route=/x].componentTreeFileCount: zero delta",
    ]);
    expect(ledgerProblems([entry("ownerPageRoutes[route=/x].componentTreeFileCount", 3, 2, 9)])).toEqual([
      "ownerPageRoutes[route=/x].componentTreeFileCount: arithmetic",
    ]);
    const dup = entry("ownerPageRoutes[route=/x].componentTreeFileCount", 3, 2);
    expect(ledgerProblems([dup, dup])).toEqual(["ownerPageRoutes[route=/x].componentTreeFileCount: duplicate"]);
  });

  it("every ledger entry names the main SHA the accepted value was read from (auditable, not asserted from memory)", () => {
    for (const e of deltas.entries) {
      expect(e.acceptedMainSha, e.path).toMatch(/^[0-9a-f]{40}$/);
      expect(e.reason.length, e.path).toBeGreaterThan(20);
    }
  });
});
