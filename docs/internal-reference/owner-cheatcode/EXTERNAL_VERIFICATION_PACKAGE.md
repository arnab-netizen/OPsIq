# External Verification Package — closing the two blockers

Current accepted classification: **`OWNER_MODE_REAL_WORLD_PARTIAL_CONTINUE_REQUIRED`**.
This package is the exact owner-runnable procedure to close the two external blockers:

- **BLOCKED_CI_BROWSER_VERIFICATION_REQUIRED** — whole-repo suite + browser/UI E2E exceed the local execution window.
- **GAP-010 / BLOCKED_EXTERNAL_BENCHMARK_RESEARCH_REQUIRED** — verified commercial-app benchmark needs web access.

Branch under test: `claude/owner-cheatcode-full-implementation` (HEAD `4b8fe22`).

---

# PART 1 — CI / Browser Verification Checklist (GitHub Actions)

**Key fact (verified from the workflow files):** every workflow below is
**self-contained** — it spins up its own `postgres:16` service container
(`postgres/postgres/opsiq_test`) and installs Chromium in-workflow
(`npx playwright install --with-deps chromium`). **No repository secrets or
external DB/browser credentials are required.** (No `secrets.*` are referenced by
these jobs; DB is the localhost service, browser is installed per-run.)

## 1. Exact branch to run
`claude/owner-cheatcode-full-implementation`.

## 2 & 3. Exact workflows + how to trigger each

| Workflow (file) | Name | How to run on this branch | Trigger basis |
|---|---|---|---|
| `.github/workflows/ci.yml` | CI - Build & Test | **Automatic on push** (already triggers) | `on: push: branches: [main, "feature/**", "claude/**"]` — matches this branch |
| `.github/workflows/owner-pilot-e2e.yml` | Owner Pilot Browser + Mobile E2E | **workflow_dispatch** (Actions → select workflow → Run workflow → pick this branch) OR **open a PR to `main`** | `pull_request: [main]` + `workflow_dispatch` |
| `.github/workflows/owner-pilot-db.yml` | Owner Pilot DB Proof | workflow_dispatch OR PR to `main` | `pull_request: [main]` + `workflow_dispatch` |
| `.github/workflows/sequential-simulations.yml` | Sequential Simulations Pack (DB + Browser + Mobile) | workflow_dispatch OR PR to `main` | `pull_request: [main]` + `workflow_dispatch` |
| `.github/workflows/owner-e2e.yml` | Owner Browser E2E (GAP-E2E-01) | **workflow_dispatch** (pick this branch) | push (other branch) + `workflow_dispatch` |
| `.github/workflows/db-verification.yml` + per-module `module-*-runtime-proof.yml` | DB/runtime proofs | workflow_dispatch as needed | mixed |

**Simplest single action that runs the most:** open a **Pull Request from
`claude/owner-cheatcode-full-implementation` → `main`**. That one action triggers
`ci.yml`, `owner-pilot-e2e.yml`, `owner-pilot-db.yml`, and
`sequential-simulations.yml` together. (Opening the PR is verification-only; do not
merge unless you separately intend to.)

## 4. Required secrets / env assumptions
**None.** All jobs use the bundled `postgres:16` service and
`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/opsiq_test`,
`TEST_WITH_DB=true`, set inside the workflow. Playwright browser is installed by the
job. If your org enforces "Actions must be approved for this branch," approve the run.

## 5. Expected jobs
- `ci.yml`: **`build-and-test`**, **`lint`**, **`branch-protection`**.
- `owner-pilot-e2e.yml`: **`owner-pilot-e2e`** (desktop + mobile Chromium).
- `owner-pilot-db.yml`: **`owner-pilot-db`**.
- `sequential-simulations.yml`: **`sim-db`**, **`sim-browser`** (desktop + mobile).
- `owner-e2e.yml`: **`owner-e2e`**.

## 6. Expected green result
Every listed job concludes with a green check. `build-and-test` completes the full
step sequence (below) with the maintained vitest suite passing; the E2E jobs finish
Playwright with `N passed` and no `failed`.

## 7. Screenshots / log lines to capture
Capture the Actions run page (all-green) plus these log lines:
- `ci.yml → build-and-test`:
  - `✅ All routes comply with auth governance` (auth governance)
  - `✅ No NEW governance errors` (strict governance)
  - `✅ Ratchet passed (no new violations)` (wrapped-handlers)
  - the `tsc --noEmit` step green; `prisma migrate deploy` → `All migrations have been successfully applied`
  - the vitest summary line `Test Files … passed` / `Tests … passed` (maintained suite)
