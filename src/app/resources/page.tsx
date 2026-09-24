import Link from "next/link";
import { PublicSiteHeader } from "@/components/landing/PublicSiteHeader";
import { PublicSiteFooter } from "@/components/landing/PublicSiteFooter";
import { ResourceDefaultCta } from "@/components/resources/ResourceCtaPanel";
import { formatResourceDate } from "@/components/resources/resource-date";
import { listVisibleResources } from "@/services/resources/resource-repository";
import {
  RESOURCES_INDEX_DESCRIPTION,
  RESOURCES_INDEX_HEADING,
  buildResourceIndexMetadata,
  resourcePath,
} from "@/services/resources/resource-seo";

/**
 * Public resource index. Statically generated from content/resources/ — no
 * session, no workspace, no API call. Publishing a resource file is all it
 * takes for it to appear here.
 */

export const metadata = buildResourceIndexMetadata();

export default function ResourcesIndexPage() {
  const resources = listVisibleResources();

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicSiteHeader />

      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 break-words">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{RESOURCES_INDEX_HEADING}</h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">{RESOURCES_INDEX_DESCRIPTION}</p>

        {resources.length === 0 ? (
          <p className="mt-10 rounded-lg border border-border bg-muted px-4 py-4 text-sm text-foreground">
            No guides are published yet. New guides will be listed here as they are released.
          </p>
        ) : (
          <ul className="mt-10 space-y-8">
            {resources.map((doc) => (
              <li key={doc.slug}>
                <article>
                  <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
                    <Link href={resourcePath(doc.slug)} className="text-foreground hover:text-[var(--primary-text)] hover:underline">
                      {doc.frontmatter.title}
                    </Link>
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {doc.frontmatter.status === "draft" && (
                      <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold uppercase text-foreground">Draft</span>
                    )}
                    <time dateTime={doc.frontmatter.publishedAt}>{formatResourceDate(doc.frontmatter.publishedAt)}</time>
                  </p>
                  <p className="mt-2 text-base leading-relaxed text-muted-foreground">{doc.frontmatter.description}</p>
                </article>
              </li>
            ))}
          </ul>
        )}

        <ResourceDefaultCta />
      </div>

      <PublicSiteFooter />
    </main>
  );
}
