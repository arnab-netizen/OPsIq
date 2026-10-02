import Link from "next/link";
import { Badge } from "@/ui/primitives";
import { BetaAccessCta } from "@/components/landing/BetaAccessCta";
import { PublicSiteHeader } from "@/components/landing/PublicSiteHeader";
import { PublicSiteFooter } from "@/components/landing/PublicSiteFooter";

/**
 * Public, logged-out landing page for first-time visitors.
 *
 * Presentational only: no business logic, no permission checks, no state
 * transitions, no data fetching. Authenticated routing is handled by the
 * server route (src/app/page.tsx), which renders this component only for
 * logged-out visitors. The one exception is BetaAccessCta, a small client
 * component (controlled-beta capture form) rendered as a child here — all of
 * its own logic (validation, persistence, dedup) lives server-side in
 * POST /api/beta-requests, never in this page.
 *
 * Every claim on this page is backed by a real, shipped OpsIQ concept (see
 * the PR description's claim registry). The product-proof sequence on the
 * right of the hero uses a clearly fictional example business, entirely
 * built from real domain concepts (finding, severity, priority, owner-role
 * action, verification) -- never a fabricated confidence percentage,
 * forecast, integration badge, AI-chat control, or customer outcome.
 */

const primaryCta =
  "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm h-12 px-6 text-base rounded-lg";

const secondaryCta =
  "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-border bg-background text-foreground hover:bg-muted h-12 px-6 text-base rounded-lg";

/** "How OpsIQ works" — the real loop: every domain diagnosis follows this order today. */
const HOW_IT_WORKS = [
  {
    title: "Evidence",
    body: "Start from the numbers you already track. Each finding shows the metric and value behind it, and missing data is shown as a gap.",
  },
  {
    title: "Diagnose",
    body: "Run a structured diagnosis on Money, Sales, or Operations from the numbers you already track.",
  },
  {
    title: "Prioritize",
    body: "Findings are ordered by severity and urgency, not just listed — you see what matters most first.",
  },
  {
    title: "Act",
    body: "Every finding comes with a recommended action: who owns it, and a timeframe.",
  },
  {
    title: "Verify",
    body: "Mark an action's real outcome afterward. What happened stays separate from what was predicted.",
  },
];

/** Input -> output: each line maps to shipped behavior described elsewhere on this page. */
const INPUT_OUTPUT = [
  {
    label: "You bring",
    body: "The business numbers you already track for Money, Sales, or Operations.",
  },
  {
    label: "OpsIQ does",
    body: "Checks the evidence, finds what needs attention, ranks it, and explains why.",
  },
  {
    label: "You get",
    body: "A finding, its priority and reason, a recommended action, and a record of the outcome you verify.",
  },
];

/** Differentiation: short, current-product statements only. No brands, no consultant-replacement claim. */
const DIFFERENTIATORS = [
  {
    title: "Not another dashboard",
    body: "OpsIQ helps decide what deserves attention first, not just display numbers.",
  },
  {
    title: "Not generic AI advice",
    body: "Recommendations are tied to structured evidence and visible missing information.",
  },
  {
    title: "Not a task tracker",
    body: "OpsIQ helps decide which action matters before the work is tracked.",
  },
];

/** Trust concepts — each one describes real, shipped behavior, not a generic claim. */
const TRUST_POINTS = [
  {
    title: "Findings are tied to evidence",
    body: "Every finding shows the metric and value behind it — not just a conclusion.",
  },
  {
    title: "Missing data is shown, not hidden",
    body: "When required information is missing, OpsIQ shows the gap instead of hiding it.",
  },
  {
    title: "You control every action",
    body: "OpsIQ recommends; nothing runs, sends, or changes anything on its own.",
  },
  {
    title: "Outcomes stay honest",
    body: "A verified outcome is recorded separately from the original recommendation — never blended together.",
  },
];

