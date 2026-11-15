import { PublicBetaText } from "@/components/landing/PublicBetaCta";
import { PublicSiteHeader } from "@/components/landing/PublicSiteHeader";

export const metadata = {
  title: "About OpsIQ",
  description:
    "OpsIQ reads your business's day-to-day numbers, tells you what needs attention and why, and gives you one prioritized, explained action at a time.",
};

export default function AboutPage() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicSiteHeader />

      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        <h1 className="font-display text-3xl font-bold tracking-tight">About OpsIQ</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          OpsIQ reads your business&apos;s day-to-day numbers, tells you what needs attention and
          why, and gives you one prioritized, explained action at a time — with the exact data and
          reasoning behind it. It&apos;s built for small and mid-size service business owners, not
          enterprise IT or sales teams. <PublicBetaText field="aboutSentence" />
        </p>

        <h2 className="font-display mt-8 text-xl font-semibold tracking-tight">Looking for a different OpsIQ?</h2>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          If you searched for &quot;OpsIQ&quot; and aren&apos;t sure you found the right one,
          you&apos;re not alone. At least a dozen unrelated companies and tools use the name — it&apos;s
          a natural combination of &quot;Ops&quot; and &quot;IQ,&quot; so several teams landed on
          it independently, with no copying involved. This OpsIQ is not a CRM, not an enterprise
          ops platform, and not a coaching service, and it isn&apos;t affiliated with any of the
          other products called OpsIQ.
        </p>
      </div>
    </main>
  );
}
