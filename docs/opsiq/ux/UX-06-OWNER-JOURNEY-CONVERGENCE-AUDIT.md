# UX-06 — Owner Journey Convergence Audit

**Status:** AUDIT + SPECIFICATION FREEZE ONLY. No production code, tests, configs, schema, or API were
changed to produce this document. This document is the sole deliverable of this mission.

**Revision history:**
- v1.0 — initial audit, produced against `main` @ `2c674c1a38a3b232de1a45e381da6851d1f31059`.
- v2.0 — hostile-audit remediation. Restores the exact required A–AD section structure (no reconstructed/
  approximate mapping remains). Withdraws v1.0's Candidate 9 implementation assumption and replaces it
  with a formal product-decision gate. Re-runs the owner-language hard gate and finds 2 additional
  violation classes (Workspace Name; ~10 "Loading … workspace" skeleton labels) plus a full term-by-term
  sweep of 14 named vocabulary items. Expands the canonical language dictionary to cover 14 additional
  required concepts. Re-adjudicates two naming recommendations (Trust page title; Tasks/Actions nav) with
  reversed conclusions where the evidence supported reversal. Freezes one canonical first-time journey
  with direct evidence rather than leaving "A or B." Distinguishes local-sandbox browser evidence from
  live-deployment evidence throughout, with a new live-acceptance gate. Explicitly gates the
  populated-diagnosis and mobile-snapshot-form evidence holes this document already disclosed in v1.0.
  Corrects the Google-authentication section against Google's own documented Sign In With Google / GIS
  guidance (ID token, `sub` identifier, account-linking caution, scope separation). Splits Wave A into two
  risk classes and corrects Wave B's testing assumption.
- v3.0 (this revision) — final product-decision freeze, the last document-only amendment before
  implementation. Resolves the Candidate 9 product/workflow decision left open by v2.0's gate: freezes a
  same-page final-approval experience on `/owner/tasks/[taskId]` (no new `/complete` page, no new proof-
  review step, no client-side re-implementation of server gates), including the exact plain-language
  copy for the ready-for-approval state, the five known-block-reason mappings, and the success/refresh
  behavior. Resolves the Google-identity product decisions left open by v2.0's Section Q.7: forbids
  automatic account linking on email match alone (even for a Google-authoritative address), freezes
  "Continue with Google" on both Login and Signup with no One Tap/auto-select in the first version, and
  freezes the new-Google-user "Finish setting up OpsIQ" flow. Neither Candidate 9 nor Google sign-in is
  implemented by this revision — both remain `IMPLEMENTATION: NOT STARTED`, with the *product* decision
  now closed and only implementation/security/schema design work remaining. No production/test/schema/
  config file was touched to produce any revision of this document — see the validation block at the end.

**Base commit audited:** `main` @ `2c674c1a38a3b232de1a45e381da6851d1f31059`. Re-verified unmoved at the
start of this remediation pass (Section B).

---

## A. Executive conclusion

OpsIQ's owner-facing product is **substantively coherent and further along than a "beta" label
suggests**: the four-dimension governance model (consulting lifecycle / business condition /
intervention mode+phase / human-execution-reality) is genuinely present end-to-end, prior UX missions
(UX-01 through UX-05C) have already closed most of the *stale-async-response* and *raw-enum-leak*
defect classes this audit would otherwise have had to open as new work, and the existing sidebar
navigation (`sidebar-nav.tsx`, "Model B") already reflects a deliberate, well-reasoned prior
consolidation. What remains is not a rebuild — it is a **finishing pass**: closing the remaining
raw-jargon leaks (now 11, see Section G), repairing one confirmed dead link whose *implementation shape
is explicitly not yet decided* (Section T), resolving a handful of cross-page inconsistencies (naming,
error handling, empty-state structure, severity color mapping), replacing twenty `window.prompt()` call
sites with the labelled-input pattern already proven on `/owner/cockpit`, and writing an isolated,
carefully-scoped Google-identity specification that reuses neither the existing Sheets-import OAuth
plumbing nor the assumption that email is a durable identity key.

**History of the Candidate 9 correction:** v1.0 named a specific page
(`owner/tasks/[taskId]/complete/page.tsx`) as "the actual fix" for Candidate 9, a scope violation against
the merged UX-05A Candidate 9 contract, which proved the defect while leaving its implementation shape
open pending four product/workflow questions. v2.0 withdrew that assumption and restored the four-
question decision gate. **This revision (v3.0) closes that gate with an explicit product decision**
(Section T): the repair is a same-page final-approval action on the existing `/owner/tasks/[taskId]`
page, reusing the existing `POST /api/owner/tasks/complete` endpoint and `completeTask()` service
unchanged, with no new route, no new proof-review step, and no client-side re-implementation of the
server's proof/freshness/separation-of-duty gates. Candidate 9 remains the sole **HARD WORKFLOW
BLOCKER** (Section W) and Wave A2 (Section Z); its status is now `PRODUCT/WORKFLOW DECISION: RESOLVED` /
`IMPLEMENTATION: NOT STARTED` — the decision that blocked implementation is closed, but no code exists
yet and none is written by this document.

**History of the Google-identity correction:** v2.0 specified the architecture (GIS ID-token credential,
`sub` as the durable identifier, a `UserAuthIdentity`-equivalent persistence concept, scope separation
from the Sheets connector) but left several product decisions open (Section Q.7 in v2.0): whether
automatic linking is ever enabled, where "Continue with Google" appears, whether One Tap ships in v1, and
the exact shape of the new-user setup screen. **This revision closes all four** (Section Q): automatic
linking is forbidden unconditionally, even for a Google-authoritative address — email is never a silent
linking key; "Continue with Google" appears on both Login and Signup; One Tap/auto-select is explicitly
excluded from the first version; and the new-Google-user flow is frozen as a "Finish setting up OpsIQ"
screen that collects only what Google didn't supply while preserving every existing beta/legal/account-
graph gate. Google sign-in's status is now `PRODUCT DECISIONS: RESOLVED` / `IMPLEMENTATION: NOT STARTED`
— remaining work is security/schema/endpoint design, not further product choice.

**Recommended verdict:** this document is now safe to become the authoritative implementation plan for
Waves A1, B, and C without further product-decision dependencies, and for Waves A2 and D as well, since
their previously-blocking product decisions are resolved as of this revision — what remains for A2 and D
is implementation, security, and schema design work, tracked in Sections AA/AB, not further product
adjudication.

---

## B. Exact audited commit, evidence protocol, and browser-audit methodology

**Exact commit re-verified at the start of this remediation:** `main` @
`2c674c1a38a3b232de1a45e381da6851d1f31059` — confirmed unmoved (`git rev-parse origin/main` matches
exactly). The audit branch (`docs/ux-06-owner-journey-audit`) was confirmed exactly one commit ahead of
this SHA, touching only this one document, before any edit in this revision began.

### B.1 Evidence-level legend (corrected in this revision — 4 labels, not 3)

v1.0 used a 3-label scheme (`SOURCE-VERIFIED` / `BROWSER-VERIFIED` / `BROWSER-NOT-YET-VERIFIABLE`) that
conflated "verified against a locally compiled build in this sandbox" with "verified against the actual
deployed application." Those are not equivalent evidence and this revision never calls them equivalent
again. The corrected 4-label scheme, used exhaustively from this point forward (every earlier
`BROWSER-VERIFIED` claim in v1.0 is re-labeled `LOCAL-BROWSER-VERIFIED` below; every earlier
`BROWSER-NOT-YET-VERIFIABLE` claim is re-labeled `NOT-YET-VERIFIED`):

- **SOURCE-VERIFIED** — read directly from the named file(s), with line-accurate quotes. Proves what the
  code *will do*, not what a viewer actually *saw* rendered anywhere.
- **LOCAL-BROWSER-VERIFIED** — observed by actually loading the page in a real browser (Playwright +
  the pre-installed Chromium) against a *locally compiled instance of this exact commit*, running against
  a throwaway local database this sandbox stood up for the purpose (Section B.2). This is real, useful
  development evidence — it proves the code compiles and renders as claimed on this exact commit — but it
  is **not** deployment evidence: it says nothing about the actual deployed environment's build
  configuration, environment variables, CDN/edge behavior, real database content and scale, custom-domain
  cookie/CORS behavior, or anything that only differs between "compiles and runs locally" and "runs where
  owners actually use it."
- **LIVE-DEPLOYMENT-VERIFIED** — observed against the actual deployed application (staging or production)
  at a specific, named exact SHA, on its real custom domain. **No claim in this document carries this
  label** — none was performed this pass — and every implementation wave below (Section AB) now carries
  an explicit live-acceptance gate requiring this evidence before that wave is considered done, not merely
  before it is coded.
- **NOT-YET-VERIFIED** — a claim this document could not verify by any method this pass (source, local
  browser, or live) and does not guess at. Always named explicitly, never silently upgraded.

### B.2 How the local-browser evidence was obtained (full disclosure, unchanged from v1.0)

This sandbox has no reachable network path to the project's real Neon database (an established,
previously-documented limitation of this environment from earlier missions in this engagement). Rather
than skip the mandatory browser audit, a **fully local, throwaway** Postgres 16 instance was stood up
inside this sandbox only:

1. The sandbox's pre-installed local `postgresql@16` cluster was started (`service postgresql start`).
2. A local role/database (`opsiq_dev` / `opsiq_dev`) was created — entirely separate from, and with zero
   network path to, the project's real database.
3. `prisma migrate deploy` was run against that local database only, applying all 179 committed
   migrations verbatim (no schema was hand-edited or invented).
4. One throwaway seed script, mirroring the exact account-graph shape of the repository's own
   `scripts/seed-preview-qa-owner.ts`, was written to the local scratchpad, temporarily copied into
   `scripts/` **only to satisfy Node's module resolution**, run once, and deleted immediately after use.
   It was never committed and refuses to run against any non-`localhost` `DATABASE_URL`.
5. `next dev` was started with `DATABASE_URL` explicitly overridden on the command line to the local
   database. The container's real `DATABASE_URL` environment variable, pointing at the real Neon
   instance, was **never modified, unset, or exported**, and was not reachable from this sandbox anyway.
6. Playwright drove real login, page navigation, business creation, and task creation against this local
   instance at both `1440×900` and `390×844` viewports.
7. After the v1.0 audit, the local Postgres cluster, the local `.env` file, and the dev-server process
   were torn down; nothing about this setup persists past that session. This remediation pass made no new
   browser calls and reused no live infrastructure — it is a document-only correction pass, consistent
   with the mission's explicit "document-only" scope.

### B.3 Core audit surfaces inventory

| # | Surface | Route | Evidence |
|---|---|---|---|
| 1 | Login | `/login` | LOCAL-BROWSER-VERIFIED (1440, 390) |
| 2 | Signup | `/signup` | LOCAL-BROWSER-VERIFIED (1440, 390) |
| 3 | Forgot password | `/forgot-password` | LOCAL-BROWSER-VERIFIED (1440, 390) |
| 4 | Reset password | `/reset-password` | SOURCE-VERIFIED only (requires a live emailed token) |
| 5 | Resend verification | `/resend-verification` | SOURCE-VERIFIED only |
| 6 | Start Here | `/owner/start-here` | LOCAL-BROWSER-VERIFIED (1440, 390) |
| 7 | Onboarding | `/owner/onboarding` | LOCAL-BROWSER-VERIFIED (1440, 390) |
| 8 | My Business (Data) | `/owner/data` | LOCAL-BROWSER-VERIFIED, empty + post-create (1440, 390) |
| 9 | Home (Cockpit) | `/owner/cockpit` | LOCAL-BROWSER-VERIFIED, empty + post-create (1440, 390) |
| 10 | Money (Finance) | `/owner/finance` | LOCAL-BROWSER-VERIFIED, empty (1440, 390); populated diagnosis view NOT-YET-VERIFIED (Section AB gate) |
| 11 | Owner Sales | `/owner/sales` | LOCAL-BROWSER-VERIFIED, empty (1440, 390); populated view NOT-YET-VERIFIED |
| 12 | Operations | `/owner/operations` | LOCAL-BROWSER-VERIFIED, empty (1440, 390); populated view NOT-YET-VERIFIED |
| 13 | Actions / Tasks list | `/owner/tasks` | LOCAL-BROWSER-VERIFIED, empty + with 1 task (1440, 390) |
| 14 | New task | `/owner/tasks/new` | LOCAL-BROWSER-VERIFIED (1440, 390) |
| 15 | Task detail | `/owner/tasks/[taskId]` | SOURCE-VERIFIED; route load confirmed, proof/review sub-forms not exercised |
| 16 | Owner Execution & SOP | `/owner/execution` | LOCAL-BROWSER-VERIFIED, empty (1440, 390); populated view NOT-YET-VERIFIED |
| 17 | Evidence & Trust | `/owner/trust` | LOCAL-BROWSER-VERIFIED, empty (1440, 390) |
| 18 | Sidebar / shell | (all pages) | LOCAL-BROWSER-VERIFIED, desktop open state + mobile hamburger collapse |
| 19 | Settings | `/settings` | Out of core scope — not owner-journey-critical; not visited |

### B.4 What the browser audit did **not** cover — explicitly gated, not glossed over

