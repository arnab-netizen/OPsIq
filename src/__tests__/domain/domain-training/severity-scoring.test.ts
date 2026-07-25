import { describe, it, expect } from "vitest";
import {
  severityEffects,
  overEscalates,
  maxSeverity,
} from "@/domain/domain-training/severity-scoring";

describe("[F5] severity scoring — module contract assertions", () => {
  it("severityEffects is a function", () => {
    expect(typeof severityEffects).toBe("function");
  });
  it("overEscalates is a function", () => {
    expect(typeof overEscalates).toBe("function");
  });
  it("maxSeverity is a function", () => {
    expect(typeof maxSeverity).toBe("function");
  });
  it("severityEffects returns an object", () => {
    expect(typeof severityEffects({ severity: "CRITICAL", category: "cash" })).toBe("object");
  });
  it("severityEffects result has blocksGrowth field", () => {
    expect(severityEffects({ severity: "CRITICAL", category: "cash" })).toHaveProperty("blocksGrowth");
  });
  it("severityEffects result has escalate field", () => {
    expect(severityEffects({ severity: "CRITICAL", category: "cash" })).toHaveProperty("escalate");
  });
  it("overEscalates returns a boolean", () => {
    expect(typeof overEscalates({ severity: "INFO", category: "cash" })).toBe("boolean");
  });
  it("overEscalates({severity:'INFO'}) returns false", () => {
    expect(overEscalates({ severity: "INFO", category: "cash" })).toBe(false);
  });
  it("maxSeverity('LOW', 'CRITICAL') returns 'CRITICAL'", () => {
    expect(maxSeverity("LOW", "CRITICAL")).toBe("CRITICAL");
  });
  it("maxSeverity('HIGH', 'MEDIUM') returns 'HIGH'", () => {
    expect(maxSeverity("HIGH", "MEDIUM")).toBe("HIGH");
  });
  it("maxSeverity('LOW', 'LOW') returns 'LOW'", () => {
    expect(maxSeverity("LOW", "LOW")).toBe("LOW");
  });
  it("maxSeverity returns a string", () => {
    expect(typeof maxSeverity("MEDIUM", "CRITICAL")).toBe("string");
  });
  it("CRITICAL cash blocksGrowth is true", () => {
    expect(severityEffects({ severity: "CRITICAL", category: "cash" }).blocksGrowth).toBe(true);
  });
  it("LOW cash blocksGrowth is false", () => {
    expect(severityEffects({ severity: "LOW", category: "cash" }).blocksGrowth).toBe(false);
  });
  it("typeof blocksGrowth is boolean", () => {
    expect(typeof severityEffects({ severity: "INFO", category: "cash" }).blocksGrowth).toBe("boolean");
  });
});

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
