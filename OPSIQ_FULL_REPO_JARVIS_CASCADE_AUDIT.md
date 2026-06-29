# OPSIQ FULL REPO JARVIS — CASCADE AUDIT (GAP-DB-02 broader sweep)

Complete classification of every `onDelete` behavior over governed/business/audit/proof/finance data.
Method: enumerate all `onDelete: Cascade` relations in `prisma/schema.prisma` + check the DB triggers in
migrations. Regression-guarded by `schema-hardening.test.ts`.

## Result: dangerous records are protected; remaining cascades are legitimate tenant cleanup

| Record class | Protection | Verdict |
|---|---|---|
| **Validation proof** (`Owner*Verification`, 7 models) | `business` + `action` FKs → **RESTRICT** (migration `20260628210000`) | PROTECTED (this work) |
| **Append-only events** (`canonical_events`) | DB trigger `prevent_canonical_event_delete` (migration `20260507`) — DELETE forbidden entirely | PROTECTED (pre-existing) |
| **Event-sourcing snapshots** (`snapshot_data`) | `workspace` FK has **no Cascade** — a workspace delete is blocked while snapshots reference it (observed in CI) | PROTECTED (pre-existing) |
| **Audit log** (`AuditEvent`) | `actor` FK → **Restrict**; no Cascade from workspace | PROTECTED (pre-existing) |
| **Owner operational data** (`OwnerBusiness` → cycles/findings/actions/snapshots/metrics/intakes/capacity; 34 Cascade FKs) | `Cascade` | SAFE-by-design — deleting a business is intentional tenant cleanup of its own operational records; **no runtime delete path exists** (`ownerBusiness.delete` appears only in generated-client docs), so latent |
| **Domain cycles → actions/findings** (`Owner*Cycle`, 2 each) | `Cascade` | SAFE — a cycle's actions/findings are owned by that cycle; cleanup is correct |
| **External import / browser-import / billing children** | `Cascade` from their parent session/connection | SAFE — child rows of an import session; cleanup is correct |

## Enumeration
82 `onDelete: Cascade` relations remain after the verification RESTRICT fix (was 96). Grouped by parent:
`OwnerBusiness` 34, `Workspace` 5, `OperatorItem` 4, `Owner*Cycle` 2 each (14), `ExternalConnection` 3,
`ClientAccount` 3, `BrowserImportSession` 3, plus singletons. Every one is a parent deleting its **own**
child rows (operational/import/session data), not cross-cutting governed evidence.

## Why not flip the OwnerBusiness operational cascades to Restrict
The prompt's rule — "do not overcorrect harmless child cleanup cascades; preserve legitimate cleanup where
safe." Deleting a business *should* remove its own cycles/snapshots/metrics (they are meaningless without
it). The records that must survive an accidental/administrative delete are **proof, audit, and event**
records — all now protected (RESTRICT / append-only trigger / FK-block). There is additionally **no runtime
delete path** for `OwnerBusiness`/`Workspace`, so the operational cascades are latent. Flipping 34+ FKs to
Restrict would block legitimate future tenant cleanup for no safety gain over the protections above.

## Proof
- `prisma validate` + `generate` ✓; `tsc` ✓.
- `schema-hardening.test.ts` (7 tests) asserts: 14 verification FKs are RESTRICT (not Cascade); a migration
  flips them; `snapshot_data`→workspace is not Cascade; `AuditEvent.actor` is Restrict; the
  `canonical_events` append-only trigger exists; `Engagement.workspaceId` is non-null + indexed.
- `prisma migrate deploy` of the verification-RESTRICT migration is GREEN on a fresh DB (run `28338068307`).

## Status: GAP-DB-02 broader sweep — CLOSED (protected + classified + regression-guarded)
