import Link from "next/link";

export const metadata = {
  title: "Privacy | OpsIQ",
  description: "How OpsIQ handles your information during beta.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-6 py-12 text-foreground">
      <Link href="/" className="text-sm text-[var(--primary-text)] hover:underline">
        &larr; Back to OpsIQ
      </Link>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-muted-foreground">OpsIQ is currently in beta.</p>

      <div className="mt-8 space-y-5 text-sm leading-relaxed text-muted-foreground">
        <p>
          OpsIQ is a beta product. Please <strong>do not enter sensitive personal, customer,
          employee, financial-account, password, or otherwise confidential business information</strong>{" "}
          when describing your business.
        </p>
        <p>
          The business inputs you provide are used to generate your diagnosis, findings,
          recommendations, and action plan, and to show those results back to you in your workspace.
        </p>
        <p>
          You can request help, or guidance on deleting your data or account, at any time during beta
          by emailing{" "}
          <a href="mailto:support@opsiq.com" className="text-[var(--primary-text)] hover:underline">
            support@opsiq.com
          </a>
          .
        </p>
        <p>
          Because OpsIQ is in beta, this notice and the service may change. We&rsquo;ll keep this
          page updated as the product matures.
        </p>
      </div>
    </main>
  );
}
