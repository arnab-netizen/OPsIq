import { describe, it, expect } from "vitest";
import { diagnoseAgency, validateAgencyInput, AGENCY_EXAMPLE_INPUT, type AgencyDiagnosticInput } from "./diagnose";

const base: AgencyDiagnosticInput = {
  monthlyRevenue: 100000,
  passThroughCosts: 0,
  deliveryCost: 45000,
  overhead: 25000,
  hoursLogged: 100,
  hoursScoped: 100,
  daysToCollect: 30,
  cashReserveMonths: 3,
  billableHours: 700,
  capacityHours: 1000,
};
const key = (i: AgencyDiagnosticInput) => {
  const r = diagnoseAgency(i);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.priority?.key ?? "NONE";
};

describe("diagnoseAgency", () => {
  it("flags nothing for a healthy agency", () => expect(key(base)).toBe("NONE"));
  it("prioritises delivery margin below 50%", () => expect(key({ ...base, deliveryCost: 60000 })).toBe("DELIVERY_MARGIN_OVERSERVICING"));
  it("prioritises overservicing above 15%", () => expect(key({ ...base, hoursLogged: 116 })).toBe("DELIVERY_MARGIN_OVERSERVICING"));
  it("prioritises overhead when delivery is healthy and net is under 10%", () => expect(key({ ...base, overhead: 48000 })).toBe("OVERHEAD"));
  it("prioritises cash when collection is slow", () => expect(key({ ...base, daysToCollect: 60 })).toBe("CASH_RECEIVABLES"));
  it("prioritises cash when runway is under two months", () => expect(key({ ...base, cashReserveMonths: 1.5 })).toBe("CASH_RECEIVABLES"));
  it("prioritises utilization below 50%", () => expect(key({ ...base, billableHours: 400 })).toBe("UTILIZATION_CAPACITY"));
  it("flags utilization above 85%", () => expect(key({ ...base, billableHours: 900 })).toBe("UTILIZATION_CAPACITY"));

  it("uses strict boundaries", () => {
    expect(key({ ...base, deliveryCost: 50000 })).toBe("NONE"); // exactly 50% margin
    expect(key({ ...base, hoursLogged: 115 })).toBe("NONE"); // exactly 15% overservice
    expect(key({ ...base, daysToCollect: 45 })).toBe("NONE");
    expect(key({ ...base, cashReserveMonths: 2 })).toBe("NONE");
    expect(key({ ...base, billableHours: 500 })).toBe("NONE");
    expect(key({ ...base, billableHours: 850 })).toBe("NONE");
  });

  it("ranks delivery over cash when both flag, and lists the rest", () => {
    const r = diagnoseAgency({ ...base, deliveryCost: 60000, daysToCollect: 60 });
    expect(r.ok && r.priority?.key).toBe("DELIVERY_MARGIN_OVERSERVICING");
    expect(r.ok && r.others.map((o) => o.key)).toContain("CASH_RECEIVABLES");
  });

  it("subtracts pass-through costs before computing margins", () => {
    // revenue 100k with 40k pass-through => AGI 60k; delivery 45k => margin 25% => flagged
    expect(key({ ...base, passThroughCosts: 40000 })).toBe("DELIVERY_MARGIN_OVERSERVICING");
  });

  it("has a deterministic example", () => expect(key(AGENCY_EXAMPLE_INPUT)).toBe("DELIVERY_MARGIN_OVERSERVICING"));
});

describe("validateAgencyInput", () => {
  it("rejects negatives and NaN", () => {
    expect(validateAgencyInput({ ...base, overhead: -1 })).not.toHaveLength(0);
    expect(validateAgencyInput({ ...base, deliveryCost: Number.NaN })).not.toHaveLength(0);
    expect(validateAgencyInput({ ...base, hoursLogged: Infinity })).not.toHaveLength(0);
  });
  it("rejects zero denominators", () => {
    expect(validateAgencyInput({ ...base, hoursScoped: 0 })).not.toHaveLength(0);
    expect(validateAgencyInput({ ...base, capacityHours: 0 })).not.toHaveLength(0);
    expect(validateAgencyInput({ ...base, passThroughCosts: 100000 })).not.toHaveLength(0);
  });
  it("accepts a valid input", () => expect(validateAgencyInput(base)).toEqual([]));
  it("diagnoseAgency returns errors instead of throwing", () => {
    const r = diagnoseAgency({ ...base, hoursScoped: 0 });
    expect(r.ok).toBe(false);
  });
});