- `ci.yml → lint`: `lint` + `lint:ratchet` green.
- `owner-pilot-e2e` / `sim-browser`: Playwright summary `… passed (…)`, and the uploaded artifact **`owner-pilot-playwright-report`** (HTML report) + any screenshots.
- `owner-pilot-db` / `sim-db`: vitest DB summary `Tests … passed`.

## 8. Which jobs prove which requirement

| Requirement | Proving job(s) | Evidence to capture |
|---|---|---|
| Full suite | `ci.yml → build-and-test` (maintained vitest, `TEST_WITH_DB=true`, `--maxWorkers 1`) + `ci.yml → lint` | vitest `Tests … passed`; lint green |
| DB-backed E2E | `ci.yml → build-and-test` (runs `*.db.test.ts` incl. `command-center.db.test.ts`, `wealth-path.db.test.ts`) + `owner-pilot-db` + `sim-db` | DB vitest `passed` |
| Owner E2E | `owner-pilot-e2e` + `owner-e2e` (real OWNER login) | Playwright `passed` + report artifact |
| Playwright / browser UI E2E | `owner-pilot-e2e` (desktop+mobile), `sequential-simulations → sim-browser` | Playwright `passed`, screenshots, HTML report |
| Auth / workspace / audit safety | `ci.yml → build-and-test` governance:scan:auth (blocking) + workspace-isolation/auth vitest tests in the suite | `All routes comply with auth governance`; auth/workspace tests green |
| Wrapped-handler ratchet | `ci.yml → build-and-test` "Wrapped handlers ratchet" | `Ratchet passed (no new violations)` |
| Governance scan | `ci.yml → build-and-test` governance:scan:strict + governance:scan:auth | `No NEW governance errors` + auth comply |

## 9. What to do if any workflow fails
1. Open the failed job → read the first failing step's log.
2. If it is a **flaky infra failure** (DB container not ready, Playwright download, runner timeout): re-run the job ("Re-run failed jobs").
3. If it is a **real test failure**: capture the failing test name + assertion, paste it back here; I will reproduce locally (sharded / `[db]` with a local Postgres) and fix — this reopens as a local (non-blocked) gap and I continue implementation.
4. If it is a **governance/ratchet/auth** failure: that is blocking and real — paste the exact line; I fix immediately.
5. Do not mark any gate green from a partial or cancelled run.

## 10. Classification allowed if all CI/browser workflows are green
If **all** jobs in §5 are green with the §7 evidence captured, the
`BLOCKED_CI_BROWSER_VERIFICATION_REQUIRED` blocker is **CLOSED**. Combined with the
already-green local proof, that permits advancing the whole-repo/E2E/UI gates —
but the final `FULL_OWNER_MODE_REAL_WORLD_PROVEN` still additionally requires GAP-010
(Part 2) closed. Until then the correct classification is at most
`OWNER_MODE_REAL_WORLD_PARTIAL_CONTINUE_REQUIRED` (CI-green, benchmark-pending).

---

# PART 2 — Verified Commercial Benchmark Research Plan (GAP-010)

Goal: replace the provisional benchmark in `DOMAIN_BENCHMARK_LEDGER.md` with
**web-verified, cited** evidence, per domain. This requires web access (owner action
or a network-enabled run).

## Anti-fake-benchmarking rules (apply to every domain)
1. Never state an app "has/lacks feature X" without a **dated citation** (official docs / pricing / feature page, or a reputable review with date).
2. Prefer **primary sources** (vendor docs/pricing) over secondary blogs.
3. Record **retrieval date** and **source tier** (A official / B reputable review / C blog) using the existing `business-wisdom` tiering vocabulary.
4. Compare on **owner operating outcome** (§6 dimensions), not raw feature count.
5. If a capability cannot be verified, mark it `UNVERIFIED` — do not assume.
6. No classification of EQUAL/BETTER without at least one Tier-A or two Tier-B sources per compared capability.

## Per-domain plan

