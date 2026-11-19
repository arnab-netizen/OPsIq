/**
 * Quota-race worker: an independent OS process that runs ONE real quota-limited service operation with its
 * OWN Prisma client and its OWN pg connection (src/lib/db.ts gives every process a pool of max 1, so
 * in-process Promise.all never puts two of these operations on two database sessions at once). It is
 * never imported by tests; it is spawned through tsx by ./quota-workers.ts.
 *
 * Protocol (line-oriented, stdout):
 *   1. argv[2] is a JSON QuotaWorkerJob.
 *   2. The worker connects, then prints `QUOTA_WORKER_READY`.
 *   3. It blocks until the parent writes `GO\n` on stdin (a start barrier shared by all workers, so their
 *      limit checks genuinely overlap in time on independent connections).
 *   4. It runs the operation, prints `QUOTA_WORKER_RESULT <json QuotaWorkerOutcome>` and exits 0. A failing
 *      operation is reported as an outcome, never swallowed.
 */
import { getDbInstance } from "@/lib/db";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { createRecommendation } from "@/services/recommendation";
import { createEngagement } from "@/services/engagement";
import { createAction } from "@/services/action";
import { runConsultingPipeline } from "@/services/consulting-engine/pipeline";
import {
  createDecision,
  persistDecisionItemWithinQuota,
  addDecisionItemsWithinQuota,
} from "@/services/decisions/decision-creation-service";
import { buildIntakeOperatorItemData } from "@/app/api/decisions/intake/intake-data";
import { generateOperatorItems } from "@/services/operator/generate";
import type { QuotaWorkerJob, QuotaWorkerOutcome } from "./quota-workers";

function waitForGo(): Promise<void> {
  return new Promise((resolve) => {
    let buffered = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      buffered += chunk;
      if (buffered.includes("GO\n")) resolve();
    });
  });
}

async function run(job: QuotaWorkerJob): Promise<{ id: string; status?: string }> {
  const ctx = {
    verifiedActorId: job.actorId,
    verifiedWorkspaceId: job.workspaceId,
    verifiedActorType: "user",
    session: { user: { id: job.actorId } },
  } as unknown as CanonicalAuthContext;
  const input = job.input;
  switch (job.op) {
    case "recommendation": {
      const rec = await createRecommendation(
        {
          engagementId: String(input.engagementId),
          title: String(input.title),
          description: "Quota race recommendation",
          priority: "medium",
        },
        ctx,
        job.workspaceId
      );
      return { id: rec.id };
    }
    case "engagement": {
      const eng = await createEngagement(
        {
          clientId: String(input.clientId),
          title: String(input.title),
          serviceTier: "standard",
          engagementMode: "expert",
          interventionMode: "stabilization",
        },
        ctx,
        job.workspaceId
      );
      return { id: eng.id };
    }
    case "action": {
      // Exactly as POST /api/actions calls it: the one action_create path that enforces the plan limit.
      const action = await createAction(
        {
          engagementId: String(input.engagementId),
          recommendationId: input.recommendationId as string,
          title: String(input.title),
        },
        ctx,
        job.workspaceId,
        undefined,
        { enforce: true }
      );
      return { id: action.id };
    }
    case "pipeline": {
      const result = await runConsultingPipeline(String(input.engagementId), ctx, job.workspaceId);
      return { id: String(input.engagementId), status: result.status };
    }
    case "decision": {
      const decision = await createDecision({
        title: String(input.title),
        type: "pricing",
        impact: 1000,
        confidence: 0.5,
        verifiedActorId: job.actorId,
        verifiedWorkspaceId: job.workspaceId,
      });
      return { id: decision.id };
    }
    case "intake": {
      // The exact write POST /api/decisions/intake performs after its idempotency claim.
      const decision = await persistDecisionItemWithinQuota(
        job.workspaceId,
        buildIntakeOperatorItemData(
          { title: String(input.title), description: "Quota race intake", confidence: 0.5, risk: "medium" },
          job.workspaceId,
          job.actorId
        )
      );
      return { id: decision.id };
    }
    case "run": {
      // The exact write POST /api/run performs once its gates pass: the engine's decisions as OperatorItems.
      const items = generateOperatorItems(
        [{ problem: String(input.title), action: "Reprice the low-margin tier", impactMultiplier: 1, confidence: 0.6, ruleId: "quota-race" }],
        { impactLow: 800, impactExpected: 1000, impactHigh: 1200, confidenceWeight: 0.6 },
        job.workspaceId,
        job.actorId,
        job.actorId
      );
      await addDecisionItemsWithinQuota(job.workspaceId, items);
      return { id: items[0].id };
    }
  }
}

async function main(): Promise<void> {
  const job = JSON.parse(process.argv[2] ?? "") as QuotaWorkerJob;
  const client = await getDbInstance();
  await client.$queryRaw`SELECT 1`;
  process.stdout.write("QUOTA_WORKER_READY\n");

  await waitForGo();

  let outcome: QuotaWorkerOutcome;
  try {
    const value = await run(job);
    outcome = { ok: true, id: value.id, status: value.status ?? null };
  } catch (error) {
    const reason = error as { code?: unknown; statusCode?: unknown; message?: unknown };
    outcome = {
      ok: false,
      code: typeof reason?.code === "string" ? reason.code : null,
      statusCode: typeof reason?.statusCode === "number" ? reason.statusCode : null,
      message: String(reason?.message ?? reason).slice(0, 500),
    };
  }
  process.stdout.write(`QUOTA_WORKER_RESULT ${JSON.stringify(outcome)}\n`, () => process.exit(0));
}

main().catch((error: unknown) => {
  process.stderr.write(`QUOTA_WORKER_FATAL ${String(error instanceof Error ? error.stack : error)}\n`, () =>
    process.exit(1)
  );
});
