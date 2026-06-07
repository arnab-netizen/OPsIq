import Link from "next/link";

/**
 * Public, logged-out landing page for first-time visitors.
 *
 * Presentational only: no business logic, no permission checks, no state
 * transitions, no data fetching. Authenticated routing is handled by the
 * server route (src/app/page.tsx), which renders this component only for
 * logged-out visitors.
 */

const primaryCta =
  "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm h-12 px-6 text-base rounded-lg";

const secondaryCta =
  "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-border bg-background text-foreground hover:bg-muted h-12 px-6 text-base rounded-lg";

const SUPPORT_EMAIL = "support@opsiq.com";

const capabilities = [
  {
    title: "Surface the real risks",
    body: "Answer a few questions about your business and get a structured read on where the pressure is building.",
  },
  {
    title: "Prioritize the next actions",
    body: "Every diagnosis returns an ordered action plan with owners, due windows, and the metric each action moves.",
  },
  {
    title: "Support the decision",
    body: "See findings, severity, and the recommended intervention phase so the next call is grounded, not guessed.",
  },
];

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <span className="text-xl font-bold text-primary">Rebilix</span>
        <nav aria-label="Primary" className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            Sign in
          </Link>
          <Link href="/signup" className="text-sm font-medium text-primary hover:underline">
            Start free
          </Link>
        </nav>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="mb-4 inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
          Free beta &middot; no credit card required
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Diagnose your business. Know your next move.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Rebilix runs an algorithmic business diagnosis built for operators &mdash; it identifies your
          biggest risks, prioritizes the next actions, and supports the decisions that follow. No
          payment is required, and no paid AI provider is needed to run a diagnosis.
        </p>
        <div className="mt-10 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
          <Link href="/signup" className={`${primaryCta} w-full sm:w-auto`}>
            Start free
          </Link>
          <Link href="/login" className={`${secondaryCta} w-full sm:w-auto`}>
            Sign in
          </Link>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-6 pb-16">
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {capabilities.map((item) => (
            <li key={item.title} className="rounded-lg border border-border bg-background p-6 text-left shadow-sm">
              <h2 className="text-base font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="mx-auto w-full max-w-5xl px-6 py-8 text-center text-sm text-muted-foreground">
        <p>Free beta &mdash; no credit card required.</p>
        <nav aria-label="Legal and support" className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy
          </Link>
          <Link href="/terms" className="text-primary hover:underline">
            Terms
          </Link>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
            Support
          </a>
        </nav>
      </footer>
    </main>
  );
}
