/**
 * Employee guidance generation — call-site service (Slice 10 proper).
 *
 * The single path that turns an owner-approved instruction into employee-facing
 * guidance. It is fail-closed end to end:
 *   1. The instruction is gated by the Slice 6 boundary validator
 *      (`gateEmployeeGuidance`). Guidance is generated ONLY when validation
 *      PASSED; escalation/blocked return a safe message and NO guidance.
 *   2. All untrusted text is structurally contained (prompt-injection safe) and
 *      never influences the decision.
 *   3. EVERY attempt — allowed, escalated, or blocked — writes a durable
 *      AI-guidance ledger record (AuditEvent). If the ledger write fails, the
 *      guidance is NOT returned (no guidance without a durable record).
 *
 * The actual guidance generator is injected: production wires the governed AI
 * copilot; tests/default use a deterministic, boundary-derived builder that
 * cannot leak owner-only data (it only ever sees the employee-safe boundary +
 * instruction).
 */

import { v4 as uuid } from "uuid";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  ApprovedExecutionBoundary,
  BoundaryInstruction,
  BoundaryValidationStatus,
} from "@/domain/execution/boundary";
import {
  GuidanceGateKind,
  UntrustedInput,
  gateEmployeeGuidance,
} from "@/domain/execution/guidance-gating";

export interface EmployeeGuidanceOutput {
  steps: string[];
  script?: string | null;
  proofChecklist?: string[];
  doNot?: string[];
}

export type GuidanceGenerator = (params: {
  boundary: ApprovedExecutionBoundary;
  instruction: BoundaryInstruction;
  containedUntrusted: string[];
}) => Promise<EmployeeGuidanceOutput> | EmployeeGuidanceOutput;

/** Deterministic FNV-1a hash so the ledger references output without storing it. */
function hashOutput(value: unknown): string {
  const s = JSON.stringify(value) ?? "null";
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return `fnv1a_${h.toString(16).padStart(8, "0")}`;
}

/**
 * Default deterministic generator. Builds employee-safe steps from the
 * (employee-safe) boundary + instruction only — it has no access to owner-only
 * data, so it cannot leak it.
 */
export const defaultGuidanceGenerator: GuidanceGenerator = ({ boundary, instruction }) => {
  const steps = [
    `Confirm you are assigned to this task before starting.`,
    `Perform the approved action: ${instruction.action}.`,
  ];
  if (instruction.communicationChannel) {
    steps.push(`Use only the approved channel: ${instruction.communicationChannel}.`);
  }
  if (boundary.proofRequired) {
    steps.push(`Capture the required proof before marking the task done.`);
  }
  const doNot = [
    `Do not promise refunds, discounts, or delivery times beyond the approved boundary.`,
    `If anything is outside these steps, raise a blocker instead of improvising.`,
  ];
  return {
    steps,
    proofChecklist: boundary.proofRequired ? ["Attach proof matching the requirement"] : [],
    doNot,
  };
};

interface AuditCreateDelegate {
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
}
export interface GuidanceDb {
  auditEvent: AuditCreateDelegate;
}
export interface GuidanceDeps {
  db: GuidanceDb;
  generator: GuidanceGenerator;
  now: () => Date;
}

async function resolveDefaultDeps(
  generator?: GuidanceGenerator
): Promise<GuidanceDeps> {
  const { db } = await import("@/lib/db");
  return {
    db: db as unknown as GuidanceDb,
    generator: generator ?? defaultGuidanceGenerator,
    now: () => new Date(),
  };
}

export interface EmployeeGuidanceResult {
  kind: GuidanceGateKind;
  allowed: boolean;
  message: string;
  guidance?: EmployeeGuidanceOutput;
  containedUntrusted: string[];
  validationStatus: BoundaryValidationStatus;
  ledgerId: string;
}

export interface GenerateEmployeeGuidanceParams {
  workspaceId: string;
  taskId?: string | null;
  boundary: ApprovedExecutionBoundary | null | undefined;
  instruction: BoundaryInstruction;
  untrusted?: UntrustedInput[];
  /** Override the generator for this call (defaults to the deterministic one). */
  generator?: GuidanceGenerator;
}

/**
 * Generate employee guidance through the boundary gate, with a durable AI-ledger
 * record for every attempt. No guidance is returned unless validation PASSED AND
 * the ledger record was durably written.
 */
export async function generateEmployeeGuidance(
  params: GenerateEmployeeGuidanceParams,
  injected?: GuidanceDeps
): Promise<EmployeeGuidanceResult> {
  const deps = injected ?? (await resolveDefaultDeps(params.generator));
  const now = deps.now();

  const gate = gateEmployeeGuidance({
    boundary: params.boundary,
    instruction: params.instruction,
    untrusted: params.untrusted,
    now,
  });

  let guidance: EmployeeGuidanceOutput | undefined;
  let outputHash = "none";
  if (gate.allowed && params.boundary) {
    guidance = await deps.generator({
      boundary: params.boundary,
      instruction: params.instruction,
      containedUntrusted: gate.containedUntrusted,
    });
    outputHash = hashOutput(guidance);
  }

  // Durable AI-guidance ledger record (fail-closed: a throw here propagates and
  // the caller never shows guidance, because no durable record exists).
  const ledgerId = uuid();
  await deps.db.auditEvent.create({
    data: {
      id: ledgerId,
      workspaceId: params.workspaceId,
      eventName: gate.allowed
        ? AUDIT_EVENTS.EMPLOYEE_GUIDANCE_GENERATED
        : AUDIT_EVENTS.EMPLOYEE_GUIDANCE_BLOCKED,
      actorId: null,
      actorType: "system",
      entityType: "delegated_task",
      entityId: params.taskId ?? null,
      payload: {
        action: params.instruction.action,
        role: params.instruction.role,
        boundaryId: gate.validation.boundaryId,
        boundaryVersion: gate.validation.boundaryVersion,
        validationStatus: gate.validation.validationStatus,
        kind: gate.employeeVisible.kind,
        outputHash,
        untrustedCount: gate.containedUntrusted.length,
      },
      visibility: "internal",
      occurredAt: now,
    },
  });

  return {
    kind: gate.employeeVisible.kind,
    allowed: gate.allowed,
    message: gate.employeeVisible.message,
    guidance,
    containedUntrusted: gate.containedUntrusted,
    validationStatus: gate.validation.validationStatus,
    ledgerId,
  };
}