For every domain below: **(a) top apps**, **(b) capabilities to compare**,
**(c) source types**, **(d) evidence required**, **(e) BELOW / (f) EQUAL / (g) BETTER
criteria**, **(h) citations to add to the ledger**, **(i) implementation gaps to
reopen if OpsIQ proves weaker**.

### 1. Finance / Budget / Cash Control
- Apps: QuickBooks, Xero, Zoho Books, Tally, Wave.
- Compare: cash-runway visibility, break-even/margin analysis, discount/spend safety controls, budget authority/SoD, capital-allocation guidance, decision-blocking.
- Sources: vendor feature/pricing pages (A); accounting-software review sites with dates (B).
- Evidence: cited capability matrix; screenshot/quote per row.
- BELOW: OpsIQ cannot compute runway/break-even accurately, or lets an unsafe below-margin discount/spend through.
- EQUAL: matches core owner cash-control decisions AND adds decision-safety they lack.
- BETTER: proven that owner avoids an unsafe spend/discount/hire OpsIQ blocks that the tools would permit (owner-outcome delta).
- Add to ledger: cited rows for QuickBooks/Xero/Zoho on "does it block an unsafe discount?" (expected: no — record source).
- Reopen if weaker: `margin-safety-gate` / `cash-safety-gate` thresholds; runway/break-even accuracy tests.

