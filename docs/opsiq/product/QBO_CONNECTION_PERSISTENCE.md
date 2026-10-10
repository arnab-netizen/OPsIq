# QuickBooks Online — business-scoped connection persistence

`QBO_READ_ONLY` · `PRODUCTION_MIGRATION_REQUIRED=YES` (`20261008090000_qbo_connection_tenancy_persistence`, additive) · `NO_EVIDENCE_ADOPTION` · `NO_WRITE_API` — _the original `NO_OWNER_SURFACE` / `NO_SYNC` limits were lifted by the reviewed read-only sync slice; see `QBO_READ_ONLY_SYNC.md`_

## Architecture decision: `QBO_SPECIFIC`
The generic `ExternalConnection` is unique per `(workspace, provider)` and has no business, realm or environment; `ExternalOAuthToken` has no rotation fence or refresh expiry. Per-business realms cannot be represented there without changing legacy Google Sheets connector semantics, so three QBO tables are added and the shared `encryptOAuthToken()` / `decryptOAuthToken()` (AES-256-GCM, workspace-bound HKDF key) is reused unchanged. No second crypto, no parallel generic framework.

## Tables (all tenant-keyed by composite FK to `owner_businesses(id, workspace_id)`)
- `qbo_oauth_states` — one-time authorization intent: SHA-256 `state_hash` only (DB CHECK on format), workspace, business, initiating actor, environment, scope, `expires_at`, `consumed_at`, `finalized_at`.
- `qbo_connections` — workspace + business + environment + realm; status `ACTIVE | REAUTH_REQUIRED | ERROR | DISCONNECTED`. "Pending" is an unconsumed/unfinalized state row; a connection row is created ACTIVE only inside the finalize transaction.
- `qbo_connection_tokens` — `v1gcm.*` ciphertext (DB CHECK), access/refresh/hard expiries, granted scope, optional Intuit tid, `revision` fence.

## Realm uniqueness policy
| Case | Result |
| --- | --- |
| same business reconnects same realm | same row reactivated, token revision increments |
| same realm, different business (same or other workspace) | `REALM_ALREADY_BOUND`; nothing overwritten; no foreign identifiers returned |
| different realm, same business, same environment | `BUSINESS_BOUND_TO_OTHER_REALM` until explicit disconnect |
| two realms for two businesses in one workspace | allowed |
| sandbox vs production | separate namespaces, always explicit (no default) |
| disconnected realm | released; history row kept |

Enforced by service checks under advisory locks AND by partial unique indexes `qbo_connections_live_realm_key (environment, realm_id)` and `qbo_connections_live_business_env_key (workspace, business, environment)` where `status <> 'DISCONNECTED'`.

## Service (`src/services/quickbooks/qbo-connection.service.ts`)
`beginQboAuthorization` → `consumeQboAuthorizationState` (single conditional UPDATE; typed `INVALID_STATE | EXPIRED | ALREADY_CONSUMED | CONTEXT_MISMATCH`; foreign-workspace state reads as `INVALID_STATE`) → (caller exchanges the code) → `finalizeQboConnection` (one transaction). Also `rotateQboTokens` (CAS on `revision`, typed `STALE_REVISION`), `loadQboTokensForUse` (server-side only), `markQboReauthorizationRequired`, `disconnectQboConnection`, `listQboConnectionsForBusiness` (token-free).

## Migration safety
Additive only; three new empty tables; no existing uniqueness changes (no preflight data dependency). Tested only on throwaway loopback Postgres. NOT applied to production here; production application goes through the owner-approved `migrate-production.yml` workflow before this change is deployed.

## Known limitations
- (Superseded by `QBO_READ_ONLY_SYNC.md`: `refreshQboTokens` is now invoked by `getUsableQboAccessToken`; sync, status and webhook routes and the `qbo-read-sync` scheduler task exist. Still no UI.)
- `disconnectQboConnection` is local and removes the token ciphertext; revoking the grant at Intuit is the caller's step. The connect callback revokes a just-issued grant it will not keep **only** when it is certain the grant is not stored and no not-disconnected connection holds the verified company (an Intuit revocation may be app/company-wide). It deliberately leaves the grant live — to be revoked by an operator at Intuit — when another connection holds the company (`REALM_ALREADY_BOUND`), when the one-time state was lost to a race, when the finalize commit outcome is unknown, when the holder lookup fails, and when the revocation request itself fails. A token-rotation loser discards its own freshly rotated refresh token unrecorded (Intuit's old/new overlap makes this benign).
- A state consumed but whose code exchange fails is burned (the user restarts authorization).
- No business-condition re-evaluation hook yet: nothing consumes QBO data until the sync/evidence slice.
- Actor ids are recorded, not FK-linked, matching the owner-outcome tables; capability checks belong to the future route layer.
