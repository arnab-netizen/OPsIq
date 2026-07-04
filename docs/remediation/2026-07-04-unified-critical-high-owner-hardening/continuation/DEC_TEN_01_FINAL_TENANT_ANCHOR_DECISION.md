# DEC-TEN-01 / SCHEMA-01/03 — FINAL Tenant Anchor Decision & Closure

## Finding (verified from source)
ClientAccount and LeadRecord had NO `workspaceId` column, yet `client-account.ts`/`lead.ts`
services already wrote and filtered by `workspaceId` (from `ctx.verifiedWorkspaceId`, never a
client field). Result: the clients/leads routes were **fully broken by schema drift** (they also
never generated `id` and never set `updatedAt`; getters used wrong relation names `contacts`/`client`
and invalid `findUnique` compounds), and there was no DB-level tenant anchor.

## Decision
**ClientAccount and LeadRecord are WORKSPACE_SCOPED_DIRECT.** Added a required `workspaceId` FK to
`Workspace` on both (migration `20260704120000_client_lead_workspace_anchor`), with `@@index` and
`onDelete: Restrict`. No public-intake model was found; leads are workspace-owned from creation.

## Changes
- Migration adds `workspace_id` to `client_accounts` + `lead_records`, backfills from
  engagements (client) / engagement+converted-client (lead), sets NOT NULL, adds FK + index.
- Services repaired: `createClient`/`createLead` now generate `id`, set `updatedAt`, keep
  server-verified `workspaceId`. `getClientById`/`getLeadById` fixed to `findFirst` scoped by
  `{id, workspaceId}` with correct relation names (`clientContacts`/`clientAccount`).
- `diagnosis.ts` client lookup was cross-workspace (`findFirst({name})`) — now scoped to the
  verified workspace and creates with it. `seed.ts` + `demo-engagement-proof` create sites set it.
- Added `ClientAccount`/`LeadRecord` to the SEC-04 DB backstop enforced set.

## Backfill (production)
The migration backfills from engagement/client relations. Rows with NO derivable workspace cause
`SET NOT NULL` to fail — **owner must backfill those rows manually before deploy** (documented here).
On a fresh DB the tables are empty and the migration applies cleanly.

## Proof
`src/__tests__/security/dec-ten-01-client-lead-anchor.db.test.ts` (2/2): create attaches the verified
workspace; same-workspace read succeeds; cross-workspace read blocked (NotFoundError + null DB scope).
Client/lead regression 9/9; sec-04 backstop still 4/4; tsc 0 errors.

**Status: DEC-TEN-01 CLOSED_PROVEN (workspace-anchored + DB-tested). Production backfill of un-anchorable legacy rows is the only owner action.**
