/**
 * GET /api/admin/d3-runtime-diagnostic
 *
 * TEMPORARY, read-only diagnostic endpoint for the D3 controlled-beta launch-blocker
 * runtime-vs-database forensics thread. It exists to answer exactly one question: does the
 * actual running Vercel function's own DB connection (the shared `db` singleton from
 * src/lib/db.ts — the same instance GET /api/owner/businesses uses, never a second client) see
 * the D3 mutation's correct state, and does calling the real listBusinesses() service in the same
 * process return what the raw counts say it should?
 *
 * MUST be removed once D3's root cause is conclusively identified and fixed — owner-authorized
 * cleanup, in the same closure sequence or an immediately-following PR. This is diagnostic
 * infrastructure, not a product feature, and must never remain merely because it is gated.
 *
 * Returns ONLY: the deployed build's commit SHA, current_database()/current_schema(), a one-way
 * SHA-256 fingerprint of the DB host (never the host itself, never the connection string or any
 * credential), the resolved workspaceId (never client input), aggregate OwnerBusiness counts for
 * that workspace, two specific already-known business records' id/isFixtureBusiness/isActive
 * (Trinity Services + one already-classified acceptance business — both ids were already named in
 * the owner-authorized D3 forensic report this endpoint closes, not discovered by enumeration
 * here), and the real listBusinesses() service's result count. No arbitrary SQL interface, no
 * record enumeration beyond the two named ids, no mutation.
 *
 * AUTHORIZATION — two independent paths, either sufficient on its own:
 *   Path A: an authenticated session with the SYSTEM_ADMIN capability, via the existing
 *           withCanonicalEnforcement pipeline. Workspace is ALWAYS ctx.verifiedWorkspaceId —
 *           the caller's own canonical-auth-derived workspace, exactly as before this change.
 *   Path B: a valid OPSIQ_DIAGNOSTIC_KEY in the `x-opsiq-diagnostic-key` header, verified with
 *           the repository's existing timing-safe verifyDiagnosticKeyFromRequest() — the same
 *           mechanism every other `/api/internal/*` diagnostic route already uses. This path has
 *           no canonical authenticated session and therefore no canonical workspace to derive
 *           from, so it is fixed to exactly the one D3 forensics workspace this endpoint exists
 *           to diagnose (D3_FIXED_WORKSPACE_ID below) — never client-suppliable, never an
 *           arbitrary workspace. It does not grant SYSTEM_ADMIN, create a session, or touch
 *           ordinary owner authorization in any way; it only unlocks this one temporary route.
 *
 * A missing/invalid diagnostic key is never distinguished from "no key sent at all" — the request
 * simply falls through to Path A's existing auth check, which fails closed (401/403) exactly as
 * it did before this change. Path A's behavior is completely unmodified and unregressed.
 */
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { db } from "@/lib/db";
import { listBusinesses } from "@/services/founder-recovery/business.service";
import { verifyDiagnosticKeyFromRequest } from "@/lib/security/diagnostic-key";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Already-known, already-authorized business ids from the D3 forensic investigation (not secret
// — both were already named in the owner-authorized forensic report thread this endpoint exists
// to close). Fixed, not client-suppliable, so this can never become a general record-lookup tool.
const TRINITY_SERVICES_ID = "0d99e80e-dc3a-46c5-b0bf-23dd09f2ed8c";
const SAMPLE_ACCEPTANCE_BUSINESS_ID = "aae15e3f-1c94-439e-b7e5-e59bd68d9064";

// Path B (diagnostic-key) has no canonical session to derive a workspace from. Fixed to exactly
// the one workspace this endpoint's entire mission is scoped to — never accepted from a query
// string, header, or body, so the key can never be used to enumerate or probe other workspaces.
const D3_FIXED_WORKSPACE_ID = "d0609f28-dbbd-4a29-a5d2-fd74a7bb4ce5";

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

/** Shared response body for both authorization paths — identical shape, identical queries,
 *  differing only in which workspaceId is passed in. */
async function buildDiagnosticResult(workspaceId: string) {
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
}

// Path A: unmodified from PR #444 — SYSTEM_ADMIN-gated, workspace always canonical-auth-derived.
const systemAdminHandler = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => buildDiagnosticResult(ctx.verifiedWorkspaceId),
  { requireCapabilities: [CAPABILITIES.SYSTEM_ADMIN], requireWorkspace: true }
);

export async function GET(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> }
): Promise<NextResponse> {
  // Path B: valid diagnostic key, fixed workspace, no session required. Checked first because it
  // has no session to evaluate; an invalid/missing key falls straight through to Path A's
  // existing, unmodified auth check rather than returning a distinct "key rejected" response —
  // this never reveals anything about whether a submitted key was present, correct length, or
  // close to correct.
  if (verifyDiagnosticKeyFromRequest(req)) {
    const body = await buildDiagnosticResult(D3_FIXED_WORKSPACE_ID);
    return NextResponse.json(body, { status: 200 });
  }

  return systemAdminHandler(req, context);
}
