/**
 * Owner decision / commitment record — pure rules (no I/O).
 *
 * The owner's response to a canonical, PERSISTED decision candidate. Four states only. The candidate identity is
 * the canonical `${source}:...` id (owner-decision-candidates.ts) — never display text. The outcome contract
 * (what the owner committed to measure) is stored exactly as supplied: `null` = unknown / not supplied, an explicit
 * `0` is a known zero, "no target" is not "target 0", and direction is never defaulted or inferred from a metric name.
 */
import { createHash } from "crypto";
import { z } from "zod/v4";
import { ValidationError } from "@/infra/errors";
import { OWNER_DECISION_CONTRACT_VERSION } from "./owner-decision";

export const OWNER_DECISION_STATES = ["ACCEPTED", "REJECTED", "DEFERRED", "MODIFIED"] as const;
export type OwnerDecisionState = (typeof OWNER_DECISION_STATES)[number];

/** Candidate sources a decision can be recorded against: those backed by a persisted, business-attributable row. */
export const PERSISTABLE_CANDIDATE_SOURCES = ["domain_action", "compliance_item"] as const;
export type PersistableCandidateSource = (typeof PERSISTABLE_CANDIDATE_SOURCES)[number];

export const OWNER_DECISION_RECORD_CONTRACT_VERSION = OWNER_DECISION_CONTRACT_VERSION;

export const BASELINE_PROVENANCES = ["MEASURED", "OWNER_REPORTED", "EXTERNAL_SOURCE", "UNKNOWN"] as const;
export const TARGET_DIRECTIONS = ["up", "down", "unknown"] as const;
export const EXPECTED_MEASUREMENT_SOURCES = ["AUTHORITATIVE_SNAPSHOT", "SYSTEM_MEASUREMENT", "EXTERNAL_RECORD", "OWNER_ENTERED"] as const;
export type TargetDirection = (typeof TARGET_DIRECTIONS)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** The eight domains that have a persisted action + verification loop (System A). */
export const SYSTEM_A_DOMAINS = ["recovery", "finance", "cashflow", "sales", "operations", "sop", "marketing", "strategy"] as const;
export type SystemADomain = (typeof SYSTEM_A_DOMAINS)[number];
const SYSTEM_A_DOMAIN_SET: ReadonlySet<string> = new Set(SYSTEM_A_DOMAINS);

export type ParsedCandidateId =
  | { source: "domain_action"; domain: string; sourceId: string; candidateId: string }
  | { source: "compliance_item"; domain: "compliance"; sourceId: string; candidateId: string };

/** Parse a canonical candidate id. Anything not exactly canonical (or not persistable) is null — never guessed. */
export function parseOwnerCandidateId(raw: string): ParsedCandidateId | null {
  const parts = raw.split(":");
  if (parts[0] === "domain_action" && parts.length === 3 && SYSTEM_A_DOMAIN_SET.has(parts[1]) && UUID_RE.test(parts[2])) {
    return { source: "domain_action", domain: parts[1], sourceId: parts[2], candidateId: raw };
  }
  if (parts[0] === "compliance_item" && parts.length === 2 && UUID_RE.test(parts[1])) {
    return { source: "compliance_item", domain: "compliance", sourceId: parts[1], candidateId: raw };
  }
  return null;
}

export function formatDomainActionCandidateId(domain: string, actionId: string): string {
  return `domain_action:${domain}:${actionId}`;
}

// ── Request shapes (strict objects: unknown fields are rejected by parseRequestBody) ─────────────────────────────

const nullableFinite = z.number().finite().nullable().optional();
export const outcomeContractInputSchema = z.strictObject({
  commitmentDescription: z.string().trim().min(1).max(2000).nullable().optional(),
  verificationMetric: z.string().trim().min(1).max(200).nullable().optional(),
  baselineValue: nullableFinite,
  baselineProvenance: z.enum(BASELINE_PROVENANCES).nullable().optional(),
  targetDirection: z.enum(TARGET_DIRECTIONS).nullable().optional(),
  targetValue: nullableFinite,
  observationWindowDays: z.number().int().positive().max(3650).nullable().optional(),
  intendedCompletionAt: z.iso.datetime().nullable().optional(),
  expectedMeasurementSource: z.enum(EXPECTED_MEASUREMENT_SOURCES).nullable().optional(),
});
export type OutcomeContractInput = z.infer<typeof outcomeContractInputSchema>;

export const recordOwnerDecisionSchema = z.strictObject({
  candidateId: z.string().min(1).max(200),
  state: z.enum(OWNER_DECISION_STATES),
  ownerReason: z.string().trim().min(1).max(4000).nullable().optional(),
  revisitAt: z.iso.datetime().nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(128).nullable().optional(),
  contract: outcomeContractInputSchema.nullable().optional(),
});
export type RecordOwnerDecisionInput = z.infer<typeof recordOwnerDecisionSchema>;

