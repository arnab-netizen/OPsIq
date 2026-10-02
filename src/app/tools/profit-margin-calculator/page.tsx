import type { Metadata } from "next";
import Link from "next/link";
import { PublicSiteHeader } from "@/components/landing/PublicSiteHeader";
import { PublicSiteFooter } from "@/components/landing/PublicSiteFooter";
import { ResourceDefaultCta } from "@/components/resources/ResourceCtaPanel";
import { ProfitCashCalculator } from "@/components/tools/ProfitCashCalculator";
import { DEFAULT_SOCIAL_IMAGE, serializeJsonLd } from "@/services/resources/resource-seo";
import { SITE_URL, absoluteUrl } from "@/lib/site";

const PATH = "/tools/profit-margin-calculator";
// Title kept at 60 characters or fewer and description at 155 or fewer so search results do not truncate them.
const TITLE = "Profit Margin Calculator for Small Business | OpsIQ";
const DESCRIPTION =
  "Free profit margin calculator: gross margin, markup, operating margin and target price, plus a check that your profit is turning into cash.";

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

/** Visible FAQ. The FAQPage JSON-LD below is generated from this same list so markup and page text can never drift apart. */
const FAQ: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: "What is a good profit margin for a small business?",
    answer:
      "There is no single good number, because it depends heavily on your industry and on whether you look at gross margin or operating margin. A better test is whether your margin is stable or improving against your own past months, and whether it leaves enough after costs to keep the business running.",
  },
  {
    question: "What is the difference between margin and markup?",
    answer:
      "Margin is profit divided by the selling price. Markup is profit divided by your cost. A product that costs $60 and sells for $100 has a 40% margin and a 66.7% markup, so a 40% markup does not give you a 40% margin.",
  },
  {
    question: "How do I find the price for a target profit margin?",
    answer:
      "Divide your cost by 1 minus the margin you want, written as a decimal. A $60 cost at a 40% target margin needs a price of $60 / (1 - 0.40) = $100. The price tool in the calculator does this for you.",
  },
  {
    question: "What is the difference between gross margin and operating margin?",
    answer:
      "Gross margin only subtracts direct costs, the costs of making or delivering what you sell. Operating margin also subtracts operating expenses such as payroll, rent and software, so it shows what is left to run the business on.",
  },
  {
    question: "Why can a profitable business still run out of cash?",
    answer:
      "Profit is revenue minus costs on paper. Cash is money in your bank account. If customers pay late, or a large bill is due before the invoices behind it are paid, you can be profitable and still short of cash. The calculator compares your cash plus realistic collections against bills due in the next 30 days.",
  },
  {
    question: "Can I use a currency other than US dollars?",
    answer:
      "Yes. Pick a currency in the calculator and it shows the right symbol and number formatting. It does not convert between currencies, so enter every amount in the currency you choose.",
  },
  {
    question: "Is the information I enter stored or sent anywhere?",
    answer: "No. Everything is calculated in your browser on this page. Nothing is sent or stored, and there is no email capture.",
  },
];

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      name: "Profit Margin Calculator for Small Business",
      description: DESCRIPTION,
      url: absoluteUrl(PATH),
      applicationCategory: "BusinessApplication",
      operatingSystem: "Any (web browser)",
      isAccessibleForFree: true,
      publisher: { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "OpsIQ", url: `${SITE_URL}/` },
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "OpsIQ", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Profit margin calculator", item: absoluteUrl(PATH) },
      ],
    },
  ],
};

export default function ProfitMarginCalculatorPage() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(JSON_LD) }} />
      <PublicSiteHeader />

      <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-10 break-words">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
          <Link href="/" className="hover:underline">
            OpsIQ
          </Link>{" "}
          / <span aria-current="page">Profit margin calculator</span>
        </nav>
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
            . More plain-language guides are in our{" "}
            <Link href="/resources" className="text-[var(--primary-text)] underline">
              resources for business owners
            </Link>
            .
          </p>
          <h2 className="font-display text-2xl font-bold tracking-tight">Using a different currency</h2>
          <p>
            The calculator works in US dollars, euros, British pounds, Indian rupees, Australian, Canadian, New Zealand and Singapore
            dollars, UAE dirhams, South African rand, Swiss francs and Japanese yen. Changing the currency changes the symbol and number
            format only; it does not convert amounts, so enter all your figures in the same currency.
          </p>
        </section>

        <section className="mt-12 max-w-2xl space-y-6 text-base leading-relaxed" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="font-display text-2xl font-bold tracking-tight">
            Profit margin calculator FAQ
          </h2>
          {FAQ.map((item) => (
            <div key={item.question}>
              <h3 className="text-lg font-semibold">{item.question}</h3>
              <p className="mt-1">{item.answer}</p>
            </div>
          ))}
        </section>

        <ResourceDefaultCta />
      </div>

      <PublicSiteFooter />
    </main>
  );
}
