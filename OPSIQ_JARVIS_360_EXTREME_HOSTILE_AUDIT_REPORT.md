# OPSIQ JARVIS 360 — EXTREME HOSTILE AUDIT REPORT

Read-only. No fixes, no PR, no merge. Every claim re-verified against live code at HEAD `3019c40`.
Companion: `OPSIQ_JARVIS_360_EXTREME_HOSTILE_GAP_REGISTER.md` (28 gaps, full detail).

## 1. Executive verdict
The gap-closure pass delivered **one unambiguous win — the owner command center is now rendered and
owner-visible** — and a set of **well-tested backend primitives** (proof-gated completion, approval
resolution, arbitration, do-not-repeat scope matching, self-eval→memory, training/process triggers, a
validated archetype seed). But under hostile verification, the **owner-operating spine still does not run
on the owner's actual flow**:

- The safety gates **and** arbitration are invoked only from the **consulting `Recommendation`** pipeline
  (`consulting-engine/pipeline` → `recommendation.ts`), **not** the owner-mode `OwnerAction`/
  `OwnerRecommendation` flows that power the command center. Owner action-verify routes import **no gate**.
- The two new enforcement routes (`/api/owner/tasks/complete`, `/api/owner/approvals/resolve`) have **no UI
  caller** — the owner cannot complete a proof-gated task or trigger workload reduction from the product.
- Arbitration's chosen/rejected/what-not-to-do is **computed and audited but discarded** (return value
  ignored), so it is never persisted or shown.
- The archetype seed has **no import path**; the "service-level owner loop" exists only in a DI test that
  composes services directly — **not** the owner's runtime path, and **not** DB-proven.
- The training and process-review triggers have **no runtime caller**.
- Playwright is **actively excluded** from CI; **0** owner browser flows are proven.

**Net:** real, tested groundwork + a visible command center, but the co-pilot's enforcement, action, and
loop are either on the wrong flow, unreachable from the UI, or test-only.

## 2. Branch / HEAD / status
`claude/opsiq-jarvis-360-audit-m8jro7` · HEAD `3019c40` · working tree clean.

## 3. Commands run
`git status/branch/rev-parse/log/remote`; targeted greps for UI callers, gate callers, arbitration usage,
seed callers, trigger callers, Playwright-in-CI, proof duplicate handling; route inventory under
`src/app/api/owner`. (Read-only; no build/test mutation.)

