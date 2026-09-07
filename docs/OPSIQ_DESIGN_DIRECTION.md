# OpsIQ Design Direction

Status: living document. This defines the product's visual and editorial
character before any screen is redesigned. It extends the token system
already established in `src/app/globals.css` — it does not replace it.
Every rule below exists to satisfy the two equal-priority gates in the
premium-redesign brief: a non-technical owner can use the product
unaided, and the product does not look like a generic AI-generated SaaS
template.

## 1. Design principles

1. **One decision at a time.** Every screen answers exactly one question
   for the owner. If a screen tries to answer two, split it.
2. **Show, then explain.** Lead with the plain-language answer
   ("Cash runway: 6 weeks"), not the mechanism that produced it. Evidence
   and methodology sit behind a "Why?" disclosure, never in front of it.
3. **Nothing invented.** No metric, severity color, or recommendation
   renders without real supporting data. A missing input is stated as
   missing, never silently defaulted to zero, neutral, or "OK."
4. **Reuse before invention.** A new primitive is justified only when no
   existing one (Section 11) fits. Visual grouping comes from
   typography, spacing, and alignment first — a bordered/rounded card is
   the last resort, not the default container.
5. **Calm urgency.** Something that needs attention is stated plainly,
   with a specific next action. It is never dramatized with color,
   animation, or copy that could read as alarmist.

## 2. Visual personality

OpsIQ reads as a senior advisor's briefing, not a control room. Precise,
unhurried, quietly confident. It never borrows the visual language of
crypto dashboards, dev consoles, or consumer social apps. Concretely,
this repo's existing token file already establishes the correct
direction — a restrained neutral-plus-blue palette with AA-checked
text-on-surface pairs (`--primary-text`, `--warning-text`,
`--success-text` in `globals.css`) rather than saturated fills used as
body text. That discipline extends to every new surface: no gradients,
no glow, no decorative color.

## 3. Editorial voice

Calm, precise, specific, adult, businesslike, short. Concretely:

- Say the number and the unit, not the sentiment: "3 invoices are 30+
  days overdue," not "Your receivables need attention!"
- Never use: "leveraging AI," "unlock insights," "supercharge,"
  "revolutionize," "seamlessly," "intelligent ecosystem." Do not repeatedly
  call the product "AI" — the intelligence shows in what it does.
- Every error message states what happened, whether data is safe, and
  the one next action. (`src/lib/operator-safe-errors.ts` already encodes
  this contract for system errors — apply the same shape to product copy.)
- Internal/engineering vocabulary never reaches the owner-facing UI:
  `BusinessConditionProfile`, `InterventionMode`, `InterventionPhase`,
  `cockpit`, `capability`, raw enum values (`ASSESSMENT`,
  `system:admin`), and UUIDs are translated to plain business language at
  the UI boundary, not rendered verbatim. (Concrete offending examples
  are tracked in Section 15.)

## 4. Typography system

Extend, do not replace, the existing `--font-sans` stack
(`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
sans-serif`) — it is already a legitimate, non-templated system-font
choice suited to dense financial text at both desktop and mobile sizes.

| Role | Size | Weight | Line height | Notes |
|---|---|---|---|---|
| Display | 2.25rem (36px) | 600 | 1.15 | Marketing/landing only. Never inside an operational screen. |
| Page title | 1.5rem (24px) | 600 | 1.25 | One per screen. |
| Section title | 1.125rem (18px) | 600 | 1.35 | |
| Body | 0.9375rem (15px) | 400 | 1.55 | Max line length ~70ch. |
| Small body | 0.8125rem (13px) | 400 | 1.5 | Secondary/help text. |
| Label | 0.8125rem (13px) | 500 | 1.3 | Form/field labels. Sentence case, never all-caps. |
| Metadata | 0.75rem (12px) | 400 | 1.4 | Timestamps, byline-style text. |
| Number / KPI | 1.75–2.5rem | 600 | 1.1 | Tabular figures; a KPI is never smaller than the label beside it. |
| Monospace | `--font-mono` | 400 | 1.4 | IDs/codes shown to an admin persona only — never to a lay owner. |

Rules: no all-caps body or status text (the diagnosis-phase badge found
in Section 15 violates this today); no arbitrary one-off font-weight
values outside the scale above; no low-contrast gray body text — reuse
`--muted-foreground`, which is already contrast-checked.

## 5. Spacing system

4px base unit: `4, 8, 12, 16, 24, 32, 48, 64`. A screen's outer padding
and a component's internal padding are always values from this scale,
never arbitrary pixel values. Vertical rhythm between sections uses 32
or 48; within a section, 12 or 16.

## 6. Layout grid

Desktop content max-width 1120px, centered, with a persistent left nav
(existing `sidebar-nav.tsx` shell). Mobile is a single column with no
fixed max-width below 640px. No CSS grid "bento box" layouts where cards
are sized to fill a grid rather than to fit their content.

## 7. Color system

The existing four-role model in `globals.css` (`--background`/`--card`
surfaces, `--foreground`/`--muted-foreground` text, `--border`, and
`--primary`/`--destructive`/`--warning`/`--success` semantics with their
`-text` accessible variants) is correct and stays as-is. New rule going
forward: **no new color is introduced without a stated semantic
purpose.** Brand and state are kept separate — `--primary` is brand
(links, primary actions), never repurposed to mean "info" or "in
progress" for a status chip.

## 8. Semantic colors

