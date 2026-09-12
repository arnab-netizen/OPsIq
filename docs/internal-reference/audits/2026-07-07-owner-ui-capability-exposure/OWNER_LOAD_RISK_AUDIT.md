# Owner Load Risk Audit (PASS 35)

**Date:** 2026-07-07. Where the owner UI could overwhelm the owner, and what the
PASS 36 canonical cockpit must do about it.

## 1. Where could the owner be overwhelmed?
- **owner/process-intelligence** carries the top action PLUS ~9 capability panels (cash, SOP correction, training, effectiveness, workload, approval policy, opportunity, portfolio, capability gap). Even with progressive-disclosure `CockpitGroup`s, a first-time owner sees many groups.
- **owner/ (index)** aggregates whole-business plan + readiness + input-guidance + action-plan + priority strip + control-center + condition scores + domain scores — a dense dashboard.
- **owner/execution** and **owner/recovery** expose full metric-snapshot forms (20+ fields) — heavy data entry.

## 2. Where are too many cards/actions shown?
- The index page's stacked sections and the domain snapshot forms. The command strip caps at 3–5 cards (good), but the index shows several strips/sections at once.

## 3. Where does the owner need progressive disclosure?
- process-intelligence already uses it (good pattern to keep). The canonical cockpit must show ONLY the top-action block by default and collapse everything else.

## 4. Where is technical/audit language too heavy?
- Evidence refs, SLO/constraint/profit-leak badges, execution-state enums (DISCIPLINED/UNRELIABLE/BREAKDOWN), verify enums (verified_not_improved) — all technical. These belong behind "View details", not in the default view.

## 5. Where could the UI imply unsupported capability?
- **owner/intake** is titled "Data Intake & Connectors" but only supports manual CSV/paste — must not imply live connectors.
- Any panel could imply a real outcome; effectiveness must never say "this worked" without evidence; cash panels must never show fabricated money.
- The unwired PASS 28-33 modules must NOT be given fake owner cards implying they work.

## 6. Where could the owner be forced to re-key data?
- The bridge action path uses browser `prompt()` for reason/evidence/delegate — clumsy and re-keys context. The cockpit should offer labelled controls, and never make the owner re-type the backend finding into a form.

## 7. Where could unsafe actions look available?
- No unsafe external action button exists today (good). The cockpit must keep unsafe actions **absent or visibly blocked** (e.g. "No action is available because this would require an unsafe external step").

## 8. What must be hidden/collapsed by default?
- All secondary capability panels, all audit/proof detail, all raw evidence refs, all enum badges, all monitor-only guidance, and the SOP/finance/recovery domain metric forms.

## 9. What is the maximum safe default cockpit payload?
- **One** top action: title, one-line summary, up to **3** reason bullets, owner next step, primary allowed action (+ at most one secondary), evidence requirement line, blocked-unsafe summary line, next-reassessment line. Everything else collapsed. No raw signal list. No raw audit log. No hidden score/tier.

## 10. What should remain details-on-demand?
- Evidence refs and audit trace (proof drawer), secondary capability panels (Secondary group), monitor-only guidance (Monitor group), full domain forms (their own pages).

## Verdict
The existing surface is capable but **dense and split across three pages**, uses
`prompt()` for actions, and shows technical language by default. PASS 36 must
deliver ONE cockpit that defaults to a single top action with strict cognitive-load
caps and everything else behind progressive disclosure.
