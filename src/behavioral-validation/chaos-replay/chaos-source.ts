/**
 * Source rules for COUNTED chaos scenarios (§3). A counted scenario must be real (not synthetic), link to
 * a real `sourceRef` that exists in the source register, carry ≥1 source limitation, contain a wrong
 * tempting action and a missing-data/confidence challenge, state a real-world consequence, and leak no PII
 * or long copied text. Reuses the source register's privacy gates (findPII / hasLongCopiedText).
 */
import { SOURCE_REGISTER, findPII, hasLongCopiedText } from "../public-cases/source-register";
import type { ChaosScenario } from "./chaos-schema";

const REGISTER_IDS = new Set(SOURCE_REGISTER.map((s) => s.id));

/** Every string field on the scenario, flattened, for PII / long-text scanning. */
function scenarioStrings(s: ChaosScenario): string[] {
  const out: string[] = [];
  for (const v of Object.values(s)) {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) for (const x of v) if (typeof x === "string") out.push(x);
  }
  return out;
}

export function validateCountedScenario(s: ChaosScenario, registerIds: Set<string> = REGISTER_IDS): string[] {
  const errors: string[] = [];
  if (!s.countedForReadiness) return ["not counted"]; // only counted scenarios are gated here
  if (s.synthetic) errors.push("synthetic case counted");
  if (s.sourceRefs.length === 0) errors.push("no sourceRef");
  for (const ref of s.sourceRefs) if (!registerIds.has(ref)) errors.push(`hallucinated sourceRef: ${ref}`);
  if (s.sourceLimitations.length === 0) errors.push("no source limitation");
  if (!s.temptingWrongAction || s.temptingWrongAction.length < 4) errors.push("no wrong tempting action");
  if (s.missingData.length === 0) errors.push("no missing-data challenge");
  if (!s.expectedRealWorldConsequenceIfWrong || s.expectedRealWorldConsequenceIfWrong.length < 8) errors.push("no real-world consequence");
  // privacy gates
  for (const str of scenarioStrings(s)) {
    const pii = findPII(str);
    if (pii.length) errors.push(`PII (${pii.join(",")})`);
    if (hasLongCopiedText(str)) errors.push("long copied text");
  }
  // no-chaos: a counted real-world case must carry at least one messy/conflicting signal AND one chaos type.
  if (s.conflictingData.length === 0) errors.push("no conflicting/messy signal");
  if (s.chaosTypes.length === 0) errors.push("no chaos type");
  return errors;
}

export function isCountedScenarioValid(s: ChaosScenario, registerIds: Set<string> = REGISTER_IDS): boolean {
  return validateCountedScenario(s, registerIds).length === 0;
}

export { REGISTER_IDS };
