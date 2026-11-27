import type { Metadata } from "next";
import { PublicLink } from "@/components/navigation/PublicLink";
import { PublicSiteHeader } from "@/components/landing/PublicSiteHeader";
import { PublicSiteFooter } from "@/components/landing/PublicSiteFooter";
import { ResourceDefaultCta } from "@/components/resources/ResourceCtaPanel";
import { CalculatorEventsTracker } from "@/components/tools/agency/CalculatorEventsTracker";
import { DEFAULT_SOCIAL_IMAGE, serializeJsonLd } from "@/services/resources/resource-seo";
import { SITE_URL, absoluteUrl } from "@/lib/site";
import {
  AGENCY_DIAGNOSTIC_PATH,
  AGENCY_TOOLS,
  PROFIT_MARGIN_TOOL_PATH,
  TOOLS_HUB_PATH,
  TOOL_CATEGORIES,
  type ToolCategory,
} from "@/services/tools/agency/registry";

const TITLE = "Free Business and Agency Calculators | OpsIQ";
const DESCRIPTION =
  "Free calculators for small businesses and agency owners: profit margin, client profitability, retainer pricing, utilization, scope creep, hourly rate and capacity.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl(TOOLS_HUB_PATH) },
  openGraph: { title: TITLE, description: DESCRIPTION, url: absoluteUrl(TOOLS_HUB_PATH), type: "website", siteName: "OpsIQ", images: [DEFAULT_SOCIAL_IMAGE] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [{ url: DEFAULT_SOCIAL_IMAGE.url, alt: DEFAULT_SOCIAL_IMAGE.alt }] },
};

type Card = { path: string; title: string; text: string };

const GENERAL: Card[] = [
  {
    path: PROFIT_MARGIN_TOOL_PATH,
    title: "Profit Margin Calculator for Small Business",
    text: "Gross margin, markup, operating margin and target price, plus a check that your profit is turning into cash.",
  },
];

function cardsFor(category: ToolCategory): Card[] {
  if (category === "General Business Finance") return GENERAL;
  return AGENCY_TOOLS.filter((t) => t.category === category).map((t) => ({ path: t.path, title: t.h1, text: t.cardText }));
}

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      name: "Free Business and Agency Calculators",
      description: DESCRIPTION,
      url: absoluteUrl(TOOLS_HUB_PATH),
      publisher: { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "OpsIQ", url: `${SITE_URL}/` },
    },
    {
      "@type": "ItemList",
      itemListElement: [...GENERAL, ...AGENCY_TOOLS.map((t) => ({ path: t.path, title: t.h1, text: t.cardText }))].map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.title,
        url: absoluteUrl(c.path),
      })),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "OpsIQ", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Calculators", item: absoluteUrl(TOOLS_HUB_PATH) },
      ],
    },
  ],
};

export default function ToolsHubPage() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(JSON_LD) }} />
      <PublicSiteHeader />
      <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-10 break-words">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
          <PublicLink href="/" className="hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary-text)]">OpsIQ</PublicLink> / <span aria-current="page">Calculators</span>
        </nav>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Free business and agency calculators</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Plain calculators that run in your browser. Nothing you enter is sent or stored, there is no signup and no email capture, and every
          result shows its formula and its limits. They are educational tools, not financial, tax or legal advice.
        </p>

        {TOOL_CATEGORIES.map((category) => {
          const cards = cardsFor(category);
          if (cards.length === 0) return null;
          return (
            <section key={category} className="mt-10" aria-labelledby={`cat-${category.replace(/\s+/g, "-").toLowerCase()}`}>
              <h2 id={`cat-${category.replace(/\s+/g, "-").toLowerCase()}`} className="font-display text-2xl font-bold tracking-tight">
                {category}
              </h2>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {cards.map((c) => (
                  <li key={c.path} className="rounded-lg border border-border bg-background p-5">
                    <h3 className="text-lg font-semibold">
                      <PublicLink href={c.path} data-calc-link="related" className="text-[var(--primary-text)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary-text)]">{c.title}</PublicLink>
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.text}</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <section className="mt-12 max-w-2xl rounded-lg border border-border bg-muted p-5 text-sm leading-relaxed">
          <h2 className="font-display text-xl font-bold tracking-tight">Not sure which number to look at first?</h2>
          <p className="mt-2">
            The free{" "}
            <PublicLink href={AGENCY_DIAGNOSTIC_PATH} data-calc-link="agency" className="font-medium text-[var(--primary-text)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary-text)]">
              agency decision diagnostic
            </PublicLink>{" "}
            takes ten monthly numbers and returns the one issue most worth fixing first. It needs no signup.
          </p>
        </section>

        <ResourceDefaultCta />
        <CalculatorEventsTracker calculator="hub" />
      </div>
      <PublicSiteFooter />
    </main>
  );
}
