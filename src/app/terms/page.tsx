import Link from "next/link";

export const metadata = {
  title: "Terms | Rebilix",
  description: "Beta terms for using Rebilix.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-6 py-12 text-foreground">
      <Link href="/" className="text-sm text-primary hover:underline">
        &larr; Back to Rebilix
      </Link>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Terms</h1>
      <p className="mt-2 text-sm text-muted-foreground">Rebilix is currently in beta.</p>

      <div className="mt-8 space-y-5 text-sm leading-relaxed text-muted-foreground">
        <p>
          Rebilix provides <strong>operational decision-support</strong>. It is{" "}
          <strong>not financial, legal, accounting, or tax advice</strong>, and its output should be
          treated as a structured second opinion to inform &mdash; not replace &mdash; your own
          judgment.
        </p>
        <p>
          You remain responsible for the business decisions you make. Review Rebilix&rsquo;s findings,
          recommendations, and actions against your own knowledge of your business before acting on
          them.
        </p>
        <p>
          Rebilix is a beta service. It may change, and may occasionally be unavailable, while we
          continue to improve it.
        </p>
        <p>
          Questions? Contact{" "}
          <a href="mailto:support@opsiq.com" className="text-primary hover:underline">
            support@opsiq.com
          </a>
          .
        </p>
      </div>
    </main>
  );
}
