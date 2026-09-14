/**
 * Governed, one-time bootstrap of the PlatformSetting singleton — Stage 3
 * "SAFE BOOTSTRAP ACTION".
 *
 * Critical correction this implements: the bootstrap does NOT silently copy
 * hidden runtime values into the database. It is a two-step, human-confirmed
 * flow:
 *   1. `previewPlatformSettingsBootstrap()` — read-only. Computes and RETURNS
 *      the exact values that WOULD be captured (the live-resolved legacy
 *      admission mode + capacity), without writing anything, so an operator
 *      can see them before confirming.
 *   2. `confirmPlatformSettingsBootstrap(actorId)` — writes the singleton row
 *      transactionally, using the SAME legacy-mapping function the preview
 *      used, and audits the captured values. Idempotent: if the row already
 *      exists (written by a prior confirm, including one racing
 *      concurrently), this returns that existing row rather than
 *      overwriting it — the singleton's own primary key is the race-safety
 *      mechanism (a duplicate INSERT is rejected by Postgres itself, no
 *      separate lock needed for a single-row create).
 *
 * Never runs automatically during migration/deploy — see the migration's own
 * doc comment (creates zero rows) and platform-settings.service.ts's module
 * doc for the full cutover contract (Phases A-E).
 */
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ValidationError } from "@/infra/errors";
import { PUBLIC_BETA_SIGNUP_SOURCE, CONTROLLED_BETA_SIGNUP_SOURCE } from "@/lib/beta";
import { legacyEffectiveSettings, type AdmissionMode } from "@/services/beta/platform-settings.service";

/**
 * QA/acceptance-workspace contamination detection (Stage 3 §9).
 *
 * Deliberately NOT a hardcoded email in this file: the one identity this can
 * reliably check — the shared production acceptance/QA account — is only
 * known via `PRODUCTION_ACCEPTANCE_EMAIL`, the SAME governed environment
 * variable `tests/production/helpers/production-auth.ts` already uses to
 * authenticate as that account. Reading an env var here is configuration,
 * not embedding a person's real identity as a business rule. When the var is
 * unset (the default everywhere except wherever that acceptance account is
 * actually configured), this check is a no-op — no identity is assumed or
 * guessed, and nothing here does name-pattern matching on real customers
 * (explicitly rejected as unsafe by ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md).
 */
async function detectQaContamination(): Promise<{ detected: boolean; count: number }> {
  const knownAcceptanceEmail = process.env.PRODUCTION_ACCEPTANCE_EMAIL;
  if (!knownAcceptanceEmail) return { detected: false, count: 0 };

  const count = await db.workspace.count({
    where: {
      signupSource: { in: [PUBLIC_BETA_SIGNUP_SOURCE, CONTROLLED_BETA_SIGNUP_SOURCE] },
      workspaceMemberships: {
        some: { role: "owner", user: { email: knownAcceptanceEmail } },
      },
    },
  });
  return { detected: count > 0, count };
}

export interface BootstrapPreview {
  admissionMode: AdmissionMode;
  capacityLimit: number;
  /** True if a PlatformSetting row already exists — confirming would be a no-op, not a fresh capture. */
  alreadyInitialized: boolean;
  /**
   * True when a known non-customer (QA/acceptance) workspace is tagged with
   * a real external signupSource and would be counted toward capacity. Never
   * names the identity — see detectQaContamination's doc comment. Confirming
   * bootstrap while this is true is refused unless explicitly acknowledged.
   */
  qaContaminationDetected: boolean;
}

export interface BootstrapResult {
  admissionMode: AdmissionMode;
  capacityLimit: number;
  /** True only if THIS call created the row; false if it already existed (idempotent no-op, including a losing race). */
  created: boolean;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: string }).code === "P2002";
}

/** Read-only. Never writes. Shows exactly what confirmPlatformSettingsBootstrap would capture. */
export async function previewPlatformSettingsBootstrap(): Promise<BootstrapPreview> {
  const contamination = await detectQaContamination();
  const existing = await db.platformSetting.findUnique({ where: { id: "global" } });
  if (existing) {
    return {
      admissionMode: existing.admissionMode as AdmissionMode,
      capacityLimit: existing.capacityLimit,
      alreadyInitialized: true,
      qaContaminationDetected: contamination.detected,
    };
  }
  const legacy = legacyEffectiveSettings();
  return {
    admissionMode: legacy.admissionMode,
    capacityLimit: legacy.capacityLimit,
    alreadyInitialized: false,
    qaContaminationDetected: contamination.detected,
  };
}

/**
 * Writes the singleton row ONLY if it does not already exist, capturing the
 * exact live-resolved legacy values (the same computation the preview step
 * just showed the operator) — never a value chosen by this function, never
 * a hardcoded default. Audits the captured values so the bootstrap's inputs
 * are part of the permanent record.
 *
 * Refuses (ValidationError) if QA/acceptance contamination is detected
 * (see detectQaContamination) unless the caller explicitly acknowledges it
 * via `acknowledgeQaContamination: true` — this mission ships the detection
 * and the readiness gate, not a production data fix; the acknowledgement is
 * a deliberate, logged override, not a silent bypass (it is included in the
 * audit payload).
 */
export async function confirmPlatformSettingsBootstrap(
  actorId: string,
  opts: { acknowledgeQaContamination?: boolean } = {}
): Promise<BootstrapResult> {
  const contamination = await detectQaContamination();
  if (contamination.detected && !opts.acknowledgeQaContamination) {
    throw new ValidationError(
      `A known non-customer (QA/acceptance) workspace is tagged with a real beta signup source (${contamination.count} row(s)) and would be counted toward capacity. Resolve or explicitly acknowledge before initializing.`
    );
  }

  const legacy = legacyEffectiveSettings();
  try {
    return await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.platformSetting.create({
        data: {
          id: "global",
          admissionMode: legacy.admissionMode,
          capacityLimit: legacy.capacityLimit,
          updatedBy: actorId,
          version: 0,
        },
      });
      await emitAuditEvent(
        {
          eventName: AUDIT_EVENTS.PLATFORM_SETTINGS_INITIALIZED,
          actorId,
          actorType: "user",
          entityType: "platform_setting",
          entityId: "global",
          payload: {
            capturedAdmissionMode: created.admissionMode,
            capturedCapacityLimit: created.capacityLimit,
            qaContaminationAcknowledged: contamination.detected ? true : undefined,
          },
          visibility: "internal",
        },
        tx
      );
      return {
        admissionMode: created.admissionMode as AdmissionMode,
        capacityLimit: created.capacityLimit,
        created: true,
      };
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      // Idempotent: the row already existed (a prior confirm, possibly a
      // concurrently-racing one that won) — never overwrite it.
      const existing = await db.platformSetting.findUniqueOrThrow({ where: { id: "global" } });
      return {
        admissionMode: existing.admissionMode as AdmissionMode,
        capacityLimit: existing.capacityLimit,
        created: false,
      };
    }
    throw error;
  }
}
