/**
 * Metadata + structured data for the owned resource surface.
 *
 * Every URL is built from the canonical origin (src/lib/site.ts), so canonical,
 * og:url, and JSON-LD identifiers are always https://opsiq.solutions/... and
 * never a preview host, localhost, or `www`. Query strings (utm_*, etc.) never
 * reach these values: they are built from the slug alone.
 *
 * Structured data carries only facts present in the resource file and visible
 * on the page (headline, description, author, dates, image). dateModified is
 * emitted only when the author recorded an updatedAt; no ratings or reviews.
 */

import type { Metadata } from "next";
import { SITE_URL, absoluteUrl } from "@/lib/site";
import type { ResourceDocument } from "@/domain/resources/resource-content";

export const RESOURCES_INDEX_PATH = "/resources";
export const RESOURCES_INDEX_TITLE = "Resources for business owners | OpsIQ";
export const RESOURCES_INDEX_HEADING = "Resources";
export const RESOURCES_INDEX_DESCRIPTION =
  "Plain-language guides for small and mid-size business owners on reading your own numbers — cash, profit, sales, and operations — and deciding what to do next.";

/** Site-wide social image, used for a resource only when it has no image of its own. */
export const DEFAULT_SOCIAL_IMAGE = {
  url: "/og-image.png",
  width: 1200,
  height: 630,
  alt: "OpsIQ wordmark with the headline \"Diagnose your business. Know your next move,\" a free beta badge, and the opsiq.solutions URL.",
} as const;

export function resourcePath(slug: string): string {
  return `${RESOURCES_INDEX_PATH}/${slug}`;
}

export function resourceTitleTag(doc: ResourceDocument): string {
  return `${doc.frontmatter.title} | OpsIQ`;
}

function socialImage(doc: ResourceDocument): { url: string; alt: string; width?: number; height?: number } {
  const { ogImage, ogImageAlt } = doc.frontmatter;
  if (ogImage && ogImageAlt) return { url: ogImage, alt: ogImageAlt };
  return DEFAULT_SOCIAL_IMAGE;
}

export function buildResourceIndexMetadata(): Metadata {
  const url = absoluteUrl(RESOURCES_INDEX_PATH);
  return {
    title: RESOURCES_INDEX_TITLE,
    description: RESOURCES_INDEX_DESCRIPTION,
    alternates: { canonical: url },
    openGraph: {
      title: RESOURCES_INDEX_TITLE,
      description: RESOURCES_INDEX_DESCRIPTION,
      url,
      type: "website",
      siteName: "OpsIQ",
      images: [DEFAULT_SOCIAL_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: RESOURCES_INDEX_TITLE,
      description: RESOURCES_INDEX_DESCRIPTION,
      images: [{ url: DEFAULT_SOCIAL_IMAGE.url, alt: DEFAULT_SOCIAL_IMAGE.alt }],
    },
  };
}

export function buildResourceMetadata(doc: ResourceDocument): Metadata {
  const url = absoluteUrl(resourcePath(doc.slug));
  const title = resourceTitleTag(doc);
  const { description, publishedAt, updatedAt, author, status } = doc.frontmatter;
  const image = socialImage(doc);
  return {
    title,
    description,
    alternates: { canonical: url },
    // Drafts only ever render on preview/local builds; never let one be indexed.
    ...(status === "draft" ? { robots: { index: false, follow: false } } : {}),
    authors: [{ name: author }],
    openGraph: {
      title,
      description,
      url,
      type: "article",
      siteName: "OpsIQ",
      publishedTime: publishedAt,
      ...(updatedAt ? { modifiedTime: updatedAt } : {}),
      authors: [author],
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: image.url, alt: image.alt }],
    },
  };
}

export function buildResourceJsonLd(doc: ResourceDocument): Record<string, unknown> {
  const url = absoluteUrl(resourcePath(doc.slug));
  const { title, description, publishedAt, updatedAt, author, authorType } = doc.frontmatter;
  const image = socialImage(doc);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    datePublished: publishedAt,
    ...(updatedAt ? { dateModified: updatedAt } : {}),
    author:
      authorType === "organization"
        ? { "@type": "Organization", name: author, url: `${SITE_URL}/` }
        : { "@type": "Person", name: author },
    // Same @id as the homepage's Organization node, inlined so this page's graph is self-contained.
    publisher: {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "OpsIQ",
      url: `${SITE_URL}/`,
      logo: absoluteUrl("/opsiq-logo.png"),
    },
    image: absoluteUrl(image.url),
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
  };
}

/** Serialize JSON-LD for an inline <script>, escaping '<' so content can never close the tag. */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
