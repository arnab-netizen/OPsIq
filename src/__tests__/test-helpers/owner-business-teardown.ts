/**
 * Governed owner-business test teardown.
 *
 * The seven owner-mode verification tables (finance, cashflow, sales, operations,
 * sop, marketing, strategy) reference `owner_businesses(id)` and their action rows
 * with `ON DELETE RESTRICT` (migration 20260628210000_governed_verification_restrict).
 * That guard is intentional: a verification record — proof that an intervention was
 * checked before/after — must never be silently destroyed by deleting its parent
 * business. A bare `db.ownerBusiness.delete()` therefore (correctly) raises a foreign
 * key violation once any verification exists.
 *
 * Tests that record a verification must clean up deliberately: remove the governed
 * verification rows for the business first, then delete the business (whose remaining
 * children — snapshots/cycles/findings/actions — still cascade). This mirrors how a
 * real deliberate purge would proceed and keeps per-test isolation without weakening
 * the RESTRICT guard.
 *
 * Each test already scopes its data with a unique `randomUUID()` workspace and a fresh
 * business, so this teardown is per-business and cannot affect another test's records.
 */
import { db } from "@/lib/db";

/**
 * Remove a test business and its governed children in foreign-key-safe order.
 * Deletes the RESTRICT-protected verification rows for the business across all seven
 * owner-mode modules first, then deletes the business itself.
 */
export async function teardownOwnerBusiness(businessId: string): Promise<void> {
  const where = { where: { businessId } };

  // Governed records: must be removed explicitly before the parent business.
  // OwnerFinanceOutcomeSignal has a Restrict FK on verificationId — delete before the verification rows.
  await db.ownerFinanceOutcomeSignal.deleteMany(where);
  await db.ownerFinanceVerification.deleteMany(where);
  await db.ownerCashflowVerification.deleteMany(where);
  await db.ownerSalesVerification.deleteMany(where);
  await db.ownerOperationsVerification.deleteMany(where);
  await db.ownerSopVerification.deleteMany(where);
  await db.ownerMarketingVerification.deleteMany(where);
  await db.ownerStrategyVerification.deleteMany(where);

  // Remaining children (snapshots/cycles/findings/actions) cascade on this delete.
  await db.ownerBusiness.delete({ where: { id: businessId } });
}
