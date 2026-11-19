/**
 * Test-side driver for ./reservation-worker.ts: spawns independent OS processes, holds them at a shared
 * start barrier, releases them together and reports how each one ended (exit code / signal and, for a
 * sweep, its result). Asserts nothing itself.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import type { ReservationWorkerJob } from "./reservation-worker";
import type { CapabilityReservationSweepResult } from "@/services/entitlement.service";

const ROOT = process.cwd();
const TSX = join(ROOT, "node_modules", ".bin", "tsx");
const WORKER = join(ROOT, "src", "__tests__", "services", "capability-quota", "support", "reservation-worker.ts");
const WORKER_DEADLINE_MS = 120_000;

export interface ReservationWorkerExit {
  code: number | null;
  signal: NodeJS.Signals | null;
  result: CapabilityReservationSweepResult | null;
  stderr: string;
}

interface ReadyWorker {
  go: () => void;
  exit: Promise<ReservationWorkerExit>;
}

function startWorker(job: ReservationWorkerJob): Promise<ReadyWorker> {
  // tsx runs the worker in a child of the spawned process; kill the whole group on timeout.
  const child: ChildProcess = spawn(TSX, [WORKER, JSON.stringify(job)], {
    cwd: ROOT,
    env: { ...process.env, NO_COLOR: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let ready = false;

  return new Promise<ReadyWorker>((resolveReady, rejectReady) => {
    let resolveExit!: (e: ReservationWorkerExit) => void;
    let rejectExit!: (e: Error) => void;
    const exit = new Promise<ReservationWorkerExit>((res, rej) => {
      resolveExit = res;
      rejectExit = rej;
    });
    exit.catch(() => undefined);

    const deadline = setTimeout(() => {
      child.kill("SIGKILL");
      const err = new Error(`reservation worker exceeded ${WORKER_DEADLINE_MS}ms; stderr tail: ${stderr.slice(-2000)}`);
      if (!ready) rejectReady(err);
      rejectExit(err);
    }, WORKER_DEADLINE_MS);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (c: string) => {
      stderr += c;
    });
    child.stdout?.on("data", (c: string) => {
      stdout += c;
      if (!ready && /^RESERVATION_WORKER_READY$/m.test(stdout)) {
        ready = true;
        resolveReady({ go: () => child.stdin?.write("GO\n"), exit });
      }
    });
    child.on("error", (e) => {
      clearTimeout(deadline);
      if (!ready) rejectReady(e);
      rejectExit(e);
    });
    child.on("exit", (code, signal) => {
      clearTimeout(deadline);
      const m = /^RESERVATION_WORKER_RESULT (\{.*\})$/m.exec(stdout);
      const exitInfo: ReservationWorkerExit = {
        code,
        signal,
        result: m ? (JSON.parse(m[1]) as CapabilityReservationSweepResult) : null,
        stderr: stderr.slice(-2000),
      };
      if (!ready) {
        rejectReady(new Error(`reservation worker exited before ready (code ${code}, signal ${signal}); stderr tail: ${exitInfo.stderr}`));
      }
      resolveExit(exitInfo);
    });
  });
}

/** Start every job in its own process, wait until ALL are connected, release them together. */
export async function runReservationWorkers(jobs: ReservationWorkerJob[]): Promise<ReservationWorkerExit[]> {
  const workers = await Promise.all(jobs.map((j) => startWorker(j)));
  for (const w of workers) w.go();
  return Promise.all(workers.map((w) => w.exit));
}
