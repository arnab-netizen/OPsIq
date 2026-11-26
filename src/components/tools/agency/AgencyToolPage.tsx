import { PublicLink } from "@/components/navigation/PublicLink";
import { PublicSiteHeader } from "@/components/landing/PublicSiteHeader";
import { PublicSiteFooter } from "@/components/landing/PublicSiteFooter";
import { ResourceDefaultCta } from "@/components/resources/ResourceCtaPanel";
import { serializeJsonLd } from "@/services/resources/resource-seo";
import { SITE_URL, absoluteUrl } from "@/lib/site";
import { AGENCY_DIAGNOSTIC_PATH, TOOLS_HUB_PATH, getAgencyTool, type AgencyToolId } from "@/services/tools/agency/registry";
import { formatMoney } from "@/services/tools/agency/shared";
import { AgencyCalculator } from "./AgencyCalculator";
import { CalculatorEventsTracker } from "./CalculatorEventsTracker";
import { CALC_CONFIGS, makeFmt, type Presentation } from "./configs";
import { RESOURCE_TITLES, TOOL_CONTENT } from "./tool-content";

/**
 * Shared page template for the six agency calculators. Server component: all explanatory content is static text, and the
 * worked example is produced by running the same engine on the sample numbers, so page text and calculator cannot disagree.
 */
export function AgencyToolPage({ id }: { id: AgencyToolId }) {
  const tool = getAgencyTool(id);
  const content = TOOL_CONTENT[id];
  const config = CALC_CONFIGS[id];

  const sampleValues = Object.fromEntries(config.fields.map((f) => [f.key, Number(f.sample)])) as Record<string, number>;
  const worked = config.evaluate(sampleValues, makeFmt("USD"));
  const workedView: Presentation | null = worked.ok ? worked.view : null;
  const inputsText = config.fields
    .filter((f) => Number(f.sample) !== 0)
    .map((f) => `${f.label}: ${f.rule.kind === "money" ? formatMoney(Number(f.sample), "USD") : f.rule.kind === "percent" ? `${f.sample}%` : f.sample}`);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: tool.h1,
        description: tool.description,
        url: absoluteUrl(tool.path),
        applicationCategory: "BusinessApplication",
        operatingSystem: "Any (web browser)",
        isAccessibleForFree: true,
        publisher: { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "OpsIQ", url: `${SITE_URL}/` },
      },
      {
        "@type": "FAQPage",
        mainEntity: content.faq.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "OpsIQ", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "Calculators", item: absoluteUrl(TOOLS_HUB_PATH) },
          { "@type": "ListItem", position: 3, name: tool.h1, item: absoluteUrl(tool.path) },
        ],
      },
    ],
  };

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <PublicSiteHeader />
      <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-10 break-words">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
          <PublicLink href="/" className="hover:underline">OpsIQ</PublicLink> /{" "}
          <PublicLink href={TOOLS_HUB_PATH} className="hover:underline">Calculators</PublicLink> / <span aria-current="page">{tool.h1}</span>
        </nav>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{tool.h1}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{content.intro}</p>

        <AgencyCalculator id={id} />

        <p className="mt-6 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Educational tool, not financial, tax or legal advice. Everything is calculated in your browser on this page: what you enter
          is not sent, stored or placed in the page address, and there is no email capture. Do not enter card numbers, passwords or
          personal identifiers. The starting numbers are an illustrative example, not real data.
        </p>

        <section className="mt-10 max-w-2xl space-y-3 rounded-lg border border-border bg-muted p-5 text-sm leading-relaxed">
          <h2 className="font-display text-xl font-bold tracking-tight">Want to see which number to fix first?</h2>
          <p>
            This calculator looks at one question. The free{" "}
            <PublicLink href={AGENCY_DIAGNOSTIC_PATH} data-calc-link="agency" className="font-medium text-[var(--primary-text)] underline">
              agency decision diagnostic
            </PublicLink>{" "}
            takes ten monthly numbers and returns the one issue most worth fixing first across margin, overhead, cash and utilization.
            It needs no signup and the numbers stay in your browser.
          </p>
        </section>

        <section className="mt-12 max-w-2xl space-y-4 text-base leading-relaxed">
          <h2 className="font-display text-2xl font-bold tracking-tight">Definitions</h2>
          <dl className="space-y-3">
            {content.definitions.map((d) => (
              <div key={d.term}>
                <dt className="font-semibold">{d.term}</dt>
                <dd className="text-muted-foreground">{d.meaning}</dd>
              </div>
            ))}
          </dl>

          <h2 className="font-display text-2xl font-bold tracking-tight">Formulas</h2>
          <ul className="list-disc space-y-1 pl-5">
            {content.formulas.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>

          {workedView && (
            <>
              <h2 className="font-display text-2xl font-bold tracking-tight">Worked example</h2>
              <p>
                Illustrative numbers, shown in US dollars, not client data. The calculator above starts with the same example.
              </p>
              <p className="text-sm text-muted-foreground">Inputs: {inputsText.join("; ")}.</p>
              <ul className="list-disc space-y-1 pl-5">
                {workedView.sections[0].rows.slice(0, 6).map((r) => (
                  <li key={r.label}>
                    {r.label}: <strong>{r.value}</strong>
                  </li>
                ))}
              </ul>
              <p>{workedView.interpretation[0]}</p>
            </>
          )}

          {content.citedContext && (
            <>
              <h2 className="font-display text-2xl font-bold tracking-tight">Context from published research</h2>
              <p className="text-sm">{content.citedContext}</p>
            </>
          )}

          <h2 className="font-display text-2xl font-bold tracking-tight">Limitations</h2>
          <ul className="list-disc space-y-1 pl-5">
            {content.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>

        <section className="mt-10 max-w-2xl space-y-3 text-base leading-relaxed" aria-labelledby="related-heading">
          <h2 id="related-heading" className="font-display text-2xl font-bold tracking-tight">Related calculators and guides</h2>
          <ul className="list-disc space-y-1 pl-5">
            {tool.related.map((rid) => {
              const r = getAgencyTool(rid);
              return (
                <li key={rid}>
                  <PublicLink href={r.path} data-calc-link="related" className="text-[var(--primary-text)] underline">{r.h1}</PublicLink>
                </li>
              );
            })}
            {tool.resources.map((slug) => (
              <li key={slug}>
                <PublicLink href={`/resources/${slug}`} data-calc-link="related" className="text-[var(--primary-text)] underline">{RESOURCE_TITLES[slug]}</PublicLink>
              </li>
            ))}
            <li>
              <PublicLink href={TOOLS_HUB_PATH} data-calc-link="related" className="text-[var(--primary-text)] underline">All calculators</PublicLink>
            </li>
          </ul>
        </section>

        <section className="mt-12 max-w-2xl space-y-6 text-base leading-relaxed" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="font-display text-2xl font-bold tracking-tight">{tool.h1} FAQ</h2>
          {content.faq.map((item) => (
            <div key={item.question}>
              <h3 className="text-lg font-semibold">{item.question}</h3>
              <p className="mt-1">{item.answer}</p>
            </div>
          ))}
        </section>

        <ResourceDefaultCta />
        <CalculatorEventsTracker calculator={id} />
      </div>
      <PublicSiteFooter />
    </main>
  );
}
