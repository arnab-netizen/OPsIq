import { describe, it, expect } from "vitest";
import {
  BusinessFunction,
  composeCommandCenter,
  topPrioritySignal,
  commandCenterRequiresOwnerAction,
  type CommandCenterSignal,
} from "@/domain/execution/owner-command-center";

const sig = (over: Partial<CommandCenterSignal> = {}): CommandCenterSignal => ({
  id: "s",
  function: BusinessFunction.OPERATIONS,
  severity: "INFO",
  headline: "ok",
  requiresOwnerAction: false,
  ...over,
});

describe("[module33] command center composition", () => {
  it("empty input -> STABLE, no signals, no attention items", () => {
    const c = composeCommandCenter([]);
    expect(c.status).toBe("STABLE");
    expect(c.signals).toHaveLength(0);
    expect(c.ownerAttentionItems).toHaveLength(0);
    expect(c.criticalCount).toBe(0);
    expect(c.highestSeverity).toBeNull();
  });

  it("orders by severity desc, then action-required, then id", () => {
    const c = composeCommandCenter([
      sig({ id: "b", severity: "WARNING", requiresOwnerAction: false }),
      sig({ id: "a", severity: "WARNING", requiresOwnerAction: true, headline: "fix a" }),
      sig({ id: "z", severity: "CRITICAL", requiresOwnerAction: true, headline: "crisis" }),
      sig({ id: "c", severity: "INFO" }),
    ]);
    expect(c.signals.map((s) => s.id)).toEqual(["z", "a", "b", "c"]);
    expect(c.highestSeverity).toBe("CRITICAL");
  });

  it("does not mutate the input array", () => {
    const input = [sig({ id: "a", severity: "INFO" }), sig({ id: "b", severity: "CRITICAL" })];
    const snapshot = input.map((s) => s.id);
    composeCommandCenter(input);
    expect(input.map((s) => s.id)).toEqual(snapshot);
  });

  it("critical count counts URGENT and CRITICAL only", () => {
    const c = composeCommandCenter([
      sig({ id: "1", severity: "CRITICAL" }),
      sig({ id: "2", severity: "URGENT" }),
      sig({ id: "3", severity: "WARNING" }),
      sig({ id: "4", severity: "ADVISORY" }),
    ]);
    expect(c.criticalCount).toBe(2);
  });

  it("owner attention items are action-required headlines in priority order", () => {
    const c = composeCommandCenter([
      sig({ id: "low", severity: "ADVISORY", requiresOwnerAction: true, headline: "advisory act" }),
      sig({ id: "hi", severity: "URGENT", requiresOwnerAction: true, headline: "urgent act" }),
      sig({ id: "info", severity: "INFO", requiresOwnerAction: false, headline: "ignore" }),
    ]);
    expect(c.ownerAttentionItems).toEqual(["urgent act", "advisory act"]);
  });
});

describe("[module33] command center status derivation", () => {
  it("CRITICAL -> CRISIS", () => {
    expect(composeCommandCenter([sig({ severity: "CRITICAL" })]).status).toBe("CRISIS");
  });
  it("URGENT -> ACTION_REQUIRED", () => {
    expect(composeCommandCenter([sig({ severity: "URGENT" })]).status).toBe("ACTION_REQUIRED");
  });
  it("WARNING -> NEEDS_ATTENTION", () => {
    expect(composeCommandCenter([sig({ severity: "WARNING" })]).status).toBe("NEEDS_ATTENTION");
  });
  it("action required at low severity -> NEEDS_ATTENTION", () => {
    expect(
      composeCommandCenter([sig({ severity: "ADVISORY", requiresOwnerAction: true })]).status
    ).toBe("NEEDS_ATTENTION");
  });
  it("only info, no action -> STABLE", () => {
    expect(composeCommandCenter([sig({ severity: "INFO" })]).status).toBe("STABLE");
  });
});

describe("[module33] command center helpers", () => {
  it("topPrioritySignal prefers action-required over a more severe non-actionable signal", () => {
    const c = composeCommandCenter([
      sig({ id: "crit", severity: "CRITICAL", requiresOwnerAction: false, headline: "monitor" }),
      sig({ id: "act", severity: "WARNING", requiresOwnerAction: true, headline: "act now" }),
    ]);
    expect(topPrioritySignal(c)?.id).toBe("act");
  });

  it("topPrioritySignal falls back to most severe when nothing is actionable", () => {
    const c = composeCommandCenter([
      sig({ id: "a", severity: "INFO" }),
      sig({ id: "b", severity: "WARNING" }),
    ]);
    expect(topPrioritySignal(c)?.id).toBe("b");
  });

  it("topPrioritySignal is null for empty summary", () => {
    expect(topPrioritySignal(composeCommandCenter([]))).toBeNull();
  });

  it("commandCenterRequiresOwnerAction reflects crisis/action/attention", () => {
    expect(commandCenterRequiresOwnerAction(composeCommandCenter([sig({ severity: "CRITICAL" })]))).toBe(true);
    expect(
      commandCenterRequiresOwnerAction(
        composeCommandCenter([sig({ severity: "ADVISORY", requiresOwnerAction: true })])
      )
    ).toBe(true);
    expect(commandCenterRequiresOwnerAction(composeCommandCenter([sig({ severity: "INFO" })]))).toBe(false);
    expect(commandCenterRequiresOwnerAction(composeCommandCenter([]))).toBe(false);
  });
});
