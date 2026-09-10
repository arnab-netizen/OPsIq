import Link from "next/link";
import { Badge } from "@/ui/primitives";

/**
 * Public, logged-out landing page for first-time visitors.
 *
 * Presentational only: no business logic, no permission checks, no state
 * transitions, no data fetching. Authenticated routing is handled by the
 * server route (src/app/page.tsx), which renders this component only for
 * logged-out visitors.
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

const SUPPORT_EMAIL = "support@opsiq.com";

/** "How OpsIQ works" — the real loop: every domain diagnosis follows this order today. */
const HOW_IT_WORKS = [
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

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <span className="text-xl font-bold text-primary">OpsIQ</span>
        <nav aria-label="Primary" className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            Sign in
          </Link>
          <Link href="/signup" className="text-sm font-medium text-[var(--primary-text)] hover:underline">
            Start free
          </Link>
        </nav>
      </header>

      {/* Hero + product proof, side by side at desktop so the proof is visible without scrolling
          (a first-time visitor sees the claim and the evidence for it in the same screen).
          Stacks to a single column at mobile, proof second so the proposition and CTA lead. */}
      <section className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-12 px-6 py-12 lg:grid-cols-2 lg:py-16">
        <div className="text-center lg:text-left">
          <p className="mb-4 inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
            Free beta &middot; no credit card required
          </p>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Diagnose your business. Know your next move.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            OpsIQ reads your business numbers, tells you what needs attention and why, and gives
            you an ordered plan for what to do next — then keeps track of what actually happened.
          </p>
          <div className="mt-10 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row lg:justify-start">
            <Link href="/signup" className={`${primaryCta} w-full sm:w-auto`}>
              Start free
            </Link>
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

      {/* Problem -> outcome: one compact bridge, not a full section, so a visitor who skims past
          the hero still gets "why should I care" before "how it works". */}
      <section className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-background p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Without a diagnosis
            </p>
            <p className="mt-2 text-sm text-foreground">
              Owners find out about a problem when it&rsquo;s already urgent — a slow month that was
              really a cash-survival risk three months in the making.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              With OpsIQ
            </p>
            <p className="mt-2 text-sm text-foreground">
              The same signal is surfaced, ranked by real urgency, and turned into one clear,
              owned next action — instead of staying buried in the numbers.
            </p>
          </div>
        </div>
      </section>

      {/* How OpsIQ works — the real loop, in order. Four short steps, not a feature grid. */}
      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <h2 className="text-center font-display text-2xl font-bold tracking-tight sm:text-3xl">
          How OpsIQ works
        </h2>
        <ul className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
          <Link href="/signup" className={`${primaryCta} w-full sm:w-auto`}>
            Start free
          </Link>
          <Link href="/login" className={`${secondaryCta} w-full sm:w-auto`}>
            Sign in
          </Link>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-6xl px-6 py-8 text-center text-sm text-muted-foreground">
        <p>Free beta &mdash; no credit card required.</p>
        <nav aria-label="Legal and support" className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <Link href="/privacy" className="text-[var(--primary-text)] hover:underline">
            Privacy
          </Link>
          <Link href="/terms" className="text-[var(--primary-text)] hover:underline">
            Terms
          </Link>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[var(--primary-text)] hover:underline">
            Support
          </a>
        </nav>
      </footer>
    </main>
  );
}
