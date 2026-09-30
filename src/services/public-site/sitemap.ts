import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";
import { resourceLastModified } from "@/services/resources/resource-repository";
import { RESOURCES_INDEX_PATH, resourcePath } from "@/services/resources/resource-seo";
import type { ResourceDocument } from "@/domain/resources/resource-content";

/**
 * Public, indexable URLs only — never an authenticated, owner, admin, or API
 * route. Published resources are added automatically from content/resources/.
 *
 * `lastModified` is emitted only where a real content-modification date is
 * known: a resource's own updatedAt/publishedAt, and the index's newest such
 * date. Static marketing/legal pages carry no trustworthy per-page date, so
 * they omit it rather than claiming "modified at build time" on every deploy.
 */
export function buildSitemap(resources: ResourceDocument[]): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1.0 },
    { url: absoluteUrl("/about"), changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/tools/profit-margin-calculator"), changeFrequency: "monthly", priority: 0.8 },
    { url: absoluteUrl("/privacy"), changeFrequency: "monthly", priority: 0.3 },
    { url: absoluteUrl("/terms"), changeFrequency: "monthly", priority: 0.3 },
  ];

  const resourceEntries: MetadataRoute.Sitemap = resources.map((doc) => ({
    url: absoluteUrl(resourcePath(doc.slug)),
    lastModified: resourceLastModified(doc),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const newest = resources
    .map(resourceLastModified)
    .reduce<Date | null>((latest, date) => (latest === null || date > latest ? date : latest), null);

  const indexEntry: MetadataRoute.Sitemap[number] = {
    url: absoluteUrl(RESOURCES_INDEX_PATH),
    ...(newest ? { lastModified: newest } : {}),
    changeFrequency: "weekly",
    priority: 0.8,
  };

  return [...staticPages, indexEntry, ...resourceEntries];
}
