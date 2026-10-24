/**
 * Shared-state hygiene for the QuickBooks DB tests. Two tables are read GLOBALLY by code under test and so can leak between
 * files: the scheduler table (the scheduler suites drain it in batches) and the connection table (the daily producer enqueues a
 * task for every ACTIVE connection it finds, whoever seeded it). Every QuickBooks DB test file registers the workspaces it seeds
 * here; when the file finishes, for exactly those workspaces (never another file's, so parallel files cannot hurt each other):
 *   - their `qbo-sync` tasks are deleted;
 *   - their connections are marked DISCONNECTED, so a later file's producer cannot pick them up;
 *   - their OAuth states and resource-lock rows are deleted.
 * Versioned observations, provenance and snapshots are deliberately NOT deleted: they are immutable / governed records, keyed
 * by a workspace id no other test ever reads. Not a test file.
 */
import { afterAll } from "vitest";
import { db } from "@/lib/db";

const tracked = new Set<string>();

export function trackQboWorkspace(workspaceId: string): void {
  tracked.add(workspaceId);
}

/**
 * Producer limits that confine a test's producer run to the workspaces this file seeded, so it never enqueues tasks for connections
 * other files own (and so never has to delete anything that is not its own).
 */
export function qboProducerScope(extra: { pageSize?: number; maxPages?: number } = {}) {
  return { ...extra, workspaceIds: [...tracked] };
}

afterAll(async () => {
  if (tracked.size === 0) return;
  const ids = [...tracked];
  await db.$executeRaw`DELETE FROM scheduled_tasks WHERE task_name = 'qbo-sync' AND workspace_id = ANY(${ids}::uuid[])`;
  await db.$executeRaw`UPDATE qbo_connections SET status = 'DISCONNECTED', disconnected_at = COALESCE(disconnected_at, now()), updated_at = now() WHERE workspace_id = ANY(${ids}::uuid[]) AND status <> 'DISCONNECTED'`;
  await db.$executeRaw`DELETE FROM qbo_resource_locks WHERE workspace_id = ANY(${ids}::uuid[])`;
  await db.$executeRaw`DELETE FROM qbo_oauth_states WHERE workspace_id = ANY(${ids}::uuid[])`;
});
