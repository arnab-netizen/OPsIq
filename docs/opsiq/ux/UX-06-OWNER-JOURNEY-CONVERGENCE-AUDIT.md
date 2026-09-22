# UX-06 — Owner Journey Convergence Audit

**Status:** AUDIT + SPECIFICATION FREEZE ONLY. No production code, tests, configs, schema, or API were
changed to produce this document. This document is the sole deliverable of this mission.

**Base commit audited:** `main` @ `2c674c1a38a3b232de1a45e381da6851d1f31059` (post UX-05C merge).

**Author's note on structure:** the mission that requested this document specified "sections A through
AD." The exact letter-to-topic mapping was not preserved verbatim into this working session; the
mapping below was reconstructed to cover every required topic named in the mission brief (two owner
journeys, core surfaces, browser evidence at two viewports, a 6-question usability test per screen, a
hard-gate jargon audit, a canonical language dictionary, hierarchy/disclosure classification, a
home-authority check, a Money/Sales/Operations consistency matrix, an Actions usability audit, an
Evidence & Trust usability audit, a forms audit, an empty/error/loading-state audit, a sign-in/signup +
password-visibility spec, a Google-auth architecture spec, a navigation audit, a mobile audit, an
accessibility audit, residual classification, prioritized findings, ≤4 implementation waves, frozen exit
criteria, and a hostile self-audit). No required topic was dropped; if the letter ordering differs from
what was originally specified, the content coverage does not.

---

## A. Executive conclusion

OpsIQ's owner-facing product is **substantively coherent and further along than a "beta" label
suggests**: the four-dimension governance model (consulting lifecycle / business condition /
intervention mode+phase / human-execution-reality) is genuinely present end-to-end, prior UX missions
(UX-01 through UX-05C) have already closed most of the *stale-async-response* and *raw-enum-leak*
defect classes this audit would otherwise have had to open as new work, and the existing sidebar
navigation (`sidebar-nav.tsx`, "Model B") already reflects a deliberate, well-reasoned prior
consolidation. What remains is not a rebuild — it is a **finishing pass**: closing the small number of
remaining raw-jargon leaks, fixing one confirmed dead link, resolving a handful of cross-page
inconsistencies (naming, error handling, empty-state structure, severity color mapping), replacing five
`window.prompt()` call sites with the labelled-input pattern already proven on `/owner/cockpit`, and
writing an isolated, carefully-scoped Google-OAuth specification that does not reuse the existing
Sheets-import OAuth plumbing.

No beta blocker found in this audit requires a rebuild, a schema change, or new domain modeling. The
highest-leverage single fix is the dead `/owner/tasks/[taskId]/complete` link (Candidate 9, already
known) because it is a hard stop in a governed approval flow, not a cosmetic defect.

**Recommended verdict:** proceed to implementation in the ≤4 waves defined in Section Y, with the
Google-auth security work kept in its own isolated wave/PR as the mission required.

---

## B. Method and evidence-level protocol

Every factual claim in this document carries exactly one of three labels. They are never mixed within a
single claim:

- **SOURCE-VERIFIED** — read directly from the file(s) named, with line-accurate quotes. Proves what the
  code *will do*, not what a viewer actually *saw* rendered.
- **BROWSER-VERIFIED** — observed by actually loading the page in a real browser (Playwright + the
  pre-installed Chromium at `/opt/pw-browsers/chromium`) against a real running instance of this exact
  commit, with a real Postgres-backed session. Screenshots exist for every claim tagged this way.
- **BROWSER-NOT-YET-VERIFIABLE** — a claim that would need browser evidence this pass did not obtain
  (a specific data state, a specific error path, a specific breakpoint between 390px and 1440px). Named
  explicitly wherever it appears; never silently upgraded to BROWSER-VERIFIED.

### B.1 How the browser evidence was obtained (full disclosure)

This sandbox has no reachable network path to the project's real Neon database (an established,
previously-documented limitation of this environment from earlier missions in this engagement). Rather
than skip the mission's mandatory browser audit, a **fully local, throwaway** Postgres 16 instance was
stood up inside this sandbox only:

1. The sandbox's pre-installed local `postgresql@16` cluster was started (`service postgresql start`).
2. A local role/database (`opsiq_dev` / `opsiq_dev`) was created — entirely separate from, and with zero
   network path to, the project's real database.
3. `prisma migrate deploy` was run against that local database only, applying all 179 committed
   migrations verbatim (no schema was hand-edited or invented).
4. One throwaway seed script, mirroring the exact account-graph shape of the repository's own
   `scripts/seed-preview-qa-owner.ts` (User + Workspace + `WorkspaceMembership(role="owner")` +
   `UserRoleAssignment(ADMIN_OR_PORTFOLIO_MANAGER)` + 3 `PolicyAcceptance` rows + a pre-verified email),
   was written to the local scratchpad, temporarily copied into `scripts/` **only to satisfy Node's
   module resolution**, run once, and deleted immediately after use. It was never committed (confirmed
   via `git status --short` immediately after deletion) and it refuses to run against any
   non-`localhost` `DATABASE_URL`.
5. `next dev` was started with `DATABASE_URL` explicitly overridden on the command line to the local
   database (the container's real `DATABASE_URL` environment variable, pointing at the real Neon
   instance, was **never modified, unset, or exported**, and was not reachable from this sandbox anyway).
6. Playwright drove real login, page navigation, business creation, and task creation against this local
   instance at both `1440×900` and `390×844` viewports; every `BROWSER-VERIFIED` claim below is backed by
   an actual saved screenshot from this run.
7. After the audit, the local Postgres cluster, the local `.env` file, and the dev-server process are
   torn down (see Section AB and the final validation step) — nothing about this setup persists past
   this session, and no production/staging/Neon credential was touched, read into a script, or logged
   beyond the one already-present container environment variable (which was never displayed a second
   time after its one accidental echo during setup, and is not reproduced anywhere in this document).

This means every `BROWSER-VERIFIED` claim below reflects the **real compiled application**, not a mock —
just running against a locally seeded, empty-of-real-customer-data database, which is exactly the state
a first-time owner's account would be in. No claim in this document is based on browser output from a
different commit than the one audited.

### B.2 What the browser audit did **not** cover (named honestly, not glossed over)

- A **populated** Finance/Sales/Operations diagnosis cycle (findings + actions + verification badges)
  was attempted but not obtained — the automated form-fill script hit a Playwright strict-mode ambiguity
  on the "Revenue" field label (three inputs share a partial-text match) and the "Run finance diagnosis"
  button therefore stayed disabled for lack of a saved snapshot. The **empty-state and snapshot-form**
  renders for Finance/Sales/Operations/Execution ARE browser-verified; the **populated diagnosis-cycle**
  view (score tiles, findings list, action cards, verification badges) for all four domain-like pages
  remains `BROWSER-NOT-YET-VERIFIABLE` and relies on the prior SOURCE-VERIFIED extraction instead. This
  is flagged again at each specific claim below.
- Owner-created via Google OAuth: not applicable — no such flow exists yet (Section P).
- The `/owner/tasks/[taskId]` detail page's proof-submit/proof-review forms and the
  `MinimumOwnerCockpit` execution-lifecycle sub-forms (Record progress / Record outcome / Verify
  outcome) were not driven to completion in the browser pass (would have required a governed action to
  already exist in a specific mid-lifecycle state) — their copy is SOURCE-VERIFIED only.
- Admin/internal/consultant-only surfaces (`/admin/*`, `/dashboard`, `/clients`, `/engagements`,
  `/report`) are out of scope for this owner-journey audit and were not visited.

---

## C. The two owner journeys this audit optimizes for

### C.1 First-time owner (day 0)

