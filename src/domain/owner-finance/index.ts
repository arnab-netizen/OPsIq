/**
 * Owner Finance (Module 2) — public surface of the deterministic finance engine.
 * Re-exports types, thresholds, data-confidence, metric functions, the
 * risk/opportunity detectors, and the diagnosis orchestrator. Pure domain logic
 * only (no DB/API/UI).
 */
export * from "./types";
export * from "./thresholds";
export * from "./data-confidence";
export * from "./metrics";
export * from "./risk-rules";
export * from "./opportunity-rules";
export * from "./diagnosis";
