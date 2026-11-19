import { Prisma } from "@/generated/prisma/client";
import type { Action } from "@/generated/prisma/client";
import type { ActionMetadataPatch } from "@/domain/execution/action-metadata";

/**
 * Governed Action writes that must be atomic in ONE statement:
 *  - compareAndSetAction: column changes + metadata key patch + version bump, conditional on the
 *    expected version and on the action's engagement belonging to the workspace; RETURNING the
 *    exact committed row (no later re-read can observe another writer's state).
 *  - mergeActionMetadata: a metadata key patch only (for writers that do not own the version).
 * Metadata is never written back whole: only the patch's keys are merged (`||`) or removed (`-`),
 * so concurrent writers of different keys (blockerReason, outcomeSnapshot, ...) cannot erase
 * each other.
 */
type RawClient = Pick<Prisma.TransactionClient, "$queryRaw">;

export interface ActionColumnChanges {
  status?: string;
  title?: string;
  description?: string | null;
  dueAt?: Date | null;
  assignedTo?: string | null;
  completedAt?: Date | null;
  verifiedAt?: Date | null;
}

function timestampValue(value: Date | null): Prisma.Sql {
  // Columns are timestamp(3) WITHOUT time zone holding UTC (Prisma's convention).
  return value === null ? Prisma.sql`NULL` : Prisma.sql`(${value.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
}

function metadataExpression(patch: ActionMetadataPatch): Prisma.Sql {
  const unset = JSON.stringify(patch.unset ?? []);
  const set = JSON.stringify(patch.set ?? {});
  return Prisma.sql`(COALESCE(a.metadata, '{}'::jsonb) - ARRAY(SELECT jsonb_array_elements_text(${unset}::jsonb))) || ${set}::jsonb`;
}

const TIMESTAMP_KEYS = ["due_at", "started_at", "completed_at", "verified_at", "created_at", "updated_at"] as const;

function parseTimestamp(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
}

function rowToAction(row: Record<string, unknown>): Action {
  const ts = Object.fromEntries(TIMESTAMP_KEYS.map((k) => [k, parseTimestamp(row[k])])) as Record<(typeof TIMESTAMP_KEYS)[number], Date | null>;
  return {
    id: row.id as string,
    engagementId: row.engagement_id as string,
    stageId: (row.stage_id as string | null) ?? null,
    recommendationId: (row.recommendation_id as string | null) ?? null,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    status: row.status as string,
    assignedTo: (row.assigned_to as string | null) ?? null,
    dueAt: ts.due_at,
    startedAt: ts.started_at,
    completedAt: ts.completed_at,
    verifiedAt: ts.verified_at,
    metadata: (row.metadata ?? null) as Action["metadata"],
    version: row.version as number,
    createdAt: ts.created_at as Date,
    updatedAt: ts.updated_at as Date,
  };
}

export async function compareAndSetAction(
  client: RawClient,
  args: {
    actionId: string;
    workspaceId: string;
    expectedVersion: number;
    columns: ActionColumnChanges;
    metadata?: ActionMetadataPatch;
  }
): Promise<Action | null> {
  const c = args.columns;
  const sets: Prisma.Sql[] = [];
  if (c.status !== undefined) sets.push(Prisma.sql`status = ${c.status}`);
  if (c.title !== undefined) sets.push(Prisma.sql`title = ${c.title}`);
  if (c.description !== undefined) sets.push(Prisma.sql`description = ${c.description}`);
  if (c.assignedTo !== undefined) sets.push(c.assignedTo === null ? Prisma.sql`assigned_to = NULL` : Prisma.sql`assigned_to = ${c.assignedTo}::uuid`);
  if (c.dueAt !== undefined) sets.push(Prisma.sql`due_at = ${timestampValue(c.dueAt)}`);
  if (c.completedAt !== undefined) sets.push(Prisma.sql`completed_at = ${timestampValue(c.completedAt)}`);
  if (c.verifiedAt !== undefined) sets.push(Prisma.sql`verified_at = ${timestampValue(c.verifiedAt)}`);
  if (args.metadata) sets.push(Prisma.sql`metadata = ${metadataExpression(args.metadata)}`);
  sets.push(Prisma.sql`version = a.version + 1`, Prisma.sql`updated_at = (now() AT TIME ZONE 'UTC')`);

  const rows = await client.$queryRaw<{ row: Record<string, unknown> }[]>(Prisma.sql`
    UPDATE actions AS a SET ${Prisma.join(sets, ", ")}
    FROM engagements AS e
    WHERE a.id = ${args.actionId}::uuid
      AND a.version = ${args.expectedVersion}
      AND a.engagement_id = e.id
      AND e.workspace_id = ${args.workspaceId}::uuid
    RETURNING to_jsonb(a.*) AS row`);
  return rows[0] ? rowToAction(rows[0].row) : null;
}

/** Atomically patch only the given metadata keys (no version change). Returns false if not found in the workspace. */
export async function mergeActionMetadata(
  client: RawClient,
  args: { actionId: string; workspaceId: string; metadata: ActionMetadataPatch }
): Promise<boolean> {
  const rows = await client.$queryRaw<{ id: string }[]>(Prisma.sql`
    UPDATE actions AS a SET metadata = ${metadataExpression(args.metadata)}, updated_at = (now() AT TIME ZONE 'UTC')
    FROM engagements AS e
    WHERE a.id = ${args.actionId}::uuid
      AND a.engagement_id = e.id
      AND e.workspace_id = ${args.workspaceId}::uuid
    RETURNING a.id`);
  return rows.length > 0;
}
