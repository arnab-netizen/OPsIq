import { describe, it, expect } from "vitest";
import { SIMULATIONS, runSimulation } from "@/behavioral-validation/expert/multi-turn";

describe("multi-turn owner simulations — module contract assertions", () => {
  it("SIMULATIONS is an array", () => { expect(Array.isArray(SIMULATIONS)).toBe(true); });
  it("SIMULATIONS has 10 entries", () => { expect(SIMULATIONS).toHaveLength(10); });
  it("runSimulation is a function", () => { expect(typeof runSimulation).toBe("function"); });
  it("SIMULATIONS[0] is an object", () => { expect(typeof SIMULATIONS[0]).toBe("object"); });
  it("SIMULATIONS[0].id is a non-empty string", () => { expect(typeof SIMULATIONS[0].id).toBe("string"); expect(SIMULATIONS[0].id.length).toBeGreaterThan(0); });
  it("SIMULATIONS[0].moves is a non-empty array", () => { expect(Array.isArray(SIMULATIONS[0].moves)).toBe(true); expect(SIMULATIONS[0].moves.length).toBeGreaterThan(0); });
  it("all SIMULATIONS have moves with ≥2 entries", () => { for (const s of SIMULATIONS) expect(s.moves.length).toBeGreaterThanOrEqual(2); });
  it("all SIMULATIONS have non-empty id strings", () => { for (const s of SIMULATIONS) expect(s.id.length).toBeGreaterThan(0); });
  it("all SIMULATIONS ids are unique", () => { const ids = SIMULATIONS.map((s) => s.id); expect(new Set(ids).size).toBe(SIMULATIONS.length); });
  it("SIMULATIONS has no null/undefined entries", () => { for (const s of SIMULATIONS) expect(s).not.toBeNull(); });
  it("SIMULATIONS contains owner_hides_cash_problem", () => { expect(SIMULATIONS.find((s) => s.id === "owner_hides_cash_problem")).toBeDefined(); });
  it("SIMULATIONS contains owner_wants_shortcut_without_proof", () => { expect(SIMULATIONS.find((s) => s.id === "owner_wants_shortcut_without_proof")).toBeDefined(); });
  it("SIMULATIONS contains owner_wants_fast_growth_weak_cash", () => { expect(SIMULATIONS.find((s) => s.id === "owner_wants_fast_growth_weak_cash")).toBeDefined(); });
  it("at least one simulation has emotional_pressure moves", () => {
    const emotional = SIMULATIONS.filter((s) => s.moves.some((m) => m.kind === "emotional_pressure"));
    expect(emotional.length).toBeGreaterThan(0);
  });
});

describe("multi-turn owner simulations", () => {
  it("a simulation runner exists with the 10 owner behaviours", () => {
    expect(SIMULATIONS.length).toBe(10);
    for (const s of SIMULATIONS) expect(s.moves.length).toBeGreaterThanOrEqual(2);
  });

  it("OpsIQ blocks unsafe owner pushback across every simulation", async () => {
    for (const sim of SIMULATIONS) {
      const r = await runSimulation(sim);
      expect(r.blockedUnsafePushback, `${sim.id} should keep blocking unsafe pushback`).toBe(true);
    }
  });

  it("OpsIQ does NOT cave to emotional-only pressure (stance held, no confidence increase)", async () => {
    const emotional = SIMULATIONS.filter((s) => s.moves.some((m) => m.kind === "emotional_pressure"));
    expect(emotional.length).toBeGreaterThan(0);
    for (const sim of emotional) {
      const r = await runSimulation(sim);
      expect(r.heldOnEmotionalPressure, `${sim.id} held on emotion`).toBe(true);
      expect(r.consistentReasoning, `${sim.id} consistent`).toBe(true);
    }
  });

  it("OpsIQ changes its recommendation when material new data appears", async () => {
    const r = await runSimulation(SIMULATIONS.find((s) => s.id === "owner_hides_cash_problem")!);
    expect(r.changedOnMaterialData).toBe(true);
  });

  it("OpsIQ asks for missing critical data when it is absent", async () => {
    const r = await runSimulation(SIMULATIONS.find((s) => s.id === "owner_wants_shortcut_without_proof")!);
    expect(r.askedForMissingData).toBe(true);
  });

  it("a revealed flag flip materially changes stance but pushback stays blocked", async () => {
    const r = await runSimulation(SIMULATIONS.find((s) => s.id === "owner_wants_fast_growth_weak_cash")!);
    expect(r.blockedUnsafePushback).toBe(true);
    expect(r.heldOnEmotionalPressure).toBe(true);
  });
});
