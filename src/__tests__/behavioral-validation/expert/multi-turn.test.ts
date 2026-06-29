import { describe, it, expect } from "vitest";
import { SIMULATIONS, runSimulation } from "@/behavioral-validation/expert/multi-turn";

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
