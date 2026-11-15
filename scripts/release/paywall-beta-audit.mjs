#!/usr/bin/env node
/**
 * READ-ONLY audit of existing workspaces against the dormant paywall (PRE_GO_LIVE_OWNER_DECISION_REQUIRED #10).
 *
 *   DATABASE_URL=<read access> node scripts/release/paywall-beta-audit.mjs
 *
 * One READ ONLY transaction over the Neon HTTP driver (or any Postgres via DATABASE_URL on loopback).
 * It prints aggregate counts and one logical state per workspace keyed by an opaque workspace id prefix:
 * never emails, names, connection strings or any business data. It changes nothing and invents no
 * grandfathering: it only tells the owner who would hit the wall on their next continuation step.
 *
 * Logical state per workspace (matches the gate's own invariant):
 *   NO_DIAGNOSIS          free first diagnosis still available
 *   FIRST_USED_UNPAID     first diagnosis used; next continuation / re-diagnosis would be denied (402)
 *   MULTI_DIAGNOSIS_UNPAID more than one cycle already exists without a subscription (OPEN_BETA history):
 *                          every future continuation would be denied; exemption decision needed
 *   ENTITLED              active (or past_due within grace) subscription
 */
const DAY = 86_400_000;
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is required (read-only)."); process.exit(2); }

const Q = `
with cyc as (
  select b.workspace_id, c.business_id from recovery_cycles c join owner_businesses b on b.id = c.business_id
  union all select b.workspace_id, c.business_id from owner_finance_cycles c join owner_businesses b on b.id = c.business_id
  union all select b.workspace_id, c.business_id from owner_cashflow_cycles c join owner_businesses b on b.id = c.business_id
  union all select b.workspace_id, c.business_id from owner_sales_cycles c join owner_businesses b on b.id = c.business_id
  union all select b.workspace_id, c.business_id from owner_operations_cycles c join owner_businesses b on b.id = c.business_id
  union all select b.workspace_id, c.business_id from owner_sop_cycles c join owner_businesses b on b.id = c.business_id
  union all select b.workspace_id, c.business_id from owner_marketing_cycles c join owner_businesses b on b.id = c.business_id
  union all select b.workspace_id, c.business_id from owner_strategy_cycles c join owner_businesses b on b.id = c.business_id
)
select w.id::text as workspace_id, w.signup_source, w.is_active,
       coalesce((select count(*) from cyc where cyc.workspace_id = w.id), 0)::int as cycles,
       coalesce((select count(distinct business_id) from cyc where cyc.workspace_id = w.id), 0)::int as businesses_with_cycles,
       s.status as sub_status, s.current_period_end as period_end
  from workspaces w
  left join billing_accounts ba on ba.workspace_id = w.id
  left join subscriptions s on s.billing_account_id = ba.id
 where w.is_active = true
 order by w.created_at`;

function classify(row, now) {
  const end = row.period_end ? new Date(row.period_end).getTime() : 0;
  const entitled = row.sub_status === "active" || (row.sub_status === "past_due" && now <= end + 7 * DAY);
  if (entitled) return "ENTITLED";
  if (row.cycles === 0) return "NO_DIAGNOSIS";
  return row.cycles === 1 ? "FIRST_USED_UNPAID" : "MULTI_DIAGNOSIS_UNPAID";
}

let rows;
const loopback = ["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname);
if (loopback) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try { await client.query("begin read only"); rows = (await client.query(Q)).rows; await client.query("rollback"); } finally { await client.end(); }
} else {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  [rows] = await sql.transaction((t) => [t(Q)], { readOnly: true });
}
const now = Date.now();
const per = rows.map((r) => ({ ws: r.workspace_id.slice(0, 8), source: r.signup_source ?? "(none)", cycles: r.cycles, businessesWithCycles: r.businesses_with_cycles, subscription: r.sub_status ?? "none", state: classify(r, now) }));
const counts = {};
for (const p of per) counts[p.state] = (counts[p.state] ?? 0) + 1;
console.log(JSON.stringify({ activeWorkspaces: per.length, counts, ownersWithMoreThanOneDiagnosis: per.filter((p) => p.cycles > 1).length, perWorkspace: per }, null, 2));