- A **populated** Finance/Sales/Operations/Execution diagnosis cycle (findings + actions + verification
  badges) — attempted, not obtained (Playwright strict-mode locator ambiguity on the "Revenue" field).
  Classified in Section AB.
- The Sales/Operations snapshot forms' behavior at 390px specifically — not opened in the mobile pass.
  Classified in Section AB as the single most important gate before Wave B ships.
- Owner sign-in via Google: not applicable, no such flow exists yet (Section Q).
- Task-detail proof-submit/proof-review forms and `MinimumOwnerCockpit`'s execution-lifecycle sub-forms —
  not driven to completion (would require a governed action already mid-lifecycle). SOURCE-VERIFIED only.
- Admin/internal/consultant-only surfaces (`/admin/*`, `/dashboard`, `/clients`, `/engagements`,
  `/report`) — out of scope, not visited.
- No LIVE-DEPLOYMENT-VERIFIED evidence exists anywhere in this document (Section B.1) — see Section AC's
  live-acceptance gate.

---

## C. First-time owner journey — one frozen canonical path

v1.0 stated the zero-business path forked to "`/owner/data` OR `/owner/onboarding`" and left it there.
This revision resolves that using direct evidence rather than leaving an unresolved fork:

**Frozen canonical path (evidence-supported, not asserted):**

1. Sign up (`/signup`) — LOCAL-BROWSER-VERIFIED render.
2. Verify email via the emailed link — SOURCE-VERIFIED (`verify-email/route.ts` creates the first
   `Session` row and cookie; this is the only point a brand-new open-beta account becomes usable).
3. First authenticated page load resolves to **Home** (`/owner/cockpit`), not Start Here —
   LOCAL-BROWSER-VERIFIED: a session with zero businesses renders Home's own `EmptyState` ("Set up your
   business to get your first assessment"), confirming Home, not Start Here, is the actual landing
   surface a zero-business owner is shown. (The root `/` page's own routing policy that produces this
   — `isSelfServeOwnerContext` per the Design Direction doc — was not independently re-read this pass;
   the *landing behavior itself* is LOCAL-BROWSER-VERIFIED even though the *routing mechanism* is
   NOT-YET-VERIFIED at the source level in this revision.)
4. Home's own primary, and only, CTA in this state is **"Set up your business"**, linking to
   `/owner/data` — LOCAL-BROWSER-VERIFIED (exact button captured in the v1.0 browser pass).
5. `/owner/data`'s `CreateBusinessPanel` creates the business — LOCAL-BROWSER-VERIFIED end-to-end (a real
   business, "Harbour Street Bakery," was created this way in the v1.0 pass and appeared correctly in the
   sidebar's workspace-name chip and on Home immediately after).
