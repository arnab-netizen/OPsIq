/**
 * Owner SOP & Execution Accountability (Module 7) — public surface of the
 * deterministic execution engine. Re-exports types, thresholds, data-confidence,
 * and metric functions. Pure domain logic only (no DB/API/UI). Detector + planner
 * slices extend this barrel as they land.
 */
export * from "./types";
export * from "./thresholds";
export * from "./data-confidence";
export * from "./metrics";