Signup → email verification → first login → lands on Home (`/owner/cockpit`) with zero businesses →
**Home shows a real empty state, not a fabricated dashboard** (BROWSER-VERIFIED: "Set up your business to
get your first assessment") → owner clicks through to `/owner/data` or `/owner/onboarding` → creates a
business → is walked through Essential Numbers / Start Here steps → gets a first, honestly-caveated
result. This journey is intentionally slow to reach a "read" and fast to reach a "why" — the app refuses
to invent a health score before it has real numbers (repeated verbatim assurance across every domain
page: "missing data is reported, never invented").

### C.2 Returning owner (week N)

Login → Home. Home must, on every return visit, answer three questions before anything else: what
changed, what needs a decision now, and what happened to the last thing I did. BROWSER-VERIFIED (post one
business, zero data): Home renders, in this exact order, "Business assessment" → "Continue setting up
OpsIQ" (a continuation nudge, not a nag) → "Your top priority now" with a severity badge, a "Why this is
first" rationale, and a single primary CTA ("Start Work"). This matches the SOURCE-VERIFIED structure from
UX-03/UX-05A exactly. The returning-owner journey is the one place Section I (Home-authority check) and
Section R (first-time vs returning nav behavior) both apply pressure on the same screen.

---

## D. Core audit surfaces inventory

| # | Surface | Route | Evidence |
|---|---|---|---|
| 1 | Login | `/login` | BROWSER-VERIFIED (1440, 390) |
| 2 | Signup | `/signup` | BROWSER-VERIFIED (1440, 390) |
| 3 | Forgot password | `/forgot-password` | BROWSER-VERIFIED (1440, 390) |
| 4 | Reset password | `/reset-password` | SOURCE-VERIFIED only (requires a live token) |
| 5 | Resend verification | `/resend-verification` | SOURCE-VERIFIED only |
| 6 | Start Here | `/owner/start-here` | BROWSER-VERIFIED (1440, 390) |
| 7 | Onboarding | `/owner/onboarding` | BROWSER-VERIFIED (1440, 390) |
| 8 | My Business (Data) | `/owner/data` | BROWSER-VERIFIED, empty + post-create (1440, 390) |
| 9 | Home (Cockpit) | `/owner/cockpit` | BROWSER-VERIFIED, empty + post-create (1440, 390) |
| 10 | Money (Finance) | `/owner/finance` | BROWSER-VERIFIED, empty (1440, 390); diagnosis-populated view is BROWSER-NOT-YET-VERIFIABLE |
| 11 | Owner Sales | `/owner/sales` | BROWSER-VERIFIED, empty (1440, 390); populated view BROWSER-NOT-YET-VERIFIABLE |
| 12 | Operations | `/owner/operations` | BROWSER-VERIFIED, empty (1440, 390); populated view BROWSER-NOT-YET-VERIFIABLE |
| 13 | Actions / Tasks list | `/owner/tasks` | BROWSER-VERIFIED, empty + with 1 task (1440, 390) |
| 14 | New task | `/owner/tasks/new` | BROWSER-VERIFIED (1440, 390) |
| 15 | Task detail | `/owner/tasks/[taskId]` | SOURCE-VERIFIED; loaded once in browser to confirm route resolves, proof/review sub-forms not exercised |
| 16 | Owner Execution & SOP | `/owner/execution` | BROWSER-VERIFIED, empty (1440, 390); populated view BROWSER-NOT-YET-VERIFIABLE |
| 17 | Evidence & Trust | `/owner/trust` | BROWSER-VERIFIED, empty (1440, 390) |
| 18 | Sidebar / shell | (all pages) | BROWSER-VERIFIED, desktop open state + mobile hamburger collapse |
| 19 | Settings | `/settings` | Out of core scope this pass — not owner-journey-critical; not visited |

---

## E. Screen-by-screen 6-question usability matrix

Questions: **(1) Purpose** — does the owner know what this screen is for in <5s? **(2) First read** —
what does the eye land on first? **(3) Meaning** — is every visible word plain-language? **(4) Action** —
is the next action obvious? **(5) Consequence** — does the owner know what happens if they act (or
don't)? **(6) Depth** — is there a safe way to go deeper without being forced to?

| Screen | Purpose | First read | Meaning | Action | Consequence | Depth |
|---|---|---|---|---|---|---|
| Login | Yes — "Sign in to continue" | Email field | Yes | Yes ("Sign in") | Yes (goes to Home) | N/A |
| Signup | Yes — "Create your account — beta access" | Email field | Mostly — "beta access" assumes owner knows what that means | Yes ("Create Account") | Partially — no on-page statement that email verification is required next until after submit | Yes (Terms/Privacy/Beta links) |
| Start Here | Yes | Numbered step list | Yes | Yes ("Continue →" on the current step) | Yes ("If you skip this for now: …") | Yes ("Improve OpsIQ's understanding") |
| Onboarding | Yes — "Welcome to OpsIQ" | Step-of-3 progress line | Mostly — `BLOCKED tier`-style raw fragments do NOT appear here, but "OwnerSeverity" case-sensitive lookup is a *latent* fragility (Section F) | Yes | Yes ("What not to do yet") | Yes (`<Disclosure summary="More setup details">`) |
| My Business (Data) | Yes | H1 "My Business" + intro | Yes | Yes (ranked "Ways to add data" cards) | Yes ("Affects: …", "Without it: …") | Yes (collapsible `CategoryGroups`) |
| Home (Cockpit) | Yes — this is the one screen designed to answer "what now" | "Business assessment" block, then "Your top priority now" | Mostly — one confirmed raw-enum leak (Goal chip, Section F) | Yes ("Start Work" primary CTA) | Yes ("Why this is first", terminal-status note) | Yes (nested `<details>` for Other/Monitor-only/Proof) |
| Money | Yes | Score tiles + survival badge | Mostly — "BLOCKED tier" leak (Section F) | Yes | Yes ("Recommended next financial action" + rationale) | Yes (3-tier progressive disclosure, the best of the three domain pages) |
| Owner Sales | Yes | Inline Health/Risk/Opportunity numbers | Yes (no hint text, but plain field labels) | Yes | Yes | No — flat form, no progressive disclosure (Section J) |
| Operations | Yes | Score tiles + state badge | Partially — "SOP", "scaling gate", "human-execution-reality dimension" all leak unexplained (Section F) | Yes | Yes | No — flat form (Section J) |
| Actions (Tasks list) | Yes — "Actions" header, but nav label is "Tasks" (Section Q) | "My work" / "Delegated work" split | Yes | Yes ("+ New Task", "What happens next →") | Yes (status groups: To do/In progress/Waiting/Done) | N/A (flat list + pagination) |
| New task | Yes | Title field | Yes, except auto-humanized ProofType options ("Csv Upload") vs. hand-curated ones elsewhere (Section F) | Yes | Partially — proof-type consequence not explained until the task is later reviewed | N/A |
| Task detail | Yes | Status badge next to title | Mostly — "AI Precheck Passed/Failed" jargon (Section F) | Yes, **except** the dead "Review & Approve" link (Section K) | Yes (Status history, "Done when…") | Yes ("View proof & details") |
| Owner Execution & SOP | Partially — "SOP" undefined in the title itself | Score tiles + state badge | Partially — same "SOP" jargon | Yes, but via 5 unlabeled `window.prompt()` dialogs for two of the six actions (Section M) | Yes | No — flat form |
| Evidence & Trust | Partially — nav says "Evidence & Trust," page says "Trust & Explainability" (Section Q) | Domain selector | **No** — this is the single most jargon-exposed screen in the app: raw `findingType`, `findingCode`, `entityId`, `eventName`, `entityType` all render unmapped (Section F) | Yes ("View audit trail") | Yes ("Why it matters", "Risk if ignored") | Yes (per-card grid) |
| Sidebar / shell | Yes | Start Here / Home / My Business, ungrouped | Yes | Yes | N/A | Yes (Preview/Coming-soon pills, collapsible sections) |

---

## F. Language & jargon audit (hard gate)

Classification key: **KEEP** (plain enough as-is) · **RENAME** (replace the visible string) ·
**EXPLAIN** (keep the term, add a definition/hint inline) · **MOVE BEHIND DISCLOSURE** (correct but too
technical for the primary read; demote to an expandable/secondary position) · **ADMIN-ONLY** (this
string should never reach a self-serve owner at all).

This audit found **9 raw/leak-class violations** still present at the audited commit, all
SOURCE-VERIFIED and (where the surface was visited) BROWSER-VERIFIED as still rendering. It also confirms
that a large share of the raw-enum-leak defect class identified in UX-04A/UX-05A **has already been
fixed** by UX-04B/UX-05B/UX-05C (survival state, sales state, operations state, load-band labels,
cancelled-action labels, actor-role labels, execution/tasks status labels) — those are not re-listed as
open findings here; they are cross-referenced as resolved in Section AA.

| # | Term / string | Where | Class | Evidence | Recommended fix |
|---|---|---|---|---|---|
| F1 | `findingType`, `findingCode` rendered raw (e.g. "Finance · opportunity · FIN_LOW_MARGIN_002") | `/owner/trust` explanation-card meta line | RENAME | SOURCE-VERIFIED (`src/app/(authenticated)/owner/trust/page.tsx`); page confirmed BROWSER-VERIFIED to load, this specific card was not reached (needs a diagnosis cycle) → **BROWSER-NOT-YET-VERIFIABLE** for the exact leaked string, SOURCE-VERIFIED that the code path has no label map at all | Add a `FINDING_TYPE_LABEL` map (already exists and is used correctly on Finance/Operations/Execution — just not imported here) and a humanizer for `findingCode` (or drop the code from the owner-visible line entirely; it is not actionable to an owner) |
| F2 | `entityId` interpolated raw into "Audit trail — {id}" heading | `/owner/trust` | RENAME / MOVE BEHIND DISCLOSURE | SOURCE-VERIFIED | Replace the heading with a human label (e.g. the recommendation's own title) and move the raw id into a `<Disclosure>` or a copy-to-clipboard "Reference ID" chip, not the H2 itself |
| F3 | `eventName`, `entityType` rendered raw in audit-trail rows | `/owner/trust` | RENAME | SOURCE-VERIFIED | Add a label map for the (small, enumerable) set of `AUDIT_EVENTS` values used on this page |
| F4 | "BLOCKED tier" (verbatim, capitalized, mid-sentence) in the low-confidence warning | `/owner/finance` (`FinanceCycleView`) | RENAME | SOURCE-VERIFIED; page BROWSER-VERIFIED to load, this specific banner requires confidence <30 with a saved snapshot → BROWSER-NOT-YET-VERIFIABLE for the exact render | Drop the phrase "BLOCKED tier" entirely; the sentence already communicates the consequence without naming an internal tier |
| F5 | "SOP" unexplained (page title, description, and field label "Documented SOPs") | `/owner/execution` | EXPLAIN | BROWSER-VERIFIED (page title "Owner Execution & SOP" confirmed rendered at both viewports) | Either expand on first use ("SOP — Standard Operating Procedure") or rename the nav-facing term; "Documented SOPs" as a field label is fine once expanded once nearby |
| F6 | "scaling gate" / "human-execution-reality dimension" in form helper text | `/owner/operations` (Capacity/Workload snapshot forms) | RENAME | SOURCE-VERIFIED | Replace with owner-facing language, e.g. "This affects how much growth OpsIQ will recommend before it's safe" / "This is about how much of your own time this business actually takes" |
| F7 | Goal-state chip renders `state.replace(/_/g,' ')` only (e.g. "NO GROWTH" — spaced, not cased/humanized) | `/owner/cockpit` (`MinimumOwnerCockpit`, "Also worth knowing" → Goal) | RENAME | SOURCE-VERIFIED; not reached in the empty-state browser pass → BROWSER-NOT-YET-VERIFIABLE for the exact render | Add this value to the same kind of label map used for every other status on this page — it is the one remaining un-mapped status on Home |
| F8 | "AI Precheck Passed" / "AI Precheck Failed" shown as proof-status labels | `/owner/tasks/[taskId]` | EXPLAIN | SOURCE-VERIFIED | Keep the concept (it is real and the owner should know a machine looked at it first) but reword to "Automatically checked — passed/needs a person to look" |
| F9 | Auto-humanized `ProofType` labels diverge from hand-curated ones for the same enum values ("Csv Upload" / "Before After Image" on `/owner/tasks/new` vs. "CSV upload" / "Before/after image" everywhere else) | `/owner/tasks/new` | RENAME | SOURCE-VERIFIED (both label sources quoted in the extraction) | Import the existing `PROOF_TYPE_LABEL` map into `tasks/new/page.tsx` instead of generic humanization — a one-file, no-new-abstraction fix |

**KEEP** (reviewed and judged fine as plain language, listed so the audit shows its work rather than
silence = agreement): "Health/Risk/Opportunity" score tiles, "Data confidence", "Findings",
"Recommended next … action", "Verify outcome", survival/state badges (already humanized), "Owner
approval required" / "Manager approval required" / "Staff-level action", "Not yet verified" / "Verified —
improved" family, "COGS"/"accounts receivable"/"accounts payable" (each has adjacent plain-language hint
text on Money already).

**EXPLAIN**, beyond F5/F8 above: none additional found.

**MOVE BEHIND DISCLOSURE**, beyond F2 above: the raw `task.sourceOperatorItemId` shown as "Source
recommendation:" on the task-detail page (`/owner/tasks/[taskId]`) — this is a real, useful traceability
fact but is currently a bare monospace ID with no link/expansion; move it into the same disclosure
pattern as "View proof & details."

---

## G. Canonical owner-language dictionary

This table exists so that "Tasks" and "Actions" and "Delegated work" are never casually collapsed into
one word by a future contributor — they are three **genuinely distinct concepts** and the dictionary
below is written to preserve, not erase, that distinction (per UX-05A Section T's proven non-equivalence
of Proof/Evidence/Outcome/Verification/Reassessment, and per this mission's own instruction not to
falsely collapse different concepts into one word).

| Internal term | Current owner-facing term(s) | Recommended owner-facing term | Help text (if needed) | Where used | Source of truth |
|---|---|---|---|---|---|
| `ProcessExecutionTask` | "My work" (list heading) | KEEP "My work" | — | `/owner/tasks`, `/owner/cockpit` | `src/domain/execution/*` |
| `DelegatedTask` | "Delegated work" | KEEP "Delegated work" | — | `/owner/tasks` | `src/domain/execution/*` |
| `OwnerSopAction` | "Execution actions" / "Owner Execution & SOP" | RENAME page nav to "Team follow-through" or similar; KEEP "Execution actions" as the in-page list label once the top-level "SOP" is explained | "Actions your team is responsible for carrying out and proving" | `/owner/execution` | `src/domain/execution/*`, `sop` domain module |
| `BusinessConditionProfile` fields (Cash pressure, Margin pressure, …) | Already humanized via `CONDITION_FIELD_LABEL` | KEEP | — | `/owner/cockpit` (Business condition section) | UX-04A Section M (already fixed) |
| `InterventionMode` / `InterventionPhase` | Not shown to self-serve owners on core surfaces (confirmed gated behind `ENGAGEMENT_CREATE`/consultant-only routes) | KEEP hidden from owner-core | — | `/diagnosis` (gated) | Design Direction §15 |
| `TrustLabel` (High/Moderate/Low) | "confidence {label} ({score})" / "impact {label} ({score})" | KEEP | — | `/owner/trust` | `src/domain/owner-trust/types.ts` |
| `ProofRiskLevel` | "Risk: Low/Medium/High" | KEEP | — | `/owner/tasks/[taskId]` | `src/domain/execution/proof.ts` |
| `TaskActorRole` | "Employee/Manager/Owner/System" | KEEP | — | `/owner/tasks/[taskId]` status history | already fixed (UX-05B Candidate 8) |
| `findingCode` (e.g. `FIN_LOW_MARGIN_002`) | shown raw on Trust | RENAME to omit or replace with the finding's own title | — | `/owner/trust` | see F1 |
| "SOP" | shown raw everywhere on `/owner/execution` | EXPLAIN once, or RENAME the page-level term | "Standard Operating Procedure — a written, repeatable way of doing a task" | `/owner/execution` | see F5 |
| `sourceOperatorItemId` | "Source recommendation:" + raw id | KEEP the label, MOVE the raw id behind disclosure | — | `/owner/tasks/[taskId]` | see G/F2 |
| Owner role values `MANAGER`/`STAFF` | rendered raw as literal `"MANAGER"`/`"STAFF"` on 2 pages (residual, Section U) | RENAME via existing humanization helper | — | `owner/tasks/new/page.tsx:26-28` and one other page (UX-05A Section R) | already-recorded residual, not newly discovered here |

---

## H. Information hierarchy & progressive disclosure

Classification: **PRIMARY** (must be visible with zero clicks) · **SECONDARY** (one click/scroll away,
still on the same page) · **ADVANCED** (behind an explicit disclosure, for the owner who wants the
mechanism, not just the answer).

Per this mission's own ambiguity-resolution rule, this section states **preferences with rationale**, not
a forced ranking that pretends a literal user study happened — it explicitly distinguishes what
`MUST_PRESERVE` (established in UX-04A/UX-05A) from what belongs in which render position, which prior
docs left `USER-EVIDENCE NEEDED` and undecided.

| Screen | PRIMARY | SECONDARY | ADVANCED |
|---|---|---|---|
| Home | Business assessment headline, Top priority + CTA | "Also worth knowing" strip, Other options | Recovery/Outside-signals/Business-condition/Execution-lifecycle/BOS collapsed sections, "View proof & details" |
| Money | Score tiles, survival badge, Recommended action | Findings list, Finance actions list | Diagnosis history, "Advanced detail (optional)" form tier |
| Sales/Operations | Score tiles, state badge, Recommended action | Findings, Actions | Diagnosis history (no progressive-disclosure form tier exists today — Section J flags this as an inconsistency, not a hierarchy defect per se) |
| Actions (Tasks) | "My work", "Delegated work" list, filter | Status groupings | Pagination, per-task "What happens next" |
| Execution & SOP | Score tiles, Recommended action | Findings, Execution actions | Diagnosis history |
| Evidence & Trust | Domain selector, explanation cards' headline/why-it-matters | Source data / calculation / verification-method grid | Audit trail |
| My Business (Data) | Readiness summary, Next action, Ways to add data | Category groups | "Everything OpsIQ can use" full catalog |

**Recommendation, stated as a preference, not a mandate:** promote the Money page's 3-tier progressive
disclosure pattern (Quick / "Improve the analysis" / "Advanced detail") to Sales and Operations as part
of Wave B (Section Y) — this is a **hierarchy improvement**, not a feature deletion, and is explicitly
the kind of "better prioritization" this mission's simplification principle calls for.

---

## I. Home-authority check

**Requirement:** `/owner/cockpit` (rendered title "Home") must remain the sole "what needs attention"
surface.

**Finding: PASS, largely pre-existing.** BROWSER-VERIFIED: Home is the only screen in the audited set
that renders a "Your top priority now" block with a severity badge and a single primary CTA. Every other
domain page (Money/Sales/Operations/Execution) has its own "Recommended next {domain} action" card, but
these are explicitly domain-scoped recommendations feeding into, not competing with, Home's cross-domain
top-priority selection (confirmed via UX-05A Section Q's 18-capability overlap matrix, which concluded no
merge was warranted). SOURCE-VERIFIED: `sidebar-nav.tsx` already removed the standalone "What needs
attention" (`/owner/priorities`) and "Alerts" (`/owner/alerts`) nav links specifically to protect this
property — their routes still exist but carry no nav entry, so a returning owner cannot casually land on
a second "attention" surface via navigation.

**Residual to note, not a defect:** the "Continue on Home →" link inside `/owner/tasks`'s "My work"
section, and the "Continue setup" link on Home's own `StartHereContinuationCard`, both route back to
Home/Start-Here rather than deep-linking to the specific item — this is the previously-recorded "Continue
on Home" residual (Section U), a minor friction, not an authority violation.

---

## J. Money / Sales / Operations consistency matrix

Per the mission's explicit instruction, this section harmonizes **language and presentation**, never
domain scoring semantics — Money's survival states, Sales's state ladder, and Operations's state ladder
are legitimately different concepts about different businesses processes and are not being merged.

| Dimension | Money | Owner Sales | Operations | Consistent? |
|---|---|---|---|---|
| Page title vs. nav label | "Money" vs. nav "Money" | "Owner Sales" vs. nav "Sales" | "Operations" vs. nav "Operations" | **NO** — Sales alone carries an "Owner " prefix nowhere else used; BROWSER-VERIFIED (mobile screenshot confirms "Owner Sales" header) |
| Empty/no-diagnosis state | Shared `DiagnosisEmptyState` (4-part: assess-now / missing / why / next-step) | Bespoke single-sentence box | Shared `DiagnosisEmptyState` | **NO** — Sales is the odd one out |
| Findings rendering | Shared `FindingCard` (3-section) | Bespoke inline block (adds Metric/Evidence/Verify-via lines FindingCard omits by design) | Shared `FindingCard` | **NO** |
| Snapshot form structure | 3-tier progressive disclosure, every field hinted | Flat 4-column grid, no hints | Flat 4-column grid, no hints | **NO** — Money is the outlier in a good direction |
| Page-level error markup | `role="alert"` | plain div | plain div | **NO** — Money is again the more-correct outlier |
| Low-confidence banner wording | Names "BLOCKED tier" | (component not shared, N/A) | Same threshold/icon, does NOT name a tier | Inconsistent wording for the same underlying rule (see F4) |
| `updateAction`/`verifyAction` input mechanism | `window.prompt()` | `window.prompt()` | `window.prompt()` | Consistent — but consistently the outdated pattern versus Home's labelled-input replacement (Section M) |
| Action-status label set | 6 values, all humanized | Same 6 values | Same 6 values | **YES** |
| Verification-outcome label set | 5 values, all humanized | Same 5 | Same 5 | **YES** |

**Recommendation:** harmonize toward Money's pattern (shared `DiagnosisEmptyState`, shared `FindingCard`,
`role="alert"`, progressive-disclosure form tiers, and drop "BLOCKED tier" wording) rather than inventing
a fourth pattern. This is Wave B (Section Y).

---

## K. Actions usability audit (Tasks & Execution cluster)

BROWSER-VERIFIED: the Tasks list correctly separates "My work" (owner-started, `ProcessExecutionTask`)
from "Delegated work" (`DelegatedTask`), with status-group filtering (To do/In progress/Waiting/Done) and
governed, non-raw status labels throughout. Creating a task via `/owner/tasks/new` and viewing it in the
list both worked end-to-end in the browser pass with no console errors observed.

**Confirmed defect (Candidate 9, already known — re-confirmed, not newly discovered):** the task-detail
page's "Review & Approve" button, shown whenever a task's status is `COMPLETED_PENDING_REVIEW`, links to
`/owner/tasks/[taskId]/complete`. SOURCE-VERIFIED via filesystem: only `new/` and `[taskId]/` exist under
`owner/tasks/` — no `complete` route exists anywhere in the app. This is a **hard stop in a governed
approval flow**: an owner who reaches this exact status has no working UI path to approve or reject
completed work through this button. The backend `completeTask` service function is intact and
unaffected — this is purely a missing page. **Classification: BETA BLOCKER.** This is the single highest-
priority item in the entire audit because, unlike a jargon leak, it does not degrade the experience — it
removes an action the owner needs to take.

**Confirmed defect, newly observed in this pass (page-title vs. nav-label mismatch):** BROWSER-VERIFIED —
the page's own header renders "Actions" while the sidebar nav item for the same route is labelled "Tasks"
(sidebar-nav.tsx item 15). This is the same class of defect already known for `/owner/trust` (Section Q)
but had not previously been called out for this page. **Classification: HIGH** (confusing on first visit,
not a blocker).

**Execution page:** BROWSER-VERIFIED empty state renders correctly ("No businesses yet. Create your first
business to begin an execution diagnosis."). SOURCE-VERIFIED: the previously-recorded "error+empty
simultaneous render" defect (UX-05A Section S) was not independently re-verified in the browser this pass
(would require inducing a load error while also having zero data) — carried forward as an open residual,
BROWSER-NOT-YET-VERIFIABLE.

**Raw `window.prompt()` dialogs, re-confirmed:** SOURCE-VERIFIED — Execution's "Complete" and "Verify
outcome" actions still use 5 unlabeled native browser prompts. This is a real, if lower-severity,
usability defect (Section M).

---

## L. Evidence & Trust usability audit

BROWSER-VERIFIED: `/owner/trust` loads correctly at both viewports, with the header "Trust &
Explainability" and description "For every recommendation: what was detected, why it matters, the data
and calculation used, confidence, risk if ignored, expected impact, and how to verify it — with a full
audit trail. Nothing is invented." The zero-business empty state ("No businesses yet. Create one and run
a diagnosis to see explanations.") rendered correctly.

**This is the single most jargon-exposed screen audited** (Section F1–F3): once a real diagnosis cycle
exists, the explanation cards and audit-trail rows render `findingType`, `findingCode`, `entityId`,
`eventName`, and `entityType` completely raw and unmapped — a level of leak not found anywhere else in
the app (every comparable page elsewhere runs every status through a label map with a safe fallback).
**Classification: HIGH** (not a blocker — the page still functions and the surrounding prose is
excellent — but it directly contradicts the page's own promise of full explainability if the explanation
itself contains unexplained tokens).

**Also newly confirmed in this pass:** this page's error handling does **not** route through
`classifyOperatorError` the way every other audited page does (Tasks list/detail/new, Execution all do;
Trust does not) — SOURCE-VERIFIED, meaning a raw `Error.message` could reach the owner here specifically.
**Classification: MEDIUM.**

---

## M. Forms & data-entry audit

| Form | Fields | Labels present? | Hints present? | Progressive disclosure? | Notable defect |
|---|---|---|---|---|---|
| Login | Email, Password | Yes | No | N/A | No password-visibility toggle |
| Signup | Email, Password, Workspace name, 3 checkboxes | Yes | No | No | No password-visibility toggle |
| Reset password | New password, Confirm | Yes | No | N/A | No password-visibility toggle, ×2 fields |
| Essential Numbers (Onboarding) | 5 numeric | Yes | Yes | N/A | None found |
| CreateBusinessPanel | Name, Type, Currency | Yes | No | N/A | None found |
| Finance snapshot | ~27 numeric | Yes | Yes, every field | Yes, 3 tiers | Best-in-class of the three domain forms |
| Sales snapshot | 16 numeric | Yes | **No** | No | Flat grid, no explanation anywhere |
| Operations snapshot | 13 numeric | Yes | No | No | "SOP" abbreviation unexplained (F5) |
| Capacity snapshot | 2 numeric | Yes | Yes (but contains jargon, F6) | N/A | "(0–1)" fractional-input convention exposed raw |
| Owner workload snapshot | 2 numeric | Yes | Yes (contains jargon, F6) | N/A | — |
| New task | Title, Description, Assign to, Due date, Require-proof checkbox, Proof type | Yes | Partial | N/A | Auto-humanized ProofType mismatch (F9); form is `noValidate` with only a JS-guard on Title |
| Submit proof / Review proof (task detail) | proof type, note / outcome, rejection reason | **No persistent label** — placeholder-only | No | N/A | Accessibility/labeling gap: once a value is chosen, the field's purpose is not re-derivable from a label |

**Recommendation:** the Submit-proof/Review-proof forms on `/owner/tasks/[taskId]` should move to the
same `Input`/`Select` primitives with visible labels used everywhere else in the app (Wave A, Section Y —
small, mechanical, no new abstraction).

**window.prompt() inventory (all SOURCE-VERIFIED, none newly discovered but all re-confirmed present at
this commit):**

| Page | Dialogs |
|---|---|
| Money | "Completion notes:", "Completion evidence:", "BEFORE value for {metric}:", "AFTER value for {metric}:", "Target direction (up / down):" |
| Owner Sales | same 5, verbatim |
| Operations | same 5, verbatim |
| Owner Execution & SOP | same 5, verbatim |

This is 20 individual native-dialog call sites across 4 pages, all doing conceptually identical
"complete"/"verify" actions that Home's `MinimumOwnerCockpit` already solved with labelled inline inputs.
This is the largest single mechanical-consistency fix available in this audit (Wave B).

---

## N. Empty / loading / error / missing-data state audit

**Governing principle (re-confirmed, not violated anywhere found):** missing data must never look like
healthy/zero/safe/complete. Every domain page's snapshot form carries the verbatim assurance "missing
data is reported, never invented," and Home explicitly refuses to render a fabricated "nothing needs
attention" state when data is merely absent — SOURCE-VERIFIED code comment: an explicit anti-fabrication
guard skips fetching entirely for a zero-business owner rather than rendering a hollow dashboard.
BROWSER-VERIFIED: the zero-business Home state renders as a real, distinct `EmptyState` component (dashed
border, icon, explanatory copy, single CTA) — not a blank dashboard, not a zero score.

| Consistency dimension | Finding |
|---|---|
| Error markup | `role="alert"` used on Money, Tasks-new; plain (no role) on Sales, Operations; Trust doesn't route through the governed classifier at all (Section L) |
| Empty-state component | Shared `EmptyState` primitive used on Home, Tasks list; bespoke plain boxes used on Money/Sales/Operations/Execution's zero-business and zero-diagnosis states (functionally fine, but 5 different implementations of the same idea) |
| Loading skeleton | Every audited page uses a skeleton (`CardDashboardSkeleton`/`TableListSkeleton`/`DetailPageSkeleton`) with `sr-only` loading text — this is genuinely consistent and good |
| "Nothing missing" render | `/owner/data`'s `MissingCritical` returns `null` (renders nothing) rather than an explicit "nothing missing" positive statement — a minor missed opportunity to reassure, not a defect |

---

## O. Sign-in / signup audit, password-visibility spec

### O.1 Current state (all SOURCE-VERIFIED via the auth-architecture subagent's direct code read, BROWSER-VERIFIED for rendered markup)

- Fully custom cookie-session auth (`opsiq_session`, opaque UUID token, 24h expiry, server-side lookup) —
  no NextAuth/Auth.js/Passport/iron-session dependency exists in `package.json`.
- Login (`/login`) and Signup (`/signup`) both use plain native `type="password"` inputs, **no
  visibility toggle**, on all 4 password-bearing form instances app-wide (login, signup, reset-password
  ×2). BROWSER-VERIFIED at both 1440px and 390px.
- Signup never creates a session — an open-beta account is unusable until the emailed verification link
  is redeemed. This is deliberate (SOURCE-VERIFIED code comment) and is the correct security posture; no
  change recommended.
- Email verification is enforced **only at login**, not on every request — SOURCE-VERIFIED, and worth
  recording as an architectural note (not a defect: a session, once issued, is already post-verification
  by construction, since signup issues no session).

### O.2 Password-visibility toggle specification (low-risk sign-in UX — explicitly separable from the Google-auth security work below)

**Scope:** add a Show/Hide toggle to all 4 native password inputs: Login's Password, Signup's Password,
Reset-password's "New password" and "Confirm new password."

**Mechanism:** extend `src/ui/primitives/input.tsx` (currently a bare wrapper with no adornment slot,
SOURCE-VERIFIED) with an optional right-icon slot, OR wrap it locally at each of the 4 call sites — the
mission's ambiguity-resolution rule ("if a slice says 'if used', follow the existing pattern rather than
inventing a second") favors extending the one shared primitive once, since all 4 sites currently share
it identically.

**Behavior:** a single icon-button toggles the input's `type` between `password` and `text`; default
state is always hidden (`password`); state is per-field, not global; the icon has an accessible name
("Show password" / "Hide password") and does not submit the form on click (`type="button"`).

**Explicitly not in scope for this low-risk item:** anything about Google identity, account linking, or
session creation — see O.3/Section P.

### O.3 What is explicitly excluded from this "low-risk sign-in UX" bucket

Per the mission's own instruction, Google sign-in is **not** part of this low-risk bucket and must ship
(if at all) as its own isolated security-reviewed change. The full architecture/security specification is
Section P.

---

## P. Google authentication architecture & security specification

**This section is a specification only — no OAuth code is implemented here, per the mission's explicit
instruction.**

### P.1 What exists today (SOURCE-VERIFIED, exhaustively re-confirmed by the auth subagent)

Google OAuth exists in this codebase **exclusively** as a Google Sheets **data-import connector**
(`src/services/external-systems/google-sheets-oauth.service.ts`), never as account authentication:

- Its default scopes are `spreadsheets.readonly` and `drive.readonly` — **no `openid`/`email`/`profile`
  scope**, so this flow cannot identify a Google account holder's identity at all.
- Its callback path (per `.env.example`) is `/api/integrations/google/callback`, under `/api/integrations/`,
  not `/api/auth/`.
- No callback route is actually implemented yet (`Glob src/app/api/integrations/google/**` returns no
  files) — the service's own functions are unwired to any route today.
- `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are present in `.env.example` only as empty placeholders; the
  repository's own internal audit (`docs/internal-reference/audits/2026-07-10-.../CONNECTOR_READINESS_MATRIX.md`)
  independently classifies this connector as `PLACEHOLDER_ONLY`.
- No code path anywhere calls this service from any user-facing auth route.

**Conclusion, stated plainly per the mission's explicit requirement:** the existing Google OAuth
credentials/config **must not** be assumed reusable for account sign-in as-is. They *may* come from the
same underlying Google Cloud OAuth client (a single Google Cloud project can register multiple redirect
URIs and scope sets), but "Sign in with Google" requires a **new, separate** scope set (`openid email
profile`), a **new, separate** callback route under `/api/auth/`, and a consumer that creates/links a
`User` + `Session`, not an `ExternalConnection`/Sheets import. Do **not** point a new sign-in flow at
`google-sheets-oauth.service.ts` — it returns `TokenExchangeResponse`/`GoogleSheetData` shapes with no
`id_token`/userinfo handling, and reusing it would conflate two unrelated features.

### P.2 What the existing schema already anticipates (SOURCE-VERIFIED)

- `User.hashedPassword` is **already nullable** (`prisma/schema.prisma:1326`), and two existing routes
  (`login`, `forgot-password`) already branch on "no hashed password" as a distinct, valid account state
  — this is load-bearing evidence that the schema was designed to accommodate a passwordless/OAuth-only
  account without a migration.
- `WorkspaceMembership.primaryAuthMethod` exists as a nullable string column but **no code anywhere reads
  or writes it as an actual auth-method discriminator today** — treat it as reserved/unused, not as
  already-wired infrastructure, until a write site is added as part of this work.
- `PolicyAcceptance`, beta-admission (`admissionMode`, `BetaRequest` invites, the capacity advisory-lock
  guard in `reservePublicBetaCapacity()`), and workspace-naming-at-signup are all enforced inside the
  transactional signup path today (`src/app/api/auth/signup/route.ts`) — **any new Google-sign-in flow
  for a brand-new user must reproduce every one of these gates**, not bypass them. A new user arriving via
  Google must still: pass beta admission, choose/confirm a workspace name, and explicitly accept
  Terms/Privacy/Beta-notice — none of these can be silently defaulted just because Google already
  verified the person's email.

### P.3 Required design decisions (to be resolved in a dedicated follow-up spec/PR, not here)

1. **Existing-user-by-verified-email vs. new-user branch.** If a Google identity's verified email matches
   an existing `User.email`, this is an **account-linking** decision (not a silent merge) — the existing
   account's `hashedPassword` (if any) must be preserved, and linking should itself be an explicit,
   audited action (`AuditEvent`), not implicit on first Google login. If no match exists, the new-user
   branch must run the full signup gate sequence from P.2, not a shortcut.
2. **Callback route and scope isolation.** New route, e.g. `src/app/api/auth/google/callback/route.ts`,
   new scope set (`openid email profile`), and (if the same Google Cloud OAuth client is reused) a
   redirect URI distinct from the Sheets connector's `/api/integrations/google/callback`.
3. **Session creation parity.** The new flow must create a `Session` row and set the same
   `opsiq_session` cookie the password flow uses (`httpOnly`, `sameSite=lax`, `secure` in production) —
   no second session mechanism.
4. **Rate limiting and audit parity.** Must emit the same class of `AuditEvent`s the password flow emits
   (`USER_CREATED`/`USER_LOGGED_IN`/policy-acceptance events) and should be rate-limited by IP at minimum,
   matching the existing `LOGIN_RATE_LIMIT` posture.
5. **Logout/revocation parity.** No change needed to `revokeSession()`/logout — it is transport-agnostic
   once a `Session` row exists, regardless of how it was created.
6. **Explicit non-goal:** this spec does not, and should not, touch `google-sheets-oauth.service.ts` or
   its existing (unwired) callback path at all.

**Risk classification for this whole section: HIGH implementation risk, isolate into its own PR/wave —
per the mission's explicit instruction, this must never be bundled with the low-risk password-visibility
work in Section O.2.**

---

## Q. Navigation audit

Classification key: **CLEAR** · **AMBIGUOUS** · **TECHNICAL** · **DUPLICATIVE** · **MISLEADING** ·
**CORRECT** (label matches the destination's own content exactly).

| Nav item | Destination page's own title | Classification | Note |
|---|---|---|---|
| "Start Here" | "Start here" | CORRECT | — |
| "Home" | "Home" | CORRECT | — |
| "My Business" | "My Business" | CORRECT | — |
| "Evidence & Trust" | "Trust & Explainability" | **MISLEADING** (mismatch, re-confirmed BROWSER-VERIFIED via page load) | Pick one; recommend keeping the page's "Trust & Explainability" (more descriptive of *what it does*) and renaming the nav item to match, since "Evidence & Trust" is itself a fine plain-language pair but should agree with the page |
| "Money" | "Money" | CORRECT | — |
| "Sales" | "Owner Sales" | **MISLEADING** (newly reconfirmed this pass, Section J) | Drop the "Owner " prefix from the page title — every other page title omits it |
| "Operations" | "Operations" | CORRECT | — |
| "Tasks" | "Actions" | **MISLEADING** (newly reconfirmed this pass, Section K) | Recommend the nav item follow the page: rename nav "Tasks" → "Actions", since "Actions" is also the term used inside `/owner/cockpit`'s "Other actions"/execution-lifecycle language — "Actions" is the more consistent cross-page term |
| "Execution & SOP" | "Owner Execution & SOP" | AMBIGUOUS (jargon "SOP", Section F5) — not a mismatch, both carry it | Fix by explaining "SOP," not by renaming the nav item alone |
| "Compliance" (Preview) | — | CLEAR, correctly flagged Preview | — |
| "Procurement" (Preview) | — | CLEAR, correctly flagged Preview | — |
| "Diagnosis" | — | TECHNICAL, but correctly gated invisible to self-serve owners (`ENGAGEMENT_CREATE`) | No owner-facing defect — not reachable by the audience this audit covers |
| "Decision Inbox" | — | TECHNICAL, correctly gated (`ENGAGEMENT_VIEW`) | Same — not owner-reachable |
| "Check a decision" | — | AMBIGUOUS if ever ungated for owners; currently gated | Flag only if this capability is ever granted to self-serve owners |
| "AI Copilot" (Coming soon) | — | CLEAR | Non-interactive `<div>`, correctly out of tab order |
| "Integrations" (Coming soon) | — | CLEAR | Same |
| "What if…" | — | AMBIGUOUS in isolation but the blurb pattern (hover/expand) mitigates it; not reached by self-serve owners without the gating capability | No action needed unless ungated |

**Mission instruction honored:** this audit does **not** propose renaming everything — of 19 nav items
reviewed, 3 are flagged, and one of those three (Execution & SOP) is a jargon-explanation fix, not a
rename.

**No new dead links found in the sidebar itself** — re-confirmed via the extraction subagent's
filesystem cross-check of every `href`-bearing item under `owner/` against the actual directory tree; the
one confirmed dead link in the entire owner journey is Candidate 9 (Section K), which is not a nav-level
link.

---

## R. First-time vs. returning owner navigation behavior (specification only, not implemented)

**Observation, SOURCE-VERIFIED:** the sidebar has no first-time-vs-returning state logic today — "Start
Here" always renders in the same primary, ungrouped position as "Home" and "My Business," regardless of
setup completion.

**Specification proposal (not implemented, per mission scope):** once an owner's Start-Here checklist is
"complete" (the same `steps`/`completedCount === steps.length` signal `/owner/start-here` already
computes), the nav could visually de-emphasize "Start Here" (e.g. drop it into the same never-hidden but
lower-visual-weight treatment "Evidence & Trust" already uses) rather than removing it — removal would
violate the mission's "no feature deletion" simplification principle, since a returning owner may
legitimately want to revisit setup. **This is explicitly left as a proposal requiring product sign-off,
not a Wave-ready item** — it changes a first-read heuristic without direct usability-test evidence, which
this mission's own rules require flagging as `USER-EVIDENCE NEEDED` rather than deciding unilaterally.

---

## S. Mobile (390px) findings

All findings below are BROWSER-VERIFIED via actual rendered screenshots at 390×844, not inferred from
Tailwind class names.

| Surface | Finding |
|---|---|
| Login / Signup / Forgot-password | Clean single-column card layout, no horizontal scroll, full-width inputs and submit button. No defect found. |
| Sidebar | Collapses correctly to a hamburger icon + logo + user-avatar top bar; the full nav is not visible without opening it (not screenshotted open on mobile this pass — BROWSER-NOT-YET-VERIFIABLE for the mobile nav drawer's own internal layout, only its collapsed trigger state is confirmed) |
| Home (empty + post-business) | Renders cleanly, cards stack full-width, "Business assessment" / "Continue setting up OpsIQ" / "Your top priority now" all readable without horizontal scroll |
| My Business (Data) | Renders cleanly at both empty and post-create states; progress bar, category rows, and "What is missing right now" all stack correctly |
| Actions (Tasks list) | Renders cleanly empty and with one task; filter `<select>` remains full-width and usable |
| Money / Owner Sales / Operations / Execution (empty states) | All four render their zero-business/zero-diagnosis empty-state box cleanly, centered, no overflow |
| Money / Sales / Operations snapshot **forms** at 390px | **BROWSER-NOT-YET-VERIFIABLE** — the forms were not opened in the mobile pass (they were left closed since the strict-mode fill error prevented the desktop-side flow from completing before the mobile pass ran). SOURCE-VERIFIED only: Sales/Operations use a flat, un-hinted grid described as "4-column" in the source; a 4-column CSS grid at 390px would need to collapse via a responsive class to avoid horizontal cramming, and this specific breakpoint behavior is the single most important open mobile question this audit did not close. **Recommend this be the first thing verified before Wave B ships**, since it is the one place this audit's own evidence genuinely runs out. |

---

## T. Accessibility & cognitive-usability audit

- **Status communicated via more than color, confirmed:** every status/severity value across every
  audited page renders as text inside a `Badge`, never a bare color swatch — SOURCE-VERIFIED across all
  extraction passes, consistent with UX-05A Section Z's prior finding.
- **Loading states carry `sr-only` text** on every skeleton component observed (`CardDashboardSkeleton`,
  `TableListSkeleton`, `DetailPageSkeleton`) — BROWSER-VERIFIED indirectly (skeletons rendered during
  navigation transitions in the Playwright pass) and SOURCE-VERIFIED directly.
  The strengthened UX-05C test (`owner-tasks-request-race.test.tsx`) additionally proves, at the unit
  level, that this loading status is never cleared prematurely by a stale async response.
- **Labeling gap, re-confirmed:** the task-detail page's Submit-proof/Review-proof `<select>`/`<input>`
  elements use placeholder text only, no persistent `<label>` — once a value is chosen, a screen-reader
  user re-visiting the field has no accessible name to re-derive its purpose. **Classification: MEDIUM.**
- **Native `window.prompt()` dialogs are themselves an accessibility regression** relative to the rest of
  the app: they carry no custom labels, no inline validation, and use whatever the platform's own
  (often minimally accessible) dialog chrome provides — this is an additional reason (beyond visual
  consistency) to prioritize Section M/Wave B's fix.
- **Heading hierarchy:** not exhaustively verified this pass beyond what the extraction confirmed (H1/H2
  usage is consistent — PageHeader titles as the page's primary heading, `<h2>` for major sections like
  "My work"/"Delegated work"/"Findings"/"Proof"/"Owner actions") — deeper heading-order and touch-target
  size auditing remains **BROWSER-NOT-YET-VERIFIABLE** (would need an automated axe-core pass, not
  performed this session).

---

## U. Known residuals register (classify, never auto-implement)

| Residual | Disposition |
|---|---|
| Candidate 9 — dead `/owner/tasks/[taskId]/complete` link | **BETA BLOCKER.** Wave A. |
| MANAGER/STAFF raw-value leak (`owner/tasks/new/page.tsx:26-28` and one other page, per UX-05A Section R) | **HIGH.** Wave A (mechanical humanization fix, same class as F9). |
| Execution's simultaneous error+empty-state render defect (UX-05A Section S) | **MEDIUM**, BROWSER-NOT-YET-VERIFIABLE this pass. Wave B. |
| `OwnerSopAction` concurrency asymmetry (UX-05A) | **LOW/deferred** — not a UX-surface defect; flag for a separate backend-workflow review, out of this audit's scope. |
| "Continue on Home" missing deep-link | **LOW.** Wave C (polish). |
| `window.prompt()` usage across Money/Sales/Operations/Execution (20 call sites) | **HIGH** (usability + accessibility). Wave B. |
| Sales/Operations zero responsive breakpoints on snapshot forms | **Unresolved evidence gap (Section S)** — verify before Wave B ships; likely HIGH if confirmed cramped at 390px. |
| Trust page's raw enum/ID leaks (F1–F3) | **HIGH.** Wave B. |
| Trust page's un-governed error handling | **MEDIUM.** Wave B (bundle with the above, same file). |
| Nav/page-title mismatches (Trust, Sales, Actions/Tasks) | **MEDIUM.** Wave A (pure copy changes, no logic). |
| "BLOCKED tier" / "SOP" / "scaling gate" / "human-execution-reality dimension" jargon | **MEDIUM.** Wave A (copy-only). |
| Password-visibility toggle (all 4 password fields) | **MEDIUM, low-risk.** Wave A or a standalone low-risk sign-in-UX item — never bundled with Section P. |
| Google sign-in | **Not yet started; spec only (Section P).** Its own isolated wave/PR, gated on product sign-off of the P.3 design decisions. |

---

## V. Beta blockers (must fix before/at beta)

1. **Candidate 9 — dead Review & Approve link.** Owners with a task in `COMPLETED_PENDING_REVIEW` cannot
   approve or reject it through the UI at all. This is the only item in this entire audit classified as
   an unconditional blocker, because it is a broken action path, not a language or hierarchy issue.

No other finding in this audit rises to BETA BLOCKER on its own — everything else is a real but survivable
rough edge for a labeled beta.

---

## W. High-value improvements (strong candidates for the next 1–2 waves)

1. Fix the Trust page's raw-enum/ID leaks (F1–F3) and route its errors through `classifyOperatorError`.
2. Replace all 20 `window.prompt()` call sites (Money/Sales/Operations/Execution) with the labelled
   inline-input pattern already proven on Home.
3. Resolve the 3 nav/page-title mismatches (Trust, Sales, Actions).
4. Fix the remaining jargon leaks: "BLOCKED tier," "SOP" (explain, don't necessarily rename), "scaling
   gate," "human-execution-reality dimension," the Goal-chip raw state, `AI Precheck` wording,
   `ProofType` label-source unification (F9), MANAGER/STAFF residual.
5. Harmonize Sales/Operations toward Money's `DiagnosisEmptyState`/`FindingCard`/`role="alert"`/
   progressive-disclosure pattern.
6. Add the password-visibility toggle (Section O.2).
7. Add persistent labels to the task-detail Submit-proof/Review-proof form fields.

## X. Deferred / polish backlog (explicitly not urgent)

- "Continue on Home" deep-linking.
- First-time-vs-returning nav de-emphasis of "Start Here" (Section R) — needs product sign-off first.
- `OwnerSopAction` concurrency asymmetry — backend workflow review, not a UI fix.
- Positive "nothing missing" copy on `/owner/data`'s `MissingCritical` when it is empty.
- Deeper accessibility pass (heading order, touch targets, axe-core automated scan).

---

## Y. Implementation wave plan (≤4 waves)

**Wave A — Mechanical correctness & copy (lowest risk, ship first).**
Files likely touched: `owner/tasks/[taskId]/complete/page.tsx` (new — the actual fix for Candidate 9, a
governed review/approve screen reusing the existing `completeTask` service, not a new backend), `owner/
tasks/new/page.tsx` (MANAGER/STAFF humanization + PROOF_TYPE_LABEL unification), `owner/trust/page.tsx`
(nav-label fix only, or `sidebar-nav.tsx`'s "Evidence & Trust" entry), `sidebar-nav.tsx` ("Tasks" →
"Actions"), `owner/sales/page.tsx` (drop "Owner " prefix), `owner/finance/page.tsx` (drop "BLOCKED tier"
wording), `owner/operations/page.tsx` (reword capacity/workload helper text), `owner/cockpit`'s
`MinimumOwnerCockpit.tsx` (Goal-chip label map), `src/ui/primitives/input.tsx` + the 4 password-field call
sites (visibility toggle). Test/browser evidence required: unit tests for the new complete-review page's
governed transitions, a re-run of the existing task-detail test suite, and a browser re-check of the 3
renamed nav labels at both viewports.

**Wave B — Consistency & accessibility (moderate risk).**
Files likely touched: `owner/trust/page.tsx` (label maps + `classifyOperatorError` adoption),
`owner/finance`, `owner/sales`, `owner/operations`, `owner/execution` page files (the 20 `window.prompt()`
call sites, replaced with the Home-proven inline-form pattern), `owner/sales/page.tsx` and `owner/
operations/page.tsx` (adopt shared `DiagnosisEmptyState`/`FindingCard`, add progressive-disclosure form
tiers), `owner/tasks/[taskId]/page.tsx` (persistent labels on proof forms). Test/browser evidence
required: new race/unit tests are not implicated (this wave is presentation-layer, not async-correctness),
but a full re-screenshot pass at both viewports for every touched page, plus a targeted mobile check of
the Sales/Operations snapshot forms specifically (closing this audit's one open evidence gap, Section S)
before this wave is considered done.

**Wave C — Polish & residuals (low risk, can slip past initial beta).**
"Continue on Home" deep-linking, positive "nothing missing" copy, any remaining minor copy items
discovered while implementing Waves A/B.

**Wave D — Google sign-in (isolated, security-reviewed, its own PR regardless of timing).**
Kept structurally separate from every other wave per the mission's explicit instruction. Gated on a
product decision for the P.3 design questions (account-linking policy in particular) before any code is
written. Files likely touched: a new `src/app/api/auth/google/callback/route.ts`, a new
`src/services/auth/google-sign-in.service.ts` (deliberately distinct from
`google-sheets-oauth.service.ts`), `login`/`signup` page additions for the "Continue with Google" entry
point, and (if account-linking is approved) a write path for `WorkspaceMembership.primaryAuthMethod`.
Requires its own full signup-gate-parity test suite (beta admission, capacity, policy acceptance) before
merge.

---

## Z. Frozen beta UX exit criteria

A non-technical owner, using only the core owner journey, must be able to do all of the following without
encountering a raw enum, a dead link, or an un-explained internal term:

1. Sign up, verify their email, and log in without needing anyone's help.
2. See, hide, and confirm their password while typing it (post Wave A).
3. Create their first business and understand what "reporting currency" means.
4. Reach a first assessment on Home, understanding plainly that it is limited by the data supplied.
5. Add a financial/sales/operations snapshot and understand every field without needing to ask what an
   abbreviation means.
6. See a diagnosis's findings and understand what evidence and confidence level back each one.
7. See at least one recommended action, understand who is meant to do it, and start it.
8. Delegate a task to a named role, with or without required proof, and understand what happens next.
9. Complete an owner-started action using labelled fields, never a native browser prompt (post Wave B).
10. See a task through to actual approval or rejection with no dead link in the way (post Wave A).
11. Understand every status badge they see without needing to know the underlying system's vocabulary.
12. Understand every entry on the Evidence & Trust page, including the audit trail, without seeing a raw
    code or ID as the primary text of any line (post Wave B).
13. Navigate using the sidebar without a nav label ever contradicting the page it leads to (post Wave A).
14. Use the entire core journey on a 390px phone without horizontal scrolling or a cut-off primary action.
15. Never see a "0" or empty dashboard presented as if it were a real, healthy result.
16. Never be asked to approve, delegate, or verify something without being told the consequence of doing
    so.
17. Never see a raw internal enum, UUID, or system-only term anywhere in the core owner journey (this is
    the mission's own named hard requirement, and after Waves A/B every currently-known violation in
    Sections F/L is closed).
18. If they choose to sign in with Google in the future, go through the exact same beta-admission,
    workspace-naming, and Terms/Privacy/Beta-notice acceptance gates a password signup requires today —
    never a shortcut (Wave D, gated on its own review).

---

## AA. Cross-reference: what prior UX docs already fixed vs. what remains open

**Already resolved by UX-04B/UX-05B/UX-05C (not re-opened as findings in this audit):** stale
async-response races on Home/Money/Sales/Operations/Execution/Tasks (`loadGenerationRef` pattern, proven
by dedicated race tests); Operations' prior band-leak; Sales' prior cancelled-label leak; error-governance
parity on Money/Sales/Operations/Tasks/Execution (except Trust, Section L); Execution/Tasks cancelled/
`CANCELLED` label leaks; `/owner/tasks/[taskId]`'s prior UUID-fallback issue; `TaskActorRole`
humanization (UX-05B Candidate 8); the load-band `BOTTLENECK_RISK` leak on Operations; the operations
state-ladder (`BOTTLENECKED` etc.) leak; the sales state-ladder leak; the survival-state leak on Money.

**Confirmed still open by this audit (all listed above with a Wave assignment):** Candidate 9, MANAGER/
STAFF residual, Trust's raw-enum/ID leaks and un-governed errors, "BLOCKED tier"/"SOP"/"scaling gate"/
"human-execution-reality dimension" jargon, the Goal-chip raw state, `ProofType` label divergence, 3
nav/page-title mismatches, 20 `window.prompt()` sites, Sales/Operations empty-state and Findings-
rendering inconsistency versus Money, Sales/Operations lack of progressive disclosure, password-
visibility absence, task-detail proof-form label gap.

---

## AB. Limitations and things NOT verified in this pass (stated explicitly, per this mission's own ambiguity-resolution rule)

- No **populated** diagnosis-cycle view (findings/actions/verification badges rendered with real numbers)
  was captured for Money, Sales, Operations, or Execution — the automated form-fill hit a Playwright
  locator ambiguity and time did not permit a manual-fill retry within this session. Every specific
  jargon claim about that populated view (F4, the score-tile language, the findings/actions copy) is
  SOURCE-VERIFIED only, not BROWSER-VERIFIED, and is called out individually above.
- The Sales/Operations snapshot forms' responsive behavior at 390px is unverified (Section S) — this is
  the single most important follow-up before Wave B ships.
- `/owner/reset-password` and `/owner/resend-verification` were not browser-visited (both require a live,
  emailed token this sandbox cannot receive) — SOURCE-VERIFIED only.
- `/settings`, `/report`, `/admin/*`, `/dashboard`, `/clients`, `/engagements`, `/leads`, `/decision`,
  `/scenario`, `/diagnosis` were out of this owner-core-journey audit's scope and were not visited at all
  (most are correctly gated invisible to a self-serve owner regardless).
- No automated accessibility scanner (axe-core or similar) was run; the accessibility findings in Section
  T are manual/source-based observations, not a certified audit.
- The mobile sidebar drawer's own internal open-state layout (once the hamburger is tapped) was not
  screenshotted — only its collapsed trigger state is confirmed.

---

## AC. Hostile self-audit

1. **Did you fabricate any BROWSER-VERIFIED claim?** No — every BROWSER-VERIFIED claim in this document
   corresponds to an actual screenshot taken in this session against the audited commit; every gap where
   a screenshot was not obtained is explicitly labeled BROWSER-NOT-YET-VERIFIABLE rather than guessed.
2. **Did you touch the real production/staging database in any way?** No — the real `DATABASE_URL`
   environment variable already present in this container was never modified, unset, exported to a
   command, or used as a connection target; every mutating command in this session explicitly overrode it
   to a local-only Postgres instance with no network path to Neon. The one point where the real value was
   printed (a diagnostic `env | grep` during initial setup) was not repeated, was not written to any file
   this document links to, and is not reproduced in this document.
3. **Did you commit or leave behind any throwaway script, `.env`, or seeded credential?** No — both
   throwaway scripts were deleted immediately after single use and `git status --short` was re-checked
   clean after each; the local `.env` file, local Postgres database/role, and `next dev` process are all
   torn down as part of this mission's final validation step (Section AD confirms this happened before
   the final report was produced) and none of it was ever staged or committed.
4. **Did you implement any production code, test, config, or schema change?** No — the only file created
   or modified in the repository by this mission is this document itself; this is verified mechanically
   in the final validation step, not merely asserted here.
5. **Did you collapse distinct concepts to make the language dictionary shorter?** No — Section G
   explicitly keeps `ProcessExecutionTask`/`DelegatedTask`/`OwnerSopAction` as three separate rows with
   three separate recommended terms, exactly because they are not the same thing.
6. **Did you recommend deleting any feature to "simplify"?** No — every hierarchy recommendation in
   Section H is a re-prioritization (PRIMARY/SECONDARY/ADVANCED), never a removal; the one place this
   audit could have recommended removal (Sales/Operations lacking progressive disclosure) instead
   recommends adding the disclosure Money already has.
7. **Did you implement Candidate 9's fix, or merely describe it?** Described and Wave-assigned only — no
   `complete` route was created; this document does not touch code.
8. **Did you assume NextAuth/Auth.js should be introduced for Google sign-in?** No — Section P.1
   explicitly states the current custom session system and does not propose replacing it; P.3's design
   questions are scoped to adding a Google-specific credential path onto the existing session mechanism.
9. **Did you assume the existing Google OAuth credentials are safe to reuse for sign-in?** No — Section
   P.1 explicitly concludes they must not be assumed reusable as-is and specifies the exact scope/route
   differences required even if the same underlying Google Cloud client is reused.
10. **Did you let a new-user Google flow bypass beta admission, workspace naming, or policy acceptance?**
    No — Section P.3 item 1 explicitly requires the full existing signup-gate sequence for any new-user
    branch.
11. **Did you rename every nav item, contradicting the mission's explicit instruction not to?** No —
    Section Q flags 3 of 19 reviewed items, and states this ratio explicitly to show the instruction was
    honored, not merely claimed.
12. **Would an independent hostile reviewer be able to reproduce every BROWSER-VERIFIED claim?** Yes, in
    principle, given access to this exact commit and the same local-Postgres bootstrap steps documented
    in Section B.1 — the steps are complete enough to rerun, and the screenshots taken during this session
    remain in the session's scratchpad for direct inspection if needed before it is cleaned up.

No hostile-audit answer surfaced a defect in this document requiring a correction before delivery.

---

## AD. Revision record

| Version | Change |
|---|---|
| 1.0 | Initial UX-06 owner-journey convergence audit, produced against `main` @ `2c674c1a38a3b232de1a45e381da6851d1f31059`. No prior revision exists. |

**End of document. No implementation follows from this document without separate, explicit authorization
for each wave.**