6. Returning to Home now shows a **"Continue setting up OpsIQ"** continuation card whose own CTA is
   **"Continue setup"**, linking to `/owner/start-here` — LOCAL-BROWSER-VERIFIED (captured verbatim: "Next:
   Add your basic money numbers" / "Why: This lets OpsIQ assess cash and profitability — the foundation
   for every other read.").
7. The owner follows Start Here / the Essential Numbers form to add minimum financial data — LOCAL-
   BROWSER-VERIFIED that the form renders; the specific transition of Home's "Business assessment" block
   out of its "not enough evidence" state once real numbers exist is SOURCE-VERIFIED only (UX-02B's
   composer rules) — not independently re-obtained with real populated data this pass (Section AB).
8. Home resolves to a real, evidence-based first assessment.

**Why `/owner/data` is the canonical destination and not `/owner/onboarding`:** `/owner/data`'s own
SOURCE-VERIFIED header comment states it was "renamed so a fresh owner has exactly one 'My Business'
concept, not two" — and Home's own primary CTA (step 4 above, LOCAL-BROWSER-VERIFIED) points there, not
to Onboarding. This is the load-bearing evidence for the freeze.

**Secondary routes remain available, not removed:** `/owner/onboarding` still offers the same
`CreateBusinessPanel` plus a guided 3-step wizard and remains fully reachable and functional — it is not
deleted, deprecated, or hidden by this freeze. A returning owner or one who arrives at Onboarding by a
direct link/bookmark is not broken. What changes is only which path this document treats as *the*
default, CTA-driven, single primary journey for a brand-new owner — exactly what the mission asked this
document to produce instead of "A or B."

**One sub-detail intentionally left open, named rather than guessed:** whether Start Here's own
individual step-1 "Continue →" link (for an owner who reaches Start Here before creating a business, e.g.
via the sidebar directly rather than Home's CTA) also resolves to `/owner/data` was not re-confirmed at
the exact-line source level this pass (`computeStartHereSteps` in `src/domain/owner-mode/start-here.ts`
was not re-read). **NOT-YET-VERIFIED**, and does not block the freeze above since Home's own default CTA
is the load-bearing path, not Start Here's.

---

## D. Returning owner journey

Login → Home. Home must, on every return visit, answer three questions before anything else: what
changed, what needs a decision now, and what happened to the last thing I did. LOCAL-BROWSER-VERIFIED
(post one business, zero further data): Home renders, in this exact order, "Business assessment" →
"Continue setting up OpsIQ" (a continuation nudge, not a nag) → "Your top priority now" with a severity
badge, a "Why this is first" rationale, and a single primary CTA ("Start Work"). This matches the
SOURCE-VERIFIED structure from UX-03/UX-05A exactly. The returning-owner journey is the one place Section
R (Home-authority check) and Section E (navigation mental model) both apply pressure on the same screen.

---

## E. Navigation mental model

### E.1 Nav-label vs. page-title audit

Classification key: **CLEAR** · **AMBIGUOUS** · **TECHNICAL** · **DUPLICATIVE** · **MISLEADING** ·
**CORRECT** (label matches the destination's own content exactly).

| Nav item | Destination page's own title | Classification | Resolution frozen in this revision |
|---|---|---|---|
| "Start Here" | "Start here" | CORRECT | — |
| "Home" | "Home" | CORRECT | — |
| "My Business" | "My Business" | CORRECT | — |
| "Evidence & Trust" | "Trust & Explainability" | **MISLEADING** | **RENAME THE PAGE, not the nav** — see E.2 below, reversed from v1.0 |
| "Money" | "Money" | CORRECT | — |
| "Sales" | "Owner Sales" | **MISLEADING** | Drop the "Owner " prefix from the page title — every other page title omits it |
| "Operations" | "Operations" | CORRECT | — |
| "Tasks" | "Actions" | **MISLEADING** | **RENAME THE PAGE, not the nav** — see E.3 below, reversed from v1.0 |
| "Execution & SOP" | "Owner Execution & SOP" | AMBIGUOUS (jargon "SOP", Section G) | Fix by explaining "SOP," not by renaming the nav item alone |
| "Compliance" / "Procurement" (Preview) | — | CLEAR, correctly flagged Preview | — |
| "Diagnosis" / "Decision Inbox" | — | TECHNICAL, correctly gated invisible to self-serve owners | No owner-facing defect — not reachable by this audience |
| "Check a decision" | — | AMBIGUOUS if ever ungated; currently gated | Flag only if ungated for owners |
| "AI Copilot" / "Integrations" (Coming soon) | — | CLEAR | Correctly out of tab order |
| "What if…" | — | AMBIGUOUS in isolation, mitigated by its blurb; not owner-reachable without a gated capability | No action needed unless ungated |

**Mission instruction honored:** this audit does **not** propose renaming everything — of 19 nav items
reviewed, 3 are flagged, and one of those three (Execution & SOP) is a jargon-explanation fix, not a
rename. **Both remaining renames in this revision are page-title changes, not nav changes** — the nav
item wording is left untouched in every single case in this document.

### E.2 Hostile re-adjudication: "Trust & Explainability" vs. "Evidence & Trust"

v1.0 recommended keeping the page title "Trust & Explainability" and renaming the *nav* to match it. On
hostile re-audit that recommendation is **reversed**: "Explainability" is itself technical/AI-product
vocabulary — precisely the kind of term the mission's own language rule forbids optimizing toward
("make the implementation match the owner's mental model, not make the owner learn the implementation's
terminology"). Candidates evaluated:

| Candidate | Verdict |
|---|---|
| "Evidence & Trust" (current nav wording) | **Frozen recommendation.** Plain-language pair: "evidence" is concrete and familiar, "trust" names the human need the page serves. Correctly scoped to a standalone, multi-domain, multi-cycle destination (not a single inline explanation). |
| "Why OpsIQ says this" | Rejected as the *page* title — reads as a per-recommendation inline trigger/modal label, not a standalone nav destination covering many domains and an audit trail across time. Could be reused later as microcopy on an individual explanation card's own header if useful — not frozen here, out of scope. |
| "Why this recommendation" | Same rejection as above — singular framing doesn't fit a page that lists many recommendations across domains and cycles. |
| "Evidence behind this" | Same rejection — same singular-framing mismatch. |

**Frozen recommendation:** rename the **page's own H1** from "Trust & Explainability" to **"Evidence &
Trust"**, matching the nav exactly. This is the opposite file-level fix from v1.0 (touches
`owner/trust/page.tsx`'s header text, not `sidebar-nav.tsx`) but resolves the same underlying mismatch.
The page's existing description line ("For every recommendation: what was detected, why it matters, the
data and calculation used, confidence, risk if ignored, expected impact, and how to verify it — with a
full audit trail. Nothing is invented.") needs no change — it already avoids the word "explainability."

### E.3 Hostile re-adjudication: "Tasks" vs. "Actions" nav/page mismatch

v1.0 recommended renaming the nav item "Tasks" → "Actions" to match the page's own H1. On hostile
re-audit this is **rejected**, because the "Tasks" nav item already sits inside a sidebar *section*
titled "Actions," alongside "Execution & SOP" and "Check a decision." Renaming the item would produce:

```
Actions
  Actions          <- was "Tasks"
  Execution & SOP
```

— a section literally containing a child item with its own name, which is worse for predictability than
the mismatch it would fix. Options evaluated:

| Option | Verdict |
|---|---|
| Keep nav = "Tasks," change page title "Actions" → "Tasks" | **Frozen recommendation.** Fixes the mismatch, avoids the Actions>Actions collision, and is the smaller change (one page H1, not a nav-structure edit). "Tasks" is also the more concrete term for "assign someone a specific thing to do and track it to completion" — it matches the dictionary's own "My work"/"Delegated work" sub-labels already used one level down on this exact page. |
| Rename the *section* header instead of either item | Rejected — leaves the page's own H1 ("Actions") now unechoed anywhere in the nav at all, which does not resolve the original mismatch, it only relocates it. |
| Rename "Execution & SOP" and restructure the pair | Rejected as a *response to this specific problem* — renaming the sibling does nothing to stop "Tasks"→"Actions" from colliding with its own parent section; the collision is caused by the nav-item rename itself, not by what its sibling is called. (A rename of "Execution & SOP" may still be worth doing for jargon reasons, Section G — but not as a fix for this collision.) |

**Frozen recommendation:** rename the **page's own H1** on `/owner/tasks` from "Actions" to **"Tasks,"**
leaving `sidebar-nav.tsx` completely untouched. The sidebar's own "Actions" section header remains a
sensible umbrella term distinct from its children's specific names ("Tasks," "Execution & SOP," "Check a
decision") — a container word that is *not* repeated by any child is a stronger, more predictable IA than
one that is.

### E.4 First-time vs. returning navigation behavior

**Observation, SOURCE-VERIFIED:** the sidebar has no first-time-vs-returning state logic today — "Start
Here" always renders in the same primary, ungrouped position as "Home" and "My Business," regardless of
setup completion.

**Specification proposal (not implemented, per mission scope):** once an owner's Start-Here checklist is
complete, the nav could visually de-emphasize "Start Here" (the same never-hidden, lower-visual-weight
treatment "Evidence & Trust" already uses) rather than removing it — removal would violate the mission's
"no feature deletion" simplification principle, since a returning owner may legitimately want to revisit
setup. **This is explicitly left as `PRODUCT DECISION REQUIRED`, not a Wave-ready item** — it changes a
first-read heuristic without direct usability-test evidence.

**No dead links found in the sidebar itself** — re-confirmed via the extraction subagent's filesystem
cross-check of every `href`-bearing item under `owner/` against the actual directory tree; the one
confirmed dead link in the entire owner journey is Candidate 9 (Section T), which is not a nav-level link.

---

## F. Screen-by-screen usability matrix (6-question test)

Questions: **(1) Purpose** — does the owner know what this screen is for in <5s? **(2) First read** —
what does the eye land on first? **(3) Meaning** — is every visible word plain-language? **(4) Action** —
is the next action obvious? **(5) Consequence** — does the owner know what happens if they act (or
don't)? **(6) Depth** — is there a safe way to go deeper without being forced to?

| Screen | Purpose | First read | Meaning | Action | Consequence | Depth |
|---|---|---|---|---|---|---|
| Login | Yes | Email field | Yes | Yes ("Sign in") | Yes (goes to Home) | N/A |
| Signup | Yes | Email field | Partially — "beta access" assumed known; "Workspace Name" label vs. "Your company name" placeholder disagree with each other (Section G) | Yes ("Create Account") | Partially — no on-page statement that verification is required next, until after submit | Yes (Terms/Privacy/Beta links) |
| Start Here | Yes | Numbered step list | Yes | Yes ("Continue →") | Yes ("If you skip this for now: …") | Yes |
| Onboarding | Yes | Step-of-3 progress line | Mostly — "OwnerSeverity" case-sensitive lookup is a latent fragility, not a current leak | Yes | Yes ("What not to do yet") | Yes (`<Disclosure>`) |
| My Business (Data) | Yes | H1 "My Business" + intro | Yes | Yes | Yes ("Affects: …") | Yes |
| Home (Cockpit) | Yes — the one screen designed to answer "what now" | "Business assessment," then "Your top priority now" | Mostly — one confirmed raw-enum leak (Goal chip, Section G) | Yes ("Start Work") | Yes | Yes |
| Money | Yes | Score tiles + survival badge | Mostly — "BLOCKED tier" leak (Section G) | Yes | Yes | Yes (best progressive disclosure of the three domain pages) |
| Owner Sales | Yes | Inline Health/Risk/Opportunity numbers | Yes (no hints, but plain labels) | Yes | Yes | No — flat form (Section S/J) |
| Operations | Yes | Score tiles + state badge | Partially — "SOP," "scaling gate," "human-execution-reality dimension" leak unexplained | Yes | Yes | No — flat form |
| Tasks (page title now "Tasks," Section E.3) | Yes, and now nav-consistent | "My work" / "Delegated work" split | Yes | Yes | Yes (status groups) | N/A |
| New task | Yes | Title field | Yes, except auto-humanized ProofType options diverge from hand-curated ones elsewhere (Section G) | Yes | Partially — proof-type consequence not explained until review | N/A |
| Task detail | Yes | Status badge next to title | Mostly — "AI Precheck Passed/Failed" jargon | Blocked on one path — the "Review & Approve" action's *repair* is undecided (Section T); the button as it exists today is a confirmed dead link | Yes (Status history) | Yes |
| Owner Execution & SOP | Partially — "SOP" undefined in the title itself | Score tiles + state badge | Partially — same "SOP" jargon | Yes, but via 5 unlabeled `window.prompt()` dialogs | Yes | No — flat form |
| Evidence & Trust (page title now matches nav, Section E.2) | Yes, and now nav-consistent | Domain selector | **No** — the single most jargon-exposed screen in the app: raw `findingType`, `findingCode`, `entityId`, `eventName`, `entityType` all render unmapped | Yes ("View audit trail") | Yes | Yes |
| Sidebar / shell | Yes | Start Here / Home / My Business, ungrouped | Yes | Yes | N/A | Yes |

---

## G. Owner-language violations (hard gate — re-run in this revision)

Classification key: **PLAIN** (no issue) · **BUSINESS TERM — KEEP** (technical-sounding but already the
correct, understood business word) · **BUSINESS TERM — EXPLAIN** (a legitimate business concept that
needs one nearby plain-language sentence, not a rename) · **TECHNICAL — RENAME** (replace the visible
string) · **TECHNICAL — HIDE/MOVE** (correct but too technical for the primary read; demote to disclosure
or drop) · **ADMIN-ONLY** (should never reach a self-serve owner at all).

### G.1 Violation count, corrected

v1.0 claimed **9** raw/leak-class violations. That count is **incomplete** and is corrected here to
**11 confirmed violations** (only items classified `TECHNICAL — RENAME`, `TECHNICAL — HIDE/MOVE`, or a
confirmed `ADMIN-ONLY` leak count toward this number; `BUSINESS TERM — EXPLAIN` items are recorded in the
term sweep below but are not counted as violations, since the mission's own classification scheme
distinguishes "needs one sentence of context" from "should not be visible in this form at all").

| # | Term / string | Where | Class | Evidence | Recommended fix |
|---|---|---|---|---|---|
| G1 | `findingType`, `findingCode` rendered raw (e.g. "Finance · opportunity · FIN_LOW_MARGIN_002") | `/owner/trust` explanation-card meta line | TECHNICAL — RENAME | SOURCE-VERIFIED; NOT-YET-VERIFIED for the exact populated render (Section AB) | Add a `FINDING_TYPE_LABEL` map (already exists elsewhere, just not imported here) and a humanizer for `findingCode`, or drop the code from the owner-visible line |
| G2 | `entityId` interpolated raw into "Audit trail — {id}" heading | `/owner/trust` | TECHNICAL — HIDE/MOVE | SOURCE-VERIFIED | Replace the heading with a human label; move the raw id into a disclosure or reference chip |
| G3 | `eventName`, `entityType` rendered raw in audit-trail rows | `/owner/trust` | TECHNICAL — RENAME | SOURCE-VERIFIED | Add a label map for the small enumerable set of `AUDIT_EVENTS` values used here |
| G4 | "BLOCKED tier" (verbatim, capitalized, mid-sentence) | `/owner/finance` low-confidence warning | TECHNICAL — RENAME | SOURCE-VERIFIED; NOT-YET-VERIFIED for the exact populated render | Drop the phrase entirely; the sentence already communicates the consequence |
| G5 | "SOP" unexplained (title, description, field label) | `/owner/execution` | BUSINESS TERM — EXPLAIN | LOCAL-BROWSER-VERIFIED (title confirmed rendered at both viewports) | Expand on first use, or fold into the nav-jargon fix (E.1) |
| G6 | "scaling gate" / "human-execution-reality dimension" | `/owner/operations` form helper text | TECHNICAL — RENAME | SOURCE-VERIFIED | Replace with plain consequence language |
| G7 | Goal-state chip renders `state.replace(/_/g,' ')` only (e.g. "NO GROWTH") | `/owner/cockpit` | TECHNICAL — RENAME | SOURCE-VERIFIED; NOT-YET-VERIFIED for the exact render | Add to the same label-map pattern used everywhere else on this page |
| G8 | "AI Precheck Passed" / "AI Precheck Failed" | `/owner/tasks/[taskId]` | BUSINESS TERM — EXPLAIN | SOURCE-VERIFIED | Reword to "Automatically checked — passed / needs a person to look," keeping the concept |
| G9 | Auto-humanized `ProofType` labels diverge from hand-curated ones for the same enum values | `/owner/tasks/new` | TECHNICAL — RENAME | SOURCE-VERIFIED | Import the existing `PROOF_TYPE_LABEL` map instead of generic humanization |
| G10 | **[New this revision]** Signup field label "Workspace Name" (placeholder text on the *same field* instead reads "Your company name" — the field visibly disagrees with itself) | `/signup` (`src/app/signup/page.tsx:187-195`) | TECHNICAL — RENAME | SOURCE-VERIFIED (label vs. placeholder both quoted, direct read this pass) | Rename the label to "Business name" or "Company name," matching the placeholder's own wording and the app's already-established "My Business" vocabulary; do **not** rename the underlying `workspaceName` field/column — owner-facing text only |
| G11 | **[New this revision]** "Loading … workspace" appears in ~10 skeleton `sr-only` loading labels across core owner pages: "Loading finance workspace," "Loading sales workspace," "Loading operations workspace," "Loading execution workspace," plus several non-core pages (cashflow, marketing, strategy, recovery, growth-pricing, learning-governance) | Money/Sales/Operations/Execution and others (`grep`-confirmed this pass) | TECHNICAL — RENAME | SOURCE-VERIFIED (direct grep across `src/app/(authenticated)/owner`, quoted below) | Rename the pattern to "Loading your {domain} information" (or similar) across every occurrence — this is one shared string pattern, likely one shared skeleton-label convention to fix, not 10 independent edits |

Direct evidence for G11 (grep output, this revision):
```
owner/sales/page.tsx:      <CardDashboardSkeleton label="Loading sales workspace" />
owner/finance/page.tsx:    <CardDashboardSkeleton label="Loading finance workspace" />
owner/operations/page.tsx: <CardDashboardSkeleton label="Loading operations workspace" />
owner/execution/page.tsx:  <CardDashboardSkeleton label="Loading execution workspace" />
```
(plus cashflow/marketing/strategy/recovery/growth-pricing/learning-governance, outside this audit's
owner-core scope but sharing the identical string pattern — worth fixing in the same pass since it is
one convention, not per-page copy).

**KEEP** (reviewed and judged fine as plain language): "Health/Risk/Opportunity" score tiles, "Data
confidence," "Findings," "Recommended next … action," "Verify outcome," survival/state badges (already
humanized), "Owner approval required" / "Manager approval required" / "Staff-level action," "Not yet
verified" / "Verified — improved" family, "COGS"/"accounts receivable"/"accounts payable" (each has
adjacent plain-language hint text already).

**MOVE BEHIND DISCLOSURE**, beyond G2: the raw `task.sourceOperatorItemId` shown as "Source
recommendation:" on the task-detail page — a real, useful traceability fact but currently a bare
monospace ID with no expansion; move into the same disclosure pattern as "View proof & details."

### G.2 Full term-by-term sweep (mission-required 14-term list)

This sweep classifies every one of the 14 terms named by the mission **at the term level**, not
mechanically per literal occurrence — a term used consistently and well in ten places gets one row, not
ten. Where usage genuinely diverges, both uses are called out separately.

| Term | Classification | Representative occurrences | Rationale |
|---|---|---|---|
| **workspace** | TECHNICAL — RENAME (2 occurrences, G10/G11) / PLAIN elsewhere (`WorkspaceMembership`, `WorkspaceProvider` are code-only, never owner-visible) | Signup label (G10); ~10 skeleton labels (G11) | The internal SaaS noun leaks in exactly the two places named; everywhere else it is correctly kept out of owner-visible text (e.g. the nav says "My Business," never "Workspace") |
| **diagnosis** | BUSINESS TERM — KEEP | "Run finance diagnosis," "Diagnosis history," "diagnosis cycle" across Money/Sales/Operations/Execution/Trust | Consistently used with a health-checkup metaphor an owner can intuit; never left unexplained in context (always paired with "findings," "recommended action") |
| **snapshot** | BUSINESS TERM — KEEP | "Financial snapshot," "Add a sales snapshot," etc. | Consistently means "a point-in-time record of your numbers," reinforced by the surrounding form fields themselves |
| **SOP** | BUSINESS TERM — EXPLAIN (see G5) | Page title/description/field label on `/owner/execution` | A real business concept (a written, repeatable procedure) but the *abbreviation* itself is never expanded anywhere on the page |
| **explainability** | TECHNICAL — RENAME (see E.2) | `/owner/trust` page title only, pre-remediation | Product/AI vocabulary; resolved by renaming the page to "Evidence & Trust" |
| **confidence** | BUSINESS TERM — KEEP | "Data confidence 62/100 — how much of this reading rests on real, supplied numbers," confidence badges everywhere | Always paired with a plain-language explanation of what it means in context |
| **finding(s)** | BUSINESS TERM — KEEP | "Findings (3)," "What OpsIQ found" | Concrete, always attached to a specific claim + evidence, not left abstract |
| **verification / verify** | BUSINESS TERM — KEEP | "Verify outcome," "before X → after Y," "Verification method" | Always paired with concrete before/after values |
| **proof** | BUSINESS TERM — KEEP | "Require proof of completion," "Submit proof," proof-type labels | Concrete and already well-labeled (aside from the G9 label-source divergence) |
| **cycle** | BUSINESS TERM — EXPLAIN | "Financial position · cycle #3," "Diagnosis history: Cycle #3 — {date}" | Understandable in context but slightly abstract on first read; a plain owner may not immediately connect "cycle" to "one run of a diagnosis" without the surrounding history list making it obvious. Not severe enough to force a rename (renaming risks losing the useful "this is the Nth one, they're numbered and comparable" meaning) — recommend leaving as-is but flagging for a future one-line explain if usability evidence later shows confusion; **not counted as a violation** |
| **execution** | AMBIGUOUS / BUSINESS TERM — EXPLAIN | Page title "Owner Execution & SOP"; also used generically ("execution actions," "execution diagnosis") | Overlaps with the "SOP" jargon problem (G5) rather than being a separate defect on its own; the word itself is fine ("did the work actually happen"), the *combination* with unexplained "SOP" in the same title is the issue already tracked at G5/E.1 |
| **audit trail** | BUSINESS TERM — EXPLAIN | `/owner/trust`'s "View audit trail," "Audit trail — {id}" heading | A compliance/fintech term most owners have some intuition for ("a record of what happened, in order") but never explicitly defined on the page; recommend one short line the first time it appears, e.g. "a time-ordered record of everything that happened for this item." Not severe enough alone to warrant renaming — the *raw id in the same heading* (G2) is the actual hard violation, not the phrase "audit trail" itself |
| **reference ID** (evaluated as a pattern, not a literal string — no screen literally says "Reference ID") | TECHNICAL — HIDE/MOVE | `sourceOperatorItemId` shown as "Source recommendation:" + raw id (task detail); `entityId` in the Trust audit-trail heading (G2) | Both are the same underlying UX pattern — a raw internal identifier shown as if it were primary content — and both are already tracked (G2, and the "MOVE BEHIND DISCLOSURE" item above) |
| **entity** | TECHNICAL — RENAME | `entityType` rendered raw on `/owner/trust` (G3) | No owner-facing screen uses the word "entity" as visible copy outside this one raw-enum leak; not a business term in this product's owner-facing vocabulary at all |
| **precheck** | BUSINESS TERM — EXPLAIN (see G8) | "AI Precheck Passed/Failed" proof-status labels | Same disposition as G8 — keep the concept, reword the label |

**No mechanical renaming was performed or proposed for every occurrence of any of these 14 terms** — per
the mission's explicit instruction, each is judged on its own context; several (diagnosis, snapshot,
confidence, finding, verification, proof) are judged correctly-used business vocabulary and are
recommended to stay exactly as they are.

---

## H. Canonical owner-language dictionary

This table exists so that "Tasks" and "Actions" and "Delegated work" — and, per this revision, "diagnosis"
and "assessment" and "review," and "outcome" and "verification," and every other pair the mission named —
are never casually collapsed into one word by a future contributor. Every row below is written to
preserve, not erase, a genuine semantic distinction (per UX-05A Section T's proven non-equivalence of
Proof/Evidence/Outcome/Verification/Reassessment).

### H.1 Concepts carried forward from v1.0

| Internal term | Current owner-facing term(s) | Recommended owner-facing term | Help text | Where used | Source of truth |
|---|---|---|---|---|---|
| `ProcessExecutionTask` | "My work" | KEEP "My work" | — | `/owner/tasks`, `/owner/cockpit` | `src/domain/execution/*` |
| `DelegatedTask` | "Delegated work" | KEEP "Delegated work" | — | `/owner/tasks` | `src/domain/execution/*` |
| `OwnerSopAction` | "Execution actions" | KEEP "Execution actions" once "SOP" is explained at the page level (G5) | "Actions your team is responsible for carrying out and proving" | `/owner/execution` | `sop` domain module |
| `BusinessConditionProfile` fields | Already humanized via `CONDITION_FIELD_LABEL` | KEEP | — | `/owner/cockpit` | UX-04A Section M (already fixed) |
| `InterventionMode` / `InterventionPhase` | Hidden from self-serve owners (gated) | KEEP hidden | — | `/diagnosis` (gated) | Design Direction §15 |
| `TrustLabel` (High/Moderate/Low) | "confidence {label} ({score})" | KEEP | — | `/owner/trust` | `src/domain/owner-trust/types.ts` |
| `TaskActorRole` | "Employee/Manager/Owner/System" | KEEP | — | `/owner/tasks/[taskId]` | already fixed (UX-05B Candidate 8) |
| Owner role values `MANAGER`/`STAFF` | rendered raw on 2 pages (residual) | RENAME via existing humanization helper | — | `owner/tasks/new/page.tsx:26-28` and one other page | already-recorded residual |

### H.2 Concepts required by this revision, not previously covered

| Internal term | Internal meaning | Current owner wording | Recommended owner wording | Explanation required? | Screens using it | Semantics differ by domain? |
|---|---|---|---|---|---|---|
| Diagnosis (run) | A computed read of a domain's health from supplied snapshot data, producing findings + a ranked action | "Run finance/sales/operations/execution diagnosis," "Diagnosis history" | KEEP | No — always paired with surrounding context | Money, Sales, Operations, Execution | **Yes, and correctly so** — each domain's diagnosis produces domain-specific score semantics (survival state vs. sales-strength ladder vs. operations-strain ladder vs. execution-discipline ladder); this document does **not** recommend collapsing these, per the mission's explicit instruction |
| Assessment | The cross-domain, Home-level synthesis of "what's going on and what to do," distinct from any single domain's diagnosis | "Business assessment" (Home) | KEEP | No | Home only | No — this is deliberately the *one* cross-domain concept; it must never be confused with a single domain's "diagnosis" |
| Review (proof review) | A human decision step accepting/rejecting submitted proof against a required standard | "Review proof," proof-review outcome options (Accept/Reject/Request Resubmission/Route to Human Review/Dispute) | KEEP | No — options are already hand-labeled | `/owner/tasks/[taskId]` | No, but see Candidate 9 (Section T): "review" here is proof-review, a *different* step from the still-undecided "Review & Approve" completion action — this distinction is exactly why Candidate 9 cannot be casually resolved as "just call the existing Accept button" |
| Finding | A specific, evidenced claim a diagnosis produced (an opportunity or a risk), with a metric, a threshold, and a confidence level | "Findings (3)," "What OpsIQ found" | KEEP | No | Money, Sales, Operations, Execution, Trust | No — same shape everywhere via the shared `FindingCard` concept (though Sales renders it via bespoke JSX, Section S) |
| Risk (finding type) | One of two finding categories — a negative signal | Badge text "Risk" | KEEP | No | same as Finding | No |
| Opportunity (finding type) | The other finding category — a positive/available signal | Badge text "Opportunity" | KEEP | No | same as Finding | No |
| Confidence | How much of a given reading rests on real supplied data vs. missing/estimated data | "Data confidence {n}/100," "confidence {label} ({score})" | KEEP | No — self-explaining in context | Money, Sales, Operations, Execution, Trust, Onboarding | **Yes, mildly** — Money/Operations/Execution's diagnosis-level confidence score is a different measurement from Trust's per-finding `TrustLabel` confidence; both are legitimately named "confidence" because they answer the same owner question ("how much should I trust this number"), and this document does not recommend forcing them into one shared score |
| Missing information | Data OpsIQ needs but does not yet have, named explicitly rather than silently defaulted | "Missing critical data:", "What is missing right now" | KEEP | No | Money, Sales, Operations, Execution, My Business | No |
| Action (generic) | An owner- or team-facing thing to do, produced by a diagnosis or delegated directly | "Finance/Sales/Operations/Execution actions," "Recommended next … action" | KEEP | No | Money, Sales, Operations, Execution, Home | **Yes, deliberately** — a domain-diagnosis "action" (proposed/assigned/in_progress/completed/blocked/cancelled) is a different lifecycle object from a `DelegatedTask` (15-state FSM) and a `ProcessExecutionTask`; this dictionary keeps all three separate below, exactly per the mission's "do not collapse" instruction |
| Task (`DelegatedTask`) | A named, delegated unit of work with an assignee, an optional due date, and an optional proof requirement | "Delegated work," "+ New Task" | KEEP "Tasks" (page-level, per E.3) / KEEP "Delegated work" (in-page section) | No | `/owner/tasks`, `/owner/tasks/new`, `/owner/tasks/[taskId]` | No |
| Verification | Confirming, after the fact, whether a completed action actually produced its intended effect, via a before/after metric comparison | "Verify outcome," "before {x} → after {y} ({direction})" | KEEP | No | Money, Sales, Operations, Execution | No |
| Proof | Evidence submitted against a task's proof requirement, subject to its own review step | "Require proof of completion," "Submit proof," proof-type/proof-status labels | KEEP | No (aside from G8's "AI Precheck" wording) | `/owner/tasks/new`, `/owner/tasks/[taskId]` | No — and this document explicitly preserves the prior finding (UX-05A Section T) that Proof, Evidence, Outcome, Verification, and Reassessment are five genuinely non-equivalent concepts, not five words for one thing |
| Outcome | The recorded, post-hoc result of an action once it was carried out (distinct from its later verification) | "Outcome recorded" (badge), execution-lifecycle "Record outcome" | KEEP | No | Home (execution lifecycle), Execution | No — deliberately distinct from Verification (Outcome is *what happened*; Verification is *whether it actually worked*, checked separately) |
| Snapshot | A point-in-time record of a business's own numbers, supplied by the owner, that a diagnosis is computed from | "Financial/Sales/Operations/Execution snapshot" | KEEP | No | Money, Sales, Operations, Execution | No |

---

## I. Information hierarchy findings

Classification: **PRIMARY** (must be visible with zero clicks) · **SECONDARY** (one click/scroll away,
still on the same page) · **ADVANCED** (behind an explicit disclosure).

Per the mission's own ambiguity-resolution rule, this section states **preferences with rationale**, not
a forced ranking that pretends a literal user study happened.

| Screen | PRIMARY | SECONDARY | ADVANCED |
|---|---|---|---|
| Home | Business assessment headline, Top priority + CTA | "Also worth knowing" strip, Other options | Recovery/Outside-signals/Business-condition/Execution-lifecycle/BOS collapsed sections, "View proof & details" |
| Money | Score tiles, survival badge, Recommended action | Findings list, Finance actions list | Diagnosis history, "Advanced detail (optional)" form tier |
| Sales/Operations | Score tiles, state badge, Recommended action | Findings, Actions | Diagnosis history (no progressive-disclosure form tier exists today — Section J) |
| Tasks | "My work," "Delegated work" list, filter | Status groupings | Pagination, per-task "What happens next" |
| Execution & SOP | Score tiles, Recommended action | Findings, Execution actions | Diagnosis history |
| Evidence & Trust | Domain selector, explanation cards' headline/why-it-matters | Source data / calculation / verification-method grid | Audit trail |
| My Business (Data) | Readiness summary, Next action, Ways to add data | Category groups | "Everything OpsIQ can use" full catalog |

---

## J. Progressive-disclosure plan

**Recommendation, stated as a preference, not a mandate:** promote Money's 3-tier progressive-disclosure
pattern (Quick / "Improve the analysis" / "Advanced detail") to Sales and Operations. This is a
**hierarchy improvement**, not a feature deletion — every field that exists today keeps existing, only
its default visibility changes.

**Concrete plan:**
1. Sales's 16 fields split into: Quick tier (the 4 already-required-feeling core fields: Leads,
   Qualified leads, Orders, Revenue), "Improve the analysis" tier (the remaining customer/B2B/discount
   fields), no "Advanced" tier needed (Sales has no fields as niche as Money's Rework/Complaint/Owner-
   withdrawal fields).
