import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicSiteHeader } from "@/components/landing/PublicSiteHeader";
import { PublicSiteFooter } from "@/components/landing/PublicSiteFooter";
import { ResourceBody } from "@/components/resources/ResourceBody";
import { ResourceDefaultCta } from "@/components/resources/ResourceCtaPanel";
import { formatResourceDate } from "@/components/resources/resource-date";
import { getVisibleResource, listVisibleResources } from "@/services/resources/resource-repository";
import {
  RESOURCES_INDEX_PATH,
  buildResourceJsonLd,
  buildResourceMetadata,
  serializeJsonLd,
} from "@/services/resources/resource-seo";

/**
 * One public resource article. Every page is statically generated at build
 * time from its content/resources/<slug>.md file; `dynamicParams = false`
 * makes any other slug a genuine 404 without touching the server at runtime.
 */

export const dynamicParams = false;

export function generateStaticParams(): Array<{ slug: string }> {
  return listVisibleResources().map((doc) => ({ slug: doc.slug }));
}

type ResourcePageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: ResourcePageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = getVisibleResource(slug);
  return doc ? buildResourceMetadata(doc) : {};
}

export default async function ResourcePage({ params }: ResourcePageProps) {
  const { slug } = await params;
  const doc = getVisibleResource(slug);
  if (!doc) notFound();

  const { title, description, author, publishedAt, updatedAt, status } = doc.frontmatter;

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildResourceJsonLd(doc)) }} />
      <PublicSiteHeader />

      <article className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 break-words">
        <nav aria-label="Breadcrumb" className="text-sm">
          <Link href={RESOURCES_INDEX_PATH} className="text-[var(--primary-text)] hover:underline">
            &larr; All resources
          </Link>
        </nav>

        {status === "draft" && (
          <p className="mt-6 rounded-lg border border-border bg-muted px-4 py-3 text-sm font-semibold text-foreground">
            Draft — not published. Visible only on preview builds.
          </p>
        )}

        <header>
          <h1 className="font-display mt-6 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{description}</p>
          <p className="mt-4 text-sm text-muted-foreground">
            By {author} · Published <time dateTime={publishedAt}>{formatResourceDate(publishedAt)}</time>
            {updatedAt && updatedAt !== publishedAt && (
              <>
                {" "}
                · Updated <time dateTime={updatedAt}>{formatResourceDate(updatedAt)}</time>
              </>
            )}
          </p>
        </header>

        <ResourceBody blocks={doc.blocks} />

        <ResourceDefaultCta />

        <p className="mt-10 text-sm">
          <Link href={RESOURCES_INDEX_PATH} className="text-[var(--primary-text)] hover:underline">
            &larr; All resources
          </Link>
          <span aria-hidden="true" className="mx-2 text-muted-foreground">·</span>
          <Link href="/" className="text-[var(--primary-text)] hover:underline">
            Back to OpsIQ
          </Link>
        </p>
      </article>

      <PublicSiteFooter />
    </main>
  );
}
