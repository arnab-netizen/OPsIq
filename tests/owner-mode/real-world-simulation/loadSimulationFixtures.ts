import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  parseAndValidateSimulationFixtures,
  type SimulationFixture,
} from "./simulationFixtureSchema";

const FIXTURES_PATH = join(
  __dirname,
  "fixtures",
  "simulation_cases.jsonl"
);

export type SimulationCorpusStatus = "READY" | "NOT_READY";

export interface SimulationCorpus {
  status: SimulationCorpusStatus;
  fixtures: SimulationFixture[];
  /** Human-readable reason when status is NOT_READY. */
  reason?: string;
}

let _cached: SimulationCorpus | null = null;

/**
 * Loads simulation fixtures from fixtures/simulation_cases.jsonl.
 *
 * Returns NOT_READY when:
 * - The fixture file does not exist (corpus not yet authored)
 * - The file is empty (no cases)
 *
 * Returns READY when at least one valid fixture is loaded.
 * Throws on parse or schema validation errors.
 */
export function loadSimulationFixtures(): SimulationCorpus {
  if (_cached !== null) return _cached;

  if (!existsSync(FIXTURES_PATH)) {
    _cached = {
      status: "NOT_READY",
      fixtures: [],
      reason: `Fixture file not found: ${FIXTURES_PATH}. Author cases per REAL_WORLD_SIMULATION_MASTER_PLAN.md before running the harness.`,
    };
    return _cached;
  }

  const content = readFileSync(FIXTURES_PATH, "utf-8");
  const nonBlankLines = content.split("\n").filter((l) => l.trim().length > 0);

  if (nonBlankLines.length === 0) {
    _cached = {
      status: "NOT_READY",
      fixtures: [],
      reason: "Fixture file exists but contains no cases. Add at least one valid simulation fixture.",
    };
    return _cached;
  }

  const fixtures = parseAndValidateSimulationFixtures(content);

  _cached = { status: "READY", fixtures };
  return _cached;
}

/** Returns a simulation fixture by case_id. Throws if not found or corpus is NOT_READY. */
export function getSimulationCaseById(caseId: string): SimulationFixture {
  const corpus = loadSimulationFixtures();
  if (corpus.status === "NOT_READY") {
    throw new Error(
      `Simulation corpus is NOT_READY: ${corpus.reason}`
    );
  }
  const found = corpus.fixtures.find((f) => f.case_id === caseId);
  if (!found) {
    throw new Error(
      `Simulation fixture "${caseId}" not found. Available: ${corpus.fixtures.map((f) => f.case_id).join(", ")}`
    );
  }
  return found;
}

/** Lists all loaded simulation case IDs, or empty array when corpus is NOT_READY. */
export function listSimulationCaseIds(): string[] {
  const corpus = loadSimulationFixtures();
  return corpus.fixtures.map((f) => f.case_id);
}

/** Resets the module cache. Used in tests that need to simulate different corpus states. */
export function _resetSimulationFixtureCache(): void {
  _cached = null;
}
