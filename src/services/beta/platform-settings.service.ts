/**
 * Administration V1 — beta admission mode + capacity, governed cutover.
 *
 * SOURCE OF TRUTH CONTRACT (see PlatformSetting's schema doc comment and the
 * approved design):
 *   - The migration that introduces `platform_settings` creates ZERO rows.
 *   - Until a human runs the capability-gated bootstrap action (see
 *     `src/services/beta/platform-settings-bootstrap.service.ts`), every read
 *     here falls back to the exact pre-existing legacy behavior
 *     (PUBLIC_BETA_ENABLED / PUBLIC_BETA_WORKSPACE_CAP) — byte-identical, not
 *     an approximation.
 *   - Once the singleton row exists, it is unconditionally authoritative.
 *     Legacy env vars are never consulted again by this module.
 *   - Any read error (DB unreachable, malformed row) is NEVER treated as
 *     "unlimited" or "any mode" — it propagates as
 *     `PlatformSettingsUnavailableError`, and every caller in this codebase
 *     that reaches this function treats that as a reason to refuse the
 *     operation in progress (fail closed).
 *
 * CAPACITY LOCKING CONTRACT: both signup admission (reservePublicBetaCapacity
 * in beta-cap.ts) and admin capacity/mode updates (`updatePlatformSettings`
 * below) acquire the IDENTICAL Postgres advisory transaction lock
 * (`pg_advisory_xact_lock(hashtext('public_beta_workspace_cap'))`) BEFORE
 * reading utilization or capacity, and hold it for the lifetime of their
 * transaction. Because advisory locks serialize every acquirer of the same
 * key regardless of which function is asking, signup-vs-signup,
 * signup-vs-capacity-change, and capacity-change-vs-capacity-change are all
 * serialized against each other by this single mechanism — proven by the
 * real-DB concurrency tests in
 * `src/__tests__/services/beta/platform-capacity-locking.db.test.ts`.
 */
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ValidationError, OptimisticLockError } from "@/infra/errors";
import { isPublicBetaEnabled, PUBLIC_BETA_WORKSPACE_CAP, PUBLIC_BETA_SIGNUP_SOURCE, CONTROLLED_BETA_SIGNUP_SOURCE } from "@/lib/beta";

export const ADMISSION_MODES = ["CLOSED", "WAITLIST", "INVITE_ONLY", "OPEN_BETA"] as const;
export type AdmissionMode = (typeof ADMISSION_MODES)[number];

export function isAdmissionMode(value: unknown): value is AdmissionMode {
  return typeof value === "string" && (ADMISSION_MODES as readonly string[]).includes(value);
}

/**
 * ABSOLUTE EMERGENCY CEILING — a hardcoded safety policy, NOT data-derived.
 *
 * WHY THIS NUMBER: this is a conservative engineering safety bound, chosen
 * because no evidence in this codebase supports a specific "right" number for
 * a controlled/open beta's eventual scale. 1,000 is small enough that
 * reaching it would represent a 20x jump over the current default capacity
 * (50) — implausible via normal, one-owner-driven operator changes, so it
 * functions as a backstop against a fat-fingered or compromised settings
 * write (e.g. an operator typing an extra zero) rather than a plan for how
 * large the beta program should ever get.
 *
 * WHAT IT PROTECTS AGAINST: unbounded signup-cost / abuse exposure (each
 * admitted workspace has real infrastructure and operator-attention cost) if
 * a single bad capacity write went unnoticed.
 *
 * THIS IS NOT THE NORMAL BETA LIMIT. The normal, expected operating capacity
 * is set via `updatePlatformSettings` and is expected to stay far below this
 * ceiling for the foreseeable life of the controlled/open beta program.
 *
 * Changing this ceiling requires a code review and deploy — it is
 * intentionally NOT configurable via the database or any runtime setting, so
 * no admin action (even a malicious or mistaken one) can raise it.
 */
export const ADMIN_CAPACITY_ABSOLUTE_CEILING = 1000;

