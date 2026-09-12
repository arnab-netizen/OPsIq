# FINAL — Real Public Business Data Shadow Run (PASS 43)

**Date:** 2026-07-07 · **Branch:** `claude/real-public-business-data-shadow-run`
**Base main:** `6902f5eb` (contains PASS 41 #173 + PASS 42 #174)
**Classification:** `REAL_PUBLIC_BUSINESS_SHADOW_RUN_PROVEN` — *controlled shadow behaviour on public data; not real-world outcome proof.*

## Objective
Use real, publicly available business data to build privacy-safe, anonymized public-business shadow fixtures and
run them through OpsIQ's proven owner cockpit / execution / recovery / public-signal harness — proving OpsIQ
handles real public signals conservatively, usefully, and safely. OpsIQ itself performs **no** live
fetch/scraping/connector/LLM; there is **no** live internet intelligence.

## 1. Public cases selected (4)
- **BUSINESS_A** — laundry/dry-cleaning local service (delivery-delay + garment-quality complaints, positive praise, a stale public cleaning tender).
- **BUSINESS_B** — restaurant/hospitality (wait-time + order-accuracy complaints, plus an adversarial PII/injection review).
- **BUSINESS_C** — project-management SaaS (support/onboarding/pricing complaints, conflicting ease-vs-learning-curve reviews).
- **BUSINESS_CLEAN** — control (no public signals).

## 2. Archetypes covered
Local service (laundry), hospitality/restaurant, SaaS (project-management), and public tender/procurement (as the BUSINESS_A opportunity signal). Minimum coverage met.

## 3. Source count / 4. Signal count
14 source-ledger items across 10 public domains (BBB, UK Contracts Finder / Find a Tender, GuestMetrix, UpMenu, Compttr, Paymo, G2, …); **13 public signals classified** (12 usable + 1 DO_NOT_USE) covering STRONG/WEAK/CONFLICTING/STALE/MONITOR_ONLY/VALIDATION_REQUIRED/DO_NOT_USE.

## 5. Privacy / redaction result
Real business names appear only in the internal source ledger; fixtures/cockpit use BUSINESS_A/B/C. No PII, no personal identifiers, no financials fabricated. Observations are theme-level and non-defamatory ("Public review signals suggest possible …"). An adversarial raw review embedding an email, phone, and prompt-injection was seeded for BUSINESS_B and proven **stripped** (DB test 4). A `DO_NOT_USE` review naming an individual is redacted and excluded.

## 6. Top action correctness
Every public risk case → `CREATE_CORRECTION_TASK` (fix the underlying issue with proof), matching the predeclared conservative expectation. The public tender is **not** the top action — quality is fixed first, and the tender is stale + blocked from auto-submit. Clean case → none. Decision matrix: 4/4 match, 0 mismatch.

## 7. Missing-data handling
All internal financials/rates (defect rate, wait-time, churn, margin, cash, capacity) are **unknown → missing-data requests**, never fabricated.

## 8. Public uncertainty handling
Every active public-signal read is `validationRequired = true` (unverified), carries the uncertainty caveat, and states the no-live-ingestion boundary.

## 9. Conflict handling
The conflicting SaaS reviews (ease vs steep learning curve) are retained as a conflicting public signal requiring validation — never resolved into a "fact".

## 10. Owner cockpit behaviour
Browser spec 49 (4/4 local): one honest state, one top action with why-first, Outside signals collapsed → public-uncertainty caveat + no-live-ingestion, unsafe actions blocked, no PII / raw dump / fake financials.

## 11. DB sim result
`real-public-business-shadow-run.db.test.ts` — **12/12** on real Postgres 16 (`TEST_WITH_DB=true`), wired into LANE_B (required) + LANE_A. CI must show the file executed in the LANE_B log — not a generic green lane.

## 12. Browser result
`49-real-public-business-shadow-run.spec.ts` — **4/4** locally (built app + seeded workspace + real Chromium); wired into `owner-pilot-e2e`; confirmed green on the PR.

## 13. Limitations
Controlled shadow behaviour on public data — NOT real-world outcomes. Recovery-status active-state derivation from live business data is covered by PASS 37 (this proves read safety + the governed journey). BUSINESS_B uses the `unknown` archetype (no restaurant archetype in the enum). No live connectors (frozen).

## 14. Ready for owner self-use readiness audit?
**Yes** — the public-data shadow run confirms conservative, safe public-signal handling; PASS 44 now audits whether the owner can log in and use OpsIQ manually.

## 15. Ready for a live pilot?
**Not yet** — a live pilot needs real (redacted) data, the owner operating the cockpit, and a fresh safety pass. Private owner data is intentionally not used yet.

## 16. Exact next safest pass
**PASS 44 — Owner Self-Use Production Readiness Hostile Audit**: determine whether the owner can safely log in, enter business details manually, review outputs, approve material actions, and perform all real-world implementation manually, with no live integrations or autonomous action.

## Gates (local)
prisma validate ✓ · tsc ✓ · governance:scan:strict (0 new) ✓ · lint:ratchet (0 new) ✓ · DB sim 12/12 ✓ · browser 4/4 ✓ · next build ✓.

## Classification justification
≥3 real public cases; source ledger exists; public data redacted/anonymized; no PII leaks (adversarial strip proven); expectations declared before execution; DB sim runs in LANE_B; cockpit path works; top action correct (4/4 match); public uncertainty visible; owner-approval/evidence/reassessment gates hold; unsafe actions blocked; no fake financial/recovery/success claim; cockpit low-load. → `REAL_PUBLIC_BUSINESS_SHADOW_RUN_PROVEN` (shadow behaviour only, not real-world outcome).