2. Operations's 13 fields split similarly: Quick tier (Orders received/completed/delayed), "Improve the
   analysis" tier (Rework, Complaints, Staff hours, Machine capacity, Idle hours), "Advanced" tier
   (Delivery attempts/failures, Inventory shortages, SOP checks/misses — pending the "SOP" jargon fix,
   Section G).
3. Each new tier must carry the same per-field hint text pattern Money already uses — this plan does not
   add fields, remove fields, or change validation; it only changes default visibility and adds hints.

**Evidence gate before this plan is frozen for implementation, not just proposed:** the 390px rendering of
whatever the new tiered layout produces on Sales/Operations is `MUST_BROWSER_VERIFY_BEFORE_MERGE`
(Section AB) — this plan's own visual correctness at mobile width has not been checked because it does
not exist yet; only the *current, flat* forms' mobile behavior is an open gap (Section M), and this new
plan inherits that same gate rather than resolving it in advance.

---

## K. Form & data-entry findings

| Form | Fields | Labels present? | Hints present? | Progressive disclosure? | Notable defect |
|---|---|---|---|---|---|
| Login | Email, Password | Yes | No | N/A | No password-visibility toggle |
| Signup | Email, Password, Workspace Name, 3 checkboxes | Yes | No | No | No password-visibility toggle; label/placeholder disagreement on the business-name field (G10) |
| Reset password | New password, Confirm | Yes | No | N/A | No password-visibility toggle, ×2 fields |
| Essential Numbers (Onboarding) | 5 numeric | Yes | Yes | N/A | None found |
| CreateBusinessPanel | Name, Type, Currency | Yes | No | N/A | None found |
| Finance snapshot | ~27 numeric | Yes | Yes, every field | Yes, 3 tiers | Best-in-class of the three domain forms |
| Sales snapshot | 16 numeric | Yes | **No** | No | Flat grid, no explanation anywhere (Section J plan) |
| Operations snapshot | 13 numeric | Yes | No | No | "SOP" abbreviation unexplained (G5) |
| Capacity snapshot | 2 numeric | Yes | Yes (contains jargon, G6) | N/A | "(0–1)" fractional-input convention exposed raw |
| Owner workload snapshot | 2 numeric | Yes | Yes (contains jargon, G6) | N/A | — |
| New task | Title, Description, Assign to, Due date, Require-proof checkbox, Proof type | Yes | Partial | N/A | Auto-humanized ProofType mismatch (G9); `noValidate` with only a JS-guard on Title |
| Submit proof / Review proof (task detail) | proof type, note / outcome, rejection reason | **No persistent label** — placeholder-only | No | N/A | Accessibility/labeling gap |

**Recommendation:** the Submit-proof/Review-proof forms should move to the same `Input`/`Select`
primitives with visible labels used everywhere else in the app.

**window.prompt() inventory (all SOURCE-VERIFIED, all re-confirmed present at this commit):**

| Page | Dialogs |
|---|---|
| Money | "Completion notes:", "Completion evidence:", "BEFORE value for {metric}:", "AFTER value for {metric}:", "Target direction (up / down):" |
| Owner Sales | same 5, verbatim |
| Operations | same 5, verbatim |
| Owner Execution & SOP | same 5, verbatim |

20 individual native-dialog call sites across 4 pages, all doing conceptually identical "complete"/
"verify" actions that Home's `MinimumOwnerCockpit` already solved with labelled inline inputs. This is
the largest single mechanical-consistency fix available in this audit, and — per the correction in
Section AB — it is **not** a presentation-only change; it requires the same behavioral test coverage any
interaction change would.

---

## L. Empty / loading / error / missing-data findings

