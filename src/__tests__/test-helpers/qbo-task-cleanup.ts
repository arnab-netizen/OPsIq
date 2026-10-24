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

afterAll(async () => {
  if (tracked.size === 0) return;
  await db.$executeRaw`DELETE FROM scheduled_tasks WHERE task_name = 'qbo-sync' AND workspace_id = ANY(${[...tracked]}::uuid[])`;
});
