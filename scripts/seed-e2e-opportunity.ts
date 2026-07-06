/**
 * Seed a deterministic LIVE external opportunity into the E2E owner workspace so the owner-mode browser
 * journey can exercise the whole opportunity loop end to end: intake → operating layer → validation →
 * portfolio → recorded outcome → EXECUTION tasks. Run AFTER `scripts/seed-owner-scenarios.ts` (which creates
 * the loginable E2E owner + workspace + role).
 *
 * It submits ONE B2B towel-demand signal WITHOUT unit economics and WITHOUT past-work proof through the same
 * governed service the app uses (`submitExternalOpportunitySignal`), so the operating layer promotes it to a
 * real candidate and PASS 12's execution layer derives a COLLECT_COST_DATA + PREPARE_PROOF_PACK task. No
 * fabricated money; the signal is deterministic (fixed dedupe key) so re-seeding is idempotent.
 */
import { randomUUID } from "crypto";
import { E2E_OWNER, E2E_WORKSPACE_ID } from "../tests/browser/e2e-fixtures";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PrismaClient as PrismaClientType } from "../src/generated/prisma/client";
import { submitExternalOpportunitySignal, type IntakeDb, type IntakeDeps } from "../src/services/owner-mode/external-opportunity-intake.service";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set");

  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as PrismaClientType;

  const deps: IntakeDeps = { db: prisma as unknown as IntakeDb, uuid: () => randomUUID(), now: () => new Date() };

  const r = await submitExternalOpportunitySignal(
    {
      workspaceId: E2E_WORKSPACE_ID,
      actorId: E2E_OWNER.userId,
      actorRole: "owner",
      submission: {
        rawSignalType: "B2B_DEMAND_SIGNAL",
        rawDescription: "A local gym chain asked whether we can launder their towels every week",
        extractedBusinessNeed: "weekly gym towel laundering contract",
        targetCustomerSegment: "gyms",
        locationContext: "local",
        sourceQuality: "OWNER_OBSERVED",
        evidenceRefs: [],
        hasUnitEconomics: false,
        relevanceBand: "STRONG",
        cashExposureBand: "LOW",
        ownerWorkloadBand: "MEDIUM",
        dedupeKey: "e2e-gym-towel-b2b",
      },
    },
    deps,
  );

  console.log(`[seed-e2e-opportunity] submit ok=${r.ok}` + (r.ok ? ` classification=${r.classification} deduped=${r.deduped}` : ` reason=${r.reason}`));
  await pool.end();
  if (!r.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