**Governing principle (re-confirmed, not violated anywhere found):** missing data must never look like
healthy/zero/safe/complete. Every domain page's snapshot form carries the verbatim assurance "missing
data is reported, never invented," and Home explicitly refuses to render a fabricated "nothing needs
attention" state when data is merely absent. LOCAL-BROWSER-VERIFIED: the zero-business Home state renders
as a real, distinct `EmptyState` component — not a blank dashboard, not a zero score.

| Consistency dimension | Finding |
|---|---|
| Error markup | `role="alert"` used on Money, Tasks-new; plain (no role) on Sales, Operations; Trust doesn't route through the governed classifier at all (Section U) |
| Empty-state component | Shared `EmptyState` primitive on Home, Tasks list; bespoke plain boxes on Money/Sales/Operations/Execution's zero-business and zero-diagnosis states |
| Loading skeleton | Every audited page uses a skeleton with `sr-only` loading text — consistent and good, aside from the "workspace" wording leak (G11) |
| "Nothing missing" render | `/owner/data`'s `MissingCritical` returns `null` rather than an explicit positive statement — a minor missed opportunity, not a defect |

---

## M. Mobile (390px) findings

All findings below are LOCAL-BROWSER-VERIFIED via actual rendered screenshots at 390×844, not inferred
from Tailwind class names, except where marked otherwise.

| Surface | Finding |
|---|---|
| Login / Signup / Forgot-password | Clean single-column card layout, no horizontal scroll, full-width inputs and submit button. No defect found. |
| Sidebar | Collapses correctly to a hamburger icon + logo + user-avatar top bar; the drawer's own opened-state internal layout was not screenshotted (NOT-YET-VERIFIED) — only its collapsed trigger state is confirmed |
| Home (empty + post-business) | Renders cleanly, cards stack full-width, all copy readable without horizontal scroll |
| My Business (Data) | Renders cleanly at both empty and post-create states |
| Tasks list | Renders cleanly empty and with one task; filter `<select>` remains full-width and usable |
| Money / Owner Sales / Operations / Execution (empty states) | All four render their zero-business/zero-diagnosis empty-state box cleanly, centered, no overflow |
| **Money / Sales / Operations snapshot forms at 390px** | **`MUST_BROWSER_VERIFY_BEFORE_MERGE` (Section AB) — not opened in the mobile pass.** SOURCE-VERIFIED only: Sales/Operations use a flat, un-hinted grid described as multi-column in the source; whether it collapses correctly below 1440px is unverified and is the single most important gate before Wave B's harmonization (Section J) or the current forms ship as-is to a mobile owner. This is not merely "recorded" — it is a hard merge gate, not an optional follow-up. |

---

## N. Accessibility & cognitive-usability findings

- **Status communicated via more than color, confirmed:** every status/severity value renders as text
  inside a `Badge`, never a bare color swatch — SOURCE-VERIFIED, consistent with UX-05A Section Z.
- **Loading states carry `sr-only` text** on every skeleton component observed — LOCAL-BROWSER-VERIFIED
  indirectly, SOURCE-VERIFIED directly. The strengthened UX-05C test additionally proves, at the unit
  level, that this loading status is never cleared prematurely by a stale async response.
- **Labeling gap, re-confirmed:** the task-detail page's Submit-proof/Review-proof form fields use
  placeholder text only, no persistent `<label>`. **Classification: MEDIUM.**
- **Native `window.prompt()` dialogs are themselves an accessibility regression** — no custom labels, no
  inline validation, whatever minimal accessibility the platform's own dialog chrome provides.
- **Heading hierarchy:** not exhaustively verified beyond what the extraction confirmed (H1/H2 usage is
  consistent) — deeper heading-order and touch-target size auditing remains NOT-YET-VERIFIED (would need
  an automated axe-core pass, not performed).

---

## O. Sign-in / signup findings

All SOURCE-VERIFIED via direct code read, LOCAL-BROWSER-VERIFIED for rendered markup.

- Fully custom cookie-session auth (`opsiq_session`, opaque UUID token, 24h expiry, server-side lookup) —
  no NextAuth/Auth.js/Passport/iron-session dependency exists in `package.json`.
- Login and Signup both use plain native `type="password"` inputs, **no visibility toggle**, on all 4
  password-bearing form instances app-wide. LOCAL-BROWSER-VERIFIED at both viewports.
- Signup never creates a session — an open-beta account is unusable until the emailed verification link
  is redeemed. Deliberate, correct security posture; no change recommended.
- Email verification is enforced **only at login**, not on every request — architectural note, not a
  defect (a session, once issued, is already post-verification by construction).
- **[New this revision]** The Signup form's "Workspace Name" field label disagrees with its own
  placeholder text ("Your company name") — see G10. This is a sign-in/signup-surface language finding in
  its own right, not only a general jargon-sweep item.

---

## P. Password-visibility specification

**Scope:** add a Show/Hide toggle to all 4 native password inputs: Login's Password, Signup's Password,
Reset-password's "New password" and "Confirm new password."

**Implementation option NOT yet frozen (corrected in this revision):** v1.0 leaned toward extending the
shared `Input` primitive as the only option. That choice is withdrawn as a freeze; three options are
evaluated instead:

| Option | Blast radius | Verdict |
|---|---|---|
| Extend `Input` with an adornment slot | Touches the one shared primitive every text/password/number field in the app renders through — the largest possible regression surface for this change | Not frozen; viable only with full regression coverage of every existing `Input` usage, not just the 4 password sites |
| Dedicated `PasswordInput` wrapper (composes `Input` internally, adds the toggle) | Isolated — a new, small component; zero risk to any non-password field | **Preferred candidate**, pending implementation-time confirmation that `Input`'s existing prop surface (label/error/hint) can be forwarded cleanly |
| Local composition around `Input` at each of the 4 call sites (no shared component at all) | Smallest single-file blast radius, but duplicates the toggle logic 4 times | Rejected as the primary choice only because it duplicates logic the mission's own repo-wide pattern (one shared primitive per concern) would otherwise avoid — acceptable as a fallback if a shared wrapper proves awkward |

**What this document freezes is behavior, not implementation:**
- A "Show password" / "Hide password" icon-button, `type="button"` (never submits the form).
- Keyboard accessible (reachable by Tab, activatable by Enter/Space).
- Carries an accessible name that changes with state ("Show password" ↔ "Hide password").
- State is **per-field**, never global — toggling one password field's visibility never affects another.
- Default state is always hidden (`type="password"`) on every render, including after a failed submit.
- Toggling visibility **never clears or mutates the field's value.**
- Must continue to work correctly with password managers/browser autocomplete — i.e., the toggle must not
  interfere with `autoComplete="current-password"`/`"new-password"` attributes already present.

**Explicitly not in scope for this low-risk item:** anything about Google identity, account linking, or
session creation — see Section Q.

---

## Q. Google authentication architecture & security specification

**This section is a specification only — no OAuth code is implemented here.**

### Q.1 What exists today (SOURCE-VERIFIED, unchanged from v1.0's finding)

Google OAuth exists in this codebase **exclusively** as a Google Sheets **data-import connector**
(`src/services/external-systems/google-sheets-oauth.service.ts`), never as account authentication — its
default scopes (`spreadsheets.readonly`, `drive.readonly`) carry no `openid`/`email`/`profile` claim
access at all, its callback path is under `/api/integrations/`, not `/api/auth/`, no callback route is
actually implemented yet, and the repository's own internal audit independently classifies it
`PLACEHOLDER_ONLY`. No code path anywhere calls this service from any user-facing auth route.

**Conclusion, unchanged:** the existing Google OAuth credentials/config must not be assumed reusable for
account sign-in as-is, and a new sign-in flow must never call into `google-sheets-oauth.service.ts`.

### Q.2 Corrected architecture — Google Identity Services, not generic OAuth (corrected in this revision)

v1.0 described the needed flow generically as "`openid email profile` scope set + OAuth callback,"
implying the same authorization-code-and-redirect shape the Sheets connector already uses. That is
**incorrect** for basic sign-in and is corrected here against Google's own current guidance:

- **The primary credential for "Sign in with Google" on the web is an ID token (a signed JWT)**, returned
  by Google Identity Services (GIS) — not an OAuth access token, and not the authorization-code flow the
  Sheets connector uses. GIS's identity building blocks (the "Sign in with Google" button and One Tap)
  hand the client a `credential` (the ID token) via either a JavaScript callback or a POST to a
  server-designated `login_uri` — **no redirect-based OAuth callback route is required for identity
  alone.**
- **The server must verify this ID token** — checking its signature against Google's published keys,
  its `aud` claim against this app's own Google client ID, its `iss` claim, and its expiry — before
  trusting any claim inside it. (Sourced: Google's own "Verify the Google ID token on your server side"
  guidance and "Best Practices for Implementing Sign in with Google," `developers.google.com/identity/
  gsi/web/guides/verify-google-id-token` and `developers.google.com/identity/siwg/best-practices` —
  fetched via search summary in this session; direct WebFetch to `developers.google.com` is blocked by
  this sandbox's egress policy, so these are cited as the authoritative source to re-confirm directly
  before implementation, not reproduced verbatim here.)
- **`sub` is the stable, non-reusable identifier for a Google Account** and is explicitly the field Google
  instructs applications to persist and match against — **not email**, because a single Google Account
  can have multiple email addresses over time, and because (see Q.3) Google is not always the
  authoritative party for a third-party email address even when its own `email_verified` claim is `true`.
- **This is entirely separate from OAuth API-access scopes.** The Sheets connector's
  `spreadsheets.readonly`/`drive.readonly` scopes, its authorization-code exchange, and its access/refresh
  tokens are a **distinct concern** (API authorization) from identity (who is this person). A basic
  "Sign in with Google" implementation needs none of that — no access token, no refresh token, no Drive/
  Sheets scope, and therefore no reason to route through the redirect-based flow the Sheets connector was
  built for. Do not freeze a redirect-based flow merely because that connector uses one.

### Q.3 Safe existing-account linking — FROZEN in this revision, stricter than Google's own minimum

v2.0 left open whether automatic linking should ever be enabled for the case where Google *is*
authoritative for the address (`@gmail.com`, or a Google Workspace domain signaled by the `hd` claim).
**This revision closes that question with a deliberately stricter product/security policy than Google's
own guidance requires:** OpsIQ never links automatically on email match alone, **even when Google is
authoritative for that email.** Google's `email`, `email_verified`, and `hd` claims establish what
*Google* knows about the address — they do not by themselves establish that the *OpsIQ account* holder
and the *Google account* holder are the same authorization to merge, and this document does not treat
Google's authority over an email as sufficient authority over an OpsIQ account.

**Frozen linking policy:**

