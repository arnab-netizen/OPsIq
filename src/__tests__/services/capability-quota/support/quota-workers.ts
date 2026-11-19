/**
 * Test-side driver for ./quota-worker.ts: spawns genuinely independent OS processes (each with its own
 * Prisma client and its own PostgreSQL connection), holds them at a shared start barrier, releases them
 * together and collects every outcome. Asserts nothing itself: callers assert exact outcomes.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const TSX = join(ROOT, "node_modules", ".bin", "tsx");
const WORKER = join(ROOT, "src", "__tests__", "services", "capability-quota", "support", "quota-worker.ts");
const WORKER_DEADLINE_MS = 120_000;

export type QuotaWorkerOp = "recommendation" | "engagement" | "action" | "pipeline" | "decision" | "intake" | "run";

export interface QuotaWorkerJob {
  op: QuotaWorkerOp;
  workspaceId: string;
  actorId: string;
  input: Record<string, unknown>;
}

export type QuotaWorkerOutcome =
  | { ok: true; id: string; status: string | null }
  | { ok: false; code: string | null; statusCode: number | null; message: string };

interface ReadyWorker {
  go: () => void;
  outcome: Promise<QuotaWorkerOutcome>;
}

function startQuotaWorker(job: QuotaWorkerJob): Promise<ReadyWorker> {
  const child: ChildProcess = spawn(TSX, [WORKER, JSON.stringify(job)], {
    cwd: ROOT,
    env: { ...process.env, NO_COLOR: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let readySettled = false;

  return new Promise<ReadyWorker>((resolveReady, rejectReady) => {
    let resolveOutcome!: (o: QuotaWorkerOutcome) => void;
    let rejectOutcome!: (e: Error) => void;
    const outcome = new Promise<QuotaWorkerOutcome>((res, rej) => {
      resolveOutcome = res;
      rejectOutcome = rej;
    });
    // Attach a handler now so a failure before the caller awaits is not an unhandled rejection.
    outcome.catch(() => undefined);

    const deadline = setTimeout(() => {
      child.kill("SIGKILL");
      const err = new Error(`quota worker exceeded ${WORKER_DEADLINE_MS}ms; stderr tail: ${stderr.slice(-2000)}`);
      if (!readySettled) rejectReady(err);
      rejectOutcome(err);
    }, WORKER_DEADLINE_MS);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (c: string) => {
      stderr += c;
    });
    child.stdout?.on("data", (c: string) => {
      stdout += c;
      if (!readySettled && /^QUOTA_WORKER_READY$/m.test(stdout)) {
        readySettled = true;
        resolveReady({ go: () => child.stdin?.write("GO\n"), outcome });
      }
    });
    child.on("error", (e) => {
      clearTimeout(deadline);
      if (!readySettled) rejectReady(e);
      rejectOutcome(e);
    });
    child.on("exit", (code) => {
      clearTimeout(deadline);
      const m = /^QUOTA_WORKER_RESULT (\{.*\})$/m.exec(stdout);
      if (code === 0 && m) {
        resolveOutcome(JSON.parse(m[1]) as QuotaWorkerOutcome);
        return;
      }
      const err = new Error(`quota worker exited with code ${code}; stderr tail: ${stderr.slice(-2000)}`);
      if (!readySettled) rejectReady(err);
      rejectOutcome(err);
    });
  });
}

/** Start every job in its own process, wait until ALL are connected, release them together. */
export async function runQuotaWorkersConcurrently(jobs: QuotaWorkerJob[]): Promise<QuotaWorkerOutcome[]> {
  const workers = await Promise.all(jobs.map((j) => startQuotaWorker(j)));
  for (const w of workers) w.go();
  return Promise.all(workers.map((w) => w.outcome));
}
