import { describe, it, expect } from "vitest";
import {
  severityEffects,
  overEscalates,
  maxSeverity,
} from "@/domain/domain-training/severity-scoring";

describe("[F5] severity scoring", () => {
  it("critical cash risk blocks growth and marketing", () => {
    const e = severityEffects({ severity: "CRITICAL", category: "cash" });
    expect(e.blocksGrowth).toBe(true);
    expect(e.blocksMarketing).toBe(true);
    expect(e.ownerInvolvementRequired).toBe(true);
    expect(e.proofRequired).toBe(true);
  });

  it("critical compliance/safety risk escalates", () => {
    expect(severityEffects({ severity: "CRITICAL", category: "compliance" }).escalate).toBe(true);
    expect(severityEffects({ severity: "HIGH", category: "safety" }).escalate).toBe(true);
  });

  it("high quality risk blocks scale and marketing", () => {
    const e = severityEffects({ severity: "HIGH", category: "quality" });
    expect(e.blocksScale).toBe(true);
    expect(e.blocksMarketing).toBe(true);
  });

  it("info/low does not over-escalate", () => {
    expect(overEscalates({ severity: "INFO", category: "cash" })).toBe(false);
    expect(overEscalates({ severity: "LOW", category: "compliance" })).toBe(false);
    const e = severityEffects({ severity: "LOW", category: "cash" });
    expect(e.escalate).toBe(false);
    expect(e.blocksGrowth).toBe(false);
  });

  it("maxSeverity picks the more severe", () => {
    expect(maxSeverity("LOW", "CRITICAL")).toBe("CRITICAL");
    expect(maxSeverity("HIGH", "MEDIUM")).toBe("HIGH");
  });
});
