# Acceptance fixture authority — least-privilege design

Status: **IMPLEMENTED in code; NOT GRANTED to any Production identity.**
`PRODUCTION_ROLE_CHANGES = 0` · `PRODUCTION_CAPABILITY_GRANTS = 0` · `SYSTEM_ADMIN_GRANTED_TO_ACCEPTANCE_ACCOUNT = NO`

Builds on `ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md` (an explicit fixture request either creates a true fixture or
creates nothing).

## 1. Findings (from the code, not assumed)

1. **Why acceptance needs fixture authority.** Production acceptance must create synthetic businesses and Startup
   sessions/blueprints that never appear in ordinary owner lists. Only the fixture flag provides that provenance.
2. **Exact operations required.** (a) create one fixture `OwnerBusiness` per domain run; (b) create one fixture
   Startup session; (c) create one fixture Startup blueprint for that session; (d) prove authority *before* (a)–(c).
   Everything else the acceptance run does (analysis, decisions, status changes, handoff) uses ordinary owner
   capabilities the account already holds.
3. **What `SYSTEM_ADMIN` permits beyond that.** `ROLE_CAPABILITIES[SYSTEM_ADMIN] = Object.values(CAPABILITIES)`: user
   create/update/deactivate and **role assignment**, audit view/export, all `/api/admin/*` operator surfaces
   (workspaces, customers suspend/restore/revoke-sessions, beta cohort, billing diagnostics, platform settings),
   and **cross-workspace** fixture enumeration (`GET /api/admin/fixture-businesses?workspaceId=<any>`).
4. **Narrower capability?** Yes. The repo already has the pattern: `BETA_REQUEST_OPERATOR` and
   `ADMINISTRATION_OPERATOR` are purpose-built roles whose bundles are exactly their narrow capabilities, are
   additive to a user's other roles, sit at hierarchy level 5, are listed in `INTERNAL_ROLES` and
   `INTERNAL_ONLY_CAPABILITIES`, and are provisioned out of band by a dry-run-by-default script with a confirm phrase.
5. **Can it reach ordinary users?** Only through a `UserRoleAssignment` row with the new role. It is in no existing
   bundle (`OWNER_SCOPED_CAPABILITIES`, `ADMIN_OR_PORTFOLIO_MANAGER`, consultant tiers, client roles).
6. **Identity type.** An ordinary app user (email/password session). Per owner evidence: `WorkspaceMembership.role =
   owner`, roles `admin_or_portfolio_manager` (narrowed to owner capabilities), `beta_request_operator`,
   `administration_operator`; no `system_admin`.
7. **Machine/service identity?** `verifiedActorType: "service"` exists in the type, but no machine-credential issuance
   path exists for HTTP routes. Introducing one is a far larger change; rejected.
8. **Scoped and auditable?** Yes: the capability is checked by the canonical wrapper on every request, the tenant is
   always `ctx.verifiedWorkspaceId`, and every create emits the service's own audit event plus
   `acceptance_fixture.created`.
9. **No general admin surface.** Fixture creation moves to four dedicated routes under
   `/api/admin/acceptance-fixtures/*` that require only the new capability. The existing global
   `/api/admin/fixture-businesses` stays `SYSTEM_ADMIN`-only.
10. **If stolen/misassigned.** The holder can create more *isolated, owner-invisible* fixture rows in its **own**
    workspace and nothing else: no read of anyone else's data, no role/user admin, no non-fixture rows, no updates or
    deletes of existing rows.

## 2. Why not the obvious design

The three owner routes (`POST /api/owner/recovery/businesses`, `/api/owner/startup/sessions`, `.../blueprint`)
currently honor a request-body flag for `SYSTEM_ADMIN`. Swapping that gate for a narrow capability would
(a) change a protected route capability set, which the Owner feature-preservation gate
(`PRESERVATION_CHANGE_PROCESS.md`) only allows with the owner's explicit written approval and a regenerated
baseline, and (b) leave a body flag that can still be sent on a *normal* owner route.
Dedicated routes avoid both: owner routes and their baseline are untouched, and the new routes have **no flag at
all** — they can only create fixtures, so a "silent downgrade to an ordinary row" is impossible by construction.
Blanket `SYSTEM_ADMIN` was rejected for the privilege excess listed in finding 3.