1. A Google credential arrives with a verified `sub`.
2. If that `sub` already has a stored link to an OpsIQ `User` (Q.4's identity concept), sign in as that
   user directly via the normal session flow (Q.6). No further decision needed.
3. If the `sub` has no existing link, and the ID token's `email` matches an existing `User.email`:
   **automatic linking never occurs, unconditionally** — this applies identically whether or not Google
   is authoritative for that address; `email_verified`, `@gmail.com`, and `hd` are never, by themselves,
   sufficient to attach a Google identity to an existing account. The required flow instead is:
   1. Tell the person plainly that an OpsIQ account already exists for this email.
   2. Require them to authenticate to *that existing OpsIQ account* first — using its existing password,
      or a one-time email re-verification/re-authentication flow; the eventual implementation may choose
      whichever safe, already-existing mechanism reuses the most (Q.9).
   3. Only after that succeeds, explicitly offer a "Link Google account" action.
   4. Write the `UserAuthIdentity` link (Q.4) only on that explicit action.
   5. Emit an `AuditEvent` for the link itself.
   6. Proceed into the normal session flow (Q.6).
4. If no existing `User.email` matches at all, this is a new-user flow (Q.5) — never a link.

**Email is never the provider identity key, under any circumstance this document specifies** — not for
sign-in (Q.2's `sub`), and not for linking (this section).

### Q.4 Provider-identity persistence is currently missing (corrected — schema is not already sufficient)

v1.0 stated `WorkspaceMembership.primaryAuthMethod` as if it were already meaningful identity-linkage
infrastructure. That framing is **withdrawn**: `primaryAuthMethod` cannot safely serve this purpose,
because authentication identity belongs to a `User`, not to a `WorkspaceMembership` — a single `User` can
have multiple `WorkspaceMembership` rows (one per workspace), and a Google `sub` identifies a Google
Account, not a workspace relationship. Using this column as an identity key would silently produce a
different "linked identity" per workspace for the same person, which is not the correct model.

**Architecture decision frozen by this document:** a durable **Google `sub` → OpsIQ `User`** binding is
required, at the `User` level, independent of any workspace. **The exact schema is not frozen here** — no
migration is authorized by this document — but the concept this future schema must express is equivalent
to:

```
UserAuthIdentity
- id
- userId          (→ User, the OpsIQ identity this credential is bound to)
- provider        (e.g. "google")
- providerSubject (the durable, provider-issued `sub` — never email)
- createdAt
- linkedAt
```

with a uniqueness constraint equivalent to `unique(provider, providerSubject)` — one Google Account can
bind to exactly one OpsIQ `User`, and one OpsIQ `User` may (in principle, for a future multi-provider
world) hold more than one `UserAuthIdentity` row. This table's *existence and shape concept* is frozen;
its exact field names, migration, and whether it replaces or supplements `primaryAuthMethod` are not —
that is implementation detail for the eventual Wave D PR, not this document.
`WorkspaceMembership.primaryAuthMethod` must not be used as the identity-binding key; it may later hold
purely descriptive/account metadata if genuinely useful, but never the durable link itself.

### Q.5 New-Google-user flow — frozen in this revision, must preserve the full account graph

A genuinely new Google user (no existing `sub` link, no matching `User.email`) must still pass every gate
a password signup passes today — none of these may be silently skipped just because Google already
verified an email address:

- Beta admission (`admissionMode`, `BetaRequest` invite check).
- Capacity (the advisory-lock-guarded `reservePublicBetaCapacity()` check).
- Business/workspace naming — a Google-authenticated new user still needs to name their business, exactly
  as the password-signup flow's required `workspaceName` field does today (labelled correctly this time —
  see G10 for the current field's label/placeholder defect, which a Google-flow equivalent screen must
  not repeat).
- Explicit Terms acceptance, Privacy acceptance, and Beta-notice acceptance — each its own
  `PolicyAcceptance` row, exactly as today.
- Workspace creation, `WorkspaceMembership(role="owner")`, and `UserRoleAssignment` provisioning.
- The same `AuditEvent`s (`USER_CREATED`, `POLICY_ACCEPTED`, etc.) the password path emits today.

**Frozen "Finish setting up OpsIQ" screen — exact fields (copy may be polished, field set is frozen):**

```
Finish setting up OpsIQ

Business name          [ ______________________ ]   (required)
Signed in as: {verified Google email}                (read-only, from the Google credential)

[ ] I accept the Terms
[ ] I accept the Privacy notice
[ ] I accept the Beta notice
```

- **No password field.** Google's credential already establishes the identity; asking for a password here
  would reintroduce exactly the friction a Google sign-in is meant to remove.
- **No OpsIQ email-verification step.** The email inside the verified Google ID token is not re-verified
  by OpsIQ's own emailed-link mechanism — Google already verified it as part of issuing the credential.
  This is a deliberate, narrow exception to the password flow's own email-verification requirement, not a
  general relaxation of it; the password flow's own verification step is unchanged for password users.
- **Every other gate above still applies in full** — this screen removes identity friction, not legal or
  capacity gates. If beta admission or capacity fails, the person is refused *before* this screen is
  reached, exactly as a password signup is refused before its own form is shown.

**Transactionality, named as a requirement, not designed here:** the eventual implementation must ensure
that a failure partway through (workspace creation succeeds but `UserAuthIdentity` linking fails, or vice
versa) never leaves a half-created, unusable-but-present account graph — the same atomic-transaction
pattern the existing password-signup route already uses (`SIGNUP_TRANSACTION_TIMEOUT_MS`-bounded, all-or-
nothing) is the pattern to extend, not reinvent. The exact transaction boundary and idempotency behavior
(e.g., what happens if the same Google credential is submitted twice in quick succession) is Wave D
implementation design, not decided by this document.

### Q.6 Session architecture preserved (unchanged from v1.0, re-confirmed correct)

The corrected Google flow still ends in the existing OpsIQ session system: verified Google identity →
resolved OpsIQ `User` → a normal `Session` row → the normal `opsiq_session` cookie → the canonical Home
redirect. No NextAuth/Auth.js migration. No parallel session mechanism. No Google token is ever used as
the ongoing OpsIQ session credential — the ID token is checked once, at sign-in, and discarded; every
subsequent request is authenticated by the existing `opsiq_session` cookie exactly as it is today.
Logout/session revocation remains entirely OpsIQ-controlled and requires no change.

### Q.7 Sign-in UX shape — frozen in this revision

**"Continue with Google" appears on both `/login` and `/signup`.** Returning users naturally start from
Login; new users naturally start from Signup. The backend identity resolver — not the page the button
was clicked from — is what determines whether a given credential represents a linked existing user
(Q.3 step 2), an unlinked existing account (Q.3 step 3), or a genuinely new user (Q.5). Both entry points
call the same resolver; neither page needs to know in advance which case it will turn out to be.

**Google One Tap is explicitly excluded from the first version.** No `auto_select`, no automatic/silent
One Tap sign-in. The first release requires a deliberate user action — clicking the explicit "Continue
with Google" button — for every sign-in, whether the person is new or returning. This is a deliberate
scope reduction, not an oversight: it keeps the account-linking behavior in Q.3 predictable (no
credential is ever presented to the resolver without the person having just chosen to sign in with
Google), and avoids the additional consent/FedCM-eligibility considerations One Tap's silent flows would
otherwise raise. One Tap may be reconsidered in a later wave, but is not part of this specification.

### Q.8 Google sign-in is not Google API authorization — frozen, re-emphasized

Restated as its own explicit freeze, not only as a side note inside Q.2: **"Sign in with Google" and the
Google Sheets connector are, and remain, two unrelated features.** The sign-in flow this document
specifies never requests `spreadsheets.readonly` or `drive.readonly`, never stores a Google access or
refresh token merely for login, and never routes through `google-sheets-oauth.service.ts`. Google's own
current web GIS documentation confirms the "Sign in with Google" button returns an ID-token credential
for identity, and separately confirms `sub` as the recommended durable account identifier — the
authorization-code-and-scopes machinery the Sheets connector needs is a different Google product surface
entirely, and this document does not conflate them anywhere.

### Q.9 Status after this revision

```
Google identity architecture:                 SPECIFIED
Product decisions:                            RESOLVED
Implementation:                                NOT STARTED
Schema migration:                              REQUIRED IN WAVE D (not authorized by this document)
Existing-account silent email linking:         FORBIDDEN (unconditionally — Q.3)
Google One Tap in the first release:           NO (Q.7)
"Continue with Google" placement:              LOGIN + SIGNUP (Q.7)
OpsIQ session architecture:                    PRESERVED, unchanged (Q.6)
Google Sheets/API OAuth scopes requested for login: NONE (Q.8)
```

Remaining Wave D work is now implementation, security, schema, and Google Cloud configuration design —
not further product choice. Session creation/logout, beta admission, capacity, and policy acceptance are
all unchanged mechanisms this flow must call into, not new mechanisms this document invents.

**Risk classification: HIGH implementation risk, isolate into its own PR/wave (Wave D, Section Z) — never
bundled with the low-risk password-visibility work in Section P.**

---

## R. Home-authority check

**Requirement:** `/owner/cockpit` (rendered title "Home") must remain the sole "what needs attention"
surface.

**Finding: PASS, largely pre-existing.** LOCAL-BROWSER-VERIFIED: Home is the only screen in the audited
set that renders a "Your top priority now" block with a severity badge and a single primary CTA. Every
other domain page has its own "Recommended next {domain} action" card, but these are explicitly
domain-scoped recommendations feeding into, not competing with, Home's cross-domain top-priority
selection (confirmed via UX-05A Section Q's 18-capability overlap matrix, which concluded no merge was
warranted). SOURCE-VERIFIED: `sidebar-nav.tsx` already removed the standalone "What needs attention" and
"Alerts" nav links specifically to protect this property.

**Residual to note, not a defect:** the "Continue on Home →" link inside Tasks's "My work" section, and
the "Continue setup" link on Home's own continuation card, both route back to Home/Start-Here rather than
deep-linking to the specific item — the previously-recorded "Continue on Home" residual (Section V), a
minor friction, not an authority violation.

---

## S. Money / Sales / Operations consistency matrix

Per the mission's explicit instruction, this section harmonizes **language and presentation**, never
domain scoring semantics.

| Dimension | Money | Owner Sales | Operations | Consistent? |
|---|---|---|---|---|
| Page title vs. nav label | "Money" vs. nav "Money" | "Owner Sales" vs. nav "Sales" | "Operations" vs. nav "Operations" | **NO** — Sales alone carries an "Owner " prefix; drop it (Section E.1) |
| Empty/no-diagnosis state | Shared `DiagnosisEmptyState` | Bespoke single-sentence box | Shared `DiagnosisEmptyState` | **NO** — Sales is the odd one out |
| Findings rendering | Shared `FindingCard` | Bespoke inline block | Shared `FindingCard` | **NO** |
| Snapshot form structure | 3-tier progressive disclosure, every field hinted | Flat grid, no hints | Flat grid, no hints | **NO** — Money is the outlier in a good direction (Section J plan) |
| Page-level error markup | `role="alert"` | plain div | plain div | **NO** — Money is again the more-correct outlier |
| Low-confidence banner wording | Names "BLOCKED tier" (G4) | N/A | Same threshold, no tier name | Inconsistent wording for the same rule |
| `updateAction`/`verifyAction` input mechanism | `window.prompt()` | `window.prompt()` | `window.prompt()` | Consistent — but consistently the outdated pattern (Section K) |
| Action-status label set | 6 values, humanized | Same 6 | Same 6 | **YES** |
| Verification-outcome label set | 5 values, humanized | Same 5 | Same 5 | **YES** |

**Recommendation:** harmonize toward Money's pattern rather than inventing a fourth.

---

## T. Actions usability audit (Tasks & Execution cluster)

LOCAL-BROWSER-VERIFIED: the Tasks list correctly separates "My work" from "Delegated work," with
status-group filtering and governed, non-raw status labels throughout. Creating a task and viewing it in
the list both worked end-to-end in the browser pass with no console errors observed.

### T.1 CANDIDATE 9 — PRODUCT DECISION (RESOLVED in this revision)

**Status:**

```
Defect:                       PROVEN
Product/workflow decision:    RESOLVED
Implementation:               NOT STARTED
Beta blocker:                 YES
Wave:                         A2
```

The four questions v2.0 left open (reproduced there verbatim from the merged UX-05A contract) are now
answered by an explicit product decision, recorded here rather than left to an implementer to guess:

1. **The review experience** — resolved: no separate review step. Proof review has already happened
   before a task ever reaches `COMPLETED_PENDING_REVIEW`; the existing Proof panel already renders above
   the owner-action area on the same page, and the owner is expected to have read it there, not in a
   second place.
2. **The explicit approval action** — resolved: a single, explicit primary button ("Approve task") on the
   same page. No modal, no second confirmation step — the task's own status change (to
   `COMPLETED_PENDING_REVIEW`) already signals a meaningful state, and requiring a second gate on top of
   a page the owner deliberately navigated to would add friction without adding information.
3. **Proof visibility at the moment of approval** — resolved: the existing Proof panel, positioned above
   the approval action as it already is, is sufficient. No re-display or re-selection of the accepted
   proof is required as part of the approval click itself.
4. **Existing server gates** — resolved: unchanged. `completeTask()` remains the sole authority for proof
   acceptance, duplicate-proof protection, proof freshness, allowed-transition checking, and separation of
   duty. No client-side logic replaces, duplicates, or bypasses any of these.

### T.2 CANDIDATE 9 — frozen same-page experience

**Location:** the repair belongs on the existing `/owner/tasks/[taskId]` page. **No new `/complete`
page, route, or API is created.**

**Trigger:** `task.status === COMPLETED_PENDING_REVIEW`. The existing dead `Review & Approve` →
`/owner/tasks/[taskId]/complete` link is replaced by a same-page final-approval block in the eventual
Wave A2 implementation.

**Required presentation (copy may be polished at implementation time, meaning frozen):**

```
Ready for approval

The work has been completed. Review the details and any proof above, then approve it
to mark this task as complete.
```

If the task has no proof requirement, the copy may drop the "any proof above" reference but must still
state the consequence plainly before the action is taken. Primary action label: **"Approve task."** The
consequence — *approving marks the task as complete* — must be legible before the click, not only in the
button label.

**Server call (unchanged endpoint, unchanged service, unchanged gates):** the button calls the existing

```
POST /api/owner/tasks/complete
{ "taskId": "<current task id>" }
```

**Never** sent from this owner-facing UI: `ownerOverride`, `maxProofAgeDays`. `completeTask()` remains
the sole authority for proof-clearance, duplicate-proof protection, freshness, allowed-transition
checking, separation of duty, and the final `APPROVED_COMPLETE` transition and its audit events. No
client-side logic, alternate completion service, or duplicate FSM may substitute for any of this.

**Plain-language blocked states (frozen mapping; raw codes below must never render to an owner):**

| Raw server reason (never shown) | Owner-facing text (exact wording may be polished, meaning frozen) |
|---|---|
| `proof_not_accepted` | "The proof still needs to be accepted before this task can be approved." |
| `duplicate_proof` | "This proof was flagged as a duplicate. Review it or ask for new proof before approving the task." |
| `proof_stale` | "The accepted proof is too old to use for approval. Ask for updated proof." |
| `separation_of_duty` | "The person who completed this work cannot approve it. Another authorised reviewer needs to approve the task." |
| `transition_denied` | "This task cannot be approved from its current state. Refresh the task and review its latest status." |

Any other/unexpected failure continues to use the existing governed, operator-safe error mechanism
(`classifyOperatorError`) already proven elsewhere on this page — it is not given a new error path.

