/**
 * DNR dual-key strategy tests — Signal E (Do-Not-Repeat Annotation)
 *
 * Tests the `checkDoNotRepeatForGuidance` function's dual-key logic:
 * - New canonical key: scope:${area}:finding:${findingId}
 * - Legacy key: scope:${area}
 * Priority: new canonical key checked first; legacy key is a fallback.
 * Legacy match is surfaced as `legacyMatch: true` (informational, lower confidence).
 */

import { describe, it, expect } from "vitest";
import {
  checkDoNotRepeatForGuidance,
  scopeKeyForImpactArea,
  type DnrGuidanceDb,
} from "@/services/owner-mode/do-not-repeat.service";

// ─── scopeKeyForImpactArea ────────────────────────────────────────────────────

describe("scopeKeyForImpactArea", () => {
  it("normalizes impact area to lowercase scope token", () => {
    expect(scopeKeyForImpactArea("Operations")).toBe("scope:operations");
    expect(scopeKeyForImpactArea("FINANCE")).toBe("scope:finance");
    expect(scopeKeyForImpactArea("cash")).toBe("scope:cash");
  });

  it("returns null for null/undefined/empty impact area", () => {
    expect(scopeKeyForImpactArea(null)).toBeNull();
    expect(scopeKeyForImpactArea(undefined)).toBeNull();
    expect(scopeKeyForImpactArea("")).toBeNull();
    expect(scopeKeyForImpactArea("   ")).toBeNull();
  });

  it("trims whitespace before normalizing", () => {
    expect(scopeKeyForImpactArea("  finance  ")).toBe("scope:finance");
  });
});

// ─── checkDoNotRepeatForGuidance ─────────────────────────────────────────────

function fakeDb(rule: {
  memoryKey: string;
  summary: string;
  reason: string;
  changedContextExplanation: string | null;
  blocksRepetition: boolean;
} | null): DnrGuidanceDb {
  return {
    ownerDoNotRepeatRule: {
      // Applies the query's own filter as Postgres would: a rule with a recorded change is not returned.
      findFirst: async (args) => (rule && args.where.changedContextExplanation === null && rule.changedContextExplanation !== null ? null : rule),
    },
  };
}