## 4. CI evidence inspected
`ci.yml` run **28316829583** = **in_progress** on `3019c40` (PR #54, base `main`). Prior green: run
**28313889699** (`0e462a8`) — governance/tsc/migrate-deploy/build/DB-vitest/lint all green. This pass adds
**no migrations and no DB tests**, so the migration/DB composition is unchanged. `lane-b-db-test.yml`
contains a **hard guard that fails if Playwright/browser tests run** — i.e., browser E2E is deliberately not
in CI.

## 5. Complete gap register summary
28 gaps — **BLOCKER 2 · CRITICAL 5 · HIGH 9 · MEDIUM 10 · LOW 2** — plus 3 verified-closed positives
(proof SoD, workspace/RBAC/governance, rendered command center). Status spread: OPEN 6 · PARTIAL 20 ·
E2E_ONLY 1 · CLOSED 1.

## 6. Every gap and loophole found
See register EH-01…EH-31. Themes: (a) spine on the consulting flow, owner-mode ungated (EH-01,02,09,10,18);
(b) backend wired but owner-unreachable (EH-03,04,05,06,22); (c) anti-gaming partial (EH-11,12,14,30);
(d) operational primitives uninvoked (EH-07,08,17,19,20,21); (e) workload reduction test-only (EH-15,16);
(f) test/CI weakness (EH-24,25,26); (g) E2E absent (EH-23); (h) minor governance/data (EH-28,29).

## 7. Previous gaps that remain OPEN
- Owner-mode decisions ungated (strict re-audit blockers 2/5) — **still open** (EH-01/EH-02).
- Guardrails (marketing/opportunity/contract) not in a live decision (blocker 9) — **still open** (EH-19).
- Compliance not consulted by decisions (blocker 10) — **still open** (EH-20).
- SOP no task/proof binding (blocker 6) — **still open** (EH-17).
- Approval re-asks in the live flow (loophole 7) — **still open at runtime** (EH-15).
- Duplicate proof at submit/review (loophole 4) — **still open at submit/review** (EH-11).

## 8. Previous gaps PROPERLY closed
- Proof submitter≠reviewer SoD (loophole 1) — closed + tested (EH-13).
- Owner command center renders data-sufficiency/blocked/what-not-to-do/attention (loophole 10) — **closed +
  owner-visible** (EH-31); block counts now live from the audit log (was hardcoded 0).
- do-not-repeat scope/code matching (G17) — closed at the domain/service level.
- Workspace isolation / RBAC / governance on new code — clean (EH-27).

## 9. Partial / weak closures
Proof-to-completion gate (real but UI-unreachable + bypassable: EH-03/EH-14); approval resolution (real but
no live caller: EH-04/EH-15); arbitration (invoked but output discarded: EH-05); self-eval→memory (works but
only affects the consulting path: EH-09/EH-10); training/process triggers (logic closed+tested but uninvoked:
EH-07/EH-08); seed (validated but unwired: EH-06/EH-22); duplicate/freshness (completion-only: EH-11/EH-12).

## 10. Every runtime bypass
- Owner action-verify routes promote ungated (EH-02).
- Legacy action-verify completes actions without proof clearance, bypassing the new gate (EH-14).
- Owner-mode promotion never consults do-not-repeat / arbitration / cash-margin (EH-01/EH-09).
- `ownerOverride` bypasses the proof gate with only payload-level audit (EH-30).

## 11. UI / owner-visible gaps
- tasks/complete + approvals/resolve have no UI (EH-03/EH-04).
- Arbitration verdict not surfaced (EH-05).
- Reassessment-needed (self-eval) not surfaced in the command center (EH-21).
- SOP/training/process appear only as **counts**, not actionable items (EH-17 and related).

## 12. Test weaknesses
All new tests are DI/in-memory; no route-handler or DB test for the new code (EH-24); the gate regression is a
source-string grep, not behavioral (EH-25); no `[db]` loop test (EH-26); no test asserts the owner page
renders the control center (only an unrun Playwright spec).

## 13. Playwright / E2E gaps
0 owner browser flows; Playwright excluded from CI by a hard guard (EH-23). Spec 06 added but unrun.

## 14. Owner workload gaps
Reduction is real in unit tests but **test-only at runtime** — no live caller passes ownerContext or calls
resolve (EH-15); no batch/recurring/time-saved (EH-16).

## 15. Business-outcome gaps
"Accept/reject this opportunity or contract", "is this quote profitable", "what marketing now", "is this
compliance-risky" remain **query-only/manual** (EH-19/EH-20); "what should I not do" is shown from data/finance
heuristics, not from arbitration (EH-05). The owner still cannot run a real decision loop end-to-end in the app.

## 16. Security / governance risks
LOW overall: workspace isolation + RBAC preserved, 0 new governance findings, no new migrations (EH-27). Minor:
non-transactional completion audit (EH-28); override lacks a high-visibility log (EH-30).

## 17. Required implementation order
1. Route **owner-mode** promotion/action-verify through the gate spine + arbitration (EH-01/EH-02) — the single
   highest-value fix.
2. Funnel all completion through the proof-gated service; remove the action-verify bypass (EH-14); reject
   duplicates at submit/review (EH-11).
3. Persist + surface the arbitration verdict (EH-05); add tasks/complete + approvals/resolve UI (EH-03/EH-04).
4. Make owner-mode recommendation generation consult do-not-repeat memory (EH-09/EH-10).
5. Add a seed/import endpoint + a `[db]` loop test through real owner routes (EH-22/EH-06/EH-26).
6. Invoke training/process triggers from live proof-review/complaint sources (EH-07/EH-08); surface
   reassessment-needed (EH-21).
7. Wire opportunity/contract/marketing screens + compliance into live decisions (EH-19/EH-20).
8. Add a Playwright CI job and run the owner flow (EH-23).

## 18. Required tests
Route-handler tests for the new routes; a behavioral gate-coverage test (not a grep) that a mutated owner-mode
promotion is blocked; a `[db]` end-to-end owner-loop test; a duplicate-at-review rejection test; a rendered
command-center assertion (Playwright).

## 19. Required CI proof
Owner-mode gate enforcement in the DB vitest lane; a Playwright job (build + start + seed + owner specs);
arbitration-persisted assertion in CI; keep migrations additive.

## 20. Final classification
**OWNER_VISIBLE_PARTIAL.**

Justification: the owner command center is genuinely rendered and owner-visible (above SAFETY_SPINE_ONLY), and
several backend services are newly wired + tested. But it is **below** OWNER_VISIBLE_BACKEND_PROVEN /
SERVICE_LEVEL_OWNER_LOOP_PROVEN because the enforcement + arbitration run on the consulting flow rather than the
owner-mode flow, the new action/approval routes are owner-unreachable, arbitration output is discarded, the
"service-level loop" is a DI test (not the real path, not DB-proven), and training/process triggers + the seed
are uninvoked. Not REALISTIC_SIMULATION_READY_EXCEPT_E2E (no runtime seed/loop), not BROWSER_E2E_PROVEN
(0 browser flows, Playwright excluded), not OWNER_OPERATING_COPILOT_READY_FOR_PILOT (forbidden / untrue).

This is a deliberate **downgrade** from the closure report's self-assessed SERVICE_LEVEL_OWNER_LOOP_PROVEN:
the loop is proven only as a constructed DI test, not on the owner's runtime path, so the hostile audit does
not grant level 5.
