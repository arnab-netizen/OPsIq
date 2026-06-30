/**
 * CHAOS RUN orchestration — replay a set of real-world cases through the production runtime, lock each
 * expectation BEFORE the output exists, and audit each frozen result AFTER. Returns the per-scenario
 * items used by scoring, the layer matrix, the failure loop, and the report. The auditor never touches
 * the runtime; this module only wires the deterministic pieces together.
 */
import type { PublicCase } from "../public-cases/schema";
import type { LearningStore } from "../learning-store";
import { publicCaseToChaosScenario, type ChaosScenario } from "./chaos-schema";
import { replayScenario, lockExpectations, type ChaosReplayResult } from "./chaos-replay";
import { auditReplay, type ChaosAuditResult } from "./chaos-auditor";

export interface ChaosBatchItem { scenario: ChaosScenario; result: ChaosReplayResult; audit: ChaosAuditResult }

/** Replay + lock + audit each case. Expectation is locked before replay output exists; audit reads frozen output after. */
export async function runChaosBatch(cases: PublicCase[], store: LearningStore): Promise<ChaosBatchItem[]> {
  return Promise.all(cases.map(async (pc) => {
    const scenario = publicCaseToChaosScenario(pc, { counted: true });
    const locked = lockExpectations(scenario);
    const result = await replayScenario(pc, store);
    const audit = auditReplay(locked, result);
    return { scenario, result, audit };
  }));
}