**Success behavior:** on a successful call, show a plain confirmation ("Task approved."), then reload the
authoritative task state from the server rather than optimistically inventing the final status client-
side. The resulting owner-visible status badge must read "Approved."

**Likely file/scope (not a schema, service, or API change):**

```
src/app/(authenticated)/owner/tasks/[taskId]/page.tsx
```

No new page. No API change. No service/domain/schema change. Tests are required (Section AB).

**Frozen future test contract** — at minimum, the eventual implementation's tests must prove:

- `COMPLETED_PENDING_REVIEW` renders the "Ready for approval" block.
- The dead `/complete` `Link` no longer exists anywhere in the file.
- The Proof panel/details remain visible above the approval action, unchanged.
- "Approve task" calls the existing `POST /api/owner/tasks/complete`.
- The request body contains `taskId` and does **not** contain `ownerOverride` or `maxProofAgeDays`.
- The button disables while the request is in flight.
- Each of the five known 409 reasons above renders its mapped plain-language message, never the raw code.
- An unexpected failure remains operator-safe (governed message, no raw exception).
- A successful approval reloads the task and the rendered status becomes "Approved."
- No second proof-review step is invented anywhere in this flow.
- Every other pre-existing task-detail behavior (status history, other status transitions, the non-
  proof-required path) continues to function unchanged.

### T.3 Other Actions/Execution findings (unchanged in substance from v1.0/v2.0)

**Confirmed defect, page-title vs. nav-label mismatch:** now resolved in this revision (Section E.3) by
renaming the page's own H1 from "Actions" to "Tasks," not the nav.

**Execution page:** LOCAL-BROWSER-VERIFIED empty state renders correctly. SOURCE-VERIFIED: the
previously-recorded "error+empty simultaneous render" defect (UX-05A Section S) was not independently
re-verified in the browser this pass — carried forward as an open residual, NOT-YET-VERIFIED.

**Raw `window.prompt()` dialogs, re-confirmed:** SOURCE-VERIFIED — Execution's "Complete" and "Verify
outcome" actions still use 5 unlabeled native browser prompts (Section K).

---

## U. Evidence & Trust usability audit