## 3. Contract

* Capability `ACCEPTANCE_FIXTURE_WRITE` (`acceptance_fixture:write`). Role `ACCEPTANCE_FIXTURE_OPERATOR`
  (`acceptance_fixture_operator`) = exactly that capability.
* `SYSTEM_ADMIN` still passes the gate (its bundle is every capability) — no second code path.
* Routes (all `requireCapabilities: [ACCEPTANCE_FIXTURE_WRITE]`, `requireWorkspace: true`):
  `GET …/capability` (preflight: same gate as the writes, no data), `POST …/businesses`,
  `POST …/startup-sessions`, `POST …/startup-sessions/[sessionId]/blueprint`.
* Fixture-only: services are called with the fixture flag hard-wired to `true`; request bodies containing
  `isFixtureBusiness`/`isFixtureRecord` are rejected (strict schemas).
* Blueprint creation is allowed **only** for a session that is itself a fixture in the caller's workspace, so the
  capability cannot be used to mark a *real* owner's records as fixtures (which would hide them).
* Authorization is evaluated by the wrapper before the handler runs; a missing capability yields 403 with zero
  rows and zero audit events.
* Acceptance helpers call the capability route as their preflight and the same routes to create; a static test
  asserts every route under `/api/admin/acceptance-fixtures` declares exactly the same gate, so preflight and
  write authority cannot drift.

## 4. Attack review

| # | Question | Result |
|---|---|---|
| 1 | Ordinary owner acquires it? | No: not in any bundle; only via an explicit role row (test A, bundle tests) |
| 2 | Workspace-admin/owner roles inherit it? | No: bundles are explicit lists (test) |
| 3 | Compromised account gets SYSTEM_ADMIN reach? | No: role bundle is one capability (test F, G) |
| 4 | Create non-fixture rows? | No: no flag; fixture hard-wired (test) |
| 5 | Fixture request stripped/downgraded? | No: strict schema rejects flag; fixture hard-wired |
| 6 | Another tenant's data? | No: tenant is `verifiedWorkspaceId`; no workspace parameter |
| 7 | Enumerate fixtures globally? | No: no list route; global list stays SYSTEM_ADMIN |
| 8 | Invoke unrelated `/api/admin/*`? | No: those require other capabilities (test F) |
| 9 | Pass authorization but create ordinary business? | No: single code path, fixture literal |
| 10 | Handoff leaks fixture data? | No: handoff copies the flag (PR #632; test H/I) |
| 11 | Authorization after a write? | No: wrapper runs before the handler |
| 12 | Malformed request bypass? | Strict body schemas fail closed with 400 before any write |
| 13 | Missing capability → partial write? | No: 403 before handler (test A/L) |
| 14 | Audited? | Service audit + `acceptance_fixture.created`; role grants audited by the provisioning script |
| 15 | Becomes a backdoor? | Residual: see below |

**Residual risks.** (1) `POST /api/users/[userId]/roles` validates against `Object.values(ROLES)`, so a holder of
`USER_ASSIGN_ROLE` with hierarchy level > 5 could assign the new role, exactly as for the two existing operator
roles. Impact is limited to the capability's own bounds. (2) A holder can create unbounded fixture rows in its own
workspace (storage noise, no data exposure). Both are covered by the rollback below.

## 5. Privilege delta

Identity that would receive it: the Production acceptance user (`PRODUCTION_ACCEPTANCE_EMAIL`), workspace-scoped to
its own workspace. Delta: **+ `acceptance_fixture:write`**, nothing else. Not granted by this change.

## 6. Activation (owner decision, separate from this change)

`scripts/provision-acceptance-fixture-operator.ts` (dry run by default; requires `--expected-database-host`,
`--workspace-id`, and the exact confirm phrase `GRANT ACCEPTANCE FIXTURE OPERATOR` with `--apply`). No migration, no
schema change, no further code deployment. Rollback: the same script with `--revoke` and
`REVOKE ACCEPTANCE FIXTURE OPERATOR`; revocation takes effect on the next request (capabilities are resolved per
request). Until granted, acceptance specs stop at the preflight with `FIXTURE ISOLATION UNAVAILABLE`.
