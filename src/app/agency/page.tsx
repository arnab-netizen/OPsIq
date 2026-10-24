import type { Metadata } from "next";
import { PublicSiteHeader } from "@/components/landing/PublicSiteHeader";
import { PublicSiteFooter } from "@/components/landing/PublicSiteFooter";
import { ResourceDefaultCta } from "@/components/resources/ResourceCtaPanel";
import { DEFAULT_SOCIAL_IMAGE } from "@/services/resources/resource-seo";
import { absoluteUrl } from "@/lib/site";
import { AgencyDiagnosticClient } from "./AgencyDiagnosticClient";

const PATH = "/agency";
// Title kept at 60 characters or fewer and description at 155 or fewer so search results do not truncate them.
const TITLE = "Agency Decision Diagnostic: What to Fix First | OpsIQ";
const DESCRIPTION =
  "Free agency diagnostic: enter ten numbers and see the one issue to fix first across margin, overhead, cash and utilization. No signup.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl(PATH) },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl(PATH),
    type: "website",
    siteName: "OpsIQ",
    images: [DEFAULT_SOCIAL_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: DEFAULT_SOCIAL_IMAGE.url, alt: DEFAULT_SOCIAL_IMAGE.alt }],
  },
};

export default function AgencyDiagnosticPage() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicSiteHeader />
      <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-10 break-words">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Which agency number should you fix first?</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Enter last month&apos;s numbers. You get one prioritised issue and a next step, not a dashboard of ten metrics.
        </p>

        <AgencyDiagnosticClient />

        <p className="mt-6 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Educational tool, not financial, tax or legal advice. Everything is calculated in your browser: nothing you enter is sent or
          stored, and there is no email capture. Thresholds (delivery margin above 50% of adjusted gross income, overhead at or below
          30%) come from the Parakeeto agency profitability guide. The order in which issues are ranked is an OpsIQ working heuristic,
          not a published benchmark. The starting numbers are a worked example, not real data.
        </p>

        <ResourceDefaultCta />
      </div>
      <PublicSiteFooter />
    </main>
  );
}
