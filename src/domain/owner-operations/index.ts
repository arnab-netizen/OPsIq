/**
 * Owner Operations (Module 4) — public surface of the deterministic operations
 * engine. Re-exports types, thresholds, data-confidence, and metric functions.
 * Pure domain logic only (no DB/API/UI). Detector + planner slices extend this
 * barrel as they land.
 */
export * from "./types";
export * from "./thresholds";
export * from "./data-confidence";
export * from "./metrics";
export * from "./risk-rules";
export * from "./opportunity-rules";
export * from "./diagnosis";