export const recordOutcomeContractSchema = z.strictObject({
  candidateId: z.string().min(1).max(200),
  ownerReason: z.string().trim().min(1).max(4000).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(128).nullable().optional(),
  contract: outcomeContractInputSchema,
});
export type RecordOutcomeContractInput = z.infer<typeof recordOutcomeContractSchema>;

/** The normalized outcome contract as persisted. Unknown stays null; direction is always explicit when a contract exists. */
export interface NormalizedOutcomeContract {
  commitmentDescription: string | null;
  verificationMetric: string | null;
  baselineValue: number | null;
  baselineProvenance: (typeof BASELINE_PROVENANCES)[number] | null;
  targetDirection: TargetDirection;
  targetValue: number | null;
  observationWindowDays: number | null;
  intendedCompletionAt: Date | null;
  expectedMeasurementSource: (typeof EXPECTED_MEASUREMENT_SOURCES)[number] | null;
}

export interface NormalizedDecisionBody {
  state: OwnerDecisionState;
  ownerReason: string | null;
  revisitAt: Date | null;
  /** null for REJECTED / DEFERRED (no execution contract). */
  contract: NormalizedOutcomeContract | null;
}

function fail(path: string, message: string): never {
  throw new ValidationError(message, { fieldErrors: [{ path, message }] });
}

export function normalizeOutcomeContract(c: OutcomeContractInput | null | undefined): NormalizedOutcomeContract {
  const x = c ?? {};
  const baselineValue = x.baselineValue ?? null;
  // A baseline number must say where it came from; "UNKNOWN" is an allowed answer, silence is not.
  if (baselineValue !== null && (x.baselineProvenance ?? null) === null) {
    fail("contract.baselineProvenance", "A baseline value requires its provenance (MEASURED, OWNER_REPORTED, EXTERNAL_SOURCE or UNKNOWN).");
  }
  if (baselineValue === null && x.baselineProvenance != null && x.baselineProvenance !== "UNKNOWN") {
    fail("contract.baselineProvenance", "A baseline provenance other than UNKNOWN requires a baseline value.");
  }
  return {
    commitmentDescription: x.commitmentDescription ?? null,
    verificationMetric: x.verificationMetric ?? null,
    baselineValue,
    baselineProvenance: baselineValue === null ? null : (x.baselineProvenance as NormalizedOutcomeContract["baselineProvenance"]),
    // Direction is never defaulted to "up" and never inferred from the metric's name.
    targetDirection: x.targetDirection ?? "unknown",
    targetValue: x.targetValue ?? null,
    observationWindowDays: x.observationWindowDays ?? null,
    intendedCompletionAt: x.intendedCompletionAt ? new Date(x.intendedCompletionAt) : null,
    expectedMeasurementSource: x.expectedMeasurementSource ?? null,
  };
}

/** Cross-field decision rules (state ↔ contract ↔ revisit date). */
export function normalizeDecisionBody(input: Pick<RecordOwnerDecisionInput, "state" | "ownerReason" | "revisitAt" | "contract">): NormalizedDecisionBody {
  const { state } = input;
  const executes = state === "ACCEPTED" || state === "MODIFIED";
  if (!executes && input.contract != null && Object.values(input.contract).some((v) => v !== null && v !== undefined)) {
    fail("contract", `A ${state} decision records no execution and carries no outcome contract.`);
  }
  if (input.revisitAt != null && state !== "DEFERRED") fail("revisitAt", "Only a DEFERRED decision may carry a revisit date.");
  const contract = executes ? normalizeOutcomeContract(input.contract) : null;
  if (state === "MODIFIED" && !contract?.commitmentDescription) {
    fail("contract.commitmentDescription", "A MODIFIED decision must state the action the owner will actually take.");
  }
  return { state, ownerReason: input.ownerReason ?? null, revisitAt: input.revisitAt ? new Date(input.revisitAt) : null, contract };
}

// ── Deterministic fingerprints ───────────────────────────────────────────────────────────────────────────────────

/** JSON with sorted keys and ISO dates: the same facts always serialize to the same bytes. */
export function stableStringify(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, val]) => val !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, val]) => [k, norm(val)])
      );
    }
    return v;
  };
  return JSON.stringify(norm(value));
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Identity of one decision EVENT: same actor, candidate and content ⇒ the same event (a retry), nothing time-based. */
export function decisionRequestFingerprint(p: { candidateId: string; actorId: string; body: NormalizedDecisionBody }): string {
  return sha256Hex(stableStringify({ v: 1, candidateId: p.candidateId, actorId: p.actorId, body: p.body }));
}
