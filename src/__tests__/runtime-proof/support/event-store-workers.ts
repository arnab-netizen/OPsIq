/**
 * Test-side driver for ./event-store-emit-worker.ts: spawns genuinely independent OS processes (each with its
 * own Prisma client and its own PostgreSQL connection), holds them at a shared start barrier, releases them
 * together and collects every per-emit outcome. Also opens raw pg sessions for lock-order and
 * failure-injection proofs that need a second, independently controlled connection.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import pg from "pg";
import type { EventPayload } from "@/services/event-emitter";

const ROOT = process.cwd();
const TSX = join(ROOT, "node_modules", ".bin", "tsx");
const WORKER = join(ROOT, "src", "__tests__", "runtime-proof", "support", "event-store-emit-worker.ts");
const WORKER_DEADLINE_MS = 120_000;

export interface WorkerEmit {
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  payload: EventPayload;
  idempotencyKey?: string;
}

export interface EmitWorkerJob {
  workspaceId: string;
  actorId: string;
  emits: WorkerEmit[];
}

export type EmitWorkerOutcome =
  | { ok: true; id: string; eventNumber: number }
  | { ok: false; code: string | null; message: string };

export interface ReadyWorker {
  /** OS pid of the worker process (distinct from the test process). */
  osPid: number;
  /** PostgreSQL backend pid of the worker's own connection. */
  backendPid: number;
  /** Releases the start barrier. */
  go: () => void;
  /** Resolves with one outcome per job emit, in job order; rejects if the process fails or hangs. */
  outcomes: Promise<EmitWorkerOutcome[]>;
}

/** Spawn one worker and resolve once it is connected and parked at the start barrier. */
export function startEmitWorker(job: EmitWorkerJob): Promise<ReadyWorker> {
  const child: ChildProcess = spawn(TSX, [WORKER, JSON.stringify(job)], {
    cwd: ROOT,
    env: { ...process.env, NO_COLOR: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let readySettled = false;

  return new Promise<ReadyWorker>((resolveReady, rejectReady) => {
    let resolveOutcomes!: (o: EmitWorkerOutcome[]) => void;
    let rejectOutcomes!: (e: Error) => void;
    const outcomes = new Promise<EmitWorkerOutcome[]>((res, rej) => {
      resolveOutcomes = res;
      rejectOutcomes = rej;
    });
    // Attach a handler now so a failure before the caller awaits is not an unhandled rejection;
    // the caller still observes the rejection through `outcomes`.
    outcomes.catch(() => undefined);

    const deadline = setTimeout(() => {
      child.kill("SIGKILL");
      const err = new Error(`emit worker exceeded ${WORKER_DEADLINE_MS}ms; stderr tail: ${stderr.slice(-2000)}`);
      if (!readySettled) rejectReady(err);
      rejectOutcomes(err);
    }, WORKER_DEADLINE_MS);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (c: string) => {
      stderr += c;
    });
    child.stdout?.on("data", (c: string) => {
      stdout += c;
      if (!readySettled) {
        const m = /^RP_WORKER_READY (\{.*\})$/m.exec(stdout);
        if (m) {
          readySettled = true;
          const { backendPid } = JSON.parse(m[1]) as { backendPid: number };
          resolveReady({
            osPid: child.pid ?? -1,
            backendPid,
            go: () => {
              child.stdin?.write("GO\n");
            },
            outcomes,
          });
        }
      }
    });
    child.on("error", (e) => {
      clearTimeout(deadline);
      if (!readySettled) rejectReady(e);
      rejectOutcomes(e);
    });
    child.on("exit", (code) => {
      clearTimeout(deadline);
      const m = /^RP_WORKER_RESULT (\[.*\])$/m.exec(stdout);
      if (code === 0 && m) {
        resolveOutcomes(JSON.parse(m[1]) as EmitWorkerOutcome[]);
        return;
      }
      const err = new Error(`emit worker exited with code ${code}; stderr tail: ${stderr.slice(-2000)}`);
      if (!readySettled) rejectReady(err);
      rejectOutcomes(err);
    });
  });
}

/**
 * Start every job in its own process, wait until ALL are connected, release them together, and return the
 * outcomes per job (outer index = job index). Asserts nothing itself: callers assert exact outcomes.
 */
export async function runEmitWorkersConcurrently(jobs: EmitWorkerJob[]): Promise<{
  outcomes: EmitWorkerOutcome[][];
  osPids: number[];
  backendPids: number[];
}> {
  const workers = await Promise.all(jobs.map((j) => startEmitWorker(j)));
  for (const w of workers) w.go();
  const outcomes = await Promise.all(workers.map((w) => w.outcomes));
  return {
    outcomes,
    osPids: workers.map((w) => w.osPid),
    backendPids: workers.map((w) => w.backendPid),
  };
}

/** A raw, independently controlled PostgreSQL session against the same test database. */
export async function openRawSession(): Promise<pg.Client> {
  const connectionString = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("TEST_DATABASE_URL or DATABASE_URL must be set for raw sessions");
  const client = new pg.Client({ connectionString });
  await client.connect();
  return client;
}

/** The exact per-aggregate lock statement EventEmitterService.emit() runs inside its transaction. */
export const AGGREGATE_LOCK_SQL = `
  INSERT INTO aggregate_locks (aggregate_id, aggregate_type, workspace_id, version)
  VALUES ($1, $2, $3, 0)
  ON CONFLICT (aggregate_id, aggregate_type, workspace_id)
  DO UPDATE SET version = aggregate_locks.version + 1`;
