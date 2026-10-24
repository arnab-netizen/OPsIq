import type { Prisma } from "@/generated/prisma/client";
import { canAdmitSignup } from "@/domain/beta/admission";
import {
  readEffectiveSettings,
  PENDING_SIGNUPS_PER_SOURCE_LIMIT,
  countCapacityUsage,
  countPendingFromSource,
  hasSignupCapacity,
  type AdmissionMode,
} from "@/services/beta/platform-settings.service";

export class BetaCapExceededError extends Error {
  constructor(message = "Beta capacity has been reached. Please check back soon.") {
    super(message);
    this.name = "BetaCapExceededError";
  }
}

/** Too many unverified signups from one source address are still waiting for their verification link. */
export class BetaPendingFromSourceError extends BetaCapExceededError {
  constructor() {
    super("Several sign-ups from this connection are still waiting to be verified. Please open the link in your email, or try again later.");
    this.name = "BetaPendingFromSourceError";
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
 * Re-check capacity for a LATE verifier: an unverified signup whose pending hold lapsed no longer holds a slot, so
 * verifying must take one (under the same advisory lock as signup and admin changes). Not a mode check: accounts
 * that exist keep working while signups are CLOSED. Throws BetaCapExceededError when the beta is full.
 */
export async function reserveCapacityForLateVerification(tx: Prisma.TransactionClient): Promise<void> {
  try {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"public_beta_workspace_cap"}))`;
    const settings = await readEffectiveSettings(tx);
    const usage = await countCapacityUsage(tx);
    if (usage.consumed >= settings.capacityLimit) throw new BetaCapExceededError();
  } catch (error) {
    if (error instanceof BetaCapExceededError) throw error;
    throw new BetaCapUnavailableError(error);
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
  isInvited: boolean,
  sourceIp: string | null = null
): Promise<{ admissionMode: AdmissionMode }> {
  let mode: AdmissionMode;
  let hasCapacity: boolean;
  let sourceThrottled = false;
  try {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"public_beta_workspace_cap"}))`;
    const settings = await readEffectiveSettings(tx);
    // Verified accounts + unverified signups still inside their pending hold (see CAPACITY DEFINITION), so unverified
    // requests for addresses nobody owns can never fill the beta permanently; and a bound on how many of those one
    // source address may hold at once.
    const usage = await countCapacityUsage(tx);
    mode = settings.admissionMode;
    hasCapacity = hasSignupCapacity(usage, settings.capacityLimit);
    sourceThrottled = hasCapacity && (await countPendingFromSource(tx, sourceIp)) >= PENDING_SIGNUPS_PER_SOURCE_LIMIT;
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
  if (sourceThrottled) throw new BetaPendingFromSourceError();

  return { admissionMode: mode };
}
