/**
 * Runtime-proof worker: an independent OS process that appends canonical events through the REAL
 * EventEmitterService, with its OWN Prisma client and its OWN pg connection (src/lib/db.ts gives every
 * process a pool of max 1 connection). It is never imported by tests; it is spawned through tsx by
 * ./event-store-workers.ts.
 *
 * Protocol (line-oriented, stdout):
 *   1. argv[2] is a JSON EmitWorkerJob.
 *   2. The worker connects, then prints `RP_WORKER_READY {"backendPid":<n>}` (the PostgreSQL backend pid
 *      of its single connection, so a test can inject failures such as pg_terminate_backend).
 *   3. It blocks until the parent writes `GO\n` on stdin (a start barrier shared by all workers, so
 *      their appends genuinely overlap in time on independent connections).
 *   4. It fires every emit of the job, then prints `RP_WORKER_RESULT <json EmitWorkerOutcome[]>` in
 *      job order and exits 0. A failing emit is reported as an outcome, never swallowed.
 */
import { getDbInstance } from "@/lib/db";
import { EventEmitterService, type EventPayload } from "@/services/event-emitter";

interface EmitWorkerJob {
  workspaceId: string;
  actorId: string;
  emits: Array<{
    aggregateId: string;
    aggregateType: string;
    eventType: string;
    payload: EventPayload;
    idempotencyKey?: string;
  }>;
}

type EmitWorkerOutcome =
  | { ok: true; id: string; eventNumber: number }
  | { ok: false; code: string | null; message: string };

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

async function main(): Promise<void> {
  const job = JSON.parse(process.argv[2] ?? "") as EmitWorkerJob;
  const client = await getDbInstance();
  const rows = (await client.$queryRaw`SELECT pg_backend_pid() AS pid`) as Array<{ pid: number }>;
  process.stdout.write(`RP_WORKER_READY ${JSON.stringify({ backendPid: Number(rows[0].pid) })}\n`);

  await waitForGo();

  const settled = await Promise.allSettled(
    job.emits.map((e) =>
      EventEmitterService.emit({
        aggregateId: e.aggregateId,
        aggregateType: e.aggregateType,
        eventType: e.eventType,
        eventVersion: 1,
        payload: e.payload,
        actorId: job.actorId,
        workspaceId: job.workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
        idempotencyKey: e.idempotencyKey,
      })
    )
  );
  const outcomes: EmitWorkerOutcome[] = settled.map((s) => {
    if (s.status === "fulfilled") return { ok: true, id: s.value.id, eventNumber: s.value.eventNumber };
    const reason = s.reason as { code?: unknown; message?: unknown };
    return {
      ok: false,
      code: typeof reason?.code === "string" ? reason.code : null,
      message: String(reason?.message ?? reason).slice(0, 500),
    };
  });
  process.stdout.write(`RP_WORKER_RESULT ${JSON.stringify(outcomes)}\n`, () => process.exit(0));
}

main().catch((error: unknown) => {
  process.stderr.write(`RP_WORKER_FATAL ${String(error instanceof Error ? error.stack : error)}\n`, () =>
    process.exit(1)
  );
});
