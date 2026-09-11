/**
 * GET /api/admin/d3-runtime-diagnostic
 *
 * TEMPORARY, SYSTEM_ADMIN-gated, read-only diagnostic endpoint for the D3 controlled-beta
 * launch-blocker runtime-vs-database forensics thread. It exists to answer exactly one question:
 * does the actual running Vercel function's own DB connection (the shared `db` singleton from
 * src/lib/db.ts — the same instance GET /api/owner/businesses uses, never a second client) see
 * the D3 mutation's correct state, and does calling the real listBusinesses() service in the same
 * process return what the raw counts say it should?
 *
 * MUST be removed once D3's root cause is conclusively identified and fixed — owner-authorized
 * cleanup, in the same closure sequence or an immediately-following PR. This is diagnostic
 * infrastructure, not a product feature, and must never remain merely because it is capability-gated.
 *
 * Returns ONLY: the deployed build's commit SHA, current_database()/current_schema(), a one-way
 * SHA-256 fingerprint of the DB host (never the host itself, never the connection string or any
 * credential), the caller's own canonically-verified workspaceId (never client input), aggregate
 * OwnerBusiness counts for that workspace, two specific already-known business records'
 * id/isFixtureBusiness/isActive (Trinity Services + one already-classified acceptance business —
 * both ids were already named in the owner-authorized D3 forensic report this endpoint closes,
 * not discovered by enumeration here), and the real listBusinesses() service's result count. No
 * arbitrary SQL interface, no record enumeration beyond the two named ids, no mutation.
 */
import { createHash } from "crypto";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { db } from "@/lib/db";
import { listBusinesses } from "@/services/founder-recovery/business.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Already-known, already-authorized business ids from the D3 forensic investigation (not secret
// — both were already named in the owner-authorized forensic report thread this endpoint exists
// to close). Fixed, not client-suppliable, so this can never become a general record-lookup tool.
const TRINITY_SERVICES_ID = "0d99e80e-dc3a-46c5-b0bf-23dd09f2ed8c";
const SAMPLE_ACCEPTANCE_BUSINESS_ID = "aae15e3f-1c94-439e-b7e5-e59bd68d9064";

/** One-way fingerprint of the configured DB host — proves/disproves "same host" without ever
 *  returning the host itself, the connection string, or any credential. */
function hashDatabaseHost(): string | null {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return createHash("sha256").update(parsed.hostname.toLowerCase()).digest("hex");
  } catch {
    return null;
  }
}

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    const dbIdentityRows = (await db.$queryRawUnsafe(
      "SELECT current_database() AS current_database, current_schema() AS current_schema"
    )) as Array<{ current_database: string; current_schema: string }>;
    const dbIdentity = dbIdentityRows[0];

    const [total, fixtureTrue, fixtureFalse, activeNonFixture, trinityServices, sampleAcceptanceBusiness, visibleBusinesses] =
      await Promise.all([
        db.ownerBusiness.count({ where: { workspaceId } }),
        db.ownerBusiness.count({ where: { workspaceId, isFixtureBusiness: true } }),
        db.ownerBusiness.count({ where: { workspaceId, isFixtureBusiness: false } }),
        db.ownerBusiness.count({ where: { workspaceId, isActive: true, isFixtureBusiness: false } }),
        db.ownerBusiness.findFirst({
          where: { id: TRINITY_SERVICES_ID, workspaceId },
          select: { id: true, isFixtureBusiness: true, isActive: true },
        }),
        db.ownerBusiness.findFirst({
          where: { id: SAMPLE_ACCEPTANCE_BUSINESS_ID, workspaceId },
          select: { id: true, isFixtureBusiness: true, isActive: true },
        }),
        listBusinesses(workspaceId),
      ]);

    return {
      buildCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown",
      currentDatabase: dbIdentity?.current_database ?? null,
      currentSchema: dbIdentity?.current_schema ?? null,
      databaseHostFingerprintSha256: hashDatabaseHost(),
      workspaceId,
      ownerBusiness: {
        total,
        fixtureTrue,
        fixtureFalse,
        activeNonFixture,
      },
      trinityServices,
      sampleAcceptanceBusiness,
      listBusinessesCount: visibleBusinesses.length,
    };
  },
  { requireCapabilities: [CAPABILITIES.SYSTEM_ADMIN], requireWorkspace: true }
);
