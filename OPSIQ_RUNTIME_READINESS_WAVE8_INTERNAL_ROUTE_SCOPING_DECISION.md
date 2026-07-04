# OpsIQ Wave 8 — Decision Memo: workspace-scoping for Lead / ClientAccount(+ClientContact) + createUser membership

> Required by the follow-up-wave rule: "if a wave requires a schema decision, do not guess — create a decision memo
> (options, recommendation, risks, tests). Do not add schema unless unavoidable+documented." Wave 8 fixes the User
> service migration-free (BROKEN-SVC-2, DB-proven). The remaining two broken services genuinely have **no
> workspace-reaching column or relation**, so they cannot be fixed the Wave-1 way and require a schema decision the
> owner should weigh. Each is on an **internal / consultant-side** route (leads, client contacts), **not** on the
> owner shadow-pilot runtime path — so deferring them to this memo is non-blocking for that path.

## Why User was fixable but Lead / ClientAccount are not
`User` lacks a `workspaceId` column but reaches a workspace through the **`workspaceMemberships`** relation (a
working precedent exists: `engagement-membership.ts`). Wave 8 rescoped every User query through it — no migration.
`LeadRecord`, `ClientAccount`, and `ClientContact` have **no such always-present relation**:

- `LeadRecord` → `engagement` (nullable) / `clientAccount` (nullable, dead-ends at a workspace-less ClientAccount).
- `ClientAccount` → only downward relations (`engagements[]`, `clientContacts[]`, `leadRecords[]`); no workspace.
- `ClientContact` → `clientAccount` (which itself has no workspace).

## DECISION 1 — LeadRecord workspace scoping (BROKEN-SVC-3)
**Broken today.** `lead.ts` issues `leadRecord.create({ data: { workspaceId } })` and `findUnique({ id, workspaceId })`
against a column that does not exist → every `createLead`/`updateLead`/`getLeadById`/`listLeads`/`linkLeadToEngagement`
happy-path throws at runtime. Blocks `leads/[leadId]` POST.
**Options.**
- (a) **Add `workspace_id` to `lead_records`** (column + migration + backfill; set on create from the verified
  workspace context; backfill existing rows from a linked engagement's `workspaceId`, else leave null for
  never-linked leads). Then all lead queries scope by the real column. *Recommended* — leads are created before any
  engagement exists, so a first-class column is the only reliable scope.
- (b) Scope only via `engagement: { workspaceId }`. *Rejected* — `engagementId` is nullable; a freshly-created or
  unlinked lead has no engagement, so create/list/get can't be scoped at all.
**Risk.** Backfill for pre-existing unlinked leads has no deterministic workspace source (would be null); a fresh
pilot DB has none, so backfill is trivial there. Migration must be reviewed (not guessed) — hence this memo.
**Tests (when chosen).** createLead persists workspace_id; get/update/list are workspace-isolated; linkLeadToEngagement
still validates the engagement's workspace; cross-workspace access denied.

## DECISION 2 — ClientAccount workspace scoping (BROKEN-SVC-1, and wider) + ClientContact
**Broken today.** `client-contact.ts` filters `client: { workspaceId }` — the relation is actually `clientAccount`,
**and** `ClientAccount` has no `workspaceId`. `client-account.ts` and `engagement.ts:64` are broken the same way.
Blocks `clients/[clientId]/contacts/[contactId]` DELETE.
**Complication (must be reconciled first).** Two conflicting models of `ClientAccount` exist in the codebase:
several Owner-Mode services treat **`ClientAccount.id` AS the workspace id**
(`recommendation-confidence.service.ts`, `owner-finance/recommendation-cash-safety.service.ts`,
`private-mode/role-access.service.ts`). Adding a separate `ClientAccount.workspaceId` without reconciling this would
create a second, conflicting notion of "which workspace owns this client."
**Options.**
- (a) **Add `workspace_id` to `client_accounts`** (column + migration + backfill from `engagements[0].workspaceId`
  where present), then `ClientContact` becomes migration-free via `clientAccount: { workspaceId }`. Requires first
  deciding whether the Owner-Mode "`id` IS workspace" convention is retired or coexists. *Recommended once the
  dual-model is reconciled.*
- (b) Two-hop scope `clientAccount → engagements → { some: { workspaceId } }`. *Rejected* — indirect and breaks for
  a client with zero engagements; also doesn't fix `client-account.ts`/`engagement.ts`.
**Risk.** Higher than Lead: touches the ClientAccount identity model used across Owner-Mode. Must not be guessed.
**Tests (when chosen).** contact create/update/deactivate + client CRUD are workspace-isolated; the Owner-Mode
`ClientAccount.id`-as-workspace call sites still resolve correctly.

## DECISION 3 — createUser → WorkspaceMembership association (role)
Wave 8 fixed `createUser` to create a **global** `User` (the `email` unique + `id`/`updatedAt` fields) and stop
writing the phantom `User.workspaceId`. It does **not** create a `WorkspaceMembership`, because the create payload
carries **no role** and there is no single canonical default (seed/tests use `admin` / `member` / `owner`).
Associating the user with a workspace is a **governed role-assignment decision**.
**Options.** (a) createUser takes an explicit `role` and creates the membership in the same transaction
(*recommended* — explicit, governed); (b) keep membership creation a separate endpoint/flow (today's behaviour —
created users are global until granted a membership). **Recommendation:** (a) when the role source is decided;
until then a created user simply won't appear in `listUsers` for a workspace until a membership is granted — honest,
not a fabricated association.

## Non-blocking rationale
`leads/*` and `clients/*/contacts/*` are internal consultant-side routes; the owner shadow-pilot runtime path does
not traverse them (owner-mode resolves its own workspace/business context). The final Tier-3 audit should confirm
this. None of the above is masked: the broken services still throw honestly at runtime until the schema decision is
made — no empty-array masking, no fabricated scope.