### 2. Sales / Customers / Revenue
- Apps: HubSpot, Zoho CRM, Salesforce, Pipedrive.
- Compare: pipeline mgmt, follow-up sequencing, retention/reactivation, prepared scripts, proof-of-work, opportunity-cost ranking.
- Sources: vendor docs (A); CRM review sites (B).
- Evidence: cited matrix; note which generate ready-to-send owner scripts vs. templates.
- BELOW: OpsIQ produces vaguer/less-actionable customer work than a CRM template library.
- EQUAL: produces equivalent prepared customer work + proof.
- BETTER: ties the sales action to cash safety + opportunity cost + proof (CRMs don't).
- Add to ledger: cited rows on "does it rank a sales action against cash safety / opportunity cost?"
- Reopen if weaker: work-package `customer_reactivation`/`referral_request`/`review_request` artifact quality.

### 3. Marketing / Growth
- Apps: Mailchimp, Meta Ads Manager, Google Ads, HubSpot Marketing.
- Compare: campaign build, ROI/attribution tracking, spend guardrails, stop-rules, vanity-spend prevention.
- Sources: vendor docs (A); ads/marketing review sites (B).
- Evidence: cited matrix; key row "does the tool stop/deny a negative-ROI or cash-unsafe spend?"
- BELOW: OpsIQ's ROI logic weaker than platform analytics.
- EQUAL: matches campaign-plan + ROI awareness.
- BETTER: blocks vanity/negative-ROI spend under cash risk (platforms will happily spend).
- Add to ledger: cited rows on spend-safety.
- Reopen if weaker: `owner-marketing` ROI thresholds; campaign-plan stop-rule.

### 4. Operations / Delivery / Quality
- Apps: Asana, Trello, monday.com, Jira, SOP tools (Trainual).
- Compare: task boards, SOP/checklist mgmt, scaling gates, quality proof.
- Sources: vendor docs (A); PM-tool reviews (B).
- Evidence: cited matrix; row "does it prevent scaling an unstable operation?"
- BELOW: OpsIQ's ops tracking thinner than a mature PM tool for the owner's needs.
- EQUAL: matches SOP/checklist/task-board owner needs.
- BETTER: scale-readiness gate blocks premature scaling; ops proof.
- Reopen if weaker: `scale-readiness` signals; ops work-package artifacts.

### 5. Workforce / Training / Accountability
- Apps: BambooHR, Deputy, When I Work, Trainual.
- Compare: scheduling, HR records, training plans, proof-of-completion, fake-work detection.
- Sources: vendor docs (A); HR-tool reviews (B).
- Evidence: cited matrix; row "does it detect fake completion / require proof of work quality?"
- BELOW: OpsIQ weaker on scheduling/HR records (intentional — not the target).
- EQUAL: matches training/accountability owner needs.
- BETTER: fake-completion detection + proof enforcement (HR tools don't).
- Reopen if weaker: `verification-engine` / proof thresholds.

### 6. Compliance / Risk / Governance
- Apps: ClearTax (tax), legal-compliance SaaS, license trackers, Vanta/Drata (security compliance).
- Compare: jurisdiction-specific content, filing, license/expiry tracking, risk gating, escalation.
- Sources: vendor docs (A); compliance review sites (B).
- Evidence: cited matrix. **Honesty caveat:** OpsIQ must NOT claim verified legal content — it is a confidence-gate/escalation layer.
- BELOW: OpsIQ hallucinates a compliance answer (must be ZERO — already gated).
- EQUAL: correctly gates + escalates uncertain compliance to professional review.
- BETTER: prevents unsourced/guru advice from driving a high-risk compliance action (tools that provide content don't gate the owner's other decisions).
- Reopen if weaker: `compliance-gate` fail-closed thresholds; `business-wisdom` high-risk blocking.

### 7. Strategy / Expansion / Scaling
- Apps: LivePlan, business-plan/OKR tools, Bizplan.
- Compare: planning, forecasting, OKRs, stop/pivot/sell/exit honesty, risk-adjusted ranking.
- Sources: vendor docs (A); planning-tool reviews (B).
- Evidence: cited matrix; row "does it ever recommend sell/exit/stop-investing on evidence?"
- BELOW: OpsIQ's planning shallower than a dedicated planner.
- EQUAL: matches planning owner needs.
- BETTER: wealth-path classifier + risk-adjusted ranking + uncomfortable-verdict honesty (planners are optimism-biased).
- Reopen if weaker: `wealth-path` / `risk-adjusted-wealth` rubrics.

## What to add to DOMAIN_BENCHMARK_LEDGER.md after research
Replace each domain's "PROVISIONAL" note with a cited capability matrix (source,
tier, retrieval date), a final owner-outcome classification, and the evidence link.
Only then may a domain be marked BETTER_FOR_OWNER_USE_CASE on verified evidence.

---

# PART 3 — Post-Blocker Final Audit Plan

Run only **after** Part 1 (CI/browser green) and Part 2 (benchmark research cited)
are complete.

## Sequence
1. Confirm CI package (Part 1) all-green with captured evidence; update `PHASE_COMPLETION_REPORT.md` phase-state table (Phase 34 → COMPLETE with CI run URLs).
2. Confirm `DOMAIN_BENCHMARK_LEDGER.md` has cited matrices for all 7 domains; each domain classified EQUAL_FOR_OWNER_USE_CASE or BETTER on verified evidence; close GAP-010 → `CLOSED_PROVEN` with citations.
3. Re-run the local proof suites to confirm no regression: real-world-wealth (10/10 ≥ threshold), real-world-startup (10/10 ≥ 90), simulation (17), domain-hardening (8), owner-strategy full suite.
4. Confirm `REAL_WORLD_PROOF_LEDGER.md` rows all reference the green CI run + commit.
5. Run the final hostile audit (HOSTILE_AUDIT_CHECKLIST early-stop + fake-complete + scope-narrowing sections) and record conclusion `PASS_FULL_SCOPE_COMPLETE`.
6. Verify `GAP_REGISTER.md` has zero OPEN/PARTIAL critical/high gaps and zero BLOCKED_* items remaining.

## Gate for FULL_OWNER_MODE_REAL_WORLD_PROVEN (all must hold)
- [ ] CI `build-and-test` + `lint` + `branch-protection` green (full suite + governance + ratchet + tsc + DB).
- [ ] `owner-pilot-e2e` + `owner-e2e` + `sim-browser` green (browser/UI E2E, desktop + mobile).
- [ ] `owner-pilot-db` + `sim-db` green (DB-backed E2E).
- [ ] Wealth Phase real-world 10/10 ≥ threshold, 0 critical safety failures.
- [ ] Startup Mode real-world 10/10 ≥ 90, 0 reckless-launch.
- [ ] All 7 domains benchmark-classified EQUAL/BETTER on **verified** evidence (GAP-010 closed).
- [ ] Before-vs-after improvement proven for every major scenario.
- [ ] Gap register: zero open critical/high, zero BLOCKED_* remaining.
- [ ] Evidence ledgers complete with CI run URLs + commit hashes.
- [ ] Final hostile audit conclusion = `PASS_FULL_SCOPE_COMPLETE`.

Only when **every** box is checked may the classification become
`FULL_OWNER_MODE_REAL_WORLD_PROVEN`. Until then it remains
`OWNER_MODE_REAL_WORLD_PARTIAL_CONTINUE_REQUIRED`.
