/**
 * Sync tasks the QuickBooks tests enqueue live in the shared scheduler table, which the scheduler suites drain globally.
 * Every QuickBooks DB test file registers the workspaces it seeds here; when the file finishes, the `qbo-sync` tasks of exactly
 * those workspaces are removed (never another file's, so files running in parallel cannot delete each other's tasks).
 * Not a test file.
 */
import { afterAll } from "vitest";
import { db } from "@/lib/db";

const tracked = new Set<string>();

export function trackQboWorkspace(workspaceId: string): void {
  tracked.add(workspaceId);
}

/**
 * Runs the daily producer, which enqueues a task for EVERY active connection in the database, including connections other
 * files seeded earlier. Tasks for workspaces this file did not seed are removed again at once, so they can never linger in
 * the shared scheduler table (and starve suites that claim from it in batches).
 */
export async function runQboProducerForTest<T>(produce: () => Promise<T>): Promise<T> {
  const startedAt = new Date(Date.now() - 1000);
  const result = await produce();
  await db.$executeRaw`DELETE FROM scheduled_tasks WHERE task_name = 'qbo-sync' AND created_at >= ${startedAt} AND (workspace_id IS NULL OR workspace_id <> ALL(${[...tracked]}::uuid[]))`;
  return result;
}

afterAll(async () => {
  if (tracked.size === 0) return;
  await db.$executeRaw`DELETE FROM scheduled_tasks WHERE task_name = 'qbo-sync' AND workspace_id = ANY(${[...tracked]}::uuid[])`;
});