- Red (`--destructive`): danger/critical/blocking only.
- Amber (`--warning`): needs attention, not yet urgent.
- Green (`--success`): confirmed positive/complete, backed by real data.
- Neutral (`--muted-foreground`/`--border`): default informational state.

A count of zero is never rendered in red or green — "0 critical issues"
is neutral text, not a colored badge, because a green zero implies a
health claim the system may not have evidence for. No severity color
renders without a real, current data point behind it — a missing input
is a neutral "not yet known" state, never defaulted to a color.

## 9. Radius system

Today there is one radius token (`--radius: 0.5rem`). Formalize a small
scale instead of applying the same radius everywhere by convention:

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 0.25rem | Inputs, small controls, chips |
| `--radius` | 0.5rem | Cards, panels, modals (existing default, unchanged) |
| `--radius-lg` | 0.75rem | Rare, large marketing surfaces only |

No 20px+ "pill everything" radius. No radius on a plain text block that
isn't a distinct surface.

## 10. Border and elevation policy

Prefer a 1px `--border` divider or whitespace over a shadow. Shadow is
reserved for genuinely floating elements (modal, dropdown, toast) — never
applied to a card sitting flush in a list purely for decoration. At most
one elevation level in normal use (`shadow-sm`, already used by
`login/page.tsx` and friends); a second, heavier shadow is reserved for
the floating layer only.

## 11. Core primitives

Build on what already exists in `src/ui/primitives/` (`Button`, `Input`,
`Select`, `Modal`, `Table`, `Badge`, `Skeleton`, `Textarea`, states)
rather than introducing a parallel component library. New primitives
needed for the redesigned journey, each defining default/hover/focus/
active/disabled/loading/error/empty/mobile states before use:

`PageHeader`, `Section`, `Metric`, `Priority`, `ActionRow`, `EmptyState`,
`ErrorState`, `Field` + `FieldHelp`, `Disclosure` (the "Why?" pattern),
`NavigationItem`.

Do not reach for `Badge`/`Tabs`/`Accordion`/`Card` by default — use
typography, spacing, and dividers for grouping first, per Principle 4.

## 12. Icon policy

Icons illustrate, they never carry meaning alone (no icon-only buttons
without a text label or `aria-label`). No decorative sparkle/AI/robot
iconography. No icon glued to every heading by default — an icon earns
its place next to a heading only when it disambiguates, not as a
styling habit.

## 13. Motion policy

Motion clarifies a state change — it does not decorate. Appropriate:
expand/collapse of a `Disclosure`, a loading skeleton, a success
confirmation, focus/hover feedback (~150ms ease). Not appropriate:
entrance animations on page load, parallax, animated gradients, spring
bounce. Respect `prefers-reduced-motion` everywhere motion is added.

## 14. Data visualization policy

Every chart or metric answers a decision-relevant question; a chart with
no action attached to it is deleted, not decorated. No 3D, no
unnecessary gradients on fills, no more than one chart per decision on a
given screen. Numbers render as numbers (`Metric` primitive) far more
often than as charts — a lay owner reads "6 weeks of runway" faster than
a sparkline.

## 15. Known violations to correct in Track C (from current-state audit)

Concrete instances found during the pre-redesign survey, to be fixed as
part of the relevant screen's redesign (not fixed en masse here, to
avoid an unreviewable diff):

- `src/app/(authenticated)/owner/cockpit/page.tsx`: page title reads
  "Your cockpit" — internal term shown verbatim.
- `src/app/(authenticated)/owner/manual-entry/page.tsx`: body copy
  ("governed cockpit", "Go to your cockpit") repeats the same term.
- `src/app/(authenticated)/diagnosis/page.tsx`: renders the raw
  `InterventionPhase` enum, upper-cased, as a badge instead of a
  human label.
- `src/app/(authenticated)/opsiq/consulting-engine/page.tsx`: renders
  internal field names (`rootCauseDiagnosis`, `criticalPathInterventions`)
  directly as headings.
- `src/app/(authenticated)/admin/billing/page.tsx`: renders a raw
  namespaced capability id (e.g. `system:admin`) as user-facing text.

## 16. Responsive rules

Mobile is a distinct design, not desktop reflowed. At 390px: the
single most important action for the screen stays reachable without
scrolling past a full viewport of secondary content; tables become
stacked key-value rows, not horizontally-scrolling grids; the primary
action becomes a sticky bottom bar where the pattern already exists
elsewhere in the product.

## 17. Empty / loading / error state policy

Every list/data surface defines all three explicitly:

- **Empty**: state what data is missing, why OpsIQ needs it, and the one
  action to provide it. Never a bare "No data."
- **Loading**: a skeleton matching the eventual layout (existing
  `src/ui/primitives/skeleton.tsx`), not a spinner replacing the whole
  screen.
- **Error**: what happened, whether anything was lost, and the one
  recovery action — mirroring the contract already defined in
  `src/lib/operator-safe-errors.ts`, extended to product-level (not just
  system-failure) copy.

## 18. Information architecture

One canonical Home per persona, resolved server-side by the existing
centralized `isSelfServeOwnerContext` policy check
(`src/app/page.tsx`) — never re-decided independently inside a page or
after an auth action. A self-serve owner's primary nav surfaces a small,
un-collapsed set of top-level destinations (Home, business health,
priorities/actions); everything else (goals/strategy, records,
consulting, admin) stays behind the existing collapsed sections in
`sidebar-nav.tsx` so a first-time owner is not shown ~24 peer
destinations on day one.
