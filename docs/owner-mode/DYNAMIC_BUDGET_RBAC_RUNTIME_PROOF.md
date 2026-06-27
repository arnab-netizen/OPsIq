# Dynamic Budget — Runtime RBAC / Least-Privilege Denial Proof

Goal: convert the prior "static enforcement wiring + service-layer workspace isolation"
RBAC status into **runtime proof** — exercise the real route → canonical wrapper →
capability/workspace evaluation → handler chain for both allowed and denied actors,
wherever the architecture allows.

This slice adds **no budget features**. It only adds proof. Gate 10, `execution.md`,
billing/stripe, and public SaaS are untouched.

## 1. Routes that exist

| # | Route | Method | Capability | Read/Write |
|---|---|---|---|---|
| 1 | `/api/owner/budget/guidance` | GET | OWNER_VIEW | read |
| 2 | `/api/owner/budget/snapshots` | GET | OWNER_VIEW | read |
| 3 | `/api/owner/budget/forecast` | GET | OWNER_VIEW | read |
| 4 | `/api/owner/budget/authority` | GET | OWNER_VIEW | read |
| 5 | `/api/owner/budget/authority` | POST | OWNER_MANAGE | write |
| 6 | `/api/owner/budget/actions` | GET | OWNER_VIEW | read |
| 7 | `/api/owner/budget/actions/[actionId]` | PATCH | OWNER_MANAGE | write |
| 8 | `/api/owner/budget/override` | POST | OWNER_MANAGE | write |
| 9 | `/api/owner/budget/spend` | POST | OWNER_MANAGE | write |

All routes are wrapped by `withCanonicalEnforcement(handler, { requireWorkspace: true,
requireCapabilities: [...] })` (`src/lib/canonical-route-enforcement.ts`).

## 2. Required capability per route
Reads require `OWNER_VIEW`; writes require `OWNER_MANAGE`. (See table above.)

## 3. Sensitive data exposed by each route
- guidance/snapshots/forecast: budget mode, confidence, next best action, cash/profit/
  runway figures, forecast scenarios, plan snapshots.
- authority: employee/manager budget-authority restrictions + reasons.
- actions (GET): persisted execution tasks — title, decision type, accountable role,
  required proof, expected financial impact, verification method, escalation path, status.
- actions (PATCH) / override / authority(POST) / spend: mutate governed budget records.

None of this may be returned to an actor lacking `OWNER_VIEW`, nor across workspaces.

## 4. How the runtime auth pipeline works (what the tests exercise)
`withCanonicalEnforcement` (real, not mocked):
1. `getSessionFact()` / `getPolicyContextFact()` — the auth boundary (`@/services/auth`).
2. **Workspace is derived server-side** from `db.workspaceMembership.findFirst({ userId,
   isActive: true })` — never trusted from the request. No active membership ⇒ `403`.
3. Capabilities are derived from the policy's roles via the **real** role→capability
   mapping (`hasCapability` / `resolveCanonicalCapabilities`), then `evaluateAuthState`
   rejects with `403` if a `requireCapabilities` entry is missing.
4. Only on success is the handler invoked with `ctx.verifiedWorkspaceId` /
   `ctx.verifiedActorId` / `ctx.verifiedCapabilities`.

## 5. Test strategy
Two layers, both invoking the **real exported route handlers** (never calling services
directly, never bypassing the wrapper):

- **Unauthenticated layer** (`src/__tests__/owner-budget/rbac-unauth.test.ts`): no auth
  mock. The real `getSessionFact` finds no session, so the wrapper fails closed. Asserts
  every budget route returns non-`200` and leaks no budget/action data.
- **Authorized/denied layer** (`src/__tests__/owner-budget/rbac-runtime.test.ts`): mocks
  **only** the `@/services/auth` boundary (session + policy roles), seeds **real**
  `User` / `Workspace` / `WorkspaceMembership` / `OwnerBusiness` / `OwnerBudgetAction`
  rows, and invokes the real wrapped handlers so the wrapper's real workspace-derivation
  + real role→capability evaluation run. Roles used are **real** (`ADMIN_OR_PORTFOLIO_MANAGER`
  grants OWNER_VIEW+OWNER_MANAGE; `ANALYST` grants neither).

The denial path is always exercised (never mocked to "allow"); both allowed and denied
cases hit the real wrapper.

## 6. What can be runtime-tested (achieved)
Through the real route + real wrapper:
- unauthenticated → denied (all routes), no data leak;
- authenticated but **no workspace membership** → denied (`403`);
- authenticated, membership present, **lacks OWNER_VIEW** → read denied (`403`);
- authenticated, membership present, **lacks OWNER_MANAGE** → write denied (`403`);
- authorized **OWNER_VIEW** → read allowed (`200`);
- authorized **OWNER_MANAGE** → write allowed (`200`, DB mutated);
- **foreign-workspace** actor (membership in workspace B, record in workspace A) → read
  returns nothing / write denied, foreign record unchanged, existence not leaked.

## 7. What remains static-only / not runtime-expressible
- **"OWNER_VIEW but NOT OWNER_MANAGE" gradient actor.** No role in the current model
  (`src/policies/capability-check.ts`) grants `OWNER_VIEW` without also granting
  `OWNER_MANAGE` (only `ADMIN_OR_PORTFOLIO_MANAGER` and `SYSTEM_ADMIN` grant owner caps,
  and both grant both). So the *exact* "can read but cannot write" actor cannot be
  expressed via real roles without inventing a fake role (forbidden by the no-fake-proof
  rule). Instead the **write gate is proven** via a membership role that lacks
  OWNER_MANAGE (`ANALYST` → write `403`), and the **read gate** via a role lacking
  OWNER_VIEW (`ANALYST` → read `403`); the authorized owner (admin) is allowed both.
  This is a role-model fact, not a harness limitation.
- The route-wiring static proofs (capability literals, `requireWorkspace`, no client
  workspace trust) remain in `src/__tests__/owner-budget/routes.test.ts`.

## 8. Why the limitation exists
The product's RBAC model treats Owner Mode as a single owner surface (view + manage held
together by the owner/admin role). A view-only owner sub-role does not exist; introducing
one would be a new feature, which is out of scope for this proof-only slice.

## Classification
`DYNAMIC_BUDGET_RBAC_RUNTIME_PARTIAL` — runtime route authorization is proven for every
expressible actor (allowed **and** denied, through the real wrapper), across reads,
writes, and cross-workspace isolation. It is classified **PARTIAL** (not PROVEN) solely
because the "OWNER_VIEW-without-OWNER_MANAGE" gradient actor is not expressible in the
current role model; that single matrix cell is documented, not exercised. Service/DB-level
workspace isolation for budget actions remains independently proven by the PR #43
`[db]` suite.

Owner Mode overall remains **NOT OWNER_MODE_READY** (Browser/E2E, live feeds,
working-capital ageing buckets, archetype packs still pending).