describe("checkDoNotRepeatForGuidance — dual-key strategy", () => {
  const WS = "ws-test";

  it("returns null when ownerDoNotRepeatRule table is absent in DB", async () => {
    const result = await checkDoNotRepeatForGuidance(WS, "operations", null, {});
    expect(result).toBeNull();
  });

  it("returns null when impactArea is null", async () => {
    const db = fakeDb({
      memoryKey: "scope:operations",
      summary: "Prior action",
      reason: "It failed",
      changedContextExplanation: null,
      blocksRepetition: true,
    });
    const result = await checkDoNotRepeatForGuidance(WS, null, null, db);
    expect(result).toBeNull();
  });

  it("returns null when no matching rule exists", async () => {
    const db = fakeDb(null);
    const result = await checkDoNotRepeatForGuidance(WS, "operations", null, db);
    expect(result).toBeNull();
  });

  it("returns annotation with legacyMatch:false when new canonical key matches", async () => {
    const findingId = "finding-abc-123";
    const db = fakeDb({
      memoryKey: `scope:operations:finding:${findingId}`,
      summary: "Tried this before",
      reason: "It made things worse",
      changedContextExplanation: null,
      blocksRepetition: true,
    });
    const result = await checkDoNotRepeatForGuidance(WS, "operations", findingId, db);
    expect(result).not.toBeNull();
    expect(result!.blocked).toBe(true);
    expect(result!.legacyMatch).toBe(false);
    expect(result!.priorActionSummary).toBe("Tried this before");
    expect(result!.blockedReason).toBe("It made things worse");
    expect(result!.changedContextCondition).toBeNull();
    expect(result!.matchedScope).toBe(`scope:operations:finding:${findingId}`);
  });

  it("returns annotation with legacyMatch:true when only legacy key matches", async () => {
    const db = fakeDb({
      memoryKey: "scope:operations",
      summary: "Legacy rule",
      reason: "Do not repeat",
      changedContextExplanation: null,
      blocksRepetition: true,
    });
    // findingId provided → canonical key searched first, but only legacy matched
    const result = await checkDoNotRepeatForGuidance(WS, "operations", "some-finding-id", db);
    expect(result).not.toBeNull();
    expect(result!.legacyMatch).toBe(true);
    expect(result!.matchedScope).toBe("scope:operations");
  });

  it("when findingId is absent, only legacy key is searched and legacyMatch is false", async () => {
    const db = fakeDb({
      memoryKey: "scope:finance",
      summary: "Old rule",
      reason: "Blocked",
      changedContextExplanation: null,
      blocksRepetition: true,
    });
    // No findingId → only scope key searched; no canonical key exists → not a "legacy" match
    const result = await checkDoNotRepeatForGuidance(WS, "finance", null, db);
    expect(result).not.toBeNull();
    // When findingId is null, newCanonicalKey is null, so legacyMatch = (key === scopeKey && newCanonical !== null) = false
    expect(result!.legacyMatch).toBe(false);
    expect(result!.matchedScope).toBe("scope:finance");
  });

  // R10 P1-2: a single findFirst over both key sets combined (ordered only by createdAt) let a more
  // recently created broad rule shadow an older exact one — checkDoNotRepeatForGuidance now searches the
  // canonical (exact) key in its OWN query first, and only falls back to a SEPARATE broad/legacy-key query
  // when nothing exact matched, so a broad rule can never win over an exact one regardless of createdAt.
  it("passes correct keys to findFirst — canonical key searched alone first, legacy/broad key in a separate fallback query", async () => {
    const capturedArgs: string[][] = [];
    const db: DnrGuidanceDb = {
      ownerDoNotRepeatRule: {
        findFirst: async (args) => {
          capturedArgs.push(args.where.memoryKey.in);
          return null;
        },
      },
    };
    await checkDoNotRepeatForGuidance(WS, "management", "finding-xyz", db);
    expect(capturedArgs).toHaveLength(2);
    expect(capturedArgs[0]).toEqual(["scope:management:finding:finding-xyz"]);
    expect(capturedArgs[1]).toEqual(["scope:management"]);
  });

  it("an exact match short-circuits: the broad/legacy fallback query never runs", async () => {
    const capturedArgs: string[][] = [];
    const db: DnrGuidanceDb = {
      ownerDoNotRepeatRule: {
        findFirst: async (args) => {
          capturedArgs.push(args.where.memoryKey.in);
          return args.where.memoryKey.in.includes("scope:management:finding:finding-xyz")
            ? { memoryKey: "scope:management:finding:finding-xyz", summary: "Exact", reason: "Exact reason", changedContextExplanation: null, blocksRepetition: true }
            : null;
        },
      },
    };
    const result = await checkDoNotRepeatForGuidance(WS, "management", "finding-xyz", db);
    expect(capturedArgs).toHaveLength(1);
    expect(result?.matchedScope).toBe("scope:management:finding:finding-xyz");
  });

  it("when findingId is absent, only the legacy scope key is searched", async () => {
    const capturedArgs: string[][] = [];
    const db: DnrGuidanceDb = {
      ownerDoNotRepeatRule: {
        findFirst: async (args) => {
          capturedArgs.push(args.where.memoryKey.in);
          return null;
        },
      },
    };
    await checkDoNotRepeatForGuidance(WS, "compliance", null, db);
    expect(capturedArgs[0]).toEqual(["scope:compliance"]);
  });

  it("a rule whose owner has recorded what has changed no longer annotates the target (the query excludes it, as the gate does)", async () => {
    let where: Record<string, unknown> | null = null;
    const rule = { memoryKey: "scope:cash", summary: "Cash flow intervention", reason: "Prior attempt drained reserves", changedContextExplanation: "Monthly revenue now exceeds 150k", blocksRepetition: true };
    const db: DnrGuidanceDb = {
      ownerDoNotRepeatRule: {
        findFirst: async (args) => {
          where = args.where as unknown as Record<string, unknown>;
          return args.where.changedContextExplanation === null ? null : rule;
        },
      },
    };
    expect(await checkDoNotRepeatForGuidance(WS, "cash", null, db)).toBeNull();
    expect(where).toMatchObject({ changedContextExplanation: null, active: true, blocksRepetition: true });
  });

  it("changedContextCondition is null when rule has no changed context", async () => {
    const db = fakeDb({
      memoryKey: "scope:growth",
      summary: "Growth push",
      reason: "Market not ready",
      changedContextExplanation: null,
      blocksRepetition: true,
    });
    const result = await checkDoNotRepeatForGuidance(WS, "growth", null, db);
    expect(result!.changedContextCondition).toBeNull();
  });

  it("passes workspaceId correctly to the DB query", async () => {
    const capturedWhere: Array<{ workspaceId: string }> = [];
    const db: DnrGuidanceDb = {
      ownerDoNotRepeatRule: {
        findFirst: async (args) => {
          capturedWhere.push({ workspaceId: args.where.workspaceId });
          return null;
        },
      },
    };
    await checkDoNotRepeatForGuidance("specific-workspace-id", "operations", null, db);
    expect(capturedWhere[0].workspaceId).toBe("specific-workspace-id");
  });

  it("with a businessId, only that business's rules (or workspace-wide rules) can annotate its target", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const db: DnrGuidanceDb = {
      ownerDoNotRepeatRule: {
        findFirst: async (args) => {
          captured.push(args.where as unknown as Record<string, unknown>);
          return null;
        },
      },
    };
    await checkDoNotRepeatForGuidance(WS, "cash", null, db, "biz-A");
    expect(captured[0].OR).toEqual([{ businessId: "biz-A" }, { businessId: null }]);
    await checkDoNotRepeatForGuidance(WS, "cash", null, db);
    expect(captured[1]).not.toHaveProperty("OR");
  });
});
