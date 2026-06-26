import { describe, it, expect } from "vitest";
import {
  defaultWipPolicy,
  evaluateWipAdmission,
  wipUtilization,
  wipPressureBand,
  assertWipAdmissible,
  WipLimitExceededError,
  type WipPolicy,
  type WipState,
} from "@/domain/execution/action-wip-limit";

const policy = (over: Partial<WipPolicy> = {}): WipPolicy => ({
  maxConcurrentActions: 5,
  maxPerOwner: 3,
  maxCritical: 2,
  ...over,
});

const state = (over: Partial<WipState> = {}): WipState => ({
  activeTotal: 0,
  activeByOwner: {},
  activeCritical: 0,
  ...over,
});

describe("[module35] admission under limits", () => {
  it("admits when total, owner, and critical are all under limit", () => {
    const r = evaluateWipAdmission(
      state({ activeTotal: 2, activeByOwner: { a: 1 }, activeCritical: 0 }),
      policy(),
      { ownerId: "a", critical: false }
    );
    expect(r.admit).toBe(true);
    expect(r.blockedReasons).toEqual([]);
  });

  it("admits a critical action when critical headroom remains", () => {
    const r = evaluateWipAdmission(
      state({ activeTotal: 1, activeByOwner: { a: 1 }, activeCritical: 1 }),
      policy(),
      { ownerId: "a", critical: true }
    );
    expect(r.admit).toBe(true);
  });
});

describe("[module35] block reasons", () => {
  it("blocks total_wip_exceeded when admitting would exceed maxConcurrentActions", () => {
    const r = evaluateWipAdmission(
      state({ activeTotal: 5, activeByOwner: { b: 0 } }),
      policy(),
      { ownerId: "b", critical: false }
    );
    expect(r.admit).toBe(false);
    expect(r.blockedReasons).toContain("total_wip_exceeded");
  });

  it("blocks owner_wip_exceeded when owner is at maxPerOwner", () => {
    const r = evaluateWipAdmission(
      state({ activeTotal: 3, activeByOwner: { a: 3 } }),
      policy(),
      { ownerId: "a", critical: false }
    );
    expect(r.admit).toBe(false);
    expect(r.blockedReasons).toContain("owner_wip_exceeded");
  });

  it("blocks critical_wip_exceeded when critical is at maxCritical", () => {
    const r = evaluateWipAdmission(
      state({ activeTotal: 2, activeByOwner: { a: 1 }, activeCritical: 2 }),
      policy(),
      { ownerId: "a", critical: true }
    );
    expect(r.admit).toBe(false);
    expect(r.blockedReasons).toContain("critical_wip_exceeded");
  });

  it("does not raise critical_wip_exceeded for a non-critical candidate", () => {
    const r = evaluateWipAdmission(
      state({ activeTotal: 2, activeByOwner: { a: 1 }, activeCritical: 5 }),
      policy(),
      { ownerId: "a", critical: false }
    );
    expect(r.blockedReasons).not.toContain("critical_wip_exceeded");
    expect(r.admit).toBe(true);
  });

  it("can report multiple block reasons at once", () => {
    const r = evaluateWipAdmission(
      state({ activeTotal: 5, activeByOwner: { a: 3 }, activeCritical: 2 }),
      policy(),
      { ownerId: "a", critical: true }
    );
    expect(r.blockedReasons).toEqual(
      expect.arrayContaining(["total_wip_exceeded", "owner_wip_exceeded", "critical_wip_exceeded"])
    );
  });
});

describe("[module35] utilization and pressure bands", () => {
  it("computes utilization as activeTotal / maxConcurrentActions", () => {
    expect(wipUtilization(state({ activeTotal: 2 }), policy())).toBeCloseTo(0.4);
  });

  it("guards utilization against zero/invalid max and clamps to 0..1", () => {
    expect(wipUtilization(state({ activeTotal: 3 }), policy({ maxConcurrentActions: 0 }))).toBe(0);
    expect(wipUtilization(state({ activeTotal: 99 }), policy())).toBe(1);
  });

  it("bands HEALTHY / TIGHT / OVERLOADED", () => {
    expect(wipPressureBand(state({ activeTotal: 2 }), policy())).toBe("HEALTHY"); // 0.4
    expect(wipPressureBand(state({ activeTotal: 4 }), policy())).toBe("TIGHT"); // 0.8
    expect(wipPressureBand(state({ activeTotal: 5 }), policy())).toBe("OVERLOADED"); // 1.0
  });
});

describe("[module35] guard", () => {
  it("passes silently when admissible", () => {
    expect(() =>
      assertWipAdmissible(state({ activeTotal: 1 }), policy(), { ownerId: "a", critical: false }, "ACT-1")
    ).not.toThrow();
  });

  it("throws WipLimitExceededError with code and blockedReasons when over limit", () => {
    try {
      assertWipAdmissible(
        state({ activeTotal: 5, activeByOwner: { a: 3 } }),
        policy(),
        { ownerId: "a", critical: false },
        "ACT-9"
      );
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(WipLimitExceededError);
      const err = e as WipLimitExceededError;
      expect(err.code).toBe("WIP_LIMIT_EXCEEDED");
      expect(err.message).toContain("ACT-9");
      expect(err.blockedReasons).toEqual(
        expect.arrayContaining(["total_wip_exceeded", "owner_wip_exceeded"])
      );
    }
  });
});

describe("[module35] defaultWipPolicy scaling", () => {
  it("derives small but floored limits for a tiny team", () => {
    const p = defaultWipPolicy(1);
    expect(p.maxConcurrentActions).toBe(3); // clamped to floor of 3
    expect(p.maxPerOwner).toBe(3);
    expect(p.maxCritical).toBe(2);
  });

  it("scales maxConcurrentActions with team size", () => {
    const small = defaultWipPolicy(3);
    const larger = defaultWipPolicy(10);
    expect(small.maxConcurrentActions).toBe(6);
    expect(larger.maxConcurrentActions).toBe(20);
    expect(larger.maxConcurrentActions).toBeGreaterThan(small.maxConcurrentActions);
  });

  it("caps and floors deterministically for extreme/invalid team sizes", () => {
    expect(defaultWipPolicy(1000).maxConcurrentActions).toBe(40);
    expect(defaultWipPolicy(0).maxConcurrentActions).toBe(3);
    expect(defaultWipPolicy(-5).maxConcurrentActions).toBe(3);
  });
});
