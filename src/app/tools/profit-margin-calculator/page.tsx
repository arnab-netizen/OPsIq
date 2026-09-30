import type { Metadata } from "next";
import Link from "next/link";
import { PublicSiteHeader } from "@/components/landing/PublicSiteHeader";
import { PublicSiteFooter } from "@/components/landing/PublicSiteFooter";
import { ResourceDefaultCta } from "@/components/resources/ResourceCtaPanel";
import { ProfitCashCalculator } from "@/components/tools/ProfitCashCalculator";
import { DEFAULT_SOCIAL_IMAGE, serializeJsonLd } from "@/services/resources/resource-seo";
import { SITE_URL, absoluteUrl } from "@/lib/site";

const PATH = "/tools/profit-margin-calculator";
const TITLE = "Profit Margin Calculator for Small Business (With Cash Flow Check) | OpsIQ";
const DESCRIPTION =
  "Free profit margin calculator for small business owners: gross margin, markup, operating margin and the price to charge for a target margin, plus a check on whether that profit becomes cash. No sign-up.";

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

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Profit Margin Calculator for Small Business",
  description: DESCRIPTION,
  url: absoluteUrl(PATH),
  applicationCategory: "BusinessApplication",
  operatingSystem: "Any (web browser)",
  isAccessibleForFree: true,
  publisher: { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "OpsIQ", url: `${SITE_URL}/` },
};

export default function ProfitMarginCalculatorPage() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(JSON_LD) }} />
      <PublicSiteHeader />

      <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-10 break-words">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Profit Margin Calculator for Small Business</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Enter last month&apos;s revenue and costs to get your gross margin, markup and operating margin. Then check the part most
          margin calculators skip: whether that profit is actually turning into cash you can spend.
        </p>

        <ProfitCashCalculator />

        <p className="mt-6 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Educational tool, not financial, tax or legal advice. Everything is calculated in your browser on this page: nothing is
          sent or stored, and there is no email capture. Do not enter card numbers, passwords or personal identifiers. The default
          numbers are the worked example from our guide, not real data.
        </p>

        <section className="mt-12 max-w-2xl space-y-4 text-base leading-relaxed">
          <h2 className="font-display text-2xl font-bold tracking-tight">How to calculate profit margin</h2>
          <p>
            Gross margin is (revenue &minus; direct costs) &divide; revenue. Operating margin also subtracts operating expenses such as
            payroll, rent and software. For example, if you sell something for $100 that costs you $60 to deliver, your gross profit is
            $40 and your gross margin is 40%.
          </p>
          <h2 className="font-display text-2xl font-bold tracking-tight">Margin vs markup</h2>
          <p>
            Markup is (revenue &minus; direct costs) &divide; direct costs. The same $100 sale with a $60 cost is a 40% margin but a 66.7%
            markup. Margin is measured against the price, markup against the cost, which is why a 40% markup does not give a 40% margin.
            To choose a price for a target margin, divide your cost by (1 &minus; margin): a $60 cost at a 40% margin needs a $100 price.
          </p>
          <h2 className="font-display text-2xl font-bold tracking-tight">Profit vs cash flow: why they differ</h2>
          <p>
            Profit is what is left after costs on your income statement. Cash flow is money actually moving in and out of your bank
            account. A business can be profitable and still run short on cash when customers pay late or a large bill lands before the
            invoices behind it are paid. The calculator above compares your cash plus realistic collections with bills due in the next
            30 days, so you can see the difference between profit and cash flow in your own numbers.
          </p>
          <p>
            For a worked example, read{" "}
            <Link href="/resources/profitable-but-short-on-cash" className="text-[var(--primary-text)] underline">
              Profitable but short on cash? How to tell which problem you actually have
            </Link>
            .
          </p>
        </section>

        <ResourceDefaultCta />
      </div>

      <PublicSiteFooter />
    </main>
  );
}
