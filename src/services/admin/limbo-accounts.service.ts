/**
 * Read-only operator aggregate: beta accounts whose mailbox is proven but which have no password yet (the owner clicked
 * "Verify my email" and never finished choosing a password, typically a lost or expired setup link). A single COUNT:
 * no rows, emails or tokens are read, and capacity accounting is unchanged (these accounts already count as verified).
 */
import { db } from "@/lib/db";
import { PUBLIC_BETA_SIGNUP_SOURCE, CONTROLLED_BETA_SIGNUP_SOURCE } from "@/lib/beta";

export async function countVerifiedWithoutPassword(): Promise<number> {
  return db.user.count({
    where: {
      isActive: true,
      requiresEmailVerification: true,
      emailVerifiedAt: { not: null },
      hashedPassword: null,
      workspaceMemberships: { some: { workspace: { signupSource: { in: [PUBLIC_BETA_SIGNUP_SOURCE, CONTROLLED_BETA_SIGNUP_SOURCE] } } } },
    },
  });
}
