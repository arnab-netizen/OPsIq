/**
 * Business-scoped owner goals — database-level integrity proof.
 *
 * `[db]`-gated, loopback throwaway Postgres only (test-database-guard).
 * 1. The two partial unique indexes behave exactly as intended in Postgres (raw SQL, no service).
 * 2. Concurrent creates/assignments in one scope leave exactly one ACTIVE goal; losers get a
 *    governed ConflictError (409), never an unhandled database error.
 * 3. The real migration file fails closed on pre-existing ACTIVE duplicates (nothing changed) and,
 *    on clean data, preserves every existing row with businessId = NULL. Run in isolated fixture
 *    schemas so the test database's own tables are never touched.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";
import { Client } from "pg";
import { db } from "@/lib/db";
import { assignLegacyGoalToBusiness, createGoal } from "@/services/owner-strategy/goal.service";
import { ConflictError } from "@/infra/errors";

const actor = randomUUID();
const workspaces: string[] = [];
const baseUrl = process.env.DATABASE_URL ?? "";
const MIGRATION_SQL = readFileSync(
  resolve(__dirname, "../../../../prisma/migrations/20260926090000_owner_goal_business_scope/migration.sql"),
  "utf8"
);
let pg: Client;

function future(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}
function newWorkspace(): string {
  const ws = randomUUID();
  workspaces.push(ws);
  return ws;
}
async function business(workspaceId: string, name = "Biz"): Promise<string> {
  const id = randomUUID();
  await db.ownerBusiness.create({ data: { id, workspaceId, name, businessType: "laundry_local_service", currency: "INR", updatedAt: new Date() } });
  return id;
}
async function insertGoal(workspaceId: string, businessId: string | null, status = "ACTIVE") {
  await pg.query(
    `INSERT INTO owner_goals (workspace_id, business_id, actor_id, target_type, target_amount, target_currency, target_date, status, updated_at)
     VALUES ($1, $2, $3, 'REVENUE', 1, 'INR', now() + interval '1 year', $4, now())`,
    [workspaceId, businessId, actor, status]
  );
}
async function expectUniqueViolation(p: Promise<unknown>, index: string) {
  await expect(p).rejects.toMatchObject({ code: "23505", constraint: index });
}

beforeAll(async () => {
  pg = new Client({ connectionString: baseUrl });
  await pg.connect();
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `goal-int-${actor}@example.com`, name: "Goal Integrity", isActive: true, updatedAt: new Date() },
  });
});

afterAll(async () => {
  await pg.query(`DROP SCHEMA IF EXISTS goal_mig_dup CASCADE`);
  await pg.query(`DROP SCHEMA IF EXISTS goal_mig_clean CASCADE`);
  await db.ownerGoal.deleteMany({ where: { workspaceId: { in: workspaces } } });
  await db.ownerBusiness.deleteMany({ where: { workspaceId: { in: workspaces } } });
  await db.auditEvent.deleteMany({ where: { actorId: actor } });
  await db.user.delete({ where: { id: actor } });
  await pg.end();
});

describe("[db] partial unique indexes (exact Postgres behaviour)", () => {
  it("[db] a second ACTIVE goal for the same business is rejected by owner_goals_one_active_per_business", async () => {
    const ws = newWorkspace();
    const biz = await business(ws);
    await insertGoal(ws, biz);
    await expectUniqueViolation(insertGoal(ws, biz), "owner_goals_one_active_per_business");
  });

  it("[db] a second ACTIVE legacy goal (businessId NULL) in a workspace is rejected by owner_goals_one_active_legacy_per_workspace", async () => {
    const ws = newWorkspace();
    await insertGoal(ws, null);
    await expectUniqueViolation(insertGoal(ws, null), "owner_goals_one_active_legacy_per_workspace");
  });

  it("[db] allowed: one ACTIVE goal per business alongside one ACTIVE legacy goal, any number of REVISED/ACHIEVED rows, and legacy goals in different workspaces", async () => {
    const ws = newWorkspace();
    const other = newWorkspace();
    const a = await business(ws, "A");
    const b = await business(ws, "B");
    await insertGoal(ws, a);
    await insertGoal(ws, b);
    await insertGoal(ws, null);
    await insertGoal(other, null);
    for (let i = 0; i < 3; i++) {
      await insertGoal(ws, a, "REVISED");
      await insertGoal(ws, null, "REVISED");
      await insertGoal(ws, a, "ACHIEVED");
    }
    const { rows } = await pg.query(`SELECT count(*)::int AS n FROM owner_goals WHERE workspace_id = $1 AND status = 'ACTIVE'`, [ws]);
    expect(rows[0].n).toBe(3);
  });

  it("[db] a goal cannot reference a business that does not exist (FK), and a business with goals cannot be hard-deleted (RESTRICT)", async () => {
    const ws = newWorkspace();
    await expect(insertGoal(ws, randomUUID())).rejects.toMatchObject({ code: "23503" });
    const biz = await business(ws);
    await insertGoal(ws, biz);
    await expect(pg.query(`DELETE FROM owner_businesses WHERE id = $1`, [biz])).rejects.toMatchObject({ code: "23503" });
  });
});

describe("[db] concurrency", () => {
  it("[db] simultaneous creates for one business: exactly one ACTIVE survives, every loser gets a ConflictError", async () => {
    const ws = newWorkspace();
    const biz = await business(ws);
    await business(ws, "Second"); // multi-business: no legacy exception involved
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) =>
        createGoal({ workspaceId: ws, actorId: actor, businessId: biz, targetType: "REVENUE", targetAmount: 1000 + i, targetDate: future(90) })
      )
    );
    const active = await db.ownerGoal.count({ where: { workspaceId: ws, businessId: biz, status: "ACTIVE" } });
    expect(active).toBe(1);
    const rejected = attempts.filter((a): a is PromiseRejectedResult => a.status === "rejected");
    for (const r of rejected) expect(r.reason).toBeInstanceOf(ConflictError);
    expect(attempts.some((a) => a.status === "fulfilled")).toBe(true);
  });

  it("[db] simultaneous replacements of an existing goal: still exactly one ACTIVE, losers get a ConflictError", async () => {
    const ws = newWorkspace();
    const biz = await business(ws);
    await business(ws, "Second");
    await createGoal({ workspaceId: ws, actorId: actor, businessId: biz, targetType: "REVENUE", targetAmount: 1, targetDate: future(90) });
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        createGoal({ workspaceId: ws, actorId: actor, businessId: biz, targetType: "PROFIT", targetAmount: 10 + i, targetDate: future(90) })
      )
    );
    expect(await db.ownerGoal.count({ where: { workspaceId: ws, businessId: biz, status: "ACTIVE" } })).toBe(1);
    for (const a of attempts) if (a.status === "rejected") expect(a.reason).toBeInstanceOf(ConflictError);
    // Every REVISED row points at a real successor.
    const revised = await db.ownerGoal.findMany({ where: { workspaceId: ws, status: "REVISED" } });
    for (const r of revised) expect(await db.ownerGoal.count({ where: { id: r.supersededById! } })).toBe(1);
  });

  it("[db] simultaneous assignment of one legacy goal: exactly one business goal is created, the legacy goal is revised once", async () => {
    const ws = newWorkspace();
    const a = await business(ws, "A");
    await business(ws, "B");
    const legacyId = randomUUID();
    await db.ownerGoal.create({
      data: { id: legacyId, workspaceId: ws, actorId: actor, targetType: "REVENUE", targetAmount: 5, targetCurrency: "INR", targetDate: future(200), status: "ACTIVE", updatedAt: new Date() },
    });
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, () => assignLegacyGoalToBusiness({ workspaceId: ws, actorId: actor, legacyGoalId: legacyId, businessId: a }))
    );
    expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    for (const x of attempts) if (x.status === "rejected") expect(x.reason).toBeInstanceOf(ConflictError);
    expect(await db.ownerGoal.count({ where: { workspaceId: ws, businessId: a, status: "ACTIVE" } })).toBe(1);
    expect((await db.ownerGoal.findUnique({ where: { id: legacyId } }))!.status).toBe("REVISED");
    expect(await db.auditEvent.count({ where: { entityId: legacyId, eventName: "owner.goal_revised" } })).toBe(1);
  });
});

describe("[db] migration 20260926090000_owner_goal_business_scope", () => {
  /** A fixture schema shaped like production before this migration (the columns it touches). */
  async function preMigrationSchema(schema: string) {
    await pg.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pg.query(`CREATE SCHEMA ${schema}`);
    await pg.query(`CREATE TABLE ${schema}.owner_businesses (id uuid PRIMARY KEY)`);
    await pg.query(`CREATE TABLE ${schema}.owner_goals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, actor_id uuid NOT NULL,
      target_type text NOT NULL, target_amount double precision NOT NULL, target_currency text NOT NULL DEFAULT 'USD',
      target_date timestamptz NOT NULL, baseline_amount double precision, status text NOT NULL DEFAULT 'ACTIVE',
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL)`);
  }
  async function applyMigration(schema: string) {
    const c = new Client({ connectionString: baseUrl, options: `-c search_path=${schema}` });
    await c.connect();
    try {
      await c.query(MIGRATION_SQL);
    } finally {
      await c.end();
    }
  }
  const snapshot = async (schema: string) =>
    (await pg.query(`SELECT id, workspace_id, actor_id, target_type, target_amount, target_currency, target_date, baseline_amount, status, created_at FROM ${schema}.owner_goals ORDER BY id`)).rows;

  it("[db] fails closed on pre-existing ACTIVE duplicates — no goal is chosen and nothing is changed", async () => {
    const schema = "goal_mig_dup";
    await preMigrationSchema(schema);
    const ws = randomUUID();
    for (const t of ["REVENUE", "PROFIT"]) {
      await pg.query(`INSERT INTO ${schema}.owner_goals (workspace_id, actor_id, target_type, target_amount, target_date, status, updated_at) VALUES ($1,$2,$3,1,now(),'ACTIVE',now())`, [ws, actor, t]);
    }
    const before = await snapshot(schema);
    await expect(applyMigration(schema)).rejects.toThrow(/owner_goals preflight failed: 1 workspace\(s\) have more than one ACTIVE goal/);
    expect(await snapshot(schema)).toEqual(before);
    const cols = await pg.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='owner_goals' AND column_name='business_id'`, [schema]);
    expect(cols.rowCount).toBe(0);
  });

  it("[db] on clean data every existing row is preserved (id, status, currency, type, history) with businessId NULL", async () => {
    const schema = "goal_mig_clean";
    await preMigrationSchema(schema);
    const ws = randomUUID();
    const rows: Array<[string, string, string]> = [
      ["ACTIVE", "NET_WORTH", "GBP"],
      ["REVISED", "MULTIPLE", "USD"],
      ["ACHIEVED", "PROFIT", "INR"],
      ["REVISED", "REVENUE", "INR"],
    ];
    for (const [status, type, currency] of rows) {
      await pg.query(
        `INSERT INTO ${schema}.owner_goals (workspace_id, actor_id, target_type, target_amount, target_currency, target_date, baseline_amount, status, updated_at) VALUES ($1,$2,$3,42,$4,now(),7,$5,now())`,
        [ws, actor, type, currency, status]
      );
    }
    const before = await snapshot(schema);
    await applyMigration(schema);
    expect(await snapshot(schema)).toEqual(before);
    const scoped = await pg.query(`SELECT count(*)::int AS n FROM ${schema}.owner_goals WHERE business_id IS NULL AND superseded_by_id IS NULL`);
    expect(scoped.rows[0].n).toBe(rows.length);
    const idx = await pg.query(`SELECT indexname FROM pg_indexes WHERE schemaname=$1 AND tablename='owner_goals' ORDER BY 1`, [schema]);
    expect(idx.rows.map((r) => r.indexname)).toEqual(
      expect.arrayContaining(["owner_goals_one_active_legacy_per_workspace", "owner_goals_one_active_per_business"])
    );
  });
});
