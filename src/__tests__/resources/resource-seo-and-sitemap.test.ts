/**
 * Resource metadata, structured data, and sitemap generation.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseResourceDocument, type ResourceDocument } from "@/domain/resources/resource-content";
import {
  DEFAULT_SOCIAL_IMAGE,
  buildResourceIndexMetadata,
  buildResourceJsonLd,
  buildResourceMetadata,
  serializeJsonLd,
} from "@/services/resources/resource-seo";
import { buildSitemap } from "@/services/public-site/sitemap";
import { listIndexableResources } from "@/services/resources/resource-repository";

const FIXTURE = fs.readFileSync(path.join(__dirname, "fixtures", "resource-1-structure.md"), "utf8");
const withImage = parseResourceDocument("profitable-but-short-on-cash", FIXTURE);

function variant(overrides: Partial<ResourceDocument["frontmatter"]>, slug = "second-guide"): ResourceDocument {
  return { ...withImage, slug, frontmatter: { ...withImage.frontmatter, ogImage: undefined, ogImageAlt: undefined, ...overrides } };
}

const CANONICAL = "https://opsiq.solutions/resources/profitable-but-short-on-cash";

describe("buildResourceMetadata", () => {
  const meta = buildResourceMetadata(withImage);

  it("emits a resource-specific title, description, and clean canonical", () => {
    expect(meta.title).toBe("Profitable but Short on Cash? How to Tell Which Problem You Actually Have | OpsIQ");
    expect(meta.description).toBe(withImage.frontmatter.description);
    expect(meta.alternates?.canonical).toBe(CANONICAL);
  });

  it("emits Open Graph article metadata with the production URL and the resource's own image", () => {
    expect(meta.openGraph).toMatchObject({
      title: meta.title,
      description: withImage.frontmatter.description,
      url: CANONICAL,
      type: "article",
      publishedTime: "2026-09-01",
      images: [{ url: "/resources/profitable-but-short-on-cash.png", alt: withImage.frontmatter.ogImageAlt }],
    });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", title: meta.title });
  });

  it("falls back to the site social image only when the resource has none", () => {
    const m = buildResourceMetadata(variant({}));
    expect((m.openGraph as { images: unknown[] }).images).toEqual([DEFAULT_SOCIAL_IMAGE]);
  });

  it("never produces www, preview, localhost, or query-string URLs", () => {
    const serialized = JSON.stringify([meta, buildResourceIndexMetadata(), buildResourceJsonLd(withImage)]);
    expect(serialized).not.toMatch(/www\.opsiq|vercel\.app|localhost|utm_/);
    const urls = (serialized.match(/https?:\/\/[^"]+/g) ?? []).filter((u) => u !== "https://schema.org");
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith("https://opsiq.solutions/")).toBe(true);
      expect(url).not.toContain("?");
    }
  });

  it("is indexable when published and noindex when a draft", () => {
    expect(meta.robots).toBeUndefined();
    expect(buildResourceMetadata(variant({ status: "draft" })).robots).toEqual({ index: false, follow: false });
  });

  it("emits modifiedTime only when updatedAt is recorded", () => {
    expect(meta.openGraph).not.toHaveProperty("modifiedTime");
    expect(buildResourceMetadata(variant({ updatedAt: "2026-09-10" })).openGraph).toMatchObject({ modifiedTime: "2026-09-10" });
  });
});

describe("buildResourceIndexMetadata", () => {
  it("has its own title, description, and canonical", () => {
    const m = buildResourceIndexMetadata();
    expect(m.title).toBe("Resources for business owners | OpsIQ");
    expect(m.alternates?.canonical).toBe("https://opsiq.solutions/resources");
    expect(m.openGraph).toMatchObject({ url: "https://opsiq.solutions/resources", type: "website" });
  });
});

describe("buildResourceJsonLd", () => {
  it("contains only facts from the resource file and matches visible content", () => {
    const ld = buildResourceJsonLd(withImage);
    expect(ld).toMatchObject({
      "@type": "Article",
      headline: withImage.frontmatter.title,
      datePublished: "2026-09-01",
      author: { "@type": "Organization", name: "OpsIQ" },
      image: "https://opsiq.solutions/resources/profitable-but-short-on-cash.png",
      mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
    });
    expect(ld).not.toHaveProperty("dateModified");
    expect(JSON.stringify(ld)).not.toMatch(/aggregateRating|review/i);
  });

  it("uses a Person author for person-authored resources", () => {
    expect(buildResourceJsonLd(variant({ author: "Jane Doe", authorType: "person" })).author).toEqual({ "@type": "Person", name: "Jane Doe" });
  });

  it("serializes safely inside a <script> tag", () => {
    const out = serializeJsonLd({ headline: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out).headline).toBe("</script><script>alert(1)</script>");
  });
});

describe("buildSitemap", () => {
  const baseline = ["/", "/about", "/privacy", "/terms"].map((p) => `https://opsiq.solutions${p}`);

  it("keeps the baseline public pages and adds the resource index with no resources", () => {
    const urls = buildSitemap([]).map((e) => e.url);
    expect(urls).toEqual([...baseline, "https://opsiq.solutions/resources"]);
  });

  it("never fabricates lastModified: static pages and an empty index carry none", () => {
    for (const entry of buildSitemap([])) expect(entry).not.toHaveProperty("lastModified");
  });

  it("adds every published resource with its own content date, and dates the index by its newest resource", () => {
    const a = withImage;
    const b = variant({ publishedAt: "2026-09-05", updatedAt: "2026-09-20" });
    const entries = buildSitemap([a, b]);
    const bySlug = Object.fromEntries(entries.map((e) => [e.url, e]));
    expect(bySlug[CANONICAL].lastModified).toEqual(new Date("2026-09-01T00:00:00.000Z"));
    expect(bySlug["https://opsiq.solutions/resources/second-guide"].lastModified).toEqual(new Date("2026-09-20T00:00:00.000Z"));
    expect(bySlug["https://opsiq.solutions/resources"].lastModified).toEqual(new Date("2026-09-20T00:00:00.000Z"));
  });

  it("excludes drafts (via the indexable listing) and never lists private, API, or admin routes", () => {
    const draft = variant({ status: "draft" }, "unpublished-draft");
    const urls = buildSitemap(listIndexableResources([withImage, draft])).map((e) => e.url);
    expect(urls).toContain(CANONICAL);
    expect(urls.some((u) => u.includes("unpublished-draft"))).toBe(false);
    for (const url of urls) {
      expect(url.startsWith("https://opsiq.solutions/")).toBe(true);
      expect(url).not.toMatch(/\/(owner|dashboard|admin|api|settings|login|signup|onboarding)(\/|$)/);
    }
    expect(new Set(urls).size).toBe(urls.length);
  });
});
