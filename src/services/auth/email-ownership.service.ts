/**
 * Email-ownership-before-credential-trust primitives.
 *
 * The invariant these helpers exist to protect: until a mailbox has been
 * proven (a human redeemed the emailed verification link), NO secret chosen by
 * whoever typed the address may become a trusted login credential for it, and
 * no consent given by that unproven party is recorded as the account owner's.
 * The credential (and the policy acceptances) are created only after
 * ownership, from a one-time "setup" token that is handed back by the
 * verification redemption itself.
 *
 * Every function here takes the caller's transaction client: the callers own
 * the transaction boundary so claim + state change + token issue commit or
 * roll back together.
 */
import { createHash, randomBytes, randomUUID } from "crypto";
import type { Prisma } from "@/generated/prisma/client";
import { CURRENT_POLICY_VERSIONS } from "@/lib/beta";

/** One week — generous enough that a real user finds and reads the email, bounded so an unredeemed link doesn't linger. */
export const EMAIL_VERIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** One hour — the window in which a freshly proven owner chooses a password; a lost setup link is re-issued via forgot-password. */
export const SETUP_TOKEN_TTL_MS = 60 * 60 * 1000;

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function newOpaqueToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashToken(raw) };
}

/**
 * Serialises every credential-affecting transition for one user. Verification
 * redemption, setup/reset redemption and verification rotation all take this
 * row lock FIRST (before touching any token row), so they can neither
 * interleave inside a read-modify-write window nor deadlock on opposite
 * lock orders.
 */
export async function lockUserRow(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
}

/** Kills every still-unused verification link of a user (an old emailed link must not outlive a newer one or a redemption). */
export async function invalidateUnusedVerificationTokens(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date,
  exceptTokenId?: string
): Promise<number> {
  const result = await tx.emailVerificationToken.updateMany({
    where: { userId, usedAt: null, ...(exceptTokenId ? { id: { not: exceptTokenId } } : {}) },
    data: { usedAt: now },
  });
  return result.count;
}

/** Same for password-reset / setup tokens. */
export async function invalidateUnusedPasswordResetTokens(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date
): Promise<number> {
  const result = await tx.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: now },
  });
  return result.count;
}

/**
 * Issues a one-time, hashed, expiring password-setup token (the existing
 * PasswordResetToken model — a "setup" is a reset of a credential that does
 * not exist yet). Returns the RAW token; only its hash is persisted.
 */
export async function issueSetupToken(
  tx: Prisma.TransactionClient,
  userId: string,
  ipAddress: string | null
): Promise<string> {
  const { raw, hash } = newOpaqueToken();
  await tx.passwordResetToken.create({
    data: {
      id: randomUUID(),
      userId,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + SETUP_TOKEN_TTL_MS),
      ipAddress,
    },
  });
  return raw;
}

/**
 * Writes one PolicyAcceptance row per current policy for the (now proven)
 * owner. Callers invoke this only after the server has verified that all three
 * consents were explicitly `true`.
 */
export async function recordPolicyAcceptances(
  tx: Prisma.TransactionClient,
  userId: string,
  ipAddress: string | null
): Promise<void> {
  for (const policyType of Object.keys(CURRENT_POLICY_VERSIONS) as Array<keyof typeof CURRENT_POLICY_VERSIONS>) {
    await tx.policyAcceptance.create({
      data: {
        id: randomUUID(),
        userId,
        policyType,
        version: CURRENT_POLICY_VERSIONS[policyType],
        ipAddress,
      },
    });
  }
}

/** True while the account still has to prove its mailbox (open-beta signup not yet verified). */
export function isAwaitingEmailOwnership(user: {
  requiresEmailVerification: boolean;
  emailVerifiedAt: Date | null;
}): boolean {
  return user.requiresEmailVerification && !user.emailVerifiedAt;
}
