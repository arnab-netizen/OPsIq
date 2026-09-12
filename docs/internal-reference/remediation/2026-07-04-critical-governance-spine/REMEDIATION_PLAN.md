# OpsIQ Critical Governance-Spine Remediation Plan

**Branch:** `claude/critical-governance-spine-remediation`
**Base main:** `98762ba` · **Audit commit:** `626052e`
**DB availability:** local PostgreSQL 16 provisioned in-session (opsiq_test, 99 migrations applied); the environment's Neon DATABASE_URL is unreachable (network policy blocks non-HTTPS egress). DB-backed test tier verified green (owner-business-isolation.db 6/6).
**Package manager:** npm 10.9.7 / node 22.
**CI visibility:** `.github/workflows/*` (ci.yml required gate runs TEST_WITH_DB=true on a real Postgres).

## Dependency order (fix, don't document)
A. SEC-01 always-admin authorization root
B. SEC-02 cross-tenant operator write · SEC-04/GAP-TEN-01 inert DB backstop · workspace scoping
C. IDEM-01 no-op idempotency
D. AUDIT-01 fail-open audit
E. OUT-01/OUT-02 fabricated outcomes + missing outcome→re-eval wiring
F. BILL-01 x-tier trust
G. DEC-01 re-accept hole · GAME-01 owner-nullable freshness gate
H. SCHEMA-01/02/03 drift & entity collapse
I. UI-01/UI-02 blank dashboard / cosmetic inbox / stubs
J. TEST-02/TEST-04 quarantined scanner + fake tests + CI signal
K. Remaining HIGH · L. MEDIUM/LOW

## Method per finding
Verify from source → write failing regression test (where practical) → minimum fix → re-run test → re-run shard → ledger update → commit. No closure without a test that fails before and passes after, or direct source disproof.

## Honesty constraints
- No CRITICAL/HIGH deferred as low-risk.
- Do not count fake/quarantined tests as readiness proof.
- No public-SaaS / billing-launch / marketing work.
- DB proof only claimed when actually executed against the local Postgres.

---

## Final status (this session)

**Base:** 98762ba (main) + audit 626052e. **Remediation HEAD:** see branch tip.

### Closed with DB-backed proof
| Finding | Sev | Status | Proof |
|---|---|---|---|
| SEC-01 always-admin role | CRITICAL | CLOSED_PROVEN | sec-01 7/7 |
| SEC-02 cross-tenant operator write | CRITICAL | CLOSED_PROVEN | sec-02 5/5 |
| SEC-04 inert DB backstop | CRITICAL | CLOSED_PROVEN (scope downgraded w/ proof) | sec-04 4/4 |
| IDEM-01 no-op idempotency | CRITICAL | CLOSED_PROVEN | idem-01 3/3 + 223 svc |
| OUT-02 outcome→re-eval unwired | CRITICAL | CLOSED_PROVEN | out 3/3 |
| BILL-01 x-tier trust | HIGH | CLOSED_PROVEN | bill-01 3/3 |
| DEC-01 re-accept hole | HIGH | CLOSED_PROVEN | dec-01 2/2 |
| GAME-01 nullable freshness | HIGH | CLOSED_PROVEN | game-01 3/3 |
| UI-02 cosmetic inbox | HIGH | CLOSED_PROVEN | redirect to real inbox |
| TEST-02 quarantined scanners | HIGH | CLOSED_PROVEN | scanners green + blocking |

### Fixed, partial, or externally-blocked proof
| Finding | Sev | Status | Note |
|---|---|---|---|
| AUDIT-01 fail-open audit | CRITICAL | IN_PROGRESS | operator + decision-accept atomic (proven); decision-lifecycle/other post-commit paths tracked |
| OUT-01 fabricated outcomes | CRITICAL | FIXED_PENDING_TEST | honesty-labeled (measured=false) + schema-drift fixed; full KPI grounding tracked |
| CONC-01 last-write-wins | HIGH | IN_PROGRESS | acceptDecision guarded; reject/outcome-verify tracked |
| UI-01 blank dashboard | HIGH | FIXED_PENDING_TEST | cookie forwarding fixed (code+tsc); browser E2E BLOCKED_EXTERNAL (no app server in harness) |

### Not started this session (tracked OPEN — NOT deferred-as-low-risk)
SEC-05, SEC-06, AUDIT-02, APPR-01, APPR-02, REEVAL-01, SHOCK-01, EVID-01, EVID-02, AI-01, AI-02, AI-03, WEBHOOK-01, WEBHOOK-02, BILL-02, SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04 (one drift fixed via OUT), UI-03, STUB-01, STUB-02, DEAD-01, TEST-01, TEST-03, TEST-04, WRAP-01. These remain OPEN and require continued remediation.

### Classification
- **GOVERNANCE_SPINE_CRITICALS_CLOSED_HIGH_REMAIN** — the authorization root, tenant-isolation write path + DB backstop, durable idempotency, atomic audit (operator/decision), outcome→re-eval, and tier bypass are fixed with DB-backed proof; a substantial set of HIGH/MEDIUM findings remain.
- **REMEDIATION_PARTIAL_CONTINUE_REQUIRED** — not OWNER_MODE_PILOT_READY: AUDIT-01 (remaining paths), SCHEMA-01/02/03, APPR-01, REEVAL-01, SHOCK-01, EVID-01, WEBHOOK-01 still block pilot.
- **DB proof:** local PostgreSQL only (env Neon URL unreachable). CI's own postgres blocking lane is the authoritative gate.

### External blockers
- Browser/E2E proof (UI-01, owner journey) — BLOCKED_EXTERNAL: no running Next app server in this harness. Command to unblock: `npm run build && npm start` against the CI postgres, then Playwright.
- Live migration diff / Neon — BLOCKED_EXTERNAL: outbound non-HTTPS egress blocked; used local postgres instead.