export class PlatformSettingsUnavailableError extends Error {
  constructor(cause: unknown) {
    super("Platform settings could not be verified.");
    this.name = "PlatformSettingsUnavailableError";
    this.cause = cause;
  }
}

export interface EffectiveSettings {
  admissionMode: AdmissionMode;
  capacityLimit: number;
  /** "database" once the bootstrap row exists; "legacy" while falling back to env vars (Phase A/B only). */
  source: "database" | "legacy";
}

type SettingsClient = Pick<Prisma.TransactionClient, "platformSetting" | "workspace">;

/** Legacy-behavior mapping: byte-identical to pre-Administration-V1 signup gating. Exported for the bootstrap action's preview step. */
export function legacyEffectiveSettings(): EffectiveSettings {
  return {
    admissionMode: isPublicBetaEnabled() ? "OPEN_BETA" : "INVITE_ONLY",
    capacityLimit: PUBLIC_BETA_WORKSPACE_CAP,
    source: "legacy",
  };
}

/**
 * Read the effective admission mode + capacity. Fails closed: any error
 * reading the settings row propagates as PlatformSettingsUnavailableError —
 * never silently treated as unlimited/any-mode. Accepts a transaction client
 * so callers holding the advisory lock (see module doc) can read inside it;
 * defaults to the plain `db` client for read-only, unlocked callers
 * (diagnostics, the Overview page) where the shared lock is not needed.
 */
export async function readEffectiveSettings(client: SettingsClient = db): Promise<EffectiveSettings> {
  let row: { admissionMode: string; capacityLimit: number; version: number } | null;
  try {
    row = await client.platformSetting.findUnique({ where: { id: "global" } });
  } catch (error) {
    throw new PlatformSettingsUnavailableError(error);
  }
  if (!row) return legacyEffectiveSettings();
  if (!isAdmissionMode(row.admissionMode)) {
    // Defensive: a malformed row is a data-integrity problem, not a signal to
    // silently reopen or silently close admission — fail closed.
    throw new PlatformSettingsUnavailableError(
      new Error(`platform_settings row has invalid admission_mode: ${row.admissionMode}`)
    );
  }
  return { admissionMode: row.admissionMode, capacityLimit: row.capacityLimit, source: "database" };
}

/**
 * Count of external beta workspaces — the admissions/cohort ledger, NOT a
 * live-usage gauge. Counts every workspace ever admitted via either real
 * external signup path (open-beta OR controlled-beta-invite), regardless of
 * whether that workspace is later suspended or disabled — temporary
 * suspension must never free a capacity slot (see CAPACITY_DEFINITION in the
 * approved design). Internal/owner and test/fixture workspaces are excluded
 * by construction: no creation path outside real signup ever sets
 * `signupSource` to either of these two values (verified by exhaustive
 * repo-wide search — see PR description).
 */
export async function countExternalBetaWorkspaces(client: SettingsClient = db): Promise<number> {
  return client.workspace.count({
    where: { signupSource: { in: [PUBLIC_BETA_SIGNUP_SOURCE, CONTROLLED_BETA_SIGNUP_SOURCE] } },
  });
}