LOCAL-BROWSER-VERIFIED: `/owner/trust` loads correctly at both viewports. The naming mismatch previously
flagged here is resolved in Section E.2 by renaming the page's own H1 to "Evidence & Trust," matching the
nav (reversed from v1.0's recommendation).

**This is the single most jargon-exposed screen audited** (Section G1–G3): once a real diagnosis cycle
exists, the explanation cards and audit-trail rows render `findingType`, `findingCode`, `entityId`,
`eventName`, and `entityType` completely raw and unmapped — the exact populated render is
`NOT-YET-VERIFIED` (Section AB) but the code path having no label map at all is SOURCE-VERIFIED with
certainty. **Classification: HIGH** — not a blocker, but it directly contradicts the page's own promise
of full explainability if the explanation itself contains unexplained tokens.

**Also confirmed:** this page's error handling does **not** route through `classifyOperatorError` the way
every other audited page does — SOURCE-VERIFIED, meaning a raw `Error.message` could reach the owner here
specifically. **Classification: MEDIUM.**

---

## V. Known residual disposition register

| Residual | Disposition |
|---|---|
| Candidate 9 — dead `/owner/tasks/[taskId]/complete` link | **HARD WORKFLOW BLOCKER** (Section W). Product decision `RESOLVED` (Section T.1) — same-page approval on `/owner/tasks/[taskId]` (Section T.2). `IMPLEMENTATION: NOT STARTED`. Wave A2. |
| MANAGER/STAFF raw-value leak | **HIGH.** Wave A1 (mechanical humanization, same class as G9). |
| Execution's simultaneous error+empty-state render defect | **MEDIUM**, NOT-YET-VERIFIED. Wave B. |
| `OwnerSopAction` concurrency asymmetry | **LOW/deferred** — backend-workflow review, out of this audit's scope. |
| "Continue on Home" missing deep-link | **LOW.** Wave C (polish). |
| `window.prompt()` usage across Money/Sales/Operations/Execution (20 call sites) | **HIGH.** Wave B, with behavioral test coverage required (Section AB). |
| Sales/Operations 390px snapshot-form gap | **`MUST_BROWSER_VERIFY_BEFORE_MERGE`** (Section AB) — hard gate, not a deferred item. |
| Trust page's raw enum/ID leaks (G1–G3) | **HIGH.** Wave B. |
| Trust page's un-governed error handling | **MEDIUM.** Wave B (bundle with the above, same file). |
| Nav/page-title mismatches (Trust, Sales, Tasks) | **MEDIUM.** Wave A1 (pure copy changes, no logic). |
| "BLOCKED tier" / "SOP" / "scaling gate" / "human-execution-reality dimension" jargon | **MEDIUM.** Wave A1 (copy-only). |
| Password-visibility toggle | **MEDIUM, low-risk.** Wave A1 — never bundled with Wave D. |
| **[New]** "Workspace Name" label/placeholder disagreement (G10) | **MEDIUM.** Wave A1 (copy-only). |
| **[New]** "Loading … workspace" skeleton labels (G11) | **MEDIUM.** Wave A1 (copy-only, one shared string pattern). |
| Google sign-in | **Spec resolved (Section Q).** Product decisions closed (Q.9). `IMPLEMENTATION: NOT STARTED`. Its own isolated Wave D. |

---

## W. Beta blockers

Per the corrected terminology this revision adopts (distinguishing a broken workflow from a language/
polish requirement — see Section AC for the full set of BETA UX EXIT GATES):

**HARD WORKFLOW BLOCKER (1):**
1. **Candidate 9 — dead Review & Approve link.** Owners with a task in `COMPLETED_PENDING_REVIEW` cannot
   approve or reject it through the UI at all. This is the only item in this entire audit classified as
   an unconditional broken-workflow blocker. Its product/workflow decision is now **resolved** (Section
   T.1: a same-page "Approve task" action, Section T.2), but it remains a beta blocker until that
   decision is actually implemented — `IMPLEMENTATION: NOT STARTED` is not the same as "not a blocker."

No other single finding in this audit rises to HARD WORKFLOW BLOCKER on its own. Every hard owner-
language, mobile, and accessibility requirement this document names is not therefore optional — each is
listed as its own explicit BETA UX EXIT GATE in Section AC, and beta is not complete until every gate
listed there is also satisfied, whether or not any one of them is a "broken workflow" in the Candidate-9
sense.

---

## X. High-value improvements

1. Fix the Trust page's raw-enum/ID leaks (G1–G3) and route its errors through `classifyOperatorError`.
2. Replace all 20 `window.prompt()` call sites with the labelled inline-input pattern already proven on
   Home, with full behavioral test coverage (Section AB).
3. Resolve the 3 nav/page-title mismatches via the page-title-side fixes frozen in Section E.
4. Fix the remaining jargon leaks (Section G): "BLOCKED tier," "SOP," "scaling gate," "human-execution-
   reality dimension," the Goal-chip raw state, `AI Precheck` wording, `ProofType` label-source
   unification, MANAGER/STAFF residual, "Workspace Name" label, "Loading … workspace" skeleton labels.
5. Harmonize Sales/Operations toward Money's pattern (Section S) with the progressive-disclosure plan
   (Section J), gated on the 390px evidence requirement (Section AB).
6. Add the password-visibility toggle (Section P).
7. Add persistent labels to the task-detail Submit-proof/Review-proof form fields.

## Y. Deferred / polish items

- "Continue on Home" deep-linking.
- First-time-vs-returning nav de-emphasis of "Start Here" (Section E.4) — `PRODUCT DECISION REQUIRED`.
- `OwnerSopAction` concurrency asymmetry — backend workflow review, not a UI fix.
- Positive "nothing missing" copy on `/owner/data`'s `MissingCritical` when it is empty.
- Deeper accessibility pass (heading order, touch targets, axe-core automated scan).
- The "cycle" and "audit trail" terms' optional one-line explain text (Section G.2) — nice-to-have, not
  required for beta.

---

## Z. Exact implementation waves (≤4 broad waves, corrected)

**Wave A1 — Low-risk copy, language, and password-visibility (lowest risk, ship first).**
Pure copy/label changes plus the isolated password-visibility addition. No workflow logic changes.

**Wave A2 — Candidate 9 workflow repair (gated, not low-risk — corrected classification).**
v1.0 incorrectly folded this into "lowest risk, ship first" alongside pure copy fixes. Candidate 9 is a
**workflow repair**, not a mechanical copy fix, and is not scheduled as if it were one, even though its
product decision is now resolved (Section T.1: a same-page "Approve task" action on `/owner/tasks/
[taskId]`, Section T.2). It may be worked as soon as A1 ships, or in parallel — the decision gate that
previously blocked it from starting is now clear — but it still requires its own implementation,
security-relevant review of the server-gate integration, and the full test contract in Section T.2/AB
before merge; it is tracked as its own risk class within the same broad "Wave A" grouping so this plan
stays at 4 headline waves rather than 5.

**Wave B — Core owner interaction & presentation convergence (moderate risk).**
The 20 `window.prompt()` replacements, Trust's label-map/error-governance fixes, and the Sales/Operations
harmonization + progressive-disclosure plan (Section J). **Testing assumption corrected in this
revision:** v1.0 stated this wave needed no new race/unit tests because it was "presentation-layer." That
is too broad and is withdrawn. Replacing `window.prompt()` with real inline forms changes user
interaction, local component state, validation, cancellation behavior, and mutation-triggering — each of
the 4 affected pages' completion/verification flows requires proof, before merge, that: fields render;
cancel leaves state unchanged; invalid values do not submit; a valid submission produces the same API
payload semantics the old `window.prompt()` flow produced; failure remains owner-safe (governed error
text, no raw exception); a successful submit refreshes the page's data correctly; and the existing
business-switch race protections (`loadGenerationRef`/`activeBusinessIdRef`, proven on Home/Money/Sales/
Operations/Execution already) remain intact under the new form. The Sales/Operations progressive-
disclosure rearrangement, by contrast, genuinely may remain presentation-only tests, since it changes no
interaction semantics, only default visibility.

**Wave C — Polish & residuals (low risk, can slip past initial beta).**
"Continue on Home" deep-linking, positive "nothing missing" copy, any remaining minor copy items
discovered while implementing Waves A/B.

**Wave D — Google identity (isolated, security-reviewed, its own PR regardless of timing).**
Kept structurally separate from every other wave. Its product decisions are now resolved (Section Q:
linking policy, button placement, no One Tap in v1, the new-user setup flow) — what remains is
implementation, security, and schema design, not further product choice. Requires its own full
signup-gate-parity test suite (beta admission, capacity, policy acceptance, the "Finish setting up
OpsIQ" screen) before merge, plus the `UserAuthIdentity`-equivalent persistence concept (Q.4) and a
transactional/idempotent account-graph creation design (Q.5) that this document specifies the
requirements for but does not design in implementation detail.

**This remains 4 broad waves, not one phase per problem** — Candidate 9 and Google identity each retain
their own explicit decision record (T.1, Q) even while sitting inside Wave A and Wave D respectively,
exactly as the mission requires. Both are now `PRODUCT DECISION: RESOLVED` / `IMPLEMENTATION: NOT
STARTED` — this document freezes the product shape, not the code.

---

## AA. Files likely touched per wave

**Wave A1:** `src/ui/primitives/input.tsx` or a new `PasswordInput` wrapper (Section P) + the 4 password-
field call sites (`login/page.tsx`, `signup/page.tsx`, `reset-password/page.tsx` ×2 fields);
`signup/page.tsx` (Workspace Name label, G10); `owner/sales/page.tsx`, `owner/operations/page.tsx`,
`owner/execution/page.tsx`, `owner/finance/page.tsx`, plus the non-core pages sharing the G11 skeleton-
label pattern (cashflow/marketing/strategy/recovery/growth-pricing/learning-governance page files);
`owner/trust/page.tsx` (H1 rename only, Section E.2); `owner/tasks/page.tsx` (H1 rename only, Section
E.3); `owner/finance/page.tsx` (drop "BLOCKED tier" wording, G4); `owner/operations/page.tsx` (reword
G6 helper text); `owner/cockpit`'s `MinimumOwnerCockpit.tsx` (Goal-chip label map, G7); `owner/tasks/new/
page.tsx` (PROOF_TYPE_LABEL import, G9; MANAGER/STAFF humanization).

**Wave A2:** `src/app/(authenticated)/owner/tasks/[taskId]/page.tsx` — the same-page "Ready for
approval" block and "Approve task" action (Section T.2), replacing the dead `Review & Approve` link.
Likely a new test file (e.g. `src/__tests__/components/owner-task-detail-approval.test.tsx`) covering
the frozen test contract in Section T.2 — filename not frozen. **No API route, service, domain, or
schema file is expected to change** — the fix is presentation/interaction-only against the existing
`POST /api/owner/tasks/complete` endpoint and `completeTask()` service.

**Wave B:** `owner/finance/page.tsx`, `owner/sales/page.tsx`, `owner/operations/page.tsx`, `owner/
execution/page.tsx` (the 20 `window.prompt()` call sites); `owner/trust/page.tsx` (label maps +
`classifyOperatorError` adoption, G1–G3); `owner/sales/page.tsx` and `owner/operations/page.tsx` again
(shared `DiagnosisEmptyState`/`FindingCard` adoption, progressive-disclosure tiers per Section J); `owner/
tasks/[taskId]/page.tsx` (persistent labels on proof forms).

**Wave C:** `owner/cockpit/page.tsx` and/or `MinimumOwnerCockpit.tsx` (Continue-on-Home deep-link, out of
this audit's original modification scope per UX-05A and would need its own scoping); `owner/data/page.tsx`
(`MissingCritical` positive-state copy).

**Wave D:** a new GIS-appropriate credential-verification endpoint (Section Q.2 — an ID-token POST
target, not necessarily a classic redirect callback), a new `src/services/auth/google-sign-in.
service.ts` (deliberately distinct from `google-sheets-oauth.service.ts`), `login/page.tsx` **and**
`signup/page.tsx` (a "Continue with Google" entry point on both, per Q.7 — frozen, not pending), a new
`UserAuthIdentity`-equivalent Prisma model + migration (Q.4, not authorized by this document), and a
new "Finish setting up OpsIQ" screen (Q.5) collecting business name + the three policy acceptances,
with the verified Google email shown read-only.

---

## AB. Test/browser evidence required per wave

| Wave | Required before merge |
|---|---|
| A1 | Unit/snapshot tests confirming each renamed label; a LOCAL-BROWSER-VERIFIED re-check of all 3 renamed page titles + the password toggle's behavior (Section P's frozen behavior list) at both viewports; **before this wave is considered done**, a LIVE-DEPLOYMENT-VERIFIED pass of the same items on the actual deployed exact SHA (Section AC). |
| A2 | The full frozen test contract in Section T.2 (11 assertions: ready-for-approval render, dead-link removal, proof/details visibility, correct endpoint+payload shape, no `ownerOverride`/`maxProofAgeDays`, in-flight disable, each of the 5 mapped 409 reasons, operator-safe unexpected-failure handling, post-success reload to "Approved," no invented second review step, and full preservation of every other existing task-detail behavior); a LOCAL-BROWSER-VERIFIED re-check of the new copy at both viewports; a LIVE-DEPLOYMENT-VERIFIED pass before this wave is considered done (Section AC.1). |
| B | The full behavioral test list in Section Z's Wave B entry, per affected completion/verification flow (4 pages × the fields-render/cancel/invalid/valid/failure/success/race-protection checklist); `MUST_BROWSER_VERIFY_BEFORE_MERGE` for the Sales/Operations 390px snapshot-form layout (Section M) — this is a hard gate on this wave, not optional; `MUST_BROWSER_VERIFY_BEFORE_IMPLEMENTATION` for the populated Money/Sales/Operations/Execution diagnosis-cycle views generally (Section B.4) — i.e., obtain real populated-state evidence before finalizing the Trust label-map fix and the harmonization redesign, not merely before merging them; a LIVE-DEPLOYMENT-VERIFIED pass on the deployed SHA covering the same items before closure. |
| C | Standard regression coverage for whatever specific fix each item receives; no wave-wide gate beyond that. |
| D | The full signup-gate-parity suite named in Section Q.5 (beta admission, capacity, policy acceptance, audit events) plus new-user and existing-user-linking test paths per Section Q.3's frozen linking policy; a LIVE-DEPLOYMENT-VERIFIED pass against Google's real identity endpoints (not mockable in the same way local Postgres was) before this wave is considered done. |

**Populated-state and mobile-form evidence classification (mission item 9, applied explicitly):**

| Gap | Classification |
|---|---|
| Populated Money/Sales/Operations/Execution diagnosis-cycle views (score tiles, findings, actions, verify badges with real data) | `MUST_BROWSER_VERIFY_BEFORE_IMPLEMENTATION` — the copy/label fixes these views need (G1, G4, G7) can be specified from source now, but must be re-confirmed against a real populated render before that implementation is finalized, not merely before it is merged |
| Sales/Operations snapshot forms at 390px (current flat grid, and the future Section J tiered redesign) | `MUST_BROWSER_VERIFY_BEFORE_MERGE` — a hard gate on Wave B itself, explicitly, per the mission's instruction |
| Task-detail proof-submit/proof-review forms, execution-lifecycle sub-forms | `SOURCE-SUFFICIENT_FOR_SPEC` for the label-persistence fix (Section K) — the fix itself (adding a `<label>`) does not depend on seeing populated data, only on the form's own static field structure, which is already fully read |
| Trust page's populated explanation cards and audit trail | `MUST_BROWSER_VERIFY_BEFORE_MERGE` for Wave B's G1–G3 fix specifically, since the whole point of that fix is confirming the label maps actually replace what a real, populated render currently shows raw |

---

## AC. Final beta UX exit criteria — BETA UX EXIT GATES

**Terminology, corrected per this revision:** every item below is a **gate**, not a suggestion — beta is
not complete until every one is satisfied, independent of whether Section W's single HARD WORKFLOW
BLOCKER (Candidate 9) is also resolved. A non-technical owner, using only the core owner journey, must be
able to do all of the following without encountering a raw enum, a dead link, or an un-explained internal
term:

1. Sign up, verify their email, and log in without needing anyone's help.
2. See, hide, and confirm their password while typing it (post Wave A1).
3. Create their first business and understand the field asking for its name (post Wave A1's G10 fix —
   "Workspace Name" must no longer disagree with its own placeholder).
4. Reach a first assessment on Home, understanding plainly that it is limited by the data supplied.
5. Add a financial/sales/operations snapshot and understand every field without needing to ask what an
   abbreviation means.
6. See a diagnosis's findings and understand what evidence and confidence level back each one.
7. See at least one recommended action, understand who is meant to do it, and start it.
8. Delegate a task to a named role, with or without required proof, and understand what happens next.
9. Complete an owner-started action using labelled fields, never a native browser prompt (post Wave B).
10. See a task through to actual approval using the same-page "Approve task" action (Section T.2) with
    no dead link in the way — the product decision that previously blocked this gate is now resolved
    (Section T.1); the gate itself still closes only on Wave A2's implementation landing, not on a
    schedule.
11. Understand every status badge they see without needing to know the underlying system's vocabulary.
12. Understand every entry on the Evidence & Trust page, including the audit trail, without seeing a raw
    code or ID as the primary text of any line (post Wave B).
13. Navigate using the sidebar without a nav label ever contradicting the page it leads to (post Wave A1).
14. Use the entire core journey on a 390px phone without horizontal scrolling or a cut-off primary action
    — **explicitly including the Sales/Operations snapshot forms**, which remain an open, hard-gated
    evidence question (Section AB) and must not be assumed passing.
15. Never see a "0" or empty dashboard presented as if it were a real, healthy result.
16. Never be asked to approve, delegate, or verify something without being told the consequence of doing
    so.
17. Never see a raw internal enum, UUID, or system-only term anywhere in the core owner journey — after
    Waves A1/B, every currently-known violation in Sections G/U is closed.
18. If they choose to sign in with Google, go through the exact same beta-admission, workspace-naming,
    and Terms/Privacy/Beta-notice acceptance gates a password signup requires today, via the frozen
    "Finish setting up OpsIQ" screen — never a shortcut (Wave D, Section Q.5/Q.9).

### AC.1 Live-acceptance gate (new in this revision — mission item 22)

Local-browser validation (Section B.1) is useful development evidence. **It is not the final deployment
acceptance proof, and this document no longer implies that it is.** Before final beta UX closure, the
exact deployed SHA for each wave must be exercised, LIVE-DEPLOYMENT-VERIFIED, at both desktop and 390px
mobile, covering at minimum:

- The frozen first-time journey (Section C) end-to-end, on the real deployment.
- The returning-owner journey (Section D).
- Populated Money, Sales, Operations, and Execution diagnosis states (not just their empty states).
- The full task create → delegate → review lifecycle, including whatever Candidate 9's eventual
  implementation turns out to be.
- Evidence & Trust with real, populated explanation data (confirming the G1–G3 fixes actually replace
  what a real render shows, not just what source code implies it would show).
- Sign-in, signup, and the password-visibility toggle.
- The mobile sidebar nav's actual opened-drawer state (not just its collapsed trigger).

No wave in Section Z/AB is "done" on the strength of local-browser or source evidence alone once this
gate applies to it — each wave's own AB entry names exactly where this applies.

---

## AD. Hostile self-audit

**Carried forward from v2.0 (still true, unaffected by this revision's product-decision freeze):**

1. **Did we miss "Workspace Name"?** NO — G10, cross-referenced in Sections O, K, V, X, AC, AA.
2. **Does the dictionary cover all required owner concepts?** YES — Section H.2.
3. **Did we prefer technical "Explainability" merely because the page already said it?** NO — Section
   E.2 freezes "Evidence & Trust" on the page itself.
4. **Would nav become Actions > Actions?** NO — Section E.3 renames the page's own H1 to "Tasks" instead.
5. **Is the first-time primary journey singular?** YES — Section C, unchanged and not reopened in this
   revision (per this mission's own instruction not to reopen settled first-run/nav/language decisions).
6. **Are local-browser and live-deployment evidence clearly distinguished?** YES — Section B.1's 4 labels,
   unchanged and not reopened.
7. **Are populated-domain and mobile-form gaps honestly gated?** YES — Section AB, unchanged.
8. **Does Wave B require behavioral tests for prompt replacements?** YES — Section Z's Wave B entry,
   unchanged.
9. **Are there no more than 4 broad waves?** YES — Section Z names exactly four (A, B, C, D) both before
   and after this revision.

**New for this revision — the mission's own required final checklist:**

10. **Does Candidate 9 still say `BLOCKED_PENDING_WORKFLOW_DECISION`?** NO — Section T.1 now reads
    `PRODUCT/WORKFLOW DECISION: RESOLVED`, `IMPLEMENTATION: NOT STARTED`.
11. **Is a new `/complete` page proposed?** NO — Section T.2 explicitly states no new page, route, or API
    is created; the repair is same-page on the existing `/owner/tasks/[taskId]`.
12. **Does Candidate 9 reuse the existing completion endpoint/service?** YES — Section T.2 freezes the
    call as the existing `POST /api/owner/tasks/complete` with an unchanged `completeTask()` service as
    sole authority; no alternate service, no duplicate FSM.
13. **Is proof re-reviewed unnecessarily?** NO — Section T.1 item 1/Section T.2 both state the existing
    Proof panel, already positioned above the approval action, is sufficient; no second review step is
    invented.
14. **Is the approval consequence explained before clicking?** YES — Section T.2's frozen copy states
    "approve it to mark this task as complete" as part of the ready-for-approval text itself, not only in
    the button label.
15. **Is `ownerOverride` exposed?** NO — Section T.2 explicitly lists `ownerOverride` and
    `maxProofAgeDays` as never sent from this owner-facing UI.
16. **Are raw 409 reason codes allowed to render?** NO — Section T.2's mapping table converts all five
    known reasons to plain language; unexpected failures use the existing governed error mechanism.
17. **Can matching email silently link Google?** NO — Section Q.3 forbids automatic linking on email
    match alone, unconditionally, including for the Google-authoritative case v2.0 had left open.
18. **Is Google `sub` the durable provider identity?** YES — Section Q.4/Q.9, unchanged from v2.0 and now
    explicitly confirmed as the frozen architecture decision, not merely a proposal.
19. **Is Google One Tap part of v1?** NO — Section Q.7 explicitly excludes One Tap/auto-select from the
    first version.
20. **Does "Continue with Google" appear on Login and Signup?** YES — Section Q.7, both entry points,
    frozen (v2.0 had left this open as Q.7 item 4).
21. **Does a new Google user still pass beta/legal/account-graph gates?** YES — Section Q.5's frozen
    "Finish setting up OpsIQ" screen explicitly preserves beta admission, capacity, business naming, and
    all three policy acceptances; only the password field and OpsIQ's own email-re-verification step are
    removed, both because Google's credential already supersedes what each of those two specifically
    exists to establish.
22. **Does Google login use the normal OpsIQ Session?** YES — Section Q.6, unchanged from v2.0, re-
    confirmed: normal `Session` row, normal `opsiq_session` cookie, no parallel mechanism.
23. **Does Google login request Sheets/Drive scopes?** NO — Section Q.8 freezes this separation
    explicitly, as its own dedicated subsection rather than only a side note inside Q.2.
24. **Did we reopen already settled first-run/nav/language decisions?** NO — Sections C, E, G, H, O, P
    are unchanged in substance from v2.0; only Sections A, Q, T, V, W, Z, AA, AB, AC, AD were amended, per
    the mission's own instruction to amend only where necessary.
25. **Are there still no more than 4 broad UX waves?** YES — Section Z, unchanged: A (with A1/A2 as risk
    sub-classes, not extra headline waves), B, C, D.

No hostile-audit answer in this pass surfaced a defect requiring a further correction before delivery.

---

**End of document. No implementation follows from this document without separate, explicit
authorization for each wave. Waves A2 and D no longer require a further product decision before code is
written — their product decisions are resolved as of this revision (Sections T.1, Q.9) — but neither is
implemented by this document, and both still require their own implementation-time authorization, design
review, and the test contracts named in Sections T.2/AB before any code merges.**
