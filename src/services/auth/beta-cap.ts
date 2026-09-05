import type { Prisma } from "@/generated/prisma/client";
import { PUBLIC_BETA_SIGNUP_SOURCE, PUBLIC_BETA_WORKSPACE_CAP } from "@/lib/beta";

export class BetaCapExceededError extends Error {
  constructor() {
    super("Open beta capacity has been reached. Please check back soon.");
    this.name = "BetaCapExceededError";
  }
}

export class BetaCapUnavailableError extends Error {
  constructor(cause: unknown) {
    super("Open beta capacity could not be verified.");
    this.name = "BetaCapUnavailableError";
    this.cause = cause;
  }
}

/**
 * Race-safe check-and-reserve for the public-beta workspace cap.
 *
 * MUST be called inside the same transaction that creates the new beta
 * workspace, and the Workspace row (with signupSource = PUBLIC_BETA_SIGNUP_SOURCE)
 * must be created strictly after this resolves without throwing — this
 * function only proves "there is room right now under this lock"; it does not
 * itself reserve a slot.
 *
 * Race safety: a plain `COUNT(*)` is not race-safe under concurrent
 * transactions — two concurrent signups can both observe `count = cap - 1`
 * and both proceed, exceeding the cap by however many races happen
 * simultaneously. Postgres also has no `SELECT count(*) ... FOR UPDATE`
 * (aggregates cannot be locked). Instead this takes a transaction-scoped
 * Postgres advisory lock (`pg_advisory_xact_lock`, automatically released on
 * commit OR rollback — never leaked, never needs manual unlock) keyed on a
 * fixed constant, so every concurrent signup transaction serializes on this
 * one lock before it is allowed to read the count. No in-memory counter is
 * used anywhere in this path — the lock and the count are both server-side,
 * durable, and correct across every serverless instance.
 *
 * Fails closed: any error acquiring the lock or evaluating the count is
 * treated as "the cap cannot be evaluated," which refuses the signup exactly
 * as if the cap were reached. An unverifiable cap is never permission to
 * bypass it.
 */
export async function reservePublicBetaCapacity(tx: Prisma.TransactionClient): Promise<void> {
  let currentCount: number;
  try {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"public_beta_workspace_cap"}))`;
    const rows = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM workspaces WHERE signup_source = ${PUBLIC_BETA_SIGNUP_SOURCE}
    `;
    currentCount = Number(rows[0]?.count ?? BigInt(0));
  } catch (error) {
    throw new BetaCapUnavailableError(error);
  }

  if (currentCount >= PUBLIC_BETA_WORKSPACE_CAP) {
    throw new BetaCapExceededError();
  }
}
