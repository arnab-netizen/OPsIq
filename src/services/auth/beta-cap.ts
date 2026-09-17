import type { Prisma } from "@/generated/prisma/client";
import { canAdmitSignup } from "@/domain/beta/admission";
import {
  readEffectiveSettings,
  countExternalBetaWorkspaces,
  type AdmissionMode,
} from "@/services/beta/platform-settings.service";

export class BetaCapExceededError extends Error {
  constructor() {
    super("Beta capacity has been reached. Please check back soon.");
    this.name = "BetaCapExceededError";
  }
}

export class BetaCapUnavailableError extends Error {
  constructor(cause: unknown) {
    super("Beta capacity could not be verified.");
    this.name = "BetaCapUnavailableError";
    this.cause = cause;
  }
}

/** Thrown for a mode-based refusal (CLOSED, WAITLIST, or INVITE_ONLY without a valid invite) — distinct from a capacity-based refusal. */
export class BetaAdmissionRefusedError extends Error {
  readonly reason: "admission_closed" | "admission_waitlist" | "not_invited";
  constructor(reason: "admission_closed" | "admission_waitlist" | "not_invited") {
    super(
      reason === "not_invited"
        ? "This email has not been invited to the beta."
        : "Registration is not currently open."
    );
    this.name = "BetaAdmissionRefusedError";
    this.reason = reason;
  }
}

/**
 * Race-safe check-and-reserve for external beta signup admission (mode +
 * capacity together). MUST be called inside the same transaction that
 * creates the new beta workspace, and the Workspace row (tagged with the
 * correct signupSource for whichever path admitted it) must be created
 * strictly after this resolves without throwing — this function only proves
 * "admission is allowed right now under this lock"; it does not itself
 * reserve a slot.
 *
 * Race safety: both the settings read and the utilization count happen AFTER
 * acquiring a transaction-scoped Postgres advisory lock
 * (`pg_advisory_xact_lock`, auto-released on commit OR rollback), keyed on a
 * fixed constant shared with `updatePlatformSettings` (admin capacity/mode
 * changes) — every concurrent acquirer of this key, signup or admin update,
 * serializes on it, so no torn read of capacity/mode is possible. A plain
 * `COUNT(*)` is not race-safe on its own (two concurrent transactions could
 * both observe `count = cap - 1`); the lock is what makes it safe.
 *
 * Fails closed: any error acquiring the lock, reading settings, or
 * evaluating the count is treated as "admission cannot be evaluated," which
 * refuses the signup exactly as if the cap were reached. An unverifiable
 * settings/cap state is never permission to bypass it.
 */
export async function reservePublicBetaCapacity(
  tx: Prisma.TransactionClient,
  isInvited: boolean
): Promise<{ admissionMode: AdmissionMode }> {
  let mode: AdmissionMode;
  let hasCapacity: boolean;
  try {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"public_beta_workspace_cap"}))`;
    const settings = await readEffectiveSettings(tx);
    const count = await countExternalBetaWorkspaces(tx);
    mode = settings.admissionMode;
    hasCapacity = count < settings.capacityLimit;
  } catch (error) {
    // Covers PlatformSettingsUnavailableError and any lock/query failure alike — fail closed.
    throw new BetaCapUnavailableError(error);
  }

  const admitted = canAdmitSignup(mode, isInvited, hasCapacity);
  if (!admitted) {
    if (mode === "CLOSED") throw new BetaAdmissionRefusedError("admission_closed");
    if (mode === "WAITLIST") throw new BetaAdmissionRefusedError("admission_waitlist");
    if (mode === "INVITE_ONLY" && !isInvited) throw new BetaAdmissionRefusedError("not_invited");
    throw new BetaCapExceededError();
  }

  return { admissionMode: mode };
}