async function acquireCapacityLock(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"public_beta_workspace_cap"}))`;
}

export interface UpdatePlatformSettingsInput {
  actorId: string;
  admissionMode?: AdmissionMode;
  capacityLimit?: number;
  reason?: string;
}

/**
 * Governed, race-safe, audited update of admission mode and/or capacity.
 * Acquires the SAME advisory lock signup uses (see module doc) before
 * reading current utilization or the current row, so this can never race
 * a concurrent signup or a concurrent admin update into an inconsistent
 * state. Refuses (ValidationError) rather than silently clamping:
 *   - a capacity below current utilization ("not below current usage" rule)
 *   - a capacity above ADMIN_CAPACITY_ABSOLUTE_CEILING
 * Requires the settings row to already exist (bootstrap must have run) —
 * this function never creates it, matching the governed-bootstrap contract.
 */
export async function updatePlatformSettings(input: UpdatePlatformSettingsInput): Promise<EffectiveSettings> {
  const { actorId, admissionMode, capacityLimit, reason } = input;
  if (admissionMode === undefined && capacityLimit === undefined) {
    throw new ValidationError("Nothing to update: provide admissionMode and/or capacityLimit.");
  }
  if (admissionMode !== undefined && !isAdmissionMode(admissionMode)) {
    throw new ValidationError(`Invalid admission mode: ${String(admissionMode)}`);
  }
  if (capacityLimit !== undefined) {
    if (!Number.isInteger(capacityLimit) || capacityLimit < 1) {
      throw new ValidationError("Capacity must be a positive integer.");
    }
    if (capacityLimit > ADMIN_CAPACITY_ABSOLUTE_CEILING) {
      throw new ValidationError(
        `Capacity ${capacityLimit} exceeds the absolute safety ceiling (${ADMIN_CAPACITY_ABSOLUTE_CEILING}).`
      );
    }
  }

  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await acquireCapacityLock(tx);

    const current = await tx.platformSetting.findUnique({ where: { id: "global" } });
    if (!current) {
      throw new ValidationError(
        "Platform settings have not been initialized. Run the bootstrap action first."
      );
    }

    if (capacityLimit !== undefined) {
      const utilization = await countExternalBetaWorkspaces(tx);
      if (capacityLimit < utilization) {
        throw new ValidationError(
          `Cannot set capacity to ${capacityLimit}: current usage is ${utilization}.`
        );
      }
    }

    const nextAdmissionMode = admissionMode ?? (current.admissionMode as AdmissionMode);
    const nextCapacityLimit = capacityLimit ?? current.capacityLimit;

    // updateMany + count check (this codebase's established optimistic-lock
    // idiom — see deactivateUser/employee-lifecycle's stateGuard) rather than
    // a plain update()'s throw-on-no-match, for one consistent, explicit
    // conflict signal across the codebase.
    const result = await tx.platformSetting.updateMany({
      where: { id: "global", version: current.version },
      data: {
        admissionMode: nextAdmissionMode,
        capacityLimit: nextCapacityLimit,
        updatedBy: actorId,
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      throw new OptimisticLockError("platform_setting", "global");
    }
    const updated = await tx.platformSetting.findUniqueOrThrow({ where: { id: "global" } });

    if (admissionMode !== undefined && admissionMode !== current.admissionMode) {
      await emitAuditEvent(
        {
          eventName: AUDIT_EVENTS.PLATFORM_ADMISSION_MODE_CHANGED,
          actorId,
          actorType: "user",
          entityType: "platform_setting",
          entityId: "global",
          payload: { oldValue: current.admissionMode, newValue: admissionMode, reason: reason ?? null },
          visibility: "internal",
        },
        tx
      );
    }
    if (capacityLimit !== undefined && capacityLimit !== current.capacityLimit) {
      await emitAuditEvent(
        {
          eventName: AUDIT_EVENTS.PLATFORM_CAPACITY_CHANGED,
          actorId,
          actorType: "user",
          entityType: "platform_setting",
          entityId: "global",
          payload: { oldValue: current.capacityLimit, newValue: capacityLimit, reason: reason ?? null },
          visibility: "internal",
        },
        tx
      );
    }

    return {
      admissionMode: updated.admissionMode as AdmissionMode,
      capacityLimit: updated.capacityLimit,
      source: "database" as const,
    };
  });

  if (capacityLimit !== undefined) {
    // Outside the transaction, after commit — re-evaluates the alert tier
    // against the just-committed limit (a decrease can reset the tier down;
    // an increase can cross it again). Dynamic import avoids a circular
    // static import (capacity-alerts.service.ts imports FROM this module).
    // Never throws (see checkAndSendCapacityAlert's own doc).
    const { checkAndSendCapacityAlert } = await import("@/services/beta/capacity-alerts.service");
    await checkAndSendCapacityAlert();
  }

  return result;
}
