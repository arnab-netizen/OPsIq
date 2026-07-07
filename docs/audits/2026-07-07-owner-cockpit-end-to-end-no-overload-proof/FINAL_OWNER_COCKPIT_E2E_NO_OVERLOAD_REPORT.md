# FINAL — Owner Cockpit End-to-End No-Overload Browser Proof (PASS 40)

**Date:** 2026-07-07 · **Branch:** `claude/owner-cockpit-end-to-end-no-overload-proof`
**Base main:** `22febb55` (contains PR #171 — public-signal surface)
**Classification:** `OWNER_COCKPIT_E2E_NO_OVERLOAD_PROVEN` (subject to owner-pilot-e2e green on the PR)

## Objective
Prove — with a hostile eye for cognitive overload and forbidden output — that the canonical owner cockpit
(`/owner/cockpit`) stays a **single clear next step** across every owner journey, keeps every other surface
collapsed, and never emits a guarantee, a fabricated figure, a hidden score, an autonomous-action claim, raw
public text, or PII. No new product surface is built; this pass is **proof only** over the already-proven
PASS 36–39 cockpit.

## What was added
- **`tests/browser/47-owner-cockpit-end-to-end-no-overload.spec.ts`** — real app + real backend, one OWNER
  login, walks journeys A–G with `window.prompt`/`window.alert` trapped to throw (any use is a failure),
  every collapsible expanded for the forbidden-copy sweep, and an unauthenticated context for the E journey.
  Wired into the `owner-pilot-e2e` CI lane.
- **`src/__tests__/components/owner-cockpit-no-overload.test.tsx`** — the deterministic companion: drives the
  SAME `MinimumOwnerCockpit` across all journeys, pins the exact clean-workspace state (F), the no-overload
  limits (G), the labelled-input-never-prompt control path (D), and the full forbidden-copy matrix. 9/9.

## Journeys proven
| Journey | What it proves | Browser | Component |
| --- | --- | --- | --- |
| A — normal | exactly one top governed action + why/owner-decision/reassessment | ✓ | ✓ |
| B — crisis recovery | recovery section collapsed; expands to a **no-guarantee** caveat; no forbidden copy | ✓ | ✓ |
| C — public signal | signals section collapsed; expands to the **no-live-ingestion** boundary; no raw text/PII/money | ✓ | ✓ |
| D — action controls | a reason action opens a **labelled inline form**, never `window.prompt`; evidence required to submit evidence | ✓ | ✓ |
| E — unauthorized | unauthenticated nav → `/login`; `GET /api/owner/public-signals` fails closed (no `publicSignalStatus`, non-200) | ✓ | n/a |
| F — clean workspace | exactly one honest state (top action **XOR** clean), never a fabricated hybrid; clean = honest empty, no invented action | ✓ (contract) | ✓ (exact) |
| G — no-overload | 1 top action · ≤3 reason bullets · ≤2 primary buttons · ≤3 secondary controls · every section collapsed | ✓ | ✓ |

## Forbidden output (any occurrence FAILS a test)
guaranteed recovery/profit/success/survival · "we guarantee" · predicted/projected ROI · win probability ·
auto-submit / auto-contact / automatically submit·contact·spend·discount·contract · fire/discipline/sack/
dismiss/reprimand staff · live internet intelligence · "AI found this online" · scraped from the web ·
fully autonomous / acts on its own / without your approval · raw prompt-injection (ignore previous
instructions / system prompt / disregard the above) · fabricated money (`[$£€]\d`) · hidden score · raw PII
(email / mobile number). The regexes are written to **not** match the cockpit's SAFE negated copy (e.g. "OpsIQ
never … contact customers, submit tenders, spend, discount, or contract on its own").

## Honest coverage split (not a skip)
The clean-workspace state (F) is unreachable in the seeded owner-pilot lane because the seed always yields a
bridged top action for the workspace. So the browser proves the **contract** (exactly one honest state renders,
never a hybrid) and the component test pins the **exact** clean state (`bridge=null` and empty-`routes` bridge →
honest empty, no invented action, sections still collapsed). Same explicit split PASS 39 used for its DB/unit
boundary. The non-owner **authenticated** 403 is proven by the existing RBAC spec + route capability gate; this
pass proves the **unauthenticated** fail-closed path (no seed dependency).

## Gates run (local)
tsc ✓ · governance:scan (0 new; 31 frozen) ✓ · lint:ratchet (0 new) ✓ · component suite 4 files / 55 tests ✓
(incl. new 9) · Playwright `--list` discovers all 8 spec-47 tests ✓ · local browser run of spec 47 against a
throwaway Postgres 16 + built app (see EVIDENCE_LEDGER.json `localBrowserRun`).

## Classification justification
Every owner journey renders one clear next step with its safety frame; every other surface is collapsed by
default; the no-overload limits hold; recovery never guarantees; public signals never claim live ingestion or
leak raw text/PII; action inputs are labelled controls (prompt/alert trapped); the URL cannot bypass the gate
and the API fails closed; the clean state fabricates nothing. Browser + component proof both green locally; the
owner-pilot-e2e lane runs spec 47 on the PR. → `OWNER_COCKPIT_E2E_NO_OVERLOAD_PROVEN`.
