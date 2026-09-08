/**
 * P0-A — DRY RUN ONLY. Reports which pre-existing "OPSIQ Acceptance ..." /
 * "OPSIQ Production Acceptance ..." OwnerBusiness rows WOULD be classified as historical
 * acceptance fixtures under the deterministic, fail-closed rule in
 * src/domain/founder-recovery/legacy-fixture-classification.ts — and, separately, which rows
 * match the acceptance naming convention but cannot be confirmed by actor identity and are
 * therefore left ambiguous.
 *
 * This script performs ONLY read (`findMany`) queries. It contains no `.update`, `.create`, or
 * `.delete` call anywhere — there is no code path in this file that can mutate a single row.
 * Reclassifying the confident candidates it reports is a deliberate, separate, explicitly
 * authorized action outside this script's scope (see ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md,
 * "Historical rows still in production").
 *
 * Usage:
 *   DATABASE_URL=... PRODUCTION_ACCEPTANCE_EMAIL=qa@example.com \
 *     npx tsx scripts/dry-run-legacy-fixture-classification.ts [--json]
 *
 * PRODUCTION_ACCEPTANCE_EMAIL (and optionally a comma-separated
 * LEGACY_FIXTURE_KNOWN_ACTOR_EMAILS for any other historical QA accounts) supplies the actor
 * signal. Without at least one known email configured, every name-matching row is reported as
 * ambiguous — never silently treated as confident — matching the classifier's own fail-closed
 * behavior with an empty allowlist.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- ad-hoc Prisma client wiring matches the
   existing pattern in scripts/seed-trust-journey-repro.ts for direct-DB, non-app scripts */
import {
  classifyLegacyFixtureCandidates,
  type LegacyBusinessCandidateInput,
} from "../src/domain/founder-recovery/legacy-fixture-classification";

function knownAcceptanceActorEmails(): string[] {
  const emails = new Set<string>();
  if (process.env.PRODUCTION_ACCEPTANCE_EMAIL) emails.add(process.env.PRODUCTION_ACCEPTANCE_EMAIL);
  for (const e of (process.env.LEGACY_FIXTURE_KNOWN_ACTOR_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    emails.add(e);
  }
  return [...emails];
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set — refusing to run without an explicit target.");

  const asJson = process.argv.includes("--json");
  const knownEmails = knownAcceptanceActorEmails();
  if (knownEmails.length === 0) {
    console.error(
      "⚠️  No known acceptance actor email configured (PRODUCTION_ACCEPTANCE_EMAIL / " +
        "LEGACY_FIXTURE_KNOWN_ACTOR_EMAILS). Every acceptance-named row will be reported as " +
        "ambiguous — this is the classifier's fail-closed behavior, not an error, but the report " +
        "will not identify any confident candidate until a real actor email is supplied."
    );
  }

  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma: any = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    // Broad, cheap prefilter at the DB level (case-sensitive OR of the two known prefixes); the
    // real, case-insensitive, anchored name check happens in classifyLegacyFixtureCandidates
    // itself, so this prefilter only needs to be broad enough not to miss a real match.
    const candidates = await prisma.ownerBusiness.findMany({
      where: {
        isFixtureBusiness: false,
        OR: [
          { name: { startsWith: "OPSIQ Acceptance" } },
          { name: { startsWith: "OPSIQ Production Acceptance" } },
          { name: { startsWith: "opsiq acceptance", mode: "insensitive" } },
          { name: { startsWith: "opsiq production acceptance", mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, isFixtureBusiness: true, createdBy: true, workspaceId: true },
    });

    const creatorIds = [...new Set(candidates.map((c: any) => c.createdBy).filter(Boolean))] as string[];
    const creators =
      creatorIds.length > 0
        ? await prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, email: true } })
        : [];
    const emailByUserId = new Map<string, string>(creators.map((u: any) => [u.id, u.email]));

    const inputs: LegacyBusinessCandidateInput[] = candidates.map((c: any) => ({
      id: c.id,
      name: c.name,
      isFixtureBusiness: c.isFixtureBusiness,
      createdByEmail: c.createdBy ? (emailByUserId.get(c.createdBy) ?? null) : null,
    }));

    const result = classifyLegacyFixtureCandidates(inputs, knownEmails);
    const byId = new Map<string, any>(candidates.map((c: any) => [c.id, c]));

    const report = {
      EXISTING_FIXTURE_CLASSIFICATION_METHOD:
        "name pattern (^OPSIQ (Production )?Acceptance) AND createdBy actor email in known acceptance accounts — both signals required for a confident candidate",
      EXISTING_FIXTURE_DRY_RUN_COUNT: result.confidentFixtureIds.length,
      AMBIGUOUS_ROW_COUNT: result.ambiguousIds.length,
      PRODUCTION_MUTATION_REQUIRED: "NO — this script performed zero writes",
      PRODUCTION_DATA_MUTATIONS: 0,
      confident: result.confidentFixtureIds.map((id) => ({
        id,
        name: byId.get(id)?.name,
        workspaceId: byId.get(id)?.workspaceId,
      })),
      ambiguous: result.ambiguousIds.map((id) => ({
        id,
        name: byId.get(id)?.name,
        workspaceId: byId.get(id)?.workspaceId,
      })),
    };

    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log("");
      console.log("=== Legacy acceptance-fixture classification (DRY RUN — no writes performed) ===");
      console.log(`Confident candidates: ${report.EXISTING_FIXTURE_DRY_RUN_COUNT}`);
      console.log(`Ambiguous rows (left untouched, need manual review): ${report.AMBIGUOUS_ROW_COUNT}`);
      console.log("");
      if (report.confident.length > 0) {
        console.log("Confident (name + known actor email both match):");
        for (const row of report.confident) console.log(`  ${row.id}  ${row.name}`);
      }
      if (report.ambiguous.length > 0) {
        console.log("Ambiguous (name matches, actor unconfirmed — NOT proposed for reclassification):");
        for (const row of report.ambiguous) console.log(`  ${row.id}  ${row.name}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
