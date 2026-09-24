import type { MetadataRoute } from "next";
import { buildSitemap } from "@/services/public-site/sitemap";
import { listIndexableResources } from "@/services/resources/resource-repository";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(listIndexableResources());
}