/** PwC-derived facts. Population caveat is part of the wording; see docs/opsiq/marketing/PUBLIC_POSITIONING_EVIDENCE.md. */
const WHY_NOW_FACTS = [
  "89% said their technology investments had not fully delivered expected results.",
  "87% said poor data quality had affected their organization\u2019s ability to achieve value from digital initiatives.",
];

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicSiteHeader />

      {/* Hero + product proof, side by side at desktop so the proof is visible without scrolling
          (a first-time visitor sees the claim and the evidence for it in the same screen).
          Stacks to a single column at mobile, proof second so the proposition and CTA lead. */}
      <section className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-12 px-6 py-12 lg:grid-cols-2 lg:py-16">
        <div className="text-center lg:text-left">
          <p className="mb-4 inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
            Free controlled beta &middot; no credit card &middot; access by invitation
          </p>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Diagnose your business. Know your next move.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            OpsIQ reads your business numbers, tells you what needs attention and why, and gives
            you an ordered plan for what to do next — then keeps track of what actually happened.
          </p>
          <p className="mt-4 text-sm font-medium text-foreground" data-testid="landing-audience">
            Built for small and mid-size service business owners who need to know what deserves
            attention first.
          </p>
          <div className="mt-8 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row lg:justify-start">
            <BetaAccessCta triggerClassName={`${primaryCta} w-full sm:w-auto`} />
            <Link href="/login" className={`${secondaryCta} w-full sm:w-auto`}>
              Sign in
            </Link>
          </div>
        </div>

        {/* Product proof: a compact, honest walk through the real decision loop, using a
            clearly-labeled fictional example so it can never be mistaken for a real customer. */}
        <div className="rounded-xl border border-border bg-background p-6 shadow-sm" data-testid="landing-product-proof">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Illustrative example &middot; not a real customer
          </p>
          <p className="mt-1 font-display text-sm font-semibold text-foreground">
            Riverside Bakery (example business)
          </p>

          <ol className="mt-5 flex flex-col gap-4">
            <li className="border-l-2 pl-4" style={{ borderColor: "var(--border)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Business signal
              </p>
              <p className="mt-0.5 text-sm text-foreground">
                Latest financial snapshot: cash on hand down, overdue receivables up.
              </p>
            </li>
            <li className="border-l-2 pl-4" style={{ borderColor: "var(--accent-ink)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Finding
              </p>
              <p className="mt-0.5 text-sm text-foreground">
                Overdue receivables now exceed 45 days of revenue.
              </p>
            </li>
            <li className="border-l-2 pl-4" style={{ borderColor: "var(--accent-ink)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Why it matters
              </p>
              <p className="mt-0.5 text-sm text-foreground">
                A sustained cash-survival risk, not just a slow month.
              </p>
            </li>
            <li className="border-l-2 pl-4" style={{ borderColor: "var(--destructive)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Priority
              </p>
              <p className="mt-0.5">
                <Badge variant="destructive-accessible">Critical &middot; highest priority this cycle</Badge>
              </p>
            </li>
            <li className="border-l-2 pl-4" style={{ borderColor: "var(--accent-ink)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Recommended action
              </p>
              <p className="mt-0.5 text-sm text-foreground">
                Call the top 3 overdue accounts. Owner &middot; this week.
              </p>
            </li>
            <li className="border-l-2 pl-4" style={{ borderColor: "var(--success-text)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Evidence &amp; verification
              </p>
              <p className="mt-0.5 text-sm text-foreground">
                Tied to the business&rsquo;s own receivables data. The owner checks what happened and
                records the outcome &mdash; OpsIQ doesn&rsquo;t detect payment automatically.
              </p>
            </li>
          </ol>
        </div>
      </section>

      {/* Input -> output, plus three short differentiators. Replaces the earlier
          "without/with a diagnosis" bridge so the page does not get longer. */}
      <section className="mx-auto w-full max-w-4xl px-6 py-10" data-testid="landing-input-output">
        <h2 className="text-center font-display text-2xl font-bold tracking-tight sm:text-3xl">
          What you bring, and what you get
        </h2>
        <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {INPUT_OUTPUT.map((item) => (
            <div key={item.label} className="rounded-lg border border-border bg-background p-5">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</dt>
              <dd className="mt-2 text-sm text-foreground">{item.body}</dd>
            </div>
          ))}
        </dl>
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3" data-testid="landing-differentiation">
          {DIFFERENTIATORS.map((item) => (
            <li key={item.title} className="border-l-2 py-1 pl-4" style={{ borderColor: "var(--accent-ink)" }}>
              <p className="text-sm font-semibold">{item.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Why now: independent context, clearly separated from OpsIQ's own interpretation. */}
      <section className="mx-auto w-full max-w-4xl px-6 py-12" data-testid="landing-why-now">
        <h2 className="text-center font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Why this matters now
        </h2>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          PwC&rsquo;s 2026 Digital Trends in Operations Survey asked 767 US operations and
          supply-chain leaders about technology investment.
        </p>
        <ul className="mt-6 grid grid-cols-1 gap-4">
          {WHY_NOW_FACTS.map((fact) => (
            <li key={fact} className="border-l-2 py-1 pl-5 text-sm text-foreground" style={{ borderColor: "var(--accent-ink)" }}>
              {fact}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          These are the views of the surveyed US operations and supply-chain leaders, not of all
          businesses or of owner-led companies. PwC is cited as independent context only and has
          not reviewed or endorsed OpsIQ.
        </p>
        <div className="mt-6 rounded-lg border border-border bg-background p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            OpsIQ&rsquo;s interpretation
          </p>
          <p className="mt-2 text-sm text-foreground">
            Owning a tool is not the same as getting a result. Decisions need clear evidence,
            an order of priority, an owned action, and a check on what actually happened. That is
            what OpsIQ is built to do today.
          </p>
          <p className="mt-3 text-sm">
            <Link href="/resources/future-of-business-decision-making-2026-operations-research" className="text-[var(--primary-text)] hover:underline">
              Read the research notes &rarr;
            </Link>
          </p>
        </div>
      </section>

      {/* How OpsIQ works — the real loop, in order. Four short steps, not a feature grid. */}
      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <h2 className="text-center font-display text-2xl font-bold tracking-tight sm:text-3xl">
          How OpsIQ works
        </h2>
        <ul className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {HOW_IT_WORKS.map((item, i) => (
            <li key={item.title} className="rounded-lg border border-border bg-background p-6 text-left shadow-sm">
              <span className="font-display text-sm font-semibold text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-1 text-base font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Evidence & trust — concrete, verifiable product behavior, not generic assurance copy. */}
      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <h2 className="text-center font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Why trust what it tells you
        </h2>
        <ul className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {TRUST_POINTS.map((item) => (
            <li key={item.title} className="border-l-2 pl-5 py-1" style={{ borderColor: "var(--accent-ink)" }}>
              <h3 className="text-base font-semibold">{item.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Final CTA */}
      <section className="mx-auto w-full max-w-6xl px-6 py-12 text-center">
        <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          See what OpsIQ finds in your business.
        </h2>
        <div className="mt-8 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row sm:justify-center">
          <BetaAccessCta triggerClassName={`${primaryCta} w-full sm:w-auto`} />
          <Link href="/login" className={`${secondaryCta} w-full sm:w-auto`}>
            Sign in
          </Link>
        </div>
      </section>

      {/* Small, secondary disambiguation notice -- must not visually compete with the Final CTA
          above it (muted, small text, no button styling). */}
      <section className="mx-auto w-full max-w-2xl px-6 pb-12 text-center">
        <p className="text-sm text-muted-foreground">
          <strong>Looking for a different OpsIQ?</strong> There are several unrelated products
          that also go by &quot;OpsIQ.&quot; We&apos;re not affiliated with any of them.{" "}
          <Link href="/about" className="text-[var(--primary-text)] hover:underline">
            Learn more →
          </Link>
        </p>
      </section>

      <PublicSiteFooter />
    </main>
  );
}
