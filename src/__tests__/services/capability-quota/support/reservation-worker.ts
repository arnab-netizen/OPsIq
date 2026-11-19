/**
 * Quota-reservation worker: an independent OS process (its own Prisma client and PostgreSQL connection)
 * that drives the REAL withCapabilityQuota / reconcileExpiredCapabilityReservations code. Spawned through
 * tsx by ./reservation-workers.ts; never imported by tests.
 *
 * Protocol (line-oriented, stdout): argv[2] is a JSON ReservationWorkerJob. The worker connects and prints
 * `RESERVATION_WORKER_READY`, waits for `GO\n` on stdin, then runs its mode:
 *   - "crash-after-reserve": reserve the units, then die with SIGKILL before any business write — a real
 *     process crash between reserve and finalize.
 *   - "crash-after-settle": reserve, write one decision row and settle its unit in ONE transaction, then
 *     die with SIGKILL before finalizing — the business write committed, the reservation is still open.
 *   - "sweep": run reconcileExpiredCapabilityReservations(workspaceId, now = job.nowIso) and print
 *     `RESERVATION_WORKER_RESULT <json>` (exit 0).
 */
import { randomUUID } from "crypto";
import { getDbInstance, db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { withCapabilityQuota, reconcileExpiredCapabilityReservations } from "@/services/entitlement.service";

export type ReservationWorkerMode = "crash-after-reserve" | "crash-after-settle" | "sweep";

export interface ReservationWorkerJob {
  mode: ReservationWorkerMode;
  workspaceId: string;
  actorId: string;
  key: string;
  amount?: number;
  nowIso?: string;
}

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

function crashNow(): never {
  process.kill(process.pid, "SIGKILL");
  throw new Error("unreachable: SIGKILL did not terminate the worker");
}

async function main(): Promise<void> {
  const job = JSON.parse(process.argv[2] ?? "") as ReservationWorkerJob;
  const client = await getDbInstance();
  await client.$queryRaw`SELECT 1`;
  process.stdout.write("RESERVATION_WORKER_READY\n");
  await waitForGo();

  switch (job.mode) {
    case "crash-after-reserve":
      await withCapabilityQuota(job.workspaceId, job.key, async () => crashNow(), { amount: job.amount ?? 1 });
      return;
    case "crash-after-settle":
      await withCapabilityQuota(
        job.workspaceId,
        job.key,
        async (reservation) => {
          await db.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.operatorItem.create({
              data: {
                id: randomUUID(),
                workspaceId: job.workspaceId,
                problem: "Reservation crash proof (settled)",
                action: "pricing",
                impactExpected: 1000,
                impactLow: 800,
                impactHigh: 1200,
                confidence: 0.5,
                priorityScore: 500,
                status: "pending",
                ownerUserId: job.actorId,
                createdByUserId: job.actorId,
                lastUpdatedByUserId: job.actorId,
                updatedAt: new Date(),
              },
            });
            await reservation.settle(tx);
          });
          return crashNow();
        },
        { amount: job.amount ?? 1 }
      );
      return;
    case "sweep": {
      const result = await reconcileExpiredCapabilityReservations(job.workspaceId, new Date(job.nowIso ?? Date.now()));
      process.stdout.write(`RESERVATION_WORKER_RESULT ${JSON.stringify(result)}\n`, () => process.exit(0));
      return;
    }
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`RESERVATION_WORKER_FATAL ${String(error instanceof Error ? error.stack : error)}\n`, () =>
    process.exit(1)
  );
});
